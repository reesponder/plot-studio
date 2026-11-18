export const paintPalette = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
];

const preset = (id, name, tip, brush, size, options = {}) => ({ id, name, tip,
  settings: { tool: 'brush', brush, size, opacity: 1, pressure: true, hardness: .6,
    density: .55, flow: .72, grain: .55, angle: 36, ...options } });

export const classicPaintBrushes = [
  preset('round', 'Brush', 'bristle', 'round', 8),
  preset('calligraphy-brush', 'Calligraphy brush', 'flat', 'chisel', 16, { angle: 40 }),
  preset('calligraphy-pen', 'Calligraphy pen', 'nib', 'chisel', 13, { angle: 132 }),
  preset('airbrush', 'Airbrush', 'spray', 'round', 31, { tool: 'spray', density: .54, hardness: .22, flow: .75 }),
  preset('oil', 'Oil brush', 'bristle', 'oil', 25, { angle: 71, grain: .53, flow: .84 }),
  preset('crayon', 'Crayon', 'crayon', 'crayon', 20, { grain: .65 }),
  preset('marker', 'Marker', 'marker', 'marker', 17, { flow: .63 }),
  preset('natural-pencil', 'Natural pencil', 'pencil', 'graphite', 5, { grain: .31, flow: .62 }),
  preset('watercolor', 'Watercolor brush', 'bristle', 'watercolor', 25, { hardness: .12, flow: .54 }),
];

export const studioPaintBrushes = [
  preset('pencil', 'Pencil', 'pencil', 'pixel', 2, { tool: 'pencil' }),
  preset('ink', 'Fine ink', 'nib', 'round', 3),
  preset('felt', 'Felt tip', 'marker', 'felt', 10),
  preset('highlighter', 'Highlighter', 'marker', 'marker', 29, { opacity: .53, flow: .64 }),
  preset('soft', 'Soft brush', 'bristle', 'glaze', 47, { hardness: .03, flow: .76 }),
  preset('pixel', 'Pixel brush', 'pixel', 'pixel', 7, { pressure: false }),
  preset('broad', 'Broad brush', 'flat', 'flat', 32),
  preset('chalk', 'Chalk', 'crayon', 'crayon', 27, { grain: .92, flow: .79 }),
  preset('charcoal', 'Charcoal', 'pencil', 'graphite', 19, { grain: .71, flow: .67 }),
  preset('spray', 'Spray paint', 'spray', 'round', 49, { tool: 'spray', density: .77, hardness: .64, flow: .86 }),
  preset('dry-oil', 'Dry bristles', 'flat', 'oil', 33, { angle: 118, grain: .95, flow: .78 }),
  preset('eraser', 'Eraser', 'eraser', 'round', 19, { tool: 'eraser' }),
];

export const paintBrushes = [...classicPaintBrushes, ...studioPaintBrushes];

