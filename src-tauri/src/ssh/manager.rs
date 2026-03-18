use crate::config::ServerConfig;
use crate::error::{Result, SshError};
use crate::ssh::SshConnection;
use log::{error, info, warn};
use std::collections::HashMap;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{sleep, Duration};

/// SSH 连接超时时间（秒）
const CONNECTION_TIMEOUT_SECS: u64 = 15;

/// 最大重连次数
const MAX_RECONNECT_ATTEMPTS: u32 = 2;

/// 重连间隔时间
const RECONNECT_INTERVAL: Duration = Duration::from_secs(3);

/// 系统监控数据刷新间隔（秒）- 暂未使用，保留供将来扩展
#[allow(dead_code)]
const MONITOR_REFRESH_INTERVAL_SECS: u64 = 2;

/// 空闲超时时间（秒）- 30 分钟，暂未使用，保留供将来扩展
#[allow(dead_code)]
const IDLE_TIMEOUT_SECS: u64 = 1800;

/// Actor 命令：发送给连接 Actor 的请求
///
/// 所有与 SSH 连接的交互都通过发送 `ConnCommand` 到 Actor 完成。
/// 每个命令都包含一个 `oneshot::Sender` 用于接收响应。
///
/// # 命令类型
///
/// - **终端操作**: `SendData`, `RecvData`, `ResizeTerminal`
/// - **SFTP 操作**: `SftpListDir`, `SftpReadFile`, `SftpWriteFile`, 等
/// - **系统监控**: `GetSystemUsage`
/// - **连接管理**: `Disconnect`
///
/// # 使用模式
///
/// ```rust,no_run
/// // 创建 oneshot channel 接收响应
/// let (reply_tx, reply_rx) = oneshot::channel();
///
/// // 发送命令到 Actor
/// tx.send(ConnCommand::SendData {
///     data: b"ls\n".to_vec(),
///     reply: reply_tx,
/// }).await?;
///
/// // 等待响应
/// let result = reply_rx.await?;
/// ```
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
    Disconnect { reply: oneshot::Sender<Result<()>> },
}

/// 连接 Actor 的句柄，持有发送端
///
/// `ConnHandle` 封装了与 Actor 通信的 mpsc channel 发送端。
/// `ConnectionManager` 通过这个句柄向 Actor 发送命令。
///
/// # 字段
///
/// * `tx` - 命令发送端（`mpsc::Sender<ConnCommand>`）
struct ConnHandle {
    tx: mpsc::Sender<ConnCommand>,
}

