use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub wow_path: String,
    pub github_token: Option<String>,
    pub details_view_mode: Option<String>, // "full" or "drawer"
    pub game_flavor: Option<String>,       // "retail", "forever", or "all"
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            wow_path: String::new(),
            github_token: None,
            details_view_mode: Some("full".to_string()),
            game_flavor: Some("retail".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Addon {
    pub id: String,
    pub name: String,
    pub author: String,
    pub source: String, // "github" or "wago"
    pub repo: Option<String>,
    pub wago_slug: Option<String>,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub folders: Vec<String>,
    pub download_url: Option<String>,
    pub summary: Option<String>,
    pub image_url: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub ignored: Option<bool>,
    #[serde(default)]
    pub release_channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonVersion {
    pub version: String,
    pub game_version: String,
    pub download_url: String,
    pub release_date: Option<String>,
    pub changelog: Option<String>,
    pub stability: Option<String>, // "release", "beta", "alpha"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonDetails {
    pub id: String,
    pub name: String,
    pub author: String,
    pub summary: String,
    pub description: String,
    pub image_url: Option<String>,
    pub screenshots: Vec<String>,
    pub versions: Vec<AddonVersion>,
    pub download_url: Option<String>,
    pub website_url: Option<String>,
    pub source: String,
    pub downloads: Option<String>,
    pub latest_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WagoSearchResult {
    pub name: String,
    pub summary: String,
    pub slug: String,
    pub author: String,
    pub image_url: Option<String>,
    pub downloads: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedAddon {
    pub folder_name: String,
    pub folders: Vec<String>,
    pub title: String,
    pub version: String,
    pub author: String,
    pub notes: Option<String>,
    pub wago_id: Option<String>,
    pub curse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    pub html_url: String,
}
