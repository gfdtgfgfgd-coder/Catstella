const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { DEFAULT_SETTINGS } = require('../src/domain/settings.cjs');
const root = path.resolve(__dirname, '..');
const base = 'https://pet-controls.test';
const types = { '.html': 'text/html', '.css': 'text/css', '.cjs': 'text/javascript', '.js': 'text/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml' };

(async () => {
  const browser = await chromium.launch({ headless:true, channel:process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport:{width:410,height:650}, reducedMotion:'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(base + '/**', route => {
      const file = path.resolve(root, '.' + new URL(route.request().url()).pathname);
      const type = types[path.extname(file)];
      if (!file.startsWith(root + path.sep) || !type || !fs.existsSync(file)) return route.abort();
      return route.fulfill({ contentType:type, body:fs.readFileSync(file) });
    });
    await page.addInitScript((settings) => {
      const calls = window.calls = { gestures:[], drag:[], commands:[], animations:[] };
      const nativeAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = nativeAnimate.apply(this,args);
        calls.animations.push(animation);
        return animation;
      };
      const snapshot = { state:'idle', settings:{...settings, clickCatAction:'toggle', bubblePage:'talk'}, dialogue:{},
        ledger:{}, quotaWindows:{}, source:{} };
      const subscribers = [];
      window.setActivity = modelActivity => subscribers.forEach(handler => handler({ ...snapshot, modelActivity }));
      window.widgetApi = {
        get: async () => snapshot,
        ready() {}, save() {}, hit() {},
        subscribe: handler => subscribers.push(handler),
        onStep() {}, canChatter:async()=>false,
        command: action => calls.commands.push(action), pointer: action => calls.gestures.push(action),
        drag: (...values) => calls.drag.push(values),
        onReaction: handler => { window.react = handler; }
      };
    }, DEFAULT_SETTINGS);
    await page.goto(base + '/src/renderer/index.html');
    await page.locator('#mascot[data-art-ready=true]').waitFor();
    const box = await page.locator('#motion').boundingBox();
    const x = box.x + box.width / 2, y = box.y + 72;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 50, y - 35, {steps:5});
    await page.mouse.up();
    const drag = await page.evaluate(() => window.calls.drag);
    assert.deepEqual(drag[0], ['start']);
    assert.deepEqual(drag.at(-1), ['end', -50, -35]);
    assert.equal(await page.locator('#bubble').getAttribute('data-open'), 'false');
    assert.ok(!(await page.evaluate(() => window.calls.gestures)).includes('pet'));
    assert.ok(!(await page.evaluate(() => window.calls.gestures)).includes('head-pat'));
    await page.mouse.click(x, y);
    await page.locator('#bubble[data-open=true]').waitFor();
    assert.equal(await page.evaluate(() => calls.gestures.filter(action => action==='head-pat').length),1);
    assert.equal(await page.evaluate(() => calls.animations.filter(a=>a.id==='catstella-head-spark').length),1);
    await page.getByRole('button', {name:'刷新额度'}).click();
    await page.locator('#bubble-settings').click();
    assert.deepEqual(await page.evaluate(() => window.calls.commands), ['quota-refresh','settings']);
    assert.equal(await page.evaluate(() => window.calls.animations.filter(a=>a.id==='catstella-quota-success').length),0);
    await page.evaluate(() => window.react({source:'quota-refresh'}));
    assert.equal(await page.evaluate(() => window.calls.animations.filter(a=>a.id==='catstella-quota-success').length),1);
    await page.locator('#next').click();
    assert.equal(await page.locator('#title').innerText(), '喵言喵语');
    await page.evaluate(() => window.setActivity({ kind:'model-running', stepIndex:9 }));
    assert.match(await page.locator('#value').innerText(), /正在处理模型步骤 #9/);
    await page.evaluate(() => window.setActivity({ kind:'model-done', stepIndex:9, expiresAt:Date.now()+500 }));
    assert.match(await page.locator('#value').innerText(), /模型步骤 #9 完成/);
    await page.waitForFunction(() => !document.querySelector('#value').textContent.includes('#9'));
    assert.deepEqual(errors, []);
    console.log('PASS: desktop drag dispatch, no tap on drag, separate actions and confirmed-only motion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
