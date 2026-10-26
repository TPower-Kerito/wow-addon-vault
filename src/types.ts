export interface Settings {
  wow_path: string;
  github_token?: string | null;
  details_view_mode?: 'full' | 'drawer' | null;
  game_flavor?: 'retail' | 'forever' | 'all' | null;
  auto_update_addons?: boolean | null;
}

export interface Addon {
  id: string;
  name: string;
  author: string;
  source: 'github' | 'wago' | 'tukui' | string;
  repo?: string | null;
  wago_slug?: string | null;
  installed_version?: string | null;
  latest_version?: string | null;
  has_update: boolean;
  folders: string[];
  download_url?: string | null;
  summary?: string | null;
  image_url?: string | null;
  updated_at?: string | null;
  ignored?: boolean | null;
  release_channel?: 'release' | 'beta' | 'alpha' | string | null;
}

export interface AddonPackItem {
  name: string;
  source: string;
  repo?: string | null;
  wago_slug?: string | null;
  tukui_slug?: string | null;
}

export interface AddonPack {
  vault_version: string;
  name: string;
  export_date: string;
  addons: AddonPackItem[];
}

export interface AddonVersion {
  version: string;
  game_version: string;
  download_url: string;
  release_date?: string | null;
  changelog?: string | null;
  stability?: 'Release' | 'Beta' | 'Alpha' | string | null;
}

export interface AddonDetails {
  id: string;
  name: string;
  author: string;
  summary: string;
  description: string;
  image_url?: string | null;
  screenshots: string[];
  versions: AddonVersion[];
  download_url?: string | null;
  website_url?: string | null;
  source: string;
  downloads?: string | null;
  latest_version?: string | null;
}

export interface WagoSearchResult {
  name: string;
  summary: string;
  slug: string;
  author: string;
  image_url?: string | null;
  downloads?: string | null;
  updated_at?: string | null;
}

export interface ScannedAddon {
  folder_name: string;
  folders: string[];
  title: string;
  version: string;
  author: string;
  notes?: string | null;
  wago_id?: string | null;
  curse_id?: string | null;
}

export interface AppUpdateInfo {
  current_version: string;
  latest_version: string;
  release_notes?: string | null;
  download_url?: string | null;
  html_url: string;
}
