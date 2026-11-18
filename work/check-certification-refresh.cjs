const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { mkdir, mkdtemp } = require('node:fs/promises');
const { createServer } = require('node:net');
const { join, resolve } = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { chromium } = require('playwright');

const app = resolve(__dirname, '../outputs/plot-studio');
const cert = '/certification';
const api = cert + '/api';
const exams = { builder: 'builder', architect: 'workflow-architect' };
const routes = [['overview', cert], ...Object.entries(exams).map(([exam, slug]) => [exam, `${cert}/${slug}`])];
const sizes = [[320, 780], [390, 844], [768, 900], [1440, 960]];
const token = 'browser-fixture-enrolment-token';
const stripeScript = 'https://js.stripe.com/endive/stripe.js';
const stripeFixture = `window.Stripe = (key) => ({
  createEmbeddedCheckoutPage: async ({ fetchClientSecret, onComplete }) => {
    if (key !== 'pk_test_CertFixture' || await fetchClientSecret() !== 'cs_test_CertFixture_secret_local') {
      throw new Error('Checkout fixture received unexpected key or client secret');
    }
    let control;
    return {
      mount(target) {
        control = document.createElement('button');
        control.type = 'button';
        control.textContent = 'Complete simulated payment';
        control.addEventListener('click', onComplete);
        target.append(control);
      },
      destroy() { control?.remove(); }
    };
  }
});`;

async function availablePort() {
  const probe = createServer();
  await new Promise((ready, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', ready);
  });
  const { port } = probe.address();
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
}

async function startLocal() {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const state = await mkdtemp(join(__dirname, 'certification-refresh-state-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PLOT_')));
  const server = spawn(process.execPath, [join(app, 'server.mjs')], {
    env: { ...env, PORT: String(port), PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: state,
      STUDIO_PASSWORD_HASH: `scrypt$32768$8$1$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`,
      STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let attempt = 0; attempt < 35; attempt++) {
    if (await fetch(origin + cert).then(response => response.ok).catch(() => false)) return { server, origin };
    await sleep(100);
  }
  server.kill();
  throw Error('Local certification server did not start.');
}

async function setupPage(browser, origin, width, height, { offerFixture, mockApi = true } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width <= 390, hasTouch: width <= 390, reducedMotion: 'reduce' });
  page.setDefaultTimeout(6500);
  const errors = [];
  const submissions = [];
  const confirmations = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => {
    if (/violates the following Content Security Policy|Refused to apply style/i.test(entry.text())) errors.push(entry.text());
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const readOnly = ['GET', 'HEAD'].includes(route.request().method());
    if (readOnly && (url.origin === origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname))) return route.fallback();
    return route.abort();
  });
  if (offerFixture) await page.route(origin + api + '/offers', route => route.fulfill({ json: offerFixture }));
  await page.route(stripeScript, route => route.fulfill({ contentType: 'application/javascript', body: stripeFixture }));
  if (mockApi) {
    await page.route(origin + api + '/checkout', route => {
      const request = route.request();
      submissions.push({ method: request.method(), body: request.postDataJSON() });
      return submissions.length === 1
        ? route.fulfill({ status: 503, json: { error: 'Checkout test outage. Please try again.' } })
        : route.fulfill({ status: 201, json: { token, publishableKey: 'pk_test_CertFixture', clientSecret: 'cs_test_CertFixture_secret_local' } });
    });
    await page.route(origin + api + '/enrolment', route => {
      confirmations.push({ method: route.request().method(), authorization: route.request().headers().authorization });
      return route.fulfill({ json: { state: 'paid', emailDelivery: 'pending' } });
    });
  }
  return { page, errors, submissions, confirmations };
}

async function closeNotice(page) {
  const notice = page.getByRole('button', { name: 'Got it', exact: true });
  await notice.waitFor({ state: 'visible', timeout: 2200 }).catch(() => {});
  if (await notice.isVisible()) await notice.click();
}

async function verifyLinks(page, route, paths) {
  const links = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  for (const expected of paths) assert(links.includes(expected), `${route} misses ${expected}`);
  const broken = await page.locator('main a[href^="#"]').evaluateAll(nodes => nodes.filter(link => {
    const hash = link.hash;
    return !hash || !document.getElementById(decodeURIComponent(hash.slice(1)));
  }).map(link => link.getAttribute('href')));
  assert.deepEqual(broken, [], `${route} broken local anchors`);
}

