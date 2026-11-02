// 星语喵伴 · Dream Skin Runtime Controller
(() => {
  let wallpaperEl = null;

  const getWallpaperUrl = () => {
    try {
      return chrome.runtime.getURL('assets/wallpapers/gemini-sheet.png');
    } catch (e) {
      return '';
    }
  };

  const applySkin = (enabled = true, opacity = 0.88) => {
    if (enabled) {
      if (!wallpaperEl) {
        wallpaperEl = document.createElement('div');
        wallpaperEl.id = 'kimino-dream-wallpaper';
        const imgUrl = getWallpaperUrl();
        wallpaperEl.style.backgroundImage = `linear-gradient(rgba(14, 10, 26, 0.45), rgba(14, 10, 26, 0.72)), url("${imgUrl}")`;
        document.documentElement.appendChild(wallpaperEl);
      }
      wallpaperEl.style.opacity = opacity.toString();
      wallpaperEl.style.display = 'block';
      document.documentElement.classList.add('kimino-dream-active');
    } else {
      if (wallpaperEl) {
        wallpaperEl.style.display = 'none';
      }
      document.documentElement.classList.remove('kimino-dream-active');
    }
  };

  try {
    chrome.storage.local.get(['skinEnabled', 'wallpaperOpacity'], (res) => {
      const isEnabled = res ? res.skinEnabled !== false : true;
      const opacity = res && res.wallpaperOpacity ? res.wallpaperOpacity : 0.88;
      applySkin(isEnabled, opacity);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.skinEnabled || changes.wallpaperOpacity) {
          chrome.storage.local.get(['skinEnabled', 'wallpaperOpacity'], (res) => {
            applySkin(res ? res.skinEnabled !== false : true, res && res.wallpaperOpacity ? res.wallpaperOpacity : 0.88);
          });
        }
      }
    });
  } catch (err) {
    console.warn('[星语喵伴] 初始化皮肤配置异常:', err);
    applySkin(true, 0.88);
  }

  console.log('[星语喵伴] Dream Skin 控制器就绪喵～✨');
})();
