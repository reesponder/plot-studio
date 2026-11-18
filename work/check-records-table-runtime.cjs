const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { compileGraph } = await import('../outputs/plot-studio/logic.mjs');
  const { createBlock, createEmptyProject, renderDocument } = await import('../outputs/plot-studio/project.mjs');
  const { createDataTable, createDataField } = await import('../outputs/plot-studio/data.mjs');
  const rowTable = createDataTable('Intake');
  rowTable.fields.push({ ...createDataField('Customer'), id:'customer' });
  const project = createEmptyProject('Records runtime checks');
  project.data.tables.push(rowTable);
  const home = project.pages[0];
  home.blocks = [
    createBlock('records-table', { id:'result-table',props:{
      columns:[{field:'customer',label:'Customer'},{field:'active',label:'Active'},{field:'quantity',label:'Quantity'}],
      loadingText:'Gathering records.', emptyText:'Nothing matched.', errorText:'The table could not load.',
    } }),
    createBlock('text', { id:'result-count',props:{ text:'No count yet.' } }),
    createBlock('text', { id:'failure-code',props:{ text:'No failure yet.' } }),
  ];
  const node = (id,type,config={}) => ({ id,type,config });
  const wire = (from,port,to,input='in') => ({
    id:from+'-'+port+'-'+to+'-'+input, from:{nodeId:from,port}, to:{nodeId:to,port:input},
  });
  const graph = {
    nodes:[
      node('on-load','page-load',{page:home.id}), node('loading','show-records',{target:'result-table',mode:'loading'}),
      node('query','db-list',{table:rowTable.id,limit:'3',offset:'1'}),
      node('skip','constant',{valueType:'number',value:'6'}),
      node('render','show-records',{target:'result-table',mode:'rows'}),
      node('error','show-records',{target:'result-table',mode:'error'}),
      node('read-error','get-property',{path:'code'}),
      node('count','set-text',{target:'result-count'}),
      node('failure','set-text',{target:'failure-code'}),
    ],
    edges:[
      wire('on-load','next','loading'), wire('loading','next','query'),
      wire('skip','value','query','offset'), wire('query','next','render'), wire('query','fault','error'),
      wire('query','result','render','records'), wire('render','next','count'), wire('render','count','count','value'),
      wire('render','fault','read-error'), wire('render','error','read-error','input'),
      wire('read-error','next','failure'), wire('read-error','result','failure','value'),
    ],
  };
  const compiled = compileGraph(graph,project);
  assert.deepEqual(compiled.diagnostics.filter(diagnostic=>diagnostic.severity==='error'),[]);
  const literal = { nodes: graph.nodes.map(entry => entry.id === 'query' ? { ...entry,config:{...entry.config,offset:'-1'} } : entry),
    edges:graph.edges.filter(edge=>edge.from.nodeId!=='skip') };
  assert(compileGraph(literal,project).diagnostics.some(diagnostic=>diagnostic.severity==='error' && /nonnegative/.test(diagnostic.message)));
  const doc = renderDocument(home, project, compiled.code);
  const browser = await chromium.launch({ executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    for (const scenario of ['ready','empty','malformed','over-limit','denied']) {
      const browserPage = await browser.newPage();
      try {
        await browserPage.addInitScript(kind=>{
          window.testQueries=[];
          window.plotData={ query(request) {
            window.testQueries.push(request);
            return new Promise((resolve,reject)=>{
              window.releaseMockRecords=()=>{
                if (kind==='denied') return reject(Object.assign(new Error('Permission denied'),{code:'FORBIDDEN'}));
                if (kind==='over-limit') return resolve(Array.from({ length:501 },()=>({customer:'too many'})));
                if (kind==='malformed') return resolve([{customer:'valid but discarded'}, null]);
                if (kind==='empty') return resolve([]);
                resolve([
                  {customer:'<img src=x onerror=window.injection=true>',active:false,quantity:0,privateContact:'SENSITIVE_COLUMN_NOT_MAPPED'},
                  {customer:'Second record',active:true,privateContact:'SENSITIVE_COLUMN_NOT_MAPPED'},
                ]);
              };
            });
          } };
        }, scenario);
        const fixture='http://records-runtime.test/';
        await browserPage.route(fixture,route=>route.fulfill({contentType:'text/html',body:doc}));
        await browserPage.goto(fixture);
        const block=browserPage.locator('#content [data-block-type="records-table"]');
        const live=block.getByRole('status');
        await browserPage.waitForFunction(()=>typeof window.releaseMockRecords==='function');
        assert.equal(await block.getAttribute('data-records-state'),'loading');
        assert.equal(await block.getAttribute('aria-busy'),'true');
        assert.equal(await live.textContent(),'Gathering records.');
        assert.deepEqual(await browserPage.evaluate(()=>window.testQueries),[{ operation:'list',table:rowTable.id,filter:undefined,limit:3,offset:6 }]);
        await browserPage.evaluate(()=>window.releaseMockRecords());
        await browserPage.waitForFunction(()=>document.querySelector('[data-block-type="records-table"]').dataset.recordsState!=='loading');
        assert.equal(await block.getAttribute('aria-busy'),null);
        const expected=scenario==='ready'?'ready':scenario==='empty'?'empty':'error';
        assert.equal(await block.getAttribute('data-records-state'),expected);
        if (scenario==='ready') {
          await browserPage.getByText('2',{exact:true}).waitFor();
          assert.deepEqual(await block.locator('tbody td').allTextContents(),['<img src=x onerror=window.injection=true>','false','0','Second record','true','–']);
          assert.equal(await block.locator('img,script').count(),0);
          assert.equal(await block.getByText('SENSITIVE_COLUMN_NOT_MAPPED').count(),0);
          assert.equal(await browserPage.evaluate(()=>window.injection),undefined);
          assert.equal(await live.textContent(),'');
        } else {
          assert.equal(await block.locator('tbody tr').count(),0);
          assert.equal(await live.textContent(),scenario==='empty'?'Nothing matched.':'The table could not load.');
          if (scenario==='empty') await browserPage.getByText('0',{exact:true}).waitFor();
          if (scenario==='malformed' || scenario==='over-limit') await browserPage.getByText('INVALID_RECORDS',{exact:true}).waitFor();
        }
      } finally {
        await browserPage.close();
      }
    }
    console.log('Compiled/exported Records table: typed offset, loading, success, count, empty, malformed, oversized and denied outcomes; mapped cells render text only.');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

