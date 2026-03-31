//! SSH Tunnel / Port Forwarding commands

use crate::error::Result;
use crate::ssh::{TunnelInfo, TunnelManager, TunnelMode};
use std::sync::Arc;
use tauri::State;

/// Start a new SSH tunnel
///
/// # Arguments
/// * `mode` - "local" for local forwarding, "dynamic" for SOCKS5 proxy
/// * `local_port` - Local port to listen on
/// * `remote_host` - Remote host (for local mode)
/// * `remote_port` - Remote port (for local mode)
/// * `server_id` - Server ID to create tunnel through
#[tauri::command]
pub async fn start_tunnel(
    mode: String,
    local_port: u16,
    remote_host: Option<String>,
    remote_port: Option<u16>,
    server_id: i32,
    state: State<'_, Arc<TunnelManager>>,
) -> Result<String> {
    let tunnel_mode = match mode.as_str() {
        "local" => TunnelMode::Local,
        "dynamic" => TunnelMode::Dynamic,
        _ => return Err(crate::error::SshError::Config(format!("Invalid tunnel mode: {}", mode))),
    };

    // Generate unique tunnel ID
    let tunnel_id = format!("tunnel-{}-{}", server_id, local_port);

    state
        .start_tunnel(
            tunnel_id.clone(),
            tunnel_mode,
            local_port,
            remote_host,
            remote_port,
            server_id,
        )
        .await?;

    Ok(tunnel_id)
}

/// Stop an SSH tunnel
#[tauri::command]
pub async fn stop_tunnel(
    tunnel_id: String,
    state: State<'_, Arc<TunnelManager>>,
) -> Result<()> {
    state.stop_tunnel(&tunnel_id).await
}

/// List all active tunnels
#[tauri::command]
pub async fn list_tunnels(
    state: State<'_, Arc<TunnelManager>>,
) -> Result<Vec<TunnelInfo>> {
    Ok(state.list_tunnels().await)
}