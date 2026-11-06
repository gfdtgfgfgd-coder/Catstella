// Run the current source in real Electron windows with disposable configuration.
// This check does not need a packaged app, an AGY connection, or a browser account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');
const { widgetLayout } = require('../Antigravity-Cat-Widget/src/domain/host-visibility.cjs');
const executablePath = require('electron');
const entry = path.resolve(__dirname, '../Antigravity-Cat-Widget/src/main/index.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catstella-window-'));
const settingsFile = path.join(directory, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({
  bubbleOn: true, alwaysOnTop: false, clickThrough: false, autoUpdateCheck: false,
  hostWindowOnly: false, petDisplayMode: 'both', characterPack: 'lin-cat'
}));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const close = async app => {
  const process = app.process();
  let timer;
  try {
    await Promise.race([app.close(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Isolated Electron window did not close')), 6000);
    })]);
  } finally {
    clearTimeout(timer);
    if (process.exitCode === null && process.signalCode === null) process.kill();
  }
};
const settings = () => JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
const bounds = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, message, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(30);
  }
  throw Error(message);
}
async function launch() {
  const app = await _electron.launch({
    executablePath, args: [entry, '--data-dir=' + directory, '--isolated-dev'], env, timeout: 25000
  });
  try {
    const page = await app.firstWindow();
    await page.locator('#mascot[data-art-ready=true]').waitFor({ timeout: 12000 });
    await waitFor(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), 'Window did not become visible');
    const snapshot = await page.evaluate(() => window.widgetApi.get());
    assert.ok(snapshot.webCompanion.port > 0 && ![3921,3922,3923].includes(snapshot.webCompanion.port), 'the extension cannot find the isolated bridge');
    assert.equal(snapshot.webCompanion.online, false);
    assert.equal(snapshot.source.online, false);
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), path.join(directory, 'runtime'));
    return { app, page };
  } catch (error) {
    await close(app);
    throw error;
  }
}
const button = page => page.locator('#motion');
async function dragBy(app, page, dx, dy, expected) {
  const start = await bounds(app), rect = await button(page).boundingBox();
  await page.evaluate(() => {
    window.dragTrace = [];
    if (window.dragTraceReady) return;
    window.dragTraceReady = true;
    for (const type of ['pointerdown','pointermove','pointerup']) {
      document.querySelector('#motion').addEventListener(type, e => window.dragTrace.push([type,e.screenX,e.screenY]));
    }
  });
  assert.ok(rect);
  const origin = { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 3, 72) };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + dx, origin.y + dy);
  const moved = await waitFor(async () => {
    const actual = await bounds(app);
    return actual.x !== start.x || actual.y !== start.y ? actual : null;
  }, 'The real Electron window did not move before mouseup');
  assert.equal(settings().x, expected.previousX, 'do not write settings during movement');
  if (expected.facing) {
    await page.locator('#mascot[data-facing="' + expected.facing + '"]').waitFor({ timeout:3000 });
  }
  // Electron reports screen coordinates. Compensate for the moved window when
  // dispatching the release at the original screen point plus the drag delta.
  await page.mouse.move(start.x + origin.x + dx - moved.x, start.y + origin.y + dy - moved.y);
  await page.mouse.up();
  let saved;
  try {
    saved = await waitFor(() => {
      const saved = settings();
      // The injected pointer may round a DIP at fractional Windows scaling.
      const tolerance = expected.tolerance ?? 0;
      return Math.abs(saved.x - expected.x) <= tolerance && Math.abs(saved.y - expected.y) <= tolerance ? saved : null;
    }, 'Position was not saved at ' + JSON.stringify({ x: expected.x, y: expected.y }));
  } catch (error) {
    console.error({ start, moved, final:await bounds(app), requested:{dx,dy}, saved:{x:settings().x,y:settings().y},
      trace:await page.evaluate(() => window.dragTrace) });
    throw error;
  }
  const final = await bounds(app);
  assert.equal(final.x, saved.x);
  assert.equal(final.y, saved.y);
  assert.equal(await page.locator('#bubble').getAttribute('data-open'), 'false', 'dragging does not open the bubble');
  return final;
}

(async () => {
  const first = await launch();
  let final, displayCount;
  try {
    const start = await bounds(first.app);
    const displays = await first.app.evaluate(({ screen }) => screen.getAllDisplays().map(d => ({...d.workArea,scaleFactor:d.scaleFactor})));
    console.log('Windows displays:', displays);
    displayCount = displays.length;
    const area = displays.find(d => start.x >= d.x && start.x < d.x + d.width && start.y >= d.y && start.y < d.y + d.height);
    assert.ok(area, 'The window must start in a display work area');
    // At fractional DPI, Win32 can report a different outer size before the
    // first setBounds. Snapping uses the app's logical window dimensions.
    const layout = widgetLayout(area, settings().scale || 220);
    const right = area.x + area.width - layout.width, bottom = area.y + area.height - layout.height;
    assert.ok(start.x - area.x >= 70 && start.y - area.y >= 26, 'need enough free workspace to exercise a diagonal drag');
    const free = await dragBy(first.app, first.page, -65, -24, { previousX:undefined, x:start.x-65, y:start.y-24, tolerance:2 });
    final = await dragBy(first.app, first.page, right - 12 - free.x, bottom - 12 - free.y, {
      previousX:free.x, x:right, y:bottom
    });
    const rect = await button(first.page).boundingBox();
    await first.page.mouse.click(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 3, 72));
    await first.page.locator('#bubble[data-open=true]').waitFor({ timeout:5000 });
  } finally { await close(first.app); }
  const restarted = await launch();
  try {
    assert.deepEqual(await bounds(restarted.app), final, 'Restart must restore the snapped native window bounds');
    const centerStart = await restarted.app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0], b = win.getBounds();
      const area = screen.getDisplayMatching(b).workArea;
      win.setBounds({ ...b, x:Math.round(area.x + (area.width - b.width) / 2 + 30) });
      return win.getBounds();
    });
    await dragBy(restarted.app, restarted.page, -72, 0, {
      previousX:final.x, x:centerStart.x-72, y:centerStart.y, tolerance:2, facing:'left'
    });
  }
  finally { await close(restarted.app); }
  console.log(JSON.stringify({ passed:['native-window-drag','snap-right-bottom','save-on-release','tap-after-drag','restart','facing-before-release'], displayCount, temporarySettings:directory }));
})().catch(error => { console.error(error); process.exitCode = 1; });
