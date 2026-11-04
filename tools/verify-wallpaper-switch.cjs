const {discover, Cdp} = require('../shared/host.cjs');
const {WallpaperManager} = require('../Antigravity-Dream-Skin/src/domain/theme-loader.cjs');
const {DreamSkinSettings} = require('../Antigravity-Dream-Skin/src/domain/settings.cjs');
const {installTheme} = require('../Antigravity-Dream-Skin/src/host/theme.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const d = await discover(); const cdp = new Cdp(d.target.webSocketDebuggerUrl); await cdp.ready;
  const mgr = new WallpaperManager({userDir: require('path').join(require('os').homedir(), '.antigravity-dream-skin/wallpapers')});
  const s = new DreamSkinSettings().getAll();
  const ids = mgr.orderedIds();
  await cdp.evaluate('window.__agyDreamSkinV2&&window.__agyDreamSkinV2.destroy()');
  const probe = '(()=>JSON.stringify([...document.querySelectorAll("#agy-dream-wallpaper-v2")].map(l=>Number(getComputedStyle(l).opacity).toFixed(2))))()';
  const inject = id => cdp.evaluate('(' + installTheme.toString() + ')(' + JSON.stringify({...mgr.payload({...s, wallpaperId: id}), owner: 'probe'}) + ')');
  await inject(ids[0]); console.log('initial', await cdp.evaluate(probe));
  await inject(ids[1]); await sleep(500); console.log('mid-fade (new,old)', await cdp.evaluate(probe));
  await sleep(1600); console.log('after fade', await cdp.evaluate(probe));
  await inject(ids[0]); // fade back; then 'none' mode
  await sleep(1800);
  await cdp.evaluate('window.__agyDreamSkinV2.update(' + JSON.stringify({...mgr.payload({...s, wallpaperId: ids[1], transition: 'none'}), owner: 'probe'}) + ')');
  console.log('transition none ->', await cdp.evaluate(probe));
  await cdp.evaluate('window.__agyDreamSkinV2.destroy()');
  cdp.close();
})().catch(e => console.error(e));
