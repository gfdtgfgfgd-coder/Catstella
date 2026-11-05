(async () => {
  const api = window.KIMINO_API;
  const call = (action, value) => api.sendMessage({ type: 'KG_ONLINE', action, value });
  const checkbox = document.getElementById('auto-update');
  checkbox.disabled = true;
  checkbox.checked = (await api.storageGet(['autoUpdateCheck'])).autoUpdateCheck !== false;
  const panel = window.mountCatstellaOnline(document.getElementById('online-panel'), call, { themeOnly: true });
  const [builtIn, stored] = await Promise.all([
    fetch(api.getURL('assets/gallery.json')).then(response => response.json()).catch(() => ({})),
    api.storageGet(['customWallpapers', 'onlineCharacterPacks'])
  ]);
  const counts = { character: 0, wallpaper: 0 };
  for (const [kind, suffix] of [['character', 'characters'], ['wallpaper', 'wallpapers']]) {
    const gallery = window.mountCatstellaGallery(document.getElementById('online-' + suffix), {
      call, kind,
      installed: item => builtIn[suffix]?.some(pack => pack.id === item.id) ||
        (kind === 'character' ? !!stored.onlineCharacterPacks?.['online-' + item.id] :
          stored.customWallpapers?.some(wall => wall.id === 'custom:online-' + item.id)),
      onCount: count => {
        counts[kind] = count;
        const notice = document.getElementById('new-online-content');
        notice.hidden = !counts.character && !counts.wallpaper;
        notice.textContent = '发现可安装的在线素材 · ' +
          [counts.character && counts.character + ' 款桌宠', counts.wallpaper && counts.wallpaper + ' 张壁纸'].filter(Boolean).join('、');
      }
    });
    void gallery.load();
  }
  const restore = document.getElementById('restore-palette');
  restore.onclick = async () => {
    const ok = await api.storageSet({ onlinePalette: 'violet' });
    restore.textContent = ok ? '已恢复星轨紫配色' : '恢复失败，请重试';
  };
  checkbox.disabled = false;
  checkbox.onchange = async () => {
    checkbox.disabled = true;
    if (!(await api.storageSet({ autoUpdateCheck: checkbox.checked }))) checkbox.checked = !checkbox.checked;
    checkbox.disabled = false;
    void panel.refresh(false);
  };
})();
