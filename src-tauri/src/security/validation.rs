//! 统一的路径验证模块
//!
//! 提供统一的 SFTP 路径验证函数，供所有 SFTP 命令使用

use crate::error::{Result, SshError};
use crate::security::path_validation::contains_traversal_pattern;

/// 统一的 SFTP 路径验证函数
///
/// 在所有 SFTP 操作前调用,防止路径遍历攻击
///
/// # Arguments
///
/// * `path` - 要验证的路径字符串
///
/// # Returns
///
/// * `Ok(())` - 路径安全，可以继续操作
/// * `Err(SshError::Config)` - 路径包含危险模式，操作被拒绝
///
/// # Examples
///
/// ```
/// # use he_tao_ssh_lib::security::validation::validate_sftp_path;
/// // 安全路径
/// assert!(validate_sftp_path("file.txt").is_ok());
/// assert!(validate_sftp_path("dir/file.txt").is_ok());
///
/// // 危险路径
/// assert!(validate_sftp_path("../etc/passwd").is_err());
/// assert!(validate_sftp_path("file\0.txt").is_err());
/// ```
pub fn validate_sftp_path(path: &str) -> Result<()> {
    if contains_traversal_pattern(path) {
        return Err(SshError::Config(
            crate::error::messages::PATH_TRAVERSAL.into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_paths() {
        // 安全的相对路径
        assert!(validate_sftp_path("file.txt").is_ok());
        assert!(validate_sftp_path("dir/file.txt").is_ok());
        assert!(validate_sftp_path("dir/subdir/file.txt").is_ok());
        assert!(validate_sftp_path("./file.txt").is_ok());
        assert!(validate_sftp_path("").is_ok());
    }

    #[test]
    fn test_validate_dangerous_paths() {
        // 父目录遍历
        assert!(validate_sftp_path("../etc/passwd").is_err());
        assert!(validate_sftp_path("..").is_err());
        assert!(validate_sftp_path("../../etc/passwd").is_err());
        assert!(validate_sftp_path("dir/../file").is_err());
        assert!(validate_sftp_path("dir/../../etc/passwd").is_err());

        // Windows 风格遍历
        assert!(validate_sftp_path("..\\windows\\system32").is_err());

        // Null 字节注入
        assert!(validate_sftp_path("file\0.txt").is_err());
        assert!(validate_sftp_path("file.txt\0").is_err());
    }

    #[test]
    fn test_error_message_consistency() {
        // 验证所有危险路径返回相同的错误消息
        let paths = vec!["../etc/passwd", "file\0.txt", "dir/../file"];

        for path in paths {
            let result = validate_sftp_path(path);
            assert!(result.is_err());

            let err = result.unwrap_err();
            let err_msg = err.to_string();
            assert!(
                err_msg.contains("Path traversal detected"),
                "Error message should be consistent: {}",
                err_msg
            );
        }
    }
}
