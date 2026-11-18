import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import { createBlock, createEmptyProject } from '../outputs/plot-studio/project.mjs';
import { attachArcadeBackend } from './plot-arcade-backend.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const reserve = createServer();
await new Promise(done => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port;
await new Promise(done => reserve.close(done));
const origin = `http://localhost:${port}`;
const state = await mkdtemp(join(tmpdir(), 'plot-arcade-test-'));
const password = randomBytes(24).toString('base64url');
const gateway = resolve('outputs/plot-studio/server.mjs');
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const secret = () => randomBytes(32).toString('base64url');
const child = spawn(process.execPath, [gateway], {
  env: {
    ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
    STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: secret(),
    PLOT_PROJECT_STORAGE_KEY: secret(), PLOT_FILE_KEY: secret(),
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
let browser;
try {
  let started = false;
  for (let index = 0; index < 45 && !started; index++) {
    started = await fetch(origin).then(result => result.ok, () => false);
    if (!started) await pause(80);
  }
  assert.ok(started);
  const login = await fetch(origin + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }),
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const project = attachArcadeBackend(createEmptyProject('Arcade test'));
  project.pages[0].blocks.push(createBlock('heading', { props: { level: 'h1', text: 'Working…' } }));
  project.settings.customJs = `(async () => {
    const request = globalThis.plotBackend.request;
    const score = { initials: 'QA', game: 'reaction', score: 901 };
    const saved = await request('/api/scores', { method: 'POST', body: score });
    const board = await request('/api/scores', { query: { game: 'reaction' } });
    const result = saved.status === 201 && board.status === 200 && board.body.scores[0]?.score === 901;
    document.querySelector('h1, h2').textContent = result ? 'Score saved and loaded' : 'Unable to save';
  })().catch(error => { document.querySelector('h1, h2').textContent = error.message; });`;
  const deployment = await fetch(origin + '/studio/api/sites/arcade-test', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'If-None-Match': '*' },
    body: JSON.stringify({ project, public: true }),
  });
  assert.equal(deployment.status, 200, await deployment.clone().text());
  const { publicUrl } = await deployment.json();
  assert.equal((await fetch(origin + publicUrl)).status, 200);
  browser = await chromium.launch({
    executablePath: process.env.PLOT_EXAM_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const visitor = await browser.newPage();
  await visitor.goto(origin + publicUrl, { waitUntil: 'domcontentloaded' });
  await visitor.frameLocator('iframe').getByText('Score saved and loaded').waitFor({ timeout: 10000 });
  const response = await fetch(origin + publicUrl + 'api/scores?game=reaction');
  assert.deepEqual(await response.json(), { scores: [{ initials: 'QA', game: 'reaction', score: 901 }] });
  console.log('Public test: Chromium submitted a score through the hosted iframe, then read it back from SQLite.');
} finally {
  await browser?.close();
  child.kill();
  await new Promise(done => child.once('close', done));
  await rm(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
