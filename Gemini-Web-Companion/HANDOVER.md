# 🐾 Gemini Web Companion · 网页端扩展分支交接文档 (Branch: `feat/browser-extension`)
> **项目定位**：Google Gemini 官方网页端专属桌宠挂件（基米乃）与毛玻璃 Dream Skin 扩展（Firefox / Edge / Chrome）  
> **适用受众**：接手 `feat/browser-extension` 分支的马仔 / 协同 Agent / 开发者  
> **文档版本**：v1.3.5 | 更新时间：2026-11-03

### v1.3.5 增补（对齐终修 / 壁纸复活 / 自定义形象与壁纸）· 必读
* **垂直锚点铁律**：渐隐带与玻璃带的切线 = `getCutLineY()` = **滚动容器底边**（`getConversationScroller()`），绝不是 Composer 顶边（差 ~30px 就错位）；
* **水平对齐铁律**：band/composer/card 三者以**回复卡视口矩形**为基准（宽度 + `__kgOffsetX` relative 偏移）；测量前必须先 `removeProperty('max-width')`（否则量到残留内联值）；
* **z 序铁律**：body 必须**透明**（不透明 body 背景会盖住负 z-index 的壁纸/基底层）；基底色画在 `#kimino-base-layer`（z -100000），壁纸层 z -99999 圆角内容列；
* **自定义资源**：storage 键 `customWallpaper`（JPEG dataURL ≤1920×1080）/ `customCharacter`（PNG dataURL ≤640×640，覆盖所有表情帧），skin.js/widget.js 经 onChanged 即时切换，设 null 还原默认。

### v1.3.4 增补（全毛玻璃 / 挖空圆角区 / 设置面板 / 滚动渐隐）
* **宽度语义**：回复卡保持 Google 原生列宽（不强制 max-width），**Composer 药丸由 skin.js 拉宽至与回复等宽**（内联 width+居中）——不要再改回"拉宽回复"方向；
* **挖空圆角区**：壁纸层几何由 `updatePaneGeometry()` 实测 `bard-sidenav` 右缘写入（radius 22 + 内侧描边），body 基底 `#211e2d`——壁纸只铺内容列，侧栏坐基底；
* **Liquid Glass 带**：skin.js fixed 层 `#kimino-glass-band`（跟随 Composer 实测坐标），CSS 仅兜底样式；勿改回 `::before` 方案；
* **滚动底色渐隐**：`applyFades()` 按滚动位置对卡片/气泡写内联渐变背景（文字清晰、blur 由 CSS 承担），rAF 节流 + scroller scroll 监听 + resize/15s 兜底；
* **设置面板**：widget 气泡 header ⚙️ → Shadow DOM 面板（开关/滑条/形象/复位），全走 storage 即时生效；`enabled` 开关必须 `setProperty('display', 'contents'|'none', 'important')`（contents 宿主下普通赋值无效）。

### v1.3.3 增补（卡片同列 / 侧栏渐变 / Liquid Glass）
* **卡片对齐**：model-response 宽度由 skin.js 实测 user-query 列宽后**内联写入**（`max-width !important`），CSS 管 22px 圆角与居中——不要改回 CSS 写死宽度；
* **侧栏选择器只许用 `bard-sidenav`**：`mat-nav-list` 宿主自带 `role="navigation"`、通知气泡是裸 `aside`——`[role="navigation"]` / 裸 `aside` 选择器都会误伤（渐变重复绘制 Bug 根因）；
* **Liquid Glass 过渡带**：`input-container::before`（120px，blur16+mask 渐变+底部暗化），依赖 `input-container { position: relative }`——若 Google 改容器名，标注引擎的 composer 标记可平移承载。

---

