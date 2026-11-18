import {
  BLOCK_TYPES, PAGE_TEMPLATES, buildSite, buildSitePackage, createBlock, createEmptyProject, createId, createPageFromTemplate, createStarterProject,
  createZip, deserializeProject, googleFontStylesheet, renderDocument, serializeProject,
} from './project.mjs';
import { compileGraph, createStarterGraph, mountLogic } from './logic.mjs';
import { protectPlotProject, readPlotFile } from './plot-files.mjs';
import { mountInspector } from './inspector.mjs';
import { mountBackend, studioBackend } from './backend-editor.mjs';
import { mountRemoteProjects } from './remote-projects.mjs';
import { mountDataEditor } from './data-editor.mjs';
import { createDataField, createDataTable, executeDataQuery, normalizeData } from './data.mjs';
import { mountImageLibrary, uploadImageAsset } from './image-library.mjs';
import { canvasTransformBridge, canvasTransformPatch } from './canvas-transform.mjs';
import { mountBlockVariantPicker } from './block-variant-picker.mjs';
import { applyBlockVariant, BLOCK_VARIANTS, createVariantBlock } from './block-variants.mjs';
import { mountDockLayout } from './dock-layout.mjs';
import { mountPhoneFrame, phoneProfiles, phoneScale } from './phone-preview.mjs';
import { isCustomer, storageName, workspaceFetch } from './workspace-client.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const paths = {
  'chevron-down': 'm6 9 6 6 6-6', 'arrow-up': 'm6 14 6-6 6 6', 'arrow-down': 'm6 10 6 6 6-6',
  'dock-left': 'M3 5h18v14H3zM9 5v14M5.5 9h1M5.5 12h1M5.5 15h1',
  'dock-right': 'M3 5h18v14H3zM15 5v14M17.5 9h1M17.5 12h1M17.5 15h1',
  focus: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  layout: 'M3 4h18v16H3zM3 9h18M9 9v11', layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  pages: 'M8 3h8l4 4v13H8zM16 3v5h4M4 7v15h12', nodes: 'M3 3h6v6H3zM15 15h6v6h-6zM15 3h6v6h-6zM9 6h6M6 9v9h9',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18', play: 'm8 5 12 7-12 7z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4', upload: 'M12 16V4m-5 5 5-5 5 5M4 17v3h16v-3',
  plus: 'M12 5v14M5 12h14', save: 'M4 3h14l2 2v16H4zM8 3v6h8V3M8 21v-7h8v7', edit: 'm4 20 1-5L17 3l4 4L9 19zM15 5l4 4',
  undo: 'm8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12', redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  monitor: 'M3 4h18v12H3zM8 21h8m-4-5v5', tablet: 'M5 3h14v18H5zM11 18h2', mobile: 'M7 2h10v20H7zM11 19h2',
  globe: 'M3 12h18M12 3a9 9 0 1 0 0 18m0-18a9 9 0 1 1 0 18m0-18c-4 4-4 14 0 18m0-18c4 4 4 14 0 18',
  sliders: 'M6 3v5m0 4v9m6-18v9m0 4v5m6-18v2m0 4v12M3 8h6m0 8h6m0-10h6',
  keyboard: 'M2 6h20v12H2zM6 10h1m3 0h1m3 0h1m3 0h1M7 14h10', x: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6', reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  copy: 'M8 8h12v12H8zM4 16V4h12', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
  text: 'M4 6V4h16v2M12 4v16m-4 0h8', heading: 'M5 4v16M19 4v16M5 12h14', button: 'M3 7h18v10H3zM8 12h8',
  image: 'M3 4h18v16H3zM3 17l6-6 5 5 3-3 4 4M16 8h.01', section: 'M3 4h18v16H3zM3 8h18M3 16h18',
  columns: 'M3 4h18v16H3zM12 4v16', list: 'M8 5h12M8 12h12M8 19h12M4 5h.01M4 12h.01M4 19h.01',
  link: 'm10 13 4-4m-7 7-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m4 4a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2',
  form: 'M5 3h14v18H5zM8 7h8M8 11h8m-8 5h4', line: 'M3 12h18', spacer: 'M4 4h16M4 20h16m-8-4V8m-3 3 3-3 3 3',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  lock: 'M4 10h16v11H4zM8 10V7a4 4 0 1 1 8 0v3M12 14v3',
  database: 'M4 6a8 3 0 1 0 16 0A8 3 0 1 0 4 6ZM4 6v12a8 3 0 0 0 16 0V6M4 12a8 3 0 0 0 16 0',
  book: 'M12 6c-2-2-5-3-9-2v14c4-1 7 0 9 2 2-2 5-3 9-2V4c-4-1-7 0-9 2Zm0 0v14',
  server: 'M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6',
  brush: 'M14 12l6-6a2 2 0 0 0-3-3l-6 6m3 3-3-3m3 3-4 4m1-7-4 4m3 3c0 4-3 5-7 5 2-1 0-4 2-6l2-2',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.section}"></path></svg>`;
}

function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
}

const prioritized = ['heading', 'text', 'paragraph', 'button', 'image', 'section', 'container', 'columns', 'grid', 'hero', 'navbar', 'form', 'input', 'list', 'divider', 'spacer'];
const iconsByType = {
  heading: 'heading', h1: 'heading', h2: 'heading', h3: 'heading', text: 'text', paragraph: 'text', quote: 'text', button: 'button', buttonRow: 'button', image: 'image', gallery: 'image', video: 'play',
  grid: 'grid', columns: 'columns', nav: 'layout', navbar: 'layout', header: 'layout', footer: 'layout', list: 'list', link: 'link', form: 'form', input: 'form', select: 'list', toggle: 'button', audio: 'play', table: 'grid', progress: 'line', callout: 'text', contact: 'form',
  divider: 'line', spacer: 'spacer', faq: 'list', accordion: 'list', features: 'grid',
};

const storageKey = storageName('99host.plot-studio.project.v1');
const workingDraftPath = '/studio/api/working-draft';
let draftTag = '';
let draftBlocked = '';
let draftSaving = false;
let queuedDraft;
const devices = { desktop: { width: 1120, name: 'Desktop' }, tablet: { width: 820, name: 'Tablet' } };
const frame = $('#design-frame');
const previewFrame = $('#preview-frame');
const canvas = $('#canvas-viewport');
const previewDialog = $('#preview-dialog');
const canvasPhonePicker = $('#canvas-phone-picker');
const canvasPhoneSelect = $('#canvas-phone-model');
const previewDeviceSelect = $('#preview-device');
const canvasMount = $('#frame-mount');
const previewMount = $('#preview-artboard');
const canvasPhoneFrame = mountPhoneFrame($('#canvas-device-frame'), canvasMount, frame);
const previewPhoneFrame = mountPhoneFrame($('#preview-device-frame'), previewMount, previewFrame);
const phoneModelStorage = storageName('plot-studio.phone-model.v1');
let phoneModel = 'mobile';
try {
  const savedPhoneModel = localStorage.getItem(phoneModelStorage);
  if (Object.hasOwn(phoneProfiles, savedPhoneModel)) phoneModel = savedPhoneModel;
} catch {}
canvasPhoneSelect.value = phoneModel;
const canvasBrowserButton = $('#canvas-phone-browser');
const previewBrowserButton = $('#preview-phone-browser');
const editDialog = $('#edit-dialog');
const exportDialog = $('#export-dialog');
const themeDialog = $('#theme-dialog');
const libraryContent = $('#library-content');
const imageUrl = './assets/prog.webp';
const customCode = { 'custom.css': { key: 'customCss', label: 'Custom CSS' }, 'custom.js': { key: 'customJs', label: 'Custom JavaScript' } };
const themes = {
  editorial: { name: 'Editorial', headingFont: 'Instrument Serif', font: 'Inter', accent: '#244735', background: '#ffffff', textColor: '#20261f', size: 80 },
  studio: { name: 'Studio', headingFont: 'Space Grotesk', font: 'DM Sans', accent: '#3651ad', background: '#f9f9fc', textColor: '#1c2340', size: 72 },
  warmer: { name: 'Warm paper', headingFont: 'DM Serif Text', font: 'DM Sans', accent: '#983c25', background: '#fcf5ec', textColor: '#392519', size: 77 },
  plain: { name: 'Utility', headingFont: 'IBM Plex Sans', font: 'IBM Plex Sans', accent: '#262626', background: '#ffffff', textColor: '#1b1b1b', size: 63 },
  natural: { name: 'Field notes', headingFont: 'Bricolage Grotesque', font: 'Inter', accent: '#415520', background: '#f4f5e9', textColor: '#283024', size: 74 },
  manual: { name: 'Technical', headingFont: 'Geist', font: 'Geist', accent: '#273524', background: '#ffffff', textColor: '#202525', size: 61 },
};

function starter() {
  const initial = createStarterProject();
  initial.graph = createStarterGraph(initial);
  const example = initial.graph.nodes.find(node => node.id === 'logic-demo-result');
  if (example) example.config.value = 'Check-in starts at 3 pm. If you arrive earlier, reception can hold your luggage.';
  return initial;
}

