import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createPrivateProjectStorage } from './private-project-storage.mjs';

export const accountId = /^[a-f0-9]{32}$/;
export const accountEmail = raw => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value) ? value : '';
};
const licenseHash = value => createHash('sha256').update(value).digest('hex');
export const licensePattern = /^PLOT-[A-Za-z0-9_-]{32}$/;
const newLicense = () => `PLOT-${randomBytes(24).toString('base64url')}`;
const failure = (status, message) => Object.assign(new Error(message), { status });
const derivePassword = promisify(scrypt);
const passwordOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const passwordHashPattern = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export function createWorkspaceAccounts(directory) {
  if (!directory) return null;
  const file = resolve(directory, 'workspace-accounts.bin');
  const cipher = createPrivateProjectStorage();
  const scope = 'studio-workspace-accounts-v1';
  const unknown = licenseHash(newLicense());
  const dummyPasswordHash = `${randomBytes(16).toString('base64url')}.${randomBytes(32).toString('base64url')}`;
  let loaded;
  let queue = Promise.resolve();

  function records() {
    loaded ||= readFile(file).then(bytes => {
      const result = JSON.parse(cipher.open(bytes, scope).toString('utf8'));
      if (!Array.isArray(result) || result.some(row => !accountId.test(row?.id) || !accountEmail(row?.email) ||
          !/^[a-f0-9]{64}$/.test(row?.hash) || (row.passwordHash !== undefined && !passwordHashPattern.test(row.passwordHash)))) {
        throw new Error('The workspace account store is invalid.');
      }
      return result;
    }, issue => {
      if (issue.code === 'ENOENT') return [];
      throw issue;
    }).catch(issue => { loaded = null; throw issue; });
    return loaded;
  }

  function update(edit) {
    const operation = queue.then(async () => {
      const all = (await records()).map(record => ({ ...record }));
      const result = edit(all);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await writeFile(temporary, cipher.seal(JSON.stringify(all), scope), { mode: 0o600, flag: 'wx', flush: true });
        await rename(temporary, file);
      } catch (issue) {
        await rm(temporary, { force: true }).catch(() => {});
        throw issue;
      }
      loaded = Promise.resolve(all);
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  function matches(row, license) {
    const accepted = typeof license === 'string' && licensePattern.test(license);
    return timingSafeEqual(Buffer.from(licenseHash(accepted ? license : ''), 'hex'), Buffer.from(row?.hash || unknown, 'hex')) && accepted;
  }

  const view = ({ id, email, activatedAt, revoked, issuedAt }) => ({ id, email, activatedAt, revoked, issuedAt });
  return {
    async list() { return (await records()).map(view).reverse(); },
    async find(id) { const row = (await records()).find(record => record.id === id); return row?.activatedAt ? view(row) : null; },
    async findEmail(email) { const row = (await records()).find(record => record.email === accountEmail(email)); return row?.activatedAt && !row.revoked ? view(row) : null; },
    issue(email) {
      return update(all => {
        if (all.some(row => row.email === email)) throw failure(409, 'This email already has a licence. Use Replace key to issue a new one.');
        if (all.length >= 500) throw failure(409, 'The workspace account limit has been reached.');
        const license = newLicense();
        const record = { id: randomBytes(16).toString('hex'), email, hash: licenseHash(license), issuedAt: Date.now(), activatedAt: null, revoked: false };
        all.push(record);
        return { ...view(record), license };
      });
    },
    async provision(email, password) {
      const bytes = Buffer.byteLength(password);
      if (bytes < 12 || bytes > 128 || licensePattern.test(password)) throw failure(400, 'Enter a password between 12 and 128 bytes.');
      const salt = randomBytes(16);
      const digest = await derivePassword(password, salt, 32, passwordOptions);
      const passwordHash = `${salt.toString('base64url')}.${digest.toString('base64url')}`;
      return update(all => {
        let row = all.find(record => record.email === email);
        if (row?.revoked) throw failure(409, 'Replace the revoked licence before setting an account password.');
        const now = Date.now();
        if (!row) {
          if (all.length >= 500) throw failure(409, 'The workspace account limit has been reached.');
          row = { id: randomBytes(16).toString('hex'), email, hash: licenseHash(newLicense()), issuedAt: now, activatedAt: now, revoked: false };
          all.push(row);
        }
        row.activatedAt ||= now;
        row.passwordHash = passwordHash;
        return view(row);
      });
    },
    change(id, action) {
      return update(all => {
        const row = all.find(entry => entry.id === id);
        if (!row) throw failure(404, 'That licence was not found.');
        delete row.passwordHash;
        if (action === 'revoke') { row.revoked = true; return view(row); }
        const license = newLicense();
        row.hash = licenseHash(license);
        row.revoked = false;
        row.issuedAt = Date.now();
        return { ...view(row), license };
      });
    },
    async signIn(email, license) {
      const row = (await records()).find(entry => entry.email === email);
      if (!matches(row, license) || !row?.activatedAt || row.revoked) return null;
      return view(row);
    },
    async signInWithPassword(email, password) {
      if (Buffer.byteLength(password) > 128) return null;
      const row = (await records()).find(entry => entry.email === email);
      const savedHash = row?.passwordHash || dummyPasswordHash;
      const [salt, digest] = savedHash.split('.').map(part => Buffer.from(part, 'base64url'));
      const supplied = await derivePassword(password, salt, 32, passwordOptions);
      if (!timingSafeEqual(supplied, digest) || !row?.passwordHash) return null;
      const active = (await records()).find(entry => entry.id === row.id);
      return active?.passwordHash === savedHash && active.activatedAt && !active.revoked ? view(active) : null;
    },
    register(email, license) {
      return update(all => {
        const row = all.find(entry => entry.email === email);
        if (!matches(row, license) || !row || row.revoked) throw failure(401, 'The email and licence key could not be matched.');
        if (row.activatedAt) throw failure(409, 'This licence is already active. Sign in with the same email and key.');
        row.activatedAt = Date.now();
        return view(row);
      });
    },
  };
}
