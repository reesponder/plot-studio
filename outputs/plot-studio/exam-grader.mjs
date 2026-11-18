import { compileGraph } from './logic.mjs';
import { BLOCK_TYPES, createBlock, createEmptyProject, isDirectImageUrl } from './project.mjs';

export const examDefinitions = Object.freeze({
  builder: { title: 'PLOT Studio Certified Builder', amount: 8000, passScore: 80 },
  architect: { title: 'PLOT Studio Certified Workflow Architect', amount: 15000, passScore: 85 },
});

const array = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const bodyText = value => typeof value === 'string' ? value.trim() : '';
const key = value => bodyText(value).toLowerCase();
const safeId = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const validId = value => typeof value === 'string' && safeId.test(value);
const defaultText = new Set(['new heading', 'your headline', 'write your text.', 'learn more']);

function malformed(message) {
  return Object.assign(new Error(message), { status: 422 });
}

function limitProject(project) {
  let count = 0;
  const backlog = [[project, 0]];
  while (backlog.length) {
    const [value, depth] = backlog.pop();
    if (++count > 45000 || depth > 31) throw malformed('The project is too complex to assess.');
    if (value && typeof value === 'object') {
      const children = Object.values(value);
      if (count + children.length + backlog.length > 45000) throw malformed('The project is too complex to assess.');
      for (const entry of children) backlog.push([entry, depth + 1]);
    } else if (typeof value === 'number' && !Number.isFinite(value)) {
      throw malformed('The project contains an invalid number.');
    }
  }
}

export function validateExamProject(project) {
  if (!object(project) || project.version !== 1 || !bodyText(project.name) ||
      !Array.isArray(project.pages) || !project.pages.length || project.pages.length > 20 ||
      !Array.isArray(project.graph?.nodes) || !Array.isArray(project.graph?.edges) ||
      project.graph.nodes.length > 200 || project.graph.edges.length > 600) {
    throw malformed('Upload the editable .plot project file from PLOT Studio.');
  }
  limitProject(project);
  if (bodyText(project.settings?.customJs) || project.graph.nodes.some(node => node?.type === 'run-js')) {
    throw malformed('Use native PLOT Studio blocks and nodes for this assessment. Remove custom JavaScript and JavaScript nodes before submitting.');
  }
  const pages = new Map();
  const pageIds = new Set();
  const blockIds = new Set();
  for (const page of project.pages) {
    if (!object(page) || typeof page.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(page.slug) || !validId(page.id) ||
        pages.has(page.slug) || pageIds.has(page.id) || !Array.isArray(page.blocks)) {
      throw malformed('Each page needs a distinct slug and ID.');
    }
    pageIds.add(page.id);
    const blocks = [];
    const remaining = [...page.blocks].reverse();
    while (remaining.length) {
      const block = remaining.pop();
      if (!object(block) || !validId(block.id) || blockIds.has(block.id) ||
          typeof block.type !== 'string' || !Object.hasOwn(BLOCK_TYPES, block.type) || blockIds.size >= 600) {
        throw malformed('Project blocks must have unique IDs and supported types.');
      }
      blockIds.add(block.id);
      blocks.push(block);
      remaining.push(...array(block.children).slice().reverse());
    }
    pages.set(page.slug, { ...page, flat: blocks });
  }
  const nodes = project.graph.nodes;
  const nodeIds = new Set();
  for (const node of nodes) {
    if (!object(node) || !validId(node.id) || nodeIds.has(node.id) || typeof node.type !== 'string') {
      throw malformed('Blueprint nodes must have unique IDs and types.');
    }
    nodeIds.add(node.id);
  }
  for (const edge of project.graph.edges) {
    if (!object(edge) || !object(edge.from) || !object(edge.to) ||
        !nodeIds.has(edge.from.nodeId) || !nodeIds.has(edge.to.nodeId) ||
        typeof edge.from.port !== 'string' || typeof edge.to.port !== 'string') {
      throw malformed('Blueprint wires must connect existing node sockets.');
    }
  }
  return { pages, nodes, edges: project.graph.edges };
}

function useful(value) {
  const text = key(value);
  return text.length >= 3 && !defaultText.has(text);
}

