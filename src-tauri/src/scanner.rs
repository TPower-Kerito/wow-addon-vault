use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use crate::models::{Addon, ScannedAddon};

#[derive(Debug, Clone)]
struct RawTocInfo {
    folder_name: String,
    title: String,
    version: String,
    author: String,
    notes: Option<String>,
    wago_id: Option<String>,
    curse_id: Option<String>,
}

pub fn scan_addons_folder(wow_path: &str) -> Result<Vec<ScannedAddon>, String> {
    if wow_path.trim().is_empty() {
        return Err("WoW path is not configured.".to_string());
    }

    let p = Path::new(wow_path.trim());
    let addons_dir: PathBuf = if p.ends_with("AddOns") {
        p.to_path_buf()
    } else if p.join("Interface").join("AddOns").exists() {
        p.join("Interface").join("AddOns")
    } else {
        return Err(format!("Interface/AddOns directory not found in '{}'", wow_path));
    };

    if !addons_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&addons_dir)
        .map_err(|e| format!("Failed to read AddOns directory: {}", e))?;

    let mut raw_list = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        // Skip Blizzard built-in addons
        if folder_name.starts_with("Blizzard_") {
            continue;
        }

        if let Some(info) = parse_addon_dir(&path, &folder_name) {
            raw_list.push(info);
        }
    }

    let grouped = group_submodules(raw_list);
    Ok(grouped)
}

fn group_submodules(raw_list: Vec<RawTocInfo>) -> Vec<ScannedAddon> {
    let mut info_map: HashMap<String, RawTocInfo> = HashMap::new();
    for item in &raw_list {
        info_map.insert(item.folder_name.clone(), item.clone());
    }

    let all_folders: Vec<String> = raw_list.iter().map(|r| r.folder_name.clone()).collect();
    let mut root_to_folders: HashMap<String, Vec<String>> = HashMap::new();
    let mut assigned: HashSet<String> = HashSet::new();

    // 1. Special case: DBM (Deadly Boss Mods has 25+ folders like DBM-Core, DBM-GUI, DBM-Party-*, DBM-Raids-*)
    let dbm_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| f.starts_with("DBM-") || f.starts_with("DBM_") || *f == "DBM")
        .cloned()
        .collect();

    if !dbm_folders.is_empty() {
        let root = if dbm_folders.contains(&"DBM-Core".to_string()) {
            "DBM-Core".to_string()
        } else {
            dbm_folders[0].clone()
        };

        for f in &dbm_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, dbm_folders);
    }

    // 2. Special case: BigWigs (BigWigs, BigWigs_Core, BigWigs_Options, BigWigs_Plugins...)
    let bw_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| (f.starts_with("BigWigs_") || *f == "BigWigs") && !assigned.contains(*f))
        .cloned()
        .collect();

    if !bw_folders.is_empty() {
        let root = if bw_folders.contains(&"BigWigs".to_string()) {
            "BigWigs".to_string()
        } else {
            bw_folders[0].clone()
        };

        for f in &bw_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, bw_folders);
    }

    // 3. Special case: LittleWigs (LittleWigs, LittleWigs_BattleForAzeroth, ...)
    let lw_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| (f.starts_with("LittleWigs_") || *f == "LittleWigs") && !assigned.contains(*f))
        .cloned()
        .collect();

    if !lw_folders.is_empty() {
        let root = if lw_folders.contains(&"LittleWigs".to_string()) {
            "LittleWigs".to_string()
        } else {
            lw_folders[0].clone()
        };

        for f in &lw_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, lw_folders);
    }

    // 4. Special case: RaiderIO (RaiderIO, RaiderIO_DB_*)
    let rio_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| (f.starts_with("RaiderIO_") || *f == "RaiderIO") && !assigned.contains(*f))
        .cloned()
        .collect();

    if !rio_folders.is_empty() {
        let root = if rio_folders.contains(&"RaiderIO".to_string()) {
            "RaiderIO".to_string()
        } else {
            rio_folders[0].clone()
        };

        for f in &rio_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, rio_folders);
    }

    // 5. Special case: Dominos (Dominos, Dominos_Cast, Dominos_Roll, Dominos_Config...)
    let dom_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| (f.starts_with("Dominos_") || *f == "Dominos") && !assigned.contains(*f))
        .cloned()
        .collect();

    if !dom_folders.is_empty() {
        let root = if dom_folders.contains(&"Dominos".to_string()) {
            "Dominos".to_string()
        } else {
            dom_folders[0].clone()
        };

        for f in &dom_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, dom_folders);
    }

    // 6. Special case: ElvUI (ElvUI, ElvUI_Libraries, ElvUI_Options)
    let elv_folders: Vec<String> = all_folders
        .iter()
        .filter(|f| (f.starts_with("ElvUI_") || *f == "ElvUI") && !assigned.contains(*f))
        .cloned()
        .collect();

    if !elv_folders.is_empty() {
        let root = if elv_folders.contains(&"ElvUI".to_string()) {
            "ElvUI".to_string()
        } else {
            elv_folders[0].clone()
        };

        for f in &elv_folders {
            assigned.insert(f.clone());
        }
        root_to_folders.insert(root, elv_folders);
    }

    // 6. Generic prefix and suffix grouping for remaining folders
    let mut remaining: Vec<String> = all_folders
        .iter()
        .filter(|f| !assigned.contains(*f))
        .cloned()
        .collect();
    remaining.sort_by_key(|f| f.len());

    for folder in &remaining {
        if assigned.contains(folder) {
            continue;
        }

        let mut parent_found = None;

        // Check if starts with any already registered root
        for root in root_to_folders.keys() {
            if folder.starts_with(&format!("{}_", root)) || folder.starts_with(&format!("{}-", root)) {
                parent_found = Some(root.clone());
                break;
            }
        }

        // Check if starts with any other root folder
        if parent_found.is_none() {
            for other in &remaining {
                if other != folder
                    && (folder.starts_with(&format!("{}_", other))
                        || folder.starts_with(&format!("{}-", other)))
                {
                    parent_found = Some(other.clone());
                    break;
                }
            }
        }

        // Check common suffixes (_UI, _Options, _Config, _Data, _Backup, _Debug)
        if parent_found.is_none() {
            for suffix in &["_UI", "_Options", "_Config", "_Data", "_Backup", "_Debug"] {
                if folder.ends_with(suffix) {
                    let base = &folder[..folder.len() - suffix.len()];
                    if info_map.contains_key(base) {
                        parent_found = Some(base.to_string());
                        break;
                    }
                }
            }
        }

        if let Some(p) = parent_found {
            root_to_folders.entry(p.clone()).or_default().push(folder.clone());
            assigned.insert(folder.clone());
            assigned.insert(p);
        } else {
            root_to_folders.insert(folder.clone(), vec![folder.clone()]);
            assigned.insert(folder.clone());
        }
    }

    // Build the final clean list
    let mut result = Vec::new();
    for (root, mut folders) in root_to_folders {
        folders.sort();
        folders.dedup();

        if let Some(root_info) = info_map.get(&root) {
            let mut display_title = root_info.title.clone();

            // Nice readable titles for well-known giants
            if root == "DBM-Core" || root.starts_with("DBM") {
                display_title = "Deadly Boss Mods (DBM)".to_string();
            } else if root == "BigWigs" {
                display_title = "BigWigs (Boss Timers & Tools)".to_string();
            } else if root == "LittleWigs" {
                display_title = "LittleWigs".to_string();
            } else if root == "RaiderIO" {
                display_title = "Raider.IO".to_string();
            } else if root == "MythicDungeonTools" {
                display_title = "Mythic Dungeon Tools (MDT)".to_string();
            }

            result.push(ScannedAddon {
                folder_name: root.clone(),
                folders,
                title: display_title,
                version: root_info.version.clone(),
                author: root_info.author.clone(),
                notes: root_info.notes.clone(),
                wago_id: root_info.wago_id.clone(),
                curse_id: root_info.curse_id.clone(),
            });
        }
    }

    result.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    result
}

