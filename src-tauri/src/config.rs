use std::fs;
use std::path::{Path, PathBuf};
use crate::models::{Addon, Settings};

pub fn get_app_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WoWAddonVault");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn load_settings() -> Settings {
    let file = get_app_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&file) {
        if let Ok(settings) = serde_json::from_str::<Settings>(&content) {
            return settings;
        }
    }
    
    // If not found or empty, try auto-detecting
    let mut default_settings = Settings::default();
    if let Some(detected) = auto_detect_wow_path() {
        default_settings.wow_path = detected;
    }
    default_settings
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let file = get_app_dir().join("settings.json");
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| e.to_string())?;
    fs::write(&file, data).map_err(|e| e.to_string())
}

pub fn load_addons() -> Vec<Addon> {
    let file = get_app_dir().join("addons.json");
    if let Ok(content) = fs::read_to_string(&file) {
        if let Ok(addons) = serde_json::from_str::<Vec<Addon>>(&content) {
            return addons;
        }
    }
    Vec::new()
}

pub fn save_addons(addons: &[Addon]) -> Result<(), String> {
    let file = get_app_dir().join("addons.json");
    let data = serde_json::to_string_pretty(addons)
        .map_err(|e| e.to_string())?;
    fs::write(&file, data).map_err(|e| e.to_string())
}

pub fn auto_detect_wow_path() -> Option<String> {
    let candidates = [
        r"C:\Program Files (x86)\World of Warcraft\_retail_",
        r"C:\Program Files\World of Warcraft\_retail_",
        r"D:\World of Warcraft\_retail_",
        r"D:\Games\World of Warcraft\_retail_",
        r"E:\World of Warcraft\_retail_",
        r"E:\Games\World of Warcraft\_retail_",
        r"F:\World of Warcraft\_retail_",
        r"F:\Games\World of Warcraft\_retail_",
        r"C:\Program Files (x86)\World of Warcraft\_classic_",
        r"D:\World of Warcraft\_classic_",
        r"C:\Program Files (x86)\World of Warcraft",
        r"D:\World of Warcraft",
        r"D:\Games\World of Warcraft",
    ];

    for path_str in candidates {
        let p = Path::new(path_str);
        if p.exists() {
            // If it's the root WoW folder without _retail_, look for _retail_ inside
            if p.join("_retail_").exists() {
                return Some(p.join("_retail_").to_string_lossy().to_string());
            }
            if p.join("_classic_").exists() {
                return Some(p.join("_classic_").to_string_lossy().to_string());
            }
            return Some(path_str.to_string());
        }
    }

    None
}
