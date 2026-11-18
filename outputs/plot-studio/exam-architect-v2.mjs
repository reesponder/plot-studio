import { validateExamProject } from './exam-grader.mjs';
import { compileGraph } from './logic.mjs';
import { BLOCK_TYPES, buildSite, buildSitePackage, createBlock, createEmptyProject, createZip, deserializeProject, serializeProject } from './project.mjs';

const requests = '/api/workshop-requests';
const task = (id, title, description, points = 2, mandatory = false) => ({ id, title, description, points, mandatory });
const rubric = [
  task('editable-project', 'Save a reproducible project', 'Name the editable project Northline Workshop Operations. Reimport a checkpoint and confirm that the request and help pages retain their IDs and routes.'),
  task('page-navigation', 'Build a request and help journey', 'At index and help, show one descriptive H1 per page, then use real page links to travel in both directions.'),
  task('mobile-form', 'Make the intake work at 320 pixels', 'Place the form in a two-column desktop section that stacks on Phone. At 320 pixels, the entire form, its labels and submit button must fit and remain usable.', 3, true),
  task('intake-form', 'Collect exactly two required fields', 'Use a labelled Email control of type email and a labelled Seats control of type number. Their HTML names must be email and seats. Use those controls in one native form.', 3, true),
  task('keyboard-submit', 'Make the form keyboard-operable', 'Put Email before Seats, followed by a named submit button. Use Tab to move among them and submit a valid request from the focused button.'),
  task('form-capture', 'Capture raw form values in Blueprint', 'Bind Form submission to the intake form, prevent the native reload and wire its Fields output to Call backend route body.'),
  task('form-success', 'Show the real success outcome', 'Call POST /api/workshop-requests from the form. Wire Success to a visible confirmation that looks different from the error message.', 3, true),
  task('form-error', 'Show a recoverable failure', 'Wire the backend Error output to visible feedback that tells the participant what to do next. Make the failure branch separate from the successful branch.', 2, true),

  task('private-schema', 'Define the Workshop requests table', 'Make one table named Workshop requests with required Email (email), Seats (integer), and Status (text). Add optional text fields Event ID and Event digest. Use the generated field IDs in workflow nodes.', 3, true),
  task('private-data-api', 'Lock down direct table access', 'Disable generic list, read, create, update, and delete permissions. Test ordinary calls to the data endpoint and prove the documented operator routes still work.', 3, true),
  task('empty-seeds', 'Keep the submitted draft clean', 'Remove every training row before submission. Saved request fixtures may use fictional addresses under example.test.'),
  task('browser-boundary', 'Keep operator access off the public page', 'The browser calls only POST /api/workshop-requests. Do not embed training keys, secret aliases, signed events, or operator requests in browser code or browser assets.'),
  task('intake-route', 'Expose a public POST only', 'Configure the intake as Site visitors. A POST reaches the workflow, while GET and PUT on the same base path return a method error.'),
  task('intake-email', 'Reject invalid email before insertion', 'Exercise missing, empty and malformed email addresses with otherwise valid requests. Each rejection must leave the table unchanged.', 3, true),
  task('intake-integers', 'Normalise both API and HTML seats', 'Accept a JSON number at the low bound and the string "6" at the high bound. The stored SQLite values must be integers.'),
  task('intake-bounds', 'Cover hostile and out-of-range seats', 'Reject 0, 7, fractional values, an empty string, nonnumeric text, booleans and omitted seats. Compare the persisted table before and after.', 3, true),
  task('intake-receipt', 'Return a minimal, genuine receipt', 'Return HTTP 201 with exactly id and status, where id belongs to the new SQLite row and status is new. A caller-supplied status must be ignored or rejected without a write.', 3, true),

  task('lookup-record', 'Look up the correct private record', 'GET /api/workshop-requests/:id uses API key required and PLOT_API_KEY. A valid key returns exactly id, status and seats for the requested row.', 3, true),
  task('lookup-denial', 'Reject absent and wrong operator keys', 'Test both missing and wrong credentials. Expect HTTP 401 with no private data or record lookup. Verify both Bearer and X-API-Key work with a valid key.', 3, true),
  task('lookup-missing', 'Distinguish an authorised missing record', 'A valid key with a nonexistent, well-formed record ID returns HTTP 404. Do not return a different row or operator credentials.'),
  task('queue-filter', 'Collect a limited status queue', 'Build protected GET /api/workshop-queue. Accept query status (new, approved or rejected) and return {items:[{id,status,seats},…]}. An empty queue returns items: [].'),
  task('queue-order', 'Return the oldest matching records first', 'Use the stored order. A supplied limit of 1 or 2 changes only the visible prefix of matching rows. Do not return a nonmatching row or reorder by arbitrary ID.'),
  task('queue-limits', 'Validate and bound queue parameters', 'Default status to new and limit to 10. Accept only a whole limit from 1 to 50. Reject invalid status, malformed bounds and duplicate values without a write.'),
  task('summary', 'Compute useful protected aggregates', 'Build GET /api/workshop-summary with API key required. Return {groups:[{key,count,sum},…]}, keyed by status, with exact reservation counts and seats summed from SQLite. An empty table returns groups: [].', 3, true),
  task('operator-boundary', 'Protect every operator read surface', 'Run unauthorised queue and summary requests. Test a wrong key, then the right key. A caller without valid credentials sees neither records nor aggregates.'),

  task('event-contract', 'Verify signed raw bytes before a decision', 'POST /api/workshop-events accepts a signed object with eventId, id and status. Read X-Workshop-Signature, verify the original request bytes using PLOT_SECRET_WEBHOOK and validate inputs before changing any record.', 3, true),
  task('event-no-signature', 'Reject an unsigned decision', 'Send an otherwise valid approved decision with no signature. Reject it and prove the request and its receipt fields stay unchanged.'),
  task('event-tamper', 'Reject wrong keys and tampered formatting', 'Reject a valid-looking signature made with a different key and a real signature attached to altered bytes. Neither request may reach a write.', 2, true),
  task('event-invalid-values', 'Reject malformed signed decisions', 'Sign fixtures with missing or short eventId, missing request ID, and unrecognised status. Use an event ID of 16–128 letters, digits, dots, colons, dashes or underscores.'),
  task('event-approve', 'Commit approval and its receipt together', 'Approve one known new request. Write Status, Event ID and the SHA-256 hex digest of the raw body in one SQLite row update. Return exactly {id,status} and leave every other request alone.', 3, true),
  task('event-reject', 'Reject a separate new request', 'Deliver a separately signed rejected decision for a different request. Save its own receipt and return the correct status through both the callback and operator lookup.'),
  task('event-repeat', 'Re-deliver the exact same signed event', 'Replay the identical approved delivery twice. Return the same HTTP 200 receipt without any further database writes. This assessment replays deliveries serially.', 3, true),
  task('event-reused-key', 'Detect a reused event ID', 'Send the same event ID with changed bytes or a different request ID. Both requests must return HTTP 409 and preserve every saved request and receipt.'),
  task('event-terminal', 'Reject later terminal decisions', 'Once approved or rejected, a request cannot accept a different event ID. Test both the same decision and a conflicting decision. Preserve the original receipt.', 2, true),
  task('event-missing-record', 'Handle a signed event for a missing record', 'Use a valid signature and event ID for a well-formed request ID that does not exist. Return HTTP 404 without producing a new row or receipt.'),

  task('saved-tests', 'Hand over repeatable API fixtures', 'Save and run two Backend Tests in the draft. One must assert HTTP 201 and status new for a valid fictional request. The other must assert a client error for an invalid seat count.'),
  task('clean-export', 'Generate a clean, runnable export', 'Generate the static site with its Python runtime, backend JSON and SQLite schema. Ensure the known routes are included, no seeds are packaged and credentials do not appear in public files.'),
  task('write-failure', 'Contain a failed SQLite write', 'Handle a simulated write rejection without returning success, exposing internal data or changing the request table. The caller must receive a usable JSON error.'),
  task('release-isolation', 'Rehearse against a different data store', 'Create a request in release A. Use the same exported site with a separate SQLite path and separate synthetic key in release B. The first ID must be absent from B, and A must remain unchanged.'),
  task('backup-restore', 'Restore a consistent database backup', 'Take a SQLite backup after a decision. Restore it in a fresh directory and use the original route definitions with new credentials. The ID, seat count, decision and event receipt must survive.', 3, true),
  task('persistent-replay', 'Preserve replay rules across restarts', 'Reopen the SQLite database in a fresh runtime. Replay the exact signed event, verify it performs no write, and prove the stored status and summary remain consistent.'),
  task('release-rehearsal', 'Rehearse the entire request lifecycle', 'In the fresh export confirm a 201 intake, a rejected invalid request, restricted operator access, a valid decision, a harmless repeat and updated queue and summary. The original accepted request must remain the only row.', 3, true),
];

