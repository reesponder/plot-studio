import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { executeDataQuery } from './data.mjs';

const origin = 'http://assessment.invalid';
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; object-src 'none'";
const keys = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

function connect(browser, profile) {
  const child = spawn(browser, ['--headless', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-features=HttpsUpgrades',
    '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disk-cache-size=1048576', '--media-cache-size=1048576', '--mute-audio',
    '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  let raw = '';
  let alive = true;
  child.stdio[3].on('error', () => {});
  function fail() {
    alive = false;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('The browser worker process ended.'));
    }
    pending.clear();
  }
  child.on('error', fail);
  child.on('close', fail);
  child.stdio[4].setEncoding('utf8');
  child.stdio[4].on('data', chunk => {
    raw += chunk;
    if (raw.length > 8 * 1024 * 1024) return child.kill();
    let end;
    while ((end = raw.indexOf('\0')) >= 0) {
      const line = raw.slice(0, end);
      raw = raw.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { child.kill(); return; }
      const { id, sessionId, method, params, result, error } = message;
      if (id && pending.has(id)) {
        const entry = pending.get(id);
        pending.delete(id);
        clearTimeout(entry.timer);
        if (error) entry.reject(new Error(error.message));
        else entry.resolve(result);
      } else if (method) listeners.get(sessionId)?.(method, params);
    }
  });
  function send(method, params = {}, sessionId) {
    if (!alive) return Promise.reject(new Error('The browser is no longer available.'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Browser command timed out.'));
      }, 3200);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  return { send, listeners, stop: () => child.kill(), alive: () => alive };
}

function copyRows(tables) {
  return Object.fromEntries(tables.map(table => [table.id, structuredClone(table.rows.slice(0, 30))]));
}

function workshopReply(request, input) {
  if (request.method !== 'POST') return { status: 405, data: { error: { message: 'Method not allowed.' } } };
  const seats = typeof input?.seats === 'number' || typeof input?.seats === 'string' ? Number(input.seats) : NaN;
  if (typeof input?.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email) && Number.isInteger(seats) && seats >= 1 && seats <= 6) {
    return { status: 201, data: { id: 'assessment-browser-request', status: 'new' } };
  }
  return { status: 422, data: { error: { code: 'INVALID_INPUT', message: 'Give a valid email and 1 to 6 seats.' } } };
}

