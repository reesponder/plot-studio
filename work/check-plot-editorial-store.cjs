const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { mkdtemp } = require('node:fs/promises');
const { createServer } = require('node:net');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: sleep } = require('node:timers/promises');
const { chromium } = require('playwright');

const app = resolve(__dirname, '../outputs/plot-studio');
const certPaths = ['/certification/builder', '/certification/workflow-architect'];
const stripeScript = 'https://js.stripe.com/endive/stripe.js';

async function availablePort() {
  const probe = createServer();
  await new Promise((ready, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', ready);
  });
  const { port } = probe.address();
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
}

async function checkStore(browser, origin, termsVersion, width) {
  const viewport = { width, height: width < 600 ? 790 : 1000 };
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  const runtimeErrors = [];
  const clientAttempts = [];
  let stripeLoaded = 0;
  try {
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', entry => {
      if (/violates the following Content Security Policy|Refused to apply style/.test(entry.text())) runtimeErrors.push(entry.text());
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const readOnly = ['GET', 'HEAD'].includes(route.request().method());
      if (readOnly && (url.origin === origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')) {
        return route.fallback();
      }
      return route.abort();
    });
    await page.route(stripeScript, route => {
      stripeLoaded += 1;
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.Stripe = (publishableKey) => ({
          createEmbeddedCheckoutPage: async ({ fetchClientSecret }) => {
            const secret = await fetchClientSecret();
            if (publishableKey !== 'pk_test_EditorialFixture' || secret !== 'cs_test_EditorialFixture_secret_local') {
              throw new Error('Stripe fixture was invoked with unexpected fields.');
            }
            return {
              mount(element) {
                element.textContent = 'Checkout test mounted';
                element.dataset.stripeFixture = 'embedded';
              },
              destroy() {}
            };
          }
        });`,
      });
    });
    await page.route(origin + '/license/checkout/session', route => {
      const req = route.request();
      clientAttempts.push({ method: req.method(), version: req.headers()['x-plot-accepted-terms'] });
      return clientAttempts.length === 1
        ? route.fulfill({ status: 503, json: { error: 'Test outage' } })
        : route.fulfill({ json: { publishableKey: 'pk_test_EditorialFixture', clientSecret: 'cs_test_EditorialFixture_secret_local' } });
    });

    const response = await page.goto(origin + '/license', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-security-policy'], /script-src 'self' https:\/\/js\.stripe\.com/);
    const notice = page.getByRole('button', { name: 'Got it', exact: true });
    await notice.click();
    const main = page.locator('main');
    await assertCount(main.getByRole('heading', { level: 1 }), 1);
    await assertCount(main.getByRole('heading', { level: 1, name: 'Store', exact: true }), 1);
    const studio = main.locator('#studio-licence');
    await assertCount(studio.getByRole('heading', { level: 2, name: 'Studio Lifetime', exact: true }), 1);
    const comparison = main.locator('#shop-exams');
    await assertCount(comparison, 1);
    assert.deepEqual(await comparison.getByRole('columnheader').allTextContents(), ['Certified Builder', 'Certified Workflow Architect']);
    const catalogue = main.locator('.shop-catalogue .shop-product-link');
    assert.deepEqual(await catalogue.evaluateAll(items => items.map(item => item.getAttribute('href'))), ['#studio-licence', ...certPaths]);
    assert.deepEqual(await catalogue.locator('img').evaluateAll(images => images.map(image => new URL(image.src).pathname)), [
      '/99host-assets/store-studio.webp', '/99host-assets/store-builder.webp', '/99host-assets/store-architect.webp',
    ]);
    await catalogue.first().click();
    assert.equal(new URL(page.url()).hash, '#studio-licence');
    await page.evaluate(() => { history.replaceState(null, '', location.pathname); window.scrollTo(0, 0); });
    const purchase = studio.locator('#license-purchase');
    const buy = purchase.locator('#license-buy');
    const terms = purchase.getByRole('checkbox');
    await assertCount(main.locator('#license-purchase'), 1);
    await assertCount(purchase, 1);
    await assertCount(purchase.locator('button[type="submit"]'), 1);
    assert.equal(await purchase.getAttribute('data-terms-version'), termsVersion);
    assert.equal(await terms.evaluate(input => input.required), true);
    const [documentWidth, windowWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(documentWidth <= windowWidth, `${width}px viewport produces ${documentWidth}px of page width.`);
    const [purchaseTop, infoTop] = await studio.evaluate(section => [
      section.querySelector('.shop-purchase').getBoundingClientRect().top,
      section.querySelector('.shop-licence-info').getBoundingClientRect().top,
    ]);
    if (width < 600) assert(purchaseTop < infoTop, 'Phone layout should show purchase before the product preview.');
    const fulfilment = await studio.locator('.shop-fulfilment dt').evaluateAll(labels => labels.map(label => {
      const luminance = color => color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number)
        .map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        .reduce((result, value, index) => result + value * [.2126, .7152, .0722][index], 0);
      const foreground = luminance(getComputedStyle(label).color);
      const background = luminance(getComputedStyle(label.closest('#studio-licence')).backgroundColor);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    }));
    assert(fulfilment.length === 2 && fulfilment.every(ratio => ratio >= 4.5), `Fulfilment label contrast: ${fulfilment.join(', ')}.`);

    for (const certPath of certPaths) {
      const link = main.locator(`a[href="${certPath}"]`).first();
      assert.equal(await link.isVisible(), true, certPath);
      const destination = await page.request.get(origin + certPath);
      assert.equal(destination.status(), 200, certPath);
    }
    const shownImages = await main.locator('img:visible').all();
    for (const image of shownImages) await image.evaluate(element => {
      element.loading = 'eager';
      return element.decode();
    });

    const menu = page.locator('#plot-main-navigation');
    const menuButton = page.locator('.plot-menu-button');
    assert.equal(await menuButton.isVisible(), width < 600);
    if (width < 600) {
      await menuButton.press('Enter');
      assert.equal(await menu.getByRole('link', { name: 'Store', exact: true }).isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await menu.isVisible(), false);
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({ path: join(__dirname, `plot-editorial-store-${width}.png`), fullPage: true });

    const dialog = page.locator('#license-checkout');
    await buy.click();
    assert.equal(await terms.evaluate(input => input.validity.valueMissing), true);
    assert.equal(await dialog.isVisible(), false);
    assert.equal(clientAttempts.length, 0);
    assert.equal(stripeLoaded, 0);

    await terms.check();
    await buy.click();
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByText('Checkout is temporarily unavailable. Please try again shortly.', { exact: true }).waitFor();
    assert.deepEqual(clientAttempts, [{ method: 'POST', version: termsVersion }]);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'license-checkout-heading');
    const retry = dialog.getByRole('button', { name: 'Try again', exact: true });
    await retry.click();
    await dialog.getByText('Checkout test mounted', { exact: true }).waitFor();
    assert.deepEqual(clientAttempts, Array.from({ length: 2 }, () => ({ method: 'POST', version: termsVersion })));
    assert.equal(stripeLoaded, 1);
    assert.equal(await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 2 &&
        Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 2;
    }), true);
    const closer = dialog.getByRole('button', { name: 'Close checkout', exact: true });
    await closer.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'license-buy');
    await buy.click();
    await dialog.locator('[data-stripe-fixture="embedded"]').waitFor();
    assert.equal(clientAttempts.length, 2);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).pathname, '/license');
    assert.deepEqual(runtimeErrors, []);

    await assertCount(main.locator('.shop-thumbnails, [data-shop-cover], #shop-media-caption'), 0);
    console.log(`${width}px: catalogue links, unique purchase, terms gate, retry, modal centre/focus and mock Stripe passed.`);
  } finally {
    await page.close();
  }
}

async function assertCount(locator, count) {
  assert.equal(await locator.count(), count, String(locator));
}

(async () => {
  const { checkoutTermsVersion } = await import(pathToFileURL(join(app, 'stripe-checkout.mjs')));
  const live = process.argv.includes('--live');
  let origin = 'https://plotstudio.pro';
  let server;
  let browser;
  try {
    if (!live) {
      const port = await availablePort();
      origin = `http://127.0.0.1:${port}`;
      const state = await mkdtemp(join(__dirname, 'editorial-store-state-'));
      const localEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PLOT_')));
      server = spawn(process.execPath, [join(app, 'server.mjs')], {
        env: { ...localEnv, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
          STUDIO_PASSWORD_HASH: `scrypt$32768$8$1$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`,
          STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url') },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      let ready = false;
      for (let attempt = 0; attempt < 30 && !ready; attempt++) {
        try { ready = (await fetch(origin + '/license')).ok; } catch { await sleep(100); }
      }
      assert(ready, 'Local store fixture server did not start.');
    }
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    for (const width of [320, 390, 1440]) await checkStore(browser, origin, checkoutTermsVersion, width);
  } finally {
    await browser?.close();
    server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
