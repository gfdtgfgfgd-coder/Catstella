# 更新记录

## 1.4.2 · 额度断供修复 + Inno Setup 组件化安装器 / 2026-11-03

- **额度断供根因修复**：`queryHostQuota`（CDP 服务主路径）返回值丢失 `cacheAvailable:true` 标记——适配器把所有主路径样本误判为"宿主不兼容"丢进 initializing 桶，Gemini 额度永远显示 "—"。恢复标记并在测试钉死 `out.cacheAvailable===true`（此前 mock 直接返回样本绕过了真实路径，教训：主路径输出形状要有形状断言）。
- **安装器迁移 Inno Setup 7.1.1**（`tools/ensure-inno.cjs` 一次性 vendor，`npm run setup:inno`）：`star-suite.iss` 组件化——core（桌宠+皮肤，fixed）/ webext（Web 插件包+安装指引，可选档位 1：复制 xpi/zip + 图文 HTML 指引）；任务页自启动/联动（[Code] 写入 SetFlags 语义注册表+Run 项）；安装前优雅退出旧实例并清标志放行守护；卸载前优雅退出 + 等待，卸载后清标志（个人数据保留）；简体中文官方语言包。LZMA2 压缩使安装器 175M→152M。旧 C# SetupProgram 退役（StartupSettings.exe 保留 --watch/--self-test 职责）。
- 验收链适配：Inno 静默沙箱安装（非中文目录 + 全组件断言 + webext 产物断言）→ 真实渲染层启动 → unins000 卸载收尾；playwright 沙箱孤儿进程按测试 data-dir 精准清理。测试 48 项全绿。

## 1.3.5-ext · 对齐终修 + 壁纸复活 + 自定义形象/壁纸（feat/browser-extension） / 2026-11-03

- **渐变对齐终修（垂直）**：内容的真实切线是**滚动容器底边**而非 Composer 顶边（相差 ~30px）——v1.3.4 的渐隐与玻璃带锚错位置导致"渐变没对齐"。`getCutLineY()` 统一锚定滚动容器底边，渐隐带（110px）与玻璃带（含 Composer 间隙）全部随动。
- **Composer 无限拉长根因**：宽度曾取 `input-container` 容器宽（整个底栏），在部分会话中远超内容列。改为**精确对齐回复卡视口矩形**——宽度=卡宽，水平偏移=卡左缘-药丸原始左缘（relative 偏移不影响布局流，`__kgOffsetX` 防漂移累积）；实机核对 band/composer/card 三者 x≈301 w=967 严格一致。
- **壁纸复活**：挖空区方案的 body 不透明基底色把负 z-index 的壁纸层整个盖住（z 序：body 背景 > 负 z 定位层）。基底色改画独立 `#kimino-base-layer`（z -100000，垫底），body 恢复透明，壁纸层（z -99999，圆角 22 内容列）叠其上——挖空观感不变，壁纸回归。
- **自定义形象 + 自定义壁纸迁移**：设置面板新增两组文件选择——壁纸（≤1920×1080 JPEG 压暗底）与形象（≤640×640 PNG 保透明，覆盖所有表情帧）；canvas 压缩后存 storage dataURL，skin.js/widget.js 经 onChanged 链路即时切换，"默认"按钮一键还原。
- 实机核对：壁纸层可见（z -99999/圆角/IMG）、band=composer=card (x≈301, w=967)、渐隐带贴合切线；dist 重建，版本 1.3.5，测试 48/48 全绿。

## 1.3.4-ext · 全面板毛玻璃 + 挖空圆角区 + 桌宠设置面板（feat/browser-extension） / 2026-11-03

