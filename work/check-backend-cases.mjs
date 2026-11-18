import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { backendModel, backendTestAssertions, backendTestCase, testQueryString, testQueryValues } from '../outputs/plot-studio/backend-model.mjs';
import { createEmptyProject, deserializeProject, serializeProject } from '../outputs/plot-studio/project.mjs';

const query = testQueryValues('tag=first&tag=second&mode=%2F');
assert.deepEqual(query, { tag: ['first', 'second'], mode: '/' });
assert.equal(testQueryString(query), 'tag=first&tag=second&mode=%2F');
const testcase = backendTestCase({ id: 'case-sample', name: 'Example',
  request: { method: 'POST', path: '/api/create', query, body: { name: 'Example' }, raw: 'never-stored', headers: { authorization: 'never-stored' } },
  previewSecrets: { PLOT_SECRET_FIXTURE: 'never-stored' }, expect: { status: 201, fields: [
    { path: 'data[0].name', operator: 'equals', value: 'Example' }, { path: '$.notice', operator: 'exists' },
    { path: 'flags', operator: 'equals', value: { enabled: true, archived: false } },
  ] },
});
assert.ok(!JSON.stringify(testcase).includes('never-stored'));
assert.throws(() => backendTestCase({ ...testcase, request: { ...testcase.request, body: { auth: { accessToken: 'example' } } } }), /credential/);
assert.throws(() => backendTestCase({ ...testcase, request: { ...testcase.request, query: { since: 'PLOT_SECRET_SAMPLE' } } }), /secret alias/);
assert.throws(() => backendTestCase({ ...testcase, request: { ...testcase.request, body: 'x'.repeat(17000) } }), /16 KiB/);
assert.throws(() => backendTestCase({ ...testcase, request: { ...testcase.request, path: '/api/../private' } }), /endpoint under/);
assert.deepEqual(backendTestAssertions(testcase, { status: 201, body: { notice: null, data: [{ name: 'Example' }], flags: { archived: false, enabled: true } } }), []);
assert.deepEqual(backendTestAssertions(testcase, { status: 400, body: { data: [{ name: 'Other' }] } }), [
  'Expected HTTP 201, received HTTP 400.', 'Field data[0].name differs from the expected JSON value.', 'Field $.notice is missing.', 'Field flags is missing.',
]);
const fixture = createEmptyProject('Saved request suite');
fixture.backend.testCases = [testcase];
assert.deepEqual(deserializeProject(serializeProject(fixture)).backend.testCases, [testcase]);
assert.equal(backendModel({ routes: [], testCases: [{ id: 'case-bad' }] }).testCases, undefined);
assert.deepEqual(backendModel({ routes: [], testCases: [testcase, testcase] }).testCases, [testcase]);

