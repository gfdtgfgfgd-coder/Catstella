// 星语喵伴 · Main World Script Injector Bridge (Fail-safe for Firefox & Chromium)
(() => {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/interceptor.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
      script.remove();
    };
    script.onerror = () => {
      console.warn('[星语喵伴] 页面 CSP 限制拦截器脚本标签，已无缝降级为 DOM 嗅探模式。');
      script.remove();
    };
  } catch (err) {
    console.warn('[星语喵伴] 拦截器注入捕获异常 (已安全降级):', err);
  }
})();
