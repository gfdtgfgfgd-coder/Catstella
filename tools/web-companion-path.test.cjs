const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectWebCompanion } = require('./web-companion-path.cjs');
test('packaging selects the active worktree, honors explicit sources, and rejects the embedded copy', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'catstella-source-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('catstella-source-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const root = path.join(temp, 'Catstella');
  const active = path.join(temp, 'Catstella-web/Gemini-Web-Companion');
  const embedded = path.join(root, 'Gemini-Web-Companion');
  const unrelated = path.join(temp, 'Gemini-Web-Companion');
  const external = path.join(temp, 'explicit-source');
  for (const dir of [active, embedded, unrelated, external]) {
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts/build.js'), '');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
  }
  assert.equal(detectWebCompanion({ root, override: '' }).base, active);
  assert.equal(detectWebCompanion({ root, override: external }).base, external);
  assert.throws(() => detectWebCompanion({ root, override: embedded }), /retired embedded/);
  assert.throws(() => detectWebCompanion({ root, override: path.join(temp, 'missing') }), /active Web/);
  fs.unlinkSync(path.join(active, 'manifest.json'));
  assert.equal(detectWebCompanion({ root, override: '' }), null, 'must not fall back to either stale copy');
});
