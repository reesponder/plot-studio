import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as nodeRequest } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createStarterProject, serializeProject } from '../outputs/plot-studio/project.mjs';
import { STUDIO_ALIAS_HOSTS, STUDIO_ALIAS_ORIGINS, STUDIO_WORKSPACE_PATH } from '../outputs/plot-studio/studio-rotation.mjs';
import { STUDIO_CONTENT_HOSTS } from '../outputs/plot-studio/studio-content-hosts.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const origin = 'https://plotstudio.pro';
const internal = 'http://127.0.0.1:15248';
const distributedBoot = process.env.PLOT_TEST_DISTRIBUTED_BOOT === '1';
const sessionSecret = randomBytes(32);
const password = randomBytes(21).toString('base64url');
const sampleAlias = STUDIO_ALIAS_ORIGINS[0];
const gateway = resolve('outputs/plot-studio/server.mjs');
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const state = await mkdtemp(join(tmpdir(), 'plot-studio-rotation-'));
const child = spawn(process.execPath, [gateway], {
  env: { ...process.env, PORT: '15248', PUBLIC_ORIGIN: origin, STUDIO_PASSWORD_HASH: hash.stdout.trim(),
    STUDIO_SESSION_SECRET: sessionSecret.toString('base64url'), PLOT_STATE_DIR: state, PLOT_STUDIO_ALIAS_ROTATION: '1',
    PLOT_STUDIO_DISTRIBUTED_BOOT: distributedBoot ? '1' : '0',
    PLOT_PROJECT_STORAGE_KEY: randomBytes(32).toString('base64url'), PLOT_FILE_KEY: randomBytes(32).toString('base64url') },
  stdio: ['ignore', 'ignore', 'inherit'],
});
let browser;
let tls;
function requestGateway(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = nodeRequest(internal + path, { method, headers }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 70 && !ready; attempt++) {
    ready = await fetch(internal).then(res => res.ok).catch(() => false);
    if (!ready) await wait(100);
  }
  assert.ok(ready);
  const direct = await requestGateway('/studio/editor');
  assert.equal(direct.status, 302);
  assert.equal(direct.headers.location, '/sign-in');
  const frameHeaders = { 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-site', Referer: sampleAlias + '/' };
  const guestFrame = await requestGateway('/studio/editor', { headers: frameHeaders });
  assert.equal(guestFrame.status, 401);
  assert.equal(guestFrame.headers['x-frame-options'], 'DENY');
  const foreignFrame = await requestGateway('/studio/editor', { headers: { ...frameHeaders, Referer: 'https://unrelated.test/' } });
  assert.equal(foreignFrame.status, 403);
  assert.equal((await fetch(internal + '/studio/session', {headers: {Origin: 'https://unrelated.test'}})).status, 404);
  for (const alias of STUDIO_ALIAS_ORIGINS) {
    const headers = { Host: new URL(alias).hostname };
    const entry = await requestGateway('/studio/', { headers });
    assert.equal(entry.status, 302);
    assert.equal(entry.headers.location, origin + '/studio/launch');
    const workspace = await requestGateway(STUDIO_WORKSPACE_PATH, { headers });
    assert.equal(workspace.status, 200);
    assert.equal(workspace.headers['cache-control'], 'no-store');
    assert.match(workspace.body.toString(), /id="studio-frame"/);
  }

  const keys = spawnSync('python', ['-c', `
from pathlib import Path
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import sys
out = Path(sys.argv[1])
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
host = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "plotstudio.pro")])
now = datetime.now(timezone.utc)
cert = x509.CertificateBuilder().subject_name(host).issuer_name(host).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName("plotstudio.pro"), x509.DNSName("*.plotstudio.pro")]), critical=False).sign(key, hashes.SHA256())
(out / "test-key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
(out / "test-cert.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
`, state], { encoding: 'utf8' });
  assert.equal(keys.status, 0, keys.stderr);
  tls = createTlsServer({
    key: await readFile(join(state, 'test-key.pem')),
    cert: await readFile(join(state, 'test-cert.pem')),
  }, (req, res) => {
    const upstream = nodeRequest(internal + req.url, { method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise(done => tls.listen(0, '127.0.0.1', done));
  const hostnameRules = ['plotstudio.pro', ...STUDIO_ALIAS_HOSTS, ...STUDIO_CONTENT_HOSTS].map(host => `MAP ${host} 127.0.0.1:${tls.address().port}`).join(', ');
  browser = await chromium.launch({
    executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(),
    headless: true, args: [`--host-resolver-rules=${hostnameRules}`, '--no-proxy-server'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 820 }, ignoreHTTPSErrors: true });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || STUDIO_ALIAS_HOSTS.includes(url.hostname) || STUDIO_CONTENT_HOSTS.includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(11000);
  const componentHosts = new Set();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (STUDIO_CONTENT_HOSTS.includes(url.hostname) && response.status() === 200) componentHosts.add(url.hostname);
  });
  if (process.env.PLOT_ROTATION_TRACE === '1') {
    page.on('response', response => {
      const url = new URL(response.url());
      if (['/studio/', '/login', '/studio/launch', '/studio/session', '/studio/editor', '/'].includes(url.pathname)) {
        console.log(response.status(), `${url.host}${url.pathname}`);
      }
    });
  }
  await page.goto(sampleAlias + STUDIO_WORKSPACE_PATH);
  await page.getByText('Sign in to open the editor.', { exact: true }).waitFor();
  assert.equal(await page.locator('#studio-frame').isVisible(), false);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  assert.equal(new URL(page.url()).origin, origin);
  await page.goto(origin + '/admin/sign-in?next=%2Fstudio%2F%3Fdirect%3D1');
  const fixture = createStarterProject();
  fixture.name = 'My saved test draft';
  await page.evaluate(serialized => localStorage.setItem('99host.plot-studio.project.v1', serialized), serializeProject(fixture));
  await page.getByLabel('Access password').fill(password);
  const isWorkspace = url => STUDIO_ALIAS_ORIGINS.includes(url.origin) && url.pathname + url.search === STUDIO_WORKSPACE_PATH;
  const [workspaceNavigation] = await Promise.all([
    page.waitForRequest(request => request.isNavigationRequest() && isWorkspace(new URL(request.url()))),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  await page.waitForURL(isWorkspace);
  const first = page.url();
  await page.locator('#studio-frame.ready').waitFor();
  const editor = page.frameLocator('#studio-frame');
  await editor.getByText('My saved test draft', { exact: true }).waitFor();
  await editor.frameLocator('#design-frame').locator('h1').first().waitFor();
  if (distributedBoot) {
    await editor.locator('html[data-studio-boot="ready"]').waitFor();
    assert.equal(componentHosts.size, 10);
    for (const name of ['Logic', 'Data', 'Backend', 'Paint']) {
      await editor.getByRole('button', { name, exact: true }).click();
      if (name === 'Paint') {
        await editor.locator('[data-paint-canvas]').waitFor();
        await editor.getByRole('button', { name: 'Reference', exact: true }).waitFor();
      }
    }
    await editor.getByRole('button', { name: 'Design', exact: true }).click();
    await editor.getByRole('button', { name: 'Preview', exact: true }).click();
    await editor.frameLocator('#preview-frame').locator('h1').first().waitFor();
    await editor.getByRole('button', { name: 'Close preview', exact: true }).click();
    await page.screenshot({ path: 'work/plot-distributed-studio-desktop.png' });
    assert.deepEqual(runtimeErrors, []);
  }
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === '__Secure-99host_session');
  assert.equal(sessionCookie?.domain, new URL(origin).hostname);
  assert.doesNotMatch((await workspaceNavigation.allHeaders()).cookie || '', /(?:^|;\s*)__Secure-99host_session=/);

  const reopened = await context.newPage();
  await reopened.goto(new URL('/studio/', first).href);
  await reopened.waitForURL(isWorkspace);
  const second = reopened.url();
  assert.notEqual(second, first);
  await reopened.locator('#studio-frame.ready').waitFor();
  await reopened.frameLocator('#studio-frame').getByText('My saved test draft', { exact: true }).waitFor();
  await reopened.reload();
  await reopened.locator('#studio-frame.ready').waitFor();
  assert.equal(reopened.url(), second);
  assert.equal(page.url(), first);
  await editor.getByRole('button', { name: 'Code', exact: true }).click();
  assert.equal(page.url(), first);
  const entry = await context.newPage();
  let last = second;
  for (const path of ['/studio/?direct=1', '/studio/index.html', '/studio/editor']) {
    await entry.goto(origin + path);
    await entry.waitForURL(isWorkspace);
    assert.notEqual(entry.url(), last);
    last = entry.url();
    await entry.locator('#studio-frame.ready').waitFor();
    await entry.frameLocator('#studio-frame').getByText('My saved test draft', { exact: true }).waitFor();
    assert.equal(await entry.getByRole('link', { name: 'Open Studio directly' }).count(), 0);
  }

  if (distributedBoot) {
    const broken = await context.newPage();
    await broken.route('https://' + STUDIO_CONTENT_HOSTS[0] + '/parts/**', route => route.fulfill({
      status: 200, body: Buffer.from('modified payload'),
      headers: { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/octet-stream' },
    }));
    await broken.goto(origin + '/studio/');
    await broken.waitForURL(isWorkspace);
    await broken.locator('#studio-status').getByText('Studio could not load. Try again or sign in.', { exact: true }).waitFor();
    assert.equal(await broken.getByRole('link', { name: 'Try again', exact: true }).isVisible(), true);
    assert.equal(await broken.locator('#studio-frame.ready').count(), 0);
    await broken.close();
  }

  const next = reopened.frameLocator('#studio-frame');
  await next.locator('#project-trigger').click();
  await next.getByRole('button', {name: 'Sign out', exact: true}).click();
  await reopened.waitForURL(origin + '/');
  await reopened.goto(first);
  await reopened.getByText('Sign in to open the editor.', {exact: true}).waitFor();
  console.log(`Chromium: random entry, stable refresh, shared draft, direct-entry restriction and logout passed. Distributed startup ${distributedBoot ? 'verified all 10 domains, editor modes and tamper rejection' : 'disabled'}.`);
} finally {
  await browser?.close();
  tls?.closeAllConnections();
  tls?.close();
  child.kill();
  await wait(200);
  await rm(state, { recursive: true, force: true, maxRetries: 5 });
}
