// Catstella · Cat Pet Widget (Shadow DOM + 真实 Google 额度条展示 + AGY 双端联动面板)
(() => {
  if (window.__KIMINO_WIDGET_READY__) return;
  window.__KIMINO_WIDGET_READY__ = true;

  // 跨浏览器 API 垫片 (Firefox / Zen 上杜绝未捕获 Promise rejection)
  const api = window.KIMINO_API || {
    available: false,
    getURL: (p) => p,
    storageGet: async () => ({}),
    storageSet: () => {},
    onChanged: () => {},
    sendMessage: async () => null
  };

  // Trusted Types 安全壳：gemini.google.com 开启 require-trusted-types-for 后，
  // 裸 innerHTML 赋值会抛 'TrustedHTML' 错误；有策略走策略，没策略走 DOMParser。
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
        const doc = new DOMParser().parseFromString(html, 'text/html');
        while (el.firstChild) el.removeChild(el.firstChild);
        while (doc.body.firstChild) el.appendChild(doc.body.firstChild);
        return true;
      } catch (e2) {
        console.warn('[Catstella] Trusted Types 兜底渲染失败:', e2);
        return false;
      }
    }
  };

  const EMBEDDED_DIALOGUES = {
    petReflection: [], // Optional lines written for touch milestones; {count} is replaced locally.
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
    ]
  };

  const CHAR_LABELS = {
    'gemini-star-v1': { name: '星语', desc: '星空魔女 · 紫发异色瞳' },
    'lin-cat': { name: '霓音', desc: '粉色猫耳 · 全息航行服' }
  };
  const shyLines = new Set([
    '才、才不是特意陪你的！', '少熬夜！才不是担心你呢。',
    '星星归天空，本喵归……才不告诉你！', '报错红了？别慌，本喵的脸可没红。'
  ]);

  const EMBEDDED_WIDGET_CSS = `
    :host {
      all: initial;
      display: contents !important;
    }

    *, *::before, *::after {
      box-sizing: border-box;
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

    @keyframes kimino-breathe {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-4px) scale(1.015); }
    }

    @keyframes kimino-ear-pulse {
      0%, 100% { opacity: 0.75; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    @keyframes kimino-bubble-pop {
      0% { transform: scale(0.94) translateY(8px); opacity: 0; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }

    @keyframes kimino-warning-flash {
      0%, 100% { filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.8)); }
      50% { filter: drop-shadow(0 0 24px rgba(236, 72, 153, 0.95)); }
    }

    .kimino-character-box {
      position: relative;
      cursor: pointer;
      touch-action: none;
      animation: kimino-breathe 4.2s ease-in-out infinite;
      transform-origin: bottom center;
    }

    .kimino-sleep-shell {
      transform: translateY(0);
      transform-origin: bottom center;
      transition: transform 460ms cubic-bezier(.2,.65,.3,1);
    }
    .kimino-wrapper:is([data-rest="sleeping"],[data-rest="waking"]) .kimino-sleep-clip {
      clip-path: inset(-26px -32px 0);
    }
    .kimino-wrapper:is([data-rest="sleeping"],[data-rest="waking"]) .kimino-character-box { animation: none; }
    .kimino-wrapper[data-rest="sleeping"] .kimino-sleep-shell { transform: translateY(14%); }
    .kimino-wrapper[data-rest="waking"] .kimino-sleep-shell {
      --agy-nuzzle-lift: -3%;
      --agy-nuzzle-settle: 1%;
      animation: agy-nuzzle var(--agy-wake-duration) ease-out both;
      transition: none;
    }
    .kimino-wrapper[data-rest="sleeping"] :is(.kimino-ear-glow,.kimino-sprite) { animation: none; }
    .kimino-wrapper[data-rest="sleeping"] .kimino-ear-glow { visibility: hidden; }
    .kimino-wrapper[data-nuzzling="true"] .kimino-character-box { animation: agy-nuzzle 1.6s ease-in-out both; }
    @keyframes agy-nuzzle {
      0% { transform: translateY(var(--agy-nuzzle-start, 0px)) rotate(0); }
      25% { transform: translateY(var(--agy-nuzzle-lift, 0px)) rotate(-1.1deg); }
      70% { transform: translateY(var(--agy-nuzzle-settle, 0px)) rotate(1.1deg); }
      100% { transform: translateY(0) rotate(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .kimino-wrapper .kimino-sleep-shell, .kimino-wrapper .kimino-character-box {
        animation: none !important;
        transition: none !important;
      }
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
      filter: drop-shadow(0 0 5px rgba(var(--kg-palette-accent-rgb, 189, 162, 242), 0.30));
    }
    .kimino-wrapper[data-facing="left"] .kimino-sprite { transform: scaleX(-1); }
    .kimino-touch-spark {
      position: absolute;
      z-index: 3;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin: -20px;
      border: 1px solid rgba(var(--kg-palette-accent-rgb, 189, 162, 242), .85);
      border-radius: 50%;
      color: #fff;
      background: radial-gradient(circle, rgba(var(--kg-palette-accent-rgb, 189, 162, 242), .68), transparent 70%);
      text-shadow: 0 0 8px var(--kg-palette-accent, #bda2f2);
      font-size: 20px;
      pointer-events: none;
      opacity: 0;
    }

    .kimino-character-box.rate-limited .kimino-sprite {
      animation: kimino-warning-flash 2s infinite ease-in-out;
    }

    /* ========= 气泡面板 ========= */
    .kimino-bubble {
      position: absolute;
      bottom: 102%;
      right: 0;
      width: min(296px, calc(100vw - 16px));
      background: rgba(22, 16, 38, 0.94);
      backdrop-filter: blur(22px) saturate(140%);
      -webkit-backdrop-filter: blur(22px) saturate(140%);
      border: 1px solid rgba(190, 160, 245, 0.35);
      border-radius: 18px;
      box-shadow: 0 14px 40px rgba(8, 5, 22, 0.65), inset 0 1px 0 rgba(240, 215, 255, 0.22);
      padding: 14px 16px;
      color: #f1edfa;
      animation: kimino-bubble-pop 0.28s cubic-bezier(0.18, 0.9, 0.32, 1.2);
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
    .kimino-bubble.below-pet::after {
      top: -8px; bottom: auto; border-top: 0; border-bottom: 8px solid rgba(22, 16, 38, 0.94);
    }

    .kimino-bubble-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 7px;
      border-bottom: 1px solid rgba(185, 155, 234, 0.2);
    }

    .kimino-header-title {
      font-size: 13px;
      font-weight: 600;
      color: #e9d5ff;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .kimino-header-actions {
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .kimino-btn-icon {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #ddd6fe;
      border-radius: 8px;
      cursor: pointer;
      padding: 3px 7px;
      font-size: 11px;
      line-height: 1.2;
      transition: all 0.18s ease;
    }

    .kimino-btn-icon:hover {
      background: rgba(192, 132, 252, 0.28);
      color: #fff;
      border-color: #c084fc;
    }
    .kimino-header-actions .kimino-btn-icon { min-width: 25px; min-height: 25px; white-space: nowrap; }
    .kimino-header-actions .kimino-btn-icon:focus-visible { outline: 2px solid var(--kg-palette-accent, #bda2f2); outline-offset: 2px; }

    .kimino-dialogue {
      font-size: 13px;
      line-height: 1.5;
      color: #f3e8ff;
      min-height: 38px;
      cursor: pointer;
      padding: 5px 7px;
      border-radius: 9px;
      transition: background 0.2s;
    }

    .kimino-dialogue:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .kimino-dialogue-hint {
      font-size: 10px;
      color: #c084fc;
      text-align: right;
      margin-top: 2px;
      opacity: 0.72;
    }

    .kimino-quota-panel {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(185, 155, 234, 0.22);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .kg-quota-legacy[hidden], .kg-usage-mount:empty { display: none !important; }
    .kg-quota-legacy { display: flex; flex-direction: column; gap: 8px; }
    .kg-usage-mount { max-height: clamp(80px, calc(100vh - 205px), 330px); overflow: auto; }

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
      color: #c4b5fd;
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

    .agy-companion-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(139, 92, 246, 0.14);
      border: 1px solid rgba(167, 139, 250, 0.28);
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 10.5px;
      color: #ede9fe;
    }

    .agy-companion-label {
      color: #d8b4fe;
      font-weight: 600;
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
      flex-direction: column;
      gap: 4px;
    }

    .alert-row, .alert-week-row {
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

    /* ========= 全新重绘设置面板 (Star-Nebula Glass v2) ========= */
    .kimino-settings {
      position: fixed;
      flex-direction: column;
      width: min(344px, calc(100vw - 16px));
      background: linear-gradient(165deg, rgba(28, 20, 48, 0.96) 0%, rgba(18, 13, 34, 0.97) 100%);
      backdrop-filter: blur(26px) saturate(150%);
      -webkit-backdrop-filter: blur(26px) saturate(150%);
      border: 1px solid rgba(196, 168, 250, 0.38);
      border-radius: 20px;
      box-shadow: 0 20px 52px rgba(6, 3, 18, 0.72), inset 0 1px 0 rgba(245, 230, 255, 0.22);
      color: #f3eeff;
      z-index: 20;
      font-size: 12.5px;
      overflow: hidden;
      animation: kimino-bubble-pop 0.24s cubic-bezier(0.18, 0.9, 0.32, 1.2);
      transform-origin: bottom right;
    }

    .kg-set-header {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      padding: 13px 15px 10px;
      border-bottom: 1px solid rgba(185, 155, 234, 0.16);
      background: linear-gradient(90deg, rgba(139, 92, 246, 0.14), rgba(56, 189, 248, 0.06));
    }

    .kg-set-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .kg-set-title {
      font-weight: 700;
      font-size: 13.5px;
      color: #f5f3ff;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }

    .kg-bridge-pill {
      font-size: 10.5px;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.07);
      color: #cbd5e1;
      white-space: nowrap;
    }

    .kg-bridge-pill.online {
      background: rgba(16, 185, 129, 0.18);
      border-color: rgba(52, 211, 153, 0.42);
      color: #a7f3d0;
    }

    .kg-btn-close {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.08);
      color: #e9d5ff;
      font-size: 13px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;
      flex-shrink: 0;
    }

    .kg-btn-close:hover {
      background: rgba(244, 63, 94, 0.32);
      border-color: rgba(251, 113, 133, 0.65);
      color: #fff;
      transform: scale(1.05);
    }

    /* Segmented Tabs */
    .kg-tabs {
      display: grid;
      flex: none;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      margin: 10px 14px 6px;
      padding: 4px;
      background: rgba(11, 8, 22, 0.55);
      border: 1px solid rgba(185, 155, 234, 0.16);
      border-radius: 12px;
    }

    .kg-tab-btn {
      background: transparent;
      border: none;
      color: #b8a9d9;
      font-size: 11.5px;
      font-weight: 600;
      padding: 6px 4px;
      border-radius: 9px;
      cursor: pointer;
      transition: all 0.18s ease;
    }

    .kg-tab-btn:hover {
      color: #ede9fe;
    }

    .kg-tab-btn.active {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.52), rgba(168, 85, 247, 0.38));
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(124, 58, 237, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }

    .kg-tab-body {
      min-height: 0;
      padding: 6px 14px 14px;
      max-height: min(500px, calc(100vh - 130px));
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(167, 139, 250, 0.4) transparent;
    }

    .kg-tab-pane {
      display: none;
      flex-direction: column;
      gap: 10px;
    }

    .kg-tab-pane.active {
      display: flex;
    }

    .kg-card {
      background: rgba(255, 255, 255, 0.045);
      border: 1px solid rgba(190, 160, 245, 0.16);
      border-radius: 14px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .kg-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11.5px;
      font-weight: 700;
      color: #d8b4fe;
    }

    .kg-card-hint {
      font-size: 10.5px;
      color: #a395c4;
      line-height: 1.45;
    }

    .kg-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 26px;
    }

    .kg-row-label {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .kg-row-label > span {
      font-size: 12px;
      color: #f1ebff;
      font-weight: 500;
    }

    .kg-row-label > small {
      font-size: 10px;
      color: #9f8ec2;
    }

    .kg-skin-style {
      color-scheme: dark;
      color: #f1ebff;
      background: #211932;
      border: 1px solid #57436f;
      border-radius: 7px;
      padding: 4px 6px;
      font: inherit;
    }

    /* Modern Pill Switch */
    .kg-switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 21px;
      flex-shrink: 0;
    }

    .kg-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .kg-switch-track {
      position: absolute;
      inset: 0;
      cursor: pointer;
      background: rgba(55, 45, 82, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      transition: all 0.22s ease;
    }

    .kg-switch-track::before {
      content: '';
      position: absolute;
      width: 15px;
      height: 15px;
      left: 2px;
      top: 2px;
      border-radius: 50%;
      background: #f8fafc;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
      transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }

    .kg-switch input:checked + .kg-switch-track {
      background: linear-gradient(135deg, #8b5cf6, #a855f7);
      border-color: rgba(216, 180, 254, 0.55);
    }

    .kg-switch input:checked + .kg-switch-track::before {
      transform: translateX(17px);
    }

    /* Segmented 3-way Mode Picker */
    .kg-seg-group {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      background: rgba(12, 9, 24, 0.55);
      padding: 3px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .kg-seg-btn {
      background: transparent;
      border: none;
      color: #b8a9d9;
      font-size: 11px;
      padding: 5px 4px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.18s;
      font-weight: 500;
    }

    .kg-seg-btn.active {
      background: rgba(167, 139, 250, 0.3);
      color: #fff;
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(196, 181, 253, 0.45);
    }

    /* Slider */
    .kg-slider-block {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .kg-slider-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #f1ebff;
    }

    .kg-val {
      color: #d8b4fe;
      font-weight: 700;
      font-size: 11.5px;
    }

    .kg-range {
      width: 100%;
      accent-color: #a855f7;
      height: 5px;
      cursor: pointer;
    }

    /* Sync Banner inside Character / Wallpaper Tabs */
    .kg-mode-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 11px;
      background: rgba(139, 92, 246, 0.14);
      border: 1px solid rgba(167, 139, 250, 0.3);
      font-size: 11px;
      color: #ede9fe;
    }

    .kg-mode-banner.independent {
      background: rgba(56, 189, 248, 0.1);
      border-color: rgba(56, 189, 248, 0.28);
    }

    .kg-mode-banner b, .kg-mode-banner small { display: block; overflow-wrap: anywhere; }
    .kg-mode-banner small { margin-top: 3px; font-size: 10px; font-weight: 400; color: #c5b8da; }
    .kg-mode-banner > div:first-child { min-width: 0; }
    .kg-mode-actions { display: flex; flex: none; flex-direction: column; align-items: stretch; gap: 4px; }
    .kg-tab-pane [hidden], .kg-settings-feedback[hidden] { display: none !important; }
    .kg-settings-feedback { flex: none; margin: 0 14px 8px; color: #fbc4bc; font-size: 11px; }
    .kg-char-card:focus-visible, .kg-thumb:focus-visible, .kg-thumb-del:focus-visible {
      outline: 2px solid var(--kg-palette-accent, #bda2f2);
      outline-offset: 2px;
    }

    .kg-mini-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f3e8ff;
      border-radius: 8px;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s;
    }

    .kg-mini-btn:hover {
      background: rgba(192, 132, 252, 0.32);
      border-color: #c084fc;
      color: #fff;
    }

    /* Character Cards */
    .kg-character-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .kg-char-card {
      position: relative;
      border-radius: 12px;
      padding: 10px 8px 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: all 0.18s ease;
      text-align: center;
    }

    .kg-char-card:hover {
      background: rgba(167, 139, 250, 0.12);
      border-color: rgba(196, 181, 253, 0.38);
    }

    .kg-char-card.kg-active {
      background: rgba(139, 92, 246, 0.22);
      border-color: #c084fc;
      box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.45);
    }

    .kg-char-card img {
      height: 58px;
      width: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.4));
    }

    .kg-char-name {
      font-size: 12px;
      font-weight: 600;
      color: #f5f3ff;
    }

    .kg-char-desc {
      font-size: 10px;
      color: #a395c4;
    }

    .kg-active-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 9.5px;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(168, 85, 247, 0.85);
      color: #fff;
      font-weight: 700;
    }

    /* Wallpaper Gallery */
    .kg-wallpaper-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .kg-thumb {
      position: relative;
      display: block;
      width: 100%;
      padding: 0;
      border-radius: 10px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.14);
      aspect-ratio: 16 / 9;
      background: rgba(0, 0, 0, 0.35);
      transition: all 0.18s ease;
    }

    .kg-thumb-slot { position: relative; min-width: 0; }
    .kg-thumb .kg-active-badge { top: 4px; left: 4px; right: auto; }

    .kg-thumb:hover {
      border-color: rgba(196, 181, 253, 0.5);
      transform: translateY(-1px);
    }

    .kg-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .kg-thumb-caption {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 3px 6px;
      font-size: 10px;
      color: #f8fafc;
      background: linear-gradient(transparent, rgba(10, 6, 22, 0.85));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kg-thumb.kg-active {
      border-color: #c084fc;
      box-shadow: 0 0 0 2px rgba(192, 132, 252, 0.5);
    }

    .kg-thumb-del {
      position: absolute;
      top: 4px;
      right: 4px;
      background: rgba(15, 10, 28, 0.78);
      color: #fda4af;
      font-size: 10px;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(251, 113, 133, 0.4);
    }

    .kg-action-row {
      display: flex;
      gap: 8px;
    }

    .kg-btn-wide {
      flex: 1;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #ede9fe;
      border-radius: 10px;
      padding: 7px 10px;
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 600;
      transition: all 0.18s;
    }

    .kg-btn-wide:hover {
      background: rgba(167, 139, 250, 0.25);
      border-color: #c084fc;
      color: #fff;
    }

    .kg-btn-wide.primary {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.75), rgba(168, 85, 247, 0.75));
      border-color: rgba(216, 180, 254, 0.45);
      color: #fff;
    }
  `;

  let widgetEnabled = true;
  let localCharacter = 'gemini-star-v1';
  let onlineCharacterPacks = {};
  let soundEnabled = false;
  let bubbleVisible = true;
  let syncAgyUsage = true;
  let widgetScale = 200;
  let syncCharacter = true;
  let petDisplayMode = 'both';
  let bridgeState = null;
  let baseFrame = 'idle';
  let latestTrackerSnapshot = null;

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

  function syncedCharacter(mode = syncCharacter, state = bridgeState) {
    const pack = mode && state?.online ? state.desktop?.characterPack : null;
    if (!pack) return null;
    return pack === 'gemini-star-v1' || pack === 'lin-cat' || onlineCharacterPacks[pack]?.frames?.idle ? pack : null;
  }

  function getFrameUrl(frame) {
    const desktopPack = syncedCharacter();
    const pack = desktopPack || localCharacter;
    const frames = onlineCharacterPacks[pack]?.frames;
    if (frames?.idle) return frames[frame] || frames.idle;
    const normalizedPack = pack === 'lin-cat' ? 'lin-cat' : 'gemini-star-v1';
    return api.getURL(`assets/characters/${normalizedPack}/${frame}.png`);
  }

  function getBarGradient(pct) {
    if (pct >= 85) return 'linear-gradient(90deg, #ec4899, #ef4444)';
    if (pct >= 60) return 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    return 'linear-gradient(90deg, #38bdf8, #818cf8)';
  }

  function buildWebQuotaPayload(data) {
    if (!data) return null;
    const rq = data.realQuota || {};
    const used5h = rq.fivePending ? null : typeof rq.currentUsagePercent === 'number'
      ? rq.currentUsagePercent
      : (typeof data.fatiguePercent === 'number' ? data.fatiguePercent : null);
    const usedWeek = !rq.weeklyPending && typeof rq.weeklyUsagePercent === 'number' ? rq.weeklyUsagePercent : null;
    return {
      fiveHourUsedPct: used5h,
      fiveHourRemainingPct: typeof used5h === 'number' ? Math.max(0, 100 - used5h) : null,
      weeklyUsedPct: usedWeek,
      weeklyRemainingPct: typeof usedWeek === 'number' ? Math.max(0, 100 - usedWeek) : null,
      sessionTurns: data.turns || 0,
      sessionTokensEst: data.totalTokensEst || 0,
      window5hTotal: data.turns || 0,
      dailyTotal: data.turns || 0,
      displaySource: rq.displaySource || 'estimate',
      lastModel: rq.displaySource === 'official' ? 'Google 官方账本' : 'Gemini Web',
      resetHint: rq.fivePending ? '等待更新' : rq.currentResetTime || data.resetCountdownText || '',
      weeklyResetHint: rq.weeklyPending ? '等待更新' : rq.weeklyResetTime || ''
    };
  }

  async function initWidget() {
    let config = {
      enabled: true,
      character: 'gemini-star-v1',
      soundEnabled: false,
      widgetScale: 200,
      bubbleVisible: true,
      widgetPos: null,
      syncCharacter: true,
      petDisplayMode: 'both',
      agyBridgeState: null
    };

    try {
      const stored = await api.storageGet([
        'enabled', 'character', 'soundEnabled', 'widgetScale', 'widgetPos',
        'bubbleVisible', 'onlineCharacterPacks', 'syncCharacter',
        'petDisplayMode', 'agyBridgeState', 'ambientChatter', 'syncAgyUsage', 'quotaView'
      ]);
      config = { ...config, ...stored };
    } catch (e) {}

    widgetEnabled = config.enabled !== false;
    localCharacter = config.character || 'gemini-star-v1';
    onlineCharacterPacks = config.onlineCharacterPacks || {};
    soundEnabled = !!config.soundEnabled;
    widgetScale = config.widgetScale || 200;
    bubbleVisible = config.bubbleVisible !== false;
    syncAgyUsage = config.syncAgyUsage !== false;
    let quotaView = config.quotaView === 'compact' ? 'compact' : 'classic';
    syncCharacter = config.syncCharacter !== false;
    petDisplayMode = config.petDisplayMode === 'prefer-desktop' ? 'prefer-desktop' : 'both';
    bridgeState = config.agyBridgeState || null;


    let host = document.getElementById('kimino-companion-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'kimino-companion-root';
      ['display:contents', 'background:transparent', 'background-color:transparent', 'border:none', 'box-shadow:none', 'width:0', 'height:0', 'overflow:visible']
        .forEach((decl) => {
          const [prop, ...rest] = decl.split(':');
          try { host.style.setProperty(prop, rest.join(':'), 'important'); } catch (e) {}
        });
      (document.body || document.documentElement).appendChild(host);
    }

    if (host.shadowRoot) {
      return;
    }

    let shadow;
    try {
      shadow = host.attachShadow({ mode: 'open' });
    } catch (e) {
      console.warn('[Catstella] Shadow DOM 挂载失败:', e);
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = EMBEDDED_WIDGET_CSS;
    shadow.appendChild(styleEl);

    const wrapper = document.createElement('div');
    wrapper.className = 'kimino-wrapper';
    wrapper.dataset.ready = 'false';

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
            <span class="kimino-title-text">Stella · 额度审计</span>
          </div>
          <div class="kimino-header-actions">
            <button type="button" class="kimino-btn-icon btn-sync-quota" title="静默刷新 Gemini 网页额度">刷新额度</button>
            <button type="button" class="kimino-btn-icon btn-open-settings" title="打开设置面板">设置</button>
            <button type="button" class="kimino-btn-icon btn-toggle-bubble" aria-label="收起气泡" title="收起气泡">✕</button>
          </div>
        </div>

        <div class="kimino-dialogue" title="点击换一句喵～">
          ${getDialogue('idle')}
        </div>
        <div class="kimino-dialogue-hint">点击文字换一句喵～</div>

        <div class="kimino-quota-panel">
          <div class="kg-quota-legacy">
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

          <div class="agy-companion-row" style="display: none;">
            <span class="agy-companion-label">🪐 AGY 客户端</span>
            <span class="agy-companion-val">--</span>
          </div>
          </div>
          <div class="kg-usage-mount"></div>

          <div class="session-meta-row">
            <span class="meta-turns">当前会话: 第 0 轮</span>
            <span class="meta-tokens">预估: 0 tokens</span>
          </div>

          <div class="kimino-rate-alert" style="display: none;">
            <div class="alert-row">
              <span class="alert-label">🚨 额度见底！倒计时:</span>
              <span class="kimino-alert-clock">--:--:--</span>
            </div>
            <div class="alert-week-row">
              <span class="alert-week-label">📅 每周限额重置:</span>
              <span class="kimino-alert-week">--</span>
            </div>
          </div>
        </div>
      </div>

      <div class="kimino-sleep-clip"><div class="kimino-sleep-shell"><div class="kimino-character-box" role="button" tabindex="0" aria-label="猫娘，点击互动">
        <div class="kimino-ear-glow glow-idle"></div>
        <img class="kimino-sprite" src="${getFrameUrl('idle')}" alt="Kimino Cat Pet" draggable="false" style="width: ${widgetScale}px;">
        <span class="kimino-touch-spark" aria-hidden="true">✦</span>
      </div></div></div>

      <div class="kimino-settings" style="display: none;" role="dialog" aria-label="Catstella设置">
        <div class="kg-set-header">
          <div class="kg-set-brand">
            <span class="kg-set-title">🐾 Catstella · 设置</span>
            <span class="kg-bridge-pill">⚪ 独立模式</span>
          </div>
          <button type="button" class="kg-btn-close" title="关闭设置 (Esc)" aria-label="关闭设置">✕</button>
        </div>

        <div class="kg-tabs" role="tablist" aria-label="设置分类">
          <button type="button" class="kg-tab-btn active" data-tab="general" id="kg-tab-general" role="tab" aria-selected="true" aria-controls="kg-pane-general">常用设置</button>
          <button type="button" class="kg-tab-btn" data-tab="character" id="kg-tab-character" role="tab" aria-selected="false" aria-controls="kg-pane-character" tabindex="-1">🐱 形象</button>
          <button type="button" class="kg-tab-btn" data-tab="wallpaper" id="kg-tab-wallpaper" role="tab" aria-selected="false" aria-controls="kg-pane-wallpaper" tabindex="-1">🖼️ 壁纸</button>
        </div>

        <div class="kg-tab-body">
          <!-- Tab 1: 联动与常用 -->
          <div class="kg-tab-pane active" data-pane="general" id="kg-pane-general" role="tabpanel" aria-labelledby="kg-tab-general">
            <div class="kg-card">
              <div class="kg-card-head">
                <span>🪐 Antigravity 双端联动</span>
                <span class="kg-sync-port-hint" style="font-weight:500;font-size:10.5px;color:#a78bfa;">本地桥接</span>
              </div>
              <div class="kg-row">
                <div class="kg-row-label">
                  <span>同步反重力用量</span>
                  <small>关闭后，气泡只显示网页额度</small>
                </div>
                <label class="kg-switch"><input type="checkbox" class="kg-cfg" data-key="syncAgyUsage" aria-label="同步反重力用量"><span class="kg-switch-track"></span></label>
              </div>
              <div class="kg-slider-block" style="margin-top:2px;">
                <div class="kg-slider-head">
                  <span style="font-size:11.5px;color:#ddd6fe;">双端桌宠显示策略</span>
                </div>
                <div class="kg-seg-group">
                  <button type="button" class="kg-seg-btn" data-mode="both" title="桌面与网页挂件同时显示">双端同显</button>
                  <button type="button" class="kg-seg-btn" data-mode="prefer-desktop" title="连接桌面端时隐藏网页桌宠，仅保留毛玻璃皮肤">仅桌面端</button>
                </div>
              </div>
            </div>

            <div class="kg-card">
              <div class="kg-card-head"><span>✨ 基础体验</span></div>
              <div class="kg-row">
                <div class="kg-row-label"><span>桌宠挂件显示</span></div>
                <label class="kg-switch"><input type="checkbox" class="kg-cfg" data-key="enabled"><span class="kg-switch-track"></span></label>
              </div>
              <div class="kg-row">
                <label class="kg-row-label" for="kg-skin-style"><span>界面样式</span></label>
                <select class="kg-skin-style" id="kg-skin-style">
                  <option value="glass">星空毛玻璃</option>
                  <option value="solid">简洁实色</option>
                  <option value="native">Gemini 原生</option>
                </select>
              </div>
              <div class="kg-row">
                <label class="kg-row-label" for="kg-quota-style"><span>额度显示样式</span></label>
                <select class="kg-skin-style" id="kg-quota-style">
                  <option value="classic">经典进度条</option>
                  <option value="compact">紧凑圆环</option>
                </select>
              </div>
              <div class="kg-row">
                <div class="kg-row-label"><span>台词与额度气泡</span></div>
                <label class="kg-switch"><input type="checkbox" class="kg-cfg" data-key="bubbleVisible"><span class="kg-switch-track"></span></label>
              </div>
              <div class="kg-row">
                <div class="kg-row-label"><span>自动碎碎念</span></div>
                <label class="kg-switch"><input type="checkbox" class="kg-cfg" data-key="ambientChatter" aria-label="自动碎碎念"><span class="kg-switch-track"></span></label>
              </div>
              <div class="kg-row">
                <div class="kg-row-label"><span>点击互动音效</span></div>
                <label class="kg-switch"><input type="checkbox" class="kg-cfg" data-key="soundEnabled"><span class="kg-switch-track"></span></label>
              </div>
              <div class="kg-slider-block">
                <div class="kg-slider-head">
                  <span>挂件尺寸</span>
                  <span class="kg-val kg-val-scale">200px</span>
                </div>
                <input type="range" class="kg-range" data-key="widgetScale" min="120" max="320" step="10">
              </div>
              <button type="button" class="kg-btn-wide kg-reset-pos">📍 复位桌宠至右下角</button>
              <button type="button" class="kg-btn-wide kg-preview-nap">💤 预览打盹</button>
            </div>
          </div>

          <!-- Tab 2: 形象 -->
          <div class="kg-tab-pane" data-pane="character" id="kg-pane-character" role="tabpanel" aria-labelledby="kg-tab-character">
            <div class="kg-mode-banner kg-char-sync-banner">
              <div><b class="kg-char-sync-text"></b><small class="kg-char-saved"></small><small class="kg-char-mode"></small></div>
              <div class="kg-mode-actions">
                <button type="button" class="kg-mini-btn kg-toggle-char-sync">独立设置</button>
                <button type="button" class="kg-mini-btn kg-show-local-char" hidden>编辑备用</button>
              </div>
            </div>
            <div class="kg-character-grid"></div>
            <button type="button" class="kg-btn-wide kg-open-online">🌐 浏览在线桌宠</button>
          </div>

          <!-- Tab 3: 壁纸 -->
          <div class="kg-tab-pane" data-pane="wallpaper" id="kg-pane-wallpaper" role="tabpanel" aria-labelledby="kg-tab-wallpaper">
            <div class="kg-card">
              <div class="kg-slider-block">
                <div class="kg-slider-head">
                  <label for="kg-wallpaper-opacity">壁纸不透明度</label>
                  <span class="kg-val kg-val-opacity">88%</span>
                </div>
                <input type="range" id="kg-wallpaper-opacity" class="kg-range" data-key="wallpaperOpacity" min="30" max="100" step="1">
              </div>
            </div>

            <div class="kg-mode-banner kg-wall-sync-banner">
              <div><b class="kg-wall-sync-text"></b><small class="kg-wall-saved"></small><small class="kg-wall-mode"></small></div>
              <div class="kg-mode-actions">
                <button type="button" class="kg-mini-btn kg-toggle-wall-sync">独立设置</button>
                <button type="button" class="kg-mini-btn kg-show-local-wall" hidden>编辑备用</button>
              </div>
            </div>

            <div class="kg-desktop-wall-controls" style="display:none;">
              <div class="kg-action-row">
                <button type="button" class="kg-btn-wide primary kg-next-desktop-wall">⏭ 切换下一张桌面壁纸</button>
              </div>
            </div>

            <div class="kg-wallpaper-grid"></div>
            <div class="kg-action-row"><button type="button" class="kg-btn-wide kg-open-online">🌐 更新与在线图库</button></div>

            <div class="kg-local-wall-controls">
              <div class="kg-action-row">
                <button type="button" class="kg-btn-wide kg-btn-wallpaper">📤 上传网页自定义壁纸</button>
              </div>
            </div>
          </div>
        </div>

        <p class="kg-settings-feedback" role="status" hidden></p>
        <button type="button" class="kg-btn-wide kg-open-online kg-online-notice" role="status" hidden></button>
        <input type="file" accept="image/*" class="kg-file-input kg-file-wallpaper" style="display:none">
      </div>
    `);

    shadow.appendChild(wrapper);

    const charBox = wrapper.querySelector('.kimino-character-box');
    const sleepShell = charBox.parentElement;
    const spriteImg = wrapper.querySelector('.kimino-sprite');
    const earGlow = wrapper.querySelector('.kimino-ear-glow');
    const bubble = wrapper.querySelector('.kimino-bubble');
    const dialogueEl = wrapper.querySelector('.kimino-dialogue');
    const btnToggleBubble = wrapper.querySelector('.btn-toggle-bubble');
    const btnSyncQuota = wrapper.querySelector('.btn-sync-quota');
    const btnOpenSettings = wrapper.querySelector('.btn-open-settings');
    const settingsPanel = wrapper.querySelector('.kimino-settings');
    const btnCloseSettings = wrapper.querySelector('.kg-btn-close');

    const curQuotaPct = wrapper.querySelector('.cur-quota-pct');
    const curQuotaBar = wrapper.querySelector('.cur-quota-bar');
    const curQuotaReset = wrapper.querySelector('.cur-quota-reset');
    const weekQuotaPct = wrapper.querySelector('.week-quota-pct');
    const weekQuotaBar = wrapper.querySelector('.week-quota-bar');
    const weekQuotaReset = wrapper.querySelector('.week-quota-reset');
    const agyCompRow = wrapper.querySelector('.agy-companion-row');
    const agyCompVal = wrapper.querySelector('.agy-companion-val');
    const metaTurns = wrapper.querySelector('.meta-turns');
    const metaTokens = wrapper.querySelector('.meta-tokens');
    const rateAlert = wrapper.querySelector('.kimino-rate-alert');
    const alertClock = wrapper.querySelector('.kimino-alert-clock');
    const legacyQuota = wrapper.querySelector('.kg-quota-legacy');
    const usageMount = wrapper.querySelector('.kg-usage-mount');
    let usageViewer, usageSignature = '';
    function renderUsage() {
      const compact = quotaView === 'compact' && customElements.get('catstella-usage-viewer');
      legacyQuota.hidden = Boolean(compact);
      if (!compact) { usageViewer?.remove(); return; }
      if (!usageViewer) {
        usageViewer = document.createElement('catstella-usage-viewer');
        usageViewer.setAttribute('compact', '');
        usageViewer.setAttribute('embedded', '');
      }
      if (usageViewer.parentNode !== usageMount) usageMount.append(usageViewer);
      const data = latestTrackerSnapshot;
      const quota = data?.realQuota;
      const usedToLeft = value => Number.isFinite(value) ? 100 - value : null;
      const groups = [{
        name: 'Gemini 网页',
        rows: [
          { label: quota?.displaySource === 'estimate' ? '5 小时（估算）' : '5 小时', remaining: usedToLeft(data?.fatiguePercent),
            resetAt: quota?.fiveResetEpoch, state: quota?.fivePending ? 'pending' : '' },
          { label: '每周', remaining: usedToLeft(quota?.weeklyUsagePercent), resetAt: quota?.weeklyResetEpoch,
            state: quota?.weeklyPending ? 'pending' : '' }
        ]
      }];
      const desktop = syncAgyUsage && bridgeState?.online ? bridgeState.desktop?.agyQuota : null;
      if (desktop) {
        const row = (label, remaining, reset) => {
          const resetAt = typeof reset === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(reset) ? Date.parse(reset) : undefined;
          return { label, remaining, resetAt, resetLabel: Number.isFinite(resetAt) || !reset ? '' : reset };
        };
        const legacyArgon = /argon/i.test(desktop.modelName || '') && Number.isFinite(desktop.argonWeekly);
        const weekly = desktop.geminiWeekly ?? (legacyArgon ? null : desktop.weekly);
        if ([desktop.fiveHour, weekly, desktop.argonWeekly].some(Number.isFinite)) {
          const rows = [row('5 小时', desktop.fiveHour, desktop.fiveHourReset),
            row('每周', weekly, desktop.geminiWeeklyReset ?? (legacyArgon ? '' : desktop.weeklyReset))];
          if (Number.isFinite(desktop.argonWeekly)) rows.push(row('Argon · 每周', desktop.argonWeekly, desktop.argonWeeklyReset));
          groups.push({ name: '反重力 · Gemini', rows });
        }
        const other = desktop.claudeGpt;
        if ([other?.fiveHour, other?.weekly].some(Number.isFinite)) {
          groups.push({ name: '反重力 · Claude / GPT', rows: [
            row('5 小时', other.fiveHour, other.fiveHourReset), row('每周', other.weekly, other.weeklyReset)
          ] });
        }
      }
      const signature = JSON.stringify(groups);
      if (signature !== usageSignature) { usageSignature = signature; usageViewer.data = { groups }; }
    }

    const kgValScale = wrapper.querySelector('.kg-val-scale');
    const kgValOpacity = wrapper.querySelector('.kg-val-opacity');

    let settingsOpen = false;
    let pointer = null;
    let trackerStatus = window.__KIMINO_TRACKER__?.sessionData?.status ?? 'idle';
    let lastActivity, lastQuotaReset, statusTimer, statusLine = '';
    let dialogueCategory = 'idle';
    let petVisual = {};
    const PetBehavior = window.CatstellaPetBehavior;
    sleepShell.style.setProperty('--agy-wake-duration', `${PetBehavior.wakeTime}ms`);
    const pet = new PetBehavior(visual => {
      if (visual.rest === 'waking' && wrapper.dataset.rest !== 'waking') {
        const offset = new DOMMatrixReadOnly(getComputedStyle(sleepShell).transform).m42;
        sleepShell.style.setProperty('--agy-nuzzle-start', `${offset}px`);
      }
      petVisual = visual;
      wrapper.dataset.rest = visual.rest;
      wrapper.dataset.nuzzling = String(visual.expression === 'proud');
      paintFrame();
    });

    function isHiddenByDesktopPriority() {
      return Boolean(bridgeState?.online && petDisplayMode === 'prefer-desktop');
    }

    function syncPet() {
      const visible = widgetEnabled && (!isHiddenByDesktopPriority() || settingsOpen) && !document.hidden;
      const resting = visible && trackerStatus !== 'thinking';
      const desktop = bridgeState?.online && bridgeState.sync?.syncInteraction !== false ? bridgeState.desktop : null;
      pet.sync({
        visible,
        idle: resting && !pointer,
        rest: resting && (!pointer || pet.rest === 'sleeping') && !bubbleVisible && !settingsOpen,
        expressions: desktop?.easterEggs !== false
      });
    }

    function updateVisibilityAndBridgeUI() {
      const hiddenByUser = !widgetEnabled;
      const hiddenByPriority = isHiddenByDesktopPriority() && !settingsOpen;
      host.style.setProperty('display', (hiddenByUser || hiddenByPriority) ? 'none' : 'contents', 'important');

      // 设置面板开启时收起气泡防重叠；关闭设置后按 bubbleVisible 恢复
      if (settingsOpen) {
        bubble.style.display = 'none';
      } else {
        bubble.style.display = bubbleVisible ? 'block' : 'none';
      }
      syncPet();

      // 更新气泡内 AGY 额度行
      if (agyCompRow && agyCompVal) {
        const aq = syncAgyUsage && bridgeState?.online ? bridgeState.desktop?.agyQuota : null;
        if (aq && (typeof aq.fiveHour === 'number' || typeof aq.weekly === 'number')) {
          const f5 = typeof aq.fiveHour === 'number' ? `5h 余 ${Math.round(aq.fiveHour)}%` : '5h —';
          const fw = typeof aq.weekly === 'number' ? `1w 余 ${Math.round(aq.weekly)}%` : '1w —';
          agyCompVal.textContent = `${f5} · ${fw}`;
          agyCompRow.style.display = 'flex';
        } else {
          agyCompRow.style.display = 'none';
        }
      }
      renderUsage();
      adjustBubblePlacement();
    }

    function adjustBubblePlacement() {
      if (!bubbleVisible || settingsOpen || !widgetEnabled || isHiddenByDesktopPriority()) return;
      const rect = wrapper.getBoundingClientRect();
      const width = bubble.offsetWidth, height = bubble.offsetHeight;
      const below = rect.top < height + 22 && innerHeight - rect.bottom > rect.top;
      const x = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8));
      const preferred = below ? rect.bottom + 14 : rect.top - height - 14;
      const y = Math.max(8, Math.min(preferred, innerHeight - height - 8));
      bubble.classList.toggle('below-pet', below);
      Object.assign(bubble.style, { left: (x - rect.left) + 'px', top: (y - rect.top) + 'px', right:'auto', bottom:'auto' });
    }

    function adjustSettingsPlacement() {
      if (!settingsOpen) return;
      const rect = wrapper.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      const width = settingsPanel.offsetWidth;
      const above = rect.top - gap - margin;
      const below = innerHeight - rect.bottom - gap - margin;
      const useAbove = above >= 460 || above >= below;
      const available = useAbove ? above : below;
      const overlay = available < 320;
      Object.assign(settingsPanel.style, {
        left: `${Math.max(margin, Math.min(rect.right - width, innerWidth - width - margin))}px`,
        top: overlay ? `${margin}px` : useAbove ? 'auto' : `${rect.bottom + gap}px`,
        bottom: overlay || !useAbove ? 'auto' : `${innerHeight - rect.top + gap}px`,
        maxHeight: `${overlay ? innerHeight - 2 * margin : available}px`,
        transformOrigin: useAbove && !overlay ? 'bottom right' : 'top right'
      });
    }
    window.addEventListener('resize', adjustSettingsPlacement);
    window.addEventListener('resize', adjustBubblePlacement);

    function closeSettings() {
      if (!settingsOpen) return;
      settingsOpen = false;
      settingsPanel.style.display = 'none';
      updateVisibilityAndBridgeUI();
    }

    function openSettings() {
      settingsOpen = true;
      settingsPanel.style.display = 'flex';
      updateVisibilityAndBridgeUI();
      adjustSettingsPlacement();
      syncSettingsUI();
      void checkOnlineNotice();
    }

    let onlineNoticePending = false;
    async function checkOnlineNotice() {
      if (onlineNoticePending) return;
      onlineNoticePending = true;
      const result = await api.sendMessage({ type: 'KG_ONLINE_AVAILABILITY' });
      onlineNoticePending = false;
      if (!settingsOpen) return;
      const notice = settingsPanel.querySelector('.kg-online-notice');
      const available = result?.ok && (result.character || result.wallpaper);
      notice.hidden = !available && result?.reason !== 'connection';
      if (available) notice.textContent = '发现可安装的在线素材 · ' +
        [result.character && result.character + ' 款桌宠', result.wallpaper && result.wallpaper + ' 张壁纸'].filter(Boolean).join('、');
      else if (result?.reason === 'connection') notice.textContent = '无法连接 GitHub，请检查网络或代理后重试。';
    }

    function paintFrame() {
      const { blink, expression } = petVisual;
      const frame = blink ? 'blink' : expression === 'angry' ? 'sad' : expression || baseFrame;
      const src = getFrameUrl(frame);
      if (spriteImg.getAttribute('src') !== src) spriteImg.src = src;
    }

    spriteImg.addEventListener('error', () => {
      const fallback = getFrameUrl('idle');
      if (spriteImg.src !== fallback) spriteImg.src = fallback;
    });

    let ambientEnabled = config.ambientChatter === true;
    let ambientTimer, previousAmbient, ambientLine = '', previousLine = '';
    const quietAmbient = () => {
      clearTimeout(ambientTimer);
      if (ambientLine && dialogueEl.textContent === ambientLine) dialogueEl.textContent = previousLine;
      ambientLine = '';
    };
    const Chatter = window.CatstellaChatter;
    const chatter = Chatter && new Chatter({
      allowed: () => widgetEnabled && bubbleVisible && !settingsOpen && !pointer &&
        !isHiddenByDesktopPriority() && !document.hidden && document.hasFocus() &&
        trackerStatus === 'idle',
      speak: () => {
        previousAmbient = Chatter.pickLine(previousAmbient);
        previousLine = dialogueEl.textContent;
        ambientLine = previousAmbient;
        dialogueEl.textContent = ambientLine;
        ambientTimer = setTimeout(quietAmbient, 4500);
      }
    });
    const resetChatter = () => { quietAmbient(); chatter?.reset(); };
    if (chatter) {
      document.addEventListener('pointerdown', resetChatter, { capture: true, passive: true });
      document.addEventListener('keydown', resetChatter, { capture: true, passive: true });
      document.addEventListener('visibilitychange', resetChatter);
      window.addEventListener('blur', resetChatter);
      window.addEventListener('focus', resetChatter);
      chatter.configure(ambientEnabled);
    }

    function nextDialogue() {
      clearTimeout(statusTimer);
      statusLine = '';
      const line = getDialogue(dialogueCategory);
      dialogueEl.textContent = line;
      if (shyLines.has(line)) pet.show('shy', 'dialogue');
    }

    function showStatusLine(line, duration = 0) {
      quietAmbient();
      clearTimeout(statusTimer);
      statusLine = dialogueEl.textContent = line;
      if (duration) statusTimer = setTimeout(clearStatusLine, duration);
    }

    function clearStatusLine() {
      clearTimeout(statusTimer);
      if (statusLine && dialogueEl.textContent === statusLine) dialogueEl.textContent = getDialogue(dialogueCategory);
      statusLine = '';
    }

    let touchFeedback, sparkFeedback, lastPatReflection = -Infinity;
    const touchSpark = wrapper.querySelector('.kimino-touch-spark');
    function showHeadFeedback(x, y) {
      touchFeedback?.cancel();
      sparkFeedback?.cancel();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) {
        touchFeedback = spriteImg.animate([
          { scale: '1', translate: '0 0' }, { scale: '1.05 .90', translate: '0 3px', offset:.20 },
          { scale: '.99 1.055', translate: '0 -5px', offset:.53 }, { scale: '1.01 .99', translate: '0 1px', offset:.78 },
          { scale: '1', translate: '0 0' }
        ], { duration:330, easing:'ease-out' });
        touchFeedback.id = 'catstella-head-tap';
      }
      Object.assign(touchSpark.style, {
        left: Math.max(8, Math.min(92, x * 100)) + '%',
        top: Math.max(8, Math.min(82, y * 100)) + '%'
      });
      sparkFeedback = touchSpark.animate(reduce
        ? [{ opacity:.9 }, { opacity:0 }]
        : [{ opacity:1, scale:'.62', translate:'0 0' }, { opacity:1, scale:'1.05', translate:'0 -5px', offset:.28 },
          { opacity:0, scale:'1.3', translate:'0 -16px' }],
        { duration:reduce ? 240 : 450, easing:'ease-out' });
      sparkFeedback.id = 'catstella-head-spark';
    }
    async function recordHeadPat() {
      const result = await api.sendMessage({ type: 'KG_HEAD_PAT' });
      const total = result?.total;
      if (!EMBEDDED_DIALOGUES.petReflection.length || !Number.isSafeInteger(total) || total < 10 || total % 10 !== 0 ||
          performance.now() - lastPatReflection < 90_000 || trackerStatus !== 'idle' || statusLine ||
          settingsOpen || !bubbleVisible || document.hidden) return;
      lastPatReflection = performance.now();
      showStatusLine(getDialogue('petReflection').replaceAll('{count}', String(total)), 4000);
    }
    function activate(head) {
      if (settingsOpen) closeSettings();
      else if (!bubbleVisible) {
        bubbleVisible = true;
        updateVisibilityAndBridgeUI();
        api.storageSet({ bubbleVisible });
      } else nextDialogue();
      if (head) pet.tap();
    }

    const pointerDistance = event => Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    function faceViewport(center, margin = 12) {
      if (center < innerWidth / 2 - margin) wrapper.dataset.facing = 'left';
      else if (center > innerWidth / 2 + margin) wrapper.dataset.facing = 'right';
    }
    const placeWidget = ({ x, y }, snap = false) => {
      const maxX = Math.max(0, innerWidth - wrapper.offsetWidth);
      const maxY = Math.max(0, innerHeight - wrapper.offsetHeight);
      const clamp = (n, max) => n <= 0 || (snap && n < 18) ? 0 : n >= max || (snap && max - n < 18) ? max : Math.round(n);
      const position = { x: clamp(x, maxX), y: clamp(y, maxY) };
      Object.assign(wrapper.style, { left: position.x + 'px', top: position.y + 'px', right: 'auto', bottom: 'auto' });
      faceViewport(position.x + wrapper.offsetWidth / 2);
      adjustSettingsPlacement();
      adjustBubblePlacement();
      return position;
    };
    charBox.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || pointer) return;
      const area = charBox.getBoundingClientRect();
      const x = (event.clientX - area.left) / area.width;
      const y = (event.clientY - area.top) / area.height;
      const { left, top } = wrapper.getBoundingClientRect();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, left, top, facing: wrapper.dataset.facing,
        startedAt: performance.now(),
        sleeping: pet.rest === 'sleeping', head: x >= .04 && x <= .96 && y >= 0 && y <= .84, headX:x, headY:y };
      charBox.setPointerCapture(event.pointerId);
      pet.activity();
      syncPet();
      if (!pointer.sleeping) playSound('press');
    });
    charBox.addEventListener('pointermove', event => {
      if (pointer?.id === event.pointerId) {
        pointer.distance = Math.max(pointer.distance, pointerDistance(event));
        if (pointer.distance > PetBehavior.tapSlop) placeWidget({
          x: pointer.left + event.clientX - pointer.x, y: pointer.top + event.clientY - pointer.y
        });
      }
    });
    charBox.addEventListener('pointerenter', () => pet.activity());
    function release(cancel, event) {
      if (!pointer || (event && event.pointerId !== pointer.id)) return;
      const { sleeping, head, headX, headY, startedAt } = pointer;
      const distance = event ? Math.max(pointer.distance, pointerDistance(event)) : pointer.distance;
      const isTap = !cancel && PetBehavior.isTap(performance.now() - startedAt, distance);
      if (pointer.distance > PetBehavior.tapSlop || (!cancel && distance > PetBehavior.tapSlop)) {
        if (cancel) {
          placeWidget({ x: pointer.left, y: pointer.top });
          wrapper.dataset.facing = pointer.facing || 'right';
        }
        else {
          const widgetPos = placeWidget({
            x: pointer.left + event.clientX - pointer.x, y: pointer.top + event.clientY - pointer.y
          }, true);
          void api.storageSet({ widgetPos });
        }
      }
      pointer = null;
      if (isTap) playSound('release');
      syncPet();
      if (isTap && !pet.activity(true) && !sleeping && pet.rest === 'awake') {
        activate(head);
        if (head) { showHeadFeedback(headX, headY); void recordHeadPat(); }
      }
    }
    charBox.addEventListener('pointerup', event => release(false, event));
    charBox.addEventListener('pointercancel', event => release(true, event));
    charBox.addEventListener('lostpointercapture', event => release(true, event));
    window.addEventListener('blur', () => release(true));
    document.addEventListener('visibilitychange', syncPet);
    charBox.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat && !pet.activity(true) && pet.rest === 'awake') activate(false);
    });
    settingsPanel.querySelector('.kg-preview-nap').addEventListener('click', () => pet.previewNap());

    dialogueEl.addEventListener('click', () => {
      nextDialogue();
      playSound('press');
    });

    btnToggleBubble.addEventListener('click', (e) => {
      e.stopPropagation();
      bubbleVisible = false;
      updateVisibilityAndBridgeUI();
      api.storageSet({ bubbleVisible: false });
    });

    let quotaBounce;
    btnSyncQuota.addEventListener('click', async (e) => {
      e.stopPropagation();
      playSound('press');
      btnSyncQuota.disabled = true;
      btnSyncQuota.textContent = '同步中…';
      let confirmed = false;
      try {
        confirmed = await window.__KIMINO_TRACKER__?.refreshUsageLedger('widget', true) === true;
        if (confirmed && pet.show('proud', 'system')) {
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            quotaBounce?.cancel();
            quotaBounce = sleepShell.animate([{ translate:'0 0' }, { translate:'0 -9px', offset:.38 }, { translate:'0 0' }],
              { duration:340, easing:'ease-out' });
            quotaBounce.id = 'catstella-quota-success';
          }
        }
      } catch {}
      btnSyncQuota.textContent = confirmed ? '已同步' : '未确认';
      sendHeartbeat();
      setTimeout(() => { btnSyncQuota.textContent = '刷新额度'; btnSyncQuota.disabled = false; }, 1500);
    });

    const wallpaperToDataUrl = file => new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const scale = Math.min(1920 / img.width, 1080 / img.height, 1);
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const cv = document.createElement('canvas');
              cv.width = w;
              cv.height = h;
              const ctx = cv.getContext('2d');
              ctx.fillStyle = '#211e2d';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              resolve(cv.toDataURL('image/jpeg', 0.85));
            } catch (e) { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch (e) { resolve(null); }
    });

    // ===== 画廊清单 =====
    let kgManifestCache = null;
    const loadGalleryManifest = async () => {
      if (kgManifestCache) return kgManifestCache;
      try {
        const res = await fetch(api.getURL('assets/manifest.json'));
        kgManifestCache = await res.json();
      } catch (e) {
        kgManifestCache = {
          wallpapers: [{ id: 'gemini-character-sheet-v1', name: '星语 · 星幕夜话', src: 'assets/wallpapers/gemini-sheet.png' }],
          characters: [
            { id: 'gemini-star-v1', name: '星语', preview: 'assets/characters/gemini-star-v1/idle.png' },
            { id: 'lin-cat', name: '霓音', preview: 'assets/characters/lin-cat/idle.png' }
          ]
        };
      }
      return kgManifestCache;
    };

    const pushBridgePatch = async (patch) => {
      const res = await api.sendMessage({ type: 'KG_BRIDGE_PATCH', patch });
      return res;
    };

    let showLocalChar = false;
    let showLocalWall = false;
    const settingsFeedback = settingsPanel.querySelector('.kg-settings-feedback');
    const opacitySlider = settingsPanel.querySelector('#kg-wallpaper-opacity');
    const renderOpacity = (opacity = 0.88) => {
      opacitySlider.value = String(Math.round(opacity * 100));
      kgValOpacity.textContent = opacitySlider.value + '%';
    };
    const reportSettings = (message = '') => {
      settingsFeedback.textContent = message;
      settingsFeedback.hidden = !message;
    };
    const settingsKeys = [
      'enabled', 'skinStyle', 'skinEnabled', 'quotaView', 'syncAgyUsage', 'bubbleVisible', 'ambientChatter', 'soundEnabled', 'widgetScale',
      'wallpaperOpacity', 'character', 'wallpaperId', 'customWallpapers',
      'syncCharacter', 'syncWallpaper', 'petDisplayMode', 'agyBridgeState', 'agySyncedWallpaper'
    ];
    const appearanceOf = state => JSON.stringify([state?.online, state?.desktop?.characterPack,
      state?.desktop?.characterPackIds, state?.desktop?.wallpaperId, state?.desktop?.wallpaperRev]);
    const saveLocal = async (updates) => {
      const saved = await api.storageSet(updates);
      reportSettings(saved ? '' : '未能保存网页选择，请重试。');
      await syncSettingsUI();
      return saved;
    };
    let settingsRevision = 0;
    const syncSettingsUI = async () => {
      const revision = ++settingsRevision;
      try {
        const st = await api.storageGet(settingsKeys);

        if (revision !== settingsRevision) return;
        const state = st.agyBridgeState || null;
        const isOnline = !!state?.online;
        const curSyncChar = st.syncCharacter !== false;
        const curSyncWall = st.syncWallpaper !== false;
        const curMode = st.petDisplayMode === 'prefer-desktop' ? 'prefer-desktop' : 'both';

        // Header 状态胶囊
        const pill = settingsPanel.querySelector('.kg-bridge-pill');
        const portHint = settingsPanel.querySelector('.kg-sync-port-hint');
        if (pill) {
          pill.className = 'kg-bridge-pill' + (isOnline ? ' online' : '');
          pill.textContent = isOnline ? '🟢 AGY 已联动' : '⚪ 独立运行';
        }
        if (portHint) {
          portHint.textContent = isOnline ? '已连接本机桌面套件' : '桌面未连接，网页设置仍可使用';
        }

        // 同步开关与显示策略
        settingsPanel.querySelectorAll('.kg-seg-btn').forEach((btn) => {
          const selected = btn.dataset.mode === curMode;
          btn.classList.toggle('active', selected);
          btn.setAttribute('aria-pressed', String(selected));
        });

        // 常规开关与滑条
        settingsPanel.querySelectorAll('.kg-cfg').forEach((cb) => {
          const k = cb.dataset.key;
          cb.checked = st[k] !== undefined ? !!st[k] : (k === 'enabled' || k === 'syncAgyUsage' || k === 'bubbleVisible');
        });
        settingsPanel.querySelector('.kg-skin-style').value =
          window.KiminoSkinStyle?.read(st) ?? (st.skinEnabled === false ? 'native' : 'glass');
        settingsPanel.querySelector('#kg-quota-style').value = st.quotaView === 'compact' ? 'compact' : 'classic';
        const scale = st.widgetScale || 200;
        const rScale = settingsPanel.querySelector('.kg-range[data-key="widgetScale"]');
        if (rScale) { rScale.value = scale; if (kgValScale) kgValScale.textContent = scale + 'px'; }
        if (shadow.activeElement !== opacitySlider) renderOpacity(st.wallpaperOpacity);

        // ---- 形象 Tab 渲染 ----
        const man = await loadGalleryManifest();
        if (revision !== settingsRevision) return;
        const chGrid = settingsPanel.querySelector('.kg-character-grid');
        const desktopChar = syncedCharacter(curSyncChar, state);
        const savedChar = CHAR_LABELS[st.character] || onlineCharacterPacks[st.character]?.frames?.idle ? st.character : 'gemini-star-v1';
        const charName = id => CHAR_LABELS[id]?.name || onlineCharacterPacks[id]?.name || id;
        const savedCharName = charName(savedChar);
        const charDesktopGallery = curSyncChar && isOnline && !showLocalChar;
        const charMode = !curSyncChar ? '独立设置' : !isOnline ? '同步待连接' : !desktopChar ? '桌面形象未安装' : '同步桌面';
        settingsPanel.querySelector('.kg-char-sync-banner').classList.toggle('independent', !curSyncChar);
        settingsPanel.querySelector('.kg-char-sync-text').textContent = `当前显示：${desktopChar ? charName(desktopChar) : savedCharName}`;
        settingsPanel.querySelector('.kg-char-saved').textContent = `网页独立：${savedCharName}`;
        settingsPanel.querySelector('.kg-char-mode').textContent = charMode;
        const charModeButton = settingsPanel.querySelector('.kg-toggle-char-sync');
        charModeButton.textContent = curSyncChar ? '独立设置' : '同步桌面';
        charModeButton.dataset.syncEnabled = String(curSyncChar);
        const charGallerySwitch = settingsPanel.querySelector('.kg-show-local-char');
        charGallerySwitch.hidden = !(curSyncChar && isOnline);
        charGallerySwitch.textContent = showLocalChar ? '桌面图库' : '编辑备用';
        if (chGrid) {
          chGrid.textContent = '';
          const builtIn = man.characters && man.characters.length ? man.characters : [
            { id: 'gemini-star-v1', name: '星语', preview: 'assets/characters/gemini-star-v1/idle.png' },
            { id: 'lin-cat', name: '霓音', preview: 'assets/characters/lin-cat/idle.png' }
          ];
          const chars = [...builtIn, ...Object.entries(onlineCharacterPacks).map(([id, pack]) => ({
            id, name: pack.name, description: pack.description, preview: pack.frames.idle, downloaded: true
          }))];
          chars.filter(c => !charDesktopGallery || !c.downloaded || state.desktop?.characterPackIds?.includes(c.id)).forEach((c) => {
            const meta = CHAR_LABELS[c.id] || { name: c.name, desc: c.description || '在线角色包' };
            const selected = charDesktopGallery ? desktopChar === c.id : savedChar === c.id;
            const isActive = desktopChar ? desktopChar === c.id && charDesktopGallery : selected && !charDesktopGallery;
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'kg-char-card' + (selected ? ' kg-active' : '');
            cell.setAttribute('aria-pressed', String(selected));
            if (selected) {
              const badge = document.createElement('span');
              badge.className = 'kg-active-badge';
              badge.textContent = isActive ? '使用中' : '已保存';
              cell.appendChild(badge);
            }
            const img = document.createElement('img');
            img.src = c.downloaded ? c.preview : api.getURL(c.preview);
            img.alt = '';
            cell.appendChild(img);
            const name = document.createElement('div');
            name.className = 'kg-char-name';
            name.textContent = meta.name;
            cell.appendChild(name);
            const desc = document.createElement('div');
            desc.className = 'kg-char-desc';
            desc.textContent = meta.desc;
            cell.appendChild(desc);

            cell.addEventListener('click', async () => {
              playSound('press');
              if (charDesktopGallery) {
                const result = await pushBridgePatch({ characterPack: c.id });
                reportSettings(result?.state?.desktop?.characterPack === c.id ? '' : '桌面形象未切换，请检查连接后重试。');
              } else {
                return saveLocal({ character: c.id });
              }
              syncSettingsUI();
            });
            chGrid.appendChild(cell);
          });

        }

        // ---- 壁纸 Tab 渲染 ----
        const wallBanner = settingsPanel.querySelector('.kg-wall-sync-banner');
        const wallBannerText = settingsPanel.querySelector('.kg-wall-sync-text');
        const wallToggleBtn = settingsPanel.querySelector('.kg-toggle-wall-sync');
        const desktopWallControls = settingsPanel.querySelector('.kg-desktop-wall-controls');
        const localWallControls = settingsPanel.querySelector('.kg-local-wall-controls');
        const wpGrid = settingsPanel.querySelector('.kg-wallpaper-grid');

        const usingDesktopWall = curSyncWall && isOnline && !!st.agySyncedWallpaper?.dataUrl;
        const wallDesktopGallery = curSyncWall && isOnline && !showLocalWall;
        const customs = st.customWallpapers || [];
        const items = [
          ...(man.wallpapers || []).map(w => ({ id: w.id, title: w.name || w.id, src: api.getURL(w.src), custom: false })),
          ...customs.map((c, idx) => ({ id: c.id, title: c.title || `自定义 #${idx + 1}`, src: c.dataUrl, custom: true }))
        ];
        const localId = st.wallpaperId === 'gemini-sheet' ? 'gemini-character-sheet-v1' : st.wallpaperId;
        const localWall = items.find(item => item.id === localId) || items[0];
        const localTitle = localWall?.title || '默认壁纸';
        const wallMode = !curSyncWall ? '独立设置' : !isOnline ? '同步待连接' : !usingDesktopWall ? '正在读取桌面壁纸' : '同步桌面';
        if (wallBanner && wallBannerText && wallToggleBtn) {
          wallBanner.classList.toggle('independent', !curSyncWall);
          wallBannerText.textContent = `当前显示：${usingDesktopWall ? st.agySyncedWallpaper.title || '桌面壁纸' : localTitle}`;
          settingsPanel.querySelector('.kg-wall-saved').textContent = `网页独立：${localTitle}`;
          settingsPanel.querySelector('.kg-wall-mode').textContent = wallMode;
          wallToggleBtn.textContent = curSyncWall ? '独立设置' : '同步桌面';
          wallToggleBtn.dataset.syncEnabled = String(curSyncWall);
        }
        if (desktopWallControls) desktopWallControls.style.display = wallDesktopGallery ? 'block' : 'none';
        if (localWallControls) localWallControls.hidden = wallDesktopGallery;
        const wallGallerySwitch = settingsPanel.querySelector('.kg-show-local-wall');
        wallGallerySwitch.hidden = !(curSyncWall && isOnline);
        wallGallerySwitch.textContent = showLocalWall ? '桌面图库' : '编辑备用';

        if (wpGrid) {
          wpGrid.textContent = '';
          const makeThumb = (title, selected, badge) => {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = 'kg-thumb' + (selected ? ' kg-active' : '');
            thumb.title = title;
            thumb.setAttribute('aria-pressed', String(selected));
            const img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            const cap = document.createElement('span');
            cap.className = 'kg-thumb-caption';
            cap.textContent = title;
            thumb.append(img, cap);
            if (badge) {
              const mark = document.createElement('span');
              mark.className = 'kg-active-badge';
              mark.textContent = badge;
              thumb.append(mark);
            }
            return { thumb, img };
          };
          if (wallDesktopGallery) {
            // 实时展示桌面端壁纸画廊，点击即可双端同步切换！
            const res = await api.sendMessage({ type: 'KG_GET_DESKTOP_WALLPAPERS' });
            if (revision !== settingsRevision) return;
            const dWalls = (res && res.wallpapers) || [];
            const activeId = usingDesktopWall ? st.agySyncedWallpaper.id : '';
            if (!dWalls.length) {
              const note = document.createElement('span');
              note.className = 'kg-card-hint';
              note.textContent = '桌面图库暂不可用。可以编辑网页独立选择。';
              wpGrid.append(note);
            }
            dWalls.forEach((dw) => {
              const selected = dw.id === activeId;
              const { thumb, img } = makeThumb(dw.title, selected, selected ? '使用中' : '');
              api.sendMessage({ type: 'KG_GET_WALLPAPER_PREVIEW', id: dw.id, revision: dw.revision || '' }).then(preview => {
                if (revision !== settingsRevision || !img.isConnected) return;
                if (preview?.dataUrl) img.src = preview.dataUrl;
                else { img.alt = '预览暂不可用'; thumb.title = dw.title + ' · 预览暂不可用'; }
              });
              thumb.addEventListener('click', async () => {
                playSound('press');
                const result = await pushBridgePatch({ dreamSkin: { wallpaperId: dw.id } });
                reportSettings(result?.state?.desktop?.wallpaperId === dw.id ? '' : '桌面壁纸未切换，请检查连接后重试。');
                syncSettingsUI();
              });
              wpGrid.appendChild(thumb);
            });
          } else {
            items.forEach((item) => {
              const selected = localWall?.id === item.id;
              const { thumb, img } = makeThumb(item.title, selected, selected ? (usingDesktopWall ? '已保存' : '使用中') : '');
              img.src = item.src;
              const slot = document.createElement('div');
              slot.className = 'kg-thumb-slot';
              slot.append(thumb);
              if (item.custom) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'kg-thumb-del';
                del.textContent = '✕';
                del.setAttribute('aria-label', `删除 ${item.title}`);
                del.title = `删除 ${item.title}`;
                del.addEventListener('click', async () => {
                  playSound('press');
                  const current = await api.storageGet(['customWallpapers', 'wallpaperId']);
                  const payload = { customWallpapers: (current.customWallpapers || []).filter(c => c.id !== item.id) };
                  if (current.wallpaperId === item.id) payload.wallpaperId = man.wallpapers?.[0]?.id || '';
                  await saveLocal(payload);
                });
                slot.appendChild(del);
              }
              thumb.addEventListener('click', () => {
                playSound('press');
                void saveLocal({ wallpaperId: item.id });
              });
              wpGrid.appendChild(slot);
            });
          }
        }
      } catch (e) {}
    };

    const changeAppearanceSync = async (key, enabled) => {
      const result = await pushBridgePatch({ [key]: enabled });
      reportSettings(result?.ok ? '' : '未能保存同步设置，请重试。');
      await syncSettingsUI();
    };

    // 面板外部点击与 Esc 收起
    const closePanelFromOutside = (e) => {
      if (!settingsOpen) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.includes(settingsPanel) || path.includes(btnOpenSettings)) return;
      closeSettings();
    };
    document.addEventListener('click', closePanelFromOutside, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsOpen) {
        closeSettings();
        if (bubbleVisible) btnOpenSettings.focus();
      }
    });

    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        playSound('press');
        if (settingsOpen) closeSettings();
        else {
          openSettings();
          if (e.detail === 0) settingsPanel.querySelector('.kg-tab-btn.active')?.focus();
        }
      });
    }
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        playSound('press');
        closeSettings();
      });
    }

    if (settingsPanel) {
      settingsPanel.addEventListener('click', (e) => e.stopPropagation());
      settingsPanel.querySelectorAll('.kg-open-online').forEach(button => {
        button.addEventListener('click', async () => {
          const result = await api.sendMessage({ type: 'KG_OPEN_ONLINE' });
          if (!result?.ok) button.textContent = '暂时无法打开在线图库，点击重试';
        });
      });

      // Tab 切换
      const tabs = [...settingsPanel.querySelectorAll('.kg-tab-btn')];
      const selectTab = tab => {
        playSound('press');
        tabs.forEach(button => {
          const selected = button === tab;
          button.classList.toggle('active', selected);
          button.setAttribute('aria-selected', String(selected));
          button.tabIndex = selected ? 0 : -1;
        });
        settingsPanel.querySelectorAll('.kg-tab-pane').forEach(pane => pane.classList.toggle('active', pane.dataset.pane === tab.dataset.tab));
        settingsPanel.querySelector('.kg-tab-body').scrollTop = 0;
      };
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', event => {
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
          if (target === -1) return;
          event.preventDefault();
          selectTab(tabs[target]);
          tabs[target].focus();
        });
      });

      // 双端显示策略切换
      settingsPanel.querySelectorAll('.kg-seg-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          playSound('press');
          const mode = btn.dataset.mode;
          petDisplayMode = mode;
          await pushBridgePatch({ petDisplayMode: mode });
          syncSettingsUI();
          updateVisibilityAndBridgeUI();
        });
      });

      // 形象/壁纸 Tab 内快捷切换同步/独立按钮
      settingsPanel.querySelector('.kg-show-local-char').onclick = () => {
        showLocalChar = !showLocalChar;
        reportSettings();
        void syncSettingsUI();
      };
      settingsPanel.querySelector('.kg-show-local-wall').onclick = () => {
        showLocalWall = !showLocalWall;
        reportSettings();
        void syncSettingsUI();
      };
      const toggleCharSyncBtn = settingsPanel.querySelector('.kg-toggle-char-sync');
      if (toggleCharSyncBtn) {
        toggleCharSyncBtn.addEventListener('click', async () => {
          playSound('press');
          const enabled = toggleCharSyncBtn.dataset.syncEnabled !== 'true';
          toggleCharSyncBtn.dataset.syncEnabled = String(enabled);
          await changeAppearanceSync('syncCharacter', enabled);
        });
      }
      const toggleWallSyncBtn = settingsPanel.querySelector('.kg-toggle-wall-sync');
      if (toggleWallSyncBtn) {
        toggleWallSyncBtn.addEventListener('click', async () => {
          playSound('press');
          const enabled = toggleWallSyncBtn.dataset.syncEnabled !== 'true';
          toggleWallSyncBtn.dataset.syncEnabled = String(enabled);
          await changeAppearanceSync('syncWallpaper', enabled);
        });
      }
      const nextDesktopWallBtn = settingsPanel.querySelector('.kg-next-desktop-wall');
      if (nextDesktopWallBtn) {
        nextDesktopWallBtn.addEventListener('click', async () => {
          playSound('press');
          nextDesktopWallBtn.textContent = '✨ 正在切换...';
          nextDesktopWallBtn.disabled = true;
          const result = await pushBridgePatch({ action: 'next-wallpaper' });
          reportSettings(result?.online && result?.state?.sync?.syncWallpaper !== false ? '' : '桌面壁纸未切换，请检查同步连接。');
          setTimeout(() => {
            nextDesktopWallBtn.disabled = false;
            nextDesktopWallBtn.textContent = '⏭ 切换下一张桌面壁纸';
            syncSettingsUI();
          }, 280);
        });
      }

      // 常规开关
      const skinSelect = settingsPanel.querySelector('.kg-skin-style');
      const quotaSelect = settingsPanel.querySelector('#kg-quota-style');
      quotaSelect.addEventListener('change', () => void saveLocal({ quotaView: quotaSelect.value }));
      skinSelect.addEventListener('change', () => {
        const style = skinSelect.value;
        void saveLocal(window.KiminoSkinStyle?.patch(style) ?? { skinStyle: style, skinEnabled: style !== 'native' });
      });
      settingsPanel.querySelectorAll('.kg-cfg').forEach((cb) => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          const payload = { [key]: cb.checked };
          if (key === 'syncAgyUsage') void saveLocal(payload);
          else api.storageSet(payload);
          if (key === 'soundEnabled') {
            pushBridgePatch({ sound: cb.checked });
          }
        });
      });

      // 滑条
      const scaleSlider = settingsPanel.querySelector('.kg-range[data-key="widgetScale"]');
      scaleSlider.addEventListener('input', () => {
        void api.storageSet({ widgetScale: Number(scaleSlider.value) });
        kgValScale.textContent = scaleSlider.value + 'px';
      });
      opacitySlider.addEventListener('input', () => {
        kgValOpacity.textContent = opacitySlider.value + '%';
        window.KiminoPreviewWallpaperOpacity?.(Number(opacitySlider.value) / 100);
      });
      opacitySlider.addEventListener('change', async () => {
        const selected = opacitySlider.value;
        const ok = await api.storageSet({ wallpaperOpacity: Number(selected) / 100 });
        if (ok || opacitySlider.value !== selected) return;
        const { wallpaperOpacity = 0.88 } = await api.storageGet(['wallpaperOpacity']);
        if (opacitySlider.value !== selected) return;
        renderOpacity(wallpaperOpacity);
        window.KiminoPreviewWallpaperOpacity?.(wallpaperOpacity);
        reportSettings('未能保存壁纸不透明度，请重试。');
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
          wrapper.dataset.facing = 'right';
          adjustSettingsPlacement();
          resetBtn.textContent = '✓ 已复位至右下角喵～';
          setTimeout(() => { resetBtn.textContent = '📍 复位桌宠至右下角'; }, 1200);
        });
      }

      // Upload updates the saved Web wallpaper without touching sync.
      {
        const btn = settingsPanel.querySelector('.kg-btn-wallpaper');
        const input = settingsPanel.querySelector('.kg-file-wallpaper');
        const origLabel = btn.textContent;
        btn.addEventListener('click', () => { playSound('press'); input.click(); });
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          btn.textContent = '⏳ 处理中...';
          const dataUrl = await wallpaperToDataUrl(file);
          btn.textContent = origLabel;
          input.value = '';
          if (!dataUrl) return;
          const st = await api.storageGet(['customWallpapers']);
          const id = 'custom:' + Date.now();
          await saveLocal({ customWallpapers: [...(st.customWallpapers || []), { id, dataUrl }], wallpaperId: id });
        });
      }
    }

    // ---- 与 Background / AGY Bridge 实时心跳 ----
    let blurHeartbeatTimer = null;
    const sendHeartbeat = () => {
      if (blurHeartbeatTimer !== null && !document.hidden && !document.hasFocus()) return;
      const isFocused = !document.hidden && document.hasFocus();
      api.sendMessage({
        type: 'KG_TAB_HEARTBEAT',
        active: isFocused,
        visible: !document.hidden,
        webQuota: buildWebQuotaPayload(latestTrackerSnapshot)
      });
    };

    const sendFocusHeartbeat = () => {
      if (blurHeartbeatTimer !== null) clearTimeout(blurHeartbeatTimer);
      blurHeartbeatTimer = null;
      if (!document.hidden && !document.hasFocus()) {
        blurHeartbeatTimer = setTimeout(() => { blurHeartbeatTimer = null; sendHeartbeat(); }, 300);
      } else sendHeartbeat();
    };
    window.addEventListener('focus', sendFocusHeartbeat);
    window.addEventListener('blur', sendFocusHeartbeat);
    document.addEventListener('visibilitychange', sendFocusHeartbeat);
    setInterval(sendHeartbeat, 4500);
    setTimeout(sendHeartbeat, 400);

    // 订阅追踪器数据
    if (window.__KIMINO_TRACKER__) {
      window.__KIMINO_TRACKER__.subscribe((data) => {
        const activityChanged = data.activity !== lastActivity;
        const reset = data.quotaReset !== lastQuotaReset ? data.quotaReset : null;
        lastActivity = data.activity;
        lastQuotaReset = data.quotaReset;
        if (trackerStatus !== data.status) { trackerStatus = data.status; resetChatter(); }
        latestTrackerSnapshot = data;
        metaTurns.textContent = `当前会话: 第 ${data.turns} 轮`;
        const totalK = (data.totalTokensEst / 1000).toFixed(1);
        metaTokens.textContent = `预估: ~${totalK}k tokens`;

        const curPct = data.fatiguePercent;
        const sourceTag = wrapper.querySelector('.quota-source-tag');
        if (sourceTag) {
          sourceTag.textContent = data.realQuota.fivePending || data.realQuota.displaySource === 'official' ? '官方限额' : '会话估算';
        }

        curQuotaPct.textContent = data.realQuota.fivePending ? '等待更新' : `已使用 ${curPct}%`;
        curQuotaBar.style.width = `${Math.min(100, curPct)}%`;
        curQuotaBar.style.background = getBarGradient(curPct);
        curQuotaReset.textContent = data.realQuota.fivePending ? '已到重置时间' : data.realQuota.currentResetTime
          ? `重置时间: ${data.realQuota.currentResetTime}`
          : '实时推算中';

        if (data.realQuota.weeklyPending) {
          weekQuotaPct.textContent = '等待更新';
          weekQuotaBar.style.width = '0%';
          weekQuotaReset.textContent = '已到重置时间';
        } else if (typeof data.realQuota.weeklyUsagePercent === 'number') {
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
          weekQuotaReset.textContent = data.realQuota.weeklyResetTime
            ? `重置时间: ${data.realQuota.weeklyResetTime}`
            : '点右上🔄同步拉取账本';
        }

        earGlow.className = 'kimino-ear-glow';
        charBox.classList.remove('rate-limited');

        if (!data.realQuota.fivePending && (data.rateLimited || curPct >= 100)) {
          earGlow.classList.add('glow-rate_limited');
          charBox.classList.add('rate-limited');
          baseFrame = 'sad';
          dialogueCategory = 'crying';
          rateAlert.style.display = 'flex';
          alertClock.textContent = data.resetCountdownText || data.realQuota.currentResetTime || '恢复中...';
          const alertWeek = wrapper.querySelector('.kimino-alert-week');
          if (alertWeek) {
            alertWeek.textContent = data.realQuota.weeklyPending ? '等待更新' : data.realQuota.weeklyResetTime || '周周期推算中...';
          }
          dialogueEl.textContent = "口牙！我就说 Argon 这个电老虎撑不住吧！被你玩爆了喵！(哭)";
        } else if (curPct >= 80) {
          earGlow.classList.add('glow-exhausted');
          baseFrame = 'sad';
          dialogueCategory = 'warning';
          rateAlert.style.display = 'none';
          dialogueEl.textContent = "杂鱼君停手！当前用量已经飙到 80%+ 了，快见底了喵！";
        } else if (curPct >= 60) {
          earGlow.classList.add('glow-warning');
          baseFrame = 'idle';
          dialogueCategory = 'warning';
          rateAlert.style.display = 'none';
        } else if (data.status === 'thinking') {
          earGlow.classList.add('glow-thinking');
          baseFrame = 'idle';
          dialogueCategory = 'thinking';
          rateAlert.style.display = 'none';
        } else {
          earGlow.classList.add('glow-idle');
          baseFrame = 'idle';
          dialogueCategory = 'idle';
          rateAlert.style.display = 'none';
        }
        if (curPct >= 80 || (!data.realQuota.fivePending && data.rateLimited)) clearStatusLine();
        else if (bubbleVisible && !settingsOpen && !document.hidden) {
          if (reset && Date.now() - reset.at < 5000) showStatusLine(reset.cycle === 'five' ? '5 小时额度已进入新周期喵～' : '每周额度已进入新周期喵～', 4500);
          else if (activityChanged && data.activity?.kind === 'generating') showStatusLine('Gemini 正在生成回复喵。');
          else if (activityChanged && data.activity?.kind === 'completed') showStatusLine('Gemini 这一轮回复完成了喵～', 4000);
          else if (activityChanged) clearStatusLine();
        } else if (activityChanged) clearStatusLine();
        renderUsage();
        if (quotaView === 'compact') adjustBubblePlacement();
        syncPet();
        paintFrame();
      });
    }

    api.onChanged((changes, area) => {
      if (area === 'local') {
        if (changes.character) {
          localCharacter = changes.character.newValue || 'gemini-star-v1';
        }
        if (changes.onlineCharacterPacks) {
          onlineCharacterPacks = changes.onlineCharacterPacks.newValue || {};
        }
        if (changes.syncCharacter !== undefined) {
          syncCharacter = changes.syncCharacter.newValue !== false;
        }
        if (changes.petDisplayMode !== undefined) {
          petDisplayMode = changes.petDisplayMode.newValue === 'prefer-desktop' ? 'prefer-desktop' : 'both';
        }
        if (changes.agyBridgeState !== undefined) {
          bridgeState = changes.agyBridgeState.newValue || null;
        }
        if (changes.syncAgyUsage) syncAgyUsage = changes.syncAgyUsage.newValue !== false;
        if (changes.quotaView) quotaView = changes.quotaView.newValue === 'compact' ? 'compact' : 'classic';
        if (changes.character || changes.onlineCharacterPacks || changes.syncCharacter || changes.agyBridgeState) paintFrame();
        if (changes.soundEnabled !== undefined) {
          soundEnabled = !!changes.soundEnabled.newValue;
        }
        if (changes.widgetScale) {
          widgetScale = changes.widgetScale.newValue;
          spriteImg.style.width = `${widgetScale}px`;
        }
        if (changes.ambientChatter) {
          ambientEnabled = changes.ambientChatter.newValue === true;
          chatter?.configure(ambientEnabled);
          if (!ambientEnabled) quietAmbient();
        }
        if (changes.bubbleVisible || changes.enabled || changes.petDisplayMode || isHiddenByDesktopPriority()) quietAmbient();
        if (changes.bubbleVisible !== undefined) {
          bubbleVisible = !!changes.bubbleVisible.newValue;
        }
        if (changes.enabled !== undefined) {
          widgetEnabled = changes.enabled.newValue !== false;
        }
        if (changes.widgetPos && changes.widgetPos.newValue == null) {
          wrapper.style.setProperty('left', 'auto', 'important');
          wrapper.style.setProperty('top', 'auto', 'important');
          wrapper.style.setProperty('right', '32px', 'important');
          wrapper.style.setProperty('bottom', '32px', 'important');
          wrapper.dataset.facing = 'right';
        } else if (changes.widgetPos && !pointer && Number.isFinite(changes.widgetPos.newValue?.x) && Number.isFinite(changes.widgetPos.newValue?.y)) {
          placeWidget(changes.widgetPos.newValue);
        }
        updateVisibilityAndBridgeUI();
        if (settingsOpen && changes.wallpaperOpacity && shadow.activeElement !== opacitySlider) renderOpacity(changes.wallpaperOpacity.newValue);
        if (settingsOpen && (settingsKeys.some(key => key !== 'agyBridgeState' && key !== 'wallpaperOpacity' && changes[key]) ||
            changes.onlineCharacterPacks || (changes.agyBridgeState &&
            appearanceOf(changes.agyBridgeState.oldValue) !== appearanceOf(changes.agyBridgeState.newValue)))) syncSettingsUI();
      }
    });

    updateVisibilityAndBridgeUI();
    const initialPet = wrapper.getBoundingClientRect();
    wrapper.dataset.facing = 'right';
    if (initialPet.width) faceViewport(initialPet.left + initialPet.width / 2, 0);
    else if (Number.isFinite(config.widgetPos?.x)) faceViewport(config.widgetPos.x + widgetScale / 2, 0);
    wrapper.dataset.ready = 'true';
    console.log('[Catstella] 桌宠挂件注入完毕，Stella 已就位🐾');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initWidget().catch((e) => console.error('[Catstella] 桌宠挂件初始化失败:', e));
    });
  } else {
    initWidget().catch((e) => console.error('[Catstella] 桌宠挂件初始化失败:', e));
  }
})();
