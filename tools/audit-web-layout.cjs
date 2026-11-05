// Read-only layout guard. The old two-copy sync/adopt/push workflow is retired.
const fs = require('node:fs');
const path = require('node:path');
const webRoot = path.resolve(__dirname, '..');
const suiteRoot = path.resolve(webRoot, '../Catstella');
const distinctSuite = path.relative(webRoot, suiteRoot) !== '';
const active = path.join(webRoot, 'Gemini-Web-Companion');
const legacy = path.join(suiteRoot, 'Gemini-Web-Companion');
const report = { source: active, version: null, legacyCopy: distinctSuite && fs.existsSync(legacy) ? legacy : null, desktopSource: null, errors: [] };
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(active, 'manifest.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(active, 'package.json')));
  report.version = manifest.version;
  if (pkg.version !== manifest.version) report.errors.push('Extension package and manifest versions differ');
  if (report.legacyCopy) report.errors.push('Retired desktop-embedded extension copy has returned');
  const helper = path.join(suiteRoot, 'tools/web-companion-path.cjs');
  if (distinctSuite && fs.existsSync(helper)) {
    const selected = require(helper).detectWebCompanion();
    report.desktopSource = selected?.base || null;
    if (path.resolve(report.desktopSource || suiteRoot) !== active) report.errors.push('Desktop tools do not select this active Web source');
    for (const [desktop, web] of [
      ['shared/online.js', 'online/client.js'],
      ['Antigravity-Cat-Widget/src/renderer/online-panel.js', 'online/panel.js'],
      ['Antigravity-Cat-Widget/src/renderer/ambient.js', 'content/ambient.js']
    ]) {
      const original = path.join(suiteRoot, desktop);
      if (!fs.existsSync(original)) continue;
      const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (read(original) !== read(path.join(active, web))) report.errors.push(`Shared runtime drift: ${web}`);
    }
  }
} catch (error) { report.errors.push(error.message); }
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.errors.length ? 1 : 0;
