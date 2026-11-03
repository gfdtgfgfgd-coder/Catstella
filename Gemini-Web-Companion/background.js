// 星语喵伴 · Background (Chromium Service Worker / Firefox Event Page 双兼容)
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
  bubbleVisible: true
};

// Firefox (browser.*) 与 Chromium (chrome.*) 双命名空间兜底
const extApi = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

// ---- 隐藏 /usage 兜底标签页管理 ----
// 账本 fetch 连续失败时（内容脚本 KG_USAGE_FALLBACK），开一个后台 /usage 标签页：
// 该页的 tracker 会读 DOM 写 storage（KG_USAGE_FALLBACK_DONE）后由这里关闭。
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
      // 45s 保底：页面没完成使命也关掉（防标签页堆积）
      setTimeout(() => {
        if (usageFallbackTabId !== null) {
          try { extApi.tabs.remove(usageFallbackTabId); } catch (e) {}
          usageFallbackTabId = null;
        }
      }, 45000);
    });
    return true; // 异步 sendResponse
  }

  if (message.type === 'KG_USAGE_FALLBACK_DONE') {
    if (usageFallbackTabId !== null) {
      try { extApi.tabs.remove(usageFallbackTabId); } catch (e) {}
      usageFallbackTabId = null;
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'GET_CONFIG') {
    extApi.storage.local.get(null).then(sendResponse).catch(() => sendResponse({}));
    return true;
  }
  if (message.type === 'SET_CONFIG') {
    extApi.storage.local.set(message.payload).then(() => {
      sendResponse({ success: true });
    }).catch(() => sendResponse({ success: false }));
    return true;
  }
});

extApi.runtime.onInstalled.addListener(async () => {
  try {
    const current = await extApi.storage.local.get(null);
    const updated = { ...DEFAULT_CONFIG, ...current };
    await extApi.storage.local.set(updated);
    console.log('[星语喵伴] 初始化配置完成:', updated);
  } catch (err) {
    console.warn('[星语喵伴] onInstalled error:', err);
  }
});
