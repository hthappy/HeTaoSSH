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
