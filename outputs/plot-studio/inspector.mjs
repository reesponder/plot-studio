import {
  BLOCK_TYPES, FONT_CATEGORIES, FONT_OPTIONS, googleFontStylesheet, isDirectImageUrl,
  RECORDS_TABLE_FIELD_LENGTH, RECORDS_TABLE_LABEL_LENGTH, RECORDS_TABLE_MAX_COLUMNS,
  recordsTableColumnDraft, validRecordsTableField,
} from './project.mjs';
import { canvasOffset } from './canvas-transform.mjs';

const typography = [
  ['fontFamily', 'Font family', 'font'],
  ['fontSize', 'Size'],
  ['fontWeight', 'Weight', 'select', ['100', '200', '300', '400', '500', '600', '700', '800', '900']],
  ['lineHeight', 'Line height'],
  ['letterSpacing', 'Letter spacing'],
  ['textAlign', 'Alignment', 'select', ['start', 'left', 'center', 'right', 'end', 'justify']],
];
const styleGroups = [
  ['Layout', [
    ['display', 'Display', 'select', ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none']],
    ['gap', 'Gap'],
    ['flexDirection', 'Direction', 'select', ['row', 'column', 'row-reverse', 'column-reverse']],
    ['flexWrap', 'Wrap', 'select', ['nowrap', 'wrap', 'wrap-reverse']],
    ['justifyContent', 'Main axis', 'select', ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly']],
    ['alignItems', 'Cross axis', 'select', ['start', 'center', 'end', 'stretch', 'baseline']],
    ['gridTemplateColumns', 'Grid columns', 'wide'],
    ['gridTemplateRows', 'Grid rows', 'wide'],
    ['alignSelf', 'Self alignment', 'select', ['auto', 'start', 'center', 'end', 'stretch']],
    ['overflow', 'Overflow', 'select', ['visible', 'hidden', 'clip', 'scroll', 'auto']],
  ]],
  ['Dimensions', [
    ['width', 'Width'], ['height', 'Height'],
    ['minWidth', 'Min width'], ['minHeight', 'Min height'],
    ['maxWidth', 'Max width'], ['maxHeight', 'Max height'],
    ['aspectRatio', 'Aspect ratio'],
    ['objectFit', 'Image fit', 'select', ['fill', 'contain', 'cover', 'none', 'scale-down']],
  ]],
  ['Position', [
    ['canvasX', 'Canvas X (px)', 'pixels'], ['canvasY', 'Canvas Y (px)', 'pixels'],
    ['position', 'CSS position', 'select', ['static', 'relative', 'absolute', 'fixed', 'sticky']],
    ['zIndex', 'Stack order'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom'],
  ]],
  ['Spacing', [
    ['padding', 'Padding'], ['margin', 'Margin'],
    ['paddingTop', 'Padding top'], ['marginTop', 'Margin top'],
    ['paddingRight', 'Padding right'], ['marginRight', 'Margin right'],
    ['paddingBottom', 'Padding bottom'], ['marginBottom', 'Margin bottom'],
    ['paddingLeft', 'Padding left'], ['marginLeft', 'Margin left'],
  ]],
  ['Colors', [
    ['backgroundColor', 'Background', 'color'], ['color', 'Text', 'color'],
    ['opacity', 'Opacity', 'number'],
  ]],
  ['Typography', typography],
  ['Border and shadow', [
    ['borderWidth', 'Width'],
    ['borderStyle', 'Style', 'select', ['none', 'solid', 'dashed', 'dotted', 'double']],
    ['borderColor', 'Color', 'color'], ['borderRadius', 'Corner radius'],
    ['boxShadow', 'Shadow', 'wide'],
  ]],
];
const projectTypography = [
  ['font', 'Body text', 'font'],
  ['headingFont', 'Headings', 'font'],
  ['h1Size', 'H1'], ['h2Size', 'H2'], ['h3Size', 'H3'], ['bodySize', 'Paragraph'],
];
const colors = [
  '#ffffff', '#f5f5f2', '#d4d4d0', '#8c8c84', '#222221', '#0a0a0a',
  '#ddff72', '#9ae66e', '#23a273', '#26a6bf', '#2563eb', '#5d5fef',
  '#8147cf', '#ed6ca9', '#dc3f4e', '#ff7948', '#e7a218', '#f5d76b',
];
const lengths = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'top', 'right', 'bottom', 'left',
  'gap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'fontSize', 'titleSize', 'letterSpacing', 'borderWidth', 'borderRadius',
  'h1Size', 'h2Size', 'h3Size', 'bodySize',
]);
const deviceLabels = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Phone' };
const selectLabels = {
  block: 'Block', 'inline-block': 'Inline block', flex: 'Flex', grid: 'Grid',
  'inline-flex': 'Inline flex', 'inline-grid': 'Inline grid',
  none: 'None', row: 'Row', column: 'Column', 'row-reverse': 'Reverse row',
  'column-reverse': 'Reverse column', nowrap: 'No wrap', wrap: 'Wrap',
  'wrap-reverse': 'Wrap in reverse', start: 'Start', center: 'Center',
  end: 'End', stretch: 'Stretch', baseline: 'Baseline', auto: 'Automatic',
  left: 'Left', right: 'Right', justify: 'Justify', visible: 'Visible',
  hidden: 'Hidden', clip: 'Clip', scroll: 'Scroll', fill: 'Fill',
  static: 'Static', relative: 'Relative', absolute: 'Absolute', fixed: 'Fixed', sticky: 'Sticky',
  contain: 'Contain', cover: 'Cover', 'scale-down': 'Scale down',
  solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', double: 'Double',
  'space-between': 'Space between', 'space-around': 'Space around', 'space-evenly': 'Space evenly',
};
const placeholders = {
  gap: 'e.g. 16px', width: 'e.g. 100%', height: 'e.g. auto',
  lineHeight: 'e.g. 1.5', aspectRatio: 'e.g. 16 / 9',
  gridTemplateColumns: 'e.g. repeat(3, 1fr)', gridTemplateRows: 'e.g. auto 1fr',
  boxShadow: 'e.g. 0 8px 24px #0003',
};
const loadedFonts = new Set();

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function findBlock(blocks, id) {
  for (const block of blocks ?? []) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
}

function selectionIn(project, selection) {
  const blockId = typeof selection === 'string' ? selection : selection?.blockId ?? selection?.id;
  const pageId = typeof selection === 'object' ? selection?.pageId : undefined;
  const page = project.pages.find(entry => entry.id === pageId) ?? project.pages[0];
  if (!blockId) return { page };
  for (const entry of pageId ? [page] : project.pages) {
    const block = findBlock(entry?.blocks, blockId);
    if (block) return { page: entry, block };
  }
  return { page };
}

function loadFonts(families, doc) {
  const fresh = families.filter(font => font && !loadedFonts.has(font));
  if (!fresh.length) return;
  fresh.forEach(font => loadedFonts.add(font));
  const url = googleFontStylesheet(fresh, { preview: true });
  if (!url) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  doc.head.append(link);
}

function selectOptions(options, current) {
  return options.map(option => {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : selectLabels[option] ?? option;
    return `<option value="${escape(value)}"${String(value) === String(current) ? ' selected' : ''}>${escape(label)}</option>`;
  }).join('');
}

function recordsColumnMessages(columns) {
  const fields = new Set();
  return columns.map(column => {
    const name = column.field.trim();
    const label = column.label.trim();
    if (!name && !label) return {};
    if (!validRecordsTableField(name)) return { field:'Enter a valid field ID or property name.' };
    if (fields.has(name)) return { field:'Choose a different field for this column.' };
    if (!label) return { label:'Enter a header for this column.' };
    fields.add(name);
    return {};
  });
}

function recordsColumnFields(value, project) {
  const columns = recordsTableColumnDraft(value);
  const messages = recordsColumnMessages(columns);
  const suggestions = (project.data?.tables ?? []).flatMap(table => table.fields.map(field => (
    `<option value="${escape(field.id)}">${escape(`${table.name} / ${field.name}`)}</option>`
  ))).join('');
  return `<div class="inspector-prop" data-records-columns>
    <strong>Columns</strong>
    <small class="inspector-field-help" id="records-column-help">Choose a Data field ID or type the exact property name from your Blueprint records. Add up to ${RECORDS_TABLE_MAX_COLUMNS} columns.</small>
    <datalist id="records-column-suggestions"><option value="id">Record ID</option>${suggestions}</datalist>
    ${columns.map((column, index) => {
      const { field, label } = messages[index];
      const error = field || label || '';
      const describedBy = `records-column-help records-column-error-${index}`;
      return `<div class="inspector-prop" data-records-column-row role="group" aria-label="Column ${index + 1}">
        <label><span>Field ID or JSON property</span><input type="text" data-records-column-field maxlength="${RECORDS_TABLE_FIELD_LENGTH}" list="records-column-suggestions" autocomplete="off" spellcheck="false" aria-describedby="${describedBy}"${field ? ' aria-invalid="true"' : ''} value="${escape(column.field)}"></label>
        <label><span>Header label</span><input type="text" data-records-column-label maxlength="${RECORDS_TABLE_LABEL_LENGTH}" aria-describedby="${describedBy}"${label ? ' aria-invalid="true"' : ''} value="${escape(column.label)}"></label>
        <small class="inspector-field-error" data-records-column-error id="records-column-error-${index}" role="alert"${error ? '' : ' hidden'}>${escape(error)}</small>
        <button type="button" class="ui-button quiet" data-records-column-remove="${index}">Remove column ${index + 1}</button>
      </div>`;
    }).join('')}
    <button type="button" class="ui-button quiet" data-records-column-add${columns.length >= RECORDS_TABLE_MAX_COLUMNS ? ' disabled' : ''}>Add column</button>
  </div>`;
}

function propField(field, value, project) {
  const { key, label, type, options = [] } = field;
  const attrs = `data-editor-scope="props" data-editor-key="${escape(key)}"`;
  if (type === 'records-columns') return recordsColumnFields(value, project);
  if (type === 'image' || type === 'image-list') {
    const multiple = type === 'image-list';
    const legacy = !multiple && value && !isDirectImageUrl(value);
    const hint = `image-url-${escape(key)}`;
    const fieldAttrs = `${attrs} data-editor-image="${multiple ? 'list' : 'single'}" aria-describedby="${hint}"`;
    const control = multiple
      ? `<textarea ${fieldAttrs} rows="4" spellcheck="false" placeholder="https://example.com/photo.webp | Alt text | Caption">${escape(value)}</textarea>`
      : `<input ${fieldAttrs} type="url" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://example.com/photo.webp" value="${legacy ? '' : escape(value)}">`;
    const help = multiple ? 'One direct image URL per line. Separate alt text and caption with |.' : legacy ? 'This draft has an existing image. Paste a direct URL to replace it.' : 'Paste a direct HTTP or HTTPS image link.';
    return `<div class="inspector-prop inspector-image-url"><label><span>${escape(multiple ? label : `${label} URL`)}</span>${control}</label><small id="${hint}" class="inspector-field-help">${help}</small><small class="inspector-field-error" role="alert" hidden></small><div class="inspector-image-actions"><button type="button" class="inspector-image-library" data-choose-image="${escape(key)}" data-image-list="${multiple}">Choose from assets</button>${multiple ? '' : `<button type="button" class="inspector-image-remove" data-remove-image="${escape(key)}"${value ? '' : ' hidden'}>Remove image</button>`}</div></div>`;
  }
  if (type === 'checkbox') {
    return `<label class="inspector-toggle"><input ${attrs} type="checkbox"${value ? ' checked' : ''}> <span>${escape(label)}</span></label>`;
  }
  let item;
  switch (type) {
    case 'textarea':
      item = `<textarea ${attrs} rows="3">${escape(value)}</textarea>`;
      break;
    case 'select':
      item = `<select ${attrs}>${selectOptions(options, value)}</select>`;
      break;
    default:
      item = `<input ${attrs} type="${type === 'number' ? 'number' : 'text'}" value="${escape(value)}"${type === 'url' ? ' placeholder="/path or https://…"' : ''}>`;
  }
  return `<div class="inspector-prop"><label><span>${escape(label)}</span>${item}</label></div>`;
}

function styleField(definition, scope, local, inherited) {
  const [key, label, kind = 'text', choices = []] = definition;
  const value = local[key] ?? '';
  const fallback = inherited[key] ?? '';
  const attrs = `data-editor-scope="${scope}" data-editor-key="${key}"`;
  let item;
  if (kind === 'font') {
    const displayed = escape(value || fallback || 'Inherited');
    item = `<button class="inspector-font-trigger" type="button" data-editor-font="${scope}:${key}" aria-label="${escape(label)}: ${displayed}" aria-expanded="false"><span>${displayed}</span><span aria-hidden="true">⌄</span></button>`;
  } else if (kind === 'select') {
    item = `<select ${attrs}><option value="">${escape(selectLabels[fallback] ?? fallback ?? 'Default') || 'Default'}</option>${selectOptions(choices, value)}</select>`;
  } else if (kind === 'color') {
    const hex = /^#[\da-f]{6}$/i.test(value || fallback) ? value || fallback : '#ffffff';
    item = `<div class="inspector-color-row"><input ${attrs} type="text" value="${escape(value)}" placeholder="${escape(fallback || 'Default')}" aria-label="${escape(label)}"><input ${attrs} type="color" value="${escape(hex)}" aria-label="Color picker for ${escape(label)}"></div>
      <button class="inspector-swatches-trigger" type="button" data-editor-colors="${scope}:${key}" aria-expanded="false">Swatches <span aria-hidden="true">⌄</span></button>`;
  } else {
    const numeric = kind === 'number';
    if (kind === 'pixels') {
      item = `<input ${attrs} type="number" min="-100000" max="100000" step="any" value="${value === '' ? '' : canvasOffset(value)}" placeholder="${canvasOffset(fallback)}">`;
    } else {
      item = `<input ${attrs} type="${numeric ? 'number' : 'text'}" ${numeric ? 'min="0" max="1" step=".05"' : ''} value="${escape(value)}" placeholder="${escape(fallback || placeholders[key] || (lengths.has(key) ? 'auto / px' : 'Default'))}">`;
    }
  }
  const fieldClass = `inspector-field${['font', 'wide', 'color'].includes(kind) ? ' inspector-field-wide' : ''}`;
  if (kind === 'font' || kind === 'color') return `<div class="${fieldClass}"><span>${escape(label)}</span>${item}</div>`;
  return `<label class="${fieldClass}"><span>${escape(label)}</span>${item}</label>`;
}

function styleGroup(title, content, open = false) {
  return `<details class="inspector-group" data-group="${escape(title)}"${open ? ' open' : ''}>
    <summary>${escape(title)}<span aria-hidden="true">⌄</span></summary>
    <div class="inspector-fields">${content}</div>
  </details>`;
}

function cleanValue(control, scope, key) {
  if (control.type === 'checkbox') return control.checked;
  if (scope === 'style' || scope === 'settings') {
    const value = control.value.trim();
    if (key === 'canvasX' || key === 'canvasY') return value === '' ? '' : canvasOffset(control.valueAsNumber);
    return lengths.has(key) && /^-?\d*\.?\d+$/.test(value) && Number(value) !== 0 ? `${value}px` : value;
  }
  if (control.type === 'number' && control.value !== '') return control.valueAsNumber;
  return control.value;
}

export function mountInspector(root, { getProject, getSelection, getDevice, onChange, onImageLibrary, hasVariants = () => false }) {
  const doc = root.ownerDocument;
  const tabByType = new Map();
  const openByKey = new Map();
  let lastKey = '';
  let previousSelectionKey = '';
  let activeTab = 'content';
  let fontObserver;
  let writing = false;

  root.classList.add('studio-inspector');

  function context() {
    const project = getProject();
    const selection = getSelection();
    return { project, device: getDevice() || 'desktop', ...selectionIn(project, selection) };
  }

  function applyChange(mutator, options) {
    writing = true;
    try {
      onChange(mutator, options);
    } finally {
      writing = false;
    }
  }

  function refresh(force = false) {
    const { project, page, block, device } = context();
    const selectionKey = `${page?.id ?? ''}/${block?.id ?? ''}`;
    if (selectionKey !== previousSelectionKey) {
      activeTab = tabByType.get(block?.type) ?? (BLOCK_TYPES[block?.type]?.fields?.length ? 'content' : 'style');
      previousSelectionKey = selectionKey;
    }
    const key = `${selectionKey}/${device}/${activeTab}`;
    if (!force && lastKey === key && (writing || (doc.activeElement !== root && root.contains(doc.activeElement)))) return;
    const previousGroups = [...root.querySelectorAll('details[data-group]')];
    if (previousGroups.length) openByKey.set(lastKey, new Set(previousGroups.filter(group => group.open).map(group => group.dataset.group)));
    lastKey = key;
    const opened = openByKey.get(key);
    fontObserver?.disconnect();
    if (!block) {
      const settings = project.settings ?? {};
      const projectSizes = projectTypography.map(field => styleField(field, 'settings', settings, {})).join('');
      const accent = styleField(['accent', 'Accent', 'color'], 'settings', settings, {});
      root.innerHTML = `<div class="inspector-title"><span>Settings</span><strong>${escape(page?.name || 'Site')}</strong></div>
        ${page ? `<div class="inspector-page"><label><span>Page name</span><input type="text" data-editor-scope="page" data-editor-key="name" value="${escape(page.name)}"></label></div>` : ''}
        ${styleGroup('Site typography', projectSizes, opened ? opened.has('Site typography') : true)}
        ${styleGroup('Site colors', accent, opened ? opened.has('Site colors') : true)}`;
      return;
    }
    const schema = BLOCK_TYPES[block.type];
    const local = device === 'desktop' ? block.style ?? {} : block.styles?.[device] ?? {};
    const inherited = device === 'desktop' ? {} : {
      ...block.style, ...(device === 'mobile' ? block.styles?.tablet : {}),
    };
    const panels = [
      ['content', 'Content', schema?.fields?.length],
      ['style', 'Style', true],
    ].filter(([, , visible]) => visible);
    const tabs = panels.length > 1 ? `<div class="inspector-tabs" role="group" aria-label="Inspector view">${panels.map(([value, label]) => (
      `<button data-editor-tab="${value}" type="button" aria-pressed="${activeTab === value}">${label}</button>`
    )).join('')}</div>` : '';
    let body;
    if (activeTab === 'content') {
      body = `<div class="inspector-props">${(schema?.fields ?? []).map(field => propField(field, block.props?.[field.key], project)).join('')}</div>`;
    } else {
      const groups = styleGroups.map(([title, fields], index) => {
        const visibleFields = title === 'Typography' && block.type === 'hero'
          ? [...fields, ['titleSize', 'Hero title size']] : fields;
        return styleGroup(title,
          visibleFields.map(field => styleField(field, 'style', local, inherited)).join(''),
          opened ? opened.has(title) : index === 0 || (title === 'Typography' && ['heading', 'text'].includes(block.type)),
        );
      }).join('');
      body = `<div class="inspector-device"><span>${escape(deviceLabels[device] ?? device)}</span>
        ${device === 'desktop' ? '<span>Base style</span>' : '<button type="button" data-editor-reset>Clear overrides</button>'}</div>${groups}`;
    }
    root.innerHTML = `<div class="inspector-title"><span>Block</span><strong>${escape(schema?.label ?? block.type)}</strong>${hasVariants(block.type) ? '<button class="library-variants inspector-variant-action" type="button" data-command="change-block-variant">Change variant</button>' : ''}</div>${tabs}${body}`;
  }

  function update(scope, key, value, { source = 'inspector', commit = true } = {}) {
    const { page, block, device } = context();
    if (!page && scope !== 'settings') return;
    applyChange(project => {
      if (scope === 'settings') {
        project.settings ??= {};
        if (value === '') delete project.settings[key];
        else project.settings[key] = value;
        return;
      }
      const currentPage = project.pages.find(entry => entry.id === page.id);
      if (scope === 'page') {
        if (currentPage && (key !== 'name' || value.trim())) currentPage[key] = value;
        return;
      }
      const currentBlock = findBlock(currentPage?.blocks, block?.id);
      if (!currentBlock) return;
      if (scope === 'props') {
        currentBlock.props ??= {};
        currentBlock.props[key] = value;
        return;
      }
      currentBlock.style ??= {};
      currentBlock.styles ??= {};
      const styles = device === 'desktop' ? currentBlock.style : (currentBlock.styles[device] ??= {});
      if (value === '') delete styles[key];
      else styles[key] = value;
    }, { source, commit, coalesceKey: `${page?.id}/${block?.id}/${device}/${scope}/${key}` });
  }

  function openFontMenu(button, scope, key) {
    const menu = doc.createElement('div');
    menu.className = 'inspector-picker inspector-font-picker';
    const categories = [...new Set(Object.values(FONT_CATEGORIES))].sort();
    const categoryInput = categories.length
      ? `<label><span>Category</span><select><option value="">All fonts</option>${selectOptions(categories, '')}</select></label>` : '';
    menu.innerHTML = `<div class="inspector-font-filters"><label><span>Search fonts</span><input data-editor-font-search type="search" placeholder="Font name"></label>${categoryInput}</div><div class="inspector-font-list" role="group" aria-label="Fonts"></div>`;
    const search = menu.querySelector('input');
    const category = menu.querySelector('select');
    const result = menu.querySelector('.inspector-font-list');
    const fonts = FONT_OPTIONS.map(entry => typeof entry === 'string' ? entry : entry.name ?? entry.family);
    const { project, block, device } = context();
    const local = scope === 'settings' ? project.settings : device === 'desktop' ? block?.style : block?.styles?.[device];
    const displayed = local?.[key] ?? '';
    const renderRows = () => {
      fontObserver?.disconnect();
      const query = search.value.trim().toLocaleLowerCase('en');
      const options = fonts.filter(font => (
        font.toLocaleLowerCase('en').includes(query) && (!category?.value || FONT_CATEGORIES[font] === category.value)
      ));
      result.innerHTML = `<button type="button" class="inspector-font-option" data-editor-picked-font="" aria-pressed="${!displayed}"><span>Default</span><span>Ag 09</span></button>`
        + options.map(font => `<button type="button" class="inspector-font-option" data-editor-picked-font="${escape(font)}" aria-pressed="${font === displayed}"><span>${escape(font)}</span><span style="font-family:'${escape(font)}',sans-serif">Ag 09</span></button>`).join('');
      if (typeof IntersectionObserver === 'undefined') {
        loadFonts(options.slice(0, 12), doc);
        return;
      }
      fontObserver = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        loadFonts(visible.map(entry => entry.target.dataset.editorPickedFont), doc);
        visible.forEach(entry => fontObserver.unobserve(entry.target));
      }, { root: result });
      result.querySelectorAll('[data-editor-picked-font]').forEach(option => fontObserver.observe(option));
    };
    menu.dataset.scope = scope;
    menu.dataset.key = key;
    button.after(menu);
    button.setAttribute('aria-expanded', 'true');
    renderRows();
    search.addEventListener('input', renderRows);
    category?.addEventListener('change', renderRows);
    search.focus();
  }

  function openColorMenu(button, scope, key) {
    const menu = doc.createElement('div');
    menu.className = 'inspector-picker inspector-swatch-list';
    menu.dataset.scope = scope;
    menu.dataset.key = key;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Color swatches');
    menu.innerHTML = colors.map(color => (
      `<button type="button" data-editor-picked-color="${color}" aria-label="${color}" style="--inspector-swatch:${color}"></button>`
    )).join('');
    button.after(menu);
    button.setAttribute('aria-expanded', 'true');
  }

  function closeOpenMenus(except) {
    for (const menu of root.querySelectorAll('.inspector-picker')) {
      if (menu === except) continue;
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
      if (menu.classList.contains('inspector-font-picker')) fontObserver?.disconnect();
      menu.remove();
    }
  }

  function commitImage(control) {
    const key = control.dataset.editorKey;
    const value = control.value.trim();
    const isList = control.dataset.editorImage === 'list';
    const oldLines = new Set(String(context().block?.props?.[key] || '').split(/\r?\n/).map(line => line.trim()));
    const invalid = isList && value ? value.split(/\r?\n/).findIndex(line => {
      const source = line.split('|')[0].trim();
      return line.trim() && !isDirectImageUrl(source) && !oldLines.has(line.trim());
    }) : -1;
    const message = invalid >= 0 ? `Line ${invalid + 1} needs a direct HTTP or HTTPS image link.` :
      !isList && value && !isDirectImageUrl(value) ? 'Enter a direct HTTP or HTTPS image link.' : '';
    const field = control.closest('.inspector-image-url');
    const error = field.querySelector('.inspector-field-error');
    error.textContent = message;
    error.hidden = !message;
    if (message) { control.setAttribute('aria-invalid', 'true'); return; }
    control.removeAttribute('aria-invalid');
    update('props', key, value);
    if (!isList) {
      field.querySelector('[data-remove-image]').hidden = !value;
      field.querySelector('.inspector-field-help').textContent = 'Paste a direct HTTP or HTTPS image link.';
    }
  }

  function editRecordsColumns(tableFields, commit) {
    const controls = Array.from(tableFields.querySelectorAll('[data-records-column-row]'), row => ({
      field:row.querySelector('[data-records-column-field]'),
      label:row.querySelector('[data-records-column-label]'),
      status:row.querySelector('[data-records-column-error]'),
    }));
    const columns = controls.map(column => ({ field:column.field.value, label:column.label.value }));
    const messages = recordsColumnMessages(columns);
    controls.forEach(({ field, label, status }, index) => {
      const problems = messages[index];
      for (const [key, input] of Object.entries({ field, label })) {
        if (problems[key]) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      const message = problems.field || problems.label || '';
      if (status.textContent !== message) status.textContent = message;
      status.hidden = !message;
    });
    update('props', 'columns', columns, { commit });
  }

  root.addEventListener('input', ({ target }) => {
    const tableFields = target.closest('[data-records-columns]');
    if (tableFields) { editRecordsColumns(tableFields, false); return; }
    const { editorScope, editorKey } = target.dataset ?? {};
    if (!editorScope || target.matches('select, [type="checkbox"], [data-editor-image]')) return;
    update(editorScope, editorKey, cleanValue(target, editorScope, editorKey), { commit: false });
    if (editorScope === 'page' && editorKey === 'name' && target.value.trim()) {
      root.querySelector('.inspector-title strong').textContent = target.value;
    }
    if (target.type === 'color') target.previousElementSibling.value = target.value;
    if (target.type === 'text' && target.nextElementSibling?.type === 'color' && /^#[\da-f]{6}$/i.test(target.value)) {
      target.nextElementSibling.value = target.value;
    }
  });
  root.addEventListener('change', ({ target }) => {
    const tableFields = target.closest('[data-records-columns]');
    if (tableFields) { editRecordsColumns(tableFields, true); return; }
    const { editorScope, editorKey, editorImage } = target.dataset ?? {};
    if (editorImage) commitImage(target);
    else if (editorScope) update(editorScope, editorKey, cleanValue(target, editorScope, editorKey));
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input[data-editor-image]')) {
      event.preventDefault();
      event.target.blur();
      return;
    }
    if (event.key !== 'Escape') return;
    const menu = event.target.closest('.inspector-picker');
    if (!menu) return;
    event.stopPropagation();
    const trigger = menu.previousElementSibling;
    closeOpenMenus();
    trigger?.focus();
  });
  root.addEventListener('click', ({ target }) => {
    const button = target.closest('button');
    if (!button) return;
    if (button.dataset.chooseImage) {
      const { page, block } = context();
      if (page && block) onImageLibrary?.({ pageId: page.id, blockId: block.id, key: button.dataset.chooseImage, multiple: button.dataset.imageList === 'true' });
      return;
    }
    if (button.matches('[data-records-column-add], [data-records-column-remove]')) {
      const { block } = context();
      if (block?.type !== 'records-table') return;
      const columns = recordsTableColumnDraft(block.props?.columns);
      const add = button.hasAttribute('data-records-column-add');
      const index = add ? columns.length : Number(button.dataset.recordsColumnRemove);
      if (add && index < RECORDS_TABLE_MAX_COLUMNS) columns.push({ field:'', label:'' });
      else if (!add && Number.isInteger(index) && index >= 0 && index < columns.length) columns.splice(index, 1);
      else return;
      update('props', 'columns', columns);
      refresh(true);
      const field = root.querySelectorAll('[data-records-column-field]')[Math.min(index, columns.length - 1)];
      (field ?? root.querySelector('[data-records-column-add]'))?.focus();
      return;
    }
    if (button.dataset.removeImage) {
      update('props', button.dataset.removeImage, '');
      refresh(true);
      root.querySelector(`[data-editor-key="${CSS.escape(button.dataset.removeImage)}"]`)?.focus();
      return;
    }
    const { editorTab, editorFont, editorColors, editorPickedFont, editorPickedColor } = button.dataset;
    if (editorTab) {
      const { block } = context();
      activeTab = editorTab;
      tabByType.set(block?.type, editorTab);
      refresh(true);
      root.querySelector(`[data-editor-tab="${editorTab}"]`)?.focus();
      return;
    }
    if (editorFont || editorColors) {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      closeOpenMenus();
      if (isOpen) return;
      const [scope, key] = (editorFont || editorColors).split(':');
      if (editorFont) openFontMenu(button, scope, key);
      else openColorMenu(button, scope, key);
      return;
    }
    if (editorPickedFont !== undefined || editorPickedColor !== undefined) {
      const { scope, key } = button.closest('.inspector-picker').dataset;
      update(scope, key, editorPickedFont ?? editorPickedColor);
      refresh(true);
      const trigger = editorPickedColor === undefined ? 'font' : 'colors';
      root.querySelector(`[data-editor-${trigger}="${scope}:${key}"]`)?.focus();
      return;
    }
    if (button.hasAttribute('data-editor-reset')) {
      const { block, page, device } = context();
      applyChange(project => {
        const currentPage = project.pages.find(entry => entry.id === page.id);
        const currentBlock = findBlock(currentPage?.blocks, block.id);
        if (currentBlock?.styles) currentBlock.styles[device] = {};
      }, { source: 'inspector', commit: true });
      refresh(true);
      root.querySelector('[data-editor-reset]')?.focus();
    }
  });
  refresh();
  return { refresh };
}
