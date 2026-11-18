const canvasLimit = 100000;
const dimensions = new Set(['width', 'height']);
const axes = new Set(['canvasX', 'canvasY']);

export function canvasOffset(value) {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) {
    value = Number.parseFloat(value);
  }
  return Number.isFinite(value) ? Math.max(-canvasLimit, Math.min(canvasLimit, value)) : 0;
}

export function canvasTransformPatch(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  const patch = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (axes.has(key) && Number.isFinite(value) && Math.abs(value) <= canvasLimit) patch[key] = value;
    if (dimensions.has(key) && Number.isFinite(value) && value > 0 && value <= canvasLimit) patch[key] = value;
    if ((key === 'minWidth' || key === 'minHeight') && value === 0) patch[key] = value;
    if ((key === 'maxWidth' || key === 'maxHeight') && value === 'none') patch[key] = value;
    if (key === 'display' && value === 'inline-block') patch[key] = value;
    if (key === 'flexShrink' && value === 0) patch[key] = value;
  }
  return patch;
}

const editorStyle = `
  :host {
    all: initial;
    position: fixed; inset: 0; z-index: 2147483647;
    pointer-events: none;
    font: 600 calc(11px * var(--plot-scale)) / 1 system-ui, sans-serif;
    color: #222816;
  }
  [hidden] { display: none !important; }
  .outline {
    position: absolute; outline: calc(1px * var(--plot-scale)) solid #9bba1e;
    outline-offset: calc(-1px * var(--plot-scale));
  }
  button, output { box-sizing: border-box; position: absolute; }
  button {
    appearance: none; border: 0; padding: 0; margin: 0;
    background: transparent; color: inherit; font: inherit;
    pointer-events: auto; touch-action: none; user-select: none;
    display: grid; place-items: center;
    transform: translate(-50%, -50%);
  }
  button:focus-visible { outline: calc(2px * var(--plot-scale)) solid #263500; border-radius: 3px; }
  .handle { width: calc(22px * var(--plot-scale)); height: calc(22px * var(--plot-scale)); }
  .handle::before {
    content: ""; width: calc(8px * var(--plot-scale)); height: calc(8px * var(--plot-scale));
    border: calc(1px * var(--plot-scale)) solid #4d620c; border-radius: 1px;
    background: #fbfff1;
  }
  .handle:hover::before, .handle:focus-visible::before, .handle[aria-pressed=true]::before { background: #ccea60; }
  .handle[data-handle=n], .handle[data-handle=s] { cursor: ns-resize; }
  .handle[data-handle=e], .handle[data-handle=w] { cursor: ew-resize; }
  .handle[data-handle=nw], .handle[data-handle=se] { cursor: nwse-resize; }
  .handle[data-handle=ne], .handle[data-handle=sw] { cursor: nesw-resize; }
  .move {
    cursor: grab; z-index: 1; grid-auto-flow: column; gap: calc(5px * var(--plot-scale));
    padding: 0 calc(8px * var(--plot-scale)); height: calc(23px * var(--plot-scale));
    border-radius: calc(4px * var(--plot-scale)); background: #e5f293;
    box-shadow: 0 0 0 calc(1px * var(--plot-scale)) #728223, 0 2px 6px #15220024;
  }
  .move svg { display: block; width: calc(13px * var(--plot-scale)); height: auto; }
  .move:hover, .move[aria-pressed=true] { background: #d1e96a; }
  .move[aria-pressed=true] { cursor: grabbing; }
  output {
    padding: calc(5px * var(--plot-scale)) calc(6px * var(--plot-scale));
    border-radius: calc(3px * var(--plot-scale)); background: #24310e; color: #f6ffd7;
    font-variant-numeric: tabular-nums; white-space: nowrap;
    transform: translate(-50%, -50%);
  }
  @media (pointer: coarse) {
    .handle { width: calc(34px * var(--plot-scale)); height: calc(34px * var(--plot-scale)); }
    .move { height: calc(33px * var(--plot-scale)); }
  }
`;

export function canvasTransformBridge() {
  return `(${mountCanvasTransform.toString()})(send, ${JSON.stringify(editorStyle)})`;
}

