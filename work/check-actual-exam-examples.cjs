const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const { resolve } = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { chromium } = require('playwright');
const host = 'http://localhost:15421';
const server = 'outputs/plot-studio/server.mjs';
const labels = ['builder','workflow-architect'];
(async () => {
  const state = await mkdtemp(resolve('work','qa-practice-'));
  const hashed = spawnSync(process.execPath,[server,'hash'],{ input:randomBytes(18).toString('base64url'),encoding:'utf8' });
  assert.equal(hashed.status,0);
  const child = spawn(process.execPath,[server],{
    env:{...process.env, PORT:'15421', PUBLIC_ORIGIN:host, PLOT_STATE_DIR:state,
      STUDIO_PASSWORD_HASH:hashed.stdout.trim(), STUDIO_SESSION_SECRET:randomBytes(32).toString('base64url')},
    stdio:['ignore','ignore','inherit'],
  });
  let browser;
  try {
    let ready = false;
    for (let n=0;n<60;n++){try{ready=(await fetch(host)).ok;if(ready)break;}catch{} await pause(100);}
    assert(ready);
    const css = await fetch(host + '/99host-assets/certification-practice.css?v=2');
    assert.equal(css.status,200); assert.match(css.headers.get('content-type'),/^text\/css/);
    const docs = await (await fetch(host+'/docs')).text();
    const anchorIds = new Set([...docs.matchAll(/ id="([^"]+)"/g)].map(match=>match[1]));
    const screenshots = new Set();
    for (const exam of labels) {
      const detail = '/certification/'+exam, practice=detail+'/practice';
      const found = await fetch(host+practice);
      assert.equal(found.status,200);
      assert.match(found.headers.get('content-type'),/^text\/html/);
      assert.equal((await fetch(host+practice+'/',{redirect:'manual'})).headers.get('location'),practice);
      const detailHtml = await (await fetch(host+detail)).text();
      assert(detailHtml.includes('href="'+practice+'"'));
      const html = await found.text();
      const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(match=>match[1]));
      assert.equal((html.match(/<article class="cert-practice-task"/g)||[]).length,exam === 'builder' ? 2 : 4);
      for (const match of html.matchAll(/href="#([^"]+)"/g)) assert(ids.has(match[1]),match[1]);
      for (const match of html.matchAll(/href="\/docs#([^"]+)"/g)) assert(anchorIds.has(match[1]),match[1]);
      for (const match of html.matchAll(/<img src="(\/99host-assets\/handbook\/[^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)"/g)) {
        const res = await fetch(host+match[1]);
        assert.equal(res.status,200);
        assert.match(res.headers.get('content-type'),/^image\/webp/);
        const bytes = Buffer.from(await res.arrayBuffer());
        assert.equal(bytes.toString('ascii',8,12),'WEBP');
        screenshots.add(match[1]);
      }
    }
    assert(screenshots.size>=16);
    browser = await chromium.launch({ executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    const page = await browser.newPage({ reducedMotion:'reduce' });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    for (const w of [1440,768,390,320]) {
      await page.setViewportSize({width:w,height:w>800?930:850});
      for (const exam of labels) {
        const endpoint=host+'/certification/'+exam+'/practice';
        const res=await page.goto(endpoint); await page.locator('.plot-cookie-dismiss').click({timeout:1000}).catch(() => {});
        assert.equal(res.status(),200);
        await page.locator('.cert-practice-hero img').evaluate(node=>node.decode());
        const content=await page.evaluate(()=>({
          wide:document.documentElement.scrollWidth,
          img:document.querySelector('.cert-practice-hero img').naturalWidth,
          h:document.querySelector('.cert-hero-copy').getBoundingClientRect().top,
          fig:document.querySelector('.cert-practice-hero figure').getBoundingClientRect().top,
        }));
        assert(content.wide <= w, exam+' '+w+' overflow '+content.wide);
        assert(content.img>0);
        if(w===1440) assert(Math.abs(content.h-content.fig)<220,JSON.stringify(content));
        if(w===1440||w===390) await page.screenshot({path:resolve('work','exam-examples-'+exam+'-'+w+'.png'),animations:'disabled'});
        await page.locator('.cert-practice-index li:last-of-type a').click();
        assert(page.url().includes('#'));
        const last=page.locator('.cert-practice-task').last();
        await last.scrollIntoViewIfNeeded();
        const preview=last.locator('.cert-practice-image a').last();
        await preview.click();
        assert(page.url().includes('.webp'));
        await page.goBack();
      }
    }
    assert.deepEqual(errors,[]);
    console.log(screenshots.size+' unique authentic screenshots, valid MIME and WebP signatures, both practice routes and their linked anchors, and no overflow at 1440/768/390/320.');
  } finally { await browser?.close(); child.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
