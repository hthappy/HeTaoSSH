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

use config::ConfigManager;
use error::Result;
use local_term::LocalTerminalManager;
use log::info;
use monitor::LocalMonitor;
use ssh::ConnectionManager;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    info!("Starting HeTaoSSH...");

    let config_manager = Arc::new(ConfigManager::new().await?);
    let snippet_manager = Arc::new(snippets::SnippetManager::new().await?);
    let ssh_manager = Arc::new(ConnectionManager::new());
    let local_term_manager = Arc::new(LocalTerminalManager::new());
    let local_monitor = Arc::new(LocalMonitor::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(config_manager)
        .manage(snippet_manager)
        .manage(ssh_manager)
        .manage(local_term_manager)
        .manage(local_monitor)
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
            commands::sftp_download_file,
            commands::sftp_download_dir,
            commands::sftp_upload_file,
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
            commands::open_local_terminal,
            commands::local_term_write,
            commands::local_term_resize,
            commands::local_term_close,
            commands::local_list_dir,
            commands::local_get_home_dir,
            // Session management
            commands::save_session,
            commands::get_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
