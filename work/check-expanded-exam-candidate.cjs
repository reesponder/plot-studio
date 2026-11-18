const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, readFile } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const root = resolve('outputs/plot-studio');
const publicRoot = resolve(root, 'public');
const fallbackModules = ['Build the public site', 'Build the interactive quote', 'Connect and protect enquiries', 'Test and hand off the project'];
const mockBuilder = { title: 'Northline Tool Library', brief: 'Sample scenario text.', overview: 'Use Studio.', standard: '80 points.',
  tasks: Array.from({ length: 24 }, (_, index) => [`Fixture task ${index + 1}`, `This is fixture description ${index + 1}.`]),
  sections: fallbackModules.map(title => ({ title, count: 6 })),
};
const versions = [
  { exam: 'builder', path: '/certification/builder', title: 'Certified Builder', count: 24, hours: 6 },
  { exam: 'architect', path: '/certification/workflow-architect', title: 'Certified Workflow Architect', count: 42, hours: 10 },
];

async function gateway() {
  const probe = createServer();
  await new Promise(done => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address();
  await new Promise(done => probe.close(done));
  const origin = `http://127.0.0.1:${port}`;
  if (process.argv.includes('--static')) return { origin: 'http://candidate-exam.test' };
  const state = await mkdtemp(resolve('work/exam-candidate-browser-'));
  const entry = resolve(root, 'server.mjs');
  const hash = spawnSync(process.execPath, [entry, 'hash'], { input: randomBytes(24).toString('base64url'), encoding: 'utf8' });
  assert.equal(hash.status, 0, hash.stderr);
  const server = spawn(process.execPath, [entry], { env: {
    ...process.env, PUBLIC_ORIGIN: origin, PORT: String(port), PLOT_STATE_DIR: state,
    STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
  }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  server.stderr.on('data', output => { stderr += output; });
  for (let count = 0; count < 50; count++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin + '/certification/attempt')).ok) return { origin, server }; } catch {}
    await delay(100);
  }
  server.kill();
  throw new Error(`Gateway did not start: ${stderr}`);
}

async function prepare(page, origin) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.argv.includes('--static')) {
    const routes = new Map([['/certification', 'certification.html'], ['/certification/builder', 'exam-builder.html'],
      ['/certification/workflow-architect', 'exam-workflow-architect.html'], ['/certification/attempt', 'exam-attempt.html'],
      ['/certification/builder/practice', 'exam-builder-practice.html'], ['/certification/workflow-architect/practice', 'exam-architect-practice.html']]);
    const contentTypes = { html: 'text/html', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript', webp: 'image/webp' };
    await page.route(origin + '/**/*', async route => {
      const path = new URL(route.request().url()).pathname;
      const asset = path.match(/^\/99host-assets\/(.+)$/)?.[1];
      const name = routes.get(path) || (asset?.endsWith('.webp') ? `media/${asset}` : asset);
      if (!name) return route.fulfill({ status: 404, body: '' });
      const body = await readFile(resolve(publicRoot, name));
      return route.fulfill({ body, contentType: contentTypes[name.split('.').at(-1)] });
    });
  }
  await page.route(origin + '/certification/api/offers', route => route.fulfill({ json: {
    builder: { available: true, amount: 8000 }, architect: { available: true, amount: 15000 },
  } }));
  return errors;
}

async function dismissCookie(page) {
  const button = page.getByRole('button', { name: 'Got it', exact: true });
  await button.waitFor({ timeout: 1500 }).catch(() => {});
  if (await button.isVisible()) await button.click();
}

