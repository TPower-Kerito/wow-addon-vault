use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde_json::Value;
use crate::models::{Addon, AddonDetails, AddonVersion, CatalogueEntry, TukuiAddon, WagoSearchResult};
use std::fs;
use std::time::{Duration, SystemTime};

pub async fn fetch_github_release(
    repo: &str,
    token: Option<&str>,
    game_flavor: Option<&str>,
) -> Result<(String, String, String, String, String), String> {
    let clean_repo = repo
        .trim()
        .trim_start_matches("https://github.com/")
        .trim_end_matches('/')
        .trim_end_matches(".git");

    if !clean_repo.contains('/') {
        return Err("Invalid GitHub repo format. Use 'owner/repo'".to_string());
    }

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("WoWAddonVault/1.0"));
    if let Some(t) = token {
        if !t.trim().is_empty() {
            if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", t.trim())) {
                headers.insert("Authorization", val);
            }
        }
    }

    let repo_url = format!("https://api.github.com/repos/{}", clean_repo);
    let repo_res = client
        .get(&repo_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("GitHub request failed: {}", e))?;

    if !repo_res.status().is_success() {
        return Err(format!("GitHub repo error: HTTP {}", repo_res.status()));
    }

    let repo_json: Value = repo_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub repo response: {}", e))?;

    let name = repo_json["name"]
        .as_str()
        .unwrap_or(clean_repo)
        .to_string();
    let author = repo_json["owner"]["login"]
        .as_str()
        .unwrap_or("Unknown")
        .to_string();
    let summary = repo_json["description"]
        .as_str()
        .unwrap_or("GitHub WoW Addon")
        .to_string();

    let release_url = format!("https://api.github.com/repos/{}/releases/latest", clean_repo);
    let rel_res = client
        .get(&release_url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("GitHub release request failed: {}", e))?;

    if !rel_res.status().is_success() {
        return Err(format!(
            "No published releases found for '{}'. Make sure you created a Release with a .zip asset.",
            clean_repo
        ));
    }

    let rel_json: Value = rel_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release: {}", e))?;

    let version = rel_json["tag_name"]
        .as_str()
        .unwrap_or("latest")
        .to_string();

    let flavor = game_flavor.unwrap_or("retail").to_lowercase();
    let mut download_url = None;

    if let Some(assets) = rel_json["assets"].as_array() {
        let zip_assets: Vec<(String, String)> = assets
            .iter()
            .filter_map(|asset| {
                let name = asset["name"].as_str()?.to_lowercase();
                let url = asset["browser_download_url"].as_str()?.to_string();
                if name.ends_with(".zip") {
                    Some((name, url))
                } else {
                    None
                }
            })
            .collect();

        if !zip_assets.is_empty() {
            if flavor == "classic" || flavor == "forever" {
                // Prefer classic / era / vanilla assets
                if let Some((_, url)) = zip_assets.iter().find(|(name, _)| {
                    name.contains("classic")
                        || name.contains("era")
                        || name.contains("forever")
                        || name.contains("vanilla")
                }) {
                    download_url = Some(url.clone());
                }
            } else {
                // Retail: Prefer asset containing "retail" or WITHOUT classic/era tags
                if let Some((_, url)) = zip_assets.iter().find(|(name, _)| name.contains("retail")) {
                    download_url = Some(url.clone());
                } else if let Some((_, url)) = zip_assets.iter().find(|(name, _)| {
                    !name.contains("classic")
                        && !name.contains("era")
                        && !name.contains("bcc")
                        && !name.contains("tbc")
                        && !name.contains("cata")
                        && !name.contains("wotlk")
                        && !name.contains("vanilla")
                }) {
                    download_url = Some(url.clone());
                }
            }

            // Fallback to first zip if flavor-specific match not found
            if download_url.is_none() {
                download_url = Some(zip_assets[0].1.clone());
            }
        }
    }

    let final_download_url = download_url
        .or_else(|| rel_json["zipball_url"].as_str().map(|s| s.to_string()))
        .ok_or_else(|| "Could not find a downloadable zip asset in this release".to_string())?;

    Ok((name, author, summary, version, final_download_url))
}

