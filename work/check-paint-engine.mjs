import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const files = new Map(await Promise.all(['paint-engine.mjs', 'paint-pixels.mjs'].map(async name => ['/' + name, await readFile(new URL('../outputs/plot-studio/' + name, import.meta.url))])));
const html = `<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}#scroll{width:100vw;height:100vh;overflow:auto}canvas{display:block}</style><div id="scroll"><canvas id="paint"></canvas></div><script type="module">import {createPaintEngine} from '/paint-engine.mjs';globalThis.paint=createPaintEngine({canvas:document.querySelector('canvas'),scrollContainer:document.querySelector('#scroll')});</script>`;
const server = createServer((request, response) => {
  if (request.url === '/') return response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  if (files.has(request.url)) return response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(files.get(request.url));
  response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 850, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto(origin);
  await page.waitForFunction(() => globalThis.paint?.state()?.sheet?.revision === 0);
  const call = (method, ...args) => page.evaluate(([method, args]) => globalThis.paint[method](...args), [method, args]);
  const pixels = async (x, y) => page.evaluate(async ({x, y}) => {
    const blob = await globalThis.paint.exportImage();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }, { x, y });
  async function drag(x, y, q, v) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(q, v, { steps: 8 });
    await page.mouse.up();
  }

  const transparent = [0, 0, 0, 0];
  const red = [255, 0, 0, 255];
  const blue = [0, 0, 255, 255];
  const white = [255, 255, 255, 255];
  const first = (await call('state')).sheet;
  const sheet = await call('newSheet', { width: 100, height: 76, name: 'Logo', id: 'logo-fixture' });
  assert.equal(sheet.id, 'logo-fixture');
  await call('configure', { tool: 'pencil', size: 1, color: '#f00' });
  await drag(4, 5, 15, 5);
  assert.deepEqual(await pixels(9, 5), red);
  assert.deepEqual(await pixels(9, 6), transparent);
  assert.equal((await call('state')).sheet.revision, 1);
  await call('undo');
  assert.deepEqual(await pixels(9, 5), transparent);
  await call('redo');
  assert.deepEqual(await pixels(9, 5), red);
  await call('configure', { tool: 'eraser', size: 6 });
  await page.mouse.click(9, 5);
  assert.deepEqual(await pixels(9, 5), transparent);

  await call('configure', { tool: 'fill', color: '#fff', tolerance: 0 });
  await page.mouse.click(0, 0);
  assert.deepEqual(await pixels(9, 13), white);
  assert.deepEqual(await pixels(13, 5), red);
  await call('configure', { tool: 'rect', color: '#00f', secondaryColor: '#fff', fill: true, stroke: true, size: 3 });
  await drag(26, 24, 63, 56);
  assert.deepEqual(await pixels(26, 33), blue);
  assert.deepEqual(await pixels(40, 43), white);
  assert.ok(await call('removeBackground', { tolerance: 15 }) > 100);
  assert.deepEqual(await pixels(0, 0), transparent);
  assert.deepEqual(await pixels(26, 33), blue);
  assert.deepEqual(await pixels(40, 43), white);
  await call('undo');
  assert.ok(await call('removeBackground', { tolerance: 15, allPixels: true }) > 100);
  assert.deepEqual(await pixels(40, 43), transparent);
  await call('undo');
  await call('removeBackground', { tolerance: 15 });
  assert.deepEqual(await pixels(40, 43), white);

  await call('configure', { tool: 'select' });
  await drag(24, 21, 67, 60);
  const initial = (await call('state')).selection;
  assert.deepEqual(initial, { x: 24, y: 21, width: 43, height: 39 });
  await drag(32, 30, 38, 34);
  assert.deepEqual((await call('state')).selection, { ...initial, x: 30, y: 25 });
  assert.deepEqual(await pixels(26, 33), transparent);
  assert.deepEqual(await pixels(32, 37), blue);
  const copied = await page.evaluate(async () => { const b = await paint.copySelection(); const i = await createImageBitmap(b); return [b.type, i.width, i.height]; });
  assert.deepEqual(copied, ['image/png', 43, 39]);
  await call('crop');
  assert.equal((await call('state')).sheet.width, 43);
  assert.equal((await call('state')).sheet.height, 39);
  await call('rotate', 90);
  assert.equal((await call('state')).sheet.width, 39);
  assert.equal((await call('state')).sheet.height, 43);
  await call('resize', 78, 86, { scale: true, smooth: false });
  assert.equal((await call('state')).sheet.width, 78);
  await call('flip', 'horizontal');
  await call('configure', { tool: 'star', color: '#ff55aa', size: 2, stroke: false, fill: true, zoom: 2 });
  await drag(32, 42, 80, 90);
  const geometry = await page.locator('canvas').boundingBox();
  assert.equal(geometry.width, 156);
  assert.equal(geometry.height, 172);
  assert.ok((await pixels(28, 32))[3] > 0);

  const exported = await page.evaluate(async () => {
    const formats = {};
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const result = await paint.exportImage({ type });
      formats[type] = [result.type, result.size > 0];
    }
    const source = await paint.exportImage();
    const stored = await paint.loadImage(source, { id: 'restored-test', name: 'Restored', revision: 17 });
    return { formats, stored };
  });
  assert.deepEqual(exported.formats, { 'image/png': ['image/png', true], 'image/jpeg': ['image/jpeg', true], 'image/webp': ['image/webp', true] });
  assert.equal(exported.stored.revision, 17);
  assert.equal(exported.stored.id, 'restored-test');
  await call('removeSheet', first.id);
  await call('selectSheet', sheet.id);
  assert.equal((await call('state')).sheet.id, sheet.id);
  const dupe = await call('duplicateSheet');
  assert.equal(dupe.name, 'Logo copy');
  await page.evaluate(async () => {
    const surface = document.createElement('canvas');
    surface.width = 80;
    surface.height = 64;
    const context = surface.getContext('2d');
    const colors = context.createLinearGradient(0, 0, 80, 0);
    colors.addColorStop(0, '#544f69');
    colors.addColorStop(1, '#d5c7db');
    context.fillStyle = colors;
    context.fillRect(0, 0, 80, 64);
    context.fillStyle = '#111822';
    context.fillRect(32, 12, 11, 28);
    await paint.loadImage(await new Promise(resolve => surface.toBlob(resolve)), { name: 'Gradient' });
  });
  assert.ok(await call('removeBackground', { tolerance: 4 }) > 4_600);
  assert.deepEqual(await pixels(1, 2), transparent);
  assert.deepEqual(await pixels(77, 62), transparent);
  assert.deepEqual(await pixels(38, 24), [17, 24, 34, 255]);
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await mobile.goto(origin);
  await mobile.waitForFunction(() => !!globalThis.paint);
  await mobile.evaluate(() => paint.configure({ tool: 'pencil', size: 3 }));
  await mobile.touchscreen.tap(20, 20);
  const touch = await mobile.evaluate(() => ({ state: paint.state(), alpha: document.querySelector('canvas').getContext('2d').getImageData(20, 20, 1, 1).data[3] }));
  assert.equal(touch.state.sheet.revision, 1);
  assert.equal(touch.alpha, 255);
  const session = await mobile.context().newCDPSession(mobile);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 25, y: 25 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: 60 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 90 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await mobile.evaluate(() => paint.state().sheet.revision), 2);
  console.log('Paint Chrome check passed: pixel brush, true eraser, fill, dominant-color/gradient transparency, selection move and crop, resize/rotate, history, formats, sheet restore, touch tap and drag.');
} finally {
  await browser.close();
  server.close();
}
