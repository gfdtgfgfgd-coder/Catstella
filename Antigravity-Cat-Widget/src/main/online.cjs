const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { create, releases, releaseUrl, failureReason } = require('../../../shared/online.js');
const { readJson, writeJson } = require('../../../shared/storage.cjs');
const { probeImage } = require('../../../Antigravity-Dream-Skin/src/domain/theme-loader.cjs');

function createOnlineActions({ dataDir, wallpaperDir, characterDir, version, settings, nativeImage, shell, apply,
  onCheck = () => {}, onInstalled = () => {}, fetcher }) {
  const cache = path.join(dataDir, 'update-check.json');
  const client = create({
    fetcher,
    loadCheck: () => readJson(cache, null),
    saveCheck: result => { try { writeJson(cache, result); } catch {} }
  });
  async function check(force = false) {
    const result = settings.get('autoUpdateCheck') || force
      ? await client.check('desktop', version, force)
      : { status: 'disabled', current: version, url: releases };
    onCheck(result);
    return result;
  }
  const operations = new Map();
  function validateImage(buffer, mime, limit) {
    const image = probeImage(buffer);
    if (!image?.width || !image.height || image.mime !== mime ||
        image.width * image.height > limit || nativeImage.createFromBuffer(buffer).isEmpty()) throw new Error('invalid image');
  }
  function installCharacter(item, frames) {
    const packId = 'online-' + item.id;
    const images = Object.fromEntries(Object.entries(frames).map(([frame, data]) => {
      const bytes = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
      validateImage(bytes, 'image/png', 1_500_000);
      return [frame, bytes];
    }));
    fs.mkdirSync(characterDir, { recursive: true });
    const root = fs.realpathSync(characterDir);
    const dest = path.join(root, packId);
    if (fs.existsSync(dest)) throw new Error('character pack already exists');
    const pending = fs.mkdtempSync(path.join(root, '.install-'));
    try {
      const frameDir = path.join(pending, 'frames');
      fs.mkdirSync(frameDir);
      for (const [name, bytes] of Object.entries(images)) fs.writeFileSync(path.join(frameDir, name + '.png'), bytes);
      writeJson(path.join(pending, 'manifest.json'), {
        id: packId, name: item.name, description: item.description, credit: item.credit, revision: item.sha256
      });
      fs.renameSync(pending, dest);
    } finally {
      if (fs.existsSync(pending) && path.dirname(fs.realpathSync(pending)) === root) fs.rmSync(pending, { recursive: true, force: true });
    }
  }
  async function install(id, applyAfterwards) {
    const asset = await client.download(id);
    if (asset.theme) {
      apply({ dreamSkin: { themePreset: asset.theme.palette, opacity: asset.theme.opacity } });
      return { ok: true, kind: 'theme' };
    }
    if (asset.character) {
      installCharacter(asset.item, asset.character);
      onInstalled('character');
      return { ok: true, kind: 'character' };
    }
    const buffer = Buffer.from(asset.bytes);
    validateImage(buffer, asset.item.mime, 16_000_000);
    const packId = 'online-' + id;
    const dir = path.join(wallpaperDir, packId);
    const filename = 'wallpaper.' + asset.item.path.split('.').pop();
    const file = path.join(dir, filename);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.lstatSync(dir).isDirectory() || fs.realpathSync(dir) !== path.join(fs.realpathSync(wallpaperDir), packId)) throw new Error('invalid wallpaper directory');
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, buffer, { flag: 'wx' });
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
    writeJson(path.join(dir, 'manifest.json'), { id: packId, file: filename, name: asset.item.name, credit: asset.item.credit });
    if (applyAfterwards) apply({ dreamSkin: { wallpaperId: packId, wallpaperFile: file } });
    onInstalled('wallpaper');
    return { ok: true, kind: 'wallpaper' };
  }
  async function handle(action, value) {
    try {
      if (action === 'check') return { ok: true, ...(await check(value === true)) };
      if (action === 'release') {
        const result = await check();
        await shell.openExternal(releaseUrl(result.url));
        return { ok: true };
      }
      if (action === 'catalog') return { ok: true, items: await client.list(value === true) };
      if ((action === 'install' || action === 'download') && typeof value === 'string') {
        if (!operations.has(value)) operations.set(value, install(value, action === 'install').finally(() => operations.delete(value)));
        return await operations.get(value);
      }
      return { ok: false };
    } catch (error) {
      return { ok: false, reason: failureReason(error) };
    }
  }
  return { check, handle };
}
module.exports = { createOnlineActions };
