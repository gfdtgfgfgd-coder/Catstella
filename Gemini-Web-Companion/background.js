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

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
