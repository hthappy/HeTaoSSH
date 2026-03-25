//! SFTP 文件操作命令模块
//!
//! 本模块包含所有 SFTP 相关的 Tauri 命令，用于在远程（SSH）和本地文件系统上
//! 执行文件操作。
//!
//! # 功能特性
//!
//! - **统一接口**: 远程和本地文件操作使用相同的命令接口
//! - **路径验证**: 所有操作前自动验证路径，防止路径遍历攻击
//! - **双向传输**: 支持上传/下载文件和目录
//! - **递归操作**: 支持递归下载整个目录树
//!
//! # 本地 vs 远程
//!
//! 命令通过 `tab_id` 前缀区分本地和远程操作：
//! - `tab_id.starts_with("local-")`: 本地文件系统操作
//! - 其他: 远程 SSH 文件系统操作
//!
//! # 安全性
//!
//! 所有路径参数都会经过 `validate_sftp_path()` 验证，阻止：
//! - 父目录遍历 (`../`)
//! - Null 字节注入 (`\0`)
//! - 其他危险模式
//!
//! # 使用示例
//!
//! ```typescript
//! // 列出远程目录
//! const entries = await invoke('sftp_list_dir', {
//!   tabId: 'ssh-tab-1',
//!   path: '/home/user'
//! });
//!
//! // 列出本地目录
//! const localEntries = await invoke('sftp_list_dir', {
//!   tabId: 'local-tab-1',
//!   path: 'C:/Users/user'
//! });
//!
//! // 下载文件
//! await invoke('sftp_download_file', {
//!   tabId: 'ssh-tab-1',
//!   remotePath: '/home/user/file.txt',
//!   localPath: 'C:/Downloads/file.txt'
//! });
//! ```

use crate::error::{Result, SshError};
use crate::security::validation::validate_sftp_path;
use crate::ssh::ConnectionManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// 列出目录内容（远程或本地）
///
/// 列出指定目录下的所有文件和子目录。结果按目录优先、名称排序。
///
/// # 参数
///
/// * `tab_id` - 连接标识符（`local-*` 表示本地，其他表示远程）
/// * `path` - 目录路径
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 文件/目录条目列表，每个条目包含：
/// - `filename`: 文件名
/// - `is_dir`: 是否为目录
/// - `is_file`: 是否为文件
/// - `size`: 文件大小（字节）
///
/// # 错误
///
/// - `SshError::Config`: 路径包含危险模式（路径遍历）
/// - `SshError::ConnectionFailed`: 远程操作失败（权限不足、目录不存在等）
/// - `SshError::Io`: 本地操作失败
///
/// # 示例
///
/// ```typescript
/// const entries = await invoke<SftpEntry[]>('sftp_list_dir', {
///   tabId: 'ssh-tab-1',
///   path: '/home/user'
/// });
///
/// entries.forEach(entry => {
///   console.log(`${entry.is_dir ? '[DIR]' : '[FILE]'} ${entry.filename}`);
/// });
/// ```
#[tauri::command]
pub async fn sftp_list_dir(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<Vec<crate::ssh::SftpEntry>> {
    // 统一路径验证
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        return local_list_dir(path).await;
    }

    state.sftp_list_dir(&tab_id, &path).await
}

/// Read file contents (remote or local)
#[tauri::command]
pub async fn sftp_read_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<String> {
    // 统一路径验证
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        let content = std::fs::read(&path).map_err(SshError::Io)?;
        return String::from_utf8(content)
            .map_err(|e| crate::error::SshError::Channel(format!("Invalid UTF-8: {}", e)));
    }

    let content = state.sftp_read_file(&tab_id, &path).await?;
    String::from_utf8(content)
        .map_err(|e| crate::error::SshError::Channel(format!("Invalid UTF-8: {}", e)))
}

/// Write file contents (remote or local)
#[tauri::command]
pub async fn sftp_write_file(
    tab_id: String,
    path: String,
    content: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        return std::fs::write(&path, content).map_err(SshError::Io);
    }

    state
        .sftp_write_file(&tab_id, &path, content.as_bytes())
        .await
}

/// Remove file or directory (remote or local)
#[tauri::command]
pub async fn sftp_remove_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        let path = std::path::Path::new(&path);
        if path.is_dir() {
            return std::fs::remove_dir_all(path).map_err(SshError::Io);
        } else {
            return std::fs::remove_file(path).map_err(SshError::Io);
        }
    }

    state.sftp_remove_file(&tab_id, &path).await
}

/// Create directory (remote or local)
#[tauri::command]
pub async fn sftp_create_dir(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        return std::fs::create_dir_all(&path).map_err(SshError::Io);
    }

    state.sftp_create_dir(&tab_id, &path).await
}

/// 下载文件从远程到本地
///
/// 从远程服务器下载单个文件到本地文件系统。
///
/// # 参数
///
/// * `tab_id` - 远程连接标识符
/// * `remote_path` - 远程文件路径
/// * `local_path` - 本地保存路径
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 `Ok(())`
///
/// # 错误
///
/// - `SshError::Config`: 远程路径包含危险模式
/// - `SshError::ConnectionFailed`: 远程文件不存在或无权限读取
/// - `SshError::Io`: 本地文件写入失败
///
/// # 注意
///
/// - 如果远程路径是目录，会返回错误（使用 `sftp_download_dir` 下载目录）
/// - 如果本地文件已存在，会被覆盖
///
/// # 示例
///
/// ```typescript
/// await invoke('sftp_download_file', {
///   tabId: 'ssh-tab-1',
///   remotePath: '/home/user/document.pdf',
///   localPath: 'C:/Downloads/document.pdf'
/// });
/// ```
#[tauri::command]
pub async fn sftp_download_file(
    tab_id: String,
    remote_path: String,
    local_path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&remote_path)?;
    
    state
        .sftp_download_file(&tab_id, &remote_path, &local_path)
        .await
}