fn parse_addon_dir(dir: &Path, folder_name: &str) -> Option<RawTocInfo> {
    let primary_toc = dir.join(format!("{}.toc", folder_name));
    let toc_path = if primary_toc.exists() {
        primary_toc
    } else {
        let mut found = None;
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("toc")) {
                    found = Some(p);
                    break;
                }
            }
        }
        found?
    };

    let content = fs::read_to_string(&toc_path).ok()?;
    let mut title = folder_name.to_string();
    let mut version = "1.0.0".to_string();
    let mut author = "Unknown".to_string();
    let mut notes = None;
    let mut wago_id = None;
    let mut curse_id = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("##") {
            continue;
        }

        let header_content = trimmed.trim_start_matches('#').trim();
        if let Some((key, val)) = header_content.split_once(':') {
            let key = key.trim();
            let val = val.trim();

            match key.to_lowercase().as_str() {
                "title" => title = clean_wow_text(val),
                "version" => version = clean_wow_text(val),
                "author" => author = clean_wow_text(val),
                "notes" => notes = Some(clean_wow_text(val)),
                "x-wago-id" => wago_id = Some(val.to_string()),
                "x-curse-project-id" | "x-curse-id" => curse_id = Some(val.to_string()),
                _ => {}
            }
        }
    }

    Some(RawTocInfo {
        folder_name: folder_name.to_string(),
        title,
        version,
        author,
        notes,
        wago_id,
        curse_id,
    })
}

fn clean_wow_text(text: &str) -> String {
    let mut out = String::new();
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '|' {
            if let Some(&next) = chars.peek() {
                if next == 'c' || next == 'C' {
                    chars.next();
                    for _ in 0..8 {
                        chars.next();
                    }
                    continue;
                } else if next == 'r' || next == 'R' {
                    chars.next();
                    continue;
                }
            }
        }
        out.push(c);
    }

    out.trim().to_string()
}

