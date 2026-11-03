# 🐾 Catstella-web · 交接文档 (HANDOFF)
> **仓库**：`D:\Catstella-web`（Web 扩展开发主仓，分支 `feat/browser-extension`）
> **当前版本**：扩展 `1.3.8` | **更新时间**：2026-11-03
> **产物**：`Gemini-Web-Companion/dist/kimino-gemini-companion.xpi`（Firefox/Zen）+ `.zip`（Edge/Chrome）
> **详细规范**：`Gemini-Web-Companion/HANDOVER.md`（按版本分节增补，与本文互补）

---

## 0. 仓库关系（先读这段）

| 路径 | 状态 |
| :-- | :-- |
| `D:\Catstella-web` | **唯一真源**。web 扩展的全部开发、构建、提交都在这里 |
| `D:\Catstella` | 旧工作区，其工作树曾被并行会话的 stash 操作回退（扩展文件变回旧版）——**不要再在那边改扩展** |
| 桌面端代码（Antigravity-*） | 随仓库带入，本仓库测试唯一失败项来自桌面端旧案（见 §6），与扩展无关 |

本仓库已提交的基线：`eeb994a feat(web): surface annotation engine, alignment fixes, custom wallpapers and character sync`。
工作树当前有 1.3.6→1.3.8 的未提交改动（8 个文件，详见 §7）。

---

## 1. 项目定位

Google Gemini 官方网页端（`gemini.google.com`）的双插件套件：

1. **星语喵伴桌宠**（Shadow DOM 挂件）：耳灯状态机、台词气泡、双周期额度条、设置面板（画廊/滑条/开关）；
2. **Dream Skin 毛玻璃皮肤**：壁纸（挖空圆角内容区）、毛玻璃面板、Composer 水晶药丸、滚动渐隐过渡、图片查看器/用量页换肤。

支持 Chromium（Edge/Chrome）与 Gecko（Firefox/Zen）。

---

## 2. 架构总览

```
manifest.json (MV3 双模板：根=Chromium，build 重写 Firefox)
│
├─ content_scripts[0]  interceptor.js   ← world:MAIN, document_start
│    先于 Angular 补丁 fetch/XHR：捕获 batchexecute（MaZiqc 额度 RPC）
│    的 f.req 与响应；提供按需静默重放（tracker 通过 postMessage 请求）
│
└─ content_scripts[1]  document_idle（isolated world）
     ├─ shim.js       双命名空间（browser./chrome.）+ 永不 reject 的 storage 封装
     ├─ inject-bridge.js  CSP 感知的拦截器注入桥（MAIN world 不可用时的兜底，
     │                    失败即降级，绝不影响主流程）
     ├─ tracker.js    额度管线 + 会话指标 + DOM 嗅探兜底
     │    · MaZiqc 响应 → 锚点式解析（时间串+百分比成组）
     │    · 显示语义：max(官方, 会话估算) + displaySource 角标
     │    · 每 5 分钟 / 每轮对话后（60s 节流）请求静默重放
     ├─ skin.js       皮肤引擎（表面标注 + 几何 + 渐隐 + 画廊壁纸）
     └─ widget.js     桌宠（Shadow DOM、TT 安全壳、设置面板画廊）
```

### 2.1 skin.js 表面标注引擎（核心设计）

Google 会话级 A/B 分流会让 CSS 类名漂移——**任何类名选择器都可能在部分用户会话失手**。
因此皮肤不猜类名，而是：

1. 按**产品级语义锚点**定位：`user-query` / `model-response` / `rich-textarea` / `bard-sidenav`（比类名稳定一个数量级）；
2. `climbToPainted()` 向上爬到"真正绘制背景"的容器（注意：皮肤 CSS 生效后计算背景已被剥透明，**优先用 `closest('input-area-v2')` 等元素名直取**）；
3. 打 `data-kg` 标记（bubble/card/composer/thinking/usage-card/ghost…），skin.css 按标记渲染；
4. **优雅降级**：标注失败 → 该表面保持 Google 原生暗色，永远可读。

### 2.2 每个关键表面的"真身"（实机勘察结论）

