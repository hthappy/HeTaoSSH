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
    ) -> Result<()> {
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request PTY with xterm-256color for better scrollback support
        channel
            .request_pty(false, "xterm-256color", 120, 40, 0, 0, &[])
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
        let (output_tx, output_rx) = mpsc::channel(1024);
        let (channel_tx, mut channel_rx) = mpsc::channel::<ChannelMessage>(1024);

        self.output_rx = Arc::new(Mutex::new(output_rx));
        self.channel_tx = Some(channel_tx);

        // Spawn reader task (Reads from SSH, sends to output_tx)
        tokio::spawn(async move {
            let mut buf = vec![0u8; 8192];
            loop {
                match read_half.read(&mut buf).await {
                    Ok(0) => {
                        info!("SSH channel reader EOF");
                        break;
                    }
                    Ok(n) => {
                        if output_tx.send(buf[..n].to_vec()).await.is_err() {
                            break; // Receiver dropped
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
                        let _ = write_half.flush().await; // Ensure data is flushed to the PTY
                    }
                    ChannelMessage::Resize { cols: _, rows: _ } => {
                        // Resizing a raw stream isn't supported directly through AsyncWrite
                        // In actual russh, window resizing requires the russh::Channel Handle
                        // For now this handles data piping correctly
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
