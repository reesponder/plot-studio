import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectSecrets } from '../outputs/plot-studio/project-secrets.mjs';

const directory = await mkdtemp(join(tmpdir(), 'plot-project-secrets-'));
process.env.PLOT_PROJECT_STORAGE_KEY = randomBytes(32).toString('base64url');
const vault = createProjectSecrets({ directory });
const first = randomUUID();
const second = randomUUID();
const unknown = randomUUID();
const name = 'PLOT_SECRET_WIDGET';
const value = ' synthetic key ' + randomBytes(24).toString('hex') + '\r\n🔒 ';
const vaultDirectory = join(directory, 'project-secrets');
const firstFile = join(vaultDirectory, `${first}.sealed`);
const secondFile = join(vaultDirectory, `${second}.sealed`);

try {
  assert.deepEqual(await vault.list(first), []);
  const metadata = await vault.put(first, name, value);
  assert.deepEqual(await vault.list(first), [metadata]);
  assert.deepEqual(Object.keys(metadata).sort(), ['name', 'updatedAt']);
  assert.equal(typeof metadata.updatedAt, 'number');
  assert.equal((await vault.values(first))[name], value);
  assert.equal((await vault.values(second))[name], undefined);
  assert.equal((await createProjectSecrets({ directory }).values(first))[name], value);
  const sealed = await readFile(firstFile);
  assert.equal(sealed.subarray(0, 8).toString(), 'PLOTPS1\0');
  assert.ok(!sealed.includes(Buffer.from(name)));
  assert.ok(!sealed.includes(Buffer.from(value)));

  await copyFile(firstFile, secondFile);
  await assert.rejects(vault.values(second), { status: 500 });
  await vault.clear(second);
  assert.deepEqual(await vault.list(second), []);

  const corrupt = Buffer.from(sealed);
  corrupt[corrupt.length - 1] ^= 1;
  await writeFile(firstFile, corrupt);
  await assert.rejects(vault.list(first), { status: 500 });
  await assert.rejects(vault.put(first, name, 'replacement'), { status: 500 });
  await writeFile(firstFile, sealed);

  await Promise.all(Array.from({ length: 16 }, (_, index) => vault.put(first, `PLOT_SECRET_${index}`, `value-${index}`)));
  assert.equal((await vault.list(first)).length, 17);
  assert.equal((await vault.values(first)).PLOT_SECRET_15, 'value-15');
  const rotated = value + 'rotated';
  await vault.put(first, name, rotated);
  assert.equal((await vault.values(first))[name], rotated);
  assert.equal(await vault.remove(first, name), true);
  assert.equal(await vault.remove(first, name), false);
  assert.equal((await vault.values(first))[name], undefined);
  assert.deepEqual(await readdir(vaultDirectory), [`${first}.sealed`]);

  await assert.rejects(vault.put(first, 'PLOT_API_KEY', value), { status: 422 });
  await assert.rejects(vault.put('../outside', name, value), { status: 404 });
  await assert.rejects(vault.put(first, name, 'é'.repeat(4097)), { status: 422 });
  await assert.rejects(vault.put(first, name, '\uD800'), { status: 422 });
  const inFlight = vault.put(first, name, value);
  const clear = vault.clear(first);
  await Promise.all([inFlight, clear]);
  assert.deepEqual(await vault.list(first), []);
  assert.deepEqual(await vault.list(unknown), []);
  assert.deepEqual(await readdir(vaultDirectory), []);
  console.log('Encrypted project secrets passed: metadata, UTF-8 values, project binding, tamper detection, concurrent writes, rotation, deletion, and recovery.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
