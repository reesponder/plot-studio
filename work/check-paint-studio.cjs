const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const origin = 'http://localhost:15186';
const entry = resolve('outputs/plot-studio/server.mjs');
const token = () => randomBytes(32).toString('base64url');
const password = token();
const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);

async function run() {
  const state = await mkdtemp(join(tmpdir(), 'plot-paint-ui-'));
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: '15186', PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
    STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_FILE_KEY: token(), PLOT_PROJECT_STORAGE_KEY: token() }, stdio: ['ignore', 'ignore', 'inherit'] });
  let browser;
  try {
    let ready;
    for (let retry = 0; retry < 50 && !ready; retry++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await wait(125);
    }
    assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.setDefaultTimeout(11000);
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(origin + '/admin/sign-in');
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    for (const width of [320, 360, 375, 390, 430, 480, 540, 768, 990, 1155, 1310]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.locator('.mode-switch').evaluate(el => el.getBoundingClientRect().right <= innerWidth), true, `Toolbar at ${width}px`);
      if (width >= 761) assert.equal(await page.evaluate(() => document.querySelector('.mode-switch').getBoundingClientRect().right <= [...document.querySelector('.app-actions').children].find(el => el.getClientRects().length).getBoundingClientRect().left), true, `Actions at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = await page.evaluate(() => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 48, height: 36 });
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 48, 36);
      context.fillStyle = '#984dec';
      context.fillRect(12, 8, 24, 22);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const assetDialog = page.getByRole('dialog', { name: 'Image assets' });
    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await page.locator('[data-image-upload]').setInputFiles({ name: 'Purple stamp.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    await assetDialog.getByRole('heading', { name: 'Purple stamp.png' }).waitFor();
    const url = await assetDialog.getByLabel('Public image URL').inputValue();
    assert.match(url, /\/asset\/[a-f0-9]{32}\.png$/);
    assert.equal((await fetch(url)).headers.get('content-type'), 'image/png');
    await assetDialog.getByRole('button', { name: 'Copy link' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
    await page.screenshot({ path: 'work/plot-assets-desktop.png' });
    await assetDialog.getByRole('button', { name: 'Use on page' }).click();
    const design = page.frameLocator('#design-frame');
    await design.locator(`img[src="${url}"]`).waitFor();
    await page.getByRole('button', { name: 'Choose from assets' }).waitFor();
    await page.getByRole('button', { name: 'Choose from assets' }).click();
    await assetDialog.getByRole('button', { name: 'Purple stamp.png' }).click();
    await assetDialog.getByRole('button', { name: 'Apply to field' }).click();
    await design.locator(`img[src="${url}"]`).waitFor();

    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await assetDialog.getByRole('button', { name: 'Purple stamp.png' }).click();
    await assetDialog.getByRole('button', { name: 'Edit in Paint' }).click();
    const paint = page.locator('#paint-workspace');
    const canvas = paint.locator('[data-paint-canvas]');
    await canvas.waitFor();
    await assetDialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await canvas.evaluate(el => [el.width, el.height]), [48, 36]);
    assert.equal(await canvas.evaluate(el => el.getContext('2d').getImageData(0, 0, 1, 1).data[3]), 255);
    await paint.getByRole('button', { name: 'Remove background', exact: true }).click();
    await paint.locator('[data-paint-dialog][open] [data-paint-confirm]').click();
    assert.equal(await canvas.evaluate(el => el.getContext('2d').getImageData(0, 0, 1, 1).data[3]), 0);
    assert.equal(await canvas.evaluate(el => el.getContext('2d').getImageData(20, 14, 1, 1).data[3]), 255);

    await paint.getByRole('button', { name: 'Save asset', exact: true }).click();
    const link = paint.locator('[data-paint-link]');
    await link.waitFor();
    const rendered = await link.inputValue();
    assert.match(rendered, /\/asset\/[a-f0-9]{32}\.png$/);
    assert.notEqual(rendered, url);
    const saved = await (await fetch(rendered)).arrayBuffer();
    assert.equal(Buffer.from(saved).subarray(1, 4).toString(), 'PNG');
    await paint.getByRole('button', { name: 'Export', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), paint.locator('[data-paint-dialog][open] [data-paint-confirm]').click()]);
    assert.equal((await readFile(await download.path())).subarray(1, 4).toString(), 'PNG');

    await paint.getByRole('button', { name: 'Add sheet' }).click();
    await paint.locator('[data-paint-dialog][open] [data-paint-confirm]').click();
    assert.ok(await paint.getByRole('tab').count() >= 3);
    await paint.getByRole('tab', { name: /Purple stamp/ }).click();
    assert.equal(await link.inputValue(), rendered);
    await paint.getByLabel('Upload changes automatically').check();
    await paint.getByRole('button', { name: 'Pencil', exact: true }).click();
    await canvas.click();
    await page.waitForFunction(previous => document.querySelector('[data-paint-link]').value !== previous, rendered, { timeout: 19000 });
    const updated = await link.inputValue();
    assert.match(updated, /\/asset\/[a-f0-9]{32}\.png$/);
    assert.equal((await fetch(updated)).status, 200);
    await paint.getByLabel('Upload changes automatically').uncheck();
    await page.screenshot({ path: 'work/plot-paint-desktop.png' });
    await paint.getByRole('button', { name: 'Use on page' }).click();
    await design.locator(`img[src="${updated}"]`).waitFor();

    await page.getByRole('button', { name: 'Paint', exact: true }).click();
    await paint.getByRole('tab', { name: 'Sheet 3', exact: true }).click();
    await paint.getByRole('button', { name: 'Reference', exact: true }).click();
    const controls = paint.getByRole('region', { name: 'Tracing reference' });
    const underlay = paint.locator('[data-paint-reference-image]');
    await controls.getByRole('button', { name: 'Choose from Assets' }).click();
    await assetDialog.getByRole('button', { name: 'Purple stamp.png', exact: true }).click();
    await assetDialog.getByRole('button', { name: 'Use as reference' }).click();
    await assetDialog.waitFor({ state: 'hidden' });
    await underlay.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-paint-reference-image]').naturalWidth === 48);
    const bounds = await canvas.boundingBox();
    assert.deepEqual(await underlay.boundingBox(), bounds, 'Reference and drawing share the same zoom and canvas alignment');
    const pixel = (x, y) => canvas.evaluate((el, [x, y]) => [...el.getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
    assert.equal((await pixel(0, 0))[3], 0, 'The visible reference has no drawing pixels');
    await controls.getByRole('slider', { name: /Opacity/ }).fill('65');
    await controls.getByLabel('Layout').selectOption('cover');
    await controls.getByLabel('Show through white').check();
    assert.equal(await canvas.evaluate(el => getComputedStyle(el).mixBlendMode), 'multiply');
    await paint.getByRole('button', { name: 'Pencil', exact: true }).click();
    await page.mouse.move(bounds.x + bounds.width * .35, bounds.y + bounds.height * .50);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .50, { steps: 10 });
    await page.mouse.up();
    const drawingHasInk = el => el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((value, idx) => idx % 4 === 3 && value > 0);
    assert.ok(await canvas.evaluate(drawingHasInk));
    await controls.getByLabel('Show reference').uncheck();
    await underlay.waitFor({ state: 'hidden' });
    assert.equal(await canvas.evaluate(el => getComputedStyle(el).mixBlendMode), 'normal');
    assert.ok(await canvas.evaluate(drawingHasInk));
    await controls.getByLabel('Show reference').check();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), controls.getByRole('button', { name: 'Choose file' }).click()]);
    await chooser.setFiles({ name: 'Local tracing.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    await controls.getByText('Local tracing.png').waitFor();
    await underlay.waitFor();
    await page.screenshot({ path: 'work/plot-paint-reference-desktop.png' });
    await paint.getByRole('button', { name: 'Export', exact: true }).click();
    const [tracingDownload] = await Promise.all([page.waitForEvent('download'), paint.locator('[data-paint-dialog][open] [data-paint-confirm]').click()]);
    const exportPixels = await page.evaluate(async (base64) => {
      const png = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' });
      const bitmap = await createImageBitmap(png);
      const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return { cornerAlpha: pixels[3], hasInk: pixels.some((v, i) => i % 4 === 3 && v > 0) };
    }, (await readFile(await tracingDownload.path())).toString('base64'));
    assert.deepEqual(exportPixels, { cornerAlpha: 0, hasInk: true });
    const referenceWasSaved = () => page.evaluate(() => new Promise(resolve => {
      const open = indexedDB.open('plot-studio.paint.v1', 1);
      open.onsuccess = () => {
        const query = open.result.transaction('workspace').objectStore('workspace').getAll();
        query.onsuccess = () => {
          const active = query.result.find(row => row.id === '@workspace')?.active;
          resolve(query.result.some(row => row.id === active && row.name === 'Sheet 3' && row.reference?.name === 'Local tracing.png'));
          open.result.close();
        };
      };
    }));
    let referenceSaved = false;
    for (let attempt = 0; attempt < 40 && !referenceSaved; attempt++) {
      referenceSaved = await referenceWasSaved();
      if (!referenceSaved) await wait(100);
    }
    assert.ok(referenceSaved, 'The active sheet and image reference were saved together');
    await page.reload();
    await page.getByRole('button', { name: 'Paint', exact: true }).click();
    await page.locator('#paint-editor[data-paint-restoring="false"]').waitFor();
    assert.equal(await paint.getByRole('tab', { name: 'Sheet 3', exact: true }).getAttribute('aria-selected'), 'true',
      JSON.stringify(await paint.locator('.paint-sheet, [data-paint-status], [data-paint-reference-name]').allTextContents()));
    await controls.getByText('Local tracing.png').waitFor();
    await underlay.waitFor();
    await paint.getByRole('tab', { name: /Purple stamp/ }).click();
    await underlay.waitFor({ state: 'hidden' });
    await paint.getByRole('tab', { name: 'Sheet 3', exact: true }).click();
    await underlay.waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await canvas.waitFor();
    assert.equal(await controls.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: 'work/plot-paint-reference-mobile.png' });
    await controls.getByRole('button', { name: 'Remove reference' }).click();
    await underlay.waitFor({ state: 'hidden' });
    assert.ok(await canvas.evaluate(drawingHasInk));
    await page.screenshot({ path: 'work/plot-paint-mobile.png' });
    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await assetDialog.getByRole('button', { name: 'Purple stamp.png', exact: true }).waitFor();
    await page.screenshot({ path: 'work/plot-assets-mobile.png' });
    await page.getByRole('button', { name: 'Close image library' }).click();
    assert.deepEqual(runtimeErrors, []);
    console.log('Real browser verified image assets, Paint editing and exports, and tracing references from both assets and files, including per-sheet restore and mobile controls.');
  } finally {
    await browser?.close();
    child.kill();
    await wait(350);
    await rm(state, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
