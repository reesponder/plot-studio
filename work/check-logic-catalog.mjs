import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { catalogNodes, createCatalogHelpers } from '../outputs/plot-studio/logic-catalog.mjs';
import { canBypass, compileGraph, describeNodeCatalog, nodeTypes } from '../outputs/plot-studio/logic.mjs';

const project = { pages: [{ id: 'home', name: 'Home', blocks: [
  { id: 'form', type: 'form' }, { id: 'action', type: 'button' }, { id: 'output', type: 'text' },
  { id: 'result', type: 'text' }, { id: 'image', type: 'image' }, { id: 'field', type: 'input' },
] }], data: { tables: [{ id: 'inbox', name: 'Inbox' }] } };

function node(id, type, config = {}) { return { id, type, config }; }
function wire(from, port, to, input = 'in') { return { id: `${from}-${port}-${to}-${input}`, from: { nodeId: from, port }, to: { nodeId: to, port: input } }; }
function compile(nodes, edges) {
  const { code, diagnostics } = compileGraph({ nodes, edges }, project);
  assert.deepEqual(diagnostics.filter((item) => item.severity === 'error'), []);
  assert.ok(code);
  assert.doesNotThrow(() => new Function(code));
  return code;
}

assert.ok(describeNodeCatalog().length >= 400);
assert.equal(describeNodeCatalog().length, Object.keys(nodeTypes).length);
assert.equal(new Set(describeNodeCatalog().map((item) => item.id)).size, describeNodeCatalog().length);
for (const [type, spec] of Object.entries(catalogNodes)) {
  assert.ok(spec.label && spec.description && spec.group);
  const options = spec.target ? { target: 'action' } : {};
  const nodes = spec.event ? [node('a', type, options), node('b', 'log')] : [node('a', 'page-load'), node('b', type, options)];
  compile(nodes, [wire('a', 'next', 'b')]);
}
const oversized = compileGraph({ nodes: Array.from({ length: 1201 }, (_, i) => node(`n-${i}`, 'constant')) }, project);
assert.match(oversized.diagnostics[0].message, /1,200/);
const cycleNodes = [node('root', 'page-load'), node('a', 'wait-flow'), node('b', 'wait-flow')];
const cycle = compileGraph({ nodes: cycleNodes, edges: [wire('root', 'next', 'a'), wire('a', 'next', 'b'), wire('b', 'next', 'a')] }, project);
assert.ok(cycle.diagnostics.some((item) => /cycle/.test(item.message)));
assert.equal(canBypass(node('ignore', 'set-text')), true);
assert.equal(canBypass(node('ignore', 'add-numbers')), false);
const bypassNodes = [node('load', 'page-load'), { ...node('ignore', 'get-property', { path: '' }), disabled: true }, node('text', 'set-text', { target: 'result' })];
const bypassWires = [wire('load', 'next', 'ignore'), wire('ignore', 'next', 'text')];
assert.match(compile(bypassNodes, bypassWires), /Get property \(bypassed\)/);
const invalidBypass = compileGraph({ nodes: bypassNodes, edges: [...bypassWires, wire('ignore', 'result', 'text', 'value')] }, project);
assert.ok(invalidBypass.diagnostics.some(({ message }) => /bypassed node does not provide data/.test(message)));

