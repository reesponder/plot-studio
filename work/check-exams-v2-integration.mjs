import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessmentFor } from '../outputs/plot-studio/exam-assessments.mjs';
import { signedLink } from '../outputs/plot-studio/exam-mail.mjs';
import { certificationTermsVersion, createExamService } from '../outputs/plot-studio/exams.mjs';

const key = randomBytes(32);
const state = await mkdtemp(join(tmpdir(), 'plot-assessment-check-'));
const database = join(state, 'certification.sqlite3');
const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const script = name => fileURLToPath(new URL(`../outputs/plot-studio/${name}`, import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
Object.assign(process.env, { PLOT_EXAM_ACCESS_SECRET: key.toString('base64url'), PLOT_EXAM_DELIVERY_MODE: 'manual', PUBLIC_ORIGIN: 'https://plotstudio.pro', PLOT_STATE_DIR: state });

function databaseOperation(operation, values, expected) {
  const result = spawnSync(python, ['-B', script('exam_store.py'), database, operation], { input: JSON.stringify(values), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const { status, payload } = JSON.parse(result.stdout);
  assert.equal(status, expected, JSON.stringify(payload));
  return payload;
}

const atMs = Date.now();
const legacy = {
  id: 'exam_enr_' + randomBytes(16).toString('hex'), tokenHash: hash(randomBytes(32)), name: 'Legacy QA',
  email: 'legacy@example.invalid', acceptedAt: new Date(atMs).toISOString(), termsVersion: certificationTermsVersion,
  inviteNonce: randomBytes(18).toString('base64url'), atMs,
};
databaseOperation('qa_builder_create', legacy, 201);

function createTrial(exam) {
  const result = spawnSync(process.execPath, [script('exam-manual.mjs'), `trial-${exam}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const row = JSON.parse(result.stdout);
  const reference = databaseOperation('reference', { id: row.enrolment }, 200);
  assert.equal(reference.assessment_version, 2);
  assert.equal(reference.amount, 0);
  assert.equal(reference.stripe_session, null);
  return row.accessLink;
}

let service;
const server = createServer((req, res) => service(req, res, new URL(req.url, 'http://localhost')));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  service = createExamService({ directory: state, origin, clientIp: req => req.headers['x-assessment-test-client'] || '127.0.0.1' });
  let simulatedClient = 'offers';
  async function request(endpoint, { token, body, status = 200, type } = {}) {
    const response = await fetch(`${origin}/certification/api/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { origin, 'x-assessment-test-client': simulatedClient, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.text();
    assert.equal(response.status, status, `${endpoint}: ${data.slice(0, 500)}`);
    if (type) assert.match(response.headers.get('content-disposition') ?? '', type);
    return JSON.parse(data);
  }

  const offers = await request('offers');
  assert.equal(offers.builder.taskCount, 24);
  assert.equal(offers.architect.taskCount, 42);
  const matrix = [
    { exam: 'builder', version: 1, count: 5, hours: 6, checks: 7, link: signedLink(origin, key, { enrolment: legacy.id, nonce: legacy.inviteNonce }) },
    { exam: 'builder', version: 2, count: 24, hours: 6, checks: 24, link: createTrial('builder'), file: process.argv[2] },
    { exam: 'architect', version: 2, count: 42, hours: 10, checks: 42, link: createTrial('architect'), file: process.argv[3] },
  ];
  for (const row of matrix) {
    simulatedClient = `${row.exam}-${row.version}`;
    const accessToken = new URLSearchParams(new URL(row.link).hash.slice(1)).get('access');
    const { token, enrolment } = await request('access/redeem', { body: { accessToken } });
    assert.equal(enrolment.assessmentVersion, row.version);
    assert.equal(enrolment.taskCount, row.count);
    assert.equal(enrolment.testAttempt, true);
    assert.equal(enrolment.brief, undefined);
    await request('access/redeem', { body: { accessToken }, status: 409 });
    await request(`starter/${row.exam}`, { token, status: 409 });
    const started = await request('timer/start', { token, body: {} });
    assert.equal(started.timer.workDurationMs, row.hours * 60 * 60 * 1000);
    assert.equal(started.brief.tasks.length, row.count);
    const starter = await request(`starter/${row.exam}`, { token, type: /\.plot"/ });
    assert.deepEqual(starter.pages.map(page => page.slug), assessmentFor(row.exam, row.version).starter().pages.map(page => page.slug));
    const paused = await request('timer/pause', { token, body: {} });
    assert.equal(paused.timer.state, 'paused');
    assert.equal(paused.brief, undefined);
    await request('submission', { token, body: { project: starter }, status: 409 });
    await request('timer/resume', { token, body: {} });
    const blank = await request('submission', { token, body: { project: starter } });
    assert.equal(blank.attempts, 1);
    assert.equal(blank.latestResult.passed, false);
    assert.equal(blank.latestResult.checks.length, row.checks);
    assert.ok(blank.latestResult.score < enrolment.passScore);
    const same = await request('submission', { token, body: { project: starter } });
    assert.equal(same.attempts, 1);
    console.log(`${row.exam} v${row.version}: ${row.count} tasks, ${row.checks} checks, starter ${blank.latestResult.score}/100`);
    if (row.file && row.file !== '-') {
      const project = JSON.parse(await readFile(row.file, 'utf8'));
      const success = await request('submission', { token, body: { project } });
      assert.equal(success.latestResult.passed, true, JSON.stringify(success.latestResult.checks.filter(check => !check.passed)));
      assert.equal(success.latestResult.score, 100);
      assert.equal(success.attempts, 2);
      assert.equal(success.certificate, null);
      assert.equal(success.timer.state, 'complete');
      await request('certificate', { token, body: { publishCertificate: true }, status: 403 });
      assert.equal((await request('enrolment', { token })).latestResult.score, 100);
      console.log(`${row.exam} v${row.version}: reference submission graded 100/100, private trial certificate blocked`);
    }
  }
  const sample = await request('certificates/PLOT-SAMPLE-BUILDER');
  assert.equal(sample.sample, true);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(state, { force: true, recursive: true });
}
