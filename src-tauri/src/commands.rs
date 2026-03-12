use crate::config::{ConfigManager, ServerConfig};
use crate::error::{Result, SshError};
use crate::monitor;
use crate::snippets;
use crate::ssh::ConnectionManager;
use crate::security::contains_traversal_pattern;
use crate::theme::{self, ThemeSchema};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn parse_theme(content: String) -> Result<ThemeSchema> {
    theme::parse_iterm2_theme(&content)
}

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

// SFTP File operations
#[tauri::command]
pub async fn sftp_list_dir(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<Vec<crate::ssh::SftpEntry>> {
    // 检查路径遍历模式（危险字符）
    if contains_traversal_pattern(&path) {
        return Err(SshError::Config(
            "Path traversal detected: suspicious pattern in path".into()
        ));
    }
    
    state.sftp_list_dir(&tab_id, &path).await
}

#[tauri::command]
pub async fn sftp_read_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<String> {
    // 检查路径遍历模式
    if contains_traversal_pattern(&path) {
        return Err(SshError::Config(
            "Path traversal detected: suspicious pattern in path".into()
        ));
    }
    
    let content = state.sftp_read_file(&tab_id, &path).await?;
    String::from_utf8(content)
        .map_err(|e| crate::error::SshError::Channel(format!("Invalid UTF-8: {}", e)))
}

#[tauri::command]
pub async fn sftp_write_file(
    tab_id: String,
    path: String,
    content: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<()> {
    // 检查路径遍历模式
    if contains_traversal_pattern(&path) {
        return Err(SshError::Config(
            "Path traversal detected: suspicious pattern in path".into()
        ));
    }
    
    state.sftp_write_file(&tab_id, &path, content.as_bytes()).await
}

#[tauri::command]
pub async fn sftp_remove_file(_tab_id: String, _path: String) -> Result<()> {
    Err(crate::error::SshError::Channel("Not implemented".to_string()))
}

#[tauri::command]
pub async fn sftp_get_home_dir(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>
) -> Result<String> {
    state.sftp_get_home_dir(&tab_id).await
}

#[tauri::command]
pub async fn sftp_create_dir(_tab_id: String, _path: String) -> Result<()> {
    Err(crate::error::SshError::Channel("Not implemented".to_string()))
}

// 远程系统监控
#[tauri::command]
pub async fn get_system_usage(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<monitor::SystemUsage> {
    state.get_remote_system_usage(&tab_id).await
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
    app_handle: tauri::AppHandle,
    tab_id: String,
    config: ServerConfig,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<String> {
    state.create_connection(&tab_id, config, app_handle).await?;
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

#[tauri::command]
pub async fn fetch_url(url: String) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("HetaoSSH/0.1.0")
        .build()
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?;

    let content = client
        .get(&url)
        .send()
        .await
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?
        .text()
        .await
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?;

    Ok(content)
}