pub async fn fetch_wago_addon(slug_or_url: &str, game_flavor: Option<&str>) -> Result<Addon, String> {
    let slug = slug_or_url
        .trim()
        .trim_start_matches("https://addons.wago.io/addons/")
        .trim_end_matches('/');

    let details = fetch_wago_details(slug, game_flavor).await?;

    Ok(Addon {
        id: format!("wago:{}", slug),
        name: details.name,
        author: details.author,
        source: "wago".to_string(),
        repo: None,
        wago_slug: Some(slug.to_string()),
        installed_version: None,
        latest_version: details.latest_version,
        has_update: true,
        folders: Vec::new(),
        download_url: details.download_url,
        summary: Some(details.summary),
        image_url: details.image_url,
        updated_at: None,
        ignored: None,
        release_channel: None,
    })
}

pub async fn browse_wago(
    page: u32,
    query: Option<String>,
    category: Option<String>,
) -> Result<Vec<WagoSearchResult>, String> {
    let mut url = format!("https://addons.wago.io/?page={}", page);
    if let Some(q) = query {
        if !q.trim().is_empty() {
            url.push_str(&format!("&search={}", urlencoding(q.trim())));
        }
    }
    if let Some(cat) = category {
        if !cat.trim().is_empty() && cat != "all" {
            url.push_str(&format!("&category={}", urlencoding(cat.trim())));
        }
    }

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("User-Agent", "WoWAddonVault/1.0")
        .header("X-Inertia", "true")
        .header("X-Inertia-Version", "c6db0d1fefc7506d695898e263277ce5")
        .send()
        .await
        .map_err(|e| format!("Wago catalog error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Wago catalog returned HTTP {}", res.status()));
    }

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Wago catalog JSON: {}", e))?;

    let mut results = Vec::new();
    if let Some(items) = json["props"]["addons"]["data"].as_array() {
        for item in items {
            if let Some(html) = item.as_str() {
                if let Some(parsed) = parse_wago_search_card(html) {
                    results.push(parsed);
                }
            }
        }
    }

    Ok(results)
}

// ----------------------------------------------------
// Open GitHub WoW Addon Catalogue (layday/github-wow-addon-catalogue)
// ----------------------------------------------------

pub fn parse_catalogue_csv(content: &str) -> Vec<CatalogueEntry> {
    let mut entries = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = content.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                current_field.push('"');
                chars.next();
            } else {
                in_quotes = !in_quotes;
            }
        } else if c == ',' && !in_quotes {
            current_row.push(current_field.trim().to_string());
            current_field.clear();
        } else if (c == '\n' || c == '\r') && !in_quotes {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            current_row.push(current_field.trim().to_string());
            current_field.clear();
            if !current_row.is_empty() && (current_row.len() > 1 || !current_row[0].is_empty()) {
                rows.push(std::mem::take(&mut current_row));
            }
        } else {
            current_field.push(c);
        }
    }
    if !current_field.is_empty() || !current_row.is_empty() {
        current_row.push(current_field.trim().to_string());
        rows.push(current_row);
    }

    if rows.is_empty() {
        return entries;
    }

    // Header: id,name,full_name,url,description,last_updated,flavors,curse_id,wago_id,wowi_id,has_release_json,last_seen
    for row in rows.into_iter().skip(1) {
        if row.len() >= 4 {
            let name = row.get(1).cloned().unwrap_or_default();
            let full_name = row.get(2).cloned().unwrap_or_default();
            let url = row.get(3).cloned().unwrap_or_default();
            let description = row.get(4).filter(|s| !s.is_empty()).cloned();
            let curse_id = row.get(7).filter(|s| !s.is_empty() && s.as_str() != "0").cloned();
            let wago_id = row.get(8).filter(|s| !s.is_empty() && s.as_str() != "0").cloned();

            if !full_name.is_empty() && !name.is_empty() {
                entries.push(CatalogueEntry {
                    name,
                    full_name,
                    url,
                    description,
                    curse_id,
                    wago_id,
                });
            }
        }
    }
    entries
}

