// Catstella · Background (Chromium Service Worker / Firefox Event Page + AGY 桌面端本地桥接)
if (!globalThis.CatstellaOnline && typeof importScripts === 'function') importScripts('online/client.js');
const DEFAULT_CONFIG = {
  enabled: true,
  skinEnabled: true,
  character: 'gemini-star-v1', // 'gemini-star-v1' or 'lin-cat'
  soundEnabled: false,
  widgetScale: 200, // px
  argonMaxSafeTurns: 8,
  argonMaxSafeTokens: 25000,
  soundVolume: 0.5,
  wallpaperOpacity: 0.88,
  bubbleVisible: true,
  ambientChatter: false,
  autoUpdateCheck: true,
  syncCharacter: true,
  syncWallpaper: true,
  syncInteraction: true,
  petDisplayMode: 'both' // 'both' | 'prefer-desktop' | 'prefer-web'
};

// Firefox (browser.*) 与 Chromium (chrome.*) 双命名空间兜底
const extApi = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

const isGecko = typeof extApi?.runtime?.getBrowserInfo === 'function';
const safeStorageGet = keys => new Promise(resolve => {
  if (!extApi?.storage?.local) { resolve({}); return; }
  try {
    if (isGecko) Promise.resolve(extApi.storage.local.get(keys)).then(value => resolve(value || {}), () => resolve({}));
    else extApi.storage.local.get(keys, value => { void extApi.runtime.lastError; resolve(value || {}); });
  } catch { resolve({}); }
});
const safeStorageSet = value => new Promise(resolve => {
  if (!extApi?.storage?.local) { resolve(false); return; }
  try {
    if (isGecko) Promise.resolve(extApi.storage.local.set(value)).then(() => resolve(true), () => resolve(false));
    else extApi.storage.local.set(value, () => resolve(!extApi.runtime.lastError));
  } catch { resolve(false); }
});

const online = globalThis.CatstellaOnline?.create({
  loadCheck: async () => (await safeStorageGet(['onlineUpdate'])).onlineUpdate,
  saveCheck: onlineUpdate => safeStorageSet({ onlineUpdate })
});
const onlinePage = () => extApi.runtime.getURL('online/index.html');
async function checkOnlineUpdate(force = false) {
  const current = extApi.runtime.getManifest().version;
  const enabled = (await safeStorageGet(['autoUpdateCheck'])).autoUpdateCheck !== false;
  const result = enabled || force ? await online.check('web', current, force)
    : { status: 'disabled', current, url: globalThis.CatstellaOnline.releases };
  try {
    const action = extApi.action || extApi.browserAction;
    const badge = action?.setBadgeText({ text: result.status === 'available' ? 'NEW' : '' });
    if (badge?.catch) void badge.catch(() => {});
  } catch {}
  return result;
}
let nextAutoCheck = 0;
function maybeCheckUpdate() {
  if (!online || Date.now() < nextAutoCheck) return;
  nextAutoCheck = Date.now() + 30 * 60_000;
  void checkOnlineUpdate().catch(() => {});
}
let installQueue = Promise.resolve();
let bundledGallery;
async function onlineAvailability() {
  try {
    bundledGallery ||= fetch(extApi.runtime.getURL('assets/gallery.json')).then(response => response.json()).catch(() => ({}));
    const [items, bundled, local] = await Promise.all([
      online.list(), bundledGallery, safeStorageGet(['onlineCharacterPacks', 'customWallpapers'])
    ]);
    return { ok: true,
      character: items.filter(item => item.kind === 'character' && !bundled.characters?.some(x => x.id === item.id)
        && !local.onlineCharacterPacks?.['online-' + item.id]).length,
      wallpaper: items.filter(item => item.kind === 'wallpaper' && !bundled.wallpapers?.some(x => x.id === item.id)
        && !local.customWallpapers?.some(x => x.id === 'custom:online-' + item.id)).length
    };
  } catch (error) {
    return { ok: false, reason: globalThis.CatstellaOnline.failureReason(error) };
  }
}
async function installOnlineAsset(id, applyAfterwards) {
  const asset = await online.download(id);
  if (asset.theme) {
    return { ok: await safeStorageSet({ onlinePalette: asset.theme.palette, wallpaperOpacity: asset.theme.opacity / 100 }) };
  }
  if (asset.character) {
    // Decode every frame before changing the saved gallery.
    for (const data of Object.values(asset.character)) {
      const bytes = Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width * bitmap.height <= 1_500_000;
      bitmap.close();
      if (!valid) throw new Error('invalid character frame dimensions');
    }
    const { onlineCharacterPacks } = await safeStorageGet(['onlineCharacterPacks']);
    const packs = { ...onlineCharacterPacks, ['online-' + id]: { name: asset.item.name, description: asset.item.description, frames: asset.character } };
    return { ok: await safeStorageSet({ onlineCharacterPacks: packs }) };
  }
  const blob = new Blob([asset.bytes], { type: asset.item.mime });
  const bitmap = await createImageBitmap(blob);
  let dataUrl;
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_000_000) throw new Error('invalid image dimensions');
    let saved = blob;
    if (typeof OffscreenCanvas === 'function') {
      const scale = Math.min(1, 1920 / bitmap.width, 1080 / bitmap.height);
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        saved = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
      }
    }
    dataUrl = `data:${saved.type};base64,${arrayBufferToBase64(await saved.arrayBuffer())}`;
  } finally { bitmap.close(); }
  const wallpaperId = 'custom:online-' + id;
  const { customWallpapers = [] } = await safeStorageGet(['customWallpapers']);
  const wallpapers = (Array.isArray(customWallpapers) ? customWallpapers : []).filter(w => w?.id !== wallpaperId);
  wallpapers.push({ id: wallpaperId, title: asset.item.name, dataUrl });
  const selection = applyAfterwards ? { wallpaperId, syncWallpaper: false, pendingOnlineWallpaper: true } : {};
  const ok = await safeStorageSet({ customWallpapers: wallpapers, ...selection });
  if (ok && applyAfterwards) void syncWithDesktop({ syncWallpaper: false });
  return { ok };
}
async function onlineAction({ action, value }) {
  try {
    if (action === 'check') return { ok: true, ...(await checkOnlineUpdate(value === true)) };
    if (action === 'release') {
      const result = await checkOnlineUpdate();
      await extApi.tabs.create({ url: globalThis.CatstellaOnline.releaseUrl(result.url) });
      return { ok: true };
    }
    if (action === 'catalog') return { ok: true, items: await online.list(value === true) };
    if ((action === 'install' || action === 'download') && typeof value === 'string') {
      const task = installQueue.then(() => installOnlineAsset(value, action === 'install'));
      installQueue = task.catch(() => {});
      return await task;
    }
    return { ok: false };
  } catch (error) {
    return { ok: false, reason: globalThis.CatstellaOnline.failureReason(error) };
  }
}

