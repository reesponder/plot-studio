const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const site = 'https://plotstudio.pro';
const root = path.resolve(__dirname, '../outputs/plot-studio/public');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      if (!process.argv.includes('--live')) {
        const files = new Map([
          ['/license', ['license.html', 'text/html']],
          ['/99host-assets/docs.css', ['docs.css', 'text/css']],
          ['/99host-assets/site-chrome.css', ['site-chrome.css', 'text/css']],
          ['/99host-assets/site-chrome.mjs', ['site-chrome.mjs', 'text/javascript']],
          ['/99host-assets/license-checkout.mjs', ['license-checkout.mjs', 'text/javascript']],
        ]);
        for (const [url, [file, contentType]] of files) {
          await page.route(candidate => candidate.origin === site && candidate.pathname === url,
            route => route.fulfill({ path: path.join(root, file), contentType }));
        }
      }
      await page.route('https://js.stripe.com/endive/stripe.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: "window.Stripe = () => ({ createEmbeddedCheckoutPage: async ({fetchClientSecret}) => { await fetchClientSecret(); return { mount: el => { el.textContent = 'Checkout test mounted'; }, destroy() {} }; } });",
      }));
      let checkoutStarted = false;
      await page.route(site + '/license/checkout/session', route => {
        assert.equal(route.request().method(), 'POST');
        assert.match(route.request().headers()['x-plot-accepted-terms'], /^2026-11-16-r3$/);
        checkoutStarted = true;
        return route.fulfill({ json: { publishableKey: 'mock', clientSecret: 'mock' } });
      });
      await page.goto(site + '/license', { waitUntil: 'domcontentloaded' });
      await page.locator('.shop-media-stage img').evaluate(image => image.decode());
      const cookie = page.getByRole('button', { name: 'Got it' });
      await cookie.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
      if (await cookie.isVisible()) await cookie.click();
      assert.equal(await page.getByRole('heading', { level: 1, name: 'Studio Lifetime' }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.locator('.shop-exams a').evaluateAll(links => links.map(link => link.pathname)),
        ['/certification/builder', '/certification/workflow-architect']);
      const menu = page.locator('#plot-main-navigation');
      const toggle = page.locator('.plot-menu-button');
      assert.equal(await toggle.isVisible(), width === 390);
      if (width === 390) {
        await toggle.press('Enter');
        assert.equal(await menu.getByRole('link', { name: 'Store', exact: true }).isVisible(), true);
        await toggle.press('Enter');
        assert.equal(await menu.getByRole('link', { name: 'Store', exact: true }).isVisible(), false);
      }
      await page.screenshot({ path: path.join(__dirname, 'plot-new-store-' + width + '.png'), fullPage: true });
      await page.locator('.shop-thumbnails').getByRole('link', { name: 'Blueprint', exact: true }).click();
      assert.match(await page.locator('#shop-media-image').getAttribute('src'), /overview-blueprint\.webp$/);
      assert.match(await page.locator('#shop-media-link').getAttribute('href'), /overview-blueprint\.webp$/);
      await page.getByRole('button', { name: 'Continue to checkout' }).click();
      assert.equal(checkoutStarted, false);
      await page.locator('#license-purchase input').check();
      await page.getByRole('button', { name: 'Continue to checkout' }).click();
      await page.getByText('Checkout test mounted').waitFor();
      assert.equal(checkoutStarted, true);
      await page.getByRole('button', { name: 'Close checkout' }).click();
      assert.equal(await page.locator('#license-checkout').isVisible(), false);
      console.log('Store, gallery, mobile menu and mocked Stripe checkout passed at ' + width + 'px');
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
