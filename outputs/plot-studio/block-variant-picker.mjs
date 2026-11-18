import { BLOCK_TYPES, createBlock, createEmptyProject, renderDocument } from './project.mjs';
import { BLOCK_TONES, BLOCK_VARIANTS, createVariantPreview, findBlockVariant } from './block-variants.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const groups = ['Layout', 'Content', 'Sections'];
const devices = { desktop: 1040, mobile: 390 };

function projectForPreview(project, block) {
  const template = createEmptyProject('Variant preview');
  const { settings = {} } = project ?? {};
  const source = project?.pages ?? [];
  const preview = { ...template, settings: { ...template.settings, ...settings, customCss: '', customJs: '' } };
  const pages = source.length ? source : ['Work', 'Services', 'Journal', 'About'].map((name, index) => ({
    id: 'variant-page-' + index,
    name,
    slug: index ? name.toLowerCase() : 'index',
  }));
  const spacerText = content => createBlock('text', {
    props: { text: content },
    style: { fontSize: '1rem', padding: 12, border: '1px solid var(--ps-line)' },
  });
  const blocks = block.type === 'spacer'
    ? [spacerText('Content above the spacer'), block, spacerText('Content below the spacer')]
    : [block];
  preview.pages = pages.map((page, index) => ({ ...page, blocks: index ? [] : blocks }));
  return preview;
}

function previewHtml(project, block) {
  const local = projectForPreview(project, block);
  let html = renderDocument(local.pages[0], local, '', {
    preview: true,
    includeCustomJS: false,
    headHtml: '<style>main{min-height:0!important}a:not([href]){cursor:default}</style>',
  }).replace(/<script[^>]*><\/script>/g, '')
    .replace(/<a ([^>]+)>/g, (_, attributes) => '<a ' + attributes
      .replace(/\s*href="[^"]*"/, '').replace(/\s*target="[^"]*"/, '') + '>')
    .replace(/<form(?=[\s>])/g, '<form inert');
  if (block.type === 'faq') html = html.replace('<details><summary>', '<details open><summary>');
  if (block.type === 'records-table' && block.props.columns.length) {
    const entries = [
      ['Aster', 'Materials library', 'Open'],
      ['Birch', 'Open studio', 'Booked'],
      ['Cedar', 'Model workshop', 'Open'],
    ];
    const rows = entries.map(row => '<tr>' + block.props.columns.map((_, index) =>
      '<td>' + (row[index] || 'Sample value') + '</td>').join('') + '</tr>').join('');
    html = html.replace('<tbody data-records-body></tbody>', '<tbody data-records-body>' + rows + '</tbody>')
      .replace(/(<p class="ps-records-status"[^>]*>)[^<]*/, '$1');
  }
  return html;
}