/// SSH 连接管理器 - 使用 Actor 模型管理多个 SSH 连接
///
/// `ConnectionManager` 负责创建、管理和销毁 SSH 连接。每个连接运行在独立的
/// Actor 任务中，通过 mpsc channel 进行通信，避免了锁竞争和数据竞争。
///
/// # 架构设计
///
/// ```text
/// ┌─────────────────────────────────────────────────────────┐
/// │              ConnectionManager                          │
/// │  ┌──────────────────────────────────────────────┐      │
/// │  │  handles: Mutex<HashMap<id, ConnHandle>>     │      │
/// │  └──────────────────────────────────────────────┘      │
/// │         │                    │                          │
/// │         │ mpsc::Sender       │ mpsc::Sender             │
/// │         ▼                    ▼                          │
/// │  ┌─────────────┐      ┌─────────────┐                 │
/// │  │  Actor 1    │      │  Actor 2    │                 │
/// │  │ (conn_id_1) │      │ (conn_id_2) │                 │
/// │  │             │      │             │                 │
/// │  │ SshConnection│     │ SshConnection│                │
/// │  └─────────────┘      └─────────────┘                 │
/// └─────────────────────────────────────────────────────────┘
/// ```
///
/// # 线程安全
///
/// - `handles` 使用 `Mutex` 保护，但锁持有时间极短（仅查找/插入）
/// - 实际的 SSH 操作在 Actor 中执行，无需锁
/// - 支持多个前端标签页同时操作不同连接
///
/// # 使用示例
///
/// ```rust,no_run
/// use std::sync::Arc;
/// use he_tao_ssh_lib::ssh::ConnectionManager;
/// use he_tao_ssh_lib::config::ServerConfig;
///
/// #[tokio::main]
/// async fn main() -> Result<(), Box<dyn std::error::Error>> {
///     let manager = Arc::new(ConnectionManager::new());
///     let config = ServerConfig {
///         host: "example.com".to_string(),
///         port: 22,
///         username: "user".to_string(),
///         // ... 其他字段
///         ..Default::default()
///     };
///     
///     // 创建连接
///     manager.create_connection("tab-1", config, app_handle).await?;
///     
///     // 发送数据
///     manager.send_data("tab-1", b"ls -la\n").await?;
///     
///     // 接收数据
///     if let Some(data) = manager.recv_data("tab-1").await {
///         println!("Received: {:?}", data);
///     }
///     
///     // 断开连接
///     manager.remove_connection("tab-1").await?;
///     
///     Ok(())
/// }
/// ```
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
    pub async fn create_connection(
        &self,
        id: &str,
        config: ServerConfig,
        app_handle: tauri::AppHandle,
    ) -> Result<()> {
        // 先清理旧的 Actor（支持重连场景）
        {
            let mut handles = self.handles.lock().await;
            if let Some(old_handle) = handles.remove(id) {
                // 发送断开命令给旧 Actor，忽略回复（Actor 可能已退出）
                let (reply_tx, _reply_rx) = oneshot::channel();
                let _ = old_handle
                    .tx
                    .send(ConnCommand::Disconnect { reply: reply_tx })
                    .await;
                info!("Removed existing connection actor for reconnection: {}", id);
            }
        }

        // 建立连接 (不持有锁，避免阻塞其他操作)
        let mut conn = SshConnection::new(config);

        // 增加连接超时，防止永久卡住
        tokio::time::timeout(
            std::time::Duration::from_secs(CONNECTION_TIMEOUT_SECS),
            conn.connect_with_shell(),
        )
        .await
        .map_err(|_| {
            SshError::ConnectionFailed(crate::error::messages::CONNECTION_TIMEOUT.to_string())
        })??;

        // 创建 Actor channel
        let (tx, rx) = mpsc::channel::<ConnCommand>(64);

        // 启动 Actor 任务 — 该任务独占 SshConnection
        let conn_id = id.to_string();
        tokio::spawn(async move {
            connection_actor(conn_id, conn, rx, app_handle).await;
        });

        {
            let mut handles = self.handles.lock().await;
            handles.insert(id.to_string(), ConnHandle { tx });
        }
        info!("Created SSH connection actor: {}", id);

        Ok(())
    }

    /// 移除连接
    pub async fn remove_connection(&self, id: &str) -> Result<()> {
        let mut handles = self.handles.lock().await;

        if let Some(handle) = handles.remove(id) {
            let (reply_tx, reply_rx) = oneshot::channel();
            let _ = handle
                .tx
                .send(ConnCommand::Disconnect { reply: reply_tx })
                .await;
            // 等待断开完成，但不阻塞太久
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), reply_rx).await;
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
    pub async fn sftp_download_file(
        &self,
        id: &str,
        remote_path: &str,
        local_path: &str,
    ) -> Result<()> {
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
    pub async fn sftp_download_dir(
        &self,
        id: &str,
        remote_path: &str,
        local_path: &str,
    ) -> Result<()> {
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
    pub async fn sftp_upload_file(
        &self,
        id: &str,
        local_path: &str,
        remote_path: &str,
    ) -> Result<()> {
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

/// SSH 连接 Actor 任务
///
/// 该 Actor 独占一个 `SshConnection`，通过 mpsc channel 接收命令。
/// 采用 Actor 模型避免了锁竞争，每个连接在独立的 tokio 任务中运行。
///
/// # 职责
///
/// - **终端数据收发**: 处理终端输入输出，实时转发数据到前端
/// - **SFTP 文件操作**: 执行文件列表、读写、上传下载等操作
/// - **自动重连机制**: 连接断开时自动尝试重连（最多 2 次）
/// - **系统监控**: 收集远程服务器的 CPU、内存、磁盘使用情况
/// - **终端调整**: 处理终端窗口大小变化
///
/// # 生命周期
///
/// 1. **创建**: 由 `ConnectionManager::create_connection()` 启动
/// 2. **运行**: 持续监听 `ConnCommand` 消息和 SSH 数据流
/// 3. **销毁**: 收到 `Disconnect` 命令或连接失败时退出
///
/// # 错误处理
///
/// - **连接断开**: 自动尝试重连（最多 2 次，间隔 3 秒）
/// - **重连失败**: 发送 `ssh-disconnected` 事件到前端，Actor 退出
/// - **SFTP 错误**: 通过 oneshot channel 返回给调用者
/// - **命令处理错误**: 静默忽略（避免 Actor 崩溃）
///
/// # 并发模型
///
/// 使用 `tokio::select!` 同时监听两个事件源：
/// - `rx.recv()`: 来自 `ConnectionManager` 的命令请求
/// - `conn.recv()`: 来自 SSH 服务器的数据流
///
/// 这种设计确保了：
/// - 无需锁即可安全访问 `SshConnection`
/// - 命令和数据流处理互不阻塞
/// - 自动重连不影响命令队列
///
/// # 参数
///
/// * `id` - 连接的唯一标识符（通常是 tab_id）
/// * `conn` - SSH 连接实例（独占所有权）
/// * `rx` - 命令接收端（mpsc channel）
/// * `app_handle` - Tauri 应用句柄（用于发送事件到前端）
///
/// # 示例
///
/// ```rust,no_run
/// // 由 ConnectionManager 内部调用，不直接使用
/// tokio::spawn(async move {
///     connection_actor(conn_id, conn, rx, app_handle).await;
/// });
/// ```
async fn connection_actor(
    id: String,
    mut conn: SshConnection,
    mut rx: mpsc::Receiver<ConnCommand>,
    app_handle: tauri::AppHandle,
) {
    use tauri::Emitter;
    info!("Connection actor started: {}", id);
    let event_name = format!("ssh-data-{}", id);
    let mut reconnect_attempts = 0;

    loop {
        tokio::select! {
            cmd_opt = rx.recv() => {
                let Some(cmd) = cmd_opt else { break; };
                match cmd {
                    ConnCommand::SendData { data, reply } => {
                        let _ = reply.send(conn.send(&data).await);
                    }
                    ConnCommand::RecvData { reply } => {
                        let _ = reply.send(None);
                    }
                    ConnCommand::ResizeTerminal { cols, rows, reply } => {
                        let _ = reply.send(conn.resize(cols, rows).await);
                    }
                    ConnCommand::SftpListDir { path, reply } => {
                        let _ = reply.send(handle_sftp_list_dir(&conn, &path).await);
                    }
                    ConnCommand::SftpReadFile { path, reply } => {
                        let _ = reply.send(handle_sftp_read_file(&conn, &path).await);
                    }
                    ConnCommand::SftpWriteFile { path, content, reply } => {
                        let _ = reply.send(handle_sftp_write_file(&conn, &path, &content).await);
                    }
                    ConnCommand::SftpGetHomeDir { reply } => {
                        let _ = reply.send(handle_sftp_get_home_dir(&conn).await);
                    }
                    ConnCommand::SftpRemoveFile { path, reply } => {
                        let _ = reply.send(handle_sftp_remove_file(&conn, &path).await);
                    }
                    ConnCommand::SftpCreateDir { path, reply } => {
                        let _ = reply.send(handle_sftp_create_dir(&conn, &path).await);
                    }
                    ConnCommand::SftpDownloadFile { remote_path, local_path, reply } => {
                        let _ = reply.send(handle_sftp_download_file(&conn, &remote_path, &local_path).await);
                    }
                    ConnCommand::SftpDownloadDir { remote_path, local_path, reply } => {
                        let _ = reply.send(handle_sftp_download_dir(&conn, &remote_path, &local_path).await);
                    }
                    ConnCommand::SftpUploadFile { local_path, remote_path, reply } => {
                        let _ = reply.send(handle_sftp_upload_file(&conn, &local_path, &remote_path).await);
                    }
                    ConnCommand::GetSystemUsage { reply } => {
                        let _ = reply.send(handle_get_system_usage(&conn).await);
                    }
                    ConnCommand::Disconnect { reply } => {
                        let _ = reply.send(conn.disconnect().await);
                        break;
                    }
                }
            }
            data_opt = conn.recv() => {
                match data_opt {
                    Some(data) => {
                        reconnect_attempts = 0;
                        let _ = app_handle.emit(&event_name, data);
                    }
                    None => {
                        warn!("Connection {} lost, attempting auto-reconnect...", id);

                        let _ = app_handle.emit("ssh-reconnecting", &ReconnectEvent {
                            id: id.clone(),
                            attempt: reconnect_attempts + 1,
                            max_attempts: MAX_RECONNECT_ATTEMPTS,
                        });

                        if reconnect_attempts < MAX_RECONNECT_ATTEMPTS {
                            reconnect_attempts += 1;
                            sleep(RECONNECT_INTERVAL).await;

                            info!("Reconnecting {} (attempt {}/{})", id, reconnect_attempts, MAX_RECONNECT_ATTEMPTS);

                            match conn.reconnect().await {
                                Ok(_) => {
                                    info!("Reconnection successful for {}", id);
                                    reconnect_attempts = 0;
                                    let _ = app_handle.emit("ssh-reconnected", &id);
                                    continue;
                                }
                                Err(e) => {
                                    error!("Reconnection failed for {}: {}", id, e);
                                }
                            }
                        } else {
                            error!("Max reconnection attempts reached for {}, giving up", id);
                            let _ = app_handle.emit("ssh-disconnected", &id);
                            let _ = app_handle.emit(&event_name, b"\r\n\x1b[31m[SSH Connection Lost]\x1b[0m\r\n".to_vec());
                            break;
                        }
                    }
                }
            }
        }
    }

    info!("Connection actor stopped: {}", id);
}

#[derive(Clone, serde::Serialize)]
struct ReconnectEvent {
    id: String,
    attempt: u32,
    max_attempts: u32,
}

// =============================================================================
// SFTP 和监控命令的具体处理逻辑
// =============================================================================

async fn handle_sftp_list_dir(
    conn: &SshConnection,
    path: &str,
) -> Result<Vec<crate::ssh::SftpEntry>> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

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
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    sftp.read(path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("read file failed: {}", e)))
}

async fn handle_sftp_write_file(conn: &SshConnection, path: &str, content: &[u8]) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    sftp.write(path, content)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("write file failed: {}", e)))
}