pub async fn get_addon_catalogue() -> Vec<CatalogueEntry> {
    let cache_file = crate::config::get_app_dir().join("addon_catalogue.csv");
    let cache_valid = if cache_file.exists() {
        if let Ok(metadata) = fs::metadata(&cache_file) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                    elapsed < Duration::from_secs(24 * 3600) && metadata.len() > 1000
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    if cache_valid {
        if let Ok(content) = fs::read_to_string(&cache_file) {
            let entries = parse_catalogue_csv(&content);
            if !entries.is_empty() {
                return entries;
            }
        }
    }

    // Fetch from GitHub
    let client = reqwest::Client::new();
    let direct_url = "https://raw.githubusercontent.com/layday/github-wow-addon-catalogue/main/addons.csv";
    let resp = client
        .get(direct_url)
        .header(USER_AGENT, "WoWAddonVault/1.0")
        .send()
        .await;

    if let Ok(r) = resp {
        if r.status().is_success() {
            if let Ok(content) = r.text().await {
                if !content.trim().is_empty() {
                    let _ = fs::write(&cache_file, &content);
                    let entries = parse_catalogue_csv(&content);
                    if !entries.is_empty() {
                        return entries;
                    }
                }
            }
        }
    }

    // Fallback: GitHub releases API for latest release asset
    let rel_url = "https://api.github.com/repos/layday/github-wow-addon-catalogue/releases/latest";
    if let Ok(r) = client.get(rel_url).header(USER_AGENT, "WoWAddonVault/1.0").send().await {
        if r.status().is_success() {
            if let Ok(json) = r.json::<Value>().await {
                if let Some(assets) = json["assets"].as_array() {
                    for asset in assets {
                        let asset_name = asset["name"].as_str().unwrap_or("");
                        if asset_name.ends_with(".csv") {
                            if let Some(durl) = asset["browser_download_url"].as_str() {
                                if let Ok(asset_res) = client.get(durl).header(USER_AGENT, "WoWAddonVault/1.0").send().await {
                                    if asset_res.status().is_success() {
                                        if let Ok(content) = asset_res.text().await {
                                            let _ = fs::write(&cache_file, &content);
                                            return parse_catalogue_csv(&content);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Final fallback to cached file if exists
    if cache_file.exists() {
        if let Ok(content) = fs::read_to_string(&cache_file) {
            return parse_catalogue_csv(&content);
        }
    }

    Vec::new()
}

#[derive(Debug, Clone, Default)]
pub struct CatalogueIndex {
    pub by_curse_id: std::collections::HashMap<String, CatalogueEntry>,
    pub by_wago_id: std::collections::HashMap<String, CatalogueEntry>,
    pub by_name: std::collections::HashMap<String, CatalogueEntry>,
}

impl CatalogueIndex {
    pub fn build(entries: &[CatalogueEntry]) -> Self {
        let mut index = Self::default();
        for entry in entries {
            if let Some(cid) = &entry.curse_id {
                let clean_cid = cid.trim().to_string();
                if !clean_cid.is_empty() && clean_cid != "0" {
                    index.by_curse_id.insert(clean_cid, entry.clone());
                }
            }
            if let Some(wid) = &entry.wago_id {
                let clean_wid = wid.trim().to_string();
                if !clean_wid.is_empty() && clean_wid != "0" {
                    index.by_wago_id.insert(clean_wid, entry.clone());
                }
            }
            let clean_name = entry.name.trim().to_lowercase().replace(' ', "-").replace('_', "-");
            if !clean_name.is_empty() {
                index.by_name.insert(clean_name, entry.clone());
            }
            let raw_name = entry.name.trim().to_lowercase();
            if !raw_name.is_empty() {
                index.by_name.insert(raw_name, entry.clone());
            }
        }
        index
    }

    pub fn lookup(
        &self,
        curse_id: Option<&str>,
        wago_id: Option<&str>,
        folder_or_name: &str,
    ) -> Option<&CatalogueEntry> {
        if let Some(cid) = curse_id {
            let clean_cid = cid.trim();
            if !clean_cid.is_empty() && clean_cid != "0" {
                if let Some(found) = self.by_curse_id.get(clean_cid) {
                    return Some(found);
                }
            }
        }

        if let Some(wid) = wago_id {
            let clean_wid = wid.trim();
            if !clean_wid.is_empty() && clean_wid != "0" {
                if let Some(found) = self.by_wago_id.get(clean_wid) {
                    return Some(found);
                }
            }
        }

        let clean_name = folder_or_name.trim().to_lowercase();
        if let Some(found) = self.by_name.get(&clean_name) {
            return Some(found);
        }

        let dash_name = clean_name.replace('_', "-").replace(' ', "-");
        if let Some(found) = self.by_name.get(&dash_name) {
            return Some(found);
        }

        None
    }
}

// ----------------------------------------------------
// Tukui API Integration (https://api.tukui.org/v1)
// ----------------------------------------------------

pub async fn fetch_tukui_addons() -> Result<Vec<TukuiAddon>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.tukui.org/v1/addons")
        .header(USER_AGENT, "WoWAddonVault/1.0")
        .send()
        .await
        .map_err(|e| format!("Tukui API error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Tukui API returned HTTP {}", res.status()));
    }

    let addons: Vec<TukuiAddon> = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Tukui addons JSON: {}", e))?;

    Ok(addons)
}

pub async fn fetch_tukui_addon(slug: &str) -> Result<TukuiAddon, String> {
    let clean_slug = slug
        .trim()
        .trim_start_matches("tukui:")
        .trim_start_matches('/');

    let client = reqwest::Client::new();
    let url = format!("https://api.tukui.org/v1/addon/{}", clean_slug);
    let res = client
        .get(&url)
        .header(USER_AGENT, "WoWAddonVault/1.0")
        .send()
        .await
        .map_err(|e| format!("Tukui API error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Tukui addon '{}' not found (HTTP {})", clean_slug, res.status()));
    }

    let addon: TukuiAddon = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Tukui addon JSON: {}", e))?;

    Ok(addon)
}

// ----------------------------------------------------
// GitHub Search API Integration
// ----------------------------------------------------

pub async fn search_github_addons(
    query: &str,
    token: Option<&str>,
) -> Result<Vec<WagoSearchResult>, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("WoWAddonVault/1.0"));
    if let Some(t) = token {
        if !t.trim().is_empty() {
            if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", t.trim())) {
                headers.insert("Authorization", val);
            }
        }
    }

    let url = format!(
        "https://api.github.com/search/repositories?q={}+topic:wow-addon&sort=stars&order=desc&per_page=10",
        urlencoding(clean_query)
    );

    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("GitHub Search error: {}", e))?;

    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub search JSON: {}", e))?;

    let mut results = Vec::new();
    if let Some(items) = json["items"].as_array() {
        for item in items {
            let full_name = item["full_name"].as_str().unwrap_or("").to_string();
            let name = item["name"].as_str().unwrap_or("").to_string();
            let desc = item["description"].as_str().unwrap_or("GitHub WoW Addon").to_string();
            let author = item["owner"]["login"].as_str().unwrap_or("Unknown").to_string();
            let stars = item["stargazers_count"].as_u64().unwrap_or(0);
            let avatar = item["owner"]["avatar_url"].as_str().map(|s| s.to_string());

            if !full_name.is_empty() {
                results.push(WagoSearchResult {
                    name,
                    summary: desc,
                    slug: format!("github:{}", full_name),
                    author,
                    image_url: avatar,
                    downloads: Some(format!("⭐ {}", stars)),
                    updated_at: item["updated_at"].as_str().map(|s| s.to_string()),
                });
            }
        }
    }

    Ok(results)
}

// Combined Browse with Tukui + GitHub Catalogue + Wago
pub async fn browse_addons_combined(
    page: u32,
    query: Option<String>,
    category: Option<String>,
    github_token: Option<&str>,
) -> Result<Vec<WagoSearchResult>, String> {
    let mut combined: Vec<WagoSearchResult> = Vec::new();
    let q_str = query.as_deref().unwrap_or("").trim().to_lowercase();

    // 1. Check Tukui for matches
    if page == 1 {
        if let Ok(tukui_list) = fetch_tukui_addons().await {
            for t in tukui_list {
                let matches_q = q_str.is_empty()
                    || t.name.to_lowercase().contains(&q_str)
                    || t.slug.to_lowercase().contains(&q_str)
                    || t.small_desc.as_deref().unwrap_or("").to_lowercase().contains(&q_str);

                if matches_q {
                    combined.push(WagoSearchResult {
                        name: t.name,
                        summary: t.small_desc.unwrap_or_else(|| "Tukui/ElvUI community addon".to_string()),
                        slug: format!("tukui:{}", t.slug),
                        author: t.author,
                        image_url: t.logo_url,
                        downloads: Some("Tukui Official".to_string()),
                        updated_at: t.last_update,
                    });
                }
            }
        }
    }

    // 2. Search GitHub Catalogue
    let catalogue = get_addon_catalogue().await;
    if !q_str.is_empty() {
        let mut cat_matches = 0;
        for c in &catalogue {
            if c.name.to_lowercase().contains(&q_str)
                || c.description.as_deref().unwrap_or("").to_lowercase().contains(&q_str)
            {
                combined.push(WagoSearchResult {
                    name: c.name.clone(),
                    summary: c.description.clone().unwrap_or_else(|| format!("Open source addon on GitHub: {}", c.full_name)),
                    slug: format!("github:{}", c.full_name),
                    author: c.full_name.split('/').next().unwrap_or("GitHub").to_string(),
                    image_url: None,
                    downloads: Some("GitHub".to_string()),
                    updated_at: None,
                });
                cat_matches += 1;
                if cat_matches >= 15 {
                    break;
                }
            }
        }
    }

    // 3. GitHub Search API (if query provided and not too short)
    if !q_str.is_empty() && q_str.len() >= 3 && combined.len() < 10 {
        if let Ok(gh_results) = search_github_addons(&q_str, github_token).await {
            for g in gh_results {
                if !combined.iter().any(|existing| existing.slug.eq_ignore_ascii_case(&g.slug)) {
                    combined.push(g);
                }
            }
        }
    }

    // 4. Query Wago (if it works, merge its results)
    match browse_wago(page, query.clone(), category.clone()).await {
        Ok(wago_results) => {
            for w in wago_results {
                if !combined.iter().any(|existing| existing.name.eq_ignore_ascii_case(&w.name)) {
                    combined.push(w);
                }
            }
        }
        Err(err) => {
            log::warn!("Wago browse failed ({}), returning alternative catalog results", err);
        }
    }

    // If default page 1 and no query, ensure popular catalogue items are present if Wago was sparse
    if page == 1 && q_str.is_empty() && combined.len() < 10 {
        let popular_names = ["weakauras2", "bigwigs", "littlewigs", "plater-nameplates", "decursive", "mythicdungeontools", "raiderio-addon"];
        for pop in &popular_names {
            if let Some(c) = catalogue.iter().find(|entry| entry.name.to_lowercase() == *pop) {
                if !combined.iter().any(|item| item.name.to_lowercase() == c.name.to_lowercase()) {
                    combined.push(WagoSearchResult {
                        name: c.name.clone(),
                        summary: c.description.clone().unwrap_or_else(|| format!("GitHub repo: {}", c.full_name)),
                        slug: format!("github:{}", c.full_name),
                        author: c.full_name.split('/').next().unwrap_or("GitHub").to_string(),
                        image_url: None,
                        downloads: Some("GitHub".to_string()),
                        updated_at: None,
                    });
                }
            }
        }
    }

    Ok(combined)
}

pub async fn fetch_wago_details(slug: &str, game_flavor: Option<&str>) -> Result<AddonDetails, String> {
    let clean_slug = slug
        .trim()
        .trim_start_matches("https://addons.wago.io/addons/")
        .trim_end_matches('/');

    let flavor = game_flavor.unwrap_or("retail").to_lowercase();
    let client = reqwest::Client::new();

    // 1. Fetch Main Addon Details
    let main_url = format!("https://addons.wago.io/addons/{}", clean_slug);
    let res = client
        .get(&main_url)
        .header("User-Agent", "WoWAddonVault/1.0")
        .header("X-Inertia", "true")
        .header("X-Inertia-Version", "c6db0d1fefc7506d695898e263277ce5")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Wago details: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Wago addon not found (HTTP {})", res.status()));
    }

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Wago response: {}", e))?;

    let addon_obj = &json["props"]["addon"];
    let metadata_obj = &json["props"]["metadata"];
    let desc = json["props"]["description"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let name = addon_obj["display_name"]
        .as_str()
        .unwrap_or(clean_slug)
        .to_string();
    let summary = addon_obj["summary"].as_str().unwrap_or("").to_string();
    let author = metadata_obj["owner"]
        .as_str()
        .unwrap_or("Wago Author")
        .to_string();
    let downloads = metadata_obj["download_count"].as_u64().map(|n| n.to_string());

    let mut primary_download_url = None;
    let mut latest_version_str = None;

    // 2. Fetch Full Versions History
    let versions_url = format!("https://addons.wago.io/addons/{}/versions", clean_slug);
    let mut versions = Vec::new();

    if let Ok(v_res) = client
        .get(&versions_url)
        .header("User-Agent", "WoWAddonVault/1.0")
        .header("X-Inertia", "true")
        .header("X-Inertia-Version", "c6db0d1fefc7506d695898e263277ce5")
        .send()
        .await
    {
        if v_res.status().is_success() {
            if let Ok(v_json) = v_res.json::<Value>().await {
                if let Some(releases_data) = v_json["props"]["releases"]["data"].as_array() {
                    for r in releases_data {
                        let label = r["label"].as_str().unwrap_or("").to_string();
                        let dlink = r["download_link"].as_str().unwrap_or("").to_string();
                        if label.is_empty() || dlink.is_empty() {
                            continue;
                        }

                        let raw_stability = r["stability"].as_str().unwrap_or("stable");
                        let stability = match raw_stability.to_lowercase().as_str() {
                            "alpha" => "Alpha",
                            "beta" => "Beta",
                            _ => "Release",
                        };

                        let changelog = r["changelog"].as_str().map(|s| s.to_string());
                        let created_at = r["created_at"].as_str().map(|s| {
                            // Extract YYYY-MM-DD
                            s.split('T').next().unwrap_or(s).to_string()
                        });

                        // Detect game version compatibility
                        let mut game_version = "Retail".to_string();
                        if let Some(forever_patches) = r["supported_forever_patches"].as_array() {
                            if !forever_patches.is_empty() {
                                game_version = "WoW Forever".to_string();
                            }
                        }
                        if let Some(classic_patches) = r["supported_classic_patches"].as_array() {
                            if !classic_patches.is_empty() && game_version == "Retail" {
                                game_version = "Classic".to_string();
                            }
                        }

                        let is_flavor_match = match flavor.as_str() {
                            "classic" => game_version == "Classic",
                            "forever" => game_version == "WoW Forever",
                            _ => game_version == "Retail",
                        };

                        if is_flavor_match && primary_download_url.is_none() {
                            primary_download_url = Some(dlink.clone());
                            latest_version_str = Some(label.clone());
                        }

                        versions.push(AddonVersion {
                            version: label,
                            game_version,
                            download_url: dlink,
                            release_date: created_at,
                            changelog,
                            stability: Some(stability.to_string()),
                        });
                    }
                }
            }
        }
    }

    // If no release matched flavor, default to first release if available
    if primary_download_url.is_none() && !versions.is_empty() {
        primary_download_url = Some(versions[0].download_url.clone());
        latest_version_str = Some(versions[0].version.clone());
    }

    // Fallback if /versions had no items: use recent_releases
    if versions.is_empty() {
        let releases = &metadata_obj["recent_releases"];
        let flavor_key = match flavor.as_str() {
            "classic" => "classic",
            "forever" => "forever",
            _ => "retail",
        };

        let target_rel = releases.get(flavor_key).or_else(|| releases.get("retail"));
        if let Some(rel) = target_rel {
            if rel.is_object() {
                let label = rel["label"].as_str().unwrap_or("latest").to_string();
                let dlink = rel["download_link"].as_str().unwrap_or("").to_string();
                if !dlink.is_empty() {
                    primary_download_url = Some(dlink.clone());
                    latest_version_str = Some(label.clone());
                    let g_ver = match flavor_key {
                        "classic" => "Classic",
                        "forever" => "WoW Forever",
                        _ => "Retail",
                    };
                    versions.push(AddonVersion {
                        version: label,
                        game_version: g_ver.to_string(),
                        download_url: dlink,
                        release_date: metadata_obj["last_update"].as_str().map(|s| s.to_string()),
                        changelog: rel["changelog"].as_str().map(|s| s.to_string()),
                        stability: Some("Release".to_string()),
                    });
                }
            }
        }
    }

    let mut screenshots = Vec::new();
    if let Some(imgs) = addon_obj["images"].as_array() {
        for img in imgs {
            if let Some(src) = img.as_str() {
                screenshots.push(src.to_string());
            }
        }
    }

    let thumbnail = addon_obj["thumbnail_image"]
        .as_str()
        .map(|s| s.to_string());

    let website = addon_obj["source_url"]
        .as_str()
        .or_else(|| addon_obj["website"].as_str())
        .map(|s| s.to_string());

    Ok(AddonDetails {
        id: format!("wago:{}", clean_slug),
        name,
        author,
        summary,
        description: desc,
        image_url: thumbnail,
        screenshots,
        versions,
        download_url: primary_download_url,
        website_url: website,
        source: "wago".to_string(),
        downloads,
        latest_version: latest_version_str,
    })
}

fn parse_wago_search_card(html: &str) -> Option<WagoSearchResult> {
    let slug = extract_between(html, "addons.wago.io/addons/", "\"")?;

    let title = extract_between(html, "<h3", "</h3>")
        .and_then(|s| s.split('>').last())
        .unwrap_or(&slug)
        .trim();

    let summary = extract_between(html, "<p", "</p>")
        .and_then(|s| s.split('>').last())
        .unwrap_or("")
        .trim();

    let author = extract_between(html, "Author:</strong>", "</span>")
        .unwrap_or("Community")
        .trim();

    let downloads = extract_between(html, "Downloads:</strong>", "</span>")
        .map(|s| s.trim().to_string());

    let img = extract_between(html, "src=", "\n")
        .or_else(|| extract_between(html, "src=\"", "\""))
        .map(|s| s.trim().to_string());

    Some(WagoSearchResult {
        name: html_escape::decode_html_entities(title).to_string(),
        summary: html_escape::decode_html_entities(summary).to_string(),
        slug: slug.to_string(),
        author: author.to_string(),
        image_url: img,
        downloads,
        updated_at: None,
    })
}

fn extract_between<'a>(src: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_idx = src.find(start)? + start.len();
    let rest = &src[start_idx..];
    let end_idx = rest.find(end)?;
    Some(&rest[..end_idx])
}

fn urlencoding(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}

mod html_escape {
    pub fn decode_html_entities(input: &str) -> String {
        input
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#039;", "'")
            .replace("&apos;", "'")
    }
}
