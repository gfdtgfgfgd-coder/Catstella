// 星语喵伴 · Dream Skin v3 —— 表面标注引擎 (JS 结构标注 + CSS 按标记渲染)
// 架构：不再让 CSS 猜 Google 的类名（A/B 分流导致类名随会话漂移），
// 而是由本引擎按产品级语义锚点（user-query / model-response / rich-textarea /
// bard-sidenav 等，比类名稳定一个数量级）定位表面，向上爬到真正绘制背景的
// 视觉容器后打上 data-kg 标记；skin.css 只认 [data-kg="..."]。
// 任何一处标注失败 → 该表面保持 Google 原生暗色（优雅降级，永远可读）。
(() => {
  if (window.__KIMINO_SKIN_READY__) return;
  window.__KIMINO_SKIN_READY__ = true;

  // 切换动画禁窗专用极简样式（LoAF 实测定案）：皮肤全量样式表的复杂选择器
  // 会让 Gemini 逐行动画里每一次强制样式/布局重算从 ~10ms 膨胀到 ~200ms。
  // 禁窗期间换装这份平铺关键样式（视觉连续：壁纸是内联样式不受影响，气泡/
  // 卡片色调、composer、折叠药丸全部保留），动画结束换回全量样式表。
  const KG_CRITICAL_CSS = [
    'html.kimino-dream-active{background-color:#0d091a !important}',
    '#kimino-base-layer{position:fixed !important;inset:0 !important;z-index:-100000 !important;background-color:#0d091a !important;pointer-events:none !important}',
    '#kimino-dream-wallpaper{position:fixed !important;inset:0 !important;z-index:-99999 !important;background-size:cover !important;background-position:center center !important;background-repeat:no-repeat !important;pointer-events:none !important;display:block !important}',
    'html.kimino-dream-active .user-query-bubble-with-background,html.kimino-dream-active [data-kg="bubble"]{background-color:rgba(24,18,36,0.76) !important;background-image:none !important;border:1px solid rgba(174,142,218,0.28) !important;border-radius:22px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
    'html.kimino-dream-active model-response,html.kimino-dream-active [data-kg="card"]{background-color:rgba(24,18,36,0.76) !important;background-image:none !important;border:1px solid rgba(174,142,218,0.16) !important;border-radius:22px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
    'html.kimino-dream-active input-area-v2,html.kimino-dream-active [data-kg="composer"]{background-color:rgba(33,30,45,0.72) !important;border-radius:22px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
    'html.kimino-dream-active :is(model-response, user-query, infinite-scroller) button.luminous-toggle-button{width:28px !important;height:28px !important;min-width:28px !important;max-width:28px !important;padding:0 !important;border-radius:50% !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;background-color:rgba(55,42,78,0.85) !important;background-image:linear-gradient(135deg,rgba(135,105,185,0.40),rgba(45,32,68,0.82)) !important;border:1px solid rgba(200,175,245,0.45) !important;box-shadow:none !important;color:#ede6fc !important}',
    'html.kimino-dream-active :is(model-response, user-query, infinite-scroller) button.luminous-toggle-button :is(mat-icon,.mat-icon,svg,span,i){color:#ede6fc !important;fill:#ede6fc !important}',
    'html.kimino-dream-active .luminous-toggle-container{background-color:transparent !important;background-image:none !important}',
    'html.kimino-dream-active :is(model-response, user-query) :is(button,[role="button"],mat-icon,svg){background-color:transparent !important;background-image:none !important;box-shadow:none !important;color:#ede6fc !important;fill:#ede6fc !important}',
    'html.kimino-dream-active .edit-form.rich-edit-form{background-color:rgba(24,18,36,0.76) !important;border:1px solid rgba(174,142,218,0.28) !important;border-radius:40px !important}',
  ].join('\n');

  const api = window.KIMINO_API || {
    available: false,
    getURL: (p) => p,
    storageGet: async () => ({}),
    onChanged: () => {}
  };

  let wallpaperEl = null;
  let baseLayer = null;
  let wallpaperSrc = null; // 自定义或同步壁纸 dataURL，或 null（用默认）
  let skinCurrentlyEnabled = true;
  let currentSkinOpacity = 0.88;

  const getWallpaperUrl = () => wallpaperSrc || api.getURL('assets/wallpapers/gemini-sheet.png');

  const applySkin = (enabled = true, opacity = 0.88) => {
    skinCurrentlyEnabled = !!enabled;
    currentSkinOpacity = typeof opacity === 'number' ? opacity : 0.88;
    try {
      if (enabled) {
        const mountRoot = document.documentElement || document.body;
        // 基底层：全窗基底色（z -100000，位于壁纸之下；body 保持透明不遮挡）
        if (!baseLayer || !baseLayer.isConnected) {
          baseLayer = document.getElementById('kimino-base-layer') || document.createElement('div');
          baseLayer.id = 'kimino-base-layer';
          baseLayer.setAttribute('aria-hidden', 'true');
          if (!baseLayer.isConnected && mountRoot) mountRoot.appendChild(baseLayer);
        }
        baseLayer.style.display = 'block';

        const imgUrl = getWallpaperUrl();
        if (!wallpaperEl || !wallpaperEl.isConnected) {
          wallpaperEl = document.getElementById('kimino-dream-wallpaper') || document.createElement('div');
          wallpaperEl.id = 'kimino-dream-wallpaper';
          wallpaperEl.style.transition = 'opacity 0.35s ease';
          wallpaperEl.__kgSrc = '';
          if (!wallpaperEl.isConnected && mountRoot) mountRoot.appendChild(wallpaperEl);
        }
        if (wallpaperEl.__kgSrc !== imgUrl) {
          wallpaperEl.__kgSrc = imgUrl;
          wallpaperEl.style.backgroundImage = `linear-gradient(rgba(20, 15, 35, 0.38), rgba(20, 15, 35, 0.62)), url("${imgUrl}")`;
        }
        wallpaperEl.style.opacity = currentSkinOpacity.toString();
        wallpaperEl.style.display = 'block';
        if (!document.documentElement.classList.contains('kimino-dream-active')) {
          document.documentElement.classList.add('kimino-dream-active');
        }
      } else {
        if (wallpaperEl) {
          wallpaperEl.style.display = 'none';
        }
        if (baseLayer) {
          baseLayer.style.display = 'none';
        }
        document.documentElement.classList.remove('kimino-dream-active');
        cleanupFades();
      }
    } catch (e) {
      console.warn('[星语喵伴] 皮肤应用异常:', e);
    }
  };

  // 画廊清单（构建期生成 assets/manifest.json；skin 侧用于解析内置壁纸 id → src）
  let kgManifestPromise = null;
  const loadGalleryManifest = () => {
    if (!kgManifestPromise) {
      kgManifestPromise = fetch(api.getURL('assets/manifest.json'))
        .then((r) => r.json())
        .catch(() => ({ wallpapers: [], characters: [] }));
    }
    return kgManifestPromise;
  };

  const loadAndApply = async () => {
    const res = await api.storageGet([
      'skinEnabled', 'wallpaperOpacity', 'wallpaperId', 'customWallpapers', 'customWallpaper',
      'syncWallpaper', 'agyBridgeState', 'agySyncedWallpaper'
    ]);
    const isEnabled = res ? res.skinEnabled !== false : true;
    const opacity = res && typeof res.wallpaperOpacity === 'number' ? res.wallpaperOpacity : 0.88;

    let src = null;
    // 双端壁纸同步模式：启用同步且存在桌面端同步壁纸时优先应用桌面壁纸（支持轮播自动跟进）
    const wantSync = res ? res.syncWallpaper !== false : true;
    if (wantSync && res?.agySyncedWallpaper?.dataUrl) {
      src = res.agySyncedWallpaper.dataUrl;
    }

    // 独立模式或尚未与桌面端首次握手：解析 Web 本地画廊壁纸
    if (!src) {
      const wid = (res && res.wallpaperId) || '';
      if (wid.startsWith('custom:')) {
        const c = ((res && res.customWallpapers) || []).find((x) => x.id === wid);
        if (c) src = c.dataUrl;
      } else if (wid) {
        try {
          const man = await loadGalleryManifest();
          const w = (man.wallpapers || []).find((x) => x.id === wid);
          if (w) src = api.getURL(w.src);
        } catch (e) {}
      }
      if (!src && res && res.customWallpaper) src = res.customWallpaper; // 旧版单图迁移兜底
    }

    wallpaperSrc = src; // null → getWallpaperUrl 回落默认
    applySkin(isEnabled, opacity);
    updatePaneGeometry();
  };

  // ============ 表面标注引擎 ============
  const MARKED = new WeakSet();
  let replyWidth = 0; // 回复卡自然宽度（Composer 对齐基准，annotate 时实测）
  const mark = (el, kind) => {
    if (!el || (MARKED.has(el) && el.getAttribute('data-kg') === kind)) return;
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

  // 用户气泡玻璃统一绘制（annotate 与重建快路径共用同一份视觉）
  const paintBubbleGlass = (bubble, radius) => {
    if (!bubble) return;
    try {
      mark(bubble, 'bubble');
      bubble.style.removeProperty('background');
      bubble.style.setProperty('background-color', 'rgba(24, 18, 36, 0.76)', 'important');
      bubble.style.setProperty('backdrop-filter', 'blur(25px) saturate(140%)', 'important');
      bubble.style.setProperty('-webkit-backdrop-filter', 'blur(25px) saturate(140%)', 'important');
      bubble.style.setProperty('border', '1px solid rgba(174, 142, 218, 0.28)', 'important');
      bubble.style.setProperty('border-radius', radius || '22px', 'important');
    } catch (e) {}
  };

  // Composer 锚点统一入口（实机 2026-11-05 恶性 bug 根治）：
  // 消息编辑态会在对话中部创建 rich-textarea.edit-rich-textarea（DOM 序先于 composer），
  // 全局 querySelector('rich-textarea') 被劫持 → 渐隐引擎把切线锚到屏幕中央的编辑框，
  // 编辑框以下全部卡片命中"完全没入切线下方"分支 → 整卡全透明 mask = 消息刷没。
  // 一律走这里：优先 composer 区域，其次按编辑态专有类名排除。
  const queryComposerTextarea = () =>
    document.querySelector('input-area-v2 rich-textarea') ||
    document.querySelector('rich-textarea:not(.edit-rich-textarea)') ||
    document.querySelector('rich-textarea');

  let annotateTimer = null;
  const annotate = () => {
    try {
      // 1) Composer：rich-textarea 语义锚 → 爬到带背景的视觉容器（原生是 input-area-v2，
      //    但 A/B 变体类名可能不同，爬升逻辑不依赖具体类名）
      const rt = queryComposerTextarea();
      if (rt) {
        mark(climbToPainted(rt) || rt.closest('input-area-v2') || rt, 'composer');
      }

      // 2) 用户气泡：严格仅标注唯一的实际气泡实体，彻底清空外层祖先套娃框
      document.querySelectorAll('user-query').forEach((uq) => {
        mark(uq, 'query-root');
        // 彻底清空所有上层容器的背景与边框，杜绝双层套娃
        uq.querySelectorAll('.user-query-container, user-query-content, .user-query-content, .user-query-bubble-container').forEach((p) => {
          if (p.hasAttribute('data-kg')) p.removeAttribute('data-kg');
          p.style.setProperty('background', 'transparent', 'important');
          p.style.setProperty('border', 'none', 'important');
          p.style.setProperty('box-shadow', 'none', 'important');
          p.style.setProperty('backdrop-filter', 'none', 'important');
          p.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        });

        // 仅抓取真正的单一气泡节点（原生是 user-query-bubble-with-background）
        // 编辑态特判（实机 2026-11-05 勘察）：兜底扫描会把 .edit-form 内的
        // rich-textarea 误标为气泡 → 外层 edit-form 描边 + 内层玻璃 = 双框漏底。
        // 编辑态改为整体标注 .edit-form（保持原生 40px 圆角），并清掉内层内联玻璃。
        const editForm = uq.querySelector('.edit-form.rich-edit-form');
        let bubble = null;
        if (editForm) {
          uq.querySelectorAll('.edit-form rich-textarea, .edit-form .ql-editor, .edit-form .ql-container').forEach((el) => {
            if (el.hasAttribute('data-kg')) el.removeAttribute('data-kg');
            el.style.removeProperty('background');
            el.style.removeProperty('background-color');
            el.style.removeProperty('backdrop-filter');
            el.style.removeProperty('-webkit-backdrop-filter');
            el.style.removeProperty('border');
            el.style.removeProperty('border-radius');
            el.style.removeProperty('box-shadow');
          });
          bubble = editForm;
        } else {
          bubble = uq.querySelector('.user-query-bubble-with-background');
        }
        if (!bubble) {
          for (const el of uq.querySelectorAll('*')) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'user-query-content' || el.classList.contains('user-query-container') || el.classList.contains('user-query-bubble-container')) continue;
            if (el.closest('.edit-form.rich-edit-form')) continue; // 编辑态内层绝不兜底标注
            if (hasPaint(el) && el.getBoundingClientRect().height > 16) { bubble = el; break; }
          }
        }
        if (bubble) {
          paintBubbleGlass(bubble, editForm ? '40px' : '22px');
        }
      });

      // 3) 列宽统一（v1.3.6 语义）：
      //    - Composer 恢复 Google 原生宽度（v1.3.4 的拉宽被用户否决，清除全部内联残留）
      //    - 回复卡收窄到"原生对话列"宽度（以 user-query 容器实测为准），居中，
      //      让界面观感 = 换了风格的原生 Gemini
      let columnWidth = 720;
      const uqEl = document.querySelector('user-query');
      if (uqEl) {
        const w = uqEl.getBoundingClientRect().width;
        if (w >= 480 && w <= 880) columnWidth = Math.round(w);
      } else {
        const rtEl0 = queryComposerTextarea();
        const pill0 = rtEl0 && rtEl0.closest('input-area-v2');
        if (pill0) {
          const w = pill0.getBoundingClientRect().width + 48;
          if (w >= 520 && w <= 880) columnWidth = Math.round(w);
        }
      }
      document.querySelectorAll('model-response').forEach((mr) => {
        mark(mr, 'card');
        mr.querySelectorAll('response-container, .response-container, message-content, .message-content, structured-content, .structured-content, .response-container-content').forEach((child) => {
          child.style.setProperty('background', 'transparent', 'important');
          child.style.setProperty('background-color', 'transparent', 'important');
          child.style.setProperty('border', 'none', 'important');
          child.style.setProperty('box-shadow', 'none', 'important');
          child.style.setProperty('backdrop-filter', 'none', 'important');
          child.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        });
        // ⚠️ 防跳滚：宽度值不变时跳过写入（滚动锚定被 Google 禁用，
        // 任何布局写入都会造成滚动位置跳动）；残留值清理与写入同循环完成
        if (mr.__kgLastMaxW !== columnWidth) {
          mr.__kgLastMaxW = columnWidth;
          try { mr.style.setProperty('max-width', columnWidth + 'px', 'important'); } catch (e) {}
        }
      });

      // 清理 response-footer 确保其永远透明、无胶囊装饰（坚决消除蜜汁腰圆形）
      document.querySelectorAll('model-response :is(response-footer, .response-footer, [class*="response-footer"])').forEach((rf) => {
        rf.removeAttribute('data-kg');
        rf.style.setProperty('background', 'transparent', 'important');
        rf.style.setProperty('background-color', 'transparent', 'important');
        rf.style.setProperty('border', 'none', 'important');
        rf.style.setProperty('box-shadow', 'none', 'important');
        rf.style.setProperty('padding', '0', 'important');
        rf.style.setProperty('margin', '0', 'important');
      });

      // Composer：清除 v1.3.4 的拉宽/偏移残留，回归原生宽度
      const rtEl = queryComposerTextarea();
      if (rtEl) {
        const pill = rtEl.closest('input-area-v2') || climbToPainted(rtEl) || rtEl;
        mark(pill, 'composer');
        try {
          pill.style.removeProperty('width');
          pill.style.removeProperty('left');
          pill.style.removeProperty('position');
          pill.style.removeProperty('max-width');
          pill.style.removeProperty('box-sizing');
          pill.style.removeProperty('margin-left');
          pill.style.removeProperty('margin-right');
          delete pill.__kgOffsetX;
        } catch (e) {}
      }
      // 3.5) 思维链折叠卡：单层水晶胶囊，坚决杜绝内嵌多层三明治
      const candidateThoughts = [];
      document.querySelectorAll('details, .thought-container, .thought-box, [data-test-id*="thought" i], [data-test-id*="thinking" i], [class*="thought" i], [class*="thinking" i]').forEach((d) => {
        if (!d.closest('model-response')) return;
        // 门禁：严禁将 response-footer / has-thoughts 操作栏误判为思维链
        if (d.tagName?.toLowerCase() === 'response-footer' ||
            d.classList.contains('response-footer') ||
            d.closest('response-footer, .response-footer') ||
            d.classList.contains('has-thoughts') ||
            d.classList.contains('has-thought') ||
            d.classList.contains('gap')) return;
        if (d.classList.contains('thought-content') || d.classList.contains('thought-body') || d.classList.contains('thought-text') || d.classList.contains('markdown')) return;
        candidateThoughts.push(d);
      });

      // 仅保留最外层思维链根节点，子节点一律剥离标记与内层胶囊样式（彻底根治三明治嵌套）
      candidateThoughts.forEach((node) => {
        const isChildOfAnother = candidateThoughts.some((other) => other !== node && other.contains(node));
        if (isChildOfAnother) {
          node.removeAttribute('data-kg');
          node.style.setProperty('background', 'transparent', 'important');
          node.style.setProperty('background-color', 'transparent', 'important');
          node.style.setProperty('border', 'none', 'important');
          node.style.setProperty('box-shadow', 'none', 'important');
          node.style.setProperty('backdrop-filter', 'none', 'important');
          node.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        } else {
          mark(node, 'thinking');
        }
      });

      // 3.6) 框选引用卡片与右上角关闭 X 按钮：常态常驻高亮显示，杜绝隐藏与仅 hover 出现
      const composerEl = document.querySelector('input-area-v2') || document.querySelector('[data-kg="composer"]') || document.querySelector('.input-area-container');
      if (composerEl) {
        composerEl.querySelectorAll('button, [role="button"], [class*="close" i], [class*="dismiss" i], [class*="remove" i], mat-icon, svg').forEach((el) => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const cls = (el.className || '').toString().toLowerCase();
          const tid = (el.getAttribute('data-test-id') || '').toLowerCase();
          const txt = (el.textContent || '').trim().toLowerCase();
          const isCloseBtn = aria.includes('close') || aria.includes('关闭') || aria.includes('remove') || aria.includes('dismiss') || aria.includes('clear') || aria.includes('删除') || aria.includes('取消') || aria.includes('移除') ||
                             cls.includes('close') || cls.includes('dismiss') || cls.includes('remove') || cls.includes('clear') ||
                             tid.includes('close') || tid.includes('dismiss') || tid.includes('remove') ||
                             txt === 'close' || txt === 'clear' || txt === '×' || txt === '✕' || txt === 'x';
          if (isCloseBtn) {
            el.style.setProperty('opacity', '0.92', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('color', '#ede6fc', 'important');
            el.style.setProperty('fill', '#ede6fc', 'important');
            el.querySelectorAll('mat-icon, svg, path, span').forEach((child) => {
              child.style.setProperty('opacity', '1', 'important');
              child.style.setProperty('visibility', 'visible', 'important');
              child.style.setProperty('color', '#ede6fc', 'important');
              child.style.setProperty('fill', '#ede6fc', 'important');
            });
          }
        });
      }

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
      restyleExpandButtonsAndStripMasks();
      cleanupFades();
      updatePaneGeometry();
      applyFades();
    } catch (e) {}
  };

  // ============ 切换动画禁窗（2026-11-05 延迟根治） ============
  // 实机 rAF 采样两轮定位：
  // ① annotate+restyle 全量扫描砸在逐行重建动画中间（272ms 阻塞帧）→ 禁窗推迟重活；
  // ② 原生对照（128 帧/最差 69ms）vs 皮肤（77 帧/最差 215ms）→ 大头是 backdrop-filter
  //    在高度动画期间每帧重光栅化。禁窗同时摘除动画元素的 blur（色调保留，动画结束恢复）。
  let animGateUntil = 0;
  let animGateTimer = null;
  let criticalStyleEl = null;
  let skinSheetsCache = null;
  // 找出皮肤样式表（扩展 manifest 注入的 author sheet 与 IAB 注入的 <style> 两种载体都要覆盖）
  // 结果缓存（点击热路径不能每次全量扫描 document.styleSheets）
  const findSkinSheets = () => {
    if (skinSheetsCache) return skinSheetsCache;
    const found = [];
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules;
        if (!rules || !rules.length) continue;
        for (let i = 0; i < Math.min(rules.length, 6); i++) {
          if (rules[i].cssText && rules[i].cssText.includes('kimino-dream-active')) { found.push(sheet); break; }
        }
      } catch (e) { /* 跨域样式表不可读，跳过 */ }
    }
    skinSheetsCache = found;
    return found;
  };
  const enterAnimGate = () => {
    animGateUntil = performance.now() + 600;
    document.documentElement.classList.add('kg-anim');
    if (!criticalStyleEl) {
      criticalStyleEl = document.createElement('style');
      criticalStyleEl.id = 'kimino-skin-css-critical';
      criticalStyleEl.textContent = KG_CRITICAL_CSS;
      document.documentElement.appendChild(criticalStyleEl);
    }
    // 换装：禁用全量皮肤表（选择器重算是卡顿根因），启用平铺关键表
    for (const sheet of findSkinSheets()) {
      try { sheet.disabled = true; } catch (e) {}
    }
    criticalStyleEl.disabled = false;
    if (animGateTimer) clearTimeout(animGateTimer);
    animGateTimer = setTimeout(() => {
      document.documentElement.classList.remove('kg-anim');
      for (const sheet of findSkinSheets()) {
        try { sheet.disabled = false; } catch (e) {}
      }
      if (criticalStyleEl) criticalStyleEl.disabled = true;
      animGateTimer = null;
      schedule();
    }, 650);
  };

  const schedule = () => {
    if (annotateTimer) return;
    const gateWait = Math.max(0, animGateUntil - performance.now());
    annotateTimer = setTimeout(() => {
      annotateTimer = null;
      // 禁窗仍在（连续切换时旧定时器会落入下一次动画窗口）：改期，不跑重活
      const wait = animGateUntil - performance.now();
      if (wait > 0) {
        schedule();
        return;
      }
      annotate();
      applyFades();
    }, 60 + gateWait);
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

  // ============ 展开/收起按钮水晶重绘（严格保护侧边栏 + 防死循环守卫） ============
  const PROCESSED_BTNS = new WeakSet();
  const restyleExpandButtonsAndStripMasks = () => {
    try {
      // 门禁 0：清洗左侧栏可能被误染的任何展开标记与内联样式
      document.querySelectorAll('bard-sidenav [data-kg-expand-btn], [data-test-id="side-nav"] [data-kg-expand-btn]').forEach((el) => {
        el.removeAttribute('data-kg-expand-btn');
        el.removeAttribute('data-kg-icon-only');
        el.style.removeProperty('border-radius');
        el.style.removeProperty('background');
        el.style.removeProperty('background-color');
        el.style.removeProperty('background-image');
        el.style.removeProperty('box-shadow');
      });

      // 1. 仅扫描主对话区域（排除 bard-sidenav 侧边栏！）
      const mainArea = document.querySelector('infinite-scroller.chat-history') || document.querySelector('main') || document.body;
      if (!mainArea) return;

      const candidates = mainArea.querySelectorAll('button, [role="button"], mat-icon, gem-button, [class*="expand"], [class*="collapse"], [class*="show-more"], [class*="read-more"], [class*="see-more"]');
      candidates.forEach((el) => {
        // 门禁 1：严格排除左侧栏（绝对不碰笔记本/历史列表/底部全部）
        if (el.closest('bard-sidenav') || el.closest('[data-test-id="side-nav"]')) return;

        let target = el;
        if (el.tagName && el.tagName.toLowerCase() === 'mat-icon') {
          target = el.closest('button') || el.closest('[role="button"]') || el;
        }
        if (target.closest('bard-sidenav')) return;
        if (PROCESSED_BTNS.has(target)) return; // 已经处理过，绝不重复触发 Mutation

        const text = (target.textContent || '').trim();
        const aria = target.getAttribute('aria-label') || '';
        const icon = (target.querySelector('mat-icon')?.textContent || '') + (target.querySelector('svg')?.innerHTML || '');

        const isExpand = text.includes('展开') || text.includes('收起') ||
          /show more|read more|expand|collapse/i.test(text) ||
          /展开|收起|expand|collapse/i.test(aria) ||
          /expand_more|keyboard_arrow_down|expand_less|keyboard_arrow_up|arrow_drop_down/i.test(icon) ||
          /expand_more|keyboard_arrow_down|expand_less|keyboard_arrow_up/i.test(text);

        if (isExpand) {
          PROCESSED_BTNS.add(target);
          target.setAttribute('data-kg-expand-btn', 'true');
          target.style.removeProperty('background');
          target.style.removeProperty('background-color');
          target.style.removeProperty('background-image');
          target.style.removeProperty('box-shadow');
          const isIconOnly = (!text || text.length <= 1 || text === icon || target.querySelector('svg') || target.querySelector('mat-icon')) && text.length <= 2;
          if (isIconOnly) {
            target.setAttribute('data-kg-icon-only', 'true');
          }

          // 核心安全：只清空专职渐变遮罩层，绝不误碰任何气泡卡片正文！
          let p = target.parentElement;
          for (let i = 0; i < 3 && p && p !== mainArea; i++) {
            const tag = (p.tagName || '').toLowerCase();
            // 铁门：气泡或卡片本体绝对不剥离底色
            if (tag === 'model-response' || tag === 'user-query' ||
                p.classList.contains('user-query-bubble-with-background') ||
                p.classList.contains('user-query-container') ||
                (p.hasAttribute('data-kg') && p.getAttribute('data-kg') !== 'expand-btn')) {
              break;
            }
            const cs = getComputedStyle(p);
            const isMask = (cs.backgroundImage && cs.backgroundImage.includes('gradient')) ||
                           /fade|gradient|mask|overlay|scrim/i.test(p.className || '');
            if (isMask) {
              p.style.setProperty('background', 'transparent', 'important');
              p.style.setProperty('background-image', 'none', 'important');
              p.style.setProperty('box-shadow', 'none', 'important');
            }
            p = p.parentElement;
          }
        }
      });

      // 2. 彻底清除回复卡片与用户气泡内的一切原生遮罩渐变条（包括包裹箭头的渐变框）
      document.querySelectorAll('model-response, user-query').forEach((scope) => {
        scope.querySelectorAll('div, span').forEach((child) => {
          if (child.classList.contains('user-query-bubble-with-background') ||
              (child.hasAttribute('data-kg') && child.getAttribute('data-kg') !== 'expand-btn')) return;
          try {
            const cs = getComputedStyle(child);
            if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
              child.style.setProperty('background-image', 'none', 'important');
              child.style.setProperty('background', 'transparent', 'important');
              child.style.setProperty('box-shadow', 'none', 'important');
            }
          } catch (e) {}
        });
      });
    } catch (e) {}
  };

  // ============ 重建即标注快路径（2026-11-05 闪烁根治） ============
  // 实机 rAF 采样铁证：luminous 长提问切换收起/展开时，Gemini 会销毁并重建
  // 气泡与按钮节点，重建新节点要等下一轮 annotate（~130ms）才被标注，
  // 期间按钮裸奔原生样式、气泡玻璃丢失。CSS 类名直配已兜底视觉，
  // 此处对新插入节点同帧补标注与内联玻璃，双保险。
  const fastTagRecreatedNodes = (addedNodes) => {
    try {
      let root = null;
      for (const n of addedNodes) {
        if (!n || n.nodeType !== 1) continue;
        if (n.matches?.('.conversation-container, .user-query-bubble-with-background, .luminous-toggle-container, .query-text') ||
            n.querySelector?.('.user-query-bubble-with-background, .luminous-toggle-button')) {
          root = n;
          break;
        }
      }
      if (!root) return;
      const turn = root.closest?.('.conversation-container') || root.querySelector?.('.conversation-container');
      if (!turn) return;
      // 1) 气泡：重建后立即补标注与玻璃（CSS 类规则兜底 + 内联双保险）
      const bubble = turn.querySelector('.user-query-bubble-with-background');
      if (bubble && !bubble.hasAttribute('data-kg')) paintBubbleGlass(bubble);
      // 2) 折叠/展开按钮：重建后立即标注（补 icon-only 语义与内联残留清理）
      turn.querySelectorAll('.luminous-toggle-button:not([data-kg-expand-btn])').forEach((b) => {
        if (b.closest('bard-sidenav') || b.closest('[data-test-id="side-nav"]')) return;
        b.setAttribute('data-kg-expand-btn', 'true');
        b.setAttribute('data-kg-icon-only', 'true');
        ['background', 'background-color', 'background-image', 'box-shadow'].forEach((p) => b.style.removeProperty(p));
      });
    } catch (e) {}
  };

  // ============ 滚动与静态联动渐隐（Liquid Glass 动态溶解引擎 v5） ============
  // 卡片/气泡进入 Composer 上方渐变区时，单卡自身平滑溶解渐隐
  // （文字与底色自然消融，不依赖祖先全局 mask，彻底规避 Firefox 滚动容器高度错位与毛玻璃失效）
  let fadePending = false;

  const applyFades = () => {
    try {
      if (!document.documentElement.classList.contains('kimino-dream-active')) return;
      const rt = queryComposerTextarea();
      if (!rt) return;
      const pill = rt.closest('input-area-v2') || climbToPainted(rt) || rt;
      const compRect = pill.getBoundingClientRect();
      if (!compRect || compRect.height === 0) return;

      // 若上方有常驻限额提示条/横幅，切线锚到提示条顶部
      const banner = document.querySelector('.inline-upgrade-banner-row, .gem-banner-container, [data-test-id="gem-banner-description-input"]');
      const baseEl = (banner && banner.getBoundingClientRect().top < compRect.top && banner.getBoundingClientRect().top > 50) ? banner : pill;
      const baseTop = baseEl.getBoundingClientRect().top;

      // a & b 核心几何：
      // b. 默认静止停靠时绝不触发渐变：fadeStartY 设在 baseTop - 8px。
      //    因为 Gemini 原生最后一条回复底部停在 baseTop 上方 16px~30px，
      //    静止状态下 r.bottom <= fadeStartY 恒成立，100% 保持原生清晰无渐隐！
      //    仅当用户往下拉（回复下沿移过 baseTop - 8px）时，才开始平滑进入渐隐区。
      const fadeStartY = Math.round(baseTop - 8);
      // 切线终点：落在输入框药丸下沿或纵深 56px 处，彻底消融
      const cutY = Math.round(Math.min(baseTop + 56, compRect.bottom));
      const span = Math.max(24, cutY - fadeStartY);

      const surfaces = document.querySelectorAll(
        '[data-kg="card"], model-response, [data-kg="bubble"], .user-query-bubble-with-background'
      );
      if (!surfaces.length) return;

      // Phase 1: 批量度量（纯只读，分离读写彻底消除 Layout Thrashing）
      const updates = [];
      for (let i = 0; i < surfaces.length; i++) {
        const el = surfaces[i];
        const r = el.getBoundingClientRect();
        if (r.height < 8) continue;

        // b. 未向下滚动到达渐变线时，100% 清空 mask 恢复纯净实体
        if (r.bottom <= fadeStartY) {
          if (el.__kgFaded) {
            updates.push({ el, reset: true });
          }
          continue;
        }

        // 若卡片已完全没入切线下方（被输入框彻底覆盖），保持完全透明，杜绝从底部穿透
        if (r.top >= cutY) {
          const maskVal = 'linear-gradient(to bottom, transparent, transparent)';
          const sig = 'full-transparent';
          if (el.__kgLastGrad !== sig) {
            updates.push({ el, reset: false, maskVal, sig });
          }
          continue;
        }

        // a. 渐隐效果固定，不随着回复滚动而动：
        // 关键：绝对不把 fadeEndPx 截断到 r.height！
        // 让 solidPx 与 fadeEndPx 严格保持相对视口固定线 [fadeStartY, cutY] 与 r.top 的几何差，
        // 这样在屏幕物理坐标系中，渐变每一阶的 Y 坐标恒定不动，回复滑动如同穿透固定的光学视窗。
        const solidPx = fadeStartY - r.top;
        const fadeEndPx = cutY - r.top;

        // 6 阶自然物理平滑 S 曲线，每一阶在屏幕上的物理坐标恒定固定
        const s0 = Math.max(0, solidPx).toFixed(1);
        const s1 = Math.max(0, solidPx + span * 0.18).toFixed(1);
        const s2 = Math.max(0, solidPx + span * 0.38).toFixed(1);
        const s3 = Math.max(0, solidPx + span * 0.60).toFixed(1);
        const s4 = Math.max(0, solidPx + span * 0.80).toFixed(1);
        const s5 = Math.max(0, solidPx + span * 0.94).toFixed(1);
        const sEnd = Math.max(0, fadeEndPx).toFixed(1);

        const maskVal = `linear-gradient(to bottom, ` +
          `black 0px, black ${s0}px, ` +
          `rgba(0, 0, 0, 0.95) ${s1}px, ` +
          `rgba(0, 0, 0, 0.80) ${s2}px, ` +
          `rgba(0, 0, 0, 0.52) ${s3}px, ` +
          `rgba(0, 0, 0, 0.24) ${s4}px, ` +
          `rgba(0, 0, 0, 0.06) ${s5}px, ` +
          `transparent ${sEnd}px)`;

        const qSolid = Math.round(solidPx / 2) * 2;
        const qEnd = Math.round(fadeEndPx / 2) * 2;
        const sig = `${qSolid}_${qEnd}_v5`;
        if (el.__kgLastGrad === sig) continue;

        updates.push({ el, reset: false, maskVal, sig });
      }

      // Phase 2: 批量写入样式（集中 Mutation，零多余重排）
      for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        if (u.reset) {
          u.el.style.removeProperty('-webkit-mask-image');
          u.el.style.removeProperty('mask-image');
          u.el.__kgFaded = false;
          u.el.__kgLastGrad = '';
        } else {
          u.el.__kgLastGrad = u.sig;
          u.el.style.setProperty('-webkit-mask-image', u.maskVal, 'important');
          u.el.style.setProperty('mask-image', u.maskVal, 'important');
          u.el.__kgFaded = true;
        }
      }
    } catch (e) {}
  };

  const scheduleFade = () => {
    if (fadePending) return;
    fadePending = true;
    const run = () => {
      fadePending = false;
      // 切换动画禁窗：几何正在逐帧变动，此刻逐面读 getBoundingClientRect
      // 会与 Angular 的写入互踩造成布局抖动（LoAF 实测单帧强制样式布局
      // 201-207ms）。禁窗内跳过，动画结束后的 schedule() 会做一次干净重算。
      if (performance.now() < animGateUntil) return;
      applyFades();
    };
    if (typeof requestAnimationFrame === 'function' && !document.hidden) {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  };

  // ============ 滚动监听多目标绑定（即时响应滚轮、触控板与容器滚动） ============
  const bindScrollListeners = () => {
    try {
      window.addEventListener('scroll', scheduleFade, { passive: true, capture: true });
      document.addEventListener('scroll', scheduleFade, { passive: true, capture: true });
      window.addEventListener('wheel', scheduleFade, { passive: true });
      window.addEventListener('touchmove', scheduleFade, { passive: true });
      const scroller = document.querySelector('infinite-scroller.chat-history') || document.querySelector('infinite-scroller');
      if (scroller && !scroller.__kgBound) {
        scroller.__kgBound = true;
        scroller.addEventListener('scroll', scheduleFade, { passive: true });
      }
    } catch (e) {}
  };

  // ============ 清除残留的内联样式，确保卡片恒定享受 CSS 磨砂质感 ============
  const cleanupFades = () => {
    try {
      const gb = document.getElementById('kimino-glass-band');
      if (gb) gb.remove();
      document.querySelectorAll('[data-kg="card"], model-response, [data-kg="bubble"], .user-query-bubble-with-background').forEach((el) => {
        if (el.style.backgroundColor === 'transparent' && !el.__kgFaded) {
          el.style.removeProperty('background-color');
          el.style.removeProperty('background-image');
          el.style.removeProperty('background');
        }
      });
    } catch (e) {}
  };

  // ============ 启动 ============
  (async () => {
    try {
      await loadAndApply();
      api.onChanged((changes, area) => {
        if (area === 'local' && (
          changes.skinEnabled || changes.wallpaperOpacity || changes.customWallpaper ||
          changes.wallpaperId || changes.customWallpapers || changes.syncWallpaper ||
          changes.agySyncedWallpaper
        )) {
          loadAndApply();
        }
      });
    } catch (err) {
      console.warn('[星语喵伴] 初始化皮肤配置异常，使用默认参数兜底:', err);
      applySkin(true, 0.88);
    }
    try {
      annotate();
      applyFades();
      bindScrollListeners();
      findSkinSheets(); // 预热样式表缓存：首次切换点击热路径不能背全量扫描的开销

      // 自愈守护：防止窗口失焦、切换标签页或 SPA 重置 html.class 时主题/壁纸脱落
      const ensureSkinAlive = () => {
        if (skinCurrentlyEnabled) {
          if (
            !document.documentElement.classList.contains('kimino-dream-active') ||
            !baseLayer || !baseLayer.isConnected ||
            !wallpaperEl || !wallpaperEl.isConnected
          ) {
            applySkin(skinCurrentlyEnabled, currentSkinOpacity);
            updatePaneGeometry();
          }
        }
        schedule();
        scheduleFade();
      };
      const htmlAttrMo = new MutationObserver(() => {
        if (skinCurrentlyEnabled && !document.documentElement.classList.contains('kimino-dream-active')) {
          applySkin(skinCurrentlyEnabled, currentSkinOpacity);
        }
      });
      if (document.documentElement) {
        htmlAttrMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      window.addEventListener('focus', ensureSkinAlive);
      window.addEventListener('blur', ensureSkinAlive);
      document.addEventListener('visibilitychange', ensureSkinAlive);
      // 收起/展开切换 → 进入动画禁窗（捕获阶段，键盘 Enter 触发的 click 同样命中）
      document.addEventListener('click', (ev) => {
        const b = ev.target && ev.target.closest && ev.target.closest('.luminous-toggle-button, [data-kg-expand-btn="true"]');
        if (b && !b.closest('bard-sidenav') && !b.closest('[data-test-id="side-nav"]')) enterAnimGate();
      }, { capture: true, passive: true });

      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes && m.addedNodes.length) fastTagRecreatedNodes(m.addedNodes);
        }
        bindScrollListeners();
        schedule();
      });
      const start = () => {
        const t = document.body;
        if (t) {
          mo.observe(t, { childList: true, subtree: true, characterData: true });
          bindScrollListeners();
          schedule();
          applyFades();
          if (window.ResizeObserver) {
            const scroller = document.querySelector('infinite-scroller.chat-history') || document.querySelector('infinite-scroller') || document.querySelector('main');
            if (scroller) {
              const ro = new ResizeObserver(() => scheduleFade());
              ro.observe(scroller);
            }
          }
        } else {
          setTimeout(start, 500);
        }
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
      setInterval(schedule, 15000); // 兜底轮询（无突变的形态变化）
      window.addEventListener('resize', () => { schedule(); scheduleFade(); }); // 视口变化 → 重测气泡列宽与渐隐
      window.addEventListener('popstate', scheduleFade);
    } catch (e) {}
    console.log('[星语喵伴] Dream Skin v4 表面标注与实时毛玻璃渐隐引擎就绪喵～✨');
  })();
})();
