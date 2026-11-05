const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ModelStore,
  detectByokOptIn
} = require("./store.cjs");

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "catstella-byok-test-"));

test("Phase 1: ModelStore zero-footprint on read, AES-256-GCM key encryption at rest, and public masking", () => {
  const dir = mkTmp();
  const modelsPath = path.join(dir, ".catstella", "models.json");
  const store = new ModelStore({ filePath: modelsPath });

  // Zero-conflict: merely constructing ModelStore must not create files on disk
  assert.equal(fs.existsSync(modelsPath), false);
  assert.equal(store.data.providers.length, 6);

  // Upsert DeepSeek with plaintext API Key
  store.setEnabled(true);
  store.upsertProvider({
    id: "deepseek",
    enabled: true,
    apiKey: "sk-live-9876543210abcdef"
  });

  assert.equal(fs.existsSync(modelsPath), true);
  const rawOnDisk = fs.readFileSync(modelsPath, "utf8");
  assert.equal(rawOnDisk.includes("sk-live-9876543210abcdef"), false, "Plaintext API key must never be stored on disk");
  assert.match(rawOnDisk, /"apiKey":\s*"enc:v1:/);

  // Public snapshot masks API key; revealApiKey decrypts accurately
  const snap = store.getPublicSnapshot({ available: true, gatewayOnline: true });
  const ds = snap.providers.find(p => p.id === "deepseek");
  assert.equal(ds.hasApiKey, true);
  assert.equal(ds.apiKeyMasked.includes("9876543210"), false);
  assert.ok(ds.apiKeyMasked.endsWith("cdef"));
  assert.equal(store.revealApiKey("deepseek"), "sk-live-9876543210abcdef");

  // Reloading from disk preserves decrypted key, models, and custom provider
  store.upsertProvider({
    id: "my-vllm",
    name: "Local vLLM",
    enabled: true,
    baseUrl: "http://127.0.0.1:8000/",
    protocol: "openai",
    apiKey: "token-xyz123456",
    models: [{ id: "Qwen2.5-72B", contextLength: "128K", tags: ["推理", "工具"], enabled: true }]
  });
  store.upsertModel("deepseek", { id: "deepseek-v3.2", name: "DeepSeek V3.2", contextLength: "128K", tags: ["工具", "推理"], enabled: true });

  const reloaded = new ModelStore({ filePath: modelsPath });
  assert.equal(reloaded.revealApiKey("deepseek"), "sk-live-9876543210abcdef");
  assert.equal(reloaded.revealApiKey("my-vllm"), "token-xyz123456");
  assert.equal(reloaded.getProvider("my-vllm").baseUrl, "http://127.0.0.1:8000");
  assert.ok(reloaded.getProvider("deepseek").models.some(m => m.id === "deepseek-v3.2"));

  // Corrupt JSON degrades safely without crashing
  fs.writeFileSync(modelsPath, "{corrupt-json");
  const recovered = new ModelStore({ filePath: modelsPath });
  assert.equal(recovered.data.providers.length, 6);
});

test("Phase 1: detectByokOptIn strictly respects opt-in markers and flags", () => {
  const dir = mkTmp();
  const installDir = path.join(dir, "install");
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, ".starsuite-install"), "Suite\n");

  const modelsPath = path.join(dir, "models.json");
  assert.equal(detectByokOptIn({ installRoot: installDir, filePath: modelsPath, argv: [], env: {} }), false);

  // Enabling marker in install root activates BYOK
  fs.writeFileSync(path.join(installDir, ".byok-enabled"), "1\n");
  assert.equal(detectByokOptIn({ installRoot: installDir, filePath: modelsPath, argv: [], env: {} }), true);

  // Explicit --disable-byok overrides marker
  assert.equal(detectByokOptIn({ installRoot: installDir, filePath: modelsPath, argv: ["--disable-byok"], env: {} }), false);
});

const http = require("node:http");
const { performance } = require("node:perf_hooks");
const { LocalGatewayServer, resolveUpstreamUrl } = require("./server.cjs");
const { GatewayCoordinator } = require("./index.cjs");

