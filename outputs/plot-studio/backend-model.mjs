const clone = value => JSON.parse(JSON.stringify(value));
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const packageId = /^[a-z][a-z0-9-]{0,79}$/;
const packageVersion = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const caseId = /^case-[a-zA-Z0-9-]{1,75}$/;
const pythonScriptId = /^[a-z][a-z0-9-]{0,63}$/;
const fieldPath = /^(?:\$|(?:\$\.)?[-_a-zA-Z0-9]+(?:\.[-_a-zA-Z0-9]+|\[\d{1,6}\])*)$/;
export const BACKEND_CASE_LIMIT = 30;
export const BACKEND_ASSERTION_LIMIT = 8;
export const BACKEND_PYTHON_SCRIPT_LIMIT = 30;
export const BACKEND_PYTHON_SOURCE_LIMIT = 32768;
export const BACKEND_PYTHON_TIMEOUT_MAX = 15;
const utf8 = new TextEncoder();

function normalizeTestCases(entries) {
  const cases = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries.slice(0, BACKEND_CASE_LIMIT) : []) {
    try {
      const test = backendTestCase(entry);
      if (!seen.has(test.id)) cases.push(test);
      seen.add(test.id);
    } catch {
      // A malformed fixture cannot prevent an older project from opening.
    }
  }
  return cases;
}

function normalizePackages(entries) {
  const seen = new Set();
  const packages = [];
  for (const entry of Array.isArray(entries) ? entries.slice(0, 32) : []) {
    if (!entry || typeof entry.id !== 'string' || !packageId.test(entry.id) ||
        typeof entry.version !== 'string' || !packageVersion.test(entry.version) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    packages.push({ id: entry.id, version: entry.version });
  }
  return packages;
}

export function backendPythonSourceSize(source) {
  return utf8.encode(source).length;
}

export function backendPythonScript(raw) {
  if (!raw || typeof raw.id !== 'string' || !pythonScriptId.test(raw.id)) throw new Error('Use a script ID with up to 64 lowercase letters, numbers and dashes.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 160 || [...name].length > 80) throw new Error('Enter a script name up to 80 characters.');
  if (typeof raw.source !== 'string' || !raw.source.trim()) throw new Error('Enter Python source code.');
  if (/[\u0000\uD800-\uDFFF]/u.test(raw.source)) throw new Error('Use valid UTF-8 Python source without null characters.');
  if (raw.source.length > BACKEND_PYTHON_SOURCE_LIMIT || backendPythonSourceSize(raw.source) > BACKEND_PYTHON_SOURCE_LIMIT) {
    throw new Error('Keep the Python source at or below 32,768 UTF-8 bytes.');
  }
  return { id: raw.id, name, source: raw.source };
}

function normalizePythonScripts(entries) {
  const scripts = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries.slice(0, BACKEND_PYTHON_SCRIPT_LIMIT) : []) {
    try {
      const script = backendPythonScript(entry);
      if (!seen.has(script.id)) scripts.push(script);
      seen.add(script.id);
    } catch {}
  }
  return scripts;
}

export function backendModel(value) {
  const source = value && Array.isArray(value.routes) ? value.routes : [];
  const packages = normalizePackages(value?.packages);
  const testCases = normalizeTestCases(value?.testCases);
  const pythonScripts = normalizePythonScripts(value?.pythonScripts);
  return { version: 1, ...(packages.length ? { packages } : {}), ...(testCases.length ? { testCases } : {}), ...(pythonScripts.length ? { pythonScripts } : {}), routes: source.filter(route => route && typeof route === 'object').map(route => ({
    id: String(route.id ?? ''),
    name: String(route.name ?? ''),
    method: String(route.method ?? 'GET'),
    path: String(route.path ?? ''),
    access: String(route.access ?? 'public'),
    ...(route.keySecret ? { keySecret: route.keySecret } : {}),
    steps: (Array.isArray(route.steps) ? route.steps : []).filter(step => step && typeof step === 'object').map(step => ({
      id: String(step.id ?? ''),
      type: String(step.type ?? ''),
      args: step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? clone(step.args) : {},
      ...(step.label ? { label: step.label } : {}),
      ...(step.next ? { next: step.next } : {}),
      ...(step.error ? { error: step.error } : {}),
      ...(step.onError ? { onError: step.onError } : {}),
    })),
  })) };
}

export function backendRequest(raw) {
  const path = String(raw?.path || '');
  const method = String(raw?.method || 'GET').toUpperCase();
  if (!methods.has(method) || !/^\/api\/[a-zA-Z0-9_./%-]+$/.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || path.length > 420) {
    throw new Error('Choose an HTTP method and an endpoint under /api/.');
  }
  const cleanHeaders = Object.fromEntries(Object.entries(raw?.headers || {}).filter(([name, value]) =>
    /^(?:authorization|x-api-key|content-type|accept|x-[a-z0-9-]{1,64})$/i.test(name) && typeof value === 'string' && value.length <= 4096 && !/[\r\n]/.test(value)
  ).slice(0, 32).map(([name, value]) => [name.toLowerCase(), value]));
  return { method, path, query: raw.query && typeof raw.query === 'object' && !Array.isArray(raw.query) ? raw.query : {}, headers: cleanHeaders, body: raw.body ?? null };
}

export function testQueryValues(text) {
  const query = new Map();
  for (const [name, value] of new URLSearchParams(text)) {
    const previous = query.get(name);
    query.set(name, previous === undefined ? value : [].concat(previous, value));
  }
  return Object.fromEntries(query);
}

export function testQueryString(query) {
  const params = new URLSearchParams();
  for (const [name, values] of Object.entries(query)) {
    for (const value of [].concat(values)) params.append(name, value);
  }
  return params.toString();
}

function credentialField(key) {
  const name = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /(?:password|passphrase|apikey|accesskey|authorization|token|secret|cookie|sessionid|signature|credential|privatekey|signingkey)s?$/.test(name) || name === 'session';
}

function fixtureValue(value, depth = 0) {
  if (depth > 20) throw new Error('Use fixture values nested at most 20 levels deep.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (/^(?:PLOT_API_KEY|PLOT_SECRET_[A-Z0-9_]+|Bearer\s+\S+)$/i.test(value.trim())) {
      throw new Error('Use temporary request settings for credentials, tokens, and secret aliases.');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(entry => fixtureValue(entry, depth + 1));
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (credentialField(key)) throw new Error('Use temporary request settings for credential fields, cookies, and signatures.');
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('A fixture uses a reserved JSON field name.');
      return [key, fixtureValue(entry, depth + 1)];
    }));
  }
  throw new Error('Use only standard JSON values in saved fixtures.');
}

