# Catstella

[English](README_EN.md) | [简体中文](README.md)

Catstella 是一套面向 Google Antigravity 的开源桌面增强与伴侣套件，包含桌面挂件（Cat Widget）、宿主毛玻璃皮肤与壁纸引擎（Dream Skin），以及支持与 Web 浏览器扩展通信的双端联动组件。

> **免责声明与安全声明**  
> 本项目为开源爱好者出于个人兴趣与学习交流自发维护的非商业衍生工具，**非 Google 官方产品**，亦未获得 Google 或任何相关实体的官方背书或授权。  
> 本项目通过本地已有的安全 CDP 调试通道只读读取额度并应用界面样式，**不修改任何宿主安装文件或 `app.asar` 核心包**，不拦截、不记录、不上传任何 API 密钥、登录凭证、Cookie 或聊天会话正文。

---

## 🎨 视觉与立绘展示 (Gallery & Artworks)

<!-- [CHARACTER_ART_PLACEHOLDER] -->
> *（立绘展示区域预留：待新版立绘资产导出后置入）*

<!-- [WALLPAPER_GALLERY_PLACEHOLDER] -->
> *（壁纸画廊展示区域预留：待新版壁纸与主题切图导出后置入）*

---

## 🌟 核心特性 (Key Features)

### 🐱 桌面猫娘挂件 (Cat Widget)
- **多模型额度与配额监控**：
  - 通过宿主后台接口只读提取 **Gemini 基础 5 小时 / 1 周** 配额与刷新倒计时；
  - **支持适配 Gemini 4 Argon 独立计量**：精准解析 `gemini-argon-wtu-weekly` 高智力 WTU 周配额，提供独立标识与低额度（< 20%）预警；
  - 支持 **Claude & GPT 第三方通道**，多模型额度同屏呈现；
  - 提供用户自定义称呼设置（默认不指定、杂鱼君、或自定义文本）。
- **交互与状态反馈**：
  - 50+ 句精校中文台词、自然呼吸动效与星轨边缘光晕；
  - 响应鼠标点击、拖拽与释放弹性回弹，支持屏幕底角磁吸停靠与转身自适应；
  - 具备多套独立表情帧（得意、委屈、害羞、生气等）与四套音效方案（默认静音）。
- **桌面穿透与防抖优化**：
  - 结合原生 C# `ForegroundHost` 位运算过滤，根治 Windows 浮动任务栏刷新引起的窗口闪烁；
  - **独立桌面常驻模式（Standalone）**：脱离 Antigravity 宿主运行时亦可退守桌面常驻，宿主启动后自动恢复吸附。

### 🔮 毛玻璃皮肤与壁纸引擎 (Dream Skin)
- **透光界面架构**：
  - 输入框重构为高斯模糊悬浮胶囊，消除外层容器深色底块，背景壁纸自然透光；
  - 保持代码编辑器（Monaco）与终端（xterm）的完全不透明防护，兼顾视觉体验与工作可读性；
  - 对话流向上滚动时平滑渐隐过渡，避免生硬边界。
- **四色主题配色方案**：
  - 原生 CSS 变量动态注入，支持切换：**星空紫 (Violet)**、**幻梦粉 (Pink)**、**深海蓝 (Ocean)** 与 **极夜黑 (Onyx)**；
  - 深度适配右上角 Overview 概览浮窗与弹出菜单。
- **壁纸自动轮播系统**：
  - 平滑交叉淡入淡出动画；
  - **1m ~ 60m 真实比例刻度滑块**，靠近常用时间档位提供磁吸阻尼辅助；自动读取用户壁纸目录。

### 🌐 界面多语言本地化 (Localization Layer)
- 基于本地 CDP 增量注入，不修改任何宿主内部 asar，支持随时一键卸载并完全还原；
- 覆盖 830+ 处界面文本、输入框 placeholder、按钮 title 与无障碍属性；
- 开箱默认保持原版英文界面，可在设置中心随时切换为简体中文。

### 🔗 跨端联动组件 (Companion Bridge)
- 桌面端挂件与 Web 浏览器扩展（Chrome / Edge / Firefox）通过本地环回端口 `127.0.0.1:3921` 通信；
- 支持双端额度同步、桌宠形象与壁纸库选择（可一键同步或两端保持独立）、双端显示策略配置。

