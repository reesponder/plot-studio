import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launch = { executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true };
let site = process.env.PLOT_ARCADE_PUBLIC_URL;
let child;
let state;
let browser;
try {
  if (!site) {
    const reserve = createServer();
    await new Promise(done => reserve.listen(0, '127.0.0.1', done));
    const port = reserve.address().port;
    await new Promise(done => reserve.close(done));
    const origin = `http://localhost:${port}`;
    const gateway = resolve('outputs/plot-studio/server.mjs');
    const password = randomBytes(24).toString('base64url');
    const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
    assert.equal(hash.status, 0, hash.stderr);
    state = await mkdtemp(join(tmpdir(), 'plot-night-shift-'));
    const secret = () => randomBytes(32).toString('base64url');
    child = spawn(process.execPath, [gateway], {
      env: { ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
        STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: secret(), PLOT_PROJECT_STORAGE_KEY: secret(), PLOT_FILE_KEY: secret() },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    let ready = false;
    for (let attempt = 0; attempt < 50 && !ready; attempt++) {
      ready = await fetch(origin).then(response => response.ok).catch(() => false);
      if (!ready) await wait(100);
    }
    assert.ok(ready);
    const login = await fetch(origin + '/login', {
      method: 'POST', redirect: 'manual', body: new URLSearchParams({ password }),
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const project = JSON.parse(await readFile('work/night-shift-arcade.json', 'utf-8'));
    const published = await fetch(origin + '/studio/api/sites/night-shift-arcade', {
      method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'If-None-Match': '*' },
      body: JSON.stringify({ project, public: true }),
    });
    assert.ok(published.ok, await published.clone().text());
    site = origin + (await published.json()).publicUrl;
  }
  browser = await chromium.launch(launch);
  const errors = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1140 }, deviceScaleFactor: 1.5 });
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(site);
  const frame = desktop.frameLocator('#hosted-app iframe');
  await frame.getByRole('heading', { name: 'Night Shift Arcade.' }).waitFor();
  await frame.getByRole('tab', {name:'Reaction'}).waitFor();
  await frame.getByText('Loading scores…', { exact: true }).waitFor({ state: 'hidden' });
  await desktop.screenshot({ path: process.env.PLOT_ARCADE_PUBLIC_URL ? 'outputs/night-shift-arcade.png' : 'work/night-shift-arcade-preview.png' });
  await frame.getByRole('link', { name: 'Choose a game', exact: true }).click();
  const reaction = frame.locator('.arcade-reaction');
  await reaction.press('Enter');
  await frame.locator('.arcade-reaction[data-phase=go]').waitFor();
  await reaction.press('Enter');
  await frame.locator('.arcade-reaction[data-phase=done]').waitFor();
  await frame.getByLabel('Your initials').waitFor();
  if (!process.env.PLOT_ARCADE_PUBLIC_URL) {
    await frame.getByLabel('Your initials').fill('TST');
    await frame.getByRole('button', { name: 'Post score' }).click();
    await frame.locator('.arcade-score-list').getByText('TST', { exact: true }).waitFor();
  } else {
    const board = await fetch(site + 'api/scores?game=reaction');
    assert.equal(board.status, 200);
    assert.ok(Array.isArray((await board.json()).scores));
  }

  const phone = await browser.newPage({ viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true });
  phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(site);
  const mobile = phone.frameLocator('#hosted-app iframe');
  await mobile.getByRole('tab', {name:'Memory'}).tap();
  assert.equal(await mobile.locator('.arcade-memory .arcade-tile').count(), 16);
  await mobile.locator('.arcade-memory .arcade-tile').first().tap();
  assert.equal(await mobile.locator('.arcade-memory .is-revealed').count(), 1);
  await mobile.getByRole('tab', {name:'Lights Out'}).tap();
  assert.equal(await mobile.locator('.arcade-lights .arcade-tile').count(), 25);
  await mobile.locator('.arcade-lights .arcade-tile').first().tap();
  assert.equal(await mobile.locator('[data-metric-current]').textContent(), '1 move');
  assert.ok(await mobile.locator('html').evaluate(el => el.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(process.env.PLOT_ARCADE_PUBLIC_URL
    ? 'Live public desktop/mobile verified: Reaction finish, Memory and Lights Out controls, scoreboard endpoint.'
    : 'Local hosted project verified: Reaction finish, saved score, Memory and Lights Out controls, no mobile overflow.');
} finally {
  await browser?.close();
  child?.kill();
  if (state) {
    await wait(200);
    await rm(state, { recursive: true, force: true, maxRetries: 5 });
  }
}
