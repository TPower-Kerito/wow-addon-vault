pub mod models;
pub mod config;
pub mod sources;
pub mod installer;
pub mod scanner;

use models::{Addon, AddonDetails, AddonVersion, AppUpdateInfo, ScannedAddon, Settings, WagoSearchResult};

#[tauri::command]
fn get_settings() -> Settings {
    config::load_settings()
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    config::save_settings(&settings)
}

#[tauri::command]
fn auto_detect_wow_path() -> Option<String> {
    config::auto_detect_wow_path()
}

#[tauri::command]
fn get_addons() -> Vec<Addon> {
    let settings = config::load_settings();
    let addons = config::load_addons();

    // Auto-migrate legacy ungrouped scan (e.g. if individual DBM-* or LittleWigs_* submodules exist)
    let has_legacy_submodules = addons.iter().any(|a| {
        a.id.starts_with("local:DBM-") && a.id != "local:DBM-Core"
            || a.id.starts_with("local:LittleWigs_")
            || a.id.starts_with("local:BigWigs_")
            || a.id.starts_with("local:RaiderIO_DB_")
    });

    if has_legacy_submodules && !settings.wow_path.trim().is_empty() {
        if let Ok(scanned) = scanner::scan_addons_folder(&settings.wow_path) {
            let mut manual_addons: Vec<Addon> = addons
                .into_iter()
                .filter(|a| a.source == "github" || a.id.starts_with("github:"))
                .collect();
            let converted = scanner::convert_scanned_to_addons(scanned);
            manual_addons.extend(converted);
            let _ = config::save_addons(&manual_addons);
            return manual_addons;
        }
    }

    // Auto-sanitize update flags (e.g. if an addon has no remote release or versions match normalized)
    let mut modified = false;
    let mut cleaned_addons = addons;
    for a in &mut cleaned_addons {
        if a.has_update {
            if a.download_url.is_none()
                || a.latest_version.is_none()
                || !is_version_newer(a.installed_version.as_deref(), a.latest_version.as_deref())
            {
                a.has_update = false;
                modified = true;
            }
        }
    }
    if modified {
        let _ = config::save_addons(&cleaned_addons);
    }

    cleaned_addons
}

#[tauri::command]
fn scan_disk_addons() -> Result<Vec<ScannedAddon>, String> {
    let settings = config::load_settings();
    scanner::scan_addons_folder(&settings.wow_path)
}

#[tauri::command]
fn import_scanned_addons(scanned: Vec<ScannedAddon>) -> Result<Vec<Addon>, String> {
    let current_addons = config::load_addons();
    let mut manual_addons: Vec<Addon> = current_addons
        .iter()
        .filter(|a| a.source == "github" || a.id.starts_with("github:"))
        .cloned()
        .collect();

    // Preserve existing image_urls from current_addons
    let mut img_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for a in &current_addons {
        if let Some(img) = &a.image_url {
            img_cache.insert(a.id.clone(), img.clone());
            img_cache.insert(a.name.to_lowercase(), img.clone());
        }
    }

    let mut converted = scanner::convert_scanned_to_addons(scanned);
    for a in &mut converted {
        if a.image_url.is_none() {
            if let Some(cached) = img_cache.get(&a.id).or_else(|| img_cache.get(&a.name.to_lowercase())) {
                a.image_url = Some(cached.clone());
            }
        }
    }

    manual_addons.extend(converted);
    config::save_addons(&manual_addons)?;
    Ok(manual_addons)
}

#[tauri::command]
async fn browse_addons(
    page: u32,
    query: Option<String>,
    category: Option<String>,
) -> Result<Vec<WagoSearchResult>, String> {
    sources::browse_wago(page, query, category).await
}

#[tauri::command]
async fn get_addon_details(slug_or_id: String) -> Result<AddonDetails, String> {
    let clean_id = slug_or_id.clone();
    let slug = slug_or_id
        .trim_start_matches("wago:")
        .trim_start_matches("local:")
        .trim_start_matches("github:");

    match sources::fetch_wago_details(slug).await {
        Ok(details) => Ok(details),
        Err(err) => {
            let addons = config::load_addons();
            if let Some(local) = addons.iter().find(|a| {
                a.id == clean_id
                    || a.id == format!("local:{}", slug)
                    || a.wago_slug.as_deref() == Some(slug)
                    || a.name.to_lowercase() == slug.to_lowercase()
            }) {
                Ok(AddonDetails {
                    id: local.id.clone(),
                    name: local.name.clone(),
                    author: local.author.clone(),
                    summary: local.summary.clone().unwrap_or_default(),
                    description: local
                        .summary
                        .clone()
                        .unwrap_or_else(|| "Installed World of Warcraft Addon.".to_string()),
                    image_url: local.image_url.clone(),
                    screenshots: Vec::new(),
                    versions: local
                        .installed_version
                        .as_ref()
                        .map(|v| {
                            vec![AddonVersion {
                                version: v.clone(),
                                game_version: "Retail".to_string(),
                                download_url: local.download_url.clone().unwrap_or_default(),
                                release_date: None,
                                changelog: None,
                                stability: Some("Release".to_string()),
                            }]
                        })
                        .unwrap_or_default(),
                    download_url: local.download_url.clone(),
                    website_url: None,
                    source: local.source.clone(),
                    downloads: None,
                    latest_version: local
                        .latest_version
                        .clone()
                        .or_else(|| local.installed_version.clone()),
                })
            } else {
                Err(err)
            }
        }
    }
}