| 表面 | 真身 | 备注 |
| :-- | :-- | :-- |
| 用户气泡 | `span.user-query-bubble-with-background` | 原生 rgb(23,23,23)/radius 40px；外层 `user-query → .user-query-container → user-query-content → .query-content` 全链路原生透明 |
| 回复卡 | `model-response` | 原生全透明；skin 加毛玻璃。宽度 = 实测 `user-query` 容器宽（clamp 480~880） |
| Composer | `<input-area-v2>`（原生 rgb(30,31,32)，radius 32px） | 底层黑带 = `<input-container>`（rgb(15,15,15)）+ `::before` 渐变 + `.autosuggest-scrim`，三者全剥 |
| 侧栏 | `bard-sidenav`（rgb(31,31,31)） | 结构层全透明；`mat-nav-list` 宿主自带 `role="navigation"`，**裸 `[role="navigation"]`/裸 `aside` 选择器会误伤**（渐变重复 Bug 根因） |
| 对话滚动容器 | `infinite-scroller.chat-history`（7984px，不在侧栏内） | `infinite-scroller.lr26-theme` 是**侧栏**滚动区，勿锚 |
| 图片查看器遮罩 | `.cdk-overlay-backdrop.image-expansion-dialog-backdrop` | 原生 0.9 纯黑，已换毛玻璃 + 玻璃按钮 |
| /usage 页 | Meta 原子类 `x9f619` 系列 | section 实底 rgb(15,15,15)、配额卡 rgb(23,23,23)、装饰 `.gradient-strip` |
| "头像旁黑框" | `<aside aria-label="Notifications">`（32×32，左下角 0,688） | Google 通知 live-region 气泡；skin.js ghostHunt 自动透明化 + 控制台链路 |

### 2.3 额度管线（v1.3.9 定案：SSR 账本为主链路）

**请勿再相信"MaZiqc 是额度 RPC"的旧结论**——2026-11-03 实机取证：MaZiqc 是会话列表 RPC；额度数据**不在任何运行期 RPC**，而是 `/usage` 页面的服务端渲染流式 JSON：

1. `tracker.refreshUsageLedger()`：内容脚本 `fetch('/usage', {credentials:'include', cache:'no-store'})`；
2. `parseUsageLedgerHtml()`：正则提取 `<script type="application/json">` → 收集 `id="usage:0"` 的 `chunk` 字符串 → 拼接 → `JSON.parse` → `findUsageInfo()` 深搜 `getUsageInfo`；
3. `getUsageInfo.pools` 含：`GXU_FIVE_HOURLY` / `GXU_WEEKLY` 的 `percentageUsed`（0~1）与 `windowRefreshesAt`（UTC ISO）；
4. `applyUsageLedger()`：百分比 → 展示文案（本地 HH:MM / M月d日 HH:MM）+ `resetTimestamp`（真实 epoch，倒计时/限流判定）。

触发点：启动 2.5s、每轮对话 STREAM_COMPLETE（60s 节流）、每 5 分钟、挂件 🔄 同步（force）。
兜底链（保留但非主）：interceptor 的 MaZiqc 捕获/重放（历史遗留，勿再扩展）、提示条嗅探、用量弹窗 DOM 嗅探。

---

## 3. 铁律清单（踩过的坑，勿回炉）

1. **manifest 双模板**：根 manifest 只写 `service_worker`；Firefox 构建版只写 `scripts`；Chromium 版剥离 `browser_specific_settings`。
2. **.xpi 必须规范 zip**：PowerShell `Compress-Archive` 写反斜杠条目 Firefox 读不了；build.js 已换 Node zlib 写入器（正斜杠 + UTF-8 + CRC32）。
3. **Trusted Types**：gemini.google.com 开 `require-trusted-types-for`，任何 MAIN world 裸 `innerHTML` 抛错；widget.js 只用 `setHTML()`（策略→DOMParser 兜底）。
4. **`var()` 禁用**：部分用户环境 CSS 自定义属性解析失败（v2.1 事故）；所有颜色/尺寸写字面量。
5. **桌宠宿主**：`#kimino-companion-root` 必须 `display:contents`（内联 important 保险 + skin.css 双保险），否则会被页面 CSS 渲染成可见黑盒。
6. **表面标注**：新增皮肤样式只认 `[data-kg]` 标记 + 稳定元素名；**禁止**全局 `[class*=...]` 通配、大范围透明化、子孙元素大清洗。
7. **侧栏选择器**：只用 `bard-sidenav`；hover/selected 规则也要限定在 `bard-sidenav` 内。
8. **滚动容器**：对话滚动容器从 `model-response`/`user-query` 向上 `closest('infinite-scroller')`；不要用"是否有溢出"过滤（虚拟化+置底时 sh≈ch 误判消失）。
9. **双曲线对齐**：玻璃带几何与卡片渐隐必须由 `applyFades()` **统一写入同一区间** `[fadeStartY, cutY]`，mask 纯线性；勿恢复独立的 `updateGlassBand`。
10. **z 序**：body 保持透明（不透明 body 背景会盖住负 z-index 的壁纸/基底层）；基底色画 `#kimino-base-layer`（z -100000），壁纸 `#kimino-dream-wallpaper`（z -99999，圆角内容列）。
11. **防跳滚**：`overflow-anchor: auto` 已强制恢复（Google 禁用了锚定）；任何布局写入（如卡片 max-width）必须做值去重（`__kgLastMaxW`/`__kgLastGrad`）。
12. **rAF 冻结**：失焦/后台窗口 `requestAnimationFrame` 会被浏览器暂停——持续动画/轮询一律 `setTimeout` 节流，不依赖 rAF。

---

## 4. 构建 / 测试 / 调试