export function backendTestCase(raw) {
  if (!raw || typeof raw.id !== 'string' || !caseId.test(raw.id)) throw new Error('The case identifier is invalid.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 80) throw new Error('Enter a case name up to 80 characters.');
  const { method, path, query, body } = backendRequest(raw.request || {});
  const queryValues = Object.entries(query);
  if (queryValues.length > 100 || queryValues.some(([, value]) =>
    !(typeof value === 'string' || Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string')))) {
    throw new Error('Use up to 100 query parameters with text values.');
  }
  const status = raw.expect?.status;
  if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('Enter an expected HTTP status between 200 and 599.');
  const fields = raw.expect?.fields ?? [];
  if (!Array.isArray(fields) || fields.length > BACKEND_ASSERTION_LIMIT) throw new Error(`Use up to ${BACKEND_ASSERTION_LIMIT} response assertions.`);
  const assertions = fields.map(assertion => {
    const path = typeof assertion?.path === 'string' ? assertion.path.trim() : '';
    if (path.length > 160 || !fieldPath.test(path)) throw new Error('Use a response path such as data.id, items[0].price, or $ for the full body.');
    if (path.split(/[.\[\]]/).some(credentialField)) throw new Error('Choose a response field that contains fixture data.');
    if (assertion.operator === 'exists') return { path, operator: 'exists' };
    if (assertion.operator !== 'equals') throw new Error('Choose a valid response assertion.');
    return { path, operator: 'equals', value: fixtureValue(assertion.value) };
  });
  const request = { method, path, query: fixtureValue(query), body: ['GET', 'HEAD'].includes(method) ? null : fixtureValue(body) };
  const test = { id: raw.id, name, request, expect: { status, fields: assertions } };
  if (new TextEncoder().encode(JSON.stringify(test)).length > 16 * 1024) throw new Error('Keep each saved fixture under 16 KiB.');
  return test;
}

function jsonEquals(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]));
}

export function backendTestAssertions(test, response) {
  const failures = [];
  if (response.status !== test.expect.status) failures.push(`Expected HTTP ${test.expect.status}, received HTTP ${response.status}.`);
  for (const { path, operator, value } of test.expect.fields) {
    const keys = path === '$' ? [] : path.replace(/^\$\./, '').replace(/\[(\d+)\]/g, (_match, index) => `.${Number(index)}`).split('.');
    let actual = response.body;
    for (const key of keys) {
      actual = actual && typeof actual === 'object' && Object.hasOwn(actual, key) ? actual[key] : undefined;
    }
    if (actual === undefined) failures.push(`Field ${path} is missing.`);
    else if (operator === 'equals' && !jsonEquals(actual, value)) failures.push(`Field ${path} differs from the expected JSON value.`);
  }
  return failures;
}

export function backendClientScript() {
  return `(() => {
  if (globalThis.plotBackend) return;
  async function request(path, options = {}) {
    const address = new URL(path, location.origin);
    if (address.origin !== location.origin || !address.pathname.startsWith('/api/')) throw new Error('Choose a local /api/ endpoint.');
    for (const [key, value] of Object.entries(options.query || {})) {
      for (const entry of Array.isArray(value) ? value : [value]) address.searchParams.append(key, String(entry));
    }
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...options.headers };
    const init = { method, headers };
    if (options.body !== undefined && !['GET','HEAD'].includes(method)) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(address, init);
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, body, headers: Object.fromEntries(response.headers) };
  }
  globalThis.plotBackend = Object.freeze({ request });
})();\n`;
}
