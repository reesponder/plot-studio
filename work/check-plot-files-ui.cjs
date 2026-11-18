const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const origin = 'http://localhost:15178';
const source = resolve('outputs/plot-studio');
const password = randomBytes(16).toString('base64url');
const key = randomBytes(32);
const fileSecret = randomBytes(32).toString('base64url');
const draftSecret = randomBytes(32).toString('base64url');
const passwordHash = spawnSync(process.execPath, [join(source, 'server.mjs'), 'hash'], { input: password, encoding: 'utf8' });
assert.equal(passwordHash.status, 0, passwordHash.stderr);

async function run() {
  const state = await mkdtemp(join(tmpdir(), 'plot-files-ui-'));
  const child = spawn(process.execPath, [join(source, 'server.mjs')], {
    env: { ...process.env, PORT: '15178', PUBLIC_ORIGIN: origin, STUDIO_PASSWORD_HASH: passwordHash.stdout.trim(),
      STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'), PLOT_STATE_DIR: state, PLOT_FILE_KEY: fileSecret, PLOT_PROJECT_STORAGE_KEY: draftSecret,
      PLOT_EXAM_ACCESS_SECRET: key.toString('base64url'), PLOT_EXAM_DELIVERY_MODE: 'manual' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let browser;
  try {
    let ready;
    for (let attempt = 0; attempt < 50 && !ready; attempt++) {
      ready = await fetch(origin).then(res => res.ok).catch(() => false);
      if (!ready) await delay(160);
    }
    assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto(origin + '/admin/sign-in');
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    await page.locator('[data-mode="backend"]').click();
    await page.getByRole('button', { name: 'Hosting', exact: true }).click();
    const visibility = page.getByLabel('Who can open the site?');
    assert.equal(await visibility.inputValue(), 'private');
    await page.getByLabel('Custom address').fill('encrypted-gallery');
    await visibility.selectOption('public');
    await page.getByRole('button', { name: 'Publish site', exact: true }).click();
    await page.getByRole('button', { name: 'Copy link', exact: true }).waitFor();
    const release = page.getByRole('article').filter({ hasText: 'encrypted-gallery' });
    const publicUrl = await release.getByRole('link', { name: 'Open site' }).getAttribute('href');
    assert.match(publicUrl, /^\/s\/encrypted-gallery\/[a-f0-9]{32}\/$/);
    await release.getByRole('button', { name: 'Copy link', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), origin + publicUrl);
    await page.screenshot({ path: 'work/plot-publish-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'work/plot-publish-mobile.png' });
    assert.equal(await page.locator('.be-hosting').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    await page.setViewportSize({ width: 1440, height: 900 });

    const guest = await browser.newContext();
    const viewer = await guest.newPage();
    assert.equal((await viewer.goto(origin + publicUrl)).status(), 200);
    await viewer.frameLocator('iframe').locator('main').waitFor();
    assert.deepEqual(await guest.cookies(), []);
    assert.equal((await guest.request.post(origin + '/studio/api/plot-file/open', { data: Buffer.from('no') })).status(), 401);
    await guest.close();

    await page.locator('#project-trigger').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .plot project' }).click()]);
    const bytes = await readFile(await download.path());
    const header = bytes.subarray(0, 8).toString();
    assert.equal(header, 'PLOTSEC2');
    assert.equal(bytes.includes(Buffer.from('"pages"')), false);
    const open = await context.request.post(origin + '/studio/api/plot-file/open', { headers: { Origin: origin, 'Content-Type': 'application/octet-stream' }, data: bytes });
    assert.ok(open.ok(), await open.text());
    const project = await open.json();
    assert.equal(project.version, 1);
    assert.ok(project.pages.length > 0);
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 1] ^= 1;
    assert.equal((await context.request.post(origin + '/studio/api/plot-file/open', { headers: { Origin: origin, 'Content-Type': 'application/octet-stream' }, data: tampered })).status(), 422);
    assert.equal((await context.request.post(origin + '/studio/api/plot-file/open', { headers: { Origin: 'https://different.invalid', 'Content-Type': 'application/octet-stream' }, data: bytes })).status(), 403);
    await page.locator('#import-project').setInputFiles({ name: 'protected.plot', mimeType: 'application/octet-stream', buffer: bytes });
    await page.locator('dialog[open]').getByRole('button', { name: 'Replace' }).waitFor();
    await page.keyboard.press('Escape');

    const template = await fetch(origin + '/docs/design/templates/relayboard.plot');
    assert.equal(template.status, 200);
    assert.equal(Buffer.from(await template.arrayBuffer()).subarray(0, 8).toString(), 'PLOTSEC2');
    assert.equal((await fetch(origin + '/docs/design/templates/not-a-real-template.plot')).status, 404);
    const old = Buffer.from(JSON.stringify(project));
    assert.ok((await context.request.post(origin + '/studio/api/plot-file/open', { headers: { Origin: origin, 'Content-Type': 'application/octet-stream' }, data: old })).ok());

    const examId = 'exam_enr_' + randomBytes(16).toString('hex');
    const inviteNonce = randomBytes(18).toString('base64url');
    const when = Date.now();
    const python = process.env.PLOT_PYTHON || 'python';
    const created = spawnSync(python, [join(source, 'exam_store.py'), join(state, 'certification.sqlite3'), 'qa_builder_create'], { encoding: 'utf8', input: JSON.stringify({
      id: examId, tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'), name: 'Protected project QA', email: 'plotfile@example.invalid',
      termsVersion: '2026-11-16-certification-r3', acceptedAt: new Date(when).toISOString(), atMs: when, inviteNonce, assessmentVersion: 2,
    }) });
    assert.equal(JSON.parse(created.stdout).status, 201, created.stderr);
    const { signedLink } = await import('../outputs/plot-studio/exam-mail.mjs');
    const accessToken = new URLSearchParams(new URL(signedLink(origin, key, { enrolment: examId, nonce: inviteNonce })).hash.slice(1)).get('access');
    const redeem = await fetch(origin + '/certification/api/access/redeem', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken }) });
    assert.equal(redeem.status, 200);
    const { token } = await redeem.json();
    const Authorization = `Bearer ${token}`;
    const started = await fetch(origin + '/certification/api/timer/start', { method: 'POST', headers: { Origin: origin, Authorization, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(started.status, 200);
    const examFile = await fetch(origin + '/certification/api/starter/builder', { headers: { Authorization } });
    assert.equal(examFile.status, 200);
    const examBytes = Buffer.from(await examFile.arrayBuffer());
    assert.equal(examBytes.subarray(0, 8).toString(), 'PLOTSEC2');
    const submitted = await fetch(origin + '/certification/api/submission', { method: 'POST', headers: { Origin: origin, Authorization, 'Content-Type': 'application/octet-stream', 'X-Plot-Publish-Certificate': 'false' }, body: examBytes });
    assert.equal(submitted.status, 200);
    const { latestResult } = await submitted.json();
    assert.equal(latestResult.score, 0);
    assert.equal(latestResult.checks.length, 24);
    console.log('Studio desktop and mobile publication, protected download/import, legacy import and encrypted exam starter/grade verified.');
  } finally {
    await browser?.close();
    child.kill();
    await delay(500);
    await rm(state, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
