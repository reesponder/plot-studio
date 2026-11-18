const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const live = process.argv.includes('--live');
const heroOnly = process.argv.includes('--hero-only');
const origin = live ? 'https://plotstudio.pro' : 'http://localhost:15232';
let server;
if (!live) {
  const entry = 'outputs/plot-studio/server.mjs';
  const hashed = spawnSync(process.execPath, [entry, 'hash'], { input: randomBytes(24).toString('base64url'), encoding: 'utf8' });
  assert.equal(hashed.status, 0);
  server = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT:'15232', PUBLIC_ORIGIN:origin, STUDIO_PASSWORD_HASH:hashed.stdout.trim(), STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url') },
    stdio:['ignore', 'ignore', 'inherit'],
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(origin + '/docs', { signal: AbortSignal.timeout(4000) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('The handbook did not respond.');
}

(async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true });
    const collected = await Promise.all([1440, 768, 390, 320].map(async width => {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const assets = new Set();
      page.on('request', request => assets.add(new URL(request.url()).pathname));
      await page.goto(origin + '/docs');
      const hero = page.locator('.intro');
      assert.equal(await hero.locator('img, svg, canvas, picture').count(),0);
      assert(await hero.getByRole('heading',{name:'PLOT Studio handbook'}).isVisible());
      assert.equal(await hero.evaluate(node => getComputedStyle(node).backgroundImage),'none');
      assert.equal(await hero.locator('.intro-index a').count(),4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),width);
      assert(!assets.has('/99host-assets/handbook/handbook-map.webp'));
      if (width === 1440 || width === 390) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({path:`work/plot-handbook-text-hero-${width}.png`});
      }
      if (heroOnly) { await page.close(); return []; }
      const linked = await page.locator('main a[href^="#"]').evaluateAll(links => links.map(a => a.hash).filter(hash => hash && !document.getElementById(decodeURIComponent(hash.slice(1)))));
      assert.deepEqual(linked,[]);
      const allIds = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
      assert.equal(allIds.length,new Set(allIds).size);
      await hero.getByRole('link',{name:/Build server workflows/}).click();
      await page.waitForURL(url => url.hash === '#advanced-workflows');
      const section = page.locator('#advanced-workflows');
      assert(await section.getByRole('heading',{level:2}).isVisible());
      const metadata = await section.locator('img[src*="/screen-advanced-"]').evaluateAll(images => images.map(img => ({
        url:img.src, alt:img.alt, width:img.width, sourceWidth:Number(img.getAttribute('width')), sourceHeight:Number(img.getAttribute('height')), loading:img.loading,
      })));
      assert(metadata.length >= 16, 'Expected at least 16 new screenshot references.');
      assert(metadata.every(asset => asset.alt && asset.sourceWidth > 0 && asset.sourceHeight > 0 && asset.loading === 'lazy'));
      if (width === 1440 || width === 390) {
        const preview = section.locator('img[src*="/screen-advanced-"]').first();
        await preview.scrollIntoViewIfNeeded();
        await preview.evaluate(img => img.decode());
        await page.screenshot({path:`work/plot-handbook-advanced-${width}.png`});
      }
      const screenshots = await page.locator('img[src*="/screen-"]').count();
      assert(screenshots >= 78);
      await page.close();
      return metadata;
    }));
    if (!heroOnly) {
      const distinct = new Map(collected[0].map(asset => [asset.url, asset]));
      assert.equal(distinct.size, collected[0].length);
      const hashes = await Promise.all([...distinct].map(async ([url]) => {
        const response = await fetch(url, { signal:AbortSignal.timeout(12000) });
        assert.equal(response.status,200);
        assert.equal(response.headers.get('content-type'),'image/webp');
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.subarray(8,12).toString(),'WEBP');
        return createHash('sha256').update(bytes).digest('hex');
      }));
      assert.equal(new Set(hashes).size, distinct.size);
      console.log(`${distinct.size} distinct new screenshots and all to-page anchors verified.`);
    }
    console.log(`Image-free handbook hero verified at 1440, 768, 390 and 320 px${live ? ' on production' : ' locally'}.`);
  } finally {
    await browser?.close();
    server?.kill();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
