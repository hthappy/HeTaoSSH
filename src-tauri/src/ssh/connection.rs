use crate::config::ServerConfig;
use crate::error::{Result, SshError};
use crate::ssh::handler::SshChannelHandler;
use log::info;
use russh::client::{Config, Handle, Handler};
use russh::keys::{load_secret_key, ssh_key, PrivateKeyWithHashAlg};
use russh_keys::known_hosts::learn_known_hosts_path;
use std::sync::Arc;

/// SSH Connection wrapper with channel support
pub struct SshConnection {
    pub config: ServerConfig,
    pub session: Option<Handle<ClientHandler>>,
    pub channel_handler: Option<SshChannelHandler>,
    pub sftp_session: Option<russh_sftp::client::SftpSession>,
}

pub struct ClientHandler {
    host: String,
    port: u16,
}

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let mut known_hosts_path = std::env::var("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
            });
        known_hosts_path.push("HeTaoSSH");

        // Ensure directory exists
        if !known_hosts_path.exists() {
            let _ = std::fs::create_dir_all(&known_hosts_path);
        }
        known_hosts_path.push("known_hosts");

        let host = &self.host;
        let port = self.port;

        let check_result =
            russh_keys::check_known_hosts_path(host, port, server_public_key, &known_hosts_path);

        match check_result {
            Ok(true) => {
                log::info!("Host key verified from known_hosts.");
                Ok(true)
            }
            Ok(false) | Err(_) => {
                // Key is unknown (Ok(false)) or file doesn't exist (Err). We trust on first use (TOFU) and save it.
                log::info!(
                    "New or unverified host key detected for {}:{}, adding to known_hosts.",
                    host,
                    port
                );
                if let Err(learn_err) =
                    learn_known_hosts_path(host, port, server_public_key, &known_hosts_path)
                {
                    log::error!(
                        "Failed to save host key to known_hosts at {:?}: {}",
                        known_hosts_path,
                        learn_err
                    );
                    // On Windows, if saving fails, we log it but still allow the connection
                }
                Ok(true)
            }
        }
    }
}

impl SshConnection {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            session: None,
            channel_handler: None,
            sftp_session: None,
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        info!("Connecting to {}:{}", self.config.host, self.config.port);

        let config = Config::default();
        let handler = ClientHandler {
            host: self.config.host.clone(),
            port: self.config.port,
        };

        let addr = (self.config.host.as_str(), self.config.port);
        let mut session = russh::client::connect(Arc::new(config), addr, handler)
            .await
            .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;

        // Try authentication methods
        let username = &self.config.username;