#[tauri::command]
async fn add_addon_from_github(repo: String) -> Result<Addon, String> {
    let settings = config::load_settings();
    let (name, author, summary, version, download_url) = sources::fetch_github_release(
        &repo,
        settings.github_token.as_deref(),
    ).await?;

    let clean_repo = repo
        .trim()
        .trim_start_matches("https://github.com/")
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string();

    let addon = Addon {
        id: format!("github:{}", clean_repo),
        name,
        author,
        source: "github".to_string(),
        repo: Some(clean_repo),
        wago_slug: None,
        installed_version: None,
        latest_version: Some(version),
        has_update: true,
        folders: Vec::new(),
        download_url: Some(download_url),
        summary: Some(summary),
        image_url: None,
        updated_at: None,
        ignored: None,
        release_channel: None,
    };

    let mut addons = config::load_addons();
    if let Some(idx) = addons.iter().position(|a| a.id == addon.id) {
        addons[idx] = addon.clone();
    } else {
        addons.push(addon.clone());
    }
    config::save_addons(&addons)?;

    Ok(addon)
}

#[tauri::command]
async fn add_addon_from_wago(slug: String) -> Result<Addon, String> {
    let addon = sources::fetch_wago_addon(&slug).await?;
    let mut addons = config::load_addons();

    if let Some(idx) = addons.iter().position(|a| a.id == addon.id) {
        addons[idx] = addon.clone();
    } else {
        addons.push(addon.clone());
    }
    config::save_addons(&addons)?;

    Ok(addon)
}

#[tauri::command]
async fn install_specific_version(
    addon_id: String,
    version: String,
    download_url: String,
) -> Result<Addon, String> {
    let settings = config::load_settings();
    if settings.wow_path.trim().is_empty() {
        return Err("Please set your WoW path in Settings before installing.".to_string());
    }

    let mut addons = config::load_addons();
    let mut target = if let Some(idx) = addons.iter().position(|a| a.id == addon_id) {
        addons[idx].clone()
    } else {
        let clean_slug = addon_id.trim_start_matches("wago:");
        Addon {
            id: addon_id.clone(),
            name: clean_slug.to_string(),
            author: "Author".to_string(),
            source: "wago".to_string(),
            repo: None,
            wago_slug: Some(clean_slug.to_string()),
            installed_version: None,
            latest_version: Some(version.clone()),
            has_update: true,
            folders: Vec::new(),
            download_url: Some(download_url.clone()),
            summary: None,
            image_url: None,
            updated_at: None,
            ignored: None,
            release_channel: None,
        }
    };

    target.latest_version = Some(version);
    target.download_url = Some(download_url);

    installer::install_or_update_addon(&mut target, &settings.wow_path, settings.github_token.as_deref()).await?;

    if let Some(idx) = addons.iter().position(|a| a.id == addon_id) {
        addons[idx] = target.clone();
    } else {
        addons.push(target.clone());
    }
    config::save_addons(&addons)?;

    Ok(target)
}

fn normalize_version_str(v: &str) -> String {
    let mut s = v.trim().to_lowercase();
    for suffix in &[
        "-retail", "-classic", "-forever", "-mainline", "-release", "-bcc", "-wrath", "-mop",
        "-tww", "-beta", "-alpha",
    ] {
        if s.ends_with(suffix) {
            s.truncate(s.len() - suffix.len());
        }
    }

    let mut core = String::new();
    let mut started = false;
    for c in s.chars() {
        if c.is_ascii_digit() {
            started = true;
            core.push(c);
        } else if started && (c == '.' || c == '-' || c == '_') {
            core.push(c);
        } else if started && !c.is_alphanumeric() {
            break;
        }
    }

    if !core.is_empty() {
        core.trim_matches(|c: char| !c.is_ascii_alphanumeric()).to_string()
    } else {
        s.trim_start_matches('v').to_string()
    }
}

