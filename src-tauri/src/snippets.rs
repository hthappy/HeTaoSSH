use crate::error::{Result, SshError};
use log::info;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CommandSnippet {
    pub id: Option<i64>,
    pub name: String,
    pub command: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub created_at: Option<String>,
}

pub struct SnippetManager {
    pool: SqlitePool,
}

impl SnippetManager {
    pub async fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        info!("Snippets database path: {:?}", db_path);

        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(connect_options)
            .await?;

        Self::init_db(&pool).await?;
        Ok(Self { pool })
    }

    fn get_db_path() -> Result<PathBuf> {
        let db_path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("HeTaoSSH");
        std::fs::create_dir_all(&db_path)
            .map_err(|e| SshError::Config(format!("Failed to create database directory: {}", e)))?;
        Ok(db_path.join("snippets.db"))
    }

    async fn init_db(pool: &SqlitePool) -> Result<()> {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS snippets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                description TEXT,
                category TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"#,
        )
        .execute(pool)
        .await?;

        // Create metadata table to track initialization state
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            )"#,
        )
        .execute(pool)
        .await?;

        // Check if snippets have been initialized
        let initialized: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM app_metadata WHERE key = 'snippets_initialized'")
                .fetch_one(pool)
                .await?;

        if initialized.0 == 0 {
            let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM snippets")
                .fetch_one(pool)
                .await?;

            if count.0 == 0 {
                let defaults = vec![
                    (
                        "System Info",
                        "uname -a",
                        "Show system information",
                        "System",
                    ),
                    ("Disk Usage", "df -h", "Show disk usage", "System"),
                    ("Memory Info", "free -h", "Show memory usage", "System"),
                    ("CPU Info", "lscpu", "Show CPU information", "System"),
                    (
                        "Top Processes",
                        "top -n 10",
                        "Show top 10 processes",
                        "Process",
                    ),
                    (
                        "Network Connections",
                        "netstat -tulpn",
                        "Show network connections",
                        "Network",
                    ),
                    (
                        "Find Files",
                        "find . -name '{pattern}'",
                        "Find files by name",
                        "File",
                    ),
                    (
                        "Tail Logs",
                        "tail -f /var/log/syslog",
                        "View system logs",
                        "Logs",
                    ),
                    (
                        "Docker Containers",
                        "docker ps -a",
                        "List all containers",
                        "Docker",
                    ),
                    ("Git Status", "git status", "Show git status", "Git"),
                ];
                for (name, command, description, category) in defaults {
                    sqlx::query("INSERT INTO snippets (name, command, description, category) VALUES (?, ?, ?, ?)")
                        .bind(name).bind(command).bind(description).bind(category)
                        .execute(pool).await?;
                }
                info!("Inserted default command snippets");
            }

            // Mark as initialized so we don't re-insert defaults if user deletes them all
            sqlx::query("INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('snippets_initialized', 'true')")
                .execute(pool).await?;
        }
        Ok(())
    }

    pub async fn list_snippets(&self) -> Result<Vec<CommandSnippet>> {
        Ok(
            sqlx::query_as("SELECT * FROM snippets ORDER BY category, name")
                .fetch_all(&self.pool)
                .await?,
        )
    }

    pub async fn list_categories(&self) -> Result<Vec<String>> {
        Ok(sqlx::query_scalar(
            "SELECT DISTINCT category FROM snippets WHERE category IS NOT NULL ORDER BY category",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn save_snippet(&self, snippet: &CommandSnippet) -> Result<i64> {
        let result = sqlx::query(
            r#"INSERT INTO snippets (id, name, command, description, category)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                command = excluded.command,
                description = excluded.description,
                category = excluded.category
            RETURNING id"#,
        )
        .bind(snippet.id)
        .bind(&snippet.name)
        .bind(&snippet.command)
        .bind(&snippet.description)
        .bind(&snippet.category)
        .fetch_one(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(result.get::<i64, _>(0))
    }

    pub async fn delete_snippet(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM snippets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
