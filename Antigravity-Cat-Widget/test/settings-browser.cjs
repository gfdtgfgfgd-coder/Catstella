const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { DEFAULT_SETTINGS } = require('../src/domain/settings.cjs');
const renderer = process.env.CATSTELLA_SETTINGS_RENDERER || path.resolve(__dirname, '../src/renderer');
const base = 'https://catstella-settings.test';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 740, height: 660 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const types = { '.html': 'text/html', '.css': 'text/css', '.cjs': 'text/javascript', '.js': 'text/javascript' };
    await page.route(base + '/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (!Object.hasOwn(types, path.extname(file)) || file.includes('/')) return route.abort();
      return route.fulfill({ contentType: types[path.extname(file)] + '; charset=utf-8', body: fs.readFileSync(path.join(renderer, file)) });
    });
    await page.addInitScript(defaults => {
      const preview = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#9e79cf"/></svg>');
      const model = {
        settings: { ...defaults, syncCharacter: true, syncWallpaper: true },
        dreamSkin: { enabled: true, wallpaperId: 'old', wallpaperFile: 'D:/art/new.jpg' },
        webCompanion: { online: false },
        source: { online: false },
        characterPacks: [
          { id: 'gemini-star-v1', name: '星语', preview },
          { id: 'lin-cat', name: '霓音', preview }
        ],
        wallpapers: [
          { id: 'old', title: '旧壁纸', filePath: 'D:/art/old.jpg', preview },
          { id: 'new', title: '当前壁纸', filePath: 'D:/art/new.jpg', preview }
        ]
      };
      let listener;
      window.publish = patch => {
        Object.assign(model, patch);
        listener?.(structuredClone(model));
      };
      window.commands = [];
      window.widgetApi = {
        get: async () => structuredClone(model),
        subscribe: callback => { listener = callback; },
        command: () => {},
        save: async ({ dreamSkin, ...settings }) => {
          window.commands.push({ dreamSkin, ...settings });
          await new Promise(resolve => setTimeout(resolve, 45));
          if (window.rejectSave) throw new Error('fixture failed save');
          Object.assign(model.settings, settings);
          if (dreamSkin) Object.assign(model.dreamSkin, dreamSkin);
          window.publish({});
          return structuredClone(model);
        }
      };
    }, DEFAULT_SETTINGS);
    await page.goto(base + '/settings.html');
    await page.getByRole('heading', { name: '常用设置' }).waitFor();
    await page.locator('.nav-item[data-page=pet]').click();
    await page.getByText('当前桌面：星语').waitFor();
    assert.match(await page.locator('#desktop-character-mode').innerText(), /同步待连接/);
    const current = page.locator('#character-gallery [aria-pressed=true]');
    await current.focus();
    await page.evaluate(() => {
      window.oldTile = document.querySelector('#character-gallery [aria-pressed=true]');
      window.publish({ webCompanion: { online: true } });
      window.publish({ webCompanion: { online: true } });
    });
    assert.ok(await page.evaluate(() => window.oldTile === document.activeElement && window.oldTile.isConnected));
    const syncPet = page.getByRole('checkbox', { name: '同步桌宠形象到网页' });
    await syncPet.evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => window.commands.length === 2);
    assert.deepEqual(await page.evaluate(() => window.commands.map(value => value.syncCharacter)), [false, true]);
    assert.match(await page.locator('#desktop-character-mode').innerText(), /网页的独立选择会保留/);
    await page.waitForTimeout(70);
    assert.equal(await syncPet.isChecked(), true);
    await page.evaluate(() => { window.rejectSave = true; });
    await syncPet.uncheck();
    await page.getByText('保存失败，请重试').waitFor();
    assert.equal(await syncPet.isChecked(), true, 'failure restores the real preference even while the input has focus');
    await page.evaluate(() => { window.rejectSave = false; });
    await page.locator('.nav-item[data-page=wallpaper]').click();
    await page.getByText('当前桌面：当前壁纸').waitFor();
    assert.match(await page.locator('#wallpaper-gallery [aria-pressed=true]').innerText(), /当前壁纸/);
    await page.getByRole('checkbox', { name: '同步壁纸到网页' }).uncheck();
    await page.getByText('独立设置 · 网页使用自己的选择').last().waitFor();
    await page.getByText('当前桌面：当前壁纸').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('#wallpaper-gallery img')].every(img => img.complete && img.naturalWidth > 0));
    assert.deepEqual(errors, []);
    console.log('Desktop settings: visible selection, previews, offline controls, repeat events, fast changes and save failure passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
