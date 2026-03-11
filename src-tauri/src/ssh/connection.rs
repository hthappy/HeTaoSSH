use crate::config::ServerConfig;
use crate::error::{Result, SshError};
use crate::ssh::handler::SshChannelHandler;
use log::info;
use russh::client::{Config, Handle, Handler};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, ssh_key};
use std::sync::Arc;

/// SSH Connection wrapper with channel support
pub struct SshConnection {
    pub config: ServerConfig,
    pub session: Option<Handle<ClientHandler>>,
    pub channel_handler: Option<SshChannelHandler>,
}

pub struct ClientHandler;

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        // Accept all server keys (TODO: implement proper host key verification)
        Ok(true)
    }
}

impl SshConnection {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            session: None,
            channel_handler: None,
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        info!("Connecting to {}:{}", self.config.host, self.config.port);

        let config = Config::default();
        let handler = ClientHandler;

        let addr = (self.config.host.as_str(), self.config.port);
        let mut session = russh::client::connect(Arc::new(config), addr, handler)
            .await
            .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;

        // Try authentication methods
        let username = &self.config.username;

        // Try private key authentication first
        if let Some(key_path) = &self.config.private_key_path {
            let passphrase = self.config.passphrase.as_deref();
            let key = load_secret_key(key_path, passphrase)
                .map_err(|e| SshError::ConnectionFailed(format!("Failed to load key: {}", e)))?;

            let best_hash = session
                .best_supported_rsa_hash()
                .await
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?
                .flatten();

            let auth_result = session
                .authenticate_publickey(
                    username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), best_hash),
                )
                .await
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;

            if auth_result.success() {
                info!("Key authentication successful for {}", username);
                self.session = Some(session);
                return Ok(());
            }
        }

        // Fallback to password authentication
        if let Some(password) = &self.config.password {
            let auth_result = session
                .authenticate_password(username, password)
                .await
                .map_err(|e| SshError::ConnectionFailed(e.to_string()))?;

            if auth_result.success() {
                info!("Password authentication successful for {}", username);
                self.session = Some(session);
                return Ok(());
            }
        }

        Err(SshError::ConnectionFailed(
            "All authentication methods failed".to_string(),
        ))
    }

    /// Connect and open a shell channel
    pub async fn connect_with_shell(&mut self) -> Result<()> {
        self.connect().await?;

        if let Some(ref mut session) = self.session {
            let mut channel_handler = SshChannelHandler::new();
            channel_handler.init_channel(session).await?;
            self.channel_handler = Some(channel_handler);
            Ok(())
        } else {
            Err(SshError::ConnectionFailed("Session not established".to_string()))
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
                .disconnect(russh::Disconnect::ByApplication, "User disconnect", "English")
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
}
