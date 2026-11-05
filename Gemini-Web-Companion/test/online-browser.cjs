const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, process.argv.includes('--built') ? '../dist/chromium' : '..');
const base = 'https://online-fixture.test';
const assetBase = 'https://raw.githubusercontent.com/lynnfei/Catstella/main/online-assets/';
const wall = fs.readFileSync(path.join(root, 'assets/icons/icon-128.png'));
const theme = Buffer.from(JSON.stringify({ schema: 1, palette: 'ocean', opacity: 75 }));
const character = Buffer.from(JSON.stringify({ schema: 1, frames: { idle: 'data:image/png;base64,' + wall.toString('base64') } }));
const record = (kind, id, ext, bytes, name) => ({ id, kind, name, credit: '测试素材',
  path: `${kind}s/${id}.${ext}`, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
const catalog = { schema: 1, items: [record('wallpaper', 'sample', 'png', wall, '示例壁纸'),
  record('theme', 'night', 'json', theme, '示例主题')],
  characters: [record('character', 'sample-cat', 'json', character, '示例桌宠')] };
const fixture = `
  window.store = { syncWallpaper: true, wallpaperId: 'old' };
  window.openedTabs = [];
  window.chrome = {
    runtime: {
      id: 'catstella', getURL: p => location.origin + '/' + p,
      getManifest: () => ({version: '1.5.0'}),
      onInstalled: { addListener() {} }, onStartup: { addListener() {} },
      onMessage: { addListener(listener) { window.receiver = listener; } },
      sendMessage(msg, respond) { window.receiver(msg, {url: location.href, id: 'catstella'}, respond); }
    },
    storage: { local: {
      get(keys, cb) { queueMicrotask(() => cb(structuredClone(store))); },
      set(value, cb) { Object.assign(store, value); queueMicrotask(cb); }
    } },
    tabs: { create: async value => openedTabs.push(value) },
    action: { setBadgeText: ({text}) => window.badge = text }
  };
`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fulfill = (route, body, contentType) => route.fulfill({ body, contentType, headers: { 'access-control-allow-origin': '*' } });
    let bridgeUp = false, desktopSyncWallpaper = true;
    await page.route('http://127.0.0.1:*/**', route => {
      if (!bridgeUp) return route.abort();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-private-network': 'true' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const syncWallpaper = route.request().postDataJSON()?.patch?.syncWallpaper;
      if (typeof syncWallpaper === 'boolean') desktopSyncWallpaper = syncWallpaper;
      return route.fulfill({ json: { ok: true, desktop: {}, sync: { syncWallpaper: desktopSyncWallpaper } }, headers });
    });
    await page.route(base + '/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (name === 'fixture.js') return fulfill(route, fixture, 'text/javascript');
      const data = fs.readFileSync(path.join(root, name));
      if (name === 'online/index.html') return fulfill(route, data.toString().replace(
        '<script src="../content/shim.js">',
        '<script src="/fixture.js"></script><script src="/online/client.js"></script><script src="/background.js"></script><script src="../content/shim.js">'), 'text/html; charset=utf-8');
      return fulfill(route, data, name.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8');
    });
    let updateRequests = 0;
    await page.route('https://api.github.com/repos/lynnfei/Catstella/releases**', route => {
      updateRequests++;
      return fulfill(route, JSON.stringify([
        { draft: false, prerelease: false, tag_name: 'desktop-v9.0.0', assets: [{ state: 'uploaded', name: 'Catstella-Setup-9.0.0-x64.exe' }] },
        { draft: false, prerelease: false, tag_name: 'web-v1.5.1', assets: [{ state: 'uploaded', name: 'kimino-gemini-companion.xpi' }] }
      ]), 'application/json');
    });
    let corrupt = false, disconnected = false;
    await page.route(assetBase + '**', route => {
      const file = route.request().url().slice(assetBase.length);
      if (file === 'catalog.json') return disconnected ? route.abort() : fulfill(route, JSON.stringify(catalog), 'application/json');
      if (file === 'themes/night.json') return fulfill(route, theme, 'application/json');
      if (file === 'characters/sample-cat.json') return fulfill(route, character, 'application/json');
      return fulfill(route, corrupt ? Buffer.alloc(wall.length) : wall, 'image/png');
    });
    await page.goto(base + '/online/index.html');
    await page.getByText(/发现新版本 1.5.1/).waitFor();
    assert.equal(await page.evaluate(() => window.badge), 'NEW');
    await page.getByRole('button', { name: '查看发行页' }).click();
    await page.waitForFunction(() => openedTabs.length === 1);
    assert.match(await page.evaluate(() => openedTabs[0].url), /\/web-v1\.5\.1$/);
    assert.equal(updateRequests, 1);
    await page.getByText(/发现可安装的在线素材/).waitFor();
    await page.getByRole('button', { name: '浏览在线配色' }).click();
    await page.getByRole('button', { name: '下载并应用配色' }).click();
    await page.getByText('已应用「示例主题」。').waitFor();
    assert.deepEqual(await page.evaluate(() => [store.onlinePalette, store.wallpaperOpacity, store.wallpaperId]), ['ocean', .75, 'old']);
    await page.getByRole('button', { name: '安装 示例桌宠' }).click();
    await page.getByText('「示例桌宠」已加入本地图库。').waitFor();
    assert.ok(await page.evaluate(() => store.onlineCharacterPacks['online-sample-cat'].frames.idle));
    await page.getByRole('button', { name: '安装 示例壁纸' }).click();
    await page.getByText('「示例壁纸」已加入本地图库。').waitFor();
    const saved = await page.evaluate(async () => {
      const asset = store.customWallpapers[0];
      const img = new Image();
      img.src = asset.dataUrl;
      await img.decode();
      return { id: store.wallpaperId, sync: store.syncWallpaper, width: img.naturalWidth, url: asset.dataUrl };
    });
    assert.deepEqual([saved.id, saved.sync, saved.width], ['old', true, 128]);
    await page.evaluate(async () => {
      await window.KIMINO_API.storageSet({ wallpaperId: 'custom:online-sample' });
      await window.KIMINO_API.sendMessage({ type: 'KG_BRIDGE_PATCH', patch: { syncWallpaper: false } });
    });
    assert.equal(await page.evaluate(() => store.pendingOnlineWallpaper), true);
    bridgeUp = true;
    await page.evaluate(async () => {
      const ping = () => window.KIMINO_API.sendMessage({ type: 'KG_TAB_HEARTBEAT', active: true });
      await ping();
      await ping();
    });
    await page.waitForFunction(() => store.pendingOnlineWallpaper === false);
    assert.equal(desktopSyncWallpaper, false, 'the first successful sync must keep the new Web wallpaper independent');
    assert.equal(await page.evaluate(() => store.syncWallpaper), false);
    corrupt = true;
    assert.equal(await page.evaluate(async () => (await window.KIMINO_API.sendMessage({ type: 'KG_ONLINE', action: 'download', value: 'sample' })).ok), false);
    assert.equal(await page.evaluate(() => store.customWallpapers[0].dataUrl), saved.url);
    disconnected = true;
    await page.locator('#online-wallpapers').getByRole('button', { name: '刷新' }).click();
    await page.getByText(/无法连接 GitHub/).waitFor();
    await page.getByRole('checkbox', { name: '自动检查更新' }).uncheck();
    await page.getByText(/自动检查已关闭/).waitFor();
    assert.equal(await page.evaluate(() => window.badge), '');
    assert.equal(await page.evaluate(() => receiver({ type: 'KG_ONLINE', action: 'install', value: 'sample' },
      { url: 'https://gemini.google.com/app', id: 'catstella' }, () => {})), undefined);
    assert.deepEqual(errors, []);
    console.log('Online browser: release channel, update badge, theme, wallpaper, failed download and sender restrictions passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
