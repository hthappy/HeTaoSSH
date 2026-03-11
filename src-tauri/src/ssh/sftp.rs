use crate::error::Result;
use log::info;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SftpEntry {
    pub filename: String,
    pub longname: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
}

pub struct SftpClient {
    // SFTP client implementation - placeholder for Phase 3
}

impl SftpClient {
    pub fn new() -> Result<Self> {
        info!("SFTP client initialized (placeholder)");
        Ok(Self {})
    }

    pub async fn list_dir(&self, path: &str) -> Result<Vec<SftpEntry>> {
        // Placeholder - will be implemented with russh-sftp
        info!("List dir: {}", path);
        Ok(vec![
            SftpEntry {
                filename: "example.txt".to_string(),
                longname: "example.txt".to_string(),
                is_dir: false,
                is_file: true,
                size: 1024,
            },
            SftpEntry {
                filename: "documents".to_string(),
                longname: "documents".to_string(),
                is_dir: true,
                is_file: false,
                size: 0,
            },
        ])
    }

    pub async fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        info!("Read file: {}", path);
        Ok(b"File content placeholder".to_vec())
    }

    pub async fn write_file(&self, path: &str, content: &[u8]) -> Result<()> {
        info!("Write file: {} ({} bytes)", path, content.len());
        Ok(())
    }

    pub async fn remove_file(&self, path: &str) -> Result<()> {
        info!("Remove file: {}", path);
        Ok(())
    }

    pub async fn create_dir(&self, path: &str) -> Result<()> {
        info!("Create dir: {}", path);
        Ok(())
    }

    pub async fn remove_dir(&self, path: &str) -> Result<()> {
        info!("Remove dir: {}", path);
        Ok(())
    }

    pub async fn rename(&self, old_path: &str, new_path: &str) -> Result<()> {
        info!("Rename: {} -> {}", old_path, new_path);
        Ok(())
    }
}
