import { createPaintEngine, paintBrushSample, paintDefaultSize, paintLimits } from './paint-engine.mjs';
import { createZip } from './project.mjs';
import { storageName } from './workspace-client.mjs';
import { paintBrushes, paintRibbon } from './paint-ribbon.mjs';
import { mountPaintColors, paintColorMarkup } from './paint-color-dialog.mjs';

const glyphs = {
  pencil: 'm4 20 1-5L16 4l4 4L9 19zM14 6l4 4', brush: 'M9 16c-4-.5-5 4-5 4s6 1 8-2c1-2 0-4-3-2Zm1-2L17 4l3 3-8 9',
  eraser: 'M4 14 13 4a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 9H9zM8 10l9 9m-5 1h9',
  spray: 'M5 12h9v9H5zM7 12V8h5v4M9 8V5m6 0h.01m3-2h.01m0 4h.01m3-2h.01',
  fill: 'm4 12 7-7 7 7-7 7zM8 4l5 7M4 12h14m3 3c-3 4-2 6 0 6 3 0 3-2 0-6Z',
  eyedropper: 'm12 7 5 5m-3-6 2-2a3 3 0 0 1 4 4l-2 2M4 20l1-5 7-8 5 5-8 7z',
  line: 'M4 20 20 4', rect: 'M4 5h16v14H4z', ellipse: 'M20 12a8 6 0 1 1-16 0 8 6 0 1 1 16 0Z',
  triangle: 'M12 4 21 20H3z', arrow: 'M4 12h16m-6-6 6 6-6 6', text: 'M4 7V5h16v2M12 5v14m-4 0h8',
  diamond: 'm12 3 9 9-9 9-9-9z', 'rounded-rect': 'M8 5h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z',
  star: 'm12 3 2.7 5.7 6.3.9-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.6l6.3-.9z',
  pentagon: 'm12 3 9 6-4 11H7L3 9z', hexagon: 'M8 4h8l5 8-5 8H8l-5-8z',
  select: 'M9 4H4v5m0 6v5h5m6 0h5v-5m0-6V4h-5',
  hand: 'M8 12V6a1 1 0 0 1 2 0v5m0-2V4a1 1 0 0 1 2 0v7m0-2V6a1 1 0 0 1 2 0v5m0-2a1 1 0 0 1 2 0v4l2-1a1 1 0 0 1 1 1l-3 6a3 3 0 0 1-2 2H9a3 3 0 0 1-2-1l-3-6a1 1 0 0 1 2-1l2 2',
  rotate: 'M4 9a8 8 0 1 1 0 6M3 4v6h6', crop: 'M7 3v14h14M3 7h14v14',
  open: 'M3 7h8l2 2h8l-3 10H3zM3 7V5h8l2 2h6v2', save: 'M5 4h13l2 2v14H4V4zM8 4v5h7V4M8 20v-7h8v7',
  undo: 'm8 5-5 5 5 5M3 10h11a5 5 0 0 1 0 10h-3', redo: 'm16 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', more: 'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M12 4v11m-4-4 4 4 4-4M4 17v3h16v-3', check: 'm5 12 4 4L19 6',
  paste: 'M8 5H5v16h14V5h-3M8 3h8v5H8z', cut: 'M4 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0m10 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5 3l9 13m-4 0 9-13', copy: 'M8 7h12v14H8zM16 7V3H4v14h4',
  resize: 'M3 4h12v10H3zM9 14v5h12V9h-6', lasso: 'M4 7c2-4 13-5 15 1 1 4-4 7-8 8-3 1-5 6-8 4 5-5 0-6 1-13z',
  invert: 'M4 4h16v16H4zM8 8h8v8H8z', delete: 'm5 5 14 14M19 5 5 19', 'rotate-left': 'M20 9a8 8 0 1 0 0 6m1-11v6h-6',
  'flip-horizontal': 'M10 4 2 20h8zM14 4l8 16h-8z', 'flip-vertical': 'M4 10 20 2v8zm0 4 16 8v-8z',
  sliders: 'M5 3v18m7-18v18m7-18v18M2 9h6m1 6h6m1-8h6', outline: 'M4 17v3h3L20 7l-3-3L4 17z', size: 'M3 4h18M3 8h18m-18 5h18m-18 6h18',
  spectrum: 'M3 3h18v18H3z', upload: 'M12 17V4m-4 4 4-4 4 4M4 16v4h16v-4', background: 'M4 4h16v16H4zM4 8l4-4m-4 8 8-8m-8 12L16 4m-8 16L20 8m-8 12 8-8',
  link: 'M10 8l3-3a4 4 0 1 1 6 6l-3 3m-2 2-3 3a4 4 0 0 1-6-6l3-3m0 6 8-8', position: 'M12 2v20M2 12h20m-12-6 2-3 2 3m-4 12 2 3 2-3M6 10l-3 2 3 2m12-4 3 2-3 2',
  curve: 'M2 17C7 1 14 23 22 6', polygon: 'M3 8l6-5h9l4 8-4 9-12-4Z', 'right-triangle': 'M4 4v16h16Z',
  'arrow-right': 'M3 9h9V4l9 8-9 8v-5H3Z', 'arrow-left': 'M21 9h-9V4l-9 8 9 8v-5h9Z', 'arrow-up': 'M9 21v-9H4l8-9 8 9h-5v9Z', 'arrow-down': 'M9 3v9H4l8 9 8-9h-5V3Z',
  'star-four': 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z', 'star-six': 'm12 2 2.7 5.2 5.8-.2-3 5 3 5-5.8-.2L12 22l-2.7-5.2-5.8.2 3-5-3-5 5.8.2Z',
  callout: 'M3 4h18v13H11l-6 4 1-4H3Z', 'oval-callout': 'M7 18C0 15 2 5 9 4c7-2 14 2 13 7-1 6-7 8-12 7l-5 3Z',
  reference: 'M8 3h13v13H8zM3 8v13h13m-8-8 4-4 4 4 2-2 3 3M17 7h.01',
};

