const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const origin = 'https://plotstudio.pro';
    let state = 'not_started';
    let used = 0;
    await page.route(origin + '/certification/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      assert.match(request.headers().authorization, /^Bearer builder-browser-fixture$/);
      switch (path.split('/').at(-1)) {
        case 'enrolment': break;
        case 'start': state = 'running'; break;
        case 'pause': state = 'paused'; used = 1; break;
        case 'resume': state = 'running'; break;
        default: throw new Error('Unexpected request: ' + path);
      }
      const now = Date.now();
      await route.fulfill({ json: {
        exam: 'builder', state: 'paid', accessGranted: true, name: 'Test Candidate', attempts: 0, maxAttempts: 3,
        timer: {
          state, serverNowMs: now, workDurationMs: 21600000, workRemainingMs: 21600000,
          activeDeadlineAt: state === 'running' ? new Date(now + 21600000).toISOString() : null,
          breakEndsAt: state === 'paused' ? new Date(now + 3600000).toISOString() : null,
          breaksUsed: used, maxBreaks: 1, breakDurationMs: 3600000,
        },
        ...(state === 'running' && { brief: { title: 'Test Builder exam', overview: 'Project overview', brief: 'Build a test project', standard: 'Pass mark 80', tasks: [] } }),
      } });
    });
    await page.goto(origin + '/certification/attempt', { waitUntil: 'domcontentloaded' });
    const notice = page.getByRole('button', { name: 'Got it' });
    await notice.waitFor({ timeout: 1500 }).catch(() => {});
    if (await notice.isVisible()) await notice.tap();
    await page.getByLabel('Recovery code').fill('builder-browser-fixture');
    await page.getByRole('button', { name: 'Open enrolment' }).tap();
    const start = page.getByRole('button', { name: 'Start exam', exact: true });
    const pause = page.getByRole('button', { name: 'Take a break' });
    const submission = page.locator('#cert-submission-form');
    await start.waitFor();
    assert.match(await page.locator('#cert-timer-copy').innerText(), /6 hours.*one break of up to 60 minutes/);
    assert.equal(await page.locator('#cert-breaks-remaining').innerText(), '1 of 1');
    assert.equal(await submission.isVisible(), false);
    await start.tap();
    await submission.waitFor();
    await pause.tap();
    const resume = page.getByRole('button', { name: 'Resume exam' });
    await resume.waitFor();
    assert.equal(await page.locator('#cert-breaks-remaining').innerText(), '0 of 1');
    assert.equal(await submission.isVisible(), false);
    await resume.tap();
    await submission.waitFor();
    assert.equal(await pause.isVisible(), false);
    console.log('Live Builder workspace rendered 6h and one break; start, pause and resume controls passed using simulated API responses.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
