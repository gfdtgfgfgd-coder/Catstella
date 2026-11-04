# Catstella

[English](README_EN.md) | [简体中文](README.md)

Catstella is an open-source desktop companion and enhancement suite designed for Google Antigravity. It features an interactive desktop pet widget (Cat Widget), a frosted glass UI theme and wallpaper engine (Dream Skin), and a cross-client synchronization bridge for web browser companions.

> **Disclaimer & Security Notice**  
> This project is a non-commercial, community-driven tool maintained by open-source enthusiasts. It is **NOT an official Google product** and is not affiliated with, endorsed by, or sponsored by Google or any of its subsidiaries.  
> Catstella communicates solely via the local localhost CDP debugging channel to map quota summaries and inject styling. It **never modifies host installation binaries or `app.asar` packages**, and strictly never intercepts, collects, logs, or uploads any user API keys, auth tokens, session cookies, or conversation contents.

---

## 🎨 Gallery & Artworks

<!-- [CHARACTER_ART_PLACEHOLDER] -->
> *(Character Artwork Placeholder: Reserved for newly remastered artwork assets upon export)*

<!-- [WALLPAPER_GALLERY_PLACEHOLDER] -->
> *(Wallpaper Gallery Placeholder: Reserved for newly remastered wallpapers and theme previews upon export)*

---

## 🌟 Key Features

### 🐱 Desktop Companion Widget (Cat Widget)
- **Multi-Model Quota Monitoring**:
  - Read-only telemetry extraction from the host background service for **Gemini 5-hour / Weekly limits** and refresh countdowns;
  - **Gemini 4 Argon Metering Support**: Directly parses the dedicated `gemini-argon-wtu-weekly` WTU limit; displays exclusive badges and low-quota (< 20%) warnings;
  - Supports **Claude & GPT 3rd-party channels** in the same dashboard;
  - Customizable honorifics and forms of address in settings (None, Zayu, or custom text).
- **Interactive Feedback**:
  - 50+ localized dialogue quips, subtle breathing animation, and ambient edge luminescence;
  - Responds to mouse clicks, dragging, and elastic release; supports bottom-corner magnetic docking and adaptive orientation;
  - Includes emotional reaction states (proud, crying, shy, angry) and four selectable sound sets (muted by default).
- **Anti-Flicker & Desktop Persistence**:
  - Leverages native C# `ForegroundHost` bitwise filtering to eliminate taskbar refresh jitter on Windows;
  - **Standalone Desktop Mode**: Persists reliably on the desktop even when Antigravity is closed or minimized, seamlessly reattaching upon host relaunch.

### 🔮 Frosted Glass Theme & Wallpaper Engine (Dream Skin)
- **Translucent Architecture**:
  - Reconstructs the input composer into an elevated frosted capsule, eliminating dark background block artifacts and allowing wallpapers to show through naturally;
  - Enforces complete opacity protection for code editors (Monaco) and terminals (xterm) to maintain contrast and readability;
  - Smooth S-curve gradual fading for scrolling message history.
- **Four Palette Themes**:
  - Native CSS variables dynamically injected: **Violet**, **Pink**, **Ocean**, and **Onyx**;
  - Harmonious styling across the top-right Overview floating window and dropdown menus.
- **Wallpaper Slideshow System**:
  - Smooth crossfade transitions between wallpapers;
  - **1m to 60m proportional slider** with magnetic damping near common intervals; automatically scans the user's wallpaper directory.

### 🌐 Localization Layer
- Pure CDP injection without tampering with `app.asar`, completely reversible at any time;
- Comprehensive translation covering 830+ UI elements, input placeholders, button tooltips, and accessibility labels;
- Defaults to standard English, with one-click toggling to Simplified Chinese in settings.

### 🔗 Companion Bridge
- Connects Desktop Pet with Web Browser Extensions (Chrome / Edge / Firefox) via loopback `127.0.0.1:3921`;
- Supports quota telemetry synchronization, character pack and wallpaper selection (synchronized or decoupled), and display mode preferences.

---

## 🛠️ Installation & Getting Started

### Option A: Windows Installer (Recommended)
Packaged with standard **Inno Setup**:
1. Download the latest `Catstella-Setup-*-x64.exe` from [Releases](https://github.com/lynnfei/Catstella/releases);
2. Run the installer and select your desired components (Desktop Suite / Web Extension package) and startup options;
3. Installs cleanly in the current user space without requiring administrative privileges.

### Option B: Run from Source
Prerequisites: Windows 10/11 x64, Node.js 22+, .NET Framework 4.x.

```powershell
# 1. Clone repository
git clone https://github.com/lynnfei/Catstella.git
cd Catstella

# 2. Install dependencies & compile native helper
npm ci
npm run build:native

# 3. Launch desktop suite
npm run start:widget

# 4. Run automated test suite
npm test
```

Shortcuts: `Ctrl+Alt+G` brings the widget forward; `Ctrl+Alt+Shift+G` disables click-through. Right-click the character or tray icon to open Settings.

---

## 🔒 Privacy & Local Data Boundaries

| Data Type | Local Storage Location | Description |
| :--- | :--- | :--- |
| Settings & Ledger | `%USERPROFILE%/.antigravity-cat-widget/`<br>`%USERPROFILE%/.antigravity-dream-skin/` | Stores local UI preferences, scale factors, and numeric usage ledgers. |
| Host Telemetry | `%USERPROFILE%/.gemini/antigravity/brain/` | Read-only extraction of step count and token metrics. Never reads conversation prose. |
| Local Loopback | `127.0.0.1:3921` (Loopback only) | Listens strictly on localhost; rejects unauthorized external origins. |

- **100% Local Execution**: Catstella contains no cloud proxy or telemetry relay servers; all operations remain local.
- **Clean Uninstallation**: Selecting "Exit and restore" cleanly removes injected DOM nodes and restores the host to its default state.

---

## 📜 License & Asset Notice

1. **Software License**: Original source code is licensed under the [MIT License](LICENSE).
2. **Artwork & Non-Code Asset Restrictions**:
   - **The MIT license DOES NOT apply to any character artworks, illustrations, wallpapers, or non-open-source audio files.**
   - All character designs and concepts remain the property of their respective creators. Assets are provided solely for personal non-commercial desktop enhancement and study. **Commercial use, unauthorized extraction, or resale is strictly prohibited.**
   - Audio effects are licensed under their respective sources (Kenney CC0 / Upstream MIT synthetic audio); see [ASSETS.md](ASSETS.md) and [NOTICE.md](NOTICE.md) for full attribution.
3. **No Warranty**:
   - Catstella relies on local CDP interfaces and DOM selectors of the host. Future host updates may alter layouts or internal APIs.
   - Developers provide no warranty and assume no liability for display anomalies, caching inconsistencies, or other side effects resulting from the use of this unofficial tool.

---

## 💐 Acknowledgements

This project was developed with reference to and derivative of the following open-source projects and original designs:

- **[Monokumakuki / Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite)**: Foundational engineering base derived from Monokumakuki's repository; grateful for the pioneering architecture, early CDP probe exploration, and initial companion prototypes;
- **ZipZipPipe**: Gratitude to ZipZipPipe for the original Gemini Star Neko character design reference and creative support;
- **[Feeesack / codex-maid-widget](https://github.com/Feeesack/codex-maid-widget)** & **[MeteorNOX / DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**: Appreciation to both pioneering projects for open-source inspiration regarding companion interaction, thought bubbles, and telemetry observation.
