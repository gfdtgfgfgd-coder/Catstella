#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const { ModelStore, defaultModelsPath } = require("./store.cjs");
const { LocalGatewayServer, probeExistingGateway } = require("./server.cjs");

const BLOCKED_FILE_PATTERN = /(^|[\\/])(\.env(\..+)?|\.master\.key|models\.json|id_rsa|id_ed25519|.*\.(pem|key|pfx|p12))$/i;
const MAX_SINGLE_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_CONTEXT_BYTES = 192 * 1024;

const MCP_TOOLS = [
  {
    name: "byok_list_models",
    description: "List all enabled third-party BYOK providers and models configured in Catstella (DeepSeek, Claude, OpenAI, OpenRouter, SiliconFlow, Ollama), including capability tags and active default model.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "byok_chat",
    description: "Consult a single configured BYOK third-party model (e.g. DeepSeek-R1, Claude, GPT, or local Ollama) for second-opinion reasoning, code review, or offloading subtasks. Pass context_files paths to attach local files read-only without copying code into the prompt.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The question, instruction, or review task for the external model."
        },
        model: {
          type: "string",
          description: "Optional model ID or 'providerId:modelId' (e.g. 'deepseek:deepseek-reasoner'). Omit to use the active default BYOK model."
        },
        system: {
          type: "string",
          description: "Optional system prompt."
        },
        context_files: {
          type: "array",
          items: { type: "string" },
          description: "Optional file paths (supports '#L10-L80' line ranges) read directly from disk to save prompt tokens."
        },
        temperature: {
          type: "number",
          description: "Optional sampling temperature (0.0 to 2.0)."
        }
      },
      required: ["prompt"],
      additionalProperties: false
    }
  },
  {
    name: "byok_council",
    description: "Run a parallel multi-model council across 2 to 4 BYOK models simultaneously to compare independent code reviews, architectural trade-offs, or debugging hypotheses.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The shared prompt sent to every council model in parallel."
        },
        models: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of model IDs or 'providerId:modelId' specs (2-4 models). Omit to auto-select up to 3 enabled models."
        },
        system: {
          type: "string",
          description: "Optional shared system prompt."
        },
        context_files: {
          type: "array",
          items: { type: "string" },
          description: "Optional file paths (supports '#L10-L80' line ranges) attached read-only to the prompt."
        }
      },
      required: ["prompt"],
      additionalProperties: false
    }
  }
];

