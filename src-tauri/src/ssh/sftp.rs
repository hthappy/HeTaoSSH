/// SFTP 文件条目结构体
#[derive(Debug, Clone, serde::Serialize)]
pub struct SftpEntry {
    pub filename: String,
    pub longname: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
}
