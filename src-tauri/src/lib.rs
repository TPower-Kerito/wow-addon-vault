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

    // Deduplicate any duplicates that might have been saved previously
    let mut unique_addons: Vec<Addon> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut had_duplicates = false;
    for a in cleaned_addons {
        if seen_ids.insert(a.id.clone()) {
            unique_addons.push(a);
        } else {
            had_duplicates = true;
        }
    }

    if had_duplicates || modified {
        let _ = config::save_addons(&unique_addons);
    }

    unique_addons
}

#[tauri::command]
fn scan_disk_addons() -> Result<Vec<ScannedAddon>, String> {
    let settings = config::load_settings();
    scanner::scan_addons_folder(&settings.wow_path)
}

#[tauri::command]
async fn import_scanned_addons(scanned: Vec<ScannedAddon>) -> Result<Vec<Addon>, String> {
    let catalogue = sources::get_addon_catalogue().await;
    let index = sources::CatalogueIndex::build(&catalogue);

    let current_addons = config::load_addons();
    let converted = scanner::convert_scanned_to_addons_with_catalogue(scanned, Some(&index));

    // Preserve existing image_urls from current_addons
    let mut img_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for a in &current_addons {
        if let Some(img) = &a.image_url {
            img_cache.insert(a.id.clone(), img.clone());
            img_cache.insert(a.name.to_lowercase(), img.clone());
        }
    }

    let mut merged_addons = current_addons;

    for mut new_addon in converted {
        if new_addon.image_url.is_none() {
            if let Some(cached) = img_cache.get(&new_addon.id).or_else(|| img_cache.get(&new_addon.name.to_lowercase())) {
                new_addon.image_url = Some(cached.clone());
            }
        }

        // Match against existing addon to prevent duplicates
        let existing_pos = merged_addons.iter().position(|a| {
            a.id == new_addon.id
                || (a.repo.is_some() && a.repo == new_addon.repo)
                || (a.wago_slug.is_some() && a.wago_slug == new_addon.wago_slug)
                || a.name.eq_ignore_ascii_case(&new_addon.name)
                || a.folders.iter().any(|f| new_addon.folders.contains(f))
        });

        if let Some(pos) = existing_pos {
            let existing = &mut merged_addons[pos];
            for f in new_addon.folders {
                if !existing.folders.contains(&f) {
                    existing.folders.push(f);
                }
            }
            existing.folders.sort();
            existing.folders.dedup();

            // Upgrade source if new_addon matched GitHub or Tukui
            if existing.source == "wago" && (new_addon.source == "github" || new_addon.source == "tukui") {
                existing.source = new_addon.source;
                existing.id = new_addon.id;
                existing.repo = new_addon.repo;
            }

            if existing.installed_version.is_none() && new_addon.installed_version.is_some() {
                existing.installed_version = new_addon.installed_version;
            }
            if existing.image_url.is_none() && new_addon.image_url.is_some() {
                existing.image_url = new_addon.image_url;
            }
        } else {
            merged_addons.push(new_addon);
        }
    }

    // Deduplicate by id
    let mut deduped: Vec<Addon> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    for a in merged_addons {
        if seen_ids.insert(a.id.clone()) {
            deduped.push(a);
        }
    }

    config::save_addons(&deduped)?;
    Ok(deduped)
}

#[tauri::command]
async fn browse_addons(
    page: u32,
    query: Option<String>,
    category: Option<String>,
) -> Result<Vec<WagoSearchResult>, String> {
    let settings = config::load_settings();
    sources::browse_addons_combined(page, query, category, settings.github_token.as_deref()).await
}

