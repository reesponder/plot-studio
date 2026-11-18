import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { buildSitePackage, createEmptyProject } from '../outputs/plot-studio/project.mjs';

const target = 'http://localhost:15176';
const entry = resolve('outputs/plot-studio/server.mjs');
const token = () => randomBytes(32).toString('base64url');
const password = token();
const alias = 'PLOT_SECRET_RELEASE_ACCESS';
const oldKey = token();
const newKey = token();
const otherKey = token();
const globalKey = token();
const own = createEmptyProject('Vault demo');
own.backend.routes = [{ id: 'vault-auth', name: 'Private status', access: 'key', keySecret: alias, method: 'GET', path: '/api/key-check', steps: [
  { id: 'response', type: 'respond-json', args: { status: 200, body: { verified: true } } },
] }];
const hash = spawnSync(process.execPath, [entry, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const state = await mkdtemp(join(tmpdir(), 'plot-secrets-flows-'));
const service = spawn(process.execPath, [entry], { stdio: ['ignore', 'ignore', 'inherit'], env: {
  ...process.env, PUBLIC_ORIGIN: target, PORT: '15176', PLOT_STATE_DIR: state, [alias]: globalKey,
  STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: token(), PLOT_PROJECT_STORAGE_KEY: token(), PLOT_FILE_KEY: token(),
} });
let cookie;
async function request(path, { method = 'GET', body, status = 200, headers = {}, guest = false, origin = target } = {}) {
  const result = await fetch(target + path, { method, redirect: 'manual', headers: {
    ...(guest ? {} : { Cookie: cookie }), ...(method !== 'GET' ? { Origin: origin } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(result.status, status, `${method} ${path} returned ${result.status} ${await result.clone().text()}`);
  return result;
}

try {
  let ready = false;
  for (let n = 0; n < 40 && !ready; n++) {
    ready = await fetch(target + '/').then(response => response.ok).catch(() => false);
    if (!ready) await wait(140);
  }
  assert.ok(ready);
  const login = await fetch(target + '/login', { method: 'POST', headers: {
    Origin: target, 'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ password }), redirect: 'manual' });
  assert.equal(login.status, 303);
  cookie = login.headers.get('set-cookie').split(';')[0];

  const id = randomUUID();
  const other = randomUUID();
  const project = `/studio/api/projects/${id}`;
  const peer = `/studio/api/projects/${other}`;
  const vault = `${project}/secrets`;
  const peerVault = `${peer}/secrets`;
  const newProject = { 'If-None-Match': '*' };
  for (const path of [project, peer]) await request(path, { method: 'PUT', body: own, status: 201, headers: newProject });
  await request(vault, { status: 401, guest: true });
  await request(vault, { method: 'POST', body: { name: alias, value: oldKey }, status: 403, origin: 'https://other.example' });
  await request(vault, { method: 'POST', body: { name: 'PLOT_API_KEY', value: oldKey }, status: 422 });
  const added = await request(vault, { method: 'POST', body: { name: alias, value: oldKey }, status: 201, headers: newProject });
  assert.deepEqual(Object.keys((await added.json()).secret).sort(), ['name', 'updatedAt']);
  await request(peerVault, { method: 'POST', body: { name: alias, value: otherKey } });
  await request(vault, { method: 'POST', body: { name: alias, value: otherKey }, status: 409, headers: newProject });
  const listed = await request(vault);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await listed.json()).secrets.map(item => item.name), [alias]);
  assert.ok(!(await (await request(vault)).text()).includes(oldKey));
  assert.deepEqual(await (await request(project)).json().then(item => item.project.backend), own.backend);
  const sealed = await readFile(join(state, 'project-secrets', `${id}.sealed`));
  assert.ok(sealed.subarray(0, 7).equals(Buffer.from('PLOTPS1')) && !sealed.includes(Buffer.from(oldKey)));

  const example = await buildSitePackage(own, '', { fetcher: async url => new Response(await readFile(url)) });
  assert.equal(example['.env.example'], `${alias}=\n`);
  assert.ok(!Object.keys(example).some(path => path.startsWith('public/.env')));
  assert.ok(!JSON.stringify(example).includes(oldKey));

  const deploy = await request('/studio/api/sites/vault-demo', { method: 'PUT', headers: newProject,
    body: { project: own, public: true, secretProjectId: id } });
  const publication = await deploy.json();
  const api = publication.publicUrl + 'api/key-check';
  const keyHeader = value => ({ Authorization: `Bearer ${value}` });
  await request(api, { status: 401, guest: true });
  await request(api, { status: 401, guest: true, headers: keyHeader(otherKey) });
  await request(api, { status: 401, guest: true, headers: keyHeader(globalKey) });
  assert.deepEqual(await (await request(api, { guest: true, headers: keyHeader(oldKey) })).json(), { verified: true });
  const testBackend = { version: 1, routes: [{ id: 'verify-token', name: 'Verify test token', access: 'public', method: 'POST', path: '/api/verify', steps: [
    { id: 'verification', type: 'security-verify-secret-token', args: { token: { $ref: 'request.body.token' }, secret: { $secret: alias } } },
    { id: 'response', type: 'respond-json', args: { status: 200, body: { verified: true } } },
  ] }] };
  const draftTest = { backend: testBackend, data: own.data, secretProjectId: id };
  async function preview(presented, extras) {
    const resp = await request('/studio/api/backend/test', { method: 'POST', body: { ...draftTest, ...extras,
      request: { method: 'POST', path: '/api/verify', raw: JSON.stringify({ token: presented }) } } });
    const body = await resp.text();
    assert.ok(!body.includes(oldKey) && !body.includes(newKey) && !body.includes(otherKey));
    return JSON.parse(body).status;
  }
  assert.notEqual(await preview(oldKey), 200);
  assert.equal(await preview(oldKey, { useSavedSecrets: true }), 200);
  assert.equal(await preview(otherKey, { useSavedSecrets: true, previewSecrets: { [alias]: otherKey } }), 200);

  await request(vault, { method: 'POST', body: { name: alias, value: newKey } });
  await request(api, { status: 401, guest: true, headers: keyHeader(oldKey) });
  await request(api, { guest: true, headers: keyHeader(newKey) });
  await request(project, { method: 'DELETE', headers: { 'If-Match': '"1"' } });
  const missing = await fetch(target + api, { headers: keyHeader(newKey) });
  assert.ok(!missing.ok, `Deleted project accepted key (${missing.status})`);
  await request(vault, { status: 404 });
  await request(project, { method: 'PUT', body: own, status: 201, headers: newProject });
  assert.deepEqual(await (await request(vault)).json(), { secrets: [] });
  console.log('Verified encrypted project isolation, authenticated alias management, exported environment names, live key rotation, explicit test access and deletion.');
} finally {
  service.kill();
  await wait(220);
  await rm(state, { recursive: true, force: true, maxRetries: 3 });
}