const canonicalProject = value => Array.isArray(value)
  ? value.map(canonicalProject)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalProject(value[key])]))
    : value;

async function initialProject() {
  if (isCustomer) {
    try {
      const result = await workspaceFetch(workingDraftPath, { signal: AbortSignal.timeout(4000) });
      if (!result.ok) throw new Error('Cannot load the working draft');
      draftTag = result.headers.get('ETag') || '';
      const snapshot = await result.text();
      if (snapshot !== 'null') return deserializeProject(snapshot);
    } catch { draftBlocked = 'Draft unavailable. Reload or download your changes.'; }
    return starter();
  }
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch {}
  if (!saved) return starter();
  let current;
  try { current = deserializeProject(saved); } catch { return starter(); }
  if (current.name !== 'PRÓG — Architecture Studio' || !globalThis.crypto?.subtle) return current;
  try {
    const canonical = JSON.stringify(canonicalProject(current));
    const sum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const id = Array.from(new Uint8Array(sum), value => value.toString(16).padStart(2, '0')).join('');
    if (id !== 'b3751369299bef25e21a1b100fc52482120f436bf59f95a3a958b6d2e60d6236' &&
        id !== '9e1af26299baa83f36ffa1b8c68e1b6d8b4784dae500a677661731e421dfc3b0') return current;
    const replacement = starter();
    localStorage.setItem(storageKey + '.previous-starter', saved);
    localStorage.setItem(storageKey, serializeProject(replacement));
    return replacement;
  } catch { return current; }
}

function databaseDemo() {
  const demo = createEmptyProject('Fieldwork — Contact Inbox');
  const home = demo.pages[0];
  home.blocks = [
    createBlock('nav', { props: { brand: 'Fieldwork' } }),
    createBlock('section', { children: [
      createBlock('heading', { props: { text: 'Let’s talk.', tag: 'h1' } }),
      createBlock('text', { props: { text: 'Tell us what you’re working on and how we can help.' } }),
      createBlock('form', { id: 'inbox-form', props: { title: '', text: '', fields: 'Name | text | yes\nEmail | email | yes\nMessage | textarea | yes', buttonText: 'Send message' } }),
      createBlock('text', { id: 'inbox-status', props: { text: 'You’ll see a confirmation here after you send your message.' }, style: { color: '#49672b' } }),
    ] }),
    createBlock('footer', { props: { brand: 'Fieldwork', text: 'Independent Project Studio' } }),
  ];
  const inbox = createDataTable('Inbox');
  const columns = [['name', 'Name', 'text'], ['email', 'Email', 'email'], ['message', 'Message', 'longText']];
  inbox.id = 'inbox';
  inbox.fields = columns.map(([id, name, type]) => ({ ...createDataField(name, type, true), id: `inbox-${id}` }));
  inbox.permissions.create = true;
  demo.data = { tables: [inbox] };
  executeDataQuery(demo.data, { operation: 'create', table: 'inbox', data: { 'inbox-name': 'Alex Example', 'inbox-email': 'alex@example.com', 'inbox-message': 'Can we discuss a new site next week?' } }, { enforcePermissions: false });
  demo.graph = {
    nodes: [
      { id: 'inbox-submit', type: 'submit', x: 46, y: 146, config: { target: 'inbox-form', preventDefault: true } },
      { id: 'inbox-transform', type: 'map-object-fields', label: 'Map form fields to Inbox', x: 318, y: 146, config: { mapping: JSON.stringify({ 'inbox-name': 'name', 'inbox-email': 'email', 'inbox-message': 'message' }) } },
      { id: 'inbox-write', type: 'db-create', x: 600, y: 146, config: { table: 'inbox' } },
      { id: 'inbox-success', type: 'set-text', x: 882, y: 45, config: { target: 'inbox-status', value: 'Thanks. Your message was saved.' } },
      { id: 'inbox-error', type: 'set-text', x: 882, y: 266, config: { target: 'inbox-status', value: 'The message could not be saved. Try again.' } },
    ],
    edges: [
      ['inbox-submit', 'next', 'inbox-transform', 'in'], ['inbox-submit', 'fields', 'inbox-transform', 'input'],
      ['inbox-transform', 'next', 'inbox-write', 'in'], ['inbox-transform', 'result', 'inbox-write', 'data'],
      ['inbox-write', 'next', 'inbox-success', 'in'], ['inbox-write', 'fault', 'inbox-error', 'in'],
      ['inbox-transform', 'fault', 'inbox-error', 'in'],
    ].map(([from, output, to, input], index) => ({ id: `inbox-wire-${index}`, from: { nodeId: from, port: output }, to: { nodeId: to, port: input } })),
    comments: [{ id: 'inbox-flow', x: 24, y: 100, width: 818, height: 306, title: 'Collect, map, and store a submission', color: 'teal' }],
  };
  return demo;
}

let project = await initialProject();
let pageId = project.pages[0].id;
let blockId = null;
let device = matchMedia('(max-width: 635px)').matches ? 'mobile' : 'desktop';
let mode = 'design';
let library = 'blocks';
let libraryFilter = '';
let activeCode = 'index.html';
let files = {};
let previewPageId;
let previewAnchor = '';
let previewDatabase;
let previewDatabaseChanged = false;
let dragType;
let dragBlockId;
let pendingAssetPlacement = null;
const dockLayout = mountDockLayout($('#design-workspace'));
let lastChangeKey;
let lastChangeTime;
let saveTimer;
let renderTimer;
let toastTimer;
let demoAsset;
let editAction;
const undoStack = [];
const redoStack = [];

function page() { return project.pages.find((item) => item.id === pageId) || project.pages[0]; }

function locate(blocks, id, parent = null) {
  for (const [index, block] of blocks.entries()) {
    if (block.id === id) return { block, index, siblings: blocks, parent };
    const found = block.children && locate(block.children, id, block);
    if (found) return found;
  }
  return null;
}

function walk(blocks) {
  return blocks.flatMap((block) => [block, ...walk(block.children || [])]);
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function textPreview(block) {
  const value = block.props?.text || block.props?.content || block.props?.title || block.props?.heading || block.props?.label || block.props?.brand;
  return typeof value === 'string' ? value.split('\n')[0].slice(0, 60) : '';
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast-text').textContent = typeof message === 'string' ? message : message?.message || '';
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2600);
}

function drawSaved(label, state = 'good') {
  const indicator = $('#saved-status');
  indicator.dataset.state = state;
  indicator.lastElementChild.textContent = label;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (isCustomer) {
    queuedDraft = serializeProject(project);
    void saveWorkingDraft();
    return;
  }
  try {
    localStorage.setItem(storageKey, serializeProject(project));
    drawSaved('Saved locally');
  } catch {
    drawSaved('Save a project file', 'error');
  }
}

async function saveWorkingDraft() {
  if (draftBlocked || !draftTag) { drawSaved(draftBlocked || 'Save a project file', 'error'); return; }
  if (draftSaving || !queuedDraft) return;
  const body = queuedDraft;
  queuedDraft = undefined;
  draftSaving = true;
  try {
    const result = await workspaceFetch(workingDraftPath, { method: 'PUT', body,
      headers: { 'Content-Type': 'application/json', 'If-Match': draftTag }, signal: AbortSignal.timeout(15000) });
    if (result.status === 409) draftBlocked = 'Draft changed in another tab. Reload or download your changes.';
    if (!result.ok) throw new Error('Could not save working draft');
    draftTag = result.headers.get('ETag') || '';
    if (!queuedDraft) drawSaved('Saved to workspace');
  } catch { drawSaved(draftBlocked || 'Draft not saved. Download a copy.', 'error'); }
  finally { draftSaving = false; if (queuedDraft && !draftBlocked) void saveWorkingDraft(); }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  drawSaved('Saving…', 'pending');
  saveTimer = setTimeout(persist, 300);
}

function tidySelection() {
  pageId = page().id;
  if (blockId && !locate(page().blocks, blockId)) blockId = null;
}

function change(mutator, options = {}) {
  const before = serializeProject(project);
  mutator(project);
  if (before === serializeProject(project)) return;
  const key = options.coalesceKey;
  if (!key || key !== lastChangeKey || Date.now() - lastChangeTime > 1400) {
    undoStack.push(before);
    if (undoStack.length > 35) undoStack.shift();
  }
  lastChangeKey = key;
  lastChangeTime = Date.now();
  redoStack.length = 0;
  tidySelection();
  scheduleSave();
  render({ skipInspector: options.source === 'inspector', skipLogic: options.source === 'logic', skipData: options.source === 'data', skipCode: options.source === 'code', skipBackend: options.source === 'backend' });
}

function restore(from, to) {
  if (!from.length) return;
  to.push(serializeProject(project));
  project = deserializeProject(from.pop());
  lastChangeKey = null;
  tidySelection();
  scheduleSave();
  render();
}

const inspector = mountInspector($('#inspector'), {
  hasVariants: (type) => Boolean(BLOCK_VARIANTS[type]?.length),
  getProject: () => project,
  getSelection: () => ({ pageId, blockId }),
  getDevice: () => device,
  onChange: change,
  onImageLibrary: target => imageLibrary.open(target),
});

