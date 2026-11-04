const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const DEFAULT_GATEWAY_PORT = 3920;
const ALLOWED_PROTOCOLS = ["openai", "anthropic"];
const ENC_PREFIX = "enc:v1:";

const ENV_KEY_CANDIDATES = [
  { providerId: "deepseek", providerName: "DeepSeek", vars: ["DEEPSEEK_API_KEY"] },
  { providerId: "anthropic", providerName: "Anthropic Claude", vars: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"] },
  { providerId: "openai", providerName: "OpenAI", vars: ["OPENAI_API_KEY"] },
  { providerId: "openrouter", providerName: "OpenRouter", vars: ["OPENROUTER_API_KEY"] },
  { providerId: "siliconflow", providerName: "SiliconFlow", vars: ["SILICONFLOW_API_KEY"] }
];

const BUILTIN_PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    builtin: true,
    enabled: false,
    baseUrl: "https://api.deepseek.com",
    protocol: "openai",
    apiKey: "",
    models: [
      { id: "deepseek-chat", name: "deepseek-chat", contextLength: "128K", tags: ["工具"], enabled: true },
      { id: "deepseek-reasoner", name: "deepseek-reasoner", contextLength: "128K", tags: ["推理", "工具"], enabled: true },
      { id: "deepseek-coder", name: "deepseek-coder", contextLength: "128K", tags: ["工具"], enabled: true }
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    builtin: true,
    enabled: false,
    baseUrl: "https://api.anthropic.com",
    protocol: "anthropic",
    apiKey: "",
    models: [
      { id: "claude-sonnet-4-20250514", name: "claude-sonnet-4-20250514", contextLength: "200K", tags: ["视觉", "推理", "工具"], enabled: true },
      { id: "claude-3-7-sonnet-latest", name: "claude-3-7-sonnet-latest", contextLength: "200K", tags: ["视觉", "推理", "工具"], enabled: true },
      { id: "claude-3-5-haiku-latest", name: "claude-3-5-haiku-latest", contextLength: "200K", tags: ["视觉", "工具"], enabled: true }
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    builtin: true,
    enabled: false,
    baseUrl: "https://api.openai.com",
    protocol: "openai",
    apiKey: "",
    models: [
      { id: "gpt-4o", name: "gpt-4o", contextLength: "128K", tags: ["视觉", "工具"], enabled: true },
      { id: "o3-mini", name: "o3-mini", contextLength: "200K", tags: ["推理", "工具"], enabled: true }
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    builtin: true,
    enabled: false,
    baseUrl: "https://openrouter.ai/api",
    protocol: "openai",
    apiKey: "",
    models: [
      { id: "anthropic/claude-3.7-sonnet", name: "anthropic/claude-3.7-sonnet", contextLength: "200K", tags: ["视觉", "推理", "工具"], enabled: true },
      { id: "deepseek/deepseek-r1", name: "deepseek/deepseek-r1", contextLength: "128K", tags: ["推理"], enabled: true }
    ]
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    builtin: true,
    enabled: false,
    baseUrl: "https://api.siliconflow.cn",
    protocol: "openai",
    apiKey: "",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", name: "deepseek-ai/DeepSeek-V3", contextLength: "64K", tags: ["工具"], enabled: true },
      { id: "deepseek-ai/DeepSeek-R1", name: "deepseek-ai/DeepSeek-R1", contextLength: "64K", tags: ["推理"], enabled: true }
    ]
  },
  {
    id: "ollama",
    name: "本地 Ollama",
    builtin: true,
    enabled: false,
    baseUrl: "http://127.0.0.1:11434",
    protocol: "openai",
    apiKey: "",
    models: [
      { id: "qwen2.5-coder:7b", name: "qwen2.5-coder:7b", contextLength: "32K", tags: ["工具"], enabled: true },
      { id: "llama3.2-vision", name: "llama3.2-vision", contextLength: "128K", tags: ["视觉"], enabled: true }
    ]
  }
];

function localDateString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultCatstellaDir() {
  return process.env.CATSTELLA_HOME || path.join(os.homedir(), ".catstella");
}

function defaultModelsPath(options = {}) {
  if (options.filePath) return options.filePath;
  if (process.env.CATSTELLA_MODELS_PATH) return process.env.CATSTELLA_MODELS_PATH;
  return path.join(defaultCatstellaDir(), "models.json");
}

function sanitizeUrl(raw, fallback = "") {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return trimmed;
  } catch {
    return fallback;
  }
}