function destination(href, pages) {
  const value = bodyText(href);
  if (value.startsWith('page:')) return Array.from(pages.values()).find(page => page.id === value.slice(5))?.slug;
  return /^\/?(?:\.\/)?(index|services|contact)\.html(?:#[a-z0-9-]+)?$/i.exec(value)?.[1]?.toLowerCase() ??
    (value === '/' ? 'index' : undefined);
}

function linkedPages(block, pages) {
  if (block.props?.autoLinks !== false) return Array.from(pages.keys());
  return bodyText(block.props?.links).split(/\r?\n/).flatMap(line => {
    const [label, href] = line.split('|');
    return useful(label) ? [destination(href, pages)] : [];
  });
}

function formFields(form) {
  const preset = form.props?.usePreset === false ? [] :
    bodyText(form.props?.fields ?? BLOCK_TYPES.form.defaults.fields).split(/\r?\n/).map(row => {
      const [label, type, required] = row.split('|').map(part => part.trim());
      return { label, name: key(label).replace(/[^a-z0-9]+/g, '-'), type: type || 'text',
        required: /^(yes|true|1|required)$/i.test(required || '') };
    });
  const remaining = array(form.children).slice();
  const explicit = [];
  while (remaining.length) {
    const child = remaining.pop();
    if (child.type === 'input') {
      explicit.push({ label: child.props?.label, name: child.props?.name,
        type: child.props?.kind, required: child.props?.required === true });
    } else if (child.type !== 'form') remaining.push(...array(child.children));
  }
  return [...preset, ...explicit];
}

function fieldsMatch(form, wanted) {
  const actual = formFields(form);
  return wanted.every(({ names, type }) => actual.some(field =>
    useful(field.label) && field.required && field.type === type && names.includes(key(field.name))));
}

const requiredPages = ['index', 'services', 'contact'];
const builderFields = [
  { names: ['name', 'full-name', 'full_name', 'fullname'], type: 'text' },
  { names: ['email', 'email-address', 'work-email'], type: 'email' },
  { names: ['message', 'enquiry', 'your-message'], type: 'textarea' },
];
const architectFields = [
  { names: ['email'], type: 'email' },
  { names: ['seats'], type: 'number' },
];

function wire(model, source, out, target, input) {
  return model.edges.some(edge => edge.from.nodeId === source.id &&
    edge.from.port === out && edge.to.nodeId === target.id && edge.to.port === input);
}

const active = node => !node.bypass && !node.disabled;

function statusNode(node, blocks) {
  const target = blocks.find(block => block.id === node.config?.target);
  return active(node) && node.type === 'set-text' &&
    ['text', 'heading', 'hero'].includes(target?.type) &&
    !['none', 'hidden'].includes(target.style?.display) && target.style?.visibility !== 'hidden' &&
    (!node.config?.valueMode || node.config.valueMode === 'literal') && useful(node.config?.value);
}

function canCompile(project) {
  try {
    const compiled = compileGraph(project.graph, project);
    return Boolean(compiled.code) && !compiled.diagnostics.some(item => item.severity === 'error');
  } catch {
    return false;
  }
}

function builderChecks(project, model) {
  const { pages, nodes } = model;
  const home = pages.get('index')?.flat || [];
  const contact = pages.get('contact')?.flat || [];
  const forms = contact.filter(block => block.type === 'form' && fieldsMatch(block, builderFields));
  const pageArchitecture = requiredPages.every(slug => {
    const headings = pages.get(slug)?.flat.filter(block =>
      block.type === 'hero' || block.type === 'heading' && block.props?.tag === 'h1') || [];
    return headings.length === 1 && useful(headings[0].props?.title || headings[0].props?.text);
  });
  const navigation = requiredPages.every(slug => {
    const links = pages.get(slug)?.flat.filter(block => block.type === 'nav')
      .flatMap(block => linkedPages(block, pages)) || [];
    return requiredPages.every(target => target === slug || links.includes(target));
  });
  const contactAction = home.some(block => {
    if (block.type === 'hero') return useful(block.props?.buttonText) && destination(block.props?.buttonLink, pages) === 'contact';
    return block.type === 'button' && useful(block.props?.text) && destination(block.props?.href, pages) === 'contact';
  });
  const mobileLayout = [...pages.values()].some(page => page.flat.some(block => {
    const smallGrid = key(block.styles?.mobile?.gridTemplateColumns).replace(/\s+/g, '');
    return block.type === 'columns' && array(block.children).length >= 2 &&
      /^(?:1fr|auto|minmax\(0,1fr\)|repeat\(1,1fr\))$/.test(smallGrid);
  }));
  const confirmation = forms.some(form => nodes.some(event =>
    active(event) && event.type === 'submit' && event.config?.target === form.id &&
    event.config.preventDefault !== false && nodes.some(node =>
      statusNode(node, contact.filter(target => !array(form.children).some(child => child.id === target.id))) &&
      wire(model, event, 'next', node, 'in')))) && canCompile(project);
  const accessibleImages = [...pages.values()].every(page => page.flat.every(block => {
    const src = block.type === 'image' ? block.props?.src : ['hero', 'card'].includes(block.type) ? block.props?.image : null;
    return !src || isDirectImageUrl(src) && useful(block.props?.alt);
  }));
  return [
    check('pages', 'Home, Services and Contact page slugs with one meaningful H1 per page.', 20, pageArchitecture, true),
    check('navigation', 'Navigation on each page reaches the other two pages.', 15, navigation),
    check('contact-cta', 'A named Home call to action opens Contact.', 10, contactAction),
    check('responsive-grid', 'A grid with at least two blocks uses one column on Phone.', 10, mobileLayout, true),
    check('contact-fields', 'The Contact form includes required labelled name, email and message fields.', 20, forms.length > 0, true),
    check('form-logic', 'Submitting the Contact form changes a status block without reloading.', 20, confirmation, true),
    check('images', 'Any standalone, hero or card images use a direct URL and meaningful alt text.', 5, accessibleImages),
  ];
}

function frontendWorkflow(project, model) {
  const { pages, nodes } = model;
  const requestPath = '/api/workshop-requests';
  return [...pages.values()].some(page => page.flat.some(form =>
    form.type === 'form' && fieldsMatch(form, architectFields) && nodes.some(event =>
      active(event) && event.type === 'submit' && event.config?.target === form.id &&
      event.config.preventDefault !== false && nodes.some(call => {
        if (!active(call) || call.type !== 'call-backend' || call.config?.path !== requestPath ||
            call.config?.method !== 'POST' || !wire(model, event, 'next', call, 'in') ||
            !wire(model, event, 'fields', call, 'body')) return false;
        const success = nodes.find(node => statusNode(node, page.flat) && wire(model, call, 'next', node, 'in'));
        const failure = nodes.find(node => statusNode(node, page.flat) && wire(model, call, 'fault', node, 'in'));
        return success && failure && success.id !== failure.id && key(success.config.value) !== key(failure.config.value);
      }))
  )) && canCompile(project);
}

function check(id, description, points, passed, mandatory = false) {
  return { id, description, points, passed: !!passed, mandatory };
}

export async function gradeExam(exam, project, evaluateBackend) {
  if (!Object.hasOwn(examDefinitions, exam)) throw new TypeError('Unknown assessment.');
  const model = validateExamProject(project);
  let checks;
  if (exam === 'builder') {
    checks = builderChecks(project, model);
  } else {
    const backend = await evaluateBackend({
      backend: project.backend ?? {},
      tables: array(project.data?.tables).filter(object).map(({ id, name, fields, permissions }) => ({ id, name, fields, permissions })),
    });
    checks = [
      check('private-schema', 'A private Workshop requests table defines required Email, Seats and Status fields.', 10, backend.privateSchema, true),
      check('create', 'Valid POST requests create real rows and return 201 with their IDs and statuses.', 10, backend.create, true),
      check('invalid-input', 'Bad email, missing fields and invalid seat counts are rejected before a write.', 15, backend.invalid, true),
      check('protected-read', 'An authorised lookup returns the correct row. Missing keys and unknown rows are rejected.', 15, backend.read, true),
      check('signed-webhook', 'A correctly HMAC-signed webhook updates the matching row and returns its public result.', 15, backend.signed, true),
      check('unauthorised-webhook', 'Missing or bad signatures and invalid signed statuses do not update any row.', 10, backend.rejected, true),
      check('replay', 'Replaying the signed callback leaves exactly one correctly updated request.', 15, backend.replay),
      check('form-backend', 'The form wires its Fields to the POST body and displays distinct success and error messages.', 10, frontendWorkflow(project, model), true),
    ];
  }
  const score = checks.reduce((sum, item) => sum + (item.passed ? item.points : 0), 0);
  const passScore = examDefinitions[exam].passScore;
  return { score, maxScore: 100, passScore, passed: score >= passScore && checks.every(item => !item.mandatory || item.passed), checks };
}

function opening(title, text, page) {
  return [
    createBlock('heading', { id: page + '-heading', props: { tag: 'h1', text: title } }),
    createBlock('text', { id: page + '-brief', props: { text } }),
  ];
}

export function starterProject(exam) {
  if (exam === 'builder') {
    const project = createEmptyProject('Studio Enquiry — Builder assessment');
    project.pages[0] = {
      id: 'page-assessment-home', slug: 'index', name: 'Home',
      blocks: opening('Your headline', 'Replace this placeholder with a clear introduction to your studio.', 'assessment-home'),
    };
    return project;
  }
  if (exam !== 'architect') return null;
  const project = createEmptyProject('Workshop Requests — Workflow Architect assessment');
  project.pages[0] = {
    id: 'page-assessment-workshop', slug: 'index', name: 'Workshop',
    blocks: opening('Workshop requests', 'Use this draft to build the intake form and its request workflows.', 'assessment-workshop'),
  };
  return project;
}
