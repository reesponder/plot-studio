const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { tmpdir } = require('node:os');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const origin = 'http://localhost:15209';
const entry = resolve('outputs/plot-studio/server.mjs');
const token = () => randomBytes(32).toString('base64url');
const password = token();
const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
const key = '99host.plot-studio.project.v1';

async function run() {
  assert.equal(hash.status, 0, hash.stderr);
  const state = await mkdtemp(join(tmpdir(), 'plot-workspace-hotel-'));
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: '15209', PUBLIC_ORIGIN: origin,
    PLOT_STATE_DIR: state, STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(),
    PLOT_FILE_KEY: token(), PLOT_PROJECT_STORAGE_KEY: token() }, stdio: ['ignore', 'ignore', 'inherit'] });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 65 && !ready; attempt++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await wait(120);
    }
    assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2.4 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(9000);
    const fail = process.env.PLOT_SHELL_ONLY ? /PRÓG/ : /Lindenbank House/;
    const old = await readFile('work/plot-legacy-starter.json', 'utf8');
    await page.goto(origin + '/admin/sign-in');
    if (!process.env.PLOT_SHELL_ONLY) await page.evaluate(({ saved, key }) => localStorage.setItem(key, saved), {saved: old, key});
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    await page.locator('#project-name').getByText(fail).waitFor();
    const board = page.frameLocator('#design-frame');
    await board.locator('h1').first().waitFor();
    const workspace = page.locator('#design-workspace');
    const left = page.getByRole('separator', { name: 'Resize library' });
    const right = page.getByRole('separator', { name: 'Resize inspector' });
    const tracks = () => workspace.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
    const before = await tracks();
    const l = await left.boundingBox();
    await page.mouse.move(l.x + l.width/2, l.y + 70);
    await page.mouse.down();
    await page.mouse.move(l.x + l.width/2 + 45, l.y + 70, {steps: 8});
    await page.mouse.up();
    const changed = await tracks();
    assert.ok(changed[0] > before[0] + 40 && changed[1] < before[1] - 40);
    await right.focus();
    await page.keyboard.press('ArrowLeft');
    assert.ok((await tracks())[2] > before[2]);
    await page.getByRole('button', { name: 'Hide inspector', exact: true }).click();
    assert.equal((await tracks())[2], 0);
    await page.getByRole('button', { name: 'Canvas only', exact: true }).click();
    assert.equal((await tracks())[0], 0);
    assert.equal((await tracks())[2], 0);
    await page.getByRole('button', { name: 'Restore side panels', exact: true }).click();
    assert.equal((await tracks())[0], changed[0]);
    await page.getByRole('button', { name: 'Show inspector', exact: true }).click();
    await page.reload();
    await left.waitFor();
    assert.equal((await tracks())[0], changed[0]);
    await left.dblclick();
    assert.equal((await tracks())[0], before[0]);
    await page.getByLabel('Canvas zoom').selectOption('1.25');
    assert.equal(await page.locator('#frame-mount').evaluate(el => el.clientWidth), 1400);
    await page.getByLabel('Canvas zoom').selectOption('fit');
    assert.ok(await page.locator('#frame-mount').evaluate(el => el.clientWidth < 1400));
    assert.deepEqual(errors, []);

    if (process.env.PLOT_SHELL_ONLY) {
      await page.screenshot({ path: 'work/plot-shell-old-project.png' });
      console.log('Desktop resizable panels, independent hide, Canvas only/restore, persistence, reset and zoom passed.');
      return;
    }
    const stored = await page.evaluate(key => [
      JSON.parse(localStorage.getItem(key)),
      localStorage.getItem(key + '.previous-starter'),
    ], key);
    assert.equal(stored[1], old);
    assert.equal(stored[0].name, 'Lindenbank House');
    await board.locator('img').first().evaluate(img => img.decode());
    await page.screenshot({ path: 'work/plot-hotel-workspace-desktop.png' });
    const { buildSite, buildSitePackage } = await import(pathToFileURL(resolve('outputs/plot-studio/project.mjs')));
    const files = buildSite(stored[0]);
    assert.equal(stored[0].pages.length, 5);
    let images = new Set();
    for (const html of Object.values(files).filter(file => typeof file === 'string' && file.startsWith('<!doctype'))) {
      for (const [, file] of html.matchAll(/(?:src|poster)="(?:\.\/)?(assets\/hotel\/[a-z0-9-]+\.webp)"/g)) images.add(file);
    }
    assert.ok(images.size >= 7, [...images].join(', '));
    for (const file of images) {
      const res = await fetch(origin + '/99host-assets/' + file.replace('assets/', ''));
      assert.equal(res.status, 200, file);
      assert.equal(res.headers.get('content-type'), 'image/webp', file);
    }
    const packed = await buildSitePackage(stored[0], '', { baseUrl: origin + '/studio/', fetcher: async url => {
      const response = await context.request.get(url.href);
      return { ok: response.ok(), arrayBuffer: () => response.body() };
    } });
    for (const file of images) assert.ok(packed[file], 'Export bundles ' + file);
    for (const { id, name } of stored[0].pages) {
      await page.locator('#page-picker').selectOption(id);
      await board.locator('h1').first().waitFor();
      assert.equal(await page.locator('#page-picker').locator('option:checked').textContent(), name);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'Show library' }).click();
    await page.locator('#library').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#library').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await page.locator('#inspector-panel').waitFor();
    await page.getByRole('button', { name: 'Hide inspector' }).click();
    await page.locator('#inspector-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.appbar').evaluate(el => el.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);

    const viewportSize = (selector) => page.frameLocator(selector).locator('html').evaluate(html => {
      const win = html.ownerDocument.defaultView;
      return [win.innerWidth, win.innerHeight];
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    const profiles = [
      ['mobile', 390, 712, 763, 'after'],
      ['galaxy-s25', 360, 671, 725, 'before'],
      ['galaxy-j3', 360, 566, 616, 'before'],
    ];
    for (const [model, width, height, fullHeight, placement] of profiles) {
      await page.getByLabel('Phone model', { exact: true }).selectOption(model);
      assert.equal(await page.locator('#canvas-device-frame').getAttribute('data-phone'), model);
      assert.deepEqual(await viewportSize('#design-frame'), [width, height]);
      assert.equal(await page.locator('#canvas-device-frame .phone-browser').evaluate((bar, placement) =>
        (placement === 'after' ? bar.previousElementSibling : bar.nextElementSibling).id, placement), 'frame-mount');
      await page.locator('#canvas-phone-browser').click();
      assert.deepEqual(await viewportSize('#design-frame'), [width, fullHeight]);
      await page.locator('#canvas-phone-browser').click();
      await page.screenshot({ path: `work/plot-phone-${model}-design.png`, scale: 'css' });
    }
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.frameLocator('#preview-frame').locator('h1').first().waitFor();
    const source = await page.locator('#preview-frame').getAttribute('srcdoc');
    for (const [model, width, height, fullHeight] of profiles) {
      await page.locator('#preview-device').selectOption(model);
      assert.equal(await page.locator('#preview-device-frame').getAttribute('data-phone'), model);
      assert.deepEqual(await viewportSize('#preview-frame'), [width, height]);
      assert.equal(await page.locator('#preview-frame').getAttribute('srcdoc'), source);
      await page.locator('#preview-phone-browser').click();
      assert.deepEqual(await viewportSize('#preview-frame'), [width, fullHeight]);
      await page.locator('#preview-phone-browser').click();
      await page.screenshot({ path: `work/plot-phone-${model}-preview.png`, scale: 'css' });
    }
    await page.setViewportSize({ width: 390, height: 740 });
    await page.locator('#preview-device').selectOption('galaxy-s25');
    const phone = await page.locator('#preview-device-frame').boundingBox();
    const shell = await page.locator('#preview-shell').boundingBox();
    assert.ok(phone.width <= shell.width && phone.height <= shell.height);
    await page.locator('#preview-device').selectOption('desktop');
    assert.equal(await page.locator('#preview-device-frame').getAttribute('data-phone'), null);
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    assert.deepEqual(errors, []);

    await page.evaluate(({ old, key }) => {
      const edited = JSON.parse(old);
      edited.pages[0].blocks[1].props.title = 'Locally edited project';
      localStorage.setItem(key, JSON.stringify(edited));
    }, { old, key });
    await page.reload();
    await board.getByRole('heading', { name: 'Locally edited project' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('Hotel start and legacy drafts, images, docking, canvas zoom and three phone profiles in Design and Preview passed.');
  } finally {
    await browser?.close();
    child.kill();
    await rm(state, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