export function paintRibbon({ icon, tools, shapeTools, fileTypes }) {
  const command = (action, label, glyph = action, kind = '') => `<button type="button" class="paint-button ${kind}" data-paint-action="${action}" ${kind === 'paint-quick' ? `aria-label="${label}" title="${label}"` : ''}>${icon(glyph)}<span>${label}</span></button>`;
  const tool = id => {
    const [, label, shortcut] = tools.find(entry => entry[0] === id);
    return `<button type="button" class="paint-tool" data-paint-tool="${id}" aria-label="${label}" title="${label}${shortcut ? ` (${shortcut})` : ''}" aria-pressed="false">${icon(id)}</button>`;
  };
  const group = (name, content, extra = '') => `<section class="paint-group ${extra}" aria-label="${name}"><div class="paint-group-body">${content}</div><span class="paint-group-label" aria-hidden="true">${name}</span></section>`;
  const menu = (id, label, glyph, contents, kind = '') => `<button type="button" class="paint-menu-trigger ${kind}" data-paint-menu="${id}" aria-expanded="false" aria-controls="${id}">${icon(glyph)}<span>${label}</span><i aria-hidden="true" class="paint-caret"></i></button><div class="paint-popup" id="${id}" popover>${contents}</div>`;
  const radio = (key, on, label) => `<button type="button" class="paint-button" data-paint-toggle="${key}" data-paint-value="${on}" aria-pressed="false"><span>${label}</span></button>`;
  const slider = (key, label, min, max) => `<div class="paint-option-row" data-paint-field="${key}"><label for="paint-${key}">${label}</label><output data-paint-output="${key}"></output><input id="paint-${key}" data-paint-config="${key}" type="range" min="${min}" max="${max}" step="1"></div>`;
  const settings = `<div class="paint-setting-body"><div class="paint-current-brush" data-paint-field="brushPreview"><strong data-paint-brush-name></strong><canvas data-paint-live-brush width="192" height="54" aria-hidden="true"></canvas></div>
    <div class="paint-option-row" data-paint-field="size"><label for="paint-stroke-size">Stroke width</label><output data-paint-output="size"></output><input id="paint-stroke-size" data-paint-config="size" type="range" min="1" max="200" step="1" value="8"><label class="paint-measure"><span class="sr-only">Exact stroke width</span><input data-paint-number="size" type="number" min="1" max="200" value="8" inputmode="numeric"> px</label></div>
    <div class="paint-option-row" data-paint-field="opacity"><label for="paint-opacity">Opacity</label><output data-paint-output="opacity"></output><input id="paint-opacity" data-paint-config="opacity" type="range" min="1" max="100" value="100"></div>
    <div class="paint-option-row" data-paint-field="hardness"><label for="paint-hardness">Hardness</label><output data-paint-output="hardness"></output><input id="paint-hardness" data-paint-config="hardness" type="range" min="0" max="100" value="65"></div>
    ${slider('density', 'Spray density', 5, 100)}${slider('flow', 'Paint flow', 5, 100)}${slider('grain', 'Grain', 0, 100)}${slider('angle', 'Nib angle', 0, 179)}
    <label class="paint-check" data-paint-field="pressure"><input data-paint-config="pressure" type="checkbox"> Pen pressure</label>
    <button class="paint-button paint-reset-brush" type="button" data-paint-field="brushPreview" data-paint-reset-brush>Reset this brush</button>
    <div class="paint-option-row" data-paint-field="tolerance"><label for="paint-fill-tolerance">Fill tolerance</label><output data-paint-output="tolerance"></output><input id="paint-fill-tolerance" data-paint-config="tolerance" type="range" min="0" max="100" value="24"></div>
    <div class="paint-text-options" data-paint-field="text" hidden>
      <label class="paint-field"><span>Text</span><textarea data-paint-config="text" rows="3" maxlength="500" placeholder="Type, then place on canvas"></textarea></label>
      <div class="paint-fields"><label class="paint-field"><span>Font</span><select data-paint-config="font"><option value="Arial">Sans</option><option value="serif">Serif</option><option value="monospace">Mono</option></select></label><label class="paint-field"><span>Size in px</span><input data-paint-config="fontSize" type="number" min="6" max="512" value="28"></label></div>
      <div class="paint-toggles"><label class="paint-check"><input data-paint-config="bold" type="checkbox"> Bold</label><label class="paint-check"><input data-paint-config="italic" type="checkbox"> Italic</label></div>
    </div>
  </div>`;
  const swatches = paintPalette.map(color => `<button type="button" class="paint-swatch" data-paint-color="${color}" style="--swatch:${color}" title="${color}" aria-label="Set color ${color}"></button>`).join('');
  const savedSwatches = Array.from({ length: 10 }, (_, index) => `<button type="button" class="paint-swatch paint-custom-swatch" data-paint-custom="${index}" disabled aria-label="Empty custom color"></button>`).join('');
  const selectionMenu = `<strong>Selection shapes</strong>${command('select-rect', 'Rectangular selection', 'select')}${command('select-free', 'Free-form selection', 'lasso')}
    <strong>Selection options</strong>${command('select-all', 'Select all', 'select')}${command('invert-selection', 'Invert selection', 'invert')}${command('delete-selection', 'Delete', 'delete')}${command('deselect', 'Deselect', 'minus')}
    <label class="paint-check"><input data-paint-config="transparentSelection" type="checkbox"> Transparent selection</label>`;
  const rotator = command('rotate', 'Rotate right', 'rotate') + command('rotate-left', 'Rotate left', 'rotate-left') + command('flip-vertical', 'Flip vertically', 'flip-vertical') + command('flip-horizontal', 'Flip horizontally', 'flip-horizontal');
  const brushGrid = (title, entries) => `<section class="paint-brush-gallery-group" aria-label="${title}"><strong>${title}</strong><div class="paint-brush-gallery">${entries.map(({ id, name, tip }) => `<button type="button" data-paint-brush="${id}" data-paint-tip="${tip}" class="paint-brush-tile" title="${name}" aria-label="${name}" aria-pressed="false"><span class="paint-brush-card"><canvas data-paint-sample="${id}" width="88" height="46" aria-hidden="true"></canvas><i aria-hidden="true"></i></span><span class="paint-brush-label">${name}</span></button>`).join('')}</div></section>`;
  const brushMenu = `${brushGrid('Classic brushes', classicPaintBrushes)}${brushGrid('Studio brushes', studioPaintBrushes)}<div class="paint-brush-menu-footer">${command('brush-settings', 'Brush settings…', 'sliders')}</div>`;
  const toolbar = [
    group('Clipboard', menu('paint-paste-menu', 'Paste', 'paste', command('paste', 'Paste', 'paste') + command('paste-image', 'Paste from', 'open'), 'paint-tall') + `<div class="paint-stack">${command('cut', 'Cut')}${command('copy', 'Copy')}</div>`),
    group('Image', menu('paint-select-menu', 'Select', 'select', selectionMenu, 'paint-tall') + `<div class="paint-stack">${command('crop', 'Crop selection', 'crop')}${command('resize', 'Resize', 'resize')}${menu('paint-rotate-menu', 'Rotate', 'rotate', rotator, 'paint-small')}</div>`),
    group('Tools', `<div class="paint-tool-grid">${['pencil', 'fill', 'text', 'eraser', 'eyedropper', 'hand'].map(tool).join('')}</div>` + menu('paint-tool-menu', 'Tool options', 'sliders', settings, 'paint-options-launcher')),
    group('Brushes', menu('paint-brush-menu', 'Brushes', 'brush', brushMenu, 'paint-tall paint-brush-trigger') + command('brush-settings', 'Brush settings', 'sliders', 'paint-quick'), 'paint-brush-group'),
    group('Shapes', `<div class="paint-shape-grid" role="group" aria-label="Shapes">${shapeTools.map(tool).join('')}</div><div class="paint-stack">${menu('paint-outline-menu', 'Outline', 'outline', radio('stroke', false, 'No outline') + radio('stroke', true, 'Solid color'), 'paint-small')}${menu('paint-fill-menu', 'Fill', 'fill', radio('fill', false, 'No fill') + radio('fill', true, 'Solid color') + '<label class="paint-check"><input data-paint-config="fill" type="checkbox"> Fill shape</label>', 'paint-small')}</div>`),
    group('Size', menu('paint-size-menu', 'Size', 'size', [1, 3, 5, 8, 12].map(size => `<button class="paint-button paint-size-option" type="button" data-paint-size="${size}"><i aria-hidden="true" style="--weight:${size}px"></i><span>${size} px</span></button>`).join('') + command('brush-settings', 'Adjust size…', 'sliders'), 'paint-tall')),
    group('Colors', `<button type="button" class="paint-color-role paint-tall" data-paint-color-role="color" aria-pressed="true"><i></i><span>Color<br>1</span></button><button type="button" class="paint-color-role paint-tall" data-paint-color-role="secondaryColor" aria-pressed="false"><i></i><span>Color<br>2</span></button><div class="paint-swatches" role="group" aria-label="Palette">${swatches}${savedSwatches}</div>${command('edit-colors', 'Edit colors', 'spectrum', 'paint-tall')}`, 'paint-colors-group'),
    group('Studio', command('save', 'Save asset', 'upload', 'paint-tall') + `<div class="paint-stack">${command('background', 'Remove background', 'background')}${command('asset-panel', 'Asset link', 'link')}${command('export', 'Export', 'download')}</div>`),
  ].join('');
  return `<header class="paint-window" aria-label="Paint ribbon">
    <div class="paint-titlebar"><span class="paint-brand-icon" aria-hidden="true">${icon('brush')}</span>${command('quick-export', 'Save drawing', 'save', 'paint-quick')}${command('undo', 'Undo', 'undo', 'paint-quick')}${command('redo', 'Redo', 'redo', 'paint-quick')}<span class="paint-window-title" data-paint-window-title>Untitled – Paint</span><button type="button" class="paint-button paint-reference-trigger" data-paint-action="reference-panel" aria-expanded="false" aria-controls="paint-reference-panel">${icon('reference')}<span>Reference</span></button></div>
    <div class="paint-ribbon-tabs">${menu('paint-file-menu', 'File', '', command('add-sheet', 'New', 'plus') + command('open', 'Open image', 'open') + command('file-export', 'Save as', 'save') + command('clear', 'Clear canvas', 'eraser'), 'paint-file-tab')}
      <div class="paint-ribbon-tabstrip" role="tablist" aria-label="Ribbon tabs"><button type="button" id="paint-home-tab" role="tab" aria-controls="paint-ribbon-home" aria-selected="true" data-paint-ribbon="home">Home</button><button type="button" id="paint-view-tab" role="tab" aria-controls="paint-ribbon-view" aria-selected="false" tabindex="-1" data-paint-ribbon="view">View</button></div></div>
    <div class="paint-ribbon" role="tabpanel" id="paint-ribbon-home" aria-labelledby="paint-home-tab">${toolbar}</div>
    <div class="paint-ribbon" role="tabpanel" id="paint-ribbon-view" aria-labelledby="paint-view-tab" hidden>
      ${group('Zoom', command('zoom-in', 'Zoom in', 'plus', 'paint-tall') + command('zoom-out', 'Zoom out', 'minus', 'paint-tall') + command('actual-size', '100%', 'resize', 'paint-tall') + command('fit', 'Fit to window', 'resize', 'paint-tall'))}
      ${group('Show', '<div class="paint-stack paint-view-checks"><label class="paint-check"><input data-paint-config="grid" type="checkbox"> Pixel grid</label><label class="paint-check"><input data-paint-transparency type="checkbox"> Transparency grid</label></div>')}
    </div>
  </header>
  <div class="paint-workbench">
    <section class="paint-reference" id="paint-reference-panel" aria-label="Tracing reference" hidden>
      <div class="paint-reference-source">${command('reference-file', 'Choose file', 'open')}${command('reference-assets', 'Choose from Assets', 'reference')}<span data-paint-reference-name>No reference image</span></div>
      <div class="paint-reference-settings" data-paint-reference-settings hidden>
        <label class="paint-check"><input type="checkbox" data-paint-reference-visible> Show reference</label>
        <label class="paint-reference-opacity">Opacity <input type="range" min="5" max="100" value="40" data-paint-reference-opacity><span data-paint-reference-percent>40%</span></label>
        <label class="paint-reference-fit">Layout <select data-paint-reference-fit><option value="contain">Fit</option><option value="cover">Fill</option><option value="fill">Stretch</option></select></label>
        <label class="paint-check" title="Make white areas of the drawing see-through while tracing"><input type="checkbox" data-paint-reference-white> Show through white</label>
        ${command('reference-remove', 'Remove reference', 'delete', 'paint-quick')}
      </div>
      <p class="paint-reference-note">For tracing only. Your reference is never exported or uploaded with the drawing.</p>
    </section>
    <div class="paint-viewport" data-paint-viewport role="tabpanel" id="paint-active-sheet" aria-label="Current sheet"><div class="paint-desk"><div class="paint-paper"><img data-paint-reference-image alt="" draggable="false" hidden><canvas data-paint-canvas aria-label="Drawing canvas" tabindex="0"></canvas></div></div></div>
    <section class="paint-asset" data-paint-asset-panel aria-label="Saved asset" hidden><label class="paint-check"><input data-paint-auto type="checkbox"> Upload changes automatically</label><label class="paint-field paint-asset-url" data-paint-link-field hidden><span>Public URL</span><input data-paint-link type="url" readonly></label><div class="paint-asset-actions">${command('copy-link', 'Copy link', 'link')}${command('use', 'Use on page', 'plus')}</div><button type="button" class="paint-button" data-paint-action="asset-panel" aria-label="Close asset panel">${icon('delete')}</button></section>
    <div class="paint-sheets"><div class="paint-tabs" data-paint-tabs role="tablist" aria-label="Drawing sheets"></div><div class="paint-sheet-actions">${command('add-sheet', 'Add sheet', 'plus', 'paint-quick')}${menu('paint-sheet-menu', 'Sheet actions', 'more', command('rename-sheet', 'Rename sheet') + command('duplicate-sheet', 'Duplicate sheet') + command('remove-sheet', 'Delete sheet'), 'paint-sheet-trigger')}</div></div>
    <footer class="paint-canvas-footer"><div class="paint-canvas-stats"><span>${icon('position')}<span data-paint-position>0, 0 px</span></span><span>${icon('select')}<span data-paint-selection hidden></span></span><span>${icon('resize')}<span data-paint-dimensions></span></span></div><p class="paint-status" data-paint-status role="status" aria-live="polite"></p><div class="paint-view-options"><label class="paint-zoom"><span class="sr-only">Zoom percent</span><input data-paint-config="zoom" type="number" min="10" max="1600" step="10" inputmode="numeric" value="100"><span>%</span></label>${command('status-zoom-out', 'Zoom out', 'minus', 'paint-quick')}<input class="paint-zoom-slider" data-paint-zoom-slider aria-label="Zoom slider" type="range" min="10" max="800" value="100">${command('status-zoom-in', 'Zoom in', 'plus', 'paint-quick')}</div></footer>
  </div>
  <input data-paint-image type="file" accept="${fileTypes}" hidden>
  <input data-paint-reference-file type="file" accept="${fileTypes}" hidden>
  <dialog class="paint-dialog" data-paint-dialog aria-labelledby="paint-dialog-title"><form method="dialog" data-paint-form><header class="paint-dialog-title"><h2 id="paint-dialog-title"></h2><button class="paint-button" type="submit" value="cancel" aria-label="Close dialog">${icon('delete')}</button></header><div data-paint-dialog-fields></div><p data-paint-dialog-error role="alert" hidden></p><div class="paint-dialog-actions"><button class="paint-button paint-accent" value="confirm" type="submit" data-paint-confirm></button><button class="paint-button" value="cancel" type="submit">Cancel</button></div></form></dialog>`;
}
