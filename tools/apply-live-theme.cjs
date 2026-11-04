const {discover, Cdp} = require('../shared/host.cjs');
const {WallpaperManager} = require('../Antigravity-Dream-Skin/src/domain/theme-loader.cjs');
const {DreamSkinSettings} = require('../Antigravity-Dream-Skin/src/domain/settings.cjs');
const {installTheme} = require('../Antigravity-Dream-Skin/src/host/theme.cjs');

(async () => {
  const d = await discover();
  if (!d) {
    console.error('Antigravity not found');
    return;
  }
  const cdp = new Cdp(d.target.webSocketDebuggerUrl);
  await cdp.ready;

  const skinSettings = new DreamSkinSettings();
  const skinManager = new WallpaperManager();
  const payload = {
    ...skinManager.payload(skinSettings.getAll()),
    owner: 'starsuite-desktop-host'
  };

  console.log('Applying live theme with owner: starsuite-desktop-host, image length:', payload.image.length);

  // First, completely remove any lingering old wallpaper elements and styles
  await cdp.evaluate(`(() => {
    document.querySelectorAll('#agy-dream-style-v2, #agy-dream-wallpaper-v2').forEach(el => el.remove());
    if (window.__agyDreamSkinV2) {
      try { window.__agyDreamSkinV2.destroy(); } catch (e) {}
    }
  })()`);

  // Inject the new installTheme
  const result = await cdp.evaluate('(' + installTheme.toString() + ')(' + JSON.stringify(payload) + ')');
  console.log('Live injection result:', result);

  // Verify DOM elements count
  const domCheck = await cdp.evaluate(`(() => {
    return {
      wallpapers: document.querySelectorAll('#agy-dream-wallpaper-v2').length,
      styles: document.querySelectorAll('#agy-dream-style-v2').length,
      owner: window.__agyDreamSkinV2?.owner
    };
  })()`);
  console.log('DOM check after injection:', domCheck);

  cdp.close();
})().catch(e => console.error(e));
