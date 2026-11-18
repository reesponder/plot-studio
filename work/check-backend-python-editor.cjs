const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const { resolve } = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { chromium } = require('playwright');

const gateway = 'outputs/plot-studio/server.mjs';
const origin = 'http://localhost:15462';
const password = randomBytes(18).toString('base64url');
const slug = 'studio-python-test';
const catalog = {
  methods:['GET','POST'],
  operations:[
    { type:'run-python',label:'Run Python script',group:'Python',description:'Run a saved Python script.',valueType:'object',fields:[
      { key:'script',label:'Python script',kind:'python-script',required:true },
      { key:'values',label:'Input values',kind:'any',default:null },
      { key:'timeout',label:'Timeout in seconds',kind:'integer',default:5 },
    ] },
    { type:'respond-json',label:'JSON response',group:'Response',terminal:true,fields:[] },
  ],
};
async function configure(page, available) {
  await page.route(origin+'/studio/api/backend/catalog', route=>route.fulfill({ json:{
    ...catalog, services:{python:{available,version:'3.13.5',packages:[{name:'Pillow',version:'12.0.0'}],timeoutMax:15,reason:'Runner is unavailable in this fixture.'}},
  } }));
  await page.goto(origin);
  await page.getByLabel('Access password').fill(password);
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.waitForURL(origin+'/studio/');
  await page.locator('[data-mode="backend"]').click();
  await page.getByRole('button',{name:'Python',exact:true}).click();
  await page.getByRole('heading',{name:'Python scripts',exact:true}).waitFor();
}
async function main() {
  const { backendModel, backendPythonScript, backendPythonSourceSize } = await import('../outputs/plot-studio/backend-model.mjs');
  const { createEmptyProject, deserializeProject, serializeProject } = await import('../outputs/plot-studio/project.mjs');
  const fixture = { id:slug, name:'  Lowercase name  ',source:'\ndef run(input):\n    return {"word":"żółć"}\n' };
  assert.equal(backendPythonScript(fixture).name,'Lowercase name');
  assert.equal(backendPythonScript(fixture).source,fixture.source);
  assert(backendPythonSourceSize(fixture.source)>fixture.source.length);
  assert.throws(()=>backendPythonScript({...fixture,source:'ć'.repeat(16385)}),/32,768 UTF-8 bytes/);
  assert.throws(()=>backendPythonScript({...fixture,id:'../script'}),/script ID/);
  assert.throws(()=>backendPythonScript({...fixture,name:'x'.repeat(81)}),/80 characters/);
  assert.equal(backendPythonScript({...fixture,name:'🪁'.repeat(80)}).name,'🪁'.repeat(80));
  assert.throws(()=>backendPythonScript({...fixture,source:'def run(input):\n    return "\uD800"' }),/valid UTF-8/);
  assert.equal(backendModel({ routes:[],pythonScripts:Array.from({length:32},(_,i)=>({...fixture,id:'python-'+i})) }).pythonScripts.length,30);
  assert.equal(backendModel({ routes:[],pythonScripts:[fixture,fixture,{...fixture,id:'INVALID'}] }).pythonScripts.length,1);
  const project=createEmptyProject('Python model roundtrip');
  project.backend.pythonScripts=[fixture];
  assert.equal(deserializeProject(serializeProject(project)).backend.pythonScripts[0].source,fixture.source);

  const hash=spawnSync(process.execPath,[gateway,'hash'],{input:password,encoding:'utf8'});
  assert.equal(hash.status,0);
  const state=await mkdtemp(resolve('work','python-editor-state-'));
  const child=spawn(process.execPath,[gateway],{
    env:{...process.env,PORT:'15462',PUBLIC_ORIGIN:origin,PLOT_STATE_DIR:state,STUDIO_PASSWORD_HASH:hash.stdout.trim(),STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url')},
    stdio:['ignore','ignore','inherit'],
  });
  let browser;
  try {
    for(let attempt=0;attempt<60;attempt++) {
      try{if((await fetch(origin)).ok)break;}catch{}
      await pause(100);
    }
    browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
    const page=await browser.newPage({viewport:{width:1440,height:940},acceptDownloads:true});
    page.setDefaultTimeout(6000);
    const calls=[];
    const issues=[];
    page.on('pageerror',issue=>issues.push(issue.message));
    await page.route(origin+'/studio/api/backend/python/test', route=>{
      const body=route.request().postDataJSON();
      calls.push(body);
      return route.fulfill({json:{result:{ subtotal:'59.85', label:'<strong>data</strong>' },logs:'Calculated 3 units\n<test log>',durationMs:27}});
    });
    await configure(page,true);
    await page.getByText('Python 3.13.5 is available for testing.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Calculate a subtotal',exact:true}).click();
    const source=page.getByLabel('Python source',{exact:true});
    const initial=await source.inputValue();
    assert.match(initial,/from decimal import Decimal/);
    await source.fill('\n'+initial);
    await page.getByLabel('Test input (JSON)',{exact:true}).fill('{');
    await page.getByRole('button',{name:'Run test',exact:true}).click();
    await page.getByText('Enter valid JSON for the test input.',{exact:true}).waitFor();
    assert.equal(calls.length,0);
    await page.getByLabel('Test input (JSON)',{exact:true}).fill('{"quantity":3,"unit_price":"19.95"}');
    await page.getByLabel('Timeout (seconds)',{exact:true}).fill('16');
    await page.getByRole('button',{name:'Run test',exact:true}).click();
    await page.getByText('Enter a timeout from 1 to 15 seconds.',{exact:true}).waitFor();
    assert.equal(calls.length,0);
    await page.getByLabel('Timeout (seconds)',{exact:true}).fill('5');
    await page.getByRole('button',{name:'Run test',exact:true}).click();
    await page.getByText('Test finished.',{exact:true}).waitFor();
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0],{source:'\n'+initial,values:{quantity:3,unit_price:'19.95'},timeout:5});
    assert.match(await page.locator('.be-python-result').textContent(),/59\.85/);
    assert.match(await page.locator('.be-python-result').textContent(),/<test log>/);
    assert.equal(await page.locator('.be-python-result strong').count(),0);
    await page.getByRole('button',{name:'Save script',exact:true}).click();
    const row=page.locator('[data-python-select]');
    await row.waitFor();
    const script=await row.getAttribute('data-python-select');
    assert.match(script,/^[a-z][a-z0-9-]{0,63}$/);
    assert.equal(await source.inputValue(),'\n'+initial);
    await page.screenshot({path:resolve('work','python-editor-desktop.png')});
    await page.getByRole('button',{name:'Workflows',exact:true}).click();
    await page.getByRole('button',{name:'Create an endpoint',exact:true}).click();
    await page.getByRole('button',{name:/Add node/}).click();
    await page.getByLabel('Node category',{exact:true}).selectOption('Python');
    await page.locator('[data-pick-operation="run-python"]').click();
    await page.getByLabel('Python script',{exact:true}).selectOption(script);
    assert.equal(await page.locator('[data-binding="script"]').count(),0);
    await page.getByLabel('Input values source',{exact:true}).selectOption('reference');
    await page.getByLabel('Input values reference',{exact:true}).fill('request.query');
    await page.getByLabel('Input values reference',{exact:true}).press('Tab');
    await page.getByRole('button',{name:'Manage Python scripts',exact:true}).click();
    const deletion=page.getByRole('button',{name:'Delete script',exact:true});
    assert(await deletion.isDisabled());
    await page.getByText(/Used by 1 workflow node/).waitFor();
    await page.waitForFunction(id=>{
      const project=JSON.parse(localStorage.getItem('99host.plot-studio.project.v1'));
      return project?.backend?.pythonScripts?.[0]?.id===id &&
        project?.backend?.routes?.[0]?.steps?.some(step=>step.type==='run-python' && step.args.script===id && step.args.values?.$ref==='request.query');
    }, script);
    await page.reload();
    await page.locator('[data-mode="backend"]').click();
    await page.getByRole('button',{name:'Python',exact:true}).click();
    await page.locator('[data-python-select]').waitFor();
    assert.equal(await page.getByLabel('Python source',{exact:true}).inputValue(),'\n'+initial);
    assert(await page.getByRole('button',{name:'Delete script',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Workflows',exact:true}).click();
    await page.locator('.be-node').filter({hasText:'Run Python script'}).click();
    await page.getByRole('button',{name:'Remove',exact:true}).click();
    await page.getByRole('button',{name:'Python',exact:true}).click();
    page.once('dialog', dialog=>dialog.accept());
    await page.getByRole('button',{name:'Delete script',exact:true}).click();
    await page.getByText('No saved scripts.',{exact:true}).waitFor();
    assert.deepEqual(issues,[]);

    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.setDefaultTimeout(6000);
    await configure(mobile,false);
    await mobile.getByText('Runner is unavailable in this fixture.',{exact:true}).waitFor();
    assert(await mobile.getByRole('button',{name:'Run test',exact:true}).isDisabled());
    assert(await mobile.getByLabel('Python source',{exact:true}).isEditable());
    await mobile.getByRole('button',{name:'Summarise records by status',exact:true}).click();
    assert.match(await mobile.getByLabel('Python source',{exact:true}).inputValue(),/from collections import Counter/);
    await mobile.getByRole('button',{name:'Save script',exact:true}).click();
    await mobile.locator('[data-python-select]').waitFor();
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
    const region=await mobile.locator('#backend-editor').evaluate(el=>({ width:el.clientWidth, content:el.scrollWidth }));
    assert(region.content<=region.width,JSON.stringify(region));
    await mobile.screenshot({path:resolve('work','python-editor-phone.png')});
    console.log('Python editor/model tests pass, including UTF-8 bounds, .plot roundtrip, example, JSON/timeout guards, mocked result/logs, script binding/delete guard, reload and 390 px offline authoring.');
  } finally {
    await browser?.close();
    child.kill();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

