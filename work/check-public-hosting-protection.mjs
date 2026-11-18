import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { createStarterProject } from '../outputs/plot-studio/project.mjs';
import { PUBLICATION_PACKET_MIME, readPublicationDocument, unpackPublicationPacket } from '../outputs/plot-studio/publication-packet.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const state = await mkdtemp(resolve('work', 'public-release-'));
const origin = 'http://localhost:15245';
const gateway = resolve('outputs/plot-studio/server.mjs');
const password = randomBytes(22).toString('base64url');
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const fixture = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ connected: req.headers.authorization === 'Bearer connector-private-fixture' }));
});
await new Promise(done => fixture.listen(0, '127.0.0.1', done));
const child = spawn(process.execPath, [gateway], { env: { ...process.env, PORT:'15245', PUBLIC_ORIGIN:origin,
  STUDIO_PASSWORD_HASH:hash.stdout.trim(), STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url'), PLOT_STATE_DIR:state,
  PLOT_PROJECT_STORAGE_KEY:randomBytes(32).toString('base64url'), PLOT_FILE_KEY:randomBytes(32).toString('base64url') },
  stdio:['ignore','ignore','inherit'] });
let browser;
let adminCookie;

async function request(path, { method = 'GET', headers = {}, body, admin = false, status = 200 } = {}) {
  const response = await fetch(origin + path, {
    method, redirect: 'manual',
    headers: { ...headers, ...(admin ? { Cookie: adminCookie, Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, status, `${method} ${path} -> ${response.status}; ${response.status === status ? '' : await response.text()}`);
  return response;
}

try {
  let ready;
  for (let attempt = 0; attempt < 45; attempt++) {
    try { ready = await fetch(origin); if (ready.ok) break; } catch {}
    await wait(80);
  }
  assert.ok(ready?.ok, 'gateway started');
  const login = await fetch(origin + '/login', { method: 'POST', redirect: 'manual', headers: { Origin: origin,
    'Content-Type':'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
  assert.equal(login.status, 303);
  assert.match(login.headers.get('set-cookie'), /Path=\/studio\/;.*HttpOnly/);
  adminCookie = login.headers.get('set-cookie').split(';')[0];

  const connector = { url: `http://127.0.0.1:${fixture.address().port}/health`, methods: ['GET'], label: 'Internal fixture', allowPrivate: true, credential: 'connector-private-fixture' };
  await request('/studio/api/backend/connections/check-connection', { method: 'PUT', admin: true, body: connector });
  const connectionBytes = await readFile(join(state, 'connections.json'));
  assert.equal(connectionBytes.subarray(0, 8).toString(), 'PLOTPS1\0');
  assert.equal(connectionBytes.includes('connector-private-fixture'), false);
  const catalog = await (await request('/studio/api/backend/catalog', { admin: true })).json();
  assert.ok(catalog.services.connectors.some(item => item.id === 'check-connection'));

  const project = createStarterProject();
  project.name = 'Published Notes — Actual Test';
  const output = (id, body) => ({ id, type: 'respond-json', args: { body, status: 200 } });
  project.backend.routes = [
    { id:'status-route', name:'Release status', method:'GET', path:'/api/status', access:'public', steps:[output('status-result',{ message:'Published service ✓' })] },
    { id:'secure-route', name:'Private data', method:'GET', path:'/api/secure', access:'key', steps:[output('secure-result',{ confidentialBackendOnly:'Sensitive backend route data' })] },
    { id:'connection-route', name:'Connector', method:'GET', path:'/api/connect', access:'public', steps:[
      { id:'call-connection', type:'call-connector', args:{ name:'check-connection', options:{ method:'GET' } } }, output('connector-result',{$ref:'steps.call-connection.value'})] },
  ];
  project.settings.customJs = `(() => { const exposedVariableName = document.querySelector('h1'); if (exposedVariableName) globalThis.plotBackend.request('/api/status').then(response => exposedVariableName.textContent = response.body.message); })();`;
  const endpoint = '/studio/api/sites/published-notes';
  async function publish(visible, previous) {
    return (await request(endpoint, { method:'PUT', admin:true, body:{ project, ...(visible === undefined ? {} : { public:visible }) },
      headers: previous ? { 'If-Match': `"${previous.version}"` } : { 'If-None-Match':'*' } })).json();
  }
  const initial = await publish(false);
  assert.equal(initial.public, false);
  assert.equal(initial.publicUrl, null);
  assert.equal(initial.privateUrl, '/studio/sites/published-notes/');
  await request(initial.privateUrl, { status: 302 });
  await request(`/s/published-notes/${initial.id}/`, { status: 404 });
  await request(endpoint, { method:'PUT', headers:{ 'If-Match': `"${initial.version}"` }, body:{ project, public:true }, status: 401 });
  await request(endpoint, { method:'PUT', admin:true, headers:{ 'If-Match': `"${initial.version}"` }, body:{ project, public:'true' }, status: 422 });

  const current = await publish(true, initial);
  assert.equal(current.public, true);
  assert.equal(current.id, initial.id);
  assert.match(current.url, /^\/s\/published-notes\/[a-f0-9]{32}\/$/);
  assert.equal(current.url, current.publicUrl);
  const snapshot = await readFile(join(state, 'sites','published-notes','snapshot.json'));
  assert.equal(snapshot.subarray(0,8).toString(), 'PLOTPS1\0');
  assert.equal(snapshot.includes(project.name), false);
  assert.equal(snapshot.includes('Sensitive backend route data'), false);
  await request(`/s/wrong-slug/${current.id}/`, { status: 404 });
  await request(`/s/published-notes/${'0'.repeat(32)}/`, { status: 404 });
  await request(current.privateUrl, { status: 302 });
  await request('/s/_assets/hosted-runner.mjs?test-version=1');
  await request('/s/_assets/hosted.mjs', { status: 404 });
  await request('/studio/api/sites/published-notes/key', { status: 401 });
  await request(`${current.url}api/secure`, { status: 401 });
  await request(`${current.url}_bridge`, { status: 403, method:'POST', headers:{ Origin:'https://different.invalid' }, body:{ action:'run', payload:{ path:'/api/status' } } });
  const key = await (await request('/studio/api/sites/published-notes/key', { admin:true })).json();
  const secure = await (await request(`${current.url}api/secure`, { headers:{ Authorization:`Bearer ${key.key}` } })).json();
  assert.equal(secure.confidentialBackendOnly, 'Sensitive backend route data');
  const called = await (await request(`${current.url}api/connect`)).json();
  assert.equal(called.body?.connected, true);
  const redirect = await request(current.url.slice(0,-1) + '?alpha=2', { status: 308 });
  assert.equal(redirect.headers.get('location'), `${current.url}?alpha=2`);
  const shell = await (await request(current.url)).text();
  assert.match(shell, /sandbox="allow-scripts allow-forms allow-popups"/);
  assert.doesNotMatch(shell, /exposedVariableName|Sensitive backend route data/);
  const pagePath = `${current.url}_page?id=${project.pages[0].id}`;
  const rawPage = await request(pagePath);
  assert.equal(rawPage.headers.get('content-type'), PUBLICATION_PACKET_MIME);
  const packet = Buffer.from(await rawPage.arrayBuffer());
  assert.equal(packet.length, Number(rawPage.headers.get('content-length')));
  assert.doesNotMatch(packet.toString('latin1'), /<html|<script|exposedVariableName|Sensitive backend route data/);
  assert.throws(() => gunzipSync(packet));
  const { document: rendered, slug } = readPublicationDocument(gunzipSync(unpackPublicationPacket(packet)));
  assert.equal(slug, 'index');
  assert.match(rendered, /<html/i);
  assert.match(rendered, /\/99host-assets\/hotel\/manor\.webp/);
  assert.doesNotMatch(rendered, /exposedVariableName|Sensitive backend route data|data:text\/javascript;base64|sourceMappingURL/);
  const head = await request(pagePath, { method: 'HEAD' });
  assert.equal(head.headers.get('content-type'), PUBLICATION_PACKET_MIME);
  assert.equal(head.headers.get('content-length'), rawPage.headers.get('content-length'));
  assert.equal((await head.arrayBuffer()).byteLength, 0);

  browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless:true });
  const guest = await browser.newContext({ viewport:{ width:390,height:840 } });
  const page = await guest.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin + current.url);
  await page.frameLocator('#hosted-app iframe').getByRole('heading', { name:'Published service ✓', exact:true }).waitFor();
  await page.frameLocator('#hosted-app iframe').locator('img[src$="manor.webp"]').evaluate(img => img.decode());
  await page.frameLocator('#hosted-app iframe').getByRole('link', { name:'Explore the rooms', exact:true }).click();
  await page.waitForURL('**/rooms.html');
  await page.frameLocator('#hosted-app iframe').getByRole('heading', { name:'Published service ✓', exact:true }).waitFor();
  await page.evaluate(() => history.back());
  await page.waitForURL(origin + current.url);
  await page.frameLocator('#hosted-app iframe').getByRole('heading', { name:'Published service ✓', exact:true }).waitFor();
  assert.deepEqual(await guest.cookies(), []);
  assert.deepEqual(pageErrors, []);

  const updated = await publish(undefined, current);
  assert.equal(updated.id, current.id);
  assert.equal(updated.publicUrl, current.publicUrl);
  await request(endpoint, { method:'DELETE', admin:true, headers:{ 'If-Match': `"${current.version}"` }, status:409 });
  const offline = await (await request(endpoint, { method:'DELETE', admin:true, headers:{ 'If-Match': `"${updated.version}"` } })).json();
  await request(current.url, { status:404 });
  await request(`${current.url}_page?id=${project.pages[0].id}`, { status:404 });
  await request(`${current.url}api/secure`, { status:404, headers:{ Authorization:`Bearer ${key.key}` } });
  const republished = await publish(true, offline);
  assert.equal(republished.url, current.url);
  const returnedToPrivate = await publish(false, republished);
  assert.equal(returnedToPrivate.id, initial.id);
  await request(current.url, { status:404 });
  await request(current.privateUrl, { admin:true });
  console.log('Public hosting passed: mobile guest browsing, navigation, stable slug+ID, protected API auth, ciphertext at rest, connector continuity, anonymous revocation and legacy private path.');
} finally {
  await browser?.close();
  child.kill();
  fixture.close();
  await wait(180);
  await rm(state, { recursive:true,force:true,maxRetries:3 });
}