const table = { id: 'records', name: 'Records', rows: [], permissions: {}, fields: [{ id: 'name', name: 'Name', type: 'text', required: true }] };
fixture.data = { tables: [table] };
fixture.backend.testCases = [];
fixture.backend.routes = [{ id: 'create', name: 'Create record', method: 'POST', path: '/api/create', access: 'public', steps: [
  { id: 'insert', type: 'db-create', args: { table: 'records', data: { name: { $ref: 'request.body.name' } } } },
  { id: 'list', type: 'db-list', args: { table: 'records' } },
  { id: 'return', type: 'respond-json', args: { status: 201, body: { records: { $ref: 'steps.list.value' }, tags: { $ref: 'request.query.tag' } } } },
] }];

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16);
const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'plot-backend-case-'));
const server = spawn(process.execPath, ['outputs/plot-studio/server.mjs'], { stdio: ['ignore','ignore','pipe'], windowsHide: true, env: {
  ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: temp,
  STUDIO_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString('base64url')}$${digest.toString('base64url')}`,
  STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
} });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',`--user-data-dir=${temp}/profile`,'about:blank',
], { stdio: 'ignore', windowsHide: true });
let stderr = '';
server.stderr.setEncoding('utf8');
server.stderr.on('data', data => { stderr += data; });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read) {
  let last;
  for (let i = 0; i < 100; i++) {
    try { const result = await read(); if (result) return result; } catch (error) { last = error; }
    await wait(90);
  }
  throw new Error(`Timed out waiting for ${String(read).slice(0,200)}. ${last?.message || ''} ${stderr}`);
}
let ws;
try {
  await until(async () => (await fetch(origin)).ok);
  const debugPort = await until(async () => Number((await readFile(path.join(temp, 'profile', 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]));
  const [page] = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let messageId = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data);
    if (response.method === 'Runtime.exceptionThrown') errors.push(response.params.exceptionDetails);
    if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, response => response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const el = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const click = selector => evaluate(`${el(selector)}.click()`);
  const fill = (selector, value) => evaluate(`(() => {const field=${el(selector)}; field.value=${JSON.stringify(value)}; field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/#studio-login` });
  await until(() => evaluate(`Boolean(${el('input[type=password]')})`));
  await evaluate(`(() => {const field=${el('input[type=password]')};field.value=${JSON.stringify(password)};field.form.requestSubmit()})()`);
  await until(() => evaluate(`location.pathname === '/studio/' && Boolean(${el('#design-frame')}.getAttribute('srcdoc'))`));
  const storageKey = '99host.plot-studio.project.v1';
  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(serializeProject(fixture))})`);
  await send('Page.reload');
  await until(() => evaluate(`Boolean(${el('[data-mode=backend]')}) && Boolean(${el('#design-frame')}.getAttribute('srcdoc'))`));
  await click('[data-mode=backend]');
  await until(() => evaluate(`Boolean(${el('[data-be-action=save-request-case]')})`));
  await fill('[data-test=body]', '{"name":"Ada"}');
  await fill('[data-test=query]', 'tag=one&tag=two');
  await fill('[data-test=headers]', '{"authorization":"temporary-key","x-signature":"temporary-signature"}');
  await fill('[data-test=secrets]', '{"PLOT_SECRET_SAMPLE":"temporary-secret"}');
  await click('[data-be-action=save-request-case]');
  assert.equal(await evaluate(`${el('#be-case-form [name=body]')}.value`), '{"name":"Ada"}');
  const makeCase = async (name, expectedName, expectedStatus, expectedTags) => {
    await fill('#be-case-form [name=name]', name);
    await fill('#be-case-form [name=status]', String(expectedStatus));
    await click('[data-be-action=add-assertion]');
    await fill('.be-case-assertion:last-child [data-assert=path]', 'records[0].name');
    await fill('.be-case-assertion:last-child [data-assert=operator]', 'equals');
    await fill('.be-case-assertion:last-child [data-assert=value]', JSON.stringify(expectedName));
    await click('[data-be-action=add-assertion]');
    await fill('.be-case-assertion:last-child [data-assert=path]', 'records[0].id');
    if (expectedTags) {
      await click('[data-be-action=add-assertion]');
      await fill('.be-case-assertion:last-child [data-assert=path]', 'tags');
      await fill('.be-case-assertion:last-child [data-assert=operator]', 'equals');
      await fill('.be-case-assertion:last-child [data-assert=value]', JSON.stringify(expectedTags));
    }
    await click('#be-case-form [type=submit]');
    await wait(50);
    assert.deepEqual(errors.map(error => error.exception?.description || error.text), []);
    await until(() => evaluate(`(() => { const form=${el('#be-case-form')}; if (!form) return true;
      const error=form.querySelector('.be-case-error').textContent; const invalid=[...form.querySelectorAll(':invalid')].map(value=>value.outerHTML);
      if (error || invalid.length) throw new Error(error || invalid.join(' '));
      throw new Error(${el('#be-status')}.textContent + ' :: ' + [...new FormData(form)].map(field=>field.join('=')).join(', ')); })()`));
  };
  await makeCase('Save Ada from Workflow', 'Ada', 201, ['one','two']);
  await click('[data-be-action=new-case]');
  await fill('#be-case-form [name=body]', '{"name":"Grace"}');
  await fill('#be-case-form [name=query]', 'tag=sample');
  await makeCase('Grace has a clean copy', 'Grace', 201);
  await click('[data-be-action=new-case]');
  await fill('#be-case-form [name=body]', '{"name":"Hedy"}');
  await fill('#be-case-form [name=query]', 'tag=sample');
  await makeCase('Reports failing differences', 'wrong', 202);
  const saved = await until(() => evaluate(`(() => {const project=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}) || '{}'); return project.backend?.testCases?.length === 3 && project.backend;})()`));
  assert.ok(!JSON.stringify(saved).includes('temporary-'));
  assert.deepEqual(saved.testCases[0].request.query, { tag: ['one','two'] });
  await send('Page.reload');
  await until(() => evaluate(`Boolean(${el('[data-mode=backend]')}) && Boolean(${el('#design-frame')}.getAttribute('srcdoc'))`));
  await click('[data-mode=backend]');
  await click('[data-be-tab=tests]');
  await click('[data-be-action=run-all-cases]');
  await until(() => evaluate(`${el('#be-status')}.textContent === '2 of 3 tests passed.'`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.be-case-badge')].map(item => item.dataset.state)`), ['pass','pass','fail']);
  assert.match(await evaluate(`${el('.be-case-failures')}.textContent`), /Expected HTTP 202, received HTTP 201.*records\[0\]\.name differs/);
  await click('[data-case-edit][aria-label="Edit Reports failing differences"]');
  await fill('#be-case-form [name=status]', '201');
  await fill('.be-case-assertion [data-assert=value]', '"Hedy"');
  await click('#be-case-form [type=submit]');
  await click('[data-case-run][aria-label="Run Reports failing differences"]');
  await until(() => evaluate(`${el('#be-status')}.textContent === 'Reports failing differences passed.'`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.be-case-badge')].map(item => item.dataset.state)`), ['pass','pass','pass']);
  await click('[data-case-edit][aria-label="Edit Reports failing differences"]');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('./backend-tests-desktop.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate(`${el('.be-tests')}.scrollWidth <= ${el('.be-tests')}.clientWidth`));
  assert.deepEqual(errors, []);
  console.log('Request fixture normalization, typed assertions, project persistence, actual Chrome Run all and isolated SQLite test execution passed.');
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
}
