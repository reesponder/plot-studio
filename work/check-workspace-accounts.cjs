const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const origin = 'http://localhost:15207';
const source = resolve('outputs/plot-studio');
const password = randomBytes(20).toString('base64url');
const server = join(source, 'server.mjs');
const passwordHash = spawnSync(process.execPath, [server, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(passwordHash.status, 0, passwordHash.stderr);

async function main() {
  const state = await mkdtemp(join(tmpdir(), 'plot-accounts-'));
  const env = { ...process.env, PORT: '15207', PUBLIC_ORIGIN: origin, STUDIO_PASSWORD_HASH: passwordHash.stdout.trim(),
    STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'), PLOT_PROJECT_STORAGE_KEY: randomBytes(32).toString('base64url'),
    PLOT_FILE_KEY: randomBytes(32).toString('base64url'), PLOT_STATE_DIR: state, PLOT_SECRET_FIXTURE_OPERATOR: 'only-for-operator' };
  let child;
  async function start() {
    child = spawn(process.execPath, [server], { env, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 50; i++) {
      if (await fetch(origin + '/sign-in').then(res => res.ok).catch(() => false)) return;
      await delay(100);
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }

  let browser;
  try {
    await start();
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless: true });
    const admin = await browser.newContext();
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guest = await browser.newContext({ viewport: { width: 320, height: 710 } });
    const api = (c, path, options = {}) => c.request.fetch(origin + path, { maxRedirects: 0, ...options });
    const form = (c, path, form, source = origin) => api(c, path, { method: 'POST', form, headers: { Origin: source } });
    const call = (c, owner, path, options = {}) => api(c, '/studio/api/' + path, { ...options,
      headers: { Origin: origin, 'X-Plot-Workspace': owner, ...options.headers } });
    const login = (c, email, licence) => form(c, '/sign-in', { email, licence, next: '/studio/?direct=1' });
    const rawKey = async () => {
      const rendered = await api(admin, '/studio/licences');
      assert.equal(rendered.status(), 200);
      const html = await rendered.text();
      return { key: html.match(/id="new-key" readonly value="([^"]+)"/)?.[1], html };
    };
    const issue = async (c, email) => {
      assert.equal((await form(c, '/studio/licences', { action: 'issue', email })).status(), 303);
      const { key } = await rawKey();
      assert.match(key || '', /^PLOT-[A-Za-z0-9_-]{32}$/);
      assert.equal((await rawKey()).key, undefined);
      return key;
    };

    const adminPage = await admin.newPage();
    await adminPage.goto(origin + '/admin/sign-in');
    await adminPage.getByLabel('Access password').fill(password);
    await adminPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await adminPage.waitForURL('**/studio/');
    const emailA = 'first@example.invalid';
    const emailB = 'second@example.invalid';
    const keyA = await issue(admin, emailA);
    const keyB = await issue(admin, emailB);
    assert.equal((await login(ctxA, emailA, keyA)).status(), 401);
    assert.equal((await form(ctxA, '/register', { email: emailA, licence: keyB })).status(), 401);
    assert.equal((await form(ctxA, '/register', { email: emailA, licence: keyA }, 'https://unrelated.invalid')).status(), 403);
    const a = await ctxA.newPage();
    await a.goto(origin + '/register');
    await a.screenshot({ path: 'work/workspace-activate-1440.png' });
    await a.getByLabel('Email address').fill(emailA);
    await a.getByLabel('Licence key').fill(keyA);
    await a.getByRole('button', { name: 'Activate and open Studio' }).click();
    await a.waitForURL('**/studio/');
    await a.locator('#project-trigger').waitFor();
    assert.equal((await form(ctxA, '/register', { email: emailA, licence: keyA })).status(), 409);
    assert.equal((await form(ctxB, '/register', { email: emailB, licence: keyB })).status(), 303);
    const b = await ctxB.newPage();
    await b.goto(origin + '/sign-in');
    await b.screenshot({ path: 'work/workspace-sign-in-390.png' });
    await b.getByLabel('Email address').fill(emailB);
    await b.getByLabel('Licence key').fill(keyB);
    await b.getByRole('button', { name: 'Sign in', exact: true }).click();
    await b.waitForURL('**/studio/');
    const visitor = await guest.newPage();
    await visitor.goto(origin + '/register');
    assert.equal(await visitor.evaluate(() => document.documentElement.scrollWidth), 320);
    await visitor.screenshot({ path: 'work/workspace-activate-320.png' });
    const [ownerA, ownerB] = await Promise.all([a, b].map(p => p.locator('html').getAttribute('data-workspace')));
    assert.match(ownerA, /^[a-f0-9]{32}$/);
    assert.notEqual(ownerA, ownerB);
    assert.equal((await api(ctxA, '/studio/licences')).status(), 403);
    assert.equal((await api(guest, '/studio/')).headers().location, '/sign-in');
    assert.equal((await call(ctxA, ownerB, 'projects')).status(), 409);
    assert.equal((await call(admin, ownerB, 'projects')).status(), 409);

    const { createStarterProject } = await import('../outputs/plot-studio/project.mjs');
    const projectA = createStarterProject(); projectA.name = 'Account A only';
    const projectB = createStarterProject(); projectB.name = 'Account B only';
    const put = (c, owner, path, data, headers = {}) => call(c, owner, path, { method: 'PUT', data, headers });
    const id = randomUUID();
    assert.equal((await put(ctxA, ownerA, `projects/${id}`, projectA, { 'If-None-Match': '*' })).status(), 201);
    assert.equal((await call(ctxB, ownerB, `projects/${id}`)).status(), 404);
    assert.deepEqual(await (await call(ctxB, ownerB, 'projects')).json(), []);
    assert.equal((await call(ctxA, ownerA, `projects/${id}/secrets`, { method: 'POST', data: { name: 'PLOT_SECRET_FIXTURE', value: 'alpha-saved-secret' }, headers: { 'If-None-Match': '*' } })).status(), 201);
    assert.equal((await call(ctxB, ownerB, `projects/${id}/secrets`)).status(), 404);
    assert.equal((await put(ctxB, ownerB, 'backend/connections/external', { url: 'https://example.invalid', methods: ['GET'] })).status(), 403);
    const tenantCatalog = (await (await call(ctxA, ownerA, 'backend/catalog')).json()).services;
    assert.deepEqual(tenantCatalog.tasks, []); assert.equal(tenantCatalog.native, false);

    const firstDraft = await call(ctxA, ownerA, 'working-draft');
    assert.equal(firstDraft.headers().etag, '"empty"');
    const wrote = await put(ctxA, ownerA, 'working-draft', projectA, { 'If-Match': firstDraft.headers().etag });
    assert.equal(wrote.status(), 200);
    assert.equal((await put(ctxA, ownerA, 'working-draft', projectB, { 'If-Match': '"empty"' })).status(), 409);
    assert.equal(await (await call(ctxB, ownerB, 'working-draft')).json(), null);
    await a.reload();
    await a.getByRole('button', { name: /Account A only/ }).waitFor();
    assert.equal(await a.evaluate(() => Object.keys(localStorage).some(key => key.includes('project.v1'))), false);

    const aPreview = await call(ctxA, ownerA, 'plot-file/seal', { method: 'POST', data: projectA });
    assert.equal(aPreview.status(), 200);
    const encrypted = await aPreview.body();
    const attemptOpen = (c, owner, data) => call(c, owner, 'plot-file/open', { method: 'POST', data, headers: { 'Content-Type': 'application/octet-stream' } });
    assert.equal((await attemptOpen(ctxA, ownerA, encrypted)).status(), 200);
    assert.equal((await attemptOpen(ctxB, ownerB, encrypted)).status(), 422);
    assert.equal((await attemptOpen(admin, 'operator', encrypted)).status(), 422);
    const template = await (await api(guest, '/docs/design/templates/relayboard.plot')).body();
    assert.equal((await attemptOpen(ctxA, ownerA, template)).status(), 200);

    const receipt = async (c, owner, project, isPublic) => {
      const result = await put(c, owner, 'sites/same-slug', { project, public: isPublic }, { 'If-None-Match': '*' });
      assert.ok(result.ok(), await result.text());
      return result.json();
    };
    const pubA = await receipt(ctxA, ownerA, projectA, true);
    const pubB = await receipt(ctxB, ownerB, projectB, false);
    assert.equal((await api(guest, pubA.publicUrl)).status(), 200);
    assert.equal((await api(guest, pubA.publicUrl.replace(ownerA, ownerB))).status(), 404);
    assert.equal((await api(ctxB, pubA.privateUrl)).status(), 404);
    assert.equal((await api(ctxA, pubB.privateUrl)).status(), 404);
    assert.equal((await api(ctxB, pubB.privateUrl)).status(), 200);
    assert.equal((await api(guest, pubB.privateUrl)).status(), 302);

    const assetA = await call(ctxA, ownerA, 'assets', { method: 'POST', data: await readFile(join(source, 'public', 'media', 'plot-mark.webp')),
      headers: { 'Content-Type': 'image/webp', 'X-Plot-Asset-Name': 'fixture.webp' } });
    assert.equal(assetA.status(), 201, await assetA.text());
    const { asset } = await assetA.json();
    assert.match(asset.url, new RegExp(`/asset/u/${ownerA}/`));
    assert.equal((await fetch(asset.url)).status, 200);
    assert.equal((await fetch(asset.url.replace(ownerA, ownerB))).status, 404);
    assert.deepEqual((await (await call(ctxB, ownerB, 'assets')).json()).assets, []);

    assert.equal((await form(admin, '/studio/licences', { action: 'replace', id: ownerA })).status(), 303);
    const keyNew = (await rawKey()).key;
    assert.notEqual(keyNew, keyA);
    assert.equal((await call(ctxA, ownerA, 'projects')).status(), 401);
    assert.equal((await login(ctxA, emailA, keyA)).status(), 401);
    assert.equal((await login(ctxA, emailA, keyNew)).status(), 303);
    assert.equal((await attemptOpen(ctxA, ownerA, encrypted)).status(), 200);
    assert.equal((await form(admin, '/studio/licences', { action: 'revoke', id: ownerB })).status(), 303);
    assert.equal((await login(ctxB, emailB, keyB)).status(), 401);
    assert.equal((await call(ctxB, ownerB, 'projects')).status(), 401);
    const personal = await browser.newContext();
    const personalEmail = 'password-account@example.invalid';
    const personalPassword = randomBytes(18).toString('base64url');
    assert.equal((await form(ctxA, '/studio/licences', { action: 'provision', email: personalEmail, password: personalPassword })).status(), 403);
    assert.equal((await form(admin, '/studio/licences', { action: 'provision', email: personalEmail, password: personalPassword })).status(), 303);
    assert.equal((await login(personal, personalEmail, 'a deliberately wrong password')).status(), 401);
    assert.equal((await login(personal, personalEmail, personalPassword)).status(), 303);
    assert.equal((await api(personal, '/studio/licences')).status(), 403);
    const personalPage = await personal.newPage();
    await personalPage.goto(origin + '/studio/?direct=1');
    await personalPage.getByRole('button', { name: 'Lindenbank House', exact: true }).waitFor();
    assert.equal((await form(admin, '/studio/licences', { action: 'provision', email: personalEmail, password: personalPassword })).status(), 303);
    assert.equal((await api(personal, '/studio/account')).status(), 302);
    const raw = await readFile(join(state, 'workspace-accounts.bin'));
    assert.ok(!raw.includes(Buffer.from(emailA)) && !raw.includes(Buffer.from(keyNew)));
    assert.ok(!raw.includes(Buffer.from(personalPassword)));
    await stop(); await start();
    assert.equal((await login(ctxA, emailA, keyNew)).status(), 303);
    assert.equal((await login(ctxB, emailB, keyB)).status(), 401);
    assert.equal((await call(ctxA, ownerA, `projects/${id}`)).status(), 200);
    console.log('Two licence accounts, activation, isolation of drafts, secrets, exports, sites and assets, replacement, revocation, restart and desktop/mobile access passed.');
  } finally {
    await browser?.close();
    await stop();
    await rm(state, { recursive: true, force: true });
  }
}
main().catch(issue => { console.error(issue); process.exitCode = 1; });
