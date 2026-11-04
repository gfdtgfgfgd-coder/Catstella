# Catstella · 星语套件 (Antigravity Star Suite)

[English](README_EN.md) | [简体中文](README.md)

给 Google Antigravity 注入一抹温柔的蓝紫色星轨：一个灵动鲜活的 Gemini 猫娘桌宠、一套晶莹剔透的高性能毛玻璃壁纸皮肤，以及支持双端跨端漫游的完整伴侣套件。

> **免责声明与安全声明**  
> 本项目为开源爱好者出于个人兴趣与学习交流自发维护的非商业衍生工具，**非 Google 官方产品**，亦未获得 Google 或任何相关实体的官方背书或授权。  
> 本项目通过本地已有的安全 CDP 调试通道只读映射额度并增量应用样式，**绝对不修改任何宿主安装文件或 `app.asar` 核心包**，不拦截、不记录、不上传任何 API 密钥、登录凭证、Cookie 或聊天会话正文。

---

## 🎨 视觉与立绘展示 (Gallery & Artworks)

<!-- [CHARACTER_ART_PLACEHOLDER] -->
> *立绘展示区域预留：待新版高清重制美术资产（星语魔女 / 居家水母冲锋衣）导出后置入*

<!-- [WALLPAPER_GALLERY_PLACEHOLDER] -->
> *壁纸画廊展示区域预留：待新版专属重制壁纸与主题切图导出后置入*

---

## 🌟 核心特性 (Key Features)

### 🐱 喵言喵语 · 桌面猫娘伴侣 (Cat Widget)
- **多模型与高智力独立配额**：
  - 自动直通宿主后台配额通道，实时监测 **Gemini 基础 5 小时 / 1 周**配额与刷新倒计时；
  - **首发适配 Gemini 4 Argon 独立计量**：精准提取 `gemini-argon-wtu-weekly` 高智力 WTU 周配额，智能切换专属星轨勋章并在低于 20% 时触发猫猫担忧预警；
  - 支持 **Claude & GPT 第三方通道**，多模型额度一览无余。
- **灵动生命力交互**：
  - 50+ 句精校中文台词、4.2s 自然呼吸律动与星轨流光边缘；
  - 按压弹性回弹、鼠标拖拽、屏幕左右下角磁吸停靠与转身自适应；
  - 拥有多套独立表情帧（得意、委屈、害羞、生气等）与四套配对音效（默认静音）。
- **原生级桌面穿透与稳定防抖**：
  - 采用 C# `ForegroundHost` 原生位运算过滤，根治 Windows 浮动任务栏 1Hz 冲突闪烁；
  - 独创 **Standalone 独立桌面常驻模式**：脱离 Antigravity 宿主不闪退、优雅退守桌面，宿主唤醒后无缝吸附。

### 🔮 织梦之境 · 宿主毛玻璃皮肤引擎 (Dream Skin)
- **Liquid Dream Glass 梦幻透光架构**：
  - 输入框重构为高斯模糊悬浮流光胶囊，**彻底根治外层容器深黑块**，立绘与星轨壁纸自然透底；
  - 核心阅读面保持高对比度磨砂质感，代码编辑器（Monaco）与终端（xterm）享受 100% 绝对保护；
  - 6 段 S 曲线动态渐隐过渡，对话向上滚动时“先溶解、后模糊”，告别生硬遮罩。
- **四色流光主题调色盘 (Palettes)**：
  - 原生 CSS 变量动态注入，实时切换：**星空紫 (Violet)**、**幻梦粉 (Pink)**、**深海蓝 (Ocean)** 与 **极夜黑 (Onyx)**；
  - 深度主题化适配右上角 Overview 概览浮窗与交互菜单。
- **Win7 级壁纸轮播系统**：
  - 1.3s 交叉溶解平滑淡入淡出动效；
  - **1m~60m 真实比例磁吸阻尼时间尺**，自动扫描用户壁纸目录并安全落盘。

### 🌐 831 词条母语级界面汉化套件 (Localization Layer)
- 零侵入 CDP 增量注入，不修改任何宿主内部 asar，可随时一键卸载完全还原原文；
- **831 条精校词条**全覆盖：不仅包含文本节点，连带输入框占位符（`“有问必答，@ 提及，/ 唤起操作”`）、按钮 title 与 aria-label 完整汉化；
- 默认采用纯净原版英文界面，设置中心可一秒无缝切换至简体中文。