```powershell
# 构建（产物在 dist/：.xpi + .zip + firefox/ + chromium/，含 assets/manifest.json 画廊清单）
node Gemini-Web-Companion/scripts/build.js

# 测试（桌面套件随仓库附带；扩展不在测试覆盖内）
npm.cmd test

# Firefox / Zen 调试
about:debugging#/runtime/this-firefox → 临时载入 → 选 dist/firefox/manifest.json（或 .xpi）
# Edge / Chrome
edge://extensions/ → 开发者模式 → 加载解压缩的扩展 → dist/chromium/
```

**IAB 实机验证套路**（ZCode 内置浏览器，已登录账号）：
以 `new Function(源码)` 注入 `shim 桩 + skin.js + widget.js + tracker.js`（勿用模板字符串混拼载荷，用 `'(...' + JSON.stringify(src) + '...)'` 纯拼接）；桩 `KIMINO_API` 提供内存 storage + `fetch` 返回 `assets/manifest.json` 内容；`getURL` 把角色帧映射成 data URL。当前 IAB 里保持了一份常驻部署（用户要求随时查看效果），真实浏览器验收以用户端为准。

---

## 5. 数据与配置（storage.local）

| 键 | 说明 |
| :-- | :-- |
| `enabled` / `skinEnabled` / `bubbleVisible` / `soundEnabled` | 布尔开关 |
| `widgetScale` / `wallpaperOpacity` | 数值（px / 0.3~1） |
| `character` | 形象包 id（manifest 画廊） |
| `customCharacter` | 自定义形象单图 dataURL（覆盖所有表情帧） |
| `wallpaperId` | 内置 id 或 `custom:<ts>` |
| `customWallpapers` | `[{id, dataUrl}]` 自定义壁纸列表（可删） |
| `customWallpaper` | 旧版单图键（仅迁移兜底） |
| `widgetPos` | 拖拽坐标 |
| `cachedRealQuota` | 官方额度缓存（4 小时有效期） |

---

## 6. 已知问题与注意事项

1. **测试 1 项失败**：`Antigravity-Cat-Widget/test/personality.test.cjs` 的 `native heartbeat` 用例——本仓库带入的桌面端旧案，与扩展无关。
2. **额度账本解析依赖 `/usage` SSR 结构**：若 Google 改版（script 类型或 `usage:0`/`GXU_*` 命名变化），`refreshUsageLedger` 会解析失败并在控制台告警，此时退回兜底链（提示条/弹窗）。排查方式：IAB 打开 /usage，`document.querySelectorAll('script[type="application/json"]')` 查看 chunk 结构。
3. **自定义壁纸体积**：storage.local 默认上限约 10MB；壁纸已压到 ≤1920×1080 JPEG，形象 ≤640×640 PNG。超限需加 `unlimitedStorage` 权限（当前未加）。
4. **IAB 部署是桩环境**：storage 不持久、manifest 走 fetch 桩；不代表真实扩展行为。
5. **/usage 页与图片查看器**样式按**当前**原子类/类名编写，Google 改版后需按 §2.2 重新勘察（用 skin.js 的 ghostHunt/角落诊断辅助定位）。
6. **真实 Firefox 的 `world:MAIN`**：Firefox 128+ 支持；更老版本退回 isolated + inject-bridge（CSP 可能拦截 → 仅 DOM 嗅探，功能降级不崩溃）。

---

## 7. 本次未提交改动（v1.3.9 额度根治）

```
M CHANGELOG.md                            # 1.3.9-ext 条目
M Gemini-Web-Companion/HANDOVER.md        # v1.3.9 增补（SSR 账本铁律）
M Gemini-Web-Companion/content/tracker.js # refreshUsageLedger / parseUsageLedgerHtml / applyUsageLedger 主链路
M Gemini-Web-Companion/content/widget.js  # 同步按钮接入账本刷新
M Gemini-Web-Companion/manifest.json      # 1.3.8 → 1.3.9
```

---

## 8. 下一步建议

1. **视觉微调**：毛玻璃浓度（0.66~0.74）、渐隐距离（`FADE_RANGE=110`）、玻璃带 blur（11px）都是单点参数；
2. **画廊素材扩充**：往 `assets/wallpapers/`、`assets/characters/<包>/`（含 idle.png）放素材，重新构建即自动进画廊；
3. **桌面壁纸包接入**：`Antigravity-Dream-Skin/assets/wallpapers/gemini-character-sheet-v1` 可搬进扩展资产；
4. **账本解析加固**：把 `parseUsageLedgerHtml` 的匹配条件（`usage:0` 前缀、`GXU_FIVE_HOURLY`/`GXU_WEEKLY`）做成宽松匹配 + 失败时打印结构样例，便于 Google 改版后快速修复；
5. **提交**：当前改动未提交，建议 `git add -A && git commit -m "feat(web): v1.3.8 ..."`（提交前跑一遍 `npm.cmd test`）。

---

*本文档由本轮开发的实现者编写；与 `Gemini-Web-Companion/HANDOVER.md`（按版本分节）配合阅读。*
