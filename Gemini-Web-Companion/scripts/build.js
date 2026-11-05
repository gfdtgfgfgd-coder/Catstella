// Catstella · 多平台扩展打包脚本 (Firefox .xpi & Edge/Chrome .zip)
// v1.2.1 变更：弃用 PowerShell Compress-Archive —— 其在 Windows 上会把 zip 条目
// 名写成反斜杠分隔 (assets\foo.png)，违反 ZIP 规范，导致 Firefox (libjar)
// 无法解析 xpi 内部路径、content script 静默加载失败。现改用 Node 内置 zlib
// 实现规范 zip 写入 (正斜杠 + deflate + 正确 CRC32)，零外部依赖、全平台一致。
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const firefoxDir = path.join(distDir, 'firefox');
const chromiumDir = path.join(distDir, 'chromium');

console.log('🚀 开始打包 Gemini Web Companion (Catstella)...');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
const checksumsPath = path.join(distDir, 'SHA256SUMS.txt');
fs.rmSync(checksumsPath, { force: true });

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---------- 规范 ZIP 写入器 (正斜杠条目名，Firefox/Chrome 双兼容) ----------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

function buildZip(sourceDir, outPath) {
  const files = [];
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(sourceDir);

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | (Math.floor(now.getSeconds() / 2) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);

  const chunks = [];
  const central = [];
  let offset = 0;

  for (const full of files) {
    // 强制使用正斜杠作为 zip 条目分隔符 (ZIP 规范要求)
    const name = path.relative(sourceDir, full).split(path.sep).join('/');
    const data = fs.readFileSync(full);
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // bit 11: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += 30 + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  fs.writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, eocd]));
}

const itemsToCopy = [
  'manifest.json',
  'background.js',
  'online',
  'content',
  'popup',
  'assets'
];

// 画廊清单：构建时扫描 assets 生成（壁纸/形象两族），供设置面板画廊使用
function generateGalleryManifest(targetDir) {
  const gallery = JSON.parse(fs.readFileSync(path.join(rootDir, 'assets/gallery.json'), 'utf8'));
  const wallpapers = [];
  const wpDir = path.join(rootDir, 'assets', 'wallpapers');
  if (fs.existsSync(wpDir)) {
    for (const f of fs.readdirSync(wpDir)) {
      if (/\.(png|jpe?g|webp)$/i.test(f)) {
        const id = f.replace(/\.[^.]+$/, '');
        const src = 'assets/wallpapers/' + f;
        wallpapers.push(gallery.wallpapers.find(wall => wall.src === src) || { id, name: id.replace(/[-_]+/g, ' '), src });
      }
    }
  }
  const characters = [];
  const chDir = path.join(rootDir, 'assets', 'characters');
  if (fs.existsSync(chDir)) {
    for (const d of fs.readdirSync(chDir)) {
      const p = path.join(chDir, d);
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'idle.png'))) {
        characters.push({ id: d, name: d.replace(/[-_]+/g, ' '), preview: 'assets/characters/' + d + '/idle.png' });
      }
    }
  }
  const wallOrder = new Map(gallery.wallpapers.map((wall, index) => [wall.id, index]));
  wallpapers.sort((a, b) => (wallOrder.get(a.id) ?? Infinity) - (wallOrder.get(b.id) ?? Infinity));
  const manifest = { wallpapers, characters: characters.map(pack => ({ ...pack, ...gallery.characters.find(item => item.id === pack.id) })) };
  fs.writeFileSync(path.join(targetDir, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

// 1. 构建 Chromium (Edge / Chrome) 版本
console.log('📦 构建 Chromium (Edge / Chrome) 专版...');
if (fs.existsSync(chromiumDir)) fs.rmSync(chromiumDir, { recursive: true, force: true });
fs.mkdirSync(chromiumDir, { recursive: true });
for (const item of itemsToCopy) {
  copyRecursive(path.join(rootDir, item), path.join(chromiumDir, item));
}

const crManifestPath = path.join(chromiumDir, 'manifest.json');
const crManifest = JSON.parse(fs.readFileSync(crManifestPath, 'utf8'));
// Chromium MV3: 只保留 service_worker，并剥离 Firefox 专属字段，杜绝清单校验警告
crManifest.background = {
  service_worker: "background.js"
};
delete crManifest.browser_specific_settings;
fs.writeFileSync(crManifestPath, JSON.stringify(crManifest, null, 2), 'utf8');
const galleryCr = generateGalleryManifest(chromiumDir);
console.log(`🖼️ 画廊清单：壁纸 ${galleryCr.wallpapers.length} 张 / 形象 ${galleryCr.characters.length} 套`);

// 2. 构建 Firefox 专版
console.log('🦊 构建 Firefox (火狐) 专版...');
if (fs.existsSync(firefoxDir)) fs.rmSync(firefoxDir, { recursive: true, force: true });
fs.mkdirSync(firefoxDir, { recursive: true });
for (const item of itemsToCopy) {
  copyRecursive(path.join(rootDir, item), path.join(firefoxDir, item));
}

const ffManifestPath = path.join(firefoxDir, 'manifest.json');
const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, 'utf8'));
// Gecko MV3: 仅保留 event page 形式的 background.scripts (不支持 service_worker)
ffManifest.background = {
  scripts: ["online/client.js", "background.js"]
};
ffManifest.browser_specific_settings = {
  gecko: {
    id: "kimino-gemini-companion@antigravity",
    strict_min_version: "109.0"
  }
};
// 彻底解决 Firefox MV3 目录通配符无法跨层级匹配的 Bug (Bug 1740518)
ffManifest.web_accessible_resources = [
  {
    resources: [
      "assets/*",
      "assets/*/*",
      "assets/*/*/*",
      "assets/characters/gemini-star-v1/*",
      "assets/characters/lin-cat/*",
      "assets/wallpapers/*",
      "assets/audio/*",
      "assets/dialogue/*",
      "assets/icons/*",
      "content/*"
    ],
    matches: ["*://gemini.google.com/*"]
  }
];
fs.writeFileSync(ffManifestPath, JSON.stringify(ffManifest, null, 2), 'utf8');
generateGalleryManifest(firefoxDir);

