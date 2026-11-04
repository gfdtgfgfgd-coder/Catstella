// 星语喵伴 · Background (Chromium Service Worker / Firefox Event Page + AGY 桌面端本地桥接)
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
  syncCharacter: true,
  syncWallpaper: true,
  syncInteraction: true,
  petDisplayMode: 'both' // 'both' | 'prefer-desktop' | 'prefer-web'
};

// Firefox (browser.*) 与 Chromium (chrome.*) 双命名空间兜底
const extApi = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

const safeStorageGet = (keys) => new Promise((resolve) => {
  if (!extApi || !extApi.storage || !extApi.storage.local) { resolve({}); return; }
  try {
    const out = extApi.storage.local.get(keys);
    if (out && typeof out.then === 'function') {
      out.then((r) => resolve(r || {})).catch(() => resolve({}));
    } else {
      extApi.storage.local.get(keys, (r) => resolve(r || {}));
    }
  } catch (e) { resolve({}); }
});

const safeStorageSet = (obj) => new Promise((resolve) => {
  if (!extApi || !extApi.storage || !extApi.storage.local) { resolve(false); return; }
  try {
    const out = extApi.storage.local.set(obj);
    if (out && typeof out.then === 'function') {
      out.then(() => resolve(true)).catch(() => resolve(false));
    } else {
      extApi.storage.local.set(obj, () => resolve(true));
    }
  } catch (e) { resolve(false); }
});

// ---- AGY Desktop Companion Bridge (127.0.0.1:3921..3923) ----
const BRIDGE_PORTS = [3921, 3922, 3923];
let preferredPort = 3921;
let lastStateSig = '';
let lastSyncedWallpaperRev = '';
let wallpaperFetchInFlight = false;
let syncInFlight = false;
let latestWebQuota = null;
const tabFocusMap = new Map(); // tabId -> { active, ts }

function isAnyGeminiTabFocused() {
  const now = Date.now();
  for (const [tabId, info] of tabFocusMap.entries()) {
    if (now - info.ts > 15000) {
      tabFocusMap.delete(tabId);
      continue;
    }
    if (info.active) return true;
  }
  return false;
}

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
  if (!desktop || syncCfg?.syncWallpaper === false || !desktop.wallpaperId) return;
  const rev = desktop.wallpaperRev || desktop.wallpaperId;
  if (rev === lastSyncedWallpaperRev || wallpaperFetchInFlight) return;

  // 检查本地是否已经缓存过同一 rev
  const cached = await safeStorageGet(['agySyncedWallpaper']);
  if (cached.agySyncedWallpaper && cached.agySyncedWallpaper.rev === rev && cached.agySyncedWallpaper.dataUrl) {
    lastSyncedWallpaperRev = rev;
    return;
  }

  wallpaperFetchInFlight = true;
  try {
    const res = await fetchBridge(`/companion/wallpaper-image?id=${encodeURIComponent(desktop.wallpaperId)}`, {
      method: 'GET',
      timeoutMs: 4500
    });
    if (res && res.resp) {
      const mime = res.resp.headers.get('content-type') || 'image/jpeg';
      const buf = await res.resp.arrayBuffer();
      if (buf && buf.byteLength > 0 && buf.byteLength < 25 * 1024 * 1024) {
        const dataUrl = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
        lastSyncedWallpaperRev = rev;
        await safeStorageSet({
          agySyncedWallpaper: {
            rev,
            id: desktop.wallpaperId,
            title: desktop.wallpaperTitle || desktop.wallpaperId,
            dataUrl,
            updatedAt: Date.now()
          }
        });
      }
    }
  } catch (e) {
    // 桌面端切换中或离线时静默降级
  } finally {
    wallpaperFetchInFlight = false;
  }
}