async function checkMenu(page, width) {
  const toggle = page.locator('.plot-menu-button');
  assert.equal(await toggle.isVisible(), width <= 768);
  if (width <= 768) {
    await toggle.press('Enter');
    assert.equal(await page.locator('#plot-main-navigation').getByRole('link', { name: 'Certification', exact: true }).isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  }
}

async function verifySampleLayout(page, width) {
  const samples = page.locator('.cert-cover-documents > .cert-cover-document');
  const builder = samples.filter({ has: page.locator('img[src*="certificate-builder-preview.webp"]') });
  const architect = samples.filter({ has: page.locator('img[src*="certificate-preview.webp"]') });
  assert.equal(await samples.count(), 2);
  assert.equal(await builder.count(), 1);
  assert.equal(await architect.count(), 1);
  assert.equal(await builder.evaluate(section => section.classList.contains('cert-cover-document-secondary')), true);
  assert.equal(await builder.isVisible(), width >= 768);
  assert.equal(await architect.isVisible(), true);
  assert.equal(await builder.locator('a[href="/certification/sample-certificate-builder.pdf"]').count() > 0, true);
  if (width >= 768) {
    const boxes = (await Promise.all([builder.boundingBox(), architect.boundingBox()])).sort((a, b) => a.x - b.x);
    assert(boxes[0].x + boxes[0].width <= boxes[1].x + 1, 'Certificate samples overlap horizontally.');
    assert(Math.max(boxes[0].y, boxes[1].y) < Math.min(boxes[0].y + boxes[0].height, boxes[1].y + boxes[1].height), 'Certificate samples are stacked rather than side by side.');
  }
}

async function capture(page, folder, exam, width, label = 'page') {
  await page.mouse.move(0, 0);
  if (label === 'page') await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: join(folder, `${exam}-${width}-${label}.png`), fullPage: label === 'page' });
}

