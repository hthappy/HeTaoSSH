use thiserror::Error;

/// 错误消息常量模块
///
/// 统一管理所有错误消息，便于维护和国际化
pub mod messages {
    // 路径安全错误
    pub const PATH_TRAVERSAL: &str = "Path traversal detected: suspicious pattern in path";
    pub const PATH_PARENT_DIR: &str =
        "Path traversal detected: parent directory access is not allowed";

    // 连接错误
    pub const CONNECTION_TIMEOUT: &str = "Connection timed out";
    pub const CONNECTION_FAILED: &str = "Failed to establish SSH connection";
    pub const AUTH_FAILED: &str = "Authentication failed: invalid credentials";
    pub const ALL_AUTH_METHODS_FAILED: &str = "All authentication methods failed";
    pub const SESSION_NOT_ESTABLISHED: &str = "Session not established";

    // SFTP 错误
    pub const SFTP_NOT_INITIALIZED: &str = "SFTP session not initialized";
    pub const SFTP_FILE_NOT_FOUND: &str = "File or directory not found";
    pub const SFTP_PERMISSION_DENIED: &str = "Permission denied";
    pub const SFTP_NOT_A_DIRECTORY: &str = "Not a directory";
    pub const SFTP_CANNOT_DOWNLOAD_DIR: &str = "Cannot download a directory";
    pub const SSH_SESSION_NOT_ESTABLISHED: &str = "SSH session not established";

    // 加密错误
    pub const ENCRYPTION_FAILED: &str = "Failed to encrypt data";
    pub const DECRYPTION_FAILED: &str = "Failed to decrypt data: password may be corrupted";
    pub const KEYRING_ACCESS_FAILED: &str = "Failed to access system keyring";
    pub const INVALID_MASTER_KEY_FORMAT: &str = "Invalid master key format in keyring";
    pub const INVALID_MASTER_KEY_LENGTH: &str = "Invalid master key length in keyring";
    pub const INVALID_ENCRYPTED_DATA: &str = "Invalid encrypted data";

    // 配置错误
    pub const INVALID_CONFIG: &str = "Invalid server configuration";
    pub const DATABASE_ERROR: &str = "Database operation failed";
    pub const FAILED_TO_CREATE_DIR: &str = "Failed to create database directory";
}

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication error: {0}")]
    AuthFailed(String),

    #[error("IO error")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Channel error: {0}")]
    Channel(String),
}

pub type Result<T> = std::result::Result<T, SshError>;

impl serde::Serialize for SshError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