- **全面板毛玻璃统一**：阅读面/用户气泡 `rgba(33,30,45,.74)+blur18`、侧栏 `.68+blur20`、思维链与 usage 卡 `.66+blur16`、菜单/弹窗/代码块 `.90+blur10`（保护区保持高对比）——不透明界面全部转为磨砂质感，壁纸色彩统一从面板透出。
- **Liquid Glass 重构**：废弃 `input-container::before` 方案（位置/层序不可控），改为 skin.js **fixed 覆盖层**（`#kimino-glass-band`，跟随 Composer 实测坐标，mask 渐变 blur11 + 轻暗化，高 100px）；annotate/resize 持续跟随。
- **滚动联动底色渐隐**：卡片/气泡进入 Composer 上方 110px 渐变区时，自身底色沿滚动方向线性渐隐（内联渐变 background-image，文字保持清晰，blur 由 CSS 继续承担）——对话滚入底下时"先溶解、再轻模糊"，不再雾罩生硬切。
- **挖空圆角内容区**：壁纸层几何由 skin.js 实测侧栏右缘后写入（`border-radius 22px` + 内侧描边），body 基底色 `#211e2d` —— 主要操作区呈现为基底上挖出的圆角矩形区域（桌面端 pane 同款）；侧栏毛玻璃坐在基底上。
- **宽度语义修正**：v1.3.3 的"拉宽回复对齐气泡"方向废弃——回复卡恢复 Google 原生统一列宽，**Composer 药丸拉宽至与回复等宽**（实测回复卡宽度与内容列容器取小，内联 width+居中）。
- **桌宠设置面板（web 功能迁移）**：气泡 header 新增 ⚙️ 入口，Shadow DOM 毛玻璃面板含 桌宠/皮肤/台词气泡/音效 四开关、桌宠大小与壁纸浓度滑条、星语喵/林猫形象切换、位置复位——全部走 storage 即时生效（onChanged 链路已有）；enabled 开关修复为 important 内联 `display:contents/none`（contents 宿主下原 block 赋值无效的隐患）。
- 实机验收（IAB）：玻璃带渐隐、毛玻璃可读性、挖空区几何、设置面板渲染与线路全通过；dist 重建，版本 1.3.4。

## 1.4.1 · 模型/思考强度识别回归 + Claude&GPT 实时额度 + 瞳色修正 + 侧栏渐变清除 / 2026-11-03

- **模型识别复活**：`extractModelInfo`（stash 移植）从宿主模型选择器 `[data-testid="model-selector-trigger"]` 只读解析当前模型名与思考强度（High/Medium/Low/None/Off/Extended），随额度查询共用同一次 evaluate（`({modelInfo:…,…await query})`），零额外请求、零 UI 干扰；气泡额度页新增模型徽标与思考强度角标。
- **Claude & GPT 通道**：`readHostQuota`/`queryHostQuota` 升级为多模型组解析——同一缓存/服务里同时抓取 Gemini Models 与 Claude/GPT 组的双周期比例与重置文案（`(?:resets?|refresh) in` 双措辞兼容，满额显示"满额"）；快照新增 `claudeGpt`/`fiveHourReset`/`weeklyReset`/`modelInfo`，切换宿主时与额度一并清空。序列化契约修复：注入宿主的函数保持完全自包含（helper 内联，勿引用模块级符号）。
- **瞳色修正**：默认 gemini-star-v1 全部帧图同步 web 端分支的修正版（idle/proud/sad 系列实测 md5 不同），`shy/angry` 两帧随之点亮（表情管线此前已就绪）。
- **主题微调**：侧栏与选中项的装饰性渐变（radial+repeating-linear）整条移除，保留底色/描边/内侧高亮；`user-query` 容器加毛玻璃卡片与投影，提升用户回复在壁纸上的可读性。
- 测试 48 项全绿（新增 Claude 通道解析、模型信息随行与陈旧保留、宿主切换清空、重置文案解析 4 项）。版本 0.4.1。

## 1.3.3-ext · 卡片同列对齐 + 侧栏渐变根因 + Liquid Glass 过渡带（feat/browser-extension） / 2026-11-03

- **卡片同列对齐**：model-response 卡与 user-query 气泡列同宽同圆角——skin.js 实测当前会话 user-query 容器宽度（回退 720px，clamp 480~960），以内联 `max-width !important` 写入每张卡（绕开 var() 与类名漂移），CSS 统一 `border-radius 22px` + `margin auto` + `box-sizing`；实机核对 20 张卡全部 708px@x430 与气泡列严格对齐。
- **侧栏渐变阴影根因**：Angular Material 的 `mat-nav-list` 宿主自带 `role="navigation"`，被侧栏选择器 `:is(..., [role="navigation"])` 命中导致微网格装饰在每组列表上重复绘制（"奇怪的渐变阴影"元凶）。侧栏规则收窄为仅 `bard-sidenav`，hover/selected 规则同步去裸 `aside`（防误伤 Notifications 通知气泡）。
- **Liquid Glass 过渡带**：内容滚入 Composer 底下的生硬切断（滚动容器底边 572 vs Composer 顶 594）改为渐进高斯模糊——`input-container::before`（高 120px、`backdrop-filter blur(16px)` + `mask-image` 线性渐变 + 底部暗化），`position:relative` 仅加于该容器。
- 实机核对：navList 渐变 CLEAN、glass band（120px/blur16/mask）就位、卡片同列；44/44 测试全绿，扩展版本 1.3.3。