#[tauri::command]
async fn get_addon_details(slug_or_id: String) -> Result<AddonDetails, String> {
    let settings = config::load_settings();
    let clean_id = slug_or_id.clone();

    // 1. Tukui check
    if clean_id.starts_with("tukui:") || clean_id == "elvui" || clean_id == "tukui" {
        let slug = clean_id.trim_start_matches("tukui:");
        if let Ok(t) = sources::fetch_tukui_addon(slug).await {
            return Ok(AddonDetails {
                id: format!("tukui:{}", t.slug),
                name: t.name.clone(),
                author: t.author,
                summary: t.small_desc.unwrap_or_default(),
                description: t.desc.unwrap_or_else(|| "Tukui / ElvUI community addon.".to_string()),
                image_url: t.logo_url,
                screenshots: t.screenshot_url.into_iter().collect(),
                versions: vec![AddonVersion {
                    version: t.version.clone(),
                    game_version: "Retail".to_string(),
                    download_url: t.url.clone(),
                    release_date: t.last_update,
                    changelog: None,
                    stability: Some("Release".to_string()),
                }],
                download_url: Some(t.url),
                website_url: t.web_url,
                source: "tukui".to_string(),
                downloads: Some("Tukui Official".to_string()),
                latest_version: Some(t.version),
            });
        }
    }

    // 2. GitHub check
    if clean_id.starts_with("github:") {
        let repo = clean_id.trim_start_matches("github:");
        if let Ok((name, author, summary, ver, url)) = sources::fetch_github_release(
            repo,
            settings.github_token.as_deref(),
            settings.game_flavor.as_deref(),
        ).await {
            return Ok(AddonDetails {
                id: format!("github:{}", repo),
                name,
                author,
                summary: summary.clone(),
                description: summary,
                image_url: None,
                screenshots: Vec::new(),
                versions: vec![AddonVersion {
                    version: ver.clone(),
                    game_version: "Retail".to_string(),
                    download_url: url.clone(),
                    release_date: None,
                    changelog: None,
                    stability: Some("Release".to_string()),
                }],
                download_url: Some(url),
                website_url: Some(format!("https://github.com/{}", repo)),
                source: "github".to_string(),
                downloads: None,
                latest_version: Some(ver),
            });
        }
    }

    // 3. Wago / local details
    let slug = slug_or_id
        .trim_start_matches("wago:")
        .trim_start_matches("local:")
        .trim_start_matches("github:");

    match sources::fetch_wago_details(slug, settings.game_flavor.as_deref()).await {
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
                    website_url: local.repo.as_ref().map(|r| format!("https://github.com/{}", r)),
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
        settings.game_flavor.as_deref(),
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
    if slug.starts_with("github:") {
        return add_addon_from_github(slug.trim_start_matches("github:").to_string()).await;
    }
    if slug.starts_with("tukui:") {
        return add_addon_from_tukui(slug.trim_start_matches("tukui:").to_string()).await;
    }
    let settings = config::load_settings();
    let addon = sources::fetch_wago_addon(&slug, settings.game_flavor.as_deref()).await?;
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
async fn add_addon_from_tukui(slug: String) -> Result<Addon, String> {
    let t = sources::fetch_tukui_addon(&slug).await?;
    let folders = t.directories.clone().unwrap_or_else(|| vec![t.name.clone()]);
    let addon = Addon {
        id: format!("tukui:{}", t.slug),
        name: t.name,
        author: t.author,
        source: "tukui".to_string(),
        repo: None,
        wago_slug: None,
        installed_version: None,
        latest_version: Some(t.version),
        has_update: true,
        folders,
        download_url: Some(t.url),
        summary: t.small_desc,
        image_url: t.logo_url,
        updated_at: t.last_update,
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
async fn link_addon_source(
    addon_id: String,
    source: String,
    target: String,
) -> Result<Addon, String> {
    let settings = config::load_settings();
    let mut addons = config::load_addons();
    let idx = addons
        .iter()
        .position(|a| a.id == addon_id)
        .ok_or_else(|| "Addon not found in vault".to_string())?;

    let clean_target = target.trim();
    if clean_target.is_empty() {
        return Err("Target cannot be empty.".to_string());
    }

    let mut item = addons[idx].clone();

    if source == "github" {
        let clean_repo = clean_target
            .trim_start_matches("https://github.com/")
            .trim_end_matches('/')
            .trim_end_matches(".git")
            .to_string();

        if let Ok((name, _, summary, ver, url)) = sources::fetch_github_release(
            &clean_repo,
            settings.github_token.as_deref(),
            settings.game_flavor.as_deref(),
        ).await {
            item.name = name;
            item.source = "github".to_string();
            item.id = format!("github:{}", clean_repo);
            item.repo = Some(clean_repo);
            item.wago_slug = None;
            item.latest_version = Some(ver.clone());
            item.download_url = Some(url);
            item.summary = Some(summary);
            item.has_update = is_version_newer(item.installed_version.as_deref(), Some(&ver));
        } else {
            item.source = "github".to_string();
            item.id = format!("github:{}", clean_repo);
            item.repo = Some(clean_repo);
            item.wago_slug = None;
        }
    } else if source == "tukui" {
        let slug = clean_target
            .trim_start_matches("tukui:")
            .trim_start_matches("https://www.tukui.org/")
            .trim_start_matches("https://api.tukui.org/v1/addon/")
            .trim_end_matches('/');

        if let Ok(t) = sources::fetch_tukui_addon(slug).await {
            item.name = t.name;
            item.source = "tukui".to_string();
            item.id = format!("tukui:{}", t.slug);
            item.repo = None;
            item.wago_slug = None;
            item.latest_version = Some(t.version.clone());
            item.download_url = Some(t.url);
            item.image_url = t.logo_url;
            item.summary = t.small_desc;
            item.has_update = is_version_newer(item.installed_version.as_deref(), Some(&t.version));
        } else {
            item.source = "tukui".to_string();
            item.id = format!("tukui:{}", slug);
            item.repo = None;
            item.wago_slug = None;
        }
    } else if source == "wago" {
        let slug = clean_target
            .trim_start_matches("wago:")
            .trim_start_matches("https://addons.wago.io/addons/")
            .trim_end_matches('/');

        if let Ok(wago) = sources::fetch_wago_addon(slug, settings.game_flavor.as_deref()).await {
            item.name = wago.name;
            item.source = "wago".to_string();
            item.id = format!("wago:{}", slug);
            item.wago_slug = Some(slug.to_string());
            item.repo = None;
            item.latest_version = wago.latest_version.clone();
            item.download_url = wago.download_url;
            item.image_url = wago.image_url;
            item.summary = wago.summary;
            item.has_update = is_version_newer(item.installed_version.as_deref(), wago.latest_version.as_deref());
        } else {
            item.source = "wago".to_string();
            item.id = format!("wago:{}", slug);
            item.wago_slug = Some(slug.to_string());
            item.repo = None;
        }
    } else {
        return Err("Invalid source type. Supported: github, wago, tukui".to_string());
    }

    addons[idx] = item.clone();
    config::save_addons(&addons)?;
    Ok(item)
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

fn parse_version_parts(v: &str) -> Vec<u64> {
    let norm = normalize_version_str(v);
    norm.split(|c: char| c == '.' || c == '-' || c == '_')
        .filter_map(|p| p.parse::<u64>().ok())
        .collect()
}

fn is_version_newer(installed: Option<&str>, latest: Option<&str>) -> bool {
    let lat = match latest {
        Some(l) => l.trim(),
        None => return false,
    };
    if lat.is_empty() || lat == "-" || lat == "none" || lat.eq_ignore_ascii_case("unknown") {
        return false;
    }

    let inst = match installed {
        Some(i) => i.trim(),
        None => return true,
    };
    if inst.is_empty() {
        return true;
    }

    let inst_clean = inst.trim_start_matches(|c| c == 'v' || c == 'V').trim();
    let lat_clean = lat.trim_start_matches(|c| c == 'v' || c == 'V').trim();
    if inst_clean.eq_ignore_ascii_case(lat_clean) {
        return false;
    }

    let norm_inst = normalize_version_str(inst);
    let norm_lat = normalize_version_str(lat);

    if norm_inst.eq_ignore_ascii_case(&norm_lat) {
        return false;
    }

    let parts_inst = parse_version_parts(inst);
    let parts_lat = parse_version_parts(lat);

    if !parts_inst.is_empty() && !parts_lat.is_empty() {
        let max_len = parts_inst.len().max(parts_lat.len());
        for i in 0..max_len {
            let part_inst = parts_inst.get(i).copied().unwrap_or(0);
            let part_lat = parts_lat.get(i).copied().unwrap_or(0);
            if part_lat > part_inst {
                return true;
            } else if part_lat < part_inst {
                return false;
            }
        }
        return false;
    }

    norm_inst.to_lowercase() != norm_lat.to_lowercase()
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
            if let Ok((_, _, _, ver, url)) = sources::fetch_github_release(
                repo,
                settings.github_token.as_deref(),
                settings.game_flavor.as_deref(),
            ).await {
                target.latest_version = Some(ver);
                target.download_url = Some(url);
            }
        }
    } else if target.source == "tukui" {
        let slug = target.id.trim_start_matches("tukui:").to_string();
        if let Ok(t) = sources::fetch_tukui_addon(&slug).await {
            target.latest_version = Some(t.version);
            target.download_url = Some(t.url);
        }
    } else if target.source == "wago" {
        if let Some(slug) = &target.wago_slug {
            match sources::fetch_wago_addon(slug, settings.game_flavor.as_deref()).await {
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
    let addons = config::load_addons();

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
    let mut join_set = tokio::task::JoinSet::new();

    for (idx, mut addon) in addons.into_iter().enumerate() {
        let sem = semaphore.clone();
        let token = settings.github_token.clone();
        let flavor = settings.game_flavor.clone();

        join_set.spawn(async move {
            let _permit = sem.acquire().await;

            if addon.ignored.unwrap_or(false) {
                addon.has_update = false;
                return (idx, addon);
            }

            if addon.source == "github" {
                if let Some(repo) = &addon.repo {
                    if let Ok((_, _, _, ver, url)) = sources::fetch_github_release(
                        repo,
                        token.as_deref(),
                        flavor.as_deref(),
                    ).await {
                        let has_new = is_version_newer(addon.installed_version.as_deref(), Some(&ver));
                        addon.latest_version = Some(ver);
                        addon.download_url = Some(url);
                        addon.has_update = has_new;
                    }
                }
            } else if addon.source == "tukui" {
                let slug = addon.id.trim_start_matches("tukui:").to_string();
                if let Ok(t) = sources::fetch_tukui_addon(&slug).await {
                    let has_new = is_version_newer(addon.installed_version.as_deref(), Some(&t.version));
                    addon.latest_version = Some(t.version);
                    addon.download_url = Some(t.url);
                    addon.has_update = has_new;
                    if addon.image_url.is_none() && t.logo_url.is_some() {
                        addon.image_url = t.logo_url;
                    }
                }
            } else if addon.source == "wago" {
                if let Some(slug) = &addon.wago_slug {
                    if let Ok(wago_addon) = sources::fetch_wago_addon(slug, flavor.as_deref()).await {
                        let has_new = is_version_newer(
                            addon.installed_version.as_deref(),
                            wago_addon.latest_version.as_deref(),
                        ) && wago_addon.download_url.is_some();

                        addon.latest_version = wago_addon.latest_version;
                        addon.download_url = wago_addon.download_url;
                        addon.has_update = has_new;
                        if addon.image_url.is_none() && wago_addon.image_url.is_some() {
                            addon.image_url = wago_addon.image_url;
                        }
                    } else if addon.download_url.is_none() || addon.latest_version.is_none() {
                        addon.has_update = false;
                    }
                }
            }

            (idx, addon)
        });
    }

    let mut indexed_addons: Vec<(usize, Addon)> = Vec::new();
    while let Some(res) = join_set.join_next().await {
        if let Ok(item) = res {
            indexed_addons.push(item);
        }
    }

    indexed_addons.sort_by_key(|(idx, _)| *idx);
    let final_addons: Vec<Addon> = indexed_addons.into_iter().map(|(_, a)| a).collect();

    config::save_addons(&final_addons)?;
    Ok(final_addons)
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
            // First look for Setup installer
            for asset in assets {
                let name = asset["name"].as_str().unwrap_or("").to_lowercase();
                if name.contains("setup") && name.ends_with(".exe") {
                    download_url = asset["browser_download_url"].as_str().map(|s| s.to_string());
                    break;
                }
            }
            // Fallback to any .exe asset
            if download_url.is_none() {
                for asset in assets {
                    let name = asset["name"].as_str().unwrap_or("").to_lowercase();
                    if name.ends_with(".exe") {
                        download_url = asset["browser_download_url"].as_str().map(|s| s.to_string());
                        break;
                    }
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
#[allow(unreachable_code)]
async fn install_app_update(download_url: Option<String>) -> Result<(), String> {
    let url = download_url.ok_or_else(|| "No update download URL available.".to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("WoWAddonVault/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to download server: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with status: {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read update data: {}", e))?;

    if bytes.is_empty() {
        return Err("Downloaded update file was empty.".to_string());
    }

    let current_exe = std::env::current_exe().map_err(|e| format!("Cannot locate current executable: {}", e))?;
    let is_setup = url.to_lowercase().contains("setup");

    if is_setup {
        // Save installer into %TEMP%
        let temp_dir = std::env::temp_dir();
        let installer_path = temp_dir.join("WoW-Addon-Vault-Update-Setup.exe");
        tokio::fs::write(&installer_path, &bytes)
            .await
            .map_err(|e| format!("Failed to write installer file: {}", e))?;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", installer_path.to_str().unwrap_or("")])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn();

            std::process::exit(0);
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new(&installer_path).spawn();
            std::process::exit(0);
        }
    } else {
        // Portable executable in-place replacement
        let old_exe = current_exe.with_extension("exe.old");
        let _ = tokio::fs::remove_file(&old_exe).await;

        tokio::fs::rename(&current_exe, &old_exe)
            .await
            .map_err(|e| format!("Failed to prepare update: {}", e))?;

        if let Err(e) = tokio::fs::write(&current_exe, &bytes).await {
            let _ = tokio::fs::rename(&old_exe, &current_exe).await;
            return Err(format!("Failed to write new executable: {}", e));
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", current_exe.to_str().unwrap_or("")])
                .creation_flags(0x08000000)
                .spawn();

            std::process::exit(0);
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new(&current_exe).spawn();
            std::process::exit(0);
        }
    }

    Ok(())
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
    // Clean up any leftover .exe.old from previous in-place update
    if let Ok(current_exe) = std::env::current_exe() {
        let old_exe = current_exe.with_extension("exe.old");
        if old_exe.exists() {
            let _ = std::fs::remove_file(old_exe);
        }
    }

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
            add_addon_from_tukui,
            link_addon_source,
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
            install_app_update,
            open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_version_newer() {
        // Standard increments
        assert!(is_version_newer(Some("1.0.0"), Some("1.0.1")));
        assert!(is_version_newer(Some("1.0"), Some("1.0.1")));
        assert!(is_version_newer(Some("v1.0.0"), Some("v1.0.1")));
        assert!(is_version_newer(Some("1.2"), Some("1.2.1")));

        // Downgrades / older versions
        assert!(!is_version_newer(Some("1.0.1"), Some("1.0.0")));
        assert!(!is_version_newer(Some("1.2.1"), Some("1.2")));

        // Exact / equivalent versions
        assert!(!is_version_newer(Some("1.0.0"), Some("1.0.0")));
        assert!(!is_version_newer(Some("v1.0.0"), Some("1.0.0")));
        assert!(!is_version_newer(Some("1.2"), Some("1.2.0")));
        assert!(!is_version_newer(Some("1.2.0"), Some("1.2")));

        // Retail suffix / Flavor tag equality
        assert!(!is_version_newer(Some("Plater-v661-Retail"), Some("Plater-v661")));
        assert!(is_version_newer(Some("Plater-v661"), Some("Plater-v662")));
        assert!(!is_version_newer(Some("10.2.7-retail"), Some("10.2.7")));

        // Missing / empty values
        assert!(is_version_newer(None, Some("1.0.0")));
        assert!(is_version_newer(Some(""), Some("1.0.0")));
        assert!(!is_version_newer(Some("1.0.0"), None));
        assert!(!is_version_newer(Some("1.0.0"), Some("")));
        assert!(!is_version_newer(Some("1.0.0"), Some("-")));
        assert!(!is_version_newer(Some("1.0.0"), Some("none")));
    }

    #[test]
    fn test_catalogue_parsing_and_lookup() {
        let csv_data = "id,name,full_name,url,description,last_updated,flavors,curse_id,wago_id,wowi_id,has_release_json,last_seen\n\
78367104,Decursive,2072/Decursive,https://github.com/2072/Decursive,Decursive addon,2026-09-07,mainline,2154,,,True,2026-09-18\n\
144394027,HandyNotes_MoleMachine,AcidWeb/HandyNotes_MoleMachine,https://github.com/AcidWeb/HandyNotes_MoleMachine,Display mole machines,2026-04-22,mainline,,baNDD4No,24766,True,2026-09-18";

        let entries = sources::parse_catalogue_csv(csv_data);
        assert_eq!(entries.len(), 2);

        let index = sources::CatalogueIndex::build(&entries);

        // Lookup by curse_id
        let found_curse = index.lookup(Some("2154"), None, "RandomFolder");
        assert!(found_curse.is_some());
        assert_eq!(found_curse.unwrap().full_name, "2072/Decursive");

        // Lookup by wago_id
        let found_wago = index.lookup(None, Some("baNDD4No"), "RandomFolder");
        assert!(found_wago.is_some());
        assert_eq!(found_wago.unwrap().full_name, "AcidWeb/HandyNotes_MoleMachine");

        // Lookup by folder name
        let found_name = index.lookup(None, None, "Decursive");
        assert!(found_name.is_some());
        assert_eq!(found_name.unwrap().full_name, "2072/Decursive");
    }

    #[test]
    fn test_convert_scanned_with_catalogue_and_deduplication() {
        let csv_data = "id,name,full_name,url,description,last_updated,flavors,curse_id,wago_id,wowi_id,has_release_json,last_seen\n\
78367104,Decursive,2072/Decursive,https://github.com/2072/Decursive,Decursive addon,2026-09-07,mainline,2154,,,True,2026-09-18";
        let entries = sources::parse_catalogue_csv(csv_data);
        let index = sources::CatalogueIndex::build(&entries);

        let scanned = vec![
            ScannedAddon {
                folder_name: "Decursive".to_string(),
                folders: vec!["Decursive".to_string()],
                title: "Decursive".to_string(),
                version: "2.7.9".to_string(),
                author: "2072".to_string(),
                notes: None,
                wago_id: None,
                curse_id: Some("2154".to_string()),
            },
            ScannedAddon {
                folder_name: "ElvUI".to_string(),
                folders: vec!["ElvUI".to_string(), "ElvUI_Libraries".to_string(), "ElvUI_Options".to_string()],
                title: "ElvUI".to_string(),
                version: "16.00".to_string(),
                author: "Elv".to_string(),
                notes: None,
                wago_id: None,
                curse_id: None,
            },
        ];

        let addons = scanner::convert_scanned_to_addons_with_catalogue(scanned, Some(&index));
        assert_eq!(addons.len(), 2);

        let decursive = addons.iter().find(|a| a.name == "Decursive").unwrap();
        assert_eq!(decursive.source, "github");
        assert_eq!(decursive.id, "github:2072/Decursive");
        assert_eq!(decursive.repo.as_deref(), Some("2072/Decursive"));

        let elvui = addons.iter().find(|a| a.name == "ElvUI").unwrap();
        assert_eq!(elvui.source, "tukui");
        assert_eq!(elvui.id, "tukui:elvui");
        assert_eq!(elvui.folders.len(), 3);
    }
}
