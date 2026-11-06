const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../art_assets/wallpaper_pack_1');

const map = [
  { original: '13c3a2735fce53ceda925787d9bd90e02146089.jpg', target: 'moriyama-catgirl-01.jpg', title: '元气初醒 · 异色星眸', width: 2432, height: 1664 },
  { original: '57296429c900b1764858ec1f9e4f30522146089.jpg', target: 'moriyama-catgirl-02.jpg', title: '星芒跳跃 · 灿烂午后', width: 2432, height: 1664 },
  { original: '7d6c6d6e81b5d9196c6c31cd364b2b432146089.jpg', target: 'moriyama-catgirl-03.jpg', title: '猫耳微动 · 懵懂凝视', width: 2432, height: 1664 },
  { original: '8bff3d14561029999ff3f1e7f238b7442146089.jpg', target: 'moriyama-catgirl-04.jpg', title: '甜度超标 · 托腮浅笑', width: 2432, height: 1664 },
  { original: '8d264606a1daca75f31290100b6cd0ab2146089.jpg', target: 'moriyama-catgirl-05.jpg', title: '阳光倾落 · 纯白毛绒', width: 1216, height: 832 },
  { original: 'db84dd2dffd954517c2e7301bbae01b52146089.jpg', target: 'moriyama-catgirl-06.jpg', title: '元气出击 · 灵动飞扬', width: 1216, height: 832 },
  { original: 'de44a543ea5ac862fee620a221fbfbc62146089.jpg', target: 'moriyama-catgirl-07.jpg', title: '星轨漫步 · 温柔依偎', width: 2432, height: 1664 },
  { original: 'e8fe0e9556889c1e267fe0561e6793f72146089.jpg', target: 'moriyama-catgirl-08.jpg', title: '微风吹拂 · 俏皮眨眼', width: 1216, height: 832 },
  { original: 'fcbecdc152f21f62fa1375f76c5b8c2d2146089.jpg', target: 'moriyama-catgirl-09.jpg', title: '星夜流光 · 谁能拒绝', width: 2432, height: 1664 }
];

for (const item of map) {
  const origPath = path.join(dir, item.original);
  const targPath = path.join(dir, item.target);
  if (fs.existsSync(origPath)) {
    fs.renameSync(origPath, targPath);
    console.log('Renamed:', item.original, '->', item.target);
  } else if (fs.existsSync(targPath)) {
    console.log('Already renamed:', item.target);
  }
}

const doc = [
  '# 森山白月 · 全部人类都会控猫猫的 壁纸包',
  '',
  '- **原作**：[@森山白月](https://space.bilibili.com/2146089) （B站 UID: 2146089）',
  '- **原视频发布**：[【NovelAI】Gemini - 全部人类都会控猫猫的 壁纸分享](https://www.bilibili.com/video/BV17PxC6SERc/)',
  '- **原视频介绍**：“是猫猫，傻傻的元气娘，是猫娘还有异色瞳，只要是人类就不可能拒绝！”',
  '- **授权声明**：特别感谢森山白月老师授权 Catstella 项目使用与分发。🙏',
  '',
  '## 文件对照与清单',
  '',
  '| 序号 | 规范文件名 | 中文标题 | 分辨率 | 原始文件名 |',
  '| :--- | :--- | :--- | :--- | :--- |',
  ...map.map((m, i) => `| ${i + 1} | ${m.target} | ${m.title} | ${m.width} × ${m.height} | ${m.original} |`),
  ''
].join('\n');

fs.writeFileSync(path.join(dir, 'README.md'), doc, 'utf8');
console.log('Generated README.md successfully.');
