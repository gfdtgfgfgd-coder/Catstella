// 星语喵伴 · 跨浏览器兼容垫片 (browser.* / chrome.* 双命名空间 + Promise 安全封装)
// 设计目标：任何 storage / runtime 调用都绝不抛出未捕获的 Promise rejection，
// 保证 Gecko (Firefox / Zen) 上后续 tracker / skin / widget 的初始化永不静默中断。
(() => {
  if (window.__KIMINO_SHIM_READY__) return;
  window.__KIMINO_SHIM_READY__ = true;

  const pickApi = () => {
    try {
      if (typeof browser !== 'undefined' && browser && browser.runtime && browser.runtime.id) return browser;
    } catch (e) { /* Firefox 之外的页面上下文无 browser */ }
    try {
      if (typeof chrome !== 'undefined' && chrome && chrome.runtime && chrome.runtime.id) return chrome;
    } catch (e) { /* 扩展环境被重载时 runtime 可能失效 */ }
    return null;
  };

  const api = pickApi();
  let isGecko = false;
  try {
    isGecko = !!(api && typeof api.runtime.getBrowserInfo === 'function');
  } catch (e) { isGecko = false; }

  const KIMINO_API = {
    raw: api,
    available: !!api,
    isGecko,
    getURL(path) {
      try { return api.runtime.getURL(path); } catch (e) { return path; }
    },
    // 永不 reject 的 storage.local.get —— 回调式 / Promise 式引擎通吃
    storageGet(keys) {
      return new Promise((resolve) => {
        if (!api || !api.storage || !api.storage.local) { resolve({}); return; }
        try {
          const outcome = api.storage.local.get(keys);
          if (outcome && typeof outcome.then === 'function') {
            outcome.then((res) => resolve(res || {})).catch(() => resolve({}));
          } else {
            resolve(outcome || {});
          }
        } catch (e) { resolve({}); }
      });
    },
    // 永不抛错、永不产生 unhandled rejection 的 storage.local.set
    storageSet(obj) {
      if (!api || !api.storage || !api.storage.local) return;
      try {
        const outcome = api.storage.local.set(obj);
        if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
      } catch (e) { /* 引擎差异，静默吞掉 */ }
    },
    onChanged(listener) {
      if (!api || !api.storage || !api.storage.onChanged) return;
      try { api.storage.onChanged.addListener(listener); } catch (e) {}
    }
  };

  window.KIMINO_API = KIMINO_API;

  // 全局防御：吞掉扩展脚本产生的未处理 Promise rejection（Firefox 上会阻断初始化链），
  // 仅记录告警不 preventDefault，页面自身错误依旧原样上报。
  window.addEventListener('unhandledrejection', (event) => {
    try {
      console.warn('[星语喵伴] 已拦截未处理的 Promise rejection:', event.reason);
    } catch (e) {}
  });

  console.log(`[星语喵伴] 兼容垫片就绪 (engine: ${KIMINO_API.isGecko ? 'Gecko' : 'Chromium'}, api: ${KIMINO_API.available ? 'ok' : 'missing'}) 喵～`);
})();
