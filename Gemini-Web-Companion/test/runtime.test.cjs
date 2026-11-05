const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('web pet behavior accepts only short, stationary clicks', () => {
  const ctx = vm.createContext({});
  vm.runInContext(source('content/pet-behavior.js'), ctx);
  const PetBehavior = ctx.CatstellaPetBehavior;
  assert.equal(PetBehavior.isTap(0, 0), true);
  assert.equal(PetBehavior.isTap(PetBehavior.tapLimit, PetBehavior.tapSlop), true);
  assert.equal(PetBehavior.isTap(PetBehavior.tapLimit + 1, 0), false);
  assert.equal(PetBehavior.isTap(200, PetBehavior.tapSlop + 1), false);
  assert.equal(PetBehavior.isTap(Number.NaN, 0), false);
});

for (const gecko of [false, true]) {
  for (const target of ['content', 'background']) {
    test(`${target} storage uses one ${gecko ? 'Promise' : 'callback'} invocation and awaits completion`, async () => {
      const calls = [];
      let finish;
      const runtime = { id: 'fixture', ...(gecko ? { getBrowserInfo() {} } : {}) };
      const api = { runtime, storage: { local: {
        get(keys, callback) {
          calls.push(['get', keys]);
          if (gecko) return Promise.resolve({ enabled: false });
          callback({ enabled: false });
        },
        set(value, callback) {
          calls.push(['set', value]);
          if (gecko) return new Promise(resolve => { finish = resolve; });
          finish = callback;
        }
      } } };
      const window = {};
      const ctx = vm.createContext({ window, console: { log() {} }, ...(gecko ? { browser: api } : { chrome: api }) });
      if (target === 'content') vm.runInContext(source('content/shim.js'), ctx);
      else vm.runInContext(source('background.js').split('// ---- AGY Desktop')[0] + '\nglobalThis.methods = { storageGet: safeStorageGet, storageSet: safeStorageSet };', ctx);
      const methods = target === 'content' ? window.KIMINO_API : ctx.methods;
      assert.equal((await methods.storageGet(['enabled'])).enabled, false);
      let settled = false;
      const setting = methods.storageSet({ enabled: true }).then(value => { settled = true; return value; });
      await Promise.resolve();
      assert.equal(settled, false, 'write must not resolve before storage has completed');
      finish();
      assert.equal(await setting, true);
      assert.equal(calls.filter(c => c[0] === 'get').length, 1);
      assert.equal(calls.filter(c => c[0] === 'set').length, 1);
      api.storage.local.get = () => { throw Error('context unavailable'); };
      api.storage.local.set = () => gecko ? Promise.reject(Error('storage rejected')) : (() => { throw Error('context unavailable'); })();
      assert.equal(Object.keys(await methods.storageGet(null)).length, 0);
      assert.equal(await methods.storageSet({}), false);
    });
  }
}

test('wallpaper previews are fetched once per revision, cached, and limited to two workers', async () => {
  let requests = 0, active = 0, peak = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = vm.createContext({ chrome: { runtime: {} }, console, Date, AbortController, Uint8Array, Blob, btoa,
    setTimeout, clearTimeout,
    fetch: async () => {
      requests++; active++; peak = Math.max(peak, active);
      await gate; active--;
      return new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    }
  });
  vm.runInContext(source('background.js').split('async function syncDesktopWallpaperIfNeeded')[0] + '\nglobalThis.preview = wallpaperPreview;', ctx);
  const first = ctx.preview('one', '1');
  assert.equal(ctx.preview('one', '1'), first, 'concurrent preview requests must share one download');
  const rest = ['two', 'three', 'four'].map(id => ctx.preview(id, '1'));
  await Promise.resolve();
  assert.equal(requests, 2);
  release();
  const previews = await Promise.all([first, ...rest]);
  assert.equal(peak, 2);
  assert.ok(previews.every(value => value.startsWith('data:image/png;base64,')));
  await ctx.preview('one', '1');
  assert.equal(requests, 4);
  await ctx.preview('one', '2');
  assert.equal(requests, 5, 'new file revisions must invalidate the cache');
});

