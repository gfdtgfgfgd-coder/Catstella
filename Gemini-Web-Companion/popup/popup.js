// 星语喵伴 · Popup Logic (支持 AGY 双端同步控制)
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
  const sendBridgePatch = (patch) => new Promise((resolve) => {
    if (!api || !api.runtime || !api.runtime.sendMessage) { resolve(null); return; }
    try {
      api.runtime.sendMessage({ type: 'KG_BRIDGE_PATCH', patch }, (res) => {
        try { void api.runtime.lastError; } catch (e) {}
        resolve(res || null);
      });
    } catch (e) { resolve(null); }
  });

  const bridgePill = document.getElementById('bridge-pill');
  const chkSyncChar = document.getElementById('chk-sync-char');
  const chkSyncWall = document.getElementById('chk-sync-wall');
  const segBtns = document.querySelectorAll('#seg-display-mode .seg-btn');
  const chkWidget = document.getElementById('chk-widget');
  const chkSkin = document.getElementById('chk-skin');
  const chkSound = document.getElementById('chk-sound');
  const radioCharacters = document.querySelectorAll('input[name="character"]');
  const rangeScale = document.getElementById('range-scale');
  const valScale = document.getElementById('val-scale');
  const rangeTurns = document.getElementById('range-turns');
  const valTurns = document.getElementById('val-turns');
  const btnResetPos = document.getElementById('btn-reset-pos');
  const btnRefresh = document.getElementById('btn-refresh');

  const renderFromStorage = async () => {
    if (!api) return;
    const config = await safeGet([
      'enabled', 'skinEnabled', 'soundEnabled', 'character', 'widgetScale',
      'argonMaxSafeTurns', 'syncCharacter', 'syncWallpaper', 'petDisplayMode', 'agyBridgeState'
    ]);

    const online = !!config.agyBridgeState?.online;
    if (bridgePill) {
      bridgePill.className = 'bridge-pill' + (online ? ' online' : '');
      bridgePill.textContent = online ? '🟢 AGY 已联动' : '⚪ 独立模式';
    }

    chkSyncChar.checked = config.syncCharacter !== false;
    chkSyncWall.checked = config.syncWallpaper !== false;
    const mode = config.petDisplayMode || 'both';
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));

    chkWidget.checked = config.enabled !== false;
    chkSkin.checked = config.skinEnabled !== false;
    chkSound.checked = !!config.soundEnabled;

    const currentCharacter = (chkSyncChar.checked && online && config.agyBridgeState?.desktop?.characterPack)
      ? config.agyBridgeState.desktop.characterPack
      : (config.character || 'gemini-star-v1');
    radioCharacters.forEach((radio) => {
      radio.checked = radio.value === currentCharacter;
    });

    const currentScale = config.widgetScale || 200;
    rangeScale.value = currentScale;
    valScale.textContent = `${currentScale}px`;

    const currentTurns = config.argonMaxSafeTurns || 8;
    rangeTurns.value = currentTurns;
    valTurns.textContent = `${currentTurns} 轮`;
  };

  await renderFromStorage();

  // 打开 Popup 时顺便触发一次桌面端握手探测
  if (api && api.runtime && api.runtime.sendMessage) {
    try {
      api.runtime.sendMessage({ type: 'KG_TAB_HEARTBEAT', active: true }, () => {
        try { void api.runtime.lastError; } catch (e) {}
        renderFromStorage();
      });
    } catch (e) {}
  }

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

  chkSkin.addEventListener('change', () => {
    safeSet({ skinEnabled: chkSkin.checked });
  });

  chkSound.addEventListener('change', () => {
    safeSet({ soundEnabled: chkSound.checked });
    sendBridgePatch({ sound: chkSound.checked });
  });

  radioCharacters.forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      if (chkSyncChar.checked) {
        await sendBridgePatch({ characterPack: radio.value });
      } else {
        safeSet({ character: radio.value, customCharacter: null });
      }
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
