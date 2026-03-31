//! Commands module - Tauri IPC command handlers
//!
//! This module organizes all Tauri commands into logical submodules:
//! - `sftp`: SFTP file operations (11 functions)
//! - `ssh`: SSH connection management (6 functions)
//! - `system`: System monitoring and utilities (6 functions)
//! - `config`: Configuration and data management (13 functions)
//! - `tunnel`: SSH port forwarding (3 functions)

mod config;
mod sftp;
mod ssh;
mod system;
mod tunnel;

// Re-export all commands for use in main.rs
pub use config::*;
pub use sftp::*;
pub use ssh::*;
pub use system::*;
pub use tunnel::*;
