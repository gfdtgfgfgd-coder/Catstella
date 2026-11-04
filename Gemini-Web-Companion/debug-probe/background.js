// 星语探针 · Background SW：接收内容脚本采样批次并 POST 到本机收集器
const COLLECTOR = 'http://127.0.0.1:17877/kg-probe';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'kg-probe-flush' || !Array.isArray(msg.batch)) return false;
  fetch(COLLECTOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ probe: 'kg-probe', v: 1, at: new Date().toISOString(), records: msg.batch }),
    keepalive: true,
  }).then((r) => sendResponse({ ok: r.ok })).catch((e) => sendResponse({ ok: false, err: String(e) }));
  return true; // 异步 sendResponse
});
