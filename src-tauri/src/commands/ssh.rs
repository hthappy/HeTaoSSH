//! SSH connection management commands
//!
//! This module contains all SSH-related Tauri commands for managing
//! SSH connections, terminal I/O, and connection testing.

use crate::config::ServerConfig;
use crate::error::Result;
use crate::ssh::ConnectionManager;
use std::sync::Arc;
use tauri::State;

/// 建立 SSH 连接
///
/// 创建新的 SSH 连接并启动 Actor 任务。连接成功后，Actor 会持续运行
/// 直到收到断开命令或连接失败。
///
/// # 参数
///
/// * `app_handle` - Tauri 应用句柄（用于发送事件到前端）
/// * `tab_id` - 连接的唯一标识符（通常是前端标签页 ID）
/// * `config` - SSH 服务器配置（主机、端口、用户名、密码等）
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 "Connected" 字符串
///
/// # 错误
///
/// - `SshError::ConnectionFailed`: 连接超时或认证失败
/// - `SshError::Config`: 配置无效
///
/// # 前端事件
///
/// - `ssh-data-{tab_id}`: 接收到终端数据时触发
/// - `ssh-reconnecting`: 连接断开，正在重连时触发
/// - `ssh-reconnected`: 重连成功时触发
/// - `ssh-disconnected`: 连接永久断开时触发
///
/// # 示例
///
/// ```typescript
/// // 前端调用
/// await invoke('ssh_connect', {
///   tabId: 'tab-1',
///   config: {
///     host: 'example.com',
///     port: 22,
///     username: 'user',
///     password: 'pass'
///   }
/// });
/// ```
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

/// 断开 SSH 连接
///
/// 向 Actor 发送断开命令，Actor 会清理资源并退出。
///
/// # 参数
///
/// * `tab_id` - 要断开的连接标识符
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 `Ok(())`
///
/// # 错误
///
/// - `SshError::Channel`: 连接不存在或 Actor 已停止
///
/// # 示例
///
/// ```typescript
/// // 前端调用
/// await invoke('ssh_disconnect', { tabId: 'tab-1' });
/// ```
#[tauri::command]
pub async fn ssh_manual_reconnect(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.reconnect(&tab_id).await
}

/// 发送数据到 SSH 终端
///
/// 将用户输入的数据发送到远程 SSH 终端。数据会被转发到 Actor，
/// 然后通过 SSH 通道发送到服务器。
///
/// # 参数
///
/// * `tab_id` - 连接标识符
/// * `data` - 要发送的数据（通常是用户键盘输入）
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 `Ok(())`
///
/// # 错误
///
/// - `SshError::Channel`: 连接不存在或 Actor 已停止
/// - `SshError::ConnectionFailed`: SSH 通道发送失败
///
/// # 注意
///
/// 前端应使用防抖机制（50ms）来批量发送数据，避免频繁的 IPC 调用。
///
/// # 示例
///
/// ```typescript
/// // 前端调用（已防抖）
/// await invoke('ssh_send', {
///   tabId: 'tab-1',
///   data: 'ls -la\n'
/// });
/// ```
#[tauri::command]
pub async fn ssh_send(
    tab_id: String,
    data: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.send_data(&tab_id, data.as_bytes()).await
}

/// Receive data from SSH terminal
#[tauri::command]
pub async fn ssh_recv(tab_id: String, state: State<'_, Arc<ConnectionManager>>) -> Result<Vec<u8>> {
    state
        .recv_data(&tab_id)
        .await
        .ok_or(crate::error::SshError::Channel(
            "No data received".to_string(),
        ))
}

/// 调整 SSH 终端大小
///
/// 通知远程服务器终端窗口大小已改变。服务器会根据新的尺寸
/// 调整输出格式（如 `top`、`vim` 等全屏应用）。
///
/// # 参数
///
/// * `tab_id` - 连接标识符
/// * `cols` - 终端列数（字符宽度）
/// * `rows` - 终端行数（字符高度）
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 `Ok(())`
///
/// # 错误
///
/// - `SshError::Channel`: 连接不存在或 Actor 已停止
/// - `SshError::ConnectionFailed`: SSH 通道调整失败
///
/// # 示例
///
/// ```typescript
/// // 前端调用（窗口大小变化时）
/// await invoke('ssh_resize', {
///   tabId: 'tab-1',
///   cols: 80,
///   rows: 24
/// });
/// ```
#[tauri::command]
pub async fn ssh_resize(
    tab_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.resize_terminal(&tab_id, cols, rows).await
}

/// 断开 SSH 连接
#[tauri::command]
pub async fn ssh_disconnect(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    state.remove_connection(&tab_id).await
}

/// 手动触发 SSH 连接重连
///
/// 当连接处于断开状态（非正常断开），可以通过此命令手动启动重连过程。
/// 主要用于自动重连尝试失败后，用户主动触发重连的情况。
///
/// # 参数
///
/// * `tab_id` - 连接标识符
/// * `state` - ConnectionManager 状态
/// 
/// # 返回
/// 成功时返回 `Ok(())`
/// 
/// # 错误
/// 
/// - `SshError::Channel`: 连接不存在或 Actor 已停止
/// - `SshError::ConnectionFailed`: 重新连接失败
/// 
/// # 示例
/// 
/// ```typescript
/// // 前端调用
/// await invoke('ssh_manual_reconnect', { tabId: 'tab-1' });
/// ```
///
/// 尝试连接到 SSH 服务器并立即断开，用于验证配置是否正确。
/// 不会创建 Actor 或持久连接。
///
/// # 参数
///
/// * `config` - SSH 服务器配置
///
/// # 返回
///
/// 成功时返回 "Connection successful" 字符串
///
/// # 错误
///
/// - `SshError::ConnectionFailed`: 连接失败（网络错误、超时等）
/// - `SshError::AuthFailed`: 认证失败（用户名或密码错误）
///
/// # 使用场景
///
/// - 保存服务器配置前验证连接
/// - 测试网络连通性
/// - 验证认证凭据
///
/// # 示例
///
/// ```typescript
/// // 前端调用（保存配置前测试）
/// try {
///   await invoke('test_connection', {
///     config: {
///       host: 'example.com',
///       port: 22,
///       username: 'user',
///       password: 'pass'
///     }
///   });
///   toast.success('连接测试成功');
/// } catch (error) {
///   toast.error(`连接失败: ${error}`);
/// }
/// ```
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