// ---- AGY Desktop Companion Bridge (127.0.0.1:3921..3923) ----
const BRIDGE_PORTS = [3921, 3922, 3923];
let preferredPort = 3921;
let lastStateSig = '';
let lastSyncedWallpaperRev = '';
let wallpaperFetchInFlight = false;
let syncInFlight = null;
let syncQueued = false;
let requestedWallpaper = null;
let latestWebQuota = null;
const tabFocusMap = new Map(); // tabId -> { active, ts }

function hasGeminiTab(flag) {
  const now = Date.now();
  for (const [tabId, info] of tabFocusMap.entries()) {
    if (now - info.ts > 15000) {
      tabFocusMap.delete(tabId);
      continue;
    }
    if (info[flag]) return true;
  }
  return false;
}

const isAnyGeminiTabFocused = () => hasGeminiTab('active');
const isAnyGeminiTabVisible = () => hasGeminiTab('visible');

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}

// Fetch through the extension, not a Gemini <img> pointing at localhost. Keep a
// bounded preview cache and at most two decodes/downloads running concurrently.
const wallpaperPreviews = new Map();
const previewTasks = new Map();
const previewQueue = [];
let previewWorkers = 0;
function drainPreviews() {
  while (previewWorkers < 2 && previewQueue.length) {
    const work = previewQueue.shift();
    previewWorkers++;
    work().finally(() => { previewWorkers--; drainPreviews(); });
  }
}
function wallpaperPreview(id, revision = '') {
  if (typeof id !== 'string' || !id || id.length > 256) return Promise.resolve(null);
  const key = id + ':' + revision;
  const cached = wallpaperPreviews.get(key);
  if (cached && Date.now() - cached.at < 300000) return Promise.resolve(cached.dataUrl);
  if (previewTasks.has(key)) return previewTasks.get(key);
  const task = new Promise(resolve => {
    previewQueue.push(async () => {
      let dataUrl = null;
      try {
        const hit = await fetchBridge('/companion/wallpaper-image?id=' + encodeURIComponent(id), { timeoutMs: 4500 });
        if (hit) {
          const mime = hit.resp.headers.get('content-type') || '';
          const bytes = await hit.resp.arrayBuffer();
          if (mime.startsWith('image/') && bytes.byteLength > 0 && bytes.byteLength <= 25 * 1024 * 1024) {
            let blob = new Blob([bytes], { type: mime });
            if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
              try {
                const bitmap = await createImageBitmap(blob);
                try {
                  const ratio = Math.min(1, 320 / bitmap.width, 180 / bitmap.height);
                  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * ratio)), Math.max(1, Math.round(bitmap.height * ratio)));
                  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                  blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: .78 });
                } finally { bitmap.close(); }
              } catch { /* Older engines or SVG decoders can still display the original image. */ }
            }
            dataUrl = 'data:' + blob.type + ';base64,' + arrayBufferToBase64(await blob.arrayBuffer());
            if (dataUrl.length < 2 * 1024 * 1024) {
              wallpaperPreviews.set(key, { dataUrl, at: Date.now() });
              while (wallpaperPreviews.size > 16) wallpaperPreviews.delete(wallpaperPreviews.keys().next().value);
            }
          }
        }
      } catch { /* A failed tile remains retryable; do not cache failures. */ }
      resolve(dataUrl);
    });
    drainPreviews();
  });
  previewTasks.set(key, task);
  task.finally(() => previewTasks.delete(key));
  return task;
}

