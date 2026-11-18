import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createEmptyProject, createBlock, buildSitePackage, renderDocument } from '../outputs/plot-studio/project.mjs';
import { createDataTable, createDataField, executeDataQuery } from '../outputs/plot-studio/data.mjs';

const project = createEmptyProject('Browser compatibility');
const title = createBlock('heading',{ id:'title', props:{ text:'Data preview', tag:'h1' } });
project.pages[0].blocks = [title];
const table = createDataTable('Sample');
table.permissions.list = true;
table.fields = [{ ...createDataField('Title','text',true), id:'label' }];
project.data.tables.push(table);
executeDataQuery(project.data,{operation:'create',table:table.id,data:{label:'Loaded from SQLite'}},{enforcePermissions:false});
project.settings.customCss = 'body::before{content:"Example </style> text"}';
project.settings.customJs = [
  'const literal = "</script> still in JavaScript";',
  'plotData.query({operation:"list",table:"'+table.id+'"}).then(rows => {',
  '  document.querySelector("h1").textContent = rows[0].label;',
  '  document.documentElement.dataset.literal = literal;',
  '  parent.postMessage({ graph:document.body.dataset.graph, label:rows[0].label, literal, css:getComputedStyle(document.body,"::before").content },"*");',
  '});',
].join('\n');
const compiled = 'document.body.dataset.graph = "ready";';
const files = await buildSitePackage(project,compiled,{includeRows:true,fetcher:async url => new Response(await readFile(url))});
const directory = await mkdtemp(path.resolve('work/browser-data-'));
for (const [name,bytes] of Object.entries(files)) {
  const destination = path.join(directory,name);
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,bytes);
}
const runtime = spawn('python',['runtime.py','--port','0'],{cwd:directory,windowsHide:true});
let port, runtimeLog = '';
runtime.stdout.on('data',part => { runtimeLog += part; port = Number(/127\.0\.0\.1:(\d+)\s/.exec(runtimeLog)?.[1]); });
runtime.stderr.on('data',part => { runtimeLog += part; });
const parent = createServer((req,res) => {
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><iframe sandbox="allow-scripts" id="preview"></iframe><script>addEventListener("message", e => {if(e.source===document.getElementById("preview").contentWindow) window.result=e.data;});</script>');
});
await new Promise(resolve => parent.listen(0,'127.0.0.1',resolve));
const profile = await mkdtemp(path.resolve('work/chrome-db-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless','--disable-gpu','--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
], {stdio:'ignore',windowsHide:true});

async function eventually(callback, reason) {
  for (let attempt=0; attempt<120; attempt++) {
    try { const result = await callback(); if (result) return result; } catch {}
    await new Promise(resolve => setTimeout(resolve,50));
  }
  throw new Error(reason || 'Timed out waiting for browser');
}

try {
  const debug = await eventually(async () => Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]));
  await eventually(() => port,runtimeLog);
  const origin = 'http://127.0.0.1:'+port;
  const tabs = await (await fetch('http://127.0.0.1:'+debug+'/json/list')).json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open',resolve,{once:true}));
  let counter = 0;
  const pending = new Map();
  ws.addEventListener('message',({data}) => {
    const item = JSON.parse(data);
    const callback = pending.get(item.id);
    if (callback) {pending.delete(item.id); callback(item.result);}
  });
  const send = (method,params={}) => new Promise(resolve => {
    const id = ++counter; pending.set(id,resolve); ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => (await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;

  await send('Page.enable');
  await send('Page.navigate',{url:origin});
  const rendered = await eventually(() => evaluate('document.querySelector("h1")?.textContent === "Loaded from SQLite" && document.documentElement.dataset.literal'));
  assert.equal(rendered,'</script> still in JavaScript');
  assert.equal(await evaluate('document.body.dataset.graph'),'ready');
  const fakeBridge = '<script>globalThis.plotData={query: async() => [{label:"Loaded in the preview sandbox"}]};</script>';
  const doc = renderDocument(project.pages[0],project,compiled,{preview:true,bodyHtml:fakeBridge});
  await send('Page.navigate',{url:'http://127.0.0.1:'+parent.address().port});
  await eventually(() => evaluate('document.querySelector("iframe")'));
  await evaluate('document.querySelector("iframe").srcdoc = '+JSON.stringify(doc));
  const sandboxed = await eventually(() => evaluate('window.result'));
  assert.equal(sandboxed.graph,'ready');
  assert.equal(sandboxed.label,'Loaded in the preview sandbox');
  assert.equal(sandboxed.literal,'</script> still in JavaScript');
  assert.equal(sandboxed.css,'"Example </style> text"');
  ws.close();
  console.log('Browser-to-SQLite query and preview sandbox with literal script/style closing tags passed.');
} finally {
  chrome.kill();
  runtime.kill();
  parent.close();
}
