const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

async function run() {
  const origin = 'http://localhost:15225';
  const entry = resolve('outputs/plot-studio/server.mjs');
  const token = () => randomBytes(32).toString('base64url');
  const password = token();
  const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
  assert.equal(hash.status, 0, hash.stderr);
  const state = await mkdtemp(join(tmpdir(), 'plot-workspace-dock-'));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: '15225', PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state, STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_FILE_KEY: token(), PLOT_PROJECT_STORAGE_KEY: token() },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50 && !ready; attempt++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await wait(100);
    }
    assert.ok(ready, 'Studio started');
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    const library = page.locator('#library');
    const inspector = page.locator('#inspector-panel');
    const canvas = page.locator('.canvas-panel');
    const leftHandle = page.getByRole('separator', { name: 'Resize library' });
    const rightHandle = page.getByRole('separator', { name: 'Resize inspector' });
    const resizeBy = async (separator, pixels) => {
      const { x, y, width, height } = await separator.boundingBox();
      await page.mouse.move(x + width / 2, y + height / 2);
      await page.mouse.down();
      await page.mouse.move(x + width / 2 + pixels, y + height / 2, { steps: 8 });
      await page.mouse.up();
    };
    const width = async (el) => (await el.boundingBox())?.width ?? 0;
    await leftHandle.waitFor();
    assert.equal(await width(library), 230);
    assert.equal(await width(inspector), 290);
    await resizeBy(leftHandle, 98);
    assert.equal(await width(library), 328);
    assert.equal(await width(inspector), 290);
    await resizeBy(rightHandle, -54);
    assert.equal(await width(inspector), 344);
    assert.equal(await width(library), 328);
    await rightHandle.press('Shift+ArrowLeft');
    assert.equal(await width(inspector), 376);
    await page.getByRole('button', { name: 'Hide library' }).click();
    assert.equal(await width(library), 0);
    assert.equal(await width(inspector), 376);
    await page.getByRole('button', { name: 'Canvas only' }).click();
    assert.equal(await width(canvas), 1440);
    await page.getByRole('button', { name: 'Restore side panels' }).click();
    assert.equal(await width(library), 0);
    assert.equal(await width(inspector), 376);
    await page.reload();
    await page.getByRole('button', { name: 'Show library' }).click();
    assert.equal(await width(library), 328);
    assert.equal(await width(inspector), 376);
    await leftHandle.dblclick();
    assert.equal(await width(library), 230);
    await page.setViewportSize({ width: 880, height: 760 });
    assert.equal(await width(canvas), 360);
    await page.setViewportSize({ width: 390, height: 797 });
    assert.equal(await width(canvas), 390);
    assert.equal(await width(inspector), 0);
    assert.equal(await width(library), 0);
    await page.getByRole('button', { name: 'Show library' }).click();
    assert.equal(await library.evaluate((el) => document.activeElement === el), true);
    assert.equal(await width(library), 310);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    assert.equal(await width(library), 0);
    assert.equal(await width(inspector), 310);
    await page.keyboard.press('Escape');
    assert.equal(await width(inspector), 0);
    assert.equal(await page.getByRole('button', { name: 'Show inspector' }).evaluate((el) => document.activeElement === el), true);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const backdrop = await page.locator('.dock-backdrop').boundingBox();
    await page.mouse.click(backdrop.x + 22, backdrop.y + backdrop.height / 2);
    assert.equal(await width(inspector), 0);
    await page.setViewportSize({ width: 320, height: 650 });
    const left = await page.getByRole('button', { name: 'Show library' }).boundingBox();
    const right = await page.getByRole('button', { name: 'Show inspector' }).boundingBox();
    assert.ok(left.x >= 0 && right.x + right.width <= 320);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await width(library), 230);
    assert.equal(await width(inspector), 376);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'work/plot-workspace-dock-desktop.png' });
    console.log('Browser check passed for both splitters, keyboard resize, visibility, Canvas only, reload persistence, reset, minimum canvas and phone overlays.');
  } finally {
    await browser?.close();
    child.kill();
    await rm(state, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
