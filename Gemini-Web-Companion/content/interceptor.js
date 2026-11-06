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
  let nextStreamId = 0;
  const startStream = () => {
    const streamId = ++nextStreamId;
    notify('STREAM_START', { streamId });
    return (type, data) => notify(type, { ...data, streamId });
  };
  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input?.url || input?.href || '');
      if (!isStream(url)) return originalFetch.apply(this, args);
      const stream = startStream();
      const start = Date.now();
      try {
        const response = await originalFetch.apply(this, args);
        if (response.status === 429) stream('RATE_LIMIT_HIT', { status: 429 });
        if (!response.ok || !response.body) {
          stream('STREAM_COMPLETE', { successful: false, totalBytes: 0, duration: Date.now() - start });
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
                stream('RATE_LIMIT_HIT', { status: 429 });
              }
              tail = chunk.slice(-32); // Boundary detection only; never emitted or stored.
            }
            stream('STREAM_COMPLETE', { successful: !limited && bytes > 0, totalBytes: bytes, duration: Date.now() - start });
          } catch { stream('STREAM_ERROR'); }
          finally { reader?.releaseLock(); }
        })();
        return response;
      } catch (error) { stream('STREAM_ERROR'); throw error; }
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
      if (!isStream(urls.get(this) || '')) return originalSend.apply(this, args);
      const stream = startStream();
      const finish = () => {
        if (this.status === 429) stream('RATE_LIMIT_HIT', { status: 429 });
        // XHR provides transport completion, without confirmation about streamed content.
        stream(this.status === 0 ? 'STREAM_ERROR' : 'STREAM_COMPLETE');
      };
      this.addEventListener('loadend', finish, { once: true });
      try { return originalSend.apply(this, args); }
      catch (error) {
        this.removeEventListener('loadend', finish);
        stream('STREAM_ERROR');
        throw error;
      }
    };
  } catch { /* XHR observation is optional too. */ }
  window.addEventListener('message', event => {
    if (event.source === window && event.data?.source === 'KIMINO_BRIDGE' && event.data.type === 'INTERCEPTOR_PING') ready();
  });
  window.__KIMINO_INTERCEPTOR_READY_AT__ = Date.now();
  ready();
})();