---

## 🛠️ 安装与运行 (Installation & Usage)

### 方案 A：Windows 安装包（推荐）
套件使用 **Inno Setup** 制作标准化安装包：
1. 前往 [Releases 发布页](https://github.com/lynnfei/Catstella/releases) 下载最新的 `Catstella-Setup-*-x64.exe`；
2. 运行安装程序，按需勾选组件（核心桌面套件 / Web 浏览器扩展包）以及开机自启或宿主联动选项；
3. 安装程序安装于当前用户空间，无需管理员权限。

### 方案 B：源码运行与开发
环境要求：Windows 10/11 x64、Node.js 22+、.NET Framework 4.x。

```powershell
# 1. 克隆代码仓库
git clone https://github.com/lynnfei/Catstella.git
cd Catstella

# 2. 安装依赖并编译原生 C# 辅助工具
npm ci
npm run build:native

# 3. 启动桌面端套件
npm run start:widget

# 4. 执行自动化测试
npm test
```

快捷键：`Ctrl+Alt+G` 唤回挂件；`Ctrl+Alt+Shift+G` 关闭鼠标穿透。托盘图标右键可打开设置中心。

---

## 🔒 隐私与本地数据边界 (Privacy & Security)

| 数据类型 | 本地存储路径 | 用途说明 |
| :--- | :--- | :--- |
| 挂件与皮肤配置 | `%USERPROFILE%/.antigravity-cat-widget/`<br>`%USERPROFILE%/.antigravity-dream-skin/` | 存储壁纸偏好、滑块阻尼、缩放比例与本地配额数值账本。 |
| 本地日志数据 | `%USERPROFILE%/.gemini/antigravity/brain/` | 仅提取本地数值元数据，不分析、不保存、不上传会话正文。 |
| 本地通信端口 | `127.0.0.1:3921` (环回地址) | 仅响应受信任的本地桌面与扩展请求，阻止公网跨域访问。 |

- **完全本地运行**：本套件不含任何云端中继服务，所有数据与通信仅在用户本地计算机完成；
- **清理与自愈**：退出皮肤或通过托盘选择“退出并恢复”时，宿主所有样式与注入节点均会自动清理并恢复原生状态。

---

## 📜 许可声明与资产边界 (License & Assets)

1. **软件源代码许可**：本项目包含的原创源代码采用 [MIT License](LICENSE) 开源发布。
2. **美术与非代码资产限制**：
   - **MIT 许可证不适用于本项目包含的所有角色立绘、原画设定、壁纸图片、衍生美术以及非开源音效**；
   - 角色形象及相关设定参考归原设计者所有；所有美术资产仅供本项目展示、个人学习与桌面美化使用，**严禁任何形式的商业变现、非授权提取或二次转售**；
   - 仓库内音频资源均已注明许可来源（Kenney CC0 / 上游 MIT 合成音频），未包含未经明确授权的第三方商业音频；
   - 详情请查阅 [ASSETS.md](ASSETS.md) 与 [NOTICE.md](NOTICE.md)。
3. **免责条款**：
   - 本套件依赖宿主本地 CDP 调试接口与界面结构，宿主未来版本更新可能带来布局变化或接口调整；
   - 开发者不对因使用本非官方衍生工具可能导致的显示异常、缓存冲突等情况承担保证或连带责任。

---

## 💐 鸣谢与致敬 (Acknowledgements)

本项目在开发过程中参考并衍生自以下开源项目与原创设计：

- **[Monokumakuki / Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite)**：本项目基础工程衍生自 Monokumakuki 的开源项目，感谢原作者在初期架构、CDP 探针机制与双端雏形上的贡献；
- **ZipZipPipe**：感谢 ZipZipPipe 提供的 Gemini 星语猫娘角色概念设计参考与创意支持；
- **[Feeesack / codex-maid-widget](https://github.com/Feeesack/codex-maid-widget)** 与 **[MeteorNOX / DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**：感谢两大家居式桌宠项目在交互反馈、气泡状态机及额度观察逻辑上的开源启发。
