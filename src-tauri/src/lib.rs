// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod commands;
pub mod error;
pub mod ssh;
pub mod config;
pub mod crypto;
pub mod monitor;
pub mod snippets;
pub mod security;
pub mod theme;

pub use config::ConfigManager;
pub use error::{Result, SshError};
pub use monitor::SystemUsage;
pub use snippets::{CommandSnippet, SnippetManager};
pub use security::{validate_and_normalize_path, contains_traversal_pattern};
