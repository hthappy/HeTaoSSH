use crate::crypto::CryptoManager;
use crate::error::{Result, SshError};
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::path::PathBuf;

use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServerConfig {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
}

pub struct ConfigManager {
    pool: SqlitePool,
    crypto: Arc<CryptoManager>,
}

impl ConfigManager {
    pub async fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        info!("Database path: {:?}", db_path);
        
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                SshError::Config(format!("Failed to create directory: {}", e))
            })?;
        }
        
        // Use SqliteConnectOptions with explicit create_if_missing
        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        
        info!("DB file exists before connect: {}", db_path.exists());
        info!("Connecting to: {}", db_path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(connect_options)
            .await?;

        Self::init_db(&pool).await?;
        let crypto = Arc::new(CryptoManager::new()?);

        Ok(Self { pool, crypto })
    }

    fn get_db_path() -> Result<PathBuf> {
        let db_path = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            PathBuf::from(local_app_data).join("HetaoSSH").join("hetaossh.db")
        } else if let Some(data_dir) = dirs::data_local_dir() {
            data_dir.join("HetaoSSH").join("hetaossh.db")
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("HetaoSSH")
                .join("hetaossh.db")
        };
        
        Ok(db_path)
    }

    async fn init_db(pool: &SqlitePool) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                username TEXT NOT NULL,
                password_encrypted TEXT,
                private_key_path TEXT,
                passphrase_encrypted TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(pool)
        .await?;

        info!("Database initialized");
        Ok(())
    }

    pub async fn save_server(&self, config: &ServerConfig) -> Result<i64> {
        let password_encrypted = config.password.as_ref().map(|p| {
            self.crypto.encrypt(p).map_err(|e| SshError::Config(format!("Encryption failed: {}", e)))
        }).transpose()?;
        
        let passphrase_encrypted = config.passphrase.as_ref().map(|p| {
            self.crypto.encrypt(p).map_err(|e| SshError::Config(format!("Encryption failed: {}", e)))
        }).transpose()?;

        let result = sqlx::query(
            r#"
            INSERT INTO servers (name, host, port, username, password_encrypted, private_key_path, passphrase_encrypted)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                host = excluded.host,
                port = excluded.port,
                username = excluded.username,
                password_encrypted = excluded.password_encrypted,
                private_key_path = excluded.private_key_path,
                passphrase_encrypted = excluded.passphrase_encrypted,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
            "#,
        )
        .bind(&config.name)
        .bind(&config.host)
        .bind(config.port as i64)
        .bind(&config.username)
        .bind(password_encrypted.as_deref())
        .bind(config.private_key_path.as_deref())
        .bind(passphrase_encrypted.as_deref())
        .fetch_one(&self.pool)
        .await?;

        Ok(result.get::<i64, _>(0))
    }

    pub async fn list_servers(&self) -> Result<Vec<ServerConfig>> {
        let rows = sqlx::query(
            "SELECT id, name, host, port, username, password_encrypted, private_key_path, passphrase_encrypted FROM servers",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut servers = Vec::with_capacity(rows.len());
        for row in rows {
            let password_encrypted: Option<String> = row.get("password_encrypted");
            let passphrase_encrypted: Option<String> = row.get("passphrase_encrypted");

            // 解密失败时优雅降级：清空无法解密的字段（可能是密钥迁移后旧数据）
            let password = password_encrypted.and_then(|enc| {
                match self.crypto.decrypt(&enc) {
                    Ok(p) => Some(p),
                    Err(e) => {
                        log::warn!("Password decryption failed (key migration?): {}", e);
                        None
                    }
                }
            });
            
            let passphrase = passphrase_encrypted.and_then(|enc| {
                match self.crypto.decrypt(&enc) {
                    Ok(p) => Some(p),
                    Err(e) => {
                        log::warn!("Passphrase decryption failed (key migration?): {}", e);
                        None
                    }
                }
            });

            servers.push(ServerConfig {
                id: row.get("id"),
                name: row.get("name"),
                host: row.get("host"),
                port: row.get("port"),
                username: row.get("username"),
                password,
                private_key_path: row.get("private_key_path"),
                passphrase,
            });
        }

        Ok(servers)
    }

    pub async fn delete_server(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM servers WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}
