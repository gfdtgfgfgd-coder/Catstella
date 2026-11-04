# Catstella · Antigravity Star Suite

[English](README_EN.md) | [简体中文](README.md)

Breathe a gentle blue-violet starlight into Google Antigravity: a lively, animated Gemini catgirl desktop companion, a crystal-clear high-performance frosted glass dream skin, and a synchronized dual-end companion bridge.

> **Disclaimer & Security Notice**  
> This project is a non-commercial, community-driven desktop companion maintained by open-source enthusiasts. It is **NOT an official Google product** and is not affiliated with, endorsed by, or sponsored by Google or any of its subsidiaries.  
> Catstella communicates solely via the local localhost CDP debugging channel to map quota summaries and inject styling. It **never modifies host installation binaries or `app.asar` packages**, and strictly never intercepts, collects, logs, or uploads any user API keys, auth tokens, session cookies, or conversation contents.

---

## 🎨 Gallery & Artworks

<!-- [CHARACTER_ART_PLACEHOLDER] -->
> *Character Artwork Placeholder: Reserved for newly remastered HD assets (Starlight Witch & Chill Jellyfish Hoodie).*

<!-- [WALLPAPER_GALLERY_PLACEHOLDER] -->
> *Wallpaper Gallery Placeholder: Reserved for newly remastered theme wallpapers and UI previews.*

---

## 🌟 Key Features

### 🐱 Cat Widget · Animated Desktop Companion
- **Multi-Model & High-Intelligence Metering**:
  - Automatically queries the host's background quota service for **Gemini 5-hour / Weekly limits** and refresh countdowns;
  - **First-Class Gemini 4 Argon Support**: Directly parses the dedicated `gemini-argon-wtu-weekly` WTU limit; displays exclusive badges and triggers warning expressions when remaining quota drops below 20%;
  - Reads **Claude & GPT 3rd-party channels** seamlessly from the same telemetry pipeline.
- **Vibrant Living Companion**:
  - 50+ localized expressive quips, 4.2s natural breathing rhythm, and soft starlight aura;
  - Physics-based squish & bounce upon clicking/dragging, magnetic corner snapping, and auto-facing;
  - Multiple emotional frames (proud, crying, shy, angry) with 4 paired audio presets (muted by default).
- **Native-Grade Anti-Flicker & Desktop Persistence**:
  - Built with native C# `ForegroundHost` bitwise filtering, completely eliminating 1Hz Z-order taskbar flickering on Windows;
  - **Standalone Desktop Persistence**: Gracefully retreats to the desktop if Antigravity is minimized or closed, resuming seamless attachment upon return.

### 🔮 Dream Skin · Frosted Glass IDE Theme Engine
- **Liquid Dream Glass Architecture**:
  - Refactors the input composer into an elevated frosted starlight capsule, **completely eliminating outer dark/black block artifacts**;
  - High-contrast readability across markdown surfaces while granting 100% immune protection to code editors (Monaco) and terminals (xterm);
  - 6-stage S-curve smooth fade: messages dissolve gently into the composer background instead of harsh clipping.
- **4-Color Fluid Theme Presets (Palettes)**:
  - Dynamically injected CSS variables: **Violet**, **Pink**, **Ocean**, and **Onyx**;
  - Harmonious styling extending to top-right Overview floating panels and dialog popups.
- **Win7-Grade Wallpaper Crossfade & Magnetic Damping**:
  - 1.3s crossfade dissolution transition between wallpapers;
  - **1m to 60m proportional magnetic damping ruler**, auto-scanning user wallpaper folders with atomic disk writes.

### 🌐 831-Entry Localization Layer
- Zero-intrusion CDP injection without tampering with `app.asar`, reversible at any moment;
- Comprehensive translation covering text nodes, composer placeholders (`"Ask anything, @ to mention, / for actions"`), button titles, and aria-labels;
- Defaults to clean, unmodified English, with one-click toggling to Simplified Chinese in settings.

