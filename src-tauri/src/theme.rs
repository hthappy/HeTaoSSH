use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct ThemeColors {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    #[serde(rename = "cursorAccent")]
    pub cursor_accent: String,
    pub selection: String,
    
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    
    #[serde(rename = "brightBlack")]
    pub bright_black: String,
    #[serde(rename = "brightRed")]
    pub bright_red: String,
    #[serde(rename = "brightGreen")]
    pub bright_green: String,
    #[serde(rename = "brightYellow")]
    pub bright_yellow: String,
    #[serde(rename = "brightBlue")]
    pub bright_blue: String,
    #[serde(rename = "brightMagenta")]
    pub bright_magenta: String,
    #[serde(rename = "brightCyan")]
    pub bright_cyan: String,
    #[serde(rename = "brightWhite")]
    pub bright_white: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThemeSchema {
    pub name: String,
    #[serde(rename = "type")]
    pub theme_type: String, // "dark" or "light"
    pub colors: ThemeColors,
}

// iTerm2 Color Dict
#[derive(Debug, Deserialize)]
struct ITermColor {
    #[serde(rename = "Red Component")]
    red: f64,
    #[serde(rename = "Green Component")]
    green: f64,
    #[serde(rename = "Blue Component")]
    blue: f64,
    #[serde(rename = "Alpha Component")]
    #[allow(dead_code)]
    alpha: Option<f64>,
}

impl ITermColor {
    fn to_hex(&self) -> String {
        let r = (self.red * 255.0) as u8;
        let g = (self.green * 255.0) as u8;
        let b = (self.blue * 255.0) as u8;
        // Ignore alpha for now as hex6 is standard for xterm.js theme
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    }
}

pub fn parse_iterm2_theme(xml_content: &str) -> Result<ThemeSchema> {
    let dict: HashMap<String, ITermColor> = plist::from_bytes(xml_content.as_bytes())
        .map_err(|e| crate::error::SshError::ConnectionFailed(format!("Failed to parse plist: {}", e)))?;

    let get_color = |key: &str| -> String {
        dict.get(key)
            .map(|c| c.to_hex())
            .unwrap_or_else(|| "#000000".to_string())
    };

    let colors = ThemeColors {
        background: get_color("Background Color"),
        foreground: get_color("Foreground Color"),
        cursor: get_color("Cursor Color"),
        cursor_accent: get_color("Cursor Text Color"), // Best approximation
        selection: get_color("Selection Color"),
        
        black: get_color("Ansi 0 Color"),
        red: get_color("Ansi 1 Color"),
        green: get_color("Ansi 2 Color"),
        yellow: get_color("Ansi 3 Color"),
        blue: get_color("Ansi 4 Color"),
        magenta: get_color("Ansi 5 Color"),
        cyan: get_color("Ansi 6 Color"),
        white: get_color("Ansi 7 Color"),
        
        bright_black: get_color("Ansi 8 Color"),
        bright_red: get_color("Ansi 9 Color"),
        bright_green: get_color("Ansi 10 Color"),
        bright_yellow: get_color("Ansi 11 Color"),
        bright_blue: get_color("Ansi 12 Color"),
        bright_magenta: get_color("Ansi 13 Color"),
        bright_cyan: get_color("Ansi 14 Color"),
        bright_white: get_color("Ansi 15 Color"),
    };

    Ok(ThemeSchema {
        name: "Imported Theme".to_string(),
        theme_type: "dark".to_string(), // Default to dark
        colors,
    })
}