## 1.4.0 · 星语套件统一实例：stash 复活 + 单托盘 + Suite 安装包 / 2026-11-03

- **Stash 复活**：从 `stash@{1}`（基于 0.2.10 的 WIP local desktop edits，+1748 行）完整移植用户 fork 前的设置中心设计——无边框自绘标题栏（拖拽区+最小化/关闭）、桌宠形态画廊（横向/网格双视图+素材管理目录）、壁纸画廊+阻尼轮播滑块(1-60min)+磨砂玻璃开关、单击桌宠三段巡检（Gemini Models→Claude & GPT→聊天互动）、proud/crying/shy/angry 表情预览、refresh-state 缓存刷新。
- **恢复丢失素材**：`lin-cat` 第二形态六帧从 kimino 扩展目录找回并按挂件约定重建 manifest；`shy/angry` 帧对 gemini 形态仍缺失（原为未跟踪文件已散佚），管线就绪、放入帧图即生效。
- **真·单实例**：皮肤域（DreamSkinSettings/WallpaperManager/HostController）并入挂件主进程——一个 Electron、一个托盘、一份 Chromium；壁纸设置并入统一面板；轮播改为分钟级 slideshow 单一真源（autoRotate 降级为惰性扩展字段，`legacyRotatePatch` 一次性迁移）；`wallpaperFile`↔`wallpaperId` 双向同步。claudeGpt 额度通道数据层未移植（页占位显示 —，待后续对齐 host-quota）。
- **Suite 安装包**：`StarSuite-Setup-0.4.0-x64.exe`（173M）替代旧双包——双项目统一负载、开始菜单仅 启动/设置/卸载 三项（图标=默认/得意/委屈表情 ico，sharp 运行时生成）、`IconSwap.cs`（BeginUpdateResource 零依赖）替换 StarSuite.exe 的 Electron 默认图标、`--settings` 直达设置中心。verify:installers 4/4 全绿（统一渲染层实启+自检+沙箱卸载）。
- 旧 Widget/Skin 0.3.1 安装已优雅卸载（注册表/快捷方式/标记校验目录）；个人数据目录零迁移沿用。测试 44 项全绿。

## 1.3.2-ext · 表面标注引擎 + 幽灵色块真身落网（feat/browser-extension） / 2026-11-03

- **表面标注引擎（架构终局）**：A/B 分流导致 Google 类名随会话漂移，任何类名选择器都可能在部分用户会话失手。skin.js 升级为**结构标注引擎**——按产品级语义锚点（`user-query`/`model-response`/`rich-textarea`/`bard-sidenav`，比类名稳定一个数量级）定位表面，向上爬到真正绘制背景的视觉容器（`climbToPainted`，A/B 变体免疫核心）后打 `data-kg` 标记；skin.css 新增 3.5 节按标记渲染，与类名规则（字面量相同）双保险并存。标注失败 → 原生暗色兜底，永远可读。
- **幽灵色块真身落网**：ghost 侦探在实机抓到"头像旁黑框"元凶——`<aside aria-label="Notifications" aria-live="polite">`，Google 的**通知 live-region 气泡**（32×32，钉在左下角 0,688），通知出现时以深色小盒示人。skin.js 自动透明化（`data-kg="ghost"`）并把 DOM 链路输出到控制台；widget.js 的角落异物诊断继续保留作报告通道。
- 实机核对：bubble×20 / card×20 / composer×1 全部标注并正确渲染（bubble `rgb(33,30,45)`、composer 玻璃梯度叠加 rgba(33,30,45,.72)）；扩展版本 1.3.2。

## 1.3.1-ext · 去 var 化 + 角落异物自诊断（feat/browser-extension） / 2026-11-03

