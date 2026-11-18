const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const { resolve } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const port = 15439;
const origin = 'http://localhost:' + port;
const server = 'outputs/plot-studio/server.mjs';

(async () => {
  const state = await mkdtemp(resolve('work', 'docs-discovery-state-'));
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
      try { if ((await fetch(origin + '/docs')).ok) break; } catch {}
      await wait(100);
    }
    const css = await fetch(origin + '/99host-assets/docs.css?v=9');
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.intro-design-link/);
    browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    for (const [width, height] of [[320, 568], [390, 844], [1440, 930]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        const response = await page.goto(origin + '/docs', { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        const cookie = page.getByRole('button', { name: 'Got it' });
        await cookie.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        if (await cookie.isVisible()) await cookie.click();
        const navigation = page.getByRole('navigation', { name: 'More documentation' });
        const cta = navigation.getByRole('link', { name: 'Open the Design Handbook', exact: true });
        const geometry = await cta.boundingBox();
        assert(geometry && geometry.height >= 44 && geometry.y + geometry.height <= height, JSON.stringify(geometry));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        assert.equal(await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Design Handbook and templates' }).getAttribute('href'), '/docs/design');
        assert(await cta.evaluate(link => getComputedStyle(link).backgroundColor === 'rgb(233, 228, 216)'));
        if (width !== 320) await page.screenshot({ path: resolve('work', 'docs-design-discovery-' + width + '.png') });
        await cta.focus();
        await cta.press('Enter');
        await page.waitForURL(origin + '/docs/design');
        await page.getByRole('heading', { level: 1, name: /Design handbook/i }).waitFor();
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await navigation.getByRole('link', { name: 'Node reference', exact: true }).click();
        await page.waitForURL(origin + '/docs/nodes');
        await page.getByRole('heading', { level: 1, name: 'Node reference', exact: true }).waitFor();
        const handbook = page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Design Handbook', exact: true });
        const menuGeometry = await handbook.boundingBox();
        assert(menuGeometry && menuGeometry.y + menuGeometry.height <= height);
        await handbook.click();
        await page.waitForURL(origin + '/docs/design');
        console.log(width + '×' + height + ' first-fold CTA, keyboard route, TOC and Node reference cross-link passed.');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