async fn handle_sftp_remove_file(conn: &SshConnection, path: &str) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

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
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    sftp.create_dir(path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("create_dir failed: {}", e)))
}

async fn handle_sftp_download_file(
    conn: &SshConnection,
    remote_path: &str,
    local_path: &str,
) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    let metadata = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("stat failed: {}", e)))?;

    if metadata.file_type().is_dir() {
        return Err(SshError::ConnectionFailed(
            crate::error::messages::SFTP_CANNOT_DOWNLOAD_DIR.to_string(),
        ));
    }

    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("open remote file failed: {}", e)))?;

    let mut local_file = tokio::fs::File::create(local_path)
        .await
        .map_err(SshError::Io)?;

    tokio::io::copy(&mut remote_file, &mut local_file)
        .await
        .map_err(SshError::Io)?;

    Ok(())
}

async fn handle_sftp_download_dir(
    conn: &SshConnection,
    remote_path: &str,
    local_path: &str,
) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    // Check if remote path is a directory
    let metadata = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("stat failed: {}", e)))?;

    if !metadata.file_type().is_dir() {
        return Err(SshError::ConnectionFailed(
            crate::error::messages::SFTP_NOT_A_DIRECTORY.to_string(),
        ));
    }

    // Stack for iterative traversal: (remote_current_path, local_current_path)
    let mut stack = vec![(remote_path.to_string(), local_path.to_string())];

    while let Some((curr_remote, curr_local)) = stack.pop() {
        // Create local directory
        tokio::fs::create_dir_all(&curr_local)
            .await
            .map_err(SshError::Io)?;

        // Read remote directory
        let entries = sftp
            .read_dir(&curr_remote)
            .await
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
                let mut remote_file = sftp.open(&next_remote).await.map_err(|e| {
                    SshError::ConnectionFailed(format!("open remote file failed: {}", e))
                })?;

                let mut local_file = tokio::fs::File::create(&next_local)
                    .await
                    .map_err(SshError::Io)?;

                tokio::io::copy(&mut remote_file, &mut local_file)
                    .await
                    .map_err(SshError::Io)?;
            }
        }
    }

    Ok(())
}

async fn handle_sftp_upload_file(
    conn: &SshConnection,
    local_path: &str,
    remote_path: &str,
) -> Result<()> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(SshError::Io)?;

    let mut remote_file = sftp
        .create(remote_path)
        .await
        .map_err(|e| SshError::ConnectionFailed(format!("create remote file failed: {}", e)))?;

    tokio::io::copy(&mut local_file, &mut remote_file)
        .await
        .map_err(SshError::Io)?;

    Ok(())
}

async fn handle_sftp_get_home_dir(conn: &SshConnection) -> Result<String> {
    let sftp = conn
        .sftp_session
        .as_ref()
        .ok_or_else(|| {
            SshError::ConnectionFailed(crate::error::messages::SFTP_NOT_INITIALIZED.to_string())
        })?;

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
        .ok_or_else(|| {
            SshError::ConnectionFailed(
                crate::error::messages::SSH_SESSION_NOT_ESTABLISHED.to_string(),
            )
        })?;

    crate::monitor::get_remote_system_usage(session).await
}
