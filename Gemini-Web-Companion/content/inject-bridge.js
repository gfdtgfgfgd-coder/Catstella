// 星语喵伴 · Main World Script Injector Bridge (CSP 安全降级版)
// 职责：尽力把 interceptor.js 注入 Main World 以嗅探网络流；
// 但 gemini.google.com 的严苛 CSP 可能直接拦截 <script> 注入 —— 此时必须
// 立刻降级为 DOM 嗅探模式，绝不阻塞、绝不重试风暴，widget/skin 主流程毫发无伤。
(() => {
  if (window.__KIMINO_BRIDGE_STATE__) return;

  const MAX_ATTEMPTS = 3;
  const HANDSHAKE_TIMEOUT_MS = 4000;

  const state = { status: 'pending', attempts: 0, reason: '' };
  window.__KIMINO_BRIDGE_STATE__ = state;

  const api = window.KIMINO_API || { getURL: (p) => p, available: false };
  if (!api.available) {
    // 扩展上下文已失效（如扩展刚被重载），直接降级，DOM 嗅探兜底
    state.status = 'no-extension-context';
    return;
  }

  let handshake = false;
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'KIMINO_INTERCEPTOR' && event.data.type === 'INTERCEPTOR_READY') {
      handshake = true;
      state.status = 'active';
    }
  });

  const degrade = (reason) => {
    if (state.status === 'active') return;
    if (state.status !== 'pending' && state.status !== 'csp-blocked') return;
    state.status = 'csp-blocked';
    state.reason = reason;
    console.info(`[星语喵伴] 网络嗅探器不可用 (${reason})，已安全降级为 DOM 嗅探模式，桌宠与皮肤不受影响喵～`);
    try {
      window.dispatchEvent(new CustomEvent('kimino:bridge-degraded', { detail: { reason } }));
    } catch (e) { /* 老引擎无 CustomEvent 时静默 */ }
  };

  function tryInject() {
    if (handshake || state.status === 'active') return;
    if (state.attempts >= MAX_ATTEMPTS) {
      degrade('attempts-exhausted');
      return;
    }
    state.attempts += 1;

    try {
      const parent = document.head || document.documentElement;
      if (!parent) {
        if (state.attempts < MAX_ATTEMPTS) setTimeout(tryInject, 600);
        else degrade('dom-not-ready');
        return;
      }

      const script = document.createElement('script');
      script.src = api.getURL('content/interceptor.js');
      script.async = false;
      script.onload = () => {
        try { script.remove(); } catch (e) {}
      };
      script.onerror = () => {
        // Firefox/Chrome 上 CSP 拦截或 web_accessible_resources 未放行都会走这里
        try { script.remove(); } catch (e) {}
        degrade('script-load-error');
      };
      parent.appendChild(script);
    } catch (e) {
      degrade('inject-exception');
    }
  }

  // 兜底探针：即便 onerror 未触发（部分引擎静默失败），超时未握手也判定降级
  setTimeout(() => {
    if (!handshake) degrade('handshake-timeout');
  }, HANDSHAKE_TIMEOUT_MS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject, { once: true });
  } else {
    tryInject();
  }
})();
