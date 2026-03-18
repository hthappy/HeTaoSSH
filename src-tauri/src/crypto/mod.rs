//! 加密管理模块
//!
//! 提供 AES-256-GCM 加密服务，用于保护敏感数据（如密码、私钥）。
//! 主密钥存储在系统 Keyring 中，确保安全性。
//!
//! # 安全特性
//!
//! - **AES-256-GCM**: 使用 256 位密钥的 Galois/Counter Mode 加密
//! - **随机 Nonce**: 每次加密使用新的 12 字节随机 nonce
//! - **主密钥保护**: 主密钥存储在系统 Keyring（Windows Credential Manager）
//! - **内存清零**: 密钥在 Drop 时自动清零（使用 zeroize crate）
//!
//! # 使用示例
//!
//! ```rust,no_run
//! use he_tao_ssh_lib::crypto::CryptoManager;
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let crypto = CryptoManager::new()?;
//!
//! // 加密密码
//! let encrypted = crypto.encrypt("my_secret_password")?;
//! println!("Encrypted: {}", encrypted);
//!
//! // 解密密码
//! let decrypted = crypto.decrypt(&encrypted)?;
//! assert_eq!(decrypted, "my_secret_password");
//! # Ok(())
//! # }
//! ```

use crate::error::{Result, SshError};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use zeroize::Zeroize;

/// AES-256 密钥大小（字节）
const KEY_SIZE: usize = 32;

/// 加密管理器 - 提供 AES-256-GCM 加密/解密服务
///
/// `CryptoManager` 负责管理主密钥和执行加密操作。主密钥在首次使用时
/// 自动生成并存储在系统 Keyring 中，后续使用时从 Keyring 读取。
///
/// # 密钥管理
///
/// - **首次运行**: 生成 256 位随机密钥，存储到 Keyring
/// - **后续运行**: 从 Keyring 读取已存在的密钥
/// - **密钥清零**: Drop 时自动清零内存中的密钥
///
/// # 加密格式
///
/// 加密后的数据格式：`Base64(Nonce[12] || Ciphertext)`
/// - 前 12 字节: 随机 nonce
/// - 后续字节: AES-GCM 加密的密文（包含认证标签）
///
/// # 线程安全
///
/// `CryptoManager` 不实现 `Send` 或 `Sync`，因为它包含敏感的密钥数据。
/// 如需在多线程环境使用，应为每个线程创建独立实例。
pub struct CryptoManager {
    /// AES-256 主密钥（32 字节）
    key: [u8; KEY_SIZE],
}

impl CryptoManager {
    /// 创建新的加密管理器实例
    ///
    /// 从系统 Keyring 读取主密钥，如果不存在则生成新密钥并保存。
    ///
    /// # 错误
    ///
    /// - `SshError::Encryption`: Keyring 访问失败或密钥格式无效
    ///
    /// # 示例
    ///
    /// ```rust,no_run
    /// use he_tao_ssh_lib::crypto::CryptoManager;
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let crypto = CryptoManager::new()?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn new() -> Result<Self> {
        let entry = keyring::Entry::new("HeTaoSSH", "master-key")
            .map_err(|e| SshError::Encryption(format!("Failed to init keyring: {}", e)))?;

        let mut key = [0u8; KEY_SIZE];

        match entry.get_password() {
            Ok(stored_key_base64) => {
                let decoded = STANDARD.decode(&stored_key_base64).map_err(|_| {
                    SshError::Encryption(crate::error::messages::INVALID_MASTER_KEY_FORMAT.into())
                })?;

                if decoded.len() != KEY_SIZE {
                    return Err(SshError::Encryption(
                        crate::error::messages::INVALID_MASTER_KEY_LENGTH.into(),
                    ));
                }
                key.copy_from_slice(&decoded);
            }
            Err(keyring::Error::NoEntry) => {
                // Generate and save new key
                rand::thread_rng().fill_bytes(&mut key);
                let encoded_key = STANDARD.encode(key);
                entry.set_password(&encoded_key).map_err(|e| {
                    SshError::Encryption(format!("Failed to save master key to keyring: {}", e))
                })?;
            }
            Err(e) => {
                return Err(SshError::Encryption(format!(
                    "Failed to read keyring: {}",
                    e
                )));
            }
        }

        Ok(Self { key })
    }

    /// 加密明文字符串
    ///
    /// 使用 AES-256-GCM 加密数据，每次加密使用新的随机 nonce。
    /// 返回 Base64 编码的加密数据（包含 nonce）。
    ///
    /// # 参数
    ///
    /// * `plaintext` - 要加密的明文字符串
    ///
    /// # 返回
    ///
    /// Base64 编码的加密数据，格式：`Base64(Nonce[12] || Ciphertext)`
    ///
    /// # 错误
    ///
    /// - `SshError::Encryption`: 加密操作失败
    ///
    /// # 示例
    ///
    /// ```rust,no_run
    /// # use he_tao_ssh_lib::crypto::CryptoManager;
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let crypto = CryptoManager::new()?;
    /// let encrypted = crypto.encrypt("my_password")?;
    /// println!("Encrypted: {}", encrypted);
    /// # Ok(())
    /// # }
    /// ```
    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        Ok(STANDARD.encode(&combined))
    }

    /// 解密加密的字符串
    ///
    /// 解密由 `encrypt()` 方法生成的 Base64 编码数据。
    ///
    /// # 参数
    ///
    /// * `encrypted` - Base64 编码的加密数据
    ///
    /// # 返回
    ///
    /// 解密后的明文字符串
    ///
    /// # 错误
    ///
    /// - `SshError::Encryption`: Base64 解码失败、数据格式无效或解密失败
    ///
    /// # 示例
    ///
    /// ```rust,no_run
    /// # use he_tao_ssh_lib::crypto::CryptoManager;
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let crypto = CryptoManager::new()?;
    /// let encrypted = crypto.encrypt("my_password")?;
    /// let decrypted = crypto.decrypt(&encrypted)?;
    /// assert_eq!(decrypted, "my_password");
    /// # Ok(())
    /// # }
    /// ```
    pub fn decrypt(&self, encrypted: &str) -> Result<String> {
        let combined = STANDARD
            .decode(encrypted)
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        if combined.len() < 12 {
            return Err(SshError::Encryption(
                crate::error::messages::INVALID_ENCRYPTED_DATA.to_string(),
            ));
        }

        let nonce_bytes = &combined[..12];
        let ciphertext = &combined[12..];

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| SshError::Encryption(e.to_string()))?;
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        String::from_utf8(plaintext).map_err(|e| SshError::Encryption(e.to_string()))
    }
}

impl Default for CryptoManager {
    fn default() -> Self {
        Self::new().expect("Failed to create CryptoManager")
    }
}

impl Drop for CryptoManager {
    /// 清零内存中的密钥
    ///
    /// 在 `CryptoManager` 被销毁时，自动清零内存中的主密钥，
    /// 防止密钥泄露到内存转储或交换文件中。
    fn drop(&mut self) {
        self.key.zeroize();
    }
}
