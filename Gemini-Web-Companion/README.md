# Catstella · Gemini Web Companion 🐾

[English](#english) | [中文说明](#中文说明)

---

## 中文说明

**Catstella (Gemini Web Companion)** 为 Google Gemini 网页提供互动桌宠、毛玻璃主题和额度显示，支持 Firefox、Edge 和 Chrome。

### 🌟 核心特性

1. **用量显示**。读取网页提供的 5 小时和每周用量与重置时间，并标明来源。扩展统计当前会话轮次，按页面可见内容估算 Token 规模。
2. **毛玻璃主题**。支持独立壁纸、渐变切换和半透明界面。代码块保留便于阅读的底色。
3. **双端陪伴**。可拖动挂件、切换角色与台词，并与桌面套件联动角色、壁纸和额度。自动碎碎念可以在常用设置中开启。
4. **更新与图库**。从扩展菜单打开「更新与在线图库」。主题和壁纸由项目的 GitHub 素材目录提供。

### 🛡️ 隐私与许可

- 界面在浏览器本地渲染。扩展与桌面套件通过本机环回通信，更新检测和在线图库会请求项目的 GitHub 地址。
- **只读被动监听**：不自动发消息、不篡改 HTTP 请求头、不劫持账号 Token；
- **MIT 开源协议合规**：本扩展基于 [Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite) 开源项目衍生开发，遵守 MIT License。原设参考署名 **ZipZipPipe**，图片由 AI 辅助生成，非 Google 官方产品。

### 📥 安装指南

网页桌宠、主题和 Gemini 网页额度可独立使用。只有跨端同步需要本机 Catstella 桌面套件运行。Edge／Chrome 当前发布的是解压安装用 ZIP；加载后请保留包含 `manifest.json` 的目录。Firefox 的 XPI 已包含扩展文件，不需要另存一份解压目录。

#### 🦊 火狐浏览器 (Firefox)
- **方法 A (临时载入调试)**：
  1. 在 Firefox 输入 `about:debugging#/runtime/this-firefox` 并回车；
  2. 点击 **“临时载入附加组件...”**；
  3. 选中 `dist/kimino-gemini-companion.xpi`（或 `dist/firefox/manifest.json`）即可启用！
- 打包脚本生成未签名测试包，Firefox 重启后需要重新临时加载。普通 Firefox 的持久安装需要经过 Mozilla 签名的包。

#### 🌐 Edge / Chrome 浏览器
1. 打开 `edge://extensions/` 或 `chrome://extensions/`；
2. 开启 **“开发人员模式”**；
3. 点击 **“加载解压缩的扩展”**，选择目录 `dist/chromium/`；
4. 刷新 Gemini 网页端即可！

---

## English

**Gemini Web Companion** adds an interactive desktop pet, a frosted glass theme, and quota information to Google Gemini on Firefox, Edge, and Chrome.

### 🌟 Key Features

1. **Usage**. Displays five-hour and weekly usage and reset times from Gemini when available. Counts turns and estimates tokens from visible page content.
2. **Dream Skin**. Provides a translucent theme, custom wallpapers, and crossfades. Code blocks keep their reading backgrounds.
3. **Desktop sync**. Drag the pet, switch characters, and optionally sync characters, wallpapers, and usage with the desktop suite. Idle chatter is optional.
4. **Updates and gallery**. Open Updates and Online Gallery from the extension menu. Themes and wallpapers come from the project's GitHub catalog.

### 🛡️ Privacy and licensing

- The extension renders locally and syncs with the desktop suite over loopback. Update checks and the online gallery contact the project’s GitHub repository.
- **Passive Read-Only Monitoring**: Never sends automated messages, never modifies headers, never intercepts authentication tokens.
- **MIT License Compliance**: Derived from [Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite) under the MIT License. Original character reference credited to **ZipZipPipe**. Not an official Google product.

### 📥 Installation Guide

The web pet, theme, and Gemini web usage work without the Catstella desktop suite. Keep the desktop app running if you want to sync with it. Keep the extracted directory after loading the current Edge/Chrome ZIP. Firefox's XPI contains the extension files and does not require a separate extracted copy.

#### 🦊 Firefox
- **Option A (Temporary Debugging)**:
  1. Navigate to `about:debugging#/runtime/this-firefox`.
  2. Click **"Load Temporary Add-on..."**.
  3. Select `dist/kimino-gemini-companion.xpi` (or `dist/firefox/manifest.json`).
- The build script produces an unsigned test package. Reload it after restarting Firefox. Persistent installation on standard Firefox requires a Mozilla-signed package.

#### 🌐 Edge / Chrome
1. Navigate to `edge://extensions/` or `chrome://extensions/`.
2. Enable **"Developer mode"**.
3. Click **"Load unpacked"** and select the folder `dist/chromium/`.
4. Refresh `https://gemini.google.com/` and enjoy!

---

### 📜 License & Acknowledgments

- Software: [MIT License](LICENSE)
- Inspired by: Antigravity Star Suite, codex-maid-widget, DeepSeek-Balance-Whale-Widget
- Character Design Reference: ZipZipPipe