const logic = mountLogic($('#logic'), {
  getProject: () => project,
  onChange: (graph) => change((draft) => { draft.graph = graph; }, { source: 'logic' }),
  onStatus: notify,
  onPreview: () => openPreview(),
  onUndo: () => restore(undoStack, redoStack),
  onRedo: () => restore(redoStack, undoStack),
});

const dataEditor = mountDataEditor($('#data-editor'), { getProject: () => project, onChange: change, onStatus: notify });
const backendEditor = mountBackend($('#backend-editor'), {
  getProject: () => project,
  getServerProject: () => remoteProjects.getBinding(),
  saveServerProject: () => remoteProjects.save(),
  onChange: change,
  onStatus: notify,
});
const imageLibrary = mountImageLibrary($('#image-library'), { useAsset: addAssetToPage, editAsset: editLibraryImage, placeAsset: startAssetPlacement });
const variantPicker = mountBlockVariantPicker({
  getProject: () => project,
  onInsert: (type, variantId) => {
    const preset = createVariantBlock(type, variantId);
    if (!preset) return;
    frameRevealId = insert(type, false, blockId, 'after', preset);
    dockLayout.closeOverlay();
  },
  onApply: (type, variantId, targetId) => {
    const active = locate(page().blocks, targetId);
    if (active?.block.type !== type) return;
    change(() => applyBlockVariant(active.block, variantId));
    notify(`${BLOCK_TYPES[type].label} variant applied`);
  },
});
let paintEditor;
let loadingPaint;

function loadPaint() {
  loadingPaint ||= import('./paint-editor.mjs').then(({ mountPaintEditor }) => {
    paintEditor = mountPaintEditor($('#paint-editor'), { saveAsset: uploadImageAsset, useAsset: addAssetToPage,
      chooseReferenceAsset: imageLibrary.openForReference, notify });
    return paintEditor;
  }).catch(error => {
    loadingPaint = null;
    throw error;
  });
  return loadingPaint;
}

async function editLibraryImage(file, filename) {
  const paint = await loadPaint();
  setMode('paint');
  await paint.open();
  await paint.openImage(file, filename);
}

function addAssetToPage(asset, target = null) {
  if (target) {
    const destination = project.pages.find(item => item.id === target.pageId);
    const entry = destination && locate(destination.blocks, target.blockId)?.block;
    if (!entry || !Object.hasOwn(entry.props, target.key)) return false;
    change(() => {
      if (target.multiple) {
        const lines = String(entry.props[target.key] || '').split(/\r?\n/).filter(line => line.trim());
        const description = asset.alt?.replace(/[\r\n|]+/g, ' ').trim();
        const image = description ? `${asset.url} | ${description}` : asset.url;
        if (!lines.some(line => line.split('|')[0].trim() === asset.url)) entry.props[target.key] = [...lines, image].join('\n');
      } else {
        entry.props[target.key] = asset.url;
        if (asset.alt && ['src', 'image'].includes(target.key) && Object.hasOwn(entry.props, 'alt') && !entry.props.alt) {
          entry.props.alt = asset.alt;
        }
      }
    });
    inspector.refresh(true);
    notify('Image applied to the selected field.');
  } else {
    setMode('design');
    frameRevealId = insert('image', false, blockId, 'after', { props: { src: asset.url, alt: asset.alt || '' } });
  }
  return true;
}

function updateAssetPlacement() {
  const active = Boolean(pendingAssetPlacement);
  $('#canvas-place-tools').hidden = !active;
  $('#canvas-count').hidden = active;
  $('.canvas-scale').hidden = active;
  canvas.classList.toggle('is-placing-asset', active);
  frame.contentWindow?.postMessage({ source: 'plot-studio', type: 'asset-placement', active }, '*');
}

function startAssetPlacement(asset) {
  setMode('design');
  dockLayout.closeOverlay();
  pendingAssetPlacement = asset;
  updateAssetPlacement();
  $('[data-command="cancel-asset-placement"]').focus();
  return true;
}

function cancelAssetPlacement() {
  if (!pendingAssetPlacement) return false;
  pendingAssetPlacement = null;
  updateAssetPlacement();
  return true;
}

function blockOptions() {
  const entries = Object.entries(BLOCK_TYPES);
  return entries.filter(([type, item]) => `${item.label} ${item.category} ${type}`.toLowerCase().includes(libraryFilter.toLowerCase()));
}

function libraryBlockList() {
  const options = blockOptions();
  if (!options.length) return '<p class="library-hint">No matching elements.</p>';
  const groups = new Map();
  const essentials = new Set();
  if (!libraryFilter) {
    for (const id of prioritized) if (options.some(([type]) => id === type) && essentials.size < 8) essentials.add(id);
    if (essentials.size) groups.set('Essentials', [...essentials].map((id) => [id, BLOCK_TYPES[id]]));
  }
  for (const [type, definition] of options) {
    if (essentials.has(type)) continue;
    const label = definition.category || 'Other';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push([type, definition]);
  }
  return [...groups].map(([name, entries]) => `<section class="block-group"><h3>${esc(name)}</h3><div class="block-grid">${entries.map(([type, item]) => `<div class="block-card-pair"><button type="button" class="block-card" draggable="true" data-add-block="${esc(type)}" title="Add ${esc(item.label)}">${icon(iconsByType[type])}<span>${esc(item.label)}</span></button>${BLOCK_VARIANTS[type]?.length ? `<button type="button" class="block-card-variants" data-block-variants="${esc(type)}" aria-label="Browse ${esc(item.label)} variants">${BLOCK_VARIANTS[type].length}<span aria-hidden="true"> styles</span></button>` : ''}</div>`).join('')}</div></section>`).join('');
}

function layerRows(blocks, depth = 0) {
  return blocks.map((item) => `<div class="layer-branch" style="--layer-depth:${depth}"><button type="button" class="list-row" draggable="true" data-select-block="${esc(item.id)}" aria-pressed="${item.id === blockId}">${icon(iconsByType[item.type])}<span>${esc(BLOCK_TYPES[item.type]?.label || item.type)}${textPreview(item) ? `<small>${esc(textPreview(item))}</small>` : ''}</span></button></div>${item.children?.length ? layerRows(item.children, depth + 1) : ''}`).join('');
}

