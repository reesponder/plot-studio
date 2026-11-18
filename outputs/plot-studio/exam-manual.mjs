import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examAccessSigningKey, signedLink } from './exam-mail.mjs';
import { certificationTermsVersion } from './exams.mjs';
import { currentAssessmentVersion } from './exam-assessments.mjs';

function productionOrigin() {
  const origin = new URL(process.env.PUBLIC_ORIGIN || 'https://plotstudio.pro');
  if (origin.protocol !== 'https:' || origin.href !== `${origin.origin}/`) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin.');
  return origin;
}

function run() {
  const [action, enrolment, ...extra] = process.argv.slice(2);
  const operations = { list: 'manual_queue', link: 'manual_link', 'mark-sent': 'manual_sent', 'trial-builder': 'qa_builder_create', 'trial-architect': 'qa_architect_create' };
  const takesId = action === 'link' || action === 'mark-sent';
  if (extra.length || !Object.hasOwn(operations, action) ||
      (takesId ? !/^exam_enr_[a-f0-9]{32}$/.test(enrolment ?? '') : enrolment !== undefined)) {
    throw new Error('Usage: node exam-manual.mjs list | link <enrolment-id> | mark-sent <enrolment-id> | trial-builder | trial-architect');
  }

  const key = examAccessSigningKey();
  const directory = process.env.PLOT_STATE_DIR;
  if (process.env.PLOT_EXAM_DELIVERY_MODE !== 'manual' || !directory || !key) {
    throw new Error('Load the production state directory, manual delivery mode and exam access signing configuration.');
  }
  const database = resolve(directory, 'certification.sqlite3');
  if (!existsSync(database)) throw new Error('The certification database does not exist yet.');
  const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const worker = fileURLToPath(new URL('./exam_store.py', import.meta.url));
  if (action === 'trial-builder' || action === 'trial-architect') {
    const origin = productionOrigin();
    const id = 'exam_enr_' + randomBytes(16).toString('hex');
    const inviteNonce = randomBytes(18).toString('base64url');
    const atMs = Date.now();
    const result = spawnSync(python, [worker, database, operations[action]], {
      input: JSON.stringify({
        id,
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        name: 'Codex (test)',
        email: action === 'trial-builder' ? 'builder-trial@example.invalid' : 'architect-trial@example.invalid',
        acceptedAt: new Date(atMs).toISOString(),
        termsVersion: certificationTermsVersion,
        assessmentVersion: currentAssessmentVersion,
        inviteNonce,
        atMs,
      }),
      encoding: 'utf8',
      timeout: 11000,
    });
    if (result.error || result.status !== 0 || JSON.parse(result.stdout).status !== 201) {
      throw new Error('The test enrolment could not be created.');
    }
    console.log(JSON.stringify({ enrolment: id, accessLink: signedLink(origin, key, { enrolment: id, nonce: inviteNonce }) }));
    return;
  }
  const result = spawnSync(python, [worker, database, operations[action]], {
    input: JSON.stringify({ enrolment }), encoding: 'utf8', timeout: 11000,
  });
  if (result.error || result.status !== 0) throw new Error('The certification database could not be read.');
  const { payload } = JSON.parse(result.stdout);
  if (action === 'link') {
    if (!payload) throw new Error('No active, unused link matches this paid enrolment.');
    const { nonce, ...recipient } = payload;
    console.log(JSON.stringify({ ...recipient, accessLink: signedLink(productionOrigin(), key, { enrolment, nonce }) }, null, 2));
  } else {
    if (action === 'mark-sent' && !payload.updated) throw new Error('No active, unused link matches this paid enrolment.');
    console.log(JSON.stringify(payload, null, 2));
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
