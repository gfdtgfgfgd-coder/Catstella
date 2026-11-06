> 2026-11-05 补充：桌面旧内嵌 Web 副本已移除；下文旧目录描述仅供历史参考。安装器与素材同步共用 tools/web-companion-path.cjs，活动源为 D:\Catstella-web\Gemini-Web-Companion。

# 🐱 Catstella · 桌面端交接文档（Branch: `main`）
> **项目定位**：独立于反重力宿主的常驻桌面猫娘套件（桌宠 + 毛玻璃主题 + 壁纸管理 + 界面汉化），单实例单托盘。
> **文档版本**：v0.6.0-handoff | 更新时间：2026-11-05
> **适用受众**：接手桌面端开发的会话 / Agent / 开发者

---

## 0. 现状速览（TL;DR）

| 项 | 现状 |
|---|---|
| 版本 | **0.6.0**（已出包 `Catstella-Setup-0.6.0-x64.exe`，Inno Setup，164.75 MiB） |
| 桌面分支 | `main` → `origin/main`（工作区 `D:\Catstella`，保留未提交改动） |
| web 分支 | `feat/browser-extension` **已分房**到 worktree `D:\Catstella-web`（隔壁会话地盘，勿越界） |
| 测试 | `npm.cmd test` = **65 项全绿** |
| 安装包验收 | `npm run verify:installers` = **4/4 全绿**（Inno 静默装 → 无 locales 真启渲染层 → unins000 卸载目录消失） |
| 已装机 | v0.6.0 已出包待用户点装；v0.5.0 安装与 0.4.2 额度链路此前已验收 |

---

## 1. 架构总览：一个 Electron 实例管全家

```
StarSuite.exe（Electron 45）
└─ Antigravity-Cat-Widget/src/main/index.cjs   ← 唯一的 main 进程
   ├─ 桌宠窗口（透明无边框、磁吸跟随/独立常驻双模式）
   ├─ 统一设置中心（frame:false 自绘标题栏，620×820）
   ├─ 单托盘（合并桌宠 + 皮肤 + 壁纸全部菜单）
   ├─ 皮肤子域 ← 跨项目 require ../../../Antigravity-Dream-Skin/src/domain/*
   │   ├─ DreamSkinSettings    （~/.antigravity-dream-skin/settings.json）
   │   ├─ WallpaperManager     （多壁纸包扫描 + 用户壁纸目录）
   │   ├─ HostController       （CDP 注入毛玻璃主题到宿主）
   │   └─ LocalizationController（CDP 注入汉化翻译层）
   ├─ 额度适配器 HostQuotaAdapter（本机日志/宿主服务，Gemini + Claude&GPT 双通道）
   └─ 原生辅助 ForegroundHost.exe（宿主 z-order 磁吸）
```

**关键档案**
- `Antigravity-Cat-Widget/src/main/index.cjs` — 主进程编排（窗口生命周期、托盘、IPC、轮播、迁移）
- `Antigravity-Dream-Skin/src/domain/settings.cjs` — 皮肤设置（sanitize 先合并后校验，保留扩展字段）
- `Antigravity-Dream-Skin/src/domain/theme-loader.cjs` — WallpaperManager
- `Antigravity-Dream-Skin/src/domain/host-controller.cjs` — 主题注入控制器
- `Antigravity-Dream-Skin/src/domain/localization-controller.cjs` — 汉化控制器
- `Antigravity-Dream-Skin/src/host/theme.cjs` / `localize.cjs` — **serialized 注入宿主页面的脚本（必须完全自包含！）**
- `Antigravity-Cat-Widget/src/adapters/host-quota.cjs` — 额度双通道 + 模型/思考强度识别
- `Antigravity-Cat-Widget/src/renderer/` — 桌宠（renderer.cjs/personality.js/widget.css）+ 统一设置中心（settings.*）
- `Antigravity-Cat-Widget/src/renderer/pet-behavior.js` — 点击语义/表情/眨眼/打盹状态机（短按 ≤700ms 且位移 ≤10px 才算点击）
- `Antigravity-Cat-Widget/src/main/online.cjs` + `src/renderer/online-panel.js` + `shared/online.js` — 在线图库、更新检测、在线配色
- `Antigravity-Cat-Widget/src/domain/companion-visibility.cjs` — 桌面端/网页端焦点互斥
- `online-assets/` — 在线图库清单 `catalog.json`、角色/主题 JSON 与壁纸包
- `tools/` — 启动/安全重启/构建/验收/Inno vendor/帧图同步
- `tools/installer/star-suite.iss` — Inno 安装脚本（core/webext 组件、Tasks、优雅进退）
- `archive/legacy-dream-skin/` — 已退役的独立 Dream Skin Electron 壳层，只作历史参考，不进入构建
- `archive/legacy-byok/` — 已封存的 BYOK 网关与宿主入口，不进入默认测试和发行构建