test('a slow wallpaper transfer does not block focus/visibility synchronization', async () => {
  let handler, releaseImage;
  const bodies = [];
  const memory = {};
  const api = { runtime: { onMessage: { addListener(fn) { handler = fn; } }, onInstalled: { addListener() {} } },
    storage: { local: { get(keys, callback) { callback(memory); }, set(value, callback) { Object.assign(memory, value); callback(); } } }, tabs: { onRemoved: { addListener() {} } } };
  const imageReady = new Promise(resolve => { releaseImage = resolve; });
  const ctx = vm.createContext({ chrome: api, console, Date, AbortController, Uint8Array, btoa, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => {
      if (url.includes('/companion/sync')) {
        bodies.push(JSON.parse(options.body));
        return new Response(JSON.stringify({ ok: true, sync: { syncWallpaper: true }, desktop: { wallpaperId: 'one', wallpaperRev: 'one:1' } }), { headers: { 'content-type': 'application/json' } });
      }
      await imageReady;
      return new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    }
  });
  vm.runInContext(source('background.js'), ctx);
  await new Promise(resolve => handler({ type: 'KG_TAB_HEARTBEAT', active: true, visible: true }, { tab: { id: 1 } }, resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(bodies.some(body => body.webActive && body.webVisible));
  await new Promise(resolve => handler({ type: 'KG_TAB_HEARTBEAT', active: false, visible: true }, { tab: { id: 1 } }, resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodies.at(-1).webActive, false);
  assert.equal(bodies.at(-1).webVisible, true);
  releaseImage();
});

function trackerFixture() {
  const callbacks = new Map();
  const intervals = [];
  const timeouts = [];
  const window = { location: { pathname: '/app/fixture' }, KIMINO_API: { storageGet: () => new Promise(() => {}) }, addEventListener: (type, callback) => callbacks.set(type, callback) };
  const context = vm.createContext({ window, console, setInterval: (callback, delay) => intervals.push({ callback, delay }), setTimeout: (callback, delay) => timeouts.push({ callback, delay }), clearTimeout() {} });
  vm.runInContext(source('content/tracker.js'), context);
  return { tracker: window.__KIMINO_TRACKER__, window, callbacks, intervals, timeouts };
}

test('SSR ledger parses split usage chunks and ignores unrelated RPC/chat data', () => {
  const { tracker } = trackerFixture();
  const payload = JSON.stringify([{ data: { viewer: { rpcs: { getUsageInfo: { subscriptionTier: 'TIER1', pools: [
    { poolType: 'GXU_FIVE_HOURLY', percentageUsed: 0, windowRefreshesAt: '2026-11-06T13:30:00.123456Z' },
    { poolType: 'GXU_WEEKLY', percentageUsed: .42, windowRefreshesAt: '2026-11-07T13:30:00Z' }
  ] } } } } }]);
  const html = [payload.slice(0, 70), payload.slice(70)].map(chunk => '<script type="application/json">' + JSON.stringify({ events: [{ id: 'usage:0', kind: 'chunk', chunk }] }) + '</script>').join('');
  const result = tracker.parseUsageLedgerHtml(html);
  assert.equal(result.five.percentageUsed, 0);
  assert.equal(result.weekly.percentageUsed, .42);
  assert.equal(tracker.isoToMs(result.five.windowRefreshesAt), Date.parse('2026-11-06T13:30:00.123Z'));
  assert.equal(tracker.parseUsageLedgerHtml('<script type="application/json">{"rpc":"chat-list"}</script>'), null);
});

test('one periodic ledger timer and one stream-completion refresh remain', () => {
  const { tracker, window, callbacks, intervals, timeouts } = trackerFixture();
  tracker.startQuotaRefreshLoop();
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 300000);
  assert.equal(timeouts.length, 0);
  const refreshes = [];
  tracker.refreshUsageLedger = reason => refreshes.push(reason);
  tracker.scheduleScrape = () => {};
  tracker.notify = () => {};
  tracker.initNetworkListener();
  callbacks.get('message')({ source: {}, data: { source: 'KIMINO_INTERCEPTOR', type: 'STREAM_COMPLETE' } });
  assert.equal(refreshes.length, 0);
  callbacks.get('message')({ source: window, data: { source: 'KIMINO_INTERCEPTOR', type: 'STREAM_COMPLETE' } });
  assert.deepEqual(refreshes, ['after-turn']);
  callbacks.get('message')({ source: window, data: { source: 'KIMINO_INTERCEPTOR', type: 'STREAM_ERROR' } });
  assert.equal(tracker.sessionData.status, 'idle');
});

test('reinjection retains the existing tracker instead of adding competing observers and timers', () => {
  const window = { __KIMINO_TRACKER__: { sentinel: true } };
  vm.runInNewContext(source('content/tracker.js'), { window });
  assert.equal(window.__KIMINO_TRACKER__.sentinel, true);
});

test('interceptor passes host requests through, ignores metadata and emits no content payloads', async () => {
  const messages = [], requests = [], listeners = [];
  let completed;
  const done = new Promise(resolve => { completed = resolve; });
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('private reply RESOURCE_EXH'));
    controller.enqueue(new TextEncoder().encode('AUSTED private reply'));
    controller.close();
  } }));
  const metadata = { ok: true, clone() { throw Error('Metadata must not be read'); } };
  const window = {
    fetch: async (...args) => { requests.push(args); return args[0].includes('batchexecute') ? metadata : response; },
    postMessage(message) { messages.push(message); if (message.type === 'STREAM_COMPLETE') completed(); },
    addEventListener(type, callback) { listeners.push(callback); }
  };
  const ctx = vm.createContext({ window, Date, TextDecoder, console });
  vm.runInContext(source('content/interceptor.js'), ctx);
  assert.equal(await window.fetch('/_/BardChatUi/data/batchexecute?rpcids=MaZiqc', { body: 'private request' }), metadata);
  assert.equal(messages.filter(m => m.type === 'STREAM_START').length, 0);
  const options = { method: 'POST', body: 'private prompt' };
  assert.equal(await window.fetch('/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate', options), response);
  await done;
  assert.equal(requests.length, 2);
  assert.equal(requests[1][1], options);
  assert.equal(messages.filter(m => m.type === 'RATE_LIMIT_HIT').length, 1);
  assert.ok(!JSON.stringify(messages).includes('private'));
  assert.ok(!JSON.stringify(messages).includes('responseText'));
  const count = messages.length;
  listeners[0]({ source: window, data: { source: 'KIMINO_TRACKER', type: 'QUOTA_RPC_REPLAY' } });
  assert.equal(requests.length, 2, 'legacy replay messages have no handler');
  listeners[0]({ source: window, data: { source: 'KIMINO_BRIDGE', type: 'INTERCEPTOR_PING' } });
  assert.equal(messages.length, count + 1);
  assert.equal(messages.at(-1).type, 'INTERCEPTOR_READY');
});

