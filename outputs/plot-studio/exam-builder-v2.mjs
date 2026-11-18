import { DATA_OPERATIONS, validateData } from './data.mjs';
import { validateExamProject } from './exam-grader.mjs';
import { compileGraph } from './logic.mjs';
import { FONT_OPTIONS, createBlock, createEmptyProject, deserializeProject, isDirectImageUrl, serializeProject } from './project.mjs';
import { builderV2Probes, enquiryFixtures, quoteFixtures } from './exam-builder-v2-probes.mjs';

const tasks = [
  ['structure', 'Build the three public pages', 'Build Home (index), Loans (services) and Enquiries (contact). Give each page one purposeful, distinct H1 and an H2 describing a major section. Explain how the library works on Home, what borrowers can choose on Loans, and what sending an enquiry does on Enquiries.', 4, true],
  ['journey', 'Design a complete borrowing journey', 'Give every page working navigation and footer links to the other two pages. Add a distinct primary action on Home that opens Enquiries in the same tab. Add a contextual link on Loans that goes to the Loan rules heading with the anchor loan-rules.', 4],
  ['comparison', 'Publish an accurate comparison', 'In a section with anchor service-comparison, use a native Table with a descriptive caption, distinct price and deposit columns, and two plans. Standard loan costs £24 per day with a £25 refundable deposit. Assisted pickup costs £42 per day with a £50 refundable deposit. Explain the refund policy in prose nearby.', 4],
  ['visual-system', 'Author and apply a visual system', 'Set the project body and heading fonts, H1 and H2 sizes, background, text colour and accent in the global design settings. Make the heading levels visually distinct. Choose a custom palette with readable body text and a contrasting accent on the page background.', 4],
  ['responsive', 'Recompose the comparison on phones', 'In service-comparison, use a native two-column layout to explain when to pick each loan. Keep both descriptions visible and readable, use two columns on desktop and stack them on phones. The page must fit at 390 px and 1440 px with no page-level sideways scrolling.', 5, true],
  ['media', 'Use informative images with alternatives', 'Use at least two different images across the site, drawn from direct HTTPS image URLs. Use native image fields and write meaningful alternative text describing each image. Use the images to explain the library, its tools or the pickup experience.', 4],
  ['keyboard', 'Keep the core journey keyboard usable', 'Use native interactive links and controls with visible labels. Make the Home enquiry action work with Enter and allow Tab to leave it. The Enquiries form must use native labels rather than placeholders alone.', 4],
  ['rules', 'Build a reversible rules panel', 'At loan-rules, make a button inside a rules-toggle section open and close a separate rules-panel section. Keep it hidden on initial load, show substantive policy copy when opened, and let a visitor close it again with the same button without changing pages.', 4],
  ['service-guide', 'Build a live service guide', 'Create a service-guide section with a dropdown named guide-service. Use option values standard and assisted and an empty initial choice. In service-instructions, invite a selection, then show collection advice for Standard and appointment advice for Assisted. Switching back must restore the correct advice.', 4],
  ['estimate-form', 'Build the indicative estimate form', 'Add a section with anchor estimate containing a native form with a visible title and description that identifies the quote as indicative. Use a required select named service (standard or assisted) and a required numeric field named days. Both start empty. Include labelled result regions estimate-hire, estimate-deposit, estimate-total and estimate-status.', 4],
  ['hire-estimate', 'Calculate hire charges across both plans', 'Use Blueprint to get the selected service and number of days from the form. Show the exact hire-only amount in GBP in estimate-hire using £24 or £42 per day. Correct results are required for different lengths, both loan choices and the seven-day boundary.', 4, true],
  ['quote-validation', 'Reject unusable loan lengths', 'Accept whole days from 1 through 7 only. Reject blank, zero, fractions and values above 7 using native feedback or a clear validation message in estimate-status. The result regions must stop showing a previous quote while the form holds an invalid value.', 5, true],
  ['deposit', 'Break down the checkout amount', 'Update estimate-deposit and estimate-total independently of the hire region. Label the deposit as refundable, apply the correct deposit for each plan and show the sum as the total due in GBP. Update all three amounts together after a valid submission.', 4],
  ['quote-reuse', 'Share the quotation as a named flow', 'Create one reusable Blueprint flow to calculate hire, deposit and due now from its input. Return a structured result. Call that same flow from the estimate submit workflow and from the enquiry submit workflow. Use the returned numeric values in the enquiry record.', 4],
  ['contact-form', 'Collect a complete enquiry', 'In a section with anchor enquiry, collect required name (name), email (email), message (message), loan choice (service) and loan duration (days). Use native text, email, multiline, select and number controls with meaningful labels. Accept valid addresses and loan lengths only. Keep a result region with anchor enquiry-status outside the submit button.', 4],
  ['data-model', 'Create a typed staff inbox', 'Create an Enquiries table with required fields Name (text), Email (email), Message (long text), Service (text), Days (integer), Hire charge (number), Deposit (number), Due now (number) and Status (text). Keep test rows out of the submitted project.', 4],
  ['data-privacy', 'Keep staff data private', 'Allow the public workflow to create records in Enquiries. Do not permit public list, read, update or delete operations. Keep borrower data out of public success messages and do not read from the inbox to build the confirmation.', 5, true],
  ['record-mapping', 'Write real, correctly typed enquiries', 'On a valid enquiry, send exactly one native Create record request containing the visitor’s entered values and numeric amounts derived from the shared flow. Store the exact service option value and the lower-case status new. Check the saved row in Data, not just the message on screen.', 4, true],
  ['receipt', 'Show the confirmed record reference', 'Show a success message in enquiry-status after a successful database write. Include the real identifier returned by Data and use distinct confirmation wording. Do not put the email or full message in the public receipt.', 4],
  ['database-failure', 'Recover from a rejected write', 'Build a separate failure route. If Data refuses a valid enquiry, show an error with a useful next step in enquiry-status, keep all entered values, and show no success reference. Test this by disabling create permission in a temporary preview copy and restore it for submission.', 5, true],
  ['repeat-guard', 'Prevent a duplicate enquiry', 'Protect a single submission against immediate repeats. Two submits in the same instant must leave one record. After one second the form must accept a newly completed enquiry without a reload. Test both behaviours against the staff inbox.', 4, true],
  ['form-lifecycle', 'Reset only after the record exists', 'After an accepted write, reset the contact form to its initial empty state and keep the reference visible. If the database rejects the write or the form is invalid, preserve the visitor’s work and do not reset.', 4],
  ['stale-quote', 'Invalidate a displayed quote on edit', 'When the visitor changes either days or service after a successful estimate, immediately remove the old numbers and tell the visitor an update is needed. Show the new amounts only after another valid submission, without refreshing the page.', 4],
  ['handoff', 'Hand off a maintainable .plot project', 'Name two Blueprint bookmarks so the quote and enquiry flows are easy to find. Label or comment the flow purpose, save the editable .plot project and re-import it once. Check that pages, graph, phone layout and staff table survived. Submit the .plot with no seed enquiries.', 4],
];

