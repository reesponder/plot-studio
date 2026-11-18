import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { deserializeProject, pageFile, renderDocument } from '../outputs/plot-studio/project.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const templates = new URL('../outputs/plot-studio/public/media/design-templates/', import.meta.url);
const screenshots = new URL('./template-b-qa/', import.meta.url);
const slugs = ['relayboard', 'margin-notes', 'open-bench', 'spoke-works', 'mara-vale', 'harbour-api'];
const host = 'http://plot-template.test';
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
try {
  for (const slug of slugs) {
    const draft = deserializeProject(await readFile(new URL(slug + '.plot', templates), 'utf8'));
    for (const width of [1440, 390, 320]) {
      const browserPage = await browser.newPage({ viewport: { width, height: width > 900 ? 930 : 844 } });
      try {
        const documents = new Map(draft.pages.map(page => ['/' + pageFile(page), renderDocument(page, draft)]));
        await browserPage.route(host + '/**', route => {
          const pathname = new URL(route.request().url()).pathname;
          const body = documents.get(pathname);
          return route.fulfill({ status: body ? 200 : 404, contentType: 'text/html', body: body ?? '' });
        });
        for (const [index, page] of draft.pages.entries()) {
          const response = await browserPage.goto(host + '/' + pageFile(page), { waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200, slug + ' ' + page.slug);
          await browserPage.evaluate(() => document.fonts.ready);
          assert.equal(await browserPage.locator('main h1').count(), 1);
          const sanity = await browserPage.evaluate(async () => {
            const images = [...document.querySelectorAll('main img')];
            for (const image of images) image.loading = 'eager';
            await Promise.all(images.map(image => image.decode()));
            return {
              width: document.documentElement.scrollWidth,
              images: images.map(image => image.naturalWidth),
              brokenText: [...document.querySelectorAll('main h1, main h2')].filter(element => element.getBoundingClientRect().width < 68).map(element => element.textContent),
              links: [...document.querySelectorAll('a[href]')].map(link => new URL(link.href).pathname),
            };
          });
          assert.equal(sanity.width, width, slug + ' / ' + page.slug + ' at ' + width + ' px');
          assert(sanity.images.every(width => width > 0), 'Image failed to decode in ' + slug);
          assert(!sanity.brokenText.length, 'Heading width too small in ' + slug);
          assert(sanity.links.every(path => documents.has(path)), 'Invalid internal link in ' + slug);
          if (index === 0 && width !== 320) {
            const png = await browserPage.screenshot({ animations: 'disabled' });
            const { writeFile } = await import('node:fs/promises');
            await writeFile(new URL(slug + '-' + width + '.png', screenshots), png);
          }
        }
        if (width < 900) {
          const menu = browserPage.locator('.ps-nav-mobile');
          await menu.locator('summary').click();
          assert(await menu.getAttribute('open') !== null);
          const next = menu.getByRole('link', { name: draft.pages[1].name, exact: true });
          const contrast = await next.evaluate(link => {
            const luminance = colour => {
              const rgb = colour.match(/[\d.]+/g).slice(0, 3).map(value => {
                const channel = Number(value) / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
              });
              return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
            };
            const weight = [luminance(getComputedStyle(link).color), luminance(getComputedStyle(link.closest('nav')).backgroundColor)].sort((a, b) => b - a);
            return (weight[0] + .05) / (weight[1] + .05);
          });
          assert(contrast >= 4.5, slug + ' Phone menu contrast ' + contrast);
          await next.click();
          assert(browserPage.url().endsWith('/' + pageFile(draft.pages[1])));
        }
      } finally {
        await browserPage.close();
      }
    }
    console.log(slug + ' 3 pages × 3 widths passed');
  }
} finally {
  await browser.close();
}

