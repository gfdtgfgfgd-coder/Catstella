# Catstella 桌面工作区 · DeepSeek Harness 交接

> 更新时间：2026-11-05  
> 状态：下文保留的是 20:41 那次构建的历史记录。发布以 GitHub Actions 的三端构建和验收结果为准。<br>
> 工作区：`D:\Catstella`，分支 `feat/desktop-suite`  
> Web 工作区：`D:\Catstella-web`，分支 `feat/browser-extension`

## 0.6.0 发布流程

- 新安装器移除了递归删除整个 `{app}` 的规则，并替换旧测试版遗留的卸载记录。卸载只额外清理内容全部是 Chromium 缺语言包告警的 `debug.log`。CI 分别验证干净安装、覆盖旧卸载记录后卸载，并检查安装目录中的用户文件仍在。
- Windows 和 Web 构建完成时自动生成 SHA-256 校验和。Windows 验收会比对随包内置的两份 Web 压缩包。发布任务对实际上传的七份 Windows、macOS、Linux 安装文件生成 `SHA256SUMS.txt`。
- Web 源码由 `web-source-v1.5.0` 标签固定，`v0.6.0` 触发三端封包。首次 `desktop-v0.6.0` 运行因 Windows 工作流漏编原生助手和素材换行转换而未发布。所有构建和启动检查通过后才创建 Release。Mac 和 Linux 是实验构建，未做实机回归。

## 用户最新决定

1. **不做桌面/Web 分包。** Web 扩展继续随完整安装包提供，双端联动和离线安装保持一体。
2. 删除 Chromium 的全部 `locales/*.pak`。这些文件服务于 Chromium 自带界面，不是 Antigravity 主题资源。
3. 旧独立 Dream Skin 应用退役；主题引擎继续保留为统一桌面应用的内部模块。
4. 实验性 BYOK 从运行源码封存到 archive，恢复前必须重新做 Antigravity 实机验证。
5. 不要在本轮发布前全量重命名 `Antigravity-Cat-Widget` / `Antigravity-Dream-Skin`。

## 已完成

### 旧 Dream Skin 壳层退役

以下旧独立应用文件已移入 `archive/legacy-dream-skin/`：

- `Antigravity-Dream-Skin/src/main/index.cjs`
- `Antigravity-Dream-Skin/src/main/preload.cjs`
- `Antigravity-Dream-Skin/src/renderer/index.html`
- `Antigravity-Dream-Skin/src/renderer/renderer.cjs`
- `Antigravity-Dream-Skin/src/renderer/style.css`
- 旧 `package.json`、README、图标和 `启动星语皮肤.cmd`

当前 `Antigravity-Dream-Skin` 只保留统一应用实际需要的内部主题引擎：

- `src/domain/settings.cjs`
- `src/domain/theme-loader.cjs`
- `src/domain/host-controller.cjs`
- `src/domain/localization-controller.cjs`
- `src/host/theme.cjs`
- `src/host/localize.cjs`
- `assets/wallpapers/`
- `assets/localization/`

根脚本 `start:skin`、`restart:skin` 已移除。皮肤只能由统一 Catstella 进程启动。

### BYOK 封存

- `shared/gateway/` 已移至 `archive/legacy-byok/shared/gateway/`。
- Dream Skin 的 BYOK portal controller 和注入入口已移至 `archive/legacy-byok/`。
- `Antigravity-Cat-Widget/src/main/index.cjs` 现在固定使用 `devGateway=null`、`byokPortal=null`，正常运行不会加载归档模块。
- 根 `package.json` 增加了 `"byokDevelopment": false`。
- 默认测试列表移除了已经归档的 gateway 测试。
- 安装器的旧版升级清理规则继续保留，用于删除用户机器上早先安装的 BYOK 文件。

### 构建精简

