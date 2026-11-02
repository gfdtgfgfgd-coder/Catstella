# 🐱 Catstella · 主分支交接文档 (Branch: `main`)
> **项目定位**：Antigravity 本地桌面端双插件套件（桌宠挂件 + 毛玻璃 Dream Skin）  
> **适用受众**：接手 `main` 分支开发的马仔 / 协同 Agent / 开发者  
> **文档版本**：v0.3.0-dev | 更新时间：2026-11-03

---

## 1. 架构总览与核心设计

本分支为 **Catstella (原 Antigravity-Star-Suite)** 的桌面核心主干，专为 Google Antigravity 本地 IDE (基于 Electron) 打造。包含两个**完全解耦、独立启动、独立配置**的原生级增强程序：

```text
d:\Catstella/
├── Antigravity-Cat-Widget/    # 1. 桌面猫娘桌宠 (半身挂件、双周期额度、窗口吸附、音效、台词)
├── Antigravity-Dream-Skin/    # 2. 毛玻璃宿主皮肤 (CDP 注入、星空壁纸、斜向微网格、代码保护区)
├── shared/                   # 3. 共享基础库 (CDP 连接器、设置持久化、WebSocket 封装)
├── tools/                    # 4. 原生构建工具 (C# 原生编译、启动脚本、单测与安装包构建)
└── docs/                     # 5. 文档与资产说明 (包含本文档与安装说明)
```

### 核心特性矩阵

| 组件 | 技术方案 | 核心依赖 | 职责边界 |
| :--- | :--- | :--- | :--- |
| **Cat Widget** | Electron 45.1.0 + Windows 原生 C# 辅助 | CDP (ws://127.0.0.1:\<port\>) + Win32 API | 读取宿主后台额度服务、无感跟随 Antigravity 窗口、左右下角磁吸、50+中文台词与点击互动 |
| **Dream Skin** | Electron 控制面板 + CDP CSS 注入 | Chrome DevTools Protocol (`CSS.addRule` / `Runtime.evaluate`) | 注入全屏壁纸与毛玻璃滤镜、斜向微网格侧边栏、药丸输入框；退出/关闭时 100% 干净还原 |
| **Native Helper** | .NET Framework C# (`tools/build-native.ps1`) | `user32.dll`, `dwmapi.dll` | 极低 CPU 占用监控前台窗口、位置、DPI 缩放与最小化/遮挡状态 |
| **独立安装器** | C# SFX 自解压与启动守护 (`tools/installer/`) | .NET 4.x `csc.exe`, WinForms | 免 Node.js 独立安装、开机自启、Antigravity 进程联动唤醒 (`--watch`) |

---

## 2. 核心机制与技术细节

### 2.1 静默额度抓取机制 (Cat Widget)
* **路径**：`Antigravity-Cat-Widget/src/quota-service.cjs` 与 `quota-cache.cjs`
* **工作原理**：
  1. 通过 Antigravity 宿主已开放的本地 CDP 端口（通常在 `settings-store` 或进程参数中探测），定位宿主内部已登录的 React 额度服务。
  2. 提取 **Gemini 5 小时** 与 **每周 (Weekly)** 剩余比例及重置时间戳。
  3. **不打开** Settings -> Models 页面，**不读取/序列化**任何用户 Token、Cookie 或 API Key。
  4. 启动时按 `3s -> 6s -> 12s -> 24s -> 30s` 指数退避重试，连接成功后转为 30 秒定期轮询。
  5. 响应具备生命周期防伪：停止轮询后的迟到响应不会覆盖新状态，切换宿主自动清空旧缓存。

### 2.2 原生窗口吸附与跟随 (Host Following)
* **路径**：`Antigravity-Cat-Widget/src/native-foreground-helper.cjs`
* **工作原理**：
  1. 编译后的 `native-tracker.exe` 轮询前台活跃窗口句柄与矩形坐标（支持负坐标多屏工作区）。
  2. 当 Antigravity 在前台时，挂件置顶并吸附在窗口左右下角（内嵌 120 DIP 磁吸范围）；
  3. 当 Antigravity 最小化或被其他应用完全遮挡时，挂件自动隐藏；切换到其他应用时取消置顶，绝不抢焦点。

