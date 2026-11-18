import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateProjectStorage, deriveProjectStorageKey } from './private-project-storage.mjs';

const directory = process.env.PLOT_STATE_DIR;
if (!directory) throw new Error('Load a PLOT_STATE_DIR before running the private project migration.');

const storage = createPrivateProjectStorage();
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

async function migrateRecord(file, scope, validate) {
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  if (storage.isSealed(bytes)) {
    storage.open(bytes, scope);
    return 0;
  }
  let legacy;
  try { legacy = JSON.parse(bytes); }
  catch { throw new Error('A legacy private project record is unreadable.'); }
  if (!validate(legacy)) throw new Error('A legacy private project record has an invalid shape.');
  const temporary = resolve(dirname(file), `.project-protection-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, storage.seal(bytes, scope), { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return 1;
}

const database = resolve(directory, 'projects.sqlite3');
let draftCounts = { drafts: 0, revisions: 0 };
if (existsSync(database)) {
  const python = process.env.PLOT_PROJECT_STORE_PYTHON || process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const worker = fileURLToPath(new URL('./draft_store.py', import.meta.url));
  const environment = { ...process.env };
  delete environment.PLOT_PROJECT_STORAGE_KEY;
  delete environment.PLOT_FILE_KEY;
  const child = spawnSync(python, [worker, database, 'migrate', ''], {
    input: JSON.stringify({ key: deriveProjectStorageKey('sqlite-drafts').toString('base64url'), payload: null }),
    encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'], env: environment,
  });
  if (child.status !== 0) throw new Error('The private draft migration failed.');
  const result = JSON.parse(child.stdout);
  if (result.status !== 200) throw new Error('The private draft migration did not complete.');
  draftCounts = result.payload;
}

const object = input => input && typeof input === 'object' && !Array.isArray(input);
const sites = resolve(directory, 'sites');
let hosted = 0;
let folders;
try { folders = await readdir(sites, { withFileTypes: true }); }
catch (error) { if (error.code !== 'ENOENT') throw error; folders = []; }
for (const folder of folders) {
  if (!folder.isDirectory() || !slugPattern.test(folder.name)) continue;
  hosted += await migrateRecord(resolve(sites, folder.name, 'snapshot.json'), `hosted:${folder.name}`,
    record => object(record) && record.slug === folder.name && object(record.project));
}
const connections = await migrateRecord(resolve(directory, 'connections.json'), 'hosted-connections', object);
console.log(JSON.stringify({ ...draftCounts, hosted, connections }));
