import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { compileGraph } from '../outputs/plot-studio/logic.mjs';
import { buildSitePackage, createBlock, createEmptyProject, deserializeProject, serializeProject } from '../outputs/plot-studio/project.mjs';

const repo = fileURLToPath(new URL('../outputs/plot-studio/', import.meta.url));
const work = fileURLToPath(new URL('./', import.meta.url));
const storeKey = '99host.plot-studio.project.v1';
const routePath = '/api/python-quote';
const script = {
  id: 'python-quote',
  name: 'Calculate quote',
  source: [
    'def run(input):',
    '    items = input["items"]',
    '    print("Calculated", len(items), "line items")',
    '    return {"customer": input["customer"], "quote": {"minor_units": sum(row["qty"] * row["unit"] for row in items)}, "flags": [True, None]}',
    '',
  ].join('\n'),
};
const items = [{ qty: 2, unit: 399 }, { qty: 3, unit: 125 }];
const buildValues = customer => ({ customer, items });
const draftValues = buildValues('fixture-only-draft-input-285');
const requestValues = buildValues('Renée');
const fixtureMarker = 'fixture-only-saved-request-285';
const wire = (from, output, to, input = 'in') => ({ id: `${from}-${output}-${to}-${input}`, from: { nodeId: from, port: output }, to: { nodeId: to, port: input } });

function fixture(includeScript = true) {
  const project = createEmptyProject('Python workflow QA');
  const page = project.pages[0];
  page.blocks.push(createBlock('text', { id: 'quote-total', props: { text: 'Awaiting quote' } }));
  const node = (id, type, config) => ({ id, type, config });
  project.graph = {
    nodes: [
      node('load', 'page-load', { page: page.id }),
      node('quote-api', 'call-backend', { path: routePath, method: 'POST', body: requestValues }),
      node('read-total', 'get-property', { path: 'result.quote.minor_units' }),
      node('paint-total', 'set-text', { target: 'quote-total' }),
      node('paint-error', 'set-text', { target: 'quote-total', valueMode: 'literal', value: 'Quote unavailable' }),
    ],
    edges: [wire('load', 'next', 'quote-api'), wire('quote-api', 'next', 'read-total'), wire('quote-api', 'body', 'read-total', 'input'),
      wire('read-total', 'next', 'paint-total'), wire('read-total', 'result', 'paint-total', 'value'), wire('quote-api', 'fault', 'paint-error')],
  };
  project.backend = {
    version: 1,
    pythonScripts: includeScript ? [script] : [],
    routes: [{ id: 'quote', name: 'Quote workflow', method: 'POST', path: routePath, access: 'public', steps: [
      { id: 'compute', type: 'run-python', args: { script: includeScript ? script.id : '', values: { $ref: 'request.body' }, timeout: 4 } },
      { id: 'respond', type: 'respond-json', args: { status: 200, body: { $ref: 'steps.compute.value' } } },
    ] }],
    testCases: [{ id: 'case-export', name: 'Fixture stays editable', request: { method: 'POST', path: routePath, body: buildValues(fixtureMarker) }, expect: { status: 200, fields: [] } }],
  };
  return project;
}

function verifyEnvelope(data, values) {
  assert.deepEqual(data.result, { customer: values.customer, quote: { minor_units: 1173 }, flags: [true, null] });
  assert.match(JSON.stringify(data.logs), /Calculated 2 line items/);
  assert.ok(typeof data.durationMs === 'number' && data.durationMs >= 0);
}

function verifyPackaged(files, chosen = script) {
  const manifest = JSON.parse(files['backend.json']);
  assert.deepEqual(manifest.pythonScripts, [chosen]);
  assert.equal(manifest.routes[0].steps[0].args.script, chosen.id);
  assert.equal(manifest.testCases, undefined);
  assert.ok(files['python_runner.py']?.length, 'The export includes the Python runner.');
  assert.ok(files['python_sandbox.py']?.length, 'The export includes the isolated script launcher.');
  assert.match(String(files['BACKEND.md']), /python/i);
  for (const content of Object.values(files)) assert.ok(!String(content).includes(fixtureMarker));
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith('public/')) {
      assert.ok(!String(content).includes('Calculated') || !String(content).includes('line items'), `${name} contains Python source.`);
      assert.ok(!String(content).includes(draftValues.customer), `${name} contains unsaved test values.`);
    }
  }
}

