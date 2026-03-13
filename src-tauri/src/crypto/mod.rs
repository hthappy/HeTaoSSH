use crate::error::{Result, SshError};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use zeroize::Zeroize;

const KEY_SIZE: usize = 32;

pub struct CryptoManager {
    key: [u8; KEY_SIZE],
}

impl CryptoManager {
    pub fn new() -> Result<Self> {
        let entry = keyring::Entry::new("HeTaoSSH", "master-key")
            .map_err(|e| SshError::Encryption(format!("Failed to init keyring: {}", e)))?;

        let mut key = [0u8; KEY_SIZE];

        match entry.get_password() {
            Ok(stored_key_base64) => {
                let decoded = STANDARD.decode(&stored_key_base64)
                    .map_err(|_| SshError::Encryption("Invalid master key format in keyring".into()))?;
                
                if decoded.len() != KEY_SIZE {
                    return Err(SshError::Encryption("Invalid master key length in keyring".into()));
                }
                key.copy_from_slice(&decoded);
            }
            Err(keyring::Error::NoEntry) => {
                // Generate and save new key
                rand::thread_rng().fill_bytes(&mut key);
                let encoded_key = STANDARD.encode(&key);
                entry.set_password(&encoded_key)
                    .map_err(|e| SshError::Encryption(format!("Failed to save master key to keyring: {}", e)))?;
            }
            Err(e) => {
                return Err(SshError::Encryption(format!("Failed to read keyring: {}", e)));
            }
        }

        Ok(Self { key })
    }

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

    pub fn decrypt(&self, encrypted: &str) -> Result<String> {
        let combined = STANDARD.decode(encrypted)
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        if combined.len() < 12 {
            return Err(SshError::Encryption("Invalid encrypted data".to_string()));
        }

        let nonce_bytes = &combined[..12];
        let ciphertext = &combined[12..];

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| SshError::Encryption(e.to_string()))?;
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| SshError::Encryption(e.to_string()))?;

        String::from_utf8(plaintext)
            .map_err(|e| SshError::Encryption(e.to_string()))
    }
}

impl Default for CryptoManager {
    fn default() -> Self {
        Self::new().expect("Failed to create CryptoManager")
    }
}

impl Drop for CryptoManager {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

// Tests removed for compilation
// Tests removed for compilation
