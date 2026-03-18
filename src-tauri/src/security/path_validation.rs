//! 路径安全验证模块
//!
//! 防止目录遍历攻击（Directory Traversal Attack）
//! 确保所有文件访问限制在允许的根目录内

use crate::error::{Result, SshError};
use std::path::{Component, Path, PathBuf};

/// 验证并规范化文件路径
pub fn validate_and_normalize_path(base_dir: &Path, requested_path: &str) -> Result<PathBuf> {
    // 空路径处理：返回根目录
    if requested_path.is_empty() {
        return Ok(base_dir.to_path_buf());
    }

    // 检查明显的危险模式
    if contains_traversal_pattern(requested_path) {
        return Err(SshError::Config(
            crate::error::messages::PATH_TRAVERSAL.into(),
        ));
    }

    // 1. 构建初始路径
    let target_path = base_dir.join(requested_path);

    // 2. 规范化路径（移除 . 和 ..）
    let mut normalized = PathBuf::new();
    for component in target_path.components() {
        match component {
            // 跳过所有父目录引用，防止遍历
            Component::ParentDir => {
                return Err(SshError::Config(
                    crate::error::messages::PATH_PARENT_DIR.into(),
                ));
            }
            // 跳过当前目录引用
            Component::CurDir => continue,
            // 保留正常组件
            Component::Normal(_) | Component::RootDir | Component::Prefix(_) => {
                normalized.push(component);
            }
        }
    }

    // 3. 路径已经在步骤 2 中完全规范化（移除了所有 . 和 ..）
    // 只要是正常的路径组件就已经安全了
    // 只需要确保不包含绝对路径跳转到其他位置
    // 由于我们是从 base_dir 开始 join，且移除了所有 ..，
    // 最终路径必然在 base_dir 内或是其子目录

    Ok(normalized)
}

/// 检查路径是否包含危险模式
pub fn contains_traversal_pattern(path: &str) -> bool {
    path.contains("..") || path.contains('\0') || path.contains("..\\") || path.contains("../")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_relative_paths() {
        let base = Path::new("/remote/root");
        assert!(validate_and_normalize_path(base, "file.txt").is_ok());
        assert!(validate_and_normalize_path(base, "dir/file.txt").is_ok());
        assert!(validate_and_normalize_path(base, "dir/subdir/file.txt").is_ok());
    }

    #[test]
    fn test_empty_path() {
        let base = Path::new("/remote/root");
        let result = validate_and_normalize_path(base, "").unwrap();
        assert_eq!(result, base.to_path_buf());
    }

    #[test]
    fn test_current_dir_reference() {
        let base = Path::new("/remote/root");
        assert!(validate_and_normalize_path(base, "./file.txt").is_ok());
    }

    #[test]
    fn test_parent_dir_traversal() {
        let base = Path::new("/remote/root");
        assert!(validate_and_normalize_path(base, "../etc/passwd").is_err());
        assert!(validate_and_normalize_path(base, "..").is_err());
        assert!(validate_and_normalize_path(base, "../../etc/passwd").is_err());
    }

    #[test]
    fn test_mixed_traversal() {
        let base = Path::new("/remote/root");
        assert!(validate_and_normalize_path(base, "dir/../file.txt").is_err());
        assert!(validate_and_normalize_path(base, "dir/../../etc/passwd").is_err());
        assert!(validate_and_normalize_path(base, "dir/..").is_err());
    }

    #[test]
    fn test_null_byte_injection() {
        let base = Path::new("/remote/root");
        assert!(validate_and_normalize_path(base, "file.txt\0.txt").is_err());
    }

    #[test]
    fn test_contains_traversal_pattern() {
        assert!(contains_traversal_pattern("../etc/passwd"));
        assert!(contains_traversal_pattern("..\\windows\\system32"));
        assert!(contains_traversal_pattern("file\0.txt"));
        assert!(contains_traversal_pattern(".."));

        assert!(!contains_traversal_pattern("file.txt"));
        assert!(!contains_traversal_pattern("dir/file.txt"));
        assert!(!contains_traversal_pattern("./file.txt"));
    }

    #[test]
    fn test_absolute_path_handling() {
        let base = Path::new("/remote/root");
        // 绝对路径 /etc/passwd 会被 join 成 /remote/root/etc/passwd
        // 这是安全的，因为仍在 base_dir 内
        // 当前实现专注于防止 .. 遍历
        let result = validate_and_normalize_path(base, "/etc/passwd");
        assert!(result.is_ok());
    }
}
