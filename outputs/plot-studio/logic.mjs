import { catalogNodes, createCatalogHelpers, readCatalogValue } from './logic-catalog.mjs';

const PAGE_EVENT = 'page-load';
const EVENT_TYPES = { click: 'click', input: 'input', submit: 'submit' };
const FLOW_ENTRY = 'flow-entry';
const KEY_EVENT = 'keyboard';
const CUSTOM_EVENT = 'custom-event';
const browserEvents = new Set([PAGE_EVENT, KEY_EVENT, CUSTOM_EVENT]);
const callingTypes = new Set(['call-flow', 'for-each']);
const operationNames = { 'db-list': 'list', 'db-read': 'read', 'db-create': 'create', 'db-update': 'update', 'db-delete': 'delete' };
const nextOutput = [['next', 'Next']];
const resultOutputs = [['next', 'Success'], ['fault', 'Error']];
const resultData = [['result', 'Result', 'any'], ['error', 'Error', 'object']];
const anyInput = [['input', 'Input', 'any']];
const anyValue = [['value', 'Value', 'any']];
const eventValue = [['value', 'Value', 'any'], ['checked', 'Checked', 'boolean']];
const recordId = ['recordId', 'Record ID', 'string'];
const databaseValues = ['data', 'Field values', 'object'];
const databaseResult = [['result', 'Record', 'object'], ['error', 'Error', 'object']];
const eventOutputs = [['next', 'Run']];

export const nodeTypes = {
  ...catalogNodes,
  [PAGE_EVENT]: { label: 'Page load', group: 'Event', outputs: eventOutputs, values: [['pageId', 'Page ID', 'string']] },
  click: { label: 'Click', group: 'Event', target: true, outputs: eventOutputs, values: anyValue },
  input: { label: 'Input change', group: 'Event', target: true, outputs: eventOutputs, values: eventValue },
  submit: { label: 'Form submission', group: 'Event', target: true, outputs: eventOutputs, values: [...eventValue, ['fields', 'Fields', 'object']] },
  [KEY_EVENT]: { label: 'Keyboard key', group: 'Event', outputs: eventOutputs,
    values: [['key', 'Key', 'string'], ['modifiers', 'Modifiers', 'object']] },
  [CUSTOM_EVENT]: { label: 'Custom event', group: 'Event', outputs: eventOutputs, values: [['detail', 'Detail', 'any']] },
  [FLOW_ENTRY]: { label: 'Flow input', group: 'Flow', outputs: eventOutputs, values: [...anyInput, ['index', 'Item index', 'number']] },
  'call-flow': { label: 'Run flow', group: 'Flow', input: true, outputs: resultOutputs, inputs: anyInput, values: resultData },
  'for-each': { label: 'For each item', group: 'Flow', input: true, outputs: resultOutputs, inputs: [['items', 'Items', 'array']],
    values: [['result', 'Results', 'array'], ['error', 'Error', 'object']] },
  'return-value': { label: 'Return value', group: 'Flow', input: true, outputs: [], inputs: anyValue },
  if: { label: 'Condition', group: 'Logic', input: true, outputs: [['yes', 'Yes'], ['no', 'No']], inputs: [...anyValue, ['comparison', 'Compare with', 'any']] },
  constant: { label: 'Constant', group: 'Logic', outputs: [], values: anyValue, pure: true },
  'get-property': { label: 'Get property', group: 'Logic', input: true, outputs: nextOutput, inputs: anyInput, values: [['result', 'Property', 'any']] },
  'set-variable': { label: 'Set variable', group: 'Logic', input: true, outputs: nextOutput, inputs: anyValue, values: anyValue },
  'get-variable': { label: 'Get variable', group: 'Logic', input: true, outputs: nextOutput, values: anyValue },
  'set-text': { label: 'Set text', group: 'Page action', input: true, target: true, outputs: nextOutput, inputs: anyValue },
  'show-records': { label: 'Show records', group: 'Page action', input: true, target: true, outputs: resultOutputs,
    inputs: [['records', 'Records', 'array']], values: [['count', 'Rows shown', 'number'], ['error', 'Error', 'object']] },
  'set-value': { label: 'Set field value', group: 'Page action', input: true, target: true, outputs: nextOutput, inputs: anyValue },
  visibility: { label: 'Change visibility', group: 'Page action', input: true, target: true, outputs: nextOutput },
  'change-class': { label: 'Change CSS class', group: 'Page action', input: true, target: true, outputs: nextOutput },
  notify: { label: 'Show notification', group: 'Page action', input: true, outputs: nextOutput, inputs: anyValue },
  'run-js': { label: 'JavaScript', group: 'Code & HTTP', input: true, outputs: resultOutputs, inputs: anyInput, values: resultData },
  'http-request': { label: 'HTTP request', group: 'Code & HTTP', input: true, outputs: resultOutputs,
    inputs: [['url', 'URL', 'string'], ['body', 'Body', 'any'], ['headers', 'Headers', 'object']], values: [...resultData, ['status', 'Status', 'number']] },
  'db-list': { label: 'List records', group: 'Database', input: true, outputs: resultOutputs,
    inputs: [['filter', 'Filter', 'any'], ['limit', 'Limit', 'number'], ['offset', 'Offset', 'number']], values: [['result', 'Records', 'array'], ['error', 'Error', 'object']] },
  'db-read': { label: 'Read record', group: 'Database', input: true, outputs: resultOutputs, inputs: [recordId], values: databaseResult },
  'db-create': { label: 'Create record', group: 'Database', input: true, outputs: resultOutputs, inputs: [databaseValues], values: databaseResult },
  'db-update': { label: 'Update record', group: 'Database', input: true, outputs: resultOutputs, inputs: [recordId, databaseValues], values: databaseResult },
  'db-delete': { label: 'Delete record', group: 'Database', input: true, outputs: resultOutputs, inputs: [recordId], values: databaseResult },
  log: { label: 'Log value', group: 'Debug', input: true, outputs: nextOutput, inputs: anyValue },
};

const nodeDescriptions = {
  ...Object.fromEntries(Object.entries(catalogNodes).map(([id, node]) => [id, node.description])),
  [PAGE_EVENT]: 'Start when a page opens.',
  click: 'Start when someone clicks a block.',
  input: 'Start when a form field changes.',
  submit: 'Start when a form is submitted. Provides its field values.',
  [KEY_EVENT]: 'Start on a key press or release.',
  [CUSTOM_EVENT]: 'Listen for a named browser event and use its detail.',
  [FLOW_ENTRY]: 'Define a reusable flow with an input.',
  'call-flow': 'Run a named flow and receive its result.',
  'for-each': 'Run a flow for every item and collect the results.',
  'return-value': 'Finish a reusable flow with a result.',
  if: 'Compare values and follow the Yes or No branch.',
  constant: 'Provide a fixed value, including JSON.',
  'get-property': 'Read a key or index from an object or array.',
  'set-variable': 'Store a value for this run or this page.',
  'get-variable': 'Read a previously stored value.',
  'set-text': 'Replace the text in a page block.',
  'show-records': 'Render an array in a Records table, or show its loading, empty, or error state.',
  'set-value': 'Update a field, select box, or checkbox.',
  visibility: 'Show, hide, or toggle a page block.',
  'change-class': 'Add, remove, or toggle a CSS class.',
  notify: 'Show a short message on the page.',
  'run-js': 'Run async browser JavaScript and return a result.',
  'http-request': 'Call an HTTP API and receive its body and status.',
  'db-list': 'Query multiple records from a table, with filters.',
  'db-read': 'Fetch a table record by ID.',
  'db-create': 'Insert a record into a table.',
  'db-update': 'Modify a table record by ID.',
  'db-delete': 'Remove a table record by ID.',
  log: 'Send a value to the browser console and preview diagnostics.',
};

const searchWords = {
  [PAGE_EVENT]: 'ready init start open', input: 'typing checked selection change', submit: 'send contact fields',
  [KEY_EVENT]: 'keys controls arrows game keydown keyup hotkey', [CUSTOM_EVENT]: 'trigger dispatch message signal listener event',
  [FLOW_ENTRY]: 'function reusable start', 'call-flow': 'function reuse invoke await', 'return-value': 'finish output function',
  'for-each': 'loop iterate repeat array list map rows item',
  if: 'branch check comparison filter true false', 'get-property': 'pluck extract path field',
  'set-variable': 'state store assign', 'get-variable': 'state retrieve access', notify: 'toast alert message',
  'show-records': 'render data rows grid bind list results backend database collection dashboard display',
  'run-js': 'script custom transform code function await', 'http-request': 'fetch REST API webhook URL JSON get post put patch delete',
  'db-list': 'db query find rows search SQL select', 'db-read': 'db query row fetch get', 'db-create': 'db save add row SQL insert',
  'db-update': 'db write edit row patch', 'db-delete': 'db remove row', log: 'inspect debug console trace',
};

const operators = [
  ['equals', 'Equals'], ['not-equals', 'Does not equal'], ['includes', 'Contains'],
  ['empty', 'Is empty'], ['checked', 'Is checked'], ['gt', 'Greater than'], ['gte', 'At least'], ['lt', 'Less than'], ['lte', 'At most'],
];
const visibilityModes = [['toggle', 'Toggle'], ['show', 'Show'], ['hide', 'Hide']];
const recordsModes = [['rows', 'Render records'], ['loading', 'Show loading'], ['empty', 'Show empty'], ['error', 'Show error']];
const classModes = [['toggle', 'Toggle'], ['add', 'Add'], ['remove', 'Remove']];
const valueTypes = [['string', 'Text'], ['number', 'Number'], ['boolean', 'Boolean'], ['json', 'JSON']];
const scopes = [['run', 'This flow run'], ['page', 'Shared while this page is open']];
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const defaultValue = { value: '', valueMode: 'literal', valueType: 'string' };
const defaultRecord = { table: '', recordId: '', data: '{}' };
const defaultConfig = {
  [PAGE_EVENT]: { page: '' }, click: { target: '', preventDefault: false }, input: { target: '', field: '' },
  submit: { target: '', field: '', preventDefault: true }, if: { source: '', field: '', operator: 'equals', value: '' },
  [KEY_EVENT]: { page: '', key: 'Enter', phase: 'keydown', repeats: false, insideFields: false, preventDefault: false },
  [CUSTOM_EVENT]: { page: '', eventName: '' },
  [FLOW_ENTRY]: { name: 'New flow' }, 'call-flow': { flow: '' }, 'for-each': { flow: '' }, 'return-value': { ...defaultValue, valueMode: 'result' },
  constant: { value: '', valueType: 'string' },
  'get-property': { path: '' },
  'set-variable': { name: '', scope: 'run', ...defaultValue, valueMode: 'result' },
  'get-variable': { name: '', scope: 'run' },
  'set-text': { target: '', ...defaultValue },
  'show-records': { target: '', mode: 'rows' },
  'set-value': { target: '', field: '', ...defaultValue },
  visibility: { target: '', mode: 'toggle' },
  'change-class': { target: '', className: '', mode: 'toggle' },
  notify: { ...defaultValue },
  'run-js': { name: '', code: 'return input;' },
  'http-request': { url: '', method: 'GET', headers: '{}', body: '', bodyType: 'json', responseType: 'auto', timeout: '15000' },
  'db-list': { ...defaultRecord, limit: '25', offset: '0', filter: '' },
  'db-read': { ...defaultRecord }, 'db-create': { ...defaultRecord },
  'db-update': { ...defaultRecord }, 'db-delete': { ...defaultRecord },
  log: { label: '', ...defaultValue, valueMode: 'result' },
};

function blockList(project) {
  const targets = [];
  for (const page of project?.pages || []) {
    const walk = (blocks) => {
      for (const block of blocks || []) {
        const display = block.props?.text || block.props?.label || block.props?.title || block.props?.name;
        const name = typeof display === 'string' ? display.trim().replace(/\s+/g, ' ').slice(0, 48) : '';
        targets.push({ id: block.id, pageId: page.id, name: name || block.type, label: `${page.name || page.title || page.slug} · ${name || block.type}`, block });
        walk(block.children);
      }
    };
    walk(page.blocks);
  }
  return targets;
}

function formFields(block) {
  const directFields = new Set(['input', 'select', 'toggle']);
  const labels = [];
  function visit(item) {
    if (item?.type === 'form' && item.props?.usePreset !== false) {
      const lines = String(item.props?.fields ?? 'Name | text | yes\nEmail | email | yes\nMessage | textarea | yes');
      labels.push(...lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split('|')[0].trim()));
    }
    if (directFields.has(item?.type)) labels.push(item.props?.label || item.props?.name || 'Field');
    for (const child of item?.children || []) visit(child);
  }
  visit(block);
  return labels;
}

function graphArrays(graph) {
  const sourceEdges = Array.isArray(graph?.edges) ? graph.edges.filter(Boolean) : [];
  const usedIds = new Set();
  const edges = sourceEdges.map((edge, index) => {
    let id = typeof edge.id === 'string' && edge.id ? edge.id : `wire-import-${index}`;
    while (usedIds.has(id)) id += '-copy';
    usedIds.add(id);
    return id === edge.id ? edge : { ...edge, id };
  });
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes.filter(Boolean) : [],
    edges,
  };
}

function nodeSpec(type) {
  return typeof type === 'string' && Object.hasOwn(nodeTypes, type) ? nodeTypes[type] : undefined;
}

export function canBypass(node) {
  const spec = nodeSpec(node?.type);
  return Boolean(spec?.input && spec.outputs.length === 1 && spec.outputs[0][0] === 'next');
}

function bypassed(node) {
  return node?.disabled === true && canBypass(node);
}

function nodeConfig(node) {
  return { ...defaultConfig[node.type], ...catalogNodes[node.type]?.defaults, ...node.config };
}

function parseLiteral(value, type) {
  if (type === 'json') return typeof value === 'string' ? JSON.parse(value) : JSON.parse(JSON.stringify(value));
  if (type === 'number') {
    if (String(value ?? '').trim() === '' || !Number.isFinite(Number(value))) throw Error('Enter a finite number.');
    return Number(value);
  }
  if (type === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw Error('Enter true or false.');
  }
  return String(value ?? '');
}

function literalPortType(node) {
  const config = nodeConfig(node);
  if (config.valueType !== 'json') return config.valueType;
  try {
    const value = parseLiteral(config.value, 'json');
    if (Array.isArray(value)) return 'array';
    return value === null ? 'any' : typeof value;
  } catch { return 'any'; }
}

function portsFor(node, direction) {
  const spec = nodeSpec(node?.type);
  if (!spec) return [];
  if (direction === 'in') return [...(spec.input ? [['in', 'Run', 'exec']] : []), ...(spec.inputs || [])];
  const values = spec.pure ? [['value', 'Value', literalPortType(node)]] : spec.values || [];
  return [...spec.outputs.map(([id, label]) => [id, label, 'exec']), ...values];
}

export function describeNodeCatalog() {
  const ports = (node, direction) => portsFor(node, direction).map(([name, label, type]) => ({ name, label, type }));
  return Object.entries(nodeTypes).map(([id, spec]) => {
    const node = { type: id };
    return { id, label: spec.label, group: spec.group, description: nodeDescriptions[id], inputs: ports(node, 'in'), outputs: ports(node, 'out'),
      tips: (spec.controls || []).filter(({ description }) => description).map(({ label, description }) => `${label}. ${description}`) };
  });
}

function portType(node, direction, name) {
  return portsFor(node, direction).find(([id]) => name === id)?.[2];
}

function compatible(from, to) {
  if (!from || !to) return false;
  if (from === 'exec' || to === 'exec') return from === to;
  return from === to || from === 'any' || to === 'any';
}

