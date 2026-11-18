import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createBlock, createEmptyProject, renderDocument, buildSitePackage, BLOCK_TYPES } from '../outputs/plot-studio/project.mjs';

const page = createEmptyProject('New native elements');
const additional = ['link','input','select','toggle','video','audio','table','progress','callout'];
assert.ok(additional.every(type => Object.hasOwn(BLOCK_TYPES,type)));
assert.equal(BLOCK_TYPES.form.container,true);
page.pages[0].blocks = [
  createBlock('link',{id:'link',props:{text:'<details>',href:'javascript:alert(1)',newTab:true}}),
  createBlock('form',{id:'form',props:{title:'Register',usePreset:false},children:[
    createBlock('input',{id:'name',props:{label:'Name',defaultValue:'Sandra & Li',required:true}}),
    createBlock('select',{id:'topic',props:{defaultValue:'support'}}),
    createBlock('toggle',{id:'switch',props:{checked:true}}),
  ]}),
  createBlock('video',{id:'video',props:{src:'./assets/intro.mp4',poster:'./assets/poster.png',captions:'./assets/intro.vtt',loop:true}}),
  createBlock('audio',{id:'audio',props:{src:'./assets/sample.mp3'}}),
  createBlock('table',{id:'comparison',props:{rows:'Basic | 1 | 2\nStandard | 2'}}),
  createBlock('progress',{id:'progress',props:{value:150,max:100}}),
  createBlock('callout',{id:'notice',props:{variant:'warning'}}),
];
const script = [
  'const form = document.querySelector("form");',
  'const data = Object.fromEntries(new FormData(form));',
  'const keys = Object.keys(data).length === 3 && data.name === "Sandra & Li" && data.topic === "support" && data.updates === "yes";',
  'const checked = form.querySelector("[role=switch]").checked && form.checkValidity();',
  'const content = !!document.querySelector("table th[scope=col]") && document.querySelector("progress").value === 100;',
  'const media = document.querySelector("video").controls && document.querySelector("audio").controls && !!document.querySelector("track[kind=captions]");',
  'document.documentElement.dataset.probe = keys && checked && content && media ? "ok" : "failed";',
].join('\n');
const html = renderDocument(page.pages[0],page,script);
assert.doesNotMatch(html,/javascript:alert/);
assert.match(html,/&lt;details&gt;/);
assert.match(html,/name="name" required value="Sandra &amp; Li"/);
assert.match(html,/value="support" selected/);
assert.match(html,/<aside[^>]+ps-callout-warning/);
const packaged = await buildSitePackage(page,script,{
  baseUrl:'https://example.invalid/studio/project.mjs',
  fetcher:async url => new Response(url.pathname),
});
assert.deepEqual(Object.keys(packaged).filter(name=>name.startsWith('assets/')).sort(),[
  'assets/intro.mp4','assets/intro.vtt','assets/poster.png','assets/sample.mp3',
]);
const server = createServer((req,res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile = await mkdtemp(path.resolve('work/chrome-blocks-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless','--disable-gpu','--disable-background-networking','--dump-dom','--user-data-dir='+profile,
  'http://127.0.0.1:'+server.address().port,
],{windowsHide:true});
let rendered = '';
browser.stdout.on('data',part=>rendered+=part);
let codeResult;
try { codeResult = await new Promise(resolve=>browser.on('exit',resolve)); }
finally { server.close(); }
assert.equal(codeResult,0);
assert.match(rendered,/data-probe="ok"/);
console.log('Nine block SDL, Chromium semantics, nested FormData, sanitized links and packaged media verified.');