for (const gecko of [false, true]) {
  test(`hidden quota fallback uses ${gecko ? 'Promise' : 'callback'} tabs and only closes its own page`, async () => {
    let handler;
    const removed = [];
    const api = {
      runtime: { ...(gecko ? { getBrowserInfo() {} } : {}), onMessage: { addListener(fn) { handler = fn; } }, onInstalled: { addListener() {} } },
      storage: { local: { get(keys, callback) { if (gecko) return Promise.resolve({}); callback({}); }, set(value, callback) { if (gecko) return Promise.resolve(); callback(); } } },
      tabs: {
        create(properties, callback) { assert.equal(properties.active, false); if (gecko) { assert.equal(callback, undefined); return Promise.resolve({ id: 123 }); } callback({ id: 123 }); },
        remove(id) { removed.push(id); return Promise.resolve(); },
        onRemoved: { addListener() {} }
      }
    };
    const ctx = vm.createContext({ ...(gecko ? { browser: api } : { chrome: api }), console, Date, AbortController,
      fetch: async () => { throw Error('No desktop during unit tests'); }, setTimeout: () => 1, clearTimeout() {} });
    vm.runInContext(source('background.js'), ctx);
    const response = await new Promise(resolve => {
      assert.equal(handler({ type: 'KG_USAGE_FALLBACK' }, { tab: { id: 1 } }, resolve), true);
    });
    assert.equal(response.ok, true);
    assert.equal(response.tabId, 123);
    handler({ type: 'KG_USAGE_FALLBACK_DONE' }, { tab: { id: 1 } }, () => {});
    assert.deepEqual(removed, []);
    handler({ type: 'KG_USAGE_FALLBACK_DONE' }, { tab: { id: 123 } }, () => {});
    assert.deepEqual(removed, [123]);
  });
}