### 2.3 Dream Skin 无损注入与干净回滚
* **路径**：`Antigravity-Dream-Skin/src/main.cjs` 与 `skin-injector.cjs`
* **工作原理**：
  1. 通过 CDP `DOM.enable` / `CSS.enable` 动态注入 `#antigravity-dream-wallpaper` 节点与微网格样式。
  2. 托盘退出选择“退出并恢复原样”时，CDP 自动移除所有已注入样式表和节点，不残留垃圾。
  3. **防眩光保护区**：代码编辑器（Monaco）、终端、下拉菜单保留暗色底色，绝不穿透导致文字不可读。

---

## 3. 开发、编译与测试指南

### 3.1 环境要求
* Windows 10/11 x64
* Node.js 22.x+
* 已安装并登录的 Antigravity (实测兼容 2.28.0+)
* 系统自带 .NET Framework 4.x (用于编译 C# 原生辅助工具)

### 3.2 常用命令
```powershell
# 1. 编译 Windows 原生窗口跟随辅助程序
npm run build:native

# 2. 运行全套单元测试 (40 项全绿验收)
npm.cmd test
# 或者:
node --test Antigravity-Cat-Widget/test/runtime.test.cjs Antigravity-Dream-Skin/test/runtime.test.cjs tools/source-hashes.test.cjs Antigravity-Cat-Widget/test/personality.test.cjs Antigravity-Cat-Widget/test/quota-cache.test.cjs

# 3. 开发模式启动桌面猫娘桌宠 (指向本地源码)
npm.cmd run start:widget

# 4. 开发模式启动毛玻璃皮肤控制面板 (指向本地源码)
npm.cmd run start:skin

# 5. 构建独立 Windows 安装包 (v0.2.12 新特性)
npm.cmd run build:installers
```

### 3.3 数据持久化路径
* 挂件配置与数值日志账本：`%USERPROFILE%/.antigravity-cat-widget/`
* 皮肤配置：`%USERPROFILE%/.antigravity-dream-skin/`
* 原始宿主读取数据仅存在于内存，退出时不留痕。

---

## 4. 🚨 原作者 v0.2.12 合并代码深度审计（“重启导致更改失效”逆天 Bug 根因剖析）

在最新合入的原作者代码（commit `56f8b1e` 与 `fcd356b`）中，原作者引入了独立的 Windows 安装包打包机制 (`tools/build-installers.cjs` + `tools/installer/`)。用户在实机测试时发现：**“在桌宠安装文件夹里使用 .bat 文件重启桌宠和主题时，先前做的任何更改都会失效”**。

经完整代码审计，此现象的底层成因与技术细节如下：

### 4.1 核心根因分析
1. **源码开发区 vs. 打包安装区的双重身分离（根本原因）**：
   - 原作构建脚本 `build-installers.cjs` 会将当时的 `src/` 与 `assets/` 静态打包进 `payload.zip`，并生成安装程序；
   - 用户安装后，程序被释放到 `%LOCALAPPDATA%\Programs\AntigravityStarSuite\Widget\resources\app\`；
   - **如果开发者在 Git 源码目录 `d:\Catstella` 修改了代码或资源，而安装目录下的 `.bat` 启动的是已编译的 `StarWidget.exe`，该 EXE 永远只会读取安装目录下的静态快照，导致所有源码更改“看起来完全没生效”**！
   - 反过来，如果开发者直接在安装目录 `resources/app/` 下热修改代码，一旦通过安装程序重新安装或运行了带解压逻辑的维护脚本，`SetupProgram.cs` 会以 `File.Create(file)` 无条件强行覆盖文件，瞬间抹平所有就地修改！
2. **进程单例锁（Single Instance Lock）导致的假死与静默秒退**：
   - `Antigravity-Cat-Widget/src/main/index.cjs` 第 10 行：
     ```javascript
     if(!app.requestSingleInstanceLock()) app.quit();
     ```
   - 原作 v0.2.12 引入了常驻后台守护进程 `StartupSettings.exe --watch`（通过 Mutex `Local\StarSuiteStartupWidget` 监控 Antigravity 进程）。
   - 如果用户通过旧的 `.bat` 脚本拉起桌宠，而前一个实例还没有退出完毕（或后台 `--watch` 守护进程持有了宿主锁），新实例在启动瞬间就会因拿不到 Single Instance Lock 而**直接 `app.quit()` 静默退出**！这给用户造成了“重启失败”或“设置回退”的假象。
3. **额度缓存与状态机的主动清空设计**：
   - 原作在 `README.md` 中明确声明了其设计哲学：“**重启不从文件恢复账户额度，切换宿主目标清空缓存**”；
   - 每次挂件进程重启，内存中的额度即刻重置为 `null`（显示“未知”），必须等待 CDP 重新探测宿主、发送后台服务请求并成功解析后才会亮出进度条。如果在未开启 Antigravity 或 CDP 尚未握手时重启，额度条会直接归零，容易被误以为是更改丢失。

### 4.2 原作者新代码审计：哪些可用？哪些必改？

#### ✅ 可充分利用的优秀成果（Keep & Leverage）
* **免 Node.js 原生自解压安装包架构 (`build-installers.cjs` + `SetupProgram.cs`)**：
  * 利用 Windows 自带的 `csc.exe` 编译 C# 代码，直接把 Zip 压缩流作为嵌入资源 (`/resource:payload.zip`) 打进安装器 EXE，极其轻巧，无需引入 NSIS、InnoSetup 等繁重第三方打包工具。
* **低功耗宿主联动守护 (`StartupSettings.cs --watch`)**：
  * 每 2 秒检测一次是否有当前 Windows 会话的 `Antigravity` 进程运行，只在“从无到有”的瞬态边沿拉起桌宠和壁纸，非常节约资源。
* **标准的 Windows 注册表卸载流 (`Software\Microsoft\Windows\CurrentVersion\Uninstall`)**：
  * 自动注册控制面板卸载项，卸载时安全保留用户目录 `%USERPROFILE%/.antigravity-cat-widget`。

#### ❌ 必须大修与改造的缺陷（Refactor & Fix）
1. **统一品牌重构（Catstella 彻底去重命名）**：
   * 原作者代码中大量硬编码了 `AntigravityStarSuite`、`StarWidget.exe`、`DreamSkin.exe`、`星语桌宠挂件`、`织梦壁纸皮肤`；
   * 需全面重命名为 `Catstella`、`Catstella-Widget.exe`、`Catstella-DreamSkin.exe`，并更新注册表项键名。
2. **开发模式与生产安装模式严格隔离**：
   * 必须在根目录下提供专门的开发热重载脚本（如 `tools/dev-restart.cmd` 或通过 npm script），明确注入 `--dev` 或直接调用 `node tools/launch.cjs widget`，坚决不调用已安装的外部静态 EXE！
3. **额度缓存优雅降级（避免一重启就显示“未知”）**：
   * 在 `quota-cache.cjs` 中加入带时间戳的轻量级本地持久化（`cachedAt`）。重启后优先展示上一轮有效额度（打上“缓存”微标），并在后台静默拉取成功后无缝替换，彻底消除用户的“数据丢失恐慌”。
4. **将 Web Companion 整合进发布打包管线**：
   * 目前 `build-installers.cjs` 只管桌宠和皮肤，后续应将 `Gemini-Web-Companion/dist/` 下的 `.xpi` 和 `.zip` 一并归整到 `dist/installers/` 发布流中，形成一键全家桶。

---

## 5. 主分支后续交接待办事项 (To-Do List)

接手马仔请按以下次序推进：

1. [ ] **重命名与品牌对齐**：修改 `tools/installer/StartupSettings.cs` 与 `SetupProgram.cs` 中的产品名称与注册表键值，全面对齐 `Catstella`。
2. [ ] **增加优雅重启脚本**：在根目录增加安全的 `dev-restart.ps1`，负责：优雅关闭旧 Electron 实例 -> 等待锁释放 -> 重新加载本地最新源码，解决用户抱怨的重启回退问题。
3. [ ] **额度持久化缓冲**：改造 `HostQuotaAdapter`，使其支持退出前保存最后一次有效额度至本地 `last-known-quota.json`，启动时先读缓存再后台重试。
4. [ ] **资产管线共享 (Asset Pipeline)**：将角色包（`lin-cat`、`gemini-star-v1`）与台词库从桌面端向 `Gemini-Web-Companion` 做软链接或构建期同步，消除素材分散。
