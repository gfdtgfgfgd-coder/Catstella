// 星语喵伴 · Popup Logic
document.addEventListener('DOMContentLoaded', async () => {
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
  try {
    config = await chrome.storage.local.get([
      'enabled',
      'skinEnabled',
      'soundEnabled',
      'character',
      'widgetScale',
      'argonMaxSafeTurns'
    ]);
  } catch (e) {}

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
    chrome.storage.local.set({ enabled: chkWidget.checked });
  });

  chkSkin.addEventListener('change', () => {
    chrome.storage.local.set({ skinEnabled: chkSkin.checked });
  });

  chkSound.addEventListener('change', () => {
    chrome.storage.local.set({ soundEnabled: chkSound.checked });
  });

  radioCharacters.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        chrome.storage.local.set({ character: radio.value });
      }
    });
  });

  rangeScale.addEventListener('input', () => {
    const scale = parseInt(rangeScale.value, 10);
    valScale.textContent = `${scale}px`;
    chrome.storage.local.set({ widgetScale: scale });
  });

  rangeTurns.addEventListener('input', () => {
    const turns = parseInt(rangeTurns.value, 10);
    valTurns.textContent = `${turns} 轮`;
    chrome.storage.local.set({ argonMaxSafeTurns: turns });
  });

  btnResetPos.addEventListener('click', () => {
    chrome.storage.local.remove('widgetPos', () => {
      btnResetPos.textContent = '已复位！';
      setTimeout(() => { btnResetPos.textContent = '复位至右下角 / Reset Pos'; }, 1200);
    });
  });

  btnRefresh.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  });
});