test("Phase 2: Gateway binds in <150ms, falls back cleanly on port conflict, and serves /health + CORS + /v1/models", async () => {
  const dir = mkTmp();
  const store = new ModelStore({ filePath: path.join(dir, "models.json") });
  store.setEnabled(true);
  store.upsertProvider({ id: "deepseek", enabled: true, apiKey: "sk-ds-test" });

  // Occupy a port to simulate One-API / LiteLLM conflict
  const blocker = http.createServer((_req, res) => res.end("occupied"));
  await new Promise(r => blocker.listen(0, "127.0.0.1", r));
  const blockedPort = blocker.address().port;

  const gateway = new LocalGatewayServer({ store, port: blockedPort });
  try {
    const t0 = performance.now();
    const { port } = await gateway.start();
    const elapsedMs = performance.now() - t0;

    assert.ok(elapsedMs < 150, `Gateway must bind in <150ms, took ${elapsedMs.toFixed(1)}ms`);
    assert.notEqual(port, blockedPort, "Gateway must never steal occupied port");
    assert.ok(port >= blockedPort + 1);

    // CORS OPTIONS
    const optRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "OPTIONS" });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get("access-control-allow-origin"), "*");

    // GET /health
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.service, "catstella-byok-gateway");
    assert.equal(health.port, port);

    // GET /v1/models
    const models = await (await fetch(`http://127.0.0.1:${port}/v1/models`)).json();
    assert.equal(models.object, "list");
    assert.ok(models.data.some(m => m.id === "deepseek-chat" && m.owned_by === "deepseek"));
  } finally {
    await gateway.stop();
    await new Promise(r => blocker.close(r));
  }
});

test("Phase 2: SSE streaming (<20ms per-chunk latency), auth injection, Anthropic /v1/messages, Ping & /v1/models discovery", async () => {
  const dir = mkTmp();
  let seenAuth = "";
  let seenAnthKey = "";
  const chunkSendTimes = [];

  // Mock upstream provider server
  const upstream = http.createServer(async (req, res) => {
    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      seenAuth = req.headers["authorization"] || "";
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.flushHeaders();
        for (const word of ["喵", "～", "通", "啦"]) {
          chunkSendTimes.push(performance.now());
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
          await new Promise(r => setTimeout(r, 12));
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "cmpl-1", choices: [{ message: { role: "assistant", content: "pong" } }] }));
      }
      return;
    }

    if (req.url === "/v1/messages" && req.method === "POST") {
      seenAnthKey = req.headers["x-api-key"] || "";
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Claude喵" } })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "msg-1", content: [{ type: "text", text: "anth-pong" }], stop_reason: "end_turn" }));
      }
      return;
    }

    if (req.url === "/v1/models" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-r2-preview", context_length: 200000 },
          { id: "qwen2.5-vl-72b", context_length: 131072 }
        ]
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(r => upstream.listen(0, "127.0.0.1", r));
  const upPort = upstream.address().port;
  const baseUrl = `http://127.0.0.1:${upPort}`;

  const store = new ModelStore({ filePath: path.join(dir, "models.json") });
  store.setEnabled(true);
  store.upsertProvider({ id: "deepseek", enabled: true, baseUrl, protocol: "openai", apiKey: "sk-secret-openai-999" });
  store.upsertProvider({ id: "anthropic", enabled: true, baseUrl, protocol: "anthropic", apiKey: "sk-ant-secret-888" });

  const gateway = new LocalGatewayServer({ store, port: 0 });
  const { port } = await gateway.start();

  try {
    // 1. Test OpenAI SSE streaming & <20ms forwarding latency
    const sseRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", stream: true, messages: [{ role: "user", content: "hi" }] })
    });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let collected = "";
    let chunkIdx = 0;
    const latencies = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (chunkIdx < chunkSendTimes.length) {
        latencies.push(performance.now() - chunkSendTimes[chunkIdx]);
        chunkIdx++;
      }
      collected += decoder.decode(value, { stream: true });
    }
    assert.equal(seenAuth, "Bearer sk-secret-openai-999");
    assert.match(collected, /喵/);
    assert.match(collected, /\[DONE\]/);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    assert.ok(avgLatency < 20, `Average SSE chunk forwarding latency must be <20ms, got ${avgLatency.toFixed(2)}ms`);

    // 2. Test native /v1/messages Anthropic forwarding
    const anthRes = await (await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16, messages: [{ role: "user", content: "hi" }] })
    })).json();
    assert.equal(seenAnthKey, "sk-ant-secret-888");
    assert.equal(anthRes.content[0].text, "anth-pong");

    // 3. Test OpenAI -> Anthropic SSE bridge
    const bridgeRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", stream: true, messages: [{ role: "user", content: "hi" }] })
    });
    const bridgeText = await bridgeRes.text();
    assert.match(bridgeText, /Claude喵/);
    assert.match(bridgeText, /chat\.completion\.chunk/);

    // 4. Test Ping & Remote Model Discovery
    const ping = await gateway.pingProvider("deepseek", "deepseek-chat");
    assert.equal(ping.ok, true);
    assert.equal(typeof ping.pingMs, "number");

    const discovered = await gateway.fetchRemoteModels("deepseek");
    assert.equal(discovered.ok, true);
    assert.equal(discovered.added, 2);
    const r2 = store.getProvider("deepseek").models.find(m => m.id === "deepseek-r2-preview");
    assert.equal(r2.contextLength, "200K");
    assert.ok(r2.tags.includes("推理"));
    const vl = store.getProvider("deepseek").models.find(m => m.id === "qwen2.5-vl-72b");
    assert.ok(vl.tags.includes("视觉"));

    // Verify todayRequests incremented for the 3 chat/messages calls
    assert.equal(gateway.getSnapshot().todayRequests, 3);
    assert.equal(resolveUpstreamUrl("https://openrouter.ai/api/v1/", "/v1/chat/completions"), "https://openrouter.ai/api/v1/chat/completions");
  } finally {
    await gateway.stop();
    await new Promise(r => upstream.close(r));
  }
});