pub fn convert_scanned_to_addons_with_catalogue(
    scanned_list: Vec<ScannedAddon>,
    index: Option<&crate::sources::CatalogueIndex>,
) -> Vec<Addon> {
    let mut mapped_addons: Vec<Addon> = Vec::new();

    for s in scanned_list {
        let folder_lower = s.folder_name.to_lowercase();
        let title_lower = s.title.to_lowercase();

        let mut matched_source = "wago".to_string();
        let mut matched_id = format!("local:{}", s.folder_name);
        let mut matched_repo = None;
        let mut matched_wago_slug = s.wago_id.clone();
        let mut matched_image = None;
        let mut matched_summary = s.notes.clone();

        // 1. Match ElvUI / Tukui
        if folder_lower == "elvui"
            || title_lower == "elvui"
            || s.folders.iter().any(|f| f.eq_ignore_ascii_case("elvui"))
        {
            matched_source = "tukui".to_string();
            matched_id = "tukui:elvui".to_string();
            matched_image = Some("https://storage.tukui.org/ElvUI-Logo.png".to_string());
        } else if folder_lower == "tukui"
            || title_lower == "tukui"
            || s.folders.iter().any(|f| f.eq_ignore_ascii_case("tukui"))
        {
            matched_source = "tukui".to_string();
            matched_id = "tukui:tukui".to_string();
            matched_image = Some("https://storage.tukui.org/Tukui-Logo.png".to_string());
        } else if let Some(idx) = index {
            // 2. Lookup in GitHub Catalogue
            if let Some(entry) = idx
                .lookup(s.curse_id.as_deref(), s.wago_id.as_deref(), &s.folder_name)
                .or_else(|| idx.lookup(s.curse_id.as_deref(), s.wago_id.as_deref(), &s.title))
            {
                matched_source = "github".to_string();
                matched_id = format!("github:{}", entry.full_name);
                matched_repo = Some(entry.full_name.clone());
                matched_wago_slug = entry.wago_id.clone().or_else(|| s.wago_id.clone());
                if matched_summary.is_none() || matched_summary.as_deref() == Some("") {
                    matched_summary = entry.description.clone();
                }
            }
        }

        // 3. Fallbacks for giants if not yet matched
        if matched_source == "wago" && matched_repo.is_none() {
            if folder_lower == "dbm-core"
                || folder_lower == "dbm"
                || s.folders.iter().any(|f| f.eq_ignore_ascii_case("dbm-core"))
            {
                matched_source = "github".to_string();
                matched_id = "github:DeadlyBossMods/DBM-Retail".to_string();
                matched_repo = Some("DeadlyBossMods/DBM-Retail".to_string());
            } else if folder_lower == "details"
                || s.folders.iter().any(|f| f.eq_ignore_ascii_case("details"))
            {
                matched_source = "wago".to_string();
                matched_id = "wago:details".to_string();
                matched_wago_slug = Some("details".to_string());
            } else if let Some(wid) = &s.wago_id {
                matched_source = "wago".to_string();
                matched_id = format!("wago:{}", wid);
                matched_wago_slug = Some(wid.clone());
            } else {
                let fallback_slug = s
                    .folder_name
                    .to_lowercase()
                    .replace(' ', "-")
                    .replace(|c: char| !c.is_alphanumeric() && c != '-', "");
                matched_wago_slug = Some(fallback_slug);
            }
        }

        mapped_addons.push(Addon {
            id: matched_id,
            name: s.title,
            author: s.author,
            source: matched_source,
            repo: matched_repo,
            wago_slug: matched_wago_slug,
            installed_version: Some(s.version.clone()),
            latest_version: Some(s.version),
            has_update: false,
            folders: s.folders,
            download_url: None,
            summary: matched_summary,
            image_url: matched_image,
            updated_at: None,
            ignored: None,
            release_channel: None,
        });
    }

    // Deduplicate and merge submodules that map to the same addon id
    let mut by_id: HashMap<String, Addon> = HashMap::new();
    for addon in mapped_addons {
        if let Some(existing) = by_id.get_mut(&addon.id) {
            for f in addon.folders {
                if !existing.folders.contains(&f) {
                    existing.folders.push(f);
                }
            }
            existing.folders.sort();
            existing.folders.dedup();
            if existing.installed_version.is_none() && addon.installed_version.is_some() {
                existing.installed_version = addon.installed_version;
            }
            if existing.image_url.is_none() && addon.image_url.is_some() {
                existing.image_url = addon.image_url;
            }
        } else {
            by_id.insert(addon.id.clone(), addon);
        }
    }

    let mut result: Vec<Addon> = by_id.into_values().collect();
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    result
}

pub fn convert_scanned_to_addons(scanned_list: Vec<ScannedAddon>) -> Vec<Addon> {
    convert_scanned_to_addons_with_catalogue(scanned_list, None)
}
