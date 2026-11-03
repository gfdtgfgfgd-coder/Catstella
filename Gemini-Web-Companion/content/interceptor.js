// 星语喵伴 · Page Context Network Interceptor (MAIN world + document_start 版)
// 注册方式见 manifest.json content_scripts[0]：world=MAIN, run_at=document_start。
// 关键设计：本脚本先于页面所有脚本执行，因此在 Angular 等框架捕获 window.fetch
// 引用【之前】就完成了 monkey-patch —— 页面后续发出的所有 batchexecute（包括
// 承载官方双周期额度数据的 MaZiqc RPC）都会被完整捕获请求体与响应体。
//
// 若引擎不支持 MAIN world（旧版 Firefox），本脚本会降级为 isolated world 补丁
// （对页面无效但无害），此时 inject-bridge.js 仍会尝试脚本注入兜底。
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
    } catch (e) { /* 页面策略异常时静默 */ }
  };

  // ===== 0. 保留原始引用（重放专用，Angular 抢不走）=====
  let originalFetch = null;
  try { originalFetch = window.fetch; } catch (e) {}

  // MaZiqc 额度 RPC 的会话级缓存（f.req 请求体 + URL 参数模板）
  const quotaRpc = {
    reqBody: null,     // f.req=...&at=... 原始 POST 表单体
    urlTemplate: null, // path + 固定 query（bl / f.sid / hl 等）
    capturedAt: 0
  };

  const ESC_QUOTA_MARKERS = ['\\u5df2\\u4f7f\\u7528', '\\u91cd\\u7f6e\\u65f6\\u95f4', '\\u6bcf\\u5468\\u9650\\u989d'];

  const rpcNameOf = (url) => {
    const m = String(url).match(/rpcids=([A-Za-z0-9_%]+)/);
    return m ? m[1] : '';
  };

  // ===== 1. 劫持 window.fetch（document_start 时机 = 必然先于 Angular）=====
  try {
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const isGeminiRpc = url.includes('/_/BardChatUi/') ||
                          url.includes('batchexecute') ||
                          url.includes('assistant.lamda.BardFrontendService') ||
                          url.includes('StreamGenerate');

      if (!isGeminiRpc) {
        return originalFetch.apply(this, args);
      }

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

        // --- 额度 RPC 被动捕获：请求体 + 响应体 ---
        const reqBodyCandidate = args[1] && typeof args[1].body === 'string' ? args[1].body : '';
        const isQuotaReq = url.includes('MaZiqc') || reqBodyCandidate.includes('MaZiqc') || reqBodyCandidate.includes('%22MaZiqc%22');
        if (response.status === 200 && (isQuotaReq || isGeminiRpc)) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            if (text.includes('"MaZiqc"') || isQuotaReq) {
              if (reqBodyCandidate && !quotaRpc.reqBody) {
                quotaRpc.reqBody = reqBodyCandidate;
                quotaRpc.urlTemplate = String(url).split('?')[0] + '?' + (String(url).split('?')[1] || '')
                  .split('&').filter((kv) => kv.startsWith('_reqid=') === false).join('&');
                quotaRpc.capturedAt = Date.now();
              }
              notify('QUOTA_RPC_RAW', {
                rpc: 'MaZiqc',
                responseText: text.slice(0, 60000),
                capturedReqBody: quotaRpc.reqBody ? true : false,
                source: 'boot'
              });
            }
          } catch (e) {}
        } else if (response.status === 200 && response.body) {
          // 兜底：流式扫描 RESOURCE_EXHAUSTED
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
          } catch (e) { /* 流读取失败不影响原始响应 */ }
        } else {
          // 非 200 / 无 body 的 RPC 也要给 STREAM_COMPLETE，保证轮次计数闭合
          notify('STREAM_COMPLETE', { totalBytes: 0, duration: Date.now() - startTime, sampleSnippet: '' });
        }

        return response;
      } catch (err) {
        notify('STREAM_ERROR', { error: err && err.message });
        throw err;
      }
    };
  } catch (e) {
    // 劫持 fetch 失败：嗅探降级，但绝不抛出到页面
  }

  try {
    // ===== 2. 劫持 XMLHttpRequest（仅监听）=====
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try { this._kiminoUrl = url; } catch (e) {}
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        const u = String(this._kiminoUrl || '');
        if (u.includes('/_/BardChatUi/') || u.includes('batchexecute')) {
          this.addEventListener('load', () => {
            if (this.status === 429) {
              notify('RATE_LIMIT_HIT', { status: 429, message: 'XHR 429' });
            }
            const isXhrQuota = u.includes('MaZiqc') || (typeof body === 'string' && (body.includes('MaZiqc') || body.includes('%22MaZiqc%22')));
            if (this.status === 200) {
              try {
                const text = this.responseType === 'json' ? JSON.stringify(this.response) : String(this.responseText || '');
                if (text.includes('"MaZiqc"') || isXhrQuota) {
                  if (typeof body === 'string' && !quotaRpc.reqBody) {
                    quotaRpc.reqBody = body;
                    quotaRpc.urlTemplate = u.split('?')[0] + '?' + (u.split('?')[1] || '')
                      .split('&').filter((kv) => kv.startsWith('_reqid=') === false).join('&');
                    quotaRpc.capturedAt = Date.now();
                  }
                  notify('QUOTA_RPC_RAW', {
                    rpc: 'MaZiqc',
                    responseText: text.slice(0, 60000),
                    capturedReqBody: quotaRpc.reqBody ? true : false,
                    source: 'boot-xhr'
                  });
                }
              } catch (e) {}
            }
          });
        }
      } catch (e) {}
      return originalSend.call(this, body);
    };
  } catch (e) {
    // 劫持 XHR 失败：同样只影响嗅探
  }

  // ===== 3. 静默重放服务：tracker 随时可请求重放 MaZiqc 刷新额度（零 UI）=====
  window.addEventListener('message', (event) => {
    try {
      if (event.data && event.data.source === 'KIMINO_TRACKER' && event.data.type === 'QUOTA_RPC_REPLAY') {
        if (!quotaRpc.reqBody || !originalFetch) {
          notify('QUOTA_RPC_RAW', { rpc: 'MaZiqc', responseText: '', error: 'no-captured-req', source: 'replay' });
          return;
        }
        const freshUrl = (quotaRpc.urlTemplate || '').replace(/_reqid=\d+/, '_reqid=' + Math.floor(Math.random() * 900000 + 100000));
        originalFetch(freshUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: quotaRpc.reqBody
        }).then(async (res) => {
          const text = await res.text();
          notify('QUOTA_RPC_RAW', {
            rpc: 'MaZiqc',
            responseText: text.slice(0, 60000),
            status: res.status,
            source: 'replay'
          });
        }).catch((err) => {
          notify('QUOTA_RPC_RAW', { rpc: 'MaZiqc', responseText: '', error: String(err && err.message), source: 'replay' });
        });
      }
    } catch (e) {}
  });

  // ===== 4. 向 Content Script 汇报安装成功（inject-bridge 握手）=====
  window.__KIMINO_INTERCEPTOR_READY_AT__ = Date.now();
  notify('INTERCEPTOR_READY', { engine: navigator.userAgent || '', world: 'main' });

  console.log('[星语喵伴] 网络嗅探器(MAIN world·document_start)初始化完毕，额度RPC捕获已就位喵～🐾');
})();
