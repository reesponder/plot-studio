import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendModel, backendRequest } from './backend-model.mjs';
import { describeData } from './data.mjs';
import { compileGraph } from './logic.mjs';
import { createPrivateProjectStorage } from './private-project-storage.mjs';
import { normalizeProject, renderDocument } from './project.mjs';
import { packPublishedDocument } from './published-assets.mjs';
import { PUBLICATION_PACKET_MIME } from './publication-packet.mjs';

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const publicSitePattern = /^\/s\/([a-z0-9-]+)\/([a-f0-9]{32})(\/.*)?$/;
const privateSitePattern = /^\/studio\/sites\/([^/]+)(\/.*)?$/;
const projectIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const secretAliasPattern = /^PLOT_SECRET_[A-Z0-9_]{1,60}$/;
const readMethods = new Set(['GET', 'HEAD']);
const packageRoot = fileURLToPath(new URL('./', import.meta.url));
const workerPath = resolve(packageRoot, 'backend_worker.py');
const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const MIB = 1024 * 1024;

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function readBody(req, cap, forceJson = false) {
  const media = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  if (forceJson && media !== 'application/json') throw fail(415, 'Send an application/json request.');
  if (Number(req.headers['content-length']) > cap) { req.resume(); throw fail(413, 'This request is too large.'); }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= cap) chunks.push(chunk);
  }
  if (size > cap) throw fail(413, 'This request is too large.');
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    if (media.endsWith('json')) return { body: text ? JSON.parse(text) : null, raw: text };
    if (media === 'application/x-www-form-urlencoded') return { body: unpack(new URLSearchParams(text)), raw: text };
    return { body: text || null, raw: text };
  } catch { throw fail(400, 'The request body could not be read.'); }
}

function unpack(search) {
  const result = Object.create(null);
  for (const [key, value] of search) {
    if (Object.hasOwn(result, key)) result[key] = [].concat(result[key], value);
    else result[key] = value;
  }
  return result;
}

function readTestSecrets(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw fail(422, 'Temporary secrets must be a JSON object.');
  }
  const entries = Object.entries(value);
  if (entries.length > 8 || entries.some(([name, text]) =>
    !/^PLOT_(?:API_KEY|SECRET_[A-Z0-9_]{1,60})$/.test(name) ||
    typeof text !== 'string' || !text || Buffer.byteLength(text) > 512)) {
    throw fail(422, 'Use up to eight valid secret aliases with short test values.');
  }
  return Object.fromEntries(entries);
}

function respond(res, status, data, head = false, extras = {}) {
  const type = extras['Content-Type'] || 'application/json; charset=utf-8';
  const text = type.startsWith('application/json') ? JSON.stringify(data ?? null) : String(data ?? '');
  const body = [204, 304].includes(status) ? Buffer.alloc(0) : Buffer.from(text);
  res.writeHead(status, { ...extras, 'Content-Type': type, 'Content-Length': body.length });
  res.end(head ? undefined : body);
}

function validateStatus(status) {
  return Number.isInteger(status) && status >= 200 && status <= 599 ? status : 500;
}

function responseHeaders(raw) {
  const values = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (typeof value !== 'string' || /[\r\n\u0000]/.test(value) || value.length > 2048) continue;
    const lower = key.toLowerCase();
    if (lower === 'content-type' && /^(?:application\/json|text\/plain)(?:;|$)/i.test(value)) values['Content-Type'] = value;
    else if ((/^x-[a-z0-9-]{1,60}$/.test(lower) && !/^x-(?:accel-|sendfile|forwarded-|real-ip|frame-options|content-type-options|original-|rewrite-|internal-|upstream-)/.test(lower)) || lower === 'allow' || lower === 'retry-after') values[lower] = value;
  }
  return values;
}

