const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = 'https://plotstudio.pro';
const root = path.resolve(__dirname, '../outputs/plot-studio/public');
const live = process.argv.includes('--live');
const exams = [
  ['builder', 'builder', 'exam-builder.html'],
  ['architect', 'workflow-architect', 'exam-workflow-architect.html'],
];
const assets = new Map([
  ['certification.css', 'text/css'],
  ['site-chrome.css', 'text/css'],
  ['site-chrome.mjs', 'text/javascript'],
  ['certification.mjs', 'text/javascript'],
  ['cookie-notice.css', 'text/css'],
  ['cookie-notice.js', 'text/javascript'],
]);
const mockStripe = 'window.Stripe = () => ({ createEmbeddedCheckoutPage: async ({fetchClientSecret}) => { await fetchClientSecret(); return { mount: target => { target.textContent = "Mock embedded Stripe checkout mounted"; }, destroy() {} }; } });';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  try {
    for (const width of [390, 1440]) {
      for (const [exam, slug, file] of exams) {
        const mobile = width === 390;
        const bodyHeight = mobile ? 844 : 1000;
        const page = await browser.newPage({ viewport: { width, height: bodyHeight }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
        page.setDefaultTimeout(6000);
        const failures = [];
        page.on('pageerror', error => failures.push(error.message));
        if (!live) {
          await page.route(url => url.origin === origin && assets.has(url.pathname.split('/').at(-1)), route => {
            const name = new URL(route.request().url()).pathname.split('/').at(-1);
            return route.fulfill({ path: path.join(root, name), contentType: assets.get(name) });
          });
          await page.route(origin + '/certification/' + slug, route => route.fulfill({ path: path.join(root, file), contentType: 'text/html' }));
        }
        await page.route('https://js.stripe.com/**', route => {
          assert.match(route.request().url(), /\/stripe\.js$/);
          return route.fulfill({ contentType: 'application/javascript', body: mockStripe });
        });
        let sent;
        let submissions = 0;
        await page.route(origin + '/certification/api/**', route => {
          const request = route.request();
          const endpoint = new URL(request.url()).pathname.split('/').at(-1);
          if (endpoint === 'offers') return route.fulfill({ json: { [exam]: { available: true } } });
          if (endpoint === 'checkout') {
            assert.equal(request.method(), 'POST');
            submissions += 1;
            sent = request.postDataJSON();
            return route.fulfill({ json: { token: 'checkout-browser-fixture', publishableKey: 'fixture', clientSecret: 'fixture' } });
          }
          throw new Error('Unhandled mocked API route ' + endpoint);
        });

        const response = await page.goto(origin + '/certification/' + slug, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        const notice = page.getByRole('button', { name: 'Got it' });
        await notice.waitFor({ state: 'visible', timeout: 1800 }).catch(() => {});
        if (await notice.isVisible()) await notice.click();
        const form = page.locator('#cert-enrol-form');
        await form.waitFor({ state: 'visible' });
        const layout = await page.evaluate(() => {
          const title = document.querySelector('.cert-detail-title h1');
          const card = document.querySelector('#enrolment').getBoundingClientRect();
          const heading = title.getBoundingClientRect();
          const titleGroup = document.querySelector('.cert-detail-title').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            titleX: heading.left + heading.width / 2,
            titleAlign: getComputedStyle(title).textAlign,
            titleBottom: titleGroup.bottom,
            cardTop: card.top,
            cardX: card.left + card.width / 2,
            cardWidth: card.width,
            viewportCenter: innerWidth / 2,
          };
        });
        assert.equal(layout.viewportCenter * 2, width, slug + ' CSS viewport at ' + width);
        assert.equal(layout.overflow, 0, slug + ' horizontal overflow at ' + width);
        assert(Math.abs(layout.titleX - layout.viewportCenter) <= 3 && layout.titleAlign === 'center', 'Heading is centered. ' + JSON.stringify(layout));
        assert(Math.abs(layout.cardX - layout.viewportCenter) <= 3, 'Envelope is centered. ' + JSON.stringify(layout));
        assert(layout.cardTop >= layout.titleBottom, 'Envelope is stacked below the heading. ' + JSON.stringify(layout));
        assert(layout.cardWidth >= (mobile ? 300 : 640), 'Envelope has room for the form. ' + JSON.stringify(layout));
        await page.screenshot({ path: path.join(__dirname, 'exam-envelope-' + slug + '-' + width + '.png') });
        await page.locator('#enrolment').screenshot({ path: path.join(__dirname, 'exam-envelope-card-' + slug + '-' + width + '.png') });

        const name = form.locator('input[name=name]');
        const email = form.locator('input[name=email]');
        const consent = form.locator('input[name=acceptedTerms]');
        const submit = form.locator('button[type=submit]');
        await submit.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(__dirname, 'exam-envelope-form-' + slug + '-' + width + '.png') });
        for (const field of [name, email, consent]) assert(await field.evaluate(node => node.required), 'Missing required input at ' + slug);
        assert.equal(await email.getAttribute('type'), 'email');
        assert.equal(await consent.getAttribute('type'), 'checkbox');
        await submit.click();
        assert.equal(submissions, 0, 'Empty form hit checkout');
        await name.fill('Sample Candidate');
        await email.fill('invalid');
        await consent.check();
        await submit.click();
        assert.equal(submissions, 0, 'Invalid email hit checkout');
        await email.fill('candidate@example.test');
        await consent.uncheck();
        await submit.click();
        assert.equal(submissions, 0, 'Unaccepted consent hit checkout');
        await consent.check();
        await submit.click();

        const dialog = page.getByRole('dialog', { name: 'Exam checkout' });
        await dialog.getByText('Mock embedded Stripe checkout mounted').waitFor();
        assert(await dialog.evaluate(element => element.matches(':modal')));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'cert-payment-title', 'Dialog heading receives focus');
        const modalBox = await dialog.boundingBox();
        assert(Math.abs(modalBox.x + modalBox.width / 2 - width / 2) <= 3);
        assert(Math.abs(modalBox.y + modalBox.height / 2 - bodyHeight / 2) <= 3);
        assert.equal(submissions, 1);
        assert.equal(sent.exam, exam);
        assert.equal(sent.name, 'Sample Candidate');
        assert.equal(sent.email, 'candidate@example.test');
        assert.match(sent.acceptedTerms, /certification/);
        await dialog.getByRole('button', { name: 'Close checkout' }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(failures, []);
        console.log((live ? 'Live' : 'Local') + ' ' + slug + ' ' + width + ' px passed.');
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

