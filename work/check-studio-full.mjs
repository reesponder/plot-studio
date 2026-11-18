import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const testPassword = randomBytes(25).toString('base64url');
const salt = randomBytes(16);
const digest = scryptSync(testPassword, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const server = spawn(process.execPath, ['outputs/plot-studio/server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: {
  ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, STUDIO_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString('base64url')}$${digest.toString('base64url')}`,
  STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
} });
const profile = await mkdtemp(path.join(os.tmpdir(), 'plot-full-qa-'));
const downloadDir = path.join(profile, 'downloads');
await mkdir(downloadDir);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
try {
  let browserPort;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browserPort = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); break; } catch { await wait(100); }
  }
  assert.ok(browserPort);
  const pages = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json();
  ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let messageId = 0;
  const calls = new Map();
  const errors = [];
  const contexts = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.executionContextCreated') {
      const context = message.params.context;
      if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, { contextId: context.id, sessionId: message.sessionId });
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      for (const [id, context] of contexts) {
        if (context.contextId === message.params.executionContextId && context.sessionId === message.sessionId) contexts.delete(id);
      }
    }
    if (message.method === 'Target.attachedToTarget') {
      const sessionId = message.params.sessionId;
      void send('Runtime.enable', {}, sessionId).catch(() => {});
      void send('Page.enable', {}, sessionId).catch(() => {});
    }
    if (calls.has(message.id)) { calls.get(message.id)(message); calls.delete(message.id); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++messageId;
    calls.set(id, ({ result, error }) => error ? reject(Error(`${method}: ${error.message}`)) : resolve(result));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  async function evaluate(expression, context = {}) {
    const response = await send('Runtime.evaluate', { expression, contextId: context.contextId, returnByValue: true, awaitPromise: true }, context.sessionId);
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  }
  async function until(get) {
    let lastError;
    for (let i = 0; i < 50; i++) {
      try { const result = await get(); if (result) return result; } catch (error) { lastError = error; }
      await wait(110);
    }
    throw Error(`Timeout${lastError ? `: ${lastError.message}` : `: ${String(get).slice(0, 220)}`}`);
  }
  const el = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
  const click = (selector, contextId) => evaluate(`${el(selector)}.click()`, contextId);
  const setField = (selector, value, event = 'change') => evaluate(`(() => {const field=${el(selector)};field.value=${JSON.stringify(value)};field.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
  const metrics = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const screenshot = async (name) => {
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`${name}.png`, import.meta.url), Buffer.from(screenshot.data, 'base64'));
  };
  const point = (selector) => evaluate(`(() => {const node=${el(selector)};node.scrollIntoView({block:'nearest',inline:'nearest'});const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const mouse = (type, point, button = 'none') => send('Input.dispatchMouseEvent', { type, ...point, button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: button === 'none' ? 0 : 1 });

  const frameContext = (frameName, selector) => until(async () => {
    const tree = await send('Page.getFrameTree');
    for (const [frameId, context] of contexts) {
      if (frameId === tree.frameTree.frame.id) continue;
      try {
        const { backendNodeId } = await send('DOM.getFrameOwner', { frameId });
        const frameElement = await send('DOM.describeNode', { backendNodeId });
        if (frameElement.node.attributes?.includes(frameName) && await evaluate(`Boolean(${el(selector)}) && document.readyState !== 'loading'`, context)) return context;
      } catch {}
    }
  });

  const zipEntries = async (name) => {
    const zip = await readFile(path.join(downloadDir, name));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    const entries = new Map();
    for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
      const compression = zip.readUInt16LE(offset + 8);
      assert.equal(compression, 0);
      const size = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const extraLength = zip.readUInt16LE(offset + 28);
      const fileName = zip.toString('utf8', offset + 30, offset + 30 + nameLength);
      const dataStart = offset + 30 + nameLength + extraLength;
      entries.set(fileName, zip.subarray(dataStart, dataStart + size));
      offset = dataStart + size;
    }
    return entries;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await metrics(1440, 944);
  await send('Page.navigate', { url: `${origin}/#studio-login` });
  await until(() => evaluate(`Boolean(${el('input[type=password]')})`));
  await evaluate(`(() => {const field=${el('input[type=password]')};field.value=${JSON.stringify(testPassword)};field.form.requestSubmit();})()`);
  await until(() => evaluate(`location.pathname === '/studio/' && Boolean(${el('#design-frame')}.getAttribute('srcdoc'))`));
  await screenshot('studio-qa-desktop');
  console.log('Desktop login and design workspace passed.');
  await click('.app-actions [data-command=preview]');
  await until(() => evaluate(`Boolean(${el('#preview-dialog[open]')})`));
  const previewContext = await frameContext('preview-frame', '[data-block-id=block-demo-action]');
  await click('[data-block-id=block-demo-action]', previewContext);
  await until(() => evaluate(`${el('[data-block-id=block-demo-caption]')}.textContent.includes('Blueprint set this text')`, previewContext));
  await click('[data-command=close-preview]');
  console.log('Seeded live preview click passed.');
  await click('[data-mode=logic]');
  assert.equal(await evaluate("document.querySelectorAll('.bp-wire:not(.bp-wire-preview)').length"), 1);
  await click('.bp-button-main');
  await setField('.bp-picker-search', 'toast', 'input');
  await click('[data-node-type=notify]');
  await setField('.bp-config textarea', 'QA live notification', 'input');
  assert.equal(await evaluate("document.querySelectorAll('.bp-node').length"), 3);
  const source = await point('[data-node-id=logic-demo-result][data-port=next]');
  const target = await point('.bp-node:last-of-type .bp-port-in');
  await mouse('mousePressed', source, 'left');
  await mouse('mouseMoved', { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 });
  await mouse('mouseMoved', target);
  await mouse('mouseReleased', target, 'left');
  assert.equal(await evaluate("document.querySelectorAll('.bp-wire:not(.bp-wire-preview)').length"), 2);
  assert.equal(await evaluate(`${el('.bp-hint')}.textContent`), 'Nodes connected.');
  await click('[data-mode=code]');
  const scriptFile = await evaluate(`Array.from(document.querySelectorAll('#code-files button')).find(button => button.textContent.includes('script.js'))?.outerHTML`);
  assert.ok(scriptFile);
  await evaluate(`Array.from(document.querySelectorAll('#code-files button')).find(button => button.textContent.includes('script.js')).click()`);
  assert.ok((await evaluate(`${el('#code-source')}.textContent`)).includes('QA live notification'));
  await click('.app-actions [data-command=export]');
  const zipName = await until(async () => (await readdir(downloadDir)).find((name) => name.endsWith('.zip')));
  const entries = await zipEntries(zipName);
  for (const file of ['index.html', 'styles.css', 'script.js']) assert.ok(entries.has(file), file);
  assert.ok(entries.get('script.js').toString().includes('QA live notification'));
  assert.ok([...entries.keys()].some((name) => name.startsWith('assets/')));
  console.log(`Real Blueprint wiring and ${entries.size}-entry ZIP passed.`);

  for (const width of [768, 390, 320]) {
    await metrics(width, 850, true);
    for (const mode of ['design', 'logic', 'data', 'code']) {
      await click(`[data-mode=${mode}]`);
      await wait(140);
      const layout = await evaluate(`({width: document.documentElement.scrollWidth, viewport: innerWidth, headerWidth: ${el('.appbar')}.scrollWidth, actionsRight: ${el('.app-actions')}.getBoundingClientRect().right})`);
      assert.equal(layout.width, width, `${width}px ${mode}: ${JSON.stringify(layout)}`);
      assert.ok(layout.actionsRight <= width + 1);
      if (width === 390) await screenshot(`studio-qa-phone-${mode}`);
    }
  }
  console.log('Passed responsive 768px, 390px and 320px in all four modes.');

  await metrics(1440, 944);
  await click('#project-trigger');
  await click('[data-project-action=database-demo]');
  await click('#edit-confirm');
  await until(() => evaluate(`Boolean(${el('[data-node-id=inbox-transform]')})`));
  assert.equal(await evaluate("document.querySelectorAll('.bp-wire-data').length"), 2);
  await screenshot('studio-qa-database-graph');
  await click('.app-actions [data-command=preview]');
  const dbPreview = await frameContext('preview-frame', 'form[data-block-id=inbox-form]');
  await evaluate(`(() => {const form=${el('form[data-block-id=inbox-form]')};form.elements.name.value='Browser QA';form.elements.email.value='browser-qa@example.com';form.elements.message.value='Full-stack visual editor form submission';form.requestSubmit();})()`, dbPreview);
  await until(() => evaluate(`${el('[data-block-id=inbox-status]')}.textContent.includes('Your message was saved')`, dbPreview));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('99host.plot-studio.project.v1')).data.tables[0].rows.some(row=>row['inbox-email']==='browser-qa@example.com')`), false);
  await until(() => evaluate(`!${el('#preview-apply')}.hidden`));
  await click('#preview-apply');
  await click('[data-command=close-preview]');
  await click('[data-mode=data]');
  await until(() => evaluate(`Boolean(${el('#data-editor')}.innerText.includes('Browser QA')) || Array.from(document.querySelectorAll('#data-editor input')).some(input=>input.value==='Browser QA')`));
  await until(() => evaluate(`JSON.parse(localStorage.getItem('99host.plot-studio.project.v1')).data.tables[0].rows.some(row=>row['inbox-email']==='browser-qa@example.com')`));
  await screenshot('studio-qa-database-rows');
  await click('.app-actions [data-command=export]');
  assert.equal(await evaluate(`${el('#export-rows')}.checked`), false);
  await click('#export-form button[value=download]');
  const dbZip = await until(async () => (await readdir(downloadDir)).find((name) => name.endsWith('.zip') && name !== zipName));
  const dbEntries = await zipEntries(dbZip);
  for (const file of ['index.html', 'script.js', 'runtime.py', 'DATABASE.md']) assert.ok([...dbEntries.keys()].some((name) => name.split('/').at(-1) === file), `${file}: ${[...dbEntries.keys()]}`);
  assert.ok([...dbEntries].find(([name]) => name.split('/').at(-1) === 'script.js')[1].toString().includes('inbox-transform'));
  assert.ok(![...dbEntries.values()].some((file) => file.includes('browser-qa@example.com')));
  assert.deepEqual(errors, []);
  console.log(`Actual form + database demo passed. Preview changes were isolated until Apply. SQLite ZIP has ${dbEntries.size} entries and defaults to excluding form submissions.`);
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
}