---

## 2. 核心机制与设计决策

### 2.1 配置持久化（负禁令 1 的落地）
`DreamSkinSettings.sanitize()` 与 `SettingsManager.sanitize()` 均遵循：**先合并入参 → 再校验已知项 → 保留未污染扩展字段**。`wallpaperId`/`wallpaperFile`/`slideshow`/`legacyMigrated` 等全部保留，重启不回退。

### 2.2 壁纸管理（WallpaperManager）
- 扫描仓库 `assets/wallpapers/`（目录即包，manifest 可选）+ **用户壁纸目录** `~/.antigravity-dream-skin/wallpapers/`（散图即包，id=文件名）
- **无 SHA256 强校验**（负禁令 2）：仅按文件头验证 PNG/JPEG/WebP 并实测尺寸，损坏包跳过不白屏
- 轮播单一真源：`slideshow`(bool) + `slideshowIntervalMinutes`(1-60)；`autoRotate` 为惰性旧字段（`legacyRotatePatch` 一次性迁移，`legacyMigrated` 标记防重跑）
- `wallpaperFile` ↔ `wallpaperId` 双向同步；旋转更新两者

### 2.3 双模式常驻（负禁令 3 的落地）
`hostWindowOnly=true` 时宿主消失 → `standaloneDesktopMode`（默认 true）优雅退守桌面（最后自由坐标/右下角），不闪退不隐藏；关闭该项才维持隐藏。桌面模式 `show()` 用 `setAlwaysOnTop(true,"screen-saver")`。

### 2.4 额度与模型识别（host-quota.cjs）
- **序列化契约**：`readHostQuota`/`queryHostQuota`/`extractModelInfo`/`parseResetTime` 会被 `.toString()` 注入宿主页面——**完全自包含**（helper 必须内联），引用模块级符号 = 宿主 ReferenceError
- 快照形状：`{fiveHour, weekly, fiveHourReset, weeklyReset, claudeGpt:{...}, modelInfo:{modelName,thinking,fullText}, ...}`；**主路径与缓存路径都必须置 `cacheAvailable:true`**（历史回归教训）
- 模型识别：只读 `[data-testid="model-selector-trigger"]` 的 aria-label（"current:" 段），思考强度 High/Medium/Low/None/Off/Extended
- 重置文案正则兼容 "Resets in"/"refresh in" 两种措辞，满额显示"满额"
- 快照 `artVersion` 同时用于立绘缓存击穿（size+mtime 哈希指纹，渲染层帧 URL 带 `?v=`）

### 2.5 界面汉化（实验，0.5.0 新增）
宿主是**自研 React IDE**（4.6MB app.asar），"自带汉化文件"仅是 Chromium 层 `.pak`（只管原生菜单），**改宿主 asar 属禁区**。故用 **CDP 翻译层**：
- 字典：`Antigravity-Dream-Skin/assets/localization/zh-CN.json`（`$comment` 键加载时剥离）
- `localize.cjs`：精确匹配可见文本节点；输入框/代码/终端/`[contenteditable]` 绝对不碰；**原文存数组（WeakMap 不可迭代，勿用）**；`destroy()` 逐字还原
- 开关：统一设置 →「Antigravity 界面语言」（`dreamSkin.uiLanguage = en | zh-CN`）
- 局限：动态拼接串、placeholder 暂不覆盖；字典持续扩充即可，无需改代码

### 2.6 安全重启（负禁令 5 的落地）
`npm run restart:widget|skin` → 单实例 IPC `--quit` → `lock-probe.cjs` 轮询锁释放（退出码 0=空闲/3=占用）→ 源码重拉。**严禁 taskkill /f**（会打断 writeJson 原子写入）。

---

## 3. 安装包（Inno Setup 7.1.1）

