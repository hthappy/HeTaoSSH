use crate::error::{Result, SshError};
use log::{error, info};
use russh::ChannelMsg;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::Mutex;

/// 写入 SSH 通道的超时时间
///
/// 连接半开（对端静默丢包）时，`channel.data()` 会无限等待 window adjust。
/// 超时后退出 I/O 任务，上层 Actor 会因输出流结束而进入断线重连流程。
const CHANNEL_WRITE_TIMEOUT: Duration = Duration::from_secs(10);

/// 调整窗口/关闭通道等控制操作的超时时间
const CHANNEL_CTRL_TIMEOUT: Duration = Duration::from_secs(5);

pub enum ChannelMessage {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Disconnect,
}

pub struct SshChannelHandler {
    channel_tx: Option<Sender<ChannelMessage>>,
    output_rx: Arc<Mutex<Receiver<Vec<u8>>>>,
}

impl SshChannelHandler {
    pub fn new() -> Self {
        let (_output_tx, output_rx) = mpsc::channel(100);
        Self {
            channel_tx: None,
            output_rx: Arc::new(Mutex::new(output_rx)),
        }
    }

    pub async fn init_channel(
        &mut self,
        session: &mut russh::client::Handle<crate::ssh::connection::ClientHandler>,
        cols: u32,
        rows: u32,
    ) -> Result<()> {
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request PTY with xterm-256color for better scrollback support
        use russh::Pty;
        
        let terminal_modes = vec![
            (Pty::VINTR, 3),      // Ctrl+C
            (Pty::VEOF, 4),       // Ctrl+D
            (Pty::VSUSP, 26),     // Ctrl+Z
            (Pty::ISIG, 1),       // Enable signals
        ];
        
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &terminal_modes)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        channel
            .request_shell(false)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        info!("SSH channel (shell) opened successfully with {}×{}", cols, rows);

        // Setup channels for data flow
        let (output_tx, output_rx) = mpsc::channel(10240);
        let (channel_tx, mut channel_rx) = mpsc::channel::<ChannelMessage>(1024);

        self.output_rx = Arc::new(Mutex::new(output_rx));
        self.channel_tx = Some(channel_tx);

        // Spawn task to handle channel I/O and resize
        tokio::spawn(async move {
            let _buf = vec![0u8; 8192]; // Reserved for future use

            loop {
                tokio::select! {
                    // Handle incoming messages from frontend
                    msg = channel_rx.recv() => {
                        match msg {
                            Some(ChannelMessage::Data(data)) => {
                                match tokio::time::timeout(CHANNEL_WRITE_TIMEOUT, channel.data(&data[..])).await {
                                    Ok(Ok(_)) => {}
                                    Ok(Err(e)) => {
                                        error!("SSH channel write error: {}", e);
                                        break;
                                    }
                                    Err(_) => {
                                        error!("SSH channel write timed out after {:?} (connection likely dead)", CHANNEL_WRITE_TIMEOUT);
                                        break;
                                    }
                                }
                            }
                            Some(ChannelMessage::Resize { cols, rows }) => {
                                match tokio::time::timeout(CHANNEL_CTRL_TIMEOUT, channel.window_change(cols, rows, 0, 0)).await {
                                    Ok(Ok(_)) => {}
                                    Ok(Err(e)) => {
                                        error!("window_change failed: {}", e);
                                    }
                                    Err(_) => {
                                        // window_change 挂起说明连接已死，继续留着只会阻塞后续输入
                                        error!("window_change timed out after {:?} (connection likely dead)", CHANNEL_CTRL_TIMEOUT);
                                        break;
                                    }
                                }
                            }
                            Some(ChannelMessage::Disconnect) | None => {
                                break;
                            }
                        }
                    }

                    // Handle incoming data from SSH
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                if output_tx.send(data.to_vec()).await.is_err() {
                                    error!("SSH channel reader: output channel closed");
                                    break;
                                }
                            }
                            Some(ChannelMsg::Eof) | None => {
                                info!("SSH channel EOF");
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }

            // 关闭也加超时，避免在死连接上永久挂起
            let _ = tokio::time::timeout(CHANNEL_CTRL_TIMEOUT, channel.eof()).await;
            let _ = tokio::time::timeout(CHANNEL_CTRL_TIMEOUT, channel.close()).await;
        });

        Ok(())
    }

    pub async fn send_data(&self, data: &[u8]) -> Result<()> {
        if let Some(tx) = &self.channel_tx {
            tx.send(ChannelMessage::Data(data.to_vec()))
                .await
                .map_err(|e| SshError::Channel(e.to_string()))?;
            Ok(())
        } else {
            Err(SshError::Channel("Channel not initialized".to_string()))
        }
    }

    pub async fn recv_data(&self) -> Option<Vec<u8>> {
        self.output_rx.lock().await.recv().await
    }

    /// 非阻塞地尝试接收输出数据（用于批量聚合已积压的输出）
    pub fn try_recv_data(&self) -> Option<Vec<u8>> {
        let mut guard = self.output_rx.try_lock().ok()?;
        guard.try_recv().ok()
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> Result<()> {
        if let Some(tx) = &self.channel_tx {
            tx.send(ChannelMessage::Resize { cols, rows })
                .await
                .map_err(|e| SshError::Channel(e.to_string()))?;
            Ok(())
        } else {
            Err(SshError::Channel("Channel not initialized".to_string()))
        }
    }

    pub async fn disconnect(&self) -> Result<()> {
        if let Some(tx) = &self.channel_tx {
            let _ = tx.send(ChannelMessage::Disconnect).await;
        }
        Ok(())
    }
}

impl Default for SshChannelHandler {
    fn default() -> Self {
        Self::new()
    }
}
