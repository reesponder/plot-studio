import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendPlotFile } from './plot-file.mjs';
import { deriveProjectStorageKey } from './private-project-storage.mjs';

const worker = fileURLToPath(new URL('./draft_store.py', import.meta.url));
const maxProjectBytes = 12 * 1024 * 1024;
const maxSecretBody = 64 * 1024;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const revisionPattern = /^[1-9]\d{0,12}$/;

function error(status, message) {
  return Object.assign(new Error(message), { status });
}

async function projectBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw error(415, 'Use an application/json project body.');
  }
  if (Number(request.headers['content-length']) > maxProjectBytes) {
    request.resume();
    throw error(413, 'The project exceeds 12 MB.');
  }
  const chunks = [];
  let size = 0;
  // Keep draining the request so chunked bodies do not prematurely close the socket.
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= maxProjectBytes) chunks.push(chunk);
  }
  if (size > maxProjectBytes) throw error(413, 'The project exceeds 12 MB.');
  let project;
  try { project = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw error(400, 'This is not a valid JSON project.'); }
  if (!project || project.version !== 1 || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 150 ||
    !Array.isArray(project.pages) || !project.pages.length || project.pages.length > 500 || !Array.isArray(project.graph?.nodes) || !Array.isArray(project.graph?.edges)) {
    throw error(422, 'This is not a PLOT Studio project.');
  }
  return project;
}

async function secretBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw error(415, 'Use an application/json request.');
  }
  if (Number(request.headers['content-length']) > maxSecretBody) throw error(413, 'The secret request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= maxSecretBody) chunks.push(chunk);
  }
  if (size > maxSecretBody) throw error(413, 'The secret request is too large.');
  let secret;
  try { secret = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw error(400, 'The secret request must be valid JSON.'); }
  if (!secret || typeof secret.name !== 'string' || typeof secret.value !== 'string') {
    throw error(422, 'Enter an alias and a secret value.');
  }
  return secret;
}

function expectedRevision(request, mode) {
  if (request.headers['if-none-match'] === '*' && mode === 'put') return null;
  const match = /^"([1-9]\d{0,12})"$/.exec(request.headers['if-match'] || '');
  if (!match) throw error(428, 'Pass the last project revision.');
  return Number(match[1]);
}

function checkpointNote(request) {
  const value = request.headers['x-plot-checkpoint'] || '';
  if (value.length > 1200) throw error(422, 'Keep the revision note under 80 characters.');
  let note;
  try { note = decodeURIComponent(value).trim(); }
  catch { throw error(422, 'The revision note is invalid.'); }
  if ([...note].length > 80 || /[\u0000-\u001f\u007f]/.test(note)) throw error(422, 'Use a short single-line revision note.');
  return note;
}

function respond(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  response.end(body);
}