### 🔗 Dual-End Companion Bridge
- Connects Desktop Pet with Web Browser Extensions (Chrome / Firefox) via secure loopback `127.0.0.1:3921`;
- Synchronizes quota telemetry, character packs, and wallpaper galleries, supporting both linked and decoupled modes.

---

## 🛠️ Installation & Getting Started

### Option A: Windows All-in-One Installer (Recommended)
Packaged with modern **Inno Setup 7.1.1**:
1. Download the latest `StarSuite-Setup-x64.exe` from [Releases](https://github.com/lynnfei/Catstella/releases);
2. Run the installer and choose your components (Desktop Suite / Web Extension package) and autostart preferences;
3. Installs cleanly into current user space without requiring administrator privileges.

### Option B: Run from Source
Prerequisites: Windows 10/11 x64, Node.js 22+, built-in .NET Framework 4.x.

```powershell
# 1. Clone repository
git clone https://github.com/lynnfei/Catstella.git
cd Catstella

# 2. Install dependencies & compile native helper
npm ci
npm run build:native

# 3. Launch unified desktop suite
npm run start:widget

# 4. Run automated test suite (66/66 tests passing)
npm test
```

Shortcuts: `Ctrl+Alt+G` summons the widget; `Ctrl+Alt+Shift+G` disables click-through. Right-click the character or tray icon to open Settings.

---

## 🔒 Privacy, Data & Local Boundaries

| Data Type | Local Storage Location | Description & Privacy Policy |
| :--- | :--- | :--- |
| Settings & Ledger | `%USERPROFILE%/.antigravity-cat-widget/`<br>`%USERPROFILE%/.antigravity-dream-skin/` | Stores local UI preferences, scale factors, and numeric usage ledgers. |
| Host Telemetry | `%USERPROFILE%/.gemini/antigravity/brain/` | Read-only extraction of step count and token metrics. Never reads conversation prose. |
| Companion Bridge | `127.0.0.1:3921` (Loopback only) | Listens strictly on localhost; rejects unauthorized external origins. |

- **100% Local Execution**: Catstella contains no cloud proxy or telemetry relay servers;
- **Reversible Cleanup**: Selecting "Exit and restore" cleanly removes all injected DOM nodes and restores Antigravity to its pristine state.

---

## 📜 Disclaimer & Licensing

1. **Software License**: Original source code is licensed under the [MIT License](LICENSE).
2. **Artwork & Non-Code Asset Restrictions (Important)**:
   - **The MIT license STRICTLY DOES NOT apply to any character artworks, illustrations, wallpapers, or non-open-source audio files.**
   - All character designs and concepts remain the intellectual property of their original creators. Assets are provided solely for personal non-commercial desktop enhancement and study. **Commercial use, unauthorized extraction, or resale is strictly prohibited.**
   - Audio effects are licensed under their respective sources (Kenney CC0 / Upstream MIT synthetic audio).
3. **No Warranty**:
   - Catstella relies on local CDP interfaces and DOM selectors of the host. Future host updates may alter layouts or internal APIs.
   - Developers provide no warranty and assume no liability for display anomalies, caching inconsistencies, or other side effects resulting from the use of this unofficial tool.

---

## 💐 Acknowledgements

Catstella stands on the shoulders of brilliant open-source creators and artists:

- **[Monokumakuki](https://github.com/Monokumakuki/Antigravity-Star-Suite)**: Catstella originated from Monokumakuki's `Antigravity-Star-Suite`. Deep gratitude for the foundational architecture, early CDP probe exploration, and initial companion prototypes;
- **ZipZipPipe (Master Z)**: Sincere thanks to ZipZipPipe for creating the original concept and soul of the Gemini Star Neko character design;
- **[Feeesack / codex-maid-widget](https://github.com/Feeesack/codex-maid-widget)** & **[MeteorNOX / DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**: Thank you to both pioneering projects for open-source inspiration regarding companion interaction, thought bubbles, and balance tracking.
