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
pub mod window_state;

use config::ConfigManager;
use error::Result;
use local_term::LocalTerminalManager;
use log::info;
use monitor::LocalMonitor;
use ssh::{ConnectionManager, TunnelManager};
use std::sync::Arc;
use tauri::Manager;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    info!("Starting HeTaoSSH...");

    let config_manager = Arc::new(ConfigManager::new().await?);
    let snippet_manager = Arc::new(snippets::SnippetManager::new().await?);
    let ssh_manager = Arc::new(ConnectionManager::new());
    let tunnel_manager = Arc::new(TunnelManager::new());
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
        .manage(tunnel_manager)
        .manage(local_term_manager)
        .manage(local_monitor)
        .setup(|app| {
            // Restore window state synchronously before window is shown
            if let Some(window) = app.get_webview_window("main") {
                // Hide window first to avoid flicker
                let _ = window.hide();
                
                // Restore state
                if let Err(e) = window_state::restore_window_state(app.handle()) {
                    eprintln!("Failed to restore window state: {}", e);
                }
                
                // Show window after state is restored
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Save window state on close
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Save immediately on close
                    if let Err(e) = window_state::save_window_state(window.app_handle()) {
                        eprintln!("Failed to save window state on close: {}", e);
                    }
                }
                _ => {}
            }
        })
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
            commands::sftp_upload_file_with_progress,
            commands::sftp_get_home_dir,
            commands::sftp_rename,
            commands::sftp_create_file,
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
            commands::ssh_manual_reconnect,
            commands::get_latency,
            commands::parse_theme,
            commands::fetch_url,
            commands::open_local_terminal,
            commands::local_term_write,
            commands::local_term_resize,
            commands::local_term_close,
            commands::local_list_dir,
            commands::local_get_home_dir,
            commands::open_path_in_explorer,
            // Session management
            commands::save_session,
            commands::get_session,
            // Tunnel management
            commands::start_tunnel,
            commands::stop_tunnel,
            commands::list_tunnels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