- **var() 全灭**：用户实报"磨砂玻璃处全变透明"——透明化规则不含 var 照常生效、玻璃面规则全部依赖 `var(--kg-*)`，指向用户浏览器中 CSS 自定义属性解析失败（IAB Chromium 无法复现）。skin.css v2.1 将全部 token 内联为字面量，surface/reading 提升至纯不透明 `#211e2d`（blur 仅作质感增强），var 失败面从此不存在。
- **Composer 针对性重绘**：药丸玻璃浓度加强（rgba(75,62,84,.55)→rgba(23,18,31,.72) 叠加 rgba(33,30,45,.72) 底），明亮壁纸区域依然清晰。
- **角落异物自诊断**：widget.js 初始化 3 秒后探测左下角多点，发现非桌宠实底元素即向控制台输出 `[星语喵伴] 角落异物诊断(...)` 与完整 DOM 链路——头像旁黑框的元凶靠它揪出。
- IAB 计算样式核对：bubble/sidebar `rgb(33,30,45)`、composer 玻璃梯度、宿主 `display:contents` 全部生效；44/44 测试全绿，扩展版本 1.3.1。

## 1.3.1 · 上游新版特征兼容移植（数据目录壁纸 / slideshow / 点击语义） / 2026-11-03

- **壁纸包兼容**：`WallpaperManager` 新增用户壁纸目录扫描（`数据目录/wallpapers/`，上游 0.2.12+ 的布局）——散装图片即包（id=文件名），子目录按完整包解析；散图预览走 `file:` 绝对 URL。仓库内置包与用户包统一进出选择器与轮转。
- **字段迁移**：上游旧字段一次性迁移到本地单一真源——`wallpaperFile` 匹配到扫描包时自动写入 `wallpaperId`；`slideshow`+`slideshowIntervalMinutes` 经 `legacyRotatePatch` 映射为 `autoRotate`（≤20 分钟→15m，否则 1h）后退役，不再反复覆盖面板设置。sanitize 全程保留外来字段不丢弃。
- **挂件点击语义**：恢复上游 `clickCatAction`（字符串模式，"talk" 等真值=点击保证触发表情与台词，"off"/false 关闭）与 `clickCyclesBubblePage`（轻点循环切换气泡页：额度→今日→最新→聊天）；拖动仍算拖动，键盘空格/回车同语义；设置面板新增两个开关。
- 版本 0.3.1；测试 44 项全绿（新增用户壁纸包迁移、legacy 字段映射、点击设置归一化 3 项回归）。

## 1.3.0-ext · 扩展主题架构重写："Gemini 本体换肤"（feat/browser-extension） / 2026-11-03

- **架构反转**：放弃 1.2.x 的"全透明穿透"打法（选择器失手即生肉壁纸怼脸、永远在追 Google 新容器打地鼠），改为忠实复刻桌面端 Antigravity 主题 token 的**换肤架构**——面板以不透明深紫 `#211e2d` 为主（桌面 `--agy-ui-reading: #211e2df5`/`--agy-ui-surface` 逐字复刻），壁纸只从内容区缝隙与 Composer 玻璃（`--agy-ui-glass` 渐变）后透出。
- **稳健性关键**：任何选择器失手时 Google 原生暗色面板原样保留（优雅降级、永远可读）；skin.css 删除全部"子孙元素大清洗"与全局通配规则；`#kimino-dream-wallpaper` 升级为页面基底（`background-color: #211e2d` + 暗部渐变 + 星空图三层合一）。
- **黑框最终解**：`:host` 优先级低于页面 `#id` 规则——widget 宿主现在同时带内联 `display:contents !important` 等八项保险 + skin.css `#kimino-companion-root` 双保险，任何页面 CSS 都无法把它渲染成可见盒子。
- **实机验收（IAB 全量部署）**：文本对话阅读面、用户气泡右对齐、Composer 玻璃药丸透壁纸、不透明侧栏微网格、桌宠渲染全部通过。
- 扩展版本线升至 1.3.0；dist 重建完成。

## 1.2.3 · 扩展实机部署二次会诊（feat/browser-extension） / 2026-11-03

