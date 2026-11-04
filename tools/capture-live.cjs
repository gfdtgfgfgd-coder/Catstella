const fs = require('fs');
const path = require('path');
const {discover, Cdp} = require('../shared/host.cjs');

(async () => {
  const d = await discover();
  if (!d) return;
  const cdp = new Cdp(d.target.webSocketDebuggerUrl);
  await cdp.ready;
  const {data} = await cdp.send('Page.captureScreenshot', {format: 'jpeg', quality: 90});
  const outPath = 'C:/Users/wangr/.gemini/antigravity/brain/5cbf2155-a245-4e20-a3a1-65a85733d845/desktop-theme-fixed.jpg';
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log('Saved screenshot to:', outPath);
  cdp.close();
})().catch(e => console.error(e));