export function createDraftStore({ directory, origin, plotFiles, projectSecrets, namespace = '' }) {
  if (!directory) return null;
  const dbPath = resolve(directory, 'projects.sqlite3');
  const python = process.env.PLOT_PROJECT_STORE_PYTHON || process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const draftKey = deriveProjectStorageKey(namespace ? `sqlite-drafts:${namespace}` : 'sqlite-drafts').toString('base64url');
  const legacy = process.env.PLOT_PROJECT_STORAGE_ALLOW_LEGACY === '1';
  const workerEnv = { ...process.env };
  delete workerEnv.PLOT_PROJECT_STORAGE_KEY;
  delete workerEnv.PLOT_FILE_KEY;
  let active = 0;
  const projectWrites = new Set();

  function execute(operation, id, payload = null) {
    if (active >= 12) throw error(503, 'The project store is busy. Try again in a moment.');
    active++;
    return new Promise((accept, reject) => {
      const child = spawn(python, [worker, dbPath, operation, id], { timeout: 10000, windowsHide: true, env: workerEnv });
      const output = [];
      child.stdout.on('data', (chunk) => output.push(chunk));
      child.stderr.resume();
      child.on('error', reject);
      child.stdin.on('error', () => { /* The worker can exit while a request body is in transit. */ });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(error(503, 'The project store is temporarily unavailable.'));
          return;
        }
        try { accept(JSON.parse(Buffer.concat(output).toString('utf8'))); }
        catch (parseError) { reject(parseError); }
      });
      child.stdin.end(JSON.stringify({ key: draftKey, legacy, payload }));
    }).finally(() => { active--; });
  }

  async function exists(id) {
    if (!idPattern.test(id || '')) return false;
    const result = await execute('exists', id);
    if (result.status === 404) return false;
    if (result.status !== 200) throw error(503, 'The server project is temporarily unavailable.');
    return true;
  }

  async function withProjectWrite(id, operation) {
    if (projectWrites.has(id)) throw error(409, 'Another change to this server project is in progress. Try again.');
    projectWrites.add(id);
    try { return await operation(); }
    finally { projectWrites.delete(id); }
  }

  async function handleSecrets(request, response, id, parts) {
    if (!projectSecrets) throw error(503, 'Secrets are unavailable on this server.');
    if (parts.length > 3 || (parts.length === 3 && !parts[2])) throw error(404, 'Project secret not found.');
    const name = parts[2];
    if (!name && request.method === 'GET') {
      if (!await exists(id)) throw error(404, 'Server project not found.');
      return respond(response, 200, { secrets: await projectSecrets.list(id) });
    }
    const put = !name && request.method === 'POST';
    const remove = name && request.method === 'DELETE';
    if (!put && !remove) {
      response.setHeader('Allow', name ? 'DELETE' : 'GET, POST');
      throw error(405, 'Method not allowed.');
    }
    if (request.headers.origin !== origin) throw error(403, 'Request origin is not allowed.');
    const definition = put ? await secretBody(request) : null;
    const result = await withProjectWrite(id, async () => {
      if (!await exists(id)) throw error(404, 'Server project not found.');
      if (put) {
        const createOnly = request.headers['if-none-match'] === '*';
        if (createOnly && (await projectSecrets.list(id)).some(entry => entry.name === definition.name)) {
          throw error(409, 'That alias already exists. Select it to replace its value.');
        }
        return { secret: await projectSecrets.put(id, definition.name, definition.value) };
      }
      return { removed: await projectSecrets.remove(id, name) };
    });
    return respond(response, put && request.headers['if-none-match'] === '*' ? 201 : 200, result);
  }

  async function handle(request, response, route, authorized) {
    if (!authorized) return respond(response, 401, { error: 'Sign in again to access the project store.' });
    try {
      const collection = route === '/studio/api/projects';
      const parts = route.split('/').slice(4);
      const [id, category, target, operationName] = parts;
      if (category === 'secrets' && idPattern.test(id || '')) return await handleSecrets(request, response, id, parts);
      const history = parts.length >= 2 && category === 'revisions';
      const revision = target && revisionPattern.test(target) ? Number(target) : null;
      const valid = collection || (idPattern.test(id || '') && (parts.length === 1 ||
        (history && (parts.length === 2 || (revision && (parts.length === 3 || (parts.length === 4 && ['file', 'restore'].includes(operationName))))))));
      if (!valid) throw error(404, 'Project or revision not found.');
      if (operationName === 'file') {
        if (request.method !== 'GET') throw error(405, 'Method not allowed.');
        if (!plotFiles) throw error(503, 'Protected project files are unavailable on this server.');
        const { status, payload } = await execute('revision', id, { revision });
        if (status !== 200) return respond(response, status, payload);
        return sendPlotFile(request, response, plotFiles.seal(payload.project), `checkpoint-${revision}.plot`);
      }
      let result;
      if (request.method === 'GET' && !operationName) {
        const operation = collection ? 'list' : !history ? 'get' : revision ? 'revision' : 'history';
        result = await execute(operation, id || '', revision ? { revision } : null);
      }
      else {
        const restore = operationName === 'restore' && request.method === 'POST';
        if (!restore && (collection || history || !['PUT', 'DELETE'].includes(request.method))) throw error(405, 'Method not allowed.');
        if (request.headers.origin !== origin) throw error(403, 'Request origin is not allowed.');
        const operation = restore ? 'restore' : request.method.toLowerCase();
        const expected = expectedRevision(request, operation);
        const project = operation === 'put' ? await projectBody(request) : undefined;
        const note = operation === 'put' ? checkpointNote(request) : undefined;
        result = await withProjectWrite(id, async () => {
          if (projectSecrets && operation === 'put' && expected === null && !await exists(id)) await projectSecrets.clear(id);
          const receipt = await execute(operation, id, { expected, project, note, revision });
          if (projectSecrets && operation === 'delete' && receipt.status === 200) await projectSecrets.clear(id);
          return receipt;
        });
      }
      return respond(response, result.status, result.payload);
    } catch (issue) {
      if (!request.complete) request.resume();
      if (!issue.status) console.error('Draft storage request failed:', issue.code || issue.name);
      return respond(response, issue.status || 500, { error: issue.status ? issue.message : 'Project storage failed.' });
    }
  }

  return Object.assign(handle, { exists });
}