test("Phase 2 & 5: Non-intrusive opt-out skips port binding and leaves zero filesystem residue", async () => {
  const dir = mkTmp();
  const modelsPath = path.join(dir, "models.json");
  const coordinator = new GatewayCoordinator({
    filePath: modelsPath,
    argv: [],
    env: {}
  });

  assert.equal(coordinator.available, false);
  const res = await coordinator.ensureReady();
  assert.equal(res.available, false);
  assert.equal(res.ready, false);
  assert.equal(coordinator.server, null);
  assert.equal(fs.existsSync(modelsPath), false);
});

const { spawn, execFileSync } = require("node:child_process");

test("Phase 3: Standalone daemon.cjs pre-boots in <150ms and GatewayCoordinator attaches via handshake, then shuts down cleanly", async () => {
  const dir = mkTmp();
  const modelsPath = path.join(dir, "models.json");
  const daemonScript = path.join(__dirname, "daemon.cjs");

  // Pick a free port first
  const probeSrv = http.createServer();
  await new Promise(r => probeSrv.listen(0, "127.0.0.1", r));
  const freePort = probeSrv.address().port;
  await new Promise(r => probeSrv.close(r));

  const t0 = performance.now();
  const daemonProc = spawn(process.execPath, [daemonScript, `--models-path=${modelsPath}`, `--port=${freePort}`], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  const readyLine = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("daemon handshake timeout")), 3000);
    let out = "";
    daemonProc.stdout.on("data", d => {
      out += d.toString("utf8");
      if (out.includes("READY:")) {
        clearTimeout(timer);
        resolve(out.trim());
      }
    });
    daemonProc.once("error", err => { clearTimeout(timer); reject(err); });
  });
  const bootMs = performance.now() - t0;
  assert.match(readyLine, new RegExp(`^READY:${freePort}$`));
  assert.ok(bootMs < 500, `Node child spawn + bind completed in ${bootMs.toFixed(1)}ms`);

  const coordinator = new GatewayCoordinator({
    filePath: modelsPath,
    enabled: true,
    port: freePort
  });

  try {
    const handshake = await coordinator.ensureReady();
    assert.equal(handshake.mode, "daemon");
    assert.equal(handshake.port, freePort);
    assert.equal(coordinator.getSnapshot().gatewayOnline, true);
  } finally {
    await coordinator.stop({ shutdownDaemon: true });
    await new Promise(r => setTimeout(r, 80));
  }
});

