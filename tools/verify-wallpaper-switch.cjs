const {discover, Cdp} = require('../shared/host.cjs');
const {WallpaperManager} = require('../Antigravity-Dream-Skin/src/domain/theme-loader.cjs');
const {DreamSkinSettings} = require('../Antigravity-Dream-Skin/src/domain/settings.cjs');
const {installTheme} = require('../Antigravity-Dream-Skin/src/host/theme.cjs');
(async () => {
  const d = await discover(); const cdp = new Cdp(d.target.webSocketDebuggerUrl); await cdp.ready;
  const mgr = new WallpaperManager({userDir: require('path').join(require('os').homedir(), '.antigravity-dream-skin/wallpapers')});
  const s = new DreamSkinSettings().getAll();
  const ids = mgr.orderedIds(); console.log('packs:', ids);
  await cdp.evaluate('window.__agyDreamSkinV2&&window.__agyDreamSkinV2.destroy()');
  const probe = '(()=>{const l=[...document.querySelectorAll("#agy-dream-wallpaper-v2")];return{count:l.length,sig:l[0]&&l[0].style.backgroundImage.length,size:l[0]&&l[0].style.backgroundSize}})()';
  for (const id of [ids[0], ids[1], ids[0]]) {
    const payload = {...mgr.payload({...s, wallpaperId: id}), owner: 'probe'};
    await cdp.evaluate('(' + installTheme.toString() + ')(' + JSON.stringify(payload) + ')');
    console.log(id, JSON.stringify(await cdp.evaluate(probe)));
  }
  await cdp.evaluate('window.__agyDreamSkinV2.destroy()');
  cdp.close();
})().catch(e => console.error(e));