async function waitFor(step, failure, milliseconds = 12000) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    try { const answer = await step(); if (answer) return answer; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${failure}${last ? ` ${last.message}` : ''}`);
}

async function gateway(state) {
  const socket = createServer();
  await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const { port } = socket.address();
  await new Promise(done => socket.close(done));
  const origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const server = spawn(process.execPath, [resolve(repo, 'server.mjs')], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: {
    ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
    STUDIO_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString('base64url')}$${digest.toString('base64url')}`,
    STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
  } });
  let stderr = '';
  server.stderr.on('data', data => { stderr += data; });
  try {
    try { await waitFor(async () => (await fetch(origin)).ok, 'Local Studio gateway did not start.'); }
    catch (error) { throw new Error(`${error.message}\n${stderr}`); }
    const login = await fetch(`${origin}/login`, { method: 'POST', redirect: 'manual', headers: { origin }, body: new URLSearchParams({ password }) });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, `Login did not set a session, HTTP ${login.status}.`);
    const request = (path, body, options = {}) => fetch(origin + path, { method: options.method || 'POST', headers: {
      origin, ...(options.noAuth ? {} : { cookie }), 'content-type': 'application/json', ...options.headers,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { origin, password, request, server, diagnostics: () => stderr };
  } catch (error) {
    server.kill();
    throw error;
  }
}

async function responseJson(response, status) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

async function runGatewayWorkflow(gateway, project) {
  const directPath = '/studio/api/backend/python/test';
  const directInput = { source: script.source, values: draftValues, timeout: 4 };
  await responseJson(await gateway.request(directPath, directInput, { noAuth: true }), 401);
  verifyEnvelope(await responseJson(await gateway.request(directPath, directInput), 200), draftValues);
  const testPath = '/studio/api/backend/test';
  const request = { method: 'POST', path: routePath, body: requestValues };
  const validating = await responseJson(await gateway.request(testPath, { backend: project.backend, request, validateOnly: true }), 200);
  assert.deepEqual((validating.diagnostics || []).filter(issue => issue.severity === 'error'), []);
  const workflow = await responseJson(await gateway.request(testPath, { backend: project.backend, request }), 200);
  assert.equal(workflow.status, 200, JSON.stringify(workflow));
  verifyEnvelope(workflow.body, requestValues);

  const slug = `qa-python-${randomBytes(5).toString('hex')}`;
  const hosted = await responseJson(await gateway.request(`/studio/api/sites/${slug}`, { project }, { method: 'PUT', headers: { 'If-None-Match': '*' } }), 200);
  assert.equal(hosted.enabled, true);
  try {
    const body = await responseJson(await gateway.request(`/studio/sites/${slug}${routePath}`, requestValues), 200);
    verifyEnvelope(body, requestValues);
  } finally {
    await responseJson(await gateway.request(`/studio/api/sites/${slug}`, undefined, { method: 'DELETE', headers: { 'If-Match': `"${hosted.version}"` } }), 200);
  }
  console.log('Real isolated Python passed: draft script response, authentication, workflow validation and actual request, hosted route.');
}

async function verifyExportRuntime(packaged, state) {
  const directory = resolve(state, 'export');
  for (const [name, content] of Object.entries(packaged)) {
    const path = resolve(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  const runtime = spawn(process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['runtime.py', '--port', '0'], {
    cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  runtime.stdout.on('data', data => { output += data; });
  runtime.stderr.on('data', data => { output += data; });
  try {
    const origin = await waitFor(() => output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], 'Exported runtime did not start.');
    const response = await fetch(origin + routePath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestValues) });
    verifyEnvelope(await responseJson(response, 200), requestValues);
    const visible = await fetch(`${origin}/`);
    assert.equal(visible.status, 200);
    assert.ok(!(await visible.text()).includes('Calculated 2 line items'));
    for (const secretPath of ['/backend.json','/python_runner.py']) assert.notEqual((await fetch(origin + secretPath)).status, 200);
    console.log('Exported ZIP runtime passed: actual Python workflow and private source/metadata paths.');
  } finally {
    runtime.kill();
  }
}

function unzipStored(data) {
  const files = {};
  let cursor = 0;
  while (data.readUInt32LE(cursor) === 0x04034b50) {
    assert.equal(data.readUInt16LE(cursor + 8), 0, 'The Studio ZIP writer uses stored entries.');
    const size = data.readUInt32LE(cursor + 18);
    const nameLength = data.readUInt16LE(cursor + 26);
    const extraLength = data.readUInt16LE(cursor + 28);
    const start = cursor + 30 + nameLength + extraLength;
    const name = data.subarray(cursor + 30, cursor + 30 + nameLength).toString('utf8');
    files[name] = data.subarray(start, start + size);
    cursor = start + size;
  }
  return files;
}

function fakePython(values) {
  return {
    result: { customer: values.customer, quote: { minor_units: values.items.reduce((sum, item) => sum + item.qty * item.unit, 0) }, flags: [true, null] },
    logs: 'Calculated 2 line items\n', durationMs: 35,
  };
}

async function browserMockExecution(page) {
  await page.route('**/studio/api/backend/catalog', async route => {
    const response = await route.fetch();
    const json = await response.json();
    const original = json.services?.python || {};
    json.services = { ...json.services, python: { timeoutMax: 15, version: '3.12', packages: [], ...original, available: true } };
    return route.fulfill({ response, json });
  });
  await page.route('**/studio/api/backend/python/test', async route => {
    const body = route.request().postDataJSON();
    assert.equal(body.source, script.source);
    assert.deepEqual(body.values, draftValues);
    return route.fulfill({ json: fakePython(body.values) });
  });
  await page.route('**/studio/api/backend/test', async route => {
    const body = route.request().postDataJSON();
    if (body.validateOnly) return route.continue();
    assert.equal(body.request.path, routePath);
    assert.equal(body.backend.pythonScripts[0].source, script.source);
    assert.equal(body.backend.routes[0].steps[0].args.script, body.backend.pythonScripts[0].id);
    assert.deepEqual(body.backend.routes[0].steps[0].args.values, { $ref: 'request.body' });
    return route.fulfill({ json: { status: 200, body: fakePython(body.request.body), headers: { 'Content-Type': 'application/json' } } });
  });
}

async function workflowFromBrowser(running, useMock) {
  const require = createRequire(import.meta.url);
  const dependency = process.env.PLOT_QA_PLAYWRIGHT || 'playwright';
  const { chromium } = require(dependency);
  const executablePath = process.env.PLOT_QA_CHROME || process.env.PLOT_BROWSER_PATH || chromium.executablePath();
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ key, content }) => {
      if (location.pathname === '/studio/' && !localStorage.getItem(key)) localStorage.setItem(key, content);
    }, { key: storeKey, content: serializeProject(fixture(false)) });
    if (useMock) await browserMockExecution(page);
    await page.goto(`${running.origin}/#studio-login`);
    await page.getByLabel('Access password').fill(running.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/studio/');
    await page.locator('[data-mode="backend"]').click();
    await page.getByRole('button', { name: 'Python', exact: true }).click();
    await page.getByRole('button', { name: /New script/ }).click();
    await page.getByLabel('Script name', { exact: true }).fill(script.name);
    await page.locator('#be-python-form [name="source"]').fill(script.source);
    await page.locator('#be-python-form [name="values"]').fill(JSON.stringify(draftValues));
    const draft = page.waitForResponse(response => response.url().endsWith('/studio/api/backend/python/test'));
    await page.getByRole('button', { name: 'Run test', exact: true }).click();
    const directResponse = await draft;
    assert.equal(directResponse.status(), 200);
    verifyEnvelope(await directResponse.json(), draftValues);
    await page.locator('.be-python-result pre').filter({ hasText: 'Calculated 2 line items' }).waitFor();
    await page.getByRole('button', { name: 'Save script', exact: true }).click();
    const saved = await waitFor(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).backend?.pythonScripts?.[0], storeKey), 'UI never saved the script.');
    assert.deepEqual(saved, { ...script, id: saved.id });
    await page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await page.getByRole('button', { name: /Quote workflow/ }).click();
    await page.getByRole('button', { name: /Run Python script/ }).click();
    await page.getByLabel('Python script', { exact: true }).selectOption(saved.id);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const frame = page.frameLocator('#preview-frame');
    await frame.locator('[data-block-id="quote-total"]').filter({ hasText: /^1173$/ }).waitFor();
    const visible = await frame.locator('html').textContent();
    assert.ok(!visible.includes(draftValues.customer));
    await page.locator('#preview-dialog').press('Escape');

    await page.locator('#project-trigger').click();
    const plotDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .plot project' }).click();
    const plot = JSON.parse(await readFile(await (await plotDownload).path(), 'utf8'));
    assert.deepEqual(plot.backend.pythonScripts, [saved]);
    assert.ok(!JSON.stringify(plot).includes(draftValues.customer));

    const zipDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator('#export-form [value="download"]').click();
    const files = unzipStored(await readFile(await (await zipDownload).path()));
    verifyPackaged(files, saved);

    await page.reload();
    await page.locator('[data-mode="backend"]').click();
    await page.getByRole('button', { name: 'Python', exact: true }).click();
    await page.locator('[data-python-select]').filter({ hasText: script.name }).click();
    assert.equal(await page.locator('#be-python-form [name="source"]').inputValue(), script.source);
    assert.ok(!(await page.locator('#be-python-form [name="values"]').inputValue()).includes(draftValues.customer));
    assert.equal(await page.getByRole('button', { name: 'Delete script', exact: true }).isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('.be-python').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: resolve(work, 'python-studio-mobile-qa.png') });
    assert.deepEqual(errors, []);
    console.log(`Chromium passed: Python tab test/save, named workflow binding, Blueprint Preview, .plot and ZIP downloads${useMock ? ' (Python execution mocked on Windows; workflow validation and exports used the real gateway)' : ''}.`);
  } finally {
    await browser.close();
  }
}

