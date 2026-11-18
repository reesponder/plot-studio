const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const projectId = '1b227906-fce9-47ad-abb1-5aa7def61bd6';
const demoKey = 'synthetic-value-for-editor-test';
const vault = new Map();
const calls = [];
const paths = new Set(['backend-editor.css', 'backend-editor.mjs', 'backend-model.mjs']);

function send(response, data, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const asset = url.pathname.slice(1);
  if (paths.has(asset)) {
    response.writeHead(200, { 'content-type': asset.endsWith('.css') ? 'text/css' : 'text/javascript' });
    response.end(await readFile(resolve('outputs/plot-studio', asset)));
    return;
  }
  if (!asset) {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/backend-editor.css"><div id="work"></div>
<script type="module">
import { mountBackend } from '/backend-editor.mjs';
const project = {name:'Sample project', data: {}, backend:{routes:[{id:'r1', name:'Check key', method:'GET', path:'/api/hello', access:'key', steps:[{id:'node1',type:'security-verify-secret-token',args:{}}]}]}};
let binding = null;
const backend = mountBackend(document.getElementById('work'), { getProject: () => project, getServerProject: () => binding, onChange: edit => edit(project), saveServerProject: () => {binding={id:'${projectId}'};backend.refresh()} });
backend.refresh();
</script>`);
    return;
  }
  const parts = [];
  for await (const part of request) parts.push(part);
  const data = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : null;
  calls.push({ path: url.pathname, method: request.method, data });
  if (url.pathname === '/studio/api/backend/catalog') return send(response, { operations: [{ type:'security-verify-secret-token', label:'Verify a server token', fields:[{ key:'secret', label:'Server key alias', kind:'secret' }]}] });
  if (url.pathname === '/studio/api/backend/test') return send(response, { status:200, body:{ verified:true } });
  if (url.pathname === '/studio/api/backend/connections') return send(response, []);
  if (url.pathname === '/studio/api/backend/connections/example') return send(response, {});
  const base = `/studio/api/projects/${projectId}/secrets`;
  if (url.pathname === base && request.method === 'GET') return send(response, { secrets: [...vault.keys()].map(name => ({ name, updatedAt: 1794916800000 })) });
  if (url.pathname === base && request.method === 'POST') {
    vault.set(data.name, data.value);
    return send(response, { name: data.name });
  }
  if (url.pathname.startsWith(base + '/') && request.method === 'DELETE') {
    vault.delete(url.pathname.split('/').at(-1));
    return send(response, {});
  }
  if (url.pathname === '/studio/api/sites') return send(response, [{ name:'Sample project', slug:'legacy', url:'/s/legacy', public:true, enabled:true, pages:1, routes:1, secretProjectId:null, version:'2' }]);
  if (url.pathname === '/studio/api/sites/legacy') return send(response, { name:'Sample project', slug:'legacy', public:true });
  return send(response, { error:{ message:'Unknown route.' } }, 404);
});

async function main() {
  const address = await new Promise(done => server.listen(0, '127.0.0.1', () => done(server.address())));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath(), headless:true });
    const page = await browser.newPage({ viewport:{ width:320, height:720 } });
    page.setDefaultTimeout(6000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    const secrets = page.getByRole('button', { name:'Secrets', exact:true });
    await secrets.click();
    await page.getByRole('button', { name:'Save project to server' }).click();
    await page.getByRole('heading', { name:'Add a secret' }).waitFor();
    await page.getByLabel('Alias', { exact:true }).fill('PLOT_SECRET_DEMO');
    const input = page.getByLabel('Secret value', { exact:true });
    assert.equal(await input.getAttribute('type'), 'password');
    await input.fill(demoKey);
    await page.getByRole('button', { name:'Save secret' }).click();
    await page.getByRole('listitem').getByText('PLOT_SECRET_DEMO', { exact:true }).waitFor();
    assert.ok(await page.locator('.be-secrets time').isVisible());
    assert.equal(vault.get('PLOT_SECRET_DEMO'), demoKey);
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.locator('body').innerText().then(value => value.includes(demoKey)), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await secrets.isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    }
    await page.getByRole('button', { name:'Replace', exact:true }).click();
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    await page.getByText('Enter a multiline value').click();
    await input.fill('line 1\nline 2');
    await page.getByRole('button', { name:'Replace value' }).click();
    await page.getByText('Secret value replaced.', { exact:true }).waitFor();
    assert.equal(vault.get('PLOT_SECRET_DEMO'), 'line 1\nline 2');
    await page.getByRole('button', { name:'Workflows', exact:true }).click();
    await page.getByText('Test headers and secrets').click();
    const use = page.getByText("Use this project's saved secrets for this request");
    await use.click();
    await page.getByLabel('Temporary secret aliases (JSON)').fill('{"PLOT_SECRET_DEMO":"temporary"}');
    await page.getByRole('button', { name:'Send request' }).click();
    await page.getByText('HTTP 200', { exact:true }).waitFor();
    const test = calls.findLast(call => call.path === '/studio/api/backend/test');
    assert.equal(test.data.secretProjectId, projectId);
    assert.equal(test.data.useSavedSecrets, true);
    assert.equal(test.data.previewSecrets.PLOT_SECRET_DEMO, 'temporary');
    assert.equal(await page.getByLabel('Temporary secret aliases (JSON)').inputValue(), '');
    assert.equal(await page.getByLabel('Secret alias', { exact:true }).getAttribute('list'), 'be-secret-aliases');

    await page.getByRole('button', { name:'Connections', exact:true }).click();
    await page.getByLabel('Connection ID').fill('example');
    await page.getByLabel('Server address').fill('https://example.com/api');
    await page.getByLabel('Secret alias (optional)').fill('PLOT_SECRET_DEMO');
    await page.getByLabel('Credential header').selectOption('X-API-Key');
    await page.getByRole('button', { name:'Save connection' }).click();
    await page.getByText('Server connection saved.').waitFor();
    const connection = calls.findLast(call => call.path === '/studio/api/backend/connections/example');
    assert.equal(connection.data.credentialAlias, 'PLOT_SECRET_DEMO');
    assert.equal(connection.data.credentialHeader, 'X-API-Key');

    await page.getByRole('button', { name:'Hosting', exact:true }).click();
    const linkage = page.getByLabel('Project secrets', { exact:true });
    if (!await linkage.count()) console.error('Hosting diagnostics', pageErrors, await page.locator('#be-status').textContent());
    assert.equal(await linkage.inputValue(), 'current');
    await page.getByRole('button', { name:'Select', exact:true }).click();
    assert.equal(await linkage.inputValue(), 'none');
    await page.getByRole('button', { name:'Update site' }).click();
    await page.getByText('Sample project is public.', { exact:false }).waitFor();
    assert.equal(calls.findLast(call => call.path === '/studio/api/sites/legacy').data.secretProjectId, null);
    await linkage.selectOption('current');
    await page.getByRole('button', { name:'Update site' }).click();
    await page.getByText('Sample project is public.', { exact:false }).waitFor();
    assert.equal(calls.findLast(call => call.path === '/studio/api/sites/legacy').data.secretProjectId, projectId);

    await secrets.click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name:'Delete', exact:true }).click();
    await page.getByText('Secret deleted.', { exact:true }).waitFor();
    assert.equal(vault.size, 0);
    assert.deepEqual(pageErrors, []);
    console.log('Secret editor validated at 320, 390, and 1440 px.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
