const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

const alias = 'https://dns-k47.plotstudio.pro';
const canonical = 'https://plotstudio.pro';
const workspace = alias + '/studio/?workspace=1';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath() });
  try {
    const [shell, script, styles] = await Promise.all(['html', 'mjs', 'css'].map(ext =>
      readFile('outputs/plot-studio/studio-alias.' + ext, 'utf8')));

    for (const state of ['authenticated', 'anonymous', 'network-error', 'editor-timeout']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      let probes = 0;
      let frameRequests = 0;
      await page.route(workspace, route => route.fulfill({ contentType: 'text/html', body: shell }));
      await page.route(alias + '/xaxxaxaxaxa.mjs', route => route.fulfill({ contentType: 'text/javascript', body: script }));
      await page.route(alias + '/xaxxaxaxaxa.css', route => route.fulfill({ contentType: 'text/css', body: styles }));
      await page.route(canonical + '/studio/session', route => {
        probes++;
        assert.equal(route.request().method(), 'GET');
        assert.equal(route.request().headers().origin, alias);
        if (state === 'network-error') return route.abort('failed');
        return route.fulfill({
          status: state === 'anonymous' ? 401 : 200,
          headers: { 'access-control-allow-origin': alias, 'access-control-allow-credentials': 'true' },
          json: { authenticated: state !== 'anonymous' },
        });
      });
      await page.route(canonical + '/studio/editor', route => {
        frameRequests++;
        assert.equal(route.request().headers().referer, alias + '/');
        const ready = state === 'editor-timeout' ? '' : '<script>parent.postMessage({type:"plot-studio:ready"},new URL(document.referrer).origin)</script>';
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><h1>Test editor</h1>' + ready,
          headers: { 'content-security-policy': 'frame-ancestors ' + alias },
        });
      });
      if (state === 'editor-timeout') await page.clock.install();
      await page.goto(workspace);
      const frame = page.locator('#studio-frame');
      if (state === 'authenticated') {
        await frame.waitFor({ state: 'visible' });
        await page.frameLocator('#studio-frame').getByText('Test editor').waitFor();
        assert.equal(await page.locator('#studio-access').isVisible(), false);
        assert.deepEqual(await frame.boundingBox(), { x: 0, y: 0, width: 390, height: 844 });
      } else {
        if (state === 'editor-timeout') {
          assert.equal(await frame.isVisible(), false);
          await page.clock.runFor(45010);
        }
        const message = state === 'anonymous' ? 'Sign in to open the editor.' : 'Studio could not load. Try again or sign in.';
        await page.locator('#studio-status').getByText(message).waitFor();
        const signIn = page.getByRole('link', { name: 'Sign in' });
        assert.equal(await signIn.getAttribute('href'), canonical + '/sign-in');
        assert.equal(await signIn.getAttribute('target'), '_top');
        const retry = page.getByRole('link', { name: 'Try again', exact: true });
        assert.equal(await retry.isVisible(), state !== 'anonymous');
        if (state !== 'anonymous') assert.equal(await retry.getAttribute('href'), '/studio/');
        assert.equal(await page.getByRole('link', { name: 'Open Studio directly' }).count(), 0);
        assert.equal(await frame.isVisible(), false);
      }
      assert.equal(probes, 1);
      assert.equal(frameRequests, ['authenticated', 'editor-timeout'].includes(state) ? 1 : 0);
      assert.equal(page.url(), workspace);
      await page.close();
    }
    console.log('Alias shell passed cross-origin editor handshake, mobile layout, unauthenticated state, network failure, and iframe timeout.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
