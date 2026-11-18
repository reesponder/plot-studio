import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileGraph, createStarterGraph } from '../outputs/plot-studio/logic.mjs';
import { createStarterProject, renderPage, renderDocument } from '../outputs/plot-studio/project.mjs';

const project = createStarterProject();
project.graph = createStarterGraph(project);
const initial = compileGraph(project.graph, project);
assert.deepEqual(initial.diagnostics, []);
assert.match(initial.code, /block-demo-caption/);
const injection = structuredClone(project.graph);
injection.nodes[1].config.value = '</script><script>alert(1)</script>';
assert.ok(!compileGraph(injection, project).code.includes('</script>'));
const branchPage = { id: 'branch-page', slug: 'branch', name: 'Branch test', blocks: [
  { id: 'input-form', type: 'form', props: { fields: 'Name | text\nEmail | email' } },
  { id: 'feedback', type: 'text', props: { text: 'Initial' } },
] };
const branchProject = { ...project, pages: [branchPage] };
const nodes = [
  { id: 'start', type: 'page-load', config: { page: 'branch-page' } },
  { id: 'fill', type: 'set-value', config: { target: 'input-form', field: '1', value: 'test@example.com' } },
  { id: 'submit', type: 'submit', config: { target: 'input-form', field: '1' } },
  { id: 'check', type: 'if', config: { operator: 'includes', value: '@example.com' } },
  { id: 'yes', type: 'set-text', config: { target: 'feedback', value: 'Matched' } },
  { id: 'no', type: 'set-text', config: { target: 'feedback', value: 'Other email' } },
];
const edge = (from, to, port = 'next') => ({ id: `${from}-${port}`, from: { nodeId: from, port }, to: { nodeId: to, port: 'in' } });
const branchGraph = { nodes, edges: [edge('start', 'fill'), edge('submit', 'check'), edge('check', 'yes', 'yes'), edge('check', 'no', 'no')] };
const branch = compileGraph(branchGraph, branchProject);
assert.deepEqual(branch.diagnostics, []);
const cycle = compileGraph({ nodes, edges: [...branchGraph.edges, edge('yes', 'check')] }, branchProject);
assert.equal(cycle.code, '');
assert.ok(cycle.diagnostics.some(({ message }) => message.includes('cycle')));
const dataPort = (from, port, to, input) => ({ id: `${from}:${port}:${to}:${input}`, from: { nodeId: from, port }, to: { nodeId: to, port: input } });
const pipelineProject = { ...branchProject, data: { tables: [{ id: 'customers', name: 'Customers', fields: [{ id: 'name', type: 'text' }] }] } };
const pipelineNodes = [
  { id: 'load', type: 'page-load' },
  { id: 'prepare', type: 'run-js', config: { code: 'const label = `a</script>\nb`;\nif (label.length !== 12) throw new Error(`Unexpected template size: ${label.length}`);\nctx.vars.seen = true;\nreturn { name: "Ada" };' } },
  { id: 'http', type: 'http-request', config: { url: '/api', method: 'POST' } },
  { id: 'create', type: 'db-create', config: { table: 'customers' } },
  { id: 'id', type: 'get-property', config: { path: 'id' } },
  { id: 'read', type: 'db-read', config: { table: 'customers' } },
  { id: 'call', type: 'call-flow', config: { flow: 'entry' } },
  { id: 'update', type: 'db-update', config: { table: 'customers' } },
  { id: 'list', type: 'db-list', config: { table: 'customers', filter: '{"field":"name","operator":"eq","value":"ADA"}', limit: '5' } },
  { id: 'each', type: 'for-each', config: { flow: 'entry' } },
  { id: 'name', type: 'get-property', config: { path: '[0].name' } },
  { id: 'text', type: 'set-text', config: { target: 'feedback', valueMode: 'result' } },
  { id: 'drop', type: 'db-delete', config: { table: 'customers' } },
  { id: 'debug', type: 'log', config: { label: 'Pipeline complete' } },
  { id: 'entry', type: 'flow-entry', config: { name: 'Format row' } },
  { id: 'format', type: 'run-js', config: { code: 'if (!ctx.vars.seen) throw Error("Run variables missing");\nconst prefix = Number.isInteger(ctx.index) ? `${ctx.index+1}. ` : "";\nreturn { name: prefix + input.name.toUpperCase() };' } },
  { id: 'return', type: 'return-value' },
  { id: 'error-click', type: 'click', config: { target: 'feedback' } },
  { id: 'bad-http', type: 'http-request', config: { url: '/bad' } },
  { id: 'error-code', type: 'get-property', config: { path: 'status' } },
  { id: 'display-error', type: 'set-text', config: { target: 'feedback', valueMode: 'result' } },
  { id: 'keyboard', type: 'keyboard', config: { key: 'Space', preventDefault: true } },
  { id: 'keyboard-result', type: 'set-text', config: { target: 'feedback', value: 'Space key pressed' } },
  { id: 'custom-event', type: 'custom-event', config: { eventName: 'test:status' } },
  { id: 'event-result', type: 'set-text', config: { target: 'feedback' } },
];
const mainFlow = ['load', 'prepare', 'http', 'create', 'id', 'read', 'call', 'update', 'list', 'each', 'name', 'text', 'drop', 'debug'];
const mainEdges = mainFlow.slice(0, -1).map((id, index) => edge(id, mainFlow[index + 1]));
const pipelineEdges = mainEdges.concat([
  edge('entry', 'format'), edge('format', 'return'), edge('error-click', 'bad-http'), edge('bad-http', 'error-code', 'fault'), edge('error-code', 'display-error'),
  dataPort('prepare', 'result', 'http', 'body'), dataPort('http', 'result', 'create', 'data'), dataPort('id', 'result', 'read', 'recordId'),
  dataPort('read', 'result', 'call', 'input'), dataPort('entry', 'input', 'format', 'input'), dataPort('id', 'result', 'update', 'recordId'),
  dataPort('call', 'result', 'update', 'data'), dataPort('list', 'result', 'each', 'items'), dataPort('each', 'result', 'name', 'input'), dataPort('id', 'result', 'drop', 'recordId'),
  dataPort('bad-http', 'error', 'error-code', 'input'),
  edge('keyboard', 'keyboard-result'), edge('custom-event', 'event-result'), dataPort('custom-event', 'detail', 'event-result', 'value'),
]);
const pipelineGraph = { nodes: pipelineNodes, edges: pipelineEdges };
const pipeline = compileGraph(pipelineGraph, pipelineProject);
assert.deepEqual(pipeline.diagnostics, []);
const syntaxErrorGraph = structuredClone(pipelineGraph);
syntaxErrorGraph.nodes.find((node) => node.id === 'prepare').config.code = 'return {';
assert.match(compileGraph(syntaxErrorGraph, pipelineProject).diagnostics.find(({ nodeId }) => nodeId === 'prepare').message, /Invalid JavaScript/);
const recursiveNodes = [...pipelineNodes, { id: 'reenter', type: 'call-flow', config: { flow: 'entry' } }];
const recursiveEdges = pipelineEdges.filter(({ from }) => from.nodeId !== 'format').concat(edge('format', 'reenter'));
assert.ok(compileGraph({ nodes: recursiveNodes, edges: recursiveEdges }, pipelineProject).diagnostics.some(({ message }) => message.includes('cycle')));
const badTypeNodes = [...pipelineNodes, { id: 'number', type: 'constant', config: { valueType: 'number', value: '12' } }];
const badTypeEdges = pipelineEdges.concat(dataPort('number', 'value', 'drop', 'recordId'));
assert.ok(compileGraph({ nodes: badTypeNodes, edges: badTypeEdges }, pipelineProject).diagnostics.some(({ message }) => message.includes('compatible types')));
const mockData = `<script>
window.dataRequests=[];
window.graphEvents=[];
window.addEventListener('plot:trace',event=>graphEvents.push(event.detail));
let row;
window.plotData={async query(request){
  await new Promise(resolve=>setTimeout(resolve,8));
  dataRequests.push(request);
  if(request.operation==='create') {row={id:'customer-1',...request.data};return row;}
  if(request.operation==='read') return row;
  if(request.operation==='update') {row={...row,...request.data};return row;}
  if(request.operation==='list') return [row];
  if(request.operation==='delete') {const deleted=row;row=undefined;return deleted;}
}};
</script>`;

