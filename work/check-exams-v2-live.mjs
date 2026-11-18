import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = 'https://plotstudio.pro';
const [builderInvite, architectInvite, builderProject, architectProject] = process.argv.slice(2);
async function call(route, { token, body, status = 200 } = {}) {
  const response = await fetch(`${origin}/certification/api/${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${route}: ${data.error || ''}`);
  return data;
}

const offers = await call('offers');
for (const [exam, count, price, breakCount, breakMinutes, invite, projectFile] of [
  ['builder', 24, 8000, 1, 60, builderInvite, builderProject],
  ['architect', 42, 15000, 3, 45, architectInvite, architectProject],
]) {
  assert.equal(offers[exam].taskCount, count);
  assert.equal(offers[exam].amount, price);
  assert.equal(offers[exam].available, true);
  const link = JSON.parse(await readFile(invite, 'utf8')).accessLink;
  const accessToken = new URLSearchParams(new URL(link).hash.slice(1)).get('access');
  const { token, enrolment } = await call('access/redeem', { body: { accessToken } });
  assert.equal(enrolment.assessmentVersion, 2);
  assert.equal(enrolment.taskCount, count);
  assert.equal(enrolment.testAttempt, true);
  assert.equal(enrolment.brief, undefined);
  const started = await call('timer/start', { token, body: {} });
  assert.equal(started.brief.tasks.length, count);
  assert.equal(started.timer.maxBreaks, breakCount);
  assert.equal(started.timer.breakDurationMs, breakMinutes * 60000);
  const project = JSON.parse(await readFile(projectFile, 'utf8'));
  const scored = await call('submission', { token, body: { project } });
  assert.equal(scored.latestResult.checks.length, count);
  assert.equal(scored.latestResult.passed, true);
  assert.equal(scored.latestResult.score, 100);
  assert.equal(scored.certificate, null);
  console.log(`Live ${exam}: v2, ${count} real checks, 100/100 reference, no public trial certificate`);
}
