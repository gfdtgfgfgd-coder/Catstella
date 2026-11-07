const fs = require('node:fs');
const path = require('node:path');
const { catalog } = require('../shared/online.js');

// Only the preview pack is shipped locally. Future additions can stay online.
function writeOnlineSeed(source, target) {
  const raw = JSON.parse(fs.readFileSync(path.join(source, 'catalog.json'), 'utf8'));
  const items = raw.items.filter(item => item.pack?.id === 'moriyama-catgirl-pack');
  const manifest = { schema: 1, items };
  const entries = catalog(manifest);
  if (!entries.length || entries.some(entry => !entry.pack || !entry.preview)) throw Error('Invalid preview wallpaper pack');
  fs.mkdirSync(path.join(target, 'wallpapers'), { recursive: true });
  for (const entry of entries) fs.copyFileSync(path.join(source, entry.path), path.join(target, entry.path));
  fs.writeFileSync(path.join(target, 'catalog.json'), JSON.stringify(manifest));
}

module.exports = { writeOnlineSeed };
