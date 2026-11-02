# 🐱 Catstella · 桌面端主分支交接与独立化改造方案 (Branch: `main`)
> **项目定位**：具备独立运行能力、脱离反重力宿主依赖、支持双端适配与壁纸轮换的桌面猫娘套件  
> **适用受众**：接手桌面端开发的马仔 / 协同 Agent / 开发者  
> **文档版本**：v0.3.1-refactor | 更新时间：2026-11-03

---

## 1. 战略目标与核心愿景

当前 Catstella 桌面套件正处于从“单纯的宿主附加插件”向**“高独立性、稳定常驻、双端联动”**跃迁的关键阶段。

### 核心重构目标：
1. **脱离反重力客户端强依赖（独立常驻）**：
   - 借鉴 **`codex-maid-widget`** 与 **`DeepSeek-Balance-Whale-Widget`** 的成熟桌面经验；
   - 当 Antigravity IDE 未启动时，桌宠依然作为**独立桌面挂件**常驻桌面，自由拖动、点击互动、台词、音效、摸头/打盹等功能完整可用；
   - 当 Antigravity IDE 启动并置顶时，无缝切换为**宿主磁吸跟随模式 (Host-Follow)**；
2. **彻底根治“用 `.bat` 重启后配置回退”与“壁纸无法自动切换”的深层缺陷**；
3. **资产与配置大一统**：桌宠与皮肤的素材、台词库与状态机与 `Gemini-Web-Companion` 共享共荣。

---

## 2. 🚨 关键 Bug 源码级根因深度剖析

### 2.1 缺陷 A：用 `.bat` 重启后设置面板回到了以前的样子（配置丢弃）
经审计，该缺陷由两个致命点叠加导致：
1. **`DreamSkinSettings.sanitize()` 显式吞噬字段**：
   * **位置**：`Antigravity-Dream-Skin/src/domain/settings.cjs` 第 5 行：
     ```javascript
     sanitize(v){
       return {
         ...DEFAULT_SETTINGS,
         outputMode: v.outputMode === "glass" ? "glass" : "transparent",
         enabled: bool(v.enabled, false),
         positionX: finite(v.positionX, 50, 0, 100),
         positionY: finite(v.positionY, 50, 0, 100),
         zoom: finite(v.zoom, 1, 1, 2),
         fit: ["cover", "contain", "adaptive"].includes(v.fit) ? v.fit : "adaptive",
         scrim: finite(v.scrim, 12, 0, 60),
         opacity: finite(v.opacity, 55, 0, 100),
         protectEditor: true,
         protectTerminal: true
         // 致命 Bug：这里完全没有保留 v.wallpaperId 和其他扩展字段！
       };
     }
     ```
   * **后果**：无论用户在界面上如何选择新壁纸或扩展设置，只要触发保存或重启，`sanitize` 就会直接把 `wallpaperId` 抹杀，强制退回 `DEFAULT_SETTINGS` 默认值！
