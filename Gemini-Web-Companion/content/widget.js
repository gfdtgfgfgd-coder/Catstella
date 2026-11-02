// 星语喵伴 · Cat Pet Widget (Shadow DOM + 真实 Google 额度条展示)
(() => {
  if (window.__KIMINO_WIDGET_READY__) return;
  window.__KIMINO_WIDGET_READY__ = true;

  // 跨浏览器 API 垫片 (Firefox / Zen 上杜绝未捕获 Promise rejection)
  const api = window.KIMINO_API || {
    available: false,
    getURL: (p) => p,
    storageGet: async () => ({}),
    storageSet: () => {},
    onChanged: () => {}
  };

  // Trusted Types 安全壳：gemini.google.com 开启 require-trusted-types-for 后，
  // 裸 innerHTML 赋值会抛 'TrustedHTML' 错误；有策略走策略，没策略走手动 DOM。
  const ttPolicy = (() => {
    try {
      if (typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy) {
        return trustedTypes.createPolicy('kimino-companion', { createHTML: (s) => s });
      }
    } catch (e) { /* 策略名被 CSP 限制时降级 */ }
    return null;
  })();
  const setHTML = (el, html) => {
    try {
      el.innerHTML = ttPolicy ? ttPolicy.createHTML(html) : html;
      return true;
    } catch (e) {
      try {
        // 无策略兜底：模板仅由本扩展静态字符串构成，经 DOMParser 走安全解析路径
        const doc = new DOMParser().parseFromString(html, 'text/html');
        while (el.firstChild) el.removeChild(el.firstChild);
        while (doc.body.firstChild) el.appendChild(doc.body.firstChild);
        return true;
      } catch (e2) {
        console.warn('[星语喵伴] Trusted Types 兜底渲染失败:', e2);
        return false;
      }
    }
  };

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
      "报错红了？别慌，本喵的脸可没红。"
    ],
    thinking: [
      "在动脑子了在动脑子了，别催本喵！",
      "Argon 正在全力运转思维链，杂鱼君稍安勿躁喵～",
      "正在进行高强度推理，本喵耳灯都亮起来了！"
    ],
    warning: [
      "杂鱼君慢点！当前用量快到警戒线了，小心被降级喵！",
      "会话太长啦！一会儿被限流本喵可不借你额度！"
    ],
    crying: [
      "口牙！我就说 Argon 这个电老虎撑不住吧！额度见底了喵！(大哭)",
      "呜哇……当前周期用光了，都怪杂鱼君问个没完没了！",
      "彻底被限流了喵！快看倒计时，老老实实等它恢复吧！"
    ],
    petting: [
      "呜喵？！突、突然摸本喵干什么啦！",
      "耳、耳朵很敏感的……笨蛋杂鱼君！",
      "哼，看在你今天还算听话的份上，准你摸三秒钟。"
    ]
  };

  const EMBEDDED_WIDGET_CSS = `
    :host {
      /* 宿主元素不生成任何盒子：Google 页面级 CSS（如 body>div:last-child 类规则）
         无法再把它染成可见色块；桌宠全部由内部 position:fixed 的 wrapper 承载 */
      all: initial;
      display: contents !important;
    }

    .kimino-wrapper {
      position: fixed !important;
      pointer-events: auto !important;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      user-select: none;
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

    .kimino-bubble {
      position: absolute;
      bottom: 102%;
      right: 0;
      width: 290px;
      background: rgba(22, 16, 38, 0.94);
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
      border-top: 8px solid rgba(22, 16, 38, 0.94);
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

    .kimino-header-actions {
      display: flex;
      gap: 6px;
      align-items: center;
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

    /* 真实用量限额面板 (100% 还原 Google 官方用量双周期) */
    .kimino-quota-panel {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(185, 155, 234, 0.2);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quota-block {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .quota-title-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #cbd5e1;
    }

    .quota-name {
      color: #a78bfa;
      font-weight: 500;
    }

    .quota-pct {
      font-weight: 700;
      color: #f8fafc;
    }

    .quota-track {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      overflow: hidden;
    }

    .quota-bar {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease, background 0.4s ease;
    }

    .quota-sub {
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }

    .session-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #c4b5fd;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .kimino-rate-alert {
      background: rgba(225, 29, 72, 0.25);
      border: 1px solid rgba(244, 63, 94, 0.5);
      border-radius: 8px;
      padding: 6px 10px;
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

    /* 设置面板（毛玻璃，与皮肤同语言） */
    .kimino-settings {
      position: absolute;
      bottom: 102%;
      right: 0;
      width: 272px;
      background: rgba(28, 22, 44, 0.92);
      backdrop-filter: blur(18px) saturate(130%);
      border: 1px solid rgba(190, 160, 245, 0.35);
      border-radius: 16px;
      box-shadow: 0 12px 36px rgba(10, 6, 24, 0.6);
      padding: 12px 14px;
      color: #f1edfa;
      z-index: 12;
      margin-bottom: 12px;
      font-size: 12px;
      animation: kimino-bubble-pop 0.25s cubic-bezier(0.18, 0.9, 0.32, 1.2);
    }

    .kimino-settings-title {
      font-weight: 600;
      color: #d8b4fe;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .kg-set-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 0;
      color: #e9d5ff;
    }

    .kg-range {
      flex: 1;
      accent-color: #a78bfa;
      height: 4px;
      cursor: pointer;
    }

    .kg-val {
      width: 38px;
      text-align: right;
      color: #c4b5fd;
      font-size: 11px;
    }

    .kg-chips {
      display: flex;
      gap: 6px;
    }

    .kg-chip {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #c4b5fd;
      border-radius: 8px;
      padding: 3px 10px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    }

    .kg-chip.kg-active {
      background: rgba(192, 132, 252, 0.28);
      border-color: #c084fc;
      color: #fff;
    }

    .kg-reset-pos {
      width: 100%;
      margin-top: 8px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e9d5ff;
      border-radius: 8px;
      padding: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .kg-reset-pos:hover {
      background: rgba(192, 132, 252, 0.25);
    }

    .kimino-settings input[type="checkbox"] {
      accent-color: #a78bfa;
      cursor: pointer;
    }

    /* 画廊（agy 移植）：壁纸/形象网格 */
    .kg-section-title {
      color: #a78bfa;
      font-size: 11px;
      letter-spacing: 1px;
      margin: 9px 0 5px;
    }

    .kg-wallpaper-grid,
    .kg-character-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .kg-thumb {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.14);
      aspect-ratio: 16 / 9;
      background: rgba(0, 0, 0, 0.3);
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .kg-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .kg-thumb.kg-active {
      border-color: #c084fc;
      box-shadow: 0 0 0 2px rgba(192, 132, 252, 0.5);
    }

    .kg-thumb-del {
      position: absolute;
      top: 2px;
      right: 2px;
      background: rgba(0, 0, 0, 0.6);
      color: #fda4af;
      font-size: 9px;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kg-char-thumb {
      aspect-ratio: auto;
      text-align: center;
      padding: 6px 2px 4px;
      background: rgba(255, 255, 255, 0.04);
    }

    .kg-char-thumb img {
      height: 44px;
      width: auto;
      margin: 0 auto;
    }

    .kg-char-name {
      font-size: 10px;
      color: #c4b5fd;
      margin-top: 2px;
    }
  `;

  let currentCharacter = 'gemini-star-v1';
  let customCharacterSrc = null; // 自定义形象 dataURL（覆盖所有表情帧）
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
      const soundUrl = api.getURL(`assets/audio/${file}`);
      const audio = new Audio(soundUrl);
      audio.volume = 0.45;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  function getFrameUrl(pack, frame) {
    // 自定义形象优先：覆盖所有表情帧（v1 自定义形象为单图方案）
    if (customCharacterSrc) return customCharacterSrc;
    return api.getURL(`assets/characters/${pack}/${frame}.png`);
  }

  function getBarGradient(pct) {
    if (pct >= 85) return 'linear-gradient(90deg, #ec4899, #ef4444)';
    if (pct >= 60) return 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    return 'linear-gradient(90deg, #38bdf8, #818cf8)';
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
      const stored = await api.storageGet([
        'enabled', 'character', 'soundEnabled', 'widgetScale', 'widgetPos', 'bubbleVisible', 'customCharacter'
      ]);
      config = { ...config, ...stored };
    } catch (e) {}

    if (config.enabled === false) return;

    currentCharacter = config.character || 'gemini-star-v1';
    customCharacterSrc = config.customCharacter || null;
    soundEnabled = !!config.soundEnabled;
    widgetScale = config.widgetScale || 200;
    bubbleVisible = config.bubbleVisible !== false;

    let host = document.getElementById('kimino-companion-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'kimino-companion-root';
      // 内联 important 保险：:host 的 display:contents 优先级低于页面 #id 规则，
      // 内联 important 可压过 Google 的一切普通规则，杜绝宿主被渲染成可见盒子
      ['display:contents', 'background:transparent', 'background-color:transparent', 'border:none', 'box-shadow:none', 'width:0', 'height:0', 'overflow:visible']
        .forEach((decl) => {
          const [prop, ...rest] = decl.split(':');
          try { host.style.setProperty(prop, rest.join(':'), 'important'); } catch (e) {}
        });
      (document.body || document.documentElement).appendChild(host);
    }

    // 防御：宿主若已挂载 Shadow DOM（如扩展热重载残留），直接跳过重复挂载
    if (host.shadowRoot) {
      console.log('[星语喵伴] 桌宠挂件已存在，跳过重复注入喵～');
      return;
    }

    let shadow;
    try {
      shadow = host.attachShadow({ mode: 'open' });
    } catch (e) {
      console.warn('[星语喵伴] Shadow DOM 挂载失败:', e);
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = EMBEDDED_WIDGET_CSS;
    shadow.appendChild(styleEl);

    const wrapper = document.createElement('div');
    wrapper.className = 'kimino-wrapper';

    // 默认停靠右下角空白区
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

    setHTML(wrapper, `
      <div class="kimino-bubble" style="display: ${bubbleVisible ? 'block' : 'none'};">
        <div class="kimino-bubble-header">
          <div class="kimino-header-title">
            <span>✨</span>
            <span class="kimino-title-text">基米乃 · 额度审计喵</span>
          </div>
          <div class="kimino-header-actions">
            <button class="kimino-btn-icon btn-sync-quota" title="静默同步官方额度 (零弹窗)">🔄同步</button>
            <button class="kimino-btn-icon btn-open-settings" title="设置面板">⚙️</button>
            <button class="kimino-btn-icon btn-toggle-bubble" title="收起气泡">✕</button>
          </div>
        </div>

        <div class="kimino-dialogue" title="点击换一句喵～">
          ${getDialogue('idle')}
        </div>
        <div class="kimino-dialogue-hint">点击文字换一句喵～</div>

        <div class="kimino-quota-panel">
          <!-- 当前周期用量条 (5小时) -->
          <div class="quota-block">
            <div class="quota-title-row">
              <span class="quota-name">当前用量 (5h)</span>
              <span class="quota-pct cur-quota-pct">--%</span>
            </div>
            <div class="quota-track">
              <div class="quota-bar cur-quota-bar" style="width: 0%;"></div>
            </div>
            <div class="quota-sub">
              <span class="cur-quota-reset">重置时间: --</span>
              <span class="quota-source-tag">官方限额</span>
            </div>
          </div>

          <!-- 每周限额条 (1周) -->
          <div class="quota-block">
            <div class="quota-title-row">
              <span class="quota-name">每周限额</span>
              <span class="quota-pct week-quota-pct">--%</span>
            </div>
            <div class="quota-track">
              <div class="quota-bar week-quota-bar" style="width: 0%;"></div>
            </div>
            <div class="quota-sub">
              <span class="week-quota-reset">重置时间: --</span>
            </div>
          </div>

          <div class="session-meta-row">
            <span class="meta-turns">当前会话: 第 0 轮</span>
            <span class="meta-tokens">预估: 0 tokens</span>
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

      <div class="kimino-settings" style="display: none;">
        <div class="kimino-settings-title">⚙️ 基米乃设置面板</div>
        <label class="kg-set-row"><span>桌宠挂件</span><input type="checkbox" class="kg-cfg" data-key="enabled"></label>
        <label class="kg-set-row"><span>毛玻璃皮肤</span><input type="checkbox" class="kg-cfg" data-key="skinEnabled"></label>
        <label class="kg-set-row"><span>台词气泡</span><input type="checkbox" class="kg-cfg" data-key="bubbleVisible"></label>
        <label class="kg-set-row"><span>互动音效</span><input type="checkbox" class="kg-cfg" data-key="soundEnabled"></label>
        <div class="kg-set-row"><span>桌宠大小</span><input type="range" class="kg-range" data-key="widgetScale" min="120" max="320" step="10"><span class="kg-val kg-val-scale"></span></div>
        <div class="kg-set-row"><span>壁纸浓度</span><input type="range" class="kg-range" data-key="wallpaperOpacity" min="30" max="100" step="5"><span class="kg-val kg-val-opacity"></span></div>
        <div class="kg-section-title">壁纸画廊</div>
        <div class="kg-wallpaper-grid"></div>
        <div class="kg-set-row"><span>自定义壁纸</span>
          <span class="kg-chips"><button class="kg-chip kg-btn-wallpaper">上传</button></span>
        </div>
        <div class="kg-section-title">形象画廊</div>
        <div class="kg-character-grid"></div>
        <div class="kg-set-row"><span>自定义形象</span>
          <span class="kg-chips"><button class="kg-chip kg-btn-character">上传</button><button class="kg-chip kg-def-character">还原</button></span>
        </div>
        <input type="file" accept="image/*" class="kg-file-input kg-file-wallpaper" style="display:none">
        <input type="file" accept="image/*" class="kg-file-input kg-file-character" style="display:none">
        <button class="kg-reset-pos">复位桌宠位置</button>
      </div>
    `);

    shadow.appendChild(wrapper);

    const charBox = wrapper.querySelector('.kimino-character-box');
    const spriteImg = wrapper.querySelector('.kimino-sprite');
    const earGlow = wrapper.querySelector('.kimino-ear-glow');
    const bubble = wrapper.querySelector('.kimino-bubble');
    const dialogueEl = wrapper.querySelector('.kimino-dialogue');
    const btnToggleBubble = wrapper.querySelector('.btn-toggle-bubble');
    const btnSyncQuota = wrapper.querySelector('.btn-sync-quota');

    const curQuotaPct = wrapper.querySelector('.cur-quota-pct');
    const curQuotaBar = wrapper.querySelector('.cur-quota-bar');
    const curQuotaReset = wrapper.querySelector('.cur-quota-reset');

    const weekQuotaPct = wrapper.querySelector('.week-quota-pct');
    const weekQuotaBar = wrapper.querySelector('.week-quota-bar');
    const weekQuotaReset = wrapper.querySelector('.week-quota-reset');

    const metaTurns = wrapper.querySelector('.meta-turns');
    const metaTokens = wrapper.querySelector('.meta-tokens');
    const rateAlert = wrapper.querySelector('.kimino-rate-alert');
    const alertClock = wrapper.querySelector('.kimino-alert-clock');

    function setFrame(frameName) {
      currentFrame = frameName;
      spriteImg.src = getFrameUrl(currentCharacter, frameName);
    }

    // 帧缺失兜底：某角色包缺帧时回落到 idle，避免桌宠裂图
    spriteImg.addEventListener('error', () => {
      const fallback = getFrameUrl(currentCharacter, 'idle');
      if (spriteImg.src !== fallback) spriteImg.src = fallback;
    });

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

    // 拖拽与点击
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
        api.storageSet({ widgetPos: { x: rect.left, y: rect.top } });
      } else {
        bubbleVisible = !bubbleVisible;
        bubble.style.display = bubbleVisible ? 'block' : 'none';
        api.storageSet({ bubbleVisible });

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
      api.storageSet({ bubbleVisible: false });
    });

    // 点击同步按钮：静默重放官方额度 RPC（零 UI），并辅以 DOM 嗅探兜底
    btnSyncQuota.addEventListener('click', (e) => {
      e.stopPropagation();
      playSound('press');
      btnSyncQuota.textContent = '嗅探中...';
      try {
        if (window.__KIMINO_TRACKER__) {
          window.__KIMINO_TRACKER__.requestQuotaRpcRefresh('widget', true);
          window.__KIMINO_TRACKER__.sniffResetHintBar();
          window.__KIMINO_TRACKER__.scrapeRealQuotaFromDom();
        }
      } catch (err) {}
      setTimeout(() => { btnSyncQuota.textContent = '🔄同步'; }, 1500);
    });

    // 图片文件 → 压缩 dataURL（壁纸 JPEG 压暗底、形象 PNG 保透明）
  const fileToDataUrl = (file, opts) => new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(opts.maxW / img.width, opts.maxH / img.height, 1);
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext('2d');
            if (opts.type === 'image/jpeg') {
              ctx.fillStyle = '#211e2d';
              ctx.fillRect(0, 0, w, h);
            }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(cv.toDataURL(opts.type, 0.85));
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = reader.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch (e) { resolve(null); }
  });

  // ===== 设置面板（web 端可用功能迁移） =====
    const settingsPanel = wrapper.querySelector('.kimino-settings');
    const btnOpenSettings = wrapper.querySelector('.btn-open-settings');
    const kgValScale = wrapper.querySelector('.kg-val-scale');
    const kgValOpacity = wrapper.querySelector('.kg-val-opacity');

    // ===== 画廊清单（构建期生成 assets/manifest.json） =====
    let kgManifestCache = null;
    const loadGalleryManifest = async () => {
      if (kgManifestCache) return kgManifestCache;
      try {
        const res = await fetch(api.getURL('assets/manifest.json'));
        kgManifestCache = await res.json();
      } catch (e) {
        kgManifestCache = { wallpapers: [], characters: [] };
      }
      return kgManifestCache;
    };

    const syncSettingsUI = async () => {
      try {
        const st = await api.storageGet([
          'enabled', 'skinEnabled', 'bubbleVisible', 'soundEnabled', 'widgetScale',
          'wallpaperOpacity', 'character', 'wallpaperId', 'customWallpapers', 'customCharacter'
        ]);
        settingsPanel.querySelectorAll('.kg-cfg').forEach((cb) => {
          const k = cb.dataset.key;
          cb.checked = st[k] !== undefined ? !!st[k] : (k === 'enabled' || k === 'skinEnabled' || k === 'bubbleVisible');
        });
        const scale = st.widgetScale || 200;
        const op = Math.round((st.wallpaperOpacity === undefined ? 0.88 : st.wallpaperOpacity) * 100);
        const rScale = settingsPanel.querySelector('.kg-range[data-key="widgetScale"]');
        const rOp = settingsPanel.querySelector('.kg-range[data-key="wallpaperOpacity"]');
        if (rScale) { rScale.value = scale; if (kgValScale) kgValScale.textContent = scale + 'px'; }
        if (rOp) { rOp.value = op; if (kgValOpacity) kgValOpacity.textContent = op + '%'; }

        // ---- 壁纸画廊（内置 + 自定义上传） ----
        const man = await loadGalleryManifest();
        const customs = st.customWallpapers || [];
        const wpGrid = settingsPanel.querySelector('.kg-wallpaper-grid');
        if (wpGrid) {
          wpGrid.textContent = '';
          const items = [
            ...man.wallpapers.map((w) => ({ id: w.id, src: api.getURL(w.src), custom: false })),
            ...customs.map((c) => ({ id: c.id, src: c.dataUrl, custom: true }))
          ];
          items.forEach((item) => {
            const thumb = document.createElement('div');
            thumb.className = 'kg-thumb' + (st.wallpaperId === item.id ? ' kg-active' : '');
            thumb.title = item.id;
            const img = document.createElement('img');
            img.src = item.src;
            img.alt = item.id;
            thumb.appendChild(img);
            if (item.custom) {
              const del = document.createElement('span');
              del.className = 'kg-thumb-del';
              del.textContent = '✕';
              del.title = '删除';
              del.addEventListener('click', (e) => {
                e.stopPropagation();
                playSound('press');
                const rest = customs.filter((c) => c.id !== item.id);
                const payload = { customWallpapers: rest };
                if (st.wallpaperId === item.id) payload.wallpaperId = (man.wallpapers[0] && man.wallpapers[0].id) || '';
                api.storageSet(payload);
                syncSettingsUI();
              });
              thumb.appendChild(del);
            }
            thumb.addEventListener('click', () => {
              playSound('press');
              api.storageSet({ wallpaperId: item.id });
              syncSettingsUI();
            });
            wpGrid.appendChild(thumb);
          });
        }

        // ---- 形象画廊（内置形象包 + 自定义单图） ----
        const chGrid = settingsPanel.querySelector('.kg-character-grid');
        if (chGrid) {
          chGrid.textContent = '';
          man.characters.forEach((c) => {
            const cell = document.createElement('div');
            cell.className = 'kg-thumb kg-char-thumb' + (st.character === c.id && !st.customCharacter ? ' kg-active' : '');
            const img = document.createElement('img');
            img.src = api.getURL(c.preview);
            img.alt = c.id;
            cell.appendChild(img);
            const name = document.createElement('div');
            name.className = 'kg-char-name';
            name.textContent = c.name;
            cell.appendChild(name);
            cell.addEventListener('click', () => {
              playSound('press');
              api.storageSet({ character: c.id, customCharacter: null });
              syncSettingsUI();
            });
            chGrid.appendChild(cell);
          });
          if (st.customCharacter) {
            const cell = document.createElement('div');
            cell.className = 'kg-thumb kg-char-thumb kg-active';
            const img = document.createElement('img');
            img.src = st.customCharacter;
            cell.appendChild(img);
            const name = document.createElement('div');
            name.className = 'kg-char-name';
            name.textContent = '自定义';
            cell.appendChild(name);
            chGrid.appendChild(cell);
          }
        }
      } catch (e) {}
    };

    // 点击面板外部自动收起（Shadow DOM: composedPath 判断是否点在桌宠内）
    const closePanelFromOutside = (e) => {
      if (settingsPanel.style.display !== 'block') return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.includes(host) || path.includes(settingsPanel)) return;
      settingsPanel.style.display = 'none';
    };
    document.addEventListener('click', closePanelFromOutside, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsPanel.style.display === 'block') {
        settingsPanel.style.display = 'none';
      }
    });

    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        playSound('press');
        const show = settingsPanel.style.display !== 'block';
        settingsPanel.style.display = show ? 'block' : 'none';
        if (show) syncSettingsUI();
      });
    }
    if (settingsPanel) {
      settingsPanel.addEventListener('click', (e) => e.stopPropagation());
      settingsPanel.querySelectorAll('.kg-cfg').forEach((cb) => {
        cb.addEventListener('change', () => {
          const payload = {};
          payload[cb.dataset.key] = cb.checked;
          api.storageSet(payload);
        });
      });
      settingsPanel.querySelectorAll('.kg-range').forEach((rg) => {
        rg.addEventListener('input', () => {
          const key = rg.dataset.key;
          const v = parseFloat(rg.value);
          const payload = {};
          payload[key] = key === 'wallpaperOpacity' ? v / 100 : v;
          api.storageSet(payload);
          if (key === 'widgetScale' && kgValScale) kgValScale.textContent = v + 'px';
          if (key === 'wallpaperOpacity' && kgValOpacity) kgValOpacity.textContent = v + '%';
        });
      });
      const resetBtn = settingsPanel.querySelector('.kg-reset-pos');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          playSound('press');
          api.storageSet({ widgetPos: null });
          wrapper.style.setProperty('left', 'auto', 'important');
          wrapper.style.setProperty('top', 'auto', 'important');
          wrapper.style.setProperty('right', '32px', 'important');
          wrapper.style.setProperty('bottom', '32px', 'important');
          resetBtn.textContent = '已复位喵～';
          setTimeout(() => { resetBtn.textContent = '复位桌宠位置'; }, 1200);
        });
      }

      // 自定义上传：壁纸加入画廊并选中；形象为单图覆盖（onChanged 链路即时生效）
      const bindUpload = (btnSel, inputSel, opts) => {
        const btn = settingsPanel.querySelector(btnSel);
        const input = settingsPanel.querySelector(inputSel);
        if (!btn || !input) return;
        btn.addEventListener('click', () => { playSound('press'); input.click(); });
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          btn.textContent = '处理中...';
          const dataUrl = await fileToDataUrl(file, opts);
          btn.textContent = '上传';
          input.value = '';
          if (!dataUrl) {
            console.warn('[星语喵伴] 图片处理失败喵');
            return;
          }
          if (opts.kind === 'wallpaper') {
            const st = await api.storageGet(['customWallpapers']);
            const customs = st.customWallpapers || [];
            const id = 'custom:' + Date.now();
            customs.push({ id, dataUrl });
            api.storageSet({ customWallpapers: customs, wallpaperId: id });
          } else {
            api.storageSet({ customCharacter: dataUrl });
          }
          syncSettingsUI();
        });
      };
      bindUpload('.kg-btn-wallpaper', '.kg-file-wallpaper', { maxW: 1920, maxH: 1080, type: 'image/jpeg', kind: 'wallpaper' });
      bindUpload('.kg-btn-character', '.kg-file-character', { maxW: 640, maxH: 640, type: 'image/png', kind: 'character' });
      const defCharBtn = settingsPanel.querySelector('.kg-def-character');
      if (defCharBtn) {
        defCharBtn.addEventListener('click', () => {
          playSound('press');
          api.storageSet({ customCharacter: null });
          syncSettingsUI();
        });
      }
    }

    // 订阅追踪器数据
    if (window.__KIMINO_TRACKER__) {
      window.__KIMINO_TRACKER__.subscribe((data) => {
        metaTurns.textContent = `当前会话: 第 ${data.turns} 轮`;
        const totalK = (data.totalTokensEst / 1000).toFixed(1);
        metaTokens.textContent = `预估: ~${totalK}k tokens`;

        // 1. 当前用量 (5h)：tracker 已按 max(官方, 会话估算) 语义折算，
        //    显示值 = fatiguePercent；来源角标随 displaySource 切换
        const curPct = data.fatiguePercent;
        const sourceTag = wrapper.querySelector('.quota-source-tag');
        if (sourceTag) {
          sourceTag.textContent = data.realQuota.displaySource === 'session' ? '会话估算'
            : data.realQuota.displaySource === 'official' ? '官方限额' : '会话估算';
        }

        curQuotaPct.textContent = `已使用 ${curPct}%`;
        curQuotaBar.style.width = `${Math.min(100, curPct)}%`;
        curQuotaBar.style.background = getBarGradient(curPct);
        curQuotaReset.textContent = data.realQuota.currentResetTime 
          ? `重置时间: ${data.realQuota.currentResetTime}` 
          : '实时推算中';

        // 2. 真实每周限额
        if (typeof data.realQuota.weeklyUsagePercent === 'number') {
          const weekPct = data.realQuota.weeklyUsagePercent;
          weekQuotaPct.textContent = `已使用 ${weekPct}%`;
          weekQuotaBar.style.width = `${Math.min(100, weekPct)}%`;
          weekQuotaBar.style.background = getBarGradient(weekPct);
          weekQuotaReset.textContent = data.realQuota.weeklyResetTime 
            ? `重置时间: ${data.realQuota.weeklyResetTime}` 
            : '每周限额';
        } else {
          weekQuotaPct.textContent = '待同步';
          weekQuotaBar.style.width = '0%';
          weekQuotaReset.textContent = '点左下角⚙️用量限额同步';
        }

        // 3. 耳灯与状态机
        earGlow.className = 'kimino-ear-glow';
        charBox.classList.remove('rate-limited');

        if (data.rateLimited || curPct >= 100) {
          earGlow.classList.add('glow-rate_limited');
          charBox.classList.add('rate-limited');
          baseFrame = 'sad';
          setFrame('sad');
          rateAlert.style.display = 'flex';
          alertClock.textContent = data.resetCountdownText || data.realQuota.currentResetTime || '恢复中...';
          dialogueEl.textContent = "口牙！我就说 Argon 这个电老虎撑不住吧！被你玩爆了喵！(哭)";
        } else if (curPct >= 80) {
          earGlow.classList.add('glow-exhausted');
          baseFrame = 'angry';
          setFrame('angry');
          rateAlert.style.display = 'none';
          dialogueEl.textContent = "杂鱼君停手！当前用量已经飙到 80%+ 了，快见底了喵！";
        } else if (curPct >= 60) {
          earGlow.classList.add('glow-warning');
          baseFrame = 'shy';
          setFrame('shy');
          rateAlert.style.display = 'none';
        } else if (data.status === 'thinking') {
          earGlow.classList.add('glow-thinking');
          baseFrame = 'idle';
          setFrame('idle');
          rateAlert.style.display = 'none';
        } else {
          earGlow.classList.add('glow-idle');
          baseFrame = 'idle';
          setFrame('idle');
          rateAlert.style.display = 'none';
        }
      });
    }

    api.onChanged((changes, area) => {
      if (area === 'local') {
        if (changes.character) {
          currentCharacter = changes.character.newValue;
          setFrame(baseFrame);
        }
        if (changes.customCharacter !== undefined) {
          customCharacterSrc = changes.customCharacter.newValue || null;
          setFrame(baseFrame);
        }
        if (changes.soundEnabled !== undefined) {
          soundEnabled = !!changes.soundEnabled.newValue;
        }
        if (changes.widgetScale) {
          widgetScale = changes.widgetScale.newValue;
          spriteImg.style.width = `${widgetScale}px`;
        }
        if (changes.bubbleVisible !== undefined) {
          bubbleVisible = !!changes.bubbleVisible.newValue;
          bubble.style.display = bubbleVisible ? 'block' : 'none';
        }
        if (changes.enabled !== undefined) {
          // 宿主为 display:contents —— 开关须以 important 内联覆盖
          host.style.setProperty('display', changes.enabled.newValue ? 'contents' : 'none', 'important');
        }
      }
    });

    console.log('[星语喵伴] 桌宠挂件注入完毕，基米乃已就位喵～🐾');

    // 角落异物自诊断：左下角出现非桌宠的实底盒子时，向控制台输出其 DOM 链路
    // （用户报告的"头像旁黑框"排查用；正常时静默）
    setTimeout(() => {
      try {
        const H = window.innerHeight;
        const pts = [[8, H - 8], [25, H - 20], [45, H - 35], [8, H - 45], [60, H - 55]];
        const reported = new Set();
        for (const [x, y] of pts) {
          const el = document.elementFromPoint(x, y);
          if (!el || el.closest('#kimino-companion-root')) continue;
          let painted = null;
          let e = el;
          for (let i = 0; i < 8 && e; i++) {
            const cs = getComputedStyle(e);
            if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') { painted = e; break; }
            e = e.parentElement;
          }
          if (!painted || reported.has(painted)) continue;
          reported.add(painted);
          const inSidenav = !!painted.closest('bard-sidenav, side-navigation-v2');
          if (inSidenav && painted.tagName.toLowerCase() === 'bard-sidenav') continue; // 侧栏自身底色属正常
          const chain = [];
          let t = painted;
          for (let i = 0; i < 8 && t; i++) {
            const cls = (typeof t.className === 'string' && t.className.trim()) ? '.' + t.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
            chain.unshift(t.tagName.toLowerCase() + cls);
            t = t.parentElement;
          }
          console.warn(`[星语喵伴] 角落异物诊断(${inSidenav ? '侧栏内' : '页面层'}):`,
            chain.join(' ← '), '| bg=' + getComputedStyle(painted).backgroundColor,
            '| size=' + Math.round(painted.getBoundingClientRect().width) + 'x' + Math.round(painted.getBoundingClientRect().height));
        }
      } catch (e) {}
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initWidget().catch((e) => console.error('[星语喵伴] 桌宠挂件初始化失败:', e));
    });
  } else {
    initWidget().catch((e) => console.error('[星语喵伴] 桌宠挂件初始化失败:', e));
  }
})();