function parseFileSpec(spec, cwd = process.cwd()) {
  const raw = String(spec || "").trim();
  if (!raw) return null;
  let filePathPart = raw;
  let startLine = null;
  let endLine = null;
  const hashMatch = raw.match(/^(.*)#L(\d+)(?:-L?(\d+))?$/i);
  if (hashMatch) {
    filePathPart = hashMatch[1];
    startLine = Math.max(1, parseInt(hashMatch[2], 10));
    endLine = hashMatch[3] ? Math.max(startLine, parseInt(hashMatch[3], 10)) : startLine;
  }
  const resolved = path.isAbsolute(filePathPart) ? path.normalize(filePathPart) : path.resolve(cwd, filePathPart);
  return { raw, resolved, startLine, endLine };
}

function buildContextFilesBlock(contextFiles = [], cwd = process.cwd()) {
  if (!Array.isArray(contextFiles) || !contextFiles.length) return "";
  const sections = [];
  let totalBytes = 0;

  for (const item of contextFiles.slice(0, 12)) {
    const parsed = parseFileSpec(item, cwd);
    if (!parsed) continue;
    if (BLOCKED_FILE_PATTERN.test(parsed.resolved)) {
      sections.push(`### File: ${parsed.raw}\n[已跳过敏感凭据或密钥文件]`);
      continue;
    }
    try {
      const stat = fs.statSync(parsed.resolved);
      if (!stat.isFile()) continue;
      const fd = fs.openSync(parsed.resolved, "r");
      const toRead = Math.min(stat.size, MAX_SINGLE_FILE_BYTES);
      const buf = Buffer.alloc(toRead);
      fs.readSync(fd, buf, 0, toRead, 0);
      fs.closeSync(fd);

      let content = buf.toString("utf8");
      if (parsed.startLine !== null) {
        const lines = content.split(/\r?\n/);
        content = lines.slice(parsed.startLine - 1, parsed.endLine).join("\n");
      }
      const truncated = stat.size > MAX_SINGLE_FILE_BYTES ? "\n... [文件内容超长已截断]" : "";
      const chunk = `### File: ${parsed.raw}\n\`\`\`\n${content}${truncated}\n\`\`\``;
      const chunkBytes = Buffer.byteLength(chunk, "utf8");
      if (totalBytes + chunkBytes > MAX_TOTAL_CONTEXT_BYTES) {
        sections.push(`### File: ${parsed.raw}\n[总附加上下文已达上限，跳过剩余文件]`);
        break;
      }
      totalBytes += chunkBytes;
      sections.push(chunk);
    } catch (err) {
      sections.push(`### File: ${parsed.raw}\n[读取失败: ${err?.message || "文件不可读"}]`);
    }
  }

  return sections.length ? `以下是只读附加的工作区文件上下文：\n\n${sections.join("\n\n")}\n\n---\n\n` : "";
}

function postLocalCompletion(port, payload, gatewayToken = "") {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": String(body.length)
    };
    if (gatewayToken) {
      headers["Authorization"] = `Bearer ${gatewayToken}`;
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/v1/chat/completions",
        method: "POST",
        headers,
        timeout: 120000
      },
      res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ statusCode: res.statusCode || 500, routedProvider: res.headers["x-catstella-routed-provider"] || "", body: JSON.parse(text) });
          } catch {
            resolve({ statusCode: res.statusCode || 500, routedProvider: "", body: { error: { message: text.slice(0, 300) } } });
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("第三方模型响应超时 (120s)")));
    req.on("error", reject);
    req.end(body);
  });
}

class ByokMcpService {
  constructor(options = {}) {
    this.modelsPath = options.modelsPath || defaultModelsPath();
    this.cwd = options.cwd || process.cwd();
    this.defaultPort = typeof options.defaultPort === "number" ? options.defaultPort : null;
    this._ephemeralGateway = null;
  }

  _loadStore() {
    return new ModelStore({ filePath: this.modelsPath });
  }

  async _resolveGatewayPort(store) {
    const runtimePath = path.join(path.dirname(this.modelsPath), "gateway-runtime.json");
    const candidates = [];
    if (this.defaultPort) candidates.push(this.defaultPort);
    try {
      if (fs.existsSync(runtimePath)) {
        const rt = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
        if (rt?.port) candidates.push(rt.port);
      }
    } catch {}
    candidates.push(store.data.port || 3920);

    for (const p of [...new Set(candidates)]) {
      const health = await probeExistingGateway(p, "127.0.0.1", 100);
      if (health && health.ok) return p;
    }

    if (!this._ephemeralGateway || !this._ephemeralGateway.isRunning) {
      this._ephemeralGateway = new LocalGatewayServer({ store, port: 0 });
      await this._ephemeralGateway.start();
    } else {
      this._ephemeralGateway.store = store;
    }
    return this._ephemeralGateway.boundPort;
  }

  async stop() {
    if (this._ephemeralGateway) {
      await this._ephemeralGateway.stop();
      this._ephemeralGateway = null;
    }
  }

