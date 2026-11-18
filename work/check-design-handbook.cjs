const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');
const live = process.argv.includes('--live');
const origin = live ? 'https://plotstudio.pro' : 'http://localhost:15433';

(async () => {
  let server;
  let browser;
  try {
    if (!live) {
      const state = await mkdtemp(path.resolve(__dirname, 'design-handbook-qa-'));
      const entry = path.resolve(__dirname, '../outputs/plot-studio/server.mjs');
      const hash = spawnSync(process.execPath, [entry, 'hash'], { input: randomBytes(24).toString('base64url'), encoding: 'utf8' });
      assert.equal(hash.status, 0, hash.stderr);
      server = spawn(process.execPath, [entry], {
        env: { ...process.env, PORT: '15433', PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
          STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url') },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try { ready = (await fetch(`${origin}/docs/design`)).ok; } catch {}
        if (ready) break;
        await delay(100);
      }
      assert(ready, 'Handbook route did not start');
    }
    browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && /violates.*content security/i.test(message.text())) errors.push(message.text()); });
      const url = `${origin}/docs/design`;
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.getByRole('heading', { name: 'Design handbook', level: 1 }).count(), 1);
      const cards = page.locator('.design-template');
      assert.equal(await cards.count(), 12);
      assert.equal(await page.locator('.design-template img').count(), 24);
      assert.equal(await page.locator('.design-shot img').count(), 15);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const missing = await page.locator('main a[href^="#"]').evaluateAll(links => links.map(a => a.hash.slice(1)).filter(id => !document.getElementById(id)));
      assert.deepEqual(missing, []);
      await page.getByRole('button', { name: 'Got it' }).click({ timeout: 900 }).catch(() => {});
      if (!live && (width === 390 || width === 1440)) {
        await page.screenshot({ path: path.join(__dirname, `design-handbook-${width}.png`) });
      }
      await page.getByRole('link', { name: 'Browse 12 templates' }).click();
      assert.equal(new URL(page.url()).hash, '#templates');
      const first = cards.first();
      await first.locator('summary').click();
      await first.locator('details img').evaluate(img => img.decode());
      assert.equal(await first.locator('details[open]').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (!live && (width === 390 || width === 1440)) {
        await first.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(__dirname, `design-handbook-templates-${width}.png`) });
      }
      if (width === 1440) {
        await page.locator('.design-template details').evaluateAll(details => details.forEach(detail => { detail.open = true; }));
        const images = await page.locator('main img').evaluateAll(async imgs => {
          for (const img of imgs) img.loading = 'eager';
          return Promise.all(imgs.map(img => img.decode().then(() => ({ url: img.src, width: img.naturalWidth })).catch(() => ({ url: img.src, width: 0 }))));
        });
        assert.equal(new Set(images.map(img => img.url)).size, 39);
        assert.deepEqual(images.filter(img => img.width === 0), []);
        const files = await page.locator('.design-template a[download]').evaluateAll(links => links.map(a => a.href));
        assert.equal(new Set(files).size, 12);
        for (const file of files) {
          const response = await page.request.get(file);
          assert.equal(response.status(), 200, file);
          assert.equal(response.headers()['content-disposition'], `attachment; filename="${file.split('/').at(-1)}"`);
          const project = await response.json();
          assert.equal(project.version, 1);
          assert(project.name && project.pages.some(page => page.slug === 'index' && page.blocks.length), file);
        }
      }
      assert.deepEqual(errors, []);
      console.log(`${live ? 'Live' : 'Local'} handbook at ${width}px passed.`);
      await page.close();
    }
    const routed = await fetch(`${origin}/docs/design/?from=handbook`, { redirect: 'manual' });
    assert.equal(routed.status, 308);
    assert.equal(routed.headers.get('location'), '/docs/design?from=handbook');
  } finally {
    await browser?.close();
    server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
