const http = require("node:http");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { performance } = require("node:perf_hooks");
const crypto = require("node:crypto");
const { DEFAULT_GATEWAY_PORT } = require("./store.cjs");

const MAX_BODY_BYTES = 20 * 1024 * 1024;
const TRUSTED_EXTENSION_PROTOCOLS = new Set([
  "chrome-extension:",
  "moz-extension:",
  "safari-web-extension:",
  "vscode-webview:",
  "vscode-file:",
  "app:",
  "catstella:"
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveUpstreamUrl(baseUrl, endpointPath) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) throw new Error("供应商 Base URL 为空");
  const ep = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (cleanBase.endsWith("/v1") && ep.startsWith("/v1/")) {
    return cleanBase + ep.slice(3);
  }
  return cleanBase + ep;
}

/**
 * Validates browser Origin header using structured URL parsing (never substring/startsWith).
 * CLI/SDK/MCP requests have no Origin header and are permitted.
 * Public website origins and opaque "null" origins are blocked to prevent cross-origin quota theft.
 */
function isTrustedGatewayOrigin(originHeader) {
  if (originHeader === undefined || originHeader === "") return true;
  if (typeof originHeader !== "string" || originHeader === "null") return false;
  try {
    const parsed = new URL(originHeader);
    if (TRUSTED_EXTENSION_PROTOCOLS.has(parsed.protocol)) return true;
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return parsed.origin !== "null";
    }
    return false;
  } catch {
    return false;
  }
}

function setCorsHeaders(req, res) {
  const origin = req?.headers?.origin;
  if (origin && isTrustedGatewayOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-catstella-provider, x-catstella-token"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(req, res, statusCode, payload) {
  if (res.headersSent) return;
  setCorsHeaders(req, res);
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readRequestBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("请求体超过允许大小限制"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requestUpstream(urlString, options = {}, bodyBuffer = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      parsed,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeout ?? 120000
      },
      res => resolve({ req, res })
    );
    req.setNoDelay(true);
    req.on("timeout", () => req.destroy(new Error("上游模型响应超时")));
    req.on("error", reject);
    if (bodyBuffer && bodyBuffer.length > 0) req.write(bodyBuffer);
    req.end();
  });
}

function collectResponseBuffer(res, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    res.on("data", c => {
      total += c.length;
      if (total <= maxBytes) chunks.push(c);
    });
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

function probeExistingGateway(port, host = "127.0.0.1", timeoutMs = 80) {
  return new Promise(resolve => {
    const req = http.get({ hostname: host, port, path: "/health", timeout: timeoutMs }, res => {
      let raw = "";
      res.on("data", d => {
        raw += d;
        if (raw.length > 32768) req.destroy();
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed && parsed.service === "catstella-byok-gateway" ? parsed : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

function safeJsonParse(str, fallback = {}) {
  if (typeof str !== "string" || !str.trim()) return fallback;
  try {
    const val = JSON.parse(str);
    return val && typeof val === "object" ? val : fallback;
  } catch {
    return fallback;
  }
}

/* =========================================================================
 * Protocol Bridge A: OpenAI (/v1/chat/completions) -> Anthropic (/v1/messages)
 * ========================================================================= */
function convertOpenAiToAnthropicPayload(openAiBody, modelId) {
  const rawMessages = Array.isArray(openAiBody.messages) ? openAiBody.messages : [];
  const systemParts = [];
  const messages = [];

  for (const m of rawMessages) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "system" || m.role === "developer") {
      if (typeof m.content === "string") systemParts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const p of m.content) if (p?.type === "text" && p.text) systemParts.push(p.text);
      }
      continue;
    }

    if (m.role === "tool") {
      const toolResultBlock = {
        type: "tool_result",
        tool_use_id: String(m.tool_call_id || "call_0"),
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")
      };
      const prev = messages[messages.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content)) {
        prev.content.push(toolResultBlock);
      } else {
        messages.push({ role: "user", content: [toolResultBlock] });
      }
      continue;
    }

    const role = m.role === "assistant" ? "assistant" : "user";
    const blocks = [];
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part?.type === "text") {
          blocks.push({ type: "text", text: String(part.text || "") });
        } else if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
          const dataMatch = part.image_url.url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (dataMatch) {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: dataMatch[1], data: dataMatch[2] }
            });
          }
        }
      }
    } else if (typeof m.content === "string" && m.content) {
      blocks.push({ type: "text", text: m.content });
    }

    if (role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (!tc?.function?.name) continue;
        blocks.push({
          type: "tool_use",
          id: tc.id || `toolu_${crypto.randomBytes(6).toString("hex")}`,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments, {})
        });
      }
    }

    messages.push({
      role,
      content: blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : (blocks.length ? blocks : "")
    });
  }

  const out = {
    model: modelId,
    max_tokens: Number.isInteger(openAiBody.max_tokens)
      ? openAiBody.max_tokens
      : (Number.isInteger(openAiBody.max_completion_tokens) ? openAiBody.max_completion_tokens : 4096),
    messages: messages.length ? messages : [{ role: "user", content: "Hello" }],
    stream: openAiBody.stream === true
  };
  if (systemParts.length) out.system = systemParts.join("\n\n");
  if (typeof openAiBody.temperature === "number") out.temperature = openAiBody.temperature;

  if (Array.isArray(openAiBody.tools) && openAiBody.tools.length) {
    out.tools = openAiBody.tools
      .filter(t => t?.function?.name)
      .map(t => ({
        name: t.function.name,
        description: t.function.description || "",
        input_schema: t.function.parameters || { type: "object", properties: {} }
      }));
  }
  return out;
}