        // Try private key authentication first if path is provided and not empty
        if let Some(key_path) = &self.config.private_key_path {
            if !key_path.trim().is_empty() {
                let passphrase = self.config.passphrase.as_deref();

                log::info!("Attempting to load key from: {}", key_path);
                log::info!("Key file exists: {}", std::path::Path::new(key_path).exists());

                // Try to load the key, but don't fail the whole connection if it fails (fallback to password)
                match load_secret_key(key_path, passphrase) {
                    Ok(key) => {
                        log::info!("Key loaded successfully, type: {:?}", key.algorithm());
                        let best_hash = session
                            .best_supported_rsa_hash()
                            .await
                            .map_err(|e| {
                                SshError::ConnectionFailed(format!("Hash alg error: {}", e))
                            })?
                            .flatten();

                        log::info!("Using RSA hash algorithm: {:?}", best_hash);

                        match session
                            .authenticate_publickey(
                                username,
                                PrivateKeyWithHashAlg::new(Arc::new(key), best_hash),
                            )
                            .await
                        {
                            Ok(auth_result) if auth_result.success() => {
                                info!("Key authentication successful for {}@{}", username, &self.config.host);
                                self.session = Some(session);
                                return Ok(());
                            }
                            Ok(_) => {
                                log::warn!(
                                    "Key authentication failed for {}@{}. Server rejected the key. Falling back to password...",
                                    username, &self.config.host
                                );
                            }
                            Err(e) => {
                                log::warn!(
                                    "Key authentication error for {}@{}: {}. Falling back to password...",
                                    username, &self.config.host, e
                                );
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("CRITICAL: Failed to load private key at '{}': {}. Error type: {:?}", key_path, e, e);
                        log::warn!("Falling back to password auth...");
                    }
                }
            }
        }

        // Fallback to password authentication
        if let Some(password) = &self.config.password {
            log::info!("Attempting password authentication for {}@{}", username, &self.config.host);
            let auth_result = session
                .authenticate_password(username, password)
                .await
                .map_err(|e| {
                    log::error!("Password authentication failed for {}@{}: {}", username, &self.config.host, e);
                    SshError::ConnectionFailed(e.to_string())
                })?;

            if auth_result.success() {
                info!("Password authentication successful for {}@{}", username, &self.config.host);
                self.session = Some(session);
                return Ok(());
            } else {
                log::error!("Password authentication failed for {}@{}: Authentication rejected by server", username, &self.config.host);
            }
        }

        // No authentication method succeeded
        log::error!(
            "All authentication methods failed for {}@{}. Server: {}. Port: {}",
            username, &self.config.host, &self.config.host, self.config.port
        );
        
        // Return structured error with connection details (frontend will format user-friendly message)
        let error_detail = format!(
            "auth_failed|{}|{}|{}",
            username, &self.config.host, self.config.port
        );
        
        Err(SshError::ConnectionFailed(error_detail))
    }

    /// Connect and open a shell channel
    pub async fn connect_with_shell(&mut self) -> Result<()> {
        self.connect().await?;

        if let Some(ref mut session) = self.session {
            // Open SFTP Subsystem channel
            let channel = session.channel_open_session().await.map_err(|e| {
                SshError::ConnectionFailed(format!("Failed to open SFTP channel: {}", e))
            })?;
            channel.request_subsystem(true, "sftp").await.map_err(|e| {
                SshError::ConnectionFailed(format!("Failed to request SFTP subsystem: {}", e))
            })?;

            let sftp = russh_sftp::client::SftpSession::new(channel.into_stream())
                .await
                .map_err(|e| {
                    SshError::ConnectionFailed(format!("Failed to start SFTP session: {}", e))
                })?;
            self.sftp_session = Some(sftp);

            // Open Shell channel
            let mut channel_handler = SshChannelHandler::new();
            channel_handler.init_channel(session).await?;
            self.channel_handler = Some(channel_handler);

            Ok(())
        } else {
            Err(SshError::ConnectionFailed(
                crate::error::messages::SESSION_NOT_ESTABLISHED.to_string(),
            ))
        }
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        // Disconnect channel first
        if let Some(ref channel_handler) = self.channel_handler {
            let _ = channel_handler.disconnect().await;
        }
        self.channel_handler = None;

        // Disconnect session
        if let Some(ref mut session) = self.session {
            session
                .disconnect(
                    russh::Disconnect::ByApplication,
                    "User disconnect",
                    "English",
                )
                .await
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;
            info!(
                "Disconnected from {}:{}",
                self.config.host, self.config.port
            );
        }
        self.session = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.session.is_some()
    }

    pub fn has_channel(&self) -> bool {
        self.channel_handler.is_some()
    }

    /// Send data to the SSH channel
    pub async fn send(&self, data: &[u8]) -> Result<()> {
        if let Some(ref channel_handler) = self.channel_handler {
            channel_handler.send_data(data).await
        } else {
            Err(SshError::Channel("Channel not initialized".to_string()))
        }
    }

    /// Receive data from the SSH channel
    pub async fn recv(&self) -> Option<Vec<u8>> {
        if let Some(ref channel_handler) = self.channel_handler {
            channel_handler.recv_data().await
        } else {
            None
        }
    }

    /// Resize terminal
    pub async fn resize(&self, cols: u32, rows: u32) -> Result<()> {
        if let Some(ref channel_handler) = self.channel_handler {
            channel_handler.resize(cols, rows).await
        } else {
            Err(SshError::Channel("Channel not initialized".to_string()))
        }
    }

    /// Reconnect the SSH session (used for auto-reconnect)
    pub async fn reconnect(&mut self) -> Result<()> {
        info!("Reconnecting to {}:{}", self.config.host, self.config.port);

        // Clean up existing session first
        if self.session.is_some() {
            let _ = self.disconnect().await;
        }

        // Re-establish connection
        self.connect_with_shell().await
    }
}