## ⚠️ v1.3.2 表面标注引擎（最新架构，先读这段）
**Google 会话级 A/B 分流会让类名漂移**——任何类名选择器都可能在部分用户会话失手（var() 解析失败 + 类名失手是 1.2.x~1.3.1 时代"我这边好的你那边坏"的两大根源）。现架构：
1. **skin.js = 表面标注引擎**：按产品级语义锚点（`user-query`/`model-response`/`rich-textarea`/`bard-sidenav`）定位 → `climbToPainted` 向上爬到真正绘制背景的容器 → 打 `data-kg` 标记，`MutationObserver` + 15s 兜底轮询持续标注；
2. **skin.css = 按标记渲染**：3.5 节 `[data-kg="..."]` 规则（字面量 token）与类名规则双保险并存；
3. **幽灵色块侦探**：`aside[aria-label="Notifications"]`（通知 live-region 气泡，左下角 32×32）即"头像旁黑框"真身，skin.js 自动透明化（`data-kg="ghost"`）并输出链路到控制台；
4. **禁止**：重新引入 var() token（部分用户环境解析失败）、全局通配穿透、大范围透明化。
桌面 token 真源：`Antigravity-Dream-Skin/src/host/theme.cjs`（dark 分支）。

---

## ⚠️ v1.3.1 硬性规约（先读）
**skin.css 已全面去 var 化**——用户实报其浏览器中 `var(--kg-*)` 解析失败导致所有玻璃面退化为全透明（透明化规则不含 var 所以照常生效）。所有色值已内联为字面量（token 对照表见 skin.css 头部注释），**禁止在新规则中重新引入 CSS 自定义属性**。桌面 token 唯一真源：`Antigravity-Dream-Skin/src/host/theme.cjs`（dark 分支）。
**黑框排查**：widget.js 内置"角落异物自诊断"（初始化 3 秒后探测左下角，输出 `[星语喵伴] 角落异物诊断(...)` + DOM 链路）——用户再报黑框时，先要控制台日志再动手改样式。
**主题已从"全透明穿透"反转为"Gemini 本体换肤"**：忠实复刻桌面端 Antigravity token（`--kg-*` 系列，见 skin.css 顶部），面板以不透明 `#211e2d` 为主、壁纸只从内容缝隙与 Composer 玻璃后透出。**改动皮肤时只允许：**
1. 调整 `--kg-*` token 或已验证的顶层表面选择器；
2. **禁止**再引入"子孙元素大清洗"、全局 `[class*=...]` 通配、大范围透明化——那是 1.2.x 被废弃的根因（选择器失手 = 生肉壁纸怼脸）。
桌面 token 的唯一真源：`Antigravity-Dream-Skin/src/host/theme.cjs`（dark 分支）。

---

## 1. 架构与目录导航

本分支将 Antigravity 桌面端的**猫娘桌宠**与**星语毛玻璃主题 (Dream Skin)** 移植到了 `gemini.google.com` 网页端，支持 Chromium (Edge / Chrome) 与 Gecko (Firefox / Zen)。

```text
Gemini-Web-Companion/
├── manifest.json              # MV3 根模板 (定义权限、Content Scripts 与资源访问)
├── background.js              # 后台 Service Worker / Event Page (配置存储与分发)
├── scripts/
│   └── build.js               # 打包工具：分别构建 Chromium 专版(.zip) 与 Firefox 专版(.xpi)
├── content/
│   ├── inject-bridge.js       # 页面上下文注入桥梁 (负责向 Main World 挂载拦截器)
│   ├── interceptor.js         # 网络拦截器 (Monkey-patch fetch/XHR，嗅探 Argon 思维链与 429)
│   ├── tracker.js             # 会话用量与 Google 原生用量抓取引擎
│   ├── widget.js              # Shadow DOM 桌宠挂件 (耳灯状态机、台词气泡、双用量进度条)
│   ├── widget.css             # 桌宠独立样式 (已同步内嵌至 widget.js 的 EMBEDDED_WIDGET_CSS)
│   ├── skin.js                # Dream Skin 控制器 (注入全屏壁纸与 active 类名)
│   └── skin.css               # 毛玻璃皮肤核心样式 (微网格侧边栏、通透气泡、保护区)
├── popup/                     # 点击扩展图标弹出的快速配置面板
├── assets/                    # 角色表情帧 (gemini-star-v1 / lin-cat)、音效、台词与壁纸
└── dist/                      # 构建产物目录 (firefox/, chromium/, .xpi, .zip)
```

