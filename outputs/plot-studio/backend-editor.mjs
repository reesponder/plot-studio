import {
  BACKEND_ASSERTION_LIMIT, BACKEND_CASE_LIMIT, BACKEND_PYTHON_SCRIPT_LIMIT, BACKEND_PYTHON_SOURCE_LIMIT, BACKEND_PYTHON_TIMEOUT_MAX,
  backendModel, backendPythonScript, backendPythonSourceSize, backendTestAssertions, backendTestCase, testQueryString, testQueryValues,
} from './backend-model.mjs';
import { workspaceFetch } from './workspace-client.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const id = prefix => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
const button = (action, label, primary = false) => `<button type="button" class="be-button${primary ? ' be-primary' : ''}" data-be-action="${action}">${label}</button>`;
const label = (title, input) => `<label class="be-field"><span>${title}</span>${input}</label>`;
const selected = (value, current) => String(value) === String(current) ? ' selected' : '';
const opt = (value, text, current) => `<option value="${escape(value)}"${selected(value, current)}>${escape(text)}</option>`;
const references = [['request.body','Request body'],['request.query','Query parameters'],['request.params','Path parameters'],['request.headers','Request headers'],['request.raw','Original request body'],['request.method','HTTP method'],['request.path','Request path'],['request.client','Client address']];
const fallbackMethods = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
const managedAlias = /^PLOT_SECRET_[A-Z0-9_]{1,60}$/;
const projectIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const secretDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const pythonExamples = {
  receipt: {
    name: 'Calculate a subtotal',
    source: 'from decimal import Decimal, ROUND_HALF_UP\n\n\ndef unit_price(value):\n    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)\n\n\ndef run(input):\n    quantity = input["quantity"]\n    if type(quantity) is not int or quantity < 1:\n        raise ValueError("Quantity must be a positive whole number.")\n    subtotal = unit_price(input["unit_price"]) * quantity\n    print(f"Calculated {quantity} units")\n    return {"subtotal": str(subtotal), "quantity": quantity}\n',
    values: '{\n  "quantity": 3,\n  "unit_price": "19.95"\n}',
  },
  summary: {
    name: 'Summarise records by status',
    source: 'from collections import Counter\n\n\ndef count_statuses(records):\n    return Counter(record.get("status", "unknown") for record in records)\n\n\ndef run(input):\n    records = input["records"]\n    totals = count_statuses(records)\n    print(f"Summarised {len(records)} records")\n    return {"total": len(records), "by_status": dict(totals)}\n',
    values: '{\n  "records": [\n    {"status": "open"},\n    {"status": "closed"},\n    {"status": "open"}\n  ]\n}',
  },
};
const pythonStarter = { name: '', source: 'def run(input):\n    return input\n', values: '{\n  "message": "Hello from Python"\n}' };

function formattedBody(value) {
  return value === null ? '' : JSON.stringify(value, null, 2);
}

function caseEditor(test) {
  return { id: test.id, name: test.name, method: test.request.method, path: test.request.path, query: testQueryString(test.request.query),
    body: formattedBody(test.request.body), status: String(test.expect.status), fields: test.expect.fields.map(field => ({
      path: field.path, operator: field.operator, value: field.operator === 'equals' ? JSON.stringify(field.value) : '',
    })) };
}

function readCaseForm(form, draft) {
  return { ...draft, ...Object.fromEntries(new FormData(form)), fields: [...form.querySelectorAll('.be-case-assertion')].map(row => ({
    path: row.querySelector('[data-assert="path"]').value, operator: row.querySelector('[data-assert="operator"]').value,
    value: row.querySelector('[data-assert="value"]').value,
  })) };
}

function readFixtureJSON(text, message) {
  try { return JSON.parse(text); }
  catch { throw new Error(message); }
}

export async function studioBackend(path, options = {}) {
  const response = await workspaceFetch('/studio/api/' + path, { ...options, headers: {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers,
  }});
  let data;
  try { data = await response.json(); } catch { throw new Error('Studio returned an unreadable response.'); }
  if (!response.ok) throw Object.assign(new Error(data.error?.message || (typeof data.error === 'string' ? data.error : '') || 'The Studio server request failed.'), { status: response.status });
  return data;
}

function inputData(input, kind) {
  if (input.type === 'checkbox') return input.checked;
  if (['number','integer'].includes(kind)) {
    if (input.value === '') return undefined;
    if (!Number.isFinite(Number(input.value))) throw new Error('Enter a valid number.');
    return Number(input.value);
  }
  if (['object','json','array','value','any','map'].includes(kind)) {
    if (!input.value.trim()) return undefined;
    try { return JSON.parse(input.value); }
    catch { if (['value','any'].includes(kind)) return input.value; throw new Error('Enter valid JSON or pick a value from the workflow.'); }
  }
  return input.value;
}