function renderLibrary() {
  $$('[data-library]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.library === library)));
  for (const [key, name] of [['blocks', 'Elements'], ['layers', 'Layers'], ['pages', 'Pages']]) {
    if (library !== key) continue;
    const current = libraryContent.querySelector('[data-lib-view]');
    if (current?.dataset.libView === key && key === 'blocks') return;
    const views = {
      blocks: `<div class="library-head"><h2>${name}</h2><button class="library-variants" type="button" data-command="browse-variants">${icon('grid')} Variants</button></div><label class="block-search">${icon('search')}<input type="search" id="block-search" aria-label="Search elements" placeholder="Find an element" value="${esc(libraryFilter)}"></label><div id="block-results">${libraryBlockList()}</div>`,
      layers: `<div class="library-head"><h2>${name}</h2><button type="button" class="icon-button" data-command="deselect" aria-label="Page settings" title="Page settings">${icon('sliders')}</button></div><div class="side-list">${layerRows(page().blocks) || '<p class="library-hint">Add an element to start.</p>'}</div>${blockId ? `<div class="layer-actions"><button class="icon-button" type="button" data-command="move-up" title="Move up" aria-label="Move up">${icon('arrow-up')}</button><button class="icon-button" type="button" data-command="move-down" title="Move down" aria-label="Move down">${icon('arrow-down')}</button><button class="icon-button" type="button" data-command="duplicate-block" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button><button class="icon-button" type="button" data-command="delete-block" title="Delete element" aria-label="Delete element">${icon('trash')}</button></div>` : ''}`,
      pages: `<div class="library-head"><h2>${name}</h2><button class="icon-button" type="button" data-command="add-page" title="Add page" aria-label="Add page">${icon('plus')}</button></div><div class="side-list">${project.pages.map((item) => `<div class="page-row"><button type="button" class="list-row" aria-pressed="${item.id === pageId}" data-select-page="${esc(item.id)}">${icon('pages')}<span>${esc(item.name)}<small>${esc(item.slug === 'index' ? '/' : `/${item.slug}.html`)}</small></span></button><button type="button" class="icon-button page-edit" data-edit-page="${esc(item.id)}" aria-label="Edit ${esc(item.name)}" title="Edit page">${icon('edit')}</button></div>`).join('')}</div><div class="page-tools"><button class="ui-button quiet" type="button" data-command="add-page">${icon('plus')} Add page</button>${project.pages.length > 1 && page().slug !== 'index' ? `<button class="icon-button" type="button" data-command="delete-page" title="Delete current page" aria-label="Delete current page">${icon('trash')}</button>` : ''}</div>`,
    };
    const oldScroll = libraryContent.scrollTop;
    libraryContent.innerHTML = `<div data-lib-view="${key}">${views[key]}</div>`;
    libraryContent.scrollTop = current?.dataset.libView === key ? oldScroll : 0;
  }
}

function updatePageSelect(select, selected) {
  const markup = project.pages.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  if (select.innerHTML !== markup) select.innerHTML = markup;
  select.value = selected;
}

function updateToolbar() {
  $('#project-name').textContent = project.name;
  $('[data-command="undo"]').disabled = !undoStack.length;
  $('[data-command="redo"]').disabled = !redoStack.length;
  updatePageSelect($('#page-picker'), pageId);
  const selected = locate(page().blocks, blockId)?.block;
  const count = walk(page().blocks).length;
  $('#artboard-path').textContent = page().slug === 'index' ? '/' : `/${page().slug}.html`;
  $('#artboard-device').textContent = device === 'mobile' ? phoneProfiles[phoneModel].name : devices[device].name;
  $$('[data-device]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.device === device)));
  $('#canvas-context').textContent = selected ? `${page().name} / ${BLOCK_TYPES[selected.type]?.label || selected.type}` : page().name;
  $('#canvas-count').textContent = `${count} ${count === 1 ? 'element' : 'elements'}`;
}

function fitCanvas() {
  if (mode !== 'design') return;
  const fullWidth = canvas.clientWidth;
  if (!fullWidth) return;
  const chrome = $('#artboard-chrome');
  const mobile = device === 'mobile';
  chrome.hidden = mobile;
  canvasPhonePicker.hidden = !mobile;
  if (mobile) {
    const profile = phoneProfiles[phoneModel];
    const availableWidth = fullWidth - 28;
    const availableHeight = canvas.clientHeight - canvasPhonePicker.offsetHeight - 42;
    const ratio = canvasScale === 'fit' ? phoneScale(profile, availableWidth, availableHeight) : Number(canvasScale);
    if (ratio <= 0) return;
    const height = canvasPhoneFrame.set(phoneModel, ratio, canvasBrowserButton.getAttribute('aria-pressed') === 'true', $('#artboard-path').textContent);
    $('#canvas-phone-viewport').textContent = `${profile.width} × ${height}`;
    updateCanvasScale(profile.width, ratio);
    return;
  }
  canvasPhoneFrame.reset();
  const ideal = devices[device].width;
  const fitted = Math.min(ideal, fullWidth - (fullWidth < 580 ? 24 : 52));
  const visible = canvasScale === 'fit' ? fitted : Math.round(ideal * Number(canvasScale));
  if (visible < 1) return;
  const ratio = visible / ideal;
  const height = Math.max(300, canvas.clientHeight - 75);
  chrome.style.width = `${visible}px`;
  canvasMount.style.width = `${visible}px`;
  canvasMount.style.height = `${height}px`;
  frame.style.width = `${ideal}px`;
  frame.style.height = `${height / ratio}px`;
  frame.style.transform = `scale(${ratio})`;
  updateCanvasScale(ideal, ratio);
}

function updateCanvasScale(width, ratio) {
  $('#canvas-width').textContent = `${width} px`;
  $('#canvas-scale option[value="fit"]').textContent = canvasScale === 'fit' ? `Fit · ${Math.round(ratio * 100)}%` : 'Fit';
  canvasZoom = ratio;
  syncCanvasTransform();
}

function choosePhoneModel(value) {
  if (!Object.hasOwn(phoneProfiles, value)) return;
  phoneModel = value;
  canvasPhoneSelect.value = value;
  try { localStorage.setItem(phoneModelStorage, value); } catch {}
}

let canvasScale = 'fit';
let canvasZoom = 1;
let canvasHandles = true;
let canvasHandleFocus = '';
const transformBridgeSource = canvasTransformBridge();

function syncCanvasTransform(focus = '') {
  frame.contentWindow?.postMessage({
    source: 'plot-studio', type: 'canvas-transform-state', enabled: canvasHandles,
    zoom: canvasZoom, context: { pageId, device }, focus,
  }, '*');
}

const childBridge = (design) => `<script>(()=>{
  const design=${design};
  const send=(type,data={})=>parent.postMessage({source:'plot-preview',type,...data},'*');
  const transforms=${design ? transformBridgeSource : 'null'};
  const editKeys={heading:'text',text:'text',button:'text',quote:'text',code:'code',hero:'title',card:'title',feature:'title',pricing:'title',gallery:'title',faq:'title',form:'title',footer:'text'};
  let dropTarget;
  const scrollAnchor=value=>{
    if(!value)return;
    let target=value;
    try{target=decodeURIComponent(value);}catch{}
    document.getElementById(target)?.scrollIntoView({block:'start'});
  };
  if(!design){
    globalThis.__plotStudioTraceEnabled=true;
    let backendSerial=0;
    const backendWaiters=new Map();
    globalThis.plotBackend=Object.freeze({request(path,options={}){
      const id=++backendSerial;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{backendWaiters.delete(id);reject(new Error('The backend preview timed out.'));},26000);
        backendWaiters.set(id,{resolve,reject,timer});
        send('backend-request',{id,request:{...options,path}});
      });
    }});
    addEventListener('message',event=>{
      if(event.source!==parent||event.data?.source!=='plot-studio'||event.data.type!=='backend-result')return;
      const entry=backendWaiters.get(event.data.id);
      if(!entry)return;
      backendWaiters.delete(event.data.id);
      clearTimeout(entry.timer);
      if(event.data.ok)entry.resolve(event.data.result);else entry.reject(new Error(event.data.message));
    });
    let sequence=0;
    const waiters=new Map();
    globalThis.plotData=Object.freeze({query(operation){
      const id=++sequence;
      return new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{waiters.delete(id);reject(new Error('Preview database timed out.'));},4000);
        waiters.set(id,{resolve,reject,timeout});
        send('data-query',{id,operation});
      });
    }});
    addEventListener('message',event=>{
      if(event.source!==parent||event.data?.source!=='plot-studio'||event.data.type!=='data-result')return;
      const pending=waiters.get(event.data.id);
      if(!pending)return;
      waiters.delete(event.data.id);
      clearTimeout(pending.timeout);
      if(event.data.ok)pending.resolve(event.data.result);
      else pending.reject(Object.assign(new Error(event.data.message),{code:event.data.code}));
    });
    addEventListener('error',event=>{if(event.message)send('trace',{level:'error',message:event.message});});
    addEventListener('unhandledrejection',event=>send('trace',{level:'error',message:String(event.reason?.message||event.reason)}));
    addEventListener('plot:trace',event=>send('trace',{level:event.detail?.level,message:event.detail?.message,nodeId:event.detail?.nodeId,phase:event.detail?.phase}));
    document.addEventListener('securitypolicyviolation',event=>{
      if(event.effectiveDirective==='connect-src')send('trace',{level:'error',message:'Preview blocked a connection. Enable Allow fetch and sockets in the Console to test it.'});
    });
  }
  const select=(id)=>{
    document.querySelectorAll('[data-plot-selected]').forEach(node=>node.removeAttribute('data-plot-selected'));
    if(id) document.querySelector('[data-block-id="'+CSS.escape(id)+'"]')?.setAttribute('data-plot-selected','');
    transforms?.select(id);
  };
  let placingAsset=false;
  document.addEventListener('click', event=>{
    if(event.target.closest?.('[data-plot-transform-overlay]'))return;
    const target=event.target.closest?.('[data-block-id]');
    const link=event.target.closest?.('a');
    if(design){
      if(placingAsset){
        event.preventDefault(); event.stopImmediatePropagation();
        drawDrop(event.clientX,event.clientY,event.shiftKey);
        send('asset-drop',{id:dropTarget?.dataset.blockId||null,position:dropTarget?.dataset.plotDrop||'after'});
        clearDrop(); return;
      }
      if(event.target.closest?.('[contenteditable]'))return;
      event.preventDefault(); event.stopImmediatePropagation(); send('select',{id:target?.dataset.blockId||null}); return;
    }
    const href=link?.getAttribute('href')||'';
    const index=href.indexOf('#');
    const anchor=index>=0?href.slice(index+1):'';
    if(link?.dataset.pageLink){
      event.preventDefault();
      if(anchor&&link.dataset.pageLink===document.body.dataset.pageId)scrollAnchor(anchor);
      else send('navigate',{id:link.dataset.pageLink,anchor});
    }else if(href.startsWith('#')){event.preventDefault();scrollAnchor(anchor);}
  },true);
  document.addEventListener('submit',event=>event.preventDefault(),true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.target.closest?.('[contenteditable]'))send('escape');
  });
  if(design) document.addEventListener('pointerover',event=>{
    const target=event.target.closest?.('[data-block-id]');
    document.querySelector('[data-plot-hover]')?.removeAttribute('data-plot-hover');
    target?.setAttribute('data-plot-hover','');
  });
  if(design) document.addEventListener('dblclick',event=>{
    const text=event.target.closest?.('[data-logic-text]');
    const block=text?.closest('[data-block-id]');
    const key=editKeys[block?.dataset.blockType];
    if(!text||!key||text.isContentEditable)return;
    event.preventDefault();
    const before=text.textContent;
    let cancel=false;
    text.contentEditable='plaintext-only';
    text.spellcheck=true;
    text.focus();
    window.getSelection()?.selectAllChildren(text);
    const keyHandler=e=>{
      if(e.key==='Escape'){e.preventDefault();cancel=true;text.blur();}
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();text.blur();}
    };
    text.addEventListener('keydown',keyHandler);
    text.addEventListener('blur',()=>{
      text.removeEventListener('keydown',keyHandler);
      text.removeAttribute('contenteditable');
      if(cancel){text.textContent=before;return;}
      const value=text.innerText;
      if(value!==before)send('edit-text',{id:block.dataset.blockId,key,value});
    },{once:true});
  });
  const clearDrop=()=>{dropTarget?.removeAttribute('data-plot-drop'); dropTarget=null;};
  const drawDrop=(x,y,nest)=>{
    const target=document.elementFromPoint(x,y)?.closest('[data-block-id]');
    const rect=target?.getBoundingClientRect();
    const inside=target&&['section','columns','card','form'].includes(target.dataset.blockType)&&nest;
    const position=inside?'inside':rect&&y<rect.top+rect.height/2?'before':'after';
    clearDrop();
    target?.setAttribute('data-plot-drop',position);
    dropTarget=target;
  };
  if(design){
    document.addEventListener('pointermove',event=>{if(placingAsset)drawDrop(event.clientX,event.clientY,event.shiftKey);});
    document.addEventListener('pointerleave',()=>{if(placingAsset)clearDrop();});
  }
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.source!=='plot-studio')return;
    if(event.data.type==='select')select(event.data.id);
    if(event.data.type==='scroll') scrollTo(event.data.x||0,event.data.y||0);
    if(event.data.type==='scroll-anchor')scrollAnchor(event.data.anchor);
    if(!design)return;
    if(event.data.type==='asset-placement'){
      placingAsset=event.data.active===true;
      document.documentElement.toggleAttribute('data-plot-placing',placingAsset);
      if(!placingAsset)clearDrop();
    }
    if(event.data.type==='canvas-transform-state')transforms.sync(event.data);
    if(event.data.type==='reveal-block')document.querySelector('[data-block-id="'+CSS.escape(event.data.id)+'"]')?.scrollIntoView({block:'center'});
    if(event.data.type==='drag-clear'){clearDrop();transforms.setLibraryDragging(false);}
    if(event.data.type==='drag-over'||event.data.type==='drag-drop'){
      transforms.setLibraryDragging(true);
      drawDrop(event.data.x,event.data.y,event.data.inside);
    }
    if(event.data.type==='drag-drop'){
      send('drop',{id:dropTarget?.dataset.blockId||null,position:dropTarget?.dataset.plotDrop||'after'});
      clearDrop();
      transforms.setLibraryDragging(false);
    }
  });
  let pending=false;
  if(design) addEventListener('scroll',()=>{
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{pending=false;send('scroll',{x:scrollX,y:scrollY});});
  },{passive:true});
  send('ready');
})()</script>`;

const selectionStyle = `<style>[data-plot-hover]{outline:1px solid #6b8700;outline-offset:-1px}[data-plot-selected]{outline:2px solid #83a30b!important;outline-offset:-2px!important}[contenteditable]{cursor:text;outline:2px solid #6b8700!important;outline-offset:3px!important}[data-plot-drop="before"]{box-shadow:inset 0 5px #769709!important}[data-plot-drop="after"]{box-shadow:inset 0 -5px #769709!important}[data-plot-drop="inside"]{outline:3px solid #769709!important;outline-offset:-3px!important}.plot-empty{display:grid;place-content:center;height:45vh;text-align:center;font:500 18px system-ui;color:#566348}.plot-empty p{margin:3px!important}[data-plot-placing],[data-plot-placing] *{cursor:crosshair!important}[data-plot-placing] [data-plot-transform-overlay]{display:none!important}</style>`;
let frameScroll = { x: 0, y: 0 };
let frameRevealId = null;
let lastDocument = '';

function previewDocument(current, script, options) {
  const documentText = renderDocument(current, project, script, options)
    .replace(/(src|poster)="\.\/assets\/hotel\/([a-z0-9]+(?:-[a-z0-9]+)*\.webp)"/g, '$1="/99host-assets/hotel/$2"');
  return demoAsset ? documentText.replaceAll(`src="${imageUrl}"`, `src="${demoAsset}"`) : documentText;
}

function paintCanvas() {
  if (mode !== 'design') return;
  const empty = page().blocks.length ? '' : '<div class="plot-empty"><p>Start with an element</p><p>Add one from the library.</p></div>';
  const documentText = previewDocument(page(), '', { preview: true, includeCustomJS: false, headHtml: selectionStyle, bodyHtml: empty + childBridge(true) });
  if (documentText !== lastDocument) {
    lastDocument = documentText;
    frame.srcdoc = documentText;
  }
  fitCanvas();
}

function selectBlock(id) {
  if (id && !locate(page().blocks, id)) return;
  blockId = id;
  frame.contentWindow?.postMessage({ source: 'plot-studio', type: 'select', id }, '*');
  if (library !== 'blocks') renderLibrary();
  updateToolbar();
  inspector.refresh();
}

function switchPage(id) {
  if (!project.pages.some((item) => item.id === id) || id === pageId) return;
  pageId = id;
  blockId = null;
  frameScroll = { x: 0, y: 0 };
  render();
}

function setMode(next) {
  if (mode === 'paint' && next !== 'paint') paintEditor?.close();
  if (next !== 'design') {
    cancelAssetPlacement();
    dockLayout.closeOverlay();
  }
  mode = next;
  for (const key of ['design', 'logic', 'data', 'backend', 'paint', 'code']) $(`#${key}-workspace`).hidden = key !== mode;
  $$('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  if (mode === 'paint') void loadPaint().then(editor => { if (mode === 'paint') return editor.open(); }).catch(() => notify('Paint could not be opened. Try again shortly.'));
  render();
}

function render({ skipInspector = false, skipLogic = false, skipData = false, skipCode = false, skipBackend = false } = {}) {
  updateToolbar();
  renderLibrary();
  if (mode === 'design') {
    clearTimeout(renderTimer);
    if (skipInspector) renderTimer = setTimeout(paintCanvas, 100);
    else paintCanvas();
    if (!skipInspector) inspector.refresh();
  }
  if (mode === 'logic' && !skipLogic) logic.refresh();
  if (mode === 'data' && !skipData) dataEditor.refresh();
  if (mode === 'backend' && !skipBackend) backendEditor.refresh();
  if (mode === 'code' && !skipCode) renderCode();
}

function insert(type, useChildren = false, targetId = blockId, position = 'after', overrides) {
  if (!BLOCK_TYPES[type]) return;
  const created = createBlock(type, overrides);
  change(() => {
    const active = locate(page().blocks, targetId);
    if (useChildren && active && BLOCK_TYPES[active.block.type]?.container) active.block.children.push(created);
    else if (active) active.siblings.splice(active.index + (position === 'before' ? 0 : 1), 0, created);
    else page().blocks.push(created);
    blockId = created.id;
  });
  notify(`${BLOCK_TYPES[type].label} added`);
  return created.id;
}

function moveLayer(id, targetId, position = 'after') {
  const source = locate(page().blocks, id);
  if (!source || id === targetId || locate(source.block.children || [], targetId)) return;
  change(() => {
    source.siblings.splice(source.index, 1);
    const target = locate(page().blocks, targetId);
    if (position === 'inside' && target && BLOCK_TYPES[target.block.type]?.container) target.block.children.push(source.block);
    else if (target) target.siblings.splice(target.index + (position === 'before' ? 0 : 1), 0, source.block);
    else page().blocks.push(source.block);
    blockId = id;
  });
}

function layerCommand(command) {
  const active = locate(page().blocks, blockId);
  if (!active) return;
  const { block, index, siblings } = active;
  switch (command) {
    case 'move-up':
    case 'move-down': {
      const nextIndex = index + (command === 'move-up' ? -1 : 1);
      if (nextIndex < 0 || nextIndex >= siblings.length) return;
      change(() => { siblings.splice(index, 1); siblings.splice(nextIndex, 0, block); });
      break;
    }
    case 'duplicate-block': {
      const copy = structuredClone(block);
      walk([copy]).forEach((item) => { item.id = createId('block'); });
      change(() => { siblings.splice(index + 1, 0, copy); blockId = copy.id; });
      break;
    }
    case 'delete-block':
      change(() => { siblings.splice(index, 1); blockId = null; });
      break;
  }
}

function compileProject() {
  const compiled = compileGraph(project.graph, project);
  const diagnostics = [...compiled.diagnostics];
  if (project.settings.customJs?.trim()) {
    try { new Function(project.settings.customJs); }
    catch (error) { diagnostics.push({ severity: 'error', message: `Custom JavaScript: ${error.message}` }); }
  }
  return { ...compiled, diagnostics };
}

function prepareFiles() {
  const compiled = compileProject();
  const files = buildSite(project, compiled.code);
  if (project.backend?.routes?.length) files['backend.json'] = JSON.stringify(project.backend,null,2);
  return { ...compiled, files };
}

function renderCode() {
  const result = prepareFiles();
  files = result.files;
  if (!(activeCode in files) && !(activeCode in customCode)) activeCode = 'index.html';
  const fileButton = (name, label = name) => `<button type="button" class="list-row" data-code-file="${esc(name)}" aria-pressed="${name === activeCode}">${icon('code')}<span>${esc(label)}</span></button>`;
  $('#code-files').innerHTML = Object.keys(files).map((name) => fileButton(name)).join('') + `<h2 class="custom-code-heading">Site overrides</h2>${Object.entries(customCode).map(([name, { label }]) => fileButton(name, label)).join('')}`;
  const edit = customCode[activeCode];
  $('#code-filename').textContent = edit?.label || activeCode;
  $('#code-pre').hidden = Boolean(edit);
  $('#custom-code').hidden = !edit;
  if (edit) {
    $('#custom-code').value = project.settings[edit.key] || '';
    $('#custom-code').placeholder = edit.key === 'customJs' ? '// Code here runs on each page in Preview and in the export.\n' : '/* Add CSS rules to every page. */';
  } else $('#code-source').textContent = files[activeCode];
  setCodeStatus(result);
}

function setCodeStatus(result) {
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  const warnings = result.diagnostics.filter((item) => item.severity === 'warning');
  const info = errors[0]?.message || warnings[0]?.message || (customCode[activeCode] ? 'Changes apply to all pages' : `${Object.keys(files).length} files · HTML, CSS and JavaScript`);
  $('#code-status').dataset.error = String(errors.length > 0);
  $('#code-status').textContent = info;
}

function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadProject() {
  const name = `${slugify(project.name) || 'site'}.plot`;
  try {
    const file = await protectPlotProject(serializeProject(project));
    download(name, file, file.type);
    notify('Protected project downloaded.');
  } catch (issue) { notify(issue.message); }
}

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function openPreview() {
  previewPageId = pageId;
  previewAnchor = '';
  resetPreviewDatabase();
  logic.resetTrace?.();
  $('#preview-network').checked = false;
  previewDeviceSelect.value = device === 'mobile' ? phoneModel : device;
  if (device === 'mobile') previewBrowserButton.setAttribute('aria-pressed', canvasBrowserButton.getAttribute('aria-pressed'));
  if (!previewDialog.open) previewDialog.showModal();
  fitPreview();
  paintPreview();
}

function resetPreviewDatabase() {
  previewDatabase = normalizeData(project.data);
  previewDatabaseChanged = false;
  $('#preview-apply').hidden = true;
  $('#preview-log').replaceChildren();
}

function fitPreview() {
  if (!previewDialog.open) return;
  const selected = previewDeviceSelect.value;
  const shell = $('#preview-shell');
  const phone = phoneProfiles[selected];
  $('#preview-phone-controls').hidden = !phone;
  shell.toggleAttribute('data-phone-mode', Boolean(phone));
  if (phone) {
    const ratio = phoneScale(phone, shell.clientWidth - 30, shell.clientHeight - 30);
    if (ratio <= 0) return;
    const current = project.pages.find(item => item.id === previewPageId) || page();
    const path = current.slug === 'index' ? '/' : `/${current.slug}.html`;
    const height = previewPhoneFrame.set(selected, ratio, previewBrowserButton.getAttribute('aria-pressed') === 'true', path);
    $('#preview-phone-viewport').textContent = `${phone.width} × ${height}`;
    return;
  }
  previewPhoneFrame.reset();
  const ideal = selected === 'desktop' ? Math.max(devices.desktop.width, shell.clientWidth) : devices[selected].width;
  const width = Math.min(ideal, shell.clientWidth);
  if (!width) return;
  const ratio = width / ideal;
  previewMount.style.width = `${width}px`;
  previewMount.style.height = `${shell.clientHeight}px`;
  previewFrame.style.width = `${ideal}px`;
  previewFrame.style.height = `${shell.clientHeight / ratio}px`;
  previewFrame.style.transform = `scale(${ratio})`;
}

function logPreview(message, level = 'info') {
  if (typeof message !== 'string' || !message) return;
  const log = $('#preview-log');
  const item = document.createElement('li');
  item.dataset.level = level === 'error' ? 'error' : 'info';
  item.textContent = message.slice(0, 2000);
  log.append(item);
  if (log.children.length > 100) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

function paintPreview() {
  const current = project.pages.find((item) => item.id === previewPageId) || page();
  const result = compileProject();
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  $('#preview-alert').hidden = !errors.length;
  $('#preview-alert').textContent = errors.length ? `Logic could not run. ${errors[0].message}` : '';
  updatePageSelect($('#preview-page'), current.id);
  fitPreview();
  const networkPolicy = $('#preview-network').checked ? '' : `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'">`;
  previewFrame.srcdoc = previewDocument(current, result.code, { preview: true, includeCustomJS: !errors.some((item) => item.message.startsWith('Custom JavaScript:')), headHtml: networkPolicy, bodyHtml: childBridge(false) });
}

async function downloadSite(source, js, includeRows = false) {
  try {
    if (source.backend?.routes?.length) {
      const checked = await studioBackend('backend/test', { method:'POST', body: JSON.stringify({ backend: source.backend, validateOnly: true, request: { method:'GET', path:'/api/status' } }) });
      const issue = checked.diagnostics?.find(item => item.severity === 'error');
      if (issue) throw new Error(issue.message);
    }
    const packaged = await buildSitePackage(source, js, { includeRows });
    download(`${slugify(source.name) || 'site'}.zip`, createZip(packaged), 'application/zip');
    notify('Site ZIP downloaded');
  } catch (error) { notify(error.message || 'Site export failed.'); }
}

function formFields(kind, current) {
  if (kind === 'delete-page' || kind === 'replace') return '<p>This replaces the current draft. Download the project file first if you want to keep a separate copy.</p>';
  const pageFields = kind === 'add-page' || kind === 'edit-page';
  const template = kind === 'add-page' ? `<label>Start from<select name="template">${Object.entries(PAGE_TEMPLATES).map(([id, value]) => `<option value="${id}" title="${esc(value.description)}">${esc(value.label)}</option>`).join('')}</select></label>` : '';
  return `<label>${pageFields ? 'Page name' : 'Project name'}<input name="name" required maxlength="70" value="${esc(current?.name)}" autocomplete="off" autofocus></label>${pageFields && current?.slug !== 'index' ? `<label>URL slug<input name="slug" maxlength="64" value="${esc(current?.slug)}" placeholder="auto-generated" autocomplete="off"></label>` : ''}${template}`;
}

function showEditor(kind, current, confirm) {
  const titles = { rename: 'Rename project', 'add-page': 'Add a page', 'edit-page': 'Edit page', 'delete-page': 'Delete this page?', replace: 'Replace the current project?' };
  $('#edit-title').textContent = titles[kind];
  $('#edit-fields').innerHTML = formFields(kind, current);
  if (kind === 'delete-page') $('#edit-fields').innerHTML = '<p>The page and its elements will be removed from this project.</p>';
  $('#edit-confirm').textContent = kind === 'delete-page' ? 'Delete page' : kind === 'replace' ? 'Replace' : kind === 'add-page' ? 'Add page' : 'Save';
  editAction = confirm;
  editDialog.showModal();
}

const remoteProjects = mountRemoteProjects($('#remote-dialog'), {
  getProject: () => project,
  notify,
  onBinding: () => { if (mode === 'backend') backendEditor.refresh(); },
  openProject: (source, bind) => {
    try {
      const next = deserializeProject(JSON.stringify(source));
      showEditor('replace', null, () => { setProject(next); bind(); });
    } catch { notify('This server project could not be loaded.'); }
  },
});

function showThemes() {
  const options = $('#theme-options');
  if (!options.children.length) {
    const families = Object.values(themes).flatMap(({ headingFont, font }) => [headingFont, font]);
    const url = googleFontStylesheet([...new Set(families)], { preview: true });
    if (url) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url }));
    options.innerHTML = Object.entries(themes).map(([id, theme]) => `<button type="button" class="theme-option" data-theme="${id}" style="--sample-bg:${theme.background};--sample-ink:${theme.textColor};--sample-accent:${theme.accent};--sample-h:'${theme.headingFont}';--sample-p:'${theme.font}'"><strong>${theme.name}</strong><span>${theme.headingFont} / ${theme.font}</span></button>`).join('');
  }
  themeDialog.showModal();
}

function applyTheme(theme) {
  const { name, size, ...settings } = theme;
  change((draft) => Object.assign(draft.settings, settings, {
    h1Size: `clamp(2.55rem, 6.7vw, ${size}px)`,
    h2Size: `clamp(2rem, 4.5vw, ${Math.round(size * .65)}px)`,
    h3Size: `clamp(1.45rem, 2.5vw, ${Math.round(size * .40)}px)`,
    bodySize: 'clamp(1rem, 1.2vw, 1.125rem)',
  }));
  themeDialog.close();
  notify(`${name} applied`);
}

function editPage(current = null) {
  showEditor(current ? 'edit-page' : 'add-page', current, (fields) => {
    const name = fields.get('name').trim();
    if (!name) return 'Enter a page name.';
    const slug = current?.slug === 'index' ? 'index' : slugify(fields.get('slug') || name);
    if (!slug) return 'Enter a URL slug.';
    if (project.pages.some((item) => item.slug === slug && item.id !== current?.id)) return 'That URL is already in use.';
    change(() => {
      if (current) Object.assign(current, { name, slug });
      else {
        const fresh = createPageFromTemplate(fields.get('template'), name, slug);
        project.pages.push(fresh);
        pageId = fresh.id;
        blockId = null;
        frameScroll = { x: 0, y: 0 };
      }
    });
  });
}

function closeProjectMenu() {
  $('#project-trigger').setAttribute('aria-expanded', 'false');
  $('#project-menu').hidden = true;
}

function setProject(next) {
  cancelAssetPlacement();
  remoteProjects.detach();
  change(() => { project = next; pageId = project.pages[0].id; blockId = null; frameScroll = { x: 0, y: 0 }; });
  undoStack.length = 0;
  redoStack.length = 0;
  updateToolbar();
  fillDemoAsset();
}

async function fillDemoAsset() {
  if (demoAsset) return;
  try {
    if (!demoAsset) {
      const response = await fetch(new URL(imageUrl, import.meta.url));
      if (!response.ok) return;
      demoAsset = await new Promise((resolve, reject) => {
        response.blob().then((blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, reject);
      });
    }
    render();
    if (previewDialog.open) paintPreview();
  } catch { /* The served image remains the fallback for the sample. */ }
}

function projectAction(action) {
  closeProjectMenu();
  switch (action) {
    case 'rename':
      showEditor('rename', project, (fields) => {
        const name = fields.get('name').trim();
        if (!name) return 'Enter a project name.';
        change((draft) => { draft.name = name; });
      });
      break;
    case 'new':
      showEditor('replace', null, () => setProject(createEmptyProject('Untitled site')));
      break;
    case 'demo': showEditor('replace', null, () => { setProject(starter()); setMode('design'); }); break;
    case 'database-demo': showEditor('replace', null, () => { setProject(databaseDemo()); setMode('logic'); }); break;
    case 'save': void downloadProject(); break;
    case 'import': $('#import-project').click(); break;
    case 'themes': showThemes(); break;
    case 'server-save': remoteProjects.save(); break;
    case 'server-library': remoteProjects.show(); break;
    case 'hosting': setMode('backend'); backendEditor.open('hosting'); break;
  }
}

async function command(action) {
  switch (action) {
    case 'preview': openPreview(); break;
    case 'close-preview': previewDialog.close(); break;
    case 'close-themes': themeDialog.close(); break;
    case 'preview-reset': resetPreviewDatabase(); paintPreview(); break;
    case 'preview-console': {
      const panel = $('#preview-console');
      panel.hidden = !panel.hidden;
      $('[data-command="preview-console"]').setAttribute('aria-expanded', String(!panel.hidden));
      break;
    }
    case 'preview-clear': $('#preview-log').replaceChildren(); break;
    case 'preview-apply':
      if (previewDatabaseChanged) {
        change((draft) => { draft.data = structuredClone(previewDatabase); });
        previewDatabaseChanged = false;
        $('#preview-apply').hidden = true;
        logPreview('Saved test records to the draft.');
      }
      break;
    case 'undo': restore(undoStack, redoStack); break;
    case 'redo': restore(redoStack, undoStack); break;
    case 'deselect': selectBlock(null); break;
    case 'canvas-transform':
      canvasHandles = !canvasHandles;
      $('[data-command="canvas-transform"]').setAttribute('aria-pressed', String(canvasHandles));
      syncCanvasTransform();
      break;
    case 'library': case 'inspector': dockLayout.toggle(action); break;
    case 'canvas-only': dockLayout.toggleFocus(); break;
    case 'add-page': editPage(); break;
    case 'delete-page': {
      if (page().slug === 'index' || project.pages.length < 2) break;
      showEditor('delete-page', page(), () => change((draft) => { draft.pages = draft.pages.filter((item) => item.id !== pageId); }));
      break;
    }
    case 'export': {
      const result = compileProject();
      if (result.diagnostics.some((item) => item.severity === 'error')) {
        setMode('code');
        notify('Fix the logic error before exporting.');
        break;
      }
      if (project.data?.tables.length || project.backend?.routes?.length) {
        $('#export-rows').checked = false;
        exportDialog.showModal();
      } else await downloadSite(project, result.code);
      break;
    }
    case 'copy':
      try { await navigator.clipboard.writeText(customCode[activeCode] ? $('#custom-code').value : files[activeCode]); notify(`${activeCode} copied`); }
      catch { notify('Clipboard unavailable. Select and copy the code.'); }
      break;
    case 'image-library': imageLibrary.open(); break;
    case 'cancel-asset-placement': cancelAssetPlacement(); break;
    case 'browse-variants': variantPicker.open(); break;
    case 'change-block-variant': {
      const selected = locate(page().blocks, blockId)?.block;
      if (selected) variantPicker.open(selected.type, selected);
      break;
    }
    default: layerCommand(action);
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!event.target.closest('.project-control')) closeProjectMenu();
  if (!button) return;
  const data = button.dataset;
  if (button.id === 'project-trigger') {
    const menu = $('#project-menu');
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  } else if (data.projectAction) projectAction(data.projectAction);
  else if (data.theme && themes[data.theme]) applyTheme(themes[data.theme]);
  else if (data.mode) setMode(data.mode);
  else if (data.library) { library = data.library; renderLibrary(); }
  else if (data.device) {
    device = data.device;
    updateToolbar(); fitCanvas(); inspector.refresh();
  } else if (data.addBlock) insert(data.addBlock, event.shiftKey);
  else if (data.blockVariants) variantPicker.open(data.blockVariants);
  else if (data.command) command(data.command);
  else if (data.selectBlock) selectBlock(data.selectBlock);
  else if (data.selectPage) switchPage(data.selectPage);
  else if (data.editPage) editPage(project.pages.find((item) => item.id === data.editPage));
  else if (data.codeFile) { activeCode = data.codeFile; renderCode(); $('#code-pre').scrollTop = 0; }
});

$('#page-picker').addEventListener('change', (event) => switchPage(event.target.value));
$('#canvas-scale').addEventListener('change', (event) => {
  canvasScale = event.target.value;
  if (canvasScale === 'fit') canvas.scrollLeft = 0;
  fitCanvas();
});
canvasPhoneSelect.addEventListener('change', () => { choosePhoneModel(canvasPhoneSelect.value); updateToolbar(); fitCanvas(); });
canvasBrowserButton.addEventListener('click', () => {
  canvasBrowserButton.setAttribute('aria-pressed', String(canvasBrowserButton.getAttribute('aria-pressed') !== 'true'));
  fitCanvas();
});
$('#preview-page').addEventListener('change', (event) => { previewPageId = event.target.value; previewAnchor = ''; paintPreview(); });
previewDeviceSelect.addEventListener('change', () => {
  choosePhoneModel(previewDeviceSelect.value);
  if (device === 'mobile') { updateToolbar(); fitCanvas(); }
  fitPreview();
});
previewBrowserButton.addEventListener('click', () => {
  previewBrowserButton.setAttribute('aria-pressed', String(previewBrowserButton.getAttribute('aria-pressed') !== 'true'));
  fitPreview();
});
$('#preview-network').addEventListener('change', (event) => {
  logPreview(event.target.checked ? 'Fetch and socket connections enabled for this preview.' : 'Fetch and socket connections blocked.');
  paintPreview();
});
previewDialog.addEventListener('close', () => { previewFrame.srcdoc = ''; previewDatabase = null; });
$('#custom-code').addEventListener('input', (event) => {
  const setting = customCode[activeCode];
  if (!setting) return;
  const value = event.target.value.slice(0, 250000);
  change((draft) => { draft.settings[setting.key] = value; }, { source: 'code', coalesceKey: setting.key });
  if (setting.key === 'customJs') {
    try { new Function(value); setCodeStatus({ diagnostics: [] }); }
    catch (error) { setCodeStatus({ diagnostics: [{ severity: 'error', message: error.message }] }); }
  }
});
$('#edit-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'accept') return;
  const error = editAction?.(new FormData(event.currentTarget));
  if (error) { event.preventDefault(); notify(error); }
});
$('#export-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'download') return;
  const result = compileProject();
  if (result.diagnostics.some((item) => item.severity === 'error')) { notify('Fix the logic error before exporting.'); return; }
  downloadSite(project, result.code, $('#export-rows').checked);
});
$('#import-project').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.plot')) return notify('Choose a .plot project file.');
    const next = deserializeProject(await readPlotFile(file));
    showEditor('replace', null, () => setProject(next));
  } catch (issue) { notify(issue.message || 'This is not a valid PLOT project file.'); }
  finally { event.target.value = ''; }
});

