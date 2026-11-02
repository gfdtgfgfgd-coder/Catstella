# 🐾 Gemini Web Companion · 网页端扩展分支交接文档 (Branch: `feat/browser-extension`)
> **项目定位**：Google Gemini 官方网页端专属桌宠挂件（基米乃）与毛玻璃 Dream Skin 扩展（Firefox / Edge / Chrome）  
> **适用受众**：接手 `feat/browser-extension` 分支的马仔 / 协同 Agent / 开发者  
> **文档版本**：v1.2.1-dev | 更新时间：2026-11-03

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

1. [ ] **彻底攻克 Firefox / Zen Browser 的 CSP 与脚本加载死锁**；
2. [ ] **精细化重构 `skin.css` 气泡层级**：彻底消除紫色大实体方块，实现 Antigravity 级别的高清透视与微光；
3. [ ] **消除左下角 footer 小黑框**；
4. [ ] **接入输入框上方提示条的自动嗅探**，告别繁琐的手动点开弹窗；
5. [ ] **桌宠动作扩展**：补充空闲时的“毛毛虫打滚缩进衣服”睡觉动画。