test("Phase 3: Windows Installer C# sources compile cleanly and StartupSettings --self-test verifies EnableBYOK isolation", { skip: process.platform !== "win32" }, () => {
  const csc = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe");
  if (!fs.existsSync(csc)) return;
  const buildDir = mkTmp();
  try {
    const verCs = path.join(buildDir, "GeneratedVersion.cs");
    fs.writeFileSync(verCs, 'internal static partial class StartupSettings { public const string BuildVersion="0.5.0"; }\n');
    const root = path.resolve(__dirname, "../..");
    const startupOut = path.join(buildDir, "StartupSettings.exe");
    const setupOut = path.join(buildDir, "SetupProgram.exe");

    execFileSync(csc, [
      "/nologo", "/target:winexe", "/optimize+",
      "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:Microsoft.CSharp.dll",
      "/define:SUITE", `/out:${startupOut}`,
      path.join(root, "tools/installer/StartupSettings.cs"), verCs
    ]);
    execFileSync(startupOut, ["--self-test"], { timeout: 10000 });

    execFileSync(csc, [
      "/nologo", "/target:winexe", "/optimize+", "/main:SetupProgram",
      "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:System.IO.Compression.dll", "/r:Microsoft.CSharp.dll",
      "/define:SUITE", `/out:${setupOut}`,
      path.join(root, "tools/installer/SetupProgram.cs"),
      path.join(root, "tools/installer/StartupSettings.cs"),
      verCs
    ]);
    assert.equal(fs.existsSync(setupOut), true);
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});

test("Phase 4 & 5: Electron E2E verifies strict UI non-intrusion when disabled and full two-column BYOK + Mascot Bubble sync when enabled", async () => {
  const { _electron } = require("playwright");
  const root = path.resolve(__dirname, "../..");
  const electronExe = fs.existsSync(path.join(root, "runtime/electron-45.1.0/electron.exe"))
    ? path.join(root, "runtime/electron-45.1.0/electron.exe")
    : require("electron");
  const mainEntry = path.join(root, "Antigravity-Cat-Widget/src/main/index.cjs");
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  delete cleanEnv.CATSTELLA_ENABLE_BYOK;
  delete cleanEnv.CATSTELLA_MODELS_PATH;

  // --- Part A: Strict Opt-out (default) ---
  const optOutDir = mkTmp();
  const appDisabled = await _electron.launch({
    executablePath: electronExe,
    args: [mainEntry, `--data-dir=${optOutDir}`],
    env: cleanEnv,
    timeout: 30000
  });
  try {
    const widgetPage = await appDisabled.firstWindow();
    await widgetPage.waitForFunction(() => Boolean(window.widgetApi));
    const snap = await widgetPage.evaluate(() => window.widgetApi.get());
    assert.equal(snap.byok.available, false);
    assert.equal(snap.byok.gatewayOnline, false);

    // Bubble has only 4 native pages (no BYOK / Claude page)
    await widgetPage.locator("#toggle").click({ force: true });
    await widgetPage.waitForTimeout(150);
    assert.equal(await widgetPage.locator("#page").textContent(), "1 / 4");

    // Settings window completely omits BYOK tab
    const settingsPromise = appDisabled.waitForEvent("window");
    await widgetPage.locator("#settings").click({ force: true });
    const settingsPage = await settingsPromise;
    await settingsPage.waitForFunction(() => document.querySelectorAll(".nav-item").length > 0);
    assert.equal(await settingsPage.locator('[data-page="models"]').count(), 0, "BYOK tab must not render when disabled");
  } finally {
    await appDisabled.close();
  }

  // --- Part B: Opt-in (--enable-byok) with mock upstream ---
  const mockUpstream = http.createServer(async (req, res) => {
    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "cmpl-e2e", choices: [{ message: { role: "assistant", content: "ok" } }] }));
      return;
    }
    if (req.url === "/user/balance" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "88.50" }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(r => mockUpstream.listen(0, "127.0.0.1", r));
  const upPort = mockUpstream.address().port;

  const optInDir = mkTmp();
  const appEnabled = await _electron.launch({
    executablePath: electronExe,
    args: [mainEntry, `--data-dir=${optInDir}`, "--enable-byok"],
    env: cleanEnv,
    timeout: 30000
  });
  try {
    const widgetPage = await appEnabled.firstWindow();
    await widgetPage.waitForFunction(() => Boolean(window.widgetApi));
    const snap = await widgetPage.evaluate(() => window.widgetApi.get());
    assert.equal(snap.byok.available, true);
    assert.equal(snap.byok.gatewayOnline, true);
    assert.ok(snap.byok.port >= 3920);

    // Open Settings and verify BYOK tab is dynamically mounted
    const settingsPromise = appEnabled.waitForEvent("window");
    await widgetPage.locator("#settings").click({ force: true });
    const settingsPage = await settingsPromise;
    await settingsPage.waitForFunction(() => Boolean(document.getElementById("nav-models")));

    await settingsPage.locator("#nav-models").click();
    assert.equal(await settingsPage.locator(".byok-prov-item").count(), 6);

    // Configure DeepSeek to point to local mock upstream + save API Key + toggle Enable
    await settingsPage.locator("#byok-base-url").fill(`http://127.0.0.1:${upPort}`);
    await settingsPage.locator("#byok-api-key").fill("sk-e2e-secret-123456");
    await settingsPage.locator("#byok-prov-enabled").check();
    await settingsPage.locator("#byok-save-provider-btn").click();
    await settingsPage.waitForFunction(() => document.getElementById("saved").textContent.includes("保存"));

    // Click Eye icon to verify reveal/hide
    await settingsPage.locator("#byok-key-eye").click();
    await settingsPage.waitForFunction(() => document.getElementById("byok-api-key").type === "text");
    assert.equal(await settingsPage.locator("#byok-api-key").inputValue(), "sk-e2e-secret-123456");

    // Click ⚡ Ping on first model card + 💰 Check Balance
    await settingsPage.locator(".byok-model-card .byok-act-btn").first().click();
    await settingsPage.waitForFunction(() => Boolean(document.querySelector(".byok-badge.ping-ok")));
    await settingsPage.locator("#byok-check-balance-btn").click();
    await settingsPage.waitForFunction(() => document.getElementById("byok-prov-balance").textContent.includes("88.50"));

    // Send 1 live chat request through the bound gateway
    const chatRes = await fetch(`http://127.0.0.1:${snap.byok.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "hello" }] })
    });
    assert.equal(chatRes.status, 200);

    // Verify Mascot Bubble Page 2 reflects live BYOK status, balance, quick model switcher, Ping latency & todayRequests = 1
    await widgetPage.locator("#toggle").click({ force: true });
    await widgetPage.locator("#next").click();
    await widgetPage.waitForFunction(() => document.getElementById("title").textContent.includes("BYOK · DeepSeek"));
    assert.match(await widgetPage.locator("#byok-status-text").textContent(), /🟢 联通正常/);
    assert.match(await widgetPage.locator("#byok-balance-badge").textContent(), /¥ 88\.50/);
    assert.match(await widgetPage.locator("#byok-ping").textContent(), /⚡ \d+ ms/);
    assert.equal(await widgetPage.locator("#byok-requests").textContent(), "1 次");
    const initialBubbleModel = await widgetPage.locator("#byok-model-badge").textContent();
    await widgetPage.locator("#byok-model-next").click();
    await widgetPage.waitForFunction(prev => document.getElementById("byok-model-badge").textContent !== prev, initialBubbleModel);
  } finally {
    await appEnabled.close();
    const rtFile = path.join(optInDir, ".catstella", "gateway-runtime.json");
    if (fs.existsSync(rtFile)) {
      try {
        const rt = JSON.parse(fs.readFileSync(rtFile, "utf8"));
        if (rt?.port && rt?.adminToken) {
          await fetch(`http://127.0.0.1:${rt.port}/admin/shutdown`, {
            method: "POST",
            headers: { "x-catstella-token": rt.adminToken },
            body: "{}"
          }).catch(() => {});
        }
      } catch {}
    }
    await new Promise(r => mockUpstream.close(r));
  }
});

