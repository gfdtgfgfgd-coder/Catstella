// 用 Playwright 加载设置页（注入模拟 widgetApi）并逐页截图，仅用于本地视觉验证。
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({channel:'msedge'}); const page = await browser.newPage({viewport: {width: 900, height: 700}});
  await page.addInitScript(() => {
    const thumb = c => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="158"><defs><linearGradient id="g"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="280" height="158" fill="url(#g)"/></svg>`);
    const data = {settings: {characterPack: 'lin-cat', scale: 220, hostWindowOnly: true, standaloneDesktopMode: true, alwaysOnTop: true, snap: true, reducedMotion: false, clickThrough: false, bubbleOn: true, turnCostOn: true, turnCostDurationMs: 5000, sound: true, soundSet: 'a', volume: .5, manualQuota: false, manualPercent: 80, manualWeeklyPercent: 60, clickCatAction: 'talk', easterEggs: true},
      presets: [{id: 'a', label: '默认'}], source: {online: true, files: 4},
      characterPacks: [{id: 'lin-cat', name: '林猫形态', description: '居家水母冲锋衣', preview: ''}, {id: 'mo', name: '魔猫形态', description: '星空魔女礼装', preview: ''}],
      wallpapers: [{id: '1', fileName: 'a.jpg', filePath: 'C:/a.jpg', title: '星语星空 · Q版基米乃', preview: thumb(['#9b7be0', '#f6b6d8'])}, {id: '2', fileName: 'b.jpg', filePath: 'C:/b.jpg', title: '万圣双子', preview: thumb(['#e69a4a', '#5a3470'])}, {id: '3', fileName: 'c.jpg', filePath: 'C:/c.jpg', title: '星空大魔女', preview: thumb(['#2c3f8f', '#b18cf0'])}],
      dreamSkin: {enabled: true, opacity: 22, scrim: 25, outputMode: 'glass', uiLanguage: 'en', slideshow: true, slideshowIntervalMinutes: 5, wallpaperFile: 'C:/b.jpg', transition: 'fade'}};
    window.widgetApi = {get: async () => data, save: async p => data, command: () => {}, subscribe: () => {}, audio: async () => null};
  });
  await page.goto('file:///' + path.resolve('Antigravity-Cat-Widget/src/renderer/settings.html').replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  for (const name of ['overview', 'pet', 'wallpaper', 'agy']) {
    await page.click(`.nav-item[data-page="${name}"]`); await page.waitForTimeout(350);
    await page.screenshot({path: path.join(out, `settings-${name}.png`)});
  }
  await browser.close(); console.log('shots done');
})().catch(e => { console.error(e); process.exit(1); });