export function mountBlockVariantPicker({ getProject, onInsert, onApply }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'block-variant-picker';
  dialog.setAttribute('aria-labelledby', 'variant-picker-title');
  dialog.innerHTML = `<div class="variant-shell">
    <header class="variant-heading">
      <div><h2 id="variant-picker-title" tabindex="-1">Element variants</h2><p data-variant-hint></p></div>
      <button type="button" class="ui-button quiet variant-close" data-variant-command="close">Close</button>
    </header>
    <div class="variant-body">
      <div class="variant-types">
        <label class="variant-search"><span class="sr-only">Find an element</span><input data-variant-search type="search" placeholder="Find an element"></label>
        <nav aria-label="Element types" data-variant-types></nav>
      </div>
      <div class="variant-styles">
        <fieldset class="variant-tone-fieldset"><legend>Colors</legend><div data-variant-tones></div></fieldset>
        <p class="variant-result-count" data-variant-count></p>
        <div class="variant-style-list" role="group" aria-label="Variants" data-variant-list></div>
      </div>
      <section class="variant-preview" aria-label="Variant preview">
        <div class="variant-preview-header"><span>Preview</span><div class="variant-devices" role="group" aria-label="Preview device">
          <button type="button" data-variant-device="desktop">Desktop</button>
          <button type="button" data-variant-device="mobile">Phone</button>
        </div></div>
        <div class="variant-preview-surface"><div class="variant-frame-holder"><iframe sandbox="" title="Variant preview"></iframe></div></div>
      </section>
    </div>
    <footer class="variant-footer"><button type="button" class="ui-button quiet" data-variant-command="reset" hidden>Remove variant</button>
      <div class="variant-selected-label" aria-live="polite" data-variant-summary></div>
      <button type="button" class="ui-button primary" data-variant-command="choose">Add element</button>
    </footer>
  </div>`;
  document.body.append(dialog);

  const get = selector => dialog.querySelector(selector);
  const frame = get('iframe');
  const holder = get('.variant-frame-holder');
  const surface = get('.variant-preview-surface');
  const list = get('[data-variant-list]');
  const types = get('[data-variant-types]');
  const search = get('[data-variant-search]');
  const heading = get('#variant-picker-title');
  const choose = get('[data-variant-command=choose]');
  const reset = get('[data-variant-command=reset]');
  let type;
  let tone;
  let layout;
  let target;
  let device = 'desktop';
  let returnFocus;

  function selected() {
    return findBlockVariant(type, layout + ':' + tone);
  }

  function redrawTypes() {
    const query = search.value.trim().toLowerCase();
    types.innerHTML = groups.map(group => {
      const entries = Object.entries(BLOCK_TYPES).filter(([key, item]) => item.category === group &&
        BLOCK_VARIANTS[key] && (item.label + ' ' + (item.description ?? '') + ' ' + key).toLowerCase().includes(query));
      if (!entries.length) return '';
      return `<section><h3>${group}</h3>${entries.map(([key, item]) => `<button type="button" data-variant-type="${key}" aria-pressed="${key === type}"><span>${esc(item.label)}</span><small>${BLOCK_VARIANTS[key].length}</small></button>`).join('')}</section>`;
    }).join('') || '<p class="variant-no-results">No matching elements.</p>';
  }

  function redrawTones() {
    const schemes = [...new Set(BLOCK_VARIANTS[type].map(variant => variant.tone))];
    get('.variant-tone-fieldset').hidden = schemes.length < 2;
    const settings = getProject()?.settings;
    const useSite = scheme => {
      const palette = BLOCK_TONES[scheme].swatch;
      if (scheme !== 'studio') return palette;
      return [settings?.background, settings?.textColor, settings?.accent].map((value, index) =>
        /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : palette[index]);
    };
    get('[data-variant-tones]').innerHTML = schemes.map(key => {
      const palette = useSite(key);
      return `<button type="button" data-variant-tone="${key}" aria-pressed="${key === tone}">
        <span class="variant-swatch" style="--variant-paper:${palette[0]};--variant-ink:${palette[1]};--variant-accent:${palette[2]}" aria-hidden="true"></span>
        <span>${BLOCK_TONES[key].label}</span></button>`;
    }).join('');
  }

  function redrawList() {
    const available = BLOCK_VARIANTS[type].filter(variant => variant.tone === tone);
    get('[data-variant-count]').textContent = available.length + ' layouts';
    list.innerHTML = available.map(variant =>
      `<button type="button" data-variant-layout="${variant.layout}" aria-pressed="${variant.layout === layout}">
        <span>${esc(variant.label)}</span><small>${esc(variant.description)}</small></button>`).join('');
  }

  function sizeFrame() {
    if (!dialog.open) return;
    const maxWidth = Math.max(1, surface.clientWidth - 24);
    const maxHeight = Math.max(1, surface.clientHeight - 24);
    const logicalWidth = devices[device];
    const scale = Math.min(maxWidth / logicalWidth, 1);
    const logicalHeight = Math.max(1, maxHeight / scale);
    frame.style.width = logicalWidth + 'px';
    frame.style.height = logicalHeight + 'px';
    frame.style.transform = 'scale(' + scale + ')';
    holder.style.width = logicalWidth * scale + 'px';
    holder.style.height = maxHeight + 'px';
  }

  function updatePreview() {
    const variant = selected();
    const block = variant && createVariantPreview(type, variant.id, target);
    if (!block) return;
    get('[data-variant-summary]').textContent = type === 'spacer' ? variant.label : variant.label + ' · ' + variant.toneLabel;
    frame.srcdoc = previewHtml(getProject(), block);
    dialog.querySelectorAll('[data-variant-device]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.variantDevice === device)));
    sizeFrame();
  }

  function displayType(next, id) {
    const variant = findBlockVariant(next, id) ?? BLOCK_VARIANTS[next][0];
    type = next;
    tone = variant.tone;
    layout = variant.layout;
    redrawTypes();
    redrawTones();
    redrawList();
    updatePreview();
  }

  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    const { variantType, variantTone, variantLayout, variantDevice, variantCommand } = button.dataset;
    if (!target && variantType && type !== variantType) {
      displayType(variantType, BLOCK_VARIANTS[variantType].find(variant => variant.tone === tone)?.id);
      types.querySelector('[data-variant-type="' + variantType + '"]')?.focus({ preventScroll: true });
    } else if (variantTone && tone !== variantTone) {
      tone = variantTone;
      redrawTones();
      redrawList();
      get('[data-variant-tone="' + tone + '"]').focus({ preventScroll: true });
      updatePreview();
    } else if (variantLayout && layout !== variantLayout) {
      layout = variantLayout;
      list.querySelectorAll('[data-variant-layout]').forEach(item =>
        item.setAttribute('aria-pressed', String(item.dataset.variantLayout === layout)));
      updatePreview();
    } else if (variantDevice && device !== variantDevice) {
      device = variantDevice;
      dialog.querySelectorAll('[data-variant-device]').forEach(item =>
        item.setAttribute('aria-pressed', String(item.dataset.variantDevice === device)));
      sizeFrame();
    } else if (variantCommand === 'choose' && selected()) {
      const result = target ? onApply(type, selected().id, target.id) : onInsert(type, selected().id);
      if (result !== false) dialog.close();
    } else if (variantCommand === 'reset' && target) {
      if (onApply(type, null, target.id) !== false) dialog.close();
    } else if (variantCommand === 'close') dialog.close();
  });

  search.addEventListener('input', redrawTypes);
  dialog.addEventListener('close', () => {
    frame.removeAttribute('srcdoc');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  new ResizeObserver(sizeFrame).observe(surface);

  function open(next = 'nav', block) {
    if (!BLOCK_VARIANTS[next]) next = 'nav';
    if (!dialog.open) returnFocus = document.activeElement;
    target = block?.type === next ? block : null;
    device = matchMedia('(max-width:730px)').matches ? 'mobile' : 'desktop';
    search.value = '';
    heading.textContent = target ? BLOCK_TYPES[next].label + ' variants' : 'Element variants';
    get('[data-variant-hint]').textContent = target ? 'Preview a layout using your selected element.' : 'Choose a layout and colors for the element you want to add.';
    get('.variant-types').hidden = Boolean(target);
    choose.textContent = target ? 'Apply variant' : 'Add element';
    reset.hidden = !findBlockVariant(next, target?.props?.designVariant);
    if (!dialog.open) dialog.showModal();
    displayType(next, target?.props?.designVariant);
    heading.focus({ preventScroll: true });
  }

  return { open };
}
