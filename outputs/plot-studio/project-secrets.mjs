import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPrivateProjectStorage } from './private-project-storage.mjs';

const projectIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const secretNamePattern = /^PLOT_SECRET_[A-Z0-9_]{1,60}$/;
const maxValueBytes = 8192;
const maxProjectBytes = 128 * 1024;
const maxProjectSecrets = 64;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function validValue(value) {
  return typeof value === 'string' && value.length > 0 && !/[\u0000\uD800-\uDFFF]/u.test(value) && Buffer.byteLength(value) <= maxValueBytes;
}

function validName(name) {
  return typeof name === 'string' && secretNamePattern.test(name);
}

export function createProjectSecrets({ directory, privateProjects = directory ? createPrivateProjectStorage() : null }) {
  const root = directory ? resolve(directory, 'project-secrets') : null;
  const writes = new Map();

  function vaultPath(id) {
    if (!root) throw fail(503, 'Project secrets require a configured Studio state directory.');
    if (typeof id !== 'string' || !projectIdPattern.test(id)) throw fail(404, 'Project not found.');
    return resolve(root, `${id}.sealed`);
  }

  function scope(id) {
    return `project-secrets:${id}`;
  }

  async function read(id) {
    const path = vaultPath(id);
    const bytes = await readFile(path).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!bytes) return new Map();
    try {
      const record = JSON.parse(privateProjects.open(bytes, scope(id)));
      if (record?.version !== 1 || !Array.isArray(record.entries) || record.entries.length > maxProjectSecrets) throw new Error();
      const entries = new Map();
      let valueBytes = 0;
      for (const entry of record.entries) {
        if (!validName(entry?.name) || !validValue(entry.value) || !Number.isSafeInteger(entry.updatedAt) ||
            entry.updatedAt <= 0 || entries.has(entry.name)) throw new Error();
        entries.set(entry.name, entry);
        valueBytes += Buffer.byteLength(entry.value);
      }
      if (valueBytes > maxProjectBytes) throw new Error();
      return entries;
    } catch {
      throw fail(500, 'The encrypted project secrets could not be opened.');
    }
  }

  async function save(id, entries) {
    const path = vaultPath(id);
    if (entries.size === 0) {
      await rm(path, { force: true });
      return;
    }
    const record = JSON.stringify({ version: 1, entries: [...entries.values()] });
    const bytes = privateProjects.seal(record, scope(id));
    await mkdir(root, { recursive: true, mode: 0o700 });
    const temporary = resolve(root, `.${id}.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  function update(id, operation) {
    vaultPath(id);
    const next = (writes.get(id) ?? Promise.resolve()).then(operation);
    const settled = next.then(() => {}, () => {});
    writes.set(id, settled);
    return next.finally(() => {
      if (writes.get(id) === settled) writes.delete(id);
    });
  }

  return {
    async list(id) {
      const entries = await read(id);
      return [...entries.values()].map(({ name, updatedAt }) => ({ name, updatedAt }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async values(id) {
      const entries = await read(id);
      const values = Object.create(null);
      for (const [name, entry] of entries) values[name] = entry.value;
      return values;
    },
    async put(id, name, value) {
      if (!validName(name)) throw fail(422, 'Use PLOT_SECRET_ followed by 1 to 60 uppercase letters, digits, or underscores.');
      if (!validValue(value)) throw fail(422, 'Enter a nonempty UTF-8 secret value up to 8 KiB without null characters.');
      return update(id, async () => {
        const entries = await read(id);
        const updatedAt = Date.now();
        entries.set(name, { name, value, updatedAt });
        if (entries.size > maxProjectSecrets) throw fail(422, 'This project has reached its 64 secret limit.');
        const valueBytes = [...entries.values()].reduce((sum, entry) => sum + Buffer.byteLength(entry.value), 0);
        if (valueBytes > maxProjectBytes) throw fail(422, 'This project has reached its 128 KiB secret storage limit.');
        await save(id, entries);
        return { name, updatedAt };
      });
    },
    async remove(id, name) {
      if (!validName(name)) throw fail(422, 'Enter a valid project secret alias.');
      return update(id, async () => {
        const entries = await read(id);
        if (!entries.delete(name)) return false;
        await save(id, entries);
        return true;
      });
    },
    async clear(id) {
      return update(id, () => rm(vaultPath(id), { force: true }));
    },
  };
}
