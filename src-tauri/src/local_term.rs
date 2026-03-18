use crate::error::Result;
use portable_pty::{Child, CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

struct TerminalSession {
    pair: PtyPair,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

pub struct LocalTerminalManager {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl Default for LocalTerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalTerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_terminal(
        &self,
        id: String,
        rows: u16,
        cols: u16,
        app_handle: AppHandle,
    ) -> Result<()> {
        let pty_system = NativePtySystem::default();

        let cmd = if cfg!(target_os = "windows") {
            let mut cmd = CommandBuilder::new("powershell");
            cmd.arg("-NoLogo");
            cmd
        } else {
            let shell = std::env::var("SHELL").unwrap_or("bash".into());
            CommandBuilder::new(shell)
        };

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;

        let id_clone = id.clone();

        // Spawn reader thread
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let data = buf[..n].to_vec();
                        // Send data to frontend
                        let _ = app_handle.emit(&format!("terminal-data-{}", id_clone), data);
                    }
                    Ok(_) => break, // EOF
                    Err(_) => break,
                }
            }
            // Cleanup when process exits
            let _ = app_handle.emit(&format!("terminal-exit-{}", id_clone), ());
        });

        self.sessions.lock().unwrap().insert(
            id,
            TerminalSession {
                pair,
                child,
                writer,
            },
        );
        Ok(())
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        if let Some(session) = self.sessions.lock().unwrap().get_mut(id) {
            session
                .writer
                .write_all(data)
                .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;
        }
        Ok(())
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<()> {
        if let Some(session) = self.sessions.lock().unwrap().get_mut(id) {
            session
                .pair
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| crate::error::SshError::Io(std::io::Error::other(e)))?;
        }
        Ok(())
    }

    pub fn close(&self, id: &str) {
        if let Some(mut session) = self.sessions.lock().unwrap().remove(id) {
            let _ = session.child.kill();
        }
    }
}
