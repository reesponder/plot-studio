const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const assets = resolve('outputs', 'plot-studio', 'public');
const mime = { html: 'text/html; charset=utf-8', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript', webp: 'image/webp', plot: 'application/json' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = path === '/docs/design' ? resolve(assets, 'design-handbook.html') : path.startsWith('/99host-assets/')
    ? resolve(assets, /\.(?:webp|plot)$/i.test(path) ? 'media' : '', path.slice('/99host-assets/'.length)) : '';
  try {
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[file.split('.').at(-1)] || 'application/octet-stream',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless:true });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.text().includes('violates the following Content Security Policy')) errors.push(message.text()); });
      await page.goto('http://127.0.0.1:' + server.address().port + '/docs/design', { waitUntil: 'networkidle' });
      await page.locator('.plot-cookie-dismiss').click();
      await page.locator('.design-hero-image img').evaluate(image => image.decode()); await page.locator('.plot-site-header .plot-site-brand img').evaluate(image => image.decode());
      await page.evaluate(() => document.fonts.ready);
      const checks = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        allAnchorsPresent: [...document.querySelectorAll('.design-index a')].every(link=>document.querySelector(link.hash)),
        hero: document.querySelector('.design-hero h1').innerText,
        swatch: getComputedStyle(document.querySelector('.design-sample-page'), '::before').backgroundColor,
        headingCount: document.querySelectorAll('h1').length,
      }));
      assert.equal(checks.width, width);
      assert.equal(checks.swatch, 'rgb(244, 241, 234)');
      assert.equal(checks.headingCount, 1);
      assert.equal(checks.hero, 'Design handbook');
      assert.equal(checks.allAnchorsPresent, true);
      if (width < 860) {
        await page.locator('.plot-site-header .plot-menu-button').click();
        const open = page.locator('.plot-site-header .plot-site-action');
        assert(await open.isVisible());
        assert.equal(await open.evaluate(a => getComputedStyle(a).color), 'rgb(244, 243, 240)');
        await page.keyboard.press('Escape');
        assert(!(await open.isVisible()));
      }
      await page.locator('.design-hero .design-button').click();
      assert.equal(new URL(page.url()).hash, '#templates');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: 'work/design-handbook-' + width + '.png' });
      assert.deepEqual(errors, []);
      console.log(width + 'px passed, swatches and menu visible.');
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

