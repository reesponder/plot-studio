import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { architectV2Brief, architectV2Starter, gradeArchitectV2 } from '../outputs/plot-studio/exam-architect-v2.mjs';
import { createBlock, deserializeProject, serializeProject } from '../outputs/plot-studio/project.mjs';

const step = (id, type, args = {}, links = {}) => ({ id, type, args, ...links });
const ref = path => ({ $ref: path });
const value = (id, path = '') => ref(`steps.${id}.value${path ? '.' + path : ''}`);
const input = (label, kind) => createBlock('input', { id: `${label.toLowerCase()}-field`, props: { label, name: label.toLowerCase(), kind, required: true } });
const block = (type, id, props, children, styles) => createBlock(type, { id, props, children, styles });
const body = key => ref(`request.body.${key}`);
const statusRow = id => ({ id: value(id, 'id'), status: value(id, 'f-status'), seats: value(id, 'f-seats') });
const table = 'workshop-records';
const requests = '/api/workshop-requests';
const route = (id, method, path, access, steps) => ({ id, name: id, method, path, access, steps });
const routeFields = [
  ['f-email', 'Email', 'email', true], ['f-seats', 'Seats', 'integer', true], ['f-status', 'Status', 'text', true],
  ['f-event', 'Event ID', 'text', false], ['f-digest', 'Event digest', 'text', false],
].map(([id, name, type, required]) => ({ id, name, type, required }));

export function exampleArchitectV2() {
  const project = architectV2Starter();
  project.pages[0].blocks = [
    block('heading', 'title', { tag: 'h1', text: 'Reserve space at a repair workshop' }),
    block('columns', 'intake-columns', { columns: '2' }, [
      block('form', 'intake-form', { usePreset: false, title: 'Request seats', buttonText: 'Request workshop seats' }, [input('Email', 'email'), input('Seats', 'number')]),
      block('section', 'participant-information', {}, [
        block('text', 'seat-policy', { text: 'Each participant can ask for between one and six workshop seats.' }),
        block('button', 'to-help', { text: 'Workshop help', href: 'page:northline-help' }),
      ]),
    ], { mobile: { gridTemplateColumns: '1fr' } }),
    block('text', 'confirmation', { text: 'Your request is waiting to be submitted.' }),
  ];
  project.pages.push({ id: 'northline-help', slug: 'help', name: 'Workshop help', blocks: [
    block('heading', 'help-title', { tag: 'h1', text: 'About our repair workshops' }),
    block('text', 'help-instructions', { text: 'An operator will confirm whether the requested seat count is available.' }),
    block('button', 'back-to-intake', { text: 'Back to seat requests', href: 'page:northline-intake' }),
  ] });
  const node = (id, type, config) => ({ id, type, x: 0, y: 0, config });
  const edge = (id, from, port, to, inputPort) => ({ id, from: { nodeId: from, port }, to: { nodeId: to, port: inputPort } });
  project.graph = {
    nodes: [node('send-form', 'submit', { target: 'intake-form', preventDefault: true }),
      node('api-call', 'call-backend', { method: 'POST', path: requests }),
      node('show-success', 'set-text', { target: 'confirmation', value: 'Your workshop request was received.' }),
      node('show-failure', 'set-text', { target: 'confirmation', value: 'Check your email and choose 1 to 6 seats, then try again.' })],
    edges: [edge('connect-send', 'send-form', 'next', 'api-call', 'in'), edge('copy-fields', 'send-form', 'fields', 'api-call', 'body'),
      edge('success-output', 'api-call', 'next', 'show-success', 'in'), edge('error-output', 'api-call', 'fault', 'show-failure', 'in')],
  };
  project.data = { tables: [{ id: table, name: 'Workshop requests', rows: [], permissions: {}, fields: routeFields }] };
  project.backend = { version: 1, routes: [
    route('intake', 'POST', requests, 'public', [
      step('email', 'require-email', { value: body('email') }),
      step('parse-seats', 'to-number', { value: body('seats') }),
      step('whole-seats', 'require-integer', { value: value('parse-seats') }),
      step('seat-range', 'require-range', { value: value('whole-seats'), minimum: 1, maximum: 6 }),
      step('new-record', 'db-create', { table, data: { 'f-email': value('email'), 'f-seats': value('seat-range'), 'f-status': 'new' } }),
      step('receipt', 'respond-created', { body: { id: value('new-record', 'id'), status: value('new-record', 'f-status') } }),
    ]),
    route('lookup', 'GET', requests + '/:id', 'key', [
      step('record', 'db-read', { table, id: ref('request.params.id') }),
      step('limited', 'respond-json', { body: statusRow('record') }),
    ]),
    route('queue', 'GET', '/api/workshop-queue', 'key', [
      step('read-status', 'object-get', { value: ref('request.query'), path: 'status', fallback: 'new' }),
      step('valid-status', 'require-one-of', { value: value('read-status'), options: ['new', 'approved', 'rejected'] }),
      step('read-limit', 'object-get', { value: ref('request.query'), path: 'limit', fallback: '10' }),
      step('number-limit', 'to-number', { value: value('read-limit') }),
      step('integer-limit', 'require-integer', { value: value('number-limit') }),
      step('bounded-limit', 'require-range', { value: value('integer-limit'), minimum: 1, maximum: 50 }),
      step('query-rows', 'db-list', { table, filter: { field: 'f-status', operator: 'eq', value: value('valid-status') }, limit: value('bounded-limit') }),
      step('public-items', 'list-project-rows', { value: value('query-rows'), fields: { id: 'id', status: 'f-status', seats: 'f-seats' } }),
      step('queue-response', 'respond-json', { body: { items: value('public-items') } }),
    ]),
    route('summary', 'GET', '/api/workshop-summary', 'key', [
      step('stored', 'db-list', { table, limit: 500 }),
      step('sums', 'stats-group-sum', { value: value('stored'), path: 'f-status', amountPath: 'f-seats' }),
      step('summary-response', 'respond-json', { body: { groups: value('sums') } }),
    ]),
    route('events', 'POST', '/api/workshop-events', 'public', [
      step('verify-signature', 'verify-hmac-sha256', { payload: ref('request.raw'), signature: ref('request.headers.x-workshop-signature'), secret: { $secret: 'PLOT_SECRET_WEBHOOK' } }),
      step('event-id', 'require-idempotency-key', { value: body('eventId') }),
      step('allowed-decision', 'require-one-of', { value: body('status'), options: ['approved', 'rejected'] }),
      step('payload-digest', 'hash-sha256', { value: ref('request.raw') }),
      step('duplicate-list', 'db-list', { table, filter: { field: 'f-event', operator: 'eq', value: value('event-id') }, limit: 1 }),
      step('duplicate-count', 'list-count', { value: value('duplicate-list') }),
      step('used-event', 'branch', { left: value('duplicate-count'), operator: 'above', right: 0, whenTrue: 'previous-row', whenFalse: 'read-row' }),
      step('previous-row', 'list-first', { value: value('duplicate-list') }),
      step('same-record', 'require-comparison', { left: value('previous-row', 'id'), operator: 'equals', right: body('id') }, { error: 'conflict' }),
      step('same-bytes', 'require-comparison', { left: value('previous-row', 'f-digest'), operator: 'equals', right: value('payload-digest') }, { error: 'conflict' }),
      step('prior-receipt', 'respond-json', { body: { id: value('previous-row', 'id'), status: value('previous-row', 'f-status') } }),
      step('read-row', 'db-read', { table, id: body('id') }),
      step('still-new', 'require-comparison', { left: value('read-row', 'f-status'), operator: 'equals', right: 'new' }, { error: 'conflict' }),
      step('set-state', 'db-update', { table, id: value('read-row', 'id'), data: {
        'f-status': value('allowed-decision'), 'f-event': value('event-id'), 'f-digest': value('payload-digest'),
      } }),
      step('decision-receipt', 'respond-json', { body: { id: value('set-state', 'id'), status: value('set-state', 'f-status') } }),
      step('conflict', 'respond-error', { status: 409, code: 'WORKSHOP_CONFLICT', message: 'This event or workshop request has already been decided.' }),
    ]),
  ], testCases: [
    { id: 'case-success', name: 'Creates one request', request: { method: 'POST', path: requests, query: {}, body: { email: 'trial@example.test', seats: 2 } },
      expect: { status: 201, fields: [{ path: 'status', operator: 'equals', value: 'new' }] } },
    { id: 'case-invalid-seats', name: 'Rejects seven seats', request: { method: 'POST', path: requests, query: {}, body: { email: 'trial@example.test', seats: 7 } },
      expect: { status: 400, fields: [] } },
  ] };
  return deserializeProject(serializeProject(project));
}

