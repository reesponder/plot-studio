const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const live = process.argv.includes('--live');
const base = 'https://plotstudio.pro';
const root = path.resolve(__dirname, '../outputs/plot-studio/public');
const files = {
  '/': ['index.html', 'text/html'],
  '/docs': ['docs.html', 'text/html'],
  '/license': ['license.html', 'text/html'],
  '/99host-assets/site-chrome.css': ['site-chrome.css', 'text/css'],
  '/99host-assets/site-chrome.mjs': ['site-chrome.mjs', 'text/javascript'],
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.setDefaultTimeout(7000);
    if (!live) await page.route(url => url.origin === base && !!files[url.pathname], route => {
      const [name, contentType] = files[new URL(route.request().url()).pathname];
      return route.fulfill({ path: path.join(root, name), contentType });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const cookie = page.getByRole('button', { name: 'Got it' });
    await cookie.waitFor({ timeout: 3000 }).catch(() => {});
    if (await cookie.isVisible()) await cookie.click();
    const toggle = page.locator('.plot-menu-button');
    const nav = page.locator('#plot-main-navigation');
    async function state(open) {
      await nav.waitFor({ state: open ? 'visible' : 'hidden' });
      assert.equal(await toggle.getAttribute('aria-expanded'), String(open));
      assert.equal(await toggle.getAttribute('aria-label'), `${open ? 'Close' : 'Open'} navigation`);
    }
    await state(false);
    await toggle.tap();
    await state(true);
    const menu = await nav.boundingBox();
    assert.deepEqual([menu.x, menu.y, menu.width], [0, 72, 390]);
    await page.screenshot({ path: path.join(__dirname, 'plot-mobile-nav-open.png') });
    await toggle.tap();
    await state(false);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await state(true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Overview');
    await page.keyboard.press('Escape');
    await state(false);
    assert.equal(await toggle.evaluate(button => button === document.activeElement), true);
    await toggle.tap();
    await nav.getByRole('link', { name: 'Overview', exact: true }).tap();
    await page.waitForURL('**/#overview');
    await state(false);
    await page.waitForFunction(() => document.querySelector('#overview').getBoundingClientRect().top >= 71 || scrollY > 400);
    assert.equal((await toggle.boundingBox()).y, 14);
    await toggle.tap();
    await nav.getByRole('link', { name: 'Docs', exact: true }).tap();
    await page.waitForURL('**/docs');
    await state(false);
    if (live) {
      for (const route of ['/docs/nodes', '/license', '/certification']) {
        await page.goto(base + route, { waitUntil: 'domcontentloaded' });
        await state(false);
        await toggle.tap();
        await state(true);
        await toggle.tap();
        await state(false);
      }
    }
    await page.setViewportSize({ width: 860, height: 844 });
    await toggle.tap();
    await state(true);
    await page.setViewportSize({ width: 861, height: 844 });
    await toggle.waitFor({ state: 'hidden' });
    await nav.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 390, height: 844 });
    await state(false);
    console.log(`${live ? 'Live' : 'Local'}: touch, geometry, keyboard focus, same-page and cross-page links, sticky header, responsive reset passed.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
