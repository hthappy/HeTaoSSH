//! Configuration and data management commands
//!
//! This module contains commands for managing server configurations,
//! command snippets, themes, sessions, and application metadata.

use crate::config::{ConfigManager, ServerConfig};
use crate::error::Result;
use crate::snippets;
use crate::theme::{self, ThemeSchema};
use std::sync::Arc;
use tauri::State;

/// 列出所有保存的服务器配置
///
/// 从数据库读取所有服务器配置，密码会自动解密。
///
/// # 参数
///
/// * `state` - ConfigManager 状态
///
/// # 返回
///
/// 服务器配置列表，每个配置包含：
/// - `id`: 数据库 ID
/// - `name`: 服务器名称
/// - `host`: 主机地址
/// - `port`: SSH 端口
/// - `username`: 用户名
/// - `password`: 解密后的密码（如果有）
/// - 其他字段...
///
/// # 错误
///
/// - `SshError::Database`: 数据库查询失败
/// - `SshError::Encryption`: 密码解密失败
///
/// # 示例
///
/// ```typescript
/// const servers = await invoke<ServerConfig[]>('list_servers');
/// servers.forEach(server => {
///   console.log(`${server.name} - ${server.host}:${server.port}`);
/// });
/// ```
#[tauri::command]
pub async fn list_servers(state: State<'_, Arc<ConfigManager>>) -> Result<Vec<ServerConfig>> {
    state.list_servers().await
}

/// 保存或更新服务器配置
///
/// 保存新的服务器配置或更新现有配置。密码会自动加密后存储。
///
/// # 参数
///
/// * `config` - 服务器配置（如果 `id` 为 None 则创建新配置，否则更新）
/// * `state` - ConfigManager 状态
///
/// # 返回
///
/// 保存后的服务器 ID（新建时返回新 ID，更新时返回原 ID）
///
/// # 错误
///
/// - `SshError::Database`: 数据库操作失败
/// - `SshError::Encryption`: 密码加密失败
///
/// # 示例
///
/// ```typescript
/// // 创建新服务器
/// const id = await invoke<number>('save_server', {
///   config: {
///     name: 'My Server',
///     host: 'example.com',
///     port: 22,
///     username: 'user',
///     password: 'pass'
///   }
/// });
///
/// // 更新现有服务器
/// await invoke('save_server', {
///   config: {
///     id: 1,
///     name: 'Updated Name',
///     // ... 其他字段
///   }
/// });
/// ```
#[tauri::command]
pub async fn save_server(
    config: ServerConfig,
    state: State<'_, Arc<ConfigManager>>,
) -> Result<i64> {
    state.save_server(&config).await
}

/// Delete server configuration
#[tauri::command]
pub async fn delete_server(id: i64, state: State<'_, Arc<ConfigManager>>) -> Result<()> {
    state.delete_server(id).await
}

/// Save session state (list of open server IDs)
#[tauri::command]
pub async fn save_session(
    server_ids: Vec<i64>,
    state: State<'_, Arc<ConfigManager>>,
) -> Result<()> {
    state.save_session(server_ids).await
}

/// Get saved session state
#[tauri::command]
pub async fn get_session(
    state: State<'_, Arc<ConfigManager>>,
) -> Result<Option<crate::config::SessionState>> {
    state.get_session().await
}

/// List all command snippets
#[tauri::command]
pub async fn list_snippets(
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<Vec<snippets::CommandSnippet>> {
    state.list_snippets().await
}

/// List all snippet categories
#[tauri::command]
pub async fn list_snippet_categories(
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<Vec<String>> {
    state.list_categories().await
}

/// Save or update command snippet
#[tauri::command]
pub async fn save_snippet(
    snippet: snippets::CommandSnippet,
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<i64> {
    state.save_snippet(&snippet).await
}

/// Delete command snippet
#[tauri::command]
pub async fn delete_snippet(
    id: i64,
    state: tauri::State<'_, Arc<snippets::SnippetManager>>,
) -> Result<()> {
    state.delete_snippet(id).await
}

/// Parse iTerm2 theme file
#[tauri::command]
pub fn parse_theme(content: String) -> Result<ThemeSchema> {
    theme::parse_iterm2_theme(&content)
}

/// Ping command for health check
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

/// Get application version
#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
