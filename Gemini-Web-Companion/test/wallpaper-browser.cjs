const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = path.join(root, process.argv.includes('--built') ? 'dist/chromium/content' : 'content');
const svg = color => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/></svg>`);

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<div id="source" style="position:fixed;width:320px;height:180px"></div><div id="mirror" style="position:fixed;top:200px;width:320px;height:180px"></div>');
    await page.addStyleTag({ path: path.join(source, 'skin.css') });
    await page.addScriptTag({ path: path.join(source, 'wallpaper.js') });
    await page.evaluate(async urls => {
      window.urls = urls;
      const source = document.querySelector('#source'), mirror = document.querySelector('#mirror');
      window.controller = new window.KiminoWallpaper(source, () => window.KiminoWallpaper.mirror(source, mirror));
      await window.controller.setSource(urls[0]);
      await window.controller.setSource(urls[1]);
    }, [svg('#8048c8'), svg('#258f9f'), svg('#ad556e'), svg('#405a9d')]);
    await page.evaluate(() => document.querySelector('#source').__kgWallpaperStage.animation.ready);
    await page.waitForTimeout(180);
    const phase = await page.evaluate(() => {
      const source = document.querySelector('#source'), mirror = document.querySelector('#mirror');
      return { source: Number(getComputedStyle(source.firstChild).opacity), mirror: Number(getComputedStyle(mirror.firstChild).opacity), duration: source.__kgWallpaperStage.animation.effect.getTiming().duration, time: source.__kgWallpaperStage.animation.currentTime, state: source.__kgWallpaperStage.animation.playState };
    });
    assert.equal(phase.duration, 1300);
    assert.ok(phase.source > 0 && phase.source < 1, 'must blend rather than instant-replace: ' + JSON.stringify(phase));
    assert.ok(Math.abs(phase.source - phase.mirror) < .02, 'fixed fade replica must share the animation phase');
    await page.evaluate(async () => { await window.controller.setSource(window.urls[2]); await window.controller.setSource(window.urls[3]); });
    await page.waitForTimeout(2700);
    assert.equal(await page.evaluate(() => window.controller.current), await page.evaluate(() => window.urls[3]));
    assert.equal(await page.locator('.kimino-wallpaper-incoming').count(), 0);
    await page.evaluate(async () => { await window.controller.setSource(window.urls[0], 'none'); });
    assert.equal(await page.locator('.kimino-wallpaper-incoming').count(), 0);
    assert.equal(await page.evaluate(() => window.controller.current), await page.evaluate(() => window.urls[0]));
    const success = await page.evaluate(() => window.controller.setSource('data:image/png;base64,broken', 'fade'));
    assert.equal(success, false);
    assert.equal(await page.evaluate(() => window.controller.current), await page.evaluate(() => window.urls[0]), 'failed decode must retain the previous image');

    const gallery = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const image = svg('#9159b8');
    await gallery.route('https://gallery.test/**', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self' data:; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" }, body: '<html><body></body></html>' }));
    await gallery.goto('https://gallery.test/app/fixture');
    await gallery.evaluate(image => {
      window.handlers = [];
      window.listCalls = 0;
      window.state = { enabled: true, bubbleVisible: true, syncWallpaper: true, syncCharacter: true, petDisplayMode: 'both', agyBridgeState: { online: true, port: 3921, desktop: { wallpaperId: 'one', characterPack: 'gemini-star-v1' } } };
      window.storageWrites = [];
      window.KIMINO_API = {
        getURL: path => path.endsWith('manifest.json') ? '/manifest.json' : image,
        storageGet: async () => window.state,
        storageSet: async value => { window.storageWrites.push(value); return true; },
        onChanged: callback => window.handlers.push(callback),
        sendMessage: async message => {
          if (message.type === 'KG_GET_DESKTOP_WALLPAPERS') {
            const call = ++window.listCalls;
            await new Promise(resolve => setTimeout(resolve, call === 1 ? 180 : 15));
            return { ok: true, wallpapers: ['one', 'two', 'three', 'four'].map(id => ({ id, title: id, revision: id + ':1' })) };
          }
          if (message.type === 'KG_GET_WALLPAPER_PREVIEW') return { ok: true, dataUrl: image };
          return null;
        }
      };
    }, image);
    await gallery.addScriptTag({ path: path.join(source, 'ambient.js') });
    await gallery.addScriptTag({ path: path.join(source, 'pet-behavior.js') });
    await gallery.addScriptTag({ path: path.join(source, 'widget.js') });
    await gallery.waitForFunction(() => {
      const host = document.getElementById('kimino-companion-root');
      return host?.shadowRoot?.querySelector('.kimino-wrapper')?.dataset.ready === 'true';
    });
    await gallery.locator('.btn-open-settings').click();
    await gallery.waitForFunction(() => {
      const host = document.getElementById('kimino-companion-root');
      return getComputedStyle(host.shadowRoot.querySelector('.kimino-settings')).display === 'block';
    });
    await gallery.locator('.kg-tab-btn[data-tab="wallpaper"]').click();
    await gallery.evaluate(() => window.handlers.forEach(fn => fn({ agyBridgeState: { newValue: window.state.agyBridgeState } }, 'local')));
    await gallery.waitForTimeout(450);
    assert.equal(await gallery.locator('.kg-wallpaper-grid .kg-thumb').count(), 4, 'overlapping settings refreshes must not append duplicate cards');
    assert.equal(await gallery.locator('.kg-wallpaper-grid img').evaluateAll(images => images.filter(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:')).length), 4, 'desktop previews must decode under a page CSP that blocks localhost images');
    await gallery.screenshot({ path: path.resolve(root, '../evidence/wallpaper-gallery.png') });
    const worker = await browser.newPage();
    await worker.setContent('<html><body></body></html>');
    await worker.evaluate(base64 => {
      window.browser = { runtime: {} };
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      window.fetch = async () => new Response(bytes, { headers: { 'content-type': 'image/png' } });
    }, fs.readFileSync(path.join(root, 'assets/icons/icon-128.png')).toString('base64'));
    await worker.addScriptTag({ content: fs.readFileSync(path.join(root, process.argv.includes('--built') ? 'dist/chromium/background.js' : 'background.js'), 'utf8').split('async function syncDesktopWallpaperIfNeeded')[0] + '\nwindow.getPreview = wallpaperPreview;' });
    const raster = await worker.evaluate(async () => {
      const uri = await window.getPreview('fixture', '1');
      const image = new Image(); image.src = uri; await image.decode();
      return { jpeg: uri.startsWith('data:image/jpeg;base64,'), width: image.naturalWidth, height: image.naturalHeight };
    });
    assert.equal(raster.jpeg, true);
    assert.ok(raster.width > 0 && raster.width <= 320 && raster.height > 0 && raster.height <= 180);
    assert.deepEqual(errors, []);
    console.log('PASS: 1.3s wallpaper blend, shared fade phase, rapid changes, no-transition/decode fallback, CSP-safe thumbnails, native JPEG conversion, no duplicate cards.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
