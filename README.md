# 🛡️ WoW Addon Vault

[![Rust](https://img.shields.io/badge/Rust-1.80+-orange?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Ad-Free](https://img.shields.io/badge/Overwolf_Ads-0%25-emerald?style=flat-square)](https://github.com/TPower-Kerito/wow-addon-vault)
[![License](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE)

A personal, blazing-fast, lightweight, and **100% ad-free** World of Warcraft Addon Manager built with **Rust + Tauri v2 + React**.

Designed as a modern alternative to CurseForge: **0% Overwolf background bloat, 0% video ads, zero tracking**, pulling releases directly from **Wago.io** and **GitHub Releases**.

---

### ⬇️ Download & Quick Start

> **Portable (Zero Installation Required)**  
> Just download the single `.exe` file, double-click, and you're good to go!

[![Download Latest Release](https://img.shields.io/badge/⬇️_Download_WoWAddonVault.exe-Latest_Release-amber?style=for-the-badge&logo=windows)](https://github.com/TPower-Kerito/wow-addon-vault/releases/latest)

1. Download **`WoWAddonVault.exe`** from [Releases](https://github.com/TPower-Kerito/wow-addon-vault/releases/latest).
2. Double-click to run (no admin privileges or setup wizards needed).
3. The app automatically detects your World of Warcraft installation path (`_retail_`).
4. Click **"Scan PC Addons"** to instantly import and organize all your existing addons!

---

## ✨ Key Features

- ⚡ **Ultra Lightweight & Fast:** Consumes only ~35MB RAM (compared to Overwolf/CurseForge's 400MB–800MB). Starts instantly.
- 🛡️ **Zero CurseForge / Overwolf Tracking:** Downloads directly from Wago.io CDN and GitHub Releases with zero telemetry and zero ads.
- 🧩 **Smart Multi-Folder Grouping:** Intelligently combines modular multi-folder addons (like DBM's 25 subfolders, BigWigs, LittleWigs, and RaiderIO) into clean, unified cards.
- 🖥️ **4 Versatile View Modes (CurseForge Layouts):**
  - **Table View:** Compact CurseForge-style table with sortable columns (Name, Version, Author, Status) and multi-select batch updates.
  - **List View:** Detailed card view with folder tags, author notes, and version status.
  - **Tiles View:** Responsive 4-column grid layout with high-resolution addon artwork.
  - **Grouped View:** Collapsible groups categorized by update status (`Updates Available`, `Up to Date`, `Ignored`).
- 🖱️ **CurseForge-Style Right-Click Context Menu:**
  - ⤓ **Reinstall:** Freshly re-download and reinstall any addon with 1 click.
  - 👁 **View Addon:** Explore full overview, descriptions, screenshots, and version history (Release, Beta, Alpha).
  - 📁 **Browse Folder ↗:** Directly open the addon folder in Windows Explorer.
  - ⚙ **Delete Settings (SavedVariables):** Reset broken addon configurations in your `WTF` folder without uninstalling.
  - ⏸ **Ignore Updates:** Exclude specific addons from automatic update prompts.
  - 🔗 **Copy Addon Link:** Share addon URLs with guild mates and friends.
- 🔄 **In-App Auto-Update Checker:** Notifies you automatically when a new release of WoW Addon Vault is published on GitHub.
- 🌐 **Game Flavor Dropdown:** Switch smoothly between **Retail**, **WoW Forever**, and **Classic** branches without clutter.

---

## 🛠️ Built With

- **Backend:** [Rust](https://www.rust-lang.org/) + [Tauri v2](https://tauri.app/) (Native Windows Webview2, fast I/O, direct HTTP streaming)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 💻 Development & Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable toolchain)
- Visual Studio C++ Build Tools

### Setup
```bash
# Clone repository
git clone https://github.com/TPower-Kerito/wow-addon-vault.git
cd wow-addon-vault

# Install dependencies
npm install

# Run in Development mode
npx tauri dev

# Build production executable
npx tauri build --no-bundle
```
The compiled standalone executable will be located in:  
`src-tauri/target/release/app.exe`

---

## 📜 License

Distributed under the **MIT License**. Free and open-source for the World of Warcraft community.