---

## 2. 🚨 当前实测已知核心问题与攻坚方案（必读！）

根据最新实机测试与截图反馈，目前存在 **4 个关键 Bug / 体验缺陷**，接手马仔需作为最高优先级攻坚：

### 🔴 缺陷 1：Gecko 系浏览器 (Firefox / Zen) 仍然不可用
* **现象**：在 Firefox 或 Zen Browser 中临时载入或安装扩展后，桌宠挂件与毛玻璃皮肤完全不渲染，控制台静默或报错。Edge/Chrome 端则可正常唤出。
* **根因定位与排查点**：
  1. **MV3 Background 规范冲突**：Firefox 109+ MV3 严苛限制 `service_worker`。`build.js` 虽然针对 Firefox 替换成了 `scripts: ["background.js"]`，但需排查未打包的本地加载模式下 `manifest.json` 中 `service_worker` 与 `scripts` 同时存在导致的清单验证失败。
  2. **页面严苛 CSP 阻断注入**：Firefox 对 `gemini.google.com` 执行极严格的 CSP 策略。`inject-bridge.js` 尝试使用 `document.createElement('script')` 注入 `interceptor.js` 时会直接被阻断。如果缺乏降级容错，可能会阻断后续 `widget.js` 和 `skin.js` 的执行。
  3. **API Namespace 兼容性**：Firefox 原生首选 `browser.*`（Promise 风格）。在 content script 中直接调用 `chrome.storage.local.get` 时若触发未捕获的 Promise rejection，会导致整个 `initWidget()` 初始化中断。
* **解决对策**：
  - 在 `inject-bridge.js`、`tracker.js`、`skin.js`、`widget.js` 顶层统一加入多浏览器兼容垫片：
    ```javascript
    const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
    ```
  - 将 `interceptor.js` 的注入彻底设计为**非阻塞、软依赖**：即便 CSP 阻止了拦截器，DOM 嗅探与桌宠/皮肤主流程必须毫发无伤地继续运行。
  - 在 `widget.js` 和 `skin.js` 入口处加上全局 `window.addEventListener('error')` 防御，确保即便某一部分逻辑失配，也绝不影响另一部分加载。

---

### 🔴 缺陷 2：UI 依然是大块实体紫色色块，缺乏反重力的优雅通透毛玻璃质感
* **现象（见截图）**：
  - 用户提问卡片上方出现了一整块巨大的、空旷的深紫色不透明矩形（宽度占到 85%），把文字和图片挤在右侧；
  - 模型回答与底部输入框未通透，依然是原本死沉的黑灰色块，完全没有反重力 IDE 里的轻盈感。
* **根因分析**：
  1. **用户卡片选择器失准**：`skin.css` 中对 `:is(user-query, .user-query)` 直接赋予了 `background-color: rgba(28, 20, 48, 0.78)`、`display: inline-block`、`max-width: 85%`。但在 Google Gemini 最新 Web 布局中，`user-query` 本身是一个撑满整行的弹性布局外层容器！给它加深色背景，直接导致没有文字的空白区域全被涂成了深紫色大板子。
  2. **底部 Composer 选择器失配**：Google 网页端的底部输入框层级结构较深（包含了 `rich-textarea`、`.input-area-container`、`.bottom-container` 以及 Material 组件），当前的 CSS 选择器没有穿透其内嵌的默认原生背景色 `#1e1f20`。
