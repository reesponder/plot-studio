import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStarterProject, buildSitePackage, createZip } from '../outputs/plot-studio/project.mjs';
import { compileGraph, createStarterGraph } from '../outputs/plot-studio/logic.mjs';

const project = createStarterProject();
project.graph = createStarterGraph(project);
const result = compileGraph(project.graph, project);
assert.equal(result.diagnostics.length, 0);
const files = await buildSitePackage(project, result.code, {
  fetcher: async url => new Response(await readFile(url)),
});
await writeFile('work/project-check/starter.zip', createZip(files));

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.webp':'image/webp', '.css':'text/css' };
const server = createServer((req,res) => {
  const filename = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!Object.hasOwn(files, filename)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type':types[path.extname(filename)]});
  res.end(files[filename]);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const profile = await mkdtemp(path.resolve('work/chrome-project-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless', '--disable-gpu','--disable-background-networking','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile, 'about:blank',
], {stdio:'ignore',windowsHide:true});

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
async function eventually(fn) {
  for (let count=0; count<100; count++) {
    try { const value = await fn(); if (value) return value; } catch {}
    await wait(50);
  }
  throw new Error('Browser did not reach the requested state');
}

try {
  const debugPort = await eventually(async () => Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]));
  const tabs = await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
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
    const id = ++counter;
    pending.set(id,resolve);
    ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => (await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
  const capture = async file => {
    const {data} = await send('Page.captureScreenshot',{format:'png'});
    await writeFile('work/project-check/'+file,Buffer.from(data,'base64'));
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  await eventually(() => evaluate('document.querySelector(".ps-hero img")?.naturalWidth > 0'));
  await wait(350);
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Room for\neveryday life.');
  assert.equal(await evaluate('document.body.dataset.pageId'), 'page-home');
  assert.equal(await evaluate('scrollX === 0 && document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ps-nav-desktop")).display'), 'flex');
  await capture('export-desktop.png');
  const before = await evaluate('document.querySelector("[data-block-id=block-demo-caption]").textContent');
  await evaluate('document.querySelector("[data-block-id=block-demo-action]").click()');
  assert.notEqual(await evaluate('document.querySelector("[data-block-id=block-demo-caption]").textContent'),before);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ps-nav-desktop")).display'), 'none');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ps-nav-mobile")).display'), 'block');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('document.querySelector(".ps-hero-copy").getBoundingClientRect().bottom < document.querySelector(".ps-hero figure").getBoundingClientRect().top'), true);
  await capture('export-mobile.png');
  await evaluate('document.querySelector(".ps-nav-mobile summary").click();document.querySelector(".ps-nav-mobile [data-page-link=page-projects]").click()');
  await eventually(() => evaluate('document.body?.dataset.pageId === "page-projects"'));
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Projects');
  ws.close();
  console.log('Desktop, phone, navigation, source asset, and graph interaction verified in Chromium.');
} finally { chrome.kill(); server.close(); }
