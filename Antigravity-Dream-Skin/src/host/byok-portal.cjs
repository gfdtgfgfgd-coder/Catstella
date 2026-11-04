// Serialized into Antigravity's renderer via local CDP when BYOK & Host Portal are opted-in.
// Strictly read-only public status summary (no API keys ever enter the host renderer).
// Mounts a native-styled portal card ONLY inside Antigravity's Settings -> Models view and cleans up completely on destroy.
async function installByokPortal(config) {
  const key = "__agyByokPortalV1";
  if (window[key]) {
    if (window[key].owner !== config.owner) {
      throw new Error("BYOK 传送门由另一个实例管理");
    }
    window[key].update(config);
    return window[key].status();
  }

  let state = { ...config };
  let active = true;
  let observer = null;
  let timer = null;
  let hostEl = null;
  let shadow = null;
  let pendingOpenRequest = false;

  const SKIP_SELECTOR = ".monaco-editor,.cm-editor,.xterm,.integrated-terminal,pre,code,[data-testid='model-selector-trigger']";
  const EXACT_SECTION_TITLES = new Set([
    "model quota",
    "model credits",
    "model selection",
    "gemini models",
    "模型配额",
    "模型额度",
    "Gemini 模型"
  ]);
  const SUBTITLE_HINTS = [
    "manage your model quota and credits",
    "管理您的模型配额与额度",
    "refresh quota and credits data",
    "刷新配额与额度数据"
  ];

  function isDarkSurface(el) {
    let cur = el || document.body;
    while (cur && cur !== document.documentElement) {
      const bg = getComputedStyle(cur).backgroundColor;
      const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
      if (m) {
        const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (alpha > 0.15) {
          const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
          return lum < 140;
        }
      }
      cur = cur.parentElement;
    }
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function findModelsSettingsContainer() {
    if (!document.body) return null;
    const roots = document.querySelectorAll("[role='dialog'], [data-testid*='settings' i], main, [class*='settings' i]");
    const searchRoots = roots.length ? Array.from(roots) : [document.body];

    for (const root of searchRoots) {
      if (!root || (root.closest && root.closest(SKIP_SELECTOR))) continue;
      const candidates = root.querySelectorAll("h1, h2, h3, h4, p, span, div, [aria-label]");
      for (const node of candidates) {
        if (node.id === "catstella-byok-portal-host" || node.closest?.(SKIP_SELECTOR)) continue;
        const aria = (node.getAttribute?.("aria-label") || "").trim().toLowerCase();
        if (aria && SUBTITLE_HINTS.some(h => aria.includes(h))) {
          return findMountParent(node, root);
        }
        if (node.children.length > 2) continue;
        const txt = (node.textContent || "").trim();
        if (!txt || txt.length > 90) continue;
        const lower = txt.toLowerCase();
        if (EXACT_SECTION_TITLES.has(lower) || SUBTITLE_HINTS.some(h => lower.includes(h))) {
          return findMountParent(node, root);
        }
      }
    }
    return null;
  }

  function findMountParent(anchorNode, boundaryRoot) {
    let cur = anchorNode.parentElement;
    let best = cur;
    let depth = 0;
    while (cur && cur !== boundaryRoot && cur !== document.body && depth < 6) {
      const style = getComputedStyle(cur);
      if (style.display.includes("flex") || style.display.includes("grid") || style.overflowY === "auto" || cur.tagName === "SECTION") {
        best = cur;
      }
      if (cur.getBoundingClientRect().height > 180) {
        best = cur;
        break;
      }
      cur = cur.parentElement;
      depth++;
    }
    return best;
  }

  function triggerOpenManager() {
    pendingOpenRequest = true;
    if (state.bridgePort && state.portalNonce) {
      fetch(`http://127.0.0.1:${state.bridgePort}/companion/open-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "byok", nonce: state.portalNonce })
      })
        .then(r => { if (r.ok) pendingOpenRequest = false; })
        .catch(() => {});
    }
  }

  function renderShadowContent(dark) {
    if (!shadow) return;
    const online = state.gatewayOnline === true;
    const statusDot = online
      ? (state.providerStatus === "error" ? "#ef4444" : "#22c55e")
      : "#94a3b8";
    const statusLabel = online
      ? (state.providerStatus === "error" ? "上游异常" : "运行就绪")
      : "网关离线";
    const endpoint = state.endpoint || "http://127.0.0.1:3920";
    const activeRoute = state.activeProviderName
      ? `${state.activeProviderName}${state.activeModel ? " · " + state.activeModel : ""}`
      : "尚未启用供应商";
    const pingStr = typeof state.pingMs === "number" ? `${state.pingMs} ms` : "待测速";
    const balStr = state.balanceText || "";
    const reqStr = `${Number(state.todayRequests) || 0} 次`;

    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          margin-top: 16px;
          margin-bottom: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        }
        .card {
          border-radius: 12px;
          padding: 14px 16px;
          border: 1px solid ${dark ? "rgba(167, 139, 250, 0.28)" : "rgba(124, 58, 237, 0.22)"};
          background: ${dark ? "linear-gradient(135deg, rgba(30, 27, 46, 0.78), rgba(20, 20, 32, 0.85))" : "linear-gradient(135deg, rgba(245, 243, 255, 0.9), rgba(255, 255, 255, 0.95))"};
          color: ${dark ? "#f1f5f9" : "#1e293b"};
          box-shadow: 0 4px 16px ${dark ? "rgba(0,0,0,0.22)" : "rgba(124,58,237,0.06)"};
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          font-weight: 600;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          padding: 2px 9px;
          border-radius: 999px;
          background: ${dark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.05)"};
          color: ${dark ? "#cbd5e1" : "#475569"};
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: ${statusDot};
          box-shadow: 0 0 6px ${statusDot};
        }
        .metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 16px;
          margin-top: 10px;
          font-size: 12px;
          color: ${dark ? "#94a3b8" : "#64748b"};
        }
        .metrics strong {
          color: ${dark ? "#e2e8f0" : "#334155"};
          font-weight: 600;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        button {
          appearance: none;
          border-radius: 8px;
          padding: 6px 11px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.12s ease, opacity 0.12s ease;
        }
        button:active { transform: scale(0.97); }
        .btn-ghost {
          border: 1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)"};
          background: transparent;
          color: ${dark ? "#e2e8f0" : "#334155"};
        }
        .btn-primary {
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.32);
        }
      </style>
      <div class="card">
        <div class="top">
          <div class="brand">
            <span>🐾 星语第三方模型网关 (BYOK)</span>
            <span class="pill"><span class="dot"></span><span id="p-status"></span></span>
          </div>
          <div class="actions">
            <button type="button" class="btn-ghost" id="btn-copy">📋 复制端点</button>
            <button type="button" class="btn-primary" id="btn-open">🔌 打开模型管理器 ↗</button>
          </div>
        </div>
        <div class="metrics">
          <span>当前路由: <strong id="p-route"></strong></span>
          <span>延迟: <strong id="p-ping"></strong></span>
          ${balStr ? `<span>余额: <strong id="p-bal"></strong></span>` : ""}
          <span>今日转发: <strong id="p-req"></strong></span>
        </div>
      </div>
    `;

    shadow.getElementById("p-status").textContent = `${statusLabel} · ${endpoint.replace(/^https?:\/\//, "")}`;
    shadow.getElementById("p-route").textContent = activeRoute;
    shadow.getElementById("p-ping").textContent = pingStr;
    if (balStr && shadow.getElementById("p-bal")) {
      shadow.getElementById("p-bal").textContent = balStr;
    }
    shadow.getElementById("p-req").textContent = reqStr;

    const copyBtn = shadow.getElementById("btn-copy");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(`${endpoint}/v1`).then(() => {
        copyBtn.textContent = "✅ 已复制 /v1";
        setTimeout(() => { copyBtn.textContent = "📋 复制端点"; }, 1600);
      }).catch(() => {});
    });

    shadow.getElementById("btn-open").addEventListener("click", () => {
      triggerOpenManager();
    });
  }

  function syncMount() {
    timer = null;
    if (!active) return;
    const container = findModelsSettingsContainer();
    if (!container) {
      if (hostEl && hostEl.parentNode) {
        hostEl.parentNode.removeChild(hostEl);
      }
      return;
    }
    if (!hostEl) {
      hostEl = document.createElement("div");
      hostEl.id = "catstella-byok-portal-host";
      shadow = hostEl.attachShadow({ mode: "open" });
    }
    if (hostEl.parentElement !== container) {
      container.appendChild(hostEl);
    }
    renderShadowContent(isDarkSurface(container));
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(syncMount, 180);
  }

  function update(nextConfig) {
    state = { ...state, ...nextConfig };
    syncMount();
  }

  function consumeOpenRequest() {
    const had = pendingOpenRequest;
    pendingOpenRequest = false;
    return had;
  }

  function destroy() {
    active = false;
    clearTimeout(timer);
    if (observer) observer.disconnect();
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
    delete window[key];
    return { removed: true };
  }

  syncMount();
  observer = new MutationObserver(schedule);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const status = () => ({
    applied: active,
    mounted: Boolean(hostEl && hostEl.isConnected),
    owner: state.owner
  });

  window[key] = { update, destroy, status, consumeOpenRequest, owner: state.owner };
  return status();
}

module.exports = { installByokPortal };