export const builderV2Brief = Object.freeze({
  title: 'Northline Tool Library',
  brief: 'Build the public borrowing site and staff intake for Northline Tool Library. Visitors compare two ways of borrowing, calculate an indicative charge, then send an enquiry the library can answer. Work in an editable .plot project using native Studio blocks, Blueprint and Data.',
  overview: 'Use the starter or begin with a blank project. Build and test in Preview and Data. The assessor opens your submitted site at desktop and phone widths and exercises it with fresh synthetic enquiries, invalid inputs, repeated submits and a rejected write. The site and its staff inbox run in isolation during marking.',
  standard: 'Pass at 80 out of 100 and pass every required check. Use the exact page slugs, anchor IDs and form field names given below so the assessor can find each surface. Write your own copy. Use native Studio controls and Blueprint nodes. Use a shareable .plot file with an empty inbox. No live endpoints or custom JavaScript are required.',
  sections: Object.freeze(['Build the public site', 'Build the interactive quote', 'Connect and protect enquiries', 'Test and hand off the project'].map(title => ({ title, count: 6 }))),
  tasks: Object.freeze(tasks.map(([, title, description, , required]) => [title, required ? `${description} This is a required check.` : description])),
});

export function builderV2Starter() {
  const project = createEmptyProject('Northline Tool Library');
  project.pages[0].blocks.push(
    createBlock('heading', { props: { tag: 'h1', text: 'Northline Tool Library' } }),
    createBlock('text', { props: { text: 'Replace this draft with your introduction to the library and build the next step for borrowers.' } }),
  );
  return project;
}