export function mountBackend(root, { getProject, onChange, onStatus, getServerProject, saveServerProject }) {
  root.classList.add('be');
  let tab = 'routes';
  let catalog;
  let loading;
  let catalogError = '';
  let currentRoute;
  let currentStep;
  let currentProject;
  let sites = [];
  let connections = [];
  let result;
  let diagnostics = [];
  let testing = false;
  let deploySlug = '';
  let deploySeed = false;
  let deployPublic = null;
  let deployVault = null;
  let showSiteKey = '';
  let status = '';
  let picker;
  let testPath = '';
  let testBody = '';
  let testQuery = '';
  let testHeaders = '';
  let testSecrets = '';
  let testSavedSecrets = false;
  let showTestContext = false;
  let caseDraft = null;
  let caseResults = new Map();
  let caseProgress = '';
  let pythonDraft = null;
  let pythonResult = null;
  let pythonFeedback = '';
  let pythonTesting = false;
  let secretsFor = null;
  let secretEntries = [];
  let secretLoading = false;
  let secretLoaded = false;
  let secretRequest = 0;
  let secretBusy = false;
  let secretEdit = '';
  let multilineSecret = false;

  const model = () => backendModel(getProject().backend);
  const operation = type => catalog?.operations?.find(item => item.type === type);
  const route = () => model().routes.find(item => item.id === currentRoute) || model().routes[0];
  const step = () => route()?.steps.find(item => item.id === currentStep);
  const packages = () => catalog?.services?.packages || [];
  const testCases = () => model().testCases || [];
  const pythonScripts = () => model().pythonScripts || [];
  const pythonInfo = () => catalog?.python ?? catalog?.services?.python;
  const pythonTimeoutLimit = () => {
    const limit = pythonInfo()?.timeoutMax;
    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, BACKEND_PYTHON_TIMEOUT_MAX) : BACKEND_PYTHON_TIMEOUT_MAX;
  };

  function enabledPackages() {
    const project = model().packages || [];
    return packages().filter(pack => pack.available && project.some(item => item.id === pack.id && item.version === pack.version));
  }

  function packageUses(name) {
    return model().routes.reduce((count, item) => count + item.steps.filter(node =>
      node.type === 'run-package' && node.args.package === name).length, 0);
  }

  function pythonUses(name) {
    return model().routes.reduce((count, item) => count + item.steps.filter(node =>
      node.type === 'run-python' && node.args.script === name).length, 0);
  }

  function packageAction(node) {
    return packages().find(item => item.id === node?.args.package)?.actions.find(item => item.id === node?.args.operation);
  }

  function report(message, error = false) {
    status = message;
    const target = root.querySelector('#be-status');
    if (target) { target.textContent = message; target.dataset.error = String(error); }
    if (error) onStatus?.(message);
  }

  function patch(operation, key) {
    onChange(project => {
      const data = backendModel(project.backend);
      operation(data);
      project.backend = data;
    }, { source: 'backend', coalesceKey: key });
  }

  function patchRoute(update) {
    const active = route()?.id;
    patch(data => { const item = data.routes.find(entry => entry.id === active); if (item) update(item); });
  }

  function patchStep(update, key) {
    const active = step()?.id;
    const routeId = route()?.id;
    patch(data => { const item = data.routes.find(entry => entry.id === routeId)?.steps.find(entry => entry.id === active); if (item) update(item); }, key);
  }

  function chooseRoute(item) {
    currentRoute = item?.id;
    currentStep = item?.steps[0]?.id;
    testPath = item?.path.replace(/:[a-zA-Z0-9_]+/g, 'example') || '';
    testBody = '';
    testQuery = '';
    testHeaders = '';
    testSecrets = '';
    testSavedSecrets = false;
    result = null;
    diagnostics = [];
  }

  function tabButton(value, title) {
    return `<button type="button" class="be-tab" aria-pressed="${tab === value}" data-be-tab="${value}">${title}</button>`;
  }

  function top() {
    return `<div class="be-head"><div><h1>Backend</h1><p>Build server workflows, test requests, and host the project.</p></div><nav aria-label="Backend views">${tabButton('routes', 'Workflows')}${tabButton('tests', 'Tests')}${tabButton('python', 'Python')}${tabButton('services', 'Connections')}${tabButton('secrets', 'Secrets')}${tabButton('packages', 'Packages')}${tabButton('hosting', 'Hosting')}</nav></div>`;
  }

  function sidebar() {
    const entries = model().routes.map(item => `<button type="button" class="be-route" data-be-route="${escape(item.id)}" aria-pressed="${route()?.id === item.id}"><span class="be-verb" data-method="${escape(item.method)}">${escape(item.method)}</span><strong>${escape(item.name || item.path)}</strong><small>${escape(item.path)}</small></button>`).join('');
    return `<aside class="be-rail"><div class="be-rail-head"><h2>Endpoints</h2>${button('add-route', '+ New')}</div>${entries || '<p>Set an address and add the actions it should run.</p>'}</aside>`;
  }

  function routeSettings(item) {
    const methods = catalog?.methods?.map(method => typeof method === 'object' ? method.value || method.id : method) || fallbackMethods;
    return `<div class="be-endpoint">${label('Method', `<select data-route-field="method">${methods.map(method => opt(method, method, item.method)).join('')}</select>`)}${label('Endpoint path', `<input data-route-field="path" value="${escape(item.path)}" maxlength="160" placeholder="/api/status">`)}${label('Access', `<select data-route-field="access">${opt('public','Site visitors',item.access)}${opt('key','API key required',item.access)}</select>`)}${label('Display name', `<input data-route-field="name" value="${escape(item.name)}" maxlength="100">`)}${item.access === 'key' ? label('Secret alias', `<input data-route-field="keySecret" list="be-secret-aliases" value="${escape(item.keySecret || 'PLOT_API_KEY')}" maxlength="80" spellcheck="false" autocomplete="off">`) : ''}</div>`;
  }

  function flow(item) {
    const cards = item.steps.map((node,index) => {
      const meta = operation(node.type);
      const named = node.label || packageAction(node)?.label || meta?.label || node.type;
      const destination = item.steps.find(entry => entry.id === node.next);
      const failed = item.steps.find(entry => entry.id === node.error);
      return `<button type="button" class="be-node" data-be-step="${escape(node.id)}" aria-pressed="${currentStep === node.id}"><span class="be-node-dot"></span><span><small>${escape(meta?.group || 'Action')}</small><strong>${escape(named)}</strong></span><span class="be-node-links">${destination ? `→ ${escape(destination.label || operation(destination.type)?.label || destination.type)}` : meta?.terminal ? 'Ends request' : index === item.steps.length - 1 ? 'Return result' : 'Next node'}${failed ? `<em>Error → ${escape(failed.label || operation(failed.type)?.label || failed.type)}</em>` : ''}</span></button>`;
    }).join('');
    return `<section class="be-flow" aria-label="Workflow nodes"><div class="be-pane-head"><h2>Execution</h2>${button('add-step', '+ Add node', true)}</div><div class="be-node-chain"><div class="be-trigger"><i></i><span>${escape(item.method)} request</span></div>${cards || '<p class="be-subtle">Add the first node to handle this request.</p>'}</div></section>`;
  }

  function aliases(item, node) {
    const index = item.steps.findIndex(entry => entry.id === node.id);
    return [...references, ...item.steps.slice(0, Math.max(0,index)).map(entry => [`steps.${entry.id}.value`, `${entry.label || operation(entry.type)?.label || entry.type} result`])];
  }

  function literal(field, value, key) {
    const kind = field.kind || field.type || 'text';
    const marker = `data-arg="${escape(key)}" data-kind="${escape(kind)}"`;
    if (kind === 'python-script') {
      const scripts = pythonScripts();
      const missing = typeof value === 'string' && value && !scripts.some(item => item.id === value);
      return `<select ${marker} aria-label="${escape(field.label)}">${opt('', scripts.length ? 'Choose a script' : 'No Python scripts saved', value)}${missing ? opt(value, value + ' (missing)', value) : ''}${scripts.map(item => opt(item.id, item.name, value)).join('')}</select>${button('open-python', 'Manage Python scripts')}`;
    }
    if (kind === 'package' || kind === 'package-operation') {
      const enabled = enabledPackages();
      const choices = kind === 'package' ? enabled : enabled.find(pack => pack.id === step()?.args.package)?.actions || [];
      const unavailable = value && !choices.some(item => item.id === value);
      return `<select ${marker} aria-label="${escape(field.label)}">${opt('', choices.length ? 'Choose…' : 'No options available', value)}${unavailable ? opt(value, value + ' (unavailable)', value) : ''}${choices.map(item => opt(item.id, item.label, value)).join('')}</select>`;
    }
    const stepType = step()?.type;
    const names = /connector|service/.test(stepType || '') && /^(?:name|connection|connector|service)$/.test(key) ? catalog.services?.connectors :
      /task/.test(stepType || '') && /^(?:name|task)$/.test(key) ? catalog.services?.tasks : null;
    const tables = key === 'table' ? getProject().data?.tables.map(table => ({ id:table.id, label:table.name })) : null;
    const targets = /^(?:whenTrue|whenFalse|target)$/.test(key) && kind !== 'url' ? route()?.steps.filter(item => item.id !== currentStep).map(item => ({ id:item.id,label:item.label || operation(item.type)?.label || item.type })) : null;
    const options = field.options || names || tables || (kind === 'step' || kind === 'target' || key.startsWith('when') ? targets : null) || (kind === 'connector' ? catalog.services?.connectors : kind === 'task' ? catalog.services?.tasks : undefined);
    if (Array.isArray(options) && options.length) return `<select ${marker}>${opt('', 'Choose…',value)}${options.map(choice => typeof choice === 'object' ? opt(choice.value ?? choice.id, choice.label ?? choice.id, value) : opt(choice, choice, value)).join('')}</select>`;
    if (kind === 'boolean' || kind === 'checkbox') return `<input type="checkbox" ${marker}${value ? ' checked' : ''}>`;
    if (['number','integer'].includes(kind)) return `<input type="number" step="${kind === 'integer' ? '1' : 'any'}"${stepType === 'run-python' && key === 'timeout' ? ` min="1" max="${pythonTimeoutLimit()}"` : ''} ${marker} value="${escape(value)}">`;
    if (['object','array','json','value','any','map','textarea','multiline'].includes(kind)) {
      const text = typeof value === 'object' && value !== undefined ? JSON.stringify(value, null, 2) : value;
      return `<textarea ${marker} rows="3" spellcheck="false" placeholder="${escape(field.placeholder)}">${escape(text)}</textarea>`;
    }
    return `<input ${marker} value="${escape(value)}" placeholder="${escape(field.placeholder)}" maxlength="8192">`;
  }

  function mapRow(key = '', value = '') {
    const virtual = value && typeof value === 'object' && typeof value.$ref === 'string';
    const text = virtual ? value.$ref : typeof value === 'string' ? value : JSON.stringify(value);
    return `<div class="be-map-row"><input data-map-key aria-label="Object field name" value="${escape(key)}" placeholder="Field name"><select data-map-mode aria-label="Object field source">${opt('literal','Value',virtual?'reference':'literal')}${opt('reference','From workflow',virtual?'reference':'literal')}</select><input data-map-value aria-label="Object field value or reference" placeholder="Value or request.body.field" value="${escape(text)}"><button type="button" class="be-button" data-map-remove aria-label="Remove object field">×</button></div>`;
  }

  function applyMap(panel) {
    const keys = new Set();
    const pairs = [];
    for (const row of panel.querySelectorAll('.be-map-row')) {
      const key = row.querySelector('[data-map-key]').value.trim();
      if (!key) continue;
      if (keys.has(key) || /^(?:__proto__|constructor|prototype)$/.test(key)) { report('Object fields need distinct names.',true); return; }
      keys.add(key);
      const value = row.querySelector('[data-map-value]').value;
      if (row.querySelector('[data-map-mode]').value === 'reference') pairs.push([key,{$ref:value.trim()}]);
      else {
        let parsed = value;
        const kind = panel.dataset.map === 'input' ? packageAction(step())?.inputs.find(input => input.name === key)?.type : undefined;
        if (!['text', 'decimal'].includes(kind)) {
          try { parsed = JSON.parse(value); } catch {}
        }
        pairs.push([key,parsed]);
      }
    }
    const key = panel.dataset.map;
    patchStep(node => { node.args[key] = Object.fromEntries(pairs); }, key);
  }

  function fieldControl(item, node, field) {
    const key = field.key;
    const value = node.args[key] ?? field.default;
    const kind = field.kind || field.type;
    const canMap = ['object','json','any','value','map'].includes(kind);
    const mode = value?.$ref ? 'reference' : value?.$secret ? 'secret' : canMap && value && typeof value === 'object' && !Array.isArray(value) ? 'fields' : 'literal';
    const refs = aliases(item, node);
    const fixed = kind === 'secret';
    const fixedSelector = ['package', 'package-operation', 'python-script'].includes(kind);
    const selector = fixed || fixedSelector ? '' : `<select class="be-binding" aria-label="${escape(field.label)} source" data-binding="${escape(key)}">${opt('literal','Value',mode)}${canMap ? opt('fields','Object fields',mode) : ''}${opt('reference','From workflow',mode)}${field.secret || mode === 'secret' || /secret/i.test(key) ? opt('secret','Secret alias',mode) : ''}</select>`;
    let control;
    if (fixedSelector) control = literal(field, value, key);
    else if (mode === 'reference') {
      const listId = `be-ref-${key.replace(/[^a-zA-Z0-9_-]/g,'')}`;
      control = `<input aria-label="${escape(field.label)} reference" data-ref="${escape(key)}" list="${listId}" value="${escape(value.$ref)}" placeholder="request.body.email"><datalist id="${listId}">${refs.map(([path,description]) => `<option value="${escape(path)}">${escape(description)}</option>`).join('')}</datalist><small>Use an output path, for example <code>request.body.email</code>.</small>`;
    } else if (mode === 'secret' || fixed) {
      control = `<input aria-label="${escape(field.label)} alias" data-secret="${escape(key)}" list="be-secret-aliases" value="${escape(value?.$secret ?? value)}" placeholder="PLOT_SECRET_SERVICE" maxlength="80" spellcheck="false" autocomplete="off">`;
    } else if (mode === 'fields') control = `<div class="be-map" data-map="${escape(key)}"><div class="be-map-items">${Object.entries(value).map(([name,entry])=>mapRow(name,entry)).join('')}</div><button class="be-button" type="button" data-map-add>+ Add field</button></div>`;
    else control = literal(field, value, key);
    return `<div class="be-argument"><div class="be-arg-title"><strong>${escape(field.label || key)}${field.required ? ' *' : ''}</strong>${selector}</div>${control}${field.description ? `<small>${escape(field.description)}</small>` : ''}</div>`;
  }

  function packageInputs(node) {
    const action = packageAction(node);
    if (!action) return '<p class="be-subtle">Enable a package in Packages, then choose an action.</p>';
    return `<div class="be-package-contract"><strong>Action inputs</strong><dl>${action.inputs.map(input => `<div><dt><code>${escape(input.name)}</code> · ${escape(input.type)}${input.required ? ' · required' : ''}</dt><dd>${escape(input.description)}</dd></div>`).join('')}</dl><p>${escape(action.output.description)}</p>${button('add-package-fields','Add missing input fields')}</div>`;
  }

  function inspector(item) {
    const node = step();
    const meta = node && operation(node.type);
    if (!node || !meta) return '<aside class="be-details"><h2>Node settings</h2><p class="be-subtle">Select a node to configure its fields and branches.</p></aside>';
    const targets = item.steps.filter(entry => entry.id !== node.id);
    const branch = (key, title, fallback) => label(title, `<select data-step-field="${key}">${opt('', fallback, node[key])}${targets.map(entry => opt(entry.id, entry.label || operation(entry.type)?.label || entry.type, node[key])).join('')}</select>`);
    const title = packageAction(node)?.label || meta.label;
    const pythonOutputs = node.type === 'run-python' ? `<p class="be-node-output">Use <code>steps.${escape(node.id)}.value.result</code> for the returned value. The node also exposes <code>logs</code> and <code>durationMs</code>.</p>` : '';
    return `<aside class="be-details"><div class="be-pane-head"><div><small>${escape(meta.group)}</small><h2>${escape(title)}</h2></div></div><p class="be-subtle">${escape(meta.description)}</p>${meta.valueType ? `<p class="be-node-output">Result <code>steps.${escape(node.id)}.value</code> · ${escape(meta.valueType)}</p>` : ''}${pythonOutputs}${label('Node label', `<input data-step-field="label" value="${escape(node.label)}" maxlength="100" placeholder="${escape(title)}">`)}${(meta.fields || []).map(field => fieldControl(item,node,field)).join('')}${node.type === 'run-package' ? packageInputs(node) : ''}${meta.terminal ? '' : `<div class="be-branches">${branch('next','On success','Next node')}${branch('error','On error','Stop with error')}</div>`}<div class="be-actions">${button('raise-step','Move up')}${button('lower-step','Move down')}${button('duplicate-step','Duplicate')}${button('remove-step','Remove')}</div></aside>`;
  }

  function tester(item) {
    const trace = Array.isArray(result?.trace) ? result.trace : [];
    const body = ['GET', 'HEAD'].includes(item.method) ? '' :
      label('Request body (JSON)', `<textarea data-test="body" rows="2" placeholder='{"email":"name@example.com"}'>${escape(testBody)}</textarea>`);
    const findings = diagnostics.length ? `<ul class="be-diagnostics">${diagnostics.map(issue =>
      `<li data-severity="${escape(issue.severity)}">${escape(issue.message)}</li>`).join('')}</ul>` : '';
    const steps = trace.map(entry => `<li>${escape(entry.phase)} · ${escape(operation(entry.type)?.label || entry.type || entry.stepId)}</li>`).join('');
    const response = result ? `<div class="be-result"><strong>HTTP ${escape(result.status)}</strong>
      <pre>${escape(JSON.stringify(result.body, null, 2))}</pre>
      ${steps ? `<details><summary>${trace.length} trace entries</summary><ol>${steps}</ol></details>` : ''}</div>` : '';

    return `<section class="be-test">
      <div class="be-pane-head"><div><h2>Request test</h2><p>Runs against a temporary copy of draft data.</p></div>
        <div class="be-actions">${button('save-request-case', 'Save as test')}${button('validate', 'Validate')}${button('test', testing ? 'Running…' : 'Send request', true)}</div></div>
      <div class="be-test-row">
        ${label('Request path', `<input data-test="path" value="${escape(testPath || item.path)}">`)}
        ${label('Query parameters', `<input data-test="query" value="${escape(testQuery)}" placeholder="status=open&limit=10">`)}
        ${body}
      </div>
      <details class="be-test-context"${showTestContext ? ' open' : ''}>
        <summary>Test headers and secrets</summary>
        <p>Temporary aliases take precedence for this request. Studio uses the exact body text for signature checks.</p>
        ${serverProjectId() ? `<label class="be-check be-test-saved"><input type="checkbox" data-test="use-saved-secrets"${testSavedSecrets ? ' checked' : ''}> Use this project's saved secrets for this request</label>` : '<p>Save this project to the server to use its secrets in a request test.</p>'}
        <div>
          ${label('Request headers (JSON)', `<textarea data-test="headers" rows="2" autocomplete="off" placeholder='{"x-example-signature":"fixture"}'>${escape(testHeaders)}</textarea>`)}
          ${label('Temporary secret aliases (JSON)', `<textarea data-test="secrets" rows="2" spellcheck="false" autocomplete="off" placeholder='{"PLOT_SECRET_WEBHOOK":"test-key"}'>${escape(testSecrets)}</textarea>`)}
        </div>
      </details>
      ${findings}${response}
    </section>`;
  }

  function assertionRow(check, index) {
    return `<div class="be-case-assertion">
      ${label('Response field', `<input data-assert="path" value="${escape(check.path)}" placeholder="items[0].id" maxlength="160" required>`)}
      ${label('Condition', `<select data-assert="operator">${opt('exists', 'Exists', check.operator)}${opt('equals', 'Equals JSON', check.operator)}</select>`)}
      ${label('Expected JSON', `<input data-assert="value" value="${escape(check.value)}" placeholder='123, true, or "text"'${check.operator === 'equals' ? ' required' : ' disabled'}>`)}
      <button type="button" class="be-button" data-assert-remove="${index}" aria-label="Remove response assertion ${index + 1}">Remove</button>
    </div>`;
  }

  function caseForm(draft, exists) {
    const withBody = !['GET', 'HEAD'].includes(draft.method);
    return `<form id="be-case-form" class="be-case-form">
      <div class="be-pane-head"><h3>${exists ? 'Edit test' : 'New test'}</h3>${button('close-case', 'Close')}</div>
      <fieldset${testing ? ' disabled' : ''}>
        ${label('Case name', `<input name="name" value="${escape(draft.name)}" placeholder="Create a customer" maxlength="80" required>`)}
        <div class="be-case-request">
          ${label('Method', `<select name="method">${fallbackMethods.map(method => opt(method, method, draft.method)).join('')}</select>`)}
          ${label('Request path', `<input name="path" value="${escape(draft.path)}" placeholder="/api/customers" maxlength="420" required>`)}
          ${label('Expected HTTP status', `<input name="status" type="number" min="200" max="599" value="${escape(draft.status)}" required>`)}
        </div>
        ${label('Query parameters', `<input name="query" value="${escape(draft.query)}" placeholder="status=open&limit=10">`)}
        ${withBody ? label('Request body (JSON)', `<textarea name="body" rows="3" placeholder='{"name":"Example customer"}'>${escape(draft.body)}</textarea>`) : ''}
        <div class="be-case-checks">
          <div class="be-pane-head"><h3>Response assertions</h3>${draft.fields.length < BACKEND_ASSERTION_LIMIT ? button('add-assertion', '+ Add assertion') : ''}</div>
          <p>Check fields such as <code>data.id</code> or <code>items[0].price</code>. Use <code>$</code> for the full response body.</p>
          ${draft.fields.map(assertionRow).join('')}
        </div>
        <button type="submit" class="be-button be-primary">Save test</button><p class="be-case-error" role="status"></p>
      </fieldset>
    </form>`;
  }

  function testsView() {
    const cases = testCases();
    const count = cases.filter(test => caseResults.has(test.id)).length;
    const passed = cases.filter(test => caseResults.get(test.id)?.state === 'pass').length;
    const rows = cases.map(test => {
      const verdict = caseResults.get(test.id);
      const endpoint = `${test.request.method} ${test.request.path}`;
      const rowState = verdict?.state || 'ready';
      const badge = { pass: 'Passed', fail: 'Failed', running: 'Running', ready: 'Ready' }[rowState];
      return `<li class="be-case-row">
        <div class="be-case-title"><strong>${escape(test.name)}</strong><span class="be-case-badge" data-state="${rowState}">${badge}</span><small>${escape(endpoint)} · expects HTTP ${test.expect.status}</small></div>
        <div class="be-actions">
          <button type="button" class="be-button" data-case-run="${escape(test.id)}" aria-label="Run ${escape(test.name)}"${testing ? ' disabled' : ''}>Run</button>
          <button type="button" class="be-button" data-case-edit="${escape(test.id)}" aria-label="Edit ${escape(test.name)}"${testing ? ' disabled' : ''}>Edit</button>
          <button type="button" class="be-button" data-case-remove="${escape(test.id)}" aria-label="Delete ${escape(test.name)}"${testing ? ' disabled' : ''}>Delete</button>
        </div>
        ${verdict?.failures?.length ? `<ul class="be-case-failures">${verdict.failures.map(failure => `<li>${escape(failure)}</li>`).join('')}</ul>` : ''}
      </li>`;
    }).join('');
    const summary = caseProgress || (count ? `${passed} of ${count} passed` : `${cases.length} of ${BACKEND_CASE_LIMIT} tests`);
    return `<section class="be-tests">
      <header><div><h2>Request tests</h2><p>Each run starts with a fresh copy of the draft’s data. Use sample data in saved fixtures. Use the one-off request tester for credentials, headers, or signatures.</p></div>
        <div class="be-actions"><button type="button" class="be-button" data-be-action="new-case"${testing || cases.length >= BACKEND_CASE_LIMIT ? ' disabled' : ''}>+ New test</button><button type="button" class="be-button be-primary" data-be-action="run-all-cases"${testing || !cases.length ? ' disabled' : ''}>Run all</button></div>
      </header>
      <div class="be-tests-layout${caseDraft ? ' be-tests-editing' : ''}">
        <section class="be-case-list" aria-label="Saved tests"><p class="be-case-summary" role="status">${escape(summary)}</p>${rows ? `<ul>${rows}</ul>` : '<p>Save a request from Workflows or create a test here.</p>'}</section>
        ${caseDraft ? caseForm(caseDraft, cases.some(test => test.id === caseDraft.id)) : ''}
      </div>
    </section>`;
  }

  function routesView() {
    const item = route();
    if (!item) return `<div class="be-workspace">${sidebar()}<div class="be-empty"><h2>Start with an endpoint.</h2><p>Give your site an address for requests, then connect the actions it should run.</p>${button('add-route','Create an endpoint',true)}</div></div>`;
    return `<div class="be-workspace">${sidebar()}<div class="be-content">${routeSettings(item)}<div class="be-builder">${flow(item)}${inspector(item)}</div>${tester(item)}<div class="be-route-foot">${button('remove-route','Delete endpoint')}</div></div></div>`;
  }

  function hostingView() {
    const active = sites.find(site => site.slug === deploySlug.trim().toLowerCase());
    const access = (deployPublic ?? active?.public) ? 'public' : 'private';
    const releases = sites.map(site => {
      const enabled = site.enabled;
      const publicUrl = enabled && site.public ? site.publicUrl : '';
      const name = escape(site.name);
      const slug = escape(site.slug);
      const state = enabled ? (site.public ? 'Public' : 'Private') : 'Offline';
      return `<article class="be-site" data-visibility="${state.toLowerCase()}">
        <div class="be-site-summary"><div class="be-site-title"><strong>${name}</strong><span>${state}</span></div>
          <small>${slug} · ${site.pages} ${site.pages === 1 ? 'page' : 'pages'} · ${site.routes} ${site.routes === 1 ? 'endpoint' : 'endpoints'}</small>
          ${publicUrl ? `<a class="be-public-address" href="${escape(publicUrl)}" target="_blank" rel="noopener">${escape(new URL(publicUrl, location.origin).href)}</a>` : ''}
        </div>
        <div class="be-actions">
          ${enabled ? `<a class="be-button" href="${escape(site.url)}" target="_blank" rel="noopener">Open site</a>` : ''}
          ${publicUrl ? `<button type="button" class="be-button" data-site-link="${slug}">Copy link</button>` : ''}
          <button type="button" class="be-button" data-pick-site="${slug}">Select</button>
          <button type="button" class="be-button" data-site-key="${slug}">Copy API key</button>
          ${enabled ? `<button type="button" class="be-button" data-unpublish="${slug}">Unpublish</button>` : ''}
        </div>
      </article>`;
    }).join('');
    return `<div class="be-hosting">
      <section class="be-host-form" aria-labelledby="be-publish-title">
        <h2 id="be-publish-title">Publish project</h2>
        <p>Use a custom address for this site. Public releases get a shareable link with a permanent site ID.</p>
        ${label('Custom address', `<input id="be-site-slug" value="${escape(deploySlug)}" maxlength="60" placeholder="my-site" autocapitalize="none" spellcheck="false">`)}
        ${label('Who can open the site?', `<select id="be-site-access" aria-describedby="be-access-help">${opt('private', 'Studio sign-in required', access)}${opt('public', 'Anyone with the link', access)}</select>`)}
        <p class="be-access-help" id="be-access-help">${access === 'public' ? 'The published pages open without a password. Studio editing stays private.' : 'Visitors must sign in to Studio before opening the site.'}</p>
        ${label('Project secrets', `<select id="be-site-secrets" aria-label="Project secrets" aria-describedby="be-site-secret-help">${hostingVaultOptions(active)}</select>`)}
        <p class="be-access-help" id="be-site-secret-help">${serverProjectId() ? 'Link the saved project whose aliases the release should use.' : 'Save this project to the server to link its secrets to a release.'}</p>
        <label class="be-check"><input id="be-site-seed" type="checkbox"${deploySeed ? ' checked' : ''}> Seed an empty database with draft records</label>
        ${button('publish', active?.enabled ? 'Update site' : 'Publish site', true)}
      </section>
      <section class="be-site-list" aria-labelledby="be-site-list-title">
        <div class="be-pane-head"><h2 id="be-site-list-title">Published sites</h2>${button('reload-hosted', 'Refresh')}</div>
        ${releases || '<p>No releases yet.</p>'}
        ${showSiteKey ? label('Project API key', `<input value="${escape(showSiteKey)}" readonly aria-label="Project API key">`) : ''}
      </section>
    </div>`;
  }

  function updateHostingAccess(active) {
    const access = (deployPublic ?? active?.public) ? 'public' : 'private';
    root.querySelector('#be-site-access').value = access;
    root.querySelector('#be-access-help').textContent = access === 'public'
      ? 'The published pages open without a password. Studio editing stays private.'
      : 'Visitors must sign in to Studio before opening the site.';
    root.querySelector('[data-be-action="publish"]').textContent = active?.enabled ? 'Update site' : 'Publish site';
    root.querySelector('#be-site-secrets').innerHTML = hostingVaultOptions(active);
  }

  function hostingVaultChoice(active) {
    const current = serverProjectId();
    const existing = active?.secretProjectId;
    if ((deployVault === 'current' && current) || (deployVault === 'existing' && existing) || deployVault === 'none') return deployVault;
    if (active) return existing ? (existing === current ? 'current' : 'existing') : 'none';
    return current ? 'current' : 'none';
  }

  function hostingVaultOptions(active) {
    const selected = hostingVaultChoice(active);
    const existing = active?.secretProjectId && active.secretProjectId !== serverProjectId();
    return [serverProjectId() && opt('current', 'Current saved project', selected),
      existing && opt('existing', 'Keep existing link', selected), opt('none', 'No linked project', selected)].filter(Boolean).join('');
  }

  function serverProjectId() {
    const binding = getServerProject?.();
    const value = typeof binding === 'string' ? binding : binding?.id;
    return typeof value === 'string' && projectIdPattern.test(value) ? value : null;
  }

  function syncSecretProject() {
    const next = serverProjectId();
    if (next !== secretsFor) {
      secretsFor = next;
      secretEntries = [];
      secretLoading = false;
      secretLoaded = false;
      secretRequest++;
      secretEdit = '';
      multilineSecret = false;
      testSavedSecrets = false;
      deployVault = null;
    }
    return next;
  }

  function aliasesMarkup(includeSiteKey = true) {
    const managed = secretEntries.map(entry => opt(entry.name, entry.name)).join('');
    return includeSiteKey ? opt('PLOT_API_KEY', 'Generated site API key') + managed : managed;
  }

  function secretValueControl() {
    const disabled = secretBusy || secretLoading ? ' disabled' : '';
    const attributes = `name="value" id="be-secret-value" maxlength="8192" autocomplete="off" autocapitalize="off" spellcheck="false"${disabled}`;
    return multilineSecret ? `<textarea ${attributes} rows="4"></textarea>` : `<input ${attributes} type="password">`;
  }

  function formatSecretDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `<time datetime="${escape(date.toISOString())}">${escape(secretDate.format(date))}</time>` : '';
  }

  function secretsView() {
    const project = serverProjectId();
    const header = `<header><h2 id="be-secrets-title">Project secrets</h2><p>Store API keys and signing secrets for this server project. Use their aliases in backend workflows and server connections.</p></header>`;
    if (!project) {
      const save = saveServerProject ? button('save-project-for-secrets', 'Save project to server', true) : '';
      return `<section class="be-secrets" aria-labelledby="be-secrets-title">${header}<div class="be-secrets-panel"><h3>Save this project first</h3><p>Secrets belong to the saved server project. Save a server copy to add its first secret.</p>${save}</div></section>`;
    }
    const disabled = secretBusy || secretLoading ? ' disabled' : '';
    const rows = secretEntries.map(entry => {
      const name = escape(entry.name);
      return `<li><div><code>${name}</code>${formatSecretDate(entry.updatedAt)}</div><div class="be-actions">
        <button class="be-button" type="button" data-secret-copy="${name}"${disabled}>Copy alias</button>
        <button class="be-button" type="button" data-secret-replace="${name}"${disabled}>Replace</button>
        <button class="be-button" type="button" data-secret-delete="${name}"${disabled}>Delete</button>
      </div></li>`;
    }).join('');
    const empty = secretLoading ? 'Loading saved aliases…' : secretLoaded ? 'This project has no saved secrets.' : 'Saved aliases are unavailable. Select Refresh to try again.';
    const name = secretEdit ? `<input name="name" value="${escape(secretEdit)}" readonly${disabled}>` : `<input name="name" maxlength="72" placeholder="PLOT_SECRET_SERVICE" autocapitalize="characters" spellcheck="false" autocomplete="off"${disabled}>`;
    return `<section class="be-secrets" aria-labelledby="be-secrets-title">${header}<div class="be-secrets-layout">
      <div class="be-secrets-panel"><div class="be-pane-head"><h3>Saved aliases</h3><button class="be-button" type="button" data-be-action="refresh-secrets"${disabled}>Refresh</button></div>
        ${rows ? `<ul>${rows}</ul>` : `<p>${empty}</p>`}
        <p>Published releases linked to this project use the current value each time a workflow runs. <code>PLOT_API_KEY</code> is the generated site API key in Hosting.</p>
      </div>
      <form id="be-secret-form" method="post" class="be-secrets-panel" autocomplete="off" novalidate>
        <h3>${secretEdit ? 'Replace secret' : 'Add a secret'}</h3>
        ${label('Alias', name)}
        ${secretEdit ? '<p>Enter the new value. It will replace the existing value as soon as it is saved.</p>' : '<p>Start the alias with <code>PLOT_SECRET_</code>. Add up to 60 uppercase letters, digits or underscores.</p>'}
        <label class="be-field"><span>Secret value</span><span id="be-secret-value-field">${secretValueControl()}</span></label>
        <label class="be-check"><input type="checkbox" id="be-secret-multiline"${multilineSecret ? ' checked' : ''}${disabled}> Enter a multiline value</label>
        <p>Studio only displays the alias after saving.</p>
        <div class="be-actions"><button type="submit" class="be-button be-primary"${disabled}>${secretEdit ? 'Replace value' : 'Save secret'}</button>${secretEdit ? button('cancel-secret-edit', 'Cancel') : ''}</div>
      </form>
    </div></section>`;
  }

  async function loadSecrets(force = false) {
    const project = syncSecretProject();
    if (!project || secretLoading || (secretLoaded && !force)) return;
    const request = ++secretRequest;
    secretLoading = true;
    if (tab === 'secrets') render();
    let failure;
    try {
      const response = await studioBackend(`projects/${project}/secrets`);
      if (request !== secretRequest || project !== serverProjectId()) return;
      secretEntries = response.secrets.filter(entry => managedAlias.test(entry?.name)).map(({ name, updatedAt }) => ({ name, updatedAt }));
      secretLoaded = true;
    } catch (error) { failure = error;
    } finally {
      if (request === secretRequest && project === serverProjectId()) {
        secretLoading = false;
        if (tab === 'secrets') render();
        else {
          const suggestions = root.querySelector('#be-secret-aliases');
          const managedSuggestions = root.querySelector('#be-vault-aliases');
          if (suggestions) suggestions.innerHTML = aliasesMarkup();
          if (managedSuggestions) managedSuggestions.innerHTML = aliasesMarkup(false);
        }
        if (failure && tab === 'secrets') report(failure.message, true);
      }
    }
  }

  async function saveSecret(form) {
    const fields = new FormData(form);
    const name = String(fields.get('name') || '').trim().toUpperCase();
    const value = String(fields.get('value') || '');
    form.querySelector('[name="value"]').value = '';
    const project = syncSecretProject();
    if (!project || secretBusy || secretLoading) return;
    if (!managedAlias.test(name)) return report('Use a valid PLOT_SECRET_ alias.', true);
    if (!secretEdit && secretEntries.some(entry => entry.name === name)) return report('This alias already exists. Choose Replace next to it.', true);
    if (secretEdit && name !== secretEdit) return report('Select the alias you want to replace.', true);
    if (!value || new TextEncoder().encode(value).length > 8192) return report('Enter a secret value of up to 8192 bytes.', true);
    const replace = Boolean(secretEdit);
    secretBusy = true;
    try {
      await studioBackend(`projects/${project}/secrets`, { method: 'POST', headers: replace ? {} : { 'If-None-Match': '*' }, body: JSON.stringify({ name, value }) });
      if (project !== serverProjectId()) return;
      secretEdit = '';
      multilineSecret = false;
      status = replace ? 'Secret value replaced.' : 'Secret saved.';
      await loadSecrets(true);
    } finally {
      secretBusy = false;
      if (tab === 'secrets') render();
    }
  }

  async function deleteSecret(name) {
    const project = syncSecretProject();
    if (!project || secretBusy || !secretEntries.some(entry => entry.name === name)) return;
    if (!confirm(`Delete ${name}? Workflows that use this alias will lose access to its value.`)) return;
    secretBusy = true;
    try {
      await studioBackend(`projects/${project}/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (project !== serverProjectId()) return;
      if (secretEdit === name) secretEdit = '';
      status = 'Secret deleted.';
      await loadSecrets(true);
    } finally {
      secretBusy = false;
      if (tab === 'secrets') render();
    }
  }

  function connectionsView() {
    const services = catalog?.services || {};
    const entries = (items, text) => items?.length ? `<ul>${items.map(item => `<li><strong>${escape(item.label)}</strong><code>${escape(item.id)}</code></li>`).join('')}</ul>` : `<p>${text}</p>`;
    const registered = connections.map(connection => `<div class="be-site"><div><strong>${escape(connection.label)}</strong><small>${escape(connection.id)} · ${escape(connection.methods.join(', '))}</small><small>${escape(connection.url)}</small>${connection.credentialAlias ? `<small>${escape(connection.credentialAlias)} · ${escape(connection.credentialHeader || 'Authorization')}</small>` : ''}</div><button type="button" class="be-button" data-connection-remove="${escape(connection.id)}">Remove</button></div>`).join('');
    return `<div class="be-connections"><section><h2>Server connections</h2><p>Register an address that a hosted workflow can call. Request data can supply parameters to that address.</p>${registered || entries(services.connectors,'No named connections are configured on this server.')}<form id="be-connection-form" method="post">
      ${label('Connection ID', '<input name="name" required maxlength="60" placeholder="my-service">')}
      ${label('Server address', '<input name="url" type="url" required placeholder="https://service.example.com/hooks">')}
      ${label('Allowed method', `<select name="method">${['GET','POST','PUT','PATCH','DELETE'].map(item => opt(item, item, 'GET')).join('')}</select>`)}
      ${label('Secret alias (optional)', '<input name="credentialAlias" list="be-vault-aliases" maxlength="72" autocomplete="off" spellcheck="false" placeholder="PLOT_SECRET_SERVICE">')}
      ${label('Credential header', `<select name="credentialHeader">${opt('Authorization', 'Authorization (Bearer)')}${opt('X-API-Key', 'X-API-Key')}</select>`)}
      <p>The connection reads the alias from the saved project linked to the release.</p>
      ${label('Direct bearer token (optional)', '<input name="credential" type="password" autocomplete="off">')}
      <label class="be-check"><input name="private" type="checkbox"> Allow this address on the private network</label><button class="be-button be-primary" type="submit">Save connection</button></form></section><section><h2>Registered tasks</h2><p>Run a named program with JSON input. Each command is registered on the server.</p>${entries(services.tasks,'No named commands are configured on this server.')}</section><section><h2>Rust nodes</h2><p>${services.native ? 'The compiled Rust helper is available on this server.' : 'The compiled Rust helper is unavailable on this server.'} Add an operation from the Rust category to use it in a workflow.</p><a href="/docs#backend" target="_blank" rel="noopener">Backend setup guide ↗</a></section></div>`;
  }

  function packagesView() {
    const pinned = model().packages || [];
    const known = packages();
    const list = [
      ...known,
      ...pinned.filter(item => !known.some(pack => pack.id === item.id)).map(item => ({
        ...item, label: item.id, description: 'This project specifies a package unavailable on this server.',
        available: false, actions: [],
      })),
    ];
    const cards = list.map(pack => {
      const selected = pinned.find(item => item.id === pack.id);
      const enabled = Boolean(selected && selected.version === pack.version && pack.available);
      const used = packageUses(pack.id);
      const label = enabled ? 'Enabled in this project' : pack.available ? 'Available on this server' : 'Unavailable on this server';
      const dependency = pack.dependency ? ` · ${escape(pack.dependency.name)} ${escape(pack.dependency.version)}` : '';
      const add = !enabled && pack.available ? `<button class="be-button be-primary" type="button" data-enable-package="${escape(pack.id)}">${selected ? 'Use available version' : 'Enable in project'}</button>` : '';
      const remove = selected ? `<button class="be-button" type="button" data-disable-package="${escape(pack.id)}"${used ? ' disabled' : ''}>Remove from project</button>` : '';
      const actions = pack.actions.length ? `<details><summary>${pack.actions.length} actions</summary><ul>${pack.actions.map(action => `<li><strong>${escape(action.label)}</strong><p>${escape(action.description)}</p></li>`).join('')}</ul></details>` : '';
      return `<article class="be-package-card"><div class="be-package-head"><h3>${escape(pack.label)}</h3><span>${escape(label)}</span></div><p class="be-package-version">Version ${escape(pack.version)}${dependency}</p><p>${escape(pack.description)}</p>${pack.setup ? `<p>${escape(pack.setup)}</p>` : ''}${actions}${used ? `<p>Used by ${used} workflow ${used === 1 ? 'node' : 'nodes'}. Remove those references before removing the package.</p>` : ''}<div class="be-actions">${add}${remove}</div></article>`;
    }).join('');
    return `<section class="be-packages"><header><h2>Workflow packages</h2><p>Enable versioned actions for this project, then choose an action in the node picker. The version stays with the editable project and its backend export.</p><a href="/docs#workflow-packages" target="_blank" rel="noopener">Read the packages guide</a></header><div class="be-package-grid">${cards || '<p>Loading packages…</p>'}</div></section>`;
  }

  function openPythonDraft(script = null, example = pythonStarter) {
    const active = script || { id:id('python'), name:example.name, source:example.source };
    pythonDraft = { ...active, values:example.values, timeout:String(Math.min(5,pythonTimeoutLimit())), initialName:active.name, initialSource:active.source };
    pythonResult = null;
    pythonFeedback = '';
  }

  function renderPythonResult() {
    if (!pythonResult) return '';
    const logs = Array.isArray(pythonResult.logs) ? pythonResult.logs.join('\n') : pythonResult.logs;
    const duration = Number.isFinite(pythonResult.durationMs) ? ` <small>${escape(pythonResult.durationMs)} ms</small>` : '';
    return `<div class="be-python-result"><h3>Result${duration}</h3><pre>${escape(JSON.stringify(pythonResult.result, null, 2))}</pre><h3>Logs</h3>${logs ? `<pre>${escape(logs)}</pre>` : '<p>No output from print().</p>'}</div>`;
  }

  function pythonView() {
    const scripts = pythonScripts();
    const runner = pythonInfo();
    const available = runner?.available !== false;
    const worker = available ? runner?.version ? `Python ${runner.version} is available for testing.` : 'Test scripts with sample JSON on the Studio server.' :
      runner.reason || 'Python execution is unavailable on this server. You can still edit and save scripts.';
    const packages = Array.isArray(runner?.packages) ? runner.packages : [];
    const disabled = pythonTesting ? ' disabled' : '';
    const atLimit = scripts.length >= BACKEND_PYTHON_SCRIPT_LIMIT;
    const list = scripts.map(script => `<button class="be-python-script" type="button" data-python-select="${escape(script.id)}" aria-pressed="${script.id === pythonDraft?.id}"${disabled}><strong>${escape(script.name)}</strong><code>${escape(script.id)}</code></button>`).join('');
    const examples = Object.entries(pythonExamples).map(([key, example]) => `<button type="button" class="be-button" data-python-example="${key}"${pythonTesting || atLimit ? ' disabled' : ''}>${escape(example.name)}</button>`).join('');
    const editor = pythonDraft ? pythonForm(scripts.some(script => script.id === pythonDraft.id), available) : `<div class="be-empty"><h2>Write your first Python script</h2><p>Create a script or open a starter from the side panel.</p></div>`;
    return `<section class="be-python" aria-label="Python scripts"><header><div><h2>Python scripts</h2><p>Write <code>run(input)</code> and return a JSON-compatible result. Use the script in a <strong>Run Python script</strong> workflow node.</p><p>${escape(worker)}</p></div>${packages.length ? `<details><summary>Installed packages</summary><ul>${packages.map(packageInfo => `<li>${escape(packageInfo.name || packageInfo)} ${escape(packageInfo.version)}</li>`).join('')}</ul></details>` : ''}</header><div class="be-python-layout"><aside class="be-python-library"><div class="be-pane-head"><h3>Scripts</h3><button type="button" class="be-button" data-be-action="new-python"${pythonTesting || atLimit ? ' disabled' : ''}>New script</button></div>${list || '<p>No saved scripts.</p>'}<div class="be-python-examples"><h3>Start from an example</h3>${examples}</div>${atLimit ? `<p>This project has ${BACKEND_PYTHON_SCRIPT_LIMIT} scripts.</p>` : ''}</aside>${editor}</div></section>`;
  }

  function pythonForm(saved, available) {
    const draft = pythonDraft;
    const uses = saved ? pythonUses(draft.id) : 0;
    const timeout = pythonTimeoutLimit();
    const readonly = pythonTesting ? ' readonly' : '';
    return `<form id="be-python-form" class="be-python-form">
      <div class="be-python-author">
        <div class="be-pane-head"><h3>${saved ? 'Edit script' : 'New script'}</h3>${saved ? `<code>${escape(draft.id)}</code>` : ''}</div>
        ${label('Script name', `<input name="name" maxlength="160" required value="${escape(draft.name)}"${readonly}>`)}
        ${label('Python source', `<textarea name="source" rows="18" maxlength="${BACKEND_PYTHON_SOURCE_LIMIT}" spellcheck="false" wrap="off" required aria-label="Python source" aria-describedby="be-python-size"${readonly}>\n${escape(draft.source)}</textarea>`)}
        <p id="be-python-size" class="be-python-size">${backendPythonSourceSize(draft.source).toLocaleString('en-GB')} / 32,768 UTF-8 bytes</p>
        <div class="be-actions"><button type="submit" class="be-button be-primary"${pythonTesting ? ' disabled' : ''}>Save script</button>${saved ? `<button type="button" class="be-button" data-be-action="remove-python"${pythonTesting || uses ? ' disabled' : ''}>Delete script</button>` : ''}</div>
        ${uses ? `<p>Used by ${uses} workflow ${uses === 1 ? 'node' : 'nodes'}. Remove ${uses === 1 ? 'that reference' : 'those references'} before deleting this script.</p>` : ''}
        <p>Scripts are saved with this project and included in its <code>.plot</code> file.</p>
      </div>
      <section class="be-python-tester" aria-labelledby="be-python-test-title">
        <h3 id="be-python-test-title">Test script</h3>
        ${label('Test input (JSON)', `<textarea name="values" rows="8" spellcheck="false" aria-label="Test input (JSON)"${readonly}>\n${escape(draft.values)}</textarea>`)}
        ${label('Timeout (seconds)', `<input name="timeout" type="number" min="1" max="${timeout}" step="1" value="${escape(draft.timeout)}"${readonly}>`)}
        <div class="be-actions"><button type="button" class="be-button" data-be-action="test-python"${pythonTesting || !available ? ' disabled' : ''}>${pythonTesting ? 'Running…' : 'Run test'}</button></div>
        <p class="be-python-feedback" role="status">${escape(pythonFeedback)}</p>
        ${renderPythonResult()}
        <details><summary>Use the script in a workflow</summary><p>Choose the saved script in a <strong>Run Python script</strong> node. In Input values, select From workflow and pass <code>request.body</code> or a previous node result. A later node can use <code>steps.&lt;node-id&gt;.value.result</code>. For example, validate item fields, run the subtotal script, then return the computed amount in a JSON response.</p><p>Use Python’s standard library for helpers and common calculations. <code>print()</code> output appears under Logs.</p></details>
      </section>
    </form>`;
  }

  function setPackage(name, enable) {
    const pack = packages().find(item => item.id === name);
    if (enable && !pack?.available) return report('This package is unavailable.', true);
    if (!enable && packageUses(name)) return report('Remove this package’s workflow nodes first.', true);
    patch(data => {
      const remaining = (data.packages || []).filter(item => item.id !== name);
      if (enable) remaining.push({ id: pack.id, version: pack.version });
      data.packages = remaining;
    });
    status = enable ? `${pack.label} is enabled. Choose one of its actions in the node picker.` : 'Package removed from the draft.';
    render();
    const control = [...root.querySelectorAll(enable ? '[data-disable-package]' : '[data-enable-package]')]
      .find(element => (enable ? element.dataset.disablePackage : element.dataset.enablePackage) === name);
    control?.focus();
  }

  function render() {
    syncSecretProject();
    if (picker?.open) picker.close();
    const views = { routes: routesView, tests: testsView, python: pythonView, hosting: hostingView, services: connectionsView, secrets: secretsView, packages: packagesView };
    const view = views[tab] || routesView;
    root.innerHTML = `${top()}<p id="be-status" class="be-status" role="status">${escape(status)}</p>${view()}<datalist id="be-secret-aliases">${aliasesMarkup()}</datalist><datalist id="be-vault-aliases">${aliasesMarkup(false)}</datalist><dialog id="be-picker" aria-labelledby="be-picker-title"><div class="be-picker-head"><h2 id="be-picker-title">Add a backend node</h2>${button('close-picker','Close')}</div><div class="be-picker-controls"><div><input id="be-search" type="search" aria-label="Find backend nodes" placeholder="Search by name or category"><select id="be-category" aria-label="Node category"></select></div><p id="be-match-count" class="be-subtle" role="status"></p></div><div id="be-pick-results"></div></dialog>`;
    picker = root.querySelector('#be-picker');
  }

  function searchPicker() {
    const terms = root.querySelector('#be-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const group = root.querySelector('#be-category').value;
    const packageActions = enabledPackages().flatMap(pack => pack.actions.map(action => ({
      type: 'run-package', group: 'Packages', label: action.label, description: action.description,
      packageId: pack.id, packageLabel: pack.label, packageOperation: action.id,
    })));
    const matches = [...(catalog?.operations || []), ...packageActions].filter(node =>
      (!group || group === node.group) && terms.every(word =>
        `${node.label} ${node.type} ${node.group} ${node.description} ${node.packageLabel || ''}`.toLowerCase().includes(word)));
    root.querySelector('#be-match-count').textContent = `${matches.length} ${matches.length === 1 ? 'action' : 'actions'}`;
    root.querySelector('#be-pick-results').innerHTML = matches.map(node => {
      const packageFields = node.packageId ? ` data-pick-package="${escape(node.packageId)}" data-package-operation="${escape(node.packageOperation)}"` : '';
      return `<button type="button" data-pick-operation="${escape(node.type)}"${packageFields}><strong>${escape(node.label)}</strong><small>${escape(node.packageLabel || node.group)}</small><span>${escape(node.description)}</span></button>`;
    }).join('') || `<p>${escape(catalogError || 'No matching operations.')}</p>`;
  }

  async function loadCatalog() {
    loading ||= studioBackend('backend/catalog').then(response => { catalog = response; catalogError = ''; return response; }).catch(error => { loading = null; catalogError = error.message; throw error; });
    return loading;
  }

  async function loadSites() {
    try { sites = await studioBackend('sites'); if (tab === 'hosting') render(); }
    catch (error) { report(error.message, true); }
  }

  async function reloadConnections() {
    try {
      connections = await studioBackend('backend/connections');
      loading = null;
      await loadCatalog();
      if (tab === 'services') render();
    } catch (error) { report(error.message, true); }
  }

  function defaultStep(type) {
    const spec = operation(type);
    return { id: id('node'), type, args: Object.fromEntries((spec?.fields || []).filter(field => field.default !== undefined).map(field => [field.key, structuredClone(field.default)])) };
  }

  async function addRoute() {
    const schema = await loadCatalog();
    let count = model().routes.length + 1;
    let path = count === 1 ? '/api/status' : `/api/endpoint-${count}`;
    while (model().routes.some(item => item.path === path)) path = `/api/endpoint-${++count}`;
    const response = schema.operations.find(item => ['respond-json','response-json','return-json'].includes(item.type));
    const item = { id: id('route'), name: path === '/api/status' ? 'Status' : `Endpoint ${count}`, method: 'GET', path, access: 'public', steps: response ? [defaultStep(response.type)] : [] };
    patch(data => data.routes.push(item));
    chooseRoute(item);
    render();
  }

  function addStep(type, packageId, packageOperation) {
    const item = defaultStep(type);
    if (packageId) Object.assign(item.args, { package: packageId, operation: packageOperation, input: {} });
    patchRoute(current => {
      const index = current.steps.findIndex(entry => entry.id === currentStep);
      const insert = index < 0 ? current.steps.length : index + (operation(current.steps[index].type)?.terminal ? 0 : 1);
      current.steps.splice(insert, 0, item);
    });
    currentStep = item.id;
    render();
  }

  function editCase(test, fromRequest = false) {
    const active = route();
    if (!test && testCases().length >= BACKEND_CASE_LIMIT) return report(`The draft already has ${BACKEND_CASE_LIMIT} saved tests.`, true);
    const path = active?.path.replace(/:[a-zA-Z0-9_]+/g, 'example') || '/api/status';
    caseDraft = test ? caseEditor(test) : {
      id: id('case'), name: '', method: active?.method || 'GET', path: fromRequest ? testPath || path : path,
      query: fromRequest ? testQuery : '', body: fromRequest ? testBody : '', status: '200', fields: [],
    };
    setTab('tests');
    root.querySelector('#be-case-form [name="name"]')?.focus();
  }

  function setPythonFeedback(message) {
    pythonFeedback = message;
    const output = root.querySelector('.be-python-feedback');
    if (output) output.textContent = message;
  }

  function editPython(script, example) {
    if (pythonTesting || (script && script.id === pythonDraft?.id)) return;
    if (!script && pythonScripts().length >= BACKEND_PYTHON_SCRIPT_LIMIT) return;
    if (pythonDraft && (pythonDraft.name !== pythonDraft.initialName || pythonDraft.source !== pythonDraft.initialSource) &&
      !confirm('Switch scripts and discard your unsaved edits?')) return;
    openPythonDraft(script, example);
    render();
    root.querySelector('#be-python-form [name="name"]')?.focus();
  }

  function savePython() {
    if (!pythonDraft || pythonTesting) return;
    let script;
    try { script = backendPythonScript(pythonDraft); }
    catch (error) { setPythonFeedback(error.message); return; }
    const scripts = pythonScripts();
    const index = scripts.findIndex(item => item.id === script.id);
    if (index < 0 && scripts.length >= BACKEND_PYTHON_SCRIPT_LIMIT) return setPythonFeedback('This project has reached the script limit.');
    if (index < 0) scripts.push(script);
    else scripts[index] = script;
    patch(data => { data.pythonScripts = scripts; });
    Object.assign(pythonDraft, { ...script, initialName:script.name, initialSource:script.source });
    status = `${script.name} saved.`;
    pythonFeedback = '';
    render();
    root.querySelector('#be-python-form [type="submit"]')?.focus();
  }

  function removePython() {
    if (!pythonDraft || pythonTesting) return;
    const script = pythonScripts().find(item => item.id === pythonDraft.id);
    if (!script) return;
    if (pythonUses(script.id)) return setPythonFeedback('Remove this script’s Run Python references before deleting it.');
    if (!confirm(`Delete ${script.name} from this project?`)) return;
    patch(data => { data.pythonScripts = (data.pythonScripts || []).filter(item => item.id !== script.id); });
    openPythonDraft(pythonScripts()[0]);
    status = `${script.name} deleted.`;
    render();
    root.querySelector('#be-python-form [name="name"]')?.focus();
  }

  async function testPython() {
    if (!pythonDraft || pythonTesting || pythonInfo()?.available === false) return;
    const { source, values: rawValues, timeout: rawTimeout } = pythonDraft;
    const timeout = Number(rawTimeout);
    let values;
    try {
      backendPythonScript({ id: pythonDraft.id, name: 'Script test', source });
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > pythonTimeoutLimit()) throw new Error(`Enter a timeout from 1 to ${pythonTimeoutLimit()} seconds.`);
      values = readFixtureJSON(rawValues, 'Enter valid JSON for the test input.');
    } catch (error) { setPythonFeedback(error.message); return; }
    const project = getProject();
    const draft = pythonDraft;
    const stillOpen = () => getProject() === project && pythonDraft === draft;
    pythonTesting = true;
    pythonResult = null;
    pythonFeedback = 'Running the script…';
    render();
    try {
      const result = await studioBackend('backend/python/test', { method:'POST', body:JSON.stringify({ source, values, timeout }) });
      if (stillOpen()) {
        if (!result || !Object.hasOwn(result, 'result')) throw new Error('The test returned no result.');
        pythonResult = result;
        pythonFeedback = 'Test finished.';
      }
    } catch (error) {
      if (stillOpen()) pythonFeedback = error.message;
    } finally {
      pythonTesting = false;
      if (tab === 'python') {
        render();
        if (stillOpen()) root.querySelector('[data-be-action="test-python"]')?.focus();
      }
    }
  }

  function saveCase(form) {
    if (testing || !caseDraft) return;
    caseDraft = readCaseForm(form, caseDraft);
    const { method, path, query, body, name, status: expectedStatus, fields } = caseDraft;
    let saved;
    try {
      saved = backendTestCase({ id: caseDraft.id, name, request: { method, path: path.trim(), query: testQueryValues(query),
        body: ['GET', 'HEAD'].includes(method) || !body.trim() ? null : readFixtureJSON(body, 'Enter valid JSON for the request body.'),
      }, expect: { status: Number(expectedStatus), fields: fields.map(field => field.operator === 'equals' ? {
        path: field.path, operator: field.operator, value: readFixtureJSON(field.value, 'Enter valid JSON for the expected response value.'),
      } : field) } });
    } catch (error) {
      form.querySelector('.be-case-error').textContent = error.message;
      return;
    }
    patch(data => {
      const cases = data.testCases || [];
      const index = cases.findIndex(test => test.id === saved.id);
      if (index < 0) cases.push(saved);
      else cases[index] = saved;
      data.testCases = cases;
    });
    caseResults.delete(saved.id);
    caseDraft = null;
    status = `${saved.name} saved.`;
    render();
    root.querySelector(`[data-case-edit="${saved.id}"]`)?.focus();
  }

  function removeCase(test) {
    if (testing || !confirm(`Delete ${test.name} from the saved tests?`)) return;
    patch(data => { data.testCases = (data.testCases || []).filter(item => item.id !== test.id); });
    caseResults.delete(test.id);
    if (caseDraft?.id === test.id) caseDraft = null;
    status = `${test.name} deleted.`;
    render();
  }

  async function runCases(cases, all = false) {
    if (testing || !cases.length) return;
    const project = getProject();
    const backend = model();
    delete backend.testCases;
    const data = structuredClone(project.data);
    if (all) caseResults.clear();
    testing = true;
    status = '';
    let done = 0;
    let passed = 0;
    try {
      for (const test of cases) {
        if (getProject() !== project) break;
        caseProgress = `Running ${done + 1} of ${cases.length}`;
        caseResults.set(test.id, { state: 'running' });
        if (tab === 'tests') render();
        const { method, path, query, body } = test.request;
        const request = { method, path, query, raw: body === null ? '' : JSON.stringify(body) };
        let failures;
        try {
          const response = await studioBackend('backend/test', { method: 'POST', body: JSON.stringify({ backend, data, request }) });
          failures = backendTestAssertions(test, response);
        } catch (error) { failures = [error.message]; }
        if (getProject() !== project) break;
        caseResults.set(test.id, { state: failures.length ? 'fail' : 'pass', failures });
        done++;
        if (!failures.length) passed++;
      }
    } finally {
      testing = false;
      caseProgress = '';
      if (getProject() === project) status = all ? `${passed} of ${done} tests passed.` : `${cases[0].name} ${passed ? 'passed' : 'failed'}.`;
      if (tab === 'tests') render();
    }
  }

  async function run(validateOnly = false) {
    if (testing) return;
    const item = route();
    if (!item) return;
    testing = true;
    report('Running the draft…');
    try {
      const query = testQueryValues(testQuery);
      const raw = validateOnly || ['GET', 'HEAD'].includes(item.method) ? '' : testBody;
      const headers = !validateOnly && testHeaders.trim() ? JSON.parse(testHeaders) : {};
      const previewSecrets = !validateOnly && testSecrets.trim() ? JSON.parse(testSecrets) : {};
      const project = testSavedSecrets && !validateOnly ? serverProjectId() : null;
      const backend = model();
      delete backend.testCases;
      const response = await studioBackend('backend/test', { method: 'POST', body: JSON.stringify({ backend, data: getProject().data, validateOnly, previewSecrets,
        ...(project ? { useSavedSecrets: true, secretProjectId: project } : {}),
        request: { path: testPath || item.path, method: item.method, query, headers, raw } }) });
      if (validateOnly) {
        diagnostics = response.diagnostics || [];
        status = diagnostics.length ? 'Validation finished.' : 'No validation issues.';
      } else { result = response; status = `Request finished with HTTP ${response.status}.`; }
    } catch (error) { report(error.message, true); }
    finally {
      testing = false;
      if (!validateOnly) {
        testHeaders = '';
        testSecrets = '';
        testSavedSecrets = false;
      }
      render();
    }
  }

  async function publish() {
    if (testing) return;
    const slug = deploySlug.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug)) return report('Use lowercase letters, numbers and dashes in the site address.', true);
    const existing = sites.find(site => site.slug === slug);
    if (existing && existing.name !== getProject().name && !confirm(`Update ${existing.name} with this draft?`)) return;
    const vault = hostingVaultChoice(existing);
    const secretProjectId = vault === 'current' ? serverProjectId() : vault === 'none' ? null : undefined;
    if (existing?.secretProjectId && secretProjectId !== undefined && existing.secretProjectId !== secretProjectId && !confirm('Update this release’s link to saved project secrets?')) return;
    testing = true;
    report('Publishing the current draft…');
    try {
      const receipt = await studioBackend('sites/' + slug, { method: 'PUT', headers: existing ? { 'If-Match': `"${existing.version}"` } : { 'If-None-Match': '*' }, body: JSON.stringify({ project: getProject(), includeRows: deploySeed, public: deployPublic ?? (existing?.public === true), secretProjectId }) });
      deploySlug = receipt.slug;
      deployPublic = null;
      deployVault = null;
      status = receipt.public ? `${receipt.name} is public. Copy the link from Published sites.` : `${receipt.name} is online for signed-in Studio users.`;
      await loadSites();
    } catch (error) { report(error.message,true); }
    finally { testing = false; }
  }

  async function setTab(value) {
    tab = value;
    status = '';
    if (!deploySlug) deploySlug = getProject().name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,60) || 'my-site';
    if (value === 'python' && !pythonDraft) openPythonDraft(pythonScripts()[0]);
    if (value !== 'secrets') {
      secretEdit = '';
      multilineSecret = false;
    }
    render();
    if (value === 'routes' || value === 'secrets' || value === 'services') void loadSecrets(value === 'secrets');
    if (value === 'hosting') await loadSites();
    if (value === 'services') await reloadConnections();
    if (value === 'packages' || value === 'python') {
      await loadCatalog();
      if (tab === value) render();
    }
  }

  async function command(action) {
    if (action === 'add-route') return addRoute();
    if (action === 'add-step') {
      await loadCatalog();
      const groups = [...new Set(catalog.operations.map(item => item.group))].sort();
      root.querySelector('#be-category').innerHTML = opt('', 'All categories', '') + groups.map(group => opt(group, group, '')).join('');
      searchPicker();
      picker.showModal();
      root.querySelector('#be-search').focus();
      return;
    }
    if (action === 'close-picker') return picker.close();
    if (action === 'validate' || action === 'test') return run(action === 'validate');
    if (action === 'new-case' || action === 'save-request-case') return editCase(null, action === 'save-request-case');
    if (action === 'close-case') { caseDraft = null; return render(); }
    if (action === 'run-all-cases') return runCases(testCases(), true);
    if (action === 'open-python') return setTab('python');
    if (action === 'new-python') return editPython(null, pythonStarter);
    if (action === 'remove-python') return removePython();
    if (action === 'test-python') return testPython();
    if (action === 'add-assertion') {
      const form = root.querySelector('#be-case-form');
      if (!form || !caseDraft || caseDraft.fields.length >= BACKEND_ASSERTION_LIMIT) return;
      caseDraft = readCaseForm(form, caseDraft);
      caseDraft.fields.push({ path: '', operator: 'exists', value: '' });
      render();
      root.querySelector('.be-case-assertion:last-child [data-assert="path"]')?.focus();
      return;
    }
    if (action === 'publish') return publish();
    if (action === 'reload-hosted') return loadSites();
    if (action === 'refresh-secrets') return loadSecrets(true);
    if (action === 'save-project-for-secrets') return saveServerProject?.();
    if (action === 'cancel-secret-edit') {
      secretEdit = '';
      multilineSecret = false;
      return render();
    }
    if (action === 'add-package-fields') {
      const node = step();
      const inputs = packageAction(node)?.inputs.filter(input => input.required) || [];
      const current = node?.args.input;
      if (current && (typeof current !== 'object' || Array.isArray(current) || current.$ref || current.$secret)) {
        return report('Choose Object fields as the input source first.', true);
      }
      patchStep(target => {
        const missing = inputs.filter(input => !Object.hasOwn(current || {}, input.name));
        const entries = missing.map(input => [input.name, input.type === 'array' ? [] : input.type === 'object' ? {} : '']);
        target.args.input = { ...Object.fromEntries(entries), ...current };
      });
      return render();
    }
    if (action === 'remove-route') {
      const item = route();
      if (!item || !confirm(`Delete ${item.method} ${item.path} from the draft?`)) return;
      patch(data => { data.routes = data.routes.filter(entry => entry.id !== item.id); });
      chooseRoute(model().routes[0]);
    }
    if (['remove-step','raise-step','lower-step','duplicate-step'].includes(action)) {
      patchRoute(item => {
        const position = item.steps.findIndex(entry => entry.id === currentStep);
        if (position < 0) return;
        if (action === 'duplicate-step') {
          const clone = { ...structuredClone(item.steps[position]), id: id('node') };
          item.steps.splice(position + 1, 0, clone);
          currentStep = clone.id;
        } else if (action === 'remove-step') {
          item.steps.splice(position,1);
          for (const node of item.steps) for (const key of ['next','error']) if (node[key] === currentStep) delete node[key];
          currentStep = item.steps[Math.min(position,item.steps.length - 1)]?.id;
        } else {
          const next = position + (action === 'raise-step' ? -1 : 1);
          if (next >= 0 && next < item.steps.length) [item.steps[position],item.steps[next]] = [item.steps[next],item.steps[position]];
        }
      });
    }
    render();
  }

  root.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control) return;
    const run = async () => {
      const data = control.dataset;
      if (control.hasAttribute('data-map-add')) {
        const panel = control.closest('.be-map');
        panel.querySelector('.be-map-items').insertAdjacentHTML('beforeend', mapRow());
        panel.querySelector('.be-map-items').lastElementChild.querySelector('input').focus();
        return;
      }
      if (control.hasAttribute('data-map-remove')) {
        const panel = control.closest('.be-map');
        control.closest('.be-map-row').remove();
        applyMap(panel);
        return;
      }
      if (data.beTab) return setTab(data.beTab);
      if (data.beRoute) { chooseRoute(model().routes.find(item => item.id === data.beRoute)); return render(); }
      if (data.beStep) { currentStep = data.beStep; return render(); }
      if (data.pythonSelect) {
        const script = pythonScripts().find(item => item.id === data.pythonSelect);
        if (script) return editPython(script);
      }
      if (Object.hasOwn(pythonExamples, data.pythonExample)) return editPython(null, pythonExamples[data.pythonExample]);
      if (data.caseRun || data.caseEdit || data.caseRemove) {
        const test = testCases().find(item => item.id === (data.caseRun || data.caseEdit || data.caseRemove));
        if (test) return data.caseRun ? runCases([test]) : data.caseEdit ? editCase(test) : removeCase(test);
      }
      if (data.assertRemove !== undefined && caseDraft) {
        caseDraft = readCaseForm(control.form, caseDraft);
        caseDraft.fields.splice(Number(data.assertRemove), 1);
        return render();
      }
      if (data.pickOperation) return addStep(data.pickOperation, data.pickPackage, data.packageOperation);
      if (data.beAction) return command(data.beAction);
      if (data.secretCopy) {
        try { await navigator.clipboard.writeText(data.secretCopy); report('Secret alias copied.'); }
        catch { report(data.secretCopy); }
        return;
      }
      if (data.secretReplace && secretEntries.some(entry => entry.name === data.secretReplace)) {
        secretEdit = data.secretReplace;
        multilineSecret = false;
        render();
        root.querySelector('#be-secret-value')?.focus();
        return;
      }
      if (data.secretDelete) return deleteSecret(data.secretDelete);
      if (data.enablePackage) return setPackage(data.enablePackage, true);
      if (data.disablePackage) return setPackage(data.disablePackage, false);
      if (data.pickSite) { deploySlug = data.pickSite; deployPublic = null; deployVault = null; showSiteKey = ''; return render(); }
      if (data.siteLink) {
        const selected = sites.find(site => site.slug === data.siteLink && site.public && site.enabled);
        if (!selected?.publicUrl) return;
        const url = new URL(selected.publicUrl, location.origin).href;
        try { await navigator.clipboard.writeText(url); report('Public link copied.'); }
        catch { report(url); }
      }
      if (data.siteKey) {
        const receipt = await studioBackend(`sites/${data.siteKey}/key`);
        try { await navigator.clipboard.writeText(receipt.key); report('The site API key was copied.'); }
        catch { showSiteKey = receipt.key; render(); }
      }
      if (data.unpublish) {
        const site = sites.find(entry => entry.slug === data.unpublish);
        if (!site || !confirm(`Take ${site.name} offline?`)) return;
        await studioBackend(`sites/${site.slug}`, { method:'DELETE', headers:{ 'If-Match': `"${site.version}"` } });
        await loadSites();
      }
      if (data.connectionRemove && confirm(`Remove the ${data.connectionRemove} connection?`)) {
        await studioBackend(`backend/connections/${data.connectionRemove}`, { method:'DELETE' });
        await reloadConnections();
      }
    };
    run().catch(error => report(error.message, true));
  });

  root.addEventListener('submit', event => {
    if (event.target.id === 'be-case-form') {
      event.preventDefault();
      return saveCase(event.target);
    }
    if (event.target.id === 'be-python-form') {
      event.preventDefault();
      return savePython();
    }
    if (event.target.id === 'be-secret-form') {
      event.preventDefault();
      void saveSecret(event.target).catch(error => report(error.message, true));
      return;
    }
    if (event.target.id !== 'be-connection-form') return;
    event.preventDefault();
    const fields = new FormData(event.target);
    const name = String(fields.get('name') || '').trim();
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(name)) return report('Use a lowercase name with letters, numbers or dashes.', true);
    const credentialAlias = String(fields.get('credentialAlias') || '').trim().toUpperCase();
    const credential = fields.get('credential');
    event.target.elements.credential.value = '';
    if (credentialAlias && !managedAlias.test(credentialAlias)) return report('Use a valid PLOT_SECRET_ alias for the connection.', true);
    if (credentialAlias && credential) return report('Choose one credential for this connection.', true);
    studioBackend(`backend/connections/${name}`, { method:'PUT', body:JSON.stringify({ url:fields.get('url'), credential, credentialAlias,
      credentialHeader: fields.get('credentialHeader'), methods:[fields.get('method')], allowPrivate:fields.has('private') }) })
      .then(() => { status = 'Server connection saved.'; return reloadConnections(); })
      .catch(error => report(error.message,true));
  });

  root.addEventListener('input', event => {
    const control = event.target;
    if (control.form?.id === 'be-case-form' && caseDraft) caseDraft = readCaseForm(control.form, caseDraft);
    if (control.form?.id === 'be-python-form' && pythonDraft && ['name','source','values','timeout'].includes(control.name)) {
      pythonDraft[control.name] = control.value;
      if (control.name === 'source') {
        const size = backendPythonSourceSize(control.value);
        const body = root.querySelector('#be-python-size');
        body.textContent = `${size.toLocaleString('en-GB')} / 32,768 UTF-8 bytes`;
        body.dataset.overLimit = String(size > BACKEND_PYTHON_SOURCE_LIMIT);
      }
    }
    if (control.id === 'be-search') searchPicker();
    if (control.id === 'be-site-slug') {
      deploySlug = control.value;
      deployVault = null;
      updateHostingAccess(sites.find(site => site.slug === deploySlug.trim().toLowerCase()));
    }
    if (control.dataset.test === 'path') testPath = control.value;
    if (control.dataset.test === 'query') testQuery = control.value;
    if (control.dataset.test === 'body') testBody = control.value;
    if (control.dataset.test === 'headers') testHeaders = control.value;
    if (control.dataset.test === 'secrets') testSecrets = control.value;
  });

  root.addEventListener('toggle', event => {
    if (event.target.classList.contains('be-test-context')) showTestContext = event.target.open;
  }, true);

  root.addEventListener('change', event => {
    const control = event.target;
    const data = control.dataset;
    try {
      if (control.id === 'be-category') searchPicker();
      else if (control.id === 'be-secret-multiline') {
        multilineSecret = control.checked;
        root.querySelector('#be-secret-value-field').innerHTML = secretValueControl();
        root.querySelector('#be-secret-value')?.focus();
      } else if (data.test === 'use-saved-secrets') testSavedSecrets = control.checked;
      else if (control.form?.id === 'be-case-form' && caseDraft) {
        caseDraft = readCaseForm(control.form, caseDraft);
        if (control.name === 'method') render();
        if (data.assert === 'operator') {
          const value = control.closest('.be-case-assertion').querySelector('[data-assert="value"]');
          value.disabled = control.value !== 'equals';
          value.required = !value.disabled;
        }
      }
      else if (control.closest('.be-map-row')) applyMap(control.closest('.be-map'));
      else if (control.id === 'be-site-seed') deploySeed = control.checked;
      else if (control.id === 'be-site-secrets') deployVault = control.value;
      else if (control.id === 'be-site-access') {
        deployPublic = control.value === 'public';
        updateHostingAccess(sites.find(site => site.slug === deploySlug.trim().toLowerCase()));
      }
      else if (data.routeField) {
        patchRoute(item => { item[data.routeField] = control.value.trim(); });
        if (data.routeField === 'path') testPath = control.value.replace(/:[a-zA-Z0-9_]+/g, 'example');
        render();
      } else if (data.stepField) {
        patchStep(item => { item[data.stepField] = control.value; });
        render();
      } else if (data.binding) {
        patchStep(item => {
          if (control.value === 'reference') item.args[data.binding] = { $ref: 'request.body' };
          else if (control.value === 'fields') item.args[data.binding] = {};
          else if (control.value === 'secret') item.args[data.binding] = { $secret: 'PLOT_SECRET_SERVICE' };
          else delete item.args[data.binding];
        });
        render();
      } else if (data.ref || data.secret || data.arg) {
        const key = data.ref || data.secret || data.arg;
        const value = data.ref ? { $ref: control.value.trim() } : data.secret ? { $secret: control.value.trim() } : inputData(control, data.kind);
        patchStep(item => {
          if (item.type === 'run-package' && key === 'package' && item.args.package !== value) delete item.args.operation;
          if (value === undefined || (['package', 'package-operation', 'python-script'].includes(data.kind) && value === '')) delete item.args[key];
          else item.args[key] = value;
        }, key);
        if (['package', 'package-operation'].includes(data.kind)) render();
      }
    } catch (error) { report(error.message, true); }
  });

  return {
    open: setTab,
    refresh() {
      const project = getProject();
      if (project !== currentProject) {
        currentProject = project;
        chooseRoute(model().routes[0]);
        deploySlug = '';
        deployPublic = null;
        deployVault = null;
        caseDraft = null;
        caseResults = new Map();
        caseProgress = '';
        pythonDraft = null;
        pythonResult = null;
        pythonFeedback = '';
        if (tab === 'python') openPythonDraft(pythonScripts()[0]);
      } else if (!model().routes.some(item => item.id === currentRoute)) chooseRoute(model().routes[0]);
      render();
      if (tab === 'routes' || tab === 'secrets' || tab === 'services') void loadSecrets();
      if (!catalog) loadCatalog().then(render).catch(error => report(error.message, true));
    },
  };
}