libraryContent.addEventListener('input', (event) => {
  if (event.target.id !== 'block-search') return;
  libraryFilter = event.target.value;
  $('#block-results').innerHTML = libraryBlockList();
});

const dropTarget = $('#canvas-drop-target');

function postDrag(type, event) {
  const rect = frame.getBoundingClientRect();
  const ratio = frame.offsetWidth / rect.width;
  frame.contentWindow?.postMessage({ source: 'plot-studio', type, x: (event.clientX - rect.left) * ratio,
    y: (event.clientY - rect.top) * ratio, inside: event.shiftKey }, '*');
}

libraryContent.addEventListener('dragstart', (event) => {
  dragType = event.target.closest('[data-add-block]')?.dataset.addBlock;
  dragBlockId = event.target.closest('[data-select-block]')?.dataset.selectBlock;
  if (!dragType && !dragBlockId) return;
  event.dataTransfer.setData('text/plain', dragType || dragBlockId);
  event.dataTransfer.effectAllowed = dragBlockId ? 'move' : 'copy';
  canvas.classList.add('is-dragging');
  dropTarget.hidden = false;
});
let lastDrag;
document.addEventListener('dragend', () => {
  lastDrag = { type: dragType, block: dragBlockId, time: Date.now() };
  dragType = null;
  dragBlockId = null;
  canvas.classList.remove('is-dragging');
  dropTarget.hidden = true;
  frame.contentWindow?.postMessage({ source: 'plot-studio', type: 'drag-clear' }, '*');
});
dropTarget.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = dragBlockId ? 'move' : 'copy';
  postDrag('drag-over', event);
});
dropTarget.addEventListener('dragleave', () => frame.contentWindow?.postMessage({ source: 'plot-studio', type: 'drag-clear' }, '*'));
dropTarget.addEventListener('drop', (event) => { event.preventDefault(); postDrag('drag-drop', event); });
libraryContent.addEventListener('dragover', (event) => {
  if (dragBlockId && event.target.closest('[data-select-block]')) event.preventDefault();
});
libraryContent.addEventListener('drop', (event) => {
  const row = event.target.closest('[data-select-block]');
  if (!row || !dragBlockId) return;
  event.preventDefault();
  const rect = row.getBoundingClientRect();
  const position = event.shiftKey ? 'inside' : event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  moveLayer(dragBlockId, row.dataset.selectBlock, position);
});

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.source !== 'plot-preview') return;
  if (event.source === frame.contentWindow) {
    if (data.type === 'escape' && !cancelAssetPlacement()) dockLayout.closeOverlay(true);
    if (data.type === 'asset-drop' && pendingAssetPlacement) {
      const asset = pendingAssetPlacement;
      cancelAssetPlacement();
      frameRevealId = insert('image', data.position === 'inside', data.id, data.position, { props: { src: asset.url, alt: asset.alt || '' } });
    }
    if (data.type === 'select') selectBlock(data.id);
    if (data.type === 'canvas-undo' && mode === 'design' && !document.querySelector('dialog[open]')) {
      if (data.redo) restore(redoStack, undoStack);
      else restore(undoStack, redoStack);
    }
    if (data.type === 'canvas-transform' && mode === 'design' && data.id === blockId &&
      data.context?.pageId === pageId && data.context?.device === device) {
      const active = locate(page().blocks, data.id)?.block;
      const styles = device === 'desktop' ? active?.style : active?.styles?.[device];
      const patch = canvasTransformPatch(data.patch);
      if (styles && Object.entries(patch).some(([key, value]) => styles[key] !== value)) {
        canvasHandleFocus = typeof data.focus === 'string' ? data.focus : '';
        change(() => Object.assign(styles, patch));
      }
    }
    if (data.type === 'scroll') frameScroll = { x: data.x, y: data.y };
    if (data.type === 'edit-text') {
      const active = locate(page().blocks, data.id)?.block;
      if (active && typeof data.value === 'string' && Object.hasOwn(active.props, data.key)) {
        change(() => { active.props[data.key] = data.value.slice(0, 20000); blockId = active.id; });
      }
    }
    if (data.type === 'drop') {
      const recent = lastDrag && Date.now() - lastDrag.time < 750 ? lastDrag : {};
      const type = dragType || recent.type;
      const dragged = dragBlockId || recent.block;
      if (type) insert(type, data.position === 'inside', data.id, data.position);
      else if (dragged) moveLayer(dragged, data.id, data.position);
      lastDrag = null;
      canvas.classList.remove('is-dragging');
    }
    if (data.type === 'ready') {
      if (pendingAssetPlacement) updateAssetPlacement();
      frame.contentWindow.postMessage({ source: 'plot-studio', type: 'select', id: blockId }, '*');
      frame.contentWindow.postMessage({ source: 'plot-studio', type: 'scroll', ...frameScroll }, '*');
      if (frameRevealId) {
        frame.contentWindow.postMessage({ source: 'plot-studio', type: 'reveal-block', id: frameRevealId }, '*');
        frameRevealId = null;
      }
      syncCanvasTransform(canvasHandleFocus);
      canvasHandleFocus = '';
    }
  }
  if (event.source === previewFrame.contentWindow && data.type === 'navigate' && project.pages.some((item) => item.id === data.id)) {
    previewPageId = data.id;
    previewAnchor = typeof data.anchor === 'string' ? data.anchor : '';
    paintPreview();
  }
  if (event.source === previewFrame.contentWindow && data.type === 'ready' && previewAnchor) {
    previewFrame.contentWindow.postMessage({ source: 'plot-studio', type: 'scroll-anchor', anchor: previewAnchor }, '*');
  }
  if (event.source === previewFrame.contentWindow && data.type === 'data-query' && previewDialog.open && previewDatabase) {
    const reply = (result) => previewFrame.contentWindow?.postMessage({ source: 'plot-studio', type: 'data-result', id: data.id, ...result }, '*');
    const query = data.operation;
    try {
      const result = executeDataQuery(previewDatabase, query, { enforcePermissions: $('#preview-permissions').checked });
      logPreview(`Database preview · ${query.operation} ${query.table}${Array.isArray(result) ? ` · ${result.length} records` : ''}`);
      if (['create', 'update', 'delete'].includes(query.operation)) {
        previewDatabaseChanged = true;
        $('#preview-apply').hidden = false;
      }
      reply({ ok: true, result });
    } catch (error) {
      logPreview(`Database · ${error.message}`, 'error');
      reply({ ok: false, message: error.message, code: error.code });
    }
  }
  if (event.source === previewFrame.contentWindow && data.type === 'backend-request' && previewDialog.open && Number.isSafeInteger(data.id)) {
    const documentAtRequest = previewFrame.srcdoc;
    const reply = (result) => {
      if (previewDialog.open && previewFrame.srcdoc === documentAtRequest) previewFrame.contentWindow?.postMessage({ source:'plot-studio', type:'backend-result', id:data.id, ...result }, '*');
    };
    studioBackend('backend/test', { method:'POST', body: JSON.stringify({ backend:project.backend, data:previewDatabase || project.data, request:data.request }) })
      .then(result => { logPreview(`Backend preview · HTTP ${result.status}`); reply({ ok:true, result }); })
      .catch(error => { logPreview(error.message, 'error'); reply({ ok:false, message:error.message }); });
  }
  if (event.source === previewFrame.contentWindow && data.type === 'trace' && previewDialog.open) {
    if (!data.phase || data.phase === 'error' || data.phase === 'log') logPreview(data.message, data.level);
    if (typeof data.nodeId === 'string') logic.trace?.({ nodeId: data.nodeId, level: data.level, message: data.message, phase: data.phase });
  }
  if (event.source === previewFrame.contentWindow && data.type === 'escape' && previewDialog.open) previewDialog.close();
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || mode === 'paint' || $('#image-library').open) return;
  if (event.key === 'Escape') {
    if (!document.querySelector('dialog[open]') && cancelAssetPlacement()) return;
    closeProjectMenu();
    if (mode === 'design' && !document.querySelector('dialog[open]')) dockLayout.closeOverlay(true);
  }
  const editable = event.target.matches?.('input,textarea,select,[contenteditable]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); persist(); if (!isCustomer) notify('Project saved in this browser'); }
  if (!editable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); command(event.shiftKey ? 'redo' : 'undo'); }
});
window.addEventListener('pagehide', () => { if (!isCustomer && saveTimer) persist(); });
if (isCustomer) window.addEventListener('beforeunload', event => {
  if (saveTimer || draftSaving || queuedDraft) { event.preventDefault(); event.returnValue = true; }
});

fillIcons();
new ResizeObserver(fitCanvas).observe(canvas);
new ResizeObserver(fitPreview).observe($('#preview-shell'));
render();
if (isCustomer) drawSaved(draftBlocked || (draftTag === '"empty"' ? 'New workspace' : 'Saved to workspace'), draftBlocked ? 'error' : 'good');
fillDemoAsset();
if (window.parent !== window && location.pathname === '/studio/editor') {
  window.parent.postMessage({ type: 'plot-studio:ready' }, '*');
}
