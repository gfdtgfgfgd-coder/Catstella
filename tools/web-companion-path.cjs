// One source for installer packaging and character synchronization. Never consume
// the retired embedded copy or an unrelated D:\Gemini-Web-Companion directory.
const fs = require('node:fs');
const path = require('node:path');
function detectWebCompanion({ root = path.resolve(__dirname, '..'), override = process.env.WEB_COMPANION_PATH } = {}) {
  const base = path.resolve(override || path.join(root, '../Catstella-web/Gemini-Web-Companion'));
  const embedded = path.resolve(root, 'Gemini-Web-Companion');
  const valid = base !== embedded && ['scripts/build.js', 'manifest.json'].every(file => fs.existsSync(path.join(base, file)));
  if (!valid) {
    if (override) throw Error('WEB_COMPANION_PATH must identify the active Web extension source, not the retired embedded copy: ' + base);
    return null;
  }
  return { base, dist: process.env.CATSTELLA_WEB_DIST ? path.resolve(process.env.CATSTELLA_WEB_DIST) : path.join(base, 'dist') };
}
module.exports = { detectWebCompanion };
