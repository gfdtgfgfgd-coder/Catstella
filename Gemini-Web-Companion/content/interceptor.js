// Passive stream lifecycle only. Quotas come from /usage; no RPC replay, request
// body cache, response snippets, chat-list parsing, or cross-world content payloads.
(() => {
  const notify = (type, data = {}) => {
    try { window.postMessage({ source: 'KIMINO_INTERCEPTOR', type, data, timestamp: Date.now() }, '*'); } catch {}
  };
  const ready = () => notify('INTERCEPTOR_READY', { world: 'main' });
  if (window.__KIMINO_INTERCEPTOR_INSTALLED__) { ready(); return; }
  window.__KIMINO_INTERCEPTOR_INSTALLED__ = true;
  const isStream = url => /StreamGenerate|assistant\.lamda\.BardFrontendService/.test(String(url)) && !String(url).includes('batchexecute');
  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input?.url || input?.href || '');
      if (!isStream(url)) return originalFetch.apply(this, args);
      notify('STREAM_START');
      const start = Date.now();
      try {
        const response = await originalFetch.apply(this, args);
        if (response.status === 429) notify('RATE_LIMIT_HIT', { status: 429 });
        if (!response.ok || !response.body) {
          notify('STREAM_COMPLETE', { totalBytes: 0, duration: Date.now() - start });
          return response;
        }
        // Drain a clone asynchronously, without delaying the host response.
        void (async () => {
          let reader, bytes = 0, tail = '', limited = false;
          const decoder = new TextDecoder();
          try {
            reader = response.clone().body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value?.byteLength || 0;
              const chunk = tail + decoder.decode(value, { stream: true });
              if (!limited && chunk.includes('RESOURCE_EXHAUSTED')) {
                limited = true;
                notify('RATE_LIMIT_HIT', { status: 429 });
              }
              tail = chunk.slice(-32); // Boundary detection only; never emitted or stored.
            }
            notify('STREAM_COMPLETE', { totalBytes: bytes, duration: Date.now() - start });
          } catch { notify('STREAM_ERROR'); }
          finally { reader?.releaseLock(); }
        })();
        return response;
      } catch (error) { notify('STREAM_ERROR'); throw error; }
    };
  } catch { /* Optional; DOM completion detection remains available. */ }
  try {
    const urls = new WeakMap();
    const originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      urls.set(this, String(url));
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (isStream(urls.get(this) || '')) {
        notify('STREAM_START');
        this.addEventListener('loadend', () => {
          if (this.status === 429) notify('RATE_LIMIT_HIT', { status: 429 });
          notify(this.status === 0 ? 'STREAM_ERROR' : 'STREAM_COMPLETE');
        }, { once: true });
      }
      return originalSend.apply(this, args);
    };
  } catch { /* XHR observation is optional too. */ }
  window.addEventListener('message', event => {
    if (event.source === window && event.data?.source === 'KIMINO_BRIDGE' && event.data.type === 'INTERCEPTOR_PING') ready();
  });
  window.__KIMINO_INTERCEPTOR_READY_AT__ = Date.now();
  ready();
})();
