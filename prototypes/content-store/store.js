'use strict';

// Display snapshot of the catalog and character packs in online-assets. Demo revisions and local state
// are deliberately independent of the app's installed assets and user settings.
const kinds = {
  character: { label: '桌宠', icon: 'paw' },
  wallpaper: { label: '壁纸', icon: 'image' },
  theme: { label: '主题配色', icon: 'palette' }
};
const petRoot = '../../Antigravity-Cat-Widget/assets/character-packs';
const wallpaperRoot = '../../online-assets/wallpapers';
const items = [
  { id: 'gemini-star-v1', kind: 'character', name: '星语', alias: 'Stella', description: '紫色猫耳 · 星空魔女礼装', size: 912272, art: `${petRoot}/gemini-star-v1/frames/idle.png` },
  { id: 'lin-cat', kind: 'character', name: '霓音', alias: 'Aica', description: '粉色猫耳 · 全息航行服', size: 896800, art: `${petRoot}/lin-cat/frames/idle.png`, style: 'aica' },
  { id: 'gemini-character-sheet-v1', kind: 'wallpaper', name: '星语 · 星幕夜话', description: '1672 × 941', size: 1923996, art: `${wallpaperRoot}/gemini-character-sheet-v1.png` },
  { id: 'aica-clouds', kind: 'wallpaper', name: '霓音 · 云端来信', description: '1671 × 941', size: 2420968, art: `${wallpaperRoot}/aica-clouds.png` },
  { id: 'violet-default', kind: 'theme', name: '星轨紫', description: '星轨紫配色 · 壁纸透明度 88%', size: 58 },
  { id: 'midnight-blue', kind: 'theme', name: '深海星夜', description: '蓝色玻璃配色 · 壁纸透明度 75%', size: 57, style: 'ocean' },
  { id: 'aica-starship', kind: 'wallpaper', name: '霓音 · 星舱漫游', description: '1376 × 768', size: 1618113, art: `${wallpaperRoot}/aica-starship.jpg` },
  { id: 'stella-halloween', kind: 'wallpaper', name: '星语 · 万圣星夜', description: '1376 × 768', size: 845169, art: `${wallpaperRoot}/stella-halloween.jpg` }
];
const latest = item => item.id === 'lin-cat' ? 2 : 1;
const views = {
  explore: ['在线内容商店', '发现桌宠、星空壁纸与主题配色，装点你的 Catstella。', '全部内容'],
  library: ['在线内容商店', '管理已安装的内容，更新版本或切换正在使用的素材。', '本地图库'],
  favorites: ['在线内容商店', '把喜欢的内容放在这里，随时预览、安装或切换。', '我的收藏'],
  guide: ['在线内容商店', '有想在 Catstella 使用的素材？可以提交适配请求。', '']
};
const storageKey = 'catstella.content-store.demo.v1';
const defaults = {
  installed: { 'gemini-star-v1': 1, 'lin-cat': 1, 'violet-default': 1 },
  favorites: ['gemini-star-v1', 'aica-clouds'],
  active: { character: 'gemini-star-v1', theme: 'violet-default' }
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && saved.installed && Array.isArray(saved.favorites) && saved.active) {
      return {
        installed: Object.fromEntries(items.filter(x => [1, latest(x)].includes(saved.installed[x.id])).map(x => [x.id, saved.installed[x.id]])),
        favorites: items.filter(x => saved.favorites.includes(x.id)).map(x => x.id),
        active: Object.fromEntries(items.filter(x => saved.active[x.kind] === x.id && [1, latest(x)].includes(saved.installed[x.id])).map(x => [x.kind, x.id]))
      };
    }
  } catch { /* File previews may restrict storage. */ }
  return structuredClone(defaults);
}

const state = loadState();
const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const search = $('#store-search');
const dialog = $('#dialog');
const detailPage = $('#detail-page');
const resultsTitle = $('#results-title');
resultsTitle.tabIndex = -1;
let view = 'explore';
let category = 'all';
let detail;
let detailReturn;
let previewMode = 'effect';
let previewComparison = 'candidate';
let listingScroll = 0;
let toastTimer;

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
const version = number => `v1.${number - 1}`;
const fileSize = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
const installed = item => state.installed[item.id];
const hasUpdate = item => installed(item) && installed(item) < latest(item);
const inUse = item => state.active[item.kind] === item.id;
const isFavorite = item => state.favorites.includes(item.id);
const fullName = item => item.alias ? `${item.name} ${item.alias}` : item.name;
const currentAsset = kind => items.find(item => item.id === state.active[kind]);