- 一次性 vendor：`npm run setup:inno`（官方 GitHub Release + 官方简中语言包 → `tools/vendor/InnoSetup/`，已 gitignore）
- 构建：`npm run build:installers` → `dist/installers/Catstella-Setup-<ver>-x64.exe`
  - 统一负载只复制桌宠运行代码、Dream Skin 的 `domain/`、`host/`、壁纸和汉化资源，以及 shared 与许可；旧 Dream Skin 壳层和归档 BYOK 都不会进包
  - **Chromium `locales/` 整个删除**；Electron 45.1.0 无 locales 仍能启动，只在 exe 旁写一条 `locale_file_path.empty()` 警告到 `debug.log`
  - `[Files]` 用 `Excludes` 拦掉构建机文件 `StartupSettings.exe`、`GeneratedVersion.cs`、`IconSwap.exe`；`verify-installers.cjs` 有对应断言
  - `IconSwap.cs`（BeginUpdateResource 零依赖）替换 exe 的 Electron 默认图标
  - 表情图标：idle/proud-v3/sad-v3 → `icons/launch|settings|uninstall.ico`（sharp 运行时生成）
  - **web 插件组件从 `D:\Catstella-web` 现场构建**（`tools/web-companion-path.cjs` 探测，`WEB_COMPANION_PATH` 可覆盖）
- `star-suite.iss` 要点：`core`(fixed) / `webext`(可选，档位 1 = 复制 xpi+zip + 图文指引)；`[Tasks]` 自启动/联动经 `[Code]` 写 SetFlags 语义注册表+Run 项；`PrepareToInstall` 优雅退出旧实例并清标志放行守护；卸载前 quit+等待，卸载后清注册表并 `[UninstallDelete]` 清空 `{app}`（**个人数据目录保留**）
- **Inno 7 破坏性变更**：无 `iscustom` / 无 `skipifdoesntexist` 旗标 → webext 产物用 `#ifdef WebExtFiles` 预处理条件包含

**验收链**（`tools/verify-installers.cjs`）：Inno 静默安装到中文路径目录 → 双项目/图标/webext/无 locales/无构建机文件断言（**轮询容忍杀软扫描**）→ `StartupSettings.exe --self-test` → 真实渲染层启动（playwright，无 locales）→ unins000 卸载 → 目录消失 → 写 `evidence/installer-report.json`。已知环境幽灵：playwright `app.close()` 可能留孤儿进程 → 按测试 data-dir 精准 `Stop-Process`（**勿触碰真实用户实例**）。

---

## 4. 分房约定（worktree）

```
D:\Catstella       @ main                  ← 桌面端，跟踪 origin/main
D:\Catstella-web   @ feat/browser-extension ← web 插件；隔壁会话工作区
```
- 同一仓库、历史共享；合并走 git，**CHANGELOG.md 是唯一共享文件**（两边各自追加，合并两边都保留）
- 桌面目录内的 `Gemini-Web-Companion/` 副本已删除，**不要从历史恢复**；跨房素材同步走 `node tools/sync-character-frames.cjs [--check]`
- 角色帧图权威源 = web 端 `Gemini-Web-Companion/assets/characters/`
- 桌面构建自动探测 web 工作树：`../Catstella-web/Gemini-Web-Companion` 或 env `WEB_COMPANION_PATH`

---

## 5. 🩸 血泪教训（改代码前必读）

