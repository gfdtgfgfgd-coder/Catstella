const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = path.join(root, process.argv.includes('--built') ? 'dist/chromium/content' : 'content');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://interaction.test/**', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><main>fixture</main></body></html>'
    }));
    await page.goto('https://interaction.test/app/fixture');
    await page.evaluate(() => {
      window.storageWrites = [];
      window.state = {
        enabled: true,
        bubbleVisible: false,
        ambientChatter: false,
        syncCharacter: false,
        syncWallpaper: false,
        petDisplayMode: 'both',
        agyBridgeState: null
      };
      window.KIMINO_API = {
        getURL: () => 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><rect width="200" height="240" fill="#8b6fd3"/></svg>'
        ),
        storageGet: async () => window.state,
        storageSet: async value => { window.storageWrites.push(value); return true; },
        onChanged: () => {},
        sendMessage: async () => null
      };
    });
    await page.addScriptTag({ path: path.join(source, 'ambient.js') });
    await page.addScriptTag({ path: path.join(source, 'pet-behavior.js') });
    await page.addScriptTag({ path: path.join(source, 'widget.js') });

    await page.waitForFunction(() => {
      const host = document.getElementById('kimino-companion-root');
      return host?.shadowRoot?.querySelector('.kimino-wrapper')?.dataset.ready === 'true';
    });
    const character = page.locator('.kimino-character-box');
    await character.waitFor();
    const box = await character.boundingBox();
    assert.ok(box, 'character must have a pointer target');
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 3, 80);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(760);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.storageWrites.length), 0, 'a held pointer must not activate the character');

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 45, y + 25, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.storageWrites.length), 0, 'a swipe or drag must not activate the character');

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
    const writes = await page.evaluate(() => window.storageWrites);
    assert.ok(writes.some(value => value.bubbleVisible === true), 'a short stationary click must activate the character');
    assert.deepEqual(errors, []);
    console.log('PASS: web pet click accepts short stationary input and rejects hold, swipe, and drag.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