async function syncWithDesktop(patch = null) {
  if (syncInFlight && !patch) return null;
  syncInFlight = true;
  try {
    const bodyObj = {
      client: 'gemini-web-companion',
      webActive: isAnyGeminiTabFocused(),
      webQuota: latestWebQuota || undefined,
      patch: patch || undefined
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
      'character', 'soundEnabled', 'syncCharacter', 'syncWallpaper', 'syncInteraction', 'petDisplayMode'
    ]);
    const updates = {};

    if (nextSig !== lastStateSig) {
      lastStateSig = nextSig;
      updates.agyBridgeState = { ...nextBridgeState, ts: Date.now() };
    }

    if (typeof syncCfg.syncCharacter === 'boolean' && stored.syncCharacter !== syncCfg.syncCharacter) {
      updates.syncCharacter = syncCfg.syncCharacter;
    }
    if (typeof syncCfg.syncWallpaper === 'boolean' && stored.syncWallpaper !== syncCfg.syncWallpaper) {
      updates.syncWallpaper = syncCfg.syncWallpaper;
    }
    if (typeof syncCfg.syncInteraction === 'boolean' && stored.syncInteraction !== syncCfg.syncInteraction) {
      updates.syncInteraction = syncCfg.syncInteraction;
    }
    if (typeof syncCfg.petDisplayMode === 'string' && stored.petDisplayMode !== syncCfg.petDisplayMode) {
      updates.petDisplayMode = syncCfg.petDisplayMode;
    }

    if (syncCfg.syncCharacter !== false && desktop.characterPack && stored.character !== desktop.characterPack) {
      updates.character = desktop.characterPack;
      updates.customCharacter = null;
    }
    if (syncCfg.syncInteraction !== false && typeof desktop.sound === 'boolean' && stored.soundEnabled !== desktop.sound) {
      updates.soundEnabled = desktop.sound;
    }

    if (Object.keys(updates).length > 0) {
      await safeStorageSet(updates);
    }

    await syncDesktopWallpaperIfNeeded(hit.port, desktop, syncCfg);
    return { ok: true, online: true, state: nextBridgeState };
  } catch (e) {
    return { ok: false, online: false };
  } finally {
    syncInFlight = false;
  }
}

// ---- 隐藏 /usage 兜底标签页管理 ----
let usageFallbackTabId = null;
let lastUsageFallbackAt = 0;

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'KG_USAGE_FALLBACK') {
    const now = Date.now();
    if (now - lastUsageFallbackAt < 5 * 60 * 1000) {
      sendResponse({ ok: false, reason: 'cooldown' });
      return;
    }
    lastUsageFallbackAt = now;
    extApi.tabs.create({ url: 'https://gemini.google.com/usage', active: false }, (tab) => {
      usageFallbackTabId = tab ? tab.id : null;
      sendResponse({ ok: true, tabId: usageFallbackTabId });
      setTimeout(() => {
        if (usageFallbackTabId !== null) {
          try { extApi.tabs.remove(usageFallbackTabId); } catch (e) {}
          usageFallbackTabId = null;
        }
      }, 45000);
    });
    return true;
  }

  if (message.type === 'KG_USAGE_FALLBACK_DONE') {
    if (usageFallbackTabId !== null) {
      try { extApi.tabs.remove(usageFallbackTabId); } catch (e) {}
      usageFallbackTabId = null;
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'KG_TAB_HEARTBEAT') {
    const tabId = sender?.tab?.id ?? 'default';
    tabFocusMap.set(tabId, { active: !!message.active, ts: Date.now() });
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
    if (typeof patch.syncCharacter === 'boolean') localMirror.syncCharacter = patch.syncCharacter;
    if (typeof patch.syncWallpaper === 'boolean') localMirror.syncWallpaper = patch.syncWallpaper;
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
    syncWithDesktop();
    console.log('[星语喵伴] 初始化配置完成:', updated);
  } catch (err) {
    console.warn('[星语喵伴] onInstalled error:', err);
  }
});

// 启动时探测一次本地 AGY 套件
syncWithDesktop();