  async callTool(name, args = {}) {
    const store = this._loadStore();

    if (name === "byok_list_models") {
      const snap = store.getPublicSnapshot({ available: true, gatewayOnline: true });
      const enabled = snap.providers.filter(p => p.enabled);
      if (!enabled.length) {
        return {
          content: [{
            type: "text",
            text: "当前尚未启用任何 BYOK 第三方模型供应商。请在桌宠「统一设置中心 → 🔌 模型网关」中开启至少一个供应商。"
          }]
        };
      }
      const lines = [
        `当前默认路由: **${snap.activeProvider?.name || "未设"}** / \`${snap.activeModelId || "自动"}\``,
        ""
      ];
      for (const p of enabled) {
        const modelStr = p.models
          .filter(m => m.enabled)
          .map(m => `\`${p.id}:${m.id}\` (${m.contextLength}${m.tags.length ? " · " + m.tags.join("/") : ""})`)
          .join(", ");
        lines.push(`- **${p.name}** (\`${p.id}\`, 协议: ${p.protocol}): ${modelStr || "暂无启用模型"}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "byok_chat") {
      const prompt = String(args.prompt || "").trim();
      if (!prompt) return { isError: true, content: [{ type: "text", text: "prompt 参数不能为空" }] };

      const port = await this._resolveGatewayPort(store);
      const gwToken = store.data.gateway?.gatewayTokenEnabled ? store.data.gateway.gatewayToken : "";
      const contextPrefix = buildContextFilesBlock(args.context_files, this.cwd);
      const messages = [];
      if (typeof args.system === "string" && args.system.trim()) {
        messages.push({ role: "system", content: args.system.trim() });
      }
      messages.push({ role: "user", content: contextPrefix + prompt });

      const t0 = performance.now();
      const resp = await postLocalCompletion(
        port,
        {
          model: typeof args.model === "string" && args.model.trim() ? args.model.trim() : "",
          messages,
          stream: false,
          ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {})
        },
        gwToken
      );
      const elapsed = Math.round(performance.now() - t0);

      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        const errMsg = resp.body?.error?.message || `HTTP ${resp.statusCode}`;
        return { isError: true, content: [{ type: "text", text: `调用 BYOK 模型失败: ${errMsg}` }] };
      }

      const choice = resp.body?.choices?.[0]?.message || {};
      const reasoning = choice.reasoning_content || "";
      const answer = choice.content || "";
      const usedModel = resp.body?.model || args.model || "default";
      const header = `> **[BYOK · ${resp.routedProvider || "gateway"} / ${usedModel} · ${elapsed}ms]**\n\n`;
      const thinkSection = reasoning ? `<details><summary>推理思考过程</summary>\n\n${reasoning}\n\n</details>\n\n` : "";
      return { content: [{ type: "text", text: `${header}${thinkSection}${answer}` }] };
    }

    if (name === "byok_council") {
      const prompt = String(args.prompt || "").trim();
      if (!prompt) return { isError: true, content: [{ type: "text", text: "prompt 参数不能为空" }] };

      const snap = store.getPublicSnapshot({ available: true, gatewayOnline: true });
      let targets = Array.isArray(args.models) ? args.models.map(m => String(m || "").trim()).filter(Boolean).slice(0, 4) : [];

      if (!targets.length) {
        // Auto-pick up to 3 diverse enabled models across providers first, then remaining models
        const seenProviders = new Set();
        for (const c of snap.enabledModelChoices) {
          if (!seenProviders.has(c.providerId) && targets.length < 3) {
            seenProviders.add(c.providerId);
            targets.push(`${c.providerId}:${c.modelId}`);
          }
        }
        for (const c of snap.enabledModelChoices) {
          const spec = `${c.providerId}:${c.modelId}`;
          if (!targets.includes(spec) && targets.length < 3) {
            targets.push(spec);
          }
        }
      }

      if (!targets.length) {
        return { isError: true, content: [{ type: "text", text: "未找到任何已启用的 BYOK 模型用于会诊，请先在设置中心启用模型。" }] };
      }

      const port = await this._resolveGatewayPort(store);
      const gwToken = store.data.gateway?.gatewayTokenEnabled ? store.data.gateway.gatewayToken : "";
      const contextPrefix = buildContextFilesBlock(args.context_files, this.cwd);
      const messages = [];
      if (typeof args.system === "string" && args.system.trim()) {
        messages.push({ role: "system", content: args.system.trim() });
      }
      messages.push({ role: "user", content: contextPrefix + prompt });

      const results = await Promise.all(
        targets.map(async modelSpec => {
          const t0 = performance.now();
          try {
            const resp = await postLocalCompletion(port, { model: modelSpec, messages, stream: false }, gwToken);
            const elapsed = Math.round(performance.now() - t0);
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
              return `## ❌ ${modelSpec} (${elapsed}ms)\n调用失败: ${resp.body?.error?.message || `HTTP ${resp.statusCode}`}`;
            }
            const msg = resp.body?.choices?.[0]?.message || {};
            const reasoning = msg.reasoning_content ? `> *思考摘要*: ${String(msg.reasoning_content).slice(0, 300)}${msg.reasoning_content.length > 300 ? "…" : ""}\n\n` : "";
            return `## ✅ ${modelSpec} (${elapsed}ms)\n\n${reasoning}${msg.content || "(空响应)"}`;
          } catch (err) {
            return `## ❌ ${modelSpec}\n异常: ${err?.message || "连接异常"}`;
          }
        })
      );

      return {
        content: [{
          type: "text",
          text: `# BYOK 多模型并发会诊报告 (${targets.length} 模型)\n\n${results.join("\n\n---\n\n")}`
        }]
      };
    }

    throw new Error(`Unknown MCP tool: ${name}`);
  }

  handleRpc(msg) {
    return this.handleRpcMessage(msg);
  }

  async handleRpcMessage(msg) {
    if (!msg || typeof msg !== "object") return null;
    const { id, method, params } = msg;

    if (id === undefined || id === null) {
      // Notification (e.g. notifications/initialized)
      return null;
    }

    try {
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.protocolVersion || "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "catstella-byok", version: "1.1.0" }
          }
        };
      }

      if (method === "ping") {
        return { jsonrpc: "2.0", id, result: {} };
      }

      if (method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
      }

      if (method === "tools/call") {
        const result = await this.callTool(params?.name, params?.arguments || {});
        return { jsonrpc: "2.0", id, result };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: err?.message || "Internal MCP error" }
      };
    }
  }
}