async function verifyPayment({ page, submissions, confirmations }, exam, width, height, folder) {
  const form = page.locator('#cert-enrol-form');
  assert.equal(await form.count(), 1);
  await form.waitFor({ state: 'visible' });
  const name = form.locator('input[name="name"]');
  const email = form.locator('input[name="email"]');
  const terms = form.locator('input[name="acceptedTerms"]');
  const submit = form.locator('button[type="submit"]');
  for (const field of [name, email, terms]) assert.equal(await field.evaluate(input => input.required), true);
  assert.equal(await email.getAttribute('type'), 'email');
  assert.equal(await terms.getAttribute('type'), 'checkbox');
  assert.equal(await form.locator('a[href="/terms#certification"]').count(), 1);
  const dialog = page.getByRole('dialog', { name: 'Exam checkout' });
  await submit.click();
  assert.equal(await dialog.isVisible(), false);
  await name.fill('Candidate Fixture');
  await email.fill('not-an-email');
  await terms.check();
  await submit.click();
  assert.equal(await dialog.isVisible(), false);
  await email.fill('candidate@example.test');
  await terms.uncheck();
  await submit.click();
  assert.equal(await dialog.isVisible(), false);
  assert.equal(submissions.length, 0);

  await terms.check();
  await submit.press('Enter');
  await dialog.getByText('Checkout test outage. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cert-payment-title');
  const retry = dialog.getByRole('button', { name: 'Try again', exact: true });
  await retry.click();
  const simulated = dialog.getByRole('button', { name: 'Complete simulated payment', exact: true });
  await simulated.waitFor();
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true);
  const bounds = await dialog.boundingBox();
  assert(Math.abs(bounds.x + bounds.width / 2 - width / 2) <= 3, `${exam} x-centre at ${width}`);
  assert(Math.abs(bounds.y + bounds.height / 2 - height / 2) <= 3, `${exam} y-centre at ${width}`);
  const expected = { method: 'POST', body: { exam, name: 'Candidate Fixture', email: 'candidate@example.test', acceptedTerms: '2026-11-16-certification-r3' } };
  assert.deepEqual(submissions, [expected, expected]);
  await capture(page, folder, exam, width, 'modal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await submit.evaluate(node => node === document.activeElement), true);
  await submit.click();
  await simulated.waitFor();
  assert.equal(submissions.length, 2);
  await simulated.click();
  await dialog.getByText(/Payment confirmed.*one-time exam link/).waitFor();
  assert.deepEqual(confirmations, [{ method: 'GET', authorization: `Bearer ${token}` }]);
  await dialog.getByRole('button', { name: 'Close checkout', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await submit.evaluate(node => node === document.activeElement), true);
}

async function checkRoute(browser, origin, route, exam, width, height, folder, offerFixture) {
  const state = await setupPage(browser, origin, width, height, { offerFixture });
  const { page, errors } = state;
  try {
    const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const csp = response.headers()['content-security-policy'];
    assert(csp?.includes("frame-ancestors 'none'"), route);
    if (exam !== 'overview') assert.match(csp, /script-src 'self' https:\/\/js\.stripe\.com/);
    await closeNotice(page);
    assert.equal(await page.locator('main h1').count(), 1);
    const [documentWidth, viewportWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.equal(viewportWidth, width, route);
    assert(documentWidth <= width, `${route} overflows ${width}px viewport to ${documentWidth}px`);
    const images = await page.locator('main img:visible').all();
    assert(images.length, route + ' needs genuine imagery or interface evidence');
    for (const image of images) await image.evaluate(element => { element.loading = 'eager'; return element.decode(); });
    await checkMenu(page, width);
    if (exam === 'overview') {
      await verifyLinks(page, route, [`${cert}/builder`, `${cert}/workflow-architect`, `${cert}/sample-certificate.pdf`, `${cert}/sample-certificate-builder.pdf`, `${cert}/verify`, `${cert}/verify?id=PLOT-SAMPLE-BUILDER`]);
      await verifySampleLayout(page, width);
      const overview = page.locator('[data-cert-overview-status]');
      await overview.getByText(/Enrolment is open for both exams/i).waitFor();
      await page.locator('main a[href="#compare"]').first().click();
      assert.equal(new URL(page.url()).hash, '#compare');
    } else {
      await verifyLinks(page, route, [route + '/practice', `${cert}/attempt?exam=${exam}`, '/terms#certification']);
      await page.locator('#cert-enrol-form').waitFor();
    }
    await capture(page, folder, exam, width);
    if (exam !== 'overview') await verifyPayment(state, exam, width, height, folder);
    assert.deepEqual(errors, [], `${route} browser runtime/CSP errors`);
    console.log(`${exam} ${width}px: links, layout and ${exam === 'overview' ? 'availability' : 'mocked checkout'} passed.`);
  } finally {
    await page.close();
  }
}

async function verifyClosedAvailability(browser, origin) {
  const offerFixture = { builder: { available: false }, architect: { available: false } };
  const { page, errors } = await setupPage(browser, origin, 390, 844, { offerFixture, mockApi: false });
  try {
    await page.goto(origin + cert, { waitUntil: 'networkidle' });
    await page.getByText('Enrolment is currently closed. Practice tasks are available.', { exact: true }).waitFor();
    for (const slug of Object.values(exams)) {
      await page.goto(`${origin}${cert}/${slug}`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('#cert-offer-status').isVisible(), true);
      assert.equal(await page.locator('#cert-enrol-form').isVisible(), false);
    }
    assert.deepEqual(errors, []);
    console.log('Closed offer shows the notice and keeps both payment forms hidden.');
  } finally {
    await page.close();
  }
}

(async () => {
  const live = process.argv.includes('--live');
  const { origin, server } = live ? { origin: 'https://plotstudio.pro' } : await startLocal();
  const folder = join(__dirname, process.argv.find(value => value.startsWith('--shots='))?.slice(8) || `certification-refresh-${live ? 'live' : 'local'}`);
  let browser;
  try {
    const availability = await fetch(origin + api + '/offers');
    assert.equal(availability.status, 200);
    const actual = await availability.json();
    for (const [exam, amount] of [['builder', 8000], ['architect', 15000]]) {
      assert.equal(typeof actual[exam]?.available, 'boolean');
      assert.equal(actual[exam]?.amount, amount);
    }
    console.log(`${live ? 'Live' : 'Local'} offer state: ${JSON.stringify(actual)}`);
    const offerFixture = Object.values(actual).every(value => value.available) ? null : {
      builder: { ...actual.builder, available: true }, architect: { ...actual.architect, available: true },
    };
    await mkdir(folder, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
    for (const [width, height] of sizes) {
      for (const [exam, route] of routes) await checkRoute(browser, origin, route, exam, width, height, folder, offerFixture);
    }
    await verifyClosedAvailability(browser, origin);
    for (const url of [`${cert}/builder/practice`, `${cert}/workflow-architect/practice`, `${cert}/verify`, `${cert}/attempt`, '/terms']) {
      assert.equal((await fetch(origin + url)).status, 200, url);
    }
    for (const [suffix, id, exam] of [['', 'PLOT-SAMPLE', 'architect'], ['-builder', 'PLOT-SAMPLE-BUILDER', 'builder']]) {
      const sample = await fetch(`${origin}${cert}/sample-certificate${suffix}.pdf`);
      assert.equal(sample.status, 200);
      assert.match(sample.headers.get('content-type'), /application\/pdf/);
      const verification = await fetch(`${origin}${api}/certificates/${id}`);
      assert.equal(verification.status, 200);
      const data = await verification.json();
      assert.equal(data.exam, exam);
      assert.equal(data.id, id);
      assert.equal(data.sample, true);
    }
    console.log('All certification pages passed with intercepted checkout and Stripe. No payment sent.');
  } finally {
    await browser?.close();
    server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