- **Trusted Types 加固**：gemini.google.com 开启 `require-trusted-types-for`，桌宠 `wrapper.innerHTML` 裸赋值会抛 `TrustedHTML`（MAIN world 必炸）；新增 `ttPolicy`/`setHTML` 安全壳（策略创建 → DOMParser 兜底双保险）。
- **头像旁黑框根治**：`#kimino-companion-root` 宿主原为全视口 fixed 覆盖层，易被 Google 页面级 CSS 命中渲染成色块；改为 `:host { all:initial; display:contents }` —— 宿主不再生成任何盒子（实机验证 0x0），桌宠完全由内部 fixed wrapper 承载，字体与 user-select 一并迁至 wrapper。
- **Composer 药丸增强**：浓度 0.44→0.62、blur 28px、描边 0.38，实测在明亮花哨壁纸区域依然呈现清晰水晶悬浮感。
- **图片查看器毛玻璃化**：原生 `.image-expansion-dialog-backdrop` 为 0.9 纯黑且按钮深灰（遮罩与返回键"不可见"元凶）；改为 rgba(10,7,20,0.55)+blur(18px) 毛玻璃遮罩，返回/工具条/色板按钮统一玻璃芯片+高亮图标，面板本体豁免保护区深底。
- **/usage 断层修复**：usage 路由用 Meta 原子类（x9f619 系列）——内容区 section rgb(15,15,15) 实底转透明、配额卡 rgb(23,23,23) 转 0.42 玻璃卡、升级横幅玻璃化、巨型装饰 `.gradient-strip` 隐藏；上黑下透断层根除（实机截图验收）。
- **额度映射重写（锚点式）**：文档顺序扁平映射会被噪声整数污染（实测 0%/66% 被解析成 2%/1%）；重写为"同一对象内 时间串+百分比 成组，纯时钟→当前周期、含月日→每周限额"的锚点式最小分组解析，附噪声数字混入单测；官方重置时间现可换算本地 epoch 驱动倒计时。

## 1.3.0 · 桌面端独立化改造：多壁纸管理 + Standalone 常驻 + 安全热重启（main） / 2026-11-03

- **配置丢弃根治**：`DreamSkinSettings.sanitize()` 改为"先合并、再校验已知项、保留扩展字段"，`wallpaperId` 与动态扩展属性（如 `customWallpaperPath`）不再被重启抹杀；新增 `autoRotate` 轮转模式（off/15m/1h/boot）。
- **WallpaperManager**：`theme-loader.cjs` 重构为多壁纸包动态扫描（`assets/wallpapers/` 子目录即包，manifest 可选，放入图片自动识别）；废除单文件 SHA256 强校验与硬编码路径，仅按文件头校验 PNG/JPEG/WebP 有效性并实测尺寸，损坏包自动跳过不白屏；保留路径穿越防护。控制面板新增壁纸选择与轮换设置，托盘支持手动切换下一张。
- **Standalone 独立常驻**：挂件新增 `standaloneDesktopMode`（默认开启）。宿主窗口不可用时不再隐藏/闪退，而是优雅退守桌面（恢复独立尺寸，回到用户最后自由坐标或缺省右下角），互动全功能保持；宿主恢复后无缝回到磁吸跟随。托盘与设置面板均可控制该开关；离线时额度条沿用既有 cached/stale 缓冲语义。
- **安全平滑重启**：新增 `npm run restart:widget` / `restart:skin`（`tools/restart.cjs`）——先经单实例 IPC 发送 `--quit`，以 `tools/lock-probe.cjs` 轮询单例锁释放（退出码 0/3），再基于当前 Git 源码重新拉起；全程不 `taskkill /f`，不触碰 `%LOCALAPPDATA%` 外部安装目录，`writeJson` 原子写入不受中断威胁。
- **测试**：`npm test` 41 项全绿（原 40 项中 2 项按多壁纸架构重构断言，新增 sanitize 字段保留回归 1 项）。

## 1.2.2 · 浏览器扩展实机勘察二次攻坚（feat/browser-extension） / 2026-11-03

- **皮肤选择器全面实机化**：在登录态真实 DOM 上逐层勘察后重写 `skin.css`——用户气泡玻璃只打真身 `span.user-query-bubble-with-background`（外层链路全透明），大紫板根除；Composer 水晶药丸正中 `<input-area-v2>`，并穿透 `<input-container>`(rgb(15,15,15)) 及其 `::before` 渐变迷雾与 `.autosuggest-scrim`；侧边栏结构层（含 sidenav-mavatar-footer 档案区）全裸化，左下角黑块根除。候选与最终版均在实机截图验收通过。
- **额度实时刷新管线（MaZiqc RPC）**：实测确认官方双周期额度由 batchexecute RPC `MaZiqc` 承载且每次应用启动自动发出；Angular 引导期捕获原始 fetch 引用导致运行期补丁失效，故将 `interceptor.js` 注册为 MV3 `world:"MAIN"` + `document_start` 独立 content script 先于框架完成补丁；`tracker.js` 以自适应解析器（不绑定字段名）提取双周期数据，并按"每5分钟 + 每轮对话结束 + 挂件手动同步"节流静默重放，全程零 UI；提示条/弹窗嗅探降级为兜底层。同源 iframe 幽灵加载方案实测被跨源隔离挡死，已弃用。
- 桌面端 41 项单元测试全部通过；.xpi/.zip 规范 zip（正斜杠条目）重新打包。

