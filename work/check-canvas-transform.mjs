import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBlock, createEmptyProject, renderDocument, serializeProject } from '../outputs/plot-studio/project.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath() });
const root = resolve('outputs/plot-studio');
const origin = 'http://localhost:15418';
const key = '99host.plot-studio.project.v1';
const draft = createEmptyProject('Canvas Layout QA');
draft.pages[0].blocks = [createBlock('section', {
  id: 'canvas-group', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start' },
  children: [
    createBlock('card', { id: 'canvas-subject', props: { title: 'Canvas subject' }, style: { width: 260, height: 140, backgroundColor: '#b6caec' } }),
    createBlock('card', { id: 'canvas-neighbor', props: { title: 'Canvas neighbor' }, style: { width: 180, height: 150, backgroundColor: '#f8edb4' } }),
    createBlock('image', { id: 'canvas-photo', props: { src: origin + '/99host-assets/plot-mark.webp', caption: 'Image caption' }, style: { width: 200 } }),
  ],
})];

async function configure(page) {
  page.setDefaultTimeout(10000);
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('pageerror', error => console.error(error));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/studio\//, '');
    const filename = path.startsWith('/99host-assets/') ? path.replace('/99host-assets/', 'public/media/') : path || 'index.html';
    const extension = filename.split('.').pop();
    const contentType = { css: 'text/css', html: 'text/html', mjs: 'text/javascript', webp: 'image/webp' }[extension];
    try {
      const body = await readFile(resolve(root, filename));
      await route.fulfill({ body, contentType });
    } catch {
      console.error('missing', filename);
      await route.fulfill({ status: 404, body: '' });
    }
  });
  await page.addInitScript(({ value, key }) => {
    if (top === self && !localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { value: serializeProject(draft), key });
  await page.goto(`${origin}/studio/`, { waitUntil: 'domcontentloaded' });
  await canvas(page).locator('[data-plot-transform-overlay]').waitFor({ state: 'attached' });
  await page.waitForTimeout(250);
}

const block = '[data-block-id="canvas-subject"]';
const sibling = '[data-block-id="canvas-neighbor"]';
const group = '[data-block-id="canvas-group"]';
const canvas = page => page.frameLocator('#design-frame');
const handle = (page, kind) => canvas(page).locator('[data-plot-transform-overlay]').locator(`[data-handle="${kind}"]`);
const frameRect = (page, selector) => canvas(page).locator(selector).evaluate(node => {
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
});
const zoom = page => page.locator('#design-frame').evaluate(node => node.getBoundingClientRect().width / node.offsetWidth);
const closeTo = (actual, expected, delta = 1.4) => assert.ok(Math.abs(actual - expected) <= delta, `expected ${actual} ≈ ${expected}`);

async function scenePoint(page, locator, local = null) {
  const bounds = await locator.evaluate(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });
  const artboard = await page.locator('#design-frame').boundingBox();
  const ratio = await zoom(page);
  return {
    ratio,
    x: artboard.x + (bounds.x + (local?.x ?? bounds.width / 2)) * ratio,
    y: artboard.y + (bounds.y + (local?.y ?? bounds.height / 2)) * ratio,
  };
}