export const architectV2Brief = Object.freeze({
  title: 'Northline Workshop Operations',
  brief: 'Build a reservation and operations service for a neighbourhood tool library. A participant requests one to six workshop seats. An operator reviews a private queue, and a signed callback makes the final decision.',
  overview: 'Ship two connected pages, native Blueprint logic, typed private SQLite data, and five backend routes. The assessor exercises the browser, sends HTTP requests, uses isolated data stores and restores a SQLite backup with fictional records.',
  standard: '42 tasks. Pass at 85 out of 100 and satisfy every required check. Use native Studio nodes. Configure credentials through PLOT_API_KEY and PLOT_SECRET_WEBHOOK so no values are in the draft or export. Signed event replays are assessed serially. Use fictional addresses under example.test.',
  sections: [
    { title: 'Participant site and Blueprint', count: 8 }, { title: 'Private data and intake', count: 9 },
    { title: 'Operator routes', count: 8 }, { title: 'Signed decisions and replay', count: 10 },
    { title: 'Verification and recovery', count: 7 },
  ],
  tasks: rubric.map(item => [item.title, item.mandatory ? `${item.description} This is a required check.` : item.description]),
});

const arr = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const active = node => !node.disabled && !node.bypass;
const meaningful = value => text(value).length > 3 && !['your headline', 'new heading', 'write your text.'].includes(text(value).toLowerCase());
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function childBlocks(block) {
  return arr(block.children).flatMap(child => [child, ...childBlocks(child)]);
}