function startStdioServer(options = {}) {
  const modelsArg = process.argv.find(a => a.startsWith("--models-path="))?.slice(14);
  const service = new ByokMcpService({
    modelsPath: options.modelsPath || modelsArg || defaultModelsPath(),
    cwd: options.cwd || process.cwd()
  });

  let useContentLengthFraming = false;
  let rawBuffer = Buffer.alloc(0);

  const sendResponse = payload => {
    if (!payload) return;
    const json = JSON.stringify(payload);
    if (useContentLengthFraming) {
      const byteLen = Buffer.byteLength(json, "utf8");
      process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
      process.stdout.write(`${json}\n`);
    }
  };

  process.stdin.on("data", chunk => {
    rawBuffer = Buffer.concat([rawBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

    while (rawBuffer.length > 0) {
      const headerProbe = rawBuffer.slice(0, 32).toString("utf8");
      if (/^Content-Length:/i.test(headerProbe)) {
        useContentLengthFraming = true;
        const sepIdx = rawBuffer.indexOf("\r\n\r\n");
        if (sepIdx < 0) break;
        const headerStr = rawBuffer.slice(0, sepIdx).toString("utf8");
        const match = headerStr.match(/Content-Length:\s*(\d+)/i);
        const bodyLen = match ? parseInt(match[1], 10) : 0;
        const totalLen = sepIdx + 4 + bodyLen;
        if (rawBuffer.length < totalLen) break;
        const bodyStr = rawBuffer.slice(sepIdx + 4, totalLen).toString("utf8");
        rawBuffer = rawBuffer.slice(totalLen);
        try {
          const msg = JSON.parse(bodyStr);
          service.handleRpcMessage(msg).then(sendResponse);
        } catch {}
      } else {
        const nlIdx = rawBuffer.indexOf(0x0a);
        if (nlIdx < 0) break;
        const line = rawBuffer.slice(0, nlIdx).toString("utf8").trim();
        rawBuffer = rawBuffer.slice(nlIdx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          service.handleRpcMessage(msg).then(sendResponse);
        } catch {}
      }
    }
  });

  process.stdin.on("end", () => {
    service.stop().finally(() => process.exit(0));
  });

  return service;
}

if (require.main === module) {
  startStdioServer();
}

module.exports = {
  ByokMcpService,
  MCP_TOOLS,
  buildContextFilesBlock,
  startStdioServer
};
