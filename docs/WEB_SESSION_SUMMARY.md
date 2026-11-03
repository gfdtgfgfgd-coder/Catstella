# 🐋 Catstella-web 会话压缩摘要（2026-11-03 额度实时监控攻坚）
> 用途：替代长对话上下文。接手者/后续会话读这一份即可恢复全部关键决策与结论。
> 关联：`HANDOFF.md`（架构与铁律）、`Gemini-Web-Companion/HANDOVER.md`（版本细节）、`CHANGELOG.md`（逐版本变更）。

## 1. 目标与结论（一句话）
让 Gemini 网页端桌宠**随每轮对话实时显示官方 5h/每周额度**。最终方案：**抓 `/usage` 页面的服务端渲染流式 JSON（`usage:0` chunk 里的 `getUsageInfo.pools`）**，纯 `fetch` 解析，零 UI、零导航、零跨域。**Edge 实装已确认"对话完成后实时刷新"正常**。版本 v1.3.10，dist 已构建，未提交。

## 2. 关键破案（推翻的假设 + 实证）
| 假设 | 结论 | 证据 |
| :-- | :-- | :-- |
| MaZiqc 是额度 RPC | ❌ 错。它是**会话列表** RPC（响应是聊天标题/时间戳数组） | IAB 启动竞速捕获完整响应 |
| 额度在某个 batchexecute RPC | ❌ 错。9 个启动 RPC、WIZ_global_data、localStorage/IndexedDB/CacheStorage、beacon、Worker 全部排除 | 全量网络监视器 + 存储搜查 |
| 额度在 `/usage` HTML 明文里 | ❌ 部分错：不在明文，在**转义 JSON chunk** 里 | HTML 明文搜 `已使用/21:37` 全 miss |
| **真相** | `/usage` 的额度是 **SSR 流式数据块**：`<script type="application/json">` 中 `events[].id==="usage:0"` 的 `chunk` 拼接后 → `[{data:{viewer:{rpcs:{getUsageInfo:{subscriptionTier,pools:[...]}}}}}]` | 与页面显示 100%/82%/21:37/23:37 完全吻合 |

`pools` 字段：`GXU_FIVE_HOURLY` / `GXU_WEEKLY`，各含 `percentageUsed`（0~1）与 `windowRefreshesAt`（UTC ISO，如 `2026-11-03T13:37:18.091Z`）。

## 3. 最终实现（tracker.js，主链路）
1. `refreshUsageLedger(reason, force)`：`fetch('/usage', {credentials:'include', cache:'no-store'})`；
2. `parseUsageLedgerHtml(html)`：正则抠 `<script type="application/json">` → 拼 `usage:0` chunk → `JSON.parse` → `findUsageInfo()` 深搜 `getUsageInfo`；
3. `applyUsageLedger(info, reason)`：百分比 → `currentUsagePercent` / `weeklyUsagePercent`；UTC ISO → 本地 `HH:MM` / `M月d日 HH:MM`；`resetTimestamp` 真实 epoch（倒计时/限流判定）；
4. 触发点：启动 2.5s / 回合后（STREAM_COMPLETE，20s 节流）/ 每 5 分钟 / 挂件 🔄（force）/ **节流时不丢弃→延后补刷**；
5. 可靠性：抓取失败 3 次退避重试（0.8s/2s），成功才计节流，全败 30s 后重试；**倒计时归零强制刷新**；
6. 显示语义：`fatiguePercent = max(官方, 会话估算)`（turns>0），`displaySource` 角标（官方限额/会话估算/estimate）；**提示条时间在账本新鲜（<10min）时禁止覆盖**（Google 提示条与账本存在 1 小时级错位：21:37 vs 22:37）。

兜底链保留但非主：interceptor 的 MaZiqc 捕获/重放（历史遗留）、提示条嗅探、用量弹窗 DOM 嗅探。iframe 探针已删（/usage 拒绝同源嵌入）。

## 4. 本次实机验证记录（IAB）
- 账本返回：5h 100% @ 21:37、周 82% @ 11月3日23:37、TIER1 — 与 /usage 页面一致；挂件红色 100% 条 + 哭泣帧 + 倒计时 00:56:37。
- 21:37 窗口重置后：账本 → 5h 0% @ 02:37、限流解除（验证"重置即刷"）。
- 用户手动聊天一轮：额度 0%→2%→7%（账本 `fetchedAt` 随回合推进），turns 递增。
- 观测到旧版缺陷：回合后刷新被 60s 节流吞掉（`fetchedAt` 停滞）→ 已修为 20s + 延后补刷。

## 5. ⚠️ IAB 风控红线（重要教训）
在 IAB 登录态会话里用"AI 口吻"与 Gemini 对话 → 触发 Google 反代/反蒸馏/反自动化风控：消息被模板话术回绝、回复被应用回滚、整段对话受限制（用户本人回复也可能被识别指纹一刀切）。**IAB 仅用于 DOM/UI/脚本注入验证，禁止对话测试**；对话与额度验收在用户 Edge/Firefox 实装环境进行。测试用的对话已由用户删除。

## 6. 待验证 / 下一步
- [x] Edge：对话完成后实时刷新额度（已确认）
- [ ] 5h 窗口重置后进度条自动回落（v1.3.10 已加逻辑，待实测）
- [ ] 每周额度重置后自动更新
- [ ] 新开浏览器会话首屏正确显示
- [ ] Firefox/Zen 上内容脚本 fetch 是否受 CSP 影响（若异常，需 background 隐藏 tab 兜底方案：`chrome.tabs.create({url:'/usage', active:false})` + /usage 页 content script 抓 `[data-testid="current-usage"]` 写 storage）
- 账本解析宽松化 + 失败打印结构样例（Google 改版快速修复）

## 7. 仓库状态
- `D:\Catstella-web` 为唯一真源；已提交：`eeb994a`（标注引擎/画廊）、`71dd3a1`（v1.3.9 账本）。
- 工作树未提交（v1.3.10）：CHANGELOG / HANDOVER / tracker.js / manifest(1.3.10) / HANDOFF。
- 验证闭环：`node Gemini-Web-Companion/scripts/build.js` + `npm.cmd test`（39/40，唯一失败为桌面端 native heartbeat 旧案）。
- 已知无害告警：`额度RPC重放失败: no-captured-req`（旧 RPC 兜底的一次性提示，不影响账本）。

## 8. 其它 kept 结论（皮肤/UI，避免回炉）
- 表面标注引擎（`data-kg` + 语义锚点 + `climbToPainted`）是皮肤主架构；类名选择器只在双保险位。
- 宽度语义：Composer = Google 原生宽度；回复卡 max-width = user-query 列宽（clamp 480~880）；勿再"拉宽"任一方。
- 渐隐：`applyFades()` 统一写入 `[fadeStartY, cutY]`（cutY = 对话滚动容器底边，`.chat-history`），mask 纯线性；12px 量化防闪屏；rAF 在失焦窗口冻结 → 用 setTimeout。
- z 序：body 透明；基底 `#kimino-base-layer`(z -100000)、壁纸 `#kimino-dream-wallpaper`(z -99999 圆角内容列)；`overflow-anchor:auto` 已强制恢复防跳滚。
- Trusted Types：widget 只用 `setHTML()`；CSS 禁用 `var()`；宿主 `#kimino-companion-root` 必须 `display:contents`。
