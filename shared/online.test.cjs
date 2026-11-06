const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { create, catalog, selectRelease, assetBase } = require('./online.js');
const { createOnlineActions } = require('../Antigravity-Cat-Widget/src/main/online.cjs');
const { WallpaperManager } = require('../Antigravity-Dream-Skin/src/domain/theme-loader.cjs');
const Ambient = require('../Antigravity-Cat-Widget/src/renderer/ambient.js');

const release = (tag, name, flags = {}) => ({
  draft: false, prerelease: false, tag_name: tag, assets: [{ state: 'uploaded', name }], ...flags
});
const desktop = (tag, ver, flags) => release(tag, `Catstella-Setup-${ver}-x64.exe`, flags);
const webZip = 'kimino-gemini-companion-edge-chrome.zip';
const assetDir = path.resolve(__dirname, '../online-assets');
const onDisk = JSON.parse(fs.readFileSync(path.join(assetDir, 'catalog.json'), 'utf8'));
const assetFetch = async url => {
  assert.ok(url.startsWith(assetBase));
  return new Response(fs.readFileSync(path.join(assetDir, url.slice(assetBase.length))));
};

test('release detection separates both clients, ignores previews and requires real packages', () => {
  const list = [
    desktop('v0.7.0', '0.7.0', { draft: true }),
    desktop('desktop-v0.8.0', '0.8.0', { prerelease: true }),
    desktop('desktop-v0.6.10', '0.6.10'),
    desktop('v0.6.9', '0.6.9'),
    desktop('desktop-v0.9.0', '0.6.9'),
    release('web-v1.5.0', webZip),
    release('web-v1.6.0', 'Source.zip')
  ];
  assert.equal(selectRelease(list, 'desktop', '0.6.9').latest, '0.6.10');
  assert.equal(selectRelease(list, 'web', '1.5.0').status, 'current');
  assert.equal(selectRelease(list, 'web', '1.4.4').status, 'available');
  assert.equal(selectRelease(list.filter(r => !r.tag_name.startsWith('web-')), 'web', '1.4.4').status, 'unpublished');
});

test('a desktop beta can move to the matching stable release without downgrading or following other betas', () => {
  const older = desktop('v0.6.0', '0.6.0');
  const beta = desktop('desktop-v0.6.2-beta.1', '0.6.2-beta.1', { prerelease: true });
  assert.equal(selectRelease([older, beta], 'desktop', '0.6.1-beta.1').status, 'current');
  const final = desktop('desktop-v0.6.1', '0.6.1');
  const result = selectRelease([older, beta, final], 'desktop', '0.6.1-beta.1');
  assert.equal(result.status, 'available');
  assert.equal(result.latest, '0.6.1');
});

test('concurrent and frequent automatic checks share one request and a restart cache', async () => {
  let count = 0, cache, now = Date.UTC(2026, 10, 5);
  const options = { now: () => now, loadCheck: () => cache, saveCheck: value => { cache = value; },
    fetcher: async () => { count++; return Response.json([release('web-v1.5.1', webZip)]); } };
  const client = create(options);
  const [a, b] = await Promise.all([client.check('web', '1.5.0'), client.check('web', '1.5.0', true)]);
  assert.equal(count, 1);
  assert.deepEqual(a, b);
  assert.equal(a.status, 'available');
  await create(options).check('web', '1.5.0');
  assert.equal(count, 1);
  now += 31_000;
  await client.check('web', '1.5.0', true);
  assert.equal(count, 2);
  const offline = create({ ...options, loadCheck: () => null, fetcher: async () => new Response(null, { status: 503 }) });
  assert.equal((await offline.check('web', '1.5.0')).status, 'offline');
});

test('checked-in assets are intact; catalog traversal and invalid palettes fail closed', async () => {
  const client = create({ fetcher: async url => {
    const response = await assetFetch(url);
    if (!url.includes('/themes/')) return response;
    const bytes = await response.arrayBuffer();
    // Fetch yields decoded bytes while Content-Length reports the wire size.
    return new Response(bytes, { headers: { 'content-length': String(bytes.byteLength + 20) } });
  } });
  for (const entry of await client.list()) {
    const downloaded = await client.download(entry.id);
    if (entry.kind === 'theme') assert.ok(['ocean', 'violet'].includes(downloaded.theme.palette));
    else if (entry.kind === 'character') assert.match(downloaded.character.idle, /^data:image\/png;base64,/);
    else assert.equal(downloaded.bytes.length, entry.size);
  }
  const entry = onDisk.items[0];
  assert.throws(() => catalog({ schema: 1, items: [{ ...entry, path: '../private.json' }] }));
  const tampered = create({ fetcher: async url => {
    if (url.endsWith('catalog.json')) return assetFetch(url);
    const bytes = Buffer.from(await (await assetFetch(url)).arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    return new Response(bytes);
  } });
  await assert.rejects(tampered.download(entry.id), /digest mismatch/);
  const oversized = create({ fetcher: url => url.endsWith('catalog.json') ? assetFetch(url)
    : new Response(Buffer.alloc(entry.size + 1), { headers: { 'content-length': '1' } }) });
  await assert.rejects(oversized.download(entry.id), /file too large/);
});

test('desktop imports a verified wallpaper into its usual gallery and leaves it unchanged on a bad download', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catstella-online-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const wallpaperDir = path.join(dataDir, 'wallpapers');
  const characterDir = path.join(dataDir, 'characters');
  const patches = [];
  let tamper = false, fetches = 0;
  const actions = createOnlineActions({
    dataDir, wallpaperDir, characterDir, version: '0.6.0', settings: { get: () => false },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) },
    apply: patch => patches.push(patch),
    fetcher: async url => {
      fetches++;
      if (tamper && url.endsWith('.jpg')) return new Response('invalid');
      return assetFetch(url);
    }
  });
  assert.equal((await actions.check()).status, 'disabled');
  assert.equal(fetches, 0);
  const id = onDisk.items.find(x => x.kind === 'wallpaper' && x.path.endsWith('.jpg')).id;
  assert.deepEqual(await actions.handle('download', id), { ok: true, kind: 'wallpaper' });
  const pack = new WallpaperManager({ wallpapersDir: path.join(dataDir, 'bundled'), userDir: wallpaperDir }).resolve('online-' + id);
  assert.ok(pack.width > 0 && pack.height > 0);
  const original = fs.readFileSync(pack.file);
  const character = onDisk.characters[0];
  assert.deepEqual(await actions.handle('download', character.id), { ok: true, kind: 'character' });
  assert.ok(fs.existsSync(path.join(characterDir, 'online-' + character.id, 'frames/idle.png')));
  tamper = true;
  assert.equal((await actions.handle('install', id)).ok, false);
  assert.equal(patches.length, 0, 'downloaded assets do not change the current selection');
  assert.deepEqual(fs.readFileSync(pack.file), original);
});

test('disabling chatter cancels an eligibility check already in flight', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let speaks = 0, done;
  const chatter = new Ambient({ delay: () => 10, allowed: () => new Promise(resolve => { done = resolve; }), speak: () => speaks++ });
  t.mock.timers.tick(100);
  assert.equal(done, undefined);
  chatter.configure(true);
  t.mock.timers.tick(10);
  chatter.configure(false);
  done(true);
  await Promise.resolve();
  assert.equal(speaks, 0);
  chatter.allowed = () => true;
  chatter.configure(true);
  t.mock.timers.tick(10);
  await Promise.resolve();
  assert.equal(speaks, 1);
  chatter.configure(false);
});
