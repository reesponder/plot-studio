const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const { resolve } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const port = 15446;
const origin = 'http://localhost:' + port;
const server = 'outputs/plot-studio/server.mjs';

(async () => {
  const state = await mkdtemp(resolve('work', 'home-entry-brand-'));
  const hash = spawnSync(process.execPath, [server, 'hash'], { input: randomBytes(18).toString('base64url'), encoding: 'utf8' });
  assert.equal(hash.status, 0);
  const child = spawn(process.execPath, [server], {
    env: {
      ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
      STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
    }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(origin)).ok) break; } catch {}
      await wait(100);
    }
    const css = await fetch(origin + '/99host-assets/public.css?v=14');
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.entry-title img/);
    browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    for (const [width, height] of [[320, 640], [390, 844], [1440, 930]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        const next = '/studio/';
        const response = await page.goto(origin + '/?next=' + encodeURIComponent(next) + '#studio-login', { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        const cookie = page.getByRole('button', { name: 'Got it' });
        await cookie.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        if (await cookie.isVisible()) await cookie.click();
        const hero = page.locator('#studio-login');
        const title = hero.getByRole('heading', { name: 'PLOT Studio', level: 1, exact: true });
        const widthCheck = await title.evaluate(async element => {
          const logo = element.firstElementChild;
          await logo.decode();
          const img = logo.getBoundingClientRect(), wordmark = logo.nextElementSibling.getBoundingClientRect();
          return {
            screen: document.documentElement.scrollWidth, linkCount: element.querySelectorAll('a').length,
            textLeft: wordmark.left, logoRight: img.right, logoWidth: img.width,
            centerDelta: Math.abs(img.top + img.height / 2 - wordmark.top - wordmark.height / 2),
            lineHeight: parseFloat(getComputedStyle(logo.nextElementSibling).lineHeight), renderedHeight: wordmark.height,
          };
        });
        assert.equal(widthCheck.screen, width);
        assert.equal(widthCheck.linkCount, 0);
        assert(widthCheck.logoRight < widthCheck.textLeft && widthCheck.logoWidth >= 34 && widthCheck.centerDelta < 1);
        assert(Math.abs(widthCheck.lineHeight - widthCheck.renderedHeight) < 1, 'Heading should fit one line');
        assert.equal(await hero.getByRole('link', { name: /Design Handbook/i }).count(), 0);
        assert.equal(await page.locator('#overview a').first().getAttribute('href'), '/docs/design');
        assert.equal(await page.locator('form').getAttribute('action'), '/login');
        assert.equal(await page.locator('#login-next').inputValue(), next);
        await page.screenshot({ path: resolve('work', 'home-entry-brand-' + width + '.png') });
        const field = page.getByLabel('Access password');
        assert.equal(await field.evaluate(input => input.validity.valueMissing), true);
        await page.getByRole('button', { name: 'Show password' }).click();
        assert.equal(await field.getAttribute('type'), 'text');
        await page.getByRole('button', { name: 'Hide password' }).click();
        assert.equal(await field.getAttribute('type'), 'password');
        await field.fill('local test invalid password');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.getByRole('alert').waitFor({ state: 'visible' });
        assert.equal(await field.getAttribute('aria-invalid'), 'true');
        const design = page.locator('#overview').getByRole('link', { name: 'Open the Design Handbook', exact: true });
        await design.click();
        await page.waitForURL(origin + '/docs/design');
        console.log(width + '×' + height + ' wordmark, responsive hero, password gate and overview CTA passed.');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

