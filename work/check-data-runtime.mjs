import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createEmptyProject, buildSite, buildSitePackage, renderDocument, createPageFromTemplate, PAGE_TEMPLATES } from '../outputs/plot-studio/project.mjs';
import { createDataTable, createDataField, executeDataQuery, validateData, parseDataValue } from '../outputs/plot-studio/data.mjs';

const project = createEmptyProject('Data runtime integration');
project.pages[0] = createPageFromTemplate('product','Home','index');
assert.equal(Object.keys(PAGE_TEMPLATES).length,5);
const table = createDataTable('Customers');
const fields = [
  {...createDataField('Name','text',true),id:'Name'},
  {...createDataField('Score','number'),id:'score'},
  {...createDataField('Purchases','integer'),id:'purchases'},
  {...createDataField('Subscribed','boolean'),id:'subscribed'},
  {...createDataField('Birthday','date'),id:'birthday'},
  {...createDataField('Last visit','datetime'),id:'last-visit'},
  {...createDataField('Email','email'),id:'email'},
  {...createDataField('Website','url'),id:'website'},
  {...createDataField('Notes','longText'),id:'notes'},
  {...createDataField('Tags','json'),id:'tags'},
];
table.fields = fields;
project.data.tables.push(table);
const tableId = table.id;
const values = {
  Name:'Ana O’Neil',score:9.5,purchases:3,subscribed:false,birthday:'1990-06-23',
  'last-visit':'2026-11-15T22:30:45.1+01:00',email:'ana@example.com',website:'https://example.com/',
  notes:'A note in two lines.\nThe second line.',tags:{levels:[1,true,"new"],area:"north"},
};
assert.throws(() => executeDataQuery(project.data,{operation:'list',table:tableId}),{code:'FORBIDDEN'});
const seed = executeDataQuery(project.data,{operation:'create',table:tableId,data:values},{enforcePermissions:false});
assert.equal(seed['last-visit'],'2026-11-15T21:30:45.100Z');
assert.equal(seed.subscribed,false);
assert.equal(parseDataValue(fields[3],'no'),false);
assert.throws(() => parseDataValue(fields[4],'2025-02-29'),{code:'INVALID_VALUE'});
assert.deepEqual(validateData(project.data),[]);
table.permissions = {list:true,read:true,create:true,update:true,delete:true};
const privateTable = createDataTable('Private updates');
privateTable.fields = [{...createDataField('City','text'),id:'city'}, {...createDataField('Memo','text'),id:'memo'}];
project.data.tables.push(privateTable);
const privateSeed = executeDataQuery(project.data,{operation:'create',table:privateTable.id,data:{city:'Warsaw',memo:'private note'}},{enforcePermissions:false});
privateTable.permissions.update = true;
privateTable.permissions.delete = true;
const noRead = executeDataQuery(project.data,{operation:'update',table:privateTable.id,id:privateSeed.id,data:{city:'Poznan'}});
assert.deepEqual(noRead,{id:privateSeed.id,city:'Poznan'});

project.settings.customCss = 'body::before{content:"Example </style>"}';
project.settings.customJs = [
  'document.documentElement.dataset.testScript = "</script>";',
  'void plotData.query({operation:"list",table:"'+tableId+'"}).then(rows => { document.documentElement.dataset.seedCount = rows.length; });',
].join('\n');
const output = buildSite(project,'globalThis.logicReady = true;');
assert.match(output['script.js'], /logicReady = true;[\s\S]+dataset\.seedCount/);
assert.match(output['styles.css'], /Example <\/style>/);
assert.match(output['index.html'], /<script src="plot-data\.js" defer><\/script><script src="script\.js" defer>/);
const standalone = renderDocument(project.pages[0],project);
assert.doesNotMatch(standalone,/content:"Example <\/style>/);
const args = {fetcher:async url => new Response(await readFile(url))};
const seedFree = await buildSitePackage(project,'',args);
assert.equal(JSON.parse(seedFree['database/schema.json']).tables[0].rows,undefined);
const seeded = await buildSitePackage(project,'globalThis.logicReady = true;', {...args,includeRows:true});
assert.equal(JSON.parse(seeded['database/schema.json']).tables[0].rows.length,1);
const fixture = await mkdtemp(path.resolve('work/data-export-'));
for (const [file,bytes] of Object.entries(seeded)) {
  const target = path.join(fixture,file);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,bytes);
}

