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

> **Easy Setup or Portable (Zero Installation)**  
> Choose between the clean installer wizard or the standalone portable executable:

- 📦 **[Download Windows Installer (Setup .exe)](https://github.com/TPower-Kerito/wow-addon-vault/releases/latest/download/WoW-Addon-Vault-Setup-1.1.0.exe)** — *Recommended for most users (creates Desktop shortcut and Start menu entry)*.
- 🚀 **[Download Portable Executable (.exe)](https://github.com/TPower-Kerito/wow-addon-vault/releases/latest/download/WoWAddonVault.exe)** — *Zero installation, runs directly anywhere*.
- 💼 **[Download MSI Package (.msi)](https://github.com/TPower-Kerito/wow-addon-vault/releases/latest/download/WoW-Addon-Vault-1.1.0.msi)** — *Windows Installer package*.

---

## ✨ Key Features (v1.1.0)

- ⚡ **Ultra Lightweight & Fast:** Consumes only ~35MB RAM (compared to Overwolf/CurseForge's 400MB–800MB). Starts instantly.
- 🛡️ **Zero CurseForge / Overwolf Tracking:** 100% ad-free, 0% background bloat. Pulls directly from GitHub Releases, Tukui API, and Wago CDN.
- 🔄 **CurseForge-Style Auto Updates & Sorting:**
  - **Startup & 15-Minute Auto-Check:** Checks for addon updates on launch and periodically in the background.
  - **Optional Auto-Update:** Enable Auto-Update in settings or via quick toggle in toolbar to download updates silently in the background!
  - **Prioritized Sorting:** Addons requiring updates are pinned to the very top of your list with a prominent `Update All (X)` banner.
- 📦 **Share & Sync Addon Packs (JSON):**
  - Export your complete addon list with 1 click to `.json` file or clipboard.
  - Import a friend's pack with visual preview and 1-click batch installation with live progress bar.
- 🌐 **Tukui & ElvUI Support:** Full native support for ElvUI and Tukui addons via official Tukui API.
- 📚 **Open GitHub Addon Catalogue:** 2,400+ community addons indexed via `addons.csv` with 24-hour disk cache. Automatically matches scanned local addons to official GitHub repositories.
- 🧩 **Smart Multi-Folder Grouping & Clean Scanner:**
  - Intelligently merges modular multi-folder addons (ElvUI, BigWigs, Details!, DBM) into single clean cards.
  - Detects TOC metadata (`X-Curse-Project-ID`, `X-Wago-ID`, `X-Tukui-ProjectID`, GitHub repo links).
- 🖥️ **4 Versatile View Modes (CurseForge Layouts):**
  - **Table View:** Compact CurseForge-style table with sortable columns and batch actions.
  - **List View:** Detailed card view with folder tags, author notes, and version status.
  - **Tiles View:** Responsive grid layout with high-resolution addon artwork.
  - **Grouped View:** Collapsible groups categorized by status (`Updates Available`, `Up to Date`, `Ignored`).
- 🖱️ **CurseForge-Style Right-Click Context Menu:**
  - 🔗 **Link Remote Source:** Connect local/scanned addons to GitHub, Wago, or Tukui with live verification.
  - ⤓ **Reinstall:** Freshly re-download and reinstall any addon with 1 click.
  - 👁 **View Addon:** Full overview, descriptions, screenshots, and version history.
  - 📁 **Browse Folder ↗:** Directly open the addon folder in Windows Explorer.
  - ⚙ **Delete Settings (SavedVariables):** Reset broken addon configs in your `WTF` folder without uninstalling.
  - ⏸ **Ignore Updates:** Exclude specific addons from automatic update prompts.
  - 📋 **Copy Addon Link:** Share addon URLs with guild mates and friends.
- 🔄 **In-App Self Updater:** Automatically alerts you when a new version of WoW Addon Vault is published on GitHub.
- 🎮 **Game Flavor Selector:** Switch smoothly between **Retail**, **WoW Forever**, and **Classic** branches with tailored archive downloads.

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