fn is_version_newer(installed: Option<&str>, latest: Option<&str>) -> bool {
    let lat = match latest {
        Some(l) => l.trim(),
        None => return false,
    };
    if lat.is_empty() || lat == "-" || lat == "none" {
        return false;
    }

    let inst = match installed {
        Some(i) => i.trim(),
        None => return true,
    };
    if inst.is_empty() {
        return true;
    }

    let norm_inst = normalize_version_str(inst);
    let norm_lat = normalize_version_str(lat);

    if norm_inst.is_empty() || norm_lat.is_empty() {
        return inst.to_lowercase() != lat.to_lowercase();
    }

    norm_inst != norm_lat
}

#[tauri::command]
async fn install_or_update(addon_id: String) -> Result<Addon, String> {
    let settings = config::load_settings();
    if settings.wow_path.trim().is_empty() {
        return Err("Please set your WoW path in Settings before installing addons.".to_string());
    }

    let mut addons = config::load_addons();
    let idx = addons
        .iter()
        .position(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found in vault".to_string())?;

    let mut target = addons[idx].clone();

    if target.source == "github" {
        if let Some(repo) = &target.repo {
            if let Ok((_, _, _, ver, url)) = sources::fetch_github_release(repo, settings.github_token.as_deref()).await {
                target.latest_version = Some(ver);
                target.download_url = Some(url);
            }
        }
    } else if target.source == "wago" {
        if let Some(slug) = &target.wago_slug {
            match sources::fetch_wago_addon(slug).await {
                Ok(updated_wago) => {
                    target.latest_version = updated_wago.latest_version;
                    target.download_url = updated_wago.download_url;
                }
                Err(err) => {
                    if target.download_url.is_none() {
                        target.has_update = false;
                        addons[idx] = target.clone();
                        let _ = config::save_addons(&addons);
                        return Err(format!("Could not fetch download file from Wago: {}", err));
                    }
                }
            }
        }
    }

    if target.download_url.is_none() {
        target.has_update = false;
        addons[idx] = target.clone();
        let _ = config::save_addons(&addons);
        return Err(format!("No downloadable file found for {}", target.name));
    }

    installer::install_or_update_addon(&mut target, &settings.wow_path, settings.github_token.as_deref()).await?;

    target.has_update = false;
    addons[idx] = target.clone();
    config::save_addons(&addons)?;

    Ok(target)
}

#[tauri::command]
async fn check_all_updates() -> Result<Vec<Addon>, String> {
    let settings = config::load_settings();
    let mut addons = config::load_addons();

    for addon in &mut addons {
        if addon.ignored.unwrap_or(false) {
            addon.has_update = false;
            continue;
        }

        if addon.source == "github" {
            if let Some(repo) = &addon.repo {
                if let Ok((_, _, _, ver, url)) = sources::fetch_github_release(repo, settings.github_token.as_deref()).await {
                    let has_new = is_version_newer(addon.installed_version.as_deref(), Some(&ver));
                    addon.latest_version = Some(ver);
                    addon.download_url = Some(url);
                    addon.has_update = has_new;
                }
            }
        } else if addon.source == "wago" {
            if let Some(slug) = &addon.wago_slug {
                if let Ok(wago_addon) = sources::fetch_wago_addon(slug).await {
                    let has_new = is_version_newer(
                        addon.installed_version.as_deref(),
                        wago_addon.latest_version.as_deref(),
                    ) && wago_addon.download_url.is_some();

                    addon.latest_version = wago_addon.latest_version;
                    addon.download_url = wago_addon.download_url;
                    addon.has_update = has_new;
                } else if addon.download_url.is_none() || addon.latest_version.is_none() {
                    addon.has_update = false;
                }
            }
        }
    }

    config::save_addons(&addons)?;
    Ok(addons)
}

#[tauri::command]
fn delete_addon(addon_id: String) -> Result<(), String> {
    let settings = config::load_settings();
    let mut addons = config::load_addons();

    if let Some(idx) = addons.iter().position(|a| a.id == addon_id) {
        let addon = &addons[idx];
        if !settings.wow_path.trim().is_empty() {
            let _ = installer::delete_addon_files(addon, &settings.wow_path);
        }
        addons.remove(idx);
        config::save_addons(&addons)?;
    }

    Ok(())
}

#[tauri::command]
fn open_addons_folder() -> Result<(), String> {
    let settings = config::load_settings();
    if settings.wow_path.trim().is_empty() {
        return Err("WoW path is not configured.".to_string());
    }

    let p = std::path::Path::new(&settings.wow_path);
    let target = if p.ends_with("AddOns") {
        p.to_path_buf()
    } else {
        p.join("Interface").join("AddOns")
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn open_addon_folder(addon_id: String) -> Result<(), String> {
    let settings = config::load_settings();
    if settings.wow_path.trim().is_empty() {
        return Err("WoW path is not configured.".to_string());
    }

    let addons = config::load_addons();
    let addon = addons
        .iter()
        .find(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found.".to_string())?;

    let p = std::path::Path::new(&settings.wow_path);
    let base_dir = if p.ends_with("AddOns") {
        p.to_path_buf()
    } else {
        p.join("Interface").join("AddOns")
    };

    let target = if let Some(first_folder) = addon.folders.first() {
        let specific = base_dir.join(first_folder);
        if specific.exists() {
            specific
        } else {
            base_dir
        }
    } else {
        base_dir
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn delete_addon_saved_variables(addon_id: String) -> Result<u32, String> {
    let settings = config::load_settings();
    if settings.wow_path.trim().is_empty() {
        return Err("WoW path is not configured.".to_string());
    }

    let addons = config::load_addons();
    let addon = addons
        .iter()
        .find(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found.".to_string())?;

    let wtf_dir = std::path::Path::new(&settings.wow_path).join("WTF");
    if !wtf_dir.exists() {
        return Ok(0);
    }

    let mut targets: std::collections::HashSet<String> = addon.folders.iter().cloned().collect();
    let clean_name: String = addon
        .name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if !clean_name.is_empty() {
        targets.insert(clean_name);
    }

    let mut deleted_count = 0;
    recursive_clean_saved_vars(&wtf_dir, &targets, &mut deleted_count);
    Ok(deleted_count)
}

fn recursive_clean_saved_vars(
    dir: &std::path::Path,
    targets: &std::collections::HashSet<String>,
    count: &mut u32,
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                recursive_clean_saved_vars(&path, targets, count);
            } else if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    for target in targets {
                        let lua_match = format!("{}.lua", target);
                        let bak_match = format!("{}.lua.bak", target);
                        if file_name.eq_ignore_ascii_case(&lua_match)
                            || file_name.eq_ignore_ascii_case(&bak_match)
                        {
                            if std::fs::remove_file(&path).is_ok() {
                                *count += 1;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn toggle_addon_ignore(addon_id: String, ignore: bool) -> Result<Addon, String> {
    let mut addons = config::load_addons();
    let idx = addons
        .iter()
        .position(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found.".to_string())?;

    addons[idx].ignored = Some(ignore);
    if ignore {
        addons[idx].has_update = false;
    }
    config::save_addons(&addons)?;
    Ok(addons[idx].clone())
}

#[tauri::command]
fn set_addon_release_channel(addon_id: String, channel: String) -> Result<Addon, String> {
    let mut addons = config::load_addons();
    let idx = addons
        .iter()
        .position(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found.".to_string())?;

    addons[idx].release_channel = Some(channel);
    config::save_addons(&addons)?;
    Ok(addons[idx].clone())
}

#[tauri::command]
async fn check_app_update() -> Result<Option<AppUpdateInfo>, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = "https://api.github.com/repos/TPower-Kerito/wow-addon-vault/releases/latest";

    let client = reqwest::Client::new();
    let res = match client
        .get(url)
        .header("User-Agent", "WoWAddonVault/1.0")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    if !res.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = match res.json().await {
        Ok(j) => j,
        Err(_) => return Ok(None),
    };

    let tag_name = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if tag_name.is_empty() {
        return Ok(None);
    }

    if is_version_newer(Some(&current_version), Some(&tag_name)) {
        let release_notes = json["body"].as_str().map(|s| s.to_string());
        let html_url = json["html_url"]
            .as_str()
            .unwrap_or("https://github.com/TPower-Kerito/wow-addon-vault/releases")
            .to_string();

        let mut download_url = None;
        if let Some(assets) = json["assets"].as_array() {
            for asset in assets {
                let name = asset["name"].as_str().unwrap_or("");
                if name.ends_with(".exe") {
                    download_url = asset["browser_download_url"].as_str().map(|s| s.to_string());
                    break;
                }
            }
        }

        return Ok(Some(AppUpdateInfo {
            current_version,
            latest_version: tag_name,
            release_notes,
            download_url,
            html_url,
        }));
    }

    Ok(None)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            auto_detect_wow_path,
            get_addons,
            scan_disk_addons,
            import_scanned_addons,
            browse_addons,
            get_addon_details,
            add_addon_from_github,
            add_addon_from_wago,
            install_specific_version,
            install_or_update,
            check_all_updates,
            delete_addon,
            open_addons_folder,
            open_addon_folder,
            delete_addon_saved_variables,
            toggle_addon_ignore,
            set_addon_release_channel,
            check_app_update,
            open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