function maskApiKey(rawKey) {
  if (typeof rawKey !== "string" || !rawKey) return "";
  if (rawKey.length <= 8) return "••••••••";
  const prefix = rawKey.slice(0, Math.min(4, rawKey.indexOf("-") > 0 ? rawKey.indexOf("-") + 1 : 3));
  const suffix = rawKey.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

function generateGatewayToken() {
  return `sk-catstella-${crypto.randomBytes(16).toString("hex")}`;
}

function inferModelMetadata(modelId, raw = {}) {
  const id = String(modelId || "").toLowerCase();
  const tags = [];
  if (/(vision|vl|gpt-4o|claude-3|claude-sonnet-4|claude-opus-4|gemini|pixtral|llava)/i.test(id)) tags.push("视觉");
  if (/(reasoner|(?:^|[-/:])r[123](?:$|[-/:])|o1|o3|o4|qwq|thinking)/i.test(id)) tags.push("推理");
  if (!/(embed|whisper|tts|moderation|rerank)/i.test(id)) tags.push("工具");
  let contextLength = "128K";
  const ctxNum = Number(raw.context_length || raw.context_window || raw.max_model_len || 0);
  if (ctxNum >= 900000) contextLength = "1M";
  else if (ctxNum >= 190000) contextLength = "200K";
  else if (ctxNum >= 120000) contextLength = "128K";
  else if (ctxNum >= 60000) contextLength = "64K";
  else if (ctxNum >= 28000) contextLength = "32K";
  else if (/claude/i.test(id)) contextLength = "200K";
  else if (/1m/i.test(id)) contextLength = "1M";
  return { contextLength, tags };
}

function sanitizeModel(input) {
  if (!input || typeof input !== "object") return null;
  const id = typeof input.id === "string" ? input.id.trim().slice(0, 160) : "";
  if (!id) return null;
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 160) : id;
  const contextLength = typeof input.contextLength === "string" && input.contextLength.trim()
    ? input.contextLength.trim().slice(0, 24)
    : inferModelMetadata(id).contextLength;
  const rawTags = Array.isArray(input.tags) ? input.tags : [];
  const tags = [...new Set(rawTags.filter(t => typeof t === "string" && t.trim()).map(t => t.trim().slice(0, 16)))].slice(0, 6);
  return {
    id,
    name,
    contextLength,
    tags,
    enabled: input.enabled !== false
  };
}

class KeyVault {
  constructor(secretPath) {
    this.secretPath = secretPath;
    this._cachedKey = null;
  }

  _identitySalt() {
    let user = "local";
    try { user = os.userInfo().username || "local"; } catch {}
    return `catstella-byok:${user}@${os.hostname()}`;
  }