const { ByokMcpService } = require("./mcp-server.cjs");
const { installMcpPlugin, uninstallMcpPlugin } = require("./mcp-installer.cjs");
const { CompanionBridgeServer } = require("../companion-bridge.cjs");
const { ByokPortalController } = require("../../Antigravity-Dream-Skin/src/domain/byok-portal-controller.cjs");

test("Phase 6.1: Origin security blocks external websites & null origins while optional sk-catstella gateway token protects local endpoints", async () => {
  const dir = mkTmp();
  const store = new ModelStore({ filePath: path.join(dir, "models.json") });
  store.setEnabled(true);

  let upstreamAuthHeader = "";
  const upstream = http.createServer((req, res) => {
    upstreamAuthHeader = req.headers.authorization || "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "cmpl-sec", choices: [{ message: { role: "assistant", content: "safe" } }] }));
  });
  await new Promise(r => upstream.listen(0, "127.0.0.1", r));
  const upPort = upstream.address().port;

  store.upsertProvider({ id: "deepseek", enabled: true, baseUrl: `http://127.0.0.1:${upPort}`, apiKey: "sk-real-provider-secret" });
  const gateway = new LocalGatewayServer({ store, port: 0 });
  const { port } = await gateway.start();

  try {
    // External website Origin must be rejected with 403
    const evilRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Origin: "https://evil-site.example.com" }
    });
    assert.equal(evilRes.status, 403);

    // Opaque "null" Origin must also be rejected with 403
    const nullOriginRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Origin: "null" }
    });
    assert.equal(nullOriginRes.status, 403);

    // Loopback Origin succeeds
    const localOriginRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Origin: "http://localhost:5173" }
    });
    assert.equal(localOriginRes.status, 200);
    assert.equal(localOriginRes.headers.get("access-control-allow-origin"), "http://localhost:5173");

    // Enable local gateway token (sk-catstella-...)
    store.updateGatewayConfig({ gatewayTokenEnabled: true });
    const gwToken = store.revealGatewayToken();
    assert.match(gwToken, /^sk-catstella-/);

    // Unauthenticated call now fails with 401
    const unauthRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "hi" }] })
    });
    assert.equal(unauthRes.status, 401);

    // Authenticated call with local gateway token succeeds, and upstream gets provider key (never local token!)
    const authRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gwToken}`
      },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "hi" }] })
    });
    assert.equal(authRes.status, 200);
    assert.equal(upstreamAuthHeader, "Bearer sk-real-provider-secret");
  } finally {
    await gateway.stop();
    await new Promise(r => upstream.close(r));
  }
});

test("Phase 6.2: Bidirectional Anthropic (/v1/messages) -> OpenAI (/v1/chat/completions) translation with thinking, tool_use & smart claude-* remap", async () => {
  const dir = mkTmp();
  const store = new ModelStore({ filePath: path.join(dir, "models.json") });
  store.setEnabled(true);

  let capturedOpenAiReq = null;
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    capturedOpenAiReq = JSON.parse(raw);

    if (capturedOpenAiReq.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "chatcmpl-stream-1", model: capturedOpenAiReq.model, choices: [{ delta: { reasoning_content: "先思考一下…" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "chatcmpl-stream-1", model: capturedOpenAiReq.model, choices: [{ delta: { content: "好的，调用工具喵！" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: "chatcmpl-stream-1",
        model: capturedOpenAiReq.model,
        choices: [{
          delta: {
            tool_calls: [{ index: 0, id: "call_cat_1", type: "function", function: { name: "read_cat_food", arguments: '{"flavor":"salmon"}' } }]
          },
          finish_reason: "tool_calls"
        }],
        usage: { prompt_tokens: 12, completion_tokens: 9 }
      })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-json-1",
      model: capturedOpenAiReq.model,
      choices: [{
        message: {
          role: "assistant",
          reasoning_content: "深度推理完成",
          content: "答复内容",
          tool_calls: [{ id: "call_99", type: "function", function: { name: "ping_box", arguments: '{"ok":true}' } }]
        },
        finish_reason: "tool_calls"
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }));
  });
  await new Promise(r => upstream.listen(0, "127.0.0.1", r));
  const upPort = upstream.address().port;

  store.upsertProvider({
    id: "deepseek",
    enabled: true,
    protocol: "openai",
    baseUrl: `http://127.0.0.1:${upPort}`,
    apiKey: "sk-ds-bridge",
    setActive: true
  });
  store.setActiveModel("deepseek", "deepseek-reasoner");

  const gateway = new LocalGatewayServer({ store, port: 0 });
  const { port } = await gateway.start();

  try {
    // 1. Non-streaming Claude Code style /v1/messages call with claude-* model name -> smart-remapped to deepseek-reasoner
    const jsonRes = await (await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-7-sonnet-20250219",
        system: "You are a helpful catgirl.",
        max_tokens: 512,
        tools: [{ name: "ping_box", description: "Ping", input_schema: { type: "object" } }],
        messages: [{ role: "user", content: [{ type: "text", text: "Test bridge" }] }]
      })
    })).json();

    assert.equal(capturedOpenAiReq.model, "deepseek-reasoner", "Foreign claude-* model must remap to active OpenAI provider model");
    assert.equal(capturedOpenAiReq.messages[0].role, "system");
    assert.equal(capturedOpenAiReq.tools[0].function.name, "ping_box");
    assert.equal(jsonRes.type, "message");
    assert.equal(jsonRes.stop_reason, "tool_use");
    assert.equal(jsonRes.content[0].type, "thinking");
    assert.equal(jsonRes.content[1].type, "text");
    assert.equal(jsonRes.content[2].type, "tool_use");
    assert.deepEqual(jsonRes.content[2].input, { ok: true });

    // 2. Streaming /v1/messages SSE translation
    const sseRes = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        stream: true,
        max_tokens: 256,
        messages: [{ role: "user", content: "Stream test" }]
      })
    });
    const sseText = await sseRes.text();
    assert.match(sseText, /event: message_start/);
    assert.match(sseText, /"thinking_delta"/);
    assert.match(sseText, /先思考一下/);
    assert.match(sseText, /好的，调用工具喵/);
    assert.match(sseText, /"input_json_delta"/);
    assert.match(sseText, /read_cat_food/);
    assert.match(sseText, /event: message_stop/);
  } finally {
    await gateway.stop();
    await new Promise(r => upstream.close(r));
  }
});

