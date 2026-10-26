use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};
use zip::ZipArchive;
use crate::models::Addon;

pub async fn install_or_update_addon(
    addon: &mut Addon,
    wow_path: &str,
    github_token: Option<&str>,
) -> Result<(), String> {
    let download_url = addon
        .download_url
        .as_ref()
        .ok_or_else(|| "No download URL available for this addon".to_string())?;

    let addons_dir = get_interface_addons_dir(wow_path)?;

    // Download the zip bytes
    let client = reqwest::Client::new();
    let mut req = client
        .get(download_url)
        .header("User-Agent", "WoWAddonVault/1.0");

    if addon.source == "github" {
        if let Some(token) = github_token {
            if !token.trim().is_empty() {
                req = req.header("Authorization", format!("Bearer {}", token.trim()));
            }
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Failed to download addon: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with HTTP {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read addon archive: {}", e))?;

    // Extract zip
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("Invalid zip archive: {}", e))?;

    let mut installed_folders = HashSet::new();

    // Check if the zip has a single wrapper folder (common in GitHub zipballs like repo-master/...)
    let root_entries: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();

    let is_wrapped_zipball = detect_github_zipball_wrapper(&root_entries);

    // Safely delete previous addon folders before extracting new files
    if !addon.folders.is_empty() {
        let _ = delete_addon_files(addon, wow_path);
    }

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Corrupt zip entry: {}", e))?;

        let raw_name = file.name().to_string();

        // Adjust path if wrapped inside a github root folder
        let relative_path_str = if let Some(wrapper) = &is_wrapped_zipball {
            if raw_name.starts_with(wrapper) {
                raw_name[wrapper.len()..].to_string()
            } else {
                raw_name.clone()
            }
        } else {
            raw_name.clone()
        };

        let trimmed_relative = relative_path_str
            .replace('\\', "/")
            .trim_start_matches('/')
            .to_string();

        if trimmed_relative.is_empty() {
            continue;
        }

        let rel_path = Path::new(&trimmed_relative);

        // Security: Zip-Slip protection - ensure every component is Normal (no ParentDir, RootDir, Prefix)
        let is_safe = rel_path.components().all(|c| matches!(c, std::path::Component::Normal(_)));
        if !is_safe {
            continue;
        }

        let out_path = addons_dir.join(rel_path);

        // Double-check: ensure resolved out_path starts with addons_dir
        if !out_path.starts_with(&addons_dir) {
            continue;
        }

        // Record the top-level folder name inside Interface/AddOns
        if let Some(first_component) = rel_path.components().next() {
            let folder_name = first_component.as_os_str().to_string_lossy().to_string();
            if !folder_name.is_empty() {
                installed_folders.insert(folder_name);
            }
        }

        if file.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory {}: {}", out_path.display(), e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create parent dir {}: {}", parent.display(), e)
                })?;
            }

            let mut outfile = File::create(&out_path)
                .map_err(|e| format!("Failed to create file {}: {}", out_path.display(), e))?;

            io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file {}: {}", out_path.display(), e))?;
        }
    }

    if !installed_folders.is_empty() {
        addon.folders = installed_folders.into_iter().collect();
    }
    addon.installed_version = addon.latest_version.clone();
    addon.has_update = false;

    Ok(())
}

pub fn delete_addon_files(addon: &Addon, wow_path: &str) -> Result<(), String> {
    let addons_dir = get_interface_addons_dir(wow_path)?;

    for folder in &addon.folders {
        let clean_folder = folder.trim().replace('\\', "/");
        // Prevent accidental deletion of whole AddOns directory or path traversal
        if clean_folder.is_empty()
            || clean_folder == "."
            || clean_folder == ".."
            || clean_folder.contains('/')
            || clean_folder.contains("..")
        {
            continue;
        }

        let target = addons_dir.join(&clean_folder);
        if target.exists() && target.is_dir() && target != addons_dir && target.starts_with(&addons_dir) {
            fs::remove_dir_all(&target)
                .map_err(|e| format!("Failed to delete folder {}: {}", target.display(), e))?;
        }
    }

    Ok(())
}

fn get_interface_addons_dir(wow_path: &str) -> Result<PathBuf, String> {
    if wow_path.trim().is_empty() {
        return Err("WoW directory is not configured. Please select your WoW path in Settings.".to_string());
    }

    let p = Path::new(wow_path.trim());
    if !p.exists() {
        return Err(format!("The path '{}' does not exist.", wow_path));
    }

    // If path already ends with Interface/AddOns
    let addons_dir = if p.ends_with("AddOns") {
        p.to_path_buf()
    } else if p.join("Interface").join("AddOns").exists() {
        p.join("Interface").join("AddOns")
    } else {
        // Create Interface/AddOns if inside _retail_ or root
        let target = p.join("Interface").join("AddOns");
        let _ = fs::create_dir_all(&target);
        target
    };

    Ok(addons_dir)
}

fn detect_github_zipball_wrapper(entries: &[String]) -> Option<String> {
    if entries.is_empty() {
        return None;
    }

    // Find the first path component of the first entry
    let first = entries[0].replace('\\', "/");
    let pos = first.find('/')?;
    let potential_prefix = &first[..=pos]; // e.g. "repo-master/"

    // Condition 1: All entries must start with the same parent folder
    let all_start_with_prefix = entries.iter().all(|e| {
        let norm = e.replace('\\', "/");
        norm.starts_with(potential_prefix)
    });

    if !all_start_with_prefix {
        return None;
    }

    let mut has_direct_toc = false;
    let mut has_subfolder_toc = false;

    for entry in entries {
        let norm = entry.replace('\\', "/");
        if !norm.starts_with(potential_prefix) {
            continue;
        }

        let remainder = &norm[potential_prefix.len()..];
        if remainder.is_empty() {
            continue;
        }

        if remainder.to_lowercase().ends_with(".toc") {
            // Check if there is another slash in remainder (i.e. inside a subfolder)
            if remainder.contains('/') {
                has_subfolder_toc = true;
            } else {
                has_direct_toc = true;
            }
        }
    }

    // Condition 2 & 3: NO direct .toc inside parent, and at least one .toc inside a subfolder
    if !has_direct_toc && has_subfolder_toc {
        Some(potential_prefix.to_string())
    } else {
        None
    }
}
