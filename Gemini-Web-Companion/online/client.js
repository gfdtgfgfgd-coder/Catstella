(function (root, factory) {
  const client = factory();
  if (typeof module === 'object' && module.exports) module.exports = client;
  else root.CatstellaOnline = client;
})(globalThis, () => {
  'use strict';
  const repo = 'lynnfei/Catstella';
  const releases = `https://github.com/${repo}/releases`;
  const releaseUrl = url => typeof url === 'string' &&
    url.startsWith(releases + '/tag/') && /^(?:desktop-|web-)?v\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(url.slice((releases + '/tag/').length))
    ? url : releases;
  const releaseApi = `https://api.github.com/repos/${repo}/releases?per_page=30`;
  const assetBase = `https://raw.githubusercontent.com/${repo}/main/online-assets/`;
  const imageTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const maxImage = 5 * 1024 * 1024;
  const maxCharacter = 2 * 1024 * 1024;
  const maxCatalog = 1024 * 1024;
  const maxPreview = 64 * 1024;
  const frameNames = ['idle', 'blink', 'proud', 'sad', 'shy', 'angry'];
  const imageData = (value, format, limit) => {
    if (typeof value !== 'string' || value.length > limit) return false;
    const prefix = `data:image/${format};base64,`;
    const payload = value.slice(prefix.length);
    return value.startsWith(prefix) && payload.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(payload);
  };
  const palettes = ['violet', 'pink', 'ocean', 'onyx'];
  const version = text => typeof text === 'string' && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(text) ? text.split('.').map(Number) : null;
  const compare = (a, b) => {
    const x = version(a), y = version(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  function selectRelease(list, channel, current) {
    if (!Array.isArray(list) || !version(current)) throw new Error('invalid release list');
    const candidates = [];
    for (const r of list) {
      if (r?.draft !== false || r.prerelease !== false || typeof r.tag_name !== 'string') continue;
      const m = /^(desktop-|web-)?v(\d+\.\d+\.\d+)$/.exec(r.tag_name);
      if (!m || !version(m[2]) || (m[1] || 'desktop-') !== channel + '-') continue;
      const hasPackage = Array.isArray(r.assets) && r.assets.some(a => a?.state === 'uploaded' &&
        (channel === 'desktop' ? a.name === `Catstella-Setup-${m[2]}-x64.exe` :
          ['kimino-gemini-companion-edge-chrome.zip', 'kimino-gemini-companion.xpi'].includes(a.name)));
      if (hasPackage) candidates.push({ version: m[2], url: `${releases}/tag/${r.tag_name}` });
    }
    candidates.sort((a, b) => compare(b.version, a.version));
    const latest = candidates[0];
    return { current, latest: latest?.version || null, url: latest?.url || releases,
      status: !latest ? 'unpublished' : compare(latest.version, current) > 0 ? 'available' : 'current' };
  }
  function catalog(data) {
    if (data?.schema !== 1 || !Array.isArray(data.items) || !Array.isArray(data.characters ?? []) ||
        data.items.length + (data.characters?.length || 0) > 60) throw new Error('invalid catalog');
    const ids = new Set();
    return [...data.items, ...(data.characters || [])].map(item => {
      const { id, kind, path, sha256, size, name, credit, description = '', preview, pack, updatedAt } = item || {};
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id) || ids.has(id) ||
          typeof name !== 'string' || !name.trim() || name.length > 80 || typeof credit !== 'string' ||
          !credit.trim() || credit.length > 160 || typeof description !== 'string' || description.length > 200 ||
          typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) ||
          !Number.isInteger(size) || size < 1 || typeof path !== 'string') throw new Error('invalid catalog entry');
      const ext = path.split('.').pop();
      const mime = kind === 'wallpaper' ? Object.hasOwn(imageTypes, ext) && imageTypes[ext] :
        (kind === 'theme' || kind === 'character') && ext === 'json' && 'application/json';
      const limit = { wallpaper: maxImage, theme: 4096, character: maxCharacter }[kind];
      if (!mime || path !== `${kind}s/${id}.${ext}` || size > limit) throw new Error('invalid asset path or size');
      ids.add(id);
      const group = kind === 'wallpaper' && pack && /^[a-z][a-z0-9-]{0,47}$/.test(pack.id || '') &&
        typeof pack.name === 'string' && pack.name.length > 0 && pack.name.length <= 80 &&
        Number.isInteger(pack.position) && pack.position > 0 && pack.position <= 60
        ? { id: pack.id, name: pack.name, position: pack.position,
          source: typeof pack.source === 'string' && /^https:\/\/www\.bilibili\.com\/video\/BV[a-zA-Z0-9]+\/?$/.test(pack.source) ? pack.source : '' } : undefined;
      const day = typeof updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updatedAt) ? new Date(updatedAt) : null;
      const date = day && Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === updatedAt ? updatedAt : '';
      return { id, kind, path, sha256, size, name, credit, description, mime, pack: group, updatedAt: date,
        preview: imageData(preview, 'webp', maxPreview) ? preview : '' };
    });
  }
  function theme(value) {
    if (value?.schema !== 1 || !palettes.includes(value.palette) ||
        !Number.isInteger(value.opacity) || value.opacity < 30 || value.opacity > 100) throw new Error('invalid theme');
    return { palette: value.palette, opacity: value.opacity };
  }
  function character(value) {
    const frames = value?.frames;
    if (value?.schema !== 1 || !frames || Array.isArray(frames) || !imageData(frames.idle, 'png', 500_000)) {
      throw new Error('invalid character pack');
    }
    for (const [name, data] of Object.entries(frames)) {
      if (!frameNames.includes(name) || !imageData(data, 'png', 500_000)) throw new Error('invalid character frame');
    }
    return frames;
  }
  function failureReason(error) {
    if (error.message === 'HTTP 404') return 'unpublished';
    if (error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error.name) ||
        /^(?:net::ERR_|HTTP (?:403|429|5\d\d))/.test(error.message)) return 'connection';
    return 'failed';
  }
  async function readBytes(response, limit) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Content-Length can be the compressed transfer size; cap the decoded stream.
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) throw new Error('file too large');
        chunks.push(value);
      }
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  }
  const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const requestOptions = () => ({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(9000) });
  function create({ fetcher = globalThis.fetch, crypto = globalThis.crypto, now = Date.now, loadCheck, saveCheck, bundled }) {
    let catalogCache, catalogFlight, updateFlight, lastAttempt;
    let localItems, catalogOffline = false;
    const filesInFlight = new Map();
    async function list(force = false) {
      if (catalogFlight) return catalogFlight;
      if (!force && catalogCache && now() - catalogCache.at < (catalogOffline ? 30_000 : 15 * 60_000)) return catalogCache.items;
      catalogFlight = (async () => {
        localItems ||= bundled ? Promise.resolve().then(bundled.catalog).then(catalog).catch(() => []) : Promise.resolve([]);
        const local = await localItems;
        let remote;
        try { remote = catalog(decode(await readBytes(await fetcher(assetBase + 'catalog.json', requestOptions()), maxCatalog))); }
        catch (error) {
          catalogOffline = true;
          const items = [...new Map([...(catalogCache?.items || []), ...local].map(item => [item.id, item])).values()];
          if (!items.length) throw error;
          catalogCache = { items, at: now() };
          return items;
        }
        catalogOffline = false;
        const items = [...new Map([...local, ...remote].map(item => [item.id, item])).values()];
        catalogCache = { items, at: now() };
        return items;
      })();
      try { return await catalogFlight; } finally { catalogFlight = null; }
    }
    async function download(id) {
      const item = (await list()).find(x => x.id === id);
      if (!item) throw new Error('unknown asset');
      if (!filesInFlight.has(id)) {
        const task = (async () => {
          const local = (await localItems).find(entry => entry.id === id && entry.sha256 === item.sha256);
          const response = local ? await bundled.file(local.path) : await fetcher(assetBase + item.path, requestOptions());
          const bytes = await readBytes(response, item.size);
          if (bytes.length !== item.size) throw new Error('unexpected asset size');
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
          if (hash !== item.sha256) throw new Error('asset digest mismatch');
          if (item.kind === 'theme') return { item, theme: theme(decode(bytes)) };
          if (item.kind === 'character') return { item, character: character(decode(bytes)) };
          return { item, bytes };
        })().finally(() => filesInFlight.delete(id));
        filesInFlight.set(id, task);
      }
      return filesInFlight.get(id);
    }
    function check(channel, current, force = false) {
      if (updateFlight) return updateFlight;
      updateFlight = (async () => {
        const stored = lastAttempt || await loadCheck();
        const age = now() - (stored?.checkedAt || 0);
        const interval = force ? 30_000 : stored?.status === 'offline' ? 30 * 60_000 : 12 * 60 * 60_000;
        if (stored?.current === current && stored.channel === channel && age >= 0 && age < interval) return stored;
        let result;
        try {
          const res = await fetcher(releaseApi, { ...requestOptions(), headers: { Accept: 'application/vnd.github+json' } });
          result = selectRelease(decode(await readBytes(res, 2 * 1024 * 1024)), channel, current);
        } catch {
          result = { status: 'offline', current, latest: null, url: releases };
        }
        lastAttempt = { ...result, channel, checkedAt: now() };
        await saveCheck(lastAttempt);
        return lastAttempt;
      })().finally(() => { updateFlight = null; });
      return updateFlight;
    }
    return { list, download, check, catalogOffline: () => catalogOffline };
  }
  return { create, catalog, theme, failureReason, selectRelease, assetBase, releases, releaseUrl };
});
