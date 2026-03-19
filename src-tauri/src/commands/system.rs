//! System monitoring and utility commands
//!
//! This module contains commands for system monitoring, local terminal management,
//! and utility functions like HTTP requests.

use crate::error::{Result, SshError};
use crate::local_term::LocalTerminalManager;
use crate::monitor;
use crate::ssh::ConnectionManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

/// 获取系统资源使用情况（CPU、内存、磁盘）
///
/// 获取本地或远程服务器的系统资源使用情况。
///
/// # 参数
///
/// * `tab_id` - 连接标识符（`local-*` 表示本地，其他表示远程）
/// * `state` - ConnectionManager 状态
/// * `local_monitor` - 本地系统监控器
///
/// # 返回
///
/// `SystemUsage` 结构，包含：
/// - `cpu_usage`: CPU 使用率（百分比）
/// - `memory_used`: 已使用内存（字节）
/// - `memory_total`: 总内存（字节）
/// - `disk_used`: 已使用磁盘空间（字节）
/// - `disk_total`: 总磁盘空间（字节）
///
/// # 错误
///
/// - `SshError::Channel`: 远程连接不存在
/// - `SshError::ConnectionFailed`: 远程命令执行失败
/// - `SshError::Io`: 本地系统信息获取失败
///
/// # 实现细节
///
/// - **本地**: 使用 `sysinfo` crate 获取系统信息
/// - **远程**: 通过 SSH 执行 shell 命令解析输出
///
/// # 示例
///
/// ```typescript
/// const usage = await invoke<SystemUsage>('get_system_usage', {
///   tabId: 'ssh-tab-1'
/// });
///
/// console.log(`CPU: ${usage.cpu_usage}%`);
/// console.log(`Memory: ${usage.memory_used}/${usage.memory_total}`);
/// ```
#[tauri::command]
pub async fn get_system_usage(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
    local_monitor: State<'_, Arc<monitor::LocalMonitor>>,
) -> Result<monitor::SystemUsage> {
    if tab_id.starts_with("local-") {
        let monitor = local_monitor.inner().clone();
        // Run in blocking task because sysinfo refresh might be slow
        let usage = tokio::task::spawn_blocking(move || monitor.get_usage())
            .await
            .map_err(|e| {
                SshError::Io(std::io::Error::other(e.to_string()))
            })?;

        Ok(usage)
    } else {
        state.get_remote_system_usage(&tab_id).await
    }
}

/// 从 URL 获取内容
///
/// 发送 HTTP GET 请求获取 URL 内容，用于获取更新信息、主题文件等。
///
/// # 参数
///
/// * `url` - 要请求的 URL
///
/// # 返回
///
/// HTTP 响应的文本内容
///
/// # 错误
///
/// - `SshError::ConnectionFailed`: HTTP 请求失败或状态码非 2xx
///
/// # 安全性
///
/// - 使用自定义 User-Agent: "HeTaoSSH/0.1.0"
/// - 仅支持 HTTP/HTTPS 协议
/// - 不跟随重定向（默认行为）
///
/// # 示例
///
/// ```typescript
/// // 获取更新信息
/// const updateInfo = await invoke<string>('fetch_url', {
///   url: 'https://api.github.com/repos/user/repo/releases/latest'
/// });
/// const data = JSON.parse(updateInfo);
/// ```
#[tauri::command]
pub async fn fetch_url(url: String) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("HeTaoSSH/0.1.0")
        .build()
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(crate::error::SshError::ConnectionFailed(format!(
            "HTTP request failed with status: {}",
            response.status()
        )));
    }

    let content = response
        .text()
        .await
        .map_err(|e| crate::error::SshError::ConnectionFailed(e.to_string()))?;

    Ok(content)
}

/// Open local terminal
#[tauri::command]
pub async fn open_local_terminal(
    id: String,
    rows: u16,
    cols: u16,
    app_handle: AppHandle,
    state: State<'_, Arc<LocalTerminalManager>>,
) -> Result<()> {
    state.create_terminal(id, rows, cols, app_handle)
}

/// Write data to local terminal
#[tauri::command]
pub async fn local_term_write(
    id: String,
    data: Vec<u8>,
    state: State<'_, Arc<LocalTerminalManager>>,
) -> Result<()> {
    state.write(&id, &data)
}

/// Resize local terminal
#[tauri::command]
pub async fn local_term_resize(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, Arc<LocalTerminalManager>>,
) -> Result<()> {
    state.resize(&id, rows, cols)
}

/// Close local terminal
#[tauri::command]
pub async fn local_term_close(
    id: String,
    state: State<'_, Arc<LocalTerminalManager>>,
) -> Result<()> {
    state.close(&id);
    Ok(())
}

/// Open folder in system explorer (Windows Explorer, macOS Finder, etc.)
#[tauri::command]
pub async fn open_path_in_explorer(path: String) -> Result<()> {
    use std::process::Command;

    log::info!("Opening path in explorer: {}", path);

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| SshError::Io(e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| SshError::Io(e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| SshError::Io(e))?;
    }

    Ok(())
}
