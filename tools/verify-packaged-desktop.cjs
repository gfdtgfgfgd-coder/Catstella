const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

async function main() {
  const executablePath = path.resolve(process.argv[2]);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catstella-release-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath, args: ['--data-dir=' + dataDir], env, timeout: 30000 });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.widgetApi && document.getElementById('mascot')?.dataset.artReady === 'true');
    const state = await page.evaluate(() => window.widgetApi.get());
    assert(state.settings && state.dreamSkin && state.wallpapers.length);
    assert.equal(state.byok.available, false);
    assert.equal(await page.evaluate(() => typeof window.widgetApi.byok), 'undefined');
    console.log('PASS: packaged app opens the desktop pet and loads settings and wallpapers.');
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