* **解决对策**：
  - **重构消息气泡样式**：外层容器保持 100% 透明，样式只精准作用在包裹文字的内层气泡上：
    ```css
    /* 外层全宽容器彻底透明 */
    html.kimino-dream-active :is(user-query, .user-query, .user-query-container) {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      display: flex !important;
      justify-content: flex-end !important; /* 用户消息右对齐 */
      width: 100% !important;
    }

    /* 只对内部真正包含文字的气泡应用毛玻璃 */
    html.kimino-dream-active :is(user-query, .user-query) :is(.query-content, .text-content, p) {
      background-color: rgba(36, 24, 58, 0.42) !important; /* 降低不透明度 */
      backdrop-filter: blur(16px) saturate(125%) !important;
      border: 1px solid rgba(190, 160, 245, 0.28) !important;
      border-radius: 18px 18px 4px 18px !important;
      padding: 10px 16px !important;
      display: inline-block !important;
      box-shadow: 0 4px 16px rgba(12, 8, 24, 0.3) !important;
    }
    ```
  - **降低卡片底色浓度**：从 `0.72 ~ 0.78` 全面降到 `0.35 ~ 0.45`，使底层的蓝紫星空设定集壁纸能够均匀漫射出来。
  - **强力穿透底部 Composer**：定位并覆盖 `rich-textarea`、`div.input-area`、`.bottom-container`，实现真正的反重力悬浮水晶药丸。

---

### 🔴 缺陷 3：左下角个人档案区域仍有“小黑块”
* **现象（见截图）**：
  - 侧边栏左下角的“活动记录”、“瑞士苏黎世 根据 IP 地址确定”、“Ektra Pro”及设置齿轮按钮周围，有一块明显的纯黑矩形背景，与上方优雅的斜向微网格断层。
* **根因分析**：
  - Google Gemini 网页端侧边栏底部使用的是固定的 footer 组件（如 `bard-sidenav .side-nav-footer` 或 `bottom-container`），该组件和其中的按钮子容器内联定义了暗黑背景。
* **解决对策**：
  - 进一步强化样式穿透规则：
    ```css
    html.kimino-dream-active bard-sidenav :is(
      .side-nav-footer,
      [class*="footer"],
      [data-test-id="user-profile"],
      .bottom-section,
      button[aria-label*="Google"]
    ),
    html.kimino-dream-active bard-sidenav :is(
      .side-nav-footer,
      [class*="footer"]
    ) :is(div, span, button, a) {
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      border-color: transparent !important;
    }
    ```

---

### 🔴 缺陷 4：额度抓取机制存在局限（必须手动打开弹窗，且页面不刷新不更新）
* **现象**：
  - 目前扩展抓取官方 5 小时与每周额度，需要用户手动点开左下角设置的“用量限额”对话框；且该对话框一旦加载后不会自动轮询更新，必须重新刷新标签页。
* **技术突破方向（接手马仔可选方案）**：
  1. **方案 A（最稳健：直接监听输入框上方的实时提示条）**：
     - **截图实证**：在截图中，输入框上方已常驻显示了官方提示：`用量限额将在 6:37 下午 重置  查看用量  升级`！
     - 编写一个专门的 DOM 提取器，直接监控并解析这个提示条的文案。只要会话消耗导致重置时间改变，提示条会实时变动，可直接解析出最新的重置倒计时！
  2. **方案 B（网络劫持：拦截内部 batchexecute RPC）**：
     - 在 `interceptor.js` 中监听 Gemini 向 `/_/BardChatUi/data/batchexecute` 发送的请求，分析返回流中包含的 Quota 结构体。每次用户发送消息或页面唤醒时，后台会返回最新的配额数据包，直接读取即可实现真正的零感知全自动更新。
  3. **方案 C（无感隐形嗅探）**：
     - 若必须打开官方弹窗，扩展可以在后台每隔 5 分钟模拟触发一次“查看用量”按钮的点击事件，同时将其容器样式瞬间设为 `opacity: 0 !important; pointer-events: none !important;`。在 50ms 内读取完 DOM 文本后，立即模拟派发 ESC 键关闭弹窗。用户视觉完全无感！

