const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = 'https://plotstudio.pro';
const local = !process.argv.includes('--live');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  const pages = { '/': 'index.html', '/certification': 'certification.html', '/certification/builder': 'exam-builder.html', '/certification/workflow-architect': 'exam-workflow-architect.html', '/certification/builder/practice': 'exam-builder-practice.html', '/certification/workflow-architect/practice': 'exam-architect-practice.html' };
  const files = new Set(['public.css', 'certification.css', 'certification-practice.css']);
  const root = path.resolve(__dirname, '../outputs/plot-studio/public');
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 920 }, reducedMotion: 'reduce' });
      if (local) await page.route(url => url.origin === origin && (Object.hasOwn(pages, url.pathname) || files.has(url.pathname.split('/').at(-1))), route => {
        const url = new URL(route.request().url());
        const file = pages[url.pathname] ?? url.pathname.split('/').at(-1);
        return route.fulfill({ path: path.join(root, file), contentType: file.endsWith('.css') ? 'text/css' : 'text/html' });
      });
      for (const [route, file] of Object.entries(pages)) {
        if (local && route.endsWith('/practice')) continue;
        await page.goto(origin + route);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${route} at ${width}`);
        if (route === '/certification') {
          assert.match(await page.locator('.cert-comparison-table').innerText(), /2 worked tasks/);
          await page.locator('.cert-cover-document img').evaluate(img => img.decode());
        }
        if (route === '/certification/builder') assert.equal(await page.getByRole('link', { name: 'Read two actual exam tasks' }).count(), 1);
        if (route === '/certification/workflow-architect') assert.equal(await page.getByRole('link', { name: 'Read four actual exam tasks' }).count(), 1);
        if (route.endsWith('/practice')) assert.equal(await page.locator('article.cert-practice-task').count(), route.includes('/builder/') ? 2 : 4);
        if ((width === 390 || width === 1440) && !route.endsWith('/practice')) {
          await page.getByRole('button', { name: 'Got it' }).click({ timeout: 800 }).catch(() => {});
          if (route === '/') await page.locator('#overview').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(__dirname, `plot-editorial-${file.replace('.html', '')}-${width}.png`) });
        }
      }
      await page.close();
    }
    const page = await browser.newPage();
    const response = await page.request.get(origin + '/certification/sample-certificate.pdf');
    assert.match(response.headers()['content-type'], /application\/pdf/);
    await page.goto(origin + '/certification/verify?id=PLOT-SAMPLE');
    await page.getByRole('heading', { name: 'Verified sample', exact: true }).waitFor();
    console.log(`${local ? 'Local' : 'Live'} certification, homepage, and certificate preview/verifier checks passed.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
