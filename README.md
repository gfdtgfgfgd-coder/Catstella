# 星语 · Antigravity Star Suite

给 Antigravity 添一点蓝紫色星光：一个 Gemini 猫娘桌宠，以及一套可随时撤回的桌面皮肤。

**两个插件独立启动、独立设置。Windows x64 本地项目，非 Google 官方产品。**

<p align="center"><img src="Antigravity-Cat-Widget/assets/character-packs/gemini-star-v1/frames/idle.png" width="260" alt="星语 Gemini 猫娘桌宠"></p>

## 喵言喵语 · Cat Widget

<p align="center"><img src="docs/images/widget-quota.png" width="300" alt="桌宠额度气泡，手动演示数据"></p>

图中 14% / 68% 为隔离测试手动填写的演示数据，不是公开账号额度。

- 半身猫娘、按压与弹性回弹、拖动、左右下角吸附和转身，支持 140–360 像素大小。
- 额度气泡提供 **Gemini Models 5 小时 / 1 周两根额度条**；低于等于 30% 为琥珀色，低于等于 10% 为玫红色。
- 气泡默认收起，点击展开；空闲约 6.5 秒收起，悬停暂停。四页依次是 Gemini Models、喵言喵语、今日用量、最近步骤；台词页点击角色换句。
- 50 句中文傲娇台词、可关闭的得意与委屈彩蛋、呼吸和流光；减少动态设置可停用动态效果。
- 桌面模式与“仅在 Antigravity 窗口内显示”模式，支持置顶、鼠标穿透、托盘唤回、重启挂件与设置撤回。
- 按下/松开配对音效，公开版包含 **四套、八段**可明确记录许可的音效，默认静音。
- 读取本机日志中的数值元数据，按会话和模型步骤去重，保留最近 90 天账本，不保存聊天正文。
- 为宿主最小化恢复、休眠恢复、辅助进程失联、渲染崩溃与空白画面提供恢复处理。

### 额度怎样读取

挂件每次启动立即通过已登录 Antigravity 宿主自身的后台额度服务查询 **Gemini Models 的 5 小时 / 1 周剩余比例**，不自动打开 Settings → Models；设置中的“读取宿主额度”也使用相同后台路径。成功后每 30 秒查询；启动连接失败或尚未初始化时按 3、6、12、24、30 秒退避重试。并发请求去重，停止后的旧响应不会覆盖新状态。

后台查询使用**未公开的宿主内部服务**，通过本机 CDP 与 React 服务结构定位，不读取或导出 API 密钥、登录令牌和聊天正文，不修改宿主安装文件。它不是 Google 承诺稳定的公开接口；宿主升级可能失配。旧版缓存仅作为兼容回退，不等于实时额度。

查询失败时保留本次运行已读取的旧值并标记待更新；无数值时显示未知。切换宿主目标清空缓存，重启不从文件恢复账户额度。**本机观察时间不等于服务器更新时间**。同一宿主内切换账号后，旧值可能短暂保留直到下一次查询完成。

### 其他电脑使用条件与排错

- Windows 10/11 x64，Node.js 22+，按下方步骤安装依赖并编译原生辅助程序。
- Antigravity 已运行且登录，并提供已有的 localhost CDP 调试端口。无端口时程序只等待，不修改安装文件、不擅自重启宿主或替用户开启远程调试。
- 设置页显示等待连接、查询失败或宿主初始化中/接口不兼容；这些状态不能当作余额为零。可点“读取宿主额度”后台重试。
- 本次验证基于开发机当前宿主；尚未在第二台电脑及所有宿主版本、多屏/DPI环境完成验证，建议先试用。反馈时提供系统/宿主版本与上述状态，不要提交令牌或原始会话日志。

也可手动分别填写两个周期比例，明确标记为手动记录。tokens 不用于推算账户余额或金额。

## Dream Skin

<p align="center"><img src="Antigravity-Dream-Skin/assets/wallpapers/gemini-character-sheet-v1/wallpaper.png" width="900" alt="Gemini 蓝紫设定集壁纸"></p>

- 蓝紫设定集壁纸与整窗配色，覆盖主内容、侧栏、标题和控件。
- 可调壁纸可见度、遮罩、位置与 100%–200% 缩放，支持拖动预览定位、适配窗口及裁切显示。
- 对话正文可选透明或分段玻璃；输入区域使用圆角半透明玻璃。文字颜色保留，真实代码编辑器和终端保留保护背景。
- 自动重连；关闭开关或从托盘退出会撤销自有节点和样式。支持撤回本次调整、居中复位与恢复默认。
- 通过宿主已有的 localhost CDP 调试端口应用页面内样式，不修改安装目录或 app.asar。

## Windows 一键安装（推荐）