1. **serialized 函数自包含**：注入宿主页面的函数（theme/localize/quota）会被 `.toString()` 执行，helper 必须内联
2. **cacheAvailable 双路径**：额度主路径与缓存路径都要置标记，否则样本被静默丢弃（曾有主路径样本全灭的回归）
3. **WeakMap 不可迭代**：需要"遍历还原"的记录用数组
4. **主路径输出要有形状断言**：mock 直接返回样本会绕过真实路径，测试全绿≠生产可用
5. **git-bash 的 MSYS 参数改写**：`/COMPONENTS` 等 `/` 开头参数会被改写——调试装包用 node 原生调用（execFileSync），别用 bash 手打
6. **Windows Defender 行为误报**：无签名 csc exe 若同时"创建快捷方式+写 Run 项"可能被拦（self-test 已删遗留 lnk 段）；新解压文件被杀软短暂扫描 → 断言要轮询重试
7. **worktree 路径用正斜杠**：`git worktree add D:/Catstella-web ...`（`\\` 会被折叠成嵌套目录）
8. **缓存击穿**：跨版本同 URL 的 file:// 图片会被 Chromium 缓存回放；帧图 URL 必须带 `artVersion`
9. **stash 会回退别人工作树**：stash 前确认双分支工作树都已提交
10. **跨项目 require 层级**：`src/main/` → 套件根 = `../../../`（两层会静默炸掉主进程 → 无窗口）
11. **无 locales 会写 `debug.log`**：Electron 缺 locales 时在 exe 旁追加 `locale_file_path.empty()` 非致命告警；Inno 只删自己装的文件，卸载会留下该文件导致 `{app}` 删不掉 → 用 `[UninstallDelete] filesandordirs` 清空
12. **`Source:"{#StageDir}\*"` 会带进构建机文件**：`GeneratedVersion.cs`、`IconSwap.exe` 曾装进 `{app}`；一律在 `[Files]` 加 `Excludes`，并在 `verify-installers.cjs` 加断言防回归

---

## 6. 已知问题与排期

| 优先级 | 事项 | 说明 |
|---|---|---|
| P2 | **立绘"返祖"未根治** | 缓存击穿 + `artVersion` 已上；0.6.0 已用项目提供的五张透明帧重制星语/霓音并同步两端；若仍偶发旧图，再排查渲染层状态机 |
| P2 | 汉化字典扩充 | 已扩充至 820+ 条（含设置中心各选项全句说明、通用/权限/浏览器/排队/分支等）；支持 Version/时间等动态模式；修复注入层热更新 dict 闭包 bug；严格保留 Antigravity 与模型/公司原名 |
| P2 | claudeGpt 数据完整性 | 依赖宿主额度服务返回的组结构；宿主改版需同步适配提取器 |
| P3 | 商店上架（Firefox/Chromium） | 需开发者账号 + 签名；安装器当前档位 1（复制包 + 图文指引） |
| P3 | 主题：用户回复可读性 | 已加 user-query 毛玻璃；如反馈不足可继续调 |
| — | ~~locales 瘦身~~ | 0.6.0 已删除全部 `locales/*.pak`，实测可正常启动 |

---

## 7. ⛔ 负面禁令（硬约束，不可违反）

1. 🚫 严禁 sanitize 吞噬/丢弃未显式声明的合法字段（必须"先合并、再校验、留扩展"）
2. 🚫 严禁恢复壁纸单一路径硬编码或单文件 SHA256 强校验（换壁纸不能炸白屏）
3. 🚫 严禁未检测到宿主时让挂件闪退/崩溃/强行销毁（必须优雅退守 Standalone）
4. 🚫 严禁修改宿主安装目录（`D:\Program Files\Antigravity` 与 `%LOCALAPPDATA%` 安装目录仅供调试对照，改动必须落源码仓库）
5. 🚫 严禁 `taskkill /f` 强杀重启（用单实例 IPC + 锁探测；atomic write 不可中断）
6. 🚫 严禁破坏既有单元测试（当前门槛：**65 项全绿**）

---

## 8. 常用命令

```powershell
npm.cmd test                 # 65 项单测
npm run start:widget         # 源码启动（热调试）
npm run restart:widget       # 安全平滑重启（单实例 IPC + 锁探测）
npm run setup:inno           # 一次性 vendor Inno Setup 7.1.1
npm run build:installers     # 出包（自动从 web worktree 构建 webext 组件）
npm run verify:installers    # 安装/运行/卸载全链验收
node tools/sync-character-frames.cjs --check   # 帧图跨房差异检查
```

---

## 9. 数据与运行时目录

| 路径 | 内容 |
|---|---|
| `~/.antigravity-cat-widget/` | 挂件设置 settings.json、用量 ledger、startup/recovery 日志 |
| `~/.antigravity-dream-skin/` | 皮肤设置（含 uiLanguage/slideshow）、`wallpapers/` 用户壁纸 |
| `%LOCALAPPDATA%\Programs\Catstella\Suite\` | 安装目录（Inno 管理，卸载清空此目录） |
| HKCU `Software\AntigravityStarSuite\Suite` | 自启动/联动标志、InstallPath |
| `D:\Program Files\Antigravity\` | **宿主安装，只读参考**（CDP 端口在 `~/.antigravity/DevToolsActivePort`） |