- `tools/build-installers.cjs` 不再复制 Dream Skin 的旧 `src/main`、`src/renderer`、独立 `package.json` 和旧图标。
- Dream Skin 只复制 `src/domain`、`src/host`、`assets/localization`、`assets/wallpapers`。
- `ForegroundHost.cs` 不再进入发行包，运行时只保留编译后的 `ForegroundHost.exe`。
- 构建产物会删除整个 Electron `locales/` 目录。
- `tools/verify-installers.cjs` 已增加断言：
  - Dream Skin 旧 main/renderer 不得进包；
  - `locales` 目录不得存在；
  - BYOK 不得进包；
  - Web 扩展 XPI/ZIP 继续进包；
  - 构建机文件 `GeneratedVersion.cs`、`IconSwap.exe` 不得进包。
- `tools/installer/star-suite.iss` 已增加覆盖升级清理，删除旧 Dream Skin 壳层、旧图标和旧 BYOK 文件。
- `[Files]` 通配符补上 `Excludes:"StartupSettings.exe,GeneratedVersion.cs,IconSwap.exe"`，避免把构建辅助文件装进 `{app}`。
- 新增 `[UninstallDelete] Type: filesandordirs; Name: "{app}"`：Electron 在无 locales 时会在安装目录写 `debug.log`，Inno 默认只删安装清单内的文件，导致卸载后目录残留。

### 0.6.0 发布结果

**可发布产物**

- 路径：`D:\Catstella\dist\installers\Catstella-Setup-0.6.0-x64.exe`
- 大小：**172,753,159 字节（164.75 MiB）**，写入时间 2026-11-05 20:41:04
- SHA-256：`94b63ab880d62dec055c6abaf1cdc2cb6d697bd016261a88644e256ffc79e16d`
- 同目录 `.sha256` 已按“哈希 + 两个空格 + 文件名”重写（97 字节，ASCII）；`dist/installers` 只有一个 exe，无 `*-slim.exe`。
- 构建命令：`node tools/build-installers.cjs`（未使用 `--slim`，未做 Web 分包）；日志 `dist/build-20261105-2042.log`，ISCC 编译 124.281 秒。

**四道验收全部通过**

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试 | `node --test <HANDOFF 列表 10 个文件>` | 65/65，日志 `dist/unit-tests-20261105-2043.log`（最终树复跑，20:43） |
| 安装/启动/卸载 | `node tools/verify-installers.cjs` | pass，报告 `evidence/installer-report.json`（checkedAt 2026-11-05T12:41:51.378Z） |
| 冷启动回归 | `node tools/verify-cold-start.cjs` | PASS，日志 `dist/verify-cold-start-20261105-2042.log` |
| 校验和 | `Get-FileHash -Algorithm SHA256` | 见上，已写回 `.sha256` |

安装验证覆盖：中文路径目录下静默安装、`LICENSES.chromium.html` 与 `NOTICE.md`、两个项目文件齐全、表情图标与 Web 扩展组件、自启动/快捷方式判定与临时 Run 项清理、安装后 EXE 在无 Node/无源码工作区下打开统一渲染层且设置可读、`unins000.exe` 卸载只删安装目录。Web 扩展 XPI/ZIP 断言仍在脚本内并通过。

**无 locales 的实际表现（重点结论）**

Electron 45.1.0 在完全没有 `locales/` 时**仍能正常启动并创建窗口**，安装后的主界面、设置读取、截图（`evidence/installer-Suite.png`）全部正常。唯一的副作用是启动时在 exe 同目录写一个 `debug.log`，内容为：

```
[1105/203547.461:WARNING:ui\base\resource\resource_bundle.cc:528] locale_file_path.empty() for locale
```

这是 Chromium 资源包缺失时的非致命告警，不影响功能；没有恢复任何 `.pak` 文件。该 `debug.log` 曾导致卸载后 `{app}` 目录删不掉（Inno 默认只删自己装的文件），已用 `[UninstallDelete] filesandordirs` 解决，安装验证连续两次通过。

**本轮额外修掉的构建/安装缺陷**