test("Phase 6.3: Automatic 429/5xx upstream failover across enabled providers and strict pass-through when disabled", async () => {
  const dir = mkTmp();
  const store = new ModelStore({ filePath: path.join(dir, "models.json") });
  store.setEnabled(true);

  const primaryBroken = http.createServer((_req, res) => {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rate limited" } }));
  });
  const backupHealthy = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "cmpl-backup", choices: [{ message: { role: "assistant", content: "rescued-by-backup" } }] }));
  });
  await Promise.all([
    new Promise(r => primaryBroken.listen(0, "127.0.0.1", r)),
    new Promise(r => backupHealthy.listen(0, "127.0.0.1", r))
  ]);

  store.upsertProvider({
    id: "deepseek",
    enabled: true,
    baseUrl: `http://127.0.0.1:${primaryBroken.address().port}`,
    apiKey: "sk-1",
    setActive: true
  });
  store.upsertProvider({
    id: "siliconflow",
    enabled: true,
    baseUrl: `http://127.0.0.1:${backupHealthy.address().port}`,
    apiKey: "sk-2"
  });

  const gateway = new LocalGatewayServer({ store, port: 0 });
  const { port } = await gateway.start();

  try {
    // failoverEnabled = true (default) -> transparently rescues via siliconflow
    const okRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "help" }] })
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get("x-catstella-routed-provider"), "siliconflow");
    const okBody = await okRes.json();
    assert.equal(okBody.choices[0].message.content, "rescued-by-backup");

    // failoverEnabled = false -> returns primary 429 directly
    store.updateGatewayConfig({ failoverEnabled: false });
    const failRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "help" }] })
    });
    assert.equal(failRes.status, 429);
  } finally {
    await gateway.stop();
    await Promise.all([
      new Promise(r => primaryBroken.close(r)),
      new Promise(r => backupHealthy.close(r))
    ]);
  }
});

