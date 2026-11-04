const { discover, Cdp } = require("../../../shared/host.cjs");
const { installTheme } = require("../host/theme.cjs");
class HostController {
  constructor(loader, onStatus, options = {}) {
    this.owner = options.owner || require("node:crypto").randomUUID();
    this.loader = loader;
    this.onStatus = onStatus;
    this.discover = options.discover || discover;
    this.createClient = options.createClient || (url => new Cdp(url));
    this.client = null;
    this.settings = { enabled: false };
    this.status = { connected: false, applied: false, message: "等待连接 Antigravity" };
    this.signature = null;
    this.revision = 0;
  }
  report(value) {
    this.status = { ...this.status, ...value };
    try { this.onStatus(this.status); } catch (error) {
      console.warn("皮肤状态通知失败：", error.message);
    }
  }
  tick() {
    if (this.stopping) return Promise.resolve();
    if (!this.inflight) {
      this.inflight = this.drain().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }
  async drain() {
    let revision;
    do {
      revision = this.revision;
      await this.runTick(revision);
    } while (!this.stopping && revision !== this.revision);
  }
  async runTick(revision) {
    const settings = { ...this.settings };
    try {
      if (!this.client || this.client.closed) {
        const found = await this.discover();
        if (!found) {
          this.report({ connected: false, applied: false, message: "请先打开 Antigravity，检测到后自动连接" });
          return;
        }
        this.client = this.createClient(found.target.webSocketDebuggerUrl);
        this.signature = null;
      }
      const current = await this.client.evaluate(
        "({ready:document.readyState,themed:!!window.__agyDreamSkinV2?.status().applied,owner:window.__agyDreamSkinV2?.owner})"
      );
      if (revision !== this.revision || this.stopping) return;
      if (!settings.enabled) {
        if (current.themed && current.owner === this.owner) {
          await this.client.evaluate("window.__agyDreamSkinV2?.destroy()");
        }
        this.signature = null;
        this.report({
          connected: true, applied: false,
          message: current.themed && current.owner !== this.owner
            ? "已连接 · 当前实例未启用，另一个皮肤实例正在运行"
            : "已连接 · 皮肤已关闭，宿主恢复原样"
        });
        return;
      }
      if (current.themed && current.owner !== this.owner) {
        this.report({ connected: true, applied: false, message: "已连接 · 皮肤由另一个运行实例管理" });
        return;
      }
      const signature = JSON.stringify(settings);
      if (!current.themed || signature !== this.signature) {
        const payload = { ...this.loader.payload(settings), owner: this.owner };
        const result = await this.client.evaluate("(" + installTheme.toString() + ")(" + JSON.stringify(payload) + ")");
        this.signature = signature;
        this.report({
          connected: true, ...result,
          message: result.applied ? "已应用到真实 Antigravity · 可随时关闭" : "宿主布局已变化，等待重新应用"
        });
      }
    } catch (error) {
      this.client?.close();
      this.client = null;
      this.signature = null;
      this.report({ connected: false, applied: false, message: "暂未接入：" + error.message });
    }
  }
  start(settings) {
    clearInterval(this.timer);
    this.stopping = false;
    this.update(settings);
    this.timer = setInterval(() => this.tick(), 2500);
  }
  update(settings) {
    this.settings = { ...settings };
    this.revision++;
    return this.tick();
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    try { await this.inflight; } catch {}
    try {
      if (this.client && !this.client.closed) {
        await this.client.evaluate("window.__agyDreamSkinV2?.owner===" + JSON.stringify(this.owner) + " ? window.__agyDreamSkinV2.destroy() : null");
      }
    } catch {}
    this.client?.close();
  }
}
module.exports = { HostController };