/// 下载目录从远程到本地（递归）
///
/// 递归下载整个目录树，包括所有子目录和文件。
///
/// # 参数
///
/// * `tab_id` - 远程连接标识符
/// * `remote_path` - 远程目录路径
/// * `local_path` - 本地保存路径
/// * `state` - ConnectionManager 状态
///
/// # 返回
///
/// 成功时返回 `Ok(())`
///
/// # 错误
///
/// - `SshError::Config`: 远程路径包含危险模式
/// - `SshError::ConnectionFailed`: 远程目录不存在或无权限读取
/// - `SshError::Io`: 本地目录创建或文件写入失败
///
/// # 实现细节
///
/// 使用迭代式深度优先遍历（栈），避免递归调用栈溢出。
/// 自动创建本地目录结构，保持与远程目录相同的层次。
///
/// # 示例
///
/// ```typescript
/// // 下载整个项目目录
/// await invoke('sftp_download_dir', {
///   tabId: 'ssh-tab-1',
///   remotePath: '/home/user/project',
///   localPath: 'C:/Projects/project'
/// });
/// ```
#[tauri::command]
pub async fn sftp_download_dir(
    tab_id: String,
    remote_path: String,
    local_path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&remote_path)?;
    
    state
        .sftp_download_dir(&tab_id, &remote_path, &local_path)
        .await
}

/// Upload file from local to remote
#[tauri::command]
pub async fn sftp_upload_file(
    tab_id: String,
    local_path: String,
    remote_path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证
    validate_sftp_path(&remote_path)?;
    
    state
        .sftp_upload_file(&tab_id, &local_path, &remote_path)
        .await
}

/// Upload file from local to remote with progress tracking
#[tauri::command]
pub async fn sftp_upload_file_with_progress(
    tab_id: String,
    local_path: String,
    remote_path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // 统一路径验证 (validate path)
    validate_sftp_path(&remote_path)?;
    
    state
        .sftp_upload_file_with_progress(&tab_id, &local_path, &remote_path)
        .await
}

/// Get home directory path (remote or local)
#[tauri::command]
pub async fn sftp_get_home_dir(
    tab_id: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<String> {
    if tab_id.starts_with("local-") {
        return dirs::home_dir()
            .map(|p| p.to_string_lossy().replace("\\", "/"))
            .ok_or(SshError::Config("Failed to get home dir".into()));
    }
    state        .sftp_get_home_dir(&tab_id).await
}

/// Rename/Move file or directory (remote or local)
#[tauri::command]
pub async fn sftp_rename(
    tab_id: String,
    old_path: String,
    new_path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // Validate both paths
    validate_sftp_path(&old_path)?;
    validate_sftp_path(&new_path)?;

    if tab_id.starts_with("local-") {
        return std::fs::rename(&old_path, &new_path).map_err(SshError::Io);
    }

    state.sftp_rename(&tab_id, &old_path, &new_path).await
}

/// Create empty file (remote or local)
#[tauri::command]
pub async fn sftp_create_file(
    tab_id: String,
    path: String,
    state: State<'_, Arc<ConnectionManager>>,
) -> Result<()> {
    // Validate path
    validate_sftp_path(&path)?;

    if tab_id.starts_with("local-") {
        return std::fs::File::create(&path)
            .map(|_| ())
            .map_err(SshError::Io);
    }

    state.sftp_create_file(&tab_id, &path).await
}

/// List local directory contents
#[tauri::command]
pub async fn local_list_dir(path: String) -> Result<Vec<crate::ssh::SftpEntry>> {
    let path = std::path::Path::new(&path);
    let mut entries = Vec::new();

    if path.is_dir() {
        let read_dir = std::fs::read_dir(path).map_err(SshError::Io)?;
        for entry in read_dir {
            let entry = entry.map_err(SshError::Io)?;
            let metadata = entry.metadata().map_err(SshError::Io)?;
            let filename = entry.file_name().to_string_lossy().to_string();

            // Skip . and ..
            if filename == "." || filename == ".." {
                continue;
            }

            entries.push(crate::ssh::SftpEntry {
                filename: filename.clone(),
                longname: filename, // Simplified for local files
                is_dir: metadata.is_dir(),
                is_file: metadata.is_file(),
                size: metadata.len(),
            });
        }
    }

    // Sort directories first, then files (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.filename.to_lowercase().cmp(&b.filename.to_lowercase())
        }
    });

    Ok(entries)
}

/// Get local home directory path
#[tauri::command]
pub fn local_get_home_dir(app_handle: AppHandle) -> Result<String> {
    app_handle
        .path()
        .home_dir()
        .map(|p| p.to_string_lossy().replace("\\", "/"))
        .map_err(|e| SshError::Config(format!("Failed to get home dir: {}", e)))
}