function connectionSummary(id, item) {
  return { id, label: item.label, url: item.url, methods: item.methods, allowPrivate: item.allowPrivate,
    hasToken: Boolean(item.credential || item.credentialAlias), credentialAlias: item.credentialAlias || null,
    credentialHeader: item.credentialHeader || 'Authorization' };
}

const bridge = `<script>(()=>{
  let serial=0;
  const pending=new Map();
  const call=(action,payload)=>new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The hosted request timed out.'));},26000);
    pending.set(id,{resolve,reject,timer});
    parent.postMessage({sender:'plot-hosted-child',type:'request',id,action,payload},'*');
  });
  globalThis.plotBackend=Object.freeze({request:(path,options={})=>call('run',{...options,path})});
  globalThis.plotData=Object.freeze({query:params=>call('data',params)});
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.sender!=='plot-hosted-shell')return;
    const input=event.data;
    if(input.type==='fragment'){
      try{document.getElementById(decodeURIComponent(input.value))?.scrollIntoView();}catch{}
      return;
    }
    const entry=pending.get(input.id);
    if(!entry)return;
    pending.delete(input.id);
    clearTimeout(entry.timer);
    if(input.ok)entry.resolve(input.result);else entry.reject(new Error(input.error));
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(!link)return;
    const href=link.getAttribute('href')||'';
    const fragment=href.includes('#')?href.slice(href.indexOf('#')+1):'';
    if(link.dataset.pageLink){
      event.preventDefault();
      parent.postMessage({sender:'plot-hosted-child',type:'navigate',page:link.dataset.pageLink,fragment},'*');
    }else if(href.startsWith('#')){
      event.preventDefault();
      try{document.getElementById(decodeURIComponent(fragment))?.scrollIntoView();}catch{}
    }
  },true);
  parent.postMessage({sender:'plot-hosted-child',type:'ready'},'*');
})()</script>`;