function formFields(form) {
  const formProps = { ...BLOCK_TYPES.form.defaults, ...form?.props };
  const preset = formProps.usePreset ? text(formProps.fields).split(/\r?\n/).map(line => {
    const [label, kind, required] = line.split('|').map(part => part.trim());
    return { label, name: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind, required: /^(?:yes|true|1|required)$/i.test(required || '') };
  }) : [];
  return [...preset, ...childBlocks(form).filter(block => block.type === 'input').map(block => block.props || {})];
}

function taggedLink(html, slug) {
  const target = escapePattern(slug);
  return new RegExp(`<a\\b[^>]*\\bhref="(?:\\./|/)?${target}(?:\\.html)?(?:#[a-z0-9-]+)?"`, 'i').test(html);
}

function wire(edges, from, port, to, input) {
  return edges.some(edge => edge.from.nodeId === from.id && edge.from.port === port && edge.to.nodeId === to.id && edge.to.port === input);
}

function visibleFeedback(node, page, form) {
  if (!active(node) || node.type !== 'set-text' || (node.config?.valueMode && node.config.valueMode !== 'literal') || !meaningful(node.config?.value)) return null;
  const target = page.flat.find(block => block.id === node.config?.target);
  const style = target?.styles || target?.style || {};
  return ['text', 'heading'].includes(target?.type) && !childBlocks(form).includes(target) && style.display !== 'none' && style.visibility !== 'hidden' ? target : null;
}