2. **源码工作区 vs. 安装解压区冲突**：
   * 原作者在 v0.2.12 中生成的独立安装器将程序解压在 `%LOCALAPPDATA%\Programs\AntigravityStarSuite\`，如果 `.bat` 启动的是该目录下的 EXE，它读取的是打包时的冻结快照，根本不读取当前 Git 工作区的新代码！

---

### 2.2 缺陷 B：自动切换壁纸失效（单一路径硬编码 + SHA256 强校验死锁）
* **位置**：`Antigravity-Dream-Skin/src/domain/theme-loader.cjs` 第 3 行与第 10-11 行：
  ```javascript
  this.wallpaperPackDir = path.join(this.rootDir, "assets/wallpapers/gemini-character-sheet-v1");
  ...
  const hash = crypto.createHash("sha256").update(b).digest("hex");
  if (hash !== this.manifest.sha256) throw new Error("壁纸校验失败，原文件可能被更改");
  ```
* **死锁根因**：
  1. **目录写死**：壁纸加载器直接把目录定死在 `gemini-character-sheet-v1`，根本没有多壁纸包扫描逻辑；
  2. **哈希硬校验导致崩溃**：作者加入了强校验 `hash !== this.manifest.sha256`。只要用户或程序试图替换图片、或者放入新壁纸，loader 直接抛出异常崩溃，导致所谓“自动切换壁纸”完全沦为空谈！

---

## 3. 💡 借鉴开源参考项目的重构蓝图

### 3.1 借鉴 `codex-maid-widget`（桌面独立生态与素材包体系）
* **无宿主独立桌面模式 (Standalone Mode)**：
  * 在没有 IDE 连接时，桌宠进入“休闲挂机/巡逻”状态，保持呼吸、台词吐槽、点击音效与右键菜单；
  * 配额条在断开宿主时，展示“历史缓存配额”或展示今日单日使用量估算，绝不强制隐藏或闪退；
* **插件化壁纸与角色包目录结构**：
  * 改造 `assets/wallpapers/`，支持用户自建子文件夹（如 `wallpapers/star-sky/`、`wallpapers/cyberpunk/`），每个文件夹放入图片即可自动识别，彻底废弃脆弱的硬编码 SHA256 校验！

### 3.2 借鉴 `DeepSeek-Balance-Whale-Widget`（弹性物理回弹与优雅托盘）
* **物理弹簧防穿透**：保留并优化原有的 120 DIP 屏幕边缘磁吸，支持无宿主状态下的全屏幕四角自动停靠；
* **优雅单例生命周期管理**：在启动时先通过 IPC 发送 `--quit`，等待互斥锁释放后再平滑拉起，杜绝直接暴力 `taskkill` 造成的配置写入半截损坏。

---

## 4. 🛠️ 改造实施方案 (Refactoring Roadmap)

### 阶段 1：修复设置持久化与壁纸管理核心
1. **重构 `DreamSkinSettings.sanitize()`**：
   - 保留传入的 `wallpaperId`，并允许动态扩展字段（如 `autoRotateInterval`、`customWallpaperPath` 等）；
2. **重构 `theme-loader.cjs` 为 `WallpaperManager`**：
   - 动态扫描 `assets/wallpapers/` 下的所有可用子目录；
   - 移除单一壁纸哈希强校验（改为仅校验图片格式为 PNG/JPG/WebP 是否有效且尺寸可读）；
   - 新增定时切换机制：支持 `关闭` / `每 15 分钟` / `每 1 小时` / `每次启动` 自动轮转壁纸包。

### 阶段 2：挂件双模态常驻架构 (Dual Operating Modes)
1. **改造 `Antigravity-Cat-Widget/src/main/index.cjs`**：
   - 新增配置项 `settings.get("standaloneDesktopMode")`（默认 `true`）；
   - 当 `hostPlacement` 找不到 Antigravity 宿主窗口时：
     - 若 `hostWindowOnly === true`，维持原样隐藏；
     - 若为独立桌面模式，挂件不隐藏，平滑退回桌面右下角（或用户最后拖放的独立坐标），进入 `idle` 或 `sleep` 待机动画；
2. **配额断连展示缓冲**：
   - 宿主断连时，配额条保留最后一次有效抓取记录，并打上“离线缓存”微标，待 Antigravity 重新唤醒后无缝静默刷新。

### 阶段 3：安全开发与重启脚本 (`dev-restart.ps1` / `restart.cmd`)
* 废弃原作者容易引起混淆的静态安装包启动命令，在根目录提供标准的：
  ```powershell
  # 优雅平滑重启桌宠（针对当前 Git 源码工作区，不调用外部静态安装包）
  npm run restart:widget
  npm run restart:skin
  ```

---

## 5. ⛔ NEGATIVE PROMPT (马仔负面禁令 · 严格遵守！)

在执行重构与编码时，**绝对禁止**出现以下行为：

1. 🚫 **严禁在 `sanitize()` 过程中吞噬或丢弃未显式声明的合法字段**：所有传入设置必须遵循先合并、再校验已知项、保留未污染扩展项的原则，绝不能写死覆盖；
2. 🚫 **严禁在 `theme-loader.cjs` 或壁纸逻辑中写死单一路径或死板的单文件 SHA256 校验**：换壁纸是核心自由度，绝不可因哈希不符直接抛出异常导致白屏；
3. 🚫 **严禁在未检测到反重力宿主时让挂件直接闪退、崩溃或强行销毁**：必须优雅退守到 Standalone 桌面待机模式；
4. 🚫 **严禁直接修改或强依赖打包后的 `%LOCALAPPDATA%` 外部安装目录进行调试**：所有改动必须严格落地于 Git 源码仓库 (`d:\Catstella`)；
5. 🚫 **严禁使用暴力 `taskkill /f` 进行无参数强杀重启**：必须使用优雅 IPC 或等待单例锁释放，防止中断 `writeJson` 原子写入导致 `settings.json` 变成空文件；
6. 🚫 **严禁破坏现有的 40 项单元测试**：修改 `settings.cjs` 或 `theme-loader.cjs` 时，运行 `npm.cmd test` 必须保持 40 项全绿验收。

---

## 6. 🚀 丢给马仔的执行指令 (Prompt Template)

可以直接将以下 Prompt 复制给新马仔开始执行：

```markdown
你现在负责推进 Catstella 桌面端主分支 (`main`) 的独立化与核心缺陷改造。
工作目录为 `d:\Catstella`。

请先完整研读设计交接文档：
👉 `docs/HANDOVER_MAIN_DESKTOP.md`（重点关注第 2 节 Bug 根因、第 3 节参考借鉴、以及第 5 节 Negative Prompt 负面禁令）

请按序攻坚以下三项任务：

### 任务 1：修复设置持久化丢弃与壁纸切换死锁
1. 修改 `Antigravity-Dream-Skin/src/domain/settings.cjs`：在 `sanitize()` 中必须完整保留 `wallpaperId` 及扩展字段，彻底解决重启后设置面板回退默认的缺陷；
2. 重构 `Antigravity-Dream-Skin/src/domain/theme-loader.cjs`：
   - 废除硬编码的单一路径 `gemini-character-sheet-v1`；
   - 废除导致自定义壁纸崩溃的单文件 SHA256 强哈希校验；
   - 支持动态读取 `assets/wallpapers/` 下的所有壁纸包，并支持在控制面板中自由选择与切换壁纸。

### 任务 2：实现脱离宿主的“独立桌面常驻模式”（参考 codex-maid / dsh-whale）
1. 改造 `Antigravity-Cat-Widget/src/main/index.cjs` 中的宿主可见性状态机：
   - 当未开启 Antigravity 客户端时，挂件不退场，安全降级为独立的桌面悬浮桌宠模式，保持拖动、点击音效、傲娇台词与表情动画全功能运作；
   - 当 Antigravity 宿主开启并置顶时，无缝切换为贴边跟随模式。

### 任务 3：编写安全的源码热重启脚本与单元测试验证
1. 在 `tools/` 与 `package.json` 中编写 `npm run restart:widget` 与 `npm run restart:skin`，实现先优雅通知退出、等待单例锁释放、再基于当前源码安全重载，杜绝修改失效；
2. 运行 `npm.cmd test`，确保 40 项既有测试 100% 通过（如因废除 SHA256 导致测试断言变动，需同步重构测试用例以符合动态多壁纸架构）。
```
