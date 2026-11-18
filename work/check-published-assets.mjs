import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import { compileGraph, createStarterGraph } from '../outputs/plot-studio/logic.mjs';
import { createStarterProject, renderDocument } from '../outputs/plot-studio/project.mjs';
import { ensurePublishedToolchain, packPublishedDocument } from '../outputs/plot-studio/published-assets.mjs';
import { readPublicationDocument, unpackPublicationPacket } from '../outputs/plot-studio/publication-packet.mjs';

ensurePublishedToolchain();
const site = createStarterProject();
site.graph = createStarterGraph(site);
site.settings.customCss = `
  /* CSS private build comment */
  body { --release-ink: rgb(41, 52, 63); }
  .ps-hero-copy { color: var(--release-ink); }
`;
site.settings.customJs = `
  // private custom JS comment
  document.addEventListener('DOMContentLoaded', () => {
    const unpublishedBindingIdentifier = 'Źródło — £';
    const tagInString = String.raw\`</script><meta id="string-fixture">\`;
    document.querySelector('[data-block-id=block-demo-action]').click();
    const measured = {
      message: unpublishedBindingIdentifier,
      caption: document.querySelector('[data-block-id=block-demo-caption]').textContent,
      tagInString,
      color: getComputedStyle(document.querySelector('.ps-hero-copy')).color
    };
    parent.postMessage(measured, '*');
  });
  //# sourceMappingURL=private-build.map
`;
const { code, diagnostics } = compileGraph(site.graph, site);
assert.equal(diagnostics.length, 0);
const html = renderDocument(site.pages[0], site, code, {
  headHtml: '<style>@import url(https://no-build-network.invalid/site.css);</style>',
  bodyHtml: '<!-- HTML private build comment -->',
});
const packed = await packPublishedDocument(html, { version: 'version-1', page: 'home' });
assert.ok(packed instanceof Uint8Array);
assert.doesNotMatch(Buffer.from(packed).toString('latin1'), /<html|Lindenbank House|private build|sourceMappingURL/);
const { document: decoded } = readPublicationDocument(gunzipSync(unpackPublicationPacket(packed)));
const script = /<script src="data:text\/javascript;charset=utf-8,([^"]+)"><\/script>/.exec(decoded);
assert.ok(script);
const shippedCode = decodeURIComponent(script[1]);
assert.match(shippedCode, /<\/script><meta id="string-fixture">/);
assert.doesNotMatch(shippedCode, /unpublishedBindingIdentifier|private custom JS|sourceMappingURL/);
assert.doesNotMatch(decoded, /HTML private build comment/);
assert.doesNotMatch(decoded, /data:text\/javascript;base64|<\/script><meta id="string-fixture">/);
assert.match(decoded, /no-build-network\.invalid\/site\.css/);
assert.match(decoded, /data-page-link="page-rooms"/);
assert.ok(packed.byteLength < Buffer.byteLength(html));
await assert.rejects(packPublishedDocument(html.replace(/<\/body>/, '<script>const =</script></body>')), error => error.status === 422);
assert.equal(await packPublishedDocument('different content', { version: 'version-1', page: 'home' }), packed);
assert.notEqual(await packPublishedDocument(html.replace('<title>Home', '<title>New'), { version: 'version-2', page: 'home' }), packed);

const started = performance.now();
for (let i = 0; i < 20; i++) {
  const page = site.pages[i % site.pages.length];
  await packPublishedDocument(renderDocument(page, site, code), { version: 'version-2', page: page.id + i });
}
console.log(`Packed 20 starter pages in ${Math.ceil(performance.now() - started)} ms. HTML ${Buffer.byteLength(html)} → ${Buffer.byteLength(decoded)} bytes before packing.`);

const browser = process.env.PLOT_EXAM_BROWSER;
if (browser) {
  const resultFixture = '<!doctype html><meta charset="utf-8"><pre id="result"></pre><iframe sandbox="allow-scripts allow-forms allow-popups"></iframe><script>window.addEventListener("message", e => { if(e.source === document.querySelector("iframe").contentWindow) document.querySelector("#result").textContent = JSON.stringify(e.data) }); document.querySelector("iframe").srcdoc = ' + JSON.stringify(decoded).replaceAll('<', '\\u003c') + ';</script>';
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; frame-src 'self';" });
    res.end(resultFixture);
  });
  const profile = await mkdtemp(join(tmpdir(), 'plot-published-browser-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const args = ['--headless', '--disable-background-networking', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3500', '--user-data-dir=' + profile, '--dump-dom', 'http://127.0.0.1:' + server.address().port];
    if (process.platform === 'linux') args.unshift('--no-sandbox');
    const child = spawn(browser, args, { timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let markup = '';
    child.stdout.setEncoding('utf8').on('data', data => { markup += data; });
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', status => status === 0 ? resolve() : reject(new Error(`Browser exited with status ${status}.`)));
    });
    const serialized = /<pre id="result">([^<]+)<\/pre>/.exec(markup)?.[1] ?? 'null';
    const observed = JSON.parse(serialized.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
    assert.ok(observed, markup.slice(0, 300));
    assert.equal(observed.message, 'Źródło — £');
    assert.equal(observed.tagInString, '</script><meta id="string-fixture">');
    assert.equal(observed.color, 'rgb(41, 52, 63)');
    assert.equal(observed.caption, 'The connection works. Blueprint set this text.');
    console.log('Chromium sandbox rendered UTF-8, evaluated optimized CSS and ran the mangled Blueprint interaction.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
