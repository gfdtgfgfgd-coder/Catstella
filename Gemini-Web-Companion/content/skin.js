// 星语喵伴 · Dream Skin Runtime Controller (双图层平滑淡入淡出与 127.0.0.1:3921 漫游同步)
(() => {
  let wallpaperRoot = null;
  let layerA = null;
  let layerB = null;
  let activeLayer = null;
  let inactiveLayer = null;

  let currentUrl = '';
  let currentOpacity = 0.88;
  let isSkinEnabled = true;
  let isSwitching = false;
  let pollTimer = null;

  const getDefaultWallpaperUrl = () => {
    try {
      return chrome.runtime.getURL('assets/wallpapers/gemini-sheet.png');
    } catch (e) {
      return '';
    }
  };

  const ensureDom = () => {
    if (!wallpaperRoot) {
      wallpaperRoot = document.getElementById('kimino-dream-wallpaper');
      if (!wallpaperRoot) {
        wallpaperRoot = document.createElement('div');
        wallpaperRoot.id = 'kimino-dream-wallpaper';
        wallpaperRoot.setAttribute('aria-hidden', 'true');

        layerA = document.createElement('div');
        layerA.className = 'kimino-wallpaper-layer layer-a';
        layerA.style.opacity = '0';

        layerB = document.createElement('div');
        layerB.className = 'kimino-wallpaper-layer layer-b';
        layerB.style.opacity = '0';

        wallpaperRoot.appendChild(layerA);
        wallpaperRoot.appendChild(layerB);
        document.documentElement.appendChild(wallpaperRoot);

        activeLayer = layerA;
        inactiveLayer = layerB;
      } else {
        layerA = wallpaperRoot.querySelector('.layer-a') || wallpaperRoot.children[0];
        layerB = wallpaperRoot.querySelector('.layer-b') || wallpaperRoot.children[1];
        activeLayer = layerA;
        inactiveLayer = layerB;
      }
    }
  };

  const preloadImage = (url) => {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const img = new Image();
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => resolve(true)).catch(() => resolve(true));
        } else {
          resolve(true);
        }
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  };

  const setWallpaper = async (targetUrl, targetOpacity = 0.88, immediate = false) => {
    if (!targetUrl) targetUrl = getDefaultWallpaperUrl();
    ensureDom();

    if (currentUrl === targetUrl && Math.abs(currentOpacity - targetOpacity) < 0.01 && activeLayer && activeLayer.style.opacity > 0) {
      return;
    }

    if (isSwitching && !immediate) return;
    isSwitching = true;

    try {
      await preloadImage(targetUrl);

      const bgStyle = `linear-gradient(rgba(14, 10, 26, 0.45), rgba(14, 10, 26, 0.72)), url("${targetUrl}")`;
      inactiveLayer.style.backgroundImage = bgStyle;

      if (immediate || !currentUrl) {
        inactiveLayer.style.transition = 'none';
        activeLayer.style.transition = 'none';
        inactiveLayer.style.opacity = targetOpacity.toString();
        activeLayer.style.opacity = '0';
        void inactiveLayer.offsetWidth;
        inactiveLayer.style.transition = '';
        activeLayer.style.transition = '';
      } else {
        inactiveLayer.style.opacity = '0';
        void inactiveLayer.offsetWidth;

        requestAnimationFrame(() => {
          inactiveLayer.style.opacity = targetOpacity.toString();
          activeLayer.style.opacity = '0';
        });
      }

      // 交换图层引用
      const temp = activeLayer;
      activeLayer = inactiveLayer;
      inactiveLayer = temp;

      currentUrl = targetUrl;
      currentOpacity = targetOpacity;
    } catch (err) {
      console.warn('[星语喵伴] 壁纸平滑过渡异常:', err);
    } finally {
      setTimeout(() => { isSwitching = false; }, immediate ? 50 : 1250);
    }
  };

  const applySkin = (enabled = true, opacity = 0.88, url = null) => {
    isSkinEnabled = enabled;
    currentOpacity = opacity;
    ensureDom();

    if (enabled) {
      wallpaperRoot.style.display = 'block';
      document.documentElement.classList.add('kimino-dream-active');
      setWallpaper(url || currentUrl || getDefaultWallpaperUrl(), opacity, !currentUrl);
    } else {
      wallpaperRoot.style.display = 'none';
      document.documentElement.classList.remove('kimino-dream-active');
    }
  };

  // 与桌面端 CompanionBridge (127.0.0.1:3921) 壁纸漫游与状态同步
  const syncWithDesktopBridge = async () => {
    if (!isSkinEnabled) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('http://127.0.0.1:3921/companion/state', {
        signal: controller.signal,
        headers: { 'X-Catstella-Client': 'web-companion' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.sync?.syncWallpaper !== false && data.desktop?.wallpaperId) {
          const rev = data.desktop.wallpaperRev || '';
          const remoteUrl = `http://127.0.0.1:3921/companion/wallpaper-image?id=${encodeURIComponent(data.desktop.wallpaperId)}&rev=${encodeURIComponent(rev)}`;
          let remoteOpacity = currentOpacity;
          if (typeof data.desktop?.opacity === 'number') {
            remoteOpacity = Math.max(0.3, Math.min(1.0, data.desktop.opacity / 100));
          }
          await setWallpaper(remoteUrl, remoteOpacity, false);
          return;
        }
      }
    } catch (e) {
      // 桌面端未启动或离线，保持当前壁纸或兜底
    }
  };

  const startBridgeSync = () => {
    if (pollTimer) clearInterval(pollTimer);
    setTimeout(syncWithDesktopBridge, 1000);
    pollTimer = setInterval(syncWithDesktopBridge, 4000);
  };

  try {
    chrome.storage.local.get(['skinEnabled', 'wallpaperOpacity', 'customWallpaperUrl'], (res) => {
      const isEnabled = res ? res.skinEnabled !== false : true;
      const opacity = res && typeof res.wallpaperOpacity === 'number' ? res.wallpaperOpacity : 0.88;
      const customUrl = res ? res.customWallpaperUrl : null;
      applySkin(isEnabled, opacity, customUrl);
      startBridgeSync();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.skinEnabled || changes.wallpaperOpacity || changes.customWallpaperUrl) {
          chrome.storage.local.get(['skinEnabled', 'wallpaperOpacity', 'customWallpaperUrl'], (res) => {
            const isEnabled = res ? res.skinEnabled !== false : true;
            const opacity = res && typeof res.wallpaperOpacity === 'number' ? res.wallpaperOpacity : 0.88;
            const customUrl = res ? res.customWallpaperUrl : null;
            applySkin(isEnabled, opacity, customUrl);
          });
        }
      }
    });
  } catch (err) {
    console.warn('[星语喵伴] 初始化皮肤配置异常:', err);
    applySkin(true, 0.88);
  }

  console.log('[星语喵伴] Dream Skin 平滑过渡控制器就绪喵～✨');
})();
