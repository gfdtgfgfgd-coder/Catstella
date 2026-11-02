# 🐱 Catstella · 主分支交接文档 (Branch: `main`)
> **项目定位**：Antigravity 本地桌面端双插件套件（桌宠挂件 + 毛玻璃 Dream Skin）  
> **适用受众**：接手 `main` 分支开发的马仔 / 协同 Agent / 开发者  
> **文档版本**：v0.3.0-dev | 更新时间：2026-11-03

---

## 1. 架构总览与核心设计

本分支为 **Catstella (原 Antigravity-Star-Suite)** 的桌面核心主干，专为 Google Antigravity 本地 IDE (基于 Electron) 打造。包含两个**完全解耦、独立启动、独立配置**的原生级增强程序：

```text
d:\Catstella/
├── Antigravity-Cat-Widget/    # 1. 桌面猫娘桌宠 (半身挂件、双周期额度、窗口吸附、音效、台词)
├── Antigravity-Dream-Skin/    # 2. 毛玻璃宿主皮肤 (CDP 注入、星空壁纸、斜向微网格、代码保护区)
├── shared/                   # 3. 共享基础库 (CDP 连接器、设置持久化、WebSocket 封装)
├── tools/                    # 4. 原生构建工具 (C# 原生编译、启动脚本、单测与指纹校验)
└── docs/                     # 5. 文档与资产说明
```

### 核心特性矩阵

| 组件 | 技术方案 | 核心依赖 | 职责边界 |
| :--- | :--- | :--- | :--- |
| **Cat Widget** | Electron 45.1.0 + Windows 原生 C# 辅助 | CDP (ws://127.0.0.1:\<port\>) + Win32 API | 读取宿主后台额度服务、无感跟随 Antigravity 窗口、左右下角磁吸、50+中文台词与点击互动 |
| **Dream Skin** | Electron 控制面板 + CDP CSS 注入 | Chrome DevTools Protocol (`CSS.addRule` / `Runtime.evaluate`) | 注入全屏壁纸与毛玻璃滤镜、斜向微网格侧边栏、药丸输入框；退出/关闭时 100% 干净还原 |
| **Native Helper** | .NET Framework C# (`tools/build-native.ps1`) | `user32.dll`, `dwmapi.dll` | 极低 CPU 占用监控前台窗口、位置、DPI 缩放与最小化/遮挡状态 |

---

## 2. 核心机制与技术细节

### 2.1 静默额度抓取机制 (Cat Widget)
* **路径**：`Antigravity-Cat-Widget/src/quota-service.cjs` 与 `quota-cache.cjs`
* **工作原理**：
  1. 通过 Antigravity 宿主已开放的本地 CDP 端口（通常在 `settings-store` 或进程参数中探测），定位宿主内部已登录的 React 额度服务。
  2. 提取 **Gemini 5 小时** 与 **每周 (Weekly)** 剩余比例及重置时间戳。
  3. **不打开** Settings -> Models 页面，**不读取/序列化**任何用户 Token、Cookie 或 API Key。
  4. 启动时按 `3s -> 6s -> 12s -> 24s -> 30s` 指数退避重试，连接成功后转为 30 秒定期轮询。
  5. 响应具备生命周期防伪：停止轮询后的迟到响应不会覆盖新状态，切换宿主自动清空旧缓存。

### 2.2 原生窗口吸附与跟随 (Host Following)
* **路径**：`Antigravity-Cat-Widget/src/native-foreground-helper.cjs`
* **工作原理**：
  1. 编译后的 `native-tracker.exe` 轮询前台活跃窗口句柄与矩形坐标（支持负坐标多屏工作区）。
  2. 当 Antigravity 在前台时，挂件置顶并吸附在窗口左右下角（内嵌 120 DIP 磁吸范围）；
  3. 当 Antigravity 最小化或被其他应用完全遮挡时，挂件自动隐藏；切换到其他应用时取消置顶，绝不抢焦点。

### 2.3 Dream Skin 无损注入与干净回滚
* **路径**：`Antigravity-Dream-Skin/src/main.cjs` 与 `skin-injector.cjs`
* **工作原理**：
  1. 通过 CDP `DOM.enable` / `CSS.enable` 动态注入 `#antigravity-dream-wallpaper` 节点与微网格样式。
  2. 托盘退出选择“退出并恢复原样”时，CDP 自动移除所有已注入样式表和节点，不残留垃圾。
  3. **防眩光保护区**：代码编辑器（Monaco）、终端、下拉菜单保留暗色底色，绝不穿透导致文字不可读。

---

## 3. 开发、编译与测试指南

### 3.1 环境要求
* Windows 10/11 x64
* Node.js 22.x+
* 已安装并登录的 Antigravity (实测兼容 2.28.0+)
* 系统自带 .NET Framework 4.x (用于编译 C# 原生辅助工具)

### 3.2 常用命令
```powershell
# 1. 编译 Windows 原生窗口跟随辅助程序
npm run build:native

# 2. 运行全套单元测试 (40 项全绿验收)
npm.cmd test
# 或者:
node --test Antigravity-Cat-Widget/test/runtime.test.cjs Antigravity-Dream-Skin/test/runtime.test.cjs tools/source-hashes.test.cjs Antigravity-Cat-Widget/test/personality.test.cjs Antigravity-Cat-Widget/test/quota-cache.test.cjs

# 3. 启动桌面猫娘桌宠
npm.cmd run start:widget

# 4. 启动毛玻璃皮肤控制面板
npm.cmd run start:skin

# 5. 端到端受控运行时验证 (需要 Edge/Playwright)
npm.cmd run verify:runtime
```

### 3.3 数据持久化路径
* 挂件配置与数值日志账本：`%USERPROFILE%/.antigravity-cat-widget/`
* 皮肤配置：`%USERPROFILE%/.antigravity-dream-skin/`
* 原始宿主读取数据仅存在于内存，退出时不留痕。

---

## 4. 主分支后续交接待办事项 (To-Do List)

接手马仔请重点推进以下内容：

1. **统一品牌升级为 Catstella v0.3.0**：
   - 目前 `package.json` 根配置已改名为 `catstella`，需要同步更新 `Antigravity-Cat-Widget/package.json` 与 `Antigravity-Dream-Skin/package.json` 的版本号和项目名。
2. **多屏与高 DPI 边界测试**：
   - 补充负坐标副屏、4K 200% DPI 缩放下窗口跟随的边缘贴合度测试用例。
3. **资产管线共享 (Asset Pipeline)**：
   - 将角色切片（`lin-cat`、`gemini-star-v1`）与台词库（`dialogue`）统一抽取到 `shared/assets/`，避免与 `feat/browser-extension` 分支重复冗余。
4. **准备合并浏览器分支**：
   - 当 `feat/browser-extension` 的 Gemini Web 端体验打磨完毕后，合并回主分支形成“桌面 + 网页”全端套件。