async function verifyLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function checkPublic(page, origin, width, fixtures) {
  const errors = await prepare(page, origin);
  const posts = [];
  await page.route(origin + '/certification/api/checkout', route => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { token: 'browser-checkout-fixture', publishableKey: 'pk_test_BrowserFixture', clientSecret: 'cs_test_BrowserFixture_secret' } });
  });
  await page.route('https://js.stripe.com/endive/stripe.js', route => route.fulfill({ contentType: 'text/javascript', body:
    'window.Stripe=()=>({createEmbeddedCheckoutPage: async ({fetchClientSecret})=>{await fetchClientSecret();return {mount:(node)=>{node.textContent="Stripe fixture mounted";},destroy(){}};}});' }));

  await page.goto(origin + '/certification');
  await dismissCookie(page);
  await page.getByRole('link', { name: '24 tasks in 4 modules', exact: true }).waitFor();
  await page.getByRole('link', { name: '42 tasks in 5 modules', exact: true }).waitFor();
  await verifyLayout(page);
  for (const config of versions) {
    await page.goto(origin + config.path);
    const brief = fixtures[config.exam];
    const main = page.locator('main');
    assert.equal(await main.getByRole('heading', { name: config.title, exact: true }).count(), 1);
    assert.match(await main.locator('#exam-brief').innerText(), new RegExp(`${config.count} tasks`));
    assert.match(await main.locator('.admissions-facts').innerText(), new RegExp(`${config.hours} hours`));
    for (const section of brief.sections) assert.equal(await main.locator('#exam-brief').getByRole('heading', { name: section.title, exact: true }).count(), 1);
    const firstPrompt = brief.tasks[0][1];
    assert.ok(!(await main.innerText()).includes(firstPrompt));
    await verifyLayout(page);
    await main.locator('#exam-brief').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `work/expanded-${config.exam}-${width}.png` });
    await main.getByRole('link', { name: 'Open foundational practice' }).click();
    await page.waitForURL(origin + config.path + '/practice');
    assert.match(await page.locator('.cert-hero-copy').innerText(), /foundational drills from the earlier/);
    if (width === 390) {
      await page.goto(origin + config.path);
      const form = page.locator('#cert-enrol-form');
      const buy = form.getByRole('button', { name: 'Open secure checkout' });
      await form.locator('[name=name]').fill('Candidate Fixture');
      await form.locator('[name=email]').fill('candidate@example.test');
      await buy.click();
      assert.equal(await page.locator('#cert-payment').isVisible(), false);
      await form.locator('[name=acceptedTerms]').check();
      await buy.click();
      const dialog = page.getByRole('dialog', { name: 'Exam checkout' });
      await dialog.getByText('Stripe fixture mounted').waitFor();
      assert.deepEqual(posts.at(-1), { exam: config.exam, name: 'Candidate Fixture', email: 'candidate@example.test', acceptedTerms: '2026-11-16-certification-r3' });
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), false);
    }
  }
  assert.deepEqual(errors, []);
}

