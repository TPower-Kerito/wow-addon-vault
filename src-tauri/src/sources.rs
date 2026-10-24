use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde_json::Value;
use crate::models::{Addon, AddonDetails, AddonVersion, WagoSearchResult};

pub async fn fetch_github_release(
    repo: &str,
    token: Option<&str>,
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

    let mut download_url = None;
    if let Some(assets) = rel_json["assets"].as_array() {
        for asset in assets {
            if let Some(url) = asset["browser_download_url"].as_str() {
                if url.ends_with(".zip") {
                    download_url = Some(url.to_string());
                    break;
                }
            }
        }
    }

    let final_download_url = download_url
        .or_else(|| rel_json["zipball_url"].as_str().map(|s| s.to_string()))
        .ok_or_else(|| "Could not find a downloadable zip asset in this release".to_string())?;

    Ok((name, author, summary, version, final_download_url))
}

pub async fn fetch_wago_addon(slug_or_url: &str) -> Result<Addon, String> {
    let slug = slug_or_url
        .trim()
        .trim_start_matches("https://addons.wago.io/addons/")
        .trim_end_matches('/');

    let details = fetch_wago_details(slug).await?;

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

pub async fn fetch_wago_details(slug: &str) -> Result<AddonDetails, String> {
    let clean_slug = slug
        .trim()
        .trim_start_matches("https://addons.wago.io/addons/")
        .trim_end_matches('/');

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

                        if primary_download_url.is_none() {
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

    // Fallback if /versions had no items: use recent_releases
    if versions.is_empty() {
        let releases = &metadata_obj["recent_releases"];
        if let Some(retail_rel) = releases.get("retail") {
            if retail_rel.is_object() {
                let label = retail_rel["label"].as_str().unwrap_or("latest").to_string();
                let dlink = retail_rel["download_link"].as_str().unwrap_or("").to_string();
                if !dlink.is_empty() {
                    primary_download_url = Some(dlink.clone());
                    latest_version_str = Some(label.clone());
                    versions.push(AddonVersion {
                        version: label,
                        game_version: "Retail".to_string(),
                        download_url: dlink,
                        release_date: metadata_obj["last_update"].as_str().map(|s| s.to_string()),
                        changelog: retail_rel["changelog"].as_str().map(|s| s.to_string()),
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
