// 星语喵伴 · Dream Skin v3 —— 表面标注引擎 (JS 结构标注 + CSS 按标记渲染)
// 架构：不再让 CSS 猜 Google 的类名（A/B 分流导致类名随会话漂移），
// 而是由本引擎按产品级语义锚点（user-query / model-response / rich-textarea /
// bard-sidenav 等，比类名稳定一个数量级）定位表面，向上爬到真正绘制背景的
// 视觉容器后打上 data-kg 标记；skin.css 只认 [data-kg="..."]。
// 任何一处标注失败 → 该表面保持 Google 原生暗色（优雅降级，永远可读）。
(() => {
  if (window.__KIMINO_SKIN_READY__) return;
  window.__KIMINO_SKIN_READY__ = true;

  const api = window.KIMINO_API || {
    available: false,
    getURL: (p) => p,
    storageGet: async () => ({}),
    onChanged: () => {}
  };

  let wallpaperEl = null;
  let baseLayer = null;
  let wallpaperSrc = null; // 自定义壁纸 dataURL 或 null（用默认）

  const getWallpaperUrl = () => wallpaperSrc || api.getURL('assets/wallpapers/gemini-sheet.png');

  const applySkin = (enabled = true, opacity = 0.88) => {
    try {
      if (enabled) {
        // 基底层：全窗基底色（z -100000，位于壁纸之下；body 保持透明不遮挡）
        if (!baseLayer) {
          baseLayer = document.createElement('div');
          baseLayer.id = 'kimino-base-layer';
          baseLayer.setAttribute('aria-hidden', 'true');
          (document.documentElement || document.body).appendChild(baseLayer);
        }
        baseLayer.style.display = 'block';
        if (!wallpaperEl) {
          wallpaperEl = document.createElement('div');
          wallpaperEl.id = 'kimino-dream-wallpaper';
          const imgUrl = getWallpaperUrl();
          // 壁纸层 = 内容区挖空圆角基底（几何由 updatePaneGeometry 实测写入）
          wallpaperEl.style.backgroundImage = `linear-gradient(rgba(20, 15, 35, 0.38), rgba(20, 15, 35, 0.62)), url("${imgUrl}")`;
          (document.documentElement || document.body).appendChild(wallpaperEl);
        } else if (wallpaperEl.__kgSrc !== wallpaperSrc) {
          // 自定义壁纸切换
          wallpaperEl.__kgSrc = wallpaperSrc;
          wallpaperEl.style.backgroundImage = `linear-gradient(rgba(20, 15, 35, 0.38), rgba(20, 15, 35, 0.62)), url("${wallpaperSrc}")`;
        }
        wallpaperEl.style.opacity = opacity.toString();
        wallpaperEl.style.display = 'block';
        document.documentElement.classList.add('kimino-dream-active');
      } else {
        if (wallpaperEl) {
          wallpaperEl.style.display = 'none';
        }
        if (baseLayer) {
          baseLayer.style.display = 'none';
        }
        document.documentElement.classList.remove('kimino-dream-active');
        const gb = document.getElementById('kimino-glass-band');
        if (gb) gb.remove();
        glassBand = null;
      }
    } catch (e) {
      console.warn('[星语喵伴] 皮肤应用异常:', e);
    }
  };

  const loadAndApply = async () => {
    const res = await api.storageGet(['skinEnabled', 'wallpaperOpacity', 'customWallpaper']);
    const isEnabled = res ? res.skinEnabled !== false : true;
    const opacity = res && typeof res.wallpaperOpacity === 'number' ? res.wallpaperOpacity : 0.88;
    wallpaperSrc = (res && res.customWallpaper) || null;
    applySkin(isEnabled, opacity);
  };

  // ============ 表面标注引擎 ============
  const MARKED = new WeakSet();
  let replyWidth = 0; // 回复卡自然宽度（Composer 对齐基准，annotate 时实测）
  const mark = (el, kind) => {
    if (!el || MARKED.has(el)) return;
    try {
      el.setAttribute('data-kg', kind);
      MARKED.add(el);
    } catch (e) {}
  };

  const hasPaint = (el) => {
    try {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    } catch (e) {}
    return false;
  };

  // 从语义锚点向上爬到"真正绘制背景"的视觉容器（A/B 变体免疫的核心）
  const climbToPainted = (el, maxHops = 8) => {
    let cur = el;
    for (let i = 0; i < maxHops && cur && cur !== document.body; i++) {
      if (hasPaint(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  let annotateTimer = null;
  const annotate = () => {
    try {
      // 1) Composer：rich-textarea 语义锚 → 爬到带背景的视觉容器（原生是 input-area-v2，
      //    但 A/B 变体类名可能不同，爬升逻辑不依赖具体类名）
      const rt = document.querySelector('rich-textarea');
      if (rt) {
        mark(climbToPainted(rt) || rt.closest('input-area-v2') || rt, 'composer');
      }

      // 2) 用户气泡：user-query 内第一个带背景的后代（原生是 user-query-bubble-with-background）
      document.querySelectorAll('user-query').forEach((uq) => {
        mark(uq, 'query-root');
        let bubble = uq.querySelector('.user-query-bubble-with-background');
        if (!bubble) {
          for (const el of uq.querySelectorAll('*')) {
            if (hasPaint(el) && el.getBoundingClientRect().height > 16) { bubble = el; break; }
          }
        }
        if (bubble) mark(bubble, 'bubble');
      });

      // 3) 列宽统一：以回复卡自然宽度为基准（Google 原生即统一列宽），
      //    Composer 药丸拉宽到与回复等宽（受限内容列容器宽），居中对齐。
      //    卡片不再强制 max-width（v1.3.3 的"拉宽回复"方向已废弃）。
      //    ⚠️ 先清除卡片上的旧内联 max-width，再测自然宽度（否则量到残留值）
      document.querySelectorAll('model-response').forEach((mr) => {
        mark(mr, 'card');
        try { mr.style.removeProperty('max-width'); } catch (e) {}
      });
      const firstCard = document.querySelector('model-response');
      if (firstCard) replyWidth = firstCard.getBoundingClientRect().width;
      const rtEl = document.querySelector('rich-textarea');
      if (rtEl) {
        const pill = rtEl.closest('input-area-v2') || climbToPainted(rtEl) || rtEl;
        mark(pill, 'composer');
        // 水平精确对齐回复卡：宽度=卡宽，水平偏移=卡左缘-药丸原始左缘
        // （relative 偏移不影响布局流；以 __kgOffsetX 记录当前偏移防漂移累积）
        if (replyWidth > 300) {
          const cardRect = firstCard.getBoundingClientRect();
          const pillRect = pill.getBoundingClientRect();
          const prev = pill.__kgOffsetX || 0;
          const baseLeft = pillRect.left - prev;
          const offsetX = Math.round(cardRect.left - baseLeft);
          pill.__kgOffsetX = offsetX;
          try {
            pill.style.setProperty('position', 'relative', 'important');
            pill.style.setProperty('left', offsetX + 'px', 'important');
            pill.style.setProperty('width', Math.round(cardRect.width) + 'px', 'important');
            pill.style.setProperty('max-width', 'none', 'important');
            pill.style.setProperty('box-sizing', 'border-box', 'important');
          } catch (e) {}
        }
      }
      document.querySelectorAll('details, .thought-container, [data-test-id="thinking-process"]').forEach((d) => mark(d, 'thinking'));

      // 4) /usage 路由配额卡（按内容锚定，不按原子类）
      if (location.pathname === '/usage') {
        document.querySelectorAll('li').forEach((li) => {
          const t = li.textContent || '';
          if (t.includes('重置时间') && (t.includes('当前用量') || t.includes('每周限额'))) mark(li, 'usage-card');
        });
        document.querySelectorAll('section').forEach((sec) => {
          const t = sec.textContent || '';
          if (t.includes('AI Ultra') && t.includes('升级')) mark(sec, 'usage-banner');
        });
      }

      ghostHunt();
      updateGlassBand();
      updatePaneGeometry();
      attachFadeScroller();
      scheduleFade();
    } catch (e) {}
  };

  const schedule = () => {
    if (annotateTimer) return;
    annotateTimer = setTimeout(() => {
      annotateTimer = null;
      annotate();
    }, 700);
  };

  // ============ 左下角幽灵色块侦探 ============
  // 症状：头像旁有谜之黑框，多次修复无效。本侦探扫描左下角区域所有深色小盒，
  // 自动透明化，并把 DOM 路径打印到控制台 —— 一次抓到真身。
  const ghostReported = new WeakSet();
  const ghostHunt = () => {
    try {
      const vh = window.innerHeight;
      document.querySelectorAll('body *').forEach((el) => {
        if (el.id === 'kimino-companion-root' || (el.closest && el.closest('#kimino-companion-root'))) return;
        if (el.id === 'kimino-dream-wallpaper') return;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.width > 220 || r.height < 24 || r.height > 220) return;
        if (r.left > 100 || r.bottom < vh - 150 || r.top > vh) return;
        const m = (cs.backgroundColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return;
        const lum = (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) / 255;
        const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (lum > 0.22 || alpha < 0.5) return;
        mark(el, 'ghost');
        if (!ghostReported.has(el)) {
          ghostReported.add(el);
          const path = [];
          let cur = el;
          for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
            const cls = typeof cur.className === 'string' && cur.className.trim()
              ? '.' + cur.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
            path.push(cur.tagName.toLowerCase() + (cur.id ? '#' + cur.id : '') + cls);
            cur = cur.parentElement;
          }
          console.warn('[星语喵伴] 左下角疑似幽灵色块已透明化 →', path.join(' ← '), cs.backgroundColor, Math.round(r.width) + 'x' + Math.round(r.height));
        }
      });
    } catch (e) {}
  };

  // ============ 挖空圆角内容区 ============
  // 壁纸层只铺"侧栏右侧的内容列"（圆角 22px），侧栏坐在不透明基底色上
  // —— 主要操作区看起来像是在基底上挖出的圆角矩形区域（桌面端 pane 同款）。
  const updatePaneGeometry = () => {
    try {
      if (!wallpaperEl) return;
      const nav = document.querySelector('bard-sidenav');
      const navRight = nav ? nav.getBoundingClientRect().right : 0;
      const left = Math.max(0, Math.round(navRight));
      const width = Math.max(240, window.innerWidth - left);
      wallpaperEl.style.setProperty('left', left + 'px', 'important');
      wallpaperEl.style.setProperty('top', '0px', 'important');
      wallpaperEl.style.setProperty('width', width + 'px', 'important');
      wallpaperEl.style.setProperty('height', window.innerHeight + 'px', 'important');
      wallpaperEl.style.setProperty('right', 'auto', 'important');
      wallpaperEl.style.setProperty('bottom', 'auto', 'important');
      wallpaperEl.style.setProperty('border-radius', '22px', 'important');
      wallpaperEl.style.setProperty('box-shadow', 'inset 0 0 0 1px rgba(174, 142, 218, 0.14)', 'important');
    } catch (e) {}
  };

  // ============ 对话滚动容器定位（渐隐/玻璃带的垂直锚点） ============
  // ⚠️ 内容的真实切线是滚动容器底边，不是 Composer 顶边（两者相差 ~30px，
  // 锚错会导致渐隐完成位置与生硬切线错位——v1.3.4 的"渐变没对齐"根因）
  const getConversationScroller = () => {
    return [...document.querySelectorAll('infinite-scroller')].find(
      (e) => e.scrollHeight > e.clientHeight + 50 && !String(e.className).includes('chat-history')
    ) || null;
  };

  const getCutLineY = (composerTop) => {
    const sc = getConversationScroller();
    const scBottom = sc ? sc.getBoundingClientRect().bottom : composerTop;
    return Math.min(scBottom, composerTop);
  };

  // ============ Liquid Glass 渐变模糊带 ============
  // fixed 覆盖层，跟随 Composer 实测坐标定位（不依赖 Google 容器的 position/z-index），
  // mask 渐变让模糊从 Composer 顶边向上渐进衰减 —— 内容滚入底下时有"已知"的过渡。
  let glassBand = null;
  const updateGlassBand = () => {
    try {
      const active = document.documentElement.classList.contains('kimino-dream-active');
      const rt = document.querySelector('rich-textarea');
      if (!active || !rt) {
        if (glassBand) { glassBand.remove(); glassBand = null; }
        return;
      }
      const pill = rt.closest('input-area-v2') || climbToPainted(rt) || rt;
      const pr = pill.getBoundingClientRect();
      const cutY = getCutLineY(pr.top);
      if (!glassBand) {
        glassBand = document.createElement('div');
        glassBand.id = 'kimino-glass-band';
        glassBand.setAttribute('aria-hidden', 'true');
        (document.body || document.documentElement).appendChild(glassBand);
      }
      // 垂直：覆盖 [切线-100, Composer 顶]（含切线与下方空隙）
      const top = Math.max(0, cutY - 100);
      const height = Math.max(40, pr.top - top);
      // 水平：与回复列精确对齐
      const card = document.querySelector('model-response');
      const colRect = card ? card.getBoundingClientRect() : pr;
      glassBand.style.cssText =
        'position:fixed !important;' +
        'pointer-events:none !important;' +
        'z-index:30 !important;' +
        'left:' + Math.round(colRect.left) + 'px !important;' +
        'width:' + Math.round(colRect.width) + 'px !important;' +
        'top:' + Math.round(top) + 'px !important;' +
        'height:' + Math.round(height) + 'px !important;';
    } catch (e) {}
  };

  // ============ 滚动联动底色渐隐（Liquid Glass 核心观感） ============
  // 卡片/气泡进入 Composer 上方渐变区时，自身底色沿滚动方向渐隐
  // （文字保持清晰，毛玻璃 blur 由 CSS 继续承担）—— 不再靠雾罩硬糊。
  let fadeScroller = null;
  let fadeRaf = 0;
  const FADE_RANGE = 110; // 切线前的渐隐距离 px

  const applyFades = () => {
    try {
      const rt = document.querySelector('rich-textarea');
      if (!rt) return;
      const pill = rt.closest('input-area-v2') || climbToPainted(rt) || rt;
      // ⚠️ 切线 = 滚动容器底边（真实裁剪线），锚到 Composer 顶会错位
      const cutY = getCutLineY(pill.getBoundingClientRect().top);
      const fadeStartY = cutY - FADE_RANGE;
      const surfaces = document.querySelectorAll(
        '[data-kg="card"], [data-kg="bubble"], model-response, .user-query-bubble-with-background'
      );
      surfaces.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height < 8) return;
        const outOfZone = r.bottom <= fadeStartY || r.top >= cutY;
        if (outOfZone) {
          if (el.__kgFaded) {
            el.style.removeProperty('background-color');
            el.style.removeProperty('background-image');
            el.__kgFaded = false;
          }
          return;
        }
        // 区内：底色从 fadeStartY 起线性渐隐，至切线处全透明
        const solidPx = Math.max(0, fadeStartY - r.top);
        const fadeEndPx = Math.min(r.height, Math.max(solidPx + 1, cutY - r.top));
        const grad = 'linear-gradient(to bottom, rgba(33, 30, 45, 0.74) 0px, rgba(33, 30, 45, 0.74) ' +
          solidPx.toFixed(0) + 'px, rgba(33, 30, 45, 0) ' + fadeEndPx.toFixed(0) + 'px)';
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('background-image', grad, 'important');
        el.__kgFaded = true;
      });
    } catch (e) {}
  };

  const scheduleFade = () => {
    if (fadeRaf) return;
    fadeRaf = requestAnimationFrame(() => {
      fadeRaf = 0;
      applyFades();
    });
  };

  const attachFadeScroller = () => {
    try {
      const sc = [...document.querySelectorAll('infinite-scroller')].find(
        (e) => e.scrollHeight > e.clientHeight + 50 && !String(e.className).includes('chat-history')
      );
      if (sc && sc !== fadeScroller) {
        if (fadeScroller) fadeScroller.removeEventListener('scroll', scheduleFade);
        sc.addEventListener('scroll', scheduleFade, { passive: true });
        fadeScroller = sc;
      }
    } catch (e) {}
  };

  // ============ 启动 ============
  (async () => {
    try {
      await loadAndApply();
      api.onChanged((changes, area) => {
        if (area === 'local' && (changes.skinEnabled || changes.wallpaperOpacity || changes.customWallpaper)) {
          loadAndApply();
        }
      });
    } catch (err) {
      console.warn('[星语喵伴] 初始化皮肤配置异常，使用默认参数兜底:', err);
      applySkin(true, 0.88);
    }
    try {
      annotate();
      const mo = new MutationObserver(schedule);
      const start = () => {
        const t = document.body;
        if (t) {
          mo.observe(t, { childList: true, subtree: true, characterData: true });
          schedule();
        } else {
          setTimeout(start, 500);
        }
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
      setInterval(schedule, 15000); // 兜底轮询（无突变的形态变化）
      window.addEventListener('resize', schedule); // 视口变化 → 重测气泡列宽
      window.addEventListener('scroll', scheduleFade, { passive: true, capture: true });
    } catch (e) {}
    console.log('[星语喵伴] Dream Skin v3 表面标注引擎就绪喵～✨');
  })();
})();
