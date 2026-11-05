# Windows 套件安装包

一个 `Catstella-Setup-<版本>-x64.exe` 安装桌宠与 Dream Skin 主题引擎。实验性 BYOK 网关已封存到 `archive/legacy-byok/`。覆盖安装会清理原安装目录中的 BYOK 程序文件和启用标记，个人配置仍保留。可选的 Web 伴侣组件附带扩展包和安装指引，由用户在浏览器里安装。构建只打包主题运行模块，并移除 Catstella 不使用的 Chromium locale 文件。安装器使用 Inno Setup；启动与卸载源码在 `tools/installer/`。

## 构建

在Windows x64及.NET Framework 4.x环境，按根README准备Node.js依赖后运行：

```powershell
npm ci
npm run build:native
npm run build:installers
```

输出位于 `dist/installers/`。桌面组件包含两个项目的 `src/assets`、共享代码、许可和锁定的 Electron 运行时；Web 扩展从活动 Web 工作区现场打包。私人素材和本机配置不参与打包。

完整安装、启动和卸载验证用 `npm run verify:installers`，请在干净的 Windows 测试账户或虚拟机运行：虽然安装目录是临时的，安装和卸载仍会使用当前账户的套件注册表项。

## 自启动与联动

套件配置位于 `HKCU\Software\AntigravityStarSuite\Suite`。登录项位于 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，名称为 `AntigravityStarSuiteSuite`。

启动设置关闭全部选项后删除对应Run项，联动检测最多数秒退出。后台检测只检查当前Windows会话的Antigravity进程是否存在，不读取标题、会话或登录凭据。多台电脑上的安装目录无须相同。多个宿主同时运行时按“是否存在任一进程”触发，未穷举宿主更新/重启、多用户及多屏场景。

启用联动会在当前用户登录时启动检测辅助程序。只在宿主出现边沿启动插件，不在每轮检测中反复启动。不会修改Antigravity原有快捷方式，也不承诺宿主退出时同步退出插件。

## 卸载与升级

从 Windows 的已安装应用卸载套件。卸载时先让套件退出，再清理快捷方式、登录项，并清空整个安装目录（含 Electron 无 locales 时生成的 `debug.log` 等运行时残留）。个人设置目录保留。

重装可选择原安装目录。安装器会请求旧套件退出，等待该目录的旧进程释放文件，并由 Windows 检查仍被占用的程序文件。

当前安装包未签名。套件会检查 GitHub 的正式桌面发行包，提示新版本；升级仍需手动下载和安装。发行标签、附件命名和在线图库发布流程见 [在线主题与壁纸](../online-assets/README.md)。