const demo = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/logic.css"><style>body{background:#f5f3e9;font:15px system-ui;margin:24px}#graph{width:min(850px,100%)}#live{display:none}</style><div id="graph"></div><div id="live">${renderPage(project.pages[0], project)}</div><script>${initial.code}</script><script type="module">import {mountLogic} from '/logic.mjs'; window.project = ${JSON.stringify(project).replace(/</g, '\\u003c')}; window.api = mountLogic(document.getElementById('graph'), {getProject:()=>project, onChange:graph=>{project.graph=graph}});</script>`;
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(demo); return; }
  if (req.url === '/branch') { res.setHeader('content-type', 'text/html'); res.end(renderDocument(branchPage, branchProject, branch.code)); return; }
  if (req.url === '/pipeline') { res.setHeader('content-type', 'text/html'); res.end(renderDocument(branchPage, pipelineProject, pipeline.code, { bodyHtml: mockData })); return; }
  if (req.url === '/api') {
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    let contents = '';
    for await (const chunk of req) contents += chunk;
    assert.deepEqual(JSON.parse(contents), { name: 'Ada' });
    res.setHeader('content-type', 'application/json');
    res.end(contents);
    return;
  }
  if (req.url === '/bad') { res.setHeader('content-type', 'application/json'); res.writeHead(422); res.end('{"detail":"rejected"}'); return; }
  if (!['/logic.mjs', '/logic.css'].includes(req.url)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', req.url.endsWith('css') ? 'text/css' : 'text/javascript');
  res.end(await readFile(new URL(`../outputs/plot-studio${req.url}`, import.meta.url)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'plot-logic-qa-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); break; } catch { await wait(100); }
  }
  assert.ok(port);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let messageId = 0;
  const calls = new Map();
  const errors = [];
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (calls.has(message.id)) { calls.get(message.id)(message.result || message.error); calls.delete(message.id); }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++messageId;
    calls.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  }
  async function center(selector) {
    const result = await evaluate(`(() => {const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; node.scrollIntoView({block:'nearest',inline:'nearest'}); const b = node.getBoundingClientRect(); return {x:b.x + b.width / 2, y:b.y + b.height / 2};})()`);
    assert.ok(result, selector);
    return result;
  }
  async function mouse(type, point, buttons, button = 'none') {
    await send('Input.dispatchMouseEvent', { type, ...point, button, buttons, clickCount: button === 'none' ? 0 : 1 });
  }
  async function drag(from, to) {
    await mouse('mouseMoved', from, 0);
    await mouse('mousePressed', from, 1, 'left');
    await mouse('mouseMoved', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 1);
    await mouse('mouseMoved', to, 1);
    await mouse('mouseReleased', to, 0, 'left');
    await wait(80);
  }
  async function addNode(type, search) {
    await evaluate("document.querySelector('.bp-button-main').click()");
    await evaluate(`(() => {const field=document.querySelector('.bp-picker-search');field.value=${JSON.stringify(search)};field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await evaluate(`document.querySelector('[data-node-type=${type}]').click()`);
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let attempt = 0; attempt < 30; attempt++) { if (await evaluate('Boolean(window.api)')) break; await wait(100); }

  assert.equal(await evaluate("document.querySelectorAll('.bp-node').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.bp-wire').length"), 1);
  await evaluate("document.querySelector('[data-block-id=block-demo-action]').click()");
  assert.equal(await evaluate("document.querySelector('[data-block-id=block-demo-caption]').textContent"), 'The connection works. Blueprint set this text.');
  const nodeFrom = await center('.bp-node-event .bp-node-head');
  await drag(nodeFrom, { x: nodeFrom.x + 22, y: nodeFrom.y + 39 });
  assert.equal(await evaluate('project.graph.nodes[0].x'), 86);
  assert.equal(await evaluate('project.graph.nodes[0].y'), 143);

  await addNode('notify', 'toast');
  assert.equal(await evaluate('project.graph.nodes.length'), 3);
  await evaluate("document.querySelector('.bp-config textarea').value='Gotowe'; document.querySelector('.bp-config textarea').dispatchEvent(new Event('input',{bubbles:true}));");
  assert.equal(await evaluate('project.graph.nodes.at(-1).config.value'), 'Gotowe');
  await evaluate("document.querySelector('[data-node-id=logic-demo-result][data-port=next]').click(); document.querySelectorAll('.bp-port-in')[1].click();");
  assert.equal(await evaluate('project.graph.edges.length'), 2);
  await evaluate("document.querySelector('.bp-wire-hit').dispatchEvent(new MouseEvent('click',{bubbles:true})); document.querySelector('.bp-remove').click();");
  assert.equal(await evaluate('project.graph.edges.length'), 1);

  const eventOutput = await center('[data-node-id=logic-demo-click][data-port=next]');
  const actionInput = await center('[data-node-id=logic-demo-result][data-port=in]');
  console.log('drag points', eventOutput, actionInput, await evaluate(`document.elementFromPoint(${actionInput.x},${actionInput.y})?.outerHTML.slice(0,250)`));
  await drag(eventOutput, actionInput);
  console.log('drag result', await evaluate("document.querySelector('.bp-hint').textContent"), await evaluate('project.graph.edges'));
  assert.equal(await evaluate('project.graph.edges.length'), 2);
  assert.equal(await evaluate('project.graph.edges.at(-1).to.nodeId'), 'logic-demo-result');
  assert.equal(await evaluate("document.querySelector('.bp-hint').textContent"), 'Nodes connected.');
  const desktop = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('blueprint-desktop.png', import.meta.url), Buffer.from(desktop.data, 'base64'));

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
  await wait(80);
  assert.equal(await evaluate('document.documentElement.scrollWidth'), 390);
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL('blueprint-mobile.png', import.meta.url), Buffer.from(mobile.data, 'base64'));
  await evaluate("document.querySelector('.bp-button-main').click()");
  const mobilePicker = await send('Page.captureScreenshot', {format:'png'});
  await writeFile(new URL('blueprint-mobile-picker.png', import.meta.url), Buffer.from(mobilePicker.data, 'base64'));
  assert.equal(await evaluate("document.querySelector('.bp-picker[open]') !== null"), true);
  await evaluate("document.querySelector('.bp-picker-close').click()");
  await addNode('constant', 'fixed value');
  await evaluate("document.querySelector('.bp-duplicate').click()");
  assert.equal(await evaluate('project.graph.nodes.filter((node)=>node.type==="constant").length'), 2);
  await evaluate("document.querySelector('.bp-zoom-level').click();document.querySelector('[aria-label=\"Zoom in\"]').click();document.querySelector('[aria-label=\"Zoom in\"]').click();");
  assert.equal(await evaluate("document.querySelector('.bp-zoom-level').textContent"), '120%');
  assert.equal(await evaluate("document.querySelector('.bp-world').style.transform"), 'scale(1.2)');
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/branch` });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate('Boolean(document.querySelector("[data-block-id=input-form]")) && document.readyState !== "loading"')) break;
    await wait(100);
  }
  console.log('branch document', await evaluate('document.readyState'), errors);
  assert.equal(await evaluate("document.querySelector('input[type=email]').value"), 'test@example.com');
  assert.equal(await evaluate("document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))"), false);
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), 'Matched');
  await evaluate("document.querySelector('input[type=email]').value='someone@other.com';document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));");
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), 'Other email');
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/pipeline` });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate("window.dataRequests?.length === 5")) break;
    await wait(100);
  }
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), '1. ADA');
  assert.deepEqual(await evaluate('dataRequests.map(({operation})=>operation)'), ['create', 'read', 'update', 'list', 'delete']);
  assert.deepEqual(await evaluate('dataRequests[3].filter'), { field: 'name', operator: 'eq', value: 'ADA' });
  assert.equal(await evaluate('dataRequests[3].limit'), 5);
  assert.ok(await evaluate("graphEvents.some(({level,message})=>level==='info' && message.startsWith('Pipeline complete'))"));
  await evaluate("document.querySelector('[data-block-id=feedback]').click()");
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate("document.querySelector('[data-block-id=feedback]').textContent==='422'")) break;
    await wait(100);
  }
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), '422');
  assert.ok(await evaluate("graphEvents.some(({level,message})=>level==='error' && message.includes('HTTP 422'))"));
  assert.equal(await evaluate("document.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}))"), true);
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), '422');
  assert.equal(await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',cancelable:true}))"), false);
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), 'Space key pressed');
  await evaluate("window.dispatchEvent(new CustomEvent('test:status',{detail:'Event received'}))");
  assert.equal(await evaluate("document.querySelector('[data-block-id=feedback]').textContent"), 'Event received');
  assert.deepEqual(errors, []);
  console.log('Passed: Chrome graph UX, custom JS, HTTP POST/422, all five DB operations, reusable flows and For each, key and custom browser events, trace bridge.');
  ws.close();
} finally {
  chrome.kill();
  server.close();
}
