//! SSH Connection Manager — Actor 模型
//! 每个连接运行在独立的 tokio 任务中，通过 mpsc channel 接收命令
//! 消除了嵌套 RwLock 的锁竞争问题

use crate::config::ServerConfig;
use crate::error::{Result, SshError};
use crate::ssh::SshConnection;
use log::info;
use std::collections::HashMap;
use tokio::sync::{mpsc, oneshot, Mutex};

/// Actor 命令：发送给连接 Actor 的请求
enum ConnCommand {
    /// 发送终端数据
    SendData {
        data: Vec<u8>,
        reply: oneshot::Sender<Result<()>>,
    },
    /// 接收终端数据
    RecvData {
        reply: oneshot::Sender<Option<Vec<u8>>>,
    },
    /// 调整终端大小
    ResizeTerminal {
        cols: u32,
        rows: u32,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 列出目录
    SftpListDir {
        path: String,
        reply: oneshot::Sender<Result<Vec<crate::ssh::SftpEntry>>>,
    },
    /// SFTP: 读取文件
    SftpReadFile {
        path: String,
        reply: oneshot::Sender<Result<Vec<u8>>>,
    },
    /// SFTP: 写入文件
    SftpWriteFile {
        path: String,
        content: Vec<u8>,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 获取用户主目录
    SftpGetHomeDir {
        reply: oneshot::Sender<Result<String>>,
    },
    /// SFTP: 删除文件
    SftpRemoveFile {
        path: String,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 创建目录
    SftpCreateDir {
        path: String,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 下载文件
    SftpDownloadFile {
        remote_path: String,
        local_path: String,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 下载文件夹 (Recursive)
    SftpDownloadDir {
        remote_path: String,
        local_path: String,
        reply: oneshot::Sender<Result<()>>,
    },
    /// SFTP: 上传文件
    SftpUploadFile {
        local_path: String,
        remote_path: String,
        reply: oneshot::Sender<Result<()>>,
    },
    /// 远程系统监控
    GetSystemUsage {
        reply: oneshot::Sender<Result<crate::monitor::SystemUsage>>,
    },
    /// 断开连接
    Disconnect {
        reply: oneshot::Sender<Result<()>>,
    },
}

/// 连接 Actor 的句柄，持有发送端
struct ConnHandle {
    tx: mpsc::Sender<ConnCommand>,
}

/// Manages multiple SSH connections using Actor model
pub struct ConnectionManager {
    handles: Mutex<HashMap<String, ConnHandle>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// 创建新的 SSH 连接，并启动 Actor 任务
    pub async fn create_connection(&self, id: &str, config: ServerConfig, app_handle: tauri::AppHandle) -> Result<()> {
        let mut handles = self.handles.lock().await;

        // 如果连接已存在，先清理旧的 Actor（支持重连场景）
        if let Some(old_handle) = handles.remove(id) {
            // 发送断开命令给旧 Actor，忽略回复（Actor 可能已退出）
            let (reply_tx, _reply_rx) = oneshot::channel();
            let _ = old_handle.tx.send(ConnCommand::Disconnect { reply: reply_tx }).await;
            info!("Removed existing connection actor for reconnection: {}", id);
        }

        // 建立连接
        let mut conn = SshConnection::new(config);
        conn.connect_with_shell().await?;

        // 创建 Actor channel
        let (tx, rx) = mpsc::channel::<ConnCommand>(64);

        // 启动 Actor 任务 — 该任务独占 SshConnection
        let conn_id = id.to_string();
        tokio::spawn(async move {
            connection_actor(conn_id, conn, rx, app_handle).await;
        });

        handles.insert(id.to_string(), ConnHandle { tx });
        info!("Created SSH connection actor: {}", id);

        Ok(())
    }

    /// 移除连接
    pub async fn remove_connection(&self, id: &str) -> Result<()> {
        let mut handles = self.handles.lock().await;

        if let Some(handle) = handles.remove(id) {
            let (reply_tx, reply_rx) = oneshot::channel();
            let _ = handle.tx.send(ConnCommand::Disconnect { reply: reply_tx }).await;
            // 等待断开完成，但不阻塞太久
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                reply_rx,
            ).await;
            info!("Removed SSH connection: {}", id);
        }

        Ok(())
    }

    /// 发送终端数据
    pub async fn send_data(&self, id: &str, data: &[u8]) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SendData {
            data: data.to_vec(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 接收终端数据
    pub async fn recv_data(&self, id: &str) -> Option<Vec<u8>> {
        let tx = self.get_tx(id).await.ok()?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::RecvData { reply: reply_tx })
            .await
            .ok()?;
        reply_rx.await.ok()?
    }

    /// 调整终端大小
    pub async fn resize_terminal(&self, id: &str, cols: u32, rows: u32) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::ResizeTerminal {
            cols,
            rows,
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 检查连接是否存在
    pub async fn has_connection(&self, id: &str) -> bool {
        let handles = self.handles.lock().await;
        handles.contains_key(id)
    }

    /// 获取所有连接 ID
    pub async fn list_connections(&self) -> Vec<String> {
        let handles = self.handles.lock().await;
        handles.keys().cloned().collect()
    }

    // --- SFTP 操作 ---

    /// 列出远程目录内容
    pub async fn sftp_list_dir(&self, id: &str, path: &str) -> Result<Vec<crate::ssh::SftpEntry>> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpListDir {
            path: path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 读取远程文件内容
    pub async fn sftp_read_file(&self, id: &str, path: &str) -> Result<Vec<u8>> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpReadFile {
            path: path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 写入远程文件
    pub async fn sftp_write_file(&self, id: &str, path: &str, content: &[u8]) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpWriteFile {
            path: path.to_string(),
            content: content.to_vec(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 获取用户主目录
    pub async fn sftp_get_home_dir(&self, id: &str) -> Result<String> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpGetHomeDir { reply: reply_tx })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 删除远程文件
    pub async fn sftp_remove_file(&self, id: &str, path: &str) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpRemoveFile {
            path: path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 创建远程目录
    pub async fn sftp_create_dir(&self, id: &str, path: &str) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpCreateDir {
            path: path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 下载文件
    pub async fn sftp_download_file(&self, id: &str, remote_path: &str, local_path: &str) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpDownloadFile {
            remote_path: remote_path.to_string(),
            local_path: local_path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 下载文件夹
    pub async fn sftp_download_dir(&self, id: &str, remote_path: &str, local_path: &str) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpDownloadDir {
            remote_path: remote_path.to_string(),
            local_path: local_path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 上传文件
    pub async fn sftp_upload_file(&self, id: &str, local_path: &str, remote_path: &str) -> Result<()> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::SftpUploadFile {
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
            reply: reply_tx,
        })
        .await
        .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    /// 远程系统监控
    pub async fn get_remote_system_usage(&self, id: &str) -> Result<crate::monitor::SystemUsage> {
        let tx = self.get_tx(id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(ConnCommand::GetSystemUsage { reply: reply_tx })
            .await
            .map_err(|_| SshError::Channel("Connection actor stopped".to_string()))?;

        reply_rx
            .await
            .map_err(|_| SshError::Channel("Actor reply failed".to_string()))?
    }

    // --- 内部辅助 ---

    /// 获取连接 Actor 的发送端
    async fn get_tx(&self, id: &str) -> Result<mpsc::Sender<ConnCommand>> {
        let handles = self.handles.lock().await;
        handles
            .get(id)
            .map(|h| h.tx.clone())
            .ok_or_else(|| SshError::Channel("Connection not found".to_string()))
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// 连接 Actor 任务 — 独占 SshConnection，串行处理所有命令
// =============================================================================

async fn connection_actor(
    id: String,
    mut conn: SshConnection,
    mut rx: mpsc::Receiver<ConnCommand>,
    app_handle: tauri::AppHandle,
) {
    use tauri::Emitter;
    info!("Connection actor started: {}", id);
    let event_name = format!("ssh-data-{}", id);

    loop {
        tokio::select! {
            cmd_opt = rx.recv() => {
                let Some(cmd) = cmd_opt else { break; };
                match cmd {
                    ConnCommand::SendData { data, reply } => {
                        let result = conn.send(&data).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::RecvData { reply } => {
                        // Polling recv via RecvData is deprecated as we continuously poll below,
                        // but handle it so we don't break existing Rust signatures.
                        let _ = reply.send(None);
                    }
                    ConnCommand::ResizeTerminal { cols, rows, reply } => {
                        let result = conn.resize(cols, rows).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpListDir { path, reply } => {
                        let result = handle_sftp_list_dir(&conn, &path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpReadFile { path, reply } => {
                        let result = handle_sftp_read_file(&conn, &path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpWriteFile {
                        path,
                        content,
                        reply,
                    } => {
                        let result = handle_sftp_write_file(&conn, &path, &content).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpGetHomeDir { reply } => {
                        let result = handle_sftp_get_home_dir(&conn).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpRemoveFile { path, reply } => {
                        let result = handle_sftp_remove_file(&conn, &path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpCreateDir { path, reply } => {
                        let result = handle_sftp_create_dir(&conn, &path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpDownloadFile { remote_path, local_path, reply } => {
                        let result = handle_sftp_download_file(&conn, &remote_path, &local_path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpDownloadDir { remote_path, local_path, reply } => {
                        let result = handle_sftp_download_dir(&conn, &remote_path, &local_path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::SftpUploadFile { local_path, remote_path, reply } => {
                        let result = handle_sftp_upload_file(&conn, &local_path, &remote_path).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::GetSystemUsage { reply } => {
                        let result = handle_get_system_usage(&conn).await;
                        let _ = reply.send(result);
                    }
                    ConnCommand::Disconnect { reply } => {
                        let result = conn.disconnect().await;
                        let _ = reply.send(result);
                        break; // 退出 Actor 循环
                    }
                }
            }
            data_opt = conn.recv() => {
                match data_opt {
                    Some(data) => {
                        let _ = app_handle.emit(&event_name, data);
                    }
                    None => {
                        // PTY Session EOF
                        let _ = app_handle.emit(&event_name, b"\r\n[SSH Connection Closed]\r\n".to_vec());
                        break;
                    }
                }
            }
        }
    }

    info!("Connection actor stopped: {}", id);
}

// =============================================================================
// SFTP 和监控命令的具体处理逻辑
// =============================================================================

async fn handle_sftp_list_dir(conn: &SshConnection, path: &str) -> Result<Vec<crate::ssh::SftpEntry>> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    let dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("read_dir failed: {}", e)))?;

    let mut entries: Vec<crate::ssh::SftpEntry> = dir
        .map(|entry| {
            let metadata = entry.metadata();
            let file_type = entry.file_type();
            crate::ssh::SftpEntry {
                filename: entry.file_name(),
                longname: entry.file_name(),
                is_dir: file_type.is_dir(),
                is_file: file_type.is_file(),
                size: metadata.size.unwrap_or(0),
            }
        })
        .collect();

    // 排序：目录优先，然后按字母排序
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.filename.cmp(&b.filename)
        }
    });

    Ok(entries)
}

async fn handle_sftp_read_file(conn: &SshConnection, path: &str) -> Result<Vec<u8>> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    sftp.read(path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("read file failed: {}", e)))
}

async fn handle_sftp_write_file(conn: &SshConnection, path: &str, content: &[u8]) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    sftp.write(path, content)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("write file failed: {}", e)))
}

async fn handle_sftp_remove_file(conn: &SshConnection, path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    // Try removing as file first
    match sftp.remove_file(path).await {
        Ok(_) => Ok(()),
        Err(_) => {
            // If failed, try removing as directory
            sftp.remove_dir(path)
                .await
                .map_err(|e| SshError::ConnectionFailed(format!("remove failed: {}", e)))
        }
    }
}

async fn handle_sftp_create_dir(conn: &SshConnection, path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    sftp.create_dir(path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("create_dir failed: {}", e)))
}

async fn handle_sftp_download_file(conn: &SshConnection, remote_path: &str, local_path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    // Check if remote path is a directory
    let metadata = sftp.metadata(remote_path).await
        .map_err(|e| SshError::ConnectionFailed(format!("stat failed: {}", e)))?;
    
    if metadata.file_type().is_dir() {
        return Err(SshError::ConnectionFailed("Cannot download a directory".to_string()));
    }

    // Open remote file for reading
    let mut remote_file = sftp.open(remote_path).await
        .map_err(|e| SshError::ConnectionFailed(format!("open remote file failed: {}", e)))?;

    // Create local file for writing
    let mut local_file = tokio::fs::File::create(local_path).await
        .map_err(|e| SshError::Io(e))?;

    // Stream copy
    tokio::io::copy(&mut remote_file, &mut local_file).await
        .map_err(|e| SshError::Io(e))?;

    Ok(())
}

async fn handle_sftp_download_dir(conn: &SshConnection, remote_path: &str, local_path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    // Check if remote path is a directory
    let metadata = sftp.metadata(remote_path).await
        .map_err(|e| SshError::ConnectionFailed(format!("stat failed: {}", e)))?;
    
    if !metadata.file_type().is_dir() {
        return Err(SshError::ConnectionFailed("Not a directory".to_string()));
    }

    // Stack for iterative traversal: (remote_current_path, local_current_path)
    let mut stack = vec![(remote_path.to_string(), local_path.to_string())];

    while let Some((curr_remote, curr_local)) = stack.pop() {
        // Create local directory
        tokio::fs::create_dir_all(&curr_local).await.map_err(|e| SshError::Io(e))?;

        // Read remote directory
        let entries = sftp.read_dir(&curr_remote).await
            .map_err(|e| SshError::ConnectionFailed(format!("read_dir failed: {}", e)))?;

        for entry in entries {
            let filename = entry.file_name();
            if filename == "." || filename == ".." {
                continue;
            }

            // Construct paths
            // Note: remote is usually unix-like ('/'), but we should be careful. 
            // Russh-sftp treats paths as strings. 
            // We assume standard '/' separator for remote.
            let next_remote = if curr_remote.ends_with('/') {
                format!("{}{}", curr_remote, filename)
            } else {
                format!("{}/{}", curr_remote, filename)
            };

            let next_local = std::path::Path::new(&curr_local).join(&filename);
            let next_local_str = next_local.to_string_lossy().to_string();

            if entry.file_type().is_dir() {
                // Push to stack for later processing
                stack.push((next_remote, next_local_str));
            } else {
                // Download file directly
                let mut remote_file = sftp.open(&next_remote).await
                    .map_err(|e| SshError::ConnectionFailed(format!("open remote file failed: {}", e)))?;

                let mut local_file = tokio::fs::File::create(&next_local).await
                    .map_err(|e| SshError::Io(e))?;

                tokio::io::copy(&mut remote_file, &mut local_file).await
                    .map_err(|e| SshError::Io(e))?;
            }
        }
    }

    Ok(())
}

async fn handle_sftp_upload_file(conn: &SshConnection, local_path: &str, remote_path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    // Open local file for reading
    let mut local_file = tokio::fs::File::open(local_path).await
        .map_err(|e| SshError::Io(e))?;

    // Open remote file for writing (create or truncate)
    let mut remote_file = sftp.create(remote_path).await
        .map_err(|e| SshError::ConnectionFailed(format!("create remote file failed: {}", e)))?;

    // Stream copy
    tokio::io::copy(&mut local_file, &mut remote_file).await
        .map_err(|e| SshError::Io(e))?;

    Ok(())
}

async fn handle_sftp_get_home_dir(conn: &SshConnection) -> Result<String> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SFTP session not initialized".to_string()))?;

    // 获取 "." 的绝对路径，即为当前用户目录
    let path = sftp
        .canonicalize(".")
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("Failed to get home dir: {}", e)))?;
    
    // canonicalize 返回的是 String
    Ok(path)
}

async fn handle_get_system_usage(conn: &SshConnection) -> Result<crate::monitor::SystemUsage> {
    let session = conn
        .session
        .as_ref()
        .ok_or_else(|| SshError::ConnectionFailed("SSH session not established".to_string()))?;

    crate::monitor::get_remote_system_usage(session).await
}
