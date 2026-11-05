# 🐾 Gemini Web Companion · 网页端扩展分支交接文档 (Branch: `feat/browser-extension`)

> 历史文档；当前架构和验证入口以 `D:\Catstella-web\HANDOFF.md` 为准。完整交接文档已就绪。详细技术细节、截图 Bug 根因分析（包括 Firefox/Zen 不可用、紫色大色块排查、左下角小黑块穿透规则、以及额度自动嗅探方案）请参阅子工程源码目录下的专属文档：
> 
> 👉 **活动 Web 工作区中的 `Gemini-Web-Companion/HANDOVER.md`（历史记录）**

---

### 快速指引速览

1. **核心文件位置**：`D:\Catstella-web\Gemini-Web-Companion\`
2. **构建打包命令**：`node D:/Catstella-web/Gemini-Web-Companion/scripts/build.js`
3. **关键攻坚清单**：
   - 🔴 **Gecko (Firefox / Zen) 兼容性**：解决 MV3 Background 字段与严苛页面 CSP 拦截导致的注入失败；
   - 🔴 **修复大块紫色色块**：重构 `skin.css` 中 `:is(user-query, .user-query)` 的内联选择器，外层 Flex 铺平透明，仅对真实文本气泡施加通透毛玻璃；
   - 🔴 **抹除左下角黑色底块**：穿透 `bard-sidenav .side-nav-footer` 与账号信息组件背景；
   - 🔴 **自动化额度嗅探**：从输入框上方原生提示条（如 `用量限额将在 6:37 下午 重置`）直接解析，摆脱手动打开弹窗并刷新标签页的繁琐流程。
