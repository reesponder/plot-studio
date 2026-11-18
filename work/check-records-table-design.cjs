const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const { resolve } = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { chromium } = require('playwright');

(async () => {
  const {
    buildSite, createBlock, createEmptyProject, deserializeProject, renderDocument, serializeProject,
  } = await import('../outputs/plot-studio/project.mjs');
  const { createDataTable, createDataField } = await import('../outputs/plot-studio/data.mjs');
  const first = createBlock('records-table');
  assert.notEqual(first.props.columns, createBlock('records-table').props.columns);

  const project = createEmptyProject('Records table fixture');
  const table = createDataTable('Customers');
  table.fields = [{ ...createDataField('Customer'), id:'customer-name' }];
  table.rows = [{ id:'private-row', 'customer-name':'PRIVATE_FIXTURE_DO_NOT_EXPORT' }];
  project.data.tables.push(table);

  const malicious = createBlock('records-table', { props:{
    caption:'<img src=x onerror=alert(1)>',
    loadingText:'Loading "<records>"',
    columns:[
      { field:'customer-name', label:'<script>header</script>' },
      { field:'customer-name', label:'Duplicate' },
      { field:'constructor', label:'Inherited' },
      { field:'x'.repeat(129), label:'Too long' },
      { field:'x" onclick="x', label:'Escaped prop' },
      ...Array.from({length:18}, (_,index) => ({ field:'extra' + index, label:'Extra ' + index })),
    ],
  } });
  const standalone = createEmptyProject('Renderer fixture');
  standalone.pages[0].blocks = [malicious];
  standalone.data = project.data;
  assert.equal(deserializeProject(serializeProject(standalone)).pages[0].blocks[0].props.columns.length,12);
  const rendered = renderDocument(standalone.pages[0], standalone);
  assert(!rendered.includes('PRIVATE_FIXTURE_DO_NOT_EXPORT'));
  assert(rendered.includes('data-records-field="x&quot; onclick=&quot;x"'));
  assert(rendered.includes('&lt;script&gt;header&lt;/script&gt;'));
  assert(!rendered.includes('>Duplicate<') && !rendered.includes('>Inherited<') && !rendered.includes('>Too long<'));
  assert.equal((rendered.match(/<th scope="col" data-records-field/g) ?? []).length,9);
  assert(buildSite(standalone)['index.html'].includes('<tbody data-records-body></tbody>'));

  const gateway = 'outputs/plot-studio/server.mjs';
  const password = randomBytes(18).toString('base64url');
  const hash = spawnSync(process.execPath, [gateway, 'hash'], { input:password, encoding:'utf8' });
  assert.equal(hash.status, 0);
  const port = 15479, origin = 'http://localhost:' + port;
  const state = await mkdtemp(resolve('work', 'records-table-design-'));
  const server = spawn(process.execPath, [gateway], {
    env:{ ...process.env, PORT:String(port), PUBLIC_ORIGIN:origin, PLOT_STATE_DIR:state,
      STUDIO_PASSWORD_HASH:hash.stdout.trim(), STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url') },
    stdio:['ignore','ignore','inherit'],
  });
  let browser;
  try {
    for (let attempt=0; attempt<60; attempt++) {
      try { if ((await fetch(origin)).ok) break; } catch {}
      await pause(100);
    }
    browser = await chromium.launch({ executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    const page = await browser.newPage({ viewport:{ width:1440,height:940 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByLabel('Access password').fill(password);
    await page.getByRole('button', { name:'Sign in' }).click();
    await page.waitForURL(origin + '/studio/');
    await page.locator('#import-project').setInputFiles({ name:'records.plot', mimeType:'application/json', buffer:Buffer.from(serializeProject(project)) });
    await page.locator('#edit-confirm').click();
    await page.getByRole('button', { name:'Records table', exact:true }).click();
    const design = page.frameLocator('#design-frame');
    const records = design.locator('[data-block-type="records-table"]');
    await records.getByRole('columnheader', { name:'Name', exact:true }).waitFor();
    const inspector = page.locator('[data-records-columns]');
    assert.equal(await inspector.locator('datalist option[value="customer-name"]').textContent(), 'Customers / Customer');
    await inspector.getByRole('button', { name:'Add column', exact:true }).click();
    const column = inspector.getByRole('group', { name:'Column 3', exact:true });
    const field = column.getByLabel('Field ID or JSON property');
    await field.fill('constructor');
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    await field.fill('status');
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    await field.fill('customer-name');
    const header = column.getByLabel('Header label');
    assert.equal(await header.getAttribute('aria-invalid'), 'true');
    await header.fill('Customer');
    await header.press('Tab');
    assert.equal(await field.getAttribute('aria-invalid'), null);
    await records.getByRole('columnheader', { name:'Customer', exact:true }).waitFor();
    assert.equal(await records.getByRole('status').textContent(), 'No records to display.');
    await page.getByLabel('Caption (optional)').fill('Customer queue');
    await page.getByLabel('Empty message', { exact:true }).fill('The queue is empty.');
    await records.getByRole('region', { name:'Customer queue', exact:true }).waitFor();
    await records.getByText('The queue is empty.', { exact:true }).waitFor();
    assert.equal(await records.locator('tbody tr').count(),0);
    await inspector.getByRole('button', { name:'Remove column 1', exact:true }).click();
    assert.equal(await inspector.getByRole('group').count(),2);
    await records.getByRole('columnheader', { name:'Name', exact:true }).waitFor({ state:'detached' });
    assert.equal(await records.getAttribute('data-records-state'), 'empty');
    await page.getByRole('button', { name:'Preview', exact:true }).click();
    const preview = page.frameLocator('#preview-frame');
    await preview.getByRole('region', { name:'Customer queue', exact:true }).waitFor();
    assert.equal(await preview.getByText('PRIVATE_FIXTURE_DO_NOT_EXPORT', { exact:true }).count(),0);
    await page.locator('#preview-device').selectOption('mobile');
    assert.equal(await page.locator('#preview-frame').evaluate(frame => parseInt(frame.style.width)),390);

    await page.locator('[data-command="close-preview"]').click();
    const current = project.pages[0];
    const recordsTable = createBlock('records-table', { id:'live-table', props:{ caption:'Live preview', columns:[{field:'customer-name',label:'Customer'}] } });
    current.blocks.push(recordsTable);
    table.permissions.list = true;
    table.fields.push({ ...createDataField('Unmapped synthetic field'), id:'hidden-example' });
    table.rows = [
      { id:'skip-row', 'customer-name':'Skipped record', 'hidden-example':'Unmapped first value' },
      { id:'show-row', 'customer-name':'Visible customer', 'hidden-example':'Unmapped second value' },
    ];
    const turn = (from,port,to,input='in') => ({ id:from+'-'+port+'-'+to+'-'+input, from:{nodeId:from,port},to:{nodeId:to,port:input} });
    project.graph = {
      nodes:[
        { id:'start',type:'page-load',x:60,y:100,config:{page:current.id} },
        { id:'list',type:'db-list',x:340,y:100,config:{table:table.id,limit:'1',offset:'1'} },
        { id:'show',type:'show-records',x:640,y:100,config:{target:recordsTable.id,mode:'rows'} },
      ],
      edges:[turn('start','next','list'),turn('list','next','show'),turn('list','result','show','records')],
    };
    await page.locator('#import-project').setInputFiles({ name:'live-records.plot', mimeType:'application/json', buffer:Buffer.from(serializeProject(project)) });
    await page.locator('#edit-confirm').click();
    await page.locator('[data-mode="logic"]').click();
    await page.getByText('Show records', { exact:true }).waitFor();
    await page.getByRole('button', { name:'Preview', exact:true }).click();
    const listed = preview.getByRole('region', { name:'Live preview', exact:true });
    await listed.getByRole('cell', { name:'Visible customer', exact:true }).waitFor();
    assert.deepEqual(await listed.getByRole('cell').allTextContents(), ['Visible customer']);
    assert.equal(await listed.getByText('Skipped record', { exact:true }).count(),0);
    assert.equal(await preview.getByText('Unmapped second value', { exact:true }).count(),0);
    assert.deepEqual(errors,[]);
    console.log('Native Design and Inspector, safe blank export, Blueprint List records → Show records with offset in Phone Preview verified.');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode=1; });

