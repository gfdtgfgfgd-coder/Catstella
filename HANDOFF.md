# Catstella Web · 当前交接说明

> Web 扩展版本：1.5.0 · 更新日期：2026-11-05
> 当前架构优先于旧版本交接和历史验证记录。

## 源码与工作区

- `D:\Catstella-web\Gemini-Web-Companion` 是活动 Web 扩展源码。
- `D:\Catstella` 是同一 Git 仓库的桌面分支工作区。其旧内嵌 `Gemini-Web-Companion` 已移除，不能重新放回或在其中开发扩展。
- 桌面安装器和角色同步共用 `D:\Catstella\tools\web-companion-path.cjs`，默认读取活动 Web 工作区。异地布局可用 `WEB_COMPANION_PATH` 指向扩展源码目录；无效显式路径会报错。
- 旧 `sync-web-companion.cjs`、adopt/push 工作流已退役。新门禁为 `node tools/audit-web-layout.cjs`，只读检查唯一源码、版本和桌面选择路径。
- 不整树互拷，不在本次视觉补丁中合并两个分支。Web 工作区附带的旧桌面代码仍参与其根测试，尚未移除。

浮动任务栏重影经实测仍复现，和双端记忆/人格同步一起列入 [长期规划](docs/ROADMAP.md)。

## Web 架构

1.5.0：扩展菜单和壁纸页可打开「更新与在线图库」；更新检测只提示新版本，主题只应用内置配色与透明度。常用设置可选择开启本地碎碎念。

1.4.4 补充：`wallpaper.js` 负责预解码与 1.3s 交叉淡入，固定渐隐副本共享动画时轴；尊重桌面的无过渡设置和系统减少动态偏好。桌面缩略图经扩展后台取图/缩小后返回 data URL，不让 Gemini 图片节点直连 localhost；设置刷新有版本守卫，防止异步追加重复卡片。

焦点心跳分开传 active/visible；短暂失焦延后 300ms，隐藏立即上报。背景图片下载不再阻塞焦点同步。桌面侧以真实 foregroundKind 区分宿主、浏览器和系统壳层，任务栏临时接管时保留互斥归属。原生辅助程序按源码哈希编译，当前桌面进程保持运行，重启后加载新程序；安装器仍使用现场编译的规范文件名，不打包开发缓存。

1. `interceptor.js`：MAIN world / document_start，仅读流式请求生命周期和字节数，不缓存请求正文、不广播回复片段、不捕获或重放聊天列表 RPC。
2. `shim.js`：统一存储和消息 API，Chromium 走回调、Gecko 走 Promise，每次仅调用一次，存储写入完成后才返回。
3. `inject-bridge.js`：先 ping 已安装的拦截器，缺失才尝试注入。CSP 失败安全降级，不影响桌宠与皮肤。
4. `tracker.js`：`/usage` SSR JSON 账本为官方额度来源，保留 DOM 提示/弹窗和隐藏用量页兜底。官方数值优先，估算仅用于无官方值时。只有一套周期刷新；网络完成和 DOM 完成使用账本节流。`MaZiqc` 是聊天列表，相关捕获/重放/解析旧代码已删除。
5. `fade.js`：独立的固定壁纸合成层，位于输入区内容之下、消息之上。渐隐位置只随窗口、输入框、提示条和侧栏几何变化更新；滚动不逐卡测量、不写消息遮罩。
6. `skin.js`：合并变化表面的语义标注、回复列宽、壁纸与设置联动。CSS 常驻，不禁用样式表、不切换无模糊临时表。取消了旧逐卡 mask 引擎及滚动/wheel/touchmove 监听。
7. `skin.css`：原生语义/已确认类名与 data-kg 标记共用表面定义，防止标注前后换形。展开按钮只换色，尺寸、圆角、间距、焦点和交互保留原生；左右光晕只在控件子树处理。桌宠样式在 `widget.js` 的 Shadow DOM 中，未使用的外部 `widget.css` 已删除。

## 关键约束

- 禁止全局 class 子串匹配、整页 computed-style 扫描和全消息伪元素清洗。
- 不在聊天滚动容器或玻璃卡片祖先上加全局 mask；固定渐隐的 mask 只属于独立壁纸层，不改变消息自身的 backdrop 采样。
- 颜色/尺寸继续使用字面量。宿主 `#kimino-companion-root` 保持 `display:contents`。
- body 透明；基底 `#kimino-base-layer` 在 -100000，壁纸在 -99999。渐隐副本必须使用相同壁纸、基底和透明度。
- Composer 定位始终排除 `.edit-rich-textarea`。Composer 保留原生列宽；回复卡宽度按原生提问列测量，写入去重，关闭皮肤恢复宿主原有宽度。
- Trusted Types 下桌宠使用 setHTML 安全壳，不重新引入裸 MAIN-world innerHTML。
- 不通过登录会话自动发模型消息。用户自行做 Firefox/Edge 实装验收。

## 检查与构建

```powershell
node tools/audit-web-layout.cjs
node --test Gemini-Web-Companion/test/turn-watcher.test.cjs Gemini-Web-Companion/test/runtime.test.cjs
node Gemini-Web-Companion/test/skin-browser.cjs
node Gemini-Web-Companion/test/fade-browser.cjs
node Gemini-Web-Companion/test/wallpaper-browser.cjs
node Gemini-Web-Companion/scripts/build.js
node Gemini-Web-Companion/test/skin-browser.cjs --built
node Gemini-Web-Companion/test/fade-browser.cjs --built
node Gemini-Web-Companion/test/wallpaper-browser.cjs --built
```

浏览器隔离测试默认使用本机 Edge；CI 设 `SKIN_BROWSER_CHANNEL=chromium`。`--built` 验证实际打包内容。

产物：`Gemini-Web-Companion/dist/chromium/`、`firefox/`、Edge/Chrome ZIP、Firefox XPI、Stylus UserCSS。清单/package/UserCSS 版本同步。

完整审计清单、保留风险和本轮检查结果见 [规则与冗余审计](docs/WEB_AUDIT_1.4.3.md)。旧 [1.4.1/1.4.2 记录](docs/WEB_REVIEW_2026-11-05.md) 和扩展 HANDOVER 仅作为历史材料。
