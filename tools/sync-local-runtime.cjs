// Refresh an existing local test installation without rebuilding the installer
// or replacing its browser extension directory (and therefore its browser ID).
const fs = require('node:fs');
const path = require('node:path');
const { stripByokUi } = require('./release-payload.cjs');
const { detectWebCompanion } = require('./web-companion-path.cjs');
const root = path.resolve(__dirname, '..');
const desktop = process.argv.includes('--desktop');
const web = process.argv.includes('--web');
if (!desktop && !web) throw Error('Specify --desktop and/or --web');
const changes = [];
const backup = fs.mkdtempSync(path.join(root, 'dist/local-runtime-backup-'));
const allowed = /\.(?:cjs|js|css|html|json)$/i;

function queueTree(source, target, key, include = () => true) {
  for (const entry of fs.readdirSync(source, {withFileTypes:true})) {
    const src = path.join(source, entry.name), dst = path.join(target, entry.name);
    if (!include(entry.name)) continue;
    if (entry.isDirectory()) queueTree(src, dst, path.join(key, entry.name), include);
    else if (entry.isFile() && allowed.test(entry.name) && !entry.name.endsWith('.test.cjs')) {
      const after = fs.readFileSync(src);
      const before = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
      if (!before?.equals(after)) changes.push({dst, before, after, key:path.join(key,entry.name)});
    }
  }
}
if (desktop) {
  const suite = path.resolve(process.env.LOCALAPPDATA, 'Programs/Catstella/Suite');
  const app = path.join(suite, 'resources/app');
  if (fs.realpathSync(suite).toLowerCase() !== suite.toLowerCase() ||
      fs.readFileSync(path.join(suite,'.starsuite-install'),'utf8').trim() !== 'Suite' ||
      JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8')).name !== 'catstella') {
    throw Error('Expected the installed Catstella Suite');
  }
  const staging = path.join(backup, 'staged');
  const pet = 'Antigravity-Cat-Widget/src';
  fs.cpSync(path.join(root,pet),path.join(staging,pet),{recursive:true});
  stripByokUi(staging);
  queueTree(path.join(staging,pet),path.join(app,pet),path.join('desktop',pet),
    name => name !== 'native' && !name.startsWith('byok-portal'));
  for (const area of ['Antigravity-Dream-Skin/src/host', 'Antigravity-Dream-Skin/src/domain', 'shared']) {
    queueTree(path.join(root,area),path.join(app,area),path.join('desktop',area),
      name => !['vendor','gateway'].includes(name));
  }
  const dialogue = 'Antigravity-Cat-Widget/assets/dialogue';
  queueTree(path.join(root,dialogue),path.join(app,dialogue),path.join('desktop',dialogue));
}
if (web) {
  const source = detectWebCompanion({ root });
  const target = path.join(source.dist, 'chromium');
  const manifestPath = path.join(target,'manifest.json');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  if (fs.realpathSync(target).toLowerCase() !== target.toLowerCase() ||
      manifest.background?.service_worker !== 'background.js') throw Error('Expected the existing Chromium load directory');
  for (const area of ['content','popup','online']) {
    queueTree(path.join(source.base,area),path.join(target,area),path.join('web',area));
  }
  const dst = path.join(target,'background.js');
  const before = fs.readFileSync(dst), after = fs.readFileSync(path.join(source.base,'background.js'));
  if (!before.equals(after)) changes.push({dst,before,after,key:'web/background.js'});
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(source.base,'manifest.json'),'utf8'));
  const widgetGroup = data => data.content_scripts.find(group => group.js?.includes('content/widget.js'));
  const liveGroup = widgetGroup(manifest), sourceGroup = widgetGroup(sourceManifest);
  if (JSON.stringify(liveGroup.js) !== JSON.stringify(sourceGroup.js)) {
    for (const name of sourceGroup.js) {
      if (!/^content\/[\w.-]+\.js$/.test(name) || !fs.existsSync(path.join(source.base,name))) {
        throw Error('Unexpected content script: ' + name);
      }
    }
    liveGroup.js = sourceGroup.js;
    changes.push({ dst:manifestPath, before:manifestBytes, after:Buffer.from(JSON.stringify(manifest,null,2)+'\n'), key:'web/manifest.json' });
  }
}
function replace(file, bytes) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = file + '.catstella-live-' + process.pid;
  try { fs.writeFileSync(temp,bytes,{flag:'wx'}); fs.renameSync(temp,file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
const applied = [];
try {
  for (const item of changes) {
    if (item.before) replace(path.join(backup,item.key),item.before);
    replace(item.dst,item.after);
    applied.push(item);
  }
  for (const item of changes) if (!fs.readFileSync(item.dst).equals(item.after)) throw Error('Verification failed: '+item.key);
} catch (error) {
  for (const item of applied.reverse()) {
    if (item.before) replace(item.dst,item.before);
    else fs.unlinkSync(item.dst);
  }
  throw error;
}
console.log(JSON.stringify({desktop,web,changed:changes.map(item=>item.key),backup}));