function tableList(project) {
  return Array.isArray(project?.data?.tables) ? project.data.tables : [];
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function validateConfig(node, project, incoming, targets, problems) {
  const fail = (message) => problems.push({ severity: 'error', message, nodeId: node.id });
  const config = nodeConfig(node);
  const spec = nodeSpec(node.type);
  if (spec.target && !config.target) fail(`Select a block for “${spec.label}”.`);
  if (project && config.target && !targets.has(config.target)) fail('The selected block is missing.');
  const usesBlockInput = node.type !== 'if' || !incoming.has('value');
  if (project && usesBlockInput && config.source && !targets.has(config.source)) fail('The block used by this condition is missing.');
  const pageScoped = browserEvents.has(node.type) || (spec.event && spec.event.scope !== 'block');
  if (project && pageScoped && config.page && !project.pages?.some((page) => page.id === config.page)) fail('The selected page is missing.');
  if (spec.args || spec.event) {
    for (const { key, label, type, context, min, max } of spec.args || []) {
      if (incoming.has(key) || (context && (config[key] === '' || config[key] == null))) continue;
      try {
        const value = readCatalogValue(config[key], type);
        if (type === 'number' && ((min != null && value < min) || (max != null && value > max))) throw Error('Use a value within the configured limits.');
      } catch (error) { fail(`${label}. ${error.message}`); }
    }
    if (spec.event?.scope === 'timer') {
      const delay = Number(config.delay);
      const min = spec.event.delay === 'once' ? 50 : 250;
      if (!Number.isSafeInteger(delay) || delay < min || delay > 60000) fail(`Use a whole number between ${min} and 60,000 milliseconds.`);
      if (spec.event.delay === 'repeat' && (!Number.isSafeInteger(Number(config.maxTicks)) || Number(config.maxTicks) < 1 || Number(config.maxTicks) > 1000)) {
        fail('Use a maximum between 1 and 1,000 timer ticks.');
      }
    }
    return;
  }
  const selectedField = fieldNumber(node);
  if (project && usesBlockInput && selectedField !== '' && selectedField >= formFields(targets.get(config.source || config.target)).length) {
    fail('The selected form field is missing.');
  }
  if (node.type === 'change-class' && !/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(config.className || '')) fail('Enter a valid CSS class name.');
  if (node.type === 'show-records' && !recordsModes.some(([mode]) => mode === config.mode)) fail('Choose a supported table state.');
  if (node.type === 'show-records' && project && config.target && targets.get(config.target)?.type !== 'records-table') fail('Select a Records table block.');
  if ([FLOW_ENTRY, 'set-variable', 'get-variable'].includes(node.type) && !String(config.name || '').trim()) fail('Enter a name.');
  if (node.type === 'get-property' && !String(config.path || '').trim()) fail('Enter a property path.');
  if (node.type === CUSTOM_EVENT && (!/^[a-zA-Z][\w:.-]{0,128}$/.test(String(config.eventName ?? '').trim()) || String(config.eventName).trim() === 'plot:trace')) {
    fail('Enter an event name using letters, digits, colons, periods, hyphens or underscores.');
  }
  if (node.type === 'run-js') {
    try {
      const code = String(config.code || '');
      if (code.length > 40000) throw Error('Keep this code block under 40,000 characters.');
      new AsyncFunction('input', 'ctx', 'dom', code);
    }
    catch (error) { fail(`Invalid JavaScript. ${error.message}`); }
  }
  if ((node.type === 'constant' || config.valueMode === 'literal') && !incoming.has('value')) {
    try { parseLiteral(config.value, config.valueType); }
    catch (error) { fail(`Invalid literal. ${error.message}`); }
  }
  const json = (key, label, expected) => {
    if (incoming.has(key) || config[key] === '') return;
    try {
      const value = parseLiteral(config[key], 'json');
      if (expected === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) fail(`${label} must be a JSON object.`);
      if (expected === 'filter' && (!value || typeof value !== 'object')) fail(`${label} must be a JSON object or array.`);
    } catch (error) { fail(`${label} contains invalid JSON. ${error.message}`); }
  };
  if (node.type === 'http-request') {
    if (!incoming.has('url') && !String(config.url || '').trim()) fail('Enter a URL or connect a URL output.');
    json('headers', 'Headers', 'object');
    if (!['GET', 'HEAD'].includes(config.method) && config.bodyType === 'json') json('body', 'Request body');
    const timeout = Number(config.timeout);
    if (!Number.isFinite(timeout) || timeout < 0) fail('Enter a nonnegative timeout in milliseconds. A zero uses 30,000.');
    else if (timeout > 30000) problems.push({ severity: 'warning', message: 'HTTP requests time out after a maximum of 30,000 milliseconds.', nodeId: node.id });
  }
  if (Object.hasOwn(operationNames, node.type)) {
    if (!config.table || (project && !tableList(project).some((table) => table.id === config.table))) fail('Select a database table.');
    if (['db-read', 'db-delete', 'db-update'].includes(node.type) && !incoming.has('recordId') && !String(config.recordId || '').trim()) fail('Enter a record ID or connect its output.');
    if (['db-create', 'db-update'].includes(node.type)) json('data', 'Field values', 'object');
    if (node.type === 'db-list') {
      json('filter', 'Filter', 'filter');
      if (!incoming.has('limit') && (!Number.isInteger(Number(config.limit)) || Number(config.limit) < 1)) fail('Enter a positive row limit.');
      if (!incoming.has('offset') && (!Number.isSafeInteger(Number(config.offset)) || Number(config.offset) < 0)) fail('Enter a nonnegative whole-number offset.');
    }
  }
}

function analyzeGraph(graph, project) {
  const { nodes, edges } = graphArrays(graph);
  const nodeMap = new Map();
  const outgoing = new Map();
  const incoming = new Map();
  const targets = new Map(blockList(project).map(({ id, block }) => [id, block]));
  const diagnostics = [];
  const issue = (severity, message, nodeId) => diagnostics.push({ severity, message, nodeId });
  if (nodes.length > 1200 || edges.length > 6000) {
    issue('error', 'Keep each graph under 1,200 nodes and 6,000 wires.');
    return { diagnostics, outgoing, incoming, nodeMap, triggers: [], reachable: new Set() };
  }

  for (const node of nodes) {
    const spec = nodeSpec(node.type);
    if (typeof node.id !== 'string' || !node.id || nodeMap.has(node.id)) {
      issue('error', 'Each node needs a unique ID.', node.id);
      continue;
    }
    if (!spec) {
      issue('error', `Unsupported node type: ${String(node.type)}.`, node.id);
      continue;
    }
    nodeMap.set(node.id, node);
    outgoing.set(node.id, new Map());
    incoming.set(node.id, new Map());
  }

  for (const edge of edges) {
    const source = nodeMap.get(edge.from?.nodeId);
    const destination = nodeMap.get(edge.to?.nodeId);
    const from = portType(source, 'out', edge.from?.port);
    const to = portType(destination, 'in', edge.to?.port);
    if (!compatible(from, to)) {
      issue('error', 'Connect outputs and inputs of compatible types.', source?.id || destination?.id);
      continue;
    }
    if (from === 'exec') {
      const sourcePorts = outgoing.get(source.id);
      if (sourcePorts.has(edge.from.port)) {
        issue('error', 'Each execution output can have one connection.', source.id);
        continue;
      }
      sourcePorts.set(edge.from.port, destination.id);
      continue;
    }
    const destinationPorts = incoming.get(destination.id);
    if (destinationPorts.has(edge.to.port)) {
      issue('error', 'Each data input can have one connection.', destination.id);
      continue;
    }
    destinationPorts.set(edge.to.port, edge.from);
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      issue('error', 'This connection creates a cycle.', id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodeMap.get(id);
    const flow = callingTypes.has(node.type) ? nodeMap.get(nodeConfig(node).flow) : undefined;
    if (flow?.type === FLOW_ENTRY) visit(flow.id);
    for (const next of outgoing.get(id).values()) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  const triggers = [...nodeMap.values()].filter((node) => browserEvents.has(node.type) || Object.hasOwn(EVENT_TYPES, node.type) || catalogNodes[node.type]?.event);
  for (const trigger of triggers) {
    visit(trigger.id);
    if (!outgoing.get(trigger.id).size) issue('warning', 'Connect the event to an action or condition.', trigger.id);
  }
  const reachable = new Set(visited);
  const liveConstants = new Set();
  function isEarlierInFlow(sourceId, destinationId) {
    const pending = [...outgoing.get(sourceId).values()];
    const checked = new Set([sourceId]);
    for (let i = 0; i < pending.length; i++) {
      const nodeId = pending[i];
      if (nodeId === destinationId && sourceId !== destinationId) return true;
      if (checked.has(nodeId)) continue;
      checked.add(nodeId);
      pending.push(...outgoing.get(nodeId).values());
    }
    return false;
  }
  for (const id of reachable) {
    for (const source of incoming.get(id).values()) {
      if (bypassed(nodeMap.get(source.nodeId)) && !bypassed(nodeMap.get(id))) {
        issue('error', 'A bypassed node does not provide data. Remove this wire or enable the source node.', id);
        continue;
      }
      if (nodeSpec(nodeMap.get(source.nodeId).type).pure) liveConstants.add(source.nodeId);
      else if (!isEarlierInFlow(source.nodeId, id)) issue('warning', 'The linked data must come from an earlier step in this flow.', id);
    }
  }
  for (const [id, node] of nodeMap) {
    const live = reachable.has(id) || liveConstants.has(id);
    if (!live && !nodeSpec(node.type).pure) issue('warning', node.type === FLOW_ENTRY ? 'This flow is unused.' : 'No event reaches this node.', id);
    const configDiagnostics = [];
    if (!bypassed(node)) validateConfig(node, project, incoming.get(id), targets, configDiagnostics);
    if (node.disabled === true && !canBypass(node)) issue('warning', 'This node cannot be bypassed and will still run.', id);
    if (callingTypes.has(node.type) && nodeMap.get(nodeConfig(node).flow)?.type !== FLOW_ENTRY) {
      configDiagnostics.push({ severity: 'error', message: 'Select a reusable flow.', nodeId: id });
    }
    for (const item of configDiagnostics) diagnostics.push({ ...item, severity: live ? item.severity : 'warning' });
    visit(id);
  }
  return { diagnostics, outgoing, incoming, nodeMap, triggers, reachable };
}

function jsString(value) {
  return jsLiteral(String(value ?? ''));
}

function jsLiteral(value) {
  if (value === undefined) return 'undefined';
  const json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return value && typeof value === 'object' ? `JSON.parse(${JSON.stringify(json)})` : json;
}

const selectors = String.raw`  const blocks = new Map();
  document.querySelectorAll('[data-block-id]').forEach((element) => blocks.set(element.dataset.blockId, element));
  const getBlock = (id) => blocks.get(id);`;
const textConversion = `  const text = (value) => String(value ?? '');`;
const fields = String.raw`  const fieldSelector = 'input, select, textarea';
  const findField = (element, index = 0) => {
    if (element?.matches(fieldSelector)) return element;
    return element?.querySelectorAll(fieldSelector)[index];
  };`;
const readValue = String.raw`  const read = (element) => {
    if (!element) return { value: '', checked: false };
    if (typeof element.value !== 'undefined') return { value: element.value, checked: Boolean(element.checked) };
    const field = findField(element);
    return field ? read(field) : { value: element.textContent || '', checked: false };
  };`;
const executionContext = String.raw`  const pageVariables = Object.create(null);
  const budgets = new WeakMap();
  const previewTrace = globalThis.__plotStudioTraceEnabled === true;
  let running = 0;
  let starts = 0;
  let rateWindow = -Infinity;
  let lastWarning = -Infinity;
  let traceWindow = -Infinity;
  let traceCount = 0;
  const contextFor = (event, trigger, variables = Object.create(null)) => {
    const pageId = document.body?.dataset.pageId;
    const context = {
      event, trigger, pageId, target: event?.target, currentTarget: event?.currentTarget,
      value: trigger.value ?? '', checked: Boolean(trigger.checked),
      input: trigger.value, result: undefined, hasResult: false, error: undefined, outputs: new Map(),
      variables, vars: variables, state: pageVariables,
    };
    budgets.set(context, { steps: 0, deadline: performance.now() + 120000 });
    return context;
  };
  const flowLimit = (message) => Object.assign(new Error(message), { code: 'FLOW_LIMIT' });
  const countStep = (context) => {
    const budget = budgets.get(context);
    if (performance.now() > budget.deadline) throw flowLimit('This run reached the 120-second flow limit.');
    if (++budget.steps > 8000) throw flowLimit('This run reached the 8,000-step flow limit.');
    return budget.steps % 64 === 0;
  };
  const publish = (context, id, outputs) => {
    context.outputs.set(id, outputs);
    if (Object.hasOwn(outputs, 'result')) {
      context.result = outputs.result;
      context.hasResult = true;
    }
    if (Object.hasOwn(outputs, 'error')) context.error = outputs.error;
  };
  const trace = (nodeId, phase, detail = {}) => {
    if (phase !== 'error' && phase !== 'log') {
      if (!previewTrace) return;
      const now = performance.now();
      if (now - traceWindow >= 1000) { traceWindow = now; traceCount = 0; }
      if (++traceCount > 50) return;
    }
    const level = phase === 'error' ? 'error' : 'info';
    let message = detail.error?.message || detail.label || ({ start: 'Flow started', complete: 'Flow completed' }[phase] ?? 'Blueprint');
    if (phase === 'log') {
      let value;
      try { value = typeof detail.value === 'string' ? detail.value : JSON.stringify(detail.value); }
      catch { value = String(detail.value); }
      message += ': ' + (value ?? String(detail.value));
    }
    window.dispatchEvent(new CustomEvent('plot:trace', { detail: { nodeId, phase, level, message: String(message).slice(0, 1200) } }));
  };
  const errorInfo = (error) => ({
    name: error?.name || 'Error', message: error?.message || String(error),
    code: error?.code, status: error?.status, data: error?.data, headers: error?.headers,
  });
  const start = (step, context, nodeId) => {
    const now = performance.now();
    if (now - rateWindow >= 1000) { rateWindow = now; starts = 0; }
    if (running >= 48 || starts >= 120) {
      if (now - lastWarning >= 1000) {
        lastWarning = now;
        trace(nodeId, 'error', { error: errorInfo(flowLimit('Extra triggers were skipped. Too many runs started or are still running.')) });
      }
      return Promise.resolve(false);
    }
    starts++;
    running++;
    trace(nodeId, 'start');
    return step(context).then(
      () => { trace(nodeId, 'complete'); return true; },
      (error) => { trace(nodeId, 'error', { error: errorInfo(error) }); console.error('Plot Studio flow failed', error); return false; },
    ).finally(() => { running--; });
  };`;
const bindEvent = String.raw`  const bind = (name, id, nodeId, step, preventDefault, index) => getBlock(id)?.addEventListener(name, (event) => {
    const field = index === undefined ? null : findField(event.currentTarget, index);
    if (name === 'input' && field && event.target !== field) return;
    if (preventDefault) event.preventDefault();
    const source = field || (event.target instanceof Element && event.target.matches(fieldSelector) ? event.target : event.currentTarget);
    const trigger = read(source);
    if (name === 'submit' && event.currentTarget instanceof HTMLFormElement) {
      const entries = Object.create(null);
      for (const [key, value] of new FormData(event.currentTarget)) {
        if (Object.hasOwn(entries, key)) entries[key] = [].concat(entries[key], value);
        else entries[key] = value;
      }
      trigger.fields = entries;
    }
    const context = contextFor(event, trigger);
    publish(context, nodeId, trigger);
    start(step, context, nodeId);
  });`;
const requestRuntime = String.raw`  const request = async ({ url, method, headers, body, bodyType, responseType, timeout }) => {
    const address = new URL(String(url), document.baseURI);
    if (!['https:', 'http:'].includes(address.protocol) || address.username || address.password) throw Error('Enter an HTTP or HTTPS URL without credentials.');
    const requestHeaders = new Headers(headers || {});
    const controller = new AbortController();
    const settings = { method, headers: requestHeaders, signal: controller.signal };
    if (!['GET', 'HEAD'].includes(method) && body !== undefined && bodyType !== 'none') {
      if (bodyType === 'json') {
        if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
        settings.body = JSON.stringify(body);
      } else settings.body = typeof body === 'string' ? body : String(body);
      if (new TextEncoder().encode(settings.body).byteLength > 1000000) throw Error('Request body exceeds the 1 MB limit.');
    }
    const timer = setTimeout(() => controller.abort(new Error('Request timed out.')), timeout || 30000);
    try {
      const response = await fetch(address, settings);
      const limit = 2000000;
      const tooLarge = () => Object.assign(new Error('Response body exceeds the 2 MB limit.'), { code: 'HTTP_SIZE_LIMIT', status: response.status });
      if (Number(response.headers.get('content-length')) > limit) { controller.abort(); throw tooLarge(); }
      let content = '';
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) { controller.abort(); throw tooLarge(); }
            content += decoder.decode(value, { stream: true });
          }
          content += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      const hasJSON = /(?:[\/+])json\b/i.test(response.headers.get('content-type') || '');
      let data = content || null;
      if ((responseType === 'json' || responseType === 'auto' && hasJSON) && content) {
        try { data = JSON.parse(content); }
        catch (error) { if (response.ok) throw Object.assign(error, { status: response.status }); }
      }
      if (!response.ok) {
        throw Object.assign(new Error('HTTP ' + response.status + (response.statusText ? ' ' + response.statusText : '')),
          { name: 'HttpError', code: 'HTTP_ERROR', status: response.status, data });
      }
      return { data, status: response.status };
    } finally { clearTimeout(timer); }
  };`;
const databaseRuntime = String.raw`  const queryDatabase = async (request) => {
    if (typeof globalThis.plotData?.query !== 'function') {
      throw Object.assign(new Error('This site has no configured database connection.'), { code: 'DATA_UNAVAILABLE' });
    }
    return globalThis.plotData.query(request);
  };`;
const recordsRuntime = String.raw`  const showRecords = (element, mode, records) => {
    const body = element?.querySelector('[data-records-body]');
    const status = element?.querySelector('[data-records-status]');
    if (!element?.matches('[data-block-type="records-table"]') || !body || !status) {
      throw Object.assign(new Error('The Records table is missing on this page.'), { code: 'RECORDS_TABLE_MISSING' });
    }
    const apply = (state, children) => {
      body.replaceChildren(...(children ? [children] : []));
      element.dataset.recordsState = state;
      if (state === 'loading') element.setAttribute('aria-busy', 'true');
      else element.removeAttribute('aria-busy');
      status.textContent = ({ loading: element.dataset.recordsLoading, empty: element.dataset.recordsEmpty, error: element.dataset.recordsError })[state] || '';
    };
    if (mode !== 'rows') { apply(mode); return 0; }
    if (!Array.isArray(records) || records.length > 500 || records.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      apply('error');
      throw Object.assign(new Error('Expected an array of up to 500 record objects.'), { code: 'INVALID_RECORDS' });
    }
    const fields = Array.from(element.querySelectorAll('th[data-records-field]'), th => th.dataset.recordsField);
    if (!fields.length || fields.length > 12) {
      apply('error');
      throw Object.assign(new Error('Configure between 1 and 12 table columns.'), { code: 'INVALID_RECORD_COLUMNS' });
    }
    if (!records.length) { apply('empty'); return 0; }
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const row = document.createElement('tr');
      for (const field of fields) {
        const cell = document.createElement('td');
        const value = Object.hasOwn(record, field) ? record[field] : undefined;
        cell.textContent = (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? String(value).slice(0, 2500) : '–';
        row.append(cell);
      }
      fragment.append(row);
    }
    apply('ready', fragment);
    return records.length;
  };`;
const propertyRuntime = String.raw`  const property = (value, path) => {
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').map((key) => key.trim()).filter(Boolean);
    for (const key of keys) {
      if (value == null || !Object.hasOwn(Object(value), key)) return undefined;
      value = value[key];
    }
    return value;
  };`;
const childContextRuntime = String.raw`  const childContext = (parent, input, index) => {
    const child = contextFor(parent.event, parent.trigger, parent.variables);
    budgets.set(child, budgets.get(parent));
    child.target = parent.target;
    child.currentTarget = parent.currentTarget;
    child.input = input;
    child.result = input;
    child.hasResult = true;
    child.index = index;
    return child;
  };`;
const catalogEventRuntime = String.raw`  const bindCatalogEvent = ({ name, scope, page, target, delay, minimum, repeats, maximum }, id, step) => {
    if (page && document.body?.dataset.pageId !== page) return;
    const fire = (event, data) => {
      const context = contextFor(event, data);
      publish(context, id, data);
      return start(step, context, id);
    };
    if (scope === 'timer') {
      let ticks = 0;
      const tick = async () => {
        await fire(null, { value: ++ticks });
        if (repeats && ticks < maximum) setTimeout(tick, delay);
      };
      setTimeout(tick, delay);
      return;
    }
    const node = scope === 'window' ? window : scope === 'document' ? document : getBlock(target);
    let last = -Infinity;
    node?.addEventListener(name, (event) => {
      const time = performance.now();
      if (time - last < minimum) return;
      last = time;
      const subject = event.target;
      const data = {};
      if (name === 'resize') Object.assign(data, { x: innerWidth, y: innerHeight });
      else if (name === 'scroll') Object.assign(data, { x: scrollX, y: scrollY });
      else if (name === 'visibilitychange') data.value = document.visibilityState === 'visible';
      else if (name === 'hashchange') data.value = location.hash.slice(1);
      else if (['play', 'pause', 'ended', 'waiting', 'seeked'].includes(name)) data.value = subject.currentTime;
      else if (name === 'durationchange') data.value = Number.isFinite(subject.duration) ? subject.duration : null;
      else if (name === 'load' || name === 'error') {
        if (subject.tagName !== 'IMG') return;
        data.detail = { src:subject.currentSrc || subject.src, width:subject.naturalWidth, height:subject.naturalHeight };
      } else if (name === 'animationend') data.detail = { name:event.animationName, elapsed:event.elapsedTime, pseudoElement:event.pseudoElement };
      else if (name === 'transitionend') data.detail = { property:event.propertyName, elapsed:event.elapsedTime, pseudoElement:event.pseudoElement };
      else if (name === 'toggle') data.checked = subject.open;
      else if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        data.x = event.clientX;
        data.y = event.clientY;
        data.detail = { x: data.x, y: data.y, button: event.button, pointer: event.pointerType || 'mouse' };
      } else if (subject instanceof Element) {
        data.value = subject.value;
        data.checked = Boolean(subject.checked);
      }
      void fire(event, data);
    }, { capture: scope === 'block', passive: name === 'scroll' });
    if (name === 'load' && node) {
      for (const image of node.matches('img') ? [node] : node.querySelectorAll('img')) {
        if (image.complete && image.naturalWidth) queueMicrotask(() => void fire(null, {
          detail: { src:image.currentSrc || image.src, width:image.naturalWidth, height:image.naturalHeight },
        }));
      }
    }
  };`;
const customTimeoutRuntime = String.raw`  const waitForCustomCode = async (execute) => {
    let timer;
    try {
      return await Promise.race([execute(), new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(flowLimit('Custom JavaScript did not finish within 30 seconds.')), 30000);
      })]);
    } finally { clearTimeout(timer); }
  };`;
const actionBodies = {
  'set-text': String.raw`  const setText = (element, value) => {
    if (!element) return;
    const target = element.matches('[data-logic-text]') ? element : element.querySelector('[data-logic-text]');
    if (target) target.textContent = text(value);
    else if (!element.childElementCount) element.textContent = text(value);
  };`,
  'set-value': String.raw`  const setValue = (field, value) => {
    if (!field || field.type === 'file') return;
    if (field.type === 'checkbox' || field.type === 'radio') {
      field.checked = ['true', '1', 'on', field.value.toLowerCase()].includes(text(value).trim().toLowerCase());
      return;
    }
    field.value = text(value);
  };`,
  visibility: String.raw`  const previousDisplay = new WeakMap();
  const setVisibility = (element, mode) => {
    if (!element) return;
    const isHidden = element.hidden || getComputedStyle(element).display === 'none';
    const show = mode === 'show' || (mode === 'toggle' && isHidden);
    if (show) {
      element.hidden = false;
      const previous = previousDisplay.get(element);
      if (previous) {
        const [value, priority] = previous;
        if (value && value !== 'none') element.style.setProperty('display', value, priority);
        else element.style.removeProperty('display');
        previousDisplay.delete(element);
      } else if (element.style.display === 'none') {
        element.style.removeProperty('display');
      }
      return;
    }
    if (!previousDisplay.has(element)) previousDisplay.set(element, [element.style.display, element.style.getPropertyPriority('display')]);
    element.hidden = true;
    element.style.setProperty('display', 'none', 'important');
  };`,
  'change-class': String.raw`  const changeClass = (element, name, mode) => {
    if (!element) return;
    if (mode === 'add') element.classList.add(name);
    else if (mode === 'remove') element.classList.remove(name);
    else element.classList.toggle(name);
  };`,
  notify: String.raw`  let notificationRegion;
  let notificationTimer;
  const notify = (value) => {
    if (!notificationRegion) {
      notificationRegion = document.createElement('div');
      notificationRegion.setAttribute('role', 'status');
      Object.assign(notificationRegion.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: '10000', maxWidth: 'calc(100vw - 32px)',
        font: '500 15px/1.4 system-ui, sans-serif', borderRadius: '8px', padding: '12px 16px',
        color: '#fff', background: '#181818', overflowWrap: 'anywhere', pointerEvents: 'none',
      });
      document.body.append(notificationRegion);
    }
    clearTimeout(notificationTimer);
    notificationRegion.hidden = false;
    notificationRegion.textContent = text(value);
    notificationTimer = setTimeout(() => { notificationRegion.hidden = true; }, 4200);
  };`,
};

const customRuntime = String.raw`  const resolveElement = (element) => typeof element === 'string' ? getBlock(element) : element;
  const dom = Object.freeze({
    block: getBlock,
    query: (selector, root = document) => root.querySelector(selector),
    queryAll: (selector, root = document) => Array.from(root.querySelectorAll(selector)),
    field: (element, index = 0) => findField(resolveElement(element), index),
    read: (element) => read(resolveElement(element)),
    text: (element, value) => setText(resolveElement(element), value),
    value: (element, value, index = 0) => setValue(findField(resolveElement(element), index), value),
    show: (element) => setVisibility(resolveElement(element), 'show'),
    hide: (element) => setVisibility(resolveElement(element), 'hide'),
    notify,
  });`;

function fieldNumber(node, defaultIndex = '') {
  const value = nodeConfig(node).field;
  const numeric = Number(value);
  return value !== '' && value != null && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : defaultIndex;
}

export function compileGraph(graph, project) {
  const { diagnostics, outgoing, incoming, nodeMap, triggers, reachable } = analyzeGraph(graph, project);
  const entries = triggers.filter((node) => outgoing.get(node.id).size);
  if (!entries.length || diagnostics.some((item) => item.severity === 'error')) return { code: '', diagnostics };

  const functionNames = new Map([...reachable].map((id, index) => [id, `step${index + 1}`]));
  const activeNodes = [...reachable].map((id) => nodeMap.get(id));
  const effectiveNodes = activeNodes.filter((node) => !bypassed(node));
  const activeTypes = new Set(effectiveNodes.map((node) => node.type));
  const binds = entries.some((node) => Object.hasOwn(EVENT_TYPES, node.type));
  const extensionNodes = effectiveNodes.filter((node) => catalogNodes[node.type]?.run);
  const extensionEvents = entries.some((node) => catalogNodes[node.type]?.event);
  const hasCustom = activeTypes.has('run-js');
  const reads = binds || hasCustom || effectiveNodes.some((node) => node.type === 'if' && nodeConfig(node).source);
  const hasSelectedBlock = reads || effectiveNodes.some((node) => nodeSpec(node.type).target);
  const lines = [executionContext];
  if (hasSelectedBlock) lines.push(selectors);
  if (hasCustom || ['if', 'set-text', 'set-value', 'notify'].some((type) => activeTypes.has(type))) lines.push(textConversion);
  if (reads || activeTypes.has('set-value')) lines.push(fields);
  if (reads) lines.push(readValue);
  if (binds) lines.push(bindEvent);
  if (extensionEvents) lines.push(catalogEventRuntime);
  if (extensionNodes.length) lines.push(`  const catalogHelpers = (${createCatalogHelpers.toString()})();`);
  if (activeTypes.has('http-request')) lines.push(requestRuntime);
  if ([...activeTypes].some((type) => Object.hasOwn(operationNames, type))) lines.push(databaseRuntime);
  if (activeTypes.has('show-records')) lines.push(recordsRuntime);
  if (activeTypes.has('get-property')) lines.push(propertyRuntime);
  if ([...activeTypes].some((type) => callingTypes.has(type))) lines.push(childContextRuntime);
  for (const [type, source] of Object.entries(actionBodies)) {
    if (activeTypes.has(type) || (hasCustom && type !== 'change-class')) lines.push(source);
  }
  if (hasCustom) lines.push(customRuntime, customTimeoutRuntime);

  for (const node of activeNodes) {
    const { id, type } = node;
    const spec = nodeSpec(type);
    if (!spec.input && type !== FLOW_ENTRY) continue;
    const extension = catalogNodes[type];
    const config = nodeConfig(node);
    const target = `getBlock(${jsString(config.target)})`;
    const idLiteral = jsString(id);
    const next = (port) => functionNames.get(outgoing.get(id).get(port));
    const linked = (port) => incoming.get(id).get(port);
    const supplied = (port, fallback) => {
      const source = linked(port);
      if (!source) return typeof fallback === 'function' ? fallback() : fallback;
      const producer = nodeMap.get(source.nodeId);
      if (producer.type === 'constant') {
        const literal = nodeConfig(producer);
        return jsLiteral(parseLiteral(literal.value, literal.valueType));
      }
      return `context.outputs.get(${jsString(source.nodeId)})?.[${jsString(source.port)}]`;
    };
    const value = () => supplied('value', () => {
      if (config.valueMode === 'event') return 'context.value';
      if (config.valueMode === 'result') return 'context.result';
      if (config.valueMode === 'error') return 'context.error';
      return jsLiteral(parseLiteral(config.value, config.valueType));
    });
    const input = () => supplied('input', '(context.hasResult ? context.result : context.input ?? context.value)');
    const configuredJSON = (key) => supplied(key, () => config[key] === '' ? 'undefined' : jsLiteral(parseLiteral(config[key], 'json')));
    const runNext = (port, indent = '    ') => {
      if (next(port)) lines.push(`${indent}return ${next(port)}(context);`);
    };
    const outcome = (expression, output = '{ result }', extraError = '') => {
      lines.push('    let result;', '    try {', `      result = await ${expression};`, '    } catch (error) {',
        '      const failure = errorInfo(error);', `      publish(context, ${idLiteral}, { error: failure${extraError} });`);
      if (next('fault')) {
        lines.push(`      trace(${idLiteral}, 'error', { error: failure });`);
        runNext('fault', '      ');
      }
      else lines.push('      throw error;');
      lines.push('    }', `    publish(context, ${idLiteral}, ${output});`);
    };
    lines.push('', `  // ${spec.label}`, `  async function ${functionNames.get(id)}(context) {`,
      '    if (countStep(context)) await new Promise((resolve) => setTimeout(resolve, 0));');
    if (bypassed(node)) {
      lines.push(`    trace(${idLiteral}, 'bypass', { label: ${jsString(`${spec.label} (bypassed)`)} });`);
      runNext('next');
      lines.push('  }');
      continue;
    }
    lines.push(`    trace(${idLiteral}, 'step', { label: ${jsString(spec.label)} });`);
    if (extension) {
      const params = extension.args.map(({ key, type, context }) => {
        const raw = config[key];
        const fallback = () => context && (raw === '' || raw == null) ? input() : jsLiteral(readCatalogValue(raw, type));
        return `${key}: ${supplied(key, fallback)}`;
      });
      if (extension.target) params.push(`target: ${target}`);
      const expression = `catalogHelpers.validateResult(await (${extension.run.toString()})({ ${params.join(', ')} }, catalogHelpers, context, ${idLiteral}), ${jsString(extension.values[0][2])})`;
      const projections = extension.projections || [];
      const publication = projections.length ? `{ result, ${projections.map(([name]) => `${name}: result.${name}`).join(', ')} }` : '{ result }';
      const errors = projections.map(([name]) => `, ${name}: failure.${name === 'body' ? 'data' : name}`).join('');
      outcome(expression, publication, errors);
      if (extension.branch && (next('yes') || next('no'))) {
        lines.push('    if (result) {');
        runNext('yes', '      ');
        lines.push('    } else {');
        runNext('no', '      ');
        lines.push('    }');
      } else runNext('next');
      lines.push('  }');
      continue;
    }
    if (type === 'run-js') {
      lines.push('    const evaluate = async function (input, ctx, dom) {', { raw: String(config.code || '') }, '    };');
    }
    switch (type) {
      case FLOW_ENTRY:
        lines.push(`    publish(context, ${idLiteral}, { input: context.input, index: context.index });`);
        if (next('next')) lines.push(`    await ${next('next')}(context);`);
        lines.push('    return context.result;');
        break;
      case 'call-flow': {
        const flow = functionNames.get(config.flow);
        outcome(`${flow}(childContext(context, ${input()}))`);
        break;
      }
      case 'for-each': {
        const flow = functionNames.get(config.flow);
        const items = supplied('items', '(context.hasResult ? context.result : context.input)');
        lines.push('    const runItems = async () => {', `      const items = ${items};`,
          '      if (!Array.isArray(items)) throw TypeError("For each expects an array of items.");',
          '      if (items.length > 4000) throw flowLimit("For each supports up to 4,000 items in one run.");',
          '      const results = [];', '      for (const [index, item] of [...items].entries()) {',
          `        results.push(await ${flow}(childContext(context, item, index)));`,
          '      }', '      return results;', '    };');
        outcome('runItems()');
        break;
      }
      case 'return-value': lines.push(`    context.result = ${value()};`, '    context.hasResult = true;'); break;
      case 'if': {
        const sourceBlock = `getBlock(${jsString(config.source)})`;
        const fieldIndex = fieldNumber(node);
        const source = linked('value') ? `{ value: ${supplied('value')} }`
          : config.source ? `read(${fieldIndex === '' ? sourceBlock : `findField(${sourceBlock}, ${fieldIndex})`})` : 'context';
        const wanted = supplied('comparison', jsString(config.value));
        const conditions = {
          equals: linked('comparison') ? 'Object.is(candidate.value, wanted)' : 'text(candidate.value) === wanted',
          'not-equals': linked('comparison') ? '!Object.is(candidate.value, wanted)' : 'text(candidate.value) !== wanted',
          includes: 'Array.isArray(candidate.value) ? candidate.value.includes(wanted) : text(candidate.value).includes(text(wanted))',
          empty: 'candidate.value == null || (Array.isArray(candidate.value) ? !candidate.value.length : text(candidate.value).trim() === "")',
          checked: 'candidate.checked ?? candidate.value === true',
          gt: 'Number(candidate.value) > Number(wanted)', gte: 'Number(candidate.value) >= Number(wanted)',
          lt: 'Number(candidate.value) < Number(wanted)', lte: 'Number(candidate.value) <= Number(wanted)',
        };
        const comparison = Object.hasOwn(conditions, config.operator) ? conditions[config.operator] : conditions.equals;
        lines.push(`    const candidate = ${source};`);
        if (comparison.includes('wanted')) lines.push(`    const wanted = ${wanted};`);
        lines.push(`    if (${comparison}) {`);
        runNext('yes', '      ');
        lines.push('    }');
        if (next('no')) {
          if (next('yes')) runNext('no');
          else {
            lines[lines.length - 1] = '    } else {';
            runNext('no', '      ');
            lines.push('    }');
          }
        }
        break;
      }
      case 'get-property':
        lines.push(`    publish(context, ${idLiteral}, { result: property(${input()}, ${jsString(config.path)}) });`);
        break;
      case 'set-variable': {
        const scope = config.scope === 'page' ? 'state' : 'variables';
        lines.push(`    const value = ${value()};`, `    context.${scope}[${jsString(String(config.name).trim())}] = value;`,
          `    publish(context, ${idLiteral}, { value, result: value });`);
        break;
      }
      case 'get-variable': {
        const scope = config.scope === 'page' ? 'state' : 'variables';
        lines.push(`    const value = context.${scope}[${jsString(String(config.name).trim())}];`, `    publish(context, ${idLiteral}, { value, result: value });`);
        break;
      }
      case 'set-text': lines.push(`    setText(${target}, ${value()});`); break;
      case 'show-records':
        outcome(`showRecords(${target}, ${jsString(config.mode)}, ${config.mode === 'rows' ? supplied('records', 'context.result') : 'undefined'})`, '{ count: result }');
        break;
      case 'set-value': lines.push(`    setValue(findField(${target}, ${fieldNumber(node, 0)}), ${value()});`); break;
      case 'visibility': lines.push(`    setVisibility(${target}, ${jsString(config.mode)});`); break;
      case 'change-class': lines.push(`    changeClass(${target}, ${jsString(config.className)}, ${jsString(config.mode)});`); break;
      case 'notify': lines.push(`    notify(${value()});`); break;
      case 'run-js': outcome(`waitForCustomCode(() => evaluate(${input()}, context, dom))`); break;
      case 'http-request': {
        const method = methods.includes(config.method) ? config.method : 'GET';
        const body = ['GET', 'HEAD'].includes(method) || config.bodyType === 'none' ? 'undefined'
          : config.bodyType === 'json' ? configuredJSON('body') : supplied('body', jsString(config.body));
        const params = `url: ${supplied('url', jsString(config.url))}, method: ${jsString(method)}, headers: ${configuredJSON('headers')},\n`
          + `        body: ${body}, bodyType: ${jsString(config.bodyType)}, responseType: ${jsString(config.responseType)}, timeout: ${Math.min(30000, Number(config.timeout))}`;
        outcome(`request({\n        ${params}\n      })`, '{ result: result.data, status: result.status }', ', status: failure.status');
        break;
      }
      case 'log':
        lines.push(`    const value = ${value()};`, `    console.log(${jsString(config.label || 'Blueprint')}, value);`,
          `    trace(${idLiteral}, 'log', { label: ${jsString(config.label || 'Blueprint')}, value });`);
        break;
      default: {
        const operation = operationNames[type];
        const params = [`operation: ${jsString(operation)}`, `table: ${jsString(config.table)}`];
        if (['read', 'delete', 'update'].includes(operation)) params.push(`id: ${supplied('recordId', jsString(config.recordId))}`);
        if (['create', 'update'].includes(operation)) params.push(`data: ${configuredJSON('data')}`);
        if (operation === 'list') {
          params.push(`filter: ${configuredJSON('filter')}`, `limit: ${supplied('limit', String(Number(config.limit)))}`);
          if (linked('offset') || Number(config.offset)) params.push(`offset: ${supplied('offset', String(Number(config.offset)))}`);
        }
        outcome(`queryDatabase({ ${params.join(', ')} })`);
      }
    }
    if (type !== FLOW_ENTRY) runNext('next');
    lines.push('  }');
  }

  lines.push('');
  for (const node of entries) {
    const config = nodeConfig(node);
    const step = functionNames.get(outgoing.get(node.id).get('next'));
    const id = jsString(node.id);
    const event = catalogNodes[node.type]?.event;
    if (event) {
      const params = {
        name: event.name, scope: event.scope, page: config.page, target: config.target,
        delay: config.delay == null ? undefined : Number(config.delay), repeats: event.delay === 'repeat',
        minimum: event.minimum || 0, maximum: config.maxTicks == null ? undefined : Number(config.maxTicks),
      };
      lines.push(`  bindCatalogEvent(${jsLiteral(params)}, ${id}, ${step});`);
    } else if (node.type === PAGE_EVENT) {
      lines.push(config.page ? `  if (document.body?.dataset.pageId === ${jsString(config.page)}) {` : '  {',
        '    const context = contextFor(null, { pageId: document.body?.dataset.pageId });',
        `    publish(context, ${id}, context.trigger);`, `    start(${step}, context, ${id});`, '  }');
    } else if (node.type === KEY_EVENT || node.type === CUSTOM_EVENT) {
      const keyEvent = node.type === KEY_EVENT;
      const key = String(config.key ?? '').trim();
      const event = keyEvent ? (config.phase === 'keyup' ? 'keyup' : 'keydown') : String(config.eventName).trim();
      lines.push(`  window.addEventListener(${jsString(event)}, (event) => {`);
      if (config.page) lines.push(`    if (document.body?.dataset.pageId !== ${jsString(config.page)}) return;`);
      if (keyEvent) {
        if (key) lines.push(`    if (String(event.key).toLowerCase() !== ${jsString(key.toLowerCase() === 'space' ? ' ' : key.toLowerCase())}) return;`);
        if (!config.repeats) lines.push('    if (event.repeat) return;');
        if (!config.insideFields) lines.push('    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])")) return;');
        if (config.preventDefault) lines.push('    event.preventDefault();');
        lines.push('    const modifiers = { shift: event.shiftKey, control: event.ctrlKey, alt: event.altKey, meta: event.metaKey };',
          '    const context = contextFor(event, { key: event.key, modifiers, value: event.key });');
      } else lines.push('    const context = contextFor(event, { detail: event.detail, value: event.detail });');
      lines.push(`    publish(context, ${id}, context.trigger);`, `    start(${step}, context, ${id});`, '  });');
    } else {
      const index = fieldNumber(node);
      const optionalIndex = index === '' ? '' : `, ${index}`;
      lines.push(`  bind(${jsString(EVENT_TYPES[node.type])}, ${jsString(config.target)}, ${id}, ${step}, ${Boolean(config.preventDefault)}${optionalIndex});`);
    }
  }
  const compiledSteps = lines.flatMap((line) => typeof line === 'string' ? line.split('\n').map((part) => `  ${part}`) : [line.raw]);
  const code = ['(() => {', '  function startLogic() {', ...compiledSteps, '  }',
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startLogic, { once: true });', '  else startLogic();', '})();'].join('\n');
  return { code, diagnostics };
}

export function createStarterGraph(project) {
  const targets = blockList(project);
  const source = targets.find(({ id }) => id === 'block-demo-action') || targets.find(({ block }) => block.type === 'button');
  const target = targets.find(({ id }) => id === 'block-demo-caption');
  if (!source) return { nodes: [], edges: [] };
  return {
    nodes: [
      { id: 'logic-demo-click', type: 'click', x: 64, y: 104, config: { target: source.id, preventDefault: true } },
      { id: 'logic-demo-result', type: target ? 'set-text' : 'notify', x: 360, y: 104,
        config: { target: target?.id || '', value: 'The connection works. Blueprint set this text.' } },
    ],
    edges: [{ id: 'logic-demo-wire', from: { nodeId: 'logic-demo-click', port: 'next' }, to: { nodeId: 'logic-demo-result', port: 'in' } }],
  };
}

const svgNamespace = 'http://www.w3.org/2000/svg';
const suffix = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isFormControl = (element) => element.matches('input, select, textarea, [contenteditable]');

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

const boardIcons = {
  event: 'M10 1 3 11h5l-1 6 8-10h-5l1-6',
  flow: 'M4 3v12m0-6h7m0-4v8m0-8 3 3m-3 5 3-3',
  condition: 'M9 2 16 9 9 16 2 9Z M6 9h6',
  database: 'M3 5c0-2 12-2 12 0s-12 2-12 0Zm0 0v8c0 3 12 3 12 0V5M3 9c0 3 12 3 12 0',
  code: 'm6 5-4 4 4 4m6-8 4 4-4 4M10 3 8 15',
  action: 'M3 3h12v12H3z M6 9h6m-3-3v6',
  data: 'M2 4h14v10H2z M5 8h8m-8 3h4',
  transfer: 'M2 6h13m-3-3 3 3-3 3M16 12H3m3-3-3 3 3 3',
  sun: 'M9 1v3m0 10v3M1 9h3m10 0h3M3.3 3.3l2 2m7.4 7.4 2 2m0-11.4-2 2m-7.4 7.4-2 2M12 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  moon: 'M16 11A7 7 0 0 1 7 2a7.5 7.5 0 1 0 9 9Z',
};

function boardIcon(name) {
  const icon = document.createElementNS(svgNamespace, 'svg');
  const path = document.createElementNS(svgNamespace, 'path');
  icon.setAttribute('viewBox', '0 0 18 18');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('class', 'bp-icon');
  path.setAttribute('d', boardIcons[name] || boardIcons.action);
  icon.append(path);
  return icon;
}

function readBoardPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`plot.logic.${key}`)) ?? fallback; }
  catch { return fallback; }
}