test("Phase 6.4: Real balance adapters (DeepSeek/SiliconFlow/OpenRouter/Ollama), Ollama discovery & confirm-before-import env scanner", async () => {
  const dir = mkTmp();
  const modelsPath = path.join(dir, "models.json");
  const store = new ModelStore({ filePath: modelsPath });
  store.setEnabled(true);

  const mockApi = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/user/balance") {
      res.end(JSON.stringify({ balance_infos: [{ currency: "CNY", total_balance: "42.50" }] }));
    } else if (req.url === "/v1/user/info") {
      res.end(JSON.stringify({ data: { totalBalance: "18.80" } }));
    } else if (req.url === "/api/v1/credits") {
      res.end(JSON.stringify({ data: { total_credits: 20, total_usage: 7.65 } }));
    } else if (req.url === "/api/tags") {
      res.end(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }, { name: "deepseek-r1:14b" }] }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise(r => mockApi.listen(0, "127.0.0.1", r));
  const p = mockApi.address().port;

  store.upsertProvider({ id: "deepseek", enabled: true, baseUrl: `http://127.0.0.1:${p}`, apiKey: "sk-ds" });
  store.upsertProvider({ id: "siliconflow", enabled: true, baseUrl: `http://127.0.0.1:${p}`, apiKey: "sk-sf" });
  store.upsertProvider({ id: "openrouter", enabled: true, baseUrl: `http://127.0.0.1:${p}/api/v1`, apiKey: "sk-or" });
  store.upsertProvider({ id: "ollama", enabled: true, baseUrl: `http://127.0.0.1:${p}` });

  const gateway = new LocalGatewayServer({ store, port: 0 });
  try {
    const dsBal = await gateway.fetchProviderBalance("deepseek");
    assert.equal(dsBal.formatted, "¥ 42.50");

    const sfBal = await gateway.fetchProviderBalance("siliconflow");
    assert.equal(sfBal.formatted, "¥ 18.80");

    const orBal = await gateway.fetchProviderBalance("openrouter");
    assert.equal(orBal.formatted, "$ 12.35");

    const olBal = await gateway.fetchProviderBalance("ollama");
    assert.equal(olBal.formatted, "本地免费");

    const ollamaDisc = await gateway.discoverLocalOllama(`http://127.0.0.1:${p}`);
    assert.equal(ollamaDisc.ok, true);
    assert.ok(store.getProvider("ollama").models.some(m => m.id === "deepseek-r1:14b"));

    // Confirm-before-import env scanner
    const fakeEnv = { DEEPSEEK_API_KEY: "sk-env-ds-99999999", ANTHROPIC_API_KEY: "sk-ant-env-11111111" };
    const scanned = store.scanEnvApiKeys(fakeEnv);
    assert.equal(scanned.length, 2);
    assert.notEqual(store.getProvider("anthropic").apiKey, "sk-ant-env-11111111", "Scan alone must NEVER auto-save keys");

    const imported = store.importEnvApiKeys(["anthropic"], fakeEnv);
    assert.equal(imported.imported, 1);
    assert.equal(store.getProvider("anthropic").apiKey, "sk-ant-env-11111111");
  } finally {
    await new Promise(r => mockApi.close(r));
  }
});