function mountCanvasTransform(send, styleText) {
  const limit = 100000;
  const directions = {
    nw: [-1, -1, 'top left corner'], n: [0, -1, 'top edge'], ne: [1, -1, 'top right corner'],
    w: [-1, 0, 'left edge'], e: [1, 0, 'right edge'],
    sw: [-1, 1, 'bottom left corner'], s: [0, 1, 'bottom edge'], se: [1, 1, 'bottom right corner'],
  };
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const coarse = window.matchMedia('(pointer: coarse)');
  const host = document.createElement('div');
  host.dataset.plotTransformOverlay = '';
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styleText;
  const outline = document.createElement('div');
  outline.className = 'outline';
  outline.setAttribute('aria-hidden', 'true');
  const output = document.createElement('output');
  output.setAttribute('aria-live', 'off');
  output.hidden = true;
  const handles = new Map();
  const observer = new ResizeObserver(() => schedule());
  let enabled = true;
  let libraryDragging = false;
  let context;
  let scale = 1;
  let selected;
  let gesture;
  let raf = 0;

  function addHandle(kind, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = kind === 'move' ? 'move' : 'handle';
    button.dataset.handle = kind;
    button.setAttribute('aria-label', label);
    button.title = kind === 'move' ? 'Drag to move. Shift locks an axis.' :
      `${label}. Shift locks proportions on corners.`;
    button.addEventListener('pointerdown', pointerDown);
    button.addEventListener('pointermove', pointerMove);
    button.addEventListener('pointerup', pointerUp);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('lostpointercapture', cancel);
    button.addEventListener('keydown', keyDown);
    button.addEventListener('keyup', keyUp);
    button.addEventListener('blur', () => {
      if (gesture?.keyboard && gesture.handle === button) finish();
    });
    handles.set(kind, button);
    return button;
  }

  const move = addHandle('move', 'Move element');
  move.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg><span>Move</span>';
  for (const [kind, [, , part]] of Object.entries(directions)) addHandle(kind, `Resize ${part}`);
  shadow.append(style, outline, ...handles.values(), output);
  document.documentElement.append(host);

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const round = value => Math.round(value * 10) / 10 || 0;

  function display(node, x, y, hidden = false) {
    node.hidden = hidden;
    if (hidden) return;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }

  function draw() {
    raf = 0;
    const bounds = selected?.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const visible = enabled && !libraryDragging && bounds && selected.getClientRects().length &&
      bounds.right >= 0 && bounds.left <= width && bounds.bottom >= 0 && bounds.top <= height;
    host.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const { left, top, right, bottom } = bounds;
    outline.style.left = `${left}px`;
    outline.style.top = `${top}px`;
    outline.style.width = `${Math.max(1, bounds.width)}px`;
    outline.style.height = `${Math.max(1, bounds.height)}px`;
    const inset = 5 * scale;
    const onScreen = (x, y) => x >= -inset && x <= width + inset && y >= -inset && y <= height + inset;
    for (const [kind, [horizontal, vertical]] of Object.entries(directions)) {
      const x = horizontal < 0 ? left : horizontal > 0 ? right : (left + right) / 2;
      const y = vertical < 0 ? top : vertical > 0 ? bottom : (top + bottom) / 2;
      const handle = handles.get(kind);
      const crowded = (!horizontal && bounds.width < 49 * scale) ||
        (!vertical && bounds.height < 49 * scale) ||
        (vertical < 0 && bounds.height < 17 * scale) ||
        (horizontal < 0 && bounds.width < 17 * scale);
      const keep = gesture?.handle === handle || shadow.activeElement === handle;
      display(handle, clamp(x, inset, width - inset), clamp(y, inset, height - inset), !keep && (crowded || !onScreen(x, y)));
    }
    const visibleLeft = Math.max(0, left);
    const visibleWidth = Math.min(width, right) - visibleLeft;
    const moveInset = (coarse.matches ? 20 : 14) * scale;
    const gap = (coarse.matches ? 36 : 22) * scale;
    const above = top - gap;
    const fitsAbove = above >= moveInset;
    const positionRatio = !fitsAbove && visibleWidth >= 180 * scale ? .25 : .5;
    const moveX = clamp(visibleLeft + visibleWidth * positionRatio, 32 * scale, width - 32 * scale);
    const preferredY = fitsAbove ? above : (top >= 0 ? Math.min(top + gap, (top + bottom) / 2) : moveInset);
    const moveY = clamp(preferredY, moveInset, height - moveInset);
    display(move, moveX, moveY);
    if (gesture?.patch) {
      output.value = gesture.kind === 'move'
        ? `X ${round(gesture.positionX)}  Y ${round(gesture.positionY)}`
        : `${round(bounds.width)} × ${round(bounds.height)}`;
      display(output, moveX, clamp(bottom + 15 * scale, 17 * scale, height - 17 * scale));
    } else {
      output.hidden = true;
    }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function readAxis(value, dimension) {
    const factor = value?.endsWith('%') ? dimension / 100 : 1;
    return (Number.parseFloat(value) || 0) * factor;
  }

  function measure(node, computed, dimension, bounds) {
    const horizontal = dimension === 'width';
    const start = horizontal ? 'Left' : 'Top';
    const end = horizontal ? 'Right' : 'Bottom';
    const edges = ['padding' + start, 'padding' + end, 'border' + start + 'Width', 'border' + end + 'Width']
      .reduce((sum, property) => sum + (Number.parseFloat(computed[property]) || 0), 0);
    const borderBox = computed.boxSizing === 'border-box';
    const outer = horizontal ? node.offsetWidth : node.offsetHeight;
    const measured = Number.parseFloat(computed[dimension]);
    const startSize = Number.isFinite(measured) ? measured : Math.max(0, outer - (borderBox ? 0 : edges));
    const factor = outer > 0 ? bounds[dimension] / outer : 1;
    return {
      size: startSize, factor: factor > .001 ? factor : 1, edges: borderBox ? edges : 0,
      minimum: computed[horizontal ? 'minWidth' : 'minHeight'],
      maximum: computed[horizontal ? 'maxWidth' : 'maxHeight'],
    };
  }

  function begin(kind, handle, pointer) {
    if (!enabled || !selected || !context || libraryDragging || gesture) return false;
    const computed = getComputedStyle(selected);
    const bounds = selected.getBoundingClientRect();
    const translate = computed.translate.split(/\s+/);
    gesture = {
      kind, handle, node: selected, id: selected.dataset.blockId, context, bounds,
      sizeX: measure(selected, computed, 'width', bounds), sizeY: measure(selected, computed, 'height', bounds),
      x: readAxis(translate[0], bounds.width), y: readAxis(translate[1], bounds.height),
      inline: selected.getAttribute('style'), wasInline: computed.display === 'inline',
      flexItem: ['flex', 'inline-flex'].includes(getComputedStyle(selected.parentElement).display),
      keyboard: !pointer, keyX: 0, keyY: 0,
      pointerId: pointer?.pointerId, startX: pointer?.clientX, startY: pointer?.clientY,
    };
    handle.setAttribute('aria-pressed', 'true');
    return true;
  }

  function restoreInline(state) {
    if (state.inline === null) state.node.removeAttribute('style');
    else state.node.setAttribute('style', state.inline);
  }

  function applyPosition(state, x, y) {
    state.node.style.setProperty('translate', x || y ? `${x}px ${y}px` : 'none');
  }

  function applySize(state, patch, axis, delta) {
    const horizontal = axis === 'width';
    const saved = horizontal ? state.sizeX : state.sizeY;
    const suffix = horizontal ? 'Width' : 'Height';
    const value = round(clamp(saved.size + delta / saved.factor, Math.max(saved.edges, 1), limit));
    patch[axis] = value;
    state.node.style[axis] = `${value}px`;
    if (!horizontal && state.node.dataset.blockType === 'image') {
      state.node.style.setProperty('--ps-image-frame', 'grid');
      state.node.style.setProperty('--ps-image-fill', '100%');
      state.node.style.setProperty('--ps-image-placeholder-min', '0px');
    }
    const usedSize = () => Number.parseFloat(getComputedStyle(state.node)[axis]);
    const used = usedSize();
    if (!Number.isFinite(used) || Math.abs(value - used) < .75) return;
    const minimum = value < used;
    if (minimum && saved.minimum === '0px' || !minimum && saved.maximum === 'none') return;
    const bound = (minimum ? 'min' : 'max') + suffix;
    const inlineBound = state.node.style[bound];
    state.node.style[bound] = minimum ? '0px' : 'none';
    if (Math.abs(usedSize() - value) < Math.abs(used - value)) patch[bound] = minimum ? 0 : 'none';
    else state.node.style[bound] = inlineBound;
  }

  function moveBy(dx, dy, lock) {
    const state = gesture;
    if (!state) return;
    restoreInline(state);
    state.patch = null;
    if (Math.abs(dx) < .3 && Math.abs(dy) < .3) { schedule(); return; }

    const patch = {};
    const { kind, node, bounds, x, y } = state;
    node.style.transition = 'none';
    let targetLeft = bounds.left;
    let targetTop = bounds.top;
    if (kind === 'move') {
      if (lock && Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else if (lock) dx = 0;
      targetLeft += dx;
      targetTop += dy;
    } else {
      const [horizontal, vertical] = directions[kind];
      let sx = dx * horizontal;
      let sy = dy * vertical;
      if (lock && horizontal && vertical && bounds.width && bounds.height) {
        const slope = bounds.width / bounds.height;
        if (Math.abs(sx) > Math.abs(sy * slope)) sy = sx / slope;
        else sx = sy * slope;
      }
      if (horizontal && Math.abs(sx) >= .3) applySize(state, patch, 'width', sx);
      if (vertical && Math.abs(sy) >= .3) applySize(state, patch, 'height', sy);
      if (!Object.keys(patch).length) { schedule(); return; }
      if (state.wasInline) { node.style.display = 'inline-block'; patch.display = 'inline-block'; }
      if (state.flexItem && (patch.width || patch.height) && Number.parseFloat(getComputedStyle(node).flexShrink) > 0) {
        const requested = patch.width ?? patch.height;
        const actual = Number.parseFloat(getComputedStyle(node)[patch.width ? 'width' : 'height']);
        if (actual < requested - .75) { node.style.flexShrink = '0'; patch.flexShrink = 0; }
      }
      const resized = node.getBoundingClientRect();
      if (horizontal < 0) targetLeft = bounds.right - resized.width;
      if (vertical < 0) targetTop = bounds.bottom - resized.height;
    }
    const actual = node.getBoundingClientRect();
    const localX = round(clamp(x + targetLeft - actual.left, -limit, limit));
    const localY = round(clamp(y + targetTop - actual.top, -limit, limit));
    if (Math.abs(localX - x) >= .1) patch.canvasX = localX;
    if (Math.abs(localY - y) >= .1) patch.canvasY = localY;
    if (Object.hasOwn(patch, 'canvasX') || Object.hasOwn(patch, 'canvasY')) applyPosition(state, localX, localY);
    state.positionX = localX;
    state.positionY = localY;
    state.patch = Object.keys(patch).length ? patch : null;
    schedule();
  }

  function finish() {
    if (!gesture) return;
    const state = gesture;
    gesture = null;
    state.handle.removeAttribute('aria-pressed');
    if (!state.patch) restoreInline(state);
    else send('canvas-transform', {
      id: state.id, context: state.context, patch: state.patch,
      focus: state.keyboard ? state.kind : '',
    });
    schedule();
  }

  function cancel() {
    if (!gesture) return;
    const state = gesture;
    gesture = null;
    state.handle.removeAttribute('aria-pressed');
    if (state.pointerId !== undefined && state.handle.hasPointerCapture(state.pointerId)) state.handle.releasePointerCapture(state.pointerId);
    restoreInline(state);
    schedule();
  }

  function pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return;
    const handle = event.currentTarget;
    if (!begin(handle.dataset.handle, handle, event)) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    const state = gesture;
    if (!state || state.pointerId !== event.pointerId) return;
    moveBy(event.clientX - state.startX, event.clientY - state.startY, event.shiftKey);
  }

  function pointerUp(event) {
    if (gesture?.pointerId !== event.pointerId) return;
    pointerMove(event);
    finish();
  }

  function keyDown(event) {
    const arrow = arrows[event.key];
    if (!arrow) return;
    const handle = event.currentTarget;
    const kind = handle.dataset.handle;
    const [horizontal, vertical] = directions[kind] || [1, 1];
    event.preventDefault();
    if (gesture && !gesture.keyboard) return;
    if (!gesture && !begin(kind, handle)) return;
    const step = event.shiftKey ? 10 : 1;
    gesture.keyX += horizontal ? arrow[0] * step : 0;
    gesture.keyY += vertical ? arrow[1] * step : 0;
    moveBy(gesture.keyX, gesture.keyY, false);
  }

  function keyUp(event) {
    if (gesture?.keyboard && arrows[event.key]) finish();
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
      return;
    }
    const target = event.target;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' ||
      target.closest?.('input,textarea,select,[contenteditable]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (gesture) cancel();
    else send('canvas-undo', { redo: event.shiftKey });
  }, true);
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('blur', cancel);
  document.addEventListener('load', schedule, true);
  document.fonts?.ready.then(schedule);

  return {
    select(id) {
      const next = id ? document.querySelector(`[data-block-id="${CSS.escape(id)}"]`) : null;
      if (selected === next) return;
      cancel();
      observer.disconnect();
      selected = next;
      if (selected) {
        observer.observe(selected);
        observer.observe(selected.parentElement);
      }
      schedule();
    },
    sync(next) {
      if (gesture && (!next.enabled || next.context.pageId !== context.pageId ||
        next.context.device !== context.device)) cancel();
      enabled = next.enabled;
      context = next.context;
      scale = 1 / clamp(next.zoom || 1, .15, 1);
      host.style.setProperty('--plot-scale', scale);
      if (next.focus && handles.has(next.focus)) {
        draw();
        handles.get(next.focus).focus({ preventScroll: true });
      } else schedule();
    },
    setLibraryDragging(active) {
      libraryDragging = active;
      if (active) cancel();
      schedule();
    },
  };
}
