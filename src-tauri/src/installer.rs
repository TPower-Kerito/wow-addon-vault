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

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Corrupt zip entry: {}", e))?;

        let raw_name = file.name().to_string();
        if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.starts_with('\\') {
            continue; // Security: prevent path traversal
        }

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

        let trimmed_relative = relative_path_str.trim_start_matches(|c| c == '/' || c == '\\');
        if trimmed_relative.is_empty() {
            continue;
        }

        let out_path = addons_dir.join(trimmed_relative);

        // Record the top-level folder name inside Interface/AddOns
        if let Some(first_component) = Path::new(trimmed_relative).components().next() {
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
        // Prevent accidental deletion of whole AddOns directory
        if folder.trim().is_empty() || folder == "." || folder == ".." {
            continue;
        }

        let target = addons_dir.join(folder);
        if target.exists() && target.is_dir() {
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
    // GitHub zipball creates a folder like "owner-repo-7a4b1c/"
    let first = &entries[0];
    if let Some(pos) = first.find('/') {
        let potential_prefix = &first[..=pos];
        // Check if all entries start with this prefix
        if entries.iter().all(|e| e.starts_with(potential_prefix)) {
            return Some(potential_prefix.to_string());
        }
    }
    None
}
