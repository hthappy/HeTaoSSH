//! Windows 资源管理器右键菜单集成
//!
//! 在 HKCU 下注册/注销「在 HeTaoSSH 中打开」菜单项，无需管理员权限：
//! - `Directory\shell\HeTaoSSH` —— 右键文件夹
//! - `Directory\Background\shell\HeTaoSSH` —— 右键文件夹空白处
//!
//! 菜单命令以目录路径作为唯一参数启动应用：
//! `"<exe_path>" "%V"`

#[cfg(target_os = "windows")]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(target_os = "windows")]
use winreg::RegKey;

/// 菜单显示名称（后缀 &Q 为快捷键助记符）
const MENU_LABEL: &str = "在 HeTaoSSH 中打开(&Q)";
/// 注册的子键名
const MENU_KEY: &str = "HeTaoSSH";

#[cfg(target_os = "windows")]
const REG_PATHS: &[&str] = &[
    r"Software\Classes\Directory\shell",
    r"Software\Classes\Directory\Background\shell",
];

/// 是否已注册右键菜单
pub fn is_registered() -> bool {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        REG_PATHS.iter().all(|base| {
            hkcu.open_subkey(format!(r"{}\{}", base, MENU_KEY)).is_ok()
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 注册右键菜单（HKCU，无需管理员权限）
pub fn register() -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe()?;
        let exe_str = exe.to_string_lossy().to_string();
        let command = format!("\"{}\" \"%V\"", exe_str);

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for base in REG_PATHS {
            let (key, _) = hkcu.create_subkey(format!(r"{}\{}", base, MENU_KEY))?;
            key.set_value("", &MENU_LABEL)?;
            key.set_value("Icon", &exe_str)?;

            let (cmd_key, _) =
                hkcu.create_subkey(format!(r"{}\{}\command", base, MENU_KEY))?;
            cmd_key.set_value("", &command)?;
        }
        log::info!("Explorer context menu registered: {}", exe_str);
    }
    Ok(())
}

/// 注销右键菜单
pub fn unregister() -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for base in REG_PATHS {
            // 忽略不存在的键
            let _ = hkcu.delete_subkey_all(format!(r"{}\{}", base, MENU_KEY));
        }
        log::info!("Explorer context menu unregistered");
    }
    Ok(())
}
