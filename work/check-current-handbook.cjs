const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const target = process.env.PLOT_DOCS_ORIGIN || 'http://localhost:15172';
const token = () => randomBytes(32).toString('base64url');

async function main() {
  let state;
  let server;
  let browser;
  try {
    if (!process.env.PLOT_DOCS_ORIGIN) {
      state = await mkdtemp(join(tmpdir(), 'plot-docs-release-'));
      const entry = resolve('outputs/plot-studio/server.mjs');
      const hash = spawnSync(process.execPath, [entry, 'hash'], { input: token(), encoding: 'utf8' });
      assert.equal(hash.status, 0, hash.stderr);
      server = spawn(process.execPath, [entry], { stdio: ['ignore', 'ignore', 'inherit'], env: {
        ...process.env, PUBLIC_ORIGIN: target, PORT: '15172', PLOT_STATE_DIR: state,
        STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_PROJECT_STORAGE_KEY: token(), PLOT_FILE_KEY: token(),
      } });
    }
    let ready;
    for (let n = 0; n < 40 && !ready; n++) {
      ready = await fetch(target + '/docs').then(response => response.ok).catch(() => false);
      if (!ready) await wait(120);
    }
    assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
    const page = await context.newPage();
    const expected = [
      ['/docs', '#images', '#asset-placement', '#paint', '#paint-background', '#paint-export', '#publishing', '#plot-project-files', '#server-project-history'],
      ['/docs/design', '#paint-and-assets'],
    ];
    const assets = new Set();
    for (const [url, ...anchors] of expected) {
      assert.equal((await page.goto(target + url, { waitUntil: 'domcontentloaded' })).status(), 200);
      const notice = page.getByRole('button', { name: 'Got it', exact: true });
      if (await notice.isVisible()) await notice.click();
      for (const anchor of anchors) assert.equal(await page.locator(anchor).count(), 1);
      const navigation = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return { duplicates: ids.filter((id, i) => ids.indexOf(id) !== i), missing: [...document.querySelectorAll('a[href^="#"]')].map(node => node.hash).filter(hash => hash.length > 1 && !document.getElementById(decodeURIComponent(hash.slice(1)))) };
      });
      assert.deepEqual(navigation.duplicates, [], `${url} duplicates`);
      assert.deepEqual(navigation.missing, [], `${url} missing anchors`);
      const images = await page.locator('img[src*="/handbook/current-"]').evaluateAll(nodes => nodes.map(node => ({ src: node.getAttribute('src'), alt: node.alt, w: node.width, h: node.height, wAttr: node.getAttribute('width'), hAttr: node.getAttribute('height'), full: node.closest('a')?.getAttribute('href') })));
      assert.ok(images.length >= (url === '/docs' ? 41 : 15), `${url} image refs ${images.length}`);
      for (const image of images) {
        assert.ok(image.alt && Number(image.wAttr) > 0 && Number(image.hAttr) > 0);
        if (!image.src.endsWith('-diagram.webp')) assert.equal(image.full, image.src);
        assets.add(image.src);
      }
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1024 });
        for (const anchor of anchors) {
          await page.locator(anchor).scrollIntoViewIfNeeded();
          const dimensions = await page.evaluate(() => ({ view: innerWidth, content: document.documentElement.scrollWidth }));
          assert.ok(dimensions.content <= dimensions.view + 1, `${url}${anchor} at ${width}: ${dimensions.content}`);
        }
      }
    }
    assert.equal(assets.size, 41);
    assert.equal([...assets].filter(asset => asset.endsWith('-diagram.webp')).length, 8);
    for (const chunk of Array.from(assets).reduce((list, item, index) => { if (index % 8 === 0) list.push([]); list.at(-1).push(item); return list; }, [])) {
      await Promise.all(chunk.map(async path => {
        const result = await fetch(target + path);
        assert.equal(result.status, 200, path);
        assert.match(result.headers.get('content-type') || '', /image\/webp/, path);
        const resultBytes = Buffer.from(await result.arrayBuffer());
        assert.equal(resultBytes.subarray(8, 12).toString(), 'WEBP', path);
      }));
    }
    await page.goto(target + '/docs#paint', { waitUntil: 'domcontentloaded' });
    await page.locator('#paint h2').scrollIntoViewIfNeeded();
    await page.locator('img[src$="current-paint-workspace-diagram.webp"]').evaluate(img => img.decode());
    await page.screenshot({ path: 'work/current-docs-paint-desktop.png' });
    const shot = page.locator('a[href$="current-paint-workspace.webp"]').first();
    await shot.click();
    assert.match(page.url(), /current-paint-workspace\.webp$/);
    await page.setViewportSize({ width: 390, height: 880 });
    await page.goto(target + '/docs#publishing', { waitUntil: 'domcontentloaded' });
    await page.locator('#publishing h2').scrollIntoViewIfNeeded();
    await page.locator('img[src$="current-publish-route-diagram.webp"]').evaluate(img => img.decode());
    await page.screenshot({ path: 'work/current-docs-publishing-mobile.png' });
    console.log('Handbooks verified: 33 live workflow screenshots, 8 diagrams, image URLs, anchors and four viewport widths.');
  } finally {
    await browser?.close();
    if (server) server.kill();
    if (state) await rm(state, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
