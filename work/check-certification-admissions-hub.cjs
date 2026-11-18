const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const gateway = path.resolve('outputs/plot-studio/server.mjs');
const password = randomBytes(24).toString('base64url');
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await page.mouse.move(2, 70);
  await page.screenshot({ path: `work/overview-capture-${name}.png`, animations: 'disabled' });
  console.log(`Captured ${name}`);
}

async function main() {
  const state = await mkdtemp(path.resolve('work/cert-hub-admissions-state-'));
  const port = '15415';
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, [gateway], {
    env: {
      ...process.env,
      PORT: port,
      PUBLIC_ORIGIN: origin,
      STUDIO_PASSWORD_HASH: hash.stdout.trim(),
      STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
      PLOT_STATE_DIR: state,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let browser;
  try {
    let ready;
    for (let attempt = 0; attempt < 32; attempt++) {
      try { ready = await fetch(origin); if (ready.ok) break; } catch {}
      await delay(90);
    }
    assert(ready?.ok);
    browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true });
    const appPath = '/certification';
    const pdf = await fetch(origin + appPath + '/sample-certificate.pdf');
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    for (const variant of ['/builder','/builder/practice','/workflow-architect','/workflow-architect/practice','/attempt']) {
      assert.equal((await fetch(origin + appPath + variant)).status, 200);
    }
    for (const viewport of [{width:390,height:844},{width:1440,height:900}]) {
      const page = await browser.newPage({viewport,reducedMotion:'reduce'});
      await page.goto(origin + appPath);
      const cookie = page.getByRole('button',{name:'Got it'});
      if (await cookie.isVisible()) await cookie.click();
      await page.getByRole('heading',{name:'PLOT Studio Certification',exact:true}).waitFor();
      assert.equal(await page.locator('.admissions-exam-row').count(),2);
      const terms = page.locator('.admissions-compare').getByText('6 hours, with one break of up to 60 minutes');
      assert.equal(await terms.count(),1);
      assert.equal(await page.locator('.admissions-compare').getByText('10 hours, with up to three 45-minute breaks').count(),1);
      for (const locator of await page.locator('main img').all()) await locator.evaluate(img => { img.loading='eager'; return img.decode(); });
      await page.locator('[data-cert-overview-status]').getByText(/Enrolment is/).waitFor();
      await page.getByRole('link',{name:'Verify this sample'}).click();
      await page.waitForURL('**/certification/verify?id=PLOT-SAMPLE');
      await page.getByRole('heading',{name:'Verified sample'}).waitFor();
      console.log(viewport.width+'px: authentic images, exam routes, sample PDF, dynamic availability, verified sample');
      await page.close();
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

