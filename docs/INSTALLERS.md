# Windows 独立安装包

两个插件各自使用一个安装EXE，不依赖另一个插件或工程目录。安装程序使用Windows自带C#/.NET Framework编译器；启动器、安装器和卸载源码位于tools/installer/。

## 构建

在Windows x64及.NET Framework 4.x环境，按根README准备Node.js依赖后运行：

```powershell
npm ci
npm run build:native
npm run build:installers
npm run verify:installers
```

输出位于dist/installers/。仅从已脱敏公开目录构建，包含各自的src/assets、shared、许可和npm锁定Electron运行时。编译后的原生窗口跟随程序只放入挂件包。不要从含私人参考图和运行配置的目录打包。

## 自启动与联动

配置位于HKCU\Software\AntigravityStarSuite\Widget或Skin；登录项位于HKCU\Software\Microsoft\Windows\CurrentVersion\Run，名称为AntigravityStarSuiteWidget或Skin。两个插件独立配置。

启动设置关闭全部选项后删除对应Run项，联动检测最多数秒退出。后台检测只检查当前Windows会话的Antigravity进程是否存在，不读取标题、会话或登录凭据。多台电脑上的安装目录无须相同。多个宿主同时运行时按“是否存在任一进程”触发，未穷举宿主更新/重启、多用户及多屏场景。

启用联动会在当前用户登录时启动检测辅助程序。只在宿主出现边沿启动插件，不在每轮检测中反复启动。不会修改Antigravity原有快捷方式，也不承诺宿主退出时同步退出插件。

## 卸载与升级

卸载入口属于每个插件自己的当前用户卸载项。卸载前向对应插件发送正常退出指令，清理自己创建的快捷方式和登录项，再由临时目录工作进程删除带类型标记的安装目录。个人设置目录保留。卸载工作进程可能在系统临时目录保留一个很小的EXE，后续可由系统临时文件清理移除。

同一插件重装可选择原安装目录。为避免升级时文件占用，建议先从托盘退出插件；不要把多个插件装进同一目录。不要选择包含其他文件的目录，安装器会拒绝覆盖没有匹配安装标记的非空目录。

当前安装包没有签名或自动在线更新功能。SHA256SUMS用于下载完整性核对。发布前验证包括中文目录独立提取、两个真实Electron界面、自启动/联动选项和隔离Run项清理、带标记目录卸载；不等同第二台设备或实际重新登录验收。
