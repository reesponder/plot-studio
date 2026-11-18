import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createStarterProject } from '../outputs/plot-studio/project.mjs';

const origin = 'http://localhost:15274';
const directory = await mkdtemp(join(tmpdir(), 'plot-secrets-runtime-'));
const gateway = resolve('outputs/plot-studio/server.mjs');
const random = () => randomBytes(32).toString('base64url');
const legacyKey = random();
const password = random();
const projectA = randomUUID();
const projectB = randomUUID();
const initialKey = random();
const rotatedKey = random();
const siblingKey = random();
const temporaryKey = random();
const hookKey = '\n' + random() + '\n';
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const server = spawn(process.execPath, [gateway], { env: { ...process.env, PORT:'15274', PUBLIC_ORIGIN:origin, PLOT_STATE_DIR:directory,
  STUDIO_PASSWORD_HASH:hash.stdout.trim(), STUDIO_SESSION_SECRET:random(), PLOT_PROJECT_STORAGE_KEY:random(), PLOT_FILE_KEY:random(),
  PLOT_SECRET_CLIENT:legacyKey }, stdio: ['ignore', 'ignore', 'inherit'] });
let cookie;

async function request(path, { method = 'GET', headers = {}, body, signedIn = false, status = 200 } = {}) {
  const response = await fetch(origin + path, {
    method, redirect: 'manual',
    headers: { ...headers, ...(signedIn ? { Cookie: cookie, Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${raw}`);
  for (const key of [initialKey, rotatedKey, siblingKey, legacyKey, temporaryKey, hookKey.trim()]) assert.ok(!raw.includes(key));
  return JSON.parse(raw);
}

try {
  for (let n = 0; n < 40; n++) {
    if (await fetch(origin).then(res => res.ok).catch(() => false)) break;
    await wait(100);
  }
  const login = await fetch(origin + '/login', { method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
  assert.equal(login.status, 303);
  cookie = login.headers.get('set-cookie').split(';')[0];

  const project = createStarterProject();
  const response = id => ({ id, type: 'respond-json', args: { status: 200, body: { admitted: true } } });
  project.backend.routes = [
    { id:'secure', name:'Secure', method:'GET', path:'/api/secure', access:'key', keySecret:'PLOT_SECRET_CLIENT', steps:[response('secure-ok')] },
    { id:'default', name:'Default', method:'GET', path:'/api/default', access:'key', steps:[response('default-ok')] },
    { id:'signature', name:'Signed', method:'POST', path:'/api/hook', access:'public', steps:[
      { id:'verify', type:'verify-hmac-sha256', args:{ payload:{$ref:'request.raw'}, signature:{$ref:'request.headers.x-signature'}, secret:{$secret:'PLOT_SECRET_WEBHOOK'} } },
      response('hook-ok'),
    ] },
  ];

  for (const id of [projectA, projectB]) await request(`/studio/api/projects/${id}`, { signedIn:true, method:'PUT', status:201, headers:{ 'If-None-Match':'*' }, body:project });
  async function set(id, name, value) {
    return request(`/studio/api/projects/${id}/secrets`, { signedIn:true, method:'POST', body:{ name, value } });
  }
  await set(projectA, 'PLOT_SECRET_CLIENT', initialKey);
  await set(projectB, 'PLOT_SECRET_CLIENT', siblingKey);
  await set(projectA, 'PLOT_SECRET_WEBHOOK', hookKey);
  const publish = (slug, secretProjectId, status = 200) => request(`/studio/api/sites/${slug}`, {
    signedIn:true, method:'PUT', status, headers:{ 'If-None-Match':'*' }, body:{ project, public:true, secretProjectId },
  });
  await publish('missing-project', randomUUID(), 404);
  const a = await publish('scoped-alpha', projectA);
  const b = await publish('scoped-beta', projectB);
  const legacy = await publish('legacy');
  assert.equal(a.secretProjectId, projectA);
  assert.equal(legacy.secretProjectId, null);
  const authorize = (site, key, status) => request(`${site.url}api/secure`, { status, headers:{ Authorization:`Bearer ${key}` } });
  await authorize(legacy, legacyKey, 200);
  await authorize(a, initialKey, 200);
  await authorize(a, siblingKey, 401);
  await authorize(a, legacyKey, 401);
  await authorize(b, siblingKey, 200);
  await authorize(b, initialKey, 401);

  const defaultKey = await request('/studio/api/sites/scoped-alpha/key', { signedIn:true });
  await request(`${a.url}api/default`, { headers:{ Authorization:`Bearer ${defaultKey.key}` } });
  const webhook = { action: 'update' };
  const sig = key => createHmac('sha256', key).update(JSON.stringify(webhook)).digest('hex');
  await request(`${a.url}api/hook`, { method:'POST', body:webhook, headers:{ 'X-Signature':sig(hookKey) } });
  const preview = (key, options) => request('/studio/api/backend/test', { signedIn:true, method:'POST', body:{
    backend:project.backend, data:project.data, request:{ method:'POST', path:'/api/hook', headers:{ 'X-Signature':sig(key) }, body:webhook },
    secretProjectId:projectA, ...options,
  } });
  assert.equal((await preview(hookKey)).status, 503);
  assert.equal((await preview(hookKey, { useSavedSecrets:true })).status, 200);
  assert.equal((await preview(temporaryKey, { useSavedSecrets:true, previewSecrets:{ PLOT_SECRET_WEBHOOK:temporaryKey } })).status, 200);
  assert.equal((await preview(hookKey, { useSavedSecrets:true, previewSecrets:{ PLOT_SECRET_WEBHOOK:temporaryKey } })).status, 400);

  const connection = (name, registration, status) => request(`/studio/api/backend/connections/${name}`, {
    signedIn:true, method:'PUT', status, body:{ methods:['POST'], credentialAlias:'PLOT_SECRET_CLIENT', credentialHeader:'X-API-Key', ...registration },
  });
  await connection('http-alias', { url:'http://example.com', allowPrivate:true }, 422);
  await connection('ambiguous', { url:'https://example.com', credential:'literal-value' }, 422);
  const connections = await connection('https-alias', { url:'https://example.com' }, 200);
  assert.equal(connections.find(entry => entry.id === 'https-alias').credentialHeader, 'X-API-Key');

  await set(projectA, 'PLOT_SECRET_CLIENT', rotatedKey);
  await authorize(a, rotatedKey, 200);
  await authorize(a, initialKey, 401);
  const snapshot = await readFile(join(directory, 'sites', 'scoped-alpha', 'snapshot.json'));
  assert.equal(snapshot.subarray(0, 8).toString(), 'PLOTPS1\0');
  assert.ok(!snapshot.includes(Buffer.from(rotatedKey)));
  await request(`/studio/api/projects/${projectA}/secrets/PLOT_SECRET_CLIENT`, { signedIn:true, method:'DELETE' });
  await authorize(a, rotatedKey, 503);
  await authorize(a, legacyKey, 503);
  await authorize(b, siblingKey, 200);
  console.log('Hosted secret isolation, rotation, deletion, legacy key and preview override verified.');
} finally {
  server.kill();
  await wait(200);
  await rm(directory, { recursive:true, force:true, maxRetries:3 });
}
