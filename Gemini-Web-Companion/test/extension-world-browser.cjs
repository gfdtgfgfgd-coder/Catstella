const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const scratch = fs.mkdtempSync(path.join(root, 'dist/extension-world-'));
const unpacked = path.join(scratch, 'extension');
fs.mkdirSync(unpacked);
for (const name of ['content', 'online', 'popup', 'assets', 'background.js']) {
  fs.cpSync(path.join(root, name), path.join(unpacked, name), { recursive: true });
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
delete manifest.browser_specific_settings;
// Gemini fixture only. Do not poll a real desktop installation or GitHub.
manifest.host_permissions = ['*://gemini.google.com/*'];
fs.writeFileSync(path.join(unpacked, 'manifest.json'), JSON.stringify(manifest));
const background = path.join(unpacked, 'background.js');
const sampleTheme = JSON.stringify({schema:1,palette:'ocean',opacity:75});
const sampleCatalog = JSON.stringify({schema:1,items:[{id:'fixture-theme',kind:'theme',path:'themes/fixture-theme.json',
  name:'浮窗测试主题',credit:'测试素材',size:Buffer.byteLength(sampleTheme),sha256:createHash('sha256').update(sampleTheme).digest('hex'),
  updatedAt:'2026-11-07'}]});
fs.writeFileSync(background, fs.readFileSync(background, 'utf8')
  .replace('const online = globalThis.CatstellaOnline?.create({', `const online = globalThis.CatstellaOnline?.create({
    fetcher: async url => new Response(url.endsWith('/catalog.json') ? ${JSON.stringify(sampleCatalog)} : ${JSON.stringify(sampleTheme)}),`)
  .replace('let preferredPort = 3921;', 'let preferredPort = 1;')
  .replace('const BRIDGE_PORTS = [3921, 3922, 3923];', 'const BRIDGE_PORTS = [1];')
  .replace('let nextAutoCheck = 0;', 'let nextAutoCheck = Infinity;'));

const home = '<!doctype html><html lang="zh-CN"><title>Gemini fixture</title><main>' +
  '<chat-window><div class="welcome-grow-container">' +
  '<div class="aurora-outer-container"><div class="aurora-bg" id="decoration"></div>' +
  '<div class="aurora"><div class="gradient-strip"><button id="chat">对话</button><button id="task">任务</button></div></div></div>' +
  '<input-container><input-area-v2><textarea aria-label="输入内容"></textarea></input-area-v2></input-container>' +
  '<div class="gradient-strip" id="decorative-strip"></div></div></chat-window></main></html>';

(async () => {
  const context = await chromium.launchPersistentContext(path.join(scratch, 'profile'), {
    channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge-beta',
    headless: true,
    viewport: { width: 1200, height: 820 },
    args: ['--disable-extensions-except=' + unpacked, '--load-extension=' + unpacked]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    await worker.evaluate(() => chrome.storage.local.set({ quotaView: 'compact', skinStyle: 'glass', bubbleVisible: true,autoUpdateCheck:false }));
    await context.route('https://gemini.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: home,
      headers:{'Content-Security-Policy':"frame-src 'none'; connect-src 'self'; style-src 'self' 'unsafe-inline'"} }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://gemini.google.com/app');
    const compact = page.locator('.catstella-usage-viewer');
    const classic = page.locator('.kg-quota-legacy');
    await compact.getByText('Gemini 网页').waitFor();
    assert.equal(await classic.isHidden(), true, 'persisted compact mode starts inside the extension isolated world');

    await page.locator('.btn-open-settings').click();
    const style = page.getByLabel('额度显示样式');
    assert.equal(await style.inputValue(), 'compact');
    await style.selectOption('classic');
    await compact.waitFor({ state: 'detached' });
    assert.equal(await classic.evaluate(el => el.hidden), false);
    await style.selectOption('compact');
    await compact.getByText('Gemini 网页').waitFor({ state: 'attached' });
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('quotaView')).quotaView), 'compact');
    await page.reload();
    await compact.getByText('Gemini 网页').waitFor();
    await page.locator('.btn-open-settings').click();
    const pageCount = context.pages().length;
    await page.locator('.kg-online-notice').filter({hasText:'查看更新'}).click();
    const store = page.getByRole('dialog',{name:'在线内容商店',exact:true});
    await store.getByRole('button',{name:'预览 浮窗测试主题'}).click();
    const detail = page.getByRole('dialog',{name:'浮窗测试主题',exact:true});
    await detail.getByText('壁纸不透明度 75%').waitFor();
    assert.equal(await store.locator('.hub-grid').evaluate(grid => getComputedStyle(grid).display),'grid');
    assert.equal(await store.getByRole('button',{name:'最近更新'}).getAttribute('aria-pressed'),'true');
    await detail.getByRole('button',{name:'应用配色'}).click();
    await detail.getByText('已应用 浮窗测试主题').waitFor();
    await page.keyboard.press('Escape');
    await detail.waitFor({state:'hidden'});
    assert.equal(await store.isVisible(),true,'Escape closes the preview before its parent store');
    await page.keyboard.press('Escape');
    await store.waitFor({state:'hidden'});
    assert.equal(context.pages().length,pageCount,'the store remains in the Gemini page');
    await page.locator('.kimino-settings').waitFor();
    assert.equal(await page.locator('.kg-online-notice').isVisible(),false);
    await page.keyboard.press('Escape');

    await page.locator('html.kimino-dream-active').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#decoration').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('#decorative-strip').evaluate(el => getComputedStyle(el).display), 'none');
    for (const [id, name] of [['task','任务'], ['chat','对话']]) {
      const control = page.locator('#' + id);
      assert.equal(await control.isVisible(), true, await control.evaluate(el => {
        const chain = [];
        for (let node = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          chain.push([node.tagName, node.className, style.display, style.visibility, style.pointerEvents]);
        }
        return JSON.stringify(chain);
      }));
      await control.evaluate(el => el.addEventListener('click', () => el.setAttribute('aria-pressed', 'true')));
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(await control.getAttribute('aria-pressed'), 'true');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: real isolated-world extension, in-page store, nested Escape, quota switch and native composer controls.');
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
