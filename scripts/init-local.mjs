import { randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, sep } from 'node:path';

const password = randomBytes(18).toString('base64url');
const hash = spawnSync(process.execPath, ['outputs/plot-studio/server.mjs', 'hash'], { input: password, encoding: 'utf8' });
if (hash.status !== 0) throw new Error('Could not create the local operator password.');
const key = () => randomBytes(32).toString('base64url');
const settings = [
  'PORT=14990',
  'PUBLIC_ORIGIN=http://localhost:14990',
  `PLOT_STATE_DIR=${JSON.stringify(resolve('.plot-data').split(sep).join('/'))}`,
  `STUDIO_PASSWORD_HASH=${hash.stdout.trim()}`,
  `STUDIO_SESSION_SECRET=${key()}`,
  `PLOT_PROJECT_STORAGE_KEY=${key()}`,
  `PLOT_FILE_KEY=${key()}`,
  'PLOT_STUDIO_ALIAS_ROTATION=0',
  'PLOT_STUDIO_DISTRIBUTED_BOOT=0',
  'PLOT_EXAM_DELIVERY_MODE=manual',
];
const file = await open('.env', 'wx', 0o600);
try { await file.writeFile(settings.join('\n') + '\n'); }
finally { await file.close(); }
console.log('Created .env with independent local encryption keys.');
console.log(`Local operator password: ${password}`);
console.log('Start with npm start, then open http://localhost:14990/admin/sign-in.');