function convertAnthropicJsonToOpenAi(anthJson, modelId) {
  const blocks = Array.isArray(anthJson?.content) ? anthJson.content : [];
  const text = blocks.filter(b => b?.type === "text").map(b => b.text || "").join("");
  const thinking = blocks.filter(b => b?.type === "thinking").map(b => b.thinking || "").join("");
  const toolCalls = blocks
    .filter(b => b?.type === "tool_use")
    .map(b => ({
      id: b.id || `call_${crypto.randomBytes(6).toString("hex")}`,
      type: "function",
      function: {
        name: b.name,
        arguments: JSON.stringify(b.input || {})
      }
    }));

  const msg = { role: "assistant", content: text || (toolCalls.length ? null : "") };
  if (thinking) msg.reasoning_content = thinking;
  if (toolCalls.length) msg.tool_calls = toolCalls;

  let finishReason = "stop";
  if (anthJson?.stop_reason === "max_tokens") finishReason = "length";
  else if (anthJson?.stop_reason === "tool_use" || toolCalls.length) finishReason = "tool_calls";

  return {
    id: anthJson?.id || `chatcmpl-${crypto.randomBytes(6).toString("hex")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [{ index: 0, message: msg, finish_reason: finishReason }],
    usage: {
      prompt_tokens: anthJson?.usage?.input_tokens ?? 0,
      completion_tokens: anthJson?.usage?.output_tokens ?? 0,
      total_tokens: (anthJson?.usage?.input_tokens ?? 0) + (anthJson?.usage?.output_tokens ?? 0)
    }
  };
}

/* =========================================================================
 * Protocol Bridge B: Anthropic (/v1/messages) -> OpenAI (/v1/chat/completions)
 * Enables Claude Code & Anthropic SDKs to drive DeepSeek / SiliconFlow / Ollama
 * ========================================================================= */
function convertAnthropicToOpenAiPayload(anthBody, modelId) {
  const outMessages = [];

  if (typeof anthBody.system === "string" && anthBody.system.trim()) {
    outMessages.push({ role: "system", content: anthBody.system });
  } else if (Array.isArray(anthBody.system)) {
    const sysText = anthBody.system
      .filter(b => b?.type === "text" && b.text)
      .map(b => b.text)
      .join("\n\n");
    if (sysText) outMessages.push({ role: "system", content: sysText });
  }

  const rawMessages = Array.isArray(anthBody.messages) ? anthBody.messages : [];
  for (const m of rawMessages) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : "user";

    if (typeof m.content === "string") {
      outMessages.push({ role, content: m.content });
      continue;
    }

    if (!Array.isArray(m.content)) continue;

    if (role === "user") {
      const contentParts = [];
      for (const b of m.content) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "tool_result") {
          let resultText = "";
          if (typeof b.content === "string") resultText = b.content;
          else if (Array.isArray(b.content)) {
            resultText = b.content.map(sub => (sub?.type === "text" ? sub.text : JSON.stringify(sub))).join("\n");
          } else if (b.content !== undefined) {
            resultText = JSON.stringify(b.content);
          }
          outMessages.push({
            role: "tool",
            tool_call_id: String(b.tool_use_id || "call_0"),
            content: resultText
          });
        } else if (b.type === "text") {
          contentParts.push({ type: "text", text: String(b.text || "") });
        } else if (b.type === "image" && b.source?.type === "base64" && b.source.data) {
          const mime = b.source.media_type || "image/png";
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${b.source.data}` }
          });
        }
      }
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        outMessages.push({ role: "user", content: contentParts[0].text });
      } else if (contentParts.length > 0) {
        outMessages.push({ role: "user", content: contentParts });
      }
    } else {
      let textAcc = "";
      let reasoningAcc = "";
      const toolCalls = [];
      for (const b of m.content) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "text" && b.text) textAcc += b.text;
        else if (b.type === "thinking" && b.thinking) reasoningAcc += b.thinking;
        else if (b.type === "tool_use" && b.name) {
          toolCalls.push({
            id: b.id || `call_${crypto.randomBytes(6).toString("hex")}`,
            type: "function",
            function: {
              name: b.name,
              arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input || {})
            }
          });
        }
      }
      const assistantMsg = {
        role: "assistant",
        content: textAcc || (toolCalls.length ? null : "")
      };
      if (reasoningAcc) assistantMsg.reasoning_content = reasoningAcc;
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      outMessages.push(assistantMsg);
    }
  }

  const out = {
    model: modelId,
    messages: outMessages.length ? outMessages : [{ role: "user", content: "Hello" }],
    stream: anthBody.stream === true
  };

  if (Number.isInteger(anthBody.max_tokens)) out.max_tokens = anthBody.max_tokens;
  if (typeof anthBody.temperature === "number") out.temperature = anthBody.temperature;
  if (typeof anthBody.top_p === "number") out.top_p = anthBody.top_p;
  if (Array.isArray(anthBody.stop_sequences) && anthBody.stop_sequences.length) {
    out.stop = anthBody.stop_sequences;
  }

  if (Array.isArray(anthBody.tools) && anthBody.tools.length) {
    out.tools = anthBody.tools
      .filter(t => t?.name)
      .map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description || "",
          parameters: t.input_schema || { type: "object", properties: {} }
        }
      }));
    if (anthBody.tool_choice?.type === "any") out.tool_choice = "required";
    else if (anthBody.tool_choice?.type === "auto") out.tool_choice = "auto";
    else if (anthBody.tool_choice?.type === "tool" && anthBody.tool_choice.name) {
      out.tool_choice = { type: "function", function: { name: anthBody.tool_choice.name } };
    }
  }

  return out;
}

function convertOpenAiJsonToAnthropic(openAiJson, modelId) {
  const choice = Array.isArray(openAiJson?.choices) ? openAiJson.choices[0] : null;
  const msg = choice?.message || {};
  const content = [];

  const reasoning = msg.reasoning_content || msg.reasoning || "";
  if (typeof reasoning === "string" && reasoning) {
    content.push({ type: "thinking", thinking: reasoning });
  }
  if (typeof msg.content === "string" && msg.content) {
    content.push({ type: "text", text: msg.content });
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (!tc?.function?.name) continue;
      content.push({
        type: "tool_use",
        id: tc.id || `toolu_${crypto.randomBytes(6).toString("hex")}`,
        name: tc.function.name,
        input: safeJsonParse(tc.function.arguments, {})
      });
    }
  }
  if (!content.length) {
    content.push({ type: "text", text: "" });
  }

  let stopReason = "end_turn";
  if (choice?.finish_reason === "tool_calls" || content.some(b => b.type === "tool_use")) stopReason = "tool_use";
  else if (choice?.finish_reason === "length") stopReason = "max_tokens";

  return {
    id: openAiJson?.id || `msg_${crypto.randomBytes(8).toString("hex")}`,
    type: "message",
    role: "assistant",
    model: modelId,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openAiJson?.usage?.prompt_tokens ?? 0,
      output_tokens: openAiJson?.usage?.completion_tokens ?? 0
    }
  };
}

function shouldFailoverStatus(statusCode) {
  return statusCode === 429 || statusCode === 408 || statusCode >= 500;
}

