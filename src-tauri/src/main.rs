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

use config::ConfigManager;
use error::Result;
use log::info;
use ssh::ConnectionManager;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    info!("Starting HetaoSSH...");

    let config_manager = Arc::new(ConfigManager::new().await?);
    let snippet_manager = Arc::new(snippets::SnippetManager::new().await?);
    let ssh_manager = Arc::new(ConnectionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(config_manager)
        .manage(snippet_manager)
        .manage(ssh_manager)
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::get_version,
            commands::list_servers,
            commands::save_server,
            commands::delete_server,
            commands::test_connection,
            commands::sftp_list_dir,
            commands::sftp_read_file,
            commands::sftp_write_file,
            commands::sftp_remove_file,
            commands::sftp_create_dir,
            commands::sftp_get_home_dir,
            commands::get_system_usage,
            commands::list_snippets,
            commands::list_snippet_categories,
            commands::save_snippet,
            commands::delete_snippet,
            // SSH connection management
            commands::ssh_connect,
            commands::ssh_disconnect,
            commands::ssh_send,
            commands::ssh_recv,
            commands::ssh_resize,
            commands::parse_theme,
            commands::fetch_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
