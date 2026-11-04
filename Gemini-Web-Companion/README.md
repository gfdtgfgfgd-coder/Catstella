# 星语喵伴 · Gemini Web Companion 🐾

[English](#english) | [中文说明](#中文说明)

---

## 中文说明

**星语喵伴 (Gemini Web Companion)** 是专为 Google Gemini 官方网页端打造的双端浏览器扩展程序（支持 Firefox 与 Edge / Chrome）。它将反重力（Antigravity）桌面生态中的 **“喵言喵语”猫娘桌宠** 与 **“星语”毛玻璃全景皮肤 (Dream Skin)** 完整迁移至网页，并针对 Gemini 2.0 / 2.5 **Argon 思维链 (Thinking) 模型** 深度定制了单会话用量与限流实时监测。

### 🌟 核心特性

1. **Argon 单对话用量与思维链 (Thinking) 监测**：
   - **会话独立绑定**：随浏览器 URL 自动切换对话档案，独立记录当前聊天的问答轮次。
   - **Thinking 深度捕获**：深入统计 Argon 特有的展开思维链字符数，折算真实 Token 消耗。
   - **耳灯疲劳度状态机**：
     - 🟢 **0% ~ 40% (安全)**：幽蓝平静呼吸，惬意待机；
     - 🟡 **40% ~ 75% (警戒)**：耳灯转琥珀微光，提示会话升温；
     - 🟠 **75% ~ 99% (危险)**：亮红急促微光，表情变成生气/炸毛，提醒控制单会话长度；
     - 🔴 **100% (触发 429 / 限流)**：瞬间切换成**委屈大哭表情**，耳灯粉红狂闪，并弹出**恢复重置倒计时钟**！
2. **星语 Dream Skin 100% 原版质感还原**：
   - 网页原生深色背景透明化，底层铺设 16:9 蓝紫星空设定集壁纸；
   - **斜向微网格侧边栏**：完美移植反重力原版 `repeating-linear-gradient` 斜向微网格与星光颗粒选中高亮；
   - **水晶玻璃药丸输入框**：还原反重力 `.surface-composer` 悬浮药丸造型与双重内发光；
   - **保护区域**：代码块与终端保留高对比度防眩光底色，绝不影响文字阅读。
3. **傲娇猫娘交互与双端优化**：
   - 采用 **Shadow DOM + 零 CSP 依赖架构**，彻底杜绝火狐与 Edge 样式冲突与资源加载报错；
   - 默认停靠右下角空白区，远离左侧栏，支持全屏自由拖动并自动记忆停靠坐标；
   - 包含 60+ 句中文傲娇台词，点击台词或角色即可换句；
   - 提供双形象切换：**Gemini 蓝紫星语** 与 **休闲水母双马尾**。

### 🛡️ 安全与合规声明 (100% 零封号风险)

- **纯客户端本地渲染**：扩展挂载在本地 Shadow DOM 中，仅作界面美化与视觉陪伴；
- **只读被动监听**：不自动发消息、不篡改 HTTP 请求头、不劫持账号 Token；
- **MIT 开源协议合规**：本扩展基于 [Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite) 开源项目衍生开发，遵守 MIT License。原设参考署名 **ZipZipPipe**，图片由 AI 辅助生成，非 Google 官方产品。

### 📥 安装指南

#### 🦊 火狐浏览器 (Firefox)
- **方法 A (临时载入调试)**：
  1. 在 Firefox 输入 `about:debugging#/runtime/this-firefox` 并回车；
  2. 点击 **“临时载入附加组件...”**；
  3. 选中 `dist/kimino-gemini-companion.xpi`（或 `dist/firefox/manifest.json`）即可启用！
- **方法 B (附加组件安装)**：
  1. 打开 `about:addons`，点击右上角 ⚙️ 图标；
  2. 选择 **“从文件安装附加组件...”** 并选中 `dist/kimino-gemini-companion.xpi`。

#### 🌐 Edge / Chrome 浏览器
1. 打开 `edge://extensions/` 或 `chrome://extensions/`；
2. 开启 **“开发人员模式”**；
3. 点击 **“加载解压缩的扩展”**，选择目录 `dist/chromium/`；
4. 刷新 Gemini 网页端即可！

---

## English

**Gemini Web Companion** is a dual-browser extension (supporting Firefox, Edge, and Chrome) crafted for the official Google Gemini web interface. It brings the beloved **Kimino Cat Pet Widget** and **Dream Skin Glassmorphism Theme** from the Antigravity desktop ecosystem to your browser, featuring real-time quota & token usage monitoring specifically tailored for Gemini 2.0 / 2.5 **Argon Thinking Models**.

### 🌟 Key Features

1. **Argon Conversation & Thinking Process Monitoring**:
   - **Per-Session Binding**: Automatically binds to individual conversations via URL tracking.
   - **Thinking Length Sniffing**: Measures Argon's hidden thinking process length and calculates estimated token consumption.
   - **Ear LED Fatigue State Machine**:
     - 🟢 **0% ~ 40% (Safe)**: Calm blue-purple ear lights, gentle idle breathing.
     - 🟡 **40% ~ 75% (Warning)**: Amber glow indicating increasing conversation load.
     - 🟠 **75% ~ 99% (Danger)**: Bright red pulsing glow and alert expression.
     - 🔴 **100% (Rate-limited / 429)**: Switches to crying/sad face with hot-pink flashing lights and an automatic **reset countdown clock**.
2. **Authentic Dream Skin Glassmorphism**:
   - Transparent web background with full-screen 16:9 celestial wallpaper.
   - **Signature Diagonal Grid Sidebar**: Faithfully recreates Antigravity's subtle `repeating-linear-gradient` mesh texture and starlight selection indicators.
   - **Frosted Glass Composer**: Replicates the `.surface-composer` floating pill styling with dual inset glows.
   - **Protected Zones**: High-contrast dark backgrounds for code blocks and menus to ensure optimal readability.
3. **Desk Pet Interaction & Cross-Browser Stability**:
   - Built on **Shadow DOM + Zero-CSP Embedded Architecture**, eliminating Firefox/Chromium CSP resource blocking.
   - Automatically anchored in the bottom-right blank area; fully draggable with coordinate memory.
   - 60+ tsundere dialogue lines; interactive audio effects.
   - Two character packs: **Gemini Star Suite v1** and **Lin-Cat Jellyfish Twintails**.

### 🛡️ Safety & Compliance (100% Ban-Free)

- **Pure Client-Side Cosmetic**: Runs exclusively within the user's browser via Shadow DOM.
- **Passive Read-Only Monitoring**: Never sends automated messages, never modifies headers, never intercepts authentication tokens.
- **MIT License Compliance**: Derived from [Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite) under the MIT License. Original character reference credited to **ZipZipPipe**. Not an official Google product.

### 📥 Installation Guide

#### 🦊 Firefox
- **Option A (Temporary Debugging)**:
  1. Navigate to `about:debugging#/runtime/this-firefox`.
  2. Click **"Load Temporary Add-on..."**.
  3. Select `dist/kimino-gemini-companion.xpi` (or `dist/firefox/manifest.json`).
- **Option B (Add-on Manager)**:
  1. Navigate to `about:addons`, click the ⚙️ gear icon.
  2. Choose **"Install Add-on From File..."** and select `dist/kimino-gemini-companion.xpi`.

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