### 🔗 跨端双向神经联动桥 (Companion Bridge)
- 桌面端挂件与 Web 浏览器扩展（Chrome / Firefox）经本地环回端口 `127.0.0.1:3921` 跨端互通；
- 支持双端用量互看互显、桌宠形象与壁纸库**一键同步或解耦独立**、双显/桌面显/Web 显灵活切换。

---

## 🛠️ 安装与运行 (Installation & Usage)

### 方案 A：Windows 一键安装包（推荐，新手首选）
本套件已完全迁移至现代化的 **Inno Setup 7.1.1** 组件化安装器：
1. 前往 [Releases 发布页](https://github.com/lynnfei/Catstella/releases) 下载最新的 `StarSuite-Setup-x64.exe`；
2. 运行安装程序，可自由勾选组件（核心桌面套件 / Web 浏览器插件包）以及开机自启/宿主联动启动；
3. 安装程序会自动管理快捷方式备份与还原，无需管理员权限，安装于当前用户空间。

### 方案 B：源码运行与开发调试
环境要求：Windows 10/11 x64、Node.js 22+、系统自带 .NET Framework 4.x。

```powershell
# 1. 克隆代码仓库
git clone https://github.com/lynnfei/Catstella.git
cd Catstella

# 2. 安装依赖并编译原生 C# 辅助宿主
npm ci
npm run build:native

# 3. 启动桌面端组件（单实例合并运行）
npm run start:widget

# 4. 运行全套自动化测试（66 项单元与 E2E 测试全绿）
npm test
```

快捷键：`Ctrl+Alt+G` 唤回挂件；`Ctrl+Alt+Shift+G` 关闭鼠标穿透。托盘图标右键可唤出设置中心。

---

## 🔒 隐私、数据与安全边界 (Privacy & Security)

| 数据类型 | 本地存储路径 | 用途与隐私说明 |
| :--- | :--- | :--- |
| 挂件与皮肤配置 | `%USERPROFILE%/.antigravity-cat-widget/`<br>`%USERPROFILE%/.antigravity-dream-skin/` | 存储壁纸偏好、滑块阻尼、缩放比例与纯数字额度账本。 |
| 本机只读日志 | `%USERPROFILE%/.gemini/antigravity/brain/` | 仅提取本地数值元数据，不分析、不保存、不上传会话聊天正文。 |
| 联动端口 | `127.0.0.1:3921` (环回地址) | 仅响应受信任的本地桌面与扩展请求，阻止任何外部公网跨域连接。 |

- **纯本地运行**：套件不包含任何云端中继服务器，所有网络请求仅发生在用户自身与宿主之间；
- **平滑退出与自愈**：退出皮肤或从托盘选择“退出并恢复原样”时，宿主所有样式与注入节点自动深度清理并恢复如初。

---

## 📜 叠甲声明与开源协议 (Disclaimer & License)

1. **软件开源许可**：本项目包含的原创源代码采用 [MIT License](LICENSE) 开源发布。
2. **美术与非代码资产限制（重要）**：
   - **MIT 许可证严格不适用于本项目包含的所有角色立绘、原画设定、壁纸图片、衍生美术以及非开源音效**；
   - 角色形象及相关设定参考归原设计者所有；所有美术资产仅供本项目个人学习、交流与桌面美化使用，**严禁任何形式的商业变现、非授权提取或二次打包转售**；
   - 仓库内包含的音频资源均已注明许可来源（Kenney CC0 / 上游 MIT 合成音频），未包含未经明确授权的第三方商业音频。
3. **免责条款**：
   - 本套件依赖宿主本地 CDP 接口与界面结构，宿主未来版本更新可能带来兼容性变化；
   - 开发者不对因使用本非官方衍生工具可能导致的显示异常、缓存冲突等情况承担赔偿或保证责任。

---

## 💐 鸣谢与致敬 (Acknowledgements)

Catstella 凝聚了开源社区多位杰出创作者的智慧与灵感，在此致以最崇高的敬意：

- **[Monokumakuki](https://github.com/Monokumakuki/Antigravity-Star-Suite)**：本项目衍生自 Monokumakuki 发起的基础工程 `Antigravity-Star-Suite`，感谢原作者在架构探索、早期 CDP 探针及双端雏形上的拓荒贡献；
- **ZipZipPipe (Z佬)**：衷心感谢 Z佬 为 Gemini 星语猫娘提供的卓越角色概念设计与灵感火种，赋予了这只小猫独一无二的星际灵魂；
- **[Feeesack / codex-maid-widget](https://github.com/Feeesack/codex-maid-widget)** 与 **[MeteorNOX / DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**：感谢两大家居式桌宠先驱项目在交互设计、气泡状态机以及额度观察上的开源启发。