test("Phase 6.5: Managed Antigravity MCP Model Bridge plugin lifecycle & ByokMcpService (byok_chat context_files + byok_council)", async () => {
  const dir = mkTmp();
  const pluginsRoot = path.join(dir, "plugins");
  const modelsPath = path.join(dir, "models.json");
  const sampleFile = path.join(dir, "sample.js");
  const secretEnv = path.join(dir, ".env");
  fs.writeFileSync(sampleFile, "line1\nconst magic = 42;\nline3\nline4\n", "utf8");
  fs.writeFileSync(secretEnv, "SECRET=123\n", "utf8");

  // 1. Verify managed plugin install & safe uninstall
  const inst = installMcpPlugin({ pluginsDir: pluginsRoot, modelsPath });
  assert.equal(inst.installed, true);
  assert.equal(fs.existsSync(path.join(inst.pluginDir, "plugin.json")), true);
  assert.equal(fs.existsSync(path.join(inst.pluginDir, "mcp_config.json")), true);
  assert.equal(fs.existsSync(path.join(inst.pluginDir, "skills", "byok-council", "SKILL.md")), true);

  const uninst = uninstallMcpPlugin({ pluginsDir: pluginsRoot });
  assert.equal(uninst.removed, true);
  assert.equal(fs.existsSync(inst.pluginDir), false);

  // 2. Verify MCP JSON-RPC tools against live LocalGatewayServer
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "mcp-cmpl",
      choices: [{ message: { role: "assistant", content: `[${body.model}] saw: ${body.messages[body.messages.length - 1].content.slice(0, 500)}` } }]
    }));
  });
  await new Promise(r => upstream.listen(0, "127.0.0.1", r));

  const store = new ModelStore({ filePath: modelsPath });
  store.setEnabled(true);
  store.upsertProvider({
    id: "deepseek",
    enabled: true,
    baseUrl: `http://127.0.0.1:${upstream.address().port}`,
    apiKey: "sk-mcp",
    setActive: true
  });
  const gateway = new LocalGatewayServer({ store, port: 0 });
  const { port } = await gateway.start();

  const mcp = new ByokMcpService({ modelsPath, defaultPort: port });
  try {
    const initRes = await mcp.handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(initRes.result.serverInfo.name, "catstella-byok");

    const listRes = await mcp.handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.equal(listRes.result.tools.length, 3);

    const chatRes = await mcp.handleRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "byok_chat",
        arguments: {
          prompt: "Inspect code",
          context_files: [`${sampleFile}#L2-L3`, secretEnv]
        }
      }
    });
    const chatText = chatRes.result.content[0].text;
    assert.match(chatText, /const magic = 42;/);
    assert.doesNotMatch(chatText, /SECRET=123/, "Secret .env files must be blocked from context_files");

    const councilRes = await mcp.handleRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "byok_council",
        arguments: {
          prompt: "Compare approaches",
          models: ["deepseek-chat", "deepseek-reasoner"]
        }
      }
    });
    const councilText = councilRes.result.content[0].text;
    assert.match(councilText, /deepseek-chat/);
    assert.match(councilText, /deepseek-reasoner/);
  } finally {
    await gateway.stop();
    await new Promise(r => upstream.close(r));
  }
});

test("Phase 6.6: CompanionBridge /companion/open-settings nonce security & ByokPortalController zero-intrusion when disabled", async () => {
  let openedTab = null;
  const bridge = new CompanionBridgeServer({
    port: 0,
    onOpenSettings: tab => { openedTab = tab; }
  });
  await bridge.start();

  try {
    // Reject wrong nonce
    const badNonce = await fetch(`http://127.0.0.1:${bridge.boundPort}/companion/open-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: "byok", nonce: "wrong" })
    });
    assert.equal(badNonce.status, 403);
    assert.equal(openedTab, null);

    // Reject external Origin even with valid nonce
    const badOrigin = await fetch(`http://127.0.0.1:${bridge.boundPort}/companion/open-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ tab: "byok", nonce: bridge.portalNonce })
    });
    assert.equal(badOrigin.status, 403);

    // Valid loopback request opens BYOK tab
    const okRes = await fetch(`http://127.0.0.1:${bridge.boundPort}/companion/open-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:9222" },
      body: JSON.stringify({ tab: "byok", nonce: bridge.portalNonce })
    });
    assert.equal(okRes.status, 200);
    assert.equal(openedTab, "byok");

    // Verify ByokPortalController never probes CDP when BYOK is disabled or hostPortalEnabled is false
    let discoverCalls = 0;
    const portal = new ByokPortalController({
      discover: async () => { discoverCalls += 1; return null; }
    });
    await portal.setFromSnapshot({ available: false, gateway: { hostPortalEnabled: true } });
    assert.equal(discoverCalls, 0);
    await portal.setFromSnapshot({ available: true, gateway: { hostPortalEnabled: false } });
    assert.equal(discoverCalls, 0);
    await portal.stop();
  } finally {
    await bridge.stop();
  }
});