function shell(record, page, base, publicSite) {
  const title = escape(`${page.name} — ${record.project.name}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/s/_assets/hosted.css"><script type="module" src="/s/_assets/hosted-runner.mjs?v=2"></script></head><body><main id="hosted-app" data-base="${base}" data-public="${publicSite}" data-page="${escape(page.id)}"><p id="hosted-status" role="status">Loading site…</p><iframe sandbox="allow-scripts allow-forms allow-popups" title="${title}" hidden></iframe></main></body></html>`;
}

export function createHosted({ directory, origin, sessionSecret, privateProjects = directory ? createPrivateProjectStorage() : null,
  projectSecrets, checkSecretProject, namespace = '', runnerSlots = { active: 0, public: 0 } }) {
  const root = directory ? resolve(directory, 'sites') : null;
  const connectionsFile = directory ? resolve(directory, 'connections.json') : null;
  const changed = new Set();
  let cachedCatalog;
  const suffix = namespace ? `u/${namespace}/` : '';
  const privateAddress = slug => `/studio/sites/${suffix}${slug}/`;
  const publicAddress = ({ slug, id }) => id ? `/s/${suffix}${slug}/${id}/` : null;

  function siteKey(record) {
    return 'plot_' + createHmac('sha256', sessionSecret).update(`site:${namespace ? `${namespace}:` : ''}${record.slug}:${record.keySalt}`).digest('base64url');
  }

  async function savedProjectId(id) {
    if (typeof id !== 'string' || !projectIdPattern.test(id)) throw fail(422, 'Choose a saved server project for these secrets.');
    if (!projectSecrets || typeof checkSecretProject !== 'function') throw fail(503, 'Project secrets are unavailable.');
    if (!await checkSecretProject(id)) throw fail(404, 'The saved server project no longer exists.');
    return id;
  }

  async function work(payload, publicSite = false) {
    if (runnerSlots.active >= 12 || (publicSite && runnerSlots.public >= 6)) throw fail(503, 'The server runner is busy. Try again in a moment.');
    runnerSlots.active++;
    if (publicSite) runnerSlots.public++;
    try {
      const permitted = namespace ? /^(?:PATH|SYSTEMROOT|LANG|LC_ALL|TEMP|TMP|TMPDIR|PLOT_PYTHON_LIBRARIES)$/i :
        /^(?:PATH|SYSTEMROOT|LANG|LC_ALL|TEMP|TMP|TMPDIR|PLOT_(?:SECRET_[A-Z0-9_]+|API_KEY|NATIVE_PATH|PYTHON_LIBRARIES|CONNECTORS(?:_FILE)?|SERVER_TASKS(?:_FILE)?))$/i;
      const { secretProjectId, ...operation } = payload;
      const scoped = Boolean(secretProjectId && ['run', 'test'].includes(operation.action));
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => permitted.test(key) &&
        (!scoped || !/^PLOT_(?:SECRET_|API_KEY$)/i.test(key))));
      env.PYTHONDONTWRITEBYTECODE = '1';
      const studioConnectors = connectionsFile && ['catalog', 'run'].includes(operation.action) ? await connectionRegistry() : undefined;
      if (scoped && !projectSecrets) throw fail(503, 'Project secrets are unavailable.');
      const savedSecrets = scoped ? await projectSecrets.values(secretProjectId) : undefined;
      return await executeWorker({ ...operation, studioConnectors, savedSecrets, tenant: Boolean(namespace) }, env);
    } finally {
      runnerSlots.active--;
      if (publicSite) runnerSlots.public--;
    }
  }

  function executeWorker(payload, env) {
    return new Promise((resolve, reject) => {
      const timeout = payload.backend?.pythonScripts?.length ? 24000 : 18000;
      const task = spawn(python, [workerPath], { env, timeout, windowsHide: true });
      let data = '';
      task.stdout.setEncoding('utf8');
      task.stdout.on('data', chunk => {
        data += chunk;
        if (data.length > 5 * MIB) task.kill();
      });
      task.stderr.resume();
      task.stdin.on('error', () => {});
      task.on('error', () => reject(fail(503, 'Python is unavailable in the server runner.')));
      task.on('close', code => {
        if (code !== 0) return reject(fail(503, 'The server runner stopped or reached its time limit.'));
        try {
          const result = JSON.parse(data);
          if (result.workerError) reject(fail(validateStatus(result.status), result.workerError, result.code));
          else resolve(result);
        } catch { reject(fail(500, 'The server runner returned an invalid result.')); }
      });
      task.stdin.end(JSON.stringify(payload));
    });
  }

  function location(slug) {
    if (!root) throw fail(503, 'Hosted sites require a configured Studio state directory.');
    if (!slugPattern.test(slug)) throw fail(404, 'The hosted site name is invalid.');
    return resolve(root, slug);
  }

  async function readRecord(path, scope) {
    const bytes = await readFile(path);
    if (privateProjects.isSealed(bytes)) return JSON.parse(privateProjects.open(bytes, scope));
    if (process.env.PLOT_PROJECT_STORAGE_ALLOW_LEGACY === '1') return JSON.parse(bytes);
    throw new Error('The hosted record has not been migrated to authenticated storage.');
  }

  async function load(slug) {
    try {
      return await readRecord(resolve(location(slug), 'snapshot.json'), `hosted:${slug}`);
    }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  async function save(record) {
    const dir = location(record.slug);
    const temp = resolve(dir, `snapshot-${randomUUID()}.tmp`);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(temp, privateProjects.seal(JSON.stringify(record), `hosted:${record.slug}`), { mode: 0o600 });
    await rename(temp, resolve(dir, 'snapshot.json'));
  }

  async function connectionRegistry() {
    if (!connectionsFile) throw fail(503, 'Connections require a configured Studio state directory.');
    try {
      return await readRecord(connectionsFile, 'hosted-connections');
    }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }

  async function updateConnections(name, definition) {
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(name)) throw fail(400, 'Use lowercase letters, numbers and dashes in connection names.');
    if (changed.has(':connections')) throw fail(409, 'Another connection update is in progress.');
    changed.add(':connections');
    try {
      const records = await connectionRegistry();
      if (definition) {
        let url;
        try { url = new URL(String(definition.url)); } catch { throw fail(400, 'Enter a valid connection URL.'); }
        const local = definition.allowPrivate === true;
        if (namespace) throw fail(403, 'Custom server connections are available only in the operator workspace.');
        if (url.username || url.password || url.hash || (!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol)) throw fail(400, 'Use an HTTPS address, or explicitly permit private network access.');
        if (Object.keys(records).length >= 100 && !Object.hasOwn(records,name)) throw fail(400, 'The connection limit has been reached.');
        const methods = Array.isArray(definition.methods) ? definition.methods.filter(method => ['GET', 'HEAD', 'POST','PUT','PATCH','DELETE'].includes(method)) : [];
        if (!methods.length) throw fail(400, 'Choose an allowed method.');
        const credential = String(definition.credential || '').trim();
        if (credential.length > 4096 || /[\r\n]/.test(credential)) throw fail(400, 'Enter a one-line bearer token.');
        const credentialAlias = definition.credentialAlias ?? '';
        const credentialHeader = definition.credentialHeader ?? 'Authorization';
        if (typeof credentialAlias !== 'string' || (credentialAlias && !secretAliasPattern.test(credentialAlias))) {
          throw fail(422, 'Choose a PLOT_SECRET_ alias for this connection.');
        }
        if (!['Authorization', 'X-API-Key'].includes(credentialHeader)) throw fail(422, 'Choose a supported credential header.');
        if (credential && credentialAlias) throw fail(422, 'Choose a saved secret alias or enter a bearer token.');
        if (credentialAlias && url.protocol !== 'https:') throw fail(422, 'Use HTTPS for a connection with a saved credential.');
        records[name] = { url: url.href, label: String(definition.label || name).slice(0,90), methods, allowPrivate:local,
          credential, credentialAlias, credentialHeader };
      } else delete records[name];
      await mkdir(resolve(connectionsFile, '..'), { recursive:true, mode:0o700 });
      const entry = `${connectionsFile}.${randomUUID()}.tmp`;
      await writeFile(entry, privateProjects.seal(JSON.stringify(records), 'hosted-connections'), { mode:0o600 });
      await rename(entry, connectionsFile);
      cachedCatalog = null;
      return Object.entries(records).map(([id, item]) => connectionSummary(id, item));
    } finally { changed.delete(':connections'); }
  }

  function summary(record) {
    const privateUrl = privateAddress(record.slug);
    const publicUrl = record.public === true ? publicAddress(record) : null;
    return { slug: record.slug, name: record.project.name, version: record.version, updated: record.updated, enabled: record.enabled,
      pages: record.project.pages.length, routes: record.project.backend.routes.length,
      id: record.id ?? null, public: record.public === true, privateUrl, publicUrl, url: publicUrl || privateUrl,
      secretProjectId: record.secretProjectId ?? null };
  }

  async function deploy(slug, request, req) {
    if (changed.has(slug)) throw fail(409, 'This site is already being updated.');
    changed.add(slug);
    try {
      const existing = await load(slug);
      if (existing && req.headers['if-match'] !== `"${existing.version}"`) throw fail(409, 'Load the latest site revision before updating it.');
      if (!existing && req.headers['if-none-match'] !== '*') throw fail(428, 'Request a new site name before creating a release.');
      if (!request?.project || !Array.isArray(request.project.pages) || request.project.pages.length > 150) throw fail(422, 'A website project is required.');
      if (request.public !== undefined && typeof request.public !== 'boolean') throw fail(422, 'Choose whether the site is public.');
      const publicSite = request.public ?? (existing?.public === true);
      const secretProjectId = request.secretProjectId === undefined ? existing?.secretProjectId ?? null :
        request.secretProjectId === null ? null : await savedProjectId(request.secretProjectId);
      const project = normalizeProject(request.project);
      delete project.backend.testCases;
      const browser = compileGraph(project.graph, project);
      const issue = browser.diagnostics.find(item => item.severity === 'error');
      if (issue) throw fail(422, issue.message);
      if (project.settings.customJs?.trim()) {
        try { new Function(project.settings.customJs); } catch (error) { throw fail(422, `Custom JavaScript: ${error.message}`); }
      }
      const schema = describeData(project.data, { includeRows: !existing && request.includeRows === true });
      const dbPath = resolve(location(slug), 'site.sqlite3');
      const record = { slug, project, script: browser.code, schema: describeData(project.data),
        id: existing?.id || randomBytes(16).toString('hex'), public: publicSite,
        secretProjectId,
        keySalt: existing?.keySalt || randomUUID(), version: randomUUID(), updated: Date.now(), enabled: true };
      const entry = project.pages.find(page => page.slug === 'index') || project.pages[0];
      await packedDocument(record, entry);
      const checked = await work({ action: 'validate', backend: project.backend, schema, dbPath });
      const blocking = checked.diagnostics?.find(item => item.severity === 'error');
      if (blocking) throw fail(422, blocking.message);
      // Schema seeding happens only when a release is first deployed.
      for (const table of record.project.data.tables) table.rows = [];
      await save(record);
      return summary(record);
    } finally { changed.delete(slug); }
  }

  async function workspace(req, res, url) {
    const path = url.pathname;
    if (path === '/studio/api/backend/catalog' && req.method === 'GET') {
      cachedCatalog ||= work({ action: 'catalog' }).catch(error => { cachedCatalog = null; throw error; });
      return respond(res, 200, await cachedCatalog);
    }
    if (path === '/studio/api/backend/connections' && req.method === 'GET') {
      const records = await connectionRegistry();
      return respond(res, 200, Object.entries(records).map(([id, item]) => connectionSummary(id, item)));
    }
    const connection = /^\/studio\/api\/backend\/connections\/([a-z0-9-]+)$/.exec(path);
    if (connection && ['PUT','DELETE'].includes(req.method)) {
      const definition = req.method === 'PUT' ? (await readBody(req, 16000, true)).body : null;
      return respond(res, 200, await updateConnections(connection[1], definition));
    }
    if (path === '/studio/api/backend/python/test' && req.method === 'POST') {
      const { body } = await readBody(req, 4 * MIB, true);
      const { source, values, timeout = 5 } = body || {};
      return respond(res, 200, await work({ action: 'python-test', source, values, timeout }));
    }
    if (path === '/studio/api/backend/test' && req.method === 'POST') {
      const { body: draft } = await readBody(req, 12 * MIB, true);
      const request = backendRequest(draft?.request);
      const raw = draft?.request?.raw;
      if (raw !== undefined) {
        if (typeof raw !== 'string' || Buffer.byteLength(raw) > MIB) throw fail(422, 'Use a JSON test body up to 1 MiB.');
        try { request.body = raw.trim() ? JSON.parse(raw) : null; }
        catch { throw fail(422, 'The test body must contain valid JSON.'); }
        request.raw = raw;
      } else {
        request.raw = JSON.stringify(request.body);
      }
      const schema = describeData(draft?.data || {}, { includeRows: true });
      const configuration = backendModel(draft?.backend);
      delete configuration.testCases;
      if (draft?.validateOnly) {
        const result = await work({ action: 'check', backend: configuration });
        return respond(res, 200, result);
      }
      const previewSecrets = readTestSecrets(draft?.previewSecrets);
      const secretProjectId = draft?.useSavedSecrets === true ? await savedProjectId(draft.secretProjectId) : undefined;
      return respond(res, 200, await work({ action: 'test', backend: configuration, schema, request, previewSecrets, secretProjectId }));
    }
    if (path === '/studio/api/sites' && req.method === 'GET') {
      if (!root) throw fail(503, 'Hosted sites require a configured Studio state directory.');
      const names = await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const items = await Promise.all(names.filter(entry => entry.isDirectory() && slugPattern.test(entry.name)).slice(0, 500).map(entry => load(entry.name)));
      return respond(res, 200, items.filter(Boolean).map(summary).sort((a, b) => b.updated - a.updated));
    }
    const keyedSite = /^\/studio\/api\/sites\/([^/]+)\/key$/.exec(path);
    if (keyedSite && req.method === 'GET') {
      const existing = await load(keyedSite[1]);
      if (!existing) throw fail(404, 'This hosted site was not found.');
      return respond(res, 200, { key: siteKey(existing) });
    }
    const match = /^\/studio\/api\/sites\/([^/]+)$/.exec(path);
    if (match && req.method === 'PUT') {
      const { body } = await readBody(req, 12 * MIB, true);
      return respond(res, 200, await deploy(match[1], body, req));
    }
    if (match && req.method === 'DELETE') {
      const slug = match[1];
      if (changed.has(slug)) throw fail(409, 'This site is already being updated.');
      changed.add(slug);
      try {
        const existing = await load(slug);
        if (!existing) throw fail(404, 'This hosted site was not found.');
        if (req.headers['if-match'] !== `"${existing.version}"`) throw fail(409, 'Load the latest site revision before unpublishing it.');
        existing.enabled = false;
        existing.version = randomUUID();
        existing.updated = Date.now();
        await save(existing);
        return respond(res, 200, summary(existing));
      } finally { changed.delete(slug); }
    }
    throw fail(404, 'This Studio operation was not found.');
  }

  async function pageDocument(record, page) {
    let document = renderDocument(page, record.project, record.script, { bodyHtml: bridge });
    document = document.replaceAll(
      /(<(?:img|video)\b[^>]*?\s(?:src|poster)=")(?:\.\/)?assets\/hotel\/([a-z0-9]+(?:-[a-z0-9]+)*\.webp)"/g,
      '$1/99host-assets/hotel/$2"',
    );
    if (document.includes('src="./assets/prog.webp"')) {
      const asset = await readFile(resolve(packageRoot, 'assets/prog.webp'));
      document = document.replaceAll('src="./assets/prog.webp"', `src="data:image/webp;base64,${asset.toString('base64')}"`);
    }
    return document;
  }

  async function packedDocument(record, page) {
    return packPublishedDocument(await pageDocument(record, page), {
      version: record.version, page: page.id, title: page.name, slug: page.slug,
    });
  }

  async function hosted(req, res, url, { keyOnly = false, publicSite = false } = {}) {
    const match = (publicSite ? publicSitePattern : privateSitePattern).exec(url.pathname);
    if (!match) throw fail(404, 'This hosted site was not found.');
    const slug = match[1];
    const record = await load(slug);
    if (publicSite && (!record?.enabled || record.public !== true || record.id !== match[2])) {
      throw fail(404, 'This hosted site was not found.');
    }
    if (!record?.enabled) throw fail(keyOnly ? 401 : 404, keyOnly ? 'A valid project API key is required.' : 'This hosted site is offline.');
    const path = match[publicSite ? 3 : 2];
    if (!path) { res.writeHead(308, { Location: `${publicSite ? publicAddress(record) : privateAddress(slug)}${url.search}` }); return res.end(); }
    const { testCases, ...configuration } = record.project.backend;
    const backend = keyOnly ? { ...configuration, routes: configuration.routes.filter(route => route.access === 'key') } : configuration;
    const worker = { backend, schema: record.schema, dbPath: resolve(location(slug), 'site.sqlite3'), siteKey: siteKey(record),
      secretProjectId: record.secretProjectId };
    if (keyOnly && (!path.startsWith('/api/') || path === '/api/data/query')) throw fail(401, 'A valid project API key is required.');
    if (path === '/_bridge' && req.method === 'POST') {
      if (publicSite && req.headers.origin !== origin) throw fail(403, 'Send this request from the published site.');
      const { body } = await readBody(req, MIB, true);
      if (body?.action === 'data') return respond(res, 200, await work({ ...worker, action: 'data', query: body.payload }, publicSite));
      if (body?.action === 'run') {
        const request = backendRequest(body.payload);
        request.raw = JSON.stringify(request.body);
        return respond(res, 200, await work({ ...worker, action: 'run', request }, publicSite));
      }
      throw fail(400, 'Choose a supported bridge operation.');
    }
    if (path.startsWith('/api/')) {
      const { body, raw } = readMethods.has(req.method) ? { body: null, raw: '' } : await readBody(req, MIB);
      if (path === '/api/data/query') {
        if (req.method !== 'POST') throw fail(405, 'Use POST for data queries.');
        return respond(res, 200, await work({ ...worker, action: 'data', query: body }, publicSite));
      }
      const request = backendRequest({ method: req.method, path, query: unpack(url.searchParams), headers: req.headers, body });
      request.raw = raw;
      request.client = req.socket.remoteAddress;
      const result = await work({ ...worker, action: 'run', request }, publicSite);
      if (keyOnly && result.status === 404) return respond(res, 401, { error: { message: 'A valid project API key is required.' } }, req.method === 'HEAD');
      return respond(res, validateStatus(result.status), result.body, req.method === 'HEAD', responseHeaders(result.headers));
    }
    if (!readMethods.has(req.method)) throw fail(405, 'Use GET or HEAD for a page.');
    const page = path === '/_page' ? record.project.pages.find(item => item.id === url.searchParams.get('id')) :
      path === '/' ? record.project.pages.find(item => item.slug === 'index') || record.project.pages[0] :
      record.project.pages.find(item => path === `/${item.slug}` || path === `/${item.slug}.html`);
    if (!page) throw fail(404, 'This page was not found.');
    if (path === '/_page') {
      const packet = await packedDocument(record, page);
      res.writeHead(200, { 'Content-Type': PUBLICATION_PACKET_MIME, 'Content-Length': packet.byteLength });
      return res.end(req.method === 'HEAD' ? undefined : packet);
    }
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    const base = publicSite ? publicAddress(record) : privateAddress(record.slug);
    return respond(res, 200, shell(record, page, base, publicSite), req.method === 'HEAD', { 'Content-Type': 'text/html; charset=utf-8' });
  }

  return async (req, res, url, authorized) => {
    const publicSite = url.pathname.startsWith('/s/');
    const keyAccess = !authorized && /^\/studio\/sites\/[^/]+\/api\//.test(url.pathname)
      && (req.headers.authorization || req.headers['x-api-key']);
    if (!authorized && !keyAccess && !publicSite) {
      if (url.pathname.startsWith('/studio/sites/') && readMethods.has(req.method) && !url.pathname.includes('/api/')) {
        res.writeHead(302, { Location: `/sign-in?next=${encodeURIComponent(namespace ? url.pathname.replace('/studio/sites/', `/studio/sites/${suffix}`) : url.pathname)}` });
        return res.end();
      }
      return respond(res, 401, { error: { message: 'Sign in to use this Studio operation.' } });
    }
    try {
      if (!publicSite && !keyAccess && !readMethods.has(req.method) && req.headers.origin !== origin) throw fail(403, 'Send this request from the Studio origin.');
      if (publicSite || url.pathname.startsWith('/studio/sites/')) return await hosted(req, res, url, { keyOnly: Boolean(keyAccess), publicSite });
      return await workspace(req, res, url);
    } catch (error) {
      if (!error.status) console.error('Hosted request failed:', error.message);
      return respond(res, error.status || 500, { error: { code: error.code || 'HOSTED_REQUEST', message: error.status ? error.message : 'The Studio server could not complete the request.' } }, req.method === 'HEAD');
    }
  };
}