const stages = ['index', 'services', 'contact'];
const text = value => typeof value === 'string' ? value.trim() : '';
const lower = value => text(value).toLowerCase();
const array = value => Array.isArray(value) ? value : [];
const useful = (value, min = 4) => text(value).length >= min &&
  !/^(brand|learn more|your headline|new heading|write your text\.|image|photo|placeholder|field|todo)$/i.test(text(value));
const has = (value, pattern) => pattern.test(text(value));
const words = value => text(value).split(/\s+/).filter(Boolean).length;
const flatten = blocks => array(blocks).flatMap(block => [block, ...flatten(block.children)]);
const member = (blocks, anchor) => blocks.find(block => ['section', 'heading'].includes(block.type) && block.props?.anchor === anchor);
const inside = (blocks, anchor) => flatten(member(blocks, anchor)?.children);
const content = blocks => blocks.flatMap(block => ['text', 'callout', 'feature', 'card', 'heading'].includes(block.type) ? [block.props?.title, block.props?.text] : []).map(text).filter(Boolean).join(' ');
const cssBlock = id => id ? `[data-block-id="${id}"]` : '';
const statusPattern = /\b(?:thank you|thanks|reference|(?:enquiry|request|message|record)\s+(?:(?:was|has been)\s+)?(?:received|submitted|recorded|saved|sent|accepted)|(?:received|submitted|recorded|saved|accepted)\s+(?:your|this))\b/i;
const errorPattern = /\b(?:error|unable|failed|fault|could not|couldn’t|can't|cannot|try again|did not|didn.t)\b/i;
const quoteHint = /\b(?:recalculate|calculat\w*|estimate|updated?|chang\w*|choos\w*)\b/i;
const invalidHint = /\b(?:whole|integer|between|invalid|enter|requir\w*|valid|range|day|days|1\s*(?:to|through|–|-)\s*7)\b/i;

function destination(href, pages) {
  const value = text(href);
  if (value.startsWith('page:')) return [...pages.values()].find(page => page.id === value.slice(5))?.slug;
  if (value === '/') return 'index';
  return /^(?:\.\/|\/)?(index|services|contact)\.html(?:#[a-z0-9-]+)?$/i.exec(value)?.[1]?.toLowerCase();
}

const linkedPages = (block, pages) => block.props?.autoLinks !== false ? [...pages.keys()] : text(block.props.links).split(/\r?\n/).flatMap(line => {
  const [label, href] = line.split('|');
  return useful(label) ? [destination(href, pages)] : [];
});

function homeCTA(block, pages) {
  const props = block.props ?? {};
  if (props.newTab) return '';
  const candidates = {
    hero: [props.buttonText, props.buttonLink, `${cssBlock(block.id)} .ps-hero-copy > a`],
    button: [props.text, props.href, `a${cssBlock(block.id)}`],
  };
  const [label, href, selector] = candidates[block.type] ?? [];
  return useful(label, 6) && destination(href, pages) === 'contact' ? selector : '';
}

function inputFields(form) {
  if (!form) return [];
  const explicit = flatten(form.children).filter(block => ['input', 'select'].includes(block.type)).map(block => ({
    ...block.props,
    kind: block.type === 'select' ? 'select' : block.props?.kind,
    id: block.id,
  }));
  const presets = form.props?.usePreset === true ? text(form.props.fields).split(/\r?\n/).map(line => {
    const [label, kind, required] = line.split('|').map(text);
    return { label, kind, name: lower(label).replace(/[^a-z0-9]+/g, '-'), required: /^(?:yes|true|required|1)$/i.test(required) };
  }) : [];
  return [...explicit, ...presets];
}

function optionPair(props) {
  const entries = text(props?.options).split(/\r?\n/).map(line => line.split('|').map(text));
  return entries.some(([label, value]) => value === 'standard' && useful(label)) &&
    entries.some(([label, value]) => value === 'assisted' && useful(label)) && !text(props?.defaultValue);
}

function formValid(form, expectedFields) {
  const fields = inputFields(form);
  return !!form && useful(form.props?.title) && useful(form.props?.buttonText) && Object.entries(expectedFields).every(([name, kind]) => {
    const matches = fields.filter(field => field.name === name);
    const field = matches[0];
    return matches.length === 1 && field.kind === kind && field.required === true && useful(field.label) &&
      !text(field.defaultValue) && (kind !== 'select' || optionPair(field));
  });
}

function luminance(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) return NaN;
  const colorParts = color.slice(1).match(/.{2}/g).map(component => {
    const n = Number.parseInt(component, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return colorParts[0] * 0.2126 + colorParts[1] * 0.7152 + colorParts[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

function visualSystem(settings = {}) {
  const { font, headingFont, textColor, background, accent } = settings;
  const h1 = Number.parseFloat(settings.h1Size);
  const h2 = Number.parseFloat(settings.h2Size);
  return FONT_OPTIONS.includes(font) && FONT_OPTIONS.includes(headingFont) && h1 >= 32 && h1 <= 112 && h2 >= 22 && h1 >= h2 + 8 &&
    (lower(accent) !== '#181818' || lower(background) !== '#ffffff' || lower(textColor) !== '#181818') &&
    contrast(textColor, background) >= 4.5 && contrast(accent, background) >= 3;
}

function comparison(blocks) {
  const table = blocks.find(block => block.type === 'table');
  const headings = text(table?.props?.headers).split('|').map(text);
  const rate = headings.findIndex(heading => /price|rate|hire|per day|daily/i.test(heading));
  const deposit = headings.findIndex(heading => /deposit/i.test(heading));
  const rows = text(table?.props?.rows).split(/\r?\n/).map(line => line.split('|').map(text));
  return useful(table?.props?.caption, 8) && rate >= 0 && deposit >= 0 && rate !== deposit &&
    rows.some(row => /standard/i.test(row[0]) && pounds(row[rate], 24) && pounds(row[deposit], 25)) &&
    rows.some(row => /assisted/i.test(row[0]) && pounds(row[rate], 42) && pounds(row[deposit], 50)) &&
    /refundable|refund|returned/i.test(content(blocks));
}

const poundValues = value => [...text(value).matchAll(/£\s*(\d[\d,]*(?:\.\d+)?)/g)].map(match => Number(match[1].replaceAll(',', '')));
const pounds = (value, amount) => poundValues(value).includes(amount);
const dataFields = Object.freeze({
  name: ['Name', 'text'], email: ['Email', 'email'], message: ['Message', 'longText'], service: ['Service', 'text'],
  days: ['Days', 'integer'], hire: ['Hire charge', 'number'], deposit: ['Deposit', 'number'], due: ['Due now', 'number'], status: ['Status', 'text'],
});
function schema(project) {
  const tables = array(project.data?.tables);
  const matches = tables.filter(table => lower(table?.name) === 'enquiries');
  const table = matches.length === 1 ? matches[0] : null;
  const fields = {};
  if (table) for (const [key, [name, type]] of Object.entries(dataFields)) {
    const match = array(table.fields).filter(field => lower(field?.name) === lower(name) && field.type === type && field.required === true);
    if (match.length === 1) fields[key] = match[0].id;
  }
  return { table, fields, valid: !!table && Object.keys(fields).length === Object.keys(dataFields).length && validateData(project.data).length === 0 };
}

function connected(nodes, edges, origin, target) {
  const seen = new Set();
  const queue = origin ? [origin] : [];
  while (queue.length) {
    const id = queue.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of edges) {
      if (edge.from.nodeId === id && edge.to.port === 'in' && nodes.has(edge.to.nodeId)) queue.push(edge.to.nodeId);
    }
  }
  return false;
}

function reusedQuote(model, estimateForm, contactForm) {
  const nodes = model.nodes.filter(node => node.disabled !== true);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const submitOn = block => nodes.filter(node => node.type === 'submit' && node.config?.target === block?.id);
  const estimates = submitOn(estimateForm), enquiries = submitOn(contactForm);
  return nodes.filter(node => node.type === 'flow-entry' && useful(node.config?.name)).some(entry => {
    if (!nodes.some(node => node.type === 'return-value' && connected(byId, model.edges, entry.id, node.id))) return false;
    const callers = nodes.filter(node => node.type === 'call-flow' && node.config?.flow === entry.id &&
      model.edges.some(edge => edge.to.nodeId === node.id && edge.to.port === 'input') &&
      model.edges.some(edge => edge.from.nodeId === node.id && edge.from.port === 'result'));
    return callers.some(first => estimates.some(event => connected(byId, model.edges, event.id, first.id)) &&
      callers.some(second => first.id !== second.id && enquiries.some(event => connected(byId, model.edges, event.id, second.id))));
  });
}

function authoredImages(model) {
  const images = new Set();
  const add = (url, alt) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url) && isDirectImageUrl(url) && words(alt) >= 3 && !/^(?:an? )?(?:image|photo|picture)\s+(?:one|two|here|1|2)$/i.test(text(alt))) images.add(url);
  };
  for (const page of model.pages.values()) for (const block of page.flat) {
    const props = block.props ?? {};
    if (block.type === 'image') add(props.src, props.alt);
    if (['hero', 'card'].includes(block.type)) add(props.image, props.alt);
    if (block.type === 'gallery') for (const item of text(props.images).split(/\r?\n/)) add(...item.split('|').map(text));
  }
  return images.size >= 2;
}

const selectors = (snapshot, key) => snapshot?.selectors?.[key];
const getSnapshot = (browser, id, key = 'after') => browser[id]?.snapshots?.[key];
const language = (snapshot, key) => text(selectors(snapshot, key)?.text);
const visibleAmount = (snapshot, key, expected) => {
  const amounts = poundValues(language(snapshot, key));
  return selectors(snapshot, key)?.visible === true && amounts.length > 0 && amounts.every(value => value === expected);
};
const quoteClear = snapshot => !!snapshot && ['hire', 'deposit', 'total'].every(key =>
  selectors(snapshot, key)?.found && (!selectors(snapshot, key).visible || !poundValues(language(snapshot, key)).length));
const fits = (snapshot, expectedWidth) => Number.isFinite(snapshot?.width) && Number.isFinite(snapshot.scrollWidth) &&
  Math.abs(snapshot.width - expectedWidth) <= 1 && snapshot.scrollWidth <= expectedWidth + 1;
const grid = snapshot => text(selectors(snapshot, 'columns')?.gridColumns).split(/\s+/).filter(part => /^\d+(?:\.\d+)?px$/.test(part)).length;
const rowsAt = (snapshot, tableId) => array(snapshot?.rows?.[tableId]);
const createRequests = (snapshot, tableId) => array(snapshot?.requests).filter(request => request.operation === 'create' && request.table === tableId);
const valuesKept = (snapshot, data) => Object.keys(enquiryFixtures.invalid).every(name => selectors(snapshot, name)?.value === String(data[name]));
const valuesCleared = snapshot => Object.keys(enquiryFixtures.invalid).every(name => selectors(snapshot, name)?.value === '');

function looksLikeRecord(row, expected, fields) {
  return !!row && useful(row.id) && Object.keys(dataFields).every(key => row[fields[key]] === (key === 'status' ? 'new' : expected[key]));
}

function handoff(project, model, table) {
  const marks = array(project.graph.bookmarks);
  const quote = marks.find(mark => /quote|estimate/i.test(text(mark?.name)));
  const enquiry = marks.find(mark => /enquiry|enquiries|inquiry|inquiries|intake/i.test(text(mark?.name)));
  const usableMark = mark => !!mark && [mark.x, mark.y, mark.zoom].every(Number.isFinite) && mark.zoom > 0;
  if (!usableMark(quote) || !usableMark(enquiry) || quote.id === enquiry.id || !model.nodes.some(node =>
    node.type === 'flow-entry' && useful(node.config?.name, 8) || useful(node.label ?? node.comment, 15)) || !table || array(table.rows).length) return false;
  const copy = deserializeProject(serializeProject(project));
  return copy.pages.length === project.pages.length && copy.graph.nodes.length === model.nodes.length &&
    copy.graph.edges.length === model.edges.length && array(copy.graph?.bookmarks).length === marks.length &&
    copy.data.tables.some(item => item.id === table.id && item.rows.length === 0);
}

function browserProject(project) {
  // Preserve the submitted schema while preventing any existing records being read
  // by the submitted app. Browser runs also start independent of prior probes.
  const { backend: _backend, ...source } = project;
  return {
    ...source,
    settings: { ...source.settings, customJs: '', customCss: '' },
    data: { ...source.data, tables: array(source.data?.tables).map(table => ({ ...table, rows: [] })) },
  };
}

export async function gradeBuilderV2(project, _evaluateBackend, evaluateBrowser) {
  const model = validateExamProject(project);
  const { pages } = model;
  const page = slug => pages.get(slug)?.flat ?? [];
  const [home, services, contact] = stages.map(page);
  const comparisonContent = inside(services, 'service-comparison');
  const columns = comparisonContent.find(block => block.type === 'columns' &&
    array(block.children).length === 2 && array(block.children).every(child => words(content(flatten([child]))) >= 7));
  const cta = home.map(block => homeCTA(block, pages)).find(Boolean);
  const rulesHeading = member(services, 'loan-rules');
  const rulesPanel = member(services, 'rules-panel');
  const rulesButton = inside(services, 'rules-toggle').find(block => block.type === 'button' &&
    (!block.props?.href || block.props.href === '#') && useful(block.props?.text));
  const guideSelect = inside(services, 'service-guide').find(block => block.type === 'select' && block.props?.name === 'guide-service' &&
    useful(block.props.label) && optionPair(block.props));
  const estimateForm = inside(services, 'estimate').find(block => block.type === 'form');
  const contactForm = inside(contact, 'enquiry').find(block => block.type === 'form');
  const estimateNative = formValid(estimateForm, { service: 'select', days: 'number' }) &&
    /indicative|estimate|approximat/i.test(text(estimateForm?.props?.text)) &&
    ['estimate-hire', 'estimate-deposit', 'estimate-total', 'estimate-status'].every(anchor => member(services, anchor));
  const contactNative = formValid(contactForm, { name: 'text', email: 'email', message: 'textarea', service: 'select', days: 'number' }) &&
    !!member(contact, 'enquiry-status');
  const schemaResult = schema(project);
  const { table, fields } = schemaResult;
  const tableId = table?.id;
  const permissions = table?.permissions ?? {};
  const security = tableId && permissions.create === true && DATA_OPERATIONS.every(op => op === 'create' || permissions[op] === false);
  const assessmentProject = browserProject(project);
  const compiled = compileGraph(assessmentProject.graph, assessmentProject);
  const executable = !compiled.diagnostics.some(item => item.severity === 'error');
  const browserProbes = builderV2Probes({
    homeCTA: cta, columns: cssBlock(columns?.id), keyboard: contactNative,
    rules: executable && rulesButton && rulesPanel,
    serviceGuide: executable && guideSelect && member(services, 'service-instructions'),
    estimate: executable && estimateNative, contact: executable && contactNative,
  });
  if (browserProbes.length && typeof evaluateBrowser !== 'function') throw new TypeError('Builder assessment requires an isolated browser evaluator.');
  const browser = browserProbes.length ? await evaluateBrowser({ project: assessmentProject, probes: browserProbes }) : {};
  const snapshot = (id, key) => getSnapshot(browser ?? {}, id, key);
  const quotePrices = () => quoteFixtures.every(([id, , , hire]) => visibleAmount(snapshot(id), 'hire', hire));
  const quoteBreakdown = () => quoteFixtures.every(([id, , , hire, deposit]) => {
    const outcome = snapshot(id);
    return visibleAmount(outcome, 'hire', hire) && visibleAmount(outcome, 'deposit', deposit) &&
      /refund/i.test(language(outcome, 'deposit')) && visibleAmount(outcome, 'total', hire + deposit);
  });
  const records = ['standard', 'assisted'].map(id => {
    const after = snapshot(`enquiry-${id}`);
    const rows = rowsAt(after, tableId);
    return { before: snapshot(`enquiry-${id}`, 'before'), after, data: enquiryFixtures[id], rows };
  });
  const stored = () => schemaResult.valid && records.every(({ data, rows, after }) =>
    rows.length === 1 && looksLikeRecord(rows[0], data, fields) &&
    createRequests(after, tableId).filter(request => request.ok === true).length === 1);
  const failure = snapshot('enquiry-failure');
  const invalidEnquiry = snapshot('enquiry-invalid');
  const invalidDuration = snapshot('enquiry-invalid-duration');
  const policyText = content(flatten(rulesPanel?.children));
  const duplicateFirst = snapshot('enquiry-duplicate', 'first');
  const duplicateSecond = snapshot('enquiry-duplicate', 'second');
  const validQuote = snapshot('stale-quote', 'before');
  const changedDays = snapshot('stale-quote', 'changed-days');
  const changedService = snapshot('stale-quote', 'changed-service');
  const titleOf = block => text(block.type === 'hero' ? block.props?.title : block.props?.text);
  const pageTitles = stages.map(slug => page(slug).filter(block => block.type === 'hero' || (block.type === 'heading' && block.props?.tag === 'h1')));
  const headings = pageTitles.every(list => list.length === 1 && useful(titleOf(list[0]), 6)) &&
    new Set(pageTitles.flat().map(block => lower(titleOf(block)))).size === 3;
  const outcomes = {
    structure: pages.size === 3 && headings && stages.every(slug => page(slug).some(block =>
      block.type === 'heading' && block.props?.tag === 'h2' && useful(block.props.text, 6) ||
      ['form', 'gallery', 'faq'].includes(block.type) && useful(block.props?.title, 6))),
    journey: stages.every(slug => ['nav', 'footer'].every(type => page(slug).some(block => block.type === type &&
      stages.filter(other => other !== slug).every(other => linkedPages(block, pages).includes(other))))) &&
      snapshot('home-navigation')?.path === '/contact.html' && rulesHeading?.type === 'heading' &&
      services.some(block => ['link', 'button'].includes(block.type) && block.props?.href === '#loan-rules' && useful(block.props?.text)),
    comparison: comparison(comparisonContent),
    'visual-system': visualSystem(project.settings),
    responsive: [390, 1440].every(width => {
      const view = snapshot(`responsive-${width}`);
      return fits(view, width) && selectors(view, 'columns')?.visible && selectors(view, 'heading')?.visible &&
        selectors(view, 'table')?.visible && grid(view) === (width === 390 ? 1 : 2);
    }),
    media: authoredImages(model),
    keyboard: contactNative && selectors(snapshot('keyboard-navigation', 'moved'), 'cta')?.focused === false &&
      snapshot('keyboard-navigation')?.path === '/contact.html',
    rules: rulesHeading?.type === 'heading' && words(policyText) >= 15 &&
      ['before', 'opened', 'closed'].every(key => {
        const view = snapshot('loan-rules', key);
        const panel = selectors(view, 'panel');
        return view?.path === '/services.html' && panel?.found && panel.visible === (key === 'opened');
      }),
    'service-guide': ['before', 'standard', 'assisted', 'again'].every(key => {
      const view = snapshot('service-guide', key);
      const expected = key === 'before' ? /choos|select|pick/i : key === 'assisted' ? /appointment|book a time/i : /collect|pick.?up/i;
      return selectors(view, 'advice')?.visible && expected.test(language(view, 'advice'));
    }) && language(snapshot('service-guide', 'standard'), 'advice') !== language(snapshot('service-guide', 'assisted'), 'advice') &&
      language(snapshot('service-guide', 'standard'), 'advice') === language(snapshot('service-guide', 'again'), 'advice'),
    'estimate-form': estimateNative && selectors(snapshot('quote-empty', 'before'), 'service')?.valid === false &&
      selectors(snapshot('quote-empty', 'before'), 'days')?.valid === false && quoteClear(snapshot('quote-empty')),
    'hire-estimate': quotePrices(),
    'quote-validation': ['blank', 'zero', 'fraction', 'too-many'].every(key => {
      const id = `invalid-${key}`;
      const after = snapshot(id);
      return visibleAmount(snapshot(id, 'before'), 'hire', 72) && quoteClear(after) &&
        (selectors(after, 'days')?.valid === false ||
          selectors(after, 'status')?.visible && invalidHint.test(language(after, 'status')));
    }),
    deposit: quoteBreakdown(),
    'quote-reuse': reusedQuote(model, estimateForm, contactForm) && quotePrices() && stored(),
    'contact-form': contactNative && selectors(snapshot('enquiry-invalid', 'before'), 'name')?.valid === false &&
      selectors(invalidEnquiry, 'email')?.valid === false && !createRequests(invalidEnquiry, tableId).length &&
      !statusPattern.test(language(invalidEnquiry, 'status')) && !!invalidDuration &&
      !createRequests(invalidDuration, tableId).length && !statusPattern.test(language(invalidDuration, 'status')) &&
      (selectors(invalidDuration, 'days')?.valid === false || invalidHint.test(language(invalidDuration, 'status'))),
    'data-model': schemaResult.valid && !array(table?.rows).length,
    'data-privacy': security && records.every(({ after, data }) => !!after &&
      array(after.requests).every(request => request.operation === 'create') &&
      !language(after, 'status').includes(data.email) && !language(after, 'status').includes(data.message)),
    'record-mapping': stored(),
    receipt: records.every(({ before, after, data, rows }) => {
      const message = language(after, 'status');
      return !!rows[0]?.id && !statusPattern.test(language(before, 'status')) &&
        selectors(after, 'status')?.visible && statusPattern.test(message) &&
        message.includes(rows[0].id) && !message.includes(data.email) && !message.includes(data.message);
    }),
    'database-failure': stored() && !!failure && createRequests(failure, tableId).some(request => request.ok === false) &&
      !rowsAt(failure, tableId).length && selectors(failure, 'status')?.visible && errorPattern.test(language(failure, 'status')) &&
      !/\b(?:reference|accepted|saved successfully|sent successfully)\b/i.test(language(failure, 'status')) &&
      valuesKept(failure, enquiryFixtures.failure),
    'repeat-guard': !!duplicateFirst && !!duplicateSecond && rowsAt(duplicateFirst, tableId).length === 1 &&
      createRequests(duplicateFirst, tableId).length === 1 && rowsAt(duplicateSecond, tableId).length === 2 &&
      createRequests(duplicateSecond, tableId).length === 2 && [enquiryFixtures.standard, enquiryFixtures.assisted].every(data =>
        rowsAt(duplicateSecond, tableId).some(row => looksLikeRecord(row, data, fields))),
    'form-lifecycle': stored() && records.every(({ after }) => valuesCleared(after)) &&
      !!failure && valuesKept(failure, enquiryFixtures.failure) && valuesKept(invalidEnquiry, enquiryFixtures.invalid),
    'stale-quote': visibleAmount(validQuote, 'hire', 72) && quoteClear(changedDays) && quoteClear(changedService) &&
      selectors(changedDays, 'status')?.visible && selectors(changedService, 'status')?.visible &&
      quoteHint.test(language(changedDays, 'status')) && quoteHint.test(language(changedService, 'status')) &&
      visibleAmount(snapshot('stale-quote', 'updated'), 'hire', 96),
    handoff: handoff(project, model, table),
  };
  const checks = tasks.map(([id, description, , points, mandatory]) => ({ id, description, points, passed: !!outcomes[id], mandatory: !!mandatory }));
  const score = checks.reduce((sum, item) => item.passed ? sum + item.points : sum, 0);
  return { score, maxScore: 100, passScore: 80, passed: score >= 80 && checks.every(item => !item.mandatory || item.passed), checks };
}