async function checkCandidate(page, origin, width, config, brief) {
  const errors = await prepare(page, origin);
  const token = `test-only-${config.exam}-${width}`;
  let phase = 'not_started';
  let attempts = 0;
  const startTime = config.hours * 3600000;
  const checks = brief.tasks.map(([title], index) => ({ description: title, passed: index % 4 !== 1, mandatory: index % 3 === 0 }));
  const failing = checks.filter(check => !check.passed);
  const state = () => ({
    exam: config.exam, assessmentVersion: 2, taskCount: config.count, name: 'Candidate V2 Fixture', accessGranted: true, state: 'paid', attempts, maxAttempts: 3,
    ...(phase === 'running' ? { brief } : {}),
    ...(attempts ? { latestResult: { passed: false, score: 72, maxScore: 100, checks } } : {}),
    timer: {
      state: phase, serverNowMs: Date.now(), workDurationMs: startTime, workRemainingMs: startTime,
      activeDeadlineAt: phase === 'running' ? new Date(Date.now() + startTime).toISOString() : null,
      breakEndsAt: phase === 'paused' ? new Date(Date.now() + 2700000).toISOString() : null,
      maxBreaks: config.exam === 'builder' ? 1 : 3, breaksUsed: 0,
      breakDurationMs: config.exam === 'builder' ? 3600000 : 2700000,
    },
  });
  await page.route(origin + '/certification/api/enrolment', route => {
    assert.equal(route.request().headers().authorization, 'Bearer ' + token);
    return route.fulfill({ json: state() });
  });
  for (const [action, next] of [['start', 'running'], ['pause', 'paused'], ['resume', 'running']]) {
    await page.route(origin + '/certification/api/timer/' + action, route => {
      phase = next;
      return route.fulfill({ json: state() });
    });
  }
  await page.route(origin + '/certification/api/submission', route => {
    const body = route.request().postDataJSON();
    assert.deepEqual(body, { project: { name: 'Candidate check' }, publishCertificate: false });
    attempts++;
    return route.fulfill({ json: state() });
  });

  await page.goto(origin + `/certification/attempt?exam=${config.exam}`);
  await dismissCookie(page);
  await page.getByLabel('Recovery code').fill(token);
  await page.getByRole('button', { name: 'Open enrolment' }).click();
  const start = page.getByRole('button', { name: 'Start exam', exact: true });
  await start.waitFor();
  const content = page.locator('#cert-exam-content');
  assert.equal(await content.isVisible(), false);
  assert.equal(await content.locator('li').count(), 0);
  await start.click();
  await content.getByRole('heading', { name: `Exam tasks (${config.count})` }).waitFor();
  assert.equal(await content.getByRole('heading', { name: brief.title, exact: true }).count(), 1);
  assert.equal(await content.locator('li').count(), config.count);
  assert.deepEqual(await content.locator('li strong').allTextContents(), brief.tasks.map(([title]) => title));
  const links = content.getByRole('navigation', { name: 'Jump to an exam module' });
  assert.equal(await links.getByRole('link').count(), brief.sections.length);
  const module = brief.sections.at(-1);
  await links.getByRole('link', { name: `${module.title} (${module.count})`, exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), module.title);
  const mark = content.getByRole('checkbox', { name: `Mark task ${config.count} reviewed`, exact: true });
  await mark.check();
  await content.getByText(`1 of ${config.count} tasks marked.`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Take a break' }).click();
  await page.getByRole('button', { name: 'Resume exam' }).waitFor();
  assert.equal(await content.isVisible(), false);
  assert.equal(await content.locator('li').count(), 0);
  await page.getByRole('button', { name: 'Resume exam' }).click();
  await mark.waitFor();
  assert.equal(await mark.isChecked(), true);
  await page.reload();
  if (!await mark.isVisible()) await page.getByRole('button', { name: /Open .* for Candidate V2 Fixture/ }).click();
  await mark.waitFor();
  assert.equal(await mark.isChecked(), true);
  await verifyLayout(page);
  await links.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `work/expanded-candidate-${config.exam}-${width}.png` });

  await page.getByLabel('Project file', { exact: true }).setInputFiles({ name: 'fixture.plot', mimeType: 'application/json', buffer: Buffer.from('{"name":"Candidate check"}') });
  await page.getByRole('button', { name: 'Submit for grading' }).click();
  await page.getByText(`${config.count - failing.length} of ${config.count} checks passed.`, { exact: true }).waitFor();
  const result = page.locator('#cert-result-checks li');
  assert.equal(await result.count(), config.count);
  const filter = page.getByRole('button', { name: 'Only checks that need work' });
  await filter.click();
  assert.equal(await result.filter({ visible: true }).count(), failing.length);
  assert.equal(await filter.getAttribute('aria-pressed'), 'true');
  await filter.click();
  assert.equal(await result.filter({ visible: true }).count(), config.count);
  assert.deepEqual(errors, []);
}

(async () => {
  const { architectV2Brief } = await import('../outputs/plot-studio/exam-architect-v2.mjs');
  const { builderV2Brief } = await import('../outputs/plot-studio/exam-builder-v2.mjs').catch(error => {
    if (!process.argv.includes('--static') || error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return { builderV2Brief: mockBuilder };
  });
  const fixtures = { architect: architectV2Brief, builder: builderV2Brief };
  const { origin, server } = await gateway();
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    for (const width of [390, 1440]) {
      const newPage = () => browser.newPage({ viewport: { width, height: 930 }, reducedMotion: 'reduce' });
      const publicPage = await newPage();
      await checkPublic(publicPage, origin, width, fixtures);
      await publicPage.close();
      for (const config of versions) {
        const candidate = await newPage();
        await checkCandidate(candidate, origin, width, config, fixtures[config.exam]);
        await candidate.close();
      }
      console.log(`${width}px: public counts, practice, checkout fixture; all Builder and Architect tasks and checks, jumps, clock pause/resume and browser marks.`);
    }
  } finally {
    await browser.close();
    server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
