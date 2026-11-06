const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testStore() {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKIN_BROWSER_CHANNEL || 'msedge' });
  const htmlPath = 'file://' + path.resolve(__dirname, '../prototypes/content-store/index.html').replace(/\\/g, '/');
  console.log('Testing prototype at:', htmlPath);

  // 1. Desktop 1280px
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(htmlPath, { waitUntil: 'networkidle' });

  // Take desktop screenshot
  const artifactDir = 'C:/Users/wangr/.gemini/antigravity/brain/5cbf2155-a245-4e20-a3a1-65a85733d845';
  await page.screenshot({ path: path.join(artifactDir, 'desktop-store-explore.png') });

  // Verify Featured Pack
  const featuredTitle = await page.textContent('#featured-title');
  console.log('Featured Title:', featuredTitle);
  if (!featuredTitle.includes('全部人类都会控猫猫的')) {
    throw new Error('Featured pack title mismatch: ' + featuredTitle);
  }

  // Verify Moriyama Pack in Catalog
  const packCard = await page.$('[data-item="moriyama-catgirl-pack"]');
  if (!packCard) throw new Error('moriyama-catgirl-pack card not found in grid');
  console.log('Found moriyama-catgirl-pack in catalog.');

  // Click Detail button on Moriyama pack
  await page.click('[data-item="moriyama-catgirl-pack"] [data-action="detail"]');
  await page.waitForSelector('#detail-title');
  const detailTitle = await page.textContent('#detail-title');
  console.log('Detail Title:', detailTitle);

  // Take detail page screenshot
  await page.screenshot({ path: path.join(artifactDir, 'desktop-store-detail.png') });

  // Verify 9 thumbnails exist
  const thumbs = await page.$$('.pack-thumb');
  console.log('Detail thumbnails count:', thumbs.length);
  if (thumbs.length !== 9) {
    throw new Error('Expected 9 thumbnails, got ' + thumbs.length);
  }

  // Verify Bilibili source link
  const sourceLink = await page.$('a[href*="BV17PxC6SERc"]');
  if (!sourceLink) throw new Error('Bilibili source link missing in detail');
  console.log('Bilibili source link verified.');

  // Click 4th thumbnail (甜度超标)
  await thumbs[3].click();
  const counterText = await page.textContent('#preview-content [data-pack-counter]');
  console.log('Counter after 4th thumb click:', counterText);
  if (!counterText.includes('04')) {
    throw new Error('Counter did not update to 04: ' + counterText);
  }

  // Switch to Antigravity Effect preview
  await page.click('[data-preview="effect"]');
  const sceneWallpaper = await page.$('.scene-wallpaper img, .scene-wallpaper .pack-window');
  if (!sceneWallpaper) throw new Error('Scene wallpaper missing in effect preview');
  console.log('Effect preview verified.');

  // Back to explore
  await page.click('[data-action="back-detail"]');
  await page.waitForSelector('#grid');

  // Test Search for "森山白月"
  await page.fill('#store-search', '森山白月');
  await page.waitForTimeout(100);
  const searchResultsCount = await page.textContent('#result-count');
  console.log('Search for "森山白月" results:', searchResultsCount);
  const visibleCards = await page.$$('.store-card');
  if (visibleCards.length === 0) throw new Error('Search for "森山白月" returned 0 items');

  // Clear search
  await page.fill('#store-search', '');

  // 2. Mobile 390px Viewport (iPhone 14 / modern smartphone)
  console.log('Testing Mobile Viewport (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  // Verify mobile grid columns (should be 1 column)
  const gridTemplate = await page.$eval('.store-grid', el => getComputedStyle(el).gridTemplateColumns);
  console.log('Mobile grid-template-columns:', gridTemplate);
  // Should not contain multiple columns (e.g., only 1 column)
  const colCount = gridTemplate.trim().split(/\s+/).length;
  console.log('Mobile grid column count:', colCount);
  if (colCount !== 1) {
    throw new Error('Expected 1 column on mobile, got: ' + colCount);
  }

  // Take screenshot for visual verification
  const screenshotPath = path.resolve(__dirname, '../prototypes/content-store/mobile-preview.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.screenshot({ path: path.join(artifactDir, 'mobile-store-preview.png'), fullPage: false });
  console.log('Saved mobile preview screenshot to:', screenshotPath);

  if (errors.length > 0) {
    console.error('Console errors:', errors);
    throw new Error('Page encountered console errors');
  }

  console.log('ALL PROTOTYPE RESPONSIVE & PACK VERIFICATIONS PASSED!');
  await browser.close();
}

testStore().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