async function drag(page, kind, dx, dy, { shift = false, cancel = false } = {}) {
  const grip = handle(page, kind);
  await grip.waitFor({ state: 'visible' });
  const { x, y, ratio } = await scenePoint(page, grip);
  await page.mouse.move(x, y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(x + dx * ratio, y + dy * ratio, { steps: 8 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await configure(page);
  const frame = canvas(page);
  const start = await frameRect(page, block);
  const neighbor = await frameRect(page, sibling);
  const titlePoint = await scenePoint(page, frame.getByText('Canvas subject', { exact: true }));
  await page.mouse.click(titlePoint.x, titlePoint.y);
  await handle(page, 'move').waitFor({ state: 'visible' });
  await page.screenshot({ path: 'work/canvas-transform-desktop.png' });
  await drag(page, 'move', 90, 32);
  await page.waitForTimeout(400);
  const moved = await frameRect(page, block);
  closeTo(moved.x, start.x + 90);
  closeTo(moved.y, start.y + 32);
  assert.deepEqual(await frameRect(page, sibling), neighbor);
  await drag(page, 'e', 80, 37);
  await page.waitForTimeout(400);
  const sized = await frameRect(page, block);
  closeTo(sized.width, moved.width + 80);
  closeTo(sized.x, moved.x);
  closeTo(sized.height, moved.height);
  await drag(page, 'nw', -40, -20, { shift: true });
  await page.waitForTimeout(400);
  const locked = await frameRect(page, block);
  closeTo(locked.width / locked.height, sized.width / sized.height, .02);
  closeTo(locked.x + locked.width, sized.x + sized.width);
  closeTo(locked.y + locked.height, sized.y + sized.height);
  await drag(page, 'move', 60, 49, { cancel: true });
  assert.deepEqual(await frameRect(page, block), locked);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(350);
  assert.deepEqual(await frameRect(page, block), sized);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.waitForTimeout(350);
  assert.deepEqual(await frameRect(page, block), locked);
  await handle(page, 'move').focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(350);
  closeTo((await frameRect(page, block)).y, locked.y + 10);
  await page.waitForFunction(() => document.activeElement?.id === 'design-frame');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  assert.deepEqual(await frameRect(page, block), locked);
  await page.getByRole('button', { name: 'Canvas transform' }).click();
  await handle(page, 'move').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Canvas transform' }).click();
  await handle(page, 'move').waitFor({ state: 'visible' });
  const desktop = await frameRect(page, block);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await handle(page, 'move').waitFor({ state: 'visible' });
  const phoneBefore = await frameRect(page, block);
  await drag(page, 'move', -50, 26);
  await page.waitForTimeout(400);
  const phoneAfter = await frameRect(page, block);
  closeTo(phoneAfter.x, phoneBefore.x - 50);
  closeTo(phoneAfter.y, phoneBefore.y + 26);
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  assert.deepEqual(await frameRect(page, block), desktop);
  const file = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.ok(file.pages[0].blocks[0].children[0].styles.mobile.canvasY);
  const exportPage = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await exportPage.setContent(renderDocument(file.pages[0], file), { waitUntil: 'domcontentloaded' });
  const exportBlock = await exportPage.locator(block).evaluate(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });
  assert.deepEqual(exportBlock, phoneAfter);
  assert.equal(await exportPage.locator('[data-plot-transform-overlay]').count(), 0);
  await exportPage.close();

  const groupPoint = await scenePoint(page, frame.locator(group), { x: 10, y: 20 });
  await page.mouse.click(groupPoint.x, groupPoint.y);
  const groupStart = await frameRect(page, group);
  await drag(page, 'move', 30, 30);
  await page.waitForTimeout(400);
  const groupMoved = await frameRect(page, group);
  closeTo(groupMoved.x, groupStart.x + 30);
  closeTo((await frameRect(page, block)).y, desktop.y + 30);
  await page.reload();
  assert.deepEqual(await frameRect(page, group), groupMoved);
  await frame.locator('[data-plot-transform-overlay]').waitFor({ state: 'attached' });
  await page.waitForTimeout(150);
  const groupSelect = await scenePoint(page, frame.locator(group), { x: 10, y: 20 });
  await page.mouse.click(groupSelect.x, groupSelect.y);
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.locator('[data-group="Position"] summary').click();
  await page.locator('[data-editor-key=position]').selectOption('relative');
  await page.waitForTimeout(200);
  const subjectPoint = await scenePoint(page, frame.locator(block), { x: 35, y: 60 });
  await page.mouse.click(subjectPoint.x, subjectPoint.y);
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  const positionSection = page.locator('[data-group="Position"]');
  if (await positionSection.getAttribute('open') === null) await positionSection.locator('summary').click();
  await page.locator('[data-editor-key=position]').selectOption('absolute');
  await page.locator('[data-editor-key=top]').fill('36');
  await page.locator('[data-editor-key=left]').fill('48');
  await page.waitForTimeout(350);
  const positioning = await frame.locator(block).evaluate(node => ({
    position: getComputedStyle(node).position, top: getComputedStyle(node).top, left: getComputedStyle(node).left, parent: node.offsetParent?.dataset.blockId,
  }));
  assert.deepEqual(positioning, { position: 'absolute', top: '36px', left: '48px', parent: 'canvas-group' });
  await drag(page, 'move', 10, 15);
  await page.waitForTimeout(350);
  assert.equal(await frame.locator(block).evaluate(node => getComputedStyle(node).position), 'absolute');
  const figure = frame.locator('[data-block-id="canvas-photo"]');
  const img = figure.locator('img');
  await img.evaluate(node => node.decode());
  const point = await scenePoint(page, figure, { x: 10, y: 20 });
  await page.mouse.click(point.x, point.y);
  const imageStart = await img.evaluate(node => node.getBoundingClientRect().height);
  await drag(page, 's', 0, -75);
  await page.waitForTimeout(350);
  closeTo(await img.evaluate(node => node.getBoundingClientRect().height), imageStart - 75, 3);
  console.log('PASS Absolute inspector positioning, drag pinned block, real image and caption resize');
  await page.close();
  console.log('PASS Desktop scaled iframe, nested movement, edge and corner resize, Escape, undo/redo, keyboard, mobile breakpoint, export, persistence');

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await configure(touch);
  await touch.getByRole('button', { name: 'Phone', exact: true }).tap();
  const touchTitle = await scenePoint(touch, canvas(touch).getByText('Canvas subject', { exact: true }));
  await touch.touchscreen.tap(touchTitle.x, touchTitle.y);
  await handle(touch, 'move').waitFor({ state: 'visible' });
  const touchStart = await frameRect(touch, block);
  const session = await touch.context().newCDPSession(touch);
  const { x, y, ratio } = await scenePoint(touch, handle(touch, 'move'));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.waitForTimeout(100);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25 * ratio, y: y + 35 * ratio }] });
  await touch.waitForTimeout(100);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(400);
  const touchEnd = await frameRect(touch, block);
  closeTo(touchEnd.x, touchStart.x + 25, 2);
  closeTo(touchEnd.y, touchStart.y + 35, 2);
  await touch.screenshot({ path: 'work/canvas-transform-touch.png' });
  console.log('PASS Coarse pointer touch drag on phone');
} finally {
  await browser.close();
}