async function fetchBridge(pathname, options = {}) {
  const ports = [preferredPort, ...BRIDGE_PORTS.filter((p) => p !== preferredPort)];
  for (const port of ports) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 1400);
    try {
      const resp = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method: options.method || 'GET',
        headers: {
          'X-Catstella-Client': 'gemini-web-companion',
          ...(options.headers || {})
        },
        body: options.body,
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        preferredPort = port;
        return { port, resp };
      }
    } catch (e) {
      clearTimeout(timer);
    }
  }
  return null;
}

async function syncDesktopWallpaperIfNeeded(port, desktop, syncCfg) {
  requestedWallpaper = { desktop, syncCfg };
  if (wallpaperFetchInFlight) return;
  wallpaperFetchInFlight = true;
  try {
    while (requestedWallpaper) {
      const request = requestedWallpaper;
      requestedWallpaper = null;
      const { desktop, syncCfg } = request;
      if (!desktop?.wallpaperId || syncCfg?.syncWallpaper === false) continue;
      const rev = desktop.wallpaperRev || desktop.wallpaperId;
      if (rev === lastSyncedWallpaperRev) continue;
      const cached = await safeStorageGet(['agySyncedWallpaper']);
      if (cached.agySyncedWallpaper?.rev === rev && cached.agySyncedWallpaper?.dataUrl) { lastSyncedWallpaperRev = rev; continue; }
      const hit = await fetchBridge('/companion/wallpaper-image?id=' + encodeURIComponent(desktop.wallpaperId), { timeoutMs: 4500 });
      if (!hit) continue;
      const mime = hit.resp.headers.get('content-type') || '';
      const bytes = await hit.resp.arrayBuffer();
      if (!mime.startsWith('image/') || !bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) continue;
      if (requestedWallpaper && (requestedWallpaper.syncCfg?.syncWallpaper === false || (requestedWallpaper.desktop?.wallpaperRev || requestedWallpaper.desktop?.wallpaperId) !== rev)) continue;
      const ok = await safeStorageSet({ agySyncedWallpaper: {
        rev, id: desktop.wallpaperId, title: desktop.wallpaperTitle || desktop.wallpaperId,
        dataUrl: 'data:' + mime + ';base64,' + arrayBufferToBase64(bytes), updatedAt: Date.now()
      } });
      if (ok) lastSyncedWallpaperRev = rev;
    }
  } catch { /* Keep the previous wallpaper if the desktop disappears. */ }
  finally { wallpaperFetchInFlight = false; }
}

function syncWithDesktop(patch = null) {
  if (syncInFlight) {
    if (patch) return syncInFlight.then(() => syncWithDesktop(patch));
    syncQueued = true;
    return syncInFlight;
  }
  syncInFlight = performDesktopSync(patch).finally(() => {
    syncInFlight = null;
    if (syncQueued) { syncQueued = false; void syncWithDesktop(); }
  });
  return syncInFlight;
}