function writeBoardPreference(key, value) {
  try { localStorage.setItem(`plot.logic.${key}`, JSON.stringify(value)); }
  catch { /* The editor still works when local preferences cannot be saved. */ }
}

function nodeKind(group) {
  return { Event: 'event', Flow: 'flow', Logic: 'condition', Database: 'database', 'Code & HTTP': 'code',
    Text: 'data', Number: 'data', Numbers: 'data', Collections: 'data', Dates: 'data', Color: 'data',
    JSON: 'data', Browser: 'transfer', Storage: 'database', Motion: 'flow', Navigation: 'transfer' }[group] || 'action';
}

function button(className, label) {
  const item = element('button', className, label);
  item.type = 'button';
  return item;
}

function selectField(choices, value) {
  const field = element('select', 'bp-field');
  for (const [id, label] of choices) field.add(new Option(label, id));
  if (!choices.some(([id]) => id === value) && value) field.add(new Option(`Missing: ${value}`, value));
  field.value = value;
  return field;
}

function wireShape(from, to) {
  const span = Math.max(60, Math.abs(to.x - from.x) * .48);
  return `M ${from.x} ${from.y} C ${from.x + span} ${from.y}, ${to.x - span} ${to.y}, ${to.x} ${to.y}`;
}

function pointIsWithinGraph(graph, start, target, ignoredFrom) {
  const checked = new Set();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop();
    if (id === target) return true;
    if (checked.has(id)) continue;
    checked.add(id);
    const node = graph.nodes.find((item) => item.id === id);
    if (callingTypes.has(node?.type) && nodeConfig(node).flow) pending.push(nodeConfig(node).flow);
    for (const edge of graph.edges) {
      if (edge.from?.nodeId !== id || edge.to?.port !== 'in') continue;
      if (id === ignoredFrom.nodeId && edge.from?.port === ignoredFrom.port) continue;
      if (edge.to?.nodeId) pending.push(edge.to.nodeId);
    }
  }
  return false;
}

