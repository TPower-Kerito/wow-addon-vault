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

            match key {
                "Title" => title = clean_wow_text(val),
                "Version" => version = clean_wow_text(val),
                "Author" => author = clean_wow_text(val),
                "Notes" => notes = Some(clean_wow_text(val)),
                "X-Wago-ID" => wago_id = Some(val.to_string()),
                "X-Curse-Project-ID" => curse_id = Some(val.to_string()),
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

pub fn convert_scanned_to_addons(scanned_list: Vec<ScannedAddon>) -> Vec<Addon> {
    scanned_list
        .into_iter()
        .map(|s| {
            let slug = s.wago_id.clone().unwrap_or_else(|| {
                s.folder_name
                    .to_lowercase()
                    .replace(' ', "-")
                    .replace(|c: char| !c.is_alphanumeric() && c != '-', "")
            });

            Addon {
                id: format!("local:{}", s.folder_name),
                name: s.title,
                author: s.author,
                source: "wago".to_string(),
                repo: None,
                wago_slug: Some(slug),
                installed_version: Some(s.version.clone()),
                latest_version: Some(s.version),
                has_update: false,
                folders: s.folders,
                download_url: None,
                summary: s.notes,
                image_url: None,
                updated_at: None,
                ignored: None,
                release_channel: None,
            }
        })
        .collect()
}
