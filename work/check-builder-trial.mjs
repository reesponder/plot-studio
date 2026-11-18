import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { certificationTermsVersion, createExamService } from '../outputs/plot-studio/exams.mjs';
import { signedLink } from '../outputs/plot-studio/exam-mail.mjs';
import { starterProject } from '../outputs/plot-studio/exam-grader.mjs';

const key = randomBytes(32);
process.env.PLOT_EXAM_ACCESS_SECRET = key.toString('base64url');
process.env.PLOT_EXAM_DELIVERY_MODE = 'manual';
const directory = await mkdtemp(resolve('work', 'builder-trial-qa-'));
const database = resolve(directory, 'certification.sqlite3');
const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => 'PX_' + randomBytes(32).toString('base64url');
const rowId = () => 'exam_enr_' + randomBytes(16).toString('hex');

function store(operation, payload, expectedStatus = 200) {
  const process = spawnSync(python, ['-B', 'outputs/plot-studio/exam_store.py', database, operation], {
    input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(process.status, 0, process.stderr);
  const result = JSON.parse(process.stdout);
  assert.equal(result.status, expectedStatus, process.stdout);
  return result.payload;
}

const atMs = Date.now();
const initialToken = token();
const details = { id: rowId(), tokenHash: hash(initialToken), name: 'Builder QA', email: 'builder-qa@example.invalid',
  termsVersion: certificationTermsVersion, acceptedAt: new Date(atMs).toISOString(), inviteNonce: randomBytes(18).toString('base64url'), atMs };
assert.deepEqual(store('qa_builder_create', details, 201), { created: true });
const row = store('reference', { id: details.id });
assert.equal(row.exam, 'builder');
assert.equal(row.state, 'paid');
assert.equal(row.price_id, 'internal_builder_trial');
assert.equal(row.amount, 0);
assert.equal(row.stripe_session, null);
assert.equal(row.stripe_intent, null);
assert.equal(row.payment_link_id, null);
assert.equal(row.timer.state, 'not_started');
assert.equal(row.timer.workDurationMs, 6 * 60 * 60 * 1000);
const link = store('manual_link', { enrolment: details.id });
assert.equal(link.expires_ms - atMs, 7 * 24 * 60 * 60 * 1000);
assert.equal(link.sent_ms, atMs);
assert.deepEqual(store('manual_queue', {}), []);
assert.equal(store('claim_mail', { lease: 'builder-trial-mail-qa' }), null);
store('qa_builder_create', { ...details, id: rowId(), termsVersion: '2026-11-16-certification-r2' }, 422);

const server = createServer((req, res) => service(req, res, new URL(req.url, origin)));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const service = createExamService({ directory, origin, clientIp: () => '127.0.0.1' });
async function api(name, { recovery, body, status = 200 } = {}) {
  const response = await fetch(`${origin}/certification/api/${name}`, {
    method: body ? 'POST' : 'GET',
    headers: { origin, ...(recovery ? { Authorization: `Bearer ${recovery}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, status, name + ' ' + response.status);
  return response.json();
}

try {
  const pre = await api('enrolment', { recovery: initialToken });
  assert.equal(pre.accessGranted, false);
  assert.equal(pre.testAttempt, true);
  assert.equal(pre.certificate, null);
  const accessToken = new URLSearchParams(new URL(signedLink(origin, key, link)).hash.slice(1)).get('access');
  const { token: recovery, enrolment } = await api('access/redeem', { body: { accessToken } });
  assert.equal(enrolment.testAttempt, true);
  assert.equal(enrolment.accessGranted, true);
  assert.equal(enrolment.timer.state, 'not_started');
  await api('access/redeem', { body: { accessToken }, status: 409 });
  await api('starter/builder', { recovery, status: 409 });
  const started = await api('timer/start', { recovery, body: {} });
  assert.equal(started.timer.state, 'running');
  assert.ok(started.brief);
  const received = await api('starter/builder', { recovery });
  assert.ok(received.pages.length);
  const attempted = await api('submission', { recovery, body: { project: starterProject('builder') } });
  assert.equal(attempted.attempts, 1);
  assert.equal(attempted.latestResult.passed, false);
  assert.equal(attempted.testAttempt, true);
  assert.equal(attempted.certificate, null);

  const attempt = { tokenHash: hash(recovery), projectHash: hash('passing-regression-fixture'), lease: 'cert-opt-out-fixture', acceptedMs: Date.now() };
  const mockCertificate = 'PLOT-' + '1'.repeat(18);
  store('reserve_submission', attempt);
  const passed = store('submission', { ...attempt, result: { passed: true }, at: details.acceptedAt, publishCertificate: true, certificateId: mockCertificate });
  assert.equal(passed.state, 'passed');
  assert.equal(passed.certificate_id, null);
  assert.equal(passed.issued_at, null);
  assert.equal(passed.timer.state, 'complete');
  const passedHttp = await api('enrolment', { recovery });
  assert.equal(passedHttp.testAttempt, true);
  assert.equal(passedHttp.certificate, null);
  await api('certificate', { recovery, body: { publishCertificate: true }, status: 403 });
  await api('certificate.pdf', { recovery, status: 404 });
  await api('certificates/' + mockCertificate, { status: 404 });

  const regularToken = token();
  const regularId = rowId();
  store('create', { ...details, id: regularId, tokenHash: hash(regularToken), exam: 'builder', checkoutKind: 'embedded',
    priceId: 'price_Standard', amount: 8000, termsVersion: '2026-11-16-certification' }, 201);
  store('activate', { id: regularId, at: details.acceptedAt, atMs, session: 'cs_test_fixture', intent: 'pi_fixture' });
  const regular = await api('enrolment', { recovery: regularToken });
  assert.equal(Object.hasOwn(regular, 'testAttempt'), false);
  const regularAttempt = { ...attempt, tokenHash: hash(regularToken) };
  store('reserve_submission', regularAttempt);
  const issued = store('submission', { ...regularAttempt, result: { passed: true }, at: details.acceptedAt, publishCertificate: true, certificateId: mockCertificate });
  assert.equal(issued.certificate_id, mockCertificate);
  assert.equal((await api('certificates/' + mockCertificate)).id, mockCertificate);
  console.log('Trial invitation, redemption, timer, real grading, and certificate lockout verified against an isolated SQLite database.');
} finally {
  await new Promise(resolve => server.close(resolve));
}
