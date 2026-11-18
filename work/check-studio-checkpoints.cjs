const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, readFile } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join } = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { chromium } = require('playwright');
async function availablePort() {
  const probe = createServer();
  await new Promise((done, fail) => { probe.once('error', fail); probe.listen(0, '127.0.0.1', done); });
  const {port} = probe.address();
  await new Promise(done => probe.close(done));
  return port;
}
(async () => {
  const app = resolve(__dirname, '../outputs/plot-studio');
  const port = await availablePort();
  const origin = 'http://localhost:' + port;
  const state = await mkdtemp(resolve(__dirname, 'plot-checkpoints-state-'));
  const legacyId = randomUUID();
  const password = randomBytes(21).toString('base64url');
  const hash = spawnSync(process.execPath, [join(app,'server.mjs'),'hash'], {input:password,encoding:'utf8'});
  assert.equal(hash.status, 0);
  const {createEmptyProject} = await import('../outputs/plot-studio/project.mjs');
  const oldProject = createEmptyProject('Legacy project');
  const migration = spawnSync('python',['-c',`import json,sqlite3,sys
with sqlite3.connect(sys.argv[1]) as db:
 db.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, content TEXT NOT NULL)")
 project=json.load(sys.stdin.buffer)
 db.execute("INSERT INTO projects VALUES (?,?,?,?,?)",(sys.argv[2],project["name"],7,1000,json.dumps(project)))`,join(state,'projects.sqlite3'),legacyId],{input:JSON.stringify(oldProject),encoding:'utf8'});
  assert.equal(migration.status, 0, migration.stderr);
  const {env} = process;
  const proc = spawn(process.execPath,[join(app,'server.mjs')],{env:{...env, PORT:String(port),PUBLIC_ORIGIN:origin,
    PLOT_STATE_DIR:state,PLOT_PYTHON:'python',STUDIO_PASSWORD_HASH:hash.stdout.trim(),STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url')},stdio:['ignore','ignore','inherit']});
  let browser;
  try {
    for (let tryNo=0;tryNo<40;tryNo++) {
      try { await fetch(origin + '/'); break; } catch { await sleep(100); }
    }
    const api = origin + '/studio/api/projects';
    assert.equal((await fetch(api + '/' + legacyId + '/revisions')).status, 401);
    const login = await fetch(origin + '/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({password}),redirect:'manual'});
    assert.equal(login.status,303);
    const keyPair = login.headers.get('set-cookie').split(';')[0];
    const req = async (suffix='', method='GET', headers={}, body=undefined) => {
      const response=await fetch(api+suffix,{method,headers:{Origin:origin,Cookie:keyPair,...headers},body});
      return [response.status,await response.json()];
    };
    const root = '/' + legacyId;
    let [status,history] = await req(root+'/revisions');
    assert.equal(status,200); assert.deepEqual(history.revisions.map(x=>x.revision),[7]);
    const put = (name,rev,note='') => req(root,'PUT',{'If-Match':'"'+rev+'"','Content-Type':'application/json','X-Plot-Checkpoint':encodeURIComponent(note)}, JSON.stringify({...oldProject,name}));
    assert.equal((await put('Version 8',7,'Źródło • before beta'))[0],200);
    assert.equal((await put('Stale update',7))[0],409);
    assert.equal((await req(root+'/revisions/7/restore','POST',{'If-Match':'"8"','Origin':'https://wrong.invalid'}))[0],403);
    assert.equal((await req(root+'/revisions/7/restore','POST'))[0],428);
    assert.equal((await req(root+'/revisions/7/restore','POST',{'If-Match':'"7"'}))[0],409);
    assert.equal((await req(root+'/revisions/999/restore','POST',{'If-Match':'"8"'}))[0],404);
    assert.equal((await req(root+'/revisions/7/restore','POST',{'If-Match':'"8"'}))[1].revision,9);
    [status, history] = await req(root+'/revisions');
    assert.deepEqual(history.revisions.map(x=>[x.revision,x.note,x.restoredFrom]),[[9,'',7],[8,'Źródło • before beta',null],[7,'',null]]);
    assert.equal((await req(root))[1].project.name,'Legacy project');
    assert.equal((await req(root+'/revisions/8'))[1].project.name,'Version 8');
    for (let revision=9;revision<42;revision++) assert.equal((await put('Version '+(revision+1),revision))[0],200);
    [status, history] = await req(root+'/revisions');
    assert.equal(history.revisions.length,30);
    assert.equal(history.revisions.at(-1).revision,13);
    assert.equal((await req(root+'/revisions/9'))[0],404);
    assert.equal((await req(root,'DELETE',{'If-Match':'"42"'}))[0],200);
    assert.equal((await req(root+'/revisions'))[0],404);
    browser = await chromium.launch({headless:true,executablePath:env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
    const context = await browser.newContext({viewport:{width:390,height:820},acceptDownloads:true,reducedMotion:'reduce'});
    const sep = keyPair.indexOf('=');
    await context.addCookies([{name:keyPair.slice(0,sep), value:keyPair.slice(sep+1), domain:'localhost', path:'/', secure:true}]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/studio/');
    const openLibrary = async () => { await page.locator('#project-trigger').click(); await page.locator('[data-project-action="server-library"]').click(); };
    const rename = async name => {
      await page.locator('#project-trigger').click();
      await page.locator('[data-project-action="rename"]').click();
      await page.locator('#edit-fields input').fill(name);
      await page.locator('#edit-confirm').click();
      assert.equal(await page.locator('#project-name').textContent(),name);
    };
    await rename('Checkpoint one');
    await openLibrary();
    await page.locator('input[data-remote-checkpoint]').fill('Przed eksportem');
    await page.locator('[data-remote-save]').click();
    await page.getByRole('button',{name:'History for Checkpoint one'}).waitFor();
    await page.locator('[data-remote-close]').click();
    await rename('Checkpoint two');
    await openLibrary();
    await page.locator('[data-remote-save]').click();
    await page.getByRole('button',{name:'History for Checkpoint two'}).click();
    await page.getByText('v1 · Przed eksportem',{exact:true}).waitFor();
    assert.equal(await page.locator('#remote-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    const dl = page.waitForEvent('download');
    await page.getByRole('button',{name:'Download revision 1'}).click();
    const downloaded = await dl;
    assert.equal(downloaded.suggestedFilename(),'checkpoint-one-v1.plot');
    assert.equal(JSON.parse(await readFile(await downloaded.path(),'utf8')).name,'Checkpoint one');
    await page.getByRole('button',{name:'Restore revision 1'}).click();
    await page.getByRole('button',{name:'Confirm restore revision 1'}).click();
    await page.getByText('v3 · Current',{exact:true}).waitFor();
    assert.equal(await page.locator('#project-name').textContent(),'Checkpoint two');
    await page.getByRole('button',{name:'Open current'}).click();
    await page.locator('#edit-confirm').click();
    await page.waitForFunction(()=>document.querySelector('#project-name')?.textContent==='Checkpoint one');
    assert.deepEqual(errors,[]);
    console.log('Authenticated checkpoint API and mobile UI passed: legacy migration, notes, conflict protection, bounded retention, .plot download, non-destructive restore, and explicit open.');
  } finally { await browser?.close(); proc.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1});
