// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod commands;
pub mod error;
pub mod ssh;
pub mod config;
pub mod crypto;
pub mod monitor;
pub mod snippets;

pub use config::ConfigManager;
pub use error::{Result, SshError};
pub use monitor::SystemUsage;
pub use snippets::{CommandSnippet, SnippetManager};