function participantChecks(project, model, compiled) {
  const checks = {};
  const page = model.pages.get('index');
  const help = model.pages.get('help');
  const pages = [page, help];
  const files = buildSite(project, compiled.code);
  const checkpoints = new Map(deserializeProject(serializeProject(project)).pages.map(item => [item.slug, item.id]));
  checks['editable-project'] = text(project.name) === architectV2Brief.title && pages.every(item => item && checkpoints.get(item.slug) === item.id);
  checks['page-navigation'] = pages.every(item => {
    const headings = item?.flat.filter(block => block.type === 'hero' || block.type === 'heading' && block.props?.tag === 'h1') || [];
    return headings.length === 1 && meaningful(headings[0].props?.text || headings[0].props?.title);
  }) && taggedLink(files['index.html'] || '', 'help') && taggedLink(files['help.html'] || '', 'index');
  const forms = page?.flat.filter(block => block.type === 'form') || [];
  const form = forms.find(block => {
    const fields = formFields(block);
    return fields.length === 2 && ['email', 'seats'].every((name, index) => fields.some(field => field.name === name &&
      field.kind === ['email', 'number'][index] && field.required === true && meaningful(field.label)));
  });
  const index = files['index.html'] || '';
  const formHtml = form ? (new RegExp(`<form\\b[^>]*data-block-id="${escapePattern(form.id)}"[\\s\\S]*?</form>`).exec(index)?.[0] || '') : '';
  const inputNames = [...formHtml.matchAll(/<(?:input|textarea|select)\b[^>]*\bname="([^"]+)"/g)].map(match => match[1]);
  checks['intake-form'] = inputNames.length === 2 && inputNames.includes('email') && inputNames.includes('seats') && /<label\b/.test(formHtml);
  const submit = /<button[^>]*type="submit"[^>]*>([^<]+)<\/button>/.exec(formHtml);
  checks['keyboard-submit'] = Boolean(submit && meaningful(submit[1]) && formHtml.indexOf('name="email"') < formHtml.indexOf('name="seats"') && formHtml.indexOf('name="seats"') < submit.index);
  const columns = form && page.flat.find(block => block.type === 'columns' && arr(block.children).length >= 2 && childBlocks(block).includes(form) &&
    /^(?:1fr|auto|minmax\(0,1fr\)|repeat\(1,1fr\))$/.test(text(block.styles?.mobile?.gridTemplateColumns).replace(/\s+/g, '')));
  checks['mobile-form'] = Boolean(columns);
  const browserCalls = model.nodes.filter(node => active(node) && node.type === 'call-backend');
  checks['browser-boundary'] = browserCalls.length > 0 && browserCalls.every(node => node.config?.path === requests && String(node.config?.method).toUpperCase() === 'POST') &&
    !/(?:PLOT_API_KEY|PLOT_SECRET_[A-Z0-9_]+|X-Workshop-Signature|\/api\/workshop-(?:events|queue|summary))/i.test(Object.values(files).join('\n'));
  if (!form || !compiled.code || compiled.diagnostics.some(issue => issue.severity === 'error')) return { checks };
  const trigger = model.nodes.find(node => active(node) && node.type === 'submit' && node.config?.target === form.id && node.config?.preventDefault !== false &&
    browserCalls.some(call => wire(model.edges, node, 'next', call, 'in') && wire(model.edges, node, 'fields', call, 'body')));
  const call = trigger && browserCalls.find(node => wire(model.edges, trigger, 'next', node, 'in') && wire(model.edges, trigger, 'fields', node, 'body'));
  checks['form-capture'] = Boolean(call);
  const feedback = port => call && model.nodes.find(node => wire(model.edges, call, port, node, 'in') && visibleFeedback(node, page, form));
  const success = feedback('next');
  const error = feedback('fault');
  checks['form-success'] = Boolean(success);
  checks['form-error'] = Boolean(success && error && success.id !== error.id && text(success.config.value) !== text(error.config.value));
  const browser = { hasHelp: Boolean(help), formId: form.id, columnsId: columns?.id, successId: success?.config.target, errorId: error?.config.target,
    successText: success?.config.value, errorText: error?.config.value };
  return { checks, browser };
}

function browserProbes(info) {
  const block = id => `[data-block-id="${id}"]`;
  const form = `form${block(info.formId)}`;
  const fields = { email: `${form} input[name="email"]`, seats: `${form} input[name="seats"]`, submit: `${form} button[type="submit"]` };
  const mail = { type: 'fill', selector: fields.email, value: 'northline.browser@example.test' };
  const snapshot = (key, selectors) => ({ type: 'snapshot', key, selectors });
  const settle = { type: 'wait', ms: 160 };
  const probes = [{ id: 'architect-navigation', page: 'index', width: 1200, steps: [
    settle, { type: 'click', selector: 'a[href*="help.html"]' }, settle, snapshot('help', { heading: 'main h1' }),
    { type: 'click', selector: 'a[href*="index.html"]' }, settle, snapshot('home', { heading: 'main h1' }),
  ] }];
  probes.push({ id: 'architect-mobile', page: 'index', width: 320, steps: [settle, snapshot('layout', { ...fields, form,
    ...(info.columnsId ? { columns: block(info.columnsId) } : {}),
  })] });
  const workshop = { page: 'index', width: 820, backend: 'workshop' };
  if (info.successId) probes.push({ id: 'architect-form-success', ...workshop, steps: [
    settle, mail, { type: 'fill', selector: fields.seats, value: '2' },
    { type: 'press', selector: fields.email, key: 'Tab' }, snapshot('seat-focus', { seats: fields.seats }),
    { type: 'press', key: 'Tab' }, snapshot('submit-focus', { submit: fields.submit }),
    { type: 'press', key: 'Enter' }, { type: 'wait', ms: 150 }, snapshot('result', { response: block(info.successId) }),
  ] });
  if (info.errorId) probes.push({ id: 'architect-form-error', ...workshop, steps: [
    settle, mail, { type: 'fill', selector: fields.seats, value: '7' }, { type: 'submit', selector: form },
    { type: 'wait', ms: 150 }, snapshot('result', { response: block(info.errorId) }),
  ] });
  return probes.filter(probe => probe.id !== 'architect-navigation' || info.hasHelp);
}