export const evaluateBackend = payload => {
  const program = fileURLToPath(new URL('../outputs/plot-studio/exam_architect_v2.py', import.meta.url));
  const child = spawnSync(process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', program], {
    input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const project = exampleArchitectV2();
  const result = await gradeArchitectV2(project, evaluateBackend);
  console.log('Architect fixture result', result.score, result.passed, result.checks.filter(check => !check.passed).map(check => check.id));
  assert.equal(architectV2Brief.tasks.length, 42);
  assert.equal(result.checks.length, 42);
  assert.equal(result.checks.reduce((total, check) => total + check.points, 0), 100);
  assert.equal(result.score, 100);
  const fresh = await gradeArchitectV2(architectV2Starter(), evaluateBackend);
  assert.equal(fresh.passed, false);
  for (const [kind, manipulate, check] of [
    ['leak generic list', draft => { draft.data.tables[0].permissions.list = true; }, 'private-data-api'],
    ['skip payment-access key', draft => { draft.backend.routes.find(route => route.id === 'summary').access = 'public'; }, 'summary'],
    ['skip webhook signature', draft => { draft.backend.routes.find(route => route.id === 'events').steps.shift(); }, 'event-contract'],
    ['remove numeric bounds', draft => { const step = draft.backend.routes[0].steps.find(node => node.id === 'seat-range'); step.args.maximum = 12; }, 'intake-bounds'],
    ['allow repeat mutation', draft => { const step = draft.backend.routes.find(route => route.id === 'events').steps.find(node => node.id === 'used-event'); step.args.whenTrue = 'read-row'; }, 'event-repeat'],
  ]) {
    const draft = structuredClone(project);
    manipulate(draft);
    const negative = await gradeArchitectV2(draft, evaluateBackend);
    assert.equal(negative.checks.find(item => item.id === check).passed, false, kind);
    assert.equal(negative.passed, false, kind);
  }
  console.log('Architect v2 authentic passing project and five failed invariants verified.');
}
