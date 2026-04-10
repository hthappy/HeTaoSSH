use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: f64,
    pub y: f64,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1200.0,
            height: 800.0,
            x: 0.0,
            y: 0.0,
            maximized: false,
        }
    }
}

fn get_state_path(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("window_state.json"))
}

pub fn save_window_state(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    
    // Use logical size/position to handle DPI scaling correctly
    let size = window.outer_size()?;
    let position = window.outer_position()?;
    let maximized = window.is_maximized()?;
    
    // Get scale factor to convert physical to logical
    let scale_factor = window.scale_factor()?;
    
    let state = WindowState {
        width: size.width as f64 / scale_factor,
        height: size.height as f64 / scale_factor,
        x: position.x as f64 / scale_factor,
        y: position.y as f64 / scale_factor,
        maximized,
    };
    
    println!("Saving window state: {}x{} at ({}, {}), scale: {}, maximized: {}", 
             state.width, state.height, state.x, state.y, scale_factor, state.maximized);
    
    let state_path = get_state_path(app)?;
    let json = serde_json::to_string_pretty(&state)?;
    fs::write(state_path, json)?;
    
    Ok(())
}

pub fn load_window_state(app: &AppHandle) -> Result<WindowState, Box<dyn std::error::Error>> {
    let state_path = get_state_path(app)?;
    
    if !state_path.exists() {
        return Ok(WindowState::default());
    }
    
    let json = fs::read_to_string(state_path)?;
    let state: WindowState = serde_json::from_str(&json)?;
    
    Ok(state)
}

pub fn restore_window_state(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    
    match load_window_state(app) {
        Ok(state) => {
            // Validate state to ensure it's reasonable (logical pixels)
            let min_width = 800.0;
            let min_height = 600.0;
            
            let width = state.width.max(min_width);
            let height = state.height.max(min_height);
            
            println!("Restoring window state: {}x{} at ({}, {}), maximized: {}", 
                     width, height, state.x, state.y, state.maximized);
            
            // Use logical size/position to handle DPI scaling correctly
            let size = LogicalSize::new(width, height);
            window.set_size(size)?;
            
            // Set position (only if not off-screen)
            // Note: negative positions are valid for multi-monitor setups
            let position = LogicalPosition::new(state.x, state.y);
            window.set_position(position)?;
            
            // Set maximized state
            if state.maximized {
                window.maximize()?;
            }
            
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to load window state: {}, using defaults", e);
            // Set default size if loading fails (logical pixels)
            let size = LogicalSize::new(1200.0, 800.0);
            window.set_size(size)?;
            Ok(())
        }
    }
}

pub fn reset_window_state(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state_path = get_state_path(app)?;
    if state_path.exists() {
        fs::remove_file(state_path)?;
        println!("Window state reset");
    }
    Ok(())
}
