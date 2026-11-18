const storageKey = 'plot.studio.workspace-docks.v1';
const compactQuery = '(max-width: 879px)';
const canvasMinimum = 360;
const docks = {
  library: { panel: '#library', label: 'library', initial: 230, minimum: 166, maximum: 440, direction: 1 },
  inspector: { panel: '#inspector-panel', label: 'inspector', initial: 290, minimum: 222, maximum: 500, direction: -1 },
};
const names = Object.keys(docks);
const opposite = (name) => names.find((candidate) => candidate !== name);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Math.round(value)));

function readSettings() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch { stored = null; }
  const settings = Object.fromEntries(names.map((name) => {
    const { initial, minimum, maximum } = docks[name];
    const width = stored?.[name]?.width;
    return [name, { width: Number.isFinite(width) ? clamp(width, minimum, maximum) : initial, visible: stored?.[name]?.visible !== false }];
  }));
  settings.focus = stored?.focus === true;
  settings.priority = names.includes(stored?.priority) ? stored.priority : 'inspector';
  return settings;
}

export function mountDockLayout(workspace) {
  const compact = matchMedia(compactQuery);
  const panels = Object.fromEntries(names.map((name) => [name, workspace.querySelector(docks[name].panel)]));
  const toggles = Object.fromEntries(names.map((name) => [name, workspace.querySelector(`[data-command="${name}"]`)]));
  const handles = Object.fromEntries(names.map((name) => [name, workspace.querySelector(`[data-dock-handle="${name}"]`)]));
  const focusToggle = workspace.querySelector('[data-command="canvas-only"]');
  const backdrop = workspace.querySelector('.dock-backdrop');
  const background = [...workspace.querySelectorAll('.canvas-viewport, .canvas-footer')];
  const settings = readSettings();
  let overlay = null;
  let applied = {};
  let drag = null;

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
  }

  function budget() {
    return Math.max(0, (workspace.clientWidth || window.innerWidth) - canvasMinimum);
  }

  function maxWidth(name) {
    const { minimum, maximum } = docks[name];
    return Math.max(minimum, Math.min(maximum, budget() - (applied[opposite(name)] || 0)));
  }

  function render() {
    workspace.toggleAttribute('data-dock-compact', compact.matches);
    workspace.toggleAttribute('data-dock-focus', settings.focus && !compact.matches);
    applied = {};
    let remaining = budget();
    const visibility = Object.fromEntries(names.map((name) => [name, compact.matches ? overlay === name : settings[name].visible && !settings.focus]));
    const first = settings.priority;
    const second = opposite(first);
    if (visibility[second] && !compact.matches) remaining -= docks[second].minimum;
    for (const name of [first, second]) {
      const { minimum, maximum } = docks[name];
      applied[name] = visibility[name] && !compact.matches ? clamp(settings[name].width, minimum, Math.min(maximum, Math.max(minimum, remaining))) : 0;
      remaining += name === first && visibility[second] && !compact.matches ? docks[second].minimum : 0;
      remaining -= applied[name];
    }
    for (const name of names) {
      const visible = visibility[name];
      const label = `${visible ? 'Hide' : 'Show'} ${docks[name].label}`;
      const handle = handles[name];
      workspace.style.setProperty(`--dock-${name}-track`, `${applied[name]}px`);
      panels[name].hidden = !visible;
      toggles[name].setAttribute('aria-expanded', String(visible));
      toggles[name].setAttribute('aria-label', label);
      toggles[name].title = label;
      handle.hidden = !visible || compact.matches;
      handle.setAttribute('aria-valuemin', String(docks[name].minimum));
      handle.setAttribute('aria-valuemax', String(maxWidth(name)));
      handle.setAttribute('aria-valuenow', String(applied[name] || docks[name].minimum));
      handle.setAttribute('aria-valuetext', `${applied[name] || docks[name].minimum} pixels`);
    }
    backdrop.hidden = !compact.matches || !overlay;
    background.forEach((element) => { element.inert = !backdrop.hidden; });
    focusToggle.setAttribute('aria-pressed', String(settings.focus));
    const focusLabel = settings.focus ? 'Restore side panels' : 'Canvas only';
    focusToggle.setAttribute('aria-label', focusLabel);
    focusToggle.title = focusLabel;
  }

  function closeOverlay(restoreFocus = false) {
    if (!overlay) return false;
    const previous = overlay;
    overlay = null;
    render();
    if (restoreFocus) toggles[previous].focus({ preventScroll: true });
    return true;
  }

  function toggle(name) {
    if (compact.matches) {
      if (overlay === name) closeOverlay(true);
      else {
        overlay = name;
        render();
        panels[name].focus({ preventScroll: true });
      }
      return;
    }
    if (settings.focus) {
      settings.focus = false;
      settings[name].visible = true;
      settings[opposite(name)].visible = false;
    } else settings[name].visible = !settings[name].visible;
    render();
    save();
  }

  function toggleFocus() {
    if (compact.matches) return;
    settings.focus = !settings.focus;
    render();
    save();
  }

  function resize(name, value) {
    settings.priority = name;
    settings[name].width = clamp(value, docks[name].minimum, maxWidth(name));
    render();
  }

  function finishDrag(keepWidth) {
    if (!drag) return;
    const { name, previousWidth, previousPriority, pointer } = drag;
    drag = null;
    workspace.removeAttribute('data-dock-dragging');
    if (handles[name].hasPointerCapture(pointer)) handles[name].releasePointerCapture(pointer);
    if (keepWidth) save();
    else {
      settings[name].width = previousWidth;
      settings.priority = previousPriority;
      render();
    }
  }

  backdrop.addEventListener('click', () => closeOverlay(true));
  compact.addEventListener('change', () => {
    finishDrag(false);
    if (!closeOverlay()) render();
  });
  new ResizeObserver(render).observe(workspace);

  for (const name of names) {
    const handle = handles[name];
    const { initial, minimum, direction } = docks[name];
    handle.addEventListener('pointerdown', (event) => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      drag = { name, pointer: event.pointerId, anchor: event.clientX, startWidth: applied[name], previousWidth: settings[name].width, previousPriority: settings.priority };
      workspace.dataset.dockDragging = name;
    });
    handle.addEventListener('pointermove', (event) => {
      if (drag?.pointer !== event.pointerId || drag.name !== name) return;
      resize(name, drag.startWidth + (event.clientX - drag.anchor) * direction);
    });
    handle.addEventListener('pointerup', (event) => {
      if (drag?.pointer === event.pointerId) finishDrag(true);
    });
    handle.addEventListener('lostpointercapture', (event) => {
      if (drag?.pointer === event.pointerId) finishDrag(false);
    });
    handle.addEventListener('dblclick', () => {
      resize(name, initial);
      save();
    });
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drag) {
        event.preventDefault();
        finishDrag(false);
        return;
      }
      const step = event.shiftKey ? 32 : 8;
      const values = {
        ArrowLeft: applied[name] - step * direction,
        ArrowRight: applied[name] + step * direction,
        Home: minimum,
        End: maxWidth(name),
        Enter: initial,
      };
      if (event.altKey || event.ctrlKey || event.metaKey || !Object.hasOwn(values, event.key)) return;
      event.preventDefault();
      resize(name, values[event.key]);
      save();
    });
  }
  render();

  return { toggle, toggleFocus, closeOverlay };
}