const helpers = createCatalogHelpers();
const run = (name, values) => catalogNodes[name].run(values, helpers);
assert.equal(run('text-from-base64', { input: run('text-to-base64', { input: 'Zażółć gęślą jaźń 🌳' }) }), 'Zażółć gęślą jaźń 🌳');
assert.equal(run('text-grapheme-count', { input: '👩‍🔬â', locale: 'pl-PL' }), 2);
assert.equal(run('locale-parse-decimal', { input: '1.250,50', decimal: ',', grouping: '.' }), 1250.5);
assert.deepEqual({ ...run('url-query-map', { input: 'https://example.com/?tag=one&tag=two&active=true' }) }, { tag:['one','two'], active:'true' });
assert.equal(run('url-path-append-segment', { input: 'https://example.com/photos', segment: 'Pink tree' }), 'https://example.com/photos/Pink%20tree');
assert.equal(run('date-add', { input:'2024-01-31', amount:1, unit:'month' }), '2024-02-29T00:00:00.000Z');
assert.deepEqual(run('date-iso-week', { input:'2021-01-01' }), { year:2020, week:53 });
assert.throws(() => run('date-from-parts', { year:2025, month:2, day:29, hour:0, minute:0, second:0 }), /does not exist/);
assert.deepEqual(run('object-assign-path', { input:{ user:{ name:'Ada' } }, key:'user.role', value:'owner' }), { user:{ name:'Ada', role:'owner' } });
assert.equal(run('list-sum-field', { input:[{ quantity:3 }, { quantity:5 }], key:'quantity' }), 8);
assert.deepEqual(run('csv-to-list', { input:'Name,Note\r\nAda,"Hello, world!"', separator:',' }), [['Name','Note'],['Ada','Hello, world!']]);
assert.equal(run('list-to-csv', { input:[['=1+1','hello']], separator:',', safe:true }), "'=1+1,hello");
assert.equal(run('stats-percentile', { input:[5,15,25], percent:50 }), 15);
assert.equal(run('color-contrast', { input:'#000', other:'#fff' }), 21);
assert.equal(run('color-from-hsl', { hue:120, saturation:1, lightness:0.5, alpha:1 }), '#00ff00');
const fake = createServer((request,response) => {
  const url = new URL(request.url,'http://localhost');
  response.setHeader('content-type','application/json');
  if (url.pathname !== '/api/items') { response.statusCode=404; response.end('{"error":"unknown route"}'); return; }
  response.end(JSON.stringify({tags:url.searchParams.getAll('tag')}));
});
await new Promise((resolve) => fake.listen(0,'127.0.0.1',resolve));
try {
  globalThis.location = new URL(`http://127.0.0.1:${fake.address().port}/`);
  const response = await run('call-backend', {path:'/api/items',method:'GET',query:{tag:['featured','new']}});
  assert.equal(response.status,200);
  assert.deepEqual(response.body,{tags:['featured','new']});
  await assert.rejects(run('call-backend', {path:'/api/missing',method:'GET',query:{}}), (error) => error.code==='BACKEND_HTTP' && error.status===404 && error.data.error==='unknown route');
  await assert.rejects(run('call-backend', {path:'/api/../studio',method:'GET',query:{}}), /local API path/);
} finally { delete globalThis.location; fake.close(); }

const fixture = [
  node('submit', 'submit', { target: 'form' }),
  node('map', 'map-object-fields', { mapping: '{"customer":"name","address":"email"}' }),
  node('email', 'require-email', { message: 'Invalid email.' }),
  node('get-email', 'get-property', { path: 'address' }),
  node('record', 'db-create', { table: 'inbox' }),
  node('success', 'set-text', { target: 'output', value: 'Saved.' }),
  node('failure', 'set-text', { target: 'output', value: 'Fix the address.' }),
  node('button', 'double-click', { target: 'action' }),
  node('add', 'add-numbers', { input: '2', other: '3' }),
  node('number', 'set-text', { target: 'result', valueMode: 'result' }),
  node('timer', 'timer-after', { delay: 50 }),
  node('image-update', 'set-image-url', { target: 'image', input: 'https://example.com/new.jpg' }),
  node('signal', 'custom-event', { eventName: 'site:check' }),
  node('fetch', 'http-request', { url: 'https://example.com/large', timeout: 1500 }),
  node('fetch-fault', 'get-property', { path: 'code' }),
  node('size', 'set-text', { target: 'result', valueMode: 'result' }),
  node('backend-event', 'custom-event', { eventName: 'site:backend' }),
  node('backend', 'call-backend', { path: '/api/contact', method:'POST', body:'{"contact":"Ada"}', query:'{"tag":["a","b"]}' }),
  node('backend-response', 'set-text', { target: 'result' }),
  node('backend-code', 'set-text', { target: 'output' }),
  node('styled', 'set-inline-style', { target: 'output', property:'color', value:'#224455' }),
];
const links = [
  wire('submit', 'next', 'map'), wire('submit', 'fields', 'map', 'input'), wire('map', 'next', 'get-email'),
  wire('get-email', 'next', 'email'), wire('email', 'next', 'record'), wire('email', 'fault', 'failure'),
  wire('map', 'result', 'record', 'data'), wire('record', 'next', 'success'),
  wire('button', 'next', 'add'), wire('add', 'next', 'number'),
  wire('timer', 'next', 'image-update'), wire('signal', 'next', 'fetch'), wire('fetch', 'fault', 'fetch-fault'),
  wire('fetch', 'error', 'fetch-fault', 'input'), wire('fetch-fault', 'next', 'size'),
  wire('backend-event','next','backend'), wire('backend','next','backend-response'), wire('backend','body','backend-response','value'),
  wire('backend','fault','backend-code'), wire('backend','status','backend-code','value'), wire('backend-code','next','styled'),
];