function onRequest(send, files, probe, data, requests) {
  const fulfill = (requestId, responseCode, body, type = 'text/plain; charset=utf-8') => send('Fetch.fulfillRequest', {
    requestId, responseCode, body: Buffer.from(body).toString('base64'), responseHeaders: [
      { name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' },
      { name: 'Content-Security-Policy', value: csp },
    ],
  });
  return (event, params) => {
    if (event !== 'Fetch.requestPaused') return;
    const { requestId, request } = params;
    const url = new URL(request.url);
    if (url.origin !== origin) {
      void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      return;
    }
    const path = url.pathname;
    if (path === '/api/data/query' || probe.backend === 'workshop' && path === '/api/workshop-requests') {
      let input, response;
      try { input = JSON.parse(request.postData || 'null'); } catch { input = null; }
      if (path === '/api/workshop-requests') response = workshopReply(request, input);
      else if (request.method !== 'POST') response = { status: 405, data: { error: { message: 'Method not allowed.' } } };
      else if (requests.length >= 60) response = { status: 429, data: { error: { message: 'Too many requests.' } } };
      else if (probe.denyCreate && input?.operation === 'create') response = { status: 403, data: { error: { code: 'FORBIDDEN', message: 'Create permission denied.' } } };
      else {
        try { response = { status: 200, data: { result: executeDataQuery(data, input) } }; }
        catch (error) { response = { status: error.status || 422, data: { error: { code: error.code || 'INVALID_DATA', message: 'The requested operation failed.' } } }; }
      }
      if (requests.length < 60) requests.push({ method: request.method, path, operation: input?.operation, table: input?.table,
        data: path === '/api/data/query' ? input?.data : input, ok: response.status < 400, status: response.status });
      void fulfill(requestId, response.status, JSON.stringify(response.data), 'application/json; charset=utf-8').catch(() => {});
      return;
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (['GET', 'HEAD'].includes(request.method) && Object.hasOwn(files, name)) {
      const contents = request.method === 'HEAD' ? '' : files[name];
      void fulfill(requestId, 200, contents, types[name.split('.').at(-1)]).catch(() => {});
    } else void fulfill(requestId, 404, 'Not found').catch(() => {});
  };
}

async function probeBrowser(browser, files, tables, probe) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  let sessionId;
  const snapshots = Object.create(null);
  const data = { tables: structuredClone(tables) };
  const requests = [];
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    ({ sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true }));
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) return undefined;
      return result.result?.value;
    };
    const element = (selector, fn, ...extra) => evaluate(`(${fn})(${JSON.stringify(selector)},${JSON.stringify(extra)})`);
    const waitForPage = async path => {
      const ready = `location.origin === ${JSON.stringify(origin)} && location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`;
      for (let n = 0; n < 45; n++) {
        if (await evaluate(ready).catch(() => false)) return;
        await wait(35);
      }
    };
    browser.listeners.set(sessionId, onRequest(send, files, probe, data, requests));
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await send('Page.enable', {});
    const width = probe.width ?? 1440;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    const page = probe.page?.replace(/\.html$/, '') || 'index';
    const initialPath = '/' + page + '.html';
    await send('Page.navigate', { url: origin + initialPath });
    await waitForPage(initialPath);
    for (const step of probe.steps) {
      if (step.type === 'wait') await wait(Math.min(Math.max(0, step.ms ?? 80), 1000));
      else if (step.type === 'navigate') {
        const path = '/' + String(step.page || step.path || 'index').replace(/^\//, '').replace(/\.html$/, '') + '.html';
        if (!/^\/[a-z0-9-]+\.html$/.test(path)) throw new Error('Invalid assessment navigation.');
        await send('Page.navigate', { url: origin + path });
        await waitForPage(path);
      } else if (step.type === 'fill' || step.type === 'select') {
        await element(step.selector, (selector, [value]) => {
          const el = document.querySelector(selector);
          if (!(el instanceof HTMLElement) || !('value' in el) || el.disabled || el.readOnly) return;
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, step.value);
      } else if (step.type === 'click') {
        const point = await element(step.selector, selector => {
          const el = document.querySelector(selector);
          if (!el || el.disabled || !el.getClientRects().length) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const box = el.getBoundingClientRect();
          const link = el.closest('a[href]');
          const next = link && !link.target ? new URL(link.href) : null;
          const path = next?.origin === location.origin && next.pathname !== location.pathname ? next.pathname : null;
          return { x: box.x + box.width / 2, y: box.y + box.height / 2, path };
        });
        if (point) {
          const { x, y, path } = point;
          await send('Input.dispatchMouseEvent', { x, y, type: 'mousePressed', button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { x, y, type: 'mouseReleased', button: 'left', clickCount: 1 });
          if (path) await waitForPage(path);
          else await wait(45);
        }
      } else if (step.type === 'press') {
        if (step.selector) await element(step.selector, selector => document.querySelector(selector)?.focus());
        const key = step.key === 'Space' ? ' ' : step.key === 'Shift+Tab' ? 'Tab' : step.key;
        const modifiers = step.key === 'Shift+Tab' ? 8 : 0;
        const windowsVirtualKeyCode = keys[key] ?? key?.toUpperCase().charCodeAt(0) ?? 0;
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers, windowsVirtualKeyCode,
          ...((key?.length === 1 || key === 'Enter') ? { text: key === 'Enter' ? '\r' : key } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, windowsVirtualKeyCode });
      } else if (step.type === 'submit') {
        await element(step.selector, (selector, [count]) => {
          const form = document.querySelector(selector);
          if (!(form instanceof HTMLFormElement)) return;
          for (let n = 0; n < count; n++) form.requestSubmit();
        }, Math.min(step.count || 1, 3));
      } else if (step.type === 'snapshot') {
        const snapshot = await evaluate(`(${function snapshot(selectors) {
          const observations = Object.entries(selectors).map(([key, selector]) => {
            const el = document.querySelector(selector);
            if (!el) return [key, { found: false }];
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const visible = style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 &&
              (typeof el.checkVisibility !== 'function' || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
            return [key, { found: true, visible, text: String(el.innerText ?? el.textContent ?? '').trim().slice(0, 3000),
              value: 'value' in el ? el.value : null, valid: el.validity?.valid ?? null, focused: document.activeElement === el,
              gridColumns: style.gridTemplateColumns, href: el.getAttribute('href'), checked: 'checked' in el ? el.checked : null,
              width: rect.width, height: rect.height }];
          });
          return { selectors: Object.fromEntries(observations), width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            path: location.pathname, hash: location.hash };
        }})(${JSON.stringify(step.selectors || {})})`).catch(() => null);
        snapshots[step.key] = { ...(snapshot || { selectors: {} }), rows: copyRows(data.tables), requests: structuredClone(requests) };
      }
    }
    return { snapshots, rows: copyRows(data.tables), requests };
  } finally {
    if (sessionId) browser.listeners.delete(sessionId);
    await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 32 * 1024 * 1024) throw new Error('Assessment data is too large.');
}
const { profile, files, tables, probes } = JSON.parse(raw);
const browser = connect(process.argv[2], profile);
try {
  await browser.send('Browser.getVersion');
  const assessments = Object.create(null);
  for (const probe of probes) assessments[probe.id] = await probeBrowser(browser, files, tables, probe);
  process.stdout.write(JSON.stringify(assessments));
} finally {
  browser.stop();
}
