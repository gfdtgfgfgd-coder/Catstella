// 星语喵伴 · Background Service Worker (兼容 Chrome / Edge / Firefox)
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

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.local.get(null);
    const updated = { ...DEFAULT_CONFIG, ...current };
    await chrome.storage.local.set(updated);
    console.log('[星语喵伴] 初始化配置完成:', updated);
  } catch (err) {
    console.warn('[星语喵伴] onInstalled error:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(null).then(sendResponse);
    return true;
  }
  if (message.type === 'SET_CONFIG') {
    chrome.storage.local.set(message.payload).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