const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.LOCALAPPDATA, 'npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.route('https://example.com/new.jpg', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]) }));
  await page.setContent(`<!doctype html><body data-page-id="home" data-preview>
    <form data-block-id="form"><input name="name" value="Ada"><input name="email" value="invalid"><button>Send</button></form>
    <button data-block-id="action">Calculate</button><p data-block-id="output" data-logic-text></p><p data-block-id="result" data-logic-text></p>
    <figure data-block-id="image" data-block-type="image"><div class="ps-image-placeholder">Image</div></figure><input data-block-id="field">
  </body>`);
  await page.evaluate(() => {
    globalThis.__plotStudioTraceEnabled = true;
    window.records = [];
    window.backendStatus = 200;
    window.backendRequests = [];
    window.traces = [];
    window.addEventListener('plot:trace', ({ detail }) => window.traces.push(detail));
    window.plotData = { query: async ({ data }) => { window.records.push(data); return data; } };
    window.plotBackend = { request: async (path,options) => {
      window.backendRequests.push({path, options}); return {status: window.backendStatus, body:'Route complete', headers:{'content-type':'text/plain'}};
    } };
    window.fetch = async () => new Response(new Uint8Array(2_000_001), { headers: { 'content-type': 'application/json' } });
  });
  await page.addScriptTag({ content: compile(fixture, links) });
  await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src') === 'https://example.com/new.jpg');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => document.querySelector('[data-block-id="output"]').textContent === 'Fix the address.');
  await page.locator('[name="email"]').fill('ada@example.com');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => document.querySelector('[data-block-id="output"]').textContent === 'Saved.');
  assert.deepEqual(await page.evaluate(() => window.records), [{ customer: 'Ada', address: 'ada@example.com' }]);
  await page.getByRole('button', { name: 'Calculate' }).dblclick();
  await page.waitForFunction(() => document.querySelector('[data-block-id="result"]').textContent === '5');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('site:check')));
  await page.waitForFunction(() => document.querySelector('[data-block-id="result"]').textContent === 'HTTP_SIZE_LIMIT');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('site:backend')));
  await page.waitForFunction(() => document.querySelector('[data-block-id="result"]').textContent === 'Route complete');
  assert.deepEqual(await page.evaluate(() => window.backendRequests), [{path:'/api/contact',options:{method:'POST',body:{contact:'Ada'},query:{tag:['a','b']}}}]);
  await page.evaluate(() => { window.backendStatus=422; window.dispatchEvent(new CustomEvent('site:backend')); });
  await page.waitForFunction(() => document.querySelector('[data-block-id="output"]').textContent === '422');
  await page.waitForFunction(() => document.querySelector('[data-block-id="output"]').style.color === 'rgb(34, 68, 85)');
  assert.ok(await page.evaluate(() => window.traces.some((entry) => entry.phase === 'step' && entry.nodeId === 'map')));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log(`All ${describeNodeCatalog().length} catalog entries verified. Browser form mapping, DB write, timers, images, typed backend success/error projection, animation-ready styles, and data conversion tests passed.`);