function settingsDemo() {
  const toggle = (label, hint, on = false) => `<label class="row"><span class="row-text"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" ${on ? 'checked' : ''}></label>`;
  const card = (title, content) => `<div class="card"><h3>${title}</h3>${content}</div>`;
  const storeLink = (label, kind = 'all', target = 'explore') => `<button class="btn small" type="button" data-action="jump-store" data-filter="${kind}" data-target-view="${target}">${label} ${icon('arrow')}</button>`;
  const appearance = (kind, title, caption) => card(title, `<div class="local-gallery"><div class="local-selection" data-current="${kind}"></div><div><p>${caption}</p><div class="btn-row">${storeLink('管理已安装',kind,'library')}${storeLink('浏览在线内容',kind)}</div></div></div>`);
  const pages = {
    overview: `<div class="hero"><div><p class="hero-tag">GEMINI STAR / COMPANION</p><h1>Catstella</h1><span class="hero-sub">桌宠、壁纸和 Gemini 伴侣</span></div><span class="sync-pill cached">设置预览</span></div>
      ${card('常用设置', toggle('应用到 Antigravity','在工作区显示壁纸与主题配色',true) + toggle('仅在 Antigravity 窗口内显示','未打开反重力时退守桌面') + toggle('显示气泡','',true))}
      ${card('个性化',`<div class="row"><span class="row-text"><b>在线内容商店</b><small>在一个地方浏览、安装和管理桌宠、壁纸与主题。</small></span>${storeLink('打开商店')}</div>`)}`,
    pet: `<h1 class="page-title">桌宠</h1>${appearance('character','形态选择','这里显示正在使用的桌宠。更多形象在内容商店。')}${card('双端联动与样式同步',toggle('同步到网页','让 Gemini 网页跟随桌面端的桌宠形象',true))}`,
    wallpaper: `<h1 class="page-title">壁纸</h1>${appearance('wallpaper','壁纸图库','这里显示正在使用的壁纸。安装后可从本地图库选用。')}${card('壁纸设置',toggle('同步到网页','让 Gemini 网页跟随桌面的壁纸选择',true) + toggle('自动轮播','轮换本地壁纸'))}`,
    agy: `<h1 class="page-title">反重力</h1>${card('工作区外观',toggle('启用工作区外观','应用壁纸和配色',true))}${appearance('theme','当前配色','在内容商店安装和切换配色。')}`,
    interact: `<h1 class="page-title">互动</h1>${card('桌宠互动',toggle('启用摸头反馈','轻点桌宠时播放反馈',true) + toggle('自动碎碎念','空闲时偶尔说一句本地短句') + toggle('播放音效','',true))}`,
    quota: `<h1 class="page-title">用量</h1>${card('双端用量实时看板 <span class="chip">示例数据</span>', '<div class="dual-quota-grid"><div class="dual-quota-box"><div class="dq-head"><b>🪐 Antigravity</b></div><div class="dq-stat-row"><span>5 小时剩余额度</span><strong>82%</strong></div><div class="dq-stat-row"><span>1 周剩余额度</span><strong>64%</strong></div></div><div class="dual-quota-box"><div class="dq-head"><b>🌐 Gemini Web</b></div><div class="dq-stat-row"><span>连接状态</span><strong>待同步</strong></div></div></div>')}`,
    about: `<h1 class="page-title">关于</h1>${card('Catstella · Gemini Companion','<p>桌面设置与在线内容商店的交互预览。</p>')}`
  };
  $('#settings-demo').innerHTML = Object.entries(pages).map(([key, html]) => `<section data-demo="${key}" hidden>${html}</section>`).join('');
}

