const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const origin = 'http://localhost:15191';
const entry = resolve('outputs/plot-studio/server.mjs');
const token = () => randomBytes(32).toString('base64url');
const password = token();
const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
const endpoint = '/studio/api/assets/stock';
assert.equal(hash.status, 0, hash.stderr);

async function run() {
  const state = await mkdtemp(join(tmpdir(), 'plot-stock-ui-'));
  const env = { ...process.env, PORT: '15191', PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
    STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_FILE_KEY: token(), PLOT_PROJECT_STORAGE_KEY: token() };
  let child;
  let browser;
  async function start() {
    child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'ignore', 'inherit'] });
    let ready;
    for (let retry = 0; retry < 50 && !ready; retry++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await wait(100);
    }
    assert.ok(ready);
  }
  async function stop() {
    if (child && child.exitCode === null) await new Promise(done => { child.once('exit', done); child.kill(); });
  }
  async function authenticate() {
    const login = await fetch(origin + '/login', { method: 'POST', redirect: 'manual',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }),
    });
    assert.equal(login.status, 303);
    return login.headers.get('set-cookie').split(';')[0];
  }
  try {
    await start();
    assert.equal((await fetch(origin + endpoint)).status, 401);
    let cookie = await authenticate();
    const get = async query => {
      const result = await fetch(origin + endpoint + query, { headers: { Cookie: cookie } });
      assert.equal(result.status, 200);
      return result.json();
    };
    const first = await get('');
    assert.ok(first.total >= 679);
    assert.equal(first.assets.length, 36);
    assert.ok(first.categories.includes('Panoramas'));
    const second = await get('?offset=' + first.nextCursor);
    assert.ok(second.assets.every(photo => !first.assets.some(item => item.id === photo.id)));
    const landscapes = await get('?q=france&category=Panoramas&shape=panorama');
    assert.equal(landscapes.total, 15);
    assert.ok(landscapes.assets.every(photo => photo.category === 'Panoramas' && photo.location === 'France'));
    const portraits = await get('?shape=portrait');
    assert.ok(portraits.total >= 20);
    assert.ok(portraits.assets.every(photo => photo.height > photo.width));
    assert.equal((await get('?q=entirely-nonexistent-catalog-photo')).total, 0);
    const lake = (await get('?q=lakeside+cabin')).assets.find(photo => photo.url.endsWith('architecture-12-lakeside-cabin.jpg'));
    assert.ok(lake);
    assert.equal((await fetch(lake.thumbnail)).headers.get('content-type'), 'image/jpeg');
    const education = (await get('?q=putting+up+a+science+display')).assets[0];
    assert.equal((await fetch(education.thumbnail)).headers.get('content-type'), 'image/webp');
    const importPath = endpoint + '/' + lake.id + '?revision=' + lake.revision;
    const request = (path, requestOrigin = origin, activeCookie = cookie) => fetch(origin + path, {
      method: 'POST', headers: { Origin: requestOrigin, Cookie: activeCookie },
    });
    assert.equal((await request(importPath, 'https://different.example')).status, 403);
    assert.equal((await request(importPath, origin, '')).status, 401);
    assert.equal((await request(endpoint + '/' + lake.id + '?revision=invalid')).status, 409);
    assert.equal((await request(endpoint + '/999999?revision=' + lake.revision)).status, 404);
    assert.equal((await request(endpoint + '/arbitrary?url=https://different.example')).status, 404);
    const imported = await request(importPath);
    assert.equal(imported.status, 201, await imported.clone().text());
    const importedAsset = (await imported.json()).asset;
    assert.equal(importedAsset.alt, lake.description);
    assert.equal((await fetch(importedAsset.url)).headers.get('content-type'), 'image/jpeg');
    assert.equal((await request(importPath)).status, 200);
    if (process.argv.includes('--api-only')) {
      await stop();
      await start();
      cookie = await authenticate();
      const repeated = await request(importPath);
      assert.equal(repeated.status, 200);
      assert.equal((await repeated.json()).asset.url, importedAsset.url);
      console.log('Official catalog, filters, pagination, authenticated and validated import, public URL, and deduplication after restart verified.');
      return;
    }

    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.setDefaultTimeout(13000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    const dialog = page.getByRole('dialog', { name: 'Image assets' });
    const open = () => page.getByRole('button', { name: 'Assets', exact: true }).click();
    const search = dialog.getByRole('searchbox', { name: 'Search The Stock of Freedom' });
    await open();
    await dialog.getByRole('button', { name: 'The Stock of Freedom' }).click();
    await dialog.getByRole('link', { name: 'Read source license' }).waitFor();
    const categories = dialog.getByLabel('Category', { exact: true });
    await categories.locator('option[value="Architecture & Buildings"]').waitFor({ state: 'attached' });
    await categories.selectOption('Architecture & Buildings');
    await dialog.getByText('15 images', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('[data-image-list] img')];
      return images.length === 15 && images.every(img => img.complete && img.naturalWidth > 0);
    });
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('[data-image-list] img')].map(img => img.decode()));
    });
    await page.screenshot({ path: 'work/plot-stock-browse-desktop.png' });
    await categories.selectOption('');
    await search.fill('lakeside cabin');
    await dialog.getByRole('button', { name: lake.name, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-image-preview]').naturalWidth > 0);
    await page.screenshot({ path: 'work/plot-stock-search-desktop.png' });
    await dialog.getByRole('button', { name: 'Copy link' }).click();
    const savedUrl = dialog.getByLabel('Public image URL');
    await savedUrl.waitFor();
    const url = await savedUrl.inputValue();
    assert.match(url, /\/asset\/[a-f0-9]{32}\.jpg$/);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
    const publicImage = await fetch(url);
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('content-type'), 'image/jpeg');
    await dialog.getByRole('button', { name: 'Use on page' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const design = page.frameLocator('#design-frame');
    const inserted = design.locator(`img[src="${url}"]`);
    await inserted.waitFor();
    assert.equal(await inserted.getAttribute('alt'), lake.description);
    await page.getByRole('button', { name: 'Choose from assets' }).click();
    await search.fill('putting up a science display');
    await dialog.getByRole('button', { name: education.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Apply to field' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await inserted.waitFor({ state: 'detached' });
    const assetList = await fetch(origin + '/studio/api/assets', { headers: { Cookie: cookie } }).then(res => res.json());
    const replacement = assetList.assets.find(item => item.stockId === education.id);
    assert.ok(replacement?.url);
    await design.locator(`img[src="${replacement.url}"]`).waitFor();

    await open();
    await search.fill('lakeside cabin');
    await dialog.getByRole('button', { name: lake.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on canvas' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const placement = page.locator('#canvas-place-tools');
    await placement.waitFor();
    await design.locator('html[data-plot-placing]').waitFor();
    const targetBlock = design.locator('[data-block-type="hero"]').first();
    await targetBlock.evaluate(block => block.scrollIntoView({ block: 'center' }));
    const box = await targetBlock.boundingBox();
    assert.ok(box?.height);
    const location = { x: box.x + 30, y: box.y + box.height * 0.72 };
    await page.mouse.move(location.x, location.y);
    await targetBlock.and(design.locator('[data-plot-drop="after"]')).waitFor();
    await page.screenshot({ path: 'work/plot-stock-place-desktop.png' });
    await page.mouse.click(location.x, location.y);
    await inserted.waitFor();
    await placement.waitFor({ state: 'hidden' });
    assert.equal(await targetBlock.locator('xpath=following-sibling::*[1]').locator(`img[src="${url}"]`).count(), 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    await search.fill('paper project review');
    const mobileResult = dialog.getByRole('button', { name: 'Paper project review', exact: true });
    await mobileResult.click();
    await dialog.getByRole('button', { name: 'Use on page' }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-image-preview]').naturalWidth > 0);
    await page.screenshot({ path: 'work/plot-stock-search-mobile.png' });
    await dialog.getByRole('button', { name: 'Back to results' }).click();
    await mobileResult.waitFor();
    await dialog.getByRole('button', { name: 'My images' }).click();
    await dialog.getByRole('button', { name: /architecture-12-lakeside-cabin/ }).waitFor();
    assert.deepEqual(errors, []);

    await browser.close();
    browser = null;
    await stop();
    await start();
    cookie = await authenticate();
    const repeated = await request(importPath);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).asset.url, url);
    console.log('Official catalog, filters and pagination, public import and deduplication after restart, alt text, stock replacement, canvas placement, mobile selection and clipboard verified.');
  } finally {
    await browser?.close();
    await stop();
    await rm(state, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