---

## 3. 编译、打包与调试步骤

### 3.1 扩展打包命令
在仓库根目录或扩展子目录中运行：
```powershell
# 从源码构建并生成 Firefox (.xpi) 与 Chromium (.zip)
node Gemini-Web-Companion/scripts/build.js
```
产物位置：
* Firefox 离线安装包：`Gemini-Web-Companion/dist/kimino-gemini-companion.xpi`
* Firefox 源码调试目录：`Gemini-Web-Companion/dist/firefox/`
* Edge/Chrome 解压安装目录：`Gemini-Web-Companion/dist/chromium/`

### 3.2 浏览器载入调试方法
* **Firefox / Zen Browser 调试**：
  1. 地址栏输入 `about:debugging#/runtime/this-firefox`；
  2. 点击 **“临时载入附加组件...”**；
  3. 选择 `Gemini-Web-Companion/dist/firefox/manifest.json`（或直接选 `.xpi`）；
  4. 打开控制台查看 `[星语喵伴]` 开头的日志输出。
* **Edge / Chrome 调试**：
  1. 打开 `edge://extensions/` 或 `chrome://extensions/` 并开启“开发人员模式”；
  2. 点击 **“加载解压缩的扩展”**，选中 `Gemini-Web-Companion/dist/chromium/` 目录；
  3. 打开 `https://gemini.google.com/` 即可。

---

## 4. 后续版本规划 (v1.3.0 RoadMap)

1. [x] **彻底攻克 Firefox / Zen Browser 的 CSP 与脚本加载死锁**（v1.2.1 已完成：manifest 双模板拆分 + shim 垫片 + CSP 握手降级；额外查出并修复 .xpi 反斜杠条目名致命 Bug——Compress-Archive 违反 ZIP 规范导致 Firefox 静默加载失败，已改用 Node zlib 规范写入器）；
2. [x] **精细化重构 `skin.css` 气泡层级**：彻底消除紫色大实体方块，实现 Antigravity 级别的高清透视与微光（v1.2.1：外层透明右对齐 + 内层小气泡 0.42 毛玻璃）；
3. [x] **消除左下角 footer 小黑框**（v1.2.1：穿透 `bard-sidenav` footer/账号区全部子容器）；
4. [x] **接入输入框上方提示条的自动嗅探**，告别繁琐的手动点开弹窗（v1.2.1：`sniffResetHintBar()` 中英文/相对/绝对时间解析 + 2s 节流 + 去重广播）；
5. [ ] **桌宠动作扩展**：补充空闲时的“毛毛虫打滚缩进衣服”睡觉动画；
6. [ ] **与桌面端 v0.2.12 安装流水线联动**：将生成的 `.xpi` 和 `.zip` 自动归档至 `dist/installers/`，实现 Catstella 全端一键打包。

### v1.2.3 实装备注（2026-11-03 扩展实机部署会诊）
* **Trusted Types**：gemini.google.com 开启 `require-trusted-types-for`，任何 MAIN world 裸 innerHTML 都会抛 `TrustedHTML`。widget.js 已用 `ttPolicy`/`setHTML` 安全壳（策略 → DOMParser 兜底），新增 DOM 操作必须走 `setHTML`。
* **桌宠宿主**：`#kimino-companion-root` 现为 `display:contents` + **内联 important 八项保险**（`:host` 优先级低于页面 `#id` 规则，内联才能压过 Google 一切普通规则）+ skin.css `#kimino-companion-root` 双保险。改动桌宠布局只动 `.kimino-wrapper`。
* **图片查看器**：遮罩真身是 `.cdk-overlay-backdrop.image-expansion-dialog-backdrop`（原生 0.9 纯黑），按钮非 `role=dialog` 命名——样式见 skin.css 第 6 节。
* **/usage 路由**：使用 Meta 原子类（`x9f619` 系列）——skin.css 第 7 节按该命名空间定点换肤（section 实底/配额卡/升级横幅/gradient-strip）。
* **MaZiqc 解析器（锚点式）**：扁平顺序映射会被噪声整数污染（实测 0%/66% → 2%/1%）。现按"同一对象内 时间串+百分比 成组"取最小命中分组：纯时钟→当前周期、含月日→每周限额。改动解析逻辑必须跑噪声混入单测（见 CHANGELOG 1.2.3）。
* **额度 epoch**：`resetTextToEpoch()` 支持 "06:37"/"6:37 下午"/"11月3日23:37"，当前周期重置时间会驱动倒计时；重置时间按 IP 属地时区显示，epoch 换算用本地时区近似（跨时区用户倒计时可能偏差，已可接受）。