function measurementChecks(measured, info) {
  const nav = measured['architect-navigation']?.snapshots;
  const layout = measured['architect-mobile']?.snapshots?.layout;
  const good = measured['architect-form-success'];
  const denied = measured['architect-form-error'];
  const visibleText = (probe, value) => {
    const response = probe?.snapshots?.result?.selectors?.response;
    return response?.visible && text(response.text).includes(text(value));
  };
  const request = (probe, result, seats) => {
    const observed = arr(probe?.requests);
    if (observed.length !== 1) return false;
    const [item] = observed;
    return item.method === 'POST' && item.path === requests && item.status === result &&
      item.data?.email === 'northline.browser@example.test' && item.data?.seats === seats;
  };
  const goodRequest = request(good, 201, '2');
  const beforeSubmit = good?.snapshots?.['submit-focus'];
  return {
    'page-navigation': /\/help(?:\.html)?$/.test(nav?.help?.path || '') && /\/(?:index(?:\.html)?)?$/.test(nav?.home?.path || '') && nav?.help?.selectors?.heading?.visible && nav?.home?.selectors?.heading?.visible,
    'mobile-form': layout?.width === 320 && layout.scrollWidth <= layout.width + 1 && ['form', 'email', 'seats', 'submit'].every(key => layout.selectors?.[key]?.visible) &&
      /^\d+(?:\.\d+)?px$/.test(layout.selectors?.columns?.gridColumns || ''),
    'keyboard-submit': Boolean(goodRequest && good?.snapshots?.['seat-focus']?.selectors?.seats?.focused && good?.snapshots?.['submit-focus']?.selectors?.submit?.focused),
    'form-capture': goodRequest && arr(beforeSubmit?.requests).length === 0,
    'form-success': goodRequest && visibleText(good, info.successText),
    'form-error': request(denied, 422, '7') && visibleText(denied, info.errorText),
  };
}

async function exportCheck(project, compiled) {
  const { readFile } = await import('node:fs/promises');
  const base = new URL('./', import.meta.url);
  try {
    const files = await buildSitePackage(project, compiled.code, { fetcher: async url => {
      if (url.protocol !== 'file:' || !url.href.startsWith(base.href)) return new Response(null, { status: 404 });
      return new Response(await readFile(url));
    } });
    const required = ['public/index.html', 'public/help.html', 'public/script.js', 'public/styles.css', 'public/plot-backend.js',
      'backend.json', 'backend_engine.py', 'runtime.py', 'database/schema.json', 'BACKEND.md'];
    if (!required.every(name => files[name]) || Object.keys(files).some(name => name.startsWith('public/database/'))) return false;
    const schema = JSON.parse(files['database/schema.json']);
    const backend = JSON.parse(files['backend.json']);
    return schema.tables.length === 1 && schema.tables.every(table => arr(table.rows).length === 0) &&
      backend.routes.length === 5 && !backend.testCases && !backend.pythonScripts && createZip(files).length > 1000;
  } catch {
    return false;
  }
}

export function architectV2Starter() {
  const project = createEmptyProject(architectV2Brief.title);
  project.pages[0] = { id: 'northline-intake', slug: 'index', name: 'Workshop requests', blocks: [
    createBlock('heading', { id: 'northline-title', props: { tag: 'h1', text: 'Northline Workshop Operations' } }),
    createBlock('text', { id: 'northline-intro', props: { text: 'Build the workshop reservation form here, then connect it to the intake workflow.' } }),
  ] };
  return project;
}

export async function gradeArchitectV2(project, evaluateBackend, evaluateBrowser) {
  const model = validateExamProject(project);
  if (arr(project.backend?.pythonScripts).length || arr(project.backend?.packages).length) {
    throw Object.assign(new Error('Use the existing Studio nodes without custom Python or packages for this assessment.'), { status: 422 });
  }
  const compiled = compileGraph(project.graph, project);
  const { checks: participant, browser } = participantChecks(project, model, compiled);
  const { checks: backend = {} } = await evaluateBackend({ backend: project.backend ?? {}, tables: arr(project.data?.tables) });
  const passed = { ...backend, ...participant, 'clean-export': await exportCheck(project, compiled) && participant['browser-boundary'] };
  if (browser && typeof evaluateBrowser === 'function') {
    const measured = await evaluateBrowser({ project, probes: browserProbes(browser) });
    if (measured) for (const [id, ok] of Object.entries(measurementChecks(measured, browser))) passed[id] = passed[id] && Boolean(ok);
  }
  const checks = rubric.map(item => ({ id: item.id, description: `${item.title}. ${item.description}`, points: item.points, passed: passed[item.id] === true, mandatory: item.mandatory }));
  const score = checks.reduce((sum, item) => sum + (item.passed ? item.points : 0), 0);
  return { score, maxScore: 100, passScore: 85, passed: score >= 85 && checks.every(item => !item.mandatory || item.passed), checks };
}