const pendingSyncKeys = { syncCharacter: 'pendingOnlineCharacter', syncWallpaper: 'pendingOnlineWallpaper' };
async function performDesktopSync(patch = null) {
  try {
    const pendingBefore = await safeStorageGet(Object.values(pendingSyncKeys));
    let effectivePatch = patch;
    for (const [key, pending] of Object.entries(pendingSyncKeys)) {
      if (pendingBefore[pending] && typeof effectivePatch?.[key] !== 'boolean') effectivePatch = { ...effectivePatch, [key]: false };
    }
    const bodyObj = {
      client: 'gemini-web-companion',
      webActive: isAnyGeminiTabFocused(),
      webVisible: isAnyGeminiTabVisible(),
      webQuota: latestWebQuota || undefined,
      patch: effectivePatch || undefined
    };
    const hit = await fetchBridge('/companion/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj)
    });

    if (!hit) {
      if (lastStateSig !== 'offline') {
        lastStateSig = 'offline';
        const prev = await safeStorageGet(['agyBridgeState']);
        if (!prev.agyBridgeState || prev.agyBridgeState.online !== false) {
          await safeStorageSet({
            agyBridgeState: {
              ...(prev.agyBridgeState || {}),
              online: false,
              ts: Date.now()
            }
          });
        }
      }
      return { ok: false, online: false };
    }

    const payload = await hit.resp.json();
    if (!payload || !payload.ok) return { ok: false, online: false };

    const syncCfg = payload.sync || {};
    const desktop = payload.desktop || {};
    const nextBridgeState = {
      online: true,
      port: hit.port,
      sync: syncCfg,
      desktop
    };
    const nextSig = JSON.stringify(nextBridgeState);

    const stored = await safeStorageGet([
      'character', 'soundEnabled', 'syncCharacter', 'syncWallpaper', 'syncInteraction', 'petDisplayMode', ...Object.values(pendingSyncKeys)
    ]);
    const updates = {};

    if (nextSig !== lastStateSig) {
      lastStateSig = nextSig;
      updates.agyBridgeState = { ...nextBridgeState, ts: Date.now() };
    }

    const canMirror = {};
    for (const [key, pending] of Object.entries(pendingSyncKeys)) {
      canMirror[key] = !pendingBefore[pending] && !stored[pending];
      if (stored[pending] && effectivePatch?.[key] === false && syncCfg[key] === false) updates[pending] = false;
      if (canMirror[key] && typeof syncCfg[key] === 'boolean' && stored[key] !== syncCfg[key]) updates[key] = syncCfg[key];
    }
    if (typeof syncCfg.syncInteraction === 'boolean' && stored.syncInteraction !== syncCfg.syncInteraction) {
      updates.syncInteraction = syncCfg.syncInteraction;
    }
    if (typeof syncCfg.petDisplayMode === 'string' && stored.petDisplayMode !== syncCfg.petDisplayMode) {
      updates.petDisplayMode = syncCfg.petDisplayMode;
    }

    if (canMirror.syncCharacter && syncCfg.syncCharacter !== false && desktop.characterPack && stored.character !== desktop.characterPack) {
      updates.character = desktop.characterPack;
      updates.customCharacter = null;
    }
    if (syncCfg.syncInteraction !== false && typeof desktop.sound === 'boolean' && stored.soundEnabled !== desktop.sound) {
      updates.soundEnabled = desktop.sound;
    }

    if (Object.keys(updates).length > 0) {
      await safeStorageSet(updates);
    }

    if (canMirror.syncWallpaper) void syncDesktopWallpaperIfNeeded(hit.port, desktop, syncCfg);
    return { ok: true, online: true, state: nextBridgeState };
  } catch (e) {
    return { ok: false, online: false };
  }
}

// ---- 隐藏 /usage 兜底标签页管理 ----
let usageFallbackTabId = null;
let lastUsageFallbackAt = 0;

