// 星语喵伴 · Main World Script Injector Bridge (100% 容错防崩)
(() => {
  function tryInject() {
    try {
      const parent = document.head || document.documentElement;
      if (!parent) {
        requestAnimationFrame(tryInject);
        return;
      }
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/interceptor.js');
      script.async = false;
      parent.appendChild(script);
      script.onload = () => script.remove();
      script.onerror = () => script.remove();
    } catch (e) {
      // 页面 CSP 拦截时静默忽略，由 DOM 嗅探兜底
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject, { once: true });
  } else {
    tryInject();
  }
})();