### v1.2.2 实装备注（接手者必读 · 2026-11-03 实机勘察二次攻坚）
* **内容脚本装载顺序**已变为 `shim.js → inject-bridge.js → tracker.js → skin.js → widget.js`，`shim.js` 提供 `window.KIMINO_API`（browser/chrome 双命名空间 + 永不 reject 的 storage 封装），所有模块均自带独立防崩壳，互不拖累；
* **皮肤选择器已全部实机化**（ZCode 内置浏览器登录实测，勿再凭猜测改动）：
  - 用户气泡真身 = `span.user-query-bubble-with-background`（原生 rgb(23,23,23)/radius 40px），外层 `user-query → span.user-query-container → user-query-content → div.user-query-container → .query-content → .query-bubble-with-status` 全链路原生透明；
  - Composer 黑底真身 = `<input-area-v2>`（rgb(30,31,32)），底部横向黑带 = `<input-container>`（rgb(15,15,15)，992px 宽）**及其 `::before` 渐变迷雾** + `.autosuggest-scrim`；
  - 侧边栏仅 `bard-sidenav` 自身有底色（rgb(31,31,31)），结构层全部原生透明；
  - “用量限额”界面不是弹窗，是 SPA 路由 `https://gemini.google.com/usage`。
* **额度实时刷新管线（v1.2.2 新增，替代常驻提示条方案）**：
  - 官方双周期额度由 batchexecute RPC **`MaZiqc`** 承载（响应含 已使用%/重置时间/每周限额/日期），**每次应用启动都会发出**（无需进用量页）；
  - Angular 在引导期捕获原始 `window.fetch` 引用，运行期补丁**无法**拦截它 —— 因此 `interceptor.js` 已注册为 **MV3 `world: "MAIN"` + `run_at: "document_start"`** 的独立 content script，先于 Angular 完成补丁，被动捕获 f.req 请求体与响应体；
  - `tracker.js` 收到 `QUOTA_RPC_RAW` 后用自适应解析器（深度优先收集 0-100 整数与时间串，不绑定字段名）更新双周期额度；每 5 分钟 + 每轮对话结束（STREAM_COMPLETE，90s 间隔节流）+ 挂件同步按钮（强制）都会让 interceptor 用保存的原始 fetch 引用**静默重放** MaZiqc，全程零 UI；
  - 提示条嗅探与弹窗 DOM 嗅探保留为兜底层；同源 iframe 幽灵加载 /usage 已实测被跨源隔离挡死，勿再尝试；
  - 首次捕获的 MaZiqc 原始负载会打印到控制台（`_loggedRawOnce`），若 Google 改结构可用它校准自适应解析器。
* **嗅探器现状**：`inject-bridge.js` 通过 `INTERCEPTOR_READY` postMessage 握手判断注入成败，CSP 拦截时置 `window.__KIMINO_BRIDGE_STATE__.status = 'csp-blocked'` 并降级——tracker 的提示条嗅探与弹窗嗅探**不依赖**拦截器，可 100% 独立工作；
* **Composer 药丸防套娃机制**：`skin.css` 第 5 节用 `:where()` 压低裸化规则优先级，药丸只打 `input-area-v2`；裸化范围含 `input-container::before/::after` 渐变（接缝真凶）。
