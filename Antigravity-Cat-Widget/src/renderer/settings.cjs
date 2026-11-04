(async () => {
  const api = window.widgetApi;
  const $ = id => document.getElementById(id);
  let data = await api.get();
  let active = null;
  let generation = 0;

  // 1. 无边框窗口控制
  if ($("win-min-btn")) $("win-min-btn").onclick = () => api.command("settings-minimize");
  if ($("win-close-btn")) $("win-close-btn").onclick = () => api.command("settings-close");

  // 2. 音效选项填充
  for (const p of data.presets || []) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label;
    $("soundSet").append(o);
  }

  const keys = [
    "characterPack", "hostWindowOnly", "standaloneDesktopMode", "easterEggs", "scale", "alwaysOnTop",
    "snap", "reducedMotion", "clickThrough", "bubbleOn", "turnCostOn",
    "turnCostDurationMs", "sound", "soundSet", "volume", "manualQuota",
    "manualPercent", "manualWeeklyPercent", "clickCatAction"
  ];
  const original = Object.fromEntries(keys.map(key => [key, data.settings[key]]));
  let pending = Promise.resolve();

  function save(partial, message = "已保存") {
    pending = pending.then(async () => {
      try {
        data = await api.save(partial);
        stop();
        render();
        $("saved").textContent = message;
      } catch {
        $("saved").textContent = "保存失败，请重试";
      }
    });
    return pending;
  }

  // 3. 视图模式切换与记忆 (横向滚动 vs 2xN 网格)
  let charViewMode = localStorage.getItem("cat_char_view_mode") || "carousel";
  let wallViewMode = localStorage.getItem("cat_wall_view_mode") || "carousel";

  function setupViewToggle(toggleId, galleryId, getMode, setMode) {
    const toggle = $(toggleId);
    const gallery = $(galleryId);
    if (!toggle || !gallery) return;

    function applyMode(mode) {
      if (gallery.dataset.mode === mode) return;
      gallery.classList.add("switching");
      setTimeout(() => {
        gallery.className = "gallery-container mode-" + mode;
        gallery.dataset.mode = mode;
        toggle.querySelectorAll(".view-btn").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.mode === mode);
        });
        setMode(mode);
        requestAnimationFrame(() => {
          gallery.classList.remove("switching");
        });
      }, 100);
    }

    toggle.querySelectorAll(".view-btn").forEach(btn => {
      btn.onclick = () => applyMode(btn.dataset.mode);
    });

    applyMode(getMode());
  }

  setupViewToggle("char-view-toggle", "character-gallery", () => charViewMode, m => { charViewMode = m; localStorage.setItem("cat_char_view_mode", m); });
  setupViewToggle("wall-view-toggle", "wallpaper-gallery", () => wallViewMode, m => { wallViewMode = m; localStorage.setItem("cat_wall_view_mode", m); });

  // 4. 角色画廊渲染
  function renderCharacterGallery() {
    const gallery = $("character-gallery");
    if (!gallery) return;
    const packs = data.characterPacks || [];
    if ($("character-count")) $("character-count").textContent = packs.length + " 款形态";

    gallery.innerHTML = "";
    for (const pack of packs) {
      const isCurrent = (data.settings.characterPack === pack.id);
      const card = document.createElement("div");
      card.className = "gallery-card" + (isCurrent ? " active" : "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.title = "点击切换为「" + pack.name + "」";

      let badgeHtml = isCurrent ? '<span class="card-badge">✓ 使用中</span>' : '';
      let imgHtml = pack.preview ? `<img src="${pack.preview}" alt="${pack.name}" loading="lazy">` : '<div style="font-size:32px">🐱</div>';

      card.innerHTML = `
        ${badgeHtml}
        <div class="card-char-thumb">${imgHtml}</div>
        <div class="card-info">
          <span class="card-title">${pack.name}</span>
          <span class="card-desc">${pack.description || pack.id}</span>
        </div>
      `;

      card.onclick = () => {
        if (data.settings.characterPack !== pack.id) {
          save({ characterPack: pack.id }, "已切换为「" + pack.name + "」形态");
        }
      };

      gallery.appendChild(card);
    }
  }

  // 5. 壁纸画廊渲染
  function renderWallpaperGallery() {
    const gallery = $("wallpaper-gallery");
    if (!gallery) return;
    const walls = data.wallpapers || [];
    if ($("wallpaper-count")) $("wallpaper-count").textContent = walls.length + " 张";

    const currentWallpaper = data.dreamSkin?.wallpaperFile || "";
    gallery.innerHTML = "";

    for (const wall of walls) {
      const normCurrent = (currentWallpaper || "").replace(/\\/g, "/").toLowerCase(); const normPath = (wall.filePath || "").replace(/\\/g, "/").toLowerCase(); const isCurrent = normCurrent.endsWith("/" + wall.fileName.toLowerCase()) || normCurrent === normPath || normCurrent === wall.fileName.toLowerCase();
      const card = document.createElement("div");
      card.className = "gallery-card" + (isCurrent ? " active" : "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.title = "点击应用「" + wall.title + "」";

      let badgeHtml = isCurrent ? '<span class="card-badge">✓ 当前壁纸</span>' : '';
      let imgHtml = wall.preview ? `<img src="${wall.preview}" alt="${wall.title}" loading="lazy">` : '<div style="font-size:24px;color:#aaa;display:flex;align-items:center;justify-content:center;height:100%">🖼️</div>';

      card.innerHTML = `
        ${badgeHtml}
        <div class="card-wall-thumb">${imgHtml}</div>
        <div class="card-info">
          <span class="card-title">${wall.title}</span>
          <span class="card-desc">${wall.fileName}</span>
        </div>
      `;

      card.onclick = () => {
        save({ dreamSkin: { wallpaperFile: wall.filePath } }, "已切换至壁纸「" + wall.title + "」");
      };

      gallery.appendChild(card);
    }
  }

  const snapPoints = [1, 3, 5, 10, 15, 30, 60];
  function dampedSnap(val) {
    for (const p of snapPoints) {
      if (Math.abs(val - p) <= 1.2) return p;
    }
    return val;
  }

  function render() {
    // 渲染常规表单控件
    for (const key of keys) {
      const el = $(key);
      if (el && document.activeElement !== el) {
        if (el.type === "checkbox") el.checked = data.settings[key];
        else el.value = key === "volume" ? Math.round(data.settings.volume * 100) : data.settings[key];
      }
    }
    $("scale-value").textContent = data.settings.scale + " px";
    $("volume-value").textContent = Math.round(data.settings.volume * 100) + "%";
    $("source").textContent = (data.source.online ? "已找到 " + data.source.files + " 份日志" : "未检测到会话日志") + " · 本机只读";
    $("audio-note").textContent = data.settings.sound ? "已启用" : "已静音";

    // 渲染 Dream Skin 轮播与调节
    if (data.dreamSkin) {
      const ds = data.dreamSkin;
      if (document.activeElement !== $("slideshow-enabled")) $("slideshow-enabled").checked = ds.slideshow !== false;
      if (document.activeElement !== $("slideshow-interval")) $("slideshow-interval").value = ds.slideshowIntervalMinutes || 5;
      $("slideshow-interval-value").textContent = $("slideshow-interval").value + " 分钟";
      if (document.activeElement !== $("dream-opacity")) $("dream-opacity").value = ds.opacity ?? 22;
      $("dream-opacity-value").textContent = $("dream-opacity").value + "%";
      if (document.activeElement !== $("dream-scrim")) $("dream-scrim").value = ds.scrim ?? 25;
      $("dream-scrim-value").textContent = $("dream-scrim").value + "%";
      if (document.activeElement !== $("dream-output-mode")) $("dream-output-mode").checked = ds.outputMode === "glass";
      if (document.activeElement !== $("uiLanguage")) $("uiLanguage").value = ds.uiLanguage || "en";
    }

    // 渲染两个全新画廊
    renderCharacterGallery();
    renderWallpaperGallery();
  }

  function stop() {
    generation++;
    active?.pause();
    active = null;
  }

  for (const key of keys) {
    const el = $(key);
    if (el) {
      el.addEventListener(el.type === "range" ? "input" : "change", () => {
        const v = el.type === "checkbox" ? el.checked : (el.type === "range" || el.type === "number" || key === "turnCostDurationMs") ? (el.value === "" ? null : Number(el.value)) : el.value;
        save({ [key]: key === "volume" ? v / 100 : v });
      });
    }
  }

  // 资源目录入口
  if ($("open-character-dir")) $("open-character-dir").onclick = () => api.command("open-character-dir");
  if ($("open-wallpaper-dir")) $("open-wallpaper-dir").onclick = () => api.command("open-wallpaper-dir");
  if ($("next-wallpaper")) $("next-wallpaper").onclick = async () => { await api.command("next-wallpaper"); $("saved").textContent = "已切换至下一张壁纸～"; };

  // 轮播与滑块绑定
  $("slideshow-enabled").onchange = () => save({ dreamSkin: { slideshow: $("slideshow-enabled").checked } });

  $("slideshow-interval").oninput = () => {
    const raw = Number($("slideshow-interval").value);
    const snapped = dampedSnap(raw);
    $("slideshow-interval").value = snapped;
    $("slideshow-interval-value").textContent = snapped + " 分钟";
    save({ dreamSkin: { slideshowIntervalMinutes: snapped } });
  };

  document.querySelectorAll(".damped-ticks span").forEach(span => {
    span.onclick = () => {
      const val = Number(span.getAttribute("data-val"));
      $("slideshow-interval").value = val;
      $("slideshow-interval-value").textContent = val + " 分钟";
      save({ dreamSkin: { slideshowIntervalMinutes: val } });
    };
  });

  $("dream-opacity").oninput = () => {
    const val = Number($("dream-opacity").value);
    $("dream-opacity-value").textContent = val + "%";
    save({ dreamSkin: { opacity: val } });
  };

  $("dream-scrim").oninput = () => {
    const val = Number($("dream-scrim").value);
    $("dream-scrim-value").textContent = val + "%";
    save({ dreamSkin: { scrim: val } });
  };

  $("dream-output-mode").onchange = () => {
    save({ dreamSkin: { outputMode: $("dream-output-mode").checked ? "glass" : "transparent" } });
  };

  if ($("uiLanguage")) $("uiLanguage").onchange = () => {
    save({ dreamSkin: { uiLanguage: $("uiLanguage").value } }, "已切换界面语言");
  };

  // 彩蛋与测试按钮
  if ($("preview-proud")) $("preview-proud").onclick = () => { api.command("preview-reaction:proud"); $("saved").textContent = "已触发「得意」表情展示~"; };
  if ($("preview-crying")) $("preview-crying").onclick = () => { api.command("preview-reaction:crying"); $("saved").textContent = "已触发「委屈」表情展示~"; };
  if ($("preview-shy")) $("preview-shy").onclick = () => { api.command("preview-reaction:shy"); $("saved").textContent = "已触发「害羞」表情展示~"; };
  if ($("preview-angry")) $("preview-angry").onclick = () => { api.command("preview-reaction:angry"); $("saved").textContent = "已触发「气恼」表情展示~"; };
  if ($("preview-reaction")) $("preview-reaction").onclick = () => api.command("preview-reaction");

  $("undo").onclick = () => save(original, "已恢复到打开设置时");
  $("dock-left").onclick = () => api.command("dock-left");
  $("dock-right").onclick = () => api.command("dock-right");
  $("reset").onclick = () => api.command("reset");
  $("quota-refresh").onclick = () => api.command("quota-refresh");
  $("refresh").onclick = () => api.command("refresh");

  $("audition").onclick = async () => {
    stop();
    if (!data.settings.sound || !data.settings.volume) {
      $("audio-note").textContent = "请先启用音效并提高音量";
      return;
    }
    const token = generation;
    const first = await api.audio("press");
    if (!first || token !== generation) return;
    active = new Audio(first.url);
    active.volume = first.effectiveVolume;
    active.onended = async () => {
      const p = await api.audio("release");
      if (p && token === generation) {
        active = new Audio(p.url);
        active.volume = p.effectiveVolume;
        active.play().catch(() => {});
      }
    };
    active.play().catch(() => $("audio-note").textContent = "播放未成功");
  };

  api.subscribe(next => {
    if (next.settings.sound !== data.settings.sound || next.settings.volume !== data.settings.volume || next.settings.soundSet !== data.settings.soundSet) stop();
    data = next;
    render();
  });

  window.addEventListener("beforeunload", stop);
  render();
})();