从 [v0.2.12 发布页](https://github.com/Monokumakuki/Antigravity-Star-Suite/releases/tag/v0.2.12) 分别下载：

- `StarWidget-Setup-0.2.12-x64.exe`：星语桌宠挂件。
- `DreamSkin-Setup-0.2.12-x64.exe`：织梦壁纸皮肤。

双击后可选择安装目录，再点“一键安装”。每个安装包独立包含 Electron，无需 Node.js、npm 或编译工具。需要 Windows 10/11 x64 与系统自带的 .NET Framework 4.x；不支持 macOS/Linux 或原生 Windows ARM64 安装。程序安装到当前用户目录，不需要管理员权限。

安装页两项均为可选，首次默认关闭：

- **开机登录后自动启动**：通过当前用户的 Windows 登录启动项，后台启动插件。
- **打开 Antigravity 时联动启动**：登录后运行后台检测程序，每2秒查看同一Windows会话内的Antigravity进程。检测到宿主从未运行变为运行时，后台启动插件；壁纸联动时自动启用皮肤。宿主已运行时启用该功能也会触发一次。与宿主安装路径无关，不修改宿主快捷方式或安装文件。

两个选项可独立勾选。开始菜单 → Antigravity Star Suite → 对应插件 → **启动设置**可随时关闭。只启用开机启动时，启动辅助程序随后退出；启用联动时它持续低频检查。不自动关闭已启动插件，也不会在用户手动退出插件后反复拉起；再次关闭并打开宿主才触发下一次。

Windows 设置 → 应用中可分别卸载；也可用开始菜单里的卸载入口。卸载移除启动项与自有快捷方式，保留用户设置/账本。安装包目前**未做代码签名**，Windows可能显示未知发布者提示；请核对发布来源及随包 `SHA256SUMS.txt`，不要全局关闭安全防护。

联动只负责启动程序，不能保证任意宿主版本的额度或皮肤内部结构兼容。宿主需已登录，并提供现有本机CDP端口；检测不到时插件等待并显示状态，不擅自开启端口。尚未完成第二台电脑、所有DPI和多屏环境验收。

详细构建和卸载边界见 [安装说明](docs/INSTALLERS.md)。

## 从源码运行

需要 Windows 10/11 x64、Node.js 22 或更新版本，以及已安装并运行的 Antigravity。原生辅助程序使用 Windows 自带 .NET Framework C# 编译器。当前实机适配基于 **Antigravity 2.28.0**；宿主更新可能改变页面结构和缓存字段。

```powershell
git clone https://github.com/Monokumakuki/Antigravity-Star-Suite.git
cd Antigravity-Star-Suite
npm ci
npm run build:native
npm run start:widget
npm run start:skin
```

`npm ci` 会下载锁定的 Electron 运行时。若 npm 环境禁止安装脚本，需自行完成 Electron 安装，不能只运行 `npm ci --ignore-scripts` 后直接启动。

皮肤面板中打开“应用到 Antigravity”。宿主没有可用的本地调试端口时，面板显示等待连接；项目不会擅自重启宿主或更改安装文件。两个程序可独立使用。

快捷键：`Ctrl+Alt+G` 唤回挂件；`Ctrl+Alt+Shift+G` 关闭鼠标穿透。右键角色或使用系统托盘打开设置。关闭皮肤控制面板时，已启用的皮肤留在托盘；选择“退出并恢复原样”才会彻底退出。

源码仓库不含运行时和EXE；Release另提供两个独立安装包，内含运行环境。源码用户仍需安装Node.js并编译原生辅助程序。

## 配置、隐私与撤销

| 数据 | 位置 |
| --- | --- |
| 挂件设置与数值账本 | `%USERPROFILE%/.antigravity-cat-widget/` |
| 皮肤设置 | `%USERPROFILE%/.antigravity-dream-skin/` |
| 本机原始日志（只读） | `%USERPROFILE%/.gemini/antigravity/brain/` |

项目不向外部上传会话内容，不存储 API 密钥或登录令牌。数值账本、启动/恢复日志和 Electron 自身缓存保存在本机。自动化验收输出位于 `evidence/`，不提交 Git。

卸载前从两个托盘退出；皮肤正常退出会还原页面。强制结束导致临时样式残留时，刷新/重开宿主可清除。删除项目目录即可移除程序；保留或自行备份上述用户目录可保留设置。源码运行默认不注册开机启动。安装版仅在用户勾选时注册对应登录启动项，支持在启动设置中关闭。

## 开发与验证

```powershell
npm test
npm run verify:runtime
```

单元测试覆盖额度缓存、去重与增量日志、异常数值、状态机、配置、宿主几何和连接生命周期等。运行检查需要本机 Microsoft Edge，会启动隔离的 Electron 测试窗口和受控浏览器；不会发送模型请求。运行检查与真实桌面合成、长期跨屏稳定性不是同一验证范围。

```text
Antigravity-Cat-Widget/   桌宠、气泡、额度与数值日志适配器
Antigravity-Dream-Skin/   控制面板、壁纸与可撤回宿主样式
shared/                  本地 CDP、持久化与第三方 ws
tools/                   启动、原生编译与隔离验证
```

已知边界：后台额度使用未公开内部接口，可能随版本失配；没有云端计费；没有完成 codex-maid 的全部聊天、持久记忆、多账号、预测与管理功能。Windows 原生窗口跟随已在开发机器验证，所有 DPI、多屏、虚拟桌面及数小时稳定性仍需更多反馈。欢迎通过 Issues 附上版本、重现步骤与脱敏截图。

## 来源与许可

原创软件采用 [MIT](LICENSE)。**MIT 不覆盖角色、美术、品牌标识及第三方音频。** 美术来源与范围见 [ASSETS.md](ASSETS.md)，依赖和音效见 [NOTICE.md](NOTICE.md)。

角色设计参考按提供者记录署名 **ZipZipPipe**；角色与设定集图片由 AI 辅助生成，保留生成提示词，不宣称 Google 官方授权或原设的再许可权。公开版未包含原作者参考图、私人截图或未确认再分发许可的 DSH 鸭叫音频。

交互和产品灵感来自 [codex-maid-widget](https://github.com/Feeesack/codex-maid-widget) 与 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)。感谢这些项目的公开实现与音效来源记录。
