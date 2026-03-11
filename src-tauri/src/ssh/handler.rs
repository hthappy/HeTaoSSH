use crate::error::{Result, SshError};
use log::info;
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
        let (_output_tx, output_rx): (Sender<Vec<u8>>, Receiver<Vec<u8>>) = mpsc::channel(100);
        Self {
            channel_tx: None,
            output_rx: Arc::new(Mutex::new(output_rx)),
        }
    }

    #[allow(clippy::unnecessary_mut)]
    pub async fn init_channel(
        &mut self,
        session: &mut russh::client::Handle<crate::ssh::connection::ClientHandler>,
    ) -> Result<()> {
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        channel
            .request_shell(false)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        info!("SSH channel opened successfully");

        let (channel_tx, _channel_rx): (Sender<ChannelMessage>, Receiver<ChannelMessage>) =
            mpsc::channel(100);
        self.channel_tx = Some(channel_tx);

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

    pub async fn resize(&self, _cols: u32, _rows: u32) -> Result<()> {
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<()> {
        Ok(())
    }
}

impl Default for SshChannelHandler {
    fn default() -> Self {
        Self::new()
    }
}
