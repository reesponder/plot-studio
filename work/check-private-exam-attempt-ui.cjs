const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const origin = 'http://private-exam-attempt.test';
const root = resolve('outputs/plot-studio/public');
const testToken = 'fixture-owner-private-attempt';
const regularToken = 'fixture-regular-exam';
const certificate = { id:'PLOT-1234567890ABCDEFGH' };
const result = { passed:true, score:90, maxScore:100, checks:[{description:'Three pages are present.',mandatory:true,passed:true}] };
const brief = { title:'PLOT Studio Certified Builder', brief:'Studio Enquiry', overview:'Make the candidate project.', standard:'80 points.', tasks:[['Pages','Build the three pages.']] };
const assetTypes = { css:'text/css', mjs:'text/javascript', js:'text/javascript', webp:'image/webp' };

function state({ test, phase = 'running', passed = false }) {
  const now = Date.now();
  return {
    exam:'builder', name:test?'Owner Fixture':'Regular Fixture', accessGranted:true,
    state:passed?'passed':'paid', attempts:passed?1:0, maxAttempts:3,
    ...(test && { testAttempt:true }),
    ...(phase==='running' && { brief }),
    ...(passed && { latestResult:result, certificate }),
    timer:{
      state:passed?'complete':phase, serverNowMs:now, workDurationMs:21600000,
      workRemainingMs:passed?0:21600000,
      activeDeadlineAt:phase==='running'?new Date(now+21600000).toISOString():null,
      maxBreaks:1, breaksUsed:0, breakDurationMs:3600000,
    },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({ viewport:{ width,height:900 }, reducedMotion:'reduce' });
      page.setDefaultTimeout(7000);
      const submissions = [];
      const errors = [];
      const certificateRequests = [];
      let phase = 'not_started', testPassed = false, regularPassed = false;
      page.on('pageerror',error=>errors.push(error.message));
      await page.route(origin+'/**', route => {
        const request=route.request();
        const path=new URL(request.url()).pathname;
        const token=request.headers().authorization?.replace(/^Bearer /,'');
        if (path==='/certification/attempt') return route.fulfill({ path:resolve(root,'exam-attempt.html'), contentType:'text/html' });
        if (path.startsWith('/99host-assets/')) {
          const asset=path.split('/').at(-1);
          const ext=asset.split('.').at(-1);
          return route.fulfill({ path:resolve(root, ext==='webp'?'media':'', asset), contentType:assetTypes[ext] });
        }
        if (path==='/certification/api/access/redeem') return route.fulfill({ json:{token:testToken,enrolment:state({test:true,phase})} });
        if (path==='/certification/api/timer/start' && token===testToken) {
          phase='running';
          return route.fulfill({ json:state({test:true,phase}) });
        }
        if (path==='/certification/api/enrolment') {
          return route.fulfill({ json:token===testToken?state({test:true,phase,passed:testPassed}):state({test:false,passed:regularPassed}) });
        }
        if (path==='/certification/api/submission') {
          const body=request.postDataJSON();
          submissions.push({token,body});
          if (token===testToken) testPassed=true;
          else regularPassed=true;
          return route.fulfill({ json:state({test:token===testToken,passed:true}) });
        }
        if (path==='/certification/api/certificate' || path==='/certification/api/certificate.pdf') {
          certificateRequests.push(path);
        }
        return route.fulfill({ status:404,json:{error:'Unexpected fixture request.'} });
      });

      await page.goto(origin+'/certification/attempt#access=fixture-invite',{waitUntil:'domcontentloaded'});
      const cookie=page.getByRole('button',{name:'Got it',exact:true});
      await cookie.waitFor({timeout:1000}).catch(()=>{});
      if (await cookie.isVisible()) await cookie.click();
      await page.getByRole('button',{name:'Open exam workspace',exact:true}).click();
      await page.getByText('Private test attempt',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Open Builder test attempt for Owner Fixture',exact:true}).waitFor();
      assert.equal(await page.locator('#cert-submission-form').isVisible(),false);
      await page.getByRole('button',{name:'Start exam',exact:true}).click();
      const submit=page.getByRole('button',{name:'Submit for grading',exact:true});
      await submit.waitFor();
      const consent=page.locator('#cert-submission-form [name="publishCertificate"]');
      assert.equal(await consent.isVisible(),false);
      assert(await consent.isDisabled());
      await consent.evaluate(control=>{control.checked=true;});
      await page.getByLabel('Project file',{exact:true}).setInputFiles({
        name:'owner-fixture.plot',mimeType:'application/json',buffer:Buffer.from('{"pages":[]}'),
      });
      await submit.click();
      await page.getByText('Passed. 90 out of 100 points.',{exact:true}).waitFor();
      assert.equal(submissions[0].token,testToken);
      assert.equal(submissions[0].body.publishCertificate,false);
      assert.equal(await page.locator('#cert-issue-form').isVisible(),false);
      assert.equal(await page.locator('#cert-issued').isVisible(),false);
      assert.equal(await page.locator('#cert-verification-link').getAttribute('href'),null);
      await page.getByText('This test attempt is complete. Open your graded result below.',{exact:true}).waitFor();
      await page.locator('#cert-issue-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      await page.locator('#cert-download').evaluate(button=>button.click());
      assert.deepEqual(certificateRequests,[]);

      await page.getByLabel('Recovery code',{exact:true}).fill(regularToken);
      await page.getByRole('button',{name:'Open enrolment',exact:true}).click();
      await page.getByText('Regular Fixture',{exact:true}).waitFor();
      assert.equal(await page.getByText('Private test attempt',{exact:true}).isVisible(),false);
      assert(await consent.isVisible());
      assert.equal(await consent.isDisabled(),false);
      await consent.check();
      await page.getByLabel('Project file',{exact:true}).setInputFiles({
        name:'regular-fixture.plot',mimeType:'application/json',buffer:Buffer.from('{"pages":[]}'),
      });
      await submit.click();
      await page.getByRole('button',{name:'Download certificate PDF',exact:true}).waitFor();
      assert.equal(submissions[1].token,regularToken);
      assert.equal(submissions[1].body.publishCertificate,true);
      assert.match(await page.locator('#cert-verification-link').getAttribute('href'),/PLOT-1234567890ABCDEFGH/);
      assert.deepEqual(errors,[]);
      await page.close();
      console.log(width+' px: private test redemption, Start, score, no certificate, and ordinary certificate flow passed.');
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

