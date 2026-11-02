// 星语喵伴 · 多平台扩展打包脚本 (Firefox .xpi & Edge/Chrome .zip)
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const firefoxDir = path.join(distDir, 'firefox');
const chromiumDir = path.join(distDir, 'chromium');

console.log('🚀 开始打包 Gemini Web Companion (星语喵伴)...');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

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

const itemsToCopy = [
  'manifest.json',
  'background.js',
  'content',
  'popup',
  'assets'
];

// 1. 构建 Chromium (Edge / Chrome) 版本
console.log('📦 构建 Chromium (Edge / Chrome) 专版...');
if (fs.existsSync(chromiumDir)) fs.rmSync(chromiumDir, { recursive: true, force: true });
fs.mkdirSync(chromiumDir, { recursive: true });
for (const item of itemsToCopy) {
  copyRecursive(path.join(rootDir, item), path.join(chromiumDir, item));
}

const crManifestPath = path.join(chromiumDir, 'manifest.json');
const crManifest = JSON.parse(fs.readFileSync(crManifestPath, 'utf8'));
crManifest.background = {
  service_worker: "background.js"
};
fs.writeFileSync(crManifestPath, JSON.stringify(crManifest, null, 2), 'utf8');

// 2. 构建 Firefox 专版
console.log('🦊 构建 Firefox (火狐) 专版...');
if (fs.existsSync(firefoxDir)) fs.rmSync(firefoxDir, { recursive: true, force: true });
fs.mkdirSync(firefoxDir, { recursive: true });
for (const item of itemsToCopy) {
  copyRecursive(path.join(rootDir, item), path.join(firefoxDir, item));
}

const ffManifestPath = path.join(firefoxDir, 'manifest.json');
const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, 'utf8'));
ffManifest.background = {
  scripts: ["background.js"]
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

// 3. 压缩打包
console.log('🗜️ 正在压缩生成 Firefox .xpi...');
const xpiDest = path.join(distDir, 'kimino-gemini-companion.xpi');
const ffZipTemp = path.join(distDir, 'firefox-temp.zip');
if (fs.existsSync(xpiDest)) fs.unlinkSync(xpiDest);
if (fs.existsSync(ffZipTemp)) fs.unlinkSync(ffZipTemp);

try {
  const psCmd = `Compress-Archive -Path "${firefoxDir}\\*" -DestinationPath "${ffZipTemp}" -Force`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });
  fs.renameSync(ffZipTemp, xpiDest);
  console.log('✅ Firefox .xpi 生成成功:', xpiDest);
} catch (e) {
  console.error('打包 .xpi 失败:', e);
}

console.log('🗜️ 正在压缩生成 Edge/Chrome .zip...');
const zipDest = path.join(distDir, 'kimino-gemini-companion-edge-chrome.zip');
if (fs.existsSync(zipDest)) fs.unlinkSync(zipDest);

try {
  const psCmdZip = `Compress-Archive -Path "${chromiumDir}\\*" -DestinationPath "${zipDest}" -Force`;
  execSync(`powershell -NoProfile -Command "${psCmdZip}"`, { stdio: 'inherit' });
  console.log('✅ Edge/Chrome .zip 生成成功:', zipDest);
} catch (e) {
  console.error('打包 .zip 失败:', e);
}

console.log('\n✨ 打包完毕！');
console.log(`📁 1. 火狐安装包 (.xpi): ${xpiDest}`);
console.log(`📁 2. 火狐调试解压目录: ${firefoxDir}`);
console.log(`📁 3. Edge/Chrome 解压安装目录: ${chromiumDir}`);