async function start(shouldFail = false) {
  const proc = spawn('python',['runtime.py','--port','0'],{cwd:fixture,windowsHide:true});
  let logs = '', port = null;
  const done = new Promise(resolve => proc.on('exit',(code,signal) => {
    if (code && !shouldFail) console.error('Runtime exit:',code,signal,logs);
    resolve(code);
  }));
  proc.stdout.on('data', chunk => {
    logs += chunk;
    const match = /127\.0\.0\.1:(\d+)/.exec(logs);
    if (match) port = Number(match[1]);
  });
  proc.stderr.on('data',chunk => logs += chunk);
  for (let index=0; !port && proc.exitCode === null && index<100; index++) await new Promise(resolve=>setTimeout(resolve,30));
  if (shouldFail) {
    const failCode = await done;
    assert.equal(failCode,1,logs);
    assert.match(logs,/new required field/);
    return null;
  }
  assert.ok(port,logs);
  const origin = 'http://127.0.0.1:'+port;
  console.log('Started',origin,proc.pid);
  for (let attempt=0;attempt<25;attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch { await new Promise(resolve=>setTimeout(resolve,40)); }
  }
  return {origin,async stop(){proc.kill(); await done;}};
}

let running;
try {
  running = await start();
  const api = async (request,status=200) => {
    const response = await fetch(running.origin+'/api/data/query',{
      method:'POST',headers:{'Content-Type':'application/json','Origin':running.origin},body:JSON.stringify(request),
    }).catch(cause => { throw new Error('Failed ' + request.operation + ' on ' + running.origin, {cause}); });
    const json = await response.json();
    assert.equal(response.status,status, JSON.stringify(json));
    return response.ok ? json.result : json.error;
  };
  const ask = (operation,extra={},status=200) => api({operation,table:tableId,...extra},status);
  assert.equal((await fetch(running.origin)).status,200);
  assert.equal((await fetch(running.origin+'/database/schema.json')).status,404);
  assert.equal((await fetch(running.origin+'/runtime.py')).status,404);
  assert.deepEqual(await ask('read',{id:seed.id}),seed);
  assert.deepEqual(await ask('list',{filter:[
    {field:'Name',operator:'contains',value:'O’Neil'},
    {field:'birthday',operator:'gt',value:'1985-01-01'},
    {field:'tags',operator:'eq',value:{area:'north',levels:[1,true,'new']}},
    {field:'last-visit',operator:'eq',value:'2026-11-15T22:30:45.1+01:00'},
  ]}),[seed]);
  assert.equal((await ask('create',{data:{Name:'Bad',purchases:1.2}},400)).code,'INVALID_VALUE');
  assert.equal((await ask('create',{data:{Name:'Bad',score:'9.5'}},400)).code,'INVALID_VALUE');
  assert.equal((await ask('list',{filter:{field:'unknown',operator:'eq',value:'a'}},400)).code,'UNKNOWN_FIELD');
  const writes = await Promise.all(Array.from({length:10},(_,i) => ask('create',{data:{Name:'Member '+i,score:i}})));
  assert.equal(new Set(writes.map(row => row.id)).size,10);
  assert.equal((await ask('list',{limit:2,offset:1})).length,2);
  const first = writes[0];
  assert.equal((await ask('update',{id:first.id,data:{Name:'Updated'}})).Name,'Updated');
  assert.equal((await ask('delete',{id:first.id})).Name,'Updated');
  assert.equal((await ask('read',{id:first.id},404)).code,'NOT_FOUND');
  assert.deepEqual(await api({operation:'update',table:privateTable.id,id:privateSeed.id,data:{city:'Krakow'}}),{id:privateSeed.id,city:'Krakow'});
  assert.equal((await api({operation:'read',table:privateTable.id,id:privateSeed.id},403)).code,'FORBIDDEN');
  assert.deepEqual(await api({operation:'delete',table:privateTable.id,id:privateSeed.id}),{id:privateSeed.id});
  await running.stop();
  running = await start();
  assert.equal((await ask('list')).length,10);
  await running.stop();
  running = null;
  const schemaPath = path.join(fixture,'database/schema.json');
  const schema = JSON.parse(await readFile(schemaPath,'utf8'));
  schema.tables[0].fields.push({id:'state',name:'State',type:'text',required:false});
  await writeFile(schemaPath,JSON.stringify(schema));
  running = await start();
  assert.equal((await ask('read',{id:seed.id})).state,null);
  assert.equal((await ask('update',{id:seed.id,data:{state:'Active'}})).state,'Active');
  await running.stop();
  running = null;
  schema.tables[0].fields.push({id:'country',name:'Country',type:'text',required:true});
  await writeFile(schemaPath,JSON.stringify(schema));
  await start(true);
  schema.tables[0].fields.pop();
  await writeFile(schemaPath,JSON.stringify(schema));
  running = await start();
  assert.equal((await ask('read',{id:seed.id})).state,'Active');
  console.log('SQLite package passed type, filters, write permissions, seeds, concurrent mutations, persistence, safe migrations and private-file checks.');
} finally {
  if (running) await running.stop();
}