function indexFlowNavigation(graph, project) {
  const pages = new Map((project?.pages || []).map((page) => [page.id, String(page.name || page.title || page.slug || 'Untitled page')]));
  const blocks = new Map(blockList(project).map((block) => [block.id, block]));
  const definitions = new Map();
  const callers = new Map();
  const eventGroups = new Map();

  for (const node of graph.nodes) {
    const spec = nodeSpec(node.type);
    const isEvent = browserEvents.has(node.type) || Object.hasOwn(EVENT_TYPES, node.type) || spec?.event;
    const isCaller = callingTypes.has(node.type);
    if (!isEvent && !isCaller && node.type !== FLOW_ENTRY) continue;
    const title = String(node.label || spec.label);
    const config = nodeConfig(node);
    if (node.type === FLOW_ENTRY) {
      definitions.set(node.id, { node, title: String(config.name || '').trim() || 'Untitled flow', detail: node.label || '' });
      continue;
    }
    if (isCaller) {
      if (!config.flow) continue;
      if (!callers.has(config.flow)) callers.set(config.flow, []);
      callers.get(config.flow).push({ node, title, detail: spec.label });
      continue;
    }
    const target = spec.target ? blocks.get(config.target) : undefined;
    const pageId = spec.target ? target?.pageId : config.page;
    const page = pages.get(pageId);
    const group = page ? { key: `page:${pageId}`, label: page }
      : { key: spec.target || pageId ? 'unassigned' : 'all', label: spec.target || pageId ? 'Unassigned' : 'All pages' };
    let detail = target?.name || '';
    if (spec.target && !target) detail = config.target ? 'Missing block' : 'Select a block';
    if (!spec.target && pageId && !page) detail = 'Missing page';
    if (node.type === KEY_EVENT) detail = [detail, config.key || 'Any key', config.phase === 'keyup' ? 'Release' : 'Press'].filter(Boolean).join(' · ');
    if (node.type === CUSTOM_EVENT) detail = [detail, config.eventName || 'Unnamed event'].filter(Boolean).join(' · ');
    if (!eventGroups.has(group.key)) eventGroups.set(group.key, { ...group, entries: [] });
    eventGroups.get(group.key).entries.push({ node, title, detail, type: spec.label });
  }

  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  for (const entries of callers.values()) entries.sort(byTitle);
  for (const group of eventGroups.values()) group.entries.sort(byTitle);
  const groups = [...eventGroups.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { definitions, callers, groups, orderedDefinitions: [...definitions.values()].sort(byTitle) };
}

function nodePicker(onPick) {
  const dialog = element('dialog', 'bp-picker');
  const title = element('h3', '', 'Add node');
  const close = button('bp-picker-close', '×');
  const search = element('input', 'bp-picker-search');
  const results = element('div', 'bp-picker-results');
  const none = element('p', 'bp-picker-empty');
  const header = element('div', 'bp-picker-header');
  const chooser = element('div', 'bp-picker-input');
  const tabs = element('div', 'bp-catalog-tabs');
  tabs.setAttribute('aria-label', 'Node selection filters');
  const summary = element('p', 'bp-picker-summary');
  const uid = `bp-picker-${suffix()}`;
  let options = [];
  let activeIndex = 0;
  let request = {};
  let filter = 'all';
  let favorites = readBoardPreference('favorites', []);
  let recent = readBoardPreference('recent', []);
  if (!Array.isArray(favorites)) favorites = [];
  if (!Array.isArray(recent)) recent = [];

  dialog.id = uid;
  title.id = `${uid}-title`;
  dialog.setAttribute('aria-labelledby', title.id);
  close.setAttribute('aria-label', 'Close node picker');
  search.type = 'search';
  search.placeholder = 'Search by action or node name';
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-label', 'Search nodes');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'true');
  results.id = `${uid}-results`;
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-label', 'Matching nodes');
  search.setAttribute('aria-controls', results.id);
  none.setAttribute('role', 'status');
  header.append(title, close);
  chooser.append(search);
  dialog.append(header, chooser, tabs, summary, results, none);
  for (const [id, label] of [['all', 'All nodes'], ['suggested', 'Suggested'], ['favorite', 'Favorites'], ['recent', 'Recent']]) {
    const tab = button('bp-catalog-tab', label);
    tab.dataset.filter = id;
    tab.addEventListener('click', () => { filter = id; update(); search.focus(); });
    tabs.append(tab);
  }

  function activate(index, reveal = false) {
    activeIndex = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (!options[index]) { search.removeAttribute('aria-activedescendant'); return; }
    search.setAttribute('aria-activedescendant', options[index].id);
    if (reveal) options[index].scrollIntoView({ block: 'nearest' });
  }

  function update() {
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const groups = new Map();
    const preferred = request.suggestions || [];
    const matching = Object.entries(nodeTypes).filter(([id, spec]) => {
      const searchable = `${id} ${spec.label} ${spec.group} ${nodeDescriptions[id] || spec.description || ''} ${searchWords[id] || ''}`.toLowerCase();
      if (filter === 'favorite' && !favorites.includes(id) || filter === 'recent' && !recent.includes(id)
        || filter === 'suggested' && !words.length && !preferred.includes(id)) return false;
      return (!request.canPick || request.canPick(id)) && words.every((word) => searchable.includes(word));
    });
    const exact = search.value.trim().toLowerCase();
    if (words.length) matching.sort((a, b) => Number(b[1].label.toLowerCase().startsWith(exact)) - Number(a[1].label.toLowerCase().startsWith(exact)));
    if (filter === 'recent' && !words.length) matching.sort((a, b) => recent.indexOf(a[0]) - recent.indexOf(b[0]));
    if (filter === 'suggested' && !words.length) matching.sort((a, b) => preferred.indexOf(a[0]) - preferred.indexOf(b[0]));
    for (const [id, spec] of matching) {
      const group = filter === 'recent' && !words.length ? 'Last used' : spec.group;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([id, spec]);
    }
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.filter === filter));
    summary.textContent = request.socket ? `${matching.length} compatible ${matching.length === 1 ? 'node' : 'nodes'} · Select to connect` : `${matching.length} ${matching.length === 1 ? 'node' : 'nodes'}`;
    results.replaceChildren();
    options = [];
    for (const [name, group] of groups) {
      const section = element('section', 'bp-picker-group');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', name);
      section.append(element('p', 'bp-picker-group-label', name));
      for (const [type, spec] of group) {
        const row = element('div', 'bp-picker-entry');
        const option = button(`bp-picker-option bp-kind-${nodeKind(spec.group)}`);
        option.id = `${uid}-${type}`;
        option.dataset.nodeType = type;
        option.tabIndex = -1;
        option.setAttribute('role', 'option');
        const text = element('span', 'bp-picker-option-copy');
        text.append(element('strong', '', spec.label), element('span', '', nodeDescriptions[type] || spec.description));
        const icon = element('span', 'bp-node-icon');
        icon.append(boardIcon(nodeKind(spec.group)));
        option.append(icon, text);
        option.addEventListener('click', () => {
          recent = [type, ...recent.filter((key) => key !== type)].slice(0, 20);
          writeBoardPreference('recent', recent);
          dialog.close(); onPick(type, request);
        });
        const favorite = button('bp-favorite', favorites.includes(type) ? '★' : '☆');
        const sync = () => {
          const saved = favorites.includes(type);
          favorite.textContent = saved ? '★' : '☆';
          favorite.setAttribute('aria-pressed', String(saved));
          favorite.setAttribute('aria-label', `${saved ? 'Remove from favorites:' : 'Add to favorites:'} ${spec.label}`);
          favorite.title = saved ? 'Remove from favorites' : 'Add to favorites';
        };
        sync();
        favorite.addEventListener('click', () => {
          favorites = favorites.includes(type) ? favorites.filter((key) => key !== type) : [...favorites, type];
          writeBoardPreference('favorites', favorites);
          if (filter === 'favorite') { update(); search.focus(); }
          else sync();
        });
        row.append(option, favorite);
        section.append(row);
        options.push(option);
      }
      results.append(section);
    }
    none.hidden = Boolean(options.length);
    none.textContent = options.length ? '' : ({ favorite: 'No matching favorites. Use the star beside a node to save it.', recent: 'No matching recent nodes.', suggested: 'No suggested nodes match. Browse All nodes.' }[filter] || 'No matching nodes.');
    results.scrollTop = 0;
    activate(0);
  }

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  search.addEventListener('input', update);
  search.addEventListener('keydown', (event) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      activate((activeIndex + delta + options.length) % options.length, true);
    }
    if (event.key === 'Enter') { event.preventDefault(); options[activeIndex].click(); }
  });

  return {
    dialog,
    open(options = {}) {
      if (dialog.open) return;
      request = options;
      title.textContent = options.title || 'Add node';
      filter = options.socket ? 'suggested' : 'all';
      search.value = '';
      update();
      dialog.showModal();
      search.focus();
    },
  };
}

