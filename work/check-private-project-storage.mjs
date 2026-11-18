import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDraftStore } from '../outputs/plot-studio/draft-store.mjs';
import { createPlotFileCodec } from '../outputs/plot-studio/plot-file.mjs';
import { createPrivateProjectStorage } from '../outputs/plot-studio/private-project-storage.mjs';

const directory = await mkdtemp(resolve(tmpdir(), 'plot-protection-'));
const db = resolve(directory, 'projects.sqlite3');
const id = randomUUID();
const privateName = 'Legacy-private-title-51c8c';
const privateNote = 'Legacy-private-note-a83e3';
const privateBody = 'Legacy-private-source-fae21';
const initial = { version: 1, name: privateName, pages: [{}], graph: { nodes: [], edges: [] }, source: privateBody };
const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
process.env.PLOT_PROJECT_STORAGE_KEY = randomBytes(32).toString('base64url');
const key = process.env.PLOT_PROJECT_STORAGE_KEY;
const plotFiles = createPlotFileCodec(randomBytes(32).toString('base64url'));
const storage = createPrivateProjectStorage();

function runPython(code) {
  const result = spawnSync(python, ['-c', code, db], { input: JSON.stringify({ id, initial, privateNote }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

let handler;
const server = createServer((req, res) => handler(req, res, new URL(req.url, 'http://localhost').pathname, req.headers['x-session'] === 'ok'));
try {
  runPython(`
import json, sqlite3, sys, zlib
from contextlib import closing
data = json.load(sys.stdin)
row = data['initial']
with closing(sqlite3.connect(sys.argv[1])) as db:
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, content TEXT NOT NULL)')
    db.execute('CREATE TABLE project_revisions(project_id TEXT NOT NULL, revision INTEGER NOT NULL, name TEXT NOT NULL, updated INTEGER NOT NULL, note TEXT NOT NULL, restored_from INTEGER, bytes INTEGER NOT NULL, compressed BLOB NOT NULL, PRIMARY KEY(project_id,revision))')
    body = json.dumps(row)
    packed = zlib.compress(body.encode())
    db.execute('INSERT INTO projects VALUES(?,?,?,?,?)', (data['id'],row['name'],1,100,body))
    db.execute('INSERT INTO project_revisions VALUES(?,?,?,?,?,?,?,?)', (data['id'],1,row['name'],100,data['privateNote'],None,len(packed),packed))
    db.commit()
`);

  await mkdir(resolve(directory, 'sites', 'temp-project'), { recursive: true });
  const snapshot = resolve(directory, 'sites', 'temp-project', 'snapshot.json');
  const connections = resolve(directory, 'connections.json');
  const legacyHosted = { slug: 'temp-project', project: initial };
  const legacyConnections = { service: { secret: 'Legacy-connector-credential-504ec' } };
  await writeFile(snapshot, JSON.stringify(legacyHosted));
  await writeFile(connections, JSON.stringify(legacyConnections));
  assert.ok((await readFile(db)).includes(Buffer.from(privateBody)));

  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = `${origin}/studio/api/projects`;
  handler = createDraftStore({ directory, origin, plotFiles });
  async function request(path, status, init = {}) {
    const response = await fetch(api + path, { ...init, headers: { origin, 'x-session': 'ok', ...init.headers } });
    assert.equal(response.status, status, `${init.method ?? 'GET'} ${path}`);
    return response;
  }

  await request('/' + id, 503);
  process.env.PLOT_PROJECT_STORAGE_ALLOW_LEGACY = '1';
  handler = createDraftStore({ directory, origin, plotFiles });
  const old = await (await request('/' + id, 200)).json();
  assert.deepEqual(old.project, initial);
  assert.equal((await (await request(`/${id}/revisions`, 200)).json()).revisions[0].note, privateNote);

  function migrate() {
    const result = spawnSync(process.execPath, ['outputs/plot-studio/migrate-private-projects.mjs'], {
      encoding: 'utf8', env: { ...process.env, PLOT_STATE_DIR: directory },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }

  assert.deepEqual(migrate(), { drafts: 1, revisions: 1, hosted: 1, connections: 1 });
  assert.deepEqual(migrate(), { drafts: 0, revisions: 0, hosted: 0, connections: 0 });
  const bytes = await readFile(db);
  for (const source of [privateName, privateNote, privateBody]) assert.equal(bytes.includes(Buffer.from(source)), false);
  assert.deepEqual(JSON.parse(storage.open(await readFile(snapshot), 'hosted:temp-project')), legacyHosted);
  assert.deepEqual(JSON.parse(storage.open(await readFile(connections), 'hosted-connections')), legacyConnections);
  const sealed = await readFile(snapshot);
  assert.throws(() => storage.open(sealed, 'hosted:other-site'));
  sealed[sealed.length - 1] ^= 1;
  assert.throws(() => storage.open(sealed, 'hosted:temp-project'));

  delete process.env.PLOT_PROJECT_STORAGE_ALLOW_LEGACY;
  handler = createDraftStore({ directory, origin, plotFiles });
  assert.deepEqual((await (await request('/' + id, 200)).json()).project, initial);
  assert.equal((await (await request('', 200)).json())[0].name, privateName);
  const update = { ...initial, name: 'New draft title' };
  await request('/' + id, 200, { method: 'PUT', headers: { 'if-match': '"1"', 'content-type': 'application/json', 'x-plot-checkpoint': 'Changed' }, body: JSON.stringify(update) });
  const history = await (await request(`/${id}/revisions`, 200)).json();
  assert.equal(history.name, update.name);
  assert.equal(history.revisions[1].note, privateNote);
  const secureFile = await request(`/${id}/revisions/1/file`, 200);
  assert.match(secureFile.headers.get('content-disposition'), /checkpoint-1\.plot/);
  const protectedBytes = Buffer.from(await secureFile.arrayBuffer());
  assert.equal(protectedBytes.includes(Buffer.from(privateBody)), false);
  assert.deepEqual(plotFiles.open(protectedBytes), initial);
  await request(`/${id}/revisions/1/file`, 401, { headers: { 'x-session': 'none' } });
  await request(`/${id}/revisions/1/restore`, 200, { method: 'POST', headers: { 'if-match': '"2"' } });
  assert.deepEqual((await (await request('/' + id, 200)).json()).project, initial);
  process.env.PLOT_PROJECT_STORAGE_KEY = randomBytes(32).toString('base64url');
  handler = createDraftStore({ directory, origin, plotFiles });
  await request('/' + id, 503);
  process.env.PLOT_PROJECT_STORAGE_KEY = key;
  handler = createDraftStore({ directory, origin, plotFiles });
  runPython(`
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    project_id = db.execute('SELECT id FROM projects').fetchone()[0]
    content = db.execute('SELECT content FROM projects').fetchone()[0]
    db.execute('UPDATE projects SET content=? WHERE id=?', (content[:-1]+bytes([content[-1]^1]), project_id))
`);
  await request('/' + id, 503);
  console.log('Verified legacy draft + checkpoint migration, authenticated download and restore, database and hosted encryption, tamper/wrong key rejection.');
} finally {
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  await rm(directory, { recursive: true, force: true });
}
