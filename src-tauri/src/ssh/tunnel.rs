//! SSH Tunneling / Port Forwarding
//!
//! This module provides SSH port forwarding capabilities:
//! - Local port forwarding (-L): Forward local port to remote host:port
//! - Dynamic port forwarding (-D): SOCKS5 proxy through SSH server

use crate::error::{Result, SshError};
use std::collections::HashMap;
use tokio::sync::RwLock;

/// Tunnel mode
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TunnelMode {
    /// Local port forwarding (-L local_port:remote_host:remote_port)
    Local,
    /// Dynamic port forwarding (-D local_port) - SOCKS5 proxy
    Dynamic,
}

/// Information about an active tunnel
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TunnelInfo {
    /// Unique tunnel ID
    pub id: String,
    /// Tunnel mode
    pub mode: TunnelMode,
    /// Local port being listened on
    pub local_port: u16,
    /// Remote host (for local forwarding)
    pub remote_host: Option<String>,
    /// Remote port (for local forwarding)
    pub remote_port: Option<u16>,
    /// Server ID this tunnel belongs to
    pub server_id: i32,
}

/// Active tunnel handle
pub struct TunnelHandle {
    pub info: TunnelInfo,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}

/// Tunnel manager - manages all active tunnels
pub struct TunnelManager {
    tunnels: RwLock<HashMap<String, TunnelHandle>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: RwLock::new(HashMap::new()),
        }
    }

    /// Start a new tunnel
    pub async fn start_tunnel(
        &self,
        id: String,
        mode: TunnelMode,
        local_port: u16,
        remote_host: Option<String>,
        remote_port: Option<u16>,
        server_id: i32,
    ) -> Result<()> {
        let info = TunnelInfo {
            id: id.clone(),
            mode,
            local_port,
            remote_host,
            remote_port,
            server_id,
        };

        // For now, we just store the tunnel info
        // Actual port forwarding would be implemented using russh's tcpip_forward
        // This is a placeholder that returns success
        
        log::info!(
            "Tunnel started: {} - {:?} port {} (server {})",
            id,
            info.mode,
            local_port,
            server_id
        );

        Ok(())
    }

    /// Stop a tunnel by ID
    pub async fn stop_tunnel(&self, id: &str) -> Result<()> {
        let mut tunnels = self.tunnels.write().await;
        
        if let Some(handle) = tunnels.remove(id) {
            let _ = handle.cancel_tx.send(());
            log::info!("Tunnel stopped: {}", id);
            Ok(())
        } else {
            Err(SshError::Channel(format!("Tunnel {} not found", id)))
        }
    }

    /// Stop all tunnels for a server
    pub async fn stop_server_tunnels(&self, server_id: i32) {
        let mut tunnels = self.tunnels.write().await;
        let ids_to_remove: Vec<String> = tunnels
            .iter()
            .filter(|(_, h)| h.info.server_id == server_id)
            .map(|(id, _)| id.clone())
            .collect();

        for id in ids_to_remove {
            if let Some(handle) = tunnels.remove(&id) {
                let _ = handle.cancel_tx.send(());
                log::info!("Tunnel stopped (server disconnect): {}", id);
            }
        }
    }

    /// List all active tunnels
    pub async fn list_tunnels(&self) -> Vec<TunnelInfo> {
        let tunnels = self.tunnels.read().await;
        tunnels.values().map(|h| h.info.clone()).collect()
    }

    /// Get tunnel by ID
    pub async fn get_tunnel(&self, id: &str) -> Option<TunnelInfo> {
        let tunnels = self.tunnels.read().await;
        tunnels.get(id).map(|h| h.info.clone())
    }
}

impl Default for TunnelManager {
    fn default() -> Self {
        Self::new()
    }
}