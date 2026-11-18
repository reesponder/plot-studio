const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const path = resolve('outputs/plot-studio');
const types = { mjs: 'text/javascript', css: 'text/css', html: 'text/html' };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/paint-editor.css"><body style="height:100dvh"><main id="paint" style="height:100%"></main><script type="module">
  import { mountPaintEditor } from '/paint-editor.mjs';
  window.saves = [];
  window.placed = null;
  window.paint = mountPaintEditor(document.querySelector('#paint'), {
    async saveAsset(blob, name) {
      const asset = { id: String(window.saves.length + 1), url: location.origin + '/asset/' + window.saves.length + '/' + name };
      window.saves.push({ type: blob.type, size: blob.size, name });
      return asset;
    },
    useAsset(asset) { window.placed = asset; },
  });
  window.paint.open().then(() => window.ready = true);
</script></body></html>`;

const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  if (!/^\/[a-z.-]+\.(mjs|css)$/.test(req.url)) { res.statusCode = 404; res.end(); return; }
  try {
    const body = await readFile(resolve(path, req.url.slice(1)));
    res.setHeader('Content-Type', types[req.url.split('.').pop()]);
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});

async function run() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (issue) => errors.push(issue.message));
    await page.goto(base);
    await page.waitForFunction(() => window.ready);
    const canvas = page.getByLabel('Drawing canvas');
    const dimensions = page.locator('[data-paint-dimensions]');
    assert.equal(await dimensions.textContent(), '2,550 × 1,700 px');
    assert.deepEqual(await canvas.evaluate(el => [el.width, el.height]), [2550, 1700]);
    await page.screenshot({ path: 'work/plot-paint-classic.png' });
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();
    await page.getByRole('button', { name: 'Airbrush', exact: true }).waitFor();
    const samples = await page.locator('[data-paint-sample]').evaluateAll(canvases => canvases.map(canvas => canvas.toDataURL()));
    assert.equal(samples.length, 21);
    assert.equal(new Set(samples).size, samples.length);
    await page.screenshot({ path: 'work/plot-paint-classic-brushes.png' });
    await page.getByRole('button', { name: 'Airbrush', exact: true }).click();
    const brushSettings = () => page.getByRole('button', { name: 'Brush settings', exact: true }).click();
    await brushSettings();
    await page.getByLabel('Exact stroke width').fill('52');
    await page.getByLabel('Exact stroke width').press('Tab');
    await page.getByRole('slider', { name: 'Spray density' }).fill('82');
    assert.equal(await page.getByRole('slider', { name: 'Spray density' }).inputValue(), '82');
    await page.screenshot({ path: 'work/plot-paint-brush-settings.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Pencil', exact: true }).click();
    await brushSettings();
    assert.equal(await page.getByLabel('Exact stroke width').inputValue(), '2');
    assert.equal(await page.getByRole('slider', { name: 'Spray density' }).isVisible(), false);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();
    await page.getByRole('button', { name: 'Airbrush', exact: true }).click();
    await brushSettings();
    assert.equal(await page.getByLabel('Exact stroke width').inputValue(), '52');
    assert.equal(await page.getByRole('slider', { name: 'Spray density' }).inputValue(), '82');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Airbrush', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Brush', exact: true }).click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Free-form selection', exact: true }).waitFor();
    await page.screenshot({ path: 'work/plot-paint-classic-select.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await page.getByRole('button', { name: 'Paste from', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit colors', exact: true }).click();
    const colors = page.getByRole('dialog', { name: 'Edit Colors' });
    await colors.getByLabel('Hex color').fill('#2969D3');
    assert.equal(await colors.getByLabel('Red', { exact: true }).inputValue(), '41');
    await colors.getByRole('button', { name: 'Add to Custom Colors' }).click();
    await page.screenshot({ path: 'work/plot-paint-classic-colors.png' });
    await colors.getByRole('button', { name: 'OK', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Color 1', exact: true }).evaluate(button => button.style.getPropertyValue('--paint-role-color')), '#2969d3');
    assert.equal(await page.getByRole('button', { name: 'Set custom color #2969d3' }).isEnabled(), true);
    await page.getByRole('tab', { name: 'View', exact: true }).click();
    await page.getByLabel('Transparency grid').check();
    assert.equal(await page.locator('.paint-editor').getAttribute('data-transparency'), 'true');
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    const pixel = async (x, y) => canvas.evaluate((el, [x, y]) => [...el.getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
    const draw = async (from, to = from) => {
      const { x, y, width, height } = await canvas.boundingBox();
      await page.mouse.move(x + width * from[0], y + height * from[1]);
      await page.mouse.down();
      await page.mouse.move(x + width * to[0], y + height * to[1], { steps: 8 });
      await page.mouse.up();
    };

    await page.getByRole('button', { name: 'Add sheet' }).click();
    const sheetDialog = page.getByRole('dialog', { name: 'New sheet' });
    assert.equal(await sheetDialog.getByLabel('Width (px)').inputValue(), '2550');
    assert.equal(await sheetDialog.getByLabel('Height (px)').inputValue(), '1700');
    await sheetDialog.getByLabel('Sheet name').fill('Red poster');
    await sheetDialog.getByLabel('Width (px)').fill('120');
    await sheetDialog.getByLabel('Height (px)').fill('100');
    await sheetDialog.getByLabel('Background').selectOption('#ffffff');
    await sheetDialog.getByRole('button', { name: 'Create sheet' }).click();
    await page.waitForFunction(() => document.querySelector('[data-paint-dimensions]').textContent === '120 × 100 px');
    assert.equal(await page.getByRole('tab', { name: 'Red poster' }).getAttribute('aria-selected'), 'true');
    const box = await canvas.boundingBox();
    const viewport = await page.locator('[data-paint-viewport]').boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - (viewport.x + viewport.width / 2)) <= 1);
    assert.ok(Math.abs(box.y + box.height / 2 - (viewport.y + viewport.height / 2)) <= 1);
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    await page.getByRole('button', { name: 'Set color #ed1c24' }).click();
    await page.getByRole('button', { name: 'Set color #ed1c24' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Fill', exact: true }).filter({ has: page.locator('.paint-caret') }).click();
    await page.getByLabel('Fill shape').check();
    await page.keyboard.press('Escape');
    await draw([.24, .25], [.76, .75]);
    assert.deepEqual(await pixel(60, 50), [237, 28, 36, 255]);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Free-form selection', exact: true }).click();
    const rect = await canvas.boundingBox();
    const moveTo = ([x, y]) => page.mouse.move(rect.x + x * rect.width, rect.y + y * rect.height, { steps: 6 });
    await moveTo([.2, .2]);
    await page.mouse.down();
    await moveTo([.8, .2]);
    await moveTo([.5, .83]);
    await moveTo([.2, .2]);
    await page.mouse.up();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Invert selection', exact: true }).click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    assert.deepEqual(await pixel(34, 65), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(60, 50), [237, 28, 36, 255]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Remove background' }).click();
    await page.getByRole('dialog', { name: 'Remove background' }).getByRole('button', { name: 'Remove background' }).click();
    assert.deepEqual(await pixel(1, 1), [0, 0, 0, 0]);
    assert.deepEqual(await pixel(60, 50), [237, 28, 36, 255]);

    await page.getByRole('button', { name: 'Undo' }).click();
    assert.deepEqual(await pixel(1, 1), [255, 255, 255, 255]);
    await page.getByRole('button', { name: 'Redo' }).click();
    assert.deepEqual(await pixel(1, 1), [0, 0, 0, 0]);
    await page.getByRole('button', { name: 'Save asset' }).click();
    await page.getByRole('textbox', { name: 'Public URL' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Public URL' }).inputValue(), `${base}/asset/0/red-poster.png`);
    await page.getByRole('button', { name: 'Use on page' }).click();
    assert.equal(await page.evaluate(() => window.placed.id), '1');
    await page.getByRole('button', { name: 'Copy link' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${base}/asset/0/red-poster.png`);
    assert.equal(await page.evaluate(() => window.saves.length), 1);

    await page.getByLabel('Upload changes automatically').check();
    await page.getByRole('button', { name: 'Pencil', exact: true }).click();
    await draw([.05, .06], [.08, .08]);
    await draw([.91, .83], [.93, .88]);
    await page.waitForFunction(() => window.saves.length === 2, null, { timeout: 17000 });
    await page.getByLabel('Upload changes automatically').uncheck();

    await page.getByRole('button', { name: 'Resize', exact: true }).click();
    const resize = page.getByRole('dialog', { name: 'Resize image or canvas' });
    await resize.getByLabel('Width (px)').fill('240');
    assert.equal(await resize.getByLabel('Height (px)').inputValue(), '200');
    await resize.getByLabel('Mode').selectOption('pixel');
    await resize.getByRole('button', { name: 'Resize' }).click();
    await page.waitForFunction(() => document.querySelector('[data-paint-dimensions]').textContent === '240 × 200 px');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Format').selectOption('image/webp');
    const [webp] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
    const contents = await readFile(await webp.path());
    assert.equal(contents.subarray(8, 12).toString(), 'WEBP');

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Format').selectOption('zip');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
    assert.deepEqual((await readFile(await zip.path())).subarray(0, 4), Buffer.from([80, 75, 3, 4]));

    const readSavedSize = () => page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('plot-studio.paint.v1', 1);
      req.onsuccess = () => {
        const database = req.result;
        const query = database.transaction('workspace').objectStore('workspace').getAll();
        query.onsuccess = async () => {
          database.close();
          const row = query.result.find((row) => row.name === 'Red poster');
          const buffer = await row.blob.arrayBuffer();
          resolve([row.width, new DataView(buffer).getUint32(16), row.revision]);
        };
      };
    }));
    let storageDimensions;
    for (let attempt = 0; attempt < 40; attempt++) {
      storageDimensions = await readSavedSize();
      if (storageDimensions[0] === 240) break;
      await page.waitForTimeout(75);
    }
    assert.deepEqual(storageDimensions.slice(0, 2), [240, 240], JSON.stringify(storageDimensions));
    await page.screenshot({ path: 'work/plot-paint-desktop.png' });
    await page.reload();
    await page.waitForFunction(() => window.ready);
    assert.equal(await dimensions.textContent(), '240 × 200 px');
    assert.equal(await page.getByRole('tab', { name: 'Red poster' }).getAttribute('aria-selected'), 'true');
    assert.deepEqual(await pixel(120, 100), [237, 28, 36, 255]);
    assert.deepEqual(errors, []);

    for (const starterHasDrawing of [false, true]) {
      const legacy = await browser.newContext();
      const view = await legacy.newPage();
      await view.route(base + '/seed', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
      await view.goto(base + '/seed');
      await view.evaluate(async (starterHasDrawing) => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 960, height: 640 });
        const context = canvas.getContext('2d');
        const blank = await new Promise(resolve => canvas.toBlob(resolve));
        context.fillStyle = '#0860bc';
        context.fillRect(0, 0, 4, 4);
        const drawing = await new Promise(resolve => canvas.toBlob(resolve));
        const open = indexedDB.open('plot-studio.paint.v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('workspace', { keyPath: 'id' });
        const database = await new Promise(resolve => open.onsuccess = () => resolve(open.result));
        const transaction = database.transaction('workspace', 'readwrite');
        const store = transaction.objectStore('workspace');
        store.put({ id: '@workspace', active: 'starter', order: ['starter', 'custom'] });
        store.put({ id: 'starter', name: 'Sheet 1', revision: 0, width: 960, height: 640, blob: starterHasDrawing ? drawing : blank });
        store.put({ id: 'custom', name: 'Custom draft', revision: 1, width: 960, height: 640, blob: drawing });
        await new Promise(resolve => transaction.oncomplete = resolve);
        database.close();
      }, starterHasDrawing);
      const assertStarterSize = async () => {
        await view.waitForFunction(() => window.ready);
        const expected = starterHasDrawing ? '960 × 640 px' : '2,550 × 1,700 px';
        assert.equal(await view.locator('[data-paint-dimensions]').textContent(), expected);
        assert.equal(await view.getByRole('tab', { name: 'Sheet 1', exact: true }).getAttribute('aria-selected'), 'true');
      };
      await view.goto(base);
      await assertStarterSize();
      const savedSize = await view.evaluate(async () => {
        const open = indexedDB.open('plot-studio.paint.v1', 1);
        const database = await new Promise(resolve => open.onsuccess = () => resolve(open.result));
        const request = database.transaction('workspace').objectStore('workspace').get('starter');
        const row = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
        database.close();
        const image = await createImageBitmap(row.blob);
        const dimensions = [image.width, image.height];
        image.close();
        return [row.width, row.height, ...dimensions];
      });
      assert.deepEqual(savedSize, starterHasDrawing ? [960, 640, 960, 640] : [2550, 1700, 2550, 1700]);
      await view.reload();
      await assertStarterSize();
      await view.getByRole('tab', { name: 'Custom draft' }).click();
      assert.equal(await view.locator('[data-paint-dimensions]').textContent(), '960 × 640 px');
      const customPixel = () => view.getByLabel('Drawing canvas').evaluate(el => [...el.getContext('2d').getImageData(0, 0, 1, 1).data]);
      await view.waitForFunction(() => document.querySelector('[aria-label="Drawing canvas"]').width === 960);
      assert.deepEqual(await customPixel(), [8, 96, 188, 255]);
      await legacy.close();
    }

    const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const phone = await mobile.newPage();
    await phone.goto(base);
    await phone.waitForFunction(() => window.ready);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 360);
    assert.equal(await phone.locator('#paint-ribbon-home').evaluate(el => el.scrollWidth > el.clientWidth), true);
    const phoneBox = await phone.getByLabel('Drawing canvas').boundingBox();
    assert.ok(phoneBox.width >= 300 && phoneBox.y + phoneBox.height <= 700, JSON.stringify(phoneBox));
    await phone.touchscreen.tap(phoneBox.x + phoneBox.width / 2, phoneBox.y + phoneBox.height / 2);
    const alpha = await phone.getByLabel('Drawing canvas').evaluate((el) => el.getContext('2d').getImageData(el.width / 2, el.height / 2, 1, 1).data[3]);
    assert.ok(alpha > 0);
    await phone.screenshot({ path: 'work/plot-paint-mobile.png' });
    await phone.getByRole('button', { name: 'Add sheet' }).click();
    const modal = await phone.getByRole('dialog').boundingBox();
    assert.ok(modal.width <= 360 && modal.y > 0 && modal.y + modal.height <= 800, JSON.stringify(modal));
    await phone.getByRole('button', { name: 'Cancel' }).click();
    console.log('Paint canvas, desktop/mobile, pixel background, undo/redo, asset link, automatic upload, exports, and legacy starter migration passed.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((issue) => { console.error(issue); process.exitCode = 1; });
