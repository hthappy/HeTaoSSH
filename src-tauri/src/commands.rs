use crate::config::{ConfigManager, ServerConfig};
use crate::error::Result;
use crate::monitor;
use crate::snippets;
use crate::ssh::ConnectionManager;
use std::sync::Arc;
use tauri::State;
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn list_servers(state: State<'_, Arc<ConfigManager>>) -> Result<Vec<ServerConfig>> {
    state.list_servers().await
}

#[tauri::command]
pub async fn save_server(
    config: ServerConfig,
    state: State<'_, Arc<ConfigManager>>,
) -> Result<i64> {
    state.save_server(&config).await
}

#[tauri::command]
pub async fn delete_server(id: i64, state: State<'_, Arc<ConfigManager>>) -> Result<()> {
    state.delete_server(id).await
}

#[tauri::command]
pub async fn test_connection(config: ServerConfig) -> Result<String> {
    let mut conn = crate::ssh::SshConnection::new(config);
    match conn.connect().await {
        Ok(_) => {
            conn.disconnect().await?;
            Ok("Connection successful".to_string())
        }
        Err(e) => Err(e),
    }
}

// SFTP File operations (placeholder for Phase 3)
#[tauri::command]
pub async fn sftp_list_dir(path: String) -> Result<Vec<crate::ssh::SftpEntry>> {
    let client = crate::ssh::SftpClient::new()?;
    client.list_dir(&path).await
}

#[tauri::command]
pub async fn sftp_read_file(path: String) -> Result<String> {
    let client = crate::ssh::SftpClient::new()?;
    let content = client.read_file(&path).await?;
    String::from_utf8(content)
        .map_err(|e| crate::error::SshError::Channel(format!("Invalid UTF-8: {}", e)))
}

#[tauri::command]
pub async fn sftp_write_file(path: String, content: String) -> Result<()> {
    let client = crate::ssh::SftpClient::new()?;
    client.write_file(&path, content.as_bytes()).await
}

#[tauri::command]
pub async fn sftp_remove_file(path: String) -> Result<()> {
    let client = crate::ssh::SftpClient::new()?;
    client.remove_file(&path).await
}

#[tauri::command]
pub async fn sftp_create_dir(path: String) -> Result<()> {
    let client = crate::ssh::SftpClient::new()?;
    client.create_dir(&path).await
}

// System monitoring
#[tauri::command]
pub fn get_system_usage() -> Result<monitor::SystemUsage> {
    monitor::get_system_usage()
}

// Command snippets
#[tauri::command]
pub async fn list_snippets(state: tauri::State<'_, Arc<snippets::SnippetManager>>) -> Result<Vec<snippets::CommandSnippet>> {
    state.list_snippets().await
}

#[tauri::command]
pub async fn list_snippet_categories(state: tauri::State<'_, Arc<snippets::SnippetManager>>) -> Result<Vec<String>> {
    state.list_categories().await
}

#[tauri::command]
pub async fn save_snippet(
    snippet: snippets::CommandSnippet,
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<i64> {
    state.save_snippet(&snippet).await
}

#[tauri::command]
pub async fn delete_snippet(
    id: i64,
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<()> {
    state.delete_snippet(id).await
}

// SSH Connection management
#[tauri::command]
pub async fn ssh_connect(
    tab_id: String,
    config: ServerConfig,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<String> {
    state.create_connection(&tab_id, config).await?;
    Ok("Connected".to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.remove_connection(&tab_id).await
}

#[tauri::command]
pub async fn ssh_send(
    tab_id: String,
    data: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.send_data(&tab_id, data.as_bytes()).await
}

#[tauri::command]
pub async fn ssh_recv(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<Vec<u8>> {
    state.recv_data(&tab_id).await
        .ok_or(crate::error::SshError::Channel("No data received".to_string()))
}

#[tauri::command]
pub async fn ssh_resize(
    tab_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.resize_terminal(&tab_id, cols, rows).await
}