class LocalGatewayServer extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.store) throw new Error("LocalGatewayServer requires a ModelStore instance");
    this.store = options.store;
    this.host = options.host || "127.0.0.1";
    this.preferredPort = typeof options.port === "number" ? options.port : (this.store.data.port || DEFAULT_GATEWAY_PORT);
    this.maxPortAttempts = options.maxPortAttempts ?? 16;
    this.adminToken = options.adminToken || crypto.randomBytes(24).toString("hex");
    this.boundPort = null;
    this.startedAt = null;
    this.server = null;
    this.sockets = new Set();
    this.telemetry = { providers: {} };
    this.activeRequests = 0;
    this.lastActivity = null;
    this._saveStatsTimer = null;
  }

  get isRunning() {
    return Boolean(this.server && this.boundPort);
  }

  async start() {
    if (this.isRunning) return { port: this.boundPort, host: this.host };

    const candidates = [];
    if (this.preferredPort === 0) {
      candidates.push(0);
    } else {
      for (let i = 0; i < this.maxPortAttempts; i++) {
        const candidate = this.preferredPort + i;
        if (candidate <= 65535) candidates.push(candidate);
      }
      candidates.push(0);
    }

    let lastErr = null;
    for (const candidatePort of candidates) {
      try {
        const bound = await this._tryListen(candidatePort);
        this.boundPort = bound;
        this.startedAt = Date.now();
        this.emit("ready", { host: this.host, port: this.boundPort });
        this.emit("change", this.getSnapshot());
        return { host: this.host, port: this.boundPort };
      } catch (err) {
        lastErr = err;
        if (err && err.code === "EADDRINUSE") continue;
        throw err;
      }
    }
    throw lastErr || new Error("无法绑定本地模型网关端口");
  }

  _tryListen(port) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this._handleRequest(req, res).catch(err => {
          if (!res.headersSent) {
            sendJson(req, res, 502, { error: { message: err?.message || "网关内部转发错误", type: "gateway_error" } });
          } else {
            try { res.end(); } catch {}
          }
        });
      });

      srv.on("connection", socket => {
        socket.setNoDelay(true);
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
      });

      const onError = err => {
        srv.removeAllListeners();
        reject(err);
      };
      srv.once("error", onError);
      srv.listen(port, this.host, () => {
        srv.removeListener("error", onError);
        this.server = srv;
        const addr = srv.address();
        resolve(typeof addr === "object" && addr ? addr.port : port);
      });
    });
  }

  async stop() {
    clearTimeout(this._saveStatsTimer);
    if (this._dirtyStats) {
      try { this.store.save(); } catch {}
      this._dirtyStats = false;
    }
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    this.boundPort = null;
    for (const socket of this.sockets) {
      try { socket.destroy(); } catch {}
    }
    this.sockets.clear();
    await new Promise(resolve => srv.close(() => resolve()));
    this.emit("stopped");
  }

  getSnapshot(available = true) {
    return this.store.getPublicSnapshot({
      available,
      gatewayOnline: this.isRunning,
      port: this.boundPort || this.preferredPort,
      providers: this.telemetry.providers
    });
  }

  _emitActivity(type, extra = {}) {
    this.lastActivity = { type, phase: type, ts: Date.now(), ...extra };
    this.emit("activity", this.lastActivity);
  }

  _recordTelemetry(providerId, patch, modelId = null) {
    const prev = this.telemetry.providers[providerId] || { modelPings: {} };
    const modelPings = { ...(prev.modelPings || {}) };
    if (modelId && typeof patch.pingMs === "number") {
      modelPings[modelId] = {
        status: patch.status,
        pingMs: patch.pingMs,
        error: patch.lastError || "",
        checkedAt: Date.now()
      };
    } else if (modelId && patch.status === "error") {
      modelPings[modelId] = {
        status: "error",
        pingMs: null,
        error: patch.lastError || "连接失败",
        checkedAt: Date.now()
      };
    }
    this.telemetry.providers[providerId] = {
      ...prev,
      ...patch,
      modelPings,
      checkedAt: Date.now()
    };
    this.emit("change", this.getSnapshot());
  }

  _bumpRequestCount() {
    this.store.recordRequest();
    this._dirtyStats = true;
    clearTimeout(this._saveStatsTimer);
    this._saveStatsTimer = setTimeout(() => {
      if (this._dirtyStats) {
        this._dirtyStats = false;
        try { this.store.save(); } catch {}
      }
    }, 1500);
    if (this._saveStatsTimer.unref) this._saveStatsTimer.unref();
  }

  _verifyClientGatewayAuth(req) {
    const gw = this.store.data.gateway;
    if (!gw || gw.gatewayTokenEnabled !== true || !gw.gatewayToken) return true;
    const expected = gw.gatewayToken;
    let candidate = "";
    const authHeader = req.headers["authorization"];
    if (typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader)) {
      candidate = authHeader.replace(/^Bearer\s+/i, "").trim();
    } else if (typeof req.headers["x-api-key"] === "string") {
      candidate = req.headers["x-api-key"].trim();
    } else if (typeof req.headers["x-catstella-token"] === "string") {
      candidate = req.headers["x-catstella-token"].trim();
    }
    if (!candidate) return false;
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async _handleRequest(req, res) {
    res.socket?.setNoDelay(true);

    // Origin guard: block drive-by browser requests from external websites or opaque origins
    if (!isTrustedGatewayOrigin(req.headers.origin)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        error: {
          message: "已拦截非受信外部网页跨域请求，保护本机 API 额度安全。",
          type: "external_origin_blocked"
        }
      }));
      return;
    }

    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || "/", `http://${this.host}:${this.boundPort || DEFAULT_GATEWAY_PORT}`);
    const pathname = urlObj.pathname;

    if (req.method === "GET" && pathname === "/health") {
      const snap = this.getSnapshot(true);
      sendJson(req, res, 200, {
        ok: true,
        service: "catstella-byok-gateway",
        port: this.boundPort,
        pid: process.pid,
        uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
        activeRequests: this.activeRequests,
        lastActivity: this.lastActivity,
        activeProvider: snap.activeProvider,
        todayRequests: snap.todayRequests,
        telemetry: this.telemetry.providers
      });
      return;
    }

    if (pathname.startsWith("/admin/")) {
      if (req.headers["x-catstella-token"] !== this.adminToken) {
        sendJson(req, res, 403, { error: { message: "Forbidden", type: "auth_error" } });
        return;
      }
      await this._handleAdmin(pathname, req, res);
      return;
    }

    // Optional local gateway token check for model routes
    if (!this._verifyClientGatewayAuth(req)) {
      sendJson(req, res, 401, {
        error: {
          message: "本机模型网关已开启安全访问口令，请携带有效的 sk-catstella 令牌。",
          type: "gateway_auth_error"
        }
      });
      return;
    }

    if (req.method === "GET" && pathname === "/v1/models") {
      sendJson(req, res, 200, {
        object: "list",
        data: this.store.listOpenAiModels()
      });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      await this._handleChatCompletions(req, res);
      return;
    }

    if (req.method === "POST" && pathname === "/v1/messages") {
      await this._handleAnthropicMessages(req, res);
      return;
    }

    sendJson(req, res, 404, { error: { message: `不支持的网关路径: ${pathname}`, type: "not_found" } });
  }

  async _handleAdmin(pathname, req, res) {
    const raw = await readRequestBody(req, 65536);
    let body = {};
    if (raw.length) {
      try { body = JSON.parse(raw.toString("utf8")); } catch {}
    }
    if (pathname === "/admin/reload") {
      this.store.reload();
      this.emit("change", this.getSnapshot());
      sendJson(req, res, 200, { ok: true, snapshot: this.getSnapshot() });
      return;
    }
    if (pathname === "/admin/ping") {
      const result = await this.pingProvider(body.providerId, body.modelId);
      sendJson(req, res, 200, result);
      return;
    }
    if (pathname === "/admin/balance") {
      const result = await this.fetchProviderBalance(body.providerId);
      sendJson(req, res, 200, result);
      return;
    }
    if (pathname === "/admin/fetch-models") {
      const result = await this.fetchRemoteModels(body.providerId);
      sendJson(req, res, 200, result);
      return;
    }
    if (pathname === "/admin/discover-ollama") {
      const result = await this.discoverLocalOllama(body);
      sendJson(req, res, 200, result);
      return;
    }
    if (pathname === "/admin/shutdown") {
      sendJson(req, res, 200, { ok: true });
      setImmediate(() => {
        this.stop().then(() => this.emit("shutdown-requested"));
      });
      return;
    }
    sendJson(req, res, 404, { error: { message: "Unknown admin action" } });
  }

  _buildProviderHeaders(provider, incomingHeaders = {}, contentType = "application/json") {
    const headers = {
      "Accept": "application/json, text/event-stream",
      "User-Agent": "Catstella-BYOK-Gateway/1.1"
    };
    if (contentType) headers["Content-Type"] = contentType;

    const gatewayTokenEnabled = this.store.data.gateway?.gatewayTokenEnabled === true;

    if (provider.protocol === "anthropic") {
      if (provider.apiKey) headers["x-api-key"] = provider.apiKey;
      else if (!gatewayTokenEnabled && incomingHeaders["x-api-key"]) headers["x-api-key"] = incomingHeaders["x-api-key"];
      headers["anthropic-version"] = incomingHeaders["anthropic-version"] || "2023-06-01";
      if (incomingHeaders["anthropic-beta"]) headers["anthropic-beta"] = incomingHeaders["anthropic-beta"];
    } else {
      if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
      else if (!gatewayTokenEnabled && incomingHeaders["authorization"]) headers["Authorization"] = incomingHeaders["authorization"];
      if (provider.id === "openrouter") {
        headers["HTTP-Referer"] = "https://github.com/lynnfei/Catstella";
        headers["X-Title"] = "Catstella";
      }
    }
    return headers;
  }

  async _handleChatCompletions(req, res) {
    const rawBody = await readRequestBody(req);
    let parsed;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      sendJson(req, res, 400, { error: { message: "请求体不是有效的 JSON", type: "invalid_request_error" } });
      return;
    }

    const explicitProvider = typeof req.headers["x-catstella-provider"] === "string" ? req.headers["x-catstella-provider"] : "";
    const candidates = this.store.resolveCandidateRoutes(parsed.model, explicitProvider);
    if (!candidates.length) {
      sendJson(req, res, 503, {
        error: {
          message: "未启用任何第三方模型供应商，请在桌宠设置中心开启供应商开关。",
          type: "gateway_unconfigured"
        }
      });
      return;
    }

    this._bumpRequestCount();
    this.activeRequests++;
    this._emitActivity("start", { providerId: candidates[0].provider.id, modelId: candidates[0].modelId });

    try {
      for (let i = 0; i < candidates.length; i++) {
        const { provider, modelId } = candidates[i];
        const isLast = i === candidates.length - 1;
        const outcome = provider.protocol === "anthropic"
          ? await this._bridgeOpenAiToAnthropic(parsed, provider, modelId, req.headers, req, res, isLast)
          : await this._forwardOpenAiDirect(parsed, provider, modelId, req.headers, req, res, isLast);

        if (outcome.handled) {
          this._emitActivity(outcome.ok ? "end" : "error", {
            providerId: provider.id,
            modelId,
            error: outcome.error || ""
          });
          return;
        }
      }
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    }
  }

  async _handleAnthropicMessages(req, res) {
    const rawBody = await readRequestBody(req);
    let parsed;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      sendJson(req, res, 400, { error: { message: "请求体不是有效的 JSON", type: "invalid_request_error" } });
      return;
    }

    const explicitProvider = typeof req.headers["x-catstella-provider"] === "string" ? req.headers["x-catstella-provider"] : "";
    const candidates = this.store.resolveCandidateRoutes(parsed.model, explicitProvider);
    if (!candidates.length) {
      sendJson(req, res, 503, {
        error: {
          message: "未启用任何第三方模型供应商，请在桌宠设置中心开启。",
          type: "gateway_unconfigured"
        }
      });
      return;
    }

    this._bumpRequestCount();
    this.activeRequests++;
    this._emitActivity("start", { providerId: candidates[0].provider.id, modelId: candidates[0].modelId });

    try {
      for (let i = 0; i < candidates.length; i++) {
        const { provider } = candidates[i];
        let modelId = candidates[i].modelId;

        // Smart alias remap: when Claude Code sends `claude-*` to a non-Anthropic provider (e.g. DeepSeek/Ollama)
        // that doesn't host that Claude model, map transparently to the provider's active model.
        if (
          provider.protocol !== "anthropic" &&
          provider.id !== "openrouter" &&
          /^claude-/i.test(modelId) &&
          !provider.models.some(m => m.id === modelId)
        ) {
          modelId = this.store._preferredModelForProvider(provider) || modelId;
        }

        const isLast = i === candidates.length - 1;
        const outcome = provider.protocol === "anthropic"
          ? await this._forwardAnthropicDirect(parsed, provider, modelId, req.headers, req, res, isLast)
          : await this._bridgeAnthropicToOpenAi(parsed, provider, modelId, req.headers, req, res, isLast);

        if (outcome.handled) {
          this._emitActivity(outcome.ok ? "end" : "error", {
            providerId: provider.id,
            modelId,
            error: outcome.error || ""
          });
          return;
        }
      }
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    }
  }

  async _forwardOpenAiDirect(openAiBody, provider, modelId, incomingHeaders, clientReq, clientRes, isLastCandidate) {
    const bodyCopy = { ...openAiBody, model: modelId };
    const outboundBuffer = Buffer.from(JSON.stringify(bodyCopy), "utf8");
    const targetUrl = resolveUpstreamUrl(provider.baseUrl, "/v1/chat/completions");
    const headers = this._buildProviderHeaders(provider, incomingHeaders);
    headers["Content-Length"] = String(outboundBuffer.length);
    return this._pipeUpstream(targetUrl, headers, outboundBuffer, provider, modelId, clientReq, clientRes, isLastCandidate);
  }

  async _forwardAnthropicDirect(anthBody, provider, modelId, incomingHeaders, clientReq, clientRes, isLastCandidate) {
    const bodyCopy = { ...anthBody, model: modelId };
    const outboundBuffer = Buffer.from(JSON.stringify(bodyCopy), "utf8");
    const targetUrl = resolveUpstreamUrl(provider.baseUrl, "/v1/messages");
    const headers = this._buildProviderHeaders(provider, incomingHeaders);
    headers["Content-Length"] = String(outboundBuffer.length);
    return this._pipeUpstream(targetUrl, headers, outboundBuffer, provider, modelId, clientReq, clientRes, isLastCandidate);
  }

  async _pipeUpstream(targetUrl, headers, outboundBuffer, provider, modelId, clientReq, clientRes, isLastCandidate) {
    const startMs = performance.now();
    let upstream;
    try {
      upstream = await requestUpstream(targetUrl, { method: "POST", headers }, outboundBuffer);
    } catch (err) {
      const errMsg = err?.message || "连接失败";
      this._recordTelemetry(provider.id, { status: "error", lastError: errMsg }, modelId);
      if (!isLastCandidate) return { handled: false };
      sendJson(clientReq, clientRes, 502, {
        error: { message: `连接上游失败 (${provider.name}): ${errMsg}`, type: "upstream_connection_error" }
      });
      return { handled: true, ok: false, error: errMsg };
    }

    const { req: upstreamReq, res: upstreamRes } = upstream;
    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
    const statusCode = upstreamRes.statusCode || 502;

    if (statusCode >= 200 && statusCode < 300) {
      this._recordTelemetry(provider.id, { status: "online", pingMs: latencyMs, lastError: "" }, modelId);
    } else {
      this._recordTelemetry(provider.id, { status: "error", lastError: `HTTP ${statusCode}` }, modelId);
      if (!isLastCandidate && shouldFailoverStatus(statusCode)) {
        upstreamRes.resume();
        upstreamReq.destroy();
        return { handled: false };
      }
    }

    const contentType = upstreamRes.headers["content-type"] || "application/json";
    const isSse = contentType.includes("text/event-stream");

    const responseHeaders = { "Content-Type": contentType, "X-Catstella-Routed-Provider": provider.id };
    if (isSse) {
      responseHeaders["Cache-Control"] = "no-cache, no-transform";
      responseHeaders["Connection"] = "keep-alive";
      responseHeaders["X-Accel-Buffering"] = "no";
    }

    setCorsHeaders(clientReq, clientRes);
    clientRes.writeHead(statusCode, responseHeaders);
    if (isSse && typeof clientRes.flushHeaders === "function") {
      clientRes.flushHeaders();
    }

    clientRes.on("close", () => {
      if (!clientRes.writableEnded) upstreamReq.destroy();
    });

    await new Promise(resolve => {
      upstreamRes.on("data", chunk => {
        if (!clientRes.destroyed) clientRes.write(chunk);
      });
      upstreamRes.on("end", () => {
        if (!clientRes.destroyed) clientRes.end();
        resolve();
      });
      upstreamRes.on("error", () => {
        if (!clientRes.destroyed) clientRes.end();
        resolve();
      });
    });

    return {
      handled: true,
      ok: statusCode >= 200 && statusCode < 300,
      error: statusCode >= 200 && statusCode < 300 ? "" : `HTTP ${statusCode}`
    };
  }

  async _bridgeOpenAiToAnthropic(openAiBody, provider, modelId, incomingHeaders, clientReq, clientRes, isLastCandidate) {
    const anthPayload = convertOpenAiToAnthropicPayload(openAiBody, modelId);
    const outboundBuffer = Buffer.from(JSON.stringify(anthPayload), "utf8");
    const targetUrl = resolveUpstreamUrl(provider.baseUrl, "/v1/messages");
    const headers = this._buildProviderHeaders(provider, incomingHeaders);
    headers["Content-Length"] = String(outboundBuffer.length);

    const startMs = performance.now();
    let upstream;
    try {
      upstream = await requestUpstream(targetUrl, { method: "POST", headers }, outboundBuffer);
    } catch (err) {
      const errMsg = err?.message || "连接失败";
      this._recordTelemetry(provider.id, { status: "error", lastError: errMsg }, modelId);
      if (!isLastCandidate) return { handled: false };
      sendJson(clientReq, clientRes, 502, {
        error: { message: `连接 Anthropic 失败: ${errMsg}`, type: "upstream_connection_error" }
      });
      return { handled: true, ok: false, error: errMsg };
    }

    const { req: upstreamReq, res: upstreamRes } = upstream;
    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
    const statusCode = upstreamRes.statusCode || 502;

    if (statusCode < 200 || statusCode >= 300) {
      const errBuf = await collectResponseBuffer(upstreamRes);
      this._recordTelemetry(provider.id, { status: "error", lastError: `HTTP ${statusCode}` }, modelId);
      if (!isLastCandidate && shouldFailoverStatus(statusCode)) {
        upstreamReq.destroy();
        return { handled: false };
      }
      setCorsHeaders(clientReq, clientRes);
      clientRes.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      clientRes.end(errBuf);
      return { handled: true, ok: false, error: `HTTP ${statusCode}` };
    }

    this._recordTelemetry(provider.id, { status: "online", pingMs: latencyMs, lastError: "" }, modelId);

    if (!anthPayload.stream) {
      const buf = await collectResponseBuffer(upstreamRes);
      const anthJson = JSON.parse(buf.toString("utf8"));
      sendJson(clientReq, clientRes, 200, convertAnthropicJsonToOpenAi(anthJson, modelId));
      return { handled: true, ok: true };
    }

    setCorsHeaders(clientReq, clientRes);
    clientRes.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Catstella-Routed-Provider": provider.id
    });
    clientRes.flushHeaders?.();

    const streamId = `chatcmpl-${crypto.randomBytes(6).toString("hex")}`;
    const created = Math.floor(Date.now() / 1000);
    let buffer = "";
    let toolCallIndex = -1;
    let sawToolUse = false;

    clientRes.on("close", () => {
      if (!clientRes.writableEnded) upstreamReq.destroy();
    });

    await new Promise(resolve => {
      upstreamRes.setEncoding("utf8");
      upstreamRes.on("data", chunk => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const ev = JSON.parse(jsonStr);
            if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
              toolCallIndex++;
              sawToolUse = true;
              const startTc = {
                id: streamId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: toolCallIndex,
                      id: ev.content_block.id || `call_${toolCallIndex}`,
                      type: "function",
                      function: { name: ev.content_block.name, arguments: "" }
                    }]
                  },
                  finish_reason: null
                }]
              };
              clientRes.write(`data: ${JSON.stringify(startTc)}\n\n`);
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && typeof ev.delta.text === "string") {
              const outChunk = {
                id: streamId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{ index: 0, delta: { content: ev.delta.text }, finish_reason: null }]
              };
              clientRes.write(`data: ${JSON.stringify(outChunk)}\n\n`);
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "thinking_delta" && typeof ev.delta.thinking === "string") {
              const thinkChunk = {
                id: streamId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{ index: 0, delta: { reasoning_content: ev.delta.thinking }, finish_reason: null }]
              };
              clientRes.write(`data: ${JSON.stringify(thinkChunk)}\n\n`);
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta" && typeof ev.delta.partial_json === "string") {
              const argChunk = {
                id: streamId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: Math.max(0, toolCallIndex),
                      function: { arguments: ev.delta.partial_json }
                    }]
                  },
                  finish_reason: null
                }]
              };
              clientRes.write(`data: ${JSON.stringify(argChunk)}\n\n`);
            } else if (ev.type === "message_stop") {
              const stopChunk = {
                id: streamId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{ index: 0, delta: {}, finish_reason: sawToolUse ? "tool_calls" : "stop" }]
              };
              clientRes.write(`data: ${JSON.stringify(stopChunk)}\n\ndata: [DONE]\n\n`);
            }
          } catch {}
        }
      });
      upstreamRes.on("end", () => {
        if (!clientRes.destroyed && !clientRes.writableEnded) clientRes.end();
        resolve();
      });
      upstreamRes.on("error", () => {
        if (!clientRes.destroyed && !clientRes.writableEnded) clientRes.end();
        resolve();
      });
    });

    return { handled: true, ok: true };
  }

  async _bridgeAnthropicToOpenAi(anthBody, provider, modelId, incomingHeaders, clientReq, clientRes, isLastCandidate) {
    const openAiPayload = convertAnthropicToOpenAiPayload(anthBody, modelId);
    const outboundBuffer = Buffer.from(JSON.stringify(openAiPayload), "utf8");
    const targetUrl = resolveUpstreamUrl(provider.baseUrl, "/v1/chat/completions");
    const headers = this._buildProviderHeaders(provider, incomingHeaders);
    headers["Content-Length"] = String(outboundBuffer.length);

    const startMs = performance.now();
    let upstream;
    try {
      upstream = await requestUpstream(targetUrl, { method: "POST", headers }, outboundBuffer);
    } catch (err) {
      const errMsg = err?.message || "连接失败";
      this._recordTelemetry(provider.id, { status: "error", lastError: errMsg }, modelId);
      if (!isLastCandidate) return { handled: false };
      sendJson(clientReq, clientRes, 502, {
        type: "error",
        error: { type: "api_error", message: `连接上游失败 (${provider.name}): ${errMsg}` }
      });
      return { handled: true, ok: false, error: errMsg };
    }

    const { req: upstreamReq, res: upstreamRes } = upstream;
    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
    const statusCode = upstreamRes.statusCode || 502;

    if (statusCode < 200 || statusCode >= 300) {
      const errBuf = await collectResponseBuffer(upstreamRes);
      this._recordTelemetry(provider.id, { status: "error", lastError: `HTTP ${statusCode}` }, modelId);
      if (!isLastCandidate && shouldFailoverStatus(statusCode)) {
        upstreamReq.destroy();
        return { handled: false };
      }
      setCorsHeaders(clientReq, clientRes);
      clientRes.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      clientRes.end(errBuf);
      return { handled: true, ok: false, error: `HTTP ${statusCode}` };
    }

    this._recordTelemetry(provider.id, { status: "online", pingMs: latencyMs, lastError: "" }, modelId);

    if (!openAiPayload.stream) {
      const buf = await collectResponseBuffer(upstreamRes);
      const openAiJson = JSON.parse(buf.toString("utf8"));
      sendJson(clientReq, clientRes, 200, convertOpenAiJsonToAnthropic(openAiJson, anthBody.model || modelId));
      return { handled: true, ok: true };
    }

    // Stream OpenAI SSE -> Anthropic Messages SSE events
    setCorsHeaders(clientReq, clientRes);
    clientRes.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Catstella-Routed-Provider": provider.id
    });
    clientRes.flushHeaders?.();

    const writeEvent = (eventName, dataObj) => {
      if (!clientRes.destroyed && !clientRes.writableEnded) {
        clientRes.write(`event: ${eventName}\ndata: ${JSON.stringify(dataObj)}\n\n`);
      }
    };

    const msgId = `msg_${crypto.randomBytes(8).toString("hex")}`;
    writeEvent("message_start", {
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        model: anthBody.model || modelId,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    });

    let buffer = "";
    let currentBlockType = null; // "thinking" | "text" | "tool_use"
    let blockIndex = -1;
    const openToolBlocks = new Map(); // openAiToolIdx -> anthropicBlockIdx
    let stopReason = "end_turn";
    let outputTokens = 0;
    let closedMessage = false;

    const closeCurrentNonToolBlock = () => {
      if (currentBlockType === "thinking" || currentBlockType === "text") {
        writeEvent("content_block_stop", { type: "content_block_stop", index: blockIndex });
        currentBlockType = null;
      }
    };

    const finalizeStream = () => {
      if (closedMessage) return;
      closedMessage = true;
      closeCurrentNonToolBlock();
      for (const bIdx of openToolBlocks.values()) {
        writeEvent("content_block_stop", { type: "content_block_stop", index: bIdx });
      }
      openToolBlocks.clear();
      writeEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens }
      });
      writeEvent("message_stop", { type: "message_stop" });
    };

    clientRes.on("close", () => {
      if (!clientRes.writableEnded) upstreamReq.destroy();
    });

    await new Promise(resolve => {
      upstreamRes.setEncoding("utf8");
      upstreamRes.on("data", chunk => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          if (jsonStr === "[DONE]") {
            finalizeStream();
            continue;
          }
          try {
            const parsedChunk = JSON.parse(jsonStr);
            if (parsedChunk?.usage?.completion_tokens) {
              outputTokens = parsedChunk.usage.completion_tokens;
            }
            const choice = Array.isArray(parsedChunk?.choices) ? parsedChunk.choices[0] : null;
            if (!choice) continue;
            const delta = choice.delta || {};

            const reasoningDelta = delta.reasoning_content || delta.reasoning;
            if (typeof reasoningDelta === "string" && reasoningDelta) {
              if (currentBlockType !== "thinking") {
                closeCurrentNonToolBlock();
                blockIndex++;
                currentBlockType = "thinking";
                writeEvent("content_block_start", {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: { type: "thinking", thinking: "" }
                });
              }
              writeEvent("content_block_delta", {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "thinking_delta", thinking: reasoningDelta }
              });
            }

            if (typeof delta.content === "string" && delta.content) {
              if (currentBlockType !== "text") {
                closeCurrentNonToolBlock();
                blockIndex++;
                currentBlockType = "text";
                writeEvent("content_block_start", {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: { type: "text", text: "" }
                });
              }
              writeEvent("content_block_delta", {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "text_delta", text: delta.content }
              });
            }

            if (Array.isArray(delta.tool_calls)) {
              closeCurrentNonToolBlock();
              stopReason = "tool_use";
              for (const tc of delta.tool_calls) {
                const tcIdx = typeof tc.index === "number" ? tc.index : 0;
                let anthIdx = openToolBlocks.get(tcIdx);
                if (anthIdx === undefined) {
                  blockIndex++;
                  anthIdx = blockIndex;
                  openToolBlocks.set(tcIdx, anthIdx);
                  writeEvent("content_block_start", {
                    type: "content_block_start",
                    index: anthIdx,
                    content_block: {
                      type: "tool_use",
                      id: tc.id || `toolu_${crypto.randomBytes(6).toString("hex")}`,
                      name: tc.function?.name || "tool",
                      input: {}
                    }
                  });
                }
                if (typeof tc.function?.arguments === "string" && tc.function.arguments) {
                  writeEvent("content_block_delta", {
                    type: "content_block_delta",
                    index: anthIdx,
                    delta: { type: "input_json_delta", partial_json: tc.function.arguments }
                  });
                }
              }
            }

            if (choice.finish_reason === "tool_calls") stopReason = "tool_use";
            else if (choice.finish_reason === "length") stopReason = "max_tokens";
          } catch {}
        }
      });
      upstreamRes.on("end", () => {
        finalizeStream();
        if (!clientRes.destroyed && !clientRes.writableEnded) clientRes.end();
        resolve();
      });
      upstreamRes.on("error", () => {
        if (!clientRes.destroyed && !clientRes.writableEnded) clientRes.end();
        resolve();
      });
    });

    return { handled: true, ok: true };
  }

  async fetchProviderBalance(providerId) {
    const provider = this.store.getProvider(providerId);
    if (!provider) return { ok: false, supported: false, error: "供应商不存在" };

    const cleanBase = String(provider.baseUrl || "").replace(/\/+$/, "").replace(/\/v1$/, "");
    const lowerUrl = cleanBase.toLowerCase();

    // Local Ollama / loopback free inference
    if (provider.id === "ollama" || /:11434(\/|$)/.test(lowerUrl)) {
      const balance = { supported: true, available: true, currency: "LOCAL", formatted: "本地免费", checkedAt: Date.now() };
      this._recordTelemetry(provider.id, { balance });
      return { ok: true, ...balance };
    }

    if (!provider.apiKey) {
      return { ok: false, supported: false, error: "尚未填写 API Key" };
    }

    const authHeaders = {
      "Authorization": `Bearer ${provider.apiKey}`,
      "Accept": "application/json",
      "User-Agent": "Catstella-BYOK-Gateway/1.1"
    };

    try {
      // 1. DeepSeek (/user/balance)
      if (provider.id === "deepseek" || lowerUrl.includes("api.deepseek.com")) {
        const { res } = await requestUpstream(`${cleanBase}/user/balance`, { method: "GET", headers: authHeaders, timeout: 6000 });
        const buf = await collectResponseBuffer(res, 65536);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const json = safeJsonParse(buf.toString("utf8"), {});
          const info = Array.isArray(json.balance_infos) ? (json.balance_infos.find(b => b.currency === "CNY") || json.balance_infos[0]) : null;
          if (info && info.total_balance !== undefined) {
            const sym = info.currency === "USD" ? "$" : "¥";
            const amt = Number(info.total_balance);
            const formatted = `${sym} ${Number.isFinite(amt) ? amt.toFixed(2) : info.total_balance}`;
            const balance = { supported: true, available: json.is_available !== false, currency: info.currency || "CNY", formatted, checkedAt: Date.now() };
            this._recordTelemetry(provider.id, { balance });
            return { ok: true, ...balance };
          }
        }
      }

      // 2. SiliconFlow (/v1/user/info)
      if (provider.id === "siliconflow" || lowerUrl.includes("siliconflow.")) {
        const { res } = await requestUpstream(`${cleanBase}/v1/user/info`, { method: "GET", headers: authHeaders, timeout: 6000 });
        const buf = await collectResponseBuffer(res, 65536);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const json = safeJsonParse(buf.toString("utf8"), {});
          const rawBal = json?.data?.totalBalance ?? json?.data?.balance;
          if (rawBal !== undefined) {
            const amt = Number(rawBal);
            const formatted = `¥ ${Number.isFinite(amt) ? amt.toFixed(2) : rawBal}`;
            const balance = { supported: true, available: !Number.isFinite(amt) || amt > 0, currency: "CNY", formatted, checkedAt: Date.now() };
            this._recordTelemetry(provider.id, { balance });
            return { ok: true, ...balance };
          }
        }
      }

      // 3. OpenRouter (/api/v1/credits -> fallback /api/v1/auth/key)
      if (provider.id === "openrouter" || lowerUrl.includes("openrouter.ai")) {
        const originUrl = new URL(cleanBase).origin;
        const creditsResp = await requestUpstream(`${originUrl}/api/v1/credits`, { method: "GET", headers: authHeaders, timeout: 6000 });
        const creditsBuf = await collectResponseBuffer(creditsResp.res, 65536);
        if (creditsResp.res.statusCode >= 200 && creditsResp.res.statusCode < 300) {
          const json = safeJsonParse(creditsBuf.toString("utf8"), {});
          if (typeof json?.data?.total_credits === "number") {
            const rem = json.data.total_credits - (Number(json.data.total_usage) || 0);
            const balance = { supported: true, available: rem > 0, currency: "USD", formatted: `$ ${rem.toFixed(2)}`, checkedAt: Date.now() };
            this._recordTelemetry(provider.id, { balance });
            return { ok: true, ...balance };
          }
        }
        const keyResp = await requestUpstream(`${originUrl}/api/v1/auth/key`, { method: "GET", headers: authHeaders, timeout: 6000 });
        const keyBuf = await collectResponseBuffer(keyResp.res, 65536);
        if (keyResp.res.statusCode >= 200 && keyResp.res.statusCode < 300) {
          const json = safeJsonParse(keyBuf.toString("utf8"), {});
          if (typeof json?.data?.limit_remaining === "number") {
            const rem = json.data.limit_remaining;
            const balance = { supported: true, available: rem > 0, currency: "USD", formatted: `$ ${rem.toFixed(2)}`, checkedAt: Date.now() };
            this._recordTelemetry(provider.id, { balance });
            return { ok: true, ...balance };
          }
          if (typeof json?.data?.usage === "number") {
            const balance = { supported: true, available: true, currency: "USD", formatted: `已用 $ ${json.data.usage.toFixed(2)}`, checkedAt: Date.now() };
            this._recordTelemetry(provider.id, { balance });
            return { ok: true, ...balance };
          }
        }
      }

      return { ok: false, supported: false, formatted: "" };
    } catch (err) {
      return { ok: false, supported: false, error: err?.message || "查询余额失败" };
    }
  }

  async discoverLocalOllama(options = {}) {
    const provider = this.store.getProvider("ollama");
    const baseUrl = (provider?.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "").replace(/\/v1$/, "");
    const startMs = performance.now();
    try {
      const { res } = await requestUpstream(`${baseUrl}/api/tags`, { method: "GET", timeout: 1500 });
      const buf = await collectResponseBuffer(res, 1024 * 1024);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return { ok: false, online: false, error: `Ollama 返回 HTTP ${res.statusCode}` };
      }
      const pingMs = Math.max(1, Math.round(performance.now() - startMs));
      const parsed = safeJsonParse(buf.toString("utf8"), {});
      const rawModels = Array.isArray(parsed.models) ? parsed.models : [];
      let added = 0;
      if (provider) {
        const merged = this.store.mergeDiscoveredModels("ollama", rawModels);
        added = merged.added;
        if (options.autoEnable === true && rawModels.length > 0 && !provider.enabled) {
          this.store.upsertProvider({ id: "ollama", enabled: true, setActive: options.setActive === true });
        }
        this._recordTelemetry("ollama", {
          status: "online",
          pingMs,
          lastError: "",
          balance: { supported: true, available: true, currency: "LOCAL", formatted: "本地免费", checkedAt: Date.now() }
        });
      }
      return { ok: true, online: true, pingMs, discoveredCount: rawModels.length, added };
    } catch {
      return { ok: false, online: false, error: "未检测到运行中的本地 Ollama (127.0.0.1:11434)" };
    }
  }

  async pingProvider(providerId, modelId = null) {
    const provider = this.store.getProvider(providerId);
    if (!provider) return { ok: false, error: "供应商不存在" };

    const targetModel = modelId || provider.models.find(m => m.enabled)?.id || provider.models[0]?.id || "";
    const startMs = performance.now();

    try {
      if (!targetModel && provider.protocol === "openai") {
        const url = resolveUpstreamUrl(provider.baseUrl, "/v1/models");
        const headers = this._buildProviderHeaders(provider, {}, null);
        const { res } = await requestUpstream(url, { method: "GET", headers, timeout: 8000 });
        await collectResponseBuffer(res, 262144);
        const pingMs = Math.max(1, Math.round(performance.now() - startMs));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this._recordTelemetry(provider.id, { status: "online", pingMs, lastError: "" }, null);
          this.fetchProviderBalance(provider.id).catch(() => {});
          return { ok: true, providerId: provider.id, pingMs, status: "online" };
        }
        const errText = `HTTP ${res.statusCode}`;
        this._recordTelemetry(provider.id, { status: "error", lastError: errText }, null);
        return { ok: false, providerId: provider.id, error: errText, status: "error" };
      }

      const isAnth = provider.protocol === "anthropic";
      const url = resolveUpstreamUrl(provider.baseUrl, isAnth ? "/v1/messages" : "/v1/chat/completions");
      const payload = JSON.stringify({
        model: targetModel || "gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }]
      });
      const buf = Buffer.from(payload, "utf8");
      const headers = this._buildProviderHeaders(provider, {});
      headers["Content-Length"] = String(buf.length);

      const { res } = await requestUpstream(url, { method: "POST", headers, timeout: 10000 }, buf);
      const respBuf = await collectResponseBuffer(res, 131072);
      const pingMs = Math.max(1, Math.round(performance.now() - startMs));

      if (res.statusCode >= 200 && res.statusCode < 300) {
        this._recordTelemetry(provider.id, { status: "online", pingMs, lastError: "" }, targetModel);
        // Opportunistically refresh real account balance alongside successful ping
        await this.fetchProviderBalance(provider.id).catch(() => {});
        return { ok: true, providerId: provider.id, modelId: targetModel, pingMs, status: "online" };
      }

      let detail = `HTTP ${res.statusCode}`;
      try {
        const errJson = JSON.parse(respBuf.toString("utf8"));
        const msg = errJson?.error?.message || errJson?.message;
        if (typeof msg === "string" && msg) detail = `${detail}: ${msg.slice(0, 80)}`;
      } catch {}
      this._recordTelemetry(provider.id, { status: "error", lastError: detail }, targetModel);
      return { ok: false, providerId: provider.id, modelId: targetModel, error: detail, status: "error" };
    } catch (err) {
      const detail = err?.message || "网络连接失败";
      this._recordTelemetry(provider.id, { status: "error", lastError: detail }, targetModel);
      return { ok: false, providerId: provider.id, modelId: targetModel, error: detail, status: "error" };
    }
  }

  async fetchRemoteModels(providerId) {
    const provider = this.store.getProvider(providerId);
    if (!provider) throw new Error("供应商不存在");

    const headers = this._buildProviderHeaders(provider, {}, null);
    const primaryUrl = resolveUpstreamUrl(provider.baseUrl, "/v1/models");
    const startMs = performance.now();

    let statusCode = 0;
    let bodyBuf = Buffer.alloc(0);
    try {
      const { res } = await requestUpstream(primaryUrl, { method: "GET", headers, timeout: 10000 });
      statusCode = res.statusCode || 0;
      bodyBuf = await collectResponseBuffer(res, 2 * 1024 * 1024);
    } catch (err) {
      this._recordTelemetry(provider.id, { status: "error", lastError: err.message });
      throw new Error(`拉取模型列表失败: ${err.message}`);
    }

    if (statusCode === 404 && /11434/.test(provider.baseUrl)) {
      const ollamaUrl = resolveUpstreamUrl(provider.baseUrl.replace(/\/v1$/, ""), "/api/tags");
      const { res } = await requestUpstream(ollamaUrl, { method: "GET", headers, timeout: 8000 });
      statusCode = res.statusCode || 0;
      bodyBuf = await collectResponseBuffer(res, 2 * 1024 * 1024);
    }

    if (statusCode < 200 || statusCode >= 300) {
      this._recordTelemetry(provider.id, { status: "error", lastError: `HTTP ${statusCode}` });
      throw new Error(`上游返回 HTTP ${statusCode}，请检查 Base URL 与 API Key`);
    }

    const pingMs = Math.max(1, Math.round(performance.now() - startMs));
    const parsed = JSON.parse(bodyBuf.toString("utf8"));
    const rawList = Array.isArray(parsed?.data)
      ? parsed.data
      : (Array.isArray(parsed?.models) ? parsed.models : []);

    const merged = this.store.mergeDiscoveredModels(providerId, rawList);
    this._recordTelemetry(provider.id, { status: "online", pingMs, lastError: "" });
    this.fetchProviderBalance(providerId).catch(() => {});
    return { ok: true, added: merged.added, total: merged.total, pingMs };
  }
}

module.exports = {
  LocalGatewayServer,
  resolveUpstreamUrl,
  probeExistingGateway,
  isTrustedGatewayOrigin,
  convertOpenAiToAnthropicPayload,
  convertAnthropicJsonToOpenAi,
  convertAnthropicToOpenAiPayload,
  convertOpenAiJsonToAnthropic
};
