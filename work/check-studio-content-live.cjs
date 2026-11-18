const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');

const password = readFileSync(0, 'utf8').trim();
assert.ok(password);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const hosts = new Set();
    const errors = [];
    let leakedCookie = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname.startsWith('cnt2-')) {
        if ((request.headers().cookie || '').includes('__Secure-99host_session=')) leakedCookie = true;
      }
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname.startsWith('cnt2-') && response.status() === 200) hosts.add(url.hostname);
    });
    await page.goto('https://plotstudio.pro/admin/sign-in');
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => /^dns-[a-z0-9]+\.plotstudio\.pro$/.test(url.hostname), { timeout: 45000 });
    await page.locator('#studio-frame.ready').waitFor({ timeout: 50000 });
    const studio = page.frameLocator('#studio-frame');
    await studio.locator('html[data-studio-boot="ready"]').waitFor();
    await studio.frameLocator('#design-frame').locator('h1').first().waitFor();
    assert.equal(hosts.size, 10);
    assert.equal(leakedCookie, false);
    for (const name of ['Logic', 'Data', 'Backend', 'Paint']) {
      await studio.getByRole('button', { name, exact: true }).click();
      if (name === 'Paint') await studio.getByRole('button', { name: 'Reference', exact: true }).waitFor();
    }
    await studio.getByRole('button', { name: 'Design', exact: true }).click();
    await studio.getByRole('button', { name: 'Preview', exact: true }).click();
    await studio.frameLocator('#preview-frame').locator('h1').first().waitFor();
    await studio.getByRole('button', { name: 'Close preview', exact: true }).click();
    await page.screenshot({ path: 'work/plot-distributed-studio-live.png' });
    assert.deepEqual(errors, []);
    const first = page.url();
    await page.goto('https://plotstudio.pro/studio/');
    await page.locator('#studio-frame.ready').waitFor({ timeout: 50000 });
    assert.notEqual(page.url(), first);
    await page.reload();
    await page.locator('#studio-frame.ready').waitFor({ timeout: 50000 });
    await page.frameLocator('#studio-frame').locator('#project-trigger').click();
    await page.frameLocator('#studio-frame').getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('https://plotstudio.pro/');
    console.log('Live Chrome passed all ten encrypted content hosts, TLS, workspace loading, Design/Logic/Data/Backend/Paint, preview, random entry, refresh and logout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
