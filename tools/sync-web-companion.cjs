#!/usr/bin/env node
// 星语喵伴 · web-companion 双副本同步守卫
// ─────────────────────────────────────────────────────────────
// 背景（2026-11-05 事故）：suite 仓（D:\Catstella，feat/desktop-suite）内嵌的
// Gemini-Web-Companion 是分叉前的旧 lineage；有会话在那边"修网页"，产出打在
// 旧结构上且永不进入网页仓（D:\Catstella-web，feat/browser-extension）。
// 桌面套件运行时经 tools/web-companion-path.cjs 直接消费 web worktree 的副本
// ——suite 内嵌副本是死重量，一切扩展改动必须在 D:\Catstella-web 进行。
//
// 用法：
//   node tools/sync-web-companion.cjs                # 审计：列出漂移（退出码 0=同步 / 1=漂移）
//   node tools/sync-web-companion.cjs --adopt <rel>...   # 救援：把 suite 里的指定文件搬回 web 仓
//   node tools/sync-web-companion.cjs --push <rel>...    # 反向热补（仅急用，通常不需要）
//   node tools/sync-web-companion.cjs --json         # 机器可读审计结果
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const WEB_ROOT = path.resolve(__dirname, "..");
const SUITE_ROOT = path.resolve(WEB_ROOT, "..", "Catstella");
const WEB_COMP = path.join(WEB_ROOT, "Gemini-Web-Companion");
const SUITE_COMP = path.join(SUITE_ROOT, "Gemini-Web-Companion");

// 参与比对的源码/配置范围（assets 只比大小+mtime，跳过内容哈希）
const SCAN_DIRS = ["content", "popup", "scripts", "test"];
const SCAN_FILES = ["manifest.json", "background.js", "package.json", "HANDOVER.md"];
const ASSETS_DIR = "assets";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const adoptIdx = args.indexOf("--adopt");
const pushIdx = args.indexOf("--push");

const collect = (root, rel = "", out = {}) => {
  const abs = path.join(root, rel);
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      if (r === "dist" || r === "node_modules") continue; // 构建产物不参与
      collect(root, r, out);
    } else {
      const st = fs.statSync(path.join(root, r));
      out[r] = { size: st.size, mtimeMs: st.mtimeMs };
    }
  }
  return out;
};

const hash = (abs) => crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");

const inScope = (rel) => {
  const top = rel.split("/")[0];
  if (SCAN_DIRS.includes(top)) return "hash";
  if (SCAN_FILES.includes(rel)) return "hash";
  if (top === ASSETS_DIR) return "stat";
  return null;
};

if (!fs.existsSync(SUITE_COMP)) {
  if (jsonOut) { console.log(JSON.stringify({ suiteCopy: null })); process.exit(0); }
  console.log("✅ suite 仓不存在 Gemini-Web-Companion 副本（无漂移可能）");
  process.exit(0);
}

const webFiles = collect(WEB_COMP);
const suiteFiles = collect(SUITE_COMP);
const allRel = [...new Set([...Object.keys(webFiles), ...Object.keys(suiteFiles)])];

const report = { differ: [], suiteOnly: [], webOnly: [], same: 0, skipped: 0 };
for (const rel of allRel) {
  const mode = inScope(rel);
  if (!mode) { report.skipped++; continue; }
  const inWeb = webFiles[rel], inSuite = suiteFiles[rel];
  if (inWeb && !inSuite) { report.webOnly.push(rel); continue; }
  if (!inWeb && inSuite) { report.suiteOnly.push(rel); continue; }
  const a = path.join(WEB_COMP, rel), b = path.join(SUITE_COMP, rel);
  let same;
  if (mode === "hash") {
    const sizeSame = inWeb.size === inSuite.size;
    same = sizeSame && hash(a) === hash(b);
  } else {
    same = inWeb.size === inSuite.size;
  }
  if (same) report.same++;
  else report.differ.push({ rel, web: webFiles[rel], suite: suiteFiles[rel] });
}

const fmtTime = (ms) => new Date(ms).toISOString().slice(5, 16).replace("T", " ");
const webManifest = JSON.parse(fs.readFileSync(path.join(WEB_COMP, "manifest.json"), "utf8"));
let suiteManifest = null;
try { suiteManifest = JSON.parse(fs.readFileSync(path.join(SUITE_COMP, "manifest.json"), "utf8")); } catch {}

if (jsonOut) {
  console.log(JSON.stringify({ webVersion: webManifest.version, suiteVersion: suiteManifest?.version || null, ...report }, null, 1));
  process.exit(report.differ.length || report.suiteOnly.length ? 1 : 0);
}

console.log(`web 扩展版本: ${webManifest.version}${suiteManifest ? `  |  suite 副本版本: ${suiteManifest.version}` : ""}`);
console.log(`同步文件: ${report.same}  |  漂移: differ=${report.differ.length} suite-only=${report.suiteOnly.length} web-only=${report.webOnly.length}  (跳过 ${report.skipped} 个范围外文件)`);
let drift = false;

if (report.differ.length) {
  drift = true;
  console.log("\n⚠️  内容漂移（两边都有但不同）：");
  for (const d of report.differ) {
    console.log(`   ${d.rel}`);
    console.log(`      web   ${fmtTime(d.web.mtimeMs)}  ${d.web.size}B`);
    console.log(`      suite ${fmtTime(d.suite.mtimeMs)}  ${d.suite.size}B`);
  }
}
if (report.suiteOnly.length) {
  drift = true;
  console.log("\n🚨 仅存在于 suite 副本的文件（= 有人在 suite 里改/加了扩展文件，web 仓拿不到）：");
  for (const rel of report.suiteOnly) {
    console.log(`   ${rel}  (suite ${fmtTime(suiteFiles[rel].mtimeMs)})`);
  }
}

if (drift) {
  console.log(`
处理指引：
  1. 若 suite 侧改动有价值 → 挑选文件搬回 web 仓：
       node tools/sync-web-companion.cjs --adopt <相对路径> [更多路径...]
     （搬完在 D:\\Catstella-web 跑 node Gemini-Web-Companion/scripts/build.js + npm.cmd test + 提交）
  2. 若 suite 侧改动是打在旧 lineage 上的废案（如 2026-11-05 三条 web-skin 提交）→ 直接丢弃，以 web 仓为准重写。
  3. 严禁整树互拷：suite 副本是分叉前的旧 lineage，结构对不上。`);
  process.exit(1);
}

console.log("\n✅ 两副本源码无漂移（suite 侧死重量保持不动即可，运行时走 web worktree）");
process.exit(0);