const tools = [
  ['pencil', 'Pencil', 'P'], ['brush', 'Brush', 'B'], ['eraser', 'Eraser', 'E'], ['spray', 'Spray', 'A'],
  ['fill', 'Fill', 'F'], ['eyedropper', 'Eyedropper', 'I'], ['line', 'Line', 'L'], ['rect', 'Rectangle', 'R'],
  ['ellipse', 'Ellipse', 'O'], ['triangle', 'Triangle', ''], ['arrow', 'Arrow', ''], ['text', 'Text', 'T'],
  ['select', 'Select', 'M'], ['hand', 'Hand', 'H'], ['diamond', 'Diamond', ''], ['rounded-rect', 'Rounded box', ''],
  ['star', 'Star', ''], ['pentagon', 'Pentagon', ''], ['hexagon', 'Hexagon', ''],
  ['curve', 'Curve', ''], ['polygon', 'Polygon', ''], ['right-triangle', 'Right triangle', ''], ['arrow-right', 'Right arrow', ''],
  ['arrow-left', 'Left arrow', ''], ['arrow-up', 'Up arrow', ''], ['arrow-down', 'Down arrow', ''], ['star-four', 'Four-point star', ''],
  ['star-six', 'Six-point star', ''], ['callout', 'Rectangular callout', ''], ['oval-callout', 'Oval callout', ''],
];
const shapeTools = ['line', 'curve', 'ellipse', 'rect', 'rounded-rect', 'polygon', 'triangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'star-four', 'star', 'star-six', 'callout', 'oval-callout', 'arrow'];

const formats = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const fileTypes = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
const word = new Intl.NumberFormat('en');
const percentSettings = new Set(['opacity', 'hardness', 'density', 'flow', 'grain', 'zoom']);
const brushSettings = new Set(['size', 'opacity', 'hardness', 'density', 'flow', 'grain', 'angle', 'pressure']);
const brushById = new Map(paintBrushes.map(brush => [brush.id, brush]));

function icon(name) {
  const path = glyphs[name];
  return path ? `<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>` : '';
}

function fileSlug(name) {
  return name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 76) || 'drawing';
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function workspaceStorage() {
  let connection;
  function open() {
    connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(storageName('plot-studio.paint.v1'), 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The local paint workspace is busy.'));
    });
    return connection;
  }
  return {
    async read() {
      const database = await open();
      return new Promise((resolve, reject) => {
        const request = database.transaction('workspace').objectStore('workspace').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async write(records, removed) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('workspace', 'readwrite');
        const store = transaction.objectStore('workspace');
        for (const id of removed) store.delete(id);
        for (const record of records) store.put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}

function dimensionsMarkup(width, height) {
  return `<div class="paint-fields"><label class="paint-field"><span>Width (px)</span><input name="width" type="number" min="1" max="${paintLimits.maxSide}" value="${width}" required inputmode="numeric" autofocus></label><label class="paint-field"><span>Height (px)</span><input name="height" type="number" min="1" max="${paintLimits.maxSide}" value="${height}" required inputmode="numeric"></label></div>`;
}

function referenceData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The reference image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function mountPaintEditor(host, { saveAsset, useAsset, chooseReferenceAsset, notify } = {}) {
  host.classList.add('paint-editor');
  host.innerHTML = paintRibbon({ icon, tools, shapeTools, fileTypes });
  const $ = (selector) => host.querySelector(selector);
  const $$ = (selector) => [...host.querySelectorAll(selector)];
  const action = (name) => $(`[data-paint-action="${name}"]`);
  const disableAction = (name, disabled) => $$(`[data-paint-action="${name}"]`).forEach(control => { control.disabled = disabled; });
  const viewport = $('[data-paint-viewport]');
  const canvas = $('[data-paint-canvas]');
  const input = $('[data-paint-image]');
  const referenceFile = $('[data-paint-reference-file]');
  const referenceImage = $('[data-paint-reference-image]');
  const referencePanel = $('#paint-reference-panel');
  const referenceSettings = $('[data-paint-reference-settings]');
  const referenceVisible = $('[data-paint-reference-visible]');
  const referenceOpacity = $('[data-paint-reference-opacity]');
  const referenceFit = $('[data-paint-reference-fit]');
  const referenceWhite = $('[data-paint-reference-white]');
  action('reference-assets').hidden = !chooseReferenceAsset;
  const status = $('[data-paint-status]');
  const tabs = $('[data-paint-tabs]');
  const dialog = $('[data-paint-dialog]');
  const customColorKey = storageName('plot-studio.paint.colors.v1');
  const customColors = Array(10).fill(null);
  try {
    const stored = JSON.parse(localStorage.getItem(customColorKey) || '[]');
    for (let index = 0; index < customColors.length; index++) if (/^#[a-f0-9]{6}$/i.test(stored[index])) customColors[index] = stored[index];
  } catch {}
  let colorRole = 'color';
  let selectedBrush = 'round';
  let lastBrush = 'round';
  const brushesKey = storageName('plot-studio.paint.brushes.v1');
  const savedBrushSettings = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(brushesKey) || '{}');
    for (const preset of paintBrushes) {
      if (!saved?.[preset.id]) continue;
      const settings = Object.entries(saved[preset.id]).filter(([key, value]) => brushSettings.has(key) &&
        (key === 'pressure' ? typeof value === 'boolean' : Number.isFinite(value) && value >= 0 && value <= (percentSettings.has(key) ? 1 : 256)));
      savedBrushSettings.set(preset.id, Object.fromEntries(settings));
    }
  } catch {}
  let liveBrushSignature;
  let ribbonPopup = null;
  const storage = workspaceStorage();
  const saved = new Map();
  const references = new Map();
  const persisted = new Map();
  const downloads = new Map();
  const automaticTimers = new Map();
  const automaticTimes = new Map();
  let initialStorage;
  let persistTimer;
  let persistRunning = false;
  let persistAgain = false;
  let storageReady = false;
  let open = false;
  let fitting = true;
  let showNativeStarterSize = true;
  let initialSheetId;
  let auto = false;
  let fileMode = 'open';
  let referenceTarget;
  let referenceBlob;
  let referencePreview;
  let referenceRequest;
  let internalClipboard;
  let current;
  let modalAction;
  let modalTrigger;
  let previousTabs = '';

  function say(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  const engine = createPaintEngine({ canvas, scrollContainer: viewport, onChange: sync, onError: (error) => say(error.message, true),
    onPosition: ({ x, y }) => { $('[data-paint-position]').textContent = `${x}, ${y} px`; },
  });
  initialSheetId = engine.state().sheet.id;

  function toggleReferencePanel(show) {
    referencePanel.hidden = !show;
    action('reference-panel').setAttribute('aria-expanded', String(show));
  }

  function renderReference(preview) {
    const reference = references.get(current.sheet.id);
    referenceSettings.hidden = !reference;
    const title = $('[data-paint-reference-name]');
    title.textContent = reference?.name || 'No reference image';
    title.title = reference?.name || '';
    if (reference) {
      referenceVisible.checked = reference.visible;
      referenceOpacity.value = String(reference.opacity);
      referenceFit.value = reference.fit;
      referenceWhite.checked = reference.throughWhite;
      $('[data-paint-reference-percent]').textContent = `${reference.opacity}%`;
      referenceImage.style.opacity = String(reference.opacity / 100);
      referenceImage.style.objectFit = reference.fit;
    }
    if (referenceBlob !== reference?.blob) {
      referenceBlob = reference?.blob;
      referencePreview = undefined;
      referenceImage.removeAttribute('src');
      const blob = referenceBlob;
      const request = referenceRequest = Symbol();
      if (blob) {
        void (preview ? Promise.resolve(preview) : referenceData(blob)).then(source => {
          if (referenceRequest !== request) return;
          referencePreview = source;
          referenceImage.src = source;
          renderReference();
        }).catch(() => {
          if (referenceRequest === request) say('The reference image could not be restored.', true);
        });
      }
    }
    const visible = Boolean(reference?.visible && referencePreview);
    referenceImage.hidden = !visible;
    referenceImage.parentElement.dataset.referenceThroughWhite = String(visible && reference.throughWhite);
  }

  function updateReference(changes, preview) {
    const id = current.sheet.id;
    references.set(id, { ...references.get(id), ...changes });
    renderReference(preview);
    schedulePersist();
  }

  async function setReference(blob, filename, id) {
    if (!Object.hasOwn(formats, blob?.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
    if (!blob.size || blob.size > 16 * 1024 * 1024) throw new Error('Choose a reference image up to 16 MB.');
    const source = await referenceData(blob);
    const image = new Image();
    image.src = source;
    try { await image.decode(); }
    catch { throw new Error('The reference image could not be opened.'); }
    if (image.naturalWidth > paintLimits.maxSide || image.naturalHeight > paintLimits.maxSide ||
        image.naturalWidth * image.naturalHeight > paintLimits.maxPixels) throw new Error('Choose a reference up to 8,192 pixels per side and 16 million pixels overall.');
    if (!current.sheets.some(sheet => sheet.id === id)) throw new Error('The destination sheet is no longer open.');
    const settings = { name: String(filename || 'Reference image').slice(0, 120), blob, visible: true, opacity: 40, fit: 'contain', throughWhite: false };
    if (current.sheet.id === id) {
      updateReference(settings, source);
      toggleReferencePanel(true);
    } else {
      references.set(id, settings);
      schedulePersist();
    }
  }

  function fit() {
    if (!open || !current?.sheet || !viewport.clientWidth || !viewport.clientHeight) return;
    const { width, height } = current.sheet;
    const margin = 16;
    const fitZoom = Math.max(0.1, Math.min(4, (viewport.clientWidth - margin) / width, (viewport.clientHeight - margin) / height));
    const isWideStarter = showNativeStarterSize && current.sheet.id === initialSheetId && current.sheet.revision === 0 && viewport.clientWidth >= 800;
    const zoom = isWideStarter ? 1 : fitZoom;
    if (Math.abs(zoom - current.options.zoom) > 0.004) engine.configure({ zoom });
  }

  function renderTabs(sheets, id) {
    const signature = JSON.stringify([id, ...sheets.map((sheet) => [sheet.id, sheet.name])]);
    if (signature === previousTabs) return;
    previousTabs = signature;
    const focusedInside = tabs.contains(document.activeElement);
    tabs.replaceChildren(...sheets.map((sheet) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'paint-sheet';
      tab.dataset.paintSheet = sheet.id;
      tab.id = `paint-sheet-${sheet.id}`;
      tab.textContent = sheet.name;
      tab.title = sheet.name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(sheet.id === id));
      tab.setAttribute('aria-controls', viewport.id);
      tab.tabIndex = sheet.id === id ? 0 : -1;
      return tab;
    }));
    viewport.setAttribute('aria-labelledby', `paint-sheet-${id}`);
    if (focusedInside) tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    action('remove-sheet').disabled = sheets.length <= 1;
    disableAction('add-sheet', sheets.length >= paintLimits.maxSheets);
    action('duplicate-sheet').disabled = sheets.length >= paintLimits.maxSheets;
  }

  function showAsset() {
    if (!current?.sheet) return;
    const { id, revision } = current.sheet;
    const receipt = saved.get(id);
    const pending = downloads.has(id);
    $('[data-paint-link-field]').hidden = !receipt;
    $('[data-paint-link]').value = receipt?.asset.url || '';
    action('copy-link').disabled = !receipt;
    action('save').disabled = !saveAsset || pending;
    action('use').disabled = !saveAsset || !useAsset || pending;
    action('save').querySelector('span').textContent = pending ? 'Saving…' : revision === receipt?.revision ? 'Asset saved' : 'Save asset';
  }

  function sync(next) {
    const previous = current;
    current = next;
    if (!next.sheet) return;
    const { sheets, sheet, selection, options } = next;
    renderTabs(sheets, sheet.id);
    $('[data-paint-window-title]').textContent = `${sheet.name} – Paint`;
    $('[data-paint-dimensions]').textContent = `${word.format(sheet.width)} × ${word.format(sheet.height)} px`;
    $('[data-paint-selection]').hidden = !selection;
    if (selection) $('[data-paint-selection]').textContent = `${selection.width} × ${selection.height} selected`;
    action('undo').disabled = !next.canUndo;
    action('redo').disabled = !next.canRedo;
    for (const choice of ['copy', 'cut', 'deselect', 'crop', 'delete-selection', 'invert-selection']) disableAction(choice, !selection);
    for (const tool of $$('[data-paint-tool]')) tool.setAttribute('aria-pressed', String(tool.dataset.paintTool === options.tool));
    const currentBrush = brushById.get(selectedBrush);
    const isSpray = options.tool === 'spray';
    const tip = options.brush;
    const textured = ['graphite', 'crayon', 'oil'].includes(tip);
    const paintFlow = isSpray || ['oil', 'crayon', 'graphite', 'watercolor', 'glaze', 'marker'].includes(tip);
    const treatment = {
      size: Boolean(currentBrush) || shapeTools.includes(options.tool),
      opacity: !['hand', 'select', 'eyedropper'].includes(options.tool),
      hardness: currentBrush && (isSpray || ['watercolor', 'glaze'].includes(tip)),
      flow: currentBrush && paintFlow, density: isSpray, grain: currentBrush && textured,
      angle: currentBrush && ['oil', 'chisel'].includes(tip), brushPreview: Boolean(currentBrush),
      pressure: Boolean(currentBrush), tolerance: options.tool === 'fill', text: options.tool === 'text',
    };
    for (const field of $$('[data-paint-field]')) field.hidden = !treatment[field.dataset.paintField];
    for (const field of $$('[data-paint-config]')) {
      const key = field.dataset.paintConfig;
      const value = options[key];
      if (value == null) continue;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else if (document.activeElement !== field || field.type === 'range' || field.tagName === 'SELECT') {
        field.value = String(percentSettings.has(key) ? Math.round(value * 100) : value);
      }
    }
    const number = $('[data-paint-number="size"]');
    if (document.activeElement !== number) number.value = String(options.size);
    $('[data-paint-output="size"]').textContent = `${options.size} px`;
    for (const key of ['opacity', 'hardness', 'density', 'flow', 'grain']) $('[data-paint-output="' + key + '"]').textContent = `${Math.round(options[key] * 100)}%`;
    $('[data-paint-output="angle"]').textContent = `${options.angle}°`;
    $('[data-paint-output="tolerance"]').textContent = String(options.tolerance);
    $('[data-paint-zoom-slider]').value = String(Math.min(800, Math.round(options.zoom * 100)));
    for (const control of $$('[data-paint-toggle]')) control.setAttribute('aria-pressed', String(options[control.dataset.paintToggle] === (control.dataset.paintValue === 'true')));
    for (const brush of $$('[data-paint-brush]')) brush.setAttribute('aria-pressed', String(brush.dataset.paintBrush === selectedBrush));
    const brushTrigger = $('[data-paint-menu="paint-brush-menu"]');
    brushTrigger.setAttribute('aria-pressed', String(Boolean(currentBrush)));
    brushTrigger.title = currentBrush ? `Brushes · ${currentBrush.name}` : 'Brushes';
    $('[data-paint-brush-name]').textContent = currentBrush?.name || '';
    if (currentBrush) {
      const signature = JSON.stringify([currentBrush.id, options.color, ...[...brushSettings].map(key => options[key])]);
      if (signature !== liveBrushSignature) {
        paintBrushSample($('[data-paint-live-brush]'), options, options.color === '#ffffff' ? '#909cb0' : options.color);
        liveBrushSignature = signature;
      }
    }
    for (const control of $$('[data-paint-color-role]')) {
      control.style.setProperty('--paint-role-color', options[control.dataset.paintColorRole]);
      control.setAttribute('aria-pressed', String(control.dataset.paintColorRole === colorRole));
    }
    showAsset();
    const sheetChanged = previous?.sheet?.id !== sheet.id;
    const dimensionsChanged = previous?.sheet?.width !== sheet.width || previous?.sheet?.height !== sheet.height;
    if (sheetChanged) {
      say(saved.has(sheet.id) ? 'Asset link is ready.' : '');
      if (storageReady) renderReference();
    }
    if (fitting && (sheetChanged || dimensionsChanged)) requestAnimationFrame(fit);
    if (!storageReady) return;
    const last = new Map(previous?.sheets.map((entry) => [entry.id, entry]) || []);
    if (sheetChanged || last.size !== sheets.length || sheets.some((entry) => {
      const prior = last.get(entry.id);
      return prior?.revision !== entry.revision || prior?.name !== entry.name;
    })) schedulePersist();
    if (auto) {
      for (const entry of sheets) {
        if (entry.revision > 0 && last.get(entry.id)?.revision !== entry.revision) scheduleUpload(entry);
      }
      for (const [key, timer] of automaticTimers) {
        if (!sheets.some((entry) => entry.id === key)) { clearTimeout(timer); automaticTimers.delete(key); }
      }
    }
  }

  async function restoreWorkspace() {
    const starter = engine.state().sheet.id;
    let upgraded = false;
    host.dataset.paintRestoring = 'true';
    try {
      const records = new Map((await storage.read()).map((record) => [record.id, record]));
      const workspace = records.get('@workspace');
      for (const id of workspace?.order?.slice(0, paintLimits.maxSheets) || []) {
        const record = records.get(id);
        if (!record || !(record.blob instanceof Blob)) continue;
        await engine.loadImage(record.blob, { name: record.name, id, revision: record.revision, newSheet: true });
        persisted.set(id, record);
        if (record.saved) saved.set(id, record.saved);
        if (record.reference?.blob instanceof Blob && Object.hasOwn(formats, record.reference.blob.type) &&
            typeof record.reference.name === 'string' && typeof record.reference.visible === 'boolean' &&
            Number.isInteger(record.reference.opacity) && record.reference.opacity >= 5 && record.reference.opacity <= 100 &&
            ['contain', 'cover', 'fill'].includes(record.reference.fit)) references.set(id, record.reference);
        if (engine.state().sheets.some((sheet) => sheet.id === starter)) engine.removeSheet(starter);
      }
      const legacyStarter = records.get(workspace?.order?.[0]);
      if (legacyStarter?.revision === 0 && !legacyStarter.saved) upgraded = engine.upgradeBlankStarter(legacyStarter.id);
      if (engine.state().sheets.some((sheet) => sheet.id === workspace?.active)) engine.selectSheet(workspace.active);
    } catch (error) { say('Some local drawings could not be restored.', true); }
    finally {
      host.dataset.paintRestoring = 'false';
      storageReady = true;
      sync(engine.state());
      renderReference();
      if (references.has(current.sheet.id)) toggleReferencePanel(true);
      fit();
    }
    if (upgraded) await persistWorkspace();
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistWorkspace, 650);
  }

  async function persistWorkspace() {
    if (persistRunning) { persistAgain = true; return; }
    persistRunning = true;
    const { sheet, sheets } = engine.state();
    const removed = [...persisted.keys()].filter((id) => !sheets.some((entry) => entry.id === id));
    const records = [];
    try {
      for (const entry of sheets) {
        const last = persisted.get(entry.id);
        const asset = saved.get(entry.id);
        const reference = references.get(entry.id);
        const sameBitmap = last?.revision === entry.revision && last.width === entry.width && last.height === entry.height;
        if (sameBitmap && last.name === entry.name && last.saved === asset && last.reference === reference) continue;
        const blob = sameBitmap ? last.blob : await engine.exportImage({ sheetId: entry.id, type: 'image/png' });
        if (engine.state().sheets.find((candidate) => candidate.id === entry.id)?.revision === entry.revision) records.push({ ...entry, blob, saved: asset, reference });
      }
      await storage.write([{ id: '@workspace', active: sheet.id, order: sheets.map((entry) => entry.id) }, ...records], removed);
      for (const id of removed) persisted.delete(id);
      for (const record of records) persisted.set(record.id, record);
    } catch { if (open) say('This browser could not save the local drawing workspace.', true); }
    finally {
      persistRunning = false;
      if (persistAgain) { persistAgain = false; schedulePersist(); }
    }
  }

  function scheduleUpload(sheet) {
    clearTimeout(automaticTimers.get(sheet.id));
    const wait = Math.max(2400, (automaticTimes.get(sheet.id) || 0) + 12000 - Date.now());
    automaticTimers.set(sheet.id, setTimeout(() => {
      automaticTimers.delete(sheet.id);
      if (!auto || downloads.has(sheet.id)) return;
      void upload(sheet.id, true).catch(() => {});
    }, wait));
  }

  async function upload(id, background = false) {
    if (!saveAsset) throw new Error('Studio asset storage is unavailable.');
    const item = engine.state().sheets.find((entry) => entry.id === id);
    if (!item) throw new Error('This drawing has been removed.');
    const existing = saved.get(id);
    if (existing?.revision === item.revision) return existing.asset;
    const pending = downloads.get(id);
    if (pending) {
      const asset = await pending.work;
      return pending.revision === item.revision ? asset : upload(id, background);
    }
    clearTimeout(automaticTimers.get(id));
    automaticTimers.delete(id);
    automaticTimes.set(id, Date.now());
    const work = (async () => {
      const blob = await engine.exportImage({ sheetId: id, type: 'image/png' });
      const asset = await saveAsset(blob, `${fileSlug(item.name)}.png`);
      if (!asset || typeof asset.url !== 'string') throw new Error('Studio returned an invalid asset link.');
      if (engine.state().sheets.some((sheet) => sheet.id === id)) {
        saved.set(id, { asset, revision: item.revision });
        schedulePersist();
      }
      if (engine.state().sheet.id === id) say(background ? 'Changes uploaded. The asset link is ready.' : 'Asset saved. The public link is ready.');
      return asset;
    })();
    downloads.set(id, { work, revision: item.revision });
    showAsset();
    if (engine.state().sheet.id === id) say('Saving image to Studio…');
    try { return await work; }
    catch (error) { if (engine.state().sheet.id === id) say(error.message, true); throw error; }
    finally {
      downloads.delete(id);
      showAsset();
      const latest = engine.state().sheets.find((entry) => entry.id === id);
      if (auto && latest && latest.revision !== item.revision) scheduleUpload(latest);
    }
  }

  function showDialog(title, markup, buttonText, run) {
    modalTrigger = document.activeElement;
    $('#paint-dialog-title').textContent = title;
    $('[data-paint-dialog-fields]').innerHTML = markup;
    $('[data-paint-confirm]').textContent = buttonText;
    $('[data-paint-confirm]').disabled = false;
    $('[data-paint-dialog-error]').hidden = true;
    modalAction = run;
    dialog.showModal();
  }

  function setZoom(value) {
    fitting = false;
    engine.configure({ zoom: Math.min(16, Math.max(0.1, value)) });
  }

  function closeMenu() {
    if (ribbonPopup?.matches(':popover-open')) ribbonPopup.hidePopover();
    ribbonPopup = null;
  }

  function openMenu(trigger) {
    const popup = $(`#${trigger.dataset.paintMenu}`);
    const alreadyOpen = popup.matches(':popover-open');
    closeMenu();
    if (alreadyOpen) return;
    const anchor = trigger.getBoundingClientRect();
    popup.style.left = '0px';
    popup.style.top = '0px';
    popup.showPopover({ source: trigger });
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const left = Math.max(4, Math.min(anchor.left, document.documentElement.clientWidth - width - 4));
    const top = anchor.bottom + height + 4 <= innerHeight ? anchor.bottom : Math.max(4, anchor.top - height);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    ribbonPopup = popup;
  }

  function selectRibbon(name, focus = false) {
    closeMenu();
    for (const tab of $$('[data-paint-ribbon]')) {
      const active = tab.dataset.paintRibbon === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
      if (focus && active) tab.focus();
    }
  }

  function pickTool(value) {
    if (value === 'brush') return chooseBrush(lastBrush);
    if (brushById.has(value)) return chooseBrush(value);
    selectedBrush = null;
    engine.configure({ tool: value });
    if (value === 'text' && !$('#paint-ribbon-home').hidden && !$('#paint-tool-menu').matches(':popover-open')) openMenu($('[data-paint-menu="paint-tool-menu"]'));
  }

  function chooseBrush(key) {
    const preset = brushById.get(key);
    if (!preset) return;
    selectedBrush = key;
    if (['brush', 'spray'].includes(preset.settings.tool)) lastBrush = key;
    engine.configure({ ...preset.settings, ...savedBrushSettings.get(key) });
  }

  function persistBrushes() {
    try { localStorage.setItem(brushesKey, JSON.stringify(Object.fromEntries(savedBrushSettings))); } catch {}
  }

  function drawPresetSample(key) {
    const preset = brushById.get(key);
    paintBrushSample($(`[data-paint-sample="${key}"]`), { ...preset.settings, ...savedBrushSettings.get(key) });
  }

  function configureFromControl(key, value, persist = true) {
    const { options } = engine.configure({ [key]: value });
    if (!selectedBrush || !brushSettings.has(key)) return;
    const previous = savedBrushSettings.get(selectedBrush);
    savedBrushSettings.set(selectedBrush, { ...previous, [key]: options[key] });
    if (persist) {
      persistBrushes();
      drawPresetSample(selectedBrush);
    }
  }

  function resetBrush() {
    if (!selectedBrush) return;
    savedBrushSettings.delete(selectedBrush);
    chooseBrush(selectedBrush);
    persistBrushes();
    drawPresetSample(selectedBrush);
  }

  function syncCustomColors() {
    for (const button of $$('[data-paint-custom]')) {
      const value = customColors[Number(button.dataset.paintCustom)];
      button.disabled = !value;
      button.setAttribute('aria-label', value ? `Set custom color ${value}` : 'Empty custom color');
      button.title = value || 'Empty custom color';
      button.style.setProperty('--swatch', value || '#fafafa');
      if (value) button.dataset.paintColor = value;
    }
  }

  function editColors() {
    const role = colorRole;
    showDialog('Edit Colors', paintColorMarkup(), 'OK', data => engine.configure({ [role]: data.get('pickedColor') }));
    mountPaintColors($('.paint-color-editor'), engine.state().options[role], customColors, (slot, color) => {
      customColors[slot] = color;
      try { localStorage.setItem(customColorKey, JSON.stringify(customColors)); } catch {}
      syncCustomColors();
    });
  }

  async function copySelection(cut = false) {
    if (!engine.state().selection) return;
    const image = await (cut ? engine.cutSelection() : engine.copySelection());
    if (!image) return;
    internalClipboard = image;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]); }
    catch { }
    say(cut ? 'Selection cut.' : 'Selection copied.');
  }

  async function paste() {
    if (internalClipboard) return engine.pasteImage(internalClipboard);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((name) => formats[name]);
        if (type) return engine.pasteImage(await item.getType(type));
      }
      say('No image on the clipboard.', true);
    } catch { say('Paste from the system clipboard, or choose Paste image file.', true); }
  }

  async function exportAll() {
    const files = Object.create(null);
    for (const [index, entry] of engine.state().sheets.entries()) {
      const image = await engine.exportImage({ sheetId: entry.id, type: 'image/png' });
      files[`${String(index + 1).padStart(2, '0')}-${fileSlug(entry.name)}.png`] = new Uint8Array(await image.arrayBuffer());
    }
    const zip = createZip(files);
    download(zip instanceof Blob ? zip : new Blob([zip], { type: 'application/zip' }), 'paint-sheets.zip');
  }

  function changeField(field, persist = true) {
    const key = field.dataset.paintConfig;
    if (field.type === 'checkbox') return configureFromControl(key, field.checked, persist);
    if (key === 'zoom') { if (field.valueAsNumber) setZoom(field.valueAsNumber / 100); return; }
    const value = percentSettings.has(key) ? Number(field.value) / 100 : ['size', 'tolerance', 'fontSize', 'angle'].includes(key) ? Number(field.value) : field.value;
    if (field.type === 'number' && !field.value) return;
    configureFromControl(key, value, persist);
  }

  async function openImage(blob, filename = 'Imported image') {
    if (!blob || (blob.type && !Object.hasOwn(formats, blob.type))) throw new Error('Choose a PNG, JPEG, or WebP image.');
    await openEditor();
    await engine.loadImage(blob, { newSheet: true, name: filename.replace(/\.[^.]{2,5}$/, '').slice(0, 80) || 'Imported image' });
    say('Image opened as a new sheet.');
  }

  async function runCommand(name) {
    const { sheet, options, sheets } = engine.state();
    const titleField = '<label class="paint-field"><span>Sheet name</span><input name="name" type="text" maxlength="80" required autofocus></label>';
    if (name === 'undo' || name === 'redo' || name === 'crop') return engine[name]();
    if (name === 'rotate' || name === 'rotate-left') return engine.rotate(name === 'rotate' ? 90 : -90);
    if (name === 'flip-horizontal' || name === 'flip-vertical') return engine.flip(name.slice(5));
    if (name === 'select-all') return engine.selectAll();
    if (name === 'select-rect' || name === 'select-free') { selectedBrush = null; return engine.configure({ tool: 'select', selectionShape: name.slice(7) }); }
    if (name === 'invert-selection') return engine.invertSelection();
    if (name === 'deselect') return engine.deselect();
    if (name === 'delete-selection') return engine.deleteSelection();
    if (name === 'copy' || name === 'cut') return copySelection(name === 'cut');
    if (name === 'paste') return paste();
    if (name.endsWith('zoom-in') || name.endsWith('zoom-out')) return setZoom(options.zoom * (name.endsWith('zoom-in') ? 1.25 : 0.8));
    if (name === 'actual-size') return setZoom(1);
    if (name === 'fit') { showNativeStarterSize = false; fitting = true; return fit(); }
    if (name === 'edit-colors') return editColors();
    if (name === 'brush-settings') return openMenu($('[data-paint-menu="paint-tool-menu"]'));
    if (name === 'asset-panel') { const panel = $('[data-paint-asset-panel]'); panel.hidden = !panel.hidden; return; }
    if (name === 'reference-panel') return toggleReferencePanel(referencePanel.hidden);
    if (name === 'reference-file') { referenceTarget = sheet.id; return referenceFile.click(); }
    if (name === 'reference-assets') return chooseReferenceAsset?.((blob, filename) => setReference(blob, filename, sheet.id));
    if (name === 'reference-remove') {
      references.delete(sheet.id);
      renderReference();
      action('reference-file').focus({ preventScroll: true });
      schedulePersist();
      return;
    }
    if (name === 'swap') return engine.configure({ color: options.secondaryColor, secondaryColor: options.color });
    if (name === 'duplicate-sheet') {
      const reference = references.get(sheet.id);
      const draft = engine.duplicateSheet(sheet.id);
      if (draft && reference) updateReference(reference);
      return;
    }
    if (name === 'open' || name === 'paste-image') { fileMode = name; return input.click(); }
    if (name === 'add-sheet') {
      showDialog('New sheet', `${titleField}${dimensionsMarkup(paintDefaultSize.width, paintDefaultSize.height)}<label class="paint-field"><span>Background</span><select name="background"><option value="transparent">Transparent</option><option value="#ffffff">White</option><option value="primary">Primary color</option></select></label>`, 'Create sheet', (data) => {
        const background = data.get('background');
        engine.newSheet({ name: data.get('name').trim(), width: Number(data.get('width')), height: Number(data.get('height')),
          background: background === 'primary' ? options.color : background });
      });
      $('input[name="name"]').value = `Sheet ${sheets.length + 1}`;
      return;
    }
    if (name === 'rename-sheet') {
      showDialog('Rename sheet', titleField, 'Rename', (data) => engine.renameSheet(sheet.id, data.get('name').trim()));
      $('input[name="name"]').value = sheet.name;
      return;
    }
    if (name === 'remove-sheet') return showDialog('Delete this sheet?', '<p>The local drawing and its history will be removed. Previously uploaded assets stay in your library.</p>', 'Delete sheet', () => {
      engine.removeSheet(sheet.id);
      saved.delete(sheet.id);
      references.delete(sheet.id);
      automaticTimes.delete(sheet.id);
    });
    if (name === 'clear') return showDialog('Clear canvas?', '<p>All pixels on the current sheet will become transparent. Undo can restore them.</p>', 'Clear canvas', () => engine.clear());
    if (name === 'resize') return showDialog('Resize image or canvas', `${dimensionsMarkup(sheet.width, sheet.height)}<label class="paint-field"><span>Mode</span><select name="mode"><option value="scale">Scale image to fit</option><option value="pixel">Scale using nearest neighbor</option><option value="canvas">Change canvas only</option></select></label><label class="paint-check"><input name="ratio" type="checkbox" checked> Keep aspect ratio</label>`, 'Resize', (data) => engine.resize(Number(data.get('width')), Number(data.get('height')), { scale: data.get('mode') !== 'canvas', smooth: data.get('mode') !== 'pixel' }));
    if (name === 'background') return showDialog('Remove background', '<p>Studio samples the corners and makes matching background pixels transparent.</p><label class="paint-field"><span>Tolerance</span><input name="tolerance" type="range" min="0" max="100" value="24" autofocus><output data-paint-remove-tolerance>24</output></label><label class="paint-check"><input name="everywhere" type="checkbox"> Include matching pixels inside the drawing</label>', 'Remove background', (data) => {
      const changed = engine.removeBackground({ tolerance: Number(data.get('tolerance')), allPixels: data.has('everywhere') });
      say(changed ? 'Background removed.' : 'No matching background pixels were found.');
    });
    if (['export', 'quick-export', 'file-export'].includes(name)) return showDialog('Export drawing', '<label class="paint-field"><span>Format</span><select name="type" autofocus><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option><option value="zip">All sheets · PNG ZIP</option></select></label><label class="paint-field" data-paint-quality hidden><span>Quality</span><input name="quality" type="range" min="5" max="100" value="92"></label><label class="paint-field" data-paint-matte hidden><span>JPEG background</span><input type="color" name="background" value="#ffffff"></label>', 'Download', async (data) => {
      const type = data.get('type');
      if (type === 'zip') return exportAll();
      const blob = await engine.exportImage({ type, quality: Number(data.get('quality')) / 100, background: data.get('background') });
      download(blob, `${fileSlug(sheet.name)}.${formats[blob.type] || formats[type]}`);
    });
    if (name === 'save' || name === 'use') {
      const receipt = await upload(sheet.id);
      if (name === 'use') await useAsset?.(receipt);
      else {
        $('[data-paint-asset-panel]').hidden = false;
        notify?.('Image saved to the asset library.');
      }
      return;
    }
    if (name === 'copy-link') {
      const field = $('[data-paint-link]');
      try { await navigator.clipboard.writeText(field.value); say('Asset link copied.'); }
      catch { field.focus(); field.select(); say('The public link is selected.'); }
    }
  }

  dialog.addEventListener('close', () => {
    if (modalTrigger?.isConnected) modalTrigger.focus({ preventScroll: true });
    modalTrigger = null;
  });
  $('[data-paint-form]').addEventListener('submit', async (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const confirm = $('[data-paint-confirm]');
    if (confirm.disabled || !modalAction) return;
    confirm.disabled = true;
    try {
      await modalAction(new FormData(event.currentTarget));
      if (dialog.open) dialog.close();
    } catch (error) {
      const feedback = $('[data-paint-dialog-error]');
      feedback.textContent = error.message;
      feedback.hidden = false;
    } finally { confirm.disabled = false; }
  });

  host.addEventListener('click', (event) => {
    const control = event.target.closest('button');
    if (!control || host.dataset.paintRestoring === 'true') return;
    if (control.hasAttribute('data-paint-reset-brush')) return resetBrush();
    const { paintAction, paintTool, paintSheet, paintColor, paintColorRole, paintMenu, paintRibbon, paintBrush, paintSize, paintToggle, paintValue } = control.dataset;
    if (paintMenu) return openMenu(control);
    if (paintRibbon) return selectRibbon(paintRibbon);
    if (control.closest('.paint-popup') && (paintAction || paintBrush || paintSize || paintToggle)) {
      const source = $(`[data-paint-menu="${control.closest('.paint-popup').id}"]`);
      closeMenu();
      source?.focus({ preventScroll: true });
    }
    if (paintAction) {
      void runCommand(paintAction).catch((error) => say(error.message, true));
    } else if (paintBrush) chooseBrush(paintBrush);
    else if (paintSize) configureFromControl('size', Number(paintSize));
    else if (paintToggle) engine.configure({ [paintToggle]: paintValue === 'true' });
    else if (paintColorRole) { colorRole = paintColorRole; sync(engine.state()); }
    else if (paintTool) pickTool(paintTool);
    else if (paintSheet) engine.selectSheet(paintSheet);
    else if (paintColor) engine.configure({ [colorRole]: paintColor });
  });

  host.addEventListener('contextmenu', (event) => {
    const color = event.target.closest('[data-paint-color]')?.dataset.paintColor;
    if (!color) return;
    event.preventDefault();
    engine.configure({ secondaryColor: color });
  });

  host.addEventListener('input', (event) => {
    const field = event.target;
    if (field.hasAttribute('data-paint-zoom-slider')) setZoom(Number(field.value) / 100);
    if (field === referenceOpacity && references.has(current.sheet.id)) updateReference({ opacity: Number(field.value) });
    if (field.dataset.paintConfig && ['range', 'color', 'textarea'].includes(field.type)) changeField(field, false);
    if (field.name === 'tolerance' && dialog.open) $('[data-paint-remove-tolerance]').textContent = field.value;
    if (['width', 'height'].includes(field.name) && dialog.open && $('input[name="ratio"]')?.checked && field.valueAsNumber > 0) {
      const { width, height } = engine.state().sheet;
      const sibling = $(`input[name="${field.name === 'width' ? 'height' : 'width'}"]`);
      sibling.value = String(Math.max(1, Math.round(field.valueAsNumber * (field.name === 'width' ? height / width : width / height))));
    }
  });

  host.addEventListener('change', (event) => {
    const field = event.target;
    if (field.hasAttribute('data-paint-transparency')) host.dataset.transparency = String(field.checked);
    else if (field === referenceVisible && references.has(current.sheet.id)) updateReference({ visible: field.checked });
    else if (field === referenceFit && references.has(current.sheet.id)) updateReference({ fit: field.value });
    else if (field === referenceWhite && references.has(current.sheet.id)) updateReference({ throughWhite: field.checked });
    else if (Object.hasOwn(field.dataset, 'paintAuto')) {
      auto = field.checked;
      if (!auto) {
        for (const timer of automaticTimers.values()) clearTimeout(timer);
        automaticTimers.clear();
      }
      say(auto ? 'New edits will upload after you pause.' : 'Automatic upload is off.');
    } else if (field.dataset.paintConfig) changeField(field);
    else if (field.dataset.paintNumber && field.valueAsNumber > 0) configureFromControl(field.dataset.paintNumber, field.valueAsNumber);
    else if (field.name === 'type' && dialog.open) {
      $('[data-paint-quality]').hidden = !['image/jpeg', 'image/webp'].includes(field.value);
      $('[data-paint-matte]').hidden = field.value !== 'image/jpeg';
    }
  });

  for (const menu of $$('.paint-popup')) {
    menu.addEventListener('toggle', () => {
      const visible = menu.matches(':popover-open');
      $(`[data-paint-menu="${menu.id}"]`).setAttribute('aria-expanded', String(visible));
      if (!visible && ribbonPopup === menu) ribbonPopup = null;
    });
  }
  $('.paint-ribbon-tabstrip').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const currentRibbon = event.target.dataset.paintRibbon;
    const alternate = currentRibbon === 'home' ? 'view' : 'home';
    event.preventDefault();
    event.stopPropagation();
    selectRibbon(event.key === 'Home' ? 'home' : event.key === 'End' ? 'view' : alternate, true);
  });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const mode = fileMode;
    input.value = '';
    try {
      if (mode === 'paste-image') await engine.pasteImage(file);
      else await openImage(file, file.name);
    } catch (error) { say(error.message, true); }
  });

  referenceFile.addEventListener('change', async () => {
    const file = referenceFile.files[0];
    const target = referenceTarget;
    referenceFile.value = '';
    if (!file) return;
    try { await setReference(file, file.name, target); }
    catch (error) { say(error.message, true); }
  });

  tabs.addEventListener('keydown', (event) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const { sheet, sheets } = engine.state();
    const index = sheets.findIndex((entry) => entry.id === sheet.id);
    engine.selectSheet(sheets[(index + delta + sheets.length) % sheets.length].id);
  });

  document.addEventListener('keydown', (event) => {
    if (!open || host.hidden || dialog.open || event.defaultPrevented || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && ribbonPopup?.matches(':popover-open')) return;
    let work;
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z' || key === 'y') work = () => key === 'y' || event.shiftKey ? engine.redo() : engine.undo();
      else if (key === 'a') work = () => engine.selectAll();
      else if (key === 'c' || key === 'x') work = () => copySelection(key === 'x');
      else if (key === 'v' && internalClipboard) work = paste;
      else if (key === 's') work = () => runCommand('save');
    } else if (key === 'delete' || key === 'backspace') work = () => engine.deleteSelection();
    else if (key === 'escape') work = () => engine.deselect();
    else if (!event.altKey && key.length === 1) {
      const tool = tools.find((entry) => entry[2].toLowerCase() === key);
      if (tool) work = () => pickTool(tool[0]);
    }
    if (!work) return;
    event.preventDefault();
    Promise.resolve().then(work).catch((error) => say(error.message, true));
  });

  document.addEventListener('paste', (event) => {
    if (!open || host.hidden || dialog.open || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const image = [...(event.clipboardData?.files || [])].find((file) => formats[file.type]);
    if (!image) return;
    event.preventDefault();
    Promise.resolve(engine.pasteImage(image)).catch((error) => say(error.message, true));
  });

  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(engine.state().options.zoom * (event.deltaY < 0 ? 1.1 : 0.91));
  }, { passive: false });

  viewport.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  viewport.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0];
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void openImage(file, file.name).catch((error) => say(error.message, true));
  });
  new ResizeObserver(() => { if (fitting) fit(); }).observe(viewport);

  async function openEditor() {
    open = true;
    if (!initialStorage) {
      initialStorage = restoreWorkspace();
    }
    await initialStorage;
    if (fitting) requestAnimationFrame(fit);
  }

  syncCustomColors();
  for (const { id } of paintBrushes) drawPresetSample(id);
  chooseBrush('round');
  return { open: openEditor, close() { open = false; closeMenu(); }, openImage };
}