const args = new Set(process.argv.slice(2));
const project = fixture();
const compiled = compileGraph(project.graph, project);
assert.deepEqual(compiled.diagnostics.filter(issue => issue.severity === 'error'), []);
assert.deepEqual(deserializeProject(serializeProject(project)).backend.pythonScripts, [script]);
console.log('Python workflow .plot serialization and frontend Blueprint compilation passed.');
if (!args.has('--model')) {
  const packaged = await buildSitePackage(project, compiled.code, { fetcher: async url => new Response(await readFile(url), { status: 200 }) });
  verifyPackaged(packaged);
  console.log('Generated bundle contains private Python runner and source metadata, without saved test fixtures or public source.');
  if (args.has('--live') || args.has('--browser') || args.has('--unavailable')) {
    const state = await mkdtemp(resolve(work, 'python-studio-'));
    const running = await gateway(state);
    try {
      if (args.has('--live')) {
        await runGatewayWorkflow(running, project);
        await verifyExportRuntime(packaged, state);
      }
      if (args.has('--unavailable')) {
        const request = { source: script.source, values: draftValues, timeout: 4 };
        await responseJson(await running.request('/studio/api/backend/python/test', request, { noAuth: true }), 401);
        const unavailable = await responseJson(await running.request('/studio/api/backend/python/test', request), 503);
        assert.equal(unavailable.error?.code, 'PYTHON_UNAVAILABLE');
        console.log('Authenticated draft endpoint rejects execution where an isolated Python runner is unavailable.');
      }
      if (args.has('--browser')) await workflowFromBrowser(running, args.has('--mock-execution'));
    } catch (error) {
      throw new Error(`${error.message}\n${running.diagnostics()}`, { cause: error });
    } finally {
      running.server.kill();
    }
  }
}