function updateSelections() {
  for (const el of document.querySelectorAll('[data-current]')) {
    const item = currentAsset(el.dataset.current);
    el.innerHTML = item ? `${artwork(item)}<b>${fullName(item)}</b>` : '<div class="no-selection">尚未选择</div>';
  }
}

function switchSetting(next) {
  const selected = $(`[data-setting="${next}"]`);
  if (!selected) return;
  for (const button of document.querySelectorAll('[data-setting]')) {
    button.classList.toggle('active', button === selected);
    if (button === selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('#store-page').hidden = next !== 'store';
  $('#settings-demo').hidden = next === 'store';
  for (const page of document.querySelectorAll('[data-demo]')) page.hidden = page.dataset.demo !== next;
  $('#status-label').textContent = next === 'store' ? `目录快照 · ${items.length} 件素材` : '桌面设置预览';
  if (next !== 'store') updateSelections();
  $('#content').scrollTo({ top: 0, behavior: 'instant' });
}

function saveState() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { /* Actions remain available for the current session. */ }
}

function action(item, name, label, skin = '', glyph = '', disabled = false) {
  return `<button class="btn small ${skin}" type="button" data-action="${name}" data-id="${item.id}" ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph) : ''}${label}</button>`;
}

function mainAction(item) {
  if (hasUpdate(item)) return action(item, 'update', '更新', 'soft', 'update');
  if (!installed(item)) return action(item, 'install', '安装', 'primary', 'download');
  if (inUse(item)) return action(item, 'apply', '使用中', '', 'check', true);
  return action(item, 'apply', '使用', 'soft', 'check');
}

function favoriteButton(item) {
  const selected = isFavorite(item);
  return `<button class="favorite" type="button" data-action="favorite" data-id="${item.id}" aria-pressed="${selected}" aria-label="收藏${fullName(item)}" title="${selected ? '取消收藏' : '收藏'}">${icon('heart')}</button>`;
}

function artwork(item, expanded = false) {
  const media = item.kind === 'theme'
    ? '<div class="palette-preview" aria-hidden="true"><span></span><div class="palette-colors"><i></i><i></i><i></i><i></i></div></div>'
    : `<img src="${item.art}" alt="${expanded ? `${fullName(item)}预览` : ''}" decoding="async">`;
  return `<div class="art ${item.kind} ${item.style || ''} ${expanded ? 'dialog-art' : ''}">${media}</div>`;
}

function card(item) {
  const kind = kinds[item.kind];
  const badge = hasUpdate(item) ? `<span class="asset-status update">${icon('update')} 可更新</span>`
    : installed(item) ? `<span class="asset-status installed">${icon('check')} 已安装</span>` : '';
  return `<article class="store-card" data-item="${item.id}">
    <div class="card-cover">
      <button class="cover-button" type="button" data-action="detail" data-id="${item.id}" aria-label="预览${fullName(item)}">${artwork(item)}</button>
      ${badge}${favoriteButton(item)}
    </div>
    <div class="asset-body">
      <div class="asset-meta"><span>${icon(kind.icon)} ${kind.label}</span><span>${fileSize(item.size)}</span></div>
      <h3>${fullName(item)}</h3><p>${item.description}</p>
      <div class="asset-actions">${action(item, 'detail', '详情', 'quiet')}${mainAction(item)}</div>
    </div>
  </article>`;
}

function render() {
  const [title, subtitle, section] = views[view];
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  $('#featured').hidden = view !== 'explore';
  $('#installed-count').textContent = items.filter(installed).length;
  $('#favorite-count').textContent = state.favorites.length;
  for (const button of document.querySelectorAll('[data-view]')) {
    const current = button.dataset.view === view;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const button of document.querySelectorAll('[data-kind]')) {
    const current = button.dataset.kind === category;
    button.classList.toggle('active', current);
    button.setAttribute('aria-pressed', current);
  }

  $('#listing').hidden = view === 'guide' || !!detail;
  detailPage.hidden = !detail;
  $('#guide-page').hidden = view !== 'guide';
  if (detail || view === 'guide') return;

  const query = search.value.trim().toLocaleLowerCase();
  const collection = items.filter(item => view === 'library' ? installed(item) : view === 'favorites' ? isFavorite(item) : true);
  const visible = collection.filter(item =>
    (category === 'all' || item.kind === category) &&
    `${fullName(item)} ${item.description} ${kinds[item.kind].label}`.toLocaleLowerCase().includes(query)
  );
  resultsTitle.textContent = query ? '搜索结果' : category === 'all' ? section : kinds[category].label;
  $('#result-count').textContent = `${visible.length} 件内容`;
  if (visible.length) {
    grid.innerHTML = visible.map(card).join('');
    return;
  }

  const filtered = query || category !== 'all';
  const empty = filtered ? ['没有找到匹配的内容', '试试其他关键词或切换分类。']
    : view === 'favorites' ? ['收藏夹还是空的', '点击素材上的爱心，就能在这里找到它。']
      : ['还没有安装内容', '去探索内容，挑一件喜欢的素材。'];
  grid.innerHTML = `<div class="empty-state">${icon(filtered ? 'search' : view === 'favorites' ? 'heart' : 'box')}
    <h3>${empty[0]}</h3><p>${empty[1]}</p>
    <button class="btn small" type="button" data-action="${filtered ? 'clear-filters' : 'browse'}">${filtered ? '清除筛选' : '探索内容'}</button>
  </div>`;
}

function switchView(next) {
  if (!Object.hasOwn(views, next)) return;
  detail = undefined;
  view = next;
  category = 'all';
  search.value = '';
  $('#content').scrollTo({ top: 0, behavior: 'instant' });
  render();
}

function dialogFrame(label, contents) {
  dialog.innerHTML = `<div class="dialog-bar"><span>${label}</span><button type="button" class="titlebar-btn close-dialog" data-action="close" aria-label="关闭" autofocus>${icon('close')}</button></div><div class="dialog-body">${contents}</div>`;
  if (!dialog.open) dialog.showModal();
}

const themeLooks = {
  'midnight-blue': { name: '深海星夜', surface: '#eef5fd', edge: '#d9e9fb', ink: '#122033', accent: '#3b7dd8', opacity: .75 },
  'violet-default': { name: '星轨紫', surface: '#f3edfc', edge: '#e5d8f6', ink: '#1c1828', accent: '#9370db', opacity: .88 }
};

function effectPreview(item) {
  const chosen = kind => previewComparison === 'candidate' && item.kind === kind ? item : currentAsset(kind);
  const pet = chosen('character');
  const wallpaper = chosen('wallpaper');
  const theme = themeLooks[chosen('theme')?.id] || themeLooks['violet-default'];
  return `<figure class="effect-preview">
    <div class="scene" style="--scene-surface:${theme.surface};--scene-edge:${theme.edge};--scene-accent:${theme.accent};--scene-ink:${theme.ink};--scene-opacity:${theme.opacity}">
      ${wallpaper ? `<img class="scene-wallpaper" src="${wallpaper.art}" alt="">` : ''}
      <div class="scene-title"><span class="scene-dots"><i></i><i></i><i></i></span><span>Antigravity · 工作区</span><span class="scene-caption">界面示意</span></div>
      <div class="scene-window" aria-hidden="true"><div class="scene-side"><b>资源管理器</b><span>▾ &nbsp; 项目</span><span>◇ &nbsp; notes.md</span><span>◇ &nbsp; README.md</span></div><div class="scene-editor"><b>notes.md</b><div class="scene-lines"><i></i><i></i><i></i><i></i></div></div></div>
      ${pet ? `<div class="scene-pet"><span class="scene-bubble">准备好啦 ✦</span><img src="${pet.art}" alt="${fullName(pet)}"></div>` : ''}
    </div>
    <figcaption>${pet ? fullName(pet) : '无桌宠'} <span>·</span> ${wallpaper ? wallpaper.name : '无壁纸'} <span>·</span> ${theme.name}</figcaption>
  </figure>`;
}

function renderDetail(item, message = '') {
  const kind = kinds[item.kind];
  const status = hasUpdate(item) ? '有可用更新' : inUse(item) ? '正在使用' : installed(item) ? '已安装' : '未安装';
  const revisions = hasUpdate(item) ? `${version(installed(item))} → ${version(latest(item))}` : version(latest(item));
  const credit = item.kind === 'theme' ? 'Catstella · CC0' : 'Catstella · 项目素材';
  detailPage.innerHTML = `
    <button class="btn small quiet detail-back" type="button" data-action="back-detail">${icon('arrow')} 返回${view === 'library' ? '已安装' : view === 'favorites' ? '收藏夹' : '探索'}</button>
    <div class="detail-layout">
      <section class="card detail-preview" aria-label="素材预览">
        <div class="preview-toolbar"><div class="view-mode-toggle" role="group" aria-label="预览方式">
          <button class="view-btn" type="button" data-preview="effect">应用效果</button><button class="view-btn" type="button" data-preview="asset">素材原样</button>
        </div></div>
        <div id="preview-content"></div>
        <div class="preview-compare" id="preview-compare"><span>搭配对比</span><div class="view-mode-toggle" role="group" aria-label="搭配对比">
          <button class="view-btn" type="button" data-compare="current">当前搭配</button><button class="view-btn" type="button" data-compare="candidate">试用此素材</button>
        </div></div>
      </section>
      <aside class="card detail-info">
        <div class="eyebrow">${kind.label}</div><h2 id="detail-title" tabindex="-1">${fullName(item)}</h2><p class="hint">${item.description}</p>
        <dl class="detail-data"><dt>状态</dt><dd>${status}</dd><dt>演示版本</dt><dd>${revisions}</dd><dt>大小</dt><dd>${fileSize(item.size)}</dd><dt>来源</dt><dd>${credit}</dd></dl>
        <div class="dialog-actions">${mainAction(item)}${hasUpdate(item) && !inUse(item) ? action(item, 'apply', '使用已安装版') : ''}${favoriteButton(item)}${installed(item) ? action(item, 'confirm-remove', '卸载', 'danger') : ''}</div>
        ${message ? `<p class="detail-feedback" role="status">${message}</p>` : ''}
      </aside>
    </div>`;
  renderPreview(item);
}

function renderPreview(item) {
  for (const [key, active] of [['preview', previewMode], ['compare', previewComparison]]) {
    for (const button of detailPage.querySelectorAll(`[data-${key}]`)) {
      button.classList.toggle('active', button.dataset[key] === active);
      button.setAttribute('aria-pressed', button.dataset[key] === active);
    }
  }
  $('#preview-compare').hidden = previewMode === 'asset';
  $('#preview-content').innerHTML = previewMode === 'effect' ? effectPreview(item) : artwork(item, true);
}

function showDetail(item, opener) {
  detail = item;
  detailReturn = { action: opener.dataset.action, id: item.id, cover: opener.classList.contains('cover-button'), featured: !!opener.closest('#featured') };
  listingScroll = $('#content').scrollTop;
  previewMode = 'effect';
  previewComparison = 'candidate';
  render();
  renderDetail(item);
  $('#content').scrollTo({ top: 0, behavior: 'instant' });
  $('#detail-title').focus({ preventScroll: true });
}

function backToListing() {
  detail = undefined;
  render();
  $('#content').scrollTo({ top: listingScroll, behavior: 'instant' });
  const { id, action: name, cover, featured } = detailReturn || {};
  const target = featured ? $('#featured button') : grid.querySelector(`${cover ? '.cover-button' : '.asset-actions button'}[data-id="${id}"][data-action="${name}"]`);
  (target || resultsTitle).focus({ preventScroll: true });
}

function confirmRemoval(item) {
  dialogFrame('管理已安装内容', `<h2 id="dialog-title">卸载 ${fullName(item)}？</h2>
    <p>${inUse(item) ? '卸载后，此素材的「使用中」状态会清除。' : '卸载后仍可以在商店重新安装。'}收藏记录会保留。</p>
    <div class="dialog-actions"><button class="btn small" type="button" data-action="close">取消</button>${action(item, 'remove', '确认卸载', 'danger')}</div>`);
  dialog.querySelector('.dialog-actions [data-action="close"]').focus();
}

function prepareGuide() {
  const body = ['### 想适配的素材', '- 名称：', '- 分类（桌宠 / 壁纸 / 主题配色）：', '- 原作链接与作者：', '',
    '### 希望如何使用', '- 平台（桌面端 / Gemini 网页 / 两者）：', '- 想保留的效果或需要调整的地方：', '',
    '### 授权情况', '- 原创 / 已获授权 / 尚待确认：', '- 许可链接或可公开的授权说明（如有）：', '',
    '### 参考资料（可选）', '- 可公开分享的截图或示例链接：'].join('\n');
  const draft = new URL('https://github.com/lynnfei/Catstella/issues/new');
  draft.searchParams.set('title', '[适配请求][分类] 素材名称');
  draft.searchParams.set('body', body);
  $('#issue-draft').href = draft.href;
  $('#issue-template').value = body;
}

async function copyIssue() {
  const template = $('#issue-template');
  try {
    await navigator.clipboard.writeText(template.value);
    $('#copy-status').textContent = '已复制';
  } catch {
    template.focus();
    template.select();
    $('#copy-status').textContent = '已选中模板，可按 Ctrl+C 或 ⌘C 复制。';
  }
}

function notify(message) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function applyAction(name, item, button) {
  let message;
  if (name === 'favorite') {
    const saved = isFavorite(item);
    state.favorites = saved ? state.favorites.filter(id => id !== item.id) : [...state.favorites, item.id];
    message = saved ? `已取消收藏 ${item.name}` : `已收藏 ${item.name}`;
  } else if ((name === 'install' && !installed(item)) || (name === 'update' && hasUpdate(item))) {
    state.installed[item.id] = latest(item);
    message = name === 'install' ? `已安装 ${item.name}` : `已将 ${item.name} 更新到 ${version(latest(item))}`;
  } else if (name === 'apply' && installed(item)) {
    state.active[item.kind] = item.id;
    message = `正在使用 ${item.name}`;
  } else if (name === 'remove' && dialog.open && installed(item)) {
    delete state.installed[item.id];
    if (inUse(item)) delete state.active[item.kind];
    message = `已卸载 ${item.name}`;
    dialog.close();
  } else return;

  saveState();
  render();
  const sameAction = `[data-id="${item.id}"][data-action="${name}"]:not(:disabled)`;
  if (detail) {
    renderDetail(item, message);
    const nextAction = { install: 'apply', update: 'apply', remove: 'install' }[name];
    const replacement = detailPage.querySelector(sameAction) || (nextAction && detailPage.querySelector(`[data-action="${nextAction}"]:not(:disabled)`));
    (replacement || $('#detail-title')).focus({ preventScroll: true });
  } else {
    const replacement = grid.querySelector(sameAction) || grid.querySelector(`[data-item="${item.id}"] .cover-button`);
    (replacement || resultsTitle).focus({ preventScroll: true });
    notify(message);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { action: name, id, kind, view: next, setting, preview, compare } = button.dataset;
  const item = items.find(x => x.id === id);
  if (setting) switchSetting(setting);
  else if (next) switchView(next);
  else if (preview && detail) { previewMode = preview; renderPreview(detail); }
  else if (compare && detail) { previewComparison = compare; renderPreview(detail); }
  else if (kind) { category = kind; render(); }
  else if (name === 'clear-filters') { category = 'all'; search.value = ''; render(); search.focus(); }
  else if (name === 'browse') { switchView('explore'); $('[data-view="explore"]').focus(); }
  else if (name === 'jump-store') {
    switchSetting('store');
    switchView(button.dataset.targetView);
    category = button.dataset.filter;
    render();
    $(`[data-view="${view}"]`).focus();
  }
  else if (name === 'back-detail') backToListing();
  else if (name === 'copy-issue') copyIssue();
  else if (name === 'close') dialog.close();
  else if (name === 'detail' && item) showDetail(item, button);
  else if (name === 'confirm-remove' && item) confirmRemoval(item);
  else if (item) applyAction(name, item, button);
});

dialog.addEventListener('close', () => {
  detailPage.querySelector('[data-action="confirm-remove"]')?.focus({ preventScroll: true });
});
search.addEventListener('input', render);
settingsDemo();
prepareGuide();
const initialSetting = location.hash.slice(1);
if (['overview','pet','wallpaper','store','agy','interact','quota','about'].includes(initialSetting)) switchSetting(initialSetting);
render();