const createUsageTab = () => new Promise(resolve => {
  const properties = { url: 'https://gemini.google.com/usage', active: false };
  try {
    if (isGecko) Promise.resolve(extApi.tabs.create(properties)).then(resolve, () => resolve(null));
    else extApi.tabs.create(properties, tab => { resolve(extApi.runtime.lastError ? null : tab); });
  } catch { resolve(null); }
});
const closeUsageTab = id => {
  try {
    const result = extApi.tabs.remove(id);
    if (result?.catch) result.catch(() => {});
  } catch {}
  if (usageFallbackTabId === id) usageFallbackTabId = null;
};

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'KG_ONLINE' && online && sender.url === onlinePage()) {
    onlineAction(message).then(sendResponse);
    return true;
  }
  if (message.type === 'KG_OPEN_ONLINE' && online && sender.id === extApi.runtime.id) {
    Promise.resolve(extApi.tabs.create({ url: onlinePage() })).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === 'KG_ONLINE_AVAILABILITY' && online && sender.id === extApi.runtime.id) {
    onlineAvailability().then(sendResponse);
    return true;
  }

  if (message.type === 'KG_USAGE_FALLBACK') {
    const now = Date.now();
    if (now - lastUsageFallbackAt < 5 * 60 * 1000) {
      sendResponse({ ok: false, reason: 'cooldown' });
      return;
    }
    lastUsageFallbackAt = now;
    createUsageTab().then(tab => {
      if (!Number.isInteger(tab?.id)) {
        lastUsageFallbackAt = 0;
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      const id = tab.id;
      usageFallbackTabId = id;
      sendResponse({ ok: true, tabId: id });
      setTimeout(() => {
        if (usageFallbackTabId === id) closeUsageTab(id);
      }, 45000);
    });
    return true;
  }

  if (message.type === 'KG_USAGE_FALLBACK_DONE') {
    if (usageFallbackTabId !== null && sender?.tab?.id === usageFallbackTabId) closeUsageTab(usageFallbackTabId);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'KG_TAB_HEARTBEAT') {
    maybeCheckUpdate();
    const tabId = sender?.tab?.id ?? 'default';
    tabFocusMap.set(tabId, { active: !!message.active, visible: typeof message.visible === 'boolean' ? message.visible : !!message.active, ts: Date.now() });
    if (message.webQuota && typeof message.webQuota === 'object') {
      latestWebQuota = message.webQuota;
    }
    syncWithDesktop().then((res) => sendResponse(res || { ok: false })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'KG_BRIDGE_PATCH') {
    const patch = message.patch && typeof message.patch === 'object' ? message.patch : {};
    // 同时立即落盘本地状态，即使桌面端未启动也能独立生效
    const localMirror = {};
    for (const [key, pending] of Object.entries(pendingSyncKeys)) {
      if (typeof patch[key] !== 'boolean') continue;
      localMirror[key] = patch[key];
      localMirror[pending] = !patch[key];
    }
    if (typeof patch.syncInteraction === 'boolean') localMirror.syncInteraction = patch.syncInteraction;
    if (typeof patch.petDisplayMode === 'string') localMirror.petDisplayMode = patch.petDisplayMode;
    if (typeof patch.characterPack === 'string') {
      localMirror.character = patch.characterPack;
      localMirror.customCharacter = null;
    }
    if (typeof patch.sound === 'boolean') localMirror.soundEnabled = patch.sound;
    safeStorageSet(localMirror).then(() => syncWithDesktop(patch)).then((res) => {
      sendResponse(res || { ok: true, localOnly: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'KG_GET_DESKTOP_WALLPAPERS') {
    fetchBridge('/companion/wallpapers', { method: 'GET', timeoutMs: 2200 })
      .then(async (hit) => {
        if (!hit) { sendResponse({ ok: false, wallpapers: [] }); return; }
        const data = await hit.resp.json();
        sendResponse({ ok: true, port: hit.port, wallpapers: data?.wallpapers || [] });
      })
      .catch(() => sendResponse({ ok: false, wallpapers: [] }));
    return true;
  }

  if (message.type === 'KG_GET_WALLPAPER_PREVIEW') {
    wallpaperPreview(message.id, typeof message.revision === 'string' ? message.revision : '')
      .then(dataUrl => sendResponse({ ok: !!dataUrl, dataUrl }));
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    safeStorageGet(null).then(sendResponse);
    return true;
  }
  if (message.type === 'SET_CONFIG') {
    safeStorageSet(message.payload).then((ok) => sendResponse({ success: ok }));
    return true;
  }
});

if (extApi && extApi.tabs && extApi.tabs.onRemoved) {
  try {
    extApi.tabs.onRemoved.addListener((tabId) => {
      if (usageFallbackTabId === tabId) usageFallbackTabId = null;
      if (tabFocusMap.has(tabId)) {
        tabFocusMap.delete(tabId);
        syncWithDesktop();
      }
    });
  } catch (e) {}
}

extApi.runtime.onInstalled.addListener(async () => {
  try {
    const current = await safeStorageGet(null);
    const updated = { ...DEFAULT_CONFIG, ...current };
    await safeStorageSet(updated);
    maybeCheckUpdate();
    syncWithDesktop();
    console.log('[Catstella] 初始化配置完成');
  } catch (err) {
    console.warn('[Catstella] onInstalled error:', err);
  }
});
extApi.runtime.onStartup?.addListener(maybeCheckUpdate);

// 启动时探测一次本地 AGY 套件
syncWithDesktop();
