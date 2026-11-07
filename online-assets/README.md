# 在线桌宠、壁纸和配色

桌面套件和网页扩展从本仓库 `main` 分支的 `online-assets/catalog.json` 读取同一份目录。只有该目录合入 GitHub 后才会在线出现。客户端不会读取工作区内的私人素材目录。

- 追加壁纸放在 `wallpapers/<id>.jpg`、`.png` 或 `.webp`，单张最多 5 MiB、1600 万像素。套装可在每张壁纸的记录填写相同的 `pack.id`、`pack.name` 与原作链接 `pack.source`，再用 `pack.position` 排序。商店把它们展示为一套，仍可逐张安装和选用。
- 桌宠放在 `characters/<id>.json`，每包最多 2 MiB。内容为 `{"schema":1,"frames":{"idle":"data:image/png;base64,..."}}`。可添加 `blink`、`proud`、`sad`、`shy`、`angry`。桌宠列在清单的 `characters` 数组，旧客户端仍可读取 `items` 中的壁纸和配色。
- 主题放在 `themes/<id>.json`。格式为 `{"schema":1,"palette":"ocean","opacity":75}`。配色可选 `violet`、`pink`、`ocean`、`onyx`，透明度整数为 30–100。主题不会分发脚本、样式代码或覆盖正在使用的壁纸。
- 在 `catalog.json` 加入名称、署名、说明、文件字节数和 SHA-256。缩略图使用短 WebP data URL。资源与清单请在同一个提交中发布。
- 新增或更新素材时填写 `updatedAt`，格式为 `YYYY-MM-DD`。商店按此日期排列「最近更新」，套装采用其中最新的一张。旧记录可省略日期。
- 设置中的桌宠和壁纸图库会标明已安装的素材。安装后可从本地图库选用。连接 GitHub 失败时，图库提示检查网络或代理，已安装内容可继续使用。
- `node --test shared/online.test.cjs` 会用实际目录校验所有文件的哈希，并覆盖发布版本识别和失败保护。

自动更新从 GitHub 的正式 Releases 读取。桌面用 `desktop-v0.6.0`（也接受 `v0.6.0`），附件名为 `Catstella-Setup-0.6.0-x64.exe`；网页扩展用 `web-v1.5.0`，附件名为 `kimino-gemini-companion-edge-chrome.zip` 或 `kimino-gemini-companion.xpi`。版本号随发布替换。草稿、预发布和缺附件的标签不提示安装；客户端不会自动执行安装程序。
