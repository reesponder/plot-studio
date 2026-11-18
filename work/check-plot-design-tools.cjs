const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const port = process.env.PLOT_SCENARIO === 'variants' ? 15195 : process.env.PLOT_SCENARIO === 'stock-shot' ? 15196 : 15194;
const origin = 'http://localhost:' + port;
const entry = resolve('outputs/plot-studio/server.mjs');
const token = () => randomBytes(32).toString('base64url');
const password = token();
const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
const chrome = { executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true };
const projectKey = '99host.plot-studio.project.v1';

const run = async () => {
  assert.equal(hash.status, 0, hash.stderr);
  const state = await mkdtemp(join(tmpdir(), 'plot-design-tools-'));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state, STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_FILE_KEY: token(), PLOT_PROJECT_STORAGE_KEY: token() },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await wait(125);
    }
    assert.ok(ready, 'App started');
    browser = await chromium.launch(chrome);
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2.4 });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    if (process.env.PLOT_SCENARIO === 'stock-shot') {
      await page.getByRole('button', { name: 'Assets', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Image assets' });
      await picker.getByRole('button', { name: 'The Stock of Freedom' }).click();
      await picker.getByRole('searchbox').fill('architecture');
      await picker.getByRole('button', { name: 'Brick apartment facade', exact: true }).click();
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('[data-image-list] img')];
        return images.length === 16 && images.every(image => image.complete && image.naturalWidth > 0)
          && document.querySelector('[data-image-preview]').naturalWidth > 0;
      }, null, { timeout: 18000 });
      await page.screenshot({ path: 'work/plot-stock-handbook.png' });
      return;
    }
    const blocks = page.frameLocator('#design-frame');
    const find = id => blocks.locator(`[data-block-id="${id}"]`);
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), projectKey);
    const waitVariant = async (id, variant) => page.waitForFunction(({ key, id, variant }) => {
      const value = JSON.parse(localStorage.getItem(key));
      return value?.pages[0].blocks.some(block => block.id === id && block.props.designVariant === variant);
    }, { key: projectKey, id, variant });
    const persisted = async id => {
      const value = await stored();
      const search = list => {
        for (const item of list) {
          if (item.id === id) return item;
          const nested = search(item.children || []);
          if (nested) return nested;
        }
        return undefined;
      };
      return search(value.pages[0].blocks);
    };
    const visualBox = async locator => {
      await locator.waitFor();
      const [frame, box] = await Promise.all([
        page.locator('#design-frame').evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, ratio: rect.width / el.offsetWidth };
        }),
        locator.evaluate(el => el.getBoundingClientRect().toJSON()),
      ]);
      return { x: frame.x + box.x * frame.ratio, y: frame.y + box.y * frame.ratio, width: box.width * frame.ratio, height: box.height * frame.ratio };
    };
    const drag = async (locator, x, y) => {
      const box = await visualBox(locator);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + x, box.y + box.height / 2 + y, { steps: 10 });
      await page.mouse.up();
    };
    await find('block-home-nav').waitFor();
    if (process.env.PLOT_DISCOVER === 'variants') {
      await page.getByRole('button', { name: 'Browse Navigation variants' }).click();
      console.log(await page.locator('dialog[open]').ariaSnapshot());
      return;
    }
    if (process.env.PLOT_DISCOVER === 'stock') {
      await page.getByRole('button', { name: 'Assets', exact: true }).click();
      console.log(await page.locator('dialog[open]').ariaSnapshot());
      return;
    }
    if (process.env.PLOT_SCENARIO === 'variants') {
      await page.getByRole('button', { name: 'Browse Navigation variants' }).click();
      const picker = page.getByRole('dialog', { name: 'Element variants' });
      await picker.locator('[data-variant-layout="masthead"]').click();
      await picker.locator('[data-variant-tone="paper"]').click();
      await picker.locator('[data-variant-layout]').first().waitFor();
      const preview = picker.frameLocator('iframe');
      await preview.locator('[data-block-design="masthead"][data-block-tone="paper"]').waitFor();
      await picker.getByRole('button', { name: 'Phone', exact: true }).click();
      assert.equal(await preview.locator('html').evaluate(el => el.clientWidth), 390);
      await page.screenshot({ path: 'work/plot-element-variants-desktop.png' });
      await picker.getByRole('button', { name: 'Add element' }).click();
      const newNav = blocks.locator('[data-block-design="masthead"][data-block-tone="paper"]');
      const newId = await newNav.getAttribute('data-block-id');
      await waitVariant(newId, 'masthead:paper');
      assert.equal((await persisted(newId)).props.designVariant, 'masthead:paper');
      await page.getByRole('button', { name: 'Change variant' }).click();
      const change = page.getByRole('dialog', { name: 'Navigation variants' });
      await change.locator('[data-variant-layout="menu-first"]').click();
      await change.locator('[data-variant-tone="ink"]').click();
      await change.getByRole('button', { name: 'Apply variant' }).click();
      await find(newId).and(blocks.locator('[data-block-design="menu-first"][data-block-tone="ink"]')).waitFor();
      await waitVariant(newId, 'menu-first:ink');
      assert.equal((await persisted(newId)).props.brand, 'Brand');
      assert.equal((await persisted(newId)).props.designVariant, 'menu-first:ink');
      await page.reload();
      await find(newId).and(blocks.locator('[data-block-design="menu-first"][data-block-tone="ink"]')).waitFor();
      const { buildSite } = await import(pathToFileURL(resolve('outputs/plot-studio/project.mjs')));
      const exported = buildSite(await stored());
      assert.match(exported['index.html'], /data-block-design="menu-first" data-block-tone="ink"/);
      assert.match(exported['styles.css'], /data-block-design="menu-first"/);
      assert.deepEqual(errors, []);
      console.log('LOCAL: Built-in nav variants, live mobile preview, insertion, update in place, reload and export.');
      return;
    }
    const nav = find('block-home-nav');
    await nav.getByText('PRÓG.').click();
    await page.getByRole('button', { name: 'Change variant' }).waitFor();
    const move = blocks.getByRole('button', { name: 'Move element', exact: true });
    const right = blocks.getByRole('button', { name: 'Resize right edge', exact: true });
    const base = await visualBox(nav);
    await drag(move, -30, 18);
    await page.waitForFunction(key => {
      const doc = JSON.parse(localStorage.getItem(key));
      return Boolean(doc?.pages[0].blocks[0].style.canvasX && doc?.pages[0].blocks[0].style.canvasY);
    }, projectKey);
    const moved = await visualBox(nav);
    assert.ok(Math.abs(moved.x - base.x + 30) < 4 && Math.abs(moved.y - base.y - 18) < 4, 'Pointer moves selected block visually');
    await drag(right, -48, 0);
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.pages[0].blocks[0].style.width, projectKey);
    const resized = await visualBox(nav);
    assert.ok(Math.abs(resized.width - moved.width + 48) < 4, 'Pointer resizes selected block');
    await page.screenshot({ path: 'work/plot-design-transform-desktop.png' });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key))?.pages[0].blocks[0].style.width, projectKey);
    assert.ok((await persisted('block-home-nav')).style.canvasX, 'Undo preserves movement from prior gesture');
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await move.focus();
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.pages[0].blocks[0].styles.mobile.canvasY, projectKey);
    assert.notEqual((await persisted('block-home-nav')).style.canvasY, (await persisted('block-home-nav')).styles.mobile.canvasY);
    const { buildSite, deserializeProject } = await import(pathToFileURL(resolve('outputs/plot-studio/project.mjs')));
    const exported = buildSite(deserializeProject(JSON.stringify(await stored())));
    assert.match(exported['styles.css'], /\[data-block-id="block-home-nav"\]\[data-block-id\]\{translate:[-\d.]+px [\d.]+px\}/);
    assert.match(exported['styles.css'], /@media\(max-width:767px\)\{\s*\[data-block-id="block-home-nav"\][^}]+translate:[^}]+\}/);
    assert.deepEqual(errors, []);
    console.log('LOCAL: Bootstrap, nested selection bridge, drag move, resize, one-step undo, phone override and keyboard nudging.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    await rm(state, {recursive: true, force: true});
  }
};
run().catch(error => { console.error(error); process.exitCode = 1; });
