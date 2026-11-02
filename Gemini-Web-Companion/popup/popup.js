// 星语喵伴 · Popup Logic
document.addEventListener('DOMContentLoaded', async () => {
  // 与 content script 同款双命名空间垫片 (Firefox: browser.* / Chromium: chrome.*)
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

  let config = {};
  if (api) {
    config = await safeGet([
      'enabled',
      'skinEnabled',
      'soundEnabled',
      'character',
      'widgetScale',
      'argonMaxSafeTurns'
    ]);
  }

  chkWidget.checked = config.enabled !== false;
  chkSkin.checked = config.skinEnabled !== false;
  chkSound.checked = !!config.soundEnabled;

  const currentCharacter = config.character || 'gemini-star-v1';
  radioCharacters.forEach(radio => {
    radio.checked = radio.value === currentCharacter;
  });

  const currentScale = config.widgetScale || 200;
  rangeScale.value = currentScale;
  valScale.textContent = `${currentScale}px`;

  const currentTurns = config.argonMaxSafeTurns || 8;
  rangeTurns.value = currentTurns;
  valTurns.textContent = `${currentTurns} 轮`;

  chkWidget.addEventListener('change', () => {
    safeSet({ enabled: chkWidget.checked });
  });

  chkSkin.addEventListener('change', () => {
    safeSet({ skinEnabled: chkSkin.checked });
  });

  chkSound.addEventListener('change', () => {
    safeSet({ soundEnabled: chkSound.checked });
  });

  radioCharacters.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        safeSet({ character: radio.value });
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
    btnResetPos.textContent = '已复位！';
    setTimeout(() => { btnResetPos.textContent = '复位至右下角 / Reset Pos'; }, 1200);
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
