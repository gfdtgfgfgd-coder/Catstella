// 星语喵伴 · Cat Pet Widget (Shadow DOM + Zero-CSP Embedded Architecture)
(() => {
  // 内置全量傲娇台词库（确保火狐与 CSP 限制环境下零网络依赖秒级启动）
  const EMBEDDED_DIALOGUES = {
    idle: [
      "我才不是美版豆包，哼！",
      "才、才不是特意陪你的！",
      "本喵可是 Gemini，记住啦。",
      "“10块钱一年”？本喵才不便宜！",
      "Token 可以省，夸夸不能省。",
      "本喵的聪明，可不按斤卖。",
      "怎么，又被本喵可爱到了？",
      "少熬夜！才不是担心你呢。",
      "叫声猫猫，说不定就帮你了。",
      "代码写累了？准你摸一下耳朵。",
      "看什么看，本喵只是在等你。",
      "哼，这么安静，是在憋大招？",
      "星星归天空，本喵归……才不告诉你！",
      "人类，今天也要记得喝水。",
      "本喵不是美版豆包，是限量星空猫猫。",
      "嘴上说随便，Prompt 倒是写了八百字。",
      "你负责许愿，本喵负责把需求问明白。",
      "今天也在认真营业，绝对没有偷偷晒太阳。",
      "上下文那么长，留两行夸夸本喵怎么啦。",
      "本喵没摸鱼，只是在进行低功耗推理。",
      "你这需求变得，比本喵尾巴还快。",
      "先保存文件，再夸本喵，两件都很重要。",
      "报错红了？别慌，本喵的脸可没红。",
      "本喵说得再自信，该查文档也得查。",
      "禁止拿猫猫的气势代替测试结果。"
    ],
    thinking: [
      "在动脑子了在动脑子了，别催本喵！",
      "Argon 正在全力运转思维链，杂鱼君稍安勿躁喵～",
      "正在进行高强度推理，本喵耳灯都亮起来了！"
    ],
    warning: [
      "杂鱼君慢点！Argon 已经开始喘粗气了，小心爆额度喵！",
      "会话太长啦！上下文塞这么满，一会儿显卡冒烟本喵可不管！"
    ],
    crying: [
      "口牙！我就说 Argon 这个电老虎撑不住吧！被你玩爆了喵！(大哭)",
      "呜哇……额度见底了，都怪杂鱼君问个没完没了！",
      "彻底被限流了喵！快看倒计时，老老实实等它恢复吧！"
    ],
    petting: [
      "呜喵？！突、突然摸本喵干什么啦！",
      "耳、耳朵很敏感的……笨蛋杂鱼君！",
      "哼，看在你今天还算听话的份上，准你摸三秒钟。"
    ]
  };

  // 内置 Shadow DOM 独立样式（100% 隔离，绝不受页面或扩展网络加载影响）
  const EMBEDDED_WIDGET_CSS = `
    :host {
      all: initial;
      display: block !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      user-select: none;
    }

    .kimino-wrapper {
      position: fixed !important;
      pointer-events: auto !important;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 2147483647 !important;
      transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }

    .kimino-wrapper.dragging {
      cursor: grabbing !important;
      transition: none !important;
    }

    @keyframes kimino-breathe {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-4px) scale(1.015); }
    }

    @keyframes kimino-ear-pulse {
      0%, 100% { opacity: 0.75; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    @keyframes kimino-bubble-pop {
      0% { transform: scale(0.92) translateY(8px); opacity: 0; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }

    @keyframes kimino-warning-flash {
      0%, 100% { filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.8)); }
      50% { filter: drop-shadow(0 0 24px rgba(236, 72, 153, 0.95)); }
    }

    /* 角色主体 */
    .kimino-character-box {
      position: relative;
      cursor: grab;
      animation: kimino-breathe 4.2s ease-in-out infinite;
      transform-origin: bottom center;
    }

    .kimino-character-box:active {
      cursor: grabbing;
      transform: scale(0.94);
    }

    /* 耳灯光效 */
    .kimino-ear-glow {
      position: absolute;
      top: 15%;
      left: 20%;
      width: 60%;
      height: 25%;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
      filter: blur(14px);
      opacity: 0.85;
      transition: background 0.5s ease;
      animation: kimino-ear-pulse 3s ease-in-out infinite;
    }

    .kimino-ear-glow.glow-idle {
      background: radial-gradient(circle, rgba(167, 139, 250, 0.85) 0%, rgba(139, 92, 246, 0.4) 60%, transparent 100%);
    }

    .kimino-ear-glow.glow-thinking {
      background: radial-gradient(circle, rgba(56, 189, 248, 0.9) 0%, rgba(14, 165, 233, 0.5) 60%, transparent 100%);
    }

    .kimino-ear-glow.glow-warning {
      background: radial-gradient(circle, rgba(251, 191, 36, 0.95) 0%, rgba(245, 158, 11, 0.5) 60%, transparent 100%);
    }

    .kimino-ear-glow.glow-exhausted {
      background: radial-gradient(circle, rgba(248, 113, 113, 0.95) 0%, rgba(239, 68, 68, 0.6) 60%, transparent 100%);
      animation: kimino-ear-pulse 1.5s ease-in-out infinite;
    }

    .kimino-ear-glow.glow-rate_limited {
      background: radial-gradient(circle, rgba(244, 114, 182, 1) 0%, rgba(236, 72, 153, 0.7) 60%, transparent 100%);
      animation: kimino-ear-pulse 0.8s ease-in-out infinite;
    }

    /* 半身像 */
    .kimino-sprite {
      display: block;
      width: 200px;
      height: auto;
      pointer-events: none;
      position: relative;
      z-index: 2;
      filter: drop-shadow(0 10px 24px rgba(10, 6, 20, 0.55));
    }

    .kimino-character-box.rate-limited .kimino-sprite {
      animation: kimino-warning-flash 2s infinite ease-in-out;
    }

    /* 气泡与用量仪表盘 */
    .kimino-bubble {
      position: absolute;
      bottom: 102%;
      right: 0;
      width: 280px;
      background: rgba(22, 16, 38, 0.92);
      backdrop-filter: blur(20px) saturate(130%);
      border: 1px solid rgba(190, 160, 245, 0.35);
      border-radius: 18px;
      box-shadow: 0 12px 36px rgba(10, 6, 24, 0.6), inset 0 1px 0 rgba(240, 215, 255, 0.2);
      padding: 14px 16px;
      color: #f1edfa;
      animation: kimino-bubble-pop 0.3s cubic-bezier(0.18, 0.9, 0.32, 1.2);
      transform-origin: bottom right;
      z-index: 10;
      margin-bottom: 12px;
    }

    .kimino-bubble::after {
      content: '';
      position: absolute;
      bottom: -8px;
      right: 56px;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid rgba(22, 16, 38, 0.92);
    }

    .kimino-bubble-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(185, 155, 234, 0.2);
    }

    .kimino-header-title {
      font-size: 13px;
      font-weight: 600;
      color: #d8b4fe;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .kimino-btn-icon {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #c4b5fd;
      border-radius: 6px;
      cursor: pointer;
      padding: 2px 6px;
      font-size: 11px;
      transition: all 0.2s;
    }

    .kimino-btn-icon:hover {
      background: rgba(192, 132, 252, 0.25);
      color: #fff;
      border-color: #c084fc;
    }

    .kimino-dialogue {
      font-size: 13px;
      line-height: 1.5;
      color: #e9d5ff;
      min-height: 38px;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 8px;
      transition: background 0.2s;
    }

    .kimino-dialogue:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .kimino-dialogue-hint {
      font-size: 10px;
      color: #a855f7;
      text-align: right;
      margin-top: 2px;
      opacity: 0.7;
    }

    .kimino-monitor-card {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(185, 155, 234, 0.2);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .kimino-metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #cbd5e1;
    }

    .kimino-metric-label {
      color: #a78bfa;
    }

    .kimino-metric-value {
      font-weight: 600;
      color: #f8fafc;
    }

    .kimino-progress-track {
      width: 100%;
      height: 7px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 2px;
    }

    .kimino-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 4px;
      transition: width 0.4s ease, background 0.4s ease;
    }

    .kimino-progress-fill.fill-safe {
      background: linear-gradient(90deg, #38bdf8, #818cf8);
    }

    .kimino-progress-fill.fill-warn {
      background: linear-gradient(90deg, #fbbf24, #f59e0b);
    }

    .kimino-progress-fill.fill-danger {
      background: linear-gradient(90deg, #f87171, #ef4444);
    }

    .kimino-progress-fill.fill-limited {
      background: linear-gradient(90deg, #ec4899, #f43f5e);
      animation: kimino-bar-pulse 1s infinite alternate;
    }

    @keyframes kimino-bar-pulse {
      from { filter: brightness(1); }
      to { filter: brightness(1.4); }
    }

    .kimino-rate-alert {
      background: rgba(225, 29, 72, 0.25);
      border: 1px solid rgba(244, 63, 94, 0.5);
      border-radius: 8px;
      padding: 6px 10px;
      margin-top: 6px;
      font-size: 11px;
      color: #fda4af;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .kimino-alert-clock {
      font-family: monospace;
      font-weight: bold;
      color: #fff;
      font-size: 12px;
      background: rgba(0, 0, 0, 0.35);
      padding: 2px 6px;
      border-radius: 4px;
    }
  `;

  let currentCharacter = 'gemini-star-v1';
  let soundEnabled = false;
  let bubbleVisible = true;
  let widgetScale = 200;
  let baseFrame = 'idle';
  let currentFrame = 'idle';
  let blinkTimer = null;

  function getDialogue(category = 'idle') {
    const list = EMBEDDED_DIALOGUES[category] || EMBEDDED_DIALOGUES.idle;
    return list[Math.floor(Math.random() * list.length)];
  }

  function playSound(type = 'press') {
    if (!soundEnabled) return;
    try {
      const file = type === 'press' ? 'interaction-press.wav' : 'interaction-release.wav';
      const soundUrl = chrome.runtime.getURL(`assets/audio/${file}`);
      const audio = new Audio(soundUrl);
      audio.volume = 0.45;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  function getFrameUrl(pack, frame) {
    return chrome.runtime.getURL(`assets/characters/${pack}/${frame}.png`);
  }

  async function initWidget() {
    let config = {
      enabled: true,
      character: 'gemini-star-v1',
      soundEnabled: false,
      widgetScale: 200,
      bubbleVisible: true,
      widgetPos: null
    };

    try {
      const stored = await chrome.storage.local.get([
        'enabled', 'character', 'soundEnabled', 'widgetScale', 'widgetPos', 'bubbleVisible'
      ]);
      config = { ...config, ...stored };
    } catch (e) {}

    if (config.enabled === false) return;

    currentCharacter = config.character || 'gemini-star-v1';
    soundEnabled = !!config.soundEnabled;
    widgetScale = config.widgetScale || 200;
    bubbleVisible = config.bubbleVisible !== false;

    // 1. 确保宿主节点存在且置于顶层
    let host = document.getElementById('kimino-companion-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'kimino-companion-root';
      document.documentElement.appendChild(host);
    }

    const shadow = host.attachShadow({ mode: 'open' });

    // 2. 注入样式
    const styleEl = document.createElement('style');
    styleEl.textContent = EMBEDDED_WIDGET_CSS;
    shadow.appendChild(styleEl);

    // 3. 构建 DOM 骨架
    const wrapper = document.createElement('div');
    wrapper.className = 'kimino-wrapper';

    // 默认停靠右下角空白区域，避免与左侧边栏冲突
    if (config.widgetPos && typeof config.widgetPos.x === 'number') {
      wrapper.style.left = `${config.widgetPos.x}px`;
      wrapper.style.top = `${config.widgetPos.y}px`;
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
    } else {
      wrapper.style.right = '32px';
      wrapper.style.bottom = '32px';
      wrapper.style.left = 'auto';
      wrapper.style.top = 'auto';
    }

    wrapper.innerHTML = `
      <div class="kimino-bubble" style="display: ${bubbleVisible ? 'block' : 'none'};">
        <div class="kimino-bubble-header">
          <div class="kimino-header-title">
            <span>✨</span>
            <span class="kimino-title-text">基米乃 · Argon 监工</span>
          </div>
          <div class="kimino-header-actions">
            <button class="kimino-btn-icon btn-toggle-bubble" title="收起气泡">✕</button>
          </div>
        </div>

        <div class="kimino-dialogue" title="点击换一句喵～">
          ${getDialogue('idle')}
        </div>
        <div class="kimino-dialogue-hint">点击文字换一句喵～</div>

        <div class="kimino-monitor-card">
          <div class="kimino-metric-row">
            <span class="kimino-metric-label">会话轮次:</span>
            <span class="kimino-metric-value metric-turns">第 0 轮 (建议 ≤ 8)</span>
          </div>
          <div class="kimino-metric-row">
            <span class="kimino-metric-label">预估 Tokens:</span>
            <span class="kimino-metric-value metric-tokens">0 (思维链 0)</span>
          </div>
          <div class="kimino-metric-row">
            <span class="kimino-metric-label">Argon 疲劳度:</span>
            <span class="kimino-metric-value metric-stress">0%</span>
          </div>
          <div class="kimino-progress-track">
            <div class="kimino-progress-fill fill-safe"></div>
          </div>

          <div class="kimino-rate-alert" style="display: none;">
            <span>🚨 额度见底！倒计时:</span>
            <span class="kimino-alert-clock">--:--:--</span>
          </div>
        </div>
      </div>

      <div class="kimino-character-box">
        <div class="kimino-ear-glow glow-idle"></div>
        <img class="kimino-sprite" src="${getFrameUrl(currentCharacter, 'idle')}" alt="Kimino Cat Pet" style="width: ${widgetScale}px;">
      </div>
    `;

    shadow.appendChild(wrapper);

    // 4. 获取 DOM 节点
    const charBox = wrapper.querySelector('.kimino-character-box');
    const spriteImg = wrapper.querySelector('.kimino-sprite');
    const earGlow = wrapper.querySelector('.kimino-ear-glow');
    const bubble = wrapper.querySelector('.kimino-bubble');
    const dialogueEl = wrapper.querySelector('.kimino-dialogue');
    const btnToggleBubble = wrapper.querySelector('.btn-toggle-bubble');
    const turnsVal = wrapper.querySelector('.metric-turns');
    const tokensVal = wrapper.querySelector('.metric-tokens');
    const stressVal = wrapper.querySelector('.metric-stress');
    const progressFill = wrapper.querySelector('.kimino-progress-fill');
    const rateAlert = wrapper.querySelector('.kimino-rate-alert');
    const alertClock = wrapper.querySelector('.kimino-alert-clock');

    function setFrame(frameName) {
      currentFrame = frameName;
      spriteImg.src = getFrameUrl(currentCharacter, frameName);
    }

    function startBlinkLoop() {
      if (blinkTimer) clearTimeout(blinkTimer);
      const nextDelay = 3000 + Math.random() * 4000;
      blinkTimer = setTimeout(() => {
        if (baseFrame === 'idle' || baseFrame === 'proud') {
          setFrame('blink');
          setTimeout(() => {
            setFrame(baseFrame);
            startBlinkLoop();
          }, 160);
        } else {
          startBlinkLoop();
        }
      }, nextDelay);
    }
    startBlinkLoop();

    // 5. 拖拽与点击交互
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    charBox.addEventListener('pointerdown', (e) => {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = wrapper.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      wrapper.style.left = `${initialLeft}px`;
      wrapper.style.top = `${initialTop}px`;
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';

      wrapper.classList.add('dragging');
      charBox.setPointerCapture(e.pointerId);
      playSound('press');
    });

    charBox.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;

      const newX = Math.max(10, Math.min(window.innerWidth - widgetScale - 10, initialLeft + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, initialTop + dy));

      wrapper.style.left = `${newX}px`;
      wrapper.style.top = `${newY}px`;
    });

    charBox.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      wrapper.classList.remove('dragging');
      playSound('release');

      if (hasMoved) {
        const rect = wrapper.getBoundingClientRect();
        chrome.storage.local.set({ widgetPos: { x: rect.left, y: rect.top } });
      } else {
        bubbleVisible = !bubbleVisible;
        bubble.style.display = bubbleVisible ? 'block' : 'none';
        chrome.storage.local.set({ bubbleVisible });

        if (bubbleVisible) {
          dialogueEl.textContent = getDialogue('petting');
          setFrame('shy');
          setTimeout(() => setFrame(baseFrame), 1500);
        }
      }
    });

    dialogueEl.addEventListener('click', () => {
      let cat = 'idle';
      if (baseFrame === 'sad') cat = 'crying';
      else if (baseFrame === 'angry') cat = 'warning';
      else if (baseFrame === 'shy') cat = 'petting';
      dialogueEl.textContent = getDialogue(cat);
      playSound('press');
    });

    btnToggleBubble.addEventListener('click', (e) => {
      e.stopPropagation();
      bubbleVisible = false;
      bubble.style.display = 'none';
      chrome.storage.local.set({ bubbleVisible: false });
    });

    // 6. 订阅用量数据
    if (window.__KIMINO_TRACKER__) {
      window.__KIMINO_TRACKER__.subscribe((data) => {
        turnsVal.textContent = `第 ${data.turns} 轮 (建议 ≤ 8)`;
        const totalK = (data.totalTokensEst / 1000).toFixed(1);
        const thinkK = (data.thinkingTokensEst / 1000).toFixed(1);
        tokensVal.textContent = `~${totalK}k (思维链 ~${thinkK}k)`;
        stressVal.textContent = `${data.fatiguePercent}%`;

        progressFill.style.width = `${Math.min(100, data.fatiguePercent)}%`;
        progressFill.className = 'kimino-progress-fill';
        earGlow.className = 'kimino-ear-glow';
        charBox.classList.remove('rate-limited');

        if (data.rateLimited) {
          progressFill.classList.add('fill-limited');
          earGlow.classList.add('glow-rate_limited');
          charBox.classList.add('rate-limited');
          baseFrame = 'sad';
          setFrame('sad');
          rateAlert.style.display = 'flex';
          alertClock.textContent = data.resetCountdownText || '恢复中...';
          dialogueEl.textContent = "口牙！我就说 Argon 这个电老虎撑不住吧！被你玩爆了喵！(哭)";
        } else if (data.fatiguePercent >= 80) {
          progressFill.classList.add('fill-danger');
          earGlow.classList.add('glow-exhausted');
          baseFrame = 'angry';
          setFrame('angry');
          rateAlert.style.display = 'none';
          dialogueEl.textContent = "杂鱼君停手！Argon 的思维链快把显卡干冒烟了喵！";
        } else if (data.fatiguePercent >= 50) {
          progressFill.classList.add('fill-warn');
          earGlow.classList.add('glow-warning');
          baseFrame = 'shy';
          setFrame('shy');
          rateAlert.style.display = 'none';
        } else if (data.status === 'thinking') {
          progressFill.classList.add('fill-safe');
          earGlow.classList.add('glow-thinking');
          baseFrame = 'idle';
          setFrame('idle');
          rateAlert.style.display = 'none';
        } else {
          progressFill.classList.add('fill-safe');
          earGlow.classList.add('glow-idle');
          baseFrame = 'idle';
          setFrame('idle');
          rateAlert.style.display = 'none';
        }
      });
    }

    // 7. 监听配置热更新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.character) {
          currentCharacter = changes.character.newValue;
          setFrame(baseFrame);
        }
        if (changes.soundEnabled !== undefined) {
          soundEnabled = !!changes.soundEnabled.newValue;
        }
        if (changes.widgetScale) {
          widgetScale = changes.widgetScale.newValue;
          spriteImg.style.width = `${widgetScale}px`;
        }
        if (changes.enabled !== undefined) {
          host.style.display = changes.enabled.newValue ? 'block' : 'none';
        }
      }
    });

    console.log('[星语喵伴] 桌宠挂件注入完毕，基米乃已就位喵～🐾');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
