const crypto = require("node:crypto");
const { discover, Cdp } = require("../../../shared/host.cjs");
const { installByokPortal } = require("../host/byok-portal.cjs");

class ByokPortalController {
  constructor(options = {}) {
    this.owner = options.owner || crypto.randomUUID();
    this.discover = options.discover || discover;
    this.createClient = options.createClient || (url => new Cdp(url));
    this.onOpenSettings = options.onOpenSettings || (() => {});
    this.onStatus = options.onStatus || (() => {});

    this.state = {
      enabled: false,
      gatewayOnline: false,
      endpoint: "http://127.0.0.1:3920",
      activeProviderName: "",
      activeModel: "",
      providerStatus: "disabled",
      pingMs: null,
      balanceText: "",
      todayRequests: 0,
      bridgePort: null,
      portalNonce: ""
    };

    this.status = { applied: false, mounted: false };
    this.signature = null;
    this.client = null;
    this.stopping = false;
    this.timer = null;
  }

  report(patch) {
    this.status = { ...this.status, ...patch };
    try { this.onStatus(this.status); } catch {}
  }

  setFromSnapshot(byokSnap = {}, bridgeInfo = {}) {
    const available = byokSnap?.available === true;
    const portalOn = available && byokSnap?.gateway?.hostPortalEnabled !== false;
    const ap = byokSnap?.activeProvider || null;
    this.state = {
      enabled: portalOn,
      gatewayOnline: byokSnap?.gatewayOnline === true,
      endpoint: byokSnap?.endpoint || "http://127.0.0.1:3920",
      activeProviderName: ap?.enabled ? (ap.name || "") : "",
      activeModel: ap?.enabled ? (ap.activeModel || "") : "",
      providerStatus: ap?.status || "disabled",
      pingMs: typeof ap?.pingMs === "number" ? ap.pingMs : null,
      balanceText: ap?.balance?.formatted || "",
      todayRequests: Number(byokSnap?.todayRequests) || 0,
      bridgePort: bridgeInfo.port || null,
      portalNonce: bridgeInfo.portalNonce || ""
    };
    return this.tick();
  }

  start() {
    clearInterval(this.timer);
    this.stopping = false;
    this.timer = setInterval(() => this.tick(), 2500);
    if (this.timer.unref) this.timer.unref();
    return this.tick();
  }

  async destroyInHost() {
    if (!this.client || this.client.closed) return;
    await this.client.evaluate(
      `window.__agyByokPortalV1 && window.__agyByokPortalV1.owner === ${JSON.stringify(this.owner)} ? window.__agyByokPortalV1.destroy() : null`
    );
  }

  async tick() {
    if (this.stopping) return;
    if (!this.state.enabled) {
      if (this.client) {
        try { await this.destroyInHost(); } catch {}
        this.client.close();
        this.client = null;
      }
      if (this.signature !== null) {
        this.signature = null;
        this.report({ applied: false, mounted: false });
      }
      return;
    }

    try {
      if (!this.client || this.client.closed) {
        const found = await this.discover();
        if (!found) {
          this.signature = null;
          return;
        }
        this.client = this.createClient(found.target.webSocketDebuggerUrl);
        this.signature = null;
      }

      const probe = await this.client.evaluate(
        `({
          installed: !!window.__agyByokPortalV1,
          owner: window.__agyByokPortalV1 && window.__agyByokPortalV1.owner,
          openRequested: !!(window.__agyByokPortalV1 && window.__agyByokPortalV1.consumeOpenRequest && window.__agyByokPortalV1.consumeOpenRequest())
        })`
      );

      if (probe?.openRequested) {
        try { this.onOpenSettings("byok"); } catch {}
      }

      if (probe?.installed && probe.owner !== this.owner) {
        return;
      }

      const payload = { owner: this.owner, ...this.state };
      const nextSig = JSON.stringify(payload);
      if (!probe?.installed || nextSig !== this.signature) {
        const out = await this.client.evaluate(`(${installByokPortal.toString()})(${JSON.stringify(payload)})`);
        this.signature = nextSig;
        this.report({ applied: Boolean(out?.applied), mounted: Boolean(out?.mounted) });
      }
    } catch {
      if (this.client) {
        try { this.client.close(); } catch {}
        this.client = null;
      }
      this.signature = null;
    }
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    try {
      await this.destroyInHost();
    } catch {}
    if (this.client) {
      try { this.client.close(); } catch {}
      this.client = null;
    }
  }
}

module.exports = { ByokPortalController };
