const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const {
  ModelStore,
  detectByokOptIn,
  defaultModelsPath,
  DEFAULT_GATEWAY_PORT,
  BUILTIN_PROVIDERS
} = require("./store.cjs");
const {
  LocalGatewayServer,
  probeExistingGateway,
  resolveUpstreamUrl,
  isTrustedGatewayOrigin,
  convertOpenAiToAnthropicPayload,
  convertAnthropicJsonToOpenAi,
  convertAnthropicToOpenAiPayload,
  convertOpenAiJsonToAnthropic
} = require("./server.cjs");
const {
  getMcpPluginStatus,
  installMcpPlugin,
  uninstallMcpPlugin
} = require("./mcp-installer.cjs");
const { ByokMcpService } = require("./mcp-server.cjs");

function adminPost(port, adminToken, endpoint, payload = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
          "x-catstella-token": adminToken
        },
        timeout: 12000
      },
      res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid daemon response")); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("网关管理通信超时")));
    req.on("error", reject);
    req.end(body);
  });
}

function buildClientSnippets({ port, activeModel, gatewayToken }) {
  const endpoint = `http://127.0.0.1:${port}`;
  const tokenVal = gatewayToken || "sk-catstella-local";
  const modelVal = activeModel || "deepseek-chat";
  return {
    endpoint,
    openAiBaseUrl: `${endpoint}/v1`,
    anthropicBaseUrl: endpoint,
    claudeCodePs1: `$env:ANTHROPIC_BASE_URL="${endpoint}"\n$env:ANTHROPIC_API_KEY="${tokenVal}"\nclaude`,
    claudeCodeBash: `export ANTHROPIC_BASE_URL="${endpoint}"\nexport ANTHROPIC_API_KEY="${tokenVal}"\nclaude`,
    openAiEnvPs1: `$env:OPENAI_BASE_URL="${endpoint}/v1"\n$env:OPENAI_API_KEY="${tokenVal}"`,
    curlExample: `curl ${endpoint}/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer ${tokenVal}" -d "{\\"model\\":\\"${modelVal}\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Hello\\"}]}"`
  };
}

class GatewayCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.env = options.env || process.env;
    this.pluginsDir = options.pluginsDir || (options.filePath ? path.join(path.dirname(options.filePath), "gemini-plugins") : undefined);
    // Use real ~/.gemini/config/plugins in normal app runtime unless an isolated test filePath or explicit pluginsDir was supplied
    if (!options.pluginsDir && !options.isolatedTest) {
      const isDefaultPath = path.resolve(defaultModelsPath(options)) === path.resolve(defaultModelsPath());
      if (isDefaultPath) this.pluginsDir = undefined;
    }
    this.available = detectByokOptIn(options);
    this.filePath = defaultModelsPath(options);
    this.runtimePath = path.join(path.dirname(this.filePath), "gateway-runtime.json");
    this.preferredPort = options.port || DEFAULT_GATEWAY_PORT;
    this.store = new ModelStore({ filePath: this.filePath });
    this.server = null;
    this.remoteDaemon = null;
    this.remoteTelemetry = { providers: {}, todayRequests: null };
    this._lastDaemonActivityTs = 0;
    this._readyPromise = null;
    this._pollTimer = null;
  }

  ensureReady() {
    if (!this.available) return Promise.resolve({ available: false, ready: false });
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise = this._boot();
    return this._readyPromise;
  }

  async _boot() {
    if (!this.available) return { available: false, ready: false };

    // Sync MCP plugin state on startup if user opted into MCP bridge
    if (this.store.data.gateway?.mcpBridgeEnabled === true) {
      try {
        installMcpPlugin({ pluginsDir: this.pluginsDir, modelsPath: this.filePath });
      } catch {}
    }

    // 1. Check if pre-booted standalone daemon is already alive on preferred port (handshake!)
    try {
      if (fs.existsSync(this.runtimePath)) {
        const rt = JSON.parse(fs.readFileSync(this.runtimePath, "utf8"));
        if (rt?.port && rt?.adminToken) {
          const health = await probeExistingGateway(rt.port, "127.0.0.1", 80);
          if (health && health.ok) {
            this.remoteDaemon = { port: rt.port, adminToken: rt.adminToken, pid: health.pid };
            this.remoteTelemetry = {
              providers: health.telemetry || {},
              todayRequests: typeof health.todayRequests === "number" ? health.todayRequests : undefined
            };
            this._startRemoteSync();
            this.emit("ready", { mode: "daemon", port: rt.port });
            this.emit("change", this.getSnapshot());
            return { available: true, ready: true, mode: "daemon", port: rt.port };
          }
        }
      }
    } catch {}

    // 2. Otherwise start ultra-fast in-process HTTP gateway (<15ms bind)
    this.server = new LocalGatewayServer({
      store: this.store,
      port: this.preferredPort
    });
    this.server.on("change", snap => this.emit("change", this._enrichSnapshot(snap)));
    this.server.on("activity", ev => this.emit("activity", ev));
    const { port } = await this.server.start();
    this.emit("ready", { mode: "in-process", port });
    return { available: true, ready: true, mode: "in-process", port };
  }

  _startRemoteSync() {
    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(async () => {
      if (!this.remoteDaemon) return;
      const health = await probeExistingGateway(this.remoteDaemon.port, "127.0.0.1", 300);
      if (health && health.ok) {
        this.remoteTelemetry = {
          providers: health.telemetry || {},
          todayRequests: health.todayRequests
        };
        if (health.lastActivity?.ts && health.lastActivity.ts > this._lastDaemonActivityTs) {
          this._lastDaemonActivityTs = health.lastActivity.ts;
          this.emit("activity", health.lastActivity);
        } else if (health.activeRequests > 0) {
          this.emit("activity", { type: "start", ts: Date.now() });
        }
        this.emit("change", this.getSnapshot());
      } else {
        clearInterval(this._pollTimer);
        this.remoteDaemon = null;
        this._readyPromise = null;
        this.ensureReady().catch(() => {});
      }
    }, 3500);
    if (this._pollTimer.unref) this._pollTimer.unref();
  }

  _enrichSnapshot(snap) {
    if (!snap || !snap.available) return snap;
    return {
      ...snap,
      mcpPlugin: getMcpPluginStatus({ pluginsDir: this.pluginsDir })
    };
  }

  getSnapshot() {
    if (!this.available) {
      return { available: false, gatewayOnline: false, providers: [], presets: [], enabledModelChoices: [] };
    }
    if (this.server) {
      return this._enrichSnapshot(this.server.getSnapshot(true));
    }
    if (this.remoteDaemon) {
      return this._enrichSnapshot(
        this.store.getPublicSnapshot({
          available: true,
          gatewayOnline: true,
          port: this.remoteDaemon.port,
          providers: this.remoteTelemetry.providers,
          todayRequests: this.remoteTelemetry.todayRequests
        })
      );
    }
    return this._enrichSnapshot(
      this.store.getPublicSnapshot({
        available: true,
        gatewayOnline: false,
        port: this.preferredPort
      })
    );
  }

  async _syncDaemonReload() {
    if (this.remoteDaemon) {
      try {
        await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/reload");
      } catch {}
    }
    this.emit("change", this.getSnapshot());
  }

  async handleAction(action, payload = {}) {
    if (!this.available) throw new Error("BYOK 网关未启用");

    switch (action) {
      case "getSnapshot":
        return this.getSnapshot();
      case "revealKey":
        return { apiKey: this.store.revealApiKey(payload.providerId) };
      case "revealGatewayToken":
        return { gatewayToken: this.store.revealGatewayToken(), snapshot: this.getSnapshot() };
      case "getSnippets": {
        const snap = this.getSnapshot();
        const gwToken = this.store.data.gateway?.gatewayTokenEnabled ? this.store.revealGatewayToken() : "";
        return buildClientSnippets({
          port: snap.port,
          activeModel: snap.activeProvider?.activeModel || "deepseek-chat",
          gatewayToken: gwToken
        });
      }
      case "updateGatewayConfig": {
        const nextGw = this.store.updateGatewayConfig(payload || {});
        if (payload && typeof payload.mcpBridgeEnabled === "boolean") {
          if (nextGw.mcpBridgeEnabled) {
            installMcpPlugin({ pluginsDir: this.pluginsDir, modelsPath: this.filePath });
          } else {
            uninstallMcpPlugin({ pluginsDir: this.pluginsDir });
          }
        }
        await this._syncDaemonReload();
        return this.getSnapshot();
      }
      case "setActiveProvider":
        this.store.setActiveProvider(payload.providerId);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "setActiveModel":
        this.store.setActiveModel(payload.providerId, payload.modelId);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "cycleActiveModel": {
        const snap = this.getSnapshot();
        const choices = snap.enabledModelChoices || [];
        if (choices.length > 0) {
          const delta = Number(payload?.delta) || 1;
          const curIdx = choices.findIndex(c => c.active);
          const nextIdx = curIdx >= 0
            ? (curIdx + delta + choices.length) % choices.length
            : 0;
          const picked = choices[nextIdx];
          this.store.setActiveModel(picked.providerId, picked.modelId);
          await this._syncDaemonReload();
        }
        return this.getSnapshot();
      }
      case "upsertProvider":
        this.store.upsertProvider(payload);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "deleteProvider":
        this.store.deleteProvider(payload.providerId);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "upsertModel":
        this.store.upsertModel(payload.providerId, payload.model, payload.previousModelId);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "deleteModel":
        this.store.deleteModel(payload.providerId, payload.modelId);
        await this._syncDaemonReload();
        return this.getSnapshot();
      case "scanEnvKeys":
        return { candidates: this.store.scanEnvApiKeys(this.env) };
      case "importEnvKeys": {
        const res = this.store.importEnvApiKeys(payload.providerIds, this.env);
        await this._syncDaemonReload();
        return { ...res, snapshot: this.getSnapshot() };
      }
      case "discoverOllama": {
        let res;
        if (this.server) {
          res = await this.server.discoverLocalOllama(payload || { autoEnable: true });
        } else if (this.remoteDaemon) {
          res = await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/discover-ollama", payload || { autoEnable: true });
          this.store.reload();
          const health = await probeExistingGateway(this.remoteDaemon.port, "127.0.0.1", 300);
          if (health) this.remoteTelemetry = { providers: health.telemetry || {}, todayRequests: health.todayRequests };
        } else {
          throw new Error("网关尚未就绪");
        }
        this.emit("change", this.getSnapshot());
        return { ...res, snapshot: this.getSnapshot() };
      }
      case "fetchBalance": {
        let res;
        if (this.server) {
          res = await this.server.fetchProviderBalance(payload.providerId);
        } else if (this.remoteDaemon) {
          res = await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/balance", payload);
          const health = await probeExistingGateway(this.remoteDaemon.port, "127.0.0.1", 300);
          if (health) this.remoteTelemetry = { providers: health.telemetry || {}, todayRequests: health.todayRequests };
        } else {
          throw new Error("网关尚未就绪");
        }
        this.emit("change", this.getSnapshot());
        return { ...res, snapshot: this.getSnapshot() };
      }
      case "ping": {
        let res;
        if (this.server) {
          res = await this.server.pingProvider(payload.providerId, payload.modelId);
        } else if (this.remoteDaemon) {
          res = await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/ping", payload);
          const health = await probeExistingGateway(this.remoteDaemon.port, "127.0.0.1", 300);
          if (health) this.remoteTelemetry = { providers: health.telemetry || {}, todayRequests: health.todayRequests };
        } else {
          throw new Error("网关尚未就绪");
        }
        this.emit("change", this.getSnapshot());
        return { ...res, snapshot: this.getSnapshot() };
      }
      case "fetchModels": {
        let res;
        if (this.server) {
          res = await this.server.fetchRemoteModels(payload.providerId);
        } else if (this.remoteDaemon) {
          res = await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/fetch-models", payload);
          this.store.reload();
          const health = await probeExistingGateway(this.remoteDaemon.port, "127.0.0.1", 300);
          if (health) this.remoteTelemetry = { providers: health.telemetry || {}, todayRequests: health.todayRequests };
        } else {
          throw new Error("网关尚未就绪");
        }
        this.emit("change", this.getSnapshot());
        return { ...res, snapshot: this.getSnapshot() };
      }
      default:
        throw new Error(`未知网关操作: ${action}`);
    }
  }

  async stop(options = {}) {
    clearInterval(this._pollTimer);
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    if (options.shutdownDaemon && this.remoteDaemon) {
      try {
        await adminPost(this.remoteDaemon.port, this.remoteDaemon.adminToken, "/admin/shutdown");
      } catch {}
      this.remoteDaemon = null;
    }
  }
}

module.exports = {
  GatewayCoordinator,
  LocalGatewayServer,
  ModelStore,
  ByokMcpService,
  detectByokOptIn,
  defaultModelsPath,
  probeExistingGateway,
  resolveUpstreamUrl,
  isTrustedGatewayOrigin,
  convertOpenAiToAnthropicPayload,
  convertAnthropicJsonToOpenAi,
  convertAnthropicToOpenAiPayload,
  convertOpenAiJsonToAnthropic,
  installMcpPlugin,
  uninstallMcpPlugin,
  getMcpPluginStatus,
  buildClientSnippets,
  DEFAULT_GATEWAY_PORT,
  BUILTIN_PROVIDERS
};
