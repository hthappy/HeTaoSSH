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

/// 前端可选的本地 Shell 信息
#[derive(Clone, serde::Serialize)]
pub struct LocalShell {
    /// shell 标识：powershell / pwsh / cmd / gitbash
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 是否可用（已安装）
    pub available: bool,
}

/// 常见 Git Bash 安装路径
const GIT_BASH_CANDIDATES: &[&str] = &[
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
];

/// 常见 PowerShell 7 安装路径
const PWSH_CANDIDATES: &[&str] = &["C:\\Program Files\\PowerShell\\7\\pwsh.exe"];

fn git_bash_path() -> Option<String> {
    for path in GIT_BASH_CANDIDATES {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // 用户目录安装（winget --scope user 等）
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = format!("{}\\Programs\\Git\\bin\\bash.exe", local);
        if std::path::Path::new(&p).exists() {
            return Some(p);
        }
    }
    None
}

fn pwsh_path() -> Option<String> {
    for path in PWSH_CANDIDATES {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // PATH 中存在 pwsh（例如 scoop 安装）
    let in_path = std::process::Command::new("where.exe")
        .arg("pwsh")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    in_path.then(|| "pwsh".to_string())
}

/// 列出当前系统可用的本地 Shell
pub fn available_shells() -> Vec<LocalShell> {
    if cfg!(target_os = "windows") {
        vec![
            LocalShell {
                id: "powershell".into(),
                name: "Windows PowerShell".into(),
                available: true,
            },
            LocalShell {
                id: "pwsh".into(),
                name: "PowerShell 7".into(),
                available: pwsh_path().is_some(),
            },
            LocalShell {
                id: "cmd".into(),
                name: "Command Prompt".into(),
                available: true,
            },
            LocalShell {
                id: "gitbash".into(),
                name: "Git Bash".into(),
                available: git_bash_path().is_some(),
            },
        ]
    } else {
        vec![LocalShell {
            id: "default".into(),
            name: "Default Shell".into(),
            available: true,
        }]
    }
}

/// 根据 shell 标识构建启动命令
fn shell_command(shell: Option<&str>) -> Result<CommandBuilder> {
    if cfg!(target_os = "windows") {
        match shell.unwrap_or("powershell") {
            "cmd" => Ok(CommandBuilder::new("cmd.exe")),
            "pwsh" => {
                let mut cmd = CommandBuilder::new(pwsh_path().unwrap_or_else(|| "pwsh".into()));
                cmd.arg("-NoLogo");
                Ok(cmd)
            }
            "gitbash" => {
                let path = git_bash_path().ok_or_else(|| {
                    crate::error::SshError::ConnectionFailed("Git Bash not found".to_string())
                })?;
                let mut cmd = CommandBuilder::new(path);
                // 以交互登录 shell 启动，加载 ~/.bash_profile
                cmd.arg("--login");
                cmd.arg("-i");
                Ok(cmd)
            }
            // 默认 Windows PowerShell
            _ => {
                let mut cmd = CommandBuilder::new("powershell");
                cmd.arg("-NoLogo");
                Ok(cmd)
            }
        }
    } else {
        let shell = std::env::var("SHELL").unwrap_or("bash".into());
        Ok(CommandBuilder::new(shell))
    }
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
        shell: Option<String>,
        app_handle: AppHandle,
    ) -> Result<()> {
        let pty_system = NativePtySystem::default();

        let cmd = shell_command(shell.as_deref())?;

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
