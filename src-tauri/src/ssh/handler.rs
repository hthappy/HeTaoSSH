use crate::error::{Result, SshError};
use log::{error, info};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request PTY with xterm-256color for better scrollback support
        // Use minimal terminal modes to avoid conflicts with docker logs and other programs
        // Only set what's absolutely necessary for Ctrl+C to work
        
        use russh::Pty;
        
        // Build terminal modes array - MINIMAL configuration
        let terminal_modes = vec![
            // Control characters - only the essential ones
            (Pty::VINTR, 3),      // Ctrl+C = ASCII 3 (Interrupt)
            (Pty::VEOF, 4),       // Ctrl+D = ASCII 4 (EOF)
            (Pty::VSUSP, 26),     // Ctrl+Z = ASCII 26 (Suspend)
            
            // CRITICAL: Enable signal processing for Ctrl+C
            (Pty::ISIG, 1),       // Enable signals
            
            // Use default for everything else - let the remote system decide
            // This matches what local terminal does (no explicit mode setting)
        ];
        
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &terminal_modes)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        channel
            .request_shell(false)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        info!("SSH channel (shell) opened successfully");

        // Convert the channel into an AsyncRead/AsyncWrite stream
        let stream = channel.into_stream();
        let (mut read_half, mut write_half) = tokio::io::split(stream);

        // Setup channels for data flow
        // CRITICAL: Large buffer to prevent blocking when docker logs outputs rapidly
        // If buffer is too small (1024), it fills up quickly and blocks the reader
        // This causes docker logs to stop outputting
        let (output_tx, output_rx) = mpsc::channel(10240); // Increased from 1024 to 10240
        let (channel_tx, mut channel_rx) = mpsc::channel::<ChannelMessage>(1024);

        self.output_rx = Arc::new(Mutex::new(output_rx));
        self.channel_tx = Some(channel_tx);

        // Spawn reader task (Reads from SSH, sends to output_tx)
        tokio::spawn(async move {
            let mut buf = vec![0u8; 8192];
            loop {
                match read_half.read(&mut buf).await {
                    Ok(0) => {
                        info!("SSH channel reader EOF - connection closed");
                        break;
                    }
                    Ok(n) => {
                        if output_tx.send(buf[..n].to_vec()).await.is_err() {
                            error!("SSH channel reader: output channel closed");
                            break;
                        }
                    }
                    Err(e) => {
                        error!("SSH channel read error: {}", e);
                        break;
                    }
                }
            }
        });

        // Spawn writer task (Reads from channel_rx, writes to SSH stream)
        tokio::spawn(async move {
            while let Some(msg) = channel_rx.recv().await {
                match msg {
                    ChannelMessage::Data(data) => {
                        if let Err(e) = write_half.write_all(&data).await {
                            error!("SSH channel write error: {}", e);
                            break;
                        }
                        if let Err(e) = write_half.flush().await {
                            error!("SSH channel flush error: {}", e);
                            break;
                        }
                    }
                    ChannelMessage::Resize { cols: _, rows: _ } => {
                        // Resize is handled at a higher level in the connection manager
                    }
                    ChannelMessage::Disconnect => {
                        break;
                    }
                }
            }
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
            let _ = tx.send(ChannelMessage::Resize { cols, rows }).await;
        }
        Ok(())
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