1. `[Files]` 的 `Source:"{#StageDir}\*"` 曾把 `GeneratedVersion.cs` 与 `IconSwap.exe` 装进 `{app}`（早期安装树 `dist/安装验证-ztxKgi/Suite/GeneratedVersion.cs` 可证）；已用 `Excludes` 拦掉，并在 `verify-installers.cjs` 加断言防回归。
2. 卸载目录残留（上述 `debug.log`）已用 `[UninstallDelete]` 清空 `{app}`；卸载器仍先执行 `StarSuite.exe --quit` 并等待 12 秒让进程退出。

**未做/未声称**

- 安装包仍未做代码签名，SmartScreen 首次运行仍会提示。
- 只在本机完成验证；`evidence/installer-report.json` 的 `secondComputerVerified` 仍为 `false`。
- `dist/` 下保留了历次 `installer-stage-*` 与 `安装验证-*` 目录（含旧构建日志），未做清理；发布只需 `dist/installers/` 两个文件。
- 目录/品牌全量重命名按用户决定留到后续版本，见下节评估。

## 全量品牌重命名评估

`Antigravity-Cat-Widget` 目前仍出现在约 30 处运行、测试、构建和安装器路径中。只改显示名称风险低；目录、数据目录和安装身份一起改则属于中高风险重构。

高风险耦合点：

1. Electron 入口：
   `Antigravity-Cat-Widget/src/main/index.cjs`
2. 跨目录相对 require：
   桌宠主进程仍引用 `../../../Antigravity-Dream-Skin/...`
3. 原生辅助程序和安装器：
   `ForegroundHost.cs`、`StartupSettings.cs`、`star-suite.iss`、图标路径和更新清理路径。
4. 开发/测试工具：
   `tools/launch.cjs`、`restart.cjs`、`sync-character-frames.cjs`、`source-hashes.cjs`、安装验证。
5. 用户数据：
   `~/.antigravity-cat-widget/`
   `~/.antigravity-dream-skin/`
   直接改名会丢失设置、账号相关缓存、账本与用户壁纸。
6. 安装器身份：
   `AppId`、HKCU 注册表键、默认安装目录和更新器必须继续识别旧安装。
7. 源码指纹：
   路径变化会改变升级验证与构建输入，必须在同一提交内更新。

建议分阶段：

1. **本轮不重命名目录。**
2. 先替换用户可见的旧品牌文案，保留全部路径、AppId 和数据目录。
3. 下一版本再改为 `Catstella-Desktop` / `Catstella-HostTheme`。
4. 目录迁移时保留旧目录兼容层或做一次性自动迁移。
5. 用户数据先双读后迁移，至少保留一个版本的旧路径回退。
6. 安装器 `AppId` 永久保持稳定；注册表键如需改名，必须有迁移逻辑。
7. 所有相对 require、源码指纹、打包脚本、原生工具和 Web worktree 检测在同一提交完成，再跑双端联动与覆盖升级测试。

## 仓库边界

- 桌面源码只改 `D:\Catstella`。
- Web 源码只改 `D:\Catstella-web\Gemini-Web-Companion`。
- 桌面目录原有的 `Gemini-Web-Companion` 副本已删除，不要恢复。
- 安装器和角色帧同步通过 `tools/web-companion-path.cjs` 寻找活动 Web 工作区。
- 不要 `git reset`、`git checkout -- .` 或清理现有未提交改动；工作区包含本轮之前的大量用户改动。

## 当前重要文件

- 构建：`tools/build-installers.cjs`
- 安装脚本：`tools/installer/star-suite.iss`
- 安装验证：`tools/verify-installers.cjs`
- 冷启动验证：`tools/verify-cold-start.cjs`
- 桌面主进程：`Antigravity-Cat-Widget/src/main/index.cjs`
- 内部主题引擎：`Antigravity-Dream-Skin/src/{domain,host}/`
- 旧应用归档：`archive/legacy-dream-skin/`
- BYOK 归档：`archive/legacy-byok/`
- 路线图：`docs/ROADMAP.md`
