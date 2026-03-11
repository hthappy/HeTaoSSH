//! SSH Connection Manager
//! Manages multiple SSH connections with channel support

use crate::config::ServerConfig;
use crate::error::{Result, SshError};
use crate::ssh::SshConnection;
use log::info;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages multiple SSH connections
pub struct ConnectionManager {
    connections: RwLock<HashMap<String, Arc<RwLock<SshConnection>>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    /// Create a new SSH connection
    pub async fn create_connection(&self, id: &str, config: ServerConfig) -> Result<()> {
        let mut connections = self.connections.write().await;
        
        if connections.contains_key(id) {
            return Err(SshError::ConnectionFailed("Connection already exists".to_string()));
        }

        let mut conn = SshConnection::new(config);
        conn.connect_with_shell().await?;
        
        connections.insert(id.to_string(), Arc::new(RwLock::new(conn)));
        info!("Created SSH connection: {}", id);
        
        Ok(())
    }

    /// Get a connection by ID
    pub async fn get_connection(&self, id: &str) -> Option<Arc<RwLock<SshConnection>>> {
        let connections = self.connections.read().await;
        connections.get(id).cloned()
    }

    /// Remove a connection
    pub async fn remove_connection(&self, id: &str) -> Result<()> {
        let mut connections = self.connections.write().await;
        
        if let Some(conn) = connections.remove(id) {
            let mut conn = conn.write().await;
            conn.disconnect().await?;
            info!("Removed SSH connection: {}", id);
        }
        
        Ok(())
    }

    /// Send data to a connection
    pub async fn send_data(&self, id: &str, data: &[u8]) -> Result<()> {
        let conn = self.get_connection(id).await
            .ok_or_else(|| SshError::Channel("Connection not found".to_string()))?;
        
        let conn = conn.read().await;
        conn.send(data).await
    }

    /// Receive data from a connection
    pub async fn recv_data(&self, id: &str) -> Option<Vec<u8>> {
        let conn = self.get_connection(id).await?;
        let conn = conn.read().await;
        conn.recv().await
    }

    /// Resize terminal for a connection
    pub async fn resize_terminal(&self, id: &str, cols: u32, rows: u32) -> Result<()> {
        let conn = self.get_connection(id).await
            .ok_or_else(|| SshError::Channel("Connection not found".to_string()))?;
        
        let conn = conn.read().await;
        conn.resize(cols, rows).await
    }

    /// Check if connection exists
    pub async fn has_connection(&self, id: &str) -> bool {
        let connections = self.connections.read().await;
        connections.contains_key(id)
    }

    /// Get all connection IDs
    pub async fn list_connections(&self) -> Vec<String> {
        let connections = self.connections.read().await;
        connections.keys().cloned().collect()
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