## 1.2.1 · 浏览器扩展四大缺陷攻坚（feat/browser-extension） / 2026-11-03

- **Gecko 修复**：根 manifest 不再混写 `service_worker`+`scripts`（Chromium 根模板与 Firefox 构建版各自合规）；新增 `content/shim.js` 跨浏览器垫片（browser.*/chrome.* 双命名空间 + 永不 reject 的 storage 封装），popup/background 同步加固；`inject-bridge.js` 带 CSP 握手检测，嗅探器被拦截时安全降级为 DOM 嗅探，桌宠与皮肤主流程零依赖它。
- **.xpi 修复**：弃用 PowerShell Compress-Archive（其条目名使用反斜杠违反 ZIP 规范，Firefox libjar 无法解析导致 content script 静默加载失败），改写为 Node 内置 zlib 规范 zip 写入器（正斜杠 + UTF-8 标志 + CRC32）。
- **皮肤重构**：用户提问外层容器全透明并右对齐，毛玻璃只作用于内层文字小气泡（0.42 微紫细描边），抹杀撑满整行的大紫色实体色块；卡片不透明度全线降至 0.35~0.45；穿透 `rich-textarea`/`input-area-container`/`bottom-container` 死黑底色，还原 `.surface-composer` 式水晶药丸（`:where()` 压低裸化规则优先级 + 三重回落防套娃）；侧边栏左下角档案区小黑块斩草除根。
- **额度嗅探**：tracker 新增输入框上方常驻提示条解析器（“用量限额将在 6:37 下午 重置” 中英文 + 相对/绝对时间 + 限流状态），无需手动打开用量弹窗即可动态更新重置倒计时；MutationObserver 回调全面节流，消除高频 innerText 布局抖动。

## 0.2.12 · 独立安装包（测试版） / 2026-11-02

- 新增挂件和壁纸两个独立Windows x64安装EXE，内置Electron运行时，创建桌面与开始菜单入口及独立卸载项。
- 可选开机启动、宿主启动联动；首次均默认关闭，在独立启动设置里随时修改。联动不依赖宿主安装路径，不修改快捷方式。
- 新增可复现构建脚本及隔离安装/运行/卸载验证，保留运行时与素材来源说明。
- 保留0.2.11后台额度功能。安装包未签名，跨电脑和真实重新登录验收仍待反馈。

## 0.2.11 · 后台额度与启动重试（测试版） / 2026-11-02

- 启动即调用已登录宿主自身额度服务，只提取 Gemini 双周期比例；不导出凭据、不打开设置页。
- 失败后 3/6/12/24/30 秒退避重试，成功后每30秒查询，防止重复请求和停止后的迟到响应覆盖。
- 手动读取也使用后台路径，设置页新增连接/查询/兼容状态。
- 补充跨电脑安装条件与内部接口变动风险。本机验证不等同第二台设备验收。

## 0.2.10 · 窗口跟随与启动读取 / 2026-11-01

- 同步最新宿主识别、窗口恢复及层级处理；切换其他应用时取消置顶并排在前台窗口后方，宿主隐藏或最小化时隐藏挂件。
- 启动立即读取已有额度缓存，每 30 秒刷新读取；不再自动打开 Settings → Models，缺失数据仍显示未知。
- 修正健康检查定时参数，运行一小时后降低检查频率，两小时后进一步降低，避免高频捕获消耗。
- 保留已确认美术和四套公开音效，继续排除个人配置、日志及快捷方式备份。

## 0.2.9 · 首次公开源码 / 2026-10-31

- 基于本机最终确认版本导出两个独立插件，保留按压回弹、双周期额度、窗口跟随恢复与整窗玻璃皮肤。
- 同一宿主目标内保留最近额度，陈旧或错误时标记待更新；切换目标与重启不沿用账户缓存。
- 重写公开 README、隐私说明和素材许可边界，提供可复现的 npm 启动与原生辅助程序编译步骤。
- 移除私人日志、原设参考图、本机快捷方式补丁与备份、已编译程序和未明确授权的 DSH 鸭叫音频。公开版本含四套八段音效；本机工作版本未改。

此版本为源码发布，不沿用旧便携包作为本次功能验证证据。
