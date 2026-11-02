// 星语喵伴 · Page Context Network Interceptor
(() => {
  if (window.__KIMINO_INTERCEPTOR_INSTALLED__) return;
  window.__KIMINO_INTERCEPTOR_INSTALLED__ = true;

  const notify = (type, data = {}) => {
    try {
      window.postMessage({
        source: 'KIMINO_INTERCEPTOR',
        type,
        data,
        timestamp: Date.now()
      }, '*');
    } catch (e) {}
  };

  // 1. 劫持 window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const isGeminiRpc = url.includes('/_/BardChatUi/') || 
                         url.includes('assistant.lamda.BardFrontendService') || 
                         url.includes('batchexecute') ||
                         url.includes('StreamGenerate');

    if (isGeminiRpc) {
      let promptLength = 0;
      try {
        if (args[1] && args[1].body) {
          const bodyStr = typeof args[1].body === 'string' ? args[1].body : '';
          promptLength = bodyStr.length;
        }
      } catch (e) {}

      notify('STREAM_START', { url, promptLength });
      const startTime = Date.now();

      try {
        const response = await originalFetch.apply(this, args);

        if (response.status === 429) {
          notify('RATE_LIMIT_HIT', { status: 429, message: 'Too Many Requests (429)' });
        } else if (response.status >= 400 && response.status < 500) {
          notify('CLIENT_ERROR', { status: response.status });
        }

        if (response.body && response.status === 200) {
          try {
            const clone = response.clone();
            const reader = clone.body.getReader();
            let totalBytes = 0;
            let fullTextSample = '';

            const pump = () => {
              reader.read().then(({ done, value }) => {
                if (done) {
                  const duration = Date.now() - startTime;
                  notify('STREAM_COMPLETE', {
                    totalBytes,
                    duration,
                    sampleSnippet: fullTextSample.slice(0, 300)
                  });
                  return;
                }
                totalBytes += value ? value.length : 0;
                if (fullTextSample.length < 500 && value) {
                  try {
                    const chunkStr = new TextDecoder().decode(value);
                    fullTextSample += chunkStr;
                    if (chunkStr.includes('RESOURCE_EXHAUSTED') || 
                        chunkStr.includes('quota') || 
                        chunkStr.includes('limit reached')) {
                      notify('RATE_LIMIT_HIT', { status: 429, message: 'Resource Exhausted in stream' });
                    }
                  } catch (e) {}
                }
                pump();
              }).catch(() => {});
            };
            pump();
          } catch (e) {}
        }

        return response;
      } catch (err) {
        notify('STREAM_ERROR', { error: err.message });
        throw err;
      }
    }

    return originalFetch.apply(this, args);
  };

  // 2. 劫持 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._kiminoUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._kiminoUrl && (this._kiminoUrl.includes('/_/BardChatUi/') || this._kiminoUrl.includes('batchexecute'))) {
      this.addEventListener('load', () => {
        if (this.status === 429) {
          notify('RATE_LIMIT_HIT', { status: 429, message: 'XHR 429' });
        }
      });
    }
    return originalSend.call(this, body);
  };

  console.log('[星语喵伴] 网页网络嗅探器初始化完毕喵～🐾');
})();