// web_accessible_resources 需要放行画廊清单
ffManifest.web_accessible_resources[0].resources.push('assets/manifest.json');
fs.writeFileSync(ffManifestPath, JSON.stringify(ffManifest, null, 2), 'utf8');

// 3. 规范压缩打包
console.log('🗜️ 正在压缩生成 Firefox .xpi (规范正斜杠 zip)...');
const xpiDest = path.join(distDir, 'kimino-gemini-companion.xpi');
if (fs.existsSync(xpiDest)) fs.unlinkSync(xpiDest);
buildZip(firefoxDir, xpiDest);
console.log('✅ Firefox .xpi 生成成功:', xpiDest);

console.log('🗜️ 正在压缩生成 Edge/Chrome .zip...');
const zipDest = path.join(distDir, 'kimino-gemini-companion-edge-chrome.zip');
if (fs.existsSync(zipDest)) fs.unlinkSync(zipDest);
buildZip(chromiumDir, zipDest);
console.log('✅ Edge/Chrome .zip 生成成功:', zipDest);

// 4. 构建 Stylus / xStyle 专版 UserCSS (纯 CSS 零 JS 安全无注入)
console.log('🎨 正在生成 Stylus 专版 UserCSS (kimino-dream.user.css)...');
const rawSkinCss = fs.readFileSync(path.join(rootDir, 'content', 'skin.css'), 'utf8');

// Keep html as a real selector: deleting the whole prefix creates an invalid
// leading comma in the html/body rule and can join unrelated selectors.
let userCssBody = rawSkinCss
  .replace(/(?:html\.kimino-dream-active\s+)?#kimino-companion-root[^}]*\{[^}]*\}/g, '')
  .replace(/html\.kimino-dream-active/g, 'html')
;

const userCssHeader = `/* ==UserStyle==
@name           Kimino Dream Skin · Google Gemini 暗夜星云磨砂
@namespace      github.com/Catstella/kimino-dream
@version        ${crManifest.version}
@description    Catstella 暗夜星云磨砂主题 · 纯 CSS 安全无注入版（适配 Stylus / xStyle / Cascadea）
@author         Catstella & Kimino
@preprocessor   default
@var text       customWallpaper "自定义壁纸图片直链 (可填图片URL，留空则为纯深色暗夜磨砂)" ""
==/UserStyle== */

@-moz-document domain("gemini.google.com") {

/* Stylus 纯 CSS 壁纸底板（利用 body::before 代替 JS 动态注入节点） */
body::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: -99999 !important;
  pointer-events: none !important;
  background-color: #211e2d !important;
  background-image: var(--customWallpaper, none) !important;
  background-size: cover !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
}

`;

const userCssFooter = `\n}\n`;
const userCssDest = path.join(distDir, 'kimino-dream.user.css');
fs.writeFileSync(userCssDest, userCssHeader + userCssBody + userCssFooter, 'utf8');
console.log('✅ Stylus UserCSS 生成成功:', userCssDest);

const sums = [zipDest, xpiDest].map(file =>
  `${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}`
);
fs.writeFileSync(checksumsPath, sums.join('\n') + '\n', 'ascii');

console.log('\n✨ 打包完毕！');
console.log(`📁 1. 火狐安装包 (.xpi): ${xpiDest}`);
console.log(`📁 2. 火狐调试解压目录: ${firefoxDir}`);
console.log(`📁 3. Edge/Chrome 解压安装目录: ${chromiumDir}`);
console.log(`📁 4. Stylus 单文件样式: ${userCssDest}`);