  _getDerivedKey(createIfMissing) {
    if (this._cachedKey) return this._cachedKey;
    let masterBytes = null;
    try {
      if (fs.existsSync(this.secretPath)) {
        const raw = fs.readFileSync(this.secretPath, "utf8").trim();
        if (/^[0-9a-f]{64}$/i.test(raw)) masterBytes = Buffer.from(raw, "hex");
      }
    } catch {}
    if (!masterBytes) {
      if (!createIfMissing) return null;
      masterBytes = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(this.secretPath), { recursive: true });
      const tmp = `${this.secretPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, masterBytes.toString("hex") + "\n", { mode: 0o600 });
      fs.renameSync(tmp, this.secretPath);
    }
    this._cachedKey = crypto.scryptSync(masterBytes, this._identitySalt(), 32);
    return this._cachedKey;
  }

  encrypt(plaintext) {
    if (typeof plaintext !== "string" || !plaintext) return "";
    if (plaintext.startsWith(ENC_PREFIX)) return plaintext;
    const key = this._getDerivedKey(true);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(stored) {
    if (typeof stored !== "string" || !stored) return "";
    if (!stored.startsWith(ENC_PREFIX)) return stored;
    const rest = stored.slice(ENC_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length !== 3) return "";
    const key = this._getDerivedKey(false);
    if (!key) return "";
    try {
      const iv = Buffer.from(parts[0], "hex");
      const tag = Buffer.from(parts[1], "hex");
      const data = Buffer.from(parts[2], "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }
}

function detectByokOptIn(options = {}) {
  const argv = Array.isArray(options.argv) ? options.argv : process.argv;
  const env = options.env || process.env;
  if (argv.includes("--disable-byok")) return false;
  if (argv.includes("--enable-byok")) return true;
  if (env.CATSTELLA_ENABLE_BYOK === "0") return false;
  if (env.CATSTELLA_ENABLE_BYOK === "1") return true;
  if (typeof options.enabled === "boolean") return options.enabled;

  if (options.installRoot && fs.existsSync(path.join(options.installRoot, ".starsuite-install"))) {
    return fs.existsSync(path.join(options.installRoot, ".byok-enabled"));
  }

  const filePath = defaultModelsPath(options);
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return parsed && typeof parsed === "object" && parsed.enabled === true;
    }
  } catch {}
  return false;
}

class ModelStore {
  constructor(options = {}) {
    this.filePath = defaultModelsPath(options);
    this.now = options.now || (() => new Date());
    const secretPath = options.secretPath || path.join(path.dirname(this.filePath), ".master.key");
    this.vault = new KeyVault(secretPath);
    this.data = this._load();
  }

  _defaultState() {
    return {
      version: 1,
      enabled: false,
      port: DEFAULT_GATEWAY_PORT,
      activeProviderId: "deepseek",
      activeModelId: "",
      gateway: {
        gatewayTokenEnabled: false,
        gatewayToken: "",
        failoverEnabled: true,
        hostPortalEnabled: true,
        mcpBridgeEnabled: false
      },
      stats: {
        date: localDateString(this.now()),
        todayRequests: 0
      },
      providers: structuredClone(BUILTIN_PROVIDERS)
    };
  }

  _load() {
    const fallback = this._defaultState();
    try {
      if (!fs.existsSync(this.filePath)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
      return this.sanitize(parsed);
    } catch {
      return fallback;
    }
  }

  reload() {
    this.data = this._load();
    return this.data;
  }

  sanitize(input = {}) {
    const base = this._defaultState();
    const enabled = typeof input.enabled === "boolean" ? input.enabled : base.enabled;
    const rawPort = Number(input.port);
    const port = Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535 ? rawPort : DEFAULT_GATEWAY_PORT;

    const today = localDateString(this.now());
    const statsDate = typeof input.stats?.date === "string" ? input.stats.date : today;
    const todayRequests = statsDate === today && Number.isInteger(input.stats?.todayRequests) && input.stats.todayRequests >= 0
      ? input.stats.todayRequests
      : 0;

    const rawGateway = input.gateway && typeof input.gateway === "object" ? input.gateway : {};
    const decryptedGwToken = typeof rawGateway.gatewayToken === "string" ? this.vault.decrypt(rawGateway.gatewayToken) : "";
    const gateway = {
      gatewayTokenEnabled: rawGateway.gatewayTokenEnabled === true,
      gatewayToken: decryptedGwToken,
      failoverEnabled: rawGateway.failoverEnabled !== false,
      hostPortalEnabled: rawGateway.hostPortalEnabled !== false,
      mcpBridgeEnabled: rawGateway.mcpBridgeEnabled === true
    };

    const rawProviders = Array.isArray(input.providers) ? input.providers : null;
    const providers = [];
    const seenIds = new Set();

    if (rawProviders) {
      for (const raw of rawProviders) {
        const sanitized = this._sanitizeProvider(raw);
        if (sanitized && !seenIds.has(sanitized.id)) {
          seenIds.add(sanitized.id);
          providers.push(sanitized);
        }
      }
      for (const preset of BUILTIN_PROVIDERS) {
        if (!seenIds.has(preset.id) && !Array.isArray(input.removedBuiltins)) {
          seenIds.add(preset.id);
          providers.push(structuredClone(preset));
        } else if (!seenIds.has(preset.id) && Array.isArray(input.removedBuiltins) && !input.removedBuiltins.includes(preset.id)) {
          seenIds.add(preset.id);
          providers.push(structuredClone(preset));
        }
      }
    } else {
      for (const preset of BUILTIN_PROVIDERS) providers.push(structuredClone(preset));
    }

    const removedBuiltins = Array.isArray(input.removedBuiltins)
      ? input.removedBuiltins.filter(id => typeof id === "string" && BUILTIN_PROVIDERS.some(b => b.id === id))
      : [];

    const activeProviderId = typeof input.activeProviderId === "string" && providers.some(p => p.id === input.activeProviderId)
      ? input.activeProviderId
      : (providers.find(p => p.enabled)?.id || providers[0]?.id || "deepseek");

    const activeModelId = typeof input.activeModelId === "string" ? input.activeModelId.trim().slice(0, 160) : "";

    return {
      version: 1,
      enabled,
      port,
      activeProviderId,
      activeModelId,
      gateway,
      removedBuiltins,
      stats: { date: today, todayRequests },
      providers
    };
  }

  _sanitizeProvider(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const id = typeof raw.id === "string" ? raw.id.trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) : "";
    if (!id) return null;
    const preset = BUILTIN_PROVIDERS.find(p => p.id === id);
    const name = typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : (preset?.name || id);
    const protocol = ALLOWED_PROTOCOLS.includes(raw.protocol) ? raw.protocol : (preset?.protocol || "openai");
    const baseUrl = sanitizeUrl(raw.baseUrl, preset?.baseUrl || "https://api.openai.com");
    const decryptedKey = typeof raw.apiKey === "string" ? this.vault.decrypt(raw.apiKey) : "";

    const models = [];
    const seenModels = new Set();
    if (Array.isArray(raw.models)) {
      for (const m of raw.models) {
        const sm = sanitizeModel(m);
        if (sm && !seenModels.has(sm.id)) {
          seenModels.add(sm.id);
          models.push(sm);
        }
      }
    } else if (preset) {
      for (const m of preset.models) models.push(structuredClone(m));
    }

    return {
      id,
      name,
      builtin: Boolean(preset),
      enabled: raw.enabled === true,
      baseUrl,
      protocol,
      apiKey: decryptedKey,
      models
    };
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const gw = this.data.gateway || {};
    const serialized = {
      version: 1,
      enabled: this.data.enabled === true,
      port: this.data.port,
      activeProviderId: this.data.activeProviderId,
      activeModelId: this.data.activeModelId || "",
      gateway: {
        gatewayTokenEnabled: gw.gatewayTokenEnabled === true,
        gatewayToken: gw.gatewayToken ? this.vault.encrypt(gw.gatewayToken) : "",
        failoverEnabled: gw.failoverEnabled !== false,
        hostPortalEnabled: gw.hostPortalEnabled !== false,
        mcpBridgeEnabled: gw.mcpBridgeEnabled === true
      },
      removedBuiltins: this.data.removedBuiltins || [],
      stats: this._freshStats(),
      providers: this.data.providers.map(p => ({
        id: p.id,
        name: p.name,
        builtin: Boolean(p.builtin),
        enabled: p.enabled === true,
        baseUrl: p.baseUrl,
        protocol: p.protocol,
        apiKey: p.apiKey ? this.vault.encrypt(p.apiKey) : "",
        models: p.models.map(m => ({
          id: m.id,
          name: m.name,
          contextLength: m.contextLength,
          tags: [...m.tags],
          enabled: m.enabled !== false
        }))
      }))
    };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(serialized, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    return true;
  }

  _freshStats() {
    const today = localDateString(this.now());
    if (this.data.stats?.date !== today) {
      this.data.stats = { date: today, todayRequests: 0 };
    }
    return { ...this.data.stats };
  }

  recordRequest() {
    const stats = this._freshStats();
    stats.todayRequests += 1;
    this.data.stats = stats;
    return stats.todayRequests;
  }

  setEnabled(enabled) {
    this.data.enabled = Boolean(enabled);
    this.save();
    return this.data.enabled;
  }

  setActiveProvider(providerId) {
    const p = this.getProvider(providerId);
    if (p) {
      this.data.activeProviderId = providerId;
      if (this.data.activeModelId && !p.models.some(m => m.id === this.data.activeModelId && m.enabled)) {
        this.data.activeModelId = p.models.find(m => m.enabled)?.id || p.models[0]?.id || "";
      }
      this.save();
      return true;
    }
    return false;
  }

  setActiveModel(providerId, modelId) {
    const p = this.getProvider(providerId);
    if (!p) return false;
    const m = p.models.find(item => item.id === modelId);
    if (!m) return false;
    this.data.activeProviderId = providerId;
    this.data.activeModelId = m.id;
    if (!p.enabled) p.enabled = true;
    if (!m.enabled) m.enabled = true;
    this.save();
    return true;
  }

  updateGatewayConfig(patch = {}) {
    const gw = this.data.gateway || (this.data.gateway = {
      gatewayTokenEnabled: false,
      gatewayToken: "",
      failoverEnabled: true,
      hostPortalEnabled: true,
      mcpBridgeEnabled: false
    });
    if (typeof patch.failoverEnabled === "boolean") gw.failoverEnabled = patch.failoverEnabled;
    if (typeof patch.hostPortalEnabled === "boolean") gw.hostPortalEnabled = patch.hostPortalEnabled;
    if (typeof patch.mcpBridgeEnabled === "boolean") gw.mcpBridgeEnabled = patch.mcpBridgeEnabled;
    if (typeof patch.gatewayTokenEnabled === "boolean") {
      gw.gatewayTokenEnabled = patch.gatewayTokenEnabled;
      if (gw.gatewayTokenEnabled && !gw.gatewayToken) {
        gw.gatewayToken = generateGatewayToken();
      }
    }
    if (patch.regenerateToken === true) {
      gw.gatewayToken = generateGatewayToken();
    }
    if (typeof patch.gatewayToken === "string" && patch.gatewayToken.trim()) {
      gw.gatewayToken = patch.gatewayToken.trim();
    }
    const rawPort = Number(patch.port);
    if (Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535) {
      this.data.port = rawPort;
    }
    this.save();
    return { ...gw };
  }

  revealGatewayToken() {
    const gw = this.data.gateway || (this.data.gateway = {});
    if (!gw.gatewayToken) {
      gw.gatewayToken = generateGatewayToken();
      this.save();
    }
    return gw.gatewayToken;
  }

  scanEnvApiKeys(env = process.env) {
    const found = [];
    for (const entry of ENV_KEY_CANDIDATES) {
      for (const varName of entry.vars) {
        const val = typeof env?.[varName] === "string" ? env[varName].trim() : "";
        if (val && val.length >= 6) {
          const existing = this.getProvider(entry.providerId);
          found.push({
            providerId: entry.providerId,
            providerName: existing?.name || entry.providerName,
            envVar: varName,
            maskedKey: maskApiKey(val),
            alreadyConfigured: Boolean(existing?.apiKey)
          });
          break;
        }
      }
    }
    return found;
  }

  importEnvApiKeys(providerIds = [], env = process.env) {
    const allowSet = new Set(Array.isArray(providerIds) ? providerIds : []);
    let imported = 0;
    for (const entry of ENV_KEY_CANDIDATES) {
      if (allowSet.size > 0 && !allowSet.has(entry.providerId)) continue;
      for (const varName of entry.vars) {
        const val = typeof env?.[varName] === "string" ? env[varName].trim() : "";
        if (val && val.length >= 6) {
          const provider = this.getProvider(entry.providerId);
          if (provider) {
            provider.apiKey = val;
            provider.enabled = true;
            imported++;
          }
          break;
        }
      }
    }
    if (imported > 0) {
      const currentActive = this.getProvider(this.data.activeProviderId);
      if (!currentActive || !currentActive.enabled) {
        const firstEnabled = this.data.providers.find(p => p.enabled);
        if (firstEnabled) this.data.activeProviderId = firstEnabled.id;
      }
      this.save();
    }
    return { imported };
  }

  getProvider(providerId) {
    return this.data.providers.find(p => p.id === providerId) || null;
  }

  revealApiKey(providerId) {
    const p = this.getProvider(providerId);
    return p ? p.apiKey || "" : "";
  }

  upsertProvider(payload = {}) {
    const rawId = typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64)
      : `custom-${Date.now().toString(36)}`;
    const existing = this.getProvider(rawId);
    const preset = BUILTIN_PROVIDERS.find(p => p.id === rawId);

    if (existing) {
      if (typeof payload.name === "string" && payload.name.trim()) existing.name = payload.name.trim().slice(0, 80);
      if (typeof payload.enabled === "boolean") existing.enabled = payload.enabled;
      if (typeof payload.baseUrl === "string") {
        const cleanUrl = sanitizeUrl(payload.baseUrl, "");
        if (!cleanUrl) throw new Error("Base URL 必须为有效的 http/https 地址");
        existing.baseUrl = cleanUrl;
      }
      if (typeof payload.protocol === "string" && ALLOWED_PROTOCOLS.includes(payload.protocol)) {
        existing.protocol = payload.protocol;
      }
      if (typeof payload.apiKey === "string") {
        existing.apiKey = payload.apiKey.trim();
      }
      if (Array.isArray(payload.models)) {
        const nextModels = [];
        const seen = new Set();
        for (const m of payload.models) {
          const sm = sanitizeModel(m);
          if (sm && !seen.has(sm.id)) {
            seen.add(sm.id);
            nextModels.push(sm);
          }
        }
        existing.models = nextModels;
      }
    } else {
      const cleanUrl = sanitizeUrl(payload.baseUrl, preset?.baseUrl || "");
      if (!cleanUrl) throw new Error("Base URL 必须为有效的 http/https 地址");
      const created = this._sanitizeProvider({
        id: rawId,
        name: payload.name || preset?.name || rawId,
        enabled: payload.enabled ?? true,
        baseUrl: cleanUrl,
        protocol: ALLOWED_PROTOCOLS.includes(payload.protocol) ? payload.protocol : (preset?.protocol || "openai"),
        apiKey: typeof payload.apiKey === "string" ? payload.apiKey.trim() : "",
        models: Array.isArray(payload.models) ? payload.models : (preset ? structuredClone(preset.models) : [])
      });
      if (!created) throw new Error("无效的供应商配置");
      this.data.removedBuiltins = (this.data.removedBuiltins || []).filter(id => id !== rawId);
      this.data.providers.push(created);
      this.data.activeProviderId = created.id;
    }

    if (payload.setActive === true) {
      this.data.activeProviderId = rawId;
    }
    this.save();
    return this.getProvider(rawId);
  }

  deleteProvider(providerId) {
    const idx = this.data.providers.findIndex(p => p.id === providerId);
    if (idx < 0) return false;
    const removed = this.data.providers[idx];
    this.data.providers.splice(idx, 1);
    if (removed.builtin) {
      this.data.removedBuiltins = [...new Set([...(this.data.removedBuiltins || []), removed.id])];
    }
    if (this.data.activeProviderId === providerId) {
      this.data.activeProviderId = this.data.providers.find(p => p.enabled)?.id || this.data.providers[0]?.id || "";
    }
    this.save();
    return true;
  }

  upsertModel(providerId, modelInput, previousModelId = null) {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error("供应商不存在");
    const sm = sanitizeModel(modelInput);
    if (!sm) throw new Error("模型名称不能为空");
    const targetId = previousModelId || sm.id;
    const idx = provider.models.findIndex(m => m.id === targetId);
    if (idx >= 0) {
      if (sm.id !== targetId && provider.models.some((m, i) => i !== idx && m.id === sm.id)) {
        throw new Error("同名模型已存在");
      }
      provider.models[idx] = sm;
      if (this.data.activeProviderId === providerId && this.data.activeModelId === targetId) {
        this.data.activeModelId = sm.id;
      }
    } else {
      if (provider.models.some(m => m.id === sm.id)) {
        provider.models = provider.models.map(m => (m.id === sm.id ? sm : m));
      } else {
        provider.models.push(sm);
      }
    }
    this.save();
    return sm;
  }

  deleteModel(providerId, modelId) {
    const provider = this.getProvider(providerId);
    if (!provider) return false;
    const before = provider.models.length;
    provider.models = provider.models.filter(m => m.id !== modelId);
    if (provider.models.length !== before) {
      if (this.data.activeProviderId === providerId && this.data.activeModelId === modelId) {
        this.data.activeModelId = provider.models.find(m => m.enabled)?.id || "";
      }
      this.save();
      return true;
    }
    return false;
  }

  mergeDiscoveredModels(providerId, remoteModels = []) {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error("供应商不存在");
    let added = 0;
    const existingIds = new Set(provider.models.map(m => m.id));
    for (const raw of remoteModels) {
      const id = typeof raw === "string" ? raw : (raw?.id || raw?.name || "");
      if (!id || existingIds.has(id)) continue;
      const inferred = inferModelMetadata(id, typeof raw === "object" ? raw : {});
      const sm = sanitizeModel({
        id,
        name: typeof raw?.display_name === "string" ? raw.display_name : id,
        contextLength: inferred.contextLength,
        tags: inferred.tags,
        enabled: true
      });
      if (sm) {
        existingIds.add(sm.id);
        provider.models.push(sm);
        added++;
      }
    }
    if (added > 0) this.save();
    return { added, total: provider.models.length };
  }

  _preferredModelForProvider(provider) {
    if (!provider) return "";
    if (provider.id === this.data.activeProviderId && this.data.activeModelId) {
      const preferred = provider.models.find(m => m.enabled && m.id === this.data.activeModelId);
      if (preferred) return preferred.id;
    }
    return provider.models.find(m => m.enabled)?.id || provider.models[0]?.id || "";
  }

  resolveRoute(requestedModel, requestedProviderId = "") {
    const enabledProviders = this.data.providers.filter(p => p.enabled);
    if (!enabledProviders.length) return null;

    if (requestedProviderId) {
      const explicit = enabledProviders.find(p => p.id === requestedProviderId);
      if (explicit) {
        return { provider: explicit, modelId: requestedModel || this._preferredModelForProvider(explicit) };
      }
    }

    if (typeof requestedModel === "string" && requestedModel) {
      // 1. Prefix syntax "providerId:modelId"
      const colonIdx = requestedModel.indexOf(":");
      if (colonIdx > 0) {
        const prefix = requestedModel.slice(0, colonIdx);
        const rest = requestedModel.slice(colonIdx + 1);
        const byPrefix = enabledProviders.find(p => p.id === prefix);
        if (byPrefix && rest) return { provider: byPrefix, modelId: rest };
      }
      // 2. Exact match on activeProvider first, then any enabled provider
      const active = enabledProviders.find(p => p.id === this.data.activeProviderId);
      if (active && active.models.some(m => m.enabled && m.id === requestedModel)) {
        return { provider: active, modelId: requestedModel };
      }
      for (const p of enabledProviders) {
        if (p.models.some(m => m.enabled && m.id === requestedModel)) {
          return { provider: p, modelId: requestedModel };
        }
      }
    }

    const fallbackProvider = enabledProviders.find(p => p.id === this.data.activeProviderId) || enabledProviders[0];
    const fallbackModel = requestedModel || this._preferredModelForProvider(fallbackProvider);
    return { provider: fallbackProvider, modelId: fallbackModel };
  }

  resolveCandidateRoutes(requestedModel, requestedProviderId = "") {
    const primary = this.resolveRoute(requestedModel, requestedProviderId);
    if (!primary) return [];

    const failover = this.data.gateway?.failoverEnabled !== false;
    const hasExplicitPrefix = typeof requestedModel === "string" && requestedModel.includes(":") &&
      this.data.providers.some(p => p.enabled && requestedModel.startsWith(`${p.id}:`));
    if (!failover || requestedProviderId || hasExplicitPrefix) {
      return [primary];
    }

    const candidates = [primary];
    const seenProviders = new Set([primary.provider.id]);
    const enabledProviders = this.data.providers.filter(p => p.enabled);

    // First: other enabled providers that explicitly list the requested model
    if (typeof requestedModel === "string" && requestedModel) {
      for (const p of enabledProviders) {
        if (seenProviders.has(p.id)) continue;
        if (p.models.some(m => m.enabled && m.id === requestedModel)) {
          seenProviders.add(p.id);
          candidates.push({ provider: p, modelId: requestedModel });
        }
      }
    }

    // Second: remaining enabled providers using their preferred default model
    const orderedFallbacks = [
      ...enabledProviders.filter(p => p.id === this.data.activeProviderId),
      ...enabledProviders.filter(p => p.id !== this.data.activeProviderId)
    ];
    for (const p of orderedFallbacks) {
      if (seenProviders.has(p.id)) continue;
      const defaultModel = this._preferredModelForProvider(p);
      if (defaultModel) {
        seenProviders.add(p.id);
        candidates.push({ provider: p, modelId: defaultModel });
      }
    }
    return candidates;
  }

  listOpenAiModels() {
    const list = [];
    for (const p of this.data.providers) {
      if (!p.enabled) continue;
      for (const m of p.models) {
        if (!m.enabled) continue;
        list.push({
          id: m.id,
          object: "model",
          created: 1700000000,
          owned_by: p.id,
          provider_name: p.name,
          context_length: m.contextLength,
          capabilities: [...m.tags]
        });
      }
    }
    return list;
  }

  getPublicSnapshot(runtime = {}) {
    const stats = this._freshStats();
    const providerTelemetry = runtime.providers || {};
    const providers = this.data.providers.map(p => {
      const tel = providerTelemetry[p.id] || {};
      let status = "disabled";
      if (p.enabled) {
        if (tel.status === "online" || tel.status === "error" || tel.status === "warning") {
          status = tel.status;
        } else {
          status = "warning";
        }
      }
      return {
        id: p.id,
        name: p.name,
        builtin: Boolean(p.builtin),
        enabled: p.enabled,
        baseUrl: p.baseUrl,
        protocol: p.protocol,
        hasApiKey: Boolean(p.apiKey),
        apiKeyMasked: maskApiKey(p.apiKey),
        status,
        pingMs: typeof tel.pingMs === "number" ? tel.pingMs : null,
        balance: tel.balance || null,
        lastError: tel.lastError || "",
        checkedAt: tel.checkedAt || null,
        modelPings: tel.modelPings || {},
        models: p.models.map(m => ({ ...m, tags: [...m.tags] }))
      };
    });

    const activeProvider = providers.find(p => p.id === this.data.activeProviderId && p.enabled)
      || providers.find(p => p.enabled)
      || providers.find(p => p.id === this.data.activeProviderId)
      || providers[0]
      || null;

    const activeModel = activeProvider ? this._preferredModelForProvider(activeProvider) : "";

    const enabledModelChoices = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      for (const m of p.models) {
        if (!m.enabled) continue;
        enabledModelChoices.push({
          providerId: p.id,
          providerName: p.name,
          modelId: m.id,
          modelName: m.name || m.id,
          active: Boolean(activeProvider && activeProvider.id === p.id && activeModel === m.id)
        });
      }
    }

    const gw = this.data.gateway || {};
    const boundPort = runtime.port || this.data.port || DEFAULT_GATEWAY_PORT;

    return {
      available: runtime.available === true,
      gatewayOnline: runtime.gatewayOnline === true,
      port: boundPort,
      endpoint: `http://127.0.0.1:${boundPort}`,
      activeProviderId: this.data.activeProviderId,
      activeModelId: activeModel,
      gateway: {
        gatewayTokenEnabled: gw.gatewayTokenEnabled === true,
        hasGatewayToken: Boolean(gw.gatewayToken),
        gatewayTokenMasked: maskApiKey(gw.gatewayToken),
        failoverEnabled: gw.failoverEnabled !== false,
        hostPortalEnabled: gw.hostPortalEnabled !== false,
        mcpBridgeEnabled: gw.mcpBridgeEnabled === true
      },
      activeProvider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
            enabled: activeProvider.enabled,
            status: activeProvider.status,
            pingMs: activeProvider.pingMs,
            balance: activeProvider.balance || null,
            activeModel
          }
        : null,
      enabledModelChoices,
      todayRequests: typeof runtime.todayRequests === "number" ? runtime.todayRequests : stats.todayRequests,
      presets: BUILTIN_PROVIDERS.map(p => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, protocol: p.protocol })),
      providers
    };
  }
}

module.exports = {
  DEFAULT_GATEWAY_PORT,
  ALLOWED_PROTOCOLS,
  BUILTIN_PROVIDERS,
  ENV_KEY_CANDIDATES,
  ModelStore,
  KeyVault,
  detectByokOptIn,
  defaultCatstellaDir,
  defaultModelsPath,
  maskApiKey,
  generateGatewayToken,
  inferModelMetadata,
  sanitizeUrl,
  localDateString
};
