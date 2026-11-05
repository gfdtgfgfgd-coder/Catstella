// Isolated browser regression/performance fixture. No login, network, or model requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const source = baseline ? path.resolve(root, '../evidence/web-skin-before') :
  path.join(root, process.argv.includes('--built') ? 'dist/chromium/content' : 'content');
const out = path.resolve(root, '../evidence');
fs.mkdirSync(out, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://skin.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body></body></html>' }));
    await page.goto('https://skin.test/app/test');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `body{margin:0;background:#151515;color:white;font:16px Arial}bard-sidenav{position:fixed;width:240px;height:100vh;left:0;top:0}main{margin-left:240px}infinite-scroller.chat-history{display:block;height:690px;overflow:auto;padding:20px}user-query{display:block;width:720px;max-width:100%;margin:0 auto}.user-query-bubble-with-background{display:block;padding:16px}.query-text{overflow:hidden;height:80px}.luminous-toggle-container{display:flex;justify-content:end}model-response{display:block}input-container{position:fixed;bottom:20px;left:320px;width:720px}input-area-v2{display:block;padding:20px}rich-textarea{display:block;min-height:48px}pre{white-space:pre-wrap}pre::before{content:'code';background:rgb(100,50,70)}.file-preview-container{display:inline-block}img{width:80px;height:80px}.gradient-art{background-image:linear-gradient(red,blue)}`;
      document.head.append(style);
      const nativeToggleStyle = document.createElement('style');
      nativeToggleStyle.textContent = `
        .luminous-toggle-button{display:inline-flex;align-items:center;min-width:52px;height:32px;padding:2px 12px;border:1px solid #444;border-radius:999px;gap:4px;font-size:14px;line-height:20px;background:#222;outline:2px solid transparent}
        .luminous-toggle-button:focus-visible{outline-color:rgb(150,120,220)}
        .luminous-toggle-container::before,.luminous-toggle-button::after{content:'';position:absolute;width:30px;height:16px;background:linear-gradient(to right,#000,transparent);box-shadow:0 0 12px black}
        .luminous-edge-left{background:linear-gradient(to right,#000,transparent)}
        .luminous-edge-right{background:linear-gradient(to left,#000,transparent)}
        .host-text-toggle{padding:6px 18px;border:1px solid #555;border-radius:12px;height:34px;font:14px/20px Arial;display:inline-flex;background:#222}
      `;
      document.head.append(nativeToggleStyle);
      const nav = document.createElement('bard-sidenav');
      nav.innerHTML = '<button class="expand-menu">展开侧栏</button><aside aria-label="Notifications">notice</aside>';
      const main = document.createElement('main');
      const scroller = document.createElement('infinite-scroller');
      scroller.className = 'chat-history';
      const makeTurn = index => {
        const turn = document.createElement('div');
        turn.className = 'conversation-container';
        turn.innerHTML = `<user-query><div class="user-query-container"><user-query-content><span class="user-query-bubble-with-background"><div class="query-text">${'Long query content. '.repeat(120)}</div><div class="luminous-toggle-container"><button class="luminous-toggle-button" aria-label="展开"><mat-icon>expand_more</mat-icon></button></div></span></user-query-content></div></user-query><model-response><response-container><details class="thought-container"><summary>Thinking</summary><div class="thought-content">thought</div></details><message-content>${Array.from({length:20}, (_, j) => `<p>Reply ${index}/${j} ${'content '.repeat(30)}</p>`).join('')}<pre><code>const answer = 42;</code></pre><div class="gradient-art">protected decoration</div></message-content><response-footer><button>Copy</button></response-footer></response-container></model-response>`;
        return turn;
      };
      for (let i = 0; i < 60; i++) scroller.append(makeTurn(i));
      const firstToggle = scroller.querySelector('.luminous-toggle-button');
      firstToggle.classList.add('icon-button'); // Must not be provisionally treated as a copy/edit control.
      firstToggle.insertAdjacentHTML('afterbegin', '<span class="luminous-edge-left"></span>');
      firstToggle.insertAdjacentHTML('beforeend', '<span class="luminous-edge-right"></span>');
      const textToggle = document.createElement('button');
      textToggle.className = 'host-text-toggle';
      textToggle.textContent = 'Show more';
      scroller.querySelector('details summary').append(textToggle);
      scroller.querySelectorAll('model-response')[1].style.maxWidth = '680px';
      main.append(scroller);
      const composer = document.createElement('input-container');
      composer.innerHTML = '<input-area-v2><div class="text-input-field"><rich-textarea><div class="ql-editor" contenteditable="true">composer</div></rich-textarea></div><uploader-file-preview><div class="file-preview-container"><gem-media-attachment><mat-basic-chip><img class="gem-attachment-style-img" src="data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\"/%3E"><button aria-label="Remove file">×</button></mat-basic-chip></gem-media-attachment></div></uploader-file-preview></input-area-v2>';
      composer.querySelector('img').src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dfadf3"/></svg>');
      document.body.append(nav, main, composer);
      const quote = document.createElement('div');
      quote.className = 'quote-container';
      quote.innerHTML = '<span class="quoted-text">selected text</span><button aria-label="Close quote">×</button>';
      composer.querySelector('input-area-v2').append(quote);
      window.settings = { skinEnabled: true };
      window.KIMINO_API = { getURL: () => 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221365%22 height=%22900%22%3E%3Crect width=%221365%22 height=%22900%22 fill=%22%23545387%22/%3E%3C/svg%3E', storageGet: async () => window.settings, onChanged: fn => { window.changeSkin = enabled => { window.settings.skinEnabled = enabled; fn({ skinEnabled: { newValue: enabled } }, 'local'); }; } };
      window.styleReads = 0;
      const getStyle = window.getComputedStyle;
      window.readStyle = getStyle.bind(window);
      window.toggleGeometry = button => {
        const cs = window.readStyle(button);
        return Object.fromEntries(['width', 'height', 'minWidth', 'maxWidth', 'borderRadius', 'padding', 'margin', 'display', 'gap', 'fontSize', 'lineHeight'].map(key => [key, cs[key]]));
      };
      window.nativeToggleGeometry = window.toggleGeometry(firstToggle);
      window.nativeTextToggleGeometry = window.toggleGeometry(textToggle);
      window.getComputedStyle = (...args) => { window.styleReads++; return getStyle(...args); };
      window.makeTurn = makeTurn;
      document.addEventListener('click', e => {
        const button = e.target.closest('.luminous-toggle-button');
        if (!button) return;
        const bubble = button.closest('.user-query-bubble-with-background');
        const copy = bubble.cloneNode(true);
        // Angular recreates the surface; extension-owned metadata is not copied.
        for (const el of [copy, ...copy.querySelectorAll('*')]) { el.removeAttribute('data-kg'); el.removeAttribute('data-kg-expand-btn'); el.removeAttribute('data-kg-icon-only'); el.removeAttribute('style'); }
        bubble.replaceWith(copy);
        const text = copy.querySelector('.query-text');
        const expanded = copy.dataset.expanded !== 'true';
        copy.dataset.expanded = String(expanded);
        text.animate([{height: expanded ? '80px' : '280px'}, {height: expanded ? '280px' : '80px'}], {duration:320, fill:'forwards'});
        const start = performance.now();
        const tick = () => { text.getBoundingClientRect(); if (performance.now() - start < 340) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
    });
    const skinStyle = await page.addStyleTag({ path: path.join(source, 'skin.css') });
    if (!baseline) {
      const styleAudit = await skinStyle.evaluate(node => {
        const rules = [...node.sheet.cssRules];
        const selectors = new Map();
        for (const rule of rules) {
          if (!rule.selectorText) continue;
          let depth = 0, start = 0;
          const value = rule.selectorText + ',';
          for (let i = 0; i < value.length; i++) {
            if (value[i] === '(' || value[i] === '[') depth++;
            else if (value[i] === ')' || value[i] === ']') depth--;
            else if (value[i] === ',' && depth === 0) {
              const selector = value.slice(start, i).trim();
              selectors.set(selector, (selectors.get(selector) || 0) + 1);
              start = i + 1;
            }
          }
        }
        return { parsedRules: rules.length, sourceRules: (node.textContent.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length, duplicateSelectors: [...selectors].filter(([, count]) => count > 1) };
      });
      fs.writeFileSync(path.join(out, 'skin-style-audit.json'), JSON.stringify(styleAudit, null, 2));
      assert.equal(styleAudit.parsedRules, styleAudit.sourceRules, 'browser must not silently drop invalid CSS rules');
      assert.deepEqual(styleAudit.duplicateSelectors, [], 'each exact skin selector must have one definition');
    }
    await page.evaluate(() => {
      document.documentElement.classList.add('kimino-dream-active');
      window.readSurfaces = () => ['.user-query-bubble-with-background', 'model-response', 'details.thought-container', 'input-area-v2'].map(selector => {
        const cs = window.readStyle(document.querySelector(selector));
        return Object.fromEntries(['backgroundColor', 'backgroundImage', 'borderRadius', 'borderColor', 'padding', 'display', 'backdropFilter', 'boxShadow'].map(key => [key, cs[key]]));
      });
      window.unmarkedSurfaces = window.readSurfaces();
    });
    if (fs.existsSync(path.join(source, 'wallpaper.js'))) await page.addScriptTag({ path: path.join(source, 'wallpaper.js') });
    if (fs.existsSync(path.join(source, 'fade.js'))) await page.addScriptTag({ path: path.join(source, 'fade.js') });
    await page.addScriptTag({ path: path.join(source, 'skin.js') });
    await page.waitForTimeout(1200);
    if (!baseline) assert.deepEqual(await page.evaluate(() => window.readSurfaces()), await page.evaluate(() => window.unmarkedSurfaces), 'annotation must not change native surface appearance');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = await metric();
    const samples = await page.evaluate(async () => {
      const result = { maxFrameMs: 0, blurChanges: 0, disabledFrames: 0, samples: 0, toggleGeometryChanges: 0, toggleShadowFrames: 0 };
      let last = performance.now();
      window.styleReads = 0;
      const start = last;
      const sample = now => {
        result.maxFrameMs = Math.max(result.maxFrameMs, now - last); last = now;
        const bubble = document.querySelector('.user-query-bubble-with-background');
        const toggle = document.querySelector('.luminous-toggle-button');
        if (JSON.stringify(window.toggleGeometry(toggle)) !== JSON.stringify(window.nativeToggleGeometry)) result.toggleGeometryChanges++;
        const chrome = [toggle.parentElement, toggle, ...toggle.querySelectorAll('.luminous-edge-left, .luminous-edge-right')];
        if (chrome.some(el => [null, '::before', '::after'].some(pseudo => {
          const cs = window.readStyle(el, pseudo);
          return cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
        }))) result.toggleShadowFrames++;
        if (!window.readStyle(bubble).backdropFilter.includes('blur(25px)') ||
            !window.readStyle(document.querySelector('model-response')).backdropFilter.includes('blur(25px)') ||
            !window.readStyle(document.querySelector('input-area-v2')).backdropFilter.includes('blur(22px)')) result.blurChanges++;
        if ([...document.styleSheets].some(s => s.disabled)) result.disabledFrames++;
        result.samples++;
        if (now - start < 1500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      document.querySelector('.luminous-toggle-button').click();
      await new Promise(r => setTimeout(r, 1600));
      result.styleReads = window.styleReads;
      return result;
    });
    const after = await metric();
    const report = { baseline, ...samples, recalcMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000, errors };
    fs.writeFileSync(path.join(out, baseline ? 'skin-baseline.json' : 'skin-current.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (baseline) return;
    assert.equal(samples.disabledFrames, 0, 'skin sheet must remain enabled during and after toggling');
    assert.equal(samples.blurChanges, 0, 'bubble blur must remain constant');
    assert.equal(samples.toggleGeometryChanges, 0, 'toggle must retain native geometry in every sampled frame, before/after annotation');
    assert.equal(samples.toggleShadowFrames, 0, 'toggle chrome must not contain left/right black gradients or glow');
    assert.ok(samples.styleReads < 150, 'toggle must not scan computed styles across chat history');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('bard-sidenav [data-kg-expand-btn]').count(), 0);
    assert.equal(await page.locator('input-area-v2').getAttribute('data-kg'), 'composer');
    assert.deepEqual(await page.locator('.host-text-toggle').evaluate(el => window.toggleGeometry(el)),
      await page.evaluate(() => window.nativeTextToggleGeometry));
    await page.locator('.luminous-toggle-button').first().focus();
    assert.equal(await page.locator('.luminous-toggle-button').first().evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('pre').first().evaluate(el => getComputedStyle(el, '::before').backgroundColor), 'rgb(100, 50, 70)');
    assert.notEqual(await page.locator('.gradient-art').first().evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    assert.equal(await page.locator('img.gem-attachment-style-img').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.equal(await page.locator('.quoted-text').evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    assert.equal(await page.locator('.quoted-text').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.equal(await page.locator('pre code').first().evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.ok(await page.locator('img.gem-attachment-style-img').evaluate(el => el.complete && el.naturalWidth > 0));
    await page.locator('.luminous-toggle-container').first().screenshot({ path: path.join(out, 'skin-toggle.png') });
    // Repeated/keyboard-style clicks, then message edit mode, must retain the composer anchor.
    await page.evaluate(async () => { for (let i = 0; i < 4; i++) { document.querySelector('.luminous-toggle-button').click(); await new Promise(r => setTimeout(r, 45)); } });
    await page.waitForTimeout(900);
    await page.locator('.luminous-toggle-button').first().press('Enter');
    await page.waitForTimeout(650);
    await page.evaluate(() => { const form = document.createElement('div'); form.className = 'edit-form rich-edit-form'; form.innerHTML = '<rich-textarea class="edit-rich-textarea"><div class="ql-editor">editing</div></rich-textarea>'; document.querySelector('user-query-content').replaceChildren(form); });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.edit-form').getAttribute('data-kg'), 'bubble');
    assert.equal(await page.locator('.edit-rich-textarea').getAttribute('data-kg'), null);
    assert.equal(await page.locator('input-area-v2').getAttribute('data-kg'), 'composer');
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.changeSkin(false));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('kimino-dream-active')), false);
    assert.equal(await page.locator('model-response').first().getAttribute('style'), '');
    assert.equal(await page.locator('model-response').nth(1).evaluate(el => el.style.maxWidth), '680px');
    await page.evaluate(() => { document.querySelector('.chat-history').append(window.makeTurn(61)); window.changeSkin(true); });
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('model-response').last().getAttribute('data-kg'), 'card');
    // Editing text inside an existing response must not rescan every surface.
    await page.evaluate(() => { window.styleReads = 0; document.querySelector('message-content p').firstChild.data += ' streamed'; });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.styleReads) < 20);
    // A class-drifted bubble keeps its semantic fallback, without an all-page scan.
    await page.evaluate(() => {
      const turn = window.makeTurn(62);
      const bubble = turn.querySelector('.user-query-bubble-with-background');
      bubble.className = 'host-bubble-variant';
      bubble.style.cssText = 'display:block;height:90px;background-color:rgb(30,30,30)';
      document.querySelector('.chat-history').append(turn);
    });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.host-bubble-variant').getAttribute('data-kg'), 'bubble');
    const oldMask = await page.locator('#kimino-static-fade').evaluate(el => el.style.cssText);
    await page.evaluate(() => {
      window.scrollStyleWrites = 0;
      window.scrollStyleObserver = new MutationObserver(records => { window.scrollStyleWrites += records.length; });
      window.scrollStyleObserver.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
    });
    await page.locator('.chat-history').evaluate(el => { el.scrollTop += 180; });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#kimino-static-fade').evaluate(el => el.style.cssText), oldMask, 'fade plane must remain static while content scrolls');
    assert.equal(await page.evaluate(() => { window.scrollStyleObserver.disconnect(); return window.scrollStyleWrites; }), 0, 'scroll must not rewrite any element styles');
    assert.equal(await page.locator('model-response').first().evaluate(el => el.style.getPropertyValue('mask-image')), '');
    await page.locator('bard-sidenav').evaluate(el => { el.style.width = '280px'; });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#kimino-dream-wallpaper').evaluate(el => el.style.left),
      await page.locator('bard-sidenav').evaluate(el => Math.round(el.getBoundingClientRect().right) + 'px'));
    await page.screenshot({ path: path.join(out, 'skin-browser.png') });
    assert.deepEqual(errors, [], 'no late errors during edit, toggle, scroll, resize or cleanup');
    console.log('PASS: continuous blur, no stylesheet swap, scoped work, repeated toggle, edit/composer, attachment, code decoration, disable/re-enable, streaming.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
