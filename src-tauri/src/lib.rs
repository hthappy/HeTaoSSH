// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod commands;
pub mod config;
pub mod crypto;
pub mod error;
pub mod local_term;
pub mod monitor;
pub mod security;
pub mod snippets;
pub mod ssh;
pub mod theme;

pub use commands::*;
pub use config::ConfigManager;
pub use error::{Result, SshError};
pub use monitor::SystemUsage;
pub use security::{contains_traversal_pattern, validate_and_normalize_path};
pub use snippets::{CommandSnippet, SnippetManager};