export function mountLogic(container, { getProject, onChange, onStatus, onUndo, onRedo, onPreview } = {}) {
  let project = getProject?.();
  const readGraph = (source) => ({ ...source, ...graphArrays(source),
    comments: Array.isArray(source?.comments) ? source.comments.filter(Boolean) : [],
    bookmarks: Array.isArray(source?.bookmarks) ? source.bookmarks.filter(Boolean) : [],
  });
  let graph = readGraph(project?.graph);
  let selectedNode = graph.nodes[0]?.id;
  let selectedNodes = new Set(selectedNode ? [selectedNode] : []);
  let selectedEdge;
  let selectedComment;
  let armed;
  let pointer;
  let zoom = 1;
  let camera = { x: 0, y: 0 };
  let snap = true;
  let inspectorOpen = !matchMedia('(max-width: 700px)').matches;
  let minimapOpen = !matchMedia('(max-width: 700px)').matches;
  let gridOpen = true;
  let boardTheme = readBoardPreference('theme', 'draft');
  let spotlight = false;
  let spaceHeld = false;
  let clipboard = null;
  let lastTrace = [];
  const visited = new Set();
  const faulted = new Set();
  let updating = false;
  let suppressClick = false;
  const nodeElements = new Map();
  const commentElements = new Map();
  const portElements = new Map();
  const root = element('section', 'bp-studio');
  root.dataset.palette = boardTheme === 'night' ? 'night' : 'draft';
  root.setAttribute('aria-label', 'Blueprint');
  const toolbar = element('div', 'bp-toolbar');
  const addControls = element('div', 'bp-add-controls');
  const picker = nodePicker((type, request) => addNode(type, defaultConfig[type], request));
  const add = button('bp-button bp-button-main', '+ Add node');
  add.setAttribute('aria-haspopup', 'dialog');
  add.setAttribute('aria-controls', picker.dialog.id);
  add.title = 'Add node (N)';
  const viewControls = element('div', 'bp-view-controls');
  const editControls = element('div', 'bp-edit-controls');
  const zoomOut = button('bp-button bp-zoom', '−');
  const zoomIn = button('bp-button bp-zoom', '+');
  const zoomReset = button('bp-button bp-zoom bp-zoom-level', '100%');
  const fitView = button('bp-button bp-button-quiet', 'Fit graph');
  const searchGraph = button('bp-button bp-button-quiet', 'Find');
  const showFlows = button('bp-button bp-button-quiet bp-flows-trigger', 'Flows');
  const inspect = button('bp-button bp-button-quiet', 'Details');
  const menuButton = button('bp-button bp-button-quiet', 'Graph');
  const focusButton = button('bp-button bp-button-quiet', 'Focus');
  const frameView = button('bp-button bp-button-quiet', 'Frame');
  const layouts = button('bp-button bp-button-quiet', 'Arrange');
  const historyBack = button('bp-button bp-button-quiet', 'Undo');
  const historyForward = button('bp-button bp-button-quiet', 'Redo');
  const theme = button('bp-button bp-button-quiet bp-theme');
  const syncThemeLabel = () => {
    const toDark = root.dataset.palette !== 'night';
    const name = toDark ? 'Switch to dark workspace' : 'Switch to bright workspace';
    theme.setAttribute('aria-label', name);
    theme.title = name;
    theme.replaceChildren(boardIcon(toDark ? 'moon' : 'sun'));
  };
  syncThemeLabel();
  const run = button('bp-button bp-button-run', 'Test site');
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomReset.setAttribute('aria-label', 'Reset zoom and view');
  zoomReset.title = 'Reset zoom and return to the start';
  fitView.title = 'Fit all nodes in the graph viewport';
  frameView.title = 'Frame selection (F or Home)';
  frameView.setAttribute('aria-label', 'Frame selection');
  inspect.setAttribute('aria-expanded', String(inspectorOpen));
  menuButton.setAttribute('aria-haspopup', 'true');
  layouts.setAttribute('aria-haspopup', 'true');
  searchGraph.title = 'Find an existing node (Ctrl+F)';
  searchGraph.setAttribute('aria-label', 'Find in graph');
  showFlows.title = 'Browse event entry points and reusable flows';
  showFlows.setAttribute('aria-haspopup', 'dialog');
  focusButton.title = 'Expand Logic to full screen';
  viewControls.append(zoomOut, zoomReset, zoomIn, fitView, frameView, focusButton);
  addControls.append(add, showFlows, searchGraph, menuButton, layouts);
  if (onUndo && onRedo) editControls.append(historyBack, historyForward);
  editControls.append(theme, inspect);
  if (onPreview) editControls.append(run);
  toolbar.append(addControls, viewControls, editControls);

  const layout = element('div', 'bp-layout');
  const viewport = element('div', 'bp-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', 'Blueprint graph');
  const surface = element('div', 'bp-surface');
  const world = element('div', 'bp-world');
  const commentLayer = element('div', 'bp-comment-layer');
  const wires = document.createElementNS(svgNamespace, 'svg');
  wires.setAttribute('class', 'bp-wires');
  const draftWire = document.createElementNS(svgNamespace, 'path');
  const wireViews = new Map();
  const layer = element('div', 'bp-node-layer');
  const empty = element('div', 'bp-empty');
  empty.append(element('strong', '', 'Add your first event'),
    element('p', '', 'Connect its output to an action or condition.'));
  const marquee = element('div', 'bp-marquee');
  marquee.hidden = true;
  const map = element('canvas', 'bp-minimap');
  const mapSize = { width: 192, height: 120 };
  const overview = element('div', 'bp-overview');
  overview.append(element('span', 'bp-overview-label', 'Overview'), map);
  map.tabIndex = 0;
  map.setAttribute('role', 'button');
  map.setAttribute('aria-label', 'Graph minimap, click to center the view');
  map.title = 'Click to jump to this location';
  const contextMenu = element('div', 'bp-context');
  contextMenu.setAttribute('aria-label', 'Graph actions');
  contextMenu.hidden = true;
  world.append(commentLayer, wires, layer);
  surface.append(world);
  viewport.append(surface, empty, marquee, overview, contextMenu);
  const configPanel = element('aside', 'bp-config');
  configPanel.setAttribute('aria-label', 'Node settings');
  layout.append(viewport, configPanel);
  const footer = element('div', 'bp-footer');
  const guidance = element('div', 'bp-guidance');
  const legend = element('div', 'bp-legend');
  legend.append(element('span', 'bp-legend-run', 'Execution'), element('span', 'bp-legend-data', 'Typed data'));
  const hint = element('p', 'bp-hint');
  hint.setAttribute('aria-live', 'polite');
  const issues = element('details', 'bp-issues');
  const issuesLabel = element('summary', 'bp-issues-label');
  const issueList = element('ul', 'bp-issue-list');
  issues.append(issuesLabel, issueList);
  guidance.append(hint, legend);
  const stats = element('span', 'bp-stats');
  footer.append(guidance, stats, issues);
  const finder = element('dialog', 'bp-picker bp-finder');
  finder.setAttribute('aria-label', 'Find in graph');
  const findHeader = element('div', 'bp-picker-header');
  const findClose = button('bp-picker-close', '×');
  findClose.setAttribute('aria-label', 'Close graph search');
  findHeader.append(element('h3', '', 'Find in graph'), findClose);
  const findInputRow = element('div', 'bp-picker-input');
  const findInput = element('input', 'bp-picker-search');
  findInput.type = 'search';
  findInput.placeholder = 'Find nodes, targets, and notes';
  findInput.setAttribute('aria-label', 'Find nodes, targets, and notes');
  findInputRow.append(findInput);
  const findResults = element('div', 'bp-picker-results');
  finder.append(findHeader, findInputRow, findResults);
  const flowDialog = element('dialog', 'bp-picker bp-flows');
  flowDialog.setAttribute('aria-label', 'Flows');
  const flowHeader = element('div', 'bp-picker-header');
  const flowHeading = element('h3', '', 'Flows');
  const flowClose = button('bp-picker-close', '×');
  flowClose.setAttribute('aria-label', 'Close flows');
  flowHeader.append(flowHeading, flowClose);
  const flowInputRow = element('div', 'bp-picker-input');
  const flowInput = element('input', 'bp-picker-search');
  flowInput.type = 'search';
  flowInput.setAttribute('aria-label', 'Search flows');
  flowInputRow.append(flowInput);
  const flowBack = button('bp-button bp-button-quiet bp-flows-back', '← All flows');
  flowBack.hidden = true;
  const flowCount = element('p', 'bp-picker-summary bp-flows-count');
  flowCount.setAttribute('aria-live', 'polite');
  const flowResults = element('div', 'bp-picker-results bp-flows-results');
  flowDialog.append(flowHeader, flowBack, flowInputRow, flowCount, flowResults);
  root.append(toolbar, layout, footer, picker.dialog, finder, flowDialog);
  container.replaceChildren(root);

  const portKey = (nodeId, port, direction) => JSON.stringify([nodeId, port, direction]);
  const currentNode = () => graph.nodes.find((node) => node.id === selectedNode);
  const locate = (nodeId) => graph.nodes.find((node) => node.id === nodeId);
  const position = (node) => ({
    x: Number.isFinite(node.x) ? node.x : 45,
    y: Number.isFinite(node.y) ? node.y : 45,
  });

  let flowDefinitionId;
  let flowListQuery = '';
  let flowIndex;
  function flowNavigation() {
    if (flowIndex?.graph !== graph || flowIndex?.project !== project) {
      flowIndex = { graph, project, ...indexFlowNavigation(graph, project) };
    }
    return flowIndex;
  }

  function labelForNode(node) {
    const config = nodeConfig(node);
    const targets = blockList(project);
    const target = targets.find((item) => item.id === config.target);
    if (nodeSpec(node.type)?.target) return target?.label || 'Select a block';
    if (node.type === PAGE_EVENT) return (project?.pages || []).find((page) => page.id === config.page)?.name || 'Every page';
    if (node.type === KEY_EVENT) return `${config.key || 'Any key'} · ${config.phase === 'keyup' ? 'Release' : 'Press'}`;
    if (node.type === CUSTOM_EVENT) return config.eventName || 'Enter an event name';
    if (node.type === 'if') return `${operators.find(([id]) => config.operator === id)?.[1] || 'Equals'} ${config.value || ''}`.trim();
    if (node.type === 'notify') return config.valueMode === 'event' ? 'Event value' : config.value || 'Set the notification text';
    if (node.type === 'http-request') return `${config.method} ${config.url || 'Select or connect a URL'}`;
    if (node.type === 'run-js') return config.name || 'async (input, ctx, dom)';
    if (callingTypes.has(node.type)) return config.flow && locate(config.flow) ? nodeConfig(locate(config.flow)).name : 'Select a flow';
    if (node.type === 'get-property') return config.path || 'Enter a property path';
    if (node.type === 'constant') return config.value || valueTypes.find(([id]) => id === config.valueType)?.[1] || '';
    if (Object.hasOwn(operationNames, node.type)) return tableList(project).find((table) => table.id === config.table)?.name || 'Select a table';
    if (config.name) return config.name;
    return '';
  }

  function report(message, notifyParent = true) {
    hint.textContent = message;
    if (notifyParent) onStatus?.(message);
  }

  function save(next, redraw = true) {
    graph = next;
    updating = true;
    try { onChange?.(next); } finally { updating = false; }
    if (redraw) render();
    else updateDiagnostics();
  }

  function updateDiagnostics() {
    const { diagnostics } = analyzeGraph(graph, project);
    const errors = diagnostics.filter((item) => item.severity === 'error').length;
    const warnings = diagnostics.length - errors;
    issues.hidden = !diagnostics.length;
    issues.classList.toggle('bp-has-errors', errors > 0);
    const counts = [];
    if (errors) counts.push(`Errors: ${errors}`);
    if (warnings) counts.push(`Warnings: ${warnings}`);
    issuesLabel.textContent = counts.join(' · ');
    issueList.replaceChildren(...diagnostics.map((item) => {
      const row = element('li', `bp-issue-${item.severity}`);
      if (item.nodeId && locate(item.nodeId)) {
        const reveal = button('bp-issue-reveal', item.message);
        reveal.addEventListener('click', () => {
          chooseNode(item.nodeId);
          frameNode(locate(item.nodeId));
          nodeElements.get(item.nodeId)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
        });
        row.append(reveal);
      } else row.textContent = item.message;
      return row;
    }));
  }

  function rectForNode(node) {
    const view = nodeElements.get(node.id);
    return { ...(pointer?.positions?.get(node.id) || position(node)), width: view?.offsetWidth || 224, height: view?.offsetHeight || 155 };
  }

  function rectForComment(comment) {
    return { ...position(comment), width: Math.max(190, Number(comment.width) || 280), height: Math.max(100, Number(comment.height) || 150) };
  }

  function boundsFor(rects, pad = 0) {
    if (!rects.length) return undefined;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const { x, y, width, height } of rects) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + width); bottom = Math.max(bottom, y + height);
    }
    return { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
  }

  function redrawMinimap() {
    overview.hidden = !minimapOpen;
    if (overview.hidden || !viewport.clientWidth) return;
    const pixelRatio = Math.min(4, Math.max(1, window.devicePixelRatio || 1));
    const { width, height } = mapSize;
    if (map.width !== Math.round(width * pixelRatio)) map.width = Math.round(width * pixelRatio);
    if (map.height !== Math.round(height * pixelRatio)) map.height = Math.round(height * pixelRatio);
    const context = map.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const colors = getComputedStyle(root);
    const color = (property) => colors.getPropertyValue(`--bp-map-${property}`).trim();
    const view = { x: -camera.x / zoom, y: -camera.y / zoom, width: viewport.clientWidth / zoom, height: viewport.clientHeight / zoom };
    const nodeRects = graph.nodes.map(rectForNode);
    const commentRects = graph.comments.map(rectForComment);
    const bounds = boundsFor([view, ...nodeRects, ...commentRects], 55);
    const scale = Math.min(width / bounds.width, height / bounds.height);
    const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
    map._worldBounds = { x, y, scale };
    const rect = (r, minimum = 0) => [r.x * scale + x, r.y * scale + y, Math.max(minimum, r.width * scale), Math.max(minimum, r.height * scale)];
    context.clearRect(0, 0, width, height);
    context.fillStyle = color('comment');
    for (const r of commentRects) context.fillRect(...rect(r, 2));
    nodeRects.forEach((r, index) => {
      context.fillStyle = color(selectedNodes.has(graph.nodes[index].id) ? 'selected' : 'node');
      context.fillRect(...rect(r, 2));
    });
    context.fillStyle = color('viewport');
    context.strokeStyle = color('outline');
    context.fillRect(...rect(view, 2));
    context.strokeRect(...rect(view, 2));
  }

  function paintCamera() {
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`;
    const size = 24 * zoom * Math.max(1, Math.ceil(.46 / zoom));
    viewport.style.setProperty('--bp-grid-size', `${size}px`);
    viewport.style.setProperty('--bp-grid-x', `${camera.x % (size * 5)}px`);
    viewport.style.setProperty('--bp-grid-y', `${camera.y % (size * 5)}px`);
    viewport.classList.toggle('has-grid', gridOpen);
    zoomReset.textContent = `${Math.round(zoom * 100)}%`;
    zoomIn.disabled = zoom > 2.39;
    zoomOut.disabled = zoom < .121;
    redrawMinimap();
  }

  function portPoint(nodeId, name, direction, origin = world.getBoundingClientRect()) {
    const control = portElements.get(portKey(nodeId, name, direction))?.querySelector('.bp-port-dot');
    if (!control) return undefined;
    const bounds = control.getBoundingClientRect();
    return { x: (bounds.x - origin.x + bounds.width / 2) / zoom, y: (bounds.y - origin.y + bounds.height / 2) / zoom };
  }

  function worldPoint(event) {
    const origin = world.getBoundingClientRect();
    return { x: (event.clientX - origin.x) / zoom, y: (event.clientY - origin.y) / zoom };
  }

  function setZoom(value, anchor = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }) {
    const x = (anchor.x - camera.x) / zoom;
    const y = (anchor.y - camera.y) / zoom;
    zoom = Math.max(.12, Math.min(2.4, value));
    camera = { x: anchor.x - x * zoom, y: anchor.y - y * zoom };
    paintCamera();
  }

  function resetView() {
    camera = { x: 0, y: 0 };
    zoom = 1;
    paintCamera();
  }

  function frameBounds(bounds, maximum = 1) {
    if (!bounds) return;
    zoom = Math.max(.12, Math.min(maximum, viewport.clientWidth / bounds.width, viewport.clientHeight / bounds.height));
    camera = {
      x: (viewport.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: (viewport.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
    };
    paintCamera();
  }

  function frameNode(node) {
    if (node) frameBounds(boundsFor([rectForNode(node)], 65));
  }

  function fitGraph() {
    const bounds = boundsFor([...graph.nodes.map(rectForNode), ...graph.comments.map(rectForComment)], 45);
    if (bounds) frameBounds(bounds);
    else resetView();
  }

  function frameSelection() {
    const comment = graph.comments.find(({ id }) => id === selectedComment);
    const boxes = comment ? [rectForComment(comment)] : graph.nodes.filter(({ id }) => selectedNodes.has(id)).map(rectForNode);
    if (boxes.length) frameBounds(boundsFor(boxes, 55));
    else fitGraph();
  }

  function revealNode(node) {
    const { x, y, width, height } = rectForNode(node);
    if (x * zoom + camera.x < 18 || y * zoom + camera.y < 18
      || (x + width) * zoom + camera.x > viewport.clientWidth - 18
      || (y + height) * zoom + camera.y > viewport.clientHeight - 18) frameNode(node);
  }

  function wirePath(from, to, className) {
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', wireShape(from, to));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    return path;
  }

  function updateDraftWire(origin = world.getBoundingClientRect()) {
    if (pointer?.kind !== 'wire' || !pointer.moved) { draftWire.remove(); return; }
    const { nodeId, port } = pointer.socket;
    const start = portPoint(nodeId, port, pointer.direction, origin);
    if (!start) return;
    const type = portType(locate(nodeId), pointer.direction, port);
    draftWire.setAttribute('class', `bp-wire bp-wire-preview bp-type-${type}`);
    draftWire.setAttribute('vector-effect', 'non-scaling-stroke');
    draftWire.setAttribute('d', pointer.direction === 'out' ? wireShape(start, pointer.point) : wireShape(pointer.point, start));
    if (draftWire.parentNode !== wires) wires.append(draftWire);
  }

  function updateWires(near) {
    const origin = world.getBoundingClientRect();
    for (const { edge, paint, hit, casing } of wireViews.values()) {
      if (near && !near.has(edge.from.nodeId) && !near.has(edge.to.nodeId)) continue;
      const from = portPoint(edge.from.nodeId, edge.from.port, 'out', origin);
      const to = portPoint(edge.to.nodeId, edge.to.port, 'in', origin);
      if (!from || !to) continue;
      const path = wireShape(from, to);
      casing.setAttribute('d', path);
      paint.setAttribute('d', path);
      hit.setAttribute('d', path);
    }
    updateDraftWire(origin);
  }

  function renderWires() {
    wires.replaceChildren();
    wireViews.clear();
    const origin = world.getBoundingClientRect();
    for (const edge of graph.edges) {
      const from = portPoint(edge.from?.nodeId, edge.from?.port, 'out', origin);
      const to = portPoint(edge.to?.nodeId, edge.to?.port, 'in', origin);
      if (!from || !to) continue;
      const sourceNode = locate(edge.from.nodeId);
      const toNode = locate(edge.to.nodeId);
      const sourcePort = portsFor(sourceNode, 'out').find(([id]) => id === edge.from.port);
      const targetPort = portsFor(toNode, 'in').find(([id]) => id === edge.to.port);
      const type = sourcePort?.[2];
      const branch = ['yes', 'no', 'fault'].includes(edge.from.port) ? ` bp-wire-${edge.from.port}` : '';
      const kind = type && type !== 'exec' ? ` bp-wire-data bp-type-${type}` : '';
      const paint = wirePath(from, to, `${selectedEdge === edge.id ? 'bp-wire bp-wire-selected' : 'bp-wire'}${branch}${kind}`);
      const hit = wirePath(from, to, 'bp-wire-hit');
      const casing = wirePath(from, to, 'bp-wire-casing');
      const bundle = document.createElementNS(svgNamespace, 'g');
      bundle.setAttribute('class', 'bp-wire-bundle');
      if (spotlight && selectedNodes.size && selectedEdge !== edge.id && !selectedNodes.has(edge.from.nodeId) && !selectedNodes.has(edge.to.nodeId)) bundle.classList.add('is-muted');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', `Connection: ${sourceNode?.label || nodeSpec(sourceNode?.type)?.label} ${sourcePort?.[1]} → ${toNode?.label || nodeSpec(toNode?.type)?.label} ${targetPort?.[1]}`);
      hit.addEventListener('click', () => chooseEdge(edge.id));
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chooseEdge(edge.id);
          configPanel.querySelector('.bp-remove')?.focus();
        }
      });
      bundle.append(casing, paint, hit);
      wires.append(bundle);
      wireViews.set(edge.id, { edge, paint, hit, casing });
    }
    updateDraftWire(origin);
  }

  function updateSelection() {
    const neighbors = new Set();
    if (spotlight) for (const edge of graph.edges) {
      if (selectedNodes.has(edge.from?.nodeId)) neighbors.add(edge.to?.nodeId);
      if (selectedNodes.has(edge.to?.nodeId)) neighbors.add(edge.from?.nodeId);
    }
    for (const [id, view] of nodeElements) {
      view.classList.toggle('is-selected', selectedNodes.has(id));
      view.classList.toggle('is-visited', visited.has(id));
      view.classList.toggle('is-faulted', faulted.has(id));
      view.classList.toggle('is-muted', spotlight && selectedNodes.size > 0 && !selectedNodes.has(id) && !neighbors.has(id));
      view.querySelector('.bp-node-head')?.setAttribute('aria-pressed', String(selectedNodes.has(id)));
    }
    for (const [id, view] of commentElements) view.classList.toggle('is-selected', id === selectedComment);
    const armedType = armed ? portType(locate(armed.nodeId), 'out', armed.port) : undefined;
    for (const item of portElements.values()) {
      const output = item.dataset.direction === 'out';
      const active = output && armed?.nodeId === item.dataset.nodeId && armed?.port === item.dataset.port;
      item.classList.toggle('is-armed', Boolean(active));
      item.classList.toggle('is-target', !output && item.dataset.nodeId !== armed?.nodeId && compatible(armedType, item.dataset.portType));
      const connected = graph.edges.some((edge) => {
        const end = output ? edge.from : edge.to;
        return end?.nodeId === item.dataset.nodeId && end?.port === item.dataset.port;
      });
      item.classList.toggle('is-connected', connected);
      if (output) item.setAttribute('aria-pressed', String(Boolean(active)));
    }
    renderWires();
    redrawMinimap();
    const plural = (number, noun) => `${number} ${noun}${number === 1 ? '' : 's'}`;
    stats.textContent = `${plural(graph.nodes.length, 'node')} · ${plural(graph.edges.length, 'wire')}${selectedNodes.size ? ` · ${selectedNodes.size} selected` : ''}`;
  }

  function chooseNodes(ids, primary = ids.at(-1)) {
    selectedNodes = new Set(ids);
    selectedNode = selectedNodes.has(primary) ? primary : ids.at(-1);
    selectedComment = undefined;
    selectedEdge = undefined;
    updateSelection();
    renderConfig();
  }

  function chooseNode(id, event) {
    const next = new Set(selectedNodes);
    if (event?.ctrlKey || event?.metaKey) next.has(id) ? next.delete(id) : next.add(id);
    else if (event?.shiftKey) next.add(id);
    else return chooseNodes([id]);
    chooseNodes([...next], id);
  }

  function chooseEdge(id) {
    selectedEdge = id;
    selectedNode = undefined;
    selectedNodes.clear();
    selectedComment = undefined;
    updateSelection();
    renderConfig();
  }

  function connect(from, toId, toPort = 'in', extraNode) {
    const source = extraNode?.id === from.nodeId ? extraNode : locate(from?.nodeId);
    const target = extraNode?.id === toId ? extraNode : locate(toId);
    const sourceType = portType(source, 'out', from?.port);
    const targetType = portType(target, 'in', toPort);
    if (!compatible(sourceType, targetType) || source?.id === target?.id) {
      report('Choose a compatible input on another node.');
      return;
    }
    if (sourceType === 'exec' && pointIsWithinGraph(graph, toId, from.nodeId, from)) {
      report('This connection would create a cycle.');
      return;
    }
    const previous = graph.edges.find((edge) => sourceType === 'exec'
      ? edge.from?.nodeId === from.nodeId && edge.from?.port === from.port
      : edge.to?.nodeId === toId && edge.to?.port === toPort);
    if (previous?.from?.nodeId === from.nodeId && previous?.from?.port === from.port && previous?.to?.nodeId === toId && previous?.to?.port === toPort) {
      armed = undefined;
      updateSelection();
      return true;
    }
    const next = { ...graph, nodes: extraNode ? graph.nodes.concat(extraNode) : graph.nodes,
      edges: graph.edges.filter((edge) => edge !== previous).concat({
      id: previous?.id || `wire-${suffix()}`, from: { ...from }, to: { nodeId: toId, port: toPort },
    }) };
    armed = undefined;
    selectedEdge = undefined;
    selectedComment = undefined;
    selectedNode = extraNode?.id || toId;
    selectedNodes = new Set([selectedNode]);
    save(next);
    portElements.get(portKey(toId, toPort, 'in'))?.focus({ preventScroll: true });
    report(previous ? 'Connection replaced. Undo restores the previous wire.' : 'Nodes connected.');
    return true;
  }

  function breakPort(nodeId, port, direction) {
    const socket = direction === 'in' ? 'to' : 'from';
    const edges = graph.edges.filter((edge) => edge[socket]?.nodeId !== nodeId || edge[socket]?.port !== port);
    const count = graph.edges.length - edges.length;
    if (!count) return report('This port has no connections.', false);
    armed = undefined;
    selectedEdge = undefined;
    save({ ...graph, edges });
    report(`Removed ${count} ${count === 1 ? 'connection' : 'connections'}. Undo can restore them.`);
  }

  function handlePortClick(nodeId, port, direction, event) {
    if (suppressClick) return;
    if (event.altKey) { breakPort(nodeId, port, direction); return; }
    if (direction === 'in') {
      if (armed) connect(armed, nodeId, port);
      else report('Select an output, then select this input.', false);
      return;
    }
    if (armed?.nodeId === nodeId && armed?.port === port) {
      armed = undefined;
      report('Connection canceled.', false);
    } else {
      armed = { nodeId, port };
      report('Choose an input to connect the nodes.', false);
    }
    updateSelection();
  }

  function portButton(node, direction, [port, label, type]) {
    const inbound = direction === 'in';
    const control = button(`bp-port bp-port-${port} bp-type-${type}${type === 'exec' ? '' : ' bp-port-data'}`);
    control.dataset.nodeId = node.id;
    control.dataset.port = port;
    control.dataset.direction = direction;
    control.dataset.portType = type;
    const typeTitle = type === 'exec' ? 'execution' : type;
    control.setAttribute('aria-label', `${nodeSpec(node.type).label}, ${inbound ? 'input' : 'output'}: ${label} (${typeTitle})`);
    control.title = `${label} · ${inbound ? 'Input' : 'Output'} · ${typeTitle}\nAlt+click to break connections`;
    const dot = element('span', 'bp-port-dot');
    dot.setAttribute('aria-hidden', 'true');
    const title = element('span', 'bp-port-label', label);
    control.append(...(inbound ? [dot, title] : [title, dot]));
    control.addEventListener('click', (event) => handlePortClick(node.id, port, direction, event));
    control.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || spaceHeld || event.altKey || pointer) return;
      if (inbound && armed) return;
      pointer = { kind: 'wire', id: event.pointerId, direction, socket: { nodeId: node.id, port }, start: worldPoint(event) };
      control.setPointerCapture(event.pointerId);
    });
    portElements.set(portKey(node.id, port, direction), control);
    return control;
  }

  function renderNodes() {
    nodeElements.clear();
    portElements.clear();
    layer.replaceChildren();
    for (const node of graph.nodes) {
      const spec = nodeSpec(node.type);
      if (!spec) continue;
      const kind = nodeKind(spec.group);
      const view = element('article', `bp-node bp-kind-${kind}`);
      view.dataset.nodeId = node.id;
      view.classList.toggle('is-locked', Boolean(node.locked));
      view.classList.toggle('is-compact', Boolean(node.compact));
      view.classList.toggle('is-bypassed', bypassed(node));
      const { x, y } = position(node);
      Object.assign(view.style, { left: `${x}px`, top: `${y}px` });
      const head = button('bp-node-head');
      head.title = node.locked ? 'Locked node. Unlock in Details to move it.' : 'Drag to move or press Shift with the arrow keys';
      const glyph = element('span', 'bp-node-icon');
      glyph.append(boardIcon(kind));
      const heading = element('span', 'bp-node-heading');
      heading.append(element('span', 'bp-node-group', spec.group), element('span', 'bp-node-title', node.label || spec.label));
      head.append(glyph, heading);
      head.addEventListener('click', (event) => {
        if (suppressClick) return;
        chooseNode(node.id, event);
        if (event.detail === 2 && !inspectorOpen) toggleInspector(true);
      });
      head.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || spaceHeld || node.locked || pointer) return;
        const ids = selectedNodes.has(node.id) ? selectedNodes : new Set([node.id]);
        const initial = new Map(graph.nodes.filter((item) => ids.has(item.id) && !item.locked).map((item) => [item.id, position(item)]));
        pointer = { kind: 'node', id: event.pointerId, node, start: worldPoint(event), initial };
        head.setPointerCapture(event.pointerId);
      });
      head.addEventListener('keydown', (event) => {
        const direction = { ArrowUp: [0, -16], ArrowDown: [0, 16], ArrowLeft: [-16, 0], ArrowRight: [16, 0] }[event.key];
        if (!event.shiftKey || !direction || node.locked) return;
        event.preventDefault();
        const point = position(locate(node.id));
        selectedNode = node.id;
        selectedEdge = undefined;
        selectedNodes = new Set([node.id]);
        save({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? {
          ...item, x: point.x + direction[0], y: point.y + direction[1],
        } : item) });
        nodeElements.get(node.id)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
      });
      const subtitle = element('p', 'bp-node-summary', labelForNode(node));
      subtitle.title = node.note || subtitle.textContent;
      subtitle.hidden = !subtitle.textContent && !node.note;
      const ports = element('div', 'bp-ports');
      for (const arc of ['exec', 'data']) {
        const row = element('div', `bp-port-group bp-port-group-${arc}`);
        for (const direction of ['in', 'out']) {
          const column = element('div', `bp-ports-${direction}`);
          for (const pin of portsFor(node, direction).filter(([, , type]) => (type === 'exec') === (arc === 'exec'))) {
            column.append(portButton(node, direction, pin));
          }
          row.append(column);
        }
        if (row.querySelector('button')) {
          if (arc === 'data' && ports.children.length) row.prepend(element('span', 'bp-pin-legend', 'Data'));
          ports.append(row);
        }
      }
      view.append(head, subtitle, ports);
      layer.append(view);
      nodeElements.set(node.id, view);
    }
    empty.hidden = graph.nodes.length > 0 || graph.comments.length > 0;
  }

  function configField(label, control) {
    const field = element('label', 'bp-setting');
    field.append(element('span', 'bp-setting-label', label), control);
    configPanel.append(field);
  }

  function updateNodeDetails(node, key, value) {
    save({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? { ...item, [key]: value } : item) }, false);
    const view = nodeElements.get(node.id);
    if (key === 'label') view.querySelector('.bp-node-title').textContent = value || nodeSpec(node.type).label;
    if (key === 'note') {
      const summary = view.querySelector('.bp-node-summary');
      summary.title = value || labelForNode(node);
      summary.hidden = !summary.textContent && !value;
      updateWires(new Set([node.id]));
    }
    if (key === 'disabled') view.classList.toggle('is-bypassed', bypassed(locate(node.id)));
    if (key === 'compact' || key === 'locked') {
      view.classList.toggle(key === 'compact' ? 'is-compact' : 'is-locked', Boolean(value));
      view.querySelector('.bp-node-head').title = locate(node.id).locked ? 'Locked node. Unlock in Details to move it.' : 'Drag to move or press Shift with the arrow keys';
      updateWires(new Set([node.id]));
      redrawMinimap();
    }
  }

  function renderFieldMap(node, raw) {
    const panel = element('fieldset', 'bp-field-map');
    panel.append(element('legend', 'bp-setting-label', 'Field map'),
      element('p', 'bp-config-help', 'Pick a destination key and the source field that supplies its value. Use dot paths such as profile.name for nested fields.'));
    let rows = [];
    try {
      const value = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
      if (value && typeof value === 'object' && !Array.isArray(value)) rows = Object.entries(value).map(([key, path]) => ({ key, path: String(path ?? '') }));
    } catch { /* An invalid previous map is recoverable using a new row. */ }
    const table = element('div', 'bp-field-map-rows');
    const status = element('p', 'bp-field-map-status');
    status.setAttribute('role', 'status');
    const addField = button('bp-button bp-button-quiet', '+ Add field mapping');
    const commit = () => {
      const pairs = rows.filter(({ key }) => key.trim()).map(({ key, path }) => [key.trim(), path.trim()]);
      const unique = new Set(pairs.map(([key]) => key));
      if (unique.size !== pairs.length) {
        status.textContent = 'Destination keys must be unique. Previous settings kept.';
        return;
      }
      if (pairs.some(([key]) => ['__proto__', 'prototype', 'constructor'].includes(key))) {
        status.textContent = 'Choose a different destination key. Previous settings kept.';
        return;
      }
      status.textContent = '';
      updateNodeConfig(locate(node.id), 'mapping', JSON.stringify(Object.fromEntries(pairs)));
    };
    const build = () => {
      table.replaceChildren();
      rows.forEach((item, index) => {
        const line = element('div', 'bp-field-map-row');
        for (const [key, label, placeholder] of [['key', 'Destination key', 'inbox-name'], ['path', 'Source field path', 'name']]) {
          const field = element('input', 'bp-field');
          field.value = item[key];
          field.placeholder = placeholder;
          field.maxLength = 160;
          field.setAttribute('aria-label', `${label} ${index + 1}`);
          field.addEventListener('input', () => { item[key] = field.value; commit(); });
          const control = element('label', 'bp-field-map-control');
          control.append(element('span', '', label), field);
          line.append(control);
        }
        const remove = button('bp-remove', 'Remove mapping');
        remove.setAttribute('aria-label', `Remove mapping ${index + 1}`);
        remove.addEventListener('click', () => { rows.splice(index, 1); commit(); build(); addField.focus(); });
        line.append(remove);
        table.append(line);
      });
    };
    addField.addEventListener('click', () => {
      rows.push({ key: '', path: '' });
      build();
      table.lastElementChild?.querySelector('input')?.focus();
    });
    build();
    panel.append(table, status, addField);
    configPanel.append(panel);
  }

  function updateNodeConfig(node, key, value, rebuild = false) {
    const config = nodeConfig(node);
    if (Object.hasOwn(config, 'field') && (key === 'target' || key === 'source')) config.field = '';
    const updated = { ...node, config: { ...config, [key]: value } };
    save({ ...graph, nodes: graph.nodes.map((candidate) => candidate.id === node.id ? updated : candidate) }, false);
    const summary = nodeElements.get(node.id)?.querySelector('.bp-node-summary');
    if (summary) {
      summary.textContent = labelForNode(updated);
      summary.title = updated.note || summary.textContent;
      if (summary.hidden === Boolean(summary.textContent || updated.note)) {
        summary.hidden = !summary.textContent && !updated.note;
        updateWires(new Set([node.id]));
      }
    }
    if (updated.type === 'constant') {
      const output = portElements.get(portKey(updated.id, 'value', 'out'));
      const type = literalPortType(updated);
      if (output && output.dataset.portType !== type) {
        output.replaceWith(portButton(updated, 'out', ['value', 'Value', type]));
        updateSelection();
      }
    }
    if (updated.type === FLOW_ENTRY && key === 'name') {
      for (const caller of graph.nodes.filter((item) => callingTypes.has(item.type) && nodeConfig(item).flow === updated.id)) {
        const label = nodeElements.get(caller.id)?.querySelector('.bp-node-summary');
        if (label) label.title = label.textContent = labelForNode(caller);
      }
    }
    if (rebuild) {
      renderConfig();
      configPanel.querySelector(`[data-setting="${key}"]`)?.focus();
    }
  }

  function renderConfig() {
    configPanel.replaceChildren();
    if (!inspectorOpen) return;
    if (selectedComment) {
      const comment = graph.comments.find(({ id }) => id === selectedComment);
      if (comment) renderCommentDetails(comment);
      return;
    }
    if (selectedNodes.size > 1) {
      configPanel.append(element('p', 'bp-config-group', 'Selection'), element('h3', 'bp-config-title', `${selectedNodes.size} nodes`),
        element('p', 'bp-config-help', 'Drag a selected node to move the selection. Locked nodes stay in place.'));
      const list = element('div', 'bp-operation-list');
      for (const [label, action] of [
        ['Frame selection', frameSelection], ['Duplicate selection', duplicateSelection], ['Comment around selection', () => addComment()],
        ['Copy selection', copySelection], ['Lock selection', () => lockSelection(true)],
        ['Unlock selection', () => lockSelection(false)], ['Delete selection', removeSelection],
      ]) {
        const control = button('bp-button', label);
        control.addEventListener('click', action);
        list.append(control);
      }
      configPanel.append(list);
      return;
    }
    const node = currentNode();
    if (!node) {
      const edge = graph.edges.find((item) => item.id === selectedEdge);
      configPanel.append(element('h3', 'bp-config-title', edge ? 'Connection' : 'Node settings'));
      if (edge) {
        const from = locate(edge.from?.nodeId);
        const to = locate(edge.to?.nodeId);
        const output = portsFor(from, 'out').find(([id]) => id === edge.from.port);
        const input = portsFor(to, 'in').find(([id]) => id === edge.to.port);
        const type = output?.[2] === 'exec' ? 'Execution' : `${output?.[2] || 'Unknown'} data`;
        configPanel.append(element('p', 'bp-config-group', type),
          element('p', 'bp-config-help', `${nodeSpec(from?.type)?.label || ''} · ${output?.[1] || ''} → ${nodeSpec(to?.type)?.label || ''} · ${input?.[1] || ''}`));
        const remove = button('bp-remove', 'Delete connection');
        remove.addEventListener('click', removeSelection);
        const frameFrom = button('bp-button', 'Go to source');
        frameFrom.addEventListener('click', () => { chooseNode(from.id); frameNode(from); });
        const frameTo = button('bp-button', 'Go to destination');
        frameTo.addEventListener('click', () => { chooseNode(to.id); frameNode(to); });
        const actions = element('div', 'bp-operation-list');
        actions.append(frameFrom, frameTo, remove);
        configPanel.append(actions);
      } else {
        configPanel.append(element('p', 'bp-config-help', 'Select a node, connection, or comment to edit it. Find locates nodes by name and content.'));
        const shortcuts = element('dl', 'bp-shortcuts');
        for (const [keys, description] of [['Right-drag', 'Pan in two dimensions'], ['Wheel', 'Zoom at the pointer'], ['Left-drag', 'Box-select nodes'], ['F / Home', 'Frame selection'], ['N', 'Add a node'], ['C', 'Add a comment'], ['Alt+click port', 'Break its connections']]) {
          shortcuts.append(element('dt', '', keys), element('dd', '', description));
        }
        configPanel.append(shortcuts);
      }
      return;
    }

    const config = nodeConfig(node);
    const spec = nodeSpec(node.type);
    if (!spec) return;
    configPanel.append(element('p', 'bp-config-group', spec.group), element('h3', 'bp-config-title', node.label || spec.label));
    if (nodeDescriptions[node.type]) configPanel.append(element('p', 'bp-config-help', nodeDescriptions[node.type]));
    const incident = graph.edges.filter((edge) => edge.from?.nodeId === node.id || edge.to?.nodeId === node.id);
    if (incident.length) {
      const section = element('details', 'bp-config-details bp-connected');
      section.append(element('summary', '', `Connections (${incident.length})`));
      for (const edge of incident) {
        const incoming = edge.to.nodeId === node.id;
        const endpoint = incoming ? edge.from : edge.to;
        const linked = locate(endpoint.nodeId);
        if (!linked) continue;
        const peer = portsFor(linked, incoming ? 'out' : 'in').find(([name]) => name === endpoint.port);
        const jump = button('bp-edge-jump', '');
        jump.append(element('span', 'bp-edge-direction', incoming ? 'From' : 'To'),
          element('strong', '', linked.label || nodeSpec(linked.type)?.label), element('span', 'bp-edge-port', peer?.[1] || endpoint.port));
        jump.addEventListener('click', () => { chooseNode(linked.id); frameNode(linked); });
        section.append(jump);
      }
      configPanel.append(section);
    }
    const choose = (key, name, choices, rebuild = false) => {
      const field = selectField(choices, config[key]);
      field.dataset.setting = key;
      field.addEventListener('change', () => updateNodeConfig(locate(node.id), key, field.value, rebuild));
      configField(name, field);
    };
    const enter = (key, name, options = {}) => {
      const rowCount = typeof options === 'boolean' ? 3 : options.rows;
      const field = element(rowCount ? 'textarea' : 'input', `bp-field${options.code ? ' bp-editor-code' : ''}`);
      if (rowCount) field.rows = rowCount;
      if (options.code) { field.spellcheck = false; field.autocapitalize = 'off'; }
      if (options.placeholder) field.placeholder = options.placeholder;
      if (options.numeric) field.inputMode = 'decimal';
      field.value = config[key] == null ? '' : typeof config[key] === 'object' ? JSON.stringify(config[key], null, 2) : config[key];
      field.dataset.setting = key;
      field.addEventListener('input', () => updateNodeConfig(locate(node.id), key, field.value));
      configField(name, field);
    };
    const link = (port, name) => {
      const edge = graph.edges.find((item) => item.to?.nodeId === node.id && item.to?.port === port);
      if (!edge) return false;
      const source = locate(edge.from.nodeId);
      const output = portsFor(source, 'out').find(([id]) => id === edge.from.port);
      const field = element('div', 'bp-setting');
      const reveal = button('bp-linked-port', `${nodeSpec(source?.type)?.label} · ${output?.[1]}`);
      reveal.addEventListener('click', () => chooseEdge(edge.id));
      field.append(element('span', 'bp-setting-label', name), reveal);
      configPanel.append(field);
      return true;
    };
    const note = (message) => configPanel.append(element('p', 'bp-config-help', message));
    const checkbox = (key, name) => {
      const toggle = element('input', 'bp-check');
      toggle.type = 'checkbox';
      toggle.checked = config[key];
      toggle.dataset.setting = key;
      toggle.addEventListener('change', () => updateNodeConfig(locate(node.id), key, toggle.checked));
      const label = element('label', 'bp-checkbox-setting');
      label.append(toggle, element('span', '', name));
      configPanel.append(label);
    };
    const valueSetting = (name) => {
      if (link('value', name)) return;
      choose('valueMode', 'Value source', [['literal', 'Custom value'], ['event', 'Event value'], ['result', 'Latest result'], ['error', 'Latest error']], true);
      if (config.valueMode !== 'literal') return;
      if (!['set-text', 'notify'].includes(node.type)) choose('valueType', 'Data type', valueTypes, true);
      enter('value', name, { rows: 3, code: config.valueType === 'json' });
    };
    const targetBlocks = blockList(project);
    const targets = targetBlocks.map(({ id, label }) => [id, label]);
    if (spec.target) choose('target', 'Block', [['', 'Select a block…'], ...(node.type === 'show-records'
      ? targetBlocks.filter(({ block }) => block.type === 'records-table').map(({ id, label }) => [id, label]) : targets)], Object.hasOwn(config, 'field'));
    if (browserEvents.has(node.type)) {
      choose('page', 'Page', [['', 'All pages'], ...(project?.pages || []).map((page) => [page.id, page.name || page.title || page.slug])]);
    }
    if (node.type === KEY_EVENT) {
      enter('key', 'Key (blank for any)', { placeholder: 'Enter, Space, or ArrowLeft' });
      choose('phase', 'When', [['keydown', 'Key pressed'], ['keyup', 'Key released']]);
      checkbox('repeats', 'Run while the key is held');
      checkbox('insideFields', 'Respond while typing in a field');
    }
    if (['click', 'submit', KEY_EVENT].includes(node.type)) checkbox('preventDefault', 'Prevent the default browser action');
    if (node.type === CUSTOM_EVENT) {
      enter('eventName', 'Event name', { placeholder: 'cart:updated' });
      note('Listens on window. Connect Detail to pass the payload.');
    }
    if (node.type === 'if' && !link('value', 'Value to test')) {
      choose('source', 'Read from', [['', 'Event value'], ...targets], true);
    }
    if (Object.hasOwn(config, 'field')) {
      const form = targetBlocks.find((item) => item.id === (config.source || config.target));
      const options = formFields(form?.block).map((name, index) => [String(index), name || `Field ${index + 1}`]);
      const defaultField = node.type === 'input' ? 'Any field' : 'First field';
      if (options.length > 1) choose('field', 'Form field', [['', defaultField], ...options]);
    }
    if (node.type === 'if') {
      choose('operator', 'Comparison', operators, true);
      if (!['empty', 'checked'].includes(config.operator) && !link('comparison', 'Compare with')) enter('value', 'Compare with');
    }
    if (['set-text', 'set-value', 'notify'].includes(node.type)) {
      valueSetting(node.type === 'set-value' ? 'Value' : 'Text');
    }
    if (node.type === 'show-records') {
      choose('mode', 'Table state', recordsModes, true);
      if (config.mode === 'rows' && !link('records', 'Records')) note('Connect a Records output, or use the most recent array result in this flow.');
      if (!targetBlocks.some(({ block }) => block.type === 'records-table')) note('Add a Records table in Design before selecting a block here.');
    }
    if (node.type === 'visibility') choose('mode', 'Operation', visibilityModes);
    if (node.type === 'change-class') {
      choose('mode', 'Operation', classModes);
      enter('className', 'Class name');
    }
    if (node.type === FLOW_ENTRY) {
      enter('name', 'Flow name');
      note('Connect Run to this flow’s first step. Run flow nodes can call it with an input.');
      const callerCount = flowNavigation().callers.get(node.id)?.length || 0;
      if (callerCount) {
        const callers = button('bp-button bp-flow-link', `Show callers (${callerCount})`);
        callers.addEventListener('click', () => openFlows(node.id));
        configPanel.append(callers);
      }
    }
    if (callingTypes.has(node.type)) {
      const flows = flowNavigation().orderedDefinitions.map(({ node: entry, title }) => [entry.id, title]);
      choose('flow', 'Flow to run', [['', 'Select a flow…'], ...flows], true);
      if (config.flow && flowNavigation().definitions.has(config.flow)) {
        const definition = button('bp-button bp-flow-link', 'Go to definition');
        definition.addEventListener('click', () => navigateToFlowNode(config.flow));
        configPanel.append(definition);
      }
      if (node.type === 'for-each') {
        if (!link('items', 'Items')) note('Uses the latest array result when Items is unconnected. Runs in item order.');
      } else if (!link('input', 'Input')) note('Uses the latest result or event value when Input is unconnected.');
    }
    if (node.type === 'return-value') valueSetting('Return value');
    if (node.type === 'constant') {
      choose('valueType', 'Data type', valueTypes, true);
      enter('value', 'Value', { rows: 4, code: config.valueType === 'json', placeholder: config.valueType === 'json' ? '{"name": "Example"}' : '' });
    }
    if (node.type === 'get-property') {
      link('input', 'Object or array');
      enter('path', 'Property path', { placeholder: 'results[0].name' });
    }
    if (['set-variable', 'get-variable'].includes(node.type)) {
      enter('name', 'Variable name', { placeholder: 'selectedItem' });
      choose('scope', 'Scope', scopes);
      if (node.type === 'set-variable') valueSetting('Value');
    }
    if (node.type === 'run-js') {
      enter('name', 'Node label', { placeholder: 'Format the response' });
      link('input', 'Input');
      enter('code', 'JavaScript', { rows: 9, code: true });
      const help = element('details', 'bp-config-details');
      help.append(element('summary', '', 'Available arguments'), element('p', '', 'Return a result or throw to use the Error branch. You can use await.'),
        element('p', '', 'input · connected data, latest result, or event value'),
        element('p', '', 'ctx · event, trigger, pageId, index, result, error, vars, state'),
        element('p', '', 'dom · block(id), query(selector), queryAll, field, read, text, value, show, hide, notify'));
      configPanel.append(help);
    }
    if (node.type === 'http-request') {
      choose('method', 'Method', methods.map((item) => [item, item]), true);
      if (!link('url', 'URL')) enter('url', 'URL', { placeholder: 'https://api.example.com/items' });
      if (!link('headers', 'Headers')) enter('headers', 'Headers (JSON)', { rows: 3, code: true, placeholder: '{}' });
      if (!['GET', 'HEAD'].includes(config.method)) {
        choose('bodyType', 'Body format', [['json', 'JSON'], ['text', 'Text'], ['none', 'No body']], true);
        if (config.bodyType !== 'none' && !link('body', 'Body')) enter('body', 'Request body', { rows: 4, code: config.bodyType === 'json' });
      }
      choose('responseType', 'Response format', [['auto', 'Detect automatically'], ['json', 'JSON'], ['text', 'Text']]);
      enter('timeout', 'Timeout in milliseconds', { numeric: true });
    }
    if (Object.hasOwn(operationNames, node.type)) {
      const tables = tableList(project);
      const operation = operationNames[node.type];
      const table = tables.find((item) => item.id === config.table);
      choose('table', 'Table', [['', 'Select a table…'], ...tables.map(({ id, name }) => [id, name || id])], true);
      if (node.type === 'db-list') {
        if (!link('filter', 'Filter')) enter('filter', 'Filter (JSON)', { rows: 3, code: true, placeholder: '{"field":"field_id","operator":"eq","value":"open"}' });
        if (!link('limit', 'Limit')) enter('limit', 'Row limit', { numeric: true });
        if (!link('offset', 'Offset')) enter('offset', 'Skip rows', { numeric: true });
      }
      if (['read', 'update', 'delete'].includes(operation) && !link('recordId', 'Record ID')) enter('recordId', 'Record ID');
      if (['create', 'update'].includes(operation) && !link('data', 'Field values')) enter('data', 'Field values (JSON)', { rows: 4, code: true });
      if (table?.fields?.length) {
        const fieldIds = element('details', 'bp-config-details');
        fieldIds.append(element('summary', '', 'Table field IDs'));
        const fields = element('dl', 'bp-table-fields');
        for (const field of table.fields) {
          fields.append(element('dt', '', field.name), element('dd', '', `${field.id} · ${field.type}`));
        }
        fieldIds.append(fields);
        configPanel.append(fieldIds);
      }
      if (table?.permissions && table.permissions[operation] === false) note('This action is disabled by the table’s published permissions.');
    }
    if (node.type === 'log') {
      enter('label', 'Log label', { placeholder: 'Debug' });
      valueSetting('Value to log');
    }
    for (const setting of spec.controls || []) {
      const { key, label, kind, options, placeholder, description, port, min, max } = setting;
      if (port && link(port, label)) continue;
      if (node.type === 'map-object-fields' && key === 'mapping') renderFieldMap(node, config[key]);
      else if (kind === 'boolean') checkbox(key, label);
      else if (kind === 'select') choose(key, label, options || []);
      else if (kind === 'page') choose(key, label, [['', 'Select a page'], ...(project?.pages || []).map((page) => [page.id, page.name || page.title || page.slug])]);
      else enter(key, label, { rows: kind === 'textarea' ? 4 : undefined, numeric: kind === 'number', placeholder });
      if (description) note(description);
      if (min !== undefined || max !== undefined) note(`Minimum: ${min ?? '—'} · Maximum: ${max ?? '—'}`);
    }
    const metadata = element('details', 'bp-config-details bp-node-metadata');
    metadata.append(element('summary', '', 'Organization'));
    const metadataInput = (key, label, type) => {
      const control = element(type === 'note' ? 'textarea' : 'input', 'bp-field');
      control.maxLength = key === 'label' ? 80 : 600;
      control.value = node[key] || '';
      control.dataset.setting = key;
      control.addEventListener('input', () => updateNodeDetails(locate(node.id), key, control.value));
      const field = element('label', 'bp-setting');
      field.append(element('span', 'bp-setting-label', label), control);
      metadata.append(field);
    };
    metadataInput('label', 'Custom label');
    metadataInput('note', 'Editor note', 'note');
    const flags = [['locked', 'Lock position'], ['compact', 'Compact node']];
    if (canBypass(node)) flags.push(['disabled', 'Bypass this action']);
    for (const [key, title] of flags) {
      const checkbox = element('input', 'bp-check');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(node[key]);
      checkbox.addEventListener('change', () => updateNodeDetails(locate(node.id), key, checkbox.checked));
      const label = element('label', 'bp-checkbox-setting');
      label.append(checkbox, element('span', '', title));
      metadata.append(label);
    }
    if (canBypass(node)) metadata.append(element('p', 'bp-config-help', 'A bypassed action passes execution to Next without running its effect.'));
    configPanel.append(metadata);
    const remove = button('bp-remove', 'Delete node');
    remove.addEventListener('click', removeSelection);
    const duplicate = button('bp-button bp-duplicate', 'Duplicate node');
    duplicate.addEventListener('click', duplicateSelection);
    const actions = element('div', 'bp-node-actions');
    actions.append(duplicate, remove);
    configPanel.append(actions);
  }

  function render({ keepFocus = false } = {}) {
    const previousFocus = keepFocus ? document.activeElement : null;
    const property = previousFocus?.dataset?.setting;
    const focusPort = previousFocus?.dataset?.port;
    const focusNode = previousFocus?.dataset?.nodeId;
    const focusDirection = previousFocus?.dataset?.direction;
    renderNodes();
    renderComments();
    updateSelection();
    renderConfig();
    paintCamera();
    updateDiagnostics();
    if (flowDialog.open) updateFlows();
    if (property) configPanel.querySelector(`[data-setting="${property}"]`)?.focus({ preventScroll: true });
    if (focusPort) portElements.get(portKey(focusNode, focusPort, focusDirection))?.focus({ preventScroll: true });
  }

  function removeSelection() {
    if (selectedNodes.size) {
      const ids = new Set(selectedNodes);
      const count = ids.size;
      selectedNodes.clear();
      selectedNode = undefined;
      if (ids.has(armed?.nodeId)) armed = undefined;
      save({ ...graph, nodes: graph.nodes.filter((node) => !ids.has(node.id)),
        edges: graph.edges.filter((edge) => !ids.has(edge.from?.nodeId) && !ids.has(edge.to?.nodeId)) });
      report(`${count} ${count === 1 ? 'node' : 'nodes'} deleted. Undo can restore the selection.`);
    } else if (selectedEdge) {
      const id = selectedEdge;
      selectedEdge = undefined;
      save({ ...graph, edges: graph.edges.filter((edge) => edge.id !== id) });
      report('Connection deleted. Undo can restore it.');
    } else if (selectedComment) {
      const id = selectedComment;
      selectedComment = undefined;
      save({ ...graph, comments: graph.comments.filter((comment) => comment.id !== id) });
      report('Comment deleted. The nodes are still on the graph.');
    }
    viewport.focus({ preventScroll: true });
  }

  const snapValue = (coordinate) => snap ? Math.round(coordinate / 24) * 24 : Math.round(coordinate);
  const snapPoint = ({ x, y }) => ({ x: snapValue(x), y: snapValue(y) });
  const centerPoint = () => ({ x: (viewport.clientWidth / 2 - camera.x) / zoom, y: (viewport.clientHeight / 2 - camera.y) / zoom });
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  function findOpenPosition(previous) {
    const left = (36 - camera.x) / zoom;
    const top = (40 - camera.y) / zoom;
    const right = Math.max((viewport.clientWidth - 28 - camera.x) / zoom, left + 234);
    const rects = graph.nodes.map(rectForNode);
    const fits = (x, y) => x + 230 <= right && !rects.some((rect) => intersects(rect, { x: x - 24, y: y - 18, width: 270, height: 195 }));
    if (previous) {
      const { x, y } = position(previous);
      if (x + 270 >= left && y >= top - 36 && fits(x + 270, y)) return { x: x + 270, y };
    }
    const lastRow = Math.max(top, ...rects.map(({ y, height }) => y + height + 30));
    for (let y = top; y <= Math.min(lastRow + 185, top + 1600); y += 180) {
      for (let x = left; x + 230 <= right; x += 270) if (fits(x, y)) return { x, y };
    }
    return { x: left, y: lastRow };
  }

  function addNode(type, config, request = {}) {
    const node = { id: `node-${suffix()}`, type,
      ...snapPoint(request.point || findOpenPosition(currentNode() || graph.nodes.at(-1))),
      config: structuredClone(config || {}),
    };
    if (request.socket) {
      const port = matchingPort(node, request.socket, request.direction);
      const wired = port && (request.direction === 'out'
        ? connect(request.socket, node.id, port, node)
        : connect({ nodeId: node.id, port }, request.socket.nodeId, request.socket.port, node));
      if (wired) { revealNode(node); return; }
    }
    selectedEdge = undefined;
    selectedComment = undefined;
    selectedNode = node.id;
    selectedNodes = new Set([node.id]);
    save({ ...graph, nodes: [...graph.nodes, node] });
    revealNode(node);
    nodeElements.get(node.id)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
    report(`Added “${nodeSpec(type).label}”.`);
  }

  function matchingPort(node, socket, direction) {
    const existing = portType(locate(socket.nodeId), direction, socket.port);
    const other = direction === 'out' ? 'in' : 'out';
    const candidates = portsFor(node, other).filter(([, , type]) => direction === 'out' ? compatible(existing, type) : compatible(type, existing));
    return (candidates.find(([, , type]) => type === existing) || candidates[0])?.[0];
  }

  function openPicker(point, socket, direction) {
    const usual = ['click', 'page-load', 'submit', 'if', 'set-text', 'notify', 'log', 'get-property', 'map-object-fields', 'db-create'];
    if (!socket) { picker.open({ point, suggestions: usual }); return; }
    const source = locate(socket.nodeId);
    const [, name, kind] = portsFor(source, direction).find(([id]) => id === socket.port) || [];
    const compatibleNode = (type) => Boolean(matchingPort({ type }, socket, direction));
    const dataIdeas = { object: ['get-property', 'map-object-fields', 'set-object-field', 'db-create'], array: ['for-each', 'get-property', 'db-list'], string: ['set-text', 'notify', 'if'], number: ['if', 'format-number', 'set-value'], boolean: ['if', 'set-value'] };
    const suggestions = [...new Set([...(dataIdeas[kind] || []), ...usual, ...Object.keys(nodeTypes)])].filter(compatibleNode).slice(0, 12);
    picker.open({ point, socket, direction, title: `Add node for ${name || 'port'}`,
      canPick: compatibleNode, suggestions,
    });
  }

  const selectionPayload = () => {
    const ids = selectedNodes;
    return ids.size ? { nodes: graph.nodes.filter((node) => ids.has(node.id)),
      edges: graph.edges.filter((edge) => ids.has(edge.from?.nodeId) && ids.has(edge.to?.nodeId)) } : null;
  };

  function insertCopies(data, anchor, verb) {
    if (!data?.nodes?.length) return report('Copy or select nodes first.', false);
    const boxes = data.nodes.map((node) => ({ ...position(node), width: 0, height: 0 }));
    const bounds = boundsFor(boxes);
    const ids = new Map(data.nodes.map((node) => [node.id, `node-${suffix()}`]));
    const copies = data.nodes.map((item) => {
      const node = structuredClone(item);
      const point = position(node);
      const config = nodeConfig(node);
      if (node.type === FLOW_ENTRY) config.name = `${config.name} copy`;
      if (callingTypes.has(node.type) && ids.has(config.flow)) config.flow = ids.get(config.flow);
      const move = { x: anchor.x + point.x - bounds.x, y: anchor.y + point.y - bounds.y };
      return { ...node, ...snapPoint(move), id: ids.get(node.id), config };
    });
    const edges = data.edges.filter((edge) => ids.has(edge.from?.nodeId) && ids.has(edge.to?.nodeId)).map((edge) => ({
      id: `wire-${suffix()}`, from: { ...edge.from, nodeId: ids.get(edge.from.nodeId) }, to: { ...edge.to, nodeId: ids.get(edge.to.nodeId) },
    }));
    selectedNodes = new Set(copies.map(({ id }) => id));
    selectedNode = copies.at(-1).id;
    selectedComment = undefined;
    selectedEdge = undefined;
    save({ ...graph, nodes: [...graph.nodes, ...copies], edges: [...graph.edges, ...edges] });
    if (copies.length === 1) revealNode(copies[0]);
    else frameSelection();
    nodeElements.get(selectedNode)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
    report(`${verb} ${copies.length} ${copies.length === 1 ? 'node' : 'nodes'}.`);
  }

  function duplicateSelection() {
    const data = selectionPayload();
    if (!data) return;
    const bounds = boundsFor(data.nodes.map(rectForNode));
    insertCopies(data, { x: bounds.x + 36, y: bounds.y + 36 }, 'Duplicated');
  }

  function copySelection() {
    const data = selectionPayload();
    if (!data) return;
    clipboard = structuredClone(data);
    try { navigator.clipboard?.writeText(JSON.stringify({ format: 'plot-logic/1', ...clipboard })).catch(() => {}); } catch { /* Local clipboard is available. */ }
    report(`Copied ${data.nodes.length} ${data.nodes.length === 1 ? 'node' : 'nodes'}.`, false);
  }

  async function pasteSelection(point = centerPoint()) {
    let data = clipboard;
    if (!data) {
      try {
        const contents = await navigator.clipboard?.readText();
        if (typeof contents !== 'string' || contents.length > 250000) return;
        const candidate = JSON.parse(contents);
        if (candidate?.format === 'plot-logic/1' && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) {
          data = { nodes: candidate.nodes.filter((node) => node && typeof node.id === 'string' && nodeSpec(node.type)).slice(0, 300),
            edges: candidate.edges.filter(Boolean).slice(0, 1200) };
        }
      } catch { /* Clipboard access may be unavailable. */ }
    }
    insertCopies(data, { x: point.x - 60, y: point.y - 25 }, 'Pasted');
  }

  function lockSelection(locked) {
    if (!selectedNodes.size) return;
    save({ ...graph, nodes: graph.nodes.map((node) => selectedNodes.has(node.id) ? { ...node, locked } : node) });
    report(locked ? 'Selected nodes locked.' : 'Selected nodes unlocked.', false);
  }

  function arrange(axis, method) {
    const nodes = graph.nodes.filter((node) => selectedNodes.has(node.id) && !node.locked);
    const minimum = method === 'distribute' ? 3 : 2;
    if (nodes.length < minimum) return report(`Select at least ${minimum} unlocked nodes.`, false);
    const bounds = boundsFor(nodes.map(rectForNode));
    const size = axis === 'x' ? 'width' : 'height';
    const data = new Map();
    if (method === 'distribute') {
      const ordered = [...nodes].sort((a, b) => position(a)[axis] - position(b)[axis]);
      const ends = ordered.map((node) => position(node)[axis]);
      ordered.forEach((node, index) => data.set(node.id, Math.round(ends[0] + (ends.at(-1) - ends[0]) * index / (ordered.length - 1))));
    } else {
      for (const node of nodes) {
        const rect = rectForNode(node);
        const difference = bounds[size] - rect[size];
        data.set(node.id, Math.round(bounds[axis] + (method === 'end' ? difference : method === 'center' ? difference / 2 : 0)));
      }
    }
    save({ ...graph, nodes: graph.nodes.map((node) => data.has(node.id) ? { ...node, [axis]: data.get(node.id) } : node) });
    report('Selection arranged.', false);
  }

  const commentTones = { slate: '#7688b6', teal: '#67c4bc', gold: '#dcb071', rose: '#ce85a8' };

  function chooseComment(id) {
    selectedComment = id;
    selectedEdge = undefined;
    selectedNode = undefined;
    selectedNodes.clear();
    updateSelection();
    renderConfig();
  }

  function addComment(point = centerPoint()) {
    const selected = graph.nodes.filter((node) => selectedNodes.has(node.id));
    const bounds = boundsFor(selected.map(rectForNode), 34);
    const box = bounds ? { ...bounds, y: bounds.y - 22, height: bounds.height + 22 } : { ...snapPoint(point), width: 290, height: 170 };
    const comment = { ...box, id: `comment-${suffix()}`, title: 'Comment', color: 'slate' };
    selectedNode = undefined;
    selectedNodes.clear();
    selectedComment = comment.id;
    selectedEdge = undefined;
    inspectorOpen = true;
    syncInspector();
    save({ ...graph, comments: [...graph.comments, comment] });
    configPanel.querySelector('[data-setting="comment-title"]')?.focus();
    configPanel.querySelector('[data-setting="comment-title"]')?.select();
    report('Comment added. Drag its title to move the nodes inside.', false);
  }

  function commentState(comment, key, value) {
    save({ ...graph, comments: graph.comments.map((item) => item.id === comment.id ? { ...item, [key]: value } : item) }, false);
    const view = commentElements.get(comment.id);
    if (key === 'title') view.querySelector('.bp-comment-head').textContent = value || 'Comment';
    if (key === 'color') view.style.setProperty('--bp-comment-color', commentTones[value] || commentTones.slate);
    redrawMinimap();
  }

  function renderCommentDetails(comment) {
    configPanel.append(element('p', 'bp-config-group', 'Organization'), element('h3', 'bp-config-title', 'Comment'),
      element('p', 'bp-config-help', 'Frame a section of the graph. Drag its title to move the comment and the unlocked nodes inside.'));
    const title = element('input', 'bp-field');
    title.value = comment.title || '';
    title.maxLength = 120;
    title.dataset.setting = 'comment-title';
    title.addEventListener('input', () => commentState(comment, 'title', title.value));
    configField('Comment title', title);
    const color = selectField(Object.keys(commentTones).map((id) => [id, id[0].toUpperCase() + id.slice(1)]), comment.color || 'slate');
    color.addEventListener('change', () => commentState(comment, 'color', color.value));
    configField('Comment color', color);
    const lock = element('input', 'bp-check');
    lock.type = 'checkbox';
    lock.checked = Boolean(comment.locked);
    lock.addEventListener('change', () => { commentState(comment, 'locked', lock.checked); renderComments(); updateSelection(); });
    configField('Lock comment', lock);
    const remove = button('bp-remove', 'Delete comment');
    remove.addEventListener('click', removeSelection);
    configPanel.append(remove);
  }

  function renderComments() {
    commentLayer.replaceChildren();
    commentElements.clear();
    for (const comment of graph.comments) {
      if (!comment?.id) continue;
      const rectangle = rectForComment(comment);
      const view = element('section', 'bp-comment');
      view.dataset.commentId = comment.id;
      view.style.setProperty('--bp-comment-color', commentTones[comment.color] || commentTones.slate);
      Object.assign(view.style, { left: `${rectangle.x}px`, top: `${rectangle.y}px`, width: `${rectangle.width}px`, height: `${rectangle.height}px` });
      const head = button('bp-comment-head', comment.title || 'Comment');
      head.title = 'Drag to move the comment and its nodes';
      head.addEventListener('click', () => { if (!suppressClick) chooseComment(comment.id); });
      head.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || spaceHeld || pointer || comment.locked) return;
        const contained = graph.nodes.filter((node) => {
          const { x, y, width, height } = rectForNode(node);
          const center = { x: x + width / 2, y: y + height / 2, width: 1, height: 1 };
          return !node.locked && intersects(center, rectangle);
        });
        pointer = { kind: 'comment', id: event.pointerId, comment, rectangle, start: worldPoint(event),
          initial: new Map(contained.map((node) => [node.id, position(node)])) };
        head.setPointerCapture(event.pointerId);
      });
      const resize = button('bp-comment-resize', '');
      resize.title = 'Resize comment';
      resize.setAttribute('aria-label', 'Resize comment');
      resize.hidden = Boolean(comment.locked);
      resize.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || spaceHeld || pointer) return;
        pointer = { kind: 'resize-comment', id: event.pointerId, comment, rectangle, start: worldPoint(event) };
        resize.setPointerCapture(event.pointerId);
      });
      resize.addEventListener('keydown', (event) => {
        const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const width = Math.max(190, rectangle.width + delta[0]);
        const height = Math.max(100, rectangle.height + delta[1]);
        save({ ...graph, comments: graph.comments.map((item) => item.id === comment.id ? { ...item, width, height } : item) });
        commentElements.get(comment.id)?.querySelector('.bp-comment-resize')?.focus({ preventScroll: true });
      });
      view.append(head, resize);
      commentElements.set(comment.id, view);
      commentLayer.append(view);
    }
  }

  function syncInspector() {
    layout.classList.toggle('has-inspector', inspectorOpen);
    configPanel.hidden = !inspectorOpen;
    inspect.setAttribute('aria-expanded', String(inspectorOpen));
  }

  function toggleInspector(open = !inspectorOpen) {
    inspectorOpen = open;
    syncInspector();
    renderConfig();
  }

  function updateFinder() {
    const terms = findInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matching = graph.nodes.filter((node) => {
      const type = `${node.type} ${nodeSpec(node.type)?.label || ''} ${nodeSpec(node.type)?.group || ''}`.toLowerCase();
      const target = labelForNode(node).toLowerCase();
      const note = String(node.note || '').toLowerCase();
      const text = `${node.label || ''} ${type} ${note} ${target}`.toLowerCase();
      return terms.every((term) => term.startsWith('type:') ? type.includes(term.slice(5)) : term.startsWith('target:') ? target.includes(term.slice(7)) : term.startsWith('note:') ? note.includes(term.slice(5)) : text.includes(term));
    });
    findResults.replaceChildren();
    for (const node of matching) {
      const option = button('bp-picker-option');
      option.append(element('strong', '', node.label || nodeSpec(node.type)?.label), element('span', '', node.note || labelForNode(node)));
      option.append(element('small', 'bp-find-meta', `${nodeSpec(node.type)?.group || 'Node'} · ${Math.round(position(node).x)}, ${Math.round(position(node).y)}`));
      option.addEventListener('click', () => {
        finder.close();
        chooseNode(node.id);
        frameNode(node);
        nodeElements.get(node.id)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
      });
      findResults.append(option);
    }
    const matchingComments = graph.comments.filter((comment) => terms.every((term) => (comment.title || '').toLowerCase().includes(term)));
    for (const comment of matchingComments) {
      const option = button('bp-picker-option');
      option.append(element('strong', '', comment.title || 'Comment'), element('span', '', 'Comment'));
      option.addEventListener('click', () => { finder.close(); chooseComment(comment.id); frameSelection(); viewport.focus(); });
      findResults.append(option);
    }
    if (!matching.length && !matchingComments.length) findResults.append(element('p', 'bp-picker-empty', 'No matching nodes or comments.'));
  }

  function showFinder() {
    if (finder.open) return;
    hideMenu();
    findInput.value = '';
    updateFinder();
    finder.showModal();
    findInput.focus();
  }

  function navigateToFlowNode(id) {
    const node = locate(id);
    if (!node) return;
    flowDialog.close();
    chooseNode(id);
    frameNode(node);
    nodeElements.get(id)?.querySelector('.bp-node-head')?.focus({ preventScroll: true });
  }

  function flowRow({ node, title, detail }, secondary) {
    const row = element('div', 'bp-picker-entry bp-flow-row');
    const select = button('bp-picker-option');
    select.dataset.flowJump = '';
    const subtitle = detail || `${Math.round(position(node).x)}, ${Math.round(position(node).y)}`;
    select.append(element('strong', '', title), element('span', '', subtitle));
    select.addEventListener('click', () => navigateToFlowNode(node.id));
    row.append(select);
    if (secondary) row.append(secondary);
    return row;
  }

  function showCallerList(id) {
    flowListQuery = flowDefinitionId ? flowListQuery : flowInput.value;
    flowDefinitionId = id;
    flowInput.value = '';
    updateFlows();
    flowInput.focus();
  }

  function updateFlows() {
    const { callers, definitions, groups, orderedDefinitions } = flowNavigation();
    const definition = definitions.get(flowDefinitionId);
    if (!definition) flowDefinitionId = undefined;
    const terms = flowInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (...fields) => {
      const text = fields.join(' ').toLowerCase();
      return terms.every((term) => text.includes(term));
    };
    flowHeading.textContent = definition ? `Callers of ${definition.title}` : 'Flows';
    flowBack.hidden = !definition;
    flowInput.placeholder = definition ? 'Find a caller by name or type' : 'Find an event, page, or flow';
    flowInput.setAttribute('aria-label', definition ? 'Search callers' : 'Search flows');
    flowResults.replaceChildren();
    let visibleCount = 0;

    if (definition) {
      const go = button('bp-button bp-flow-link bp-flow-definition', 'Go to definition');
      go.addEventListener('click', () => navigateToFlowNode(definition.node.id));
      flowResults.append(go);
      const entries = (callers.get(definition.node.id) || []).filter(({ title, detail }) => matches(title, detail));
      if (entries.length) flowResults.append(element('h4', 'bp-picker-group-label', 'Call sites'));
      for (const entry of entries) {
        const point = position(entry.node);
        const kind = entry.title === entry.detail ? '' : `${entry.detail} · `;
        flowResults.append(flowRow({ ...entry, detail: `${kind}${Math.round(point.x)}, ${Math.round(point.y)}` }));
      }
      visibleCount = entries.length;
    } else {
      const reusable = orderedDefinitions.filter(({ title, detail }) => matches(title, detail, 'reusable flows'));
      if (reusable.length) flowResults.append(element('h4', 'bp-picker-group-label', 'Reusable flows'));
      for (const entry of reusable) {
        const entries = callers.get(entry.node.id) || [];
        const label = `${entries.length} ${entries.length === 1 ? 'caller' : 'callers'}`;
        const secondary = entries.length ? button('bp-button bp-flow-callers', label) : element('span', 'bp-flow-no-callers', label);
        if (entries.length) {
          secondary.setAttribute('aria-label', `Show ${label} of ${entry.title}`);
          secondary.addEventListener('click', () => showCallerList(entry.node.id));
        }
        flowResults.append(flowRow(entry, secondary));
      }
      visibleCount = reusable.length;
      const byPage = groups.map(({ label, entries }) => ({ label, entries: entries.filter(({ title, detail, type }) => matches(title, detail, type, label, 'events')) }));
      if (byPage.some(({ entries }) => entries.length)) flowResults.append(element('h4', 'bp-picker-group-label', 'Events by page'));
      for (const { label, entries } of byPage) {
        if (!entries.length) continue;
        const section = element('section', 'bp-flow-page');
        section.setAttribute('aria-label', label);
        section.append(element('h5', 'bp-flow-page-name', label));
        for (const entry of entries) section.append(flowRow(entry));
        flowResults.append(section);
        visibleCount += entries.length;
      }
    }

    flowCount.textContent = `${visibleCount} ${definition ? (visibleCount === 1 ? 'caller' : 'callers') : (visibleCount === 1 ? 'entry' : 'entries')}`;
    const emptyMessage = terms.length ? 'No matching entries.' : definition ? 'This flow has no callers.' : 'Add an event or Flow input to create an entry point.';
    if (!visibleCount) flowResults.append(element('p', 'bp-picker-empty', emptyMessage));
  }

  function openFlows(id) {
    if (flowDialog.open) return;
    hideMenu();
    flowDefinitionId = id;
    flowListQuery = '';
    flowInput.value = '';
    updateFlows();
    flowDialog.showModal();
    flowInput.focus();
  }

  function addBookmark() {
    const id = `bookmark-${suffix()}`;
    const next = { id, name: `View ${graph.bookmarks.length + 1}`, x: camera.x, y: camera.y, zoom };
    save({ ...graph, bookmarks: [...graph.bookmarks, next] }, false);
    report(`Saved ${next.name}. Open Graph → Bookmarks to jump back.`, false);
  }

  function openBookmarkManager() {
    const dialog = element('dialog', 'bp-picker');
    dialog.setAttribute('aria-label', 'Graph bookmarks');
    const header = element('div', 'bp-picker-header');
    const close = button('bp-picker-close', '×');
    close.setAttribute('aria-label', 'Close graph bookmarks');
    header.append(element('h3', '', 'Bookmarks'), close);
    const content = element('div', 'bp-bookmarks');
    const build = () => {
      content.replaceChildren();
      if (!graph.bookmarks.length) content.append(element('p', 'bp-config-help', 'Save a canvas view to return to it later.'));
      for (const mark of graph.bookmarks) {
        const row = element('div', 'bp-bookmark');
        const input = element('input', 'bp-field');
        input.value = mark.name || '';
        input.maxLength = 75;
        input.setAttribute('aria-label', 'Bookmark name');
        input.addEventListener('change', () => save({ ...graph, bookmarks: graph.bookmarks.map((item) => item.id === mark.id ? { ...item, name: input.value.trim() || 'Saved view' } : item) }, false));
        const go = button('bp-button', 'Jump');
        go.addEventListener('click', () => {
          if (Number.isFinite(mark.x) && Number.isFinite(mark.y) && Number.isFinite(mark.zoom)) {
            camera = { x: mark.x, y: mark.y };
            zoom = Math.max(.12, Math.min(2.4, mark.zoom));
            paintCamera();
          }
          dialog.close();
          viewport.focus();
        });
        const remove = button('bp-remove', 'Remove');
        remove.addEventListener('click', () => { save({ ...graph, bookmarks: graph.bookmarks.filter(({ id }) => id !== mark.id) }, false); build(); });
        row.append(input, go, remove);
        content.append(row);
      }
      const add = button('bp-button bp-button-main', 'Save current view');
      add.addEventListener('click', () => { addBookmark(); build(); });
      content.append(add);
    };
    build();
    dialog.append(header, content);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    root.append(dialog);
    dialog.showModal();
  }

  function openTrace() {
    const dialog = element('dialog', 'bp-picker');
    dialog.setAttribute('aria-label', 'Execution trace');
    const header = element('div', 'bp-picker-header');
    const close = button('bp-picker-close', '×');
    close.setAttribute('aria-label', 'Close execution trace');
    header.append(element('h3', '', 'Execution trace'), close);
    const content = element('div', 'bp-bookmarks');
    if (!lastTrace.length) content.append(element('p', 'bp-config-help', 'Test the site, then check this panel for node activity and faults.'));
    for (const detail of [...lastTrace].reverse()) {
      const node = locate(detail.nodeId);
      const row = button('bp-picker-option');
      row.append(element('strong', '', node?.label || nodeSpec(node?.type)?.label || 'Preview'), element('span', '', detail.message || detail.level || 'Executed'));
      row.dataset.level = detail.level || '';
      row.addEventListener('click', () => { if (node) { dialog.close(); chooseNode(node.id); frameNode(node); } });
      content.append(row);
    }
    dialog.append(header, content);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    root.append(dialog);
    dialog.showModal();
  }

  function hideMenu() { contextMenu.hidden = true; }

  function showMenu(entries, bounds) {
    contextMenu.replaceChildren();
    for (const entry of entries) {
      if (typeof entry === 'string') { contextMenu.append(element('p', 'bp-context-heading', entry)); continue; }
      const [label, action, enabled = true, shortcut] = entry;
      const option = button('bp-context-option');
      option.append(element('span', '', label));
      if (shortcut) option.append(element('kbd', '', shortcut));
      option.disabled = !enabled;
      option.addEventListener('click', () => { hideMenu(); action(); });
      contextMenu.append(option);
    }
    contextMenu.hidden = false;
    const stage = viewport.getBoundingClientRect();
    const left = Math.max(7, Math.min(bounds.x - stage.x, viewport.clientWidth - contextMenu.offsetWidth - 7));
    const top = Math.max(7, Math.min(bounds.y - stage.y, viewport.clientHeight - contextMenu.offsetHeight - 7));
    Object.assign(contextMenu.style, { left: `${left}px`, top: `${top}px` });
    contextMenu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function graphActions(point, target) {
    const port = target?.closest('.bp-port');
    const actions = [];
    if (port) actions.push(['Break port connections', () => breakPort(port.dataset.nodeId, port.dataset.port, port.dataset.direction), true, 'Alt+click']);
    actions.push(['Add node', () => openPicker(point), true, 'N'], ['Add comment', () => addComment(point), true, 'C'],
      ['Paste nodes', () => pasteSelection(point)], ['Fit graph', fitGraph], ['Frame selection', frameSelection, selectedNodes.size > 0 || Boolean(selectedComment), 'F']);
    if (selectedNodes.size) actions.push('Selection', ['Copy nodes', copySelection], ['Duplicate nodes', duplicateSelection], ['Delete nodes', removeSelection]);
    actions.push('Workspace', ['Browse flows', () => openFlows()], ['Find in graph', showFinder], [spotlight ? 'Show all branches' : 'Spotlight selection', () => { spotlight = !spotlight; updateSelection(); report(spotlight ? 'Spotlight shows selected nodes and direct connections.' : 'All branches are visible.', false); }],
      [snap ? 'Turn snapping off' : 'Turn snapping on', () => { snap = !snap; report(snap ? 'Snap to 24 px grid.' : 'Snap disabled.', false); }],
      [gridOpen ? 'Hide grid' : 'Show grid', () => { gridOpen = !gridOpen; paintCamera(); }],
      [minimapOpen ? 'Hide minimap' : 'Show minimap', () => { minimapOpen = !minimapOpen; redrawMinimap(); }],
      ['Bookmarks', openBookmarkManager], ['Execution trace', openTrace]);
    return actions;
  }

  function arrangementActions() {
    const unlocked = graph.nodes.filter((node) => selectedNodes.has(node.id) && !node.locked).length;
    return ['Align', ['Left edges', () => arrange('x', 'start'), unlocked >= 2], ['Horizontal centers', () => arrange('x', 'center'), unlocked >= 2],
      ['Right edges', () => arrange('x', 'end'), unlocked >= 2], ['Top edges', () => arrange('y', 'start'), unlocked >= 2],
      ['Vertical centers', () => arrange('y', 'center'), unlocked >= 2], ['Bottom edges', () => arrange('y', 'end'), unlocked >= 2],
      'Distribute', ['Across horizontally', () => arrange('x', 'distribute'), unlocked >= 3], ['Down vertically', () => arrange('y', 'distribute'), unlocked >= 3]];
  }

  function buttonBounds(control) {
    const bounds = control.getBoundingClientRect();
    return { x: bounds.left, y: bounds.bottom + 4 };
  }

  async function toggleFocus() {
    if (document.fullscreenElement === root) { await document.exitFullscreen(); return; }
    if (root.classList.contains('is-focus-mode')) { root.classList.remove('is-focus-mode'); focusButton.textContent = 'Focus'; return; }
    try {
      if (root.requestFullscreen) { await root.requestFullscreen(); return; }
    } catch { /* An embedded host may require the in-page focus mode. */ }
    root.classList.add('is-focus-mode');
    focusButton.textContent = 'Exit focus';
  }

  add.addEventListener('click', () => openPicker());
  searchGraph.addEventListener('click', showFinder);
  findClose.addEventListener('click', () => finder.close());
  findInput.addEventListener('input', updateFinder);
  findInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); findResults.querySelector('button')?.click(); } });
  showFlows.addEventListener('click', () => openFlows());
  flowClose.addEventListener('click', () => flowDialog.close());
  flowBack.addEventListener('click', () => {
    flowDefinitionId = undefined;
    flowInput.value = flowListQuery;
    updateFlows();
    flowInput.focus();
  });
  flowInput.addEventListener('input', updateFlows);
  flowInput.addEventListener('keydown', (event) => {
    const first = flowResults.querySelector('[data-flow-jump]');
    if (event.key === 'Enter' && first) { event.preventDefault(); first.click(); }
    if (event.key === 'ArrowDown' && first) { event.preventDefault(); first.focus(); }
  });
  inspect.addEventListener('click', () => toggleInspector());
  theme.addEventListener('click', () => {
    boardTheme = root.dataset.palette === 'night' ? 'draft' : 'night';
    root.dataset.palette = boardTheme;
    writeBoardPreference('theme', boardTheme);
    syncThemeLabel();
    redrawMinimap();
  });
  menuButton.addEventListener('click', () => showMenu(graphActions(), buttonBounds(menuButton)));
  layouts.addEventListener('click', () => showMenu(arrangementActions(), buttonBounds(layouts)));
  historyBack.addEventListener('click', () => onUndo?.());
  historyForward.addEventListener('click', () => onRedo?.());
  run.addEventListener('click', async () => {
    if (document.fullscreenElement === root) await document.exitFullscreen();
    if (root.classList.contains('is-focus-mode')) await toggleFocus();
    resetTrace();
    onPreview?.();
  });
  focusButton.addEventListener('click', toggleFocus);
  root.addEventListener('fullscreenchange', () => { focusButton.textContent = document.fullscreenElement === root ? 'Exit focus' : 'Focus'; });
  fitView.addEventListener('click', fitGraph);
  frameView.addEventListener('click', frameSelection);
  zoomReset.addEventListener('click', resetView);
  zoomOut.addEventListener('click', () => setZoom(zoom / 1.15));
  zoomIn.addEventListener('click', () => setZoom(zoom * 1.15));

  map.addEventListener('click', (event) => {
    const bounds = map.getBoundingClientRect();
    const { x, y, scale } = map._worldBounds || {};
    if (!scale) return;
    const xWorld = ((event.clientX - bounds.left) * mapSize.width / bounds.width - x) / scale;
    const yWorld = ((event.clientY - bounds.top) * mapSize.height / bounds.height - y) / scale;
    camera = { x: viewport.clientWidth / 2 - xWorld * zoom, y: viewport.clientHeight / 2 - yWorld * zoom };
    paintCamera();
  });
  map.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); fitGraph(); }
  });

  viewport.addEventListener('wheel', (event) => {
    if (event.target.closest('.bp-context')) return;
    event.preventDefault();
    hideMenu();
    const bounds = viewport.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const factor = Math.exp(-Math.max(-260, Math.min(260, delta)) * .00175);
    setZoom(zoom * factor, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  }, { passive: false });

  viewport.addEventListener('contextmenu', (event) => event.preventDefault());
  viewport.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.bp-context, .bp-overview') || pointer) return;
    hideMenu();
    const background = !event.target.closest('.bp-node, .bp-wire-hit, .bp-comment-head, .bp-comment-resize');
    const pan = event.button === 2 || event.button === 1 || event.button === 0 && (spaceHeld || event.pointerType === 'touch' && background);
    if (!pan && (event.button !== 0 || !background)) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    pointer = { kind: pan ? 'pan' : 'marquee', id: event.pointerId, button: event.button, target: event.target,
      x: event.clientX, y: event.clientY, camera: { ...camera }, start: worldPoint(event),
      initialSelection: new Set(selectedNodes), modifier: event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace',
    };
    if (pan) viewport.classList.add('is-panning');
    viewport.setPointerCapture(event.pointerId);
  });

  function movePointerSelection(positions) {
    for (const [id, next] of positions) {
      const view = nodeElements.get(id);
      if (!view) continue;
      Object.assign(view.style, { left: `${next.x}px`, top: `${next.y}px` });
      view.classList.add('is-moving');
    }
    updateWires(new Set(positions.keys()));
    redrawMinimap();
  }

  root.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.kind === 'pan') {
      const delta = { x: event.clientX - pointer.x, y: event.clientY - pointer.y };
      if (Math.hypot(delta.x, delta.y) > 3) pointer.moved = true;
      if (pointer.moved) {
        camera = { x: pointer.camera.x + delta.x, y: pointer.camera.y + delta.y };
        paintCamera();
      }
      return;
    }
    const point = worldPoint(event);
    const delta = { x: point.x - pointer.start.x, y: point.y - pointer.start.y };
    if (Math.hypot(delta.x * zoom, delta.y * zoom) > 4) pointer.moved = true;
    if (!pointer.moved) return;
    if (pointer.kind === 'marquee') {
      const stage = viewport.getBoundingClientRect();
      Object.assign(marquee.style, { left: `${Math.min(pointer.x, event.clientX) - stage.x}px`, top: `${Math.min(pointer.y, event.clientY) - stage.y}px`,
        width: `${Math.abs(pointer.x - event.clientX)}px`, height: `${Math.abs(pointer.y - event.clientY)}px` });
      marquee.hidden = false;
      pointer.rect = { x: Math.min(point.x, pointer.start.x), y: Math.min(point.y, pointer.start.y), width: Math.abs(delta.x), height: Math.abs(delta.y) };
      return;
    }
    if (pointer.kind === 'wire') {
      const firstMove = !pointer.point;
      pointer.point = point;
      if (firstMove && pointer.direction === 'out') {
        armed = pointer.socket;
        updateSelection();
      } else updateDraftWire();
      return;
    }
    if (pointer.kind === 'resize-comment') {
      pointer.size = { width: Math.max(190, snapValue(pointer.rectangle.width + delta.x)), height: Math.max(100, snapValue(pointer.rectangle.height + delta.y)) };
      const view = commentElements.get(pointer.comment.id);
      Object.assign(view.style, { width: `${pointer.size.width}px`, height: `${pointer.size.height}px` });
      return;
    }
    const primary = pointer.kind === 'comment' ? pointer.rectangle : pointer.initial.get(pointer.node.id);
    const next = snapPoint({ x: primary.x + delta.x, y: primary.y + delta.y });
    const translation = { x: next.x - primary.x, y: next.y - primary.y };
    pointer.positions = new Map([...pointer.initial].map(([id, start]) => [id, { x: start.x + translation.x, y: start.y + translation.y }]));
    if (pointer.kind === 'comment') {
      pointer.point = next;
      Object.assign(commentElements.get(pointer.comment.id).style, { left: `${next.x}px`, top: `${next.y}px` });
    }
    movePointerSelection(pointer.positions);
  });

  function endPointer(event, canceled) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const last = pointer;
    pointer = undefined;
    if (last.kind === 'pan') {
      viewport.classList.remove('is-panning');
      if (last.moved && canceled) { camera = last.camera; paintCamera(); }
      if (last.moved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
      } else if (!canceled && last.button === 2) {
        const node = last.target.closest('.bp-node');
        if (node?.dataset.nodeId && !selectedNodes.has(node.dataset.nodeId)) chooseNode(node.dataset.nodeId);
        showMenu(graphActions(last.start, last.target), { x: event.clientX, y: event.clientY });
      }
      return;
    }
    if (last.kind === 'marquee') {
      marquee.hidden = true;
      if (canceled) return;
      const ids = last.modifier === 'replace' ? new Set() : last.initialSelection;
      if (last.rect) for (const node of graph.nodes) {
        if (!intersects(rectForNode(node), last.rect)) continue;
        if (last.modifier === 'toggle' && ids.has(node.id)) ids.delete(node.id);
        else ids.add(node.id);
      }
      armed = undefined;
      chooseNodes([...ids]);
      return;
    }
    if (!last.moved) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (last.kind === 'wire') {
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const opposite = last.direction === 'out' ? 'in' : 'out';
      const target = under?.closest(`.bp-port[data-direction="${opposite}"]`);
      armed = undefined;
      updateSelection();
      if (!canceled && target && root.contains(target)) {
        if (last.direction === 'out') connect(last.socket, target.dataset.nodeId, target.dataset.port);
        else connect({ nodeId: target.dataset.nodeId, port: target.dataset.port }, last.socket.nodeId, last.socket.port);
      } else if (!canceled && under && viewport.contains(under) && !under.closest('.bp-node, .bp-wire-hit, .bp-overview, .bp-context')) {
        openPicker(last.point, last.socket, last.direction);
      } else if (!canceled) report('Choose a compatible port or release on the canvas to add a node.', false);
      return;
    }
    if (canceled) { render(); return; }
    if (last.kind === 'node' && !selectedNodes.has(last.node.id)) {
      selectedNodes = new Set([last.node.id]);
      selectedNode = last.node.id;
      selectedEdge = undefined;
      selectedComment = undefined;
    }
    const nodes = last.positions ? graph.nodes.map((node) => last.positions.has(node.id) ? { ...node, ...last.positions.get(node.id) } : node) : graph.nodes;
    const comments = last.comment ? graph.comments.map((item) => item.id === last.comment.id ? { ...item, ...(last.point || last.size) } : item) : graph.comments;
    save({ ...graph, nodes, comments });
  }

  root.addEventListener('pointerup', (event) => endPointer(event, false));
  root.addEventListener('pointercancel', (event) => endPointer(event, true));
  root.addEventListener('click', (event) => {
    if (!contextMenu.hidden && !event.target.closest('.bp-context') && event.target !== menuButton && event.target !== layouts) hideMenu();
  });

  function clearSpace(event) {
    if (!event || event.type === 'blur' || event.code === 'Space') {
      spaceHeld = false;
      viewport.classList.remove('is-space-pan');
    }
  }

  window.addEventListener('keyup', clearSpace);
  window.addEventListener('blur', clearSpace);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!contextMenu.hidden) { hideMenu(); viewport.focus(); }
      if (armed) { armed = undefined; updateSelection(); report('Connection canceled.', false); }
      if (root.classList.contains('is-focus-mode')) { root.classList.remove('is-focus-mode'); focusButton.textContent = 'Focus'; }
    }
    if (root.querySelector('dialog[open]') || isFormControl(event.target) || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (key === ' ' && (event.target === viewport || !event.target.closest('button, [role="button"]'))) {
      event.preventDefault();
      spaceHeld = true;
      viewport.classList.add('is-space-pan');
      return;
    }
    if (event.target === viewport && !command && !event.shiftKey) {
      const delta = { arrowleft: [70, 0], arrowright: [-70, 0], arrowup: [0, 70], arrowdown: [0, -70] }[key];
      if (delta) {
        event.preventDefault();
        camera = { x: camera.x + delta[0], y: camera.y + delta[1] };
        paintCamera();
      }
    }
    if (event.altKey) return;
    const shortcuts = {
      delete: removeSelection,
      n: () => openPicker(),
      c: () => addComment(),
      f: frameSelection,
      home: frameSelection,
      '0': resetView,
      '=': () => setZoom(zoom * 1.15),
      '-': () => setZoom(zoom / 1.15),
    };
    const commands = { a: () => chooseNodes(graph.nodes.map(({ id }) => id)), c: copySelection, d: duplicateSelection,
      f: showFinder, v: () => pasteSelection(), x: () => { copySelection(); removeSelection(); } };
    const action = (command ? commands : shortcuts)[key];
    if (action) { event.preventDefault(); action(); }
  });

  const observer = new ResizeObserver(() => { paintCamera(); updateWires(); });
  observer.observe(viewport);
  syncInspector();
  report('Right-drag to pan · Wheel to zoom · Left-drag to select · Alt+click a port to break its links.', false);
  render();

  function resetTrace() {
    visited.clear();
    faulted.clear();
    lastTrace = [];
    for (const view of nodeElements.values()) view.classList.remove('is-visited', 'is-faulted');
  }

  return {
    refresh() {
      if (updating) return;
      const next = getProject?.();
      if (next !== project && project?.graph !== next?.graph && !graph.nodes.some((node) => next?.graph?.nodes?.some(({ id }) => id === node.id))) {
        resetView();
        resetTrace();
      }
      project = next;
      graph = readGraph(project?.graph);
      selectedNodes = new Set([...selectedNodes].filter(locate));
      if (selectedNode && !locate(selectedNode)) selectedNode = [...selectedNodes].at(-1);
      if (selectedComment && !graph.comments.some(({ id }) => id === selectedComment)) selectedComment = undefined;
      if (selectedEdge && !graph.edges.some((edge) => edge.id === selectedEdge)) selectedEdge = undefined;
      if (armed && !locate(armed.nodeId)) armed = undefined;
      render({ keepFocus: true });
    },
    trace(detail) {
      if (!detail || typeof detail !== 'object') return;
      if (detail.nodeId && locate(detail.nodeId)) {
        visited.add(detail.nodeId);
        if (detail.level === 'error') faulted.add(detail.nodeId);
        nodeElements.get(detail.nodeId)?.classList.add('is-visited', ...(detail.level === 'error' ? ['is-faulted'] : []));
      }
      lastTrace = [...lastTrace.slice(-79), { nodeId: detail.nodeId, level: detail.level, phase: detail.phase, message: String(detail.message || '').slice(0, 600) }];
    },
    resetTrace,
    destroy() {
      observer.disconnect();
      window.removeEventListener('keyup', clearSpace);
      window.removeEventListener('blur', clearSpace);
      root.remove();
    },
  };
}
