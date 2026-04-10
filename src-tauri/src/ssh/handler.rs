use crate::error::{Result, SshError};
use log::{error, info};
use russh::ChannelMsg;
use std::sync::Arc;
use tokio::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::Mutex;

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
                                if let Err(e) = channel.data(&data[..]).await {
                                    error!("SSH channel write error: {}", e);
                                    break;
                                }
                            }
                            Some(ChannelMessage::Resize { cols, rows }) => {
                                if let Err(e) = channel.window_change(cols, rows, 0, 0).await {
                                    error!("window_change failed: {}", e);
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
            
            let _ = channel.eof().await;
            let _ = channel.close().await;
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
