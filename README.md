# Catstella · Gemini Web Companion

本工作区维护 Catstella 的 Gemini 网页扩展。它为 Gemini 网页提供桌宠、Dream Skin 主题、会话用量提示和桌面联动。

- [浏览器安装指南与功能](Gemini-Web-Companion/README.md)
- [版本路线图](docs/ROADMAP.md)
- [Catstella 桌面套件及发行包](https://github.com/lynnfei/Catstella/releases)

从仓库根目录安装依赖，然后构建扩展。

```powershell
npm ci
node Gemini-Web-Companion/scripts/build.js
npm run test:web
npm run test:web:browser
```

ZIP、XPI 和解压目录生成在 `Gemini-Web-Companion/dist/`。Edge 和 Chrome 可以加载解压目录。Firefox 可通过 `about:debugging` 临时加载未签名测试包。

项目源自 Monokumakuki 的 [Antigravity-Star-Suite](https://github.com/Monokumakuki/Antigravity-Star-Suite)。软件与素材的许可详见 [LICENSE](LICENSE) 和 [素材说明](ASSETS.md)。
