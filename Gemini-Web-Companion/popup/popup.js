// Catstella · Popup Logic (支持 AGY 双端同步控制)
document.addEventListener('DOMContentLoaded', async () => {
  const api = (typeof browser !== 'undefined' && browser && browser.runtime && browser.runtime.id)
    ? browser
    : (typeof chrome !== 'undefined' ? chrome : null);

  const safeGet = async (keys) => {
    try { return (await api.storage.local.get(keys)) || {}; } catch (e) { return {}; }
  };
  const safeSet = (obj) => {
    try {
      const outcome = api.storage.local.set(obj);
      if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
    } catch (e) {}
  };
  const compat = window.KIMINO_API;
  const sendBridgePatch = patch => compat.sendMessage({ type: 'KG_BRIDGE_PATCH', patch });

  const bridgePill = document.getElementById('bridge-pill');
  const chkSyncChar = document.getElementById('chk-sync-char');
  const chkSyncWall = document.getElementById('chk-sync-wall');
  const segBtns = document.querySelectorAll('#seg-display-mode .seg-btn');
  const chkWidget = document.getElementById('chk-widget');
  const skinSelect = document.getElementById('skin-style');
  const chkAgyUsage = document.getElementById('chk-agy-usage');
  const chkSound = document.getElementById('chk-sound');
  const radioCharacters = document.querySelectorAll('input[name="character"]');
  const rangeScale = document.getElementById('range-scale');
  const valScale = document.getElementById('val-scale');
  const rangeTurns = document.getElementById('range-turns');
  const valTurns = document.getElementById('val-turns');
  const btnResetPos = document.getElementById('btn-reset-pos');
  const btnRefresh = document.getElementById('btn-refresh');
  const currentLabel = document.getElementById('character-current');
  const names = { 'gemini-star-v1': '星语', 'lin-cat': '霓音' };

  const renderFromStorage = async () => {
    if (!api) return;
    const config = await safeGet([
      'enabled', 'skinStyle', 'skinEnabled', 'syncAgyUsage', 'soundEnabled', 'character', 'widgetScale',
      'argonMaxSafeTurns', 'syncCharacter', 'syncWallpaper', 'petDisplayMode', 'agyBridgeState',
      'onlineCharacterPacks'
    ]);

    const online = !!config.agyBridgeState?.online;
    if (bridgePill) {
      bridgePill.className = 'bridge-pill' + (online ? ' online' : '');
      bridgePill.textContent = online ? '🟢 AGY 已联动' : '⚪ 独立模式';
    }

    chkSyncChar.checked = config.syncCharacter !== false;
    chkSyncWall.checked = config.syncWallpaper !== false;
    const mode = config.petDisplayMode === 'prefer-desktop' ? 'prefer-desktop' : 'both';
    segBtns.forEach((b) => {
      const selected = b.dataset.mode === mode;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-pressed', String(selected));
    });

    chkWidget.checked = config.enabled !== false;
    skinSelect.value = window.KiminoSkinStyle.read(config);
    chkAgyUsage.checked = config.syncAgyUsage !== false;
    chkSound.checked = !!config.soundEnabled;

    const savedPack = config.character || 'gemini-star-v1';
    const desktopPack = chkSyncChar.checked && online ? config.agyBridgeState?.desktop?.characterPack : null;
    const packName = id => names[id] || config.onlineCharacterPacks?.[id]?.name;
    const desktopName = desktopPack && packName(desktopPack);
    const localName = packName(savedPack) || names['gemini-star-v1'];
    const summary = `当前显示：${desktopName || localName} · ${desktopName ? '同步桌面' : '网页独立'}`;
    if (currentLabel.textContent !== summary) currentLabel.textContent = summary;
    radioCharacters.forEach((radio) => {
      radio.checked = radio.value === savedPack;
    });

    const currentScale = config.widgetScale || 200;
    rangeScale.value = currentScale;
    valScale.textContent = `${currentScale}px`;

    const currentTurns = config.argonMaxSafeTurns || 8;
    rangeTurns.value = currentTurns;
    valTurns.textContent = `${currentTurns} 轮`;
  };

  await renderFromStorage();

  compat.onChanged((changes, area) => {
    if (area === 'local' && ['agyBridgeState', 'syncCharacter', 'syncWallpaper', 'character',
      'onlineCharacterPacks', 'petDisplayMode', 'skinStyle', 'skinEnabled', 'syncAgyUsage'].some(key => changes[key])) void renderFromStorage();
  });
  void compat.sendMessage({ type: 'KG_BRIDGE_GET' });

  chkSyncChar.addEventListener('change', async () => {
    await sendBridgePatch({ syncCharacter: chkSyncChar.checked });
    renderFromStorage();
  });

  chkSyncWall.addEventListener('change', async () => {
    await sendBridgePatch({ syncWallpaper: chkSyncWall.checked });
    renderFromStorage();
  });

  segBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      segBtns.forEach((b) => b.classList.toggle('active', b === btn));
      await sendBridgePatch({ petDisplayMode: mode });
      renderFromStorage();
    });
  });

  chkWidget.addEventListener('change', () => {
    safeSet({ enabled: chkWidget.checked });
  });

  skinSelect.addEventListener('change', async () => {
    if (!await compat.storageSet(window.KiminoSkinStyle.patch(skinSelect.value))) void renderFromStorage();
  });
  chkAgyUsage.addEventListener('change', async () => {
    if (!await compat.storageSet({ syncAgyUsage: chkAgyUsage.checked })) void renderFromStorage();
  });

  chkSound.addEventListener('change', () => {
    safeSet({ soundEnabled: chkSound.checked });
    sendBridgePatch({ sound: chkSound.checked });
  });

  radioCharacters.forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      await compat.storageSet({ character: radio.value });
      void renderFromStorage();
    });
  });

  rangeScale.addEventListener('input', () => {
    const scale = parseInt(rangeScale.value, 10);
    valScale.textContent = `${scale}px`;
    safeSet({ widgetScale: scale });
  });

  rangeTurns.addEventListener('input', () => {
    const turns = parseInt(rangeTurns.value, 10);
    valTurns.textContent = `${turns} 轮`;
    safeSet({ argonMaxSafeTurns: turns });
  });

  btnResetPos.addEventListener('click', () => {
    try {
      const outcome = api.storage.local.remove('widgetPos');
      if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
    } catch (e) {}
    btnResetPos.textContent = '✓ 已复位！';
    setTimeout(() => { btnResetPos.textContent = '复位至右下角'; }, 1200);
  });

  btnRefresh.addEventListener('click', () => {
    try {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          try {
            const outcome = api.tabs.reload(tabs[0].id);
            if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
          } catch (e) {}
        }
      });
    } catch (e) {}
  });
});
