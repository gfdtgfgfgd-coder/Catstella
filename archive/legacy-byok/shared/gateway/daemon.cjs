const fs = require("node:fs");
const path = require("node:path");
const { ModelStore, defaultModelsPath, DEFAULT_GATEWAY_PORT } = require("./store.cjs");
const { LocalGatewayServer, probeExistingGateway } = require("./server.cjs");

async function main() {
  const modelsArg = process.argv.find(a => a.startsWith("--models-path="))?.slice(14);
  const portArg = Number(process.argv.find(a => a.startsWith("--port="))?.slice(7));
  const filePath = modelsArg || defaultModelsPath();
  const runtimePath = path.join(path.dirname(filePath), "gateway-runtime.json");

  if (process.argv.includes("--stop")) {
    try {
      if (fs.existsSync(runtimePath)) {
        const rt = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
        if (rt?.port && rt?.adminToken) {
          await new Promise(resolve => {
            const http = require("node:http");
            const req = http.request(
              {
                hostname: "127.0.0.1",
                port: rt.port,
                path: "/admin/shutdown",
                method: "POST",
                headers: { "x-catstella-token": rt.adminToken, "Content-Length": "2" },
                timeout: 1500
              },
              res => { res.resume(); res.on("end", resolve); }
            );
            req.on("error", resolve);
            req.on("timeout", () => { req.destroy(); resolve(); });
            req.end("{}");
          });
        }
        fs.rmSync(runtimePath, { force: true });
      }
    } catch {}
    process.exit(0);
  }

  const preferredPort = Number.isInteger(portArg) && portArg >= 1024 && portArg <= 65535 ? portArg : DEFAULT_GATEWAY_PORT;
  const existing = await probeExistingGateway(preferredPort);
  if (existing && existing.ok) {
    process.stdout.write(`READY:${existing.port}\n`);
    process.exit(0);
  }

  const store = new ModelStore({ filePath });
  if (!store.data.enabled) {
    store.setEnabled(true);
  }
  const server = new LocalGatewayServer({ store, port: preferredPort });
  const { port } = await server.start();

  try {
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(
      runtimePath,
      JSON.stringify({ pid: process.pid, port, adminToken: server.adminToken, startedAt: Date.now() }, null, 2) + "\n",
      { mode: 0o600 }
    );
  } catch {}

  process.stdout.write(`READY:${port}\n`);

  const cleanup = async () => {
    try { fs.rmSync(runtimePath, { force: true }); } catch {}
    await server.stop();
    process.exit(0);
  };

  server.on("shutdown-requested", () => {
    try { fs.rmSync(runtimePath, { force: true }); } catch {}
    process.exit(0);
  });
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write((err?.stack || err?.message || String(err)) + "\n");
    process.exit(1);
  });
}
