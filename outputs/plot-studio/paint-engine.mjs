import { clearBackgroundPixels, colorComponents, fillPixels, pixelColor } from './paint-pixels.mjs';

export const paintLimits = Object.freeze({ maxSide: 8192, maxPixels: 16_000_000, maxSheets: 24, maxTotalPixels: 32_000_000 });
export const paintDefaultSize = Object.freeze({ width: 2550, height: 1700 });

const historyBudget = 96 * 1024 * 1024;
const maxHistory = 32;
const brushes = new Set(['round', 'flat', 'marker', 'watercolor', 'pixel', 'chisel', 'oil', 'crayon', 'graphite', 'felt', 'glaze']);
const freehand = new Set(['pencil', 'brush', 'eraser', 'spray']);
const shapes = new Set(['line', 'curve', 'rect', 'ellipse', 'polygon', 'triangle', 'right-triangle', 'arrow', 'diamond', 'rounded-rect',
  'star', 'star-four', 'star-six', 'pentagon', 'hexagon', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'callout', 'oval-callout']);
const toolSet = new Set([...freehand, ...shapes, 'eyedropper', 'fill', 'text', 'select', 'hand']);
const toolAlias = { rectangle: 'rect', bucket: 'fill', roundrect: 'rounded-rect' };
const initialOptions = Object.freeze({
  tool: 'brush', color: '#000000', secondaryColor: '#ffffff', size: 8, opacity: 1, tolerance: 24, hardness: .6,
  brush: 'round', fill: false, stroke: true, text: '', font: 'Arial', fontSize: 24, bold: false, italic: false,
  zoom: 1, grid: false, pressure: true, angle: 36, density: .55, grain: .55, flow: .55,
  selectionShape: 'rect', transparentSelection: false,
});

const bounded = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const position = (x, y) => ({ x, y });
const area = ({ width, height }) => width * height;

function dimensions(width, height) {
  const values = [Number(width), Number(height)];
  if (values.some(value => !Number.isInteger(value) || value < 1 || value > paintLimits.maxSide) ||
    values[0] * values[1] > paintLimits.maxPixels) {
    throw new RangeError('Choose whole pixel dimensions up to 8,192 per side and 16 million pixels per sheet.');
  }
  return { width: values[0], height: values[1] };
}

function surface(width, height) {
  const bitmap = document.createElement('canvas');
  bitmap.width = width;
  bitmap.height = height;
  return bitmap;
}

function duplicateBitmap(source) {
  const copy = surface(source.width, source.height);
  copy.getContext('2d').drawImage(source, 0, 0);
  return copy;
}

function selectionPath(box, offsetX = 0, offsetY = 0, path = new Path2D()) {
  const x = box.x - offsetX;
  const y = box.y - offsetY;
  if (box.points) {
    box.points.forEach((point, index) => path[index ? 'lineTo' : 'moveTo'](x + point.x, y + point.y));
    path.closePath();
  } else path.rect(x, y, box.width, box.height);
  return box.hole ? selectionPath(box.hole, offsetX, offsetY, path) : path;
}

function clearSelection(ctx, box) {
  ctx.save();
  if (box.points || box.hole) ctx.clip(selectionPath(box), 'evenodd');
  ctx.clearRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function cropBitmap(source, box, transparentColor) {
  const copy = surface(box.width, box.height);
  const ctx = copy.getContext('2d');
  ctx.save();
  if (box.points || box.hole) ctx.clip(selectionPath(box, box.x, box.y), 'evenodd');
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  ctx.restore();
  if (transparentColor) {
    const rgb = colorComponents(transparentColor);
    const image = ctx.getImageData(0, 0, box.width, box.height);
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset] === rgb[0] && data[offset + 1] === rgb[1] && data[offset + 2] === rgb[2]) data[offset + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
  }
  return copy;
}

function destroyBitmap(bitmap) {
  bitmap.width = 0;
  bitmap.height = 0;
}

function encode(bitmap, type, quality) {
  return new Promise((resolve, reject) => {
    bitmap.toBlob(blob => {
      if (blob?.type === type) resolve(blob);
      else reject(new Error('The browser could not export that image format.'));
    }, type, quality);
  });
}

async function decode(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > 32 * 1024 * 1024) throw new Error('Choose an image under 32 MB.');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { throw new Error('The image could not be opened.'); }
  }
  const url = URL.createObjectURL(blob);
  const bitmap = new Image();
  try { bitmap.src = url; await bitmap.decode(); }
  catch { throw new Error('The image could not be opened.'); }
  finally { URL.revokeObjectURL(url); }
  return { bitmap, width: bitmap.naturalWidth, height: bitmap.naturalHeight, close() {} };
}

function frame(start, end, bounds) {
  const left = bounded(Math.floor(Math.min(start.x, end.x)), 0, bounds.width - 1);
  const top = bounded(Math.floor(Math.min(start.y, end.y)), 0, bounds.height - 1);
  const right = bounded(Math.ceil(Math.max(start.x, end.x)), left + 1, bounds.width);
  const bottom = bounded(Math.ceil(Math.max(start.y, end.y)), top + 1, bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function lassoBox(points, bitmap) {
  if (points.length < 3) return null;
  const bounds = points.reduce((box, point) => ({ left: Math.min(box.left, point.x), top: Math.min(box.top, point.y),
    right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y) }),
  { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const box = frame({ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.bottom }, bitmap);
  return { ...box, points: points.map(point => ({ x: point.x - box.x, y: point.y - box.y })) };
}

function snapEnd(kind, start, end, shift) {
  if (!shift) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (['line', 'arrow', 'curve'].includes(kind)) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    const length = Math.hypot(dx, dy);
    return position(start.x + Math.cos(angle) * length, start.y + Math.sin(angle) * length);
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return position(start.x + Math.sign(dx || 1) * side, start.y + Math.sign(dy || 1) * side);
}

function pathShape(ctx, tool, start, end, size) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  ctx.beginPath();
  if (tool === 'curve') {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(start.x + dx * .2 + dy * .45, start.y + dy * .2 - dx * .45,
      start.x + dx * .8 - dy * .45, start.y + dy * .8 + dx * .45, end.x, end.y);
  } else if (tool === 'line' || tool === 'arrow') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    if (tool === 'arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const wing = Math.min(Math.max(10, size * 3), Math.hypot(width, height) / 3);
      for (const direction of [-1, 1]) {
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(angle + direction * Math.PI / 6) * wing, end.y - Math.sin(angle + direction * Math.PI / 6) * wing);
      }
    }
  } else if (tool === 'ellipse') {
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (tool === 'triangle') {
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
  } else if (tool === 'diamond') {
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width, y + height / 2);
    ctx.lineTo(x + width / 2, y + height);
    ctx.lineTo(x, y + height / 2);
    ctx.closePath();
  } else if (['star', 'star-four', 'star-six', 'pentagon', 'hexagon'].includes(tool)) {
    const sides = { star: 10, 'star-four': 8, 'star-six': 12, pentagon: 5, hexagon: 6 }[tool];
    for (let point = 0; point < sides; point++) {
      const angle = point * Math.PI * 2 / sides - Math.PI / 2;
      const radius = tool.startsWith('star') && point % 2 ? .42 : 1;
      ctx[point ? 'lineTo' : 'moveTo'](x + (1 + radius * Math.cos(angle)) * width / 2, y + (1 + radius * Math.sin(angle)) * height / 2);
    }
    ctx.closePath();
  } else if (tool === 'oval-callout') {
    ctx.ellipse(x + width / 2, y + height * .41, width / 2, height * .41, 0, Math.PI * .63, Math.PI * 2.32);
    ctx.lineTo(x + width * .22, y + height);
    ctx.closePath();
  } else if (tool === 'rounded-rect' && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, Math.min(18, width / 4, height / 4));
  } else if (Object.hasOwn(shapePolygons, tool) || tool.startsWith('arrow-')) {
    const points = shapePolygons[tool] || directionalArrow(tool);
    for (const [index, [px, py]] of points.entries()) ctx[index ? 'lineTo' : 'moveTo'](x + width * px, y + height * py);
    ctx.closePath();
  } else ctx.rect(x, y, width, height);
}

const shapePolygons = {
  polygon: [[0,.35],[.35,0],[.83,0],[1,.44],[.78,1],[.18,.8]],
  'right-triangle': [[0,0],[1,1],[0,1]],
  callout: [[0,0],[1,0],[1,.78],[.44,.78],[.18,1],[.23,.78],[0,.78]],
};
const rightArrow = [[0,.3],[.55,.3],[.55,0],[1,.5],[.55,1],[.55,.7],[0,.7]];
function directionalArrow(tool) {
  const orient = { 'arrow-right': (x,y) => [x,y], 'arrow-left': (x,y) => [1-x,y],
    'arrow-up': (x,y) => [y,1-x], 'arrow-down': (x,y) => [y,x] }[tool];
  return rightArrow.map(([x,y]) => orient(x,y));
}

function drawShape(ctx, { options, start, end, shift, secondary }) {
  const { tool, color, secondaryColor, size, opacity, fill, stroke } = options;
  const line = ['line', 'curve', 'arrow'].includes(tool);
  const foreground = secondary ? secondaryColor : color;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = foreground;
  ctx.fillStyle = !stroke || !fill ? foreground : secondary ? color : secondaryColor;
  pathShape(ctx, tool, start, snapEnd(tool, start, end, shift), size);
  if (fill && !line) ctx.fill();
  if (stroke || line || !fill) ctx.stroke();
  ctx.restore();
}

function pixelStroke(ctx, start, end, size) {
  let x = Math.floor(start.x);
  let y = Math.floor(start.y);
  const ex = Math.floor(end.x);
  const ey = Math.floor(end.y);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  const offset = Math.floor((size - 1) / 2);
  let balance = dx + dy;
  while (true) {
    ctx.fillRect(x - offset, y - offset, size, size);
    if (x === ex && y === ey) return;
    const doubled = 2 * balance;
    if (doubled >= dy) { balance += dy; x += sx; }
    if (doubled <= dx) { balance += dx; y += sy; }
  }
}

function randomBrushValue(gesture) {
  gesture.seed = (Math.imul(gesture.seed ?? 1234567, 1664525) + 1013904223) >>> 0;
  return gesture.seed / 4294967296;
}

function brushDabs(gesture, start, end, step, draw) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) { draw(start.x, start.y); return; }
  let at = gesture.nextDab ?? step;
  let count = 0;
  for (; at <= length && count < 1600; at += step, count++) draw(start.x + dx * at / length, start.y + dy * at / length);
  gesture.nextDab = at > length ? at - length : step;
}

function dispersedStroke(ctx, gesture, start, end, size, color, brush) {
  const { density, hardness, grain, flow, opacity, tool } = gesture.options;
  const spray = tool === 'spray';
  const radius = size / 2;
  const random = () => randomBrushValue(gesture);
  const wash = brush === 'watercolor' || brush === 'glaze';
  brushDabs(gesture, start, end, Math.max(1, size * (spray ? .27 : wash ? .16 : .18)), (x, y) => {
    if (wash) {
      const inner = Math.min(radius * hardness, radius - .001);
      const gradient = ctx.createRadialGradient(x, y, Math.max(0, inner), x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, `rgba(${colorComponents(color).join(',')},0)`);
      ctx.globalAlpha = opacity * flow * (brush === 'glaze' ? .25 : .46);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, size, size);
      return;
    }
    const dots = Math.max(1, Math.min(110, Math.ceil(size * (spray ? density * 1.6 : .9 + grain * 1.1))));
    for (let dot = 0; dot < dots; dot++) {
      const direction = random() * Math.PI * 2;
      const distance = Math.pow(random(), spray ? 1 - hardness * .7 : .55 + grain * 1.35) * radius;
      const width = spray ? 1 : Math.max(1, Math.floor(size * (brush === 'crayon' ? .14 : .07) * random()));
      ctx.globalAlpha = opacity * flow * (spray ? 1 : .25 + random() * (.75 - grain * .3));
      ctx.fillRect(Math.floor(x + distance * Math.cos(direction)), Math.floor(y + distance * Math.sin(direction)), width, width);
    }
  });
}

function chiselStroke(ctx, start, end, size, angle) {
  const rotation = angle * Math.PI / 180;
  const dx = Math.cos(rotation) * size / 2;
  const dy = Math.sin(rotation) * size / 2;
  ctx.beginPath();
  ctx.moveTo(start.x - dx, start.y - dy);
  ctx.lineTo(start.x + dx, start.y + dy);
  ctx.lineTo(end.x + dx, end.y + dy);
  ctx.lineTo(end.x - dx, end.y - dy);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * .18);
  ctx.lineCap = 'square';
  ctx.stroke();
}

function oilStroke(ctx, gesture, start, end, size) {
  const { grain, angle, opacity, flow } = gesture.options;
  const rotation = angle * Math.PI / 180;
  const tracks = Math.min(13, Math.max(3, Math.round(size / 1.9)));
  const pitch = size / tracks;
  for (let index = 0; index < tracks; index++) {
    const shift = (index + .5) * pitch - size / 2;
    const dx = Math.cos(rotation) * shift;
    const dy = Math.sin(rotation) * shift;
    ctx.globalAlpha = opacity * flow * (index % 3 ? 1 : 1 - grain * .9);
    ctx.lineWidth = Math.max(.8, pitch * (1.7 - grain * .94));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x + dx, start.y + dy);
    ctx.lineTo(end.x + dx + .06, end.y + dy + .06);
    ctx.stroke();
  }
}

function drawFreehand(ctx, gesture, start, end, pressure) {
  const options = gesture.options;
  const brush = options.tool === 'brush' ? options.brush : 'round';
  const color = gesture.secondary ? options.secondaryColor : options.color;
  const strokeSize = Math.max(1, options.size * pressure);
  ctx.save();
  ctx.globalAlpha = options.opacity * (brush === 'marker' ? Math.min(.8, options.flow * .76) : 1);
  if (options.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (options.tool === 'pencil' || brush === 'pixel') pixelStroke(ctx, start, end, Math.round(strokeSize));
  else if (options.tool === 'spray' || ['watercolor', 'glaze', 'graphite', 'crayon'].includes(brush)) dispersedStroke(ctx, gesture, start, end, strokeSize, color, brush);
  else if (brush === 'chisel') chiselStroke(ctx, start, end, strokeSize, options.angle);
  else if (brush === 'oil') oilStroke(ctx, gesture, start, end, strokeSize);
  else if (start.x === end.x && start.y === end.y) {
    if (brush === 'flat' || brush === 'marker') ctx.fillRect(end.x - strokeSize / 2, end.y - strokeSize / 2, strokeSize, strokeSize);
    else { ctx.beginPath(); ctx.arc(end.x, end.y, strokeSize / 2, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.lineCap = brush === 'flat' || brush === 'marker' ? 'square' : 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeSize;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintBrushSample(canvas, preset, color = '#d65a25') {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const options = { ...initialOptions, ...preset, color };
  options.size = Math.max(2, Math.min(24, options.size));
  const gesture = { options, seed: 96733 };
  const point = t => ({ x: width * (.12 + .76 * t), y: height * (.73 - .41 * t + Math.sin(7.4 * t) * .13) });
  if (options.tool === 'eraser') {
    ctx.fillStyle = color;
    ctx.fillRect(width * .04, height * .24, width * .92, height * .52);
  }
  let start = point(0);
  drawFreehand(ctx, gesture, start, start, .65);
  for (let index = 1; index <= 22; index++) {
    const end = point(index / 22);
    drawFreehand(ctx, gesture, start, end, .63 + Math.sin(Math.PI * index / 22) * .37);
    start = end;
  }
}

export function createPaintEngine({ canvas, scrollContainer = canvas.parentElement, onChange, onColor, onPosition, onError }) {
  const viewport = canvas.getContext('2d');
  const sheets = new Map();
  const options = { ...initialOptions };
  let active;
  let gesture = null;
  let clock = 0;
  let historyBytes = 0;
  let animation = 0;
  let paintName = 0;

  function descriptor(sheet) {
    const { id, name, revision, bitmap } = sheet;
    return { id, name, revision, width: bitmap.width, height: bitmap.height };
  }

  function state() {
    return {
      sheet: descriptor(active), sheets: [...sheets.values()].map(descriptor), options: { ...options },
      canUndo: Boolean(active.back.length), canRedo: Boolean(active.forward.length),
      selection: active.selection && { ...active.selection },
    };
  }

  function flushPreview() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    const { bitmap, selection } = active;
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    canvas.style.width = `${bitmap.width * options.zoom}px`;
    canvas.style.height = `${bitmap.height * options.zoom}px`;
    canvas.style.cursor = options.tool === 'hand' ? gesture?.kind === 'hand' ? 'grabbing' : 'grab'
      : options.tool === 'text' ? 'text' : 'crosshair';
    viewport.clearRect(0, 0, bitmap.width, bitmap.height);
    viewport.drawImage(bitmap, 0, 0);
    let box = selection;
    if (gesture?.kind === 'shape') drawShape(viewport, gesture);
    if (gesture?.kind === 'select') box = frame(gesture.start, gesture.end, bitmap);
    if (gesture?.kind === 'lasso') box = lassoBox(gesture.points, bitmap);
    if (gesture?.kind === 'move') {
      clearSelection(viewport, selection);
      box = movedBox(gesture, selection, bitmap);
      viewport.drawImage(gesture.fragment, box.x, box.y);
    }
    if (options.grid && options.zoom >= 4) {
      viewport.save();
      viewport.lineWidth = 1 / options.zoom;
      viewport.strokeStyle = '#66666666';
      viewport.beginPath();
      for (let column = 1; column < bitmap.width; column++) { viewport.moveTo(column, 0); viewport.lineTo(column, bitmap.height); }
      for (let row = 1; row < bitmap.height; row++) { viewport.moveTo(0, row); viewport.lineTo(bitmap.width, row); }
      viewport.stroke();
      viewport.restore();
    }
    if (box) {
      viewport.save();
      viewport.lineWidth = 1.5 / options.zoom;
      viewport.setLineDash([4 / options.zoom, 3 / options.zoom]);
      const inset = .75 / options.zoom;
      const insideX = Math.min(.2 * box.width, inset);
      const insideY = Math.min(.2 * box.height, inset);
      const strokeSelection = box.points || box.hole
        ? () => viewport.stroke(selectionPath(box))
        : () => viewport.strokeRect(box.x + insideX, box.y + insideY, box.width - insideX * 2, box.height - insideY * 2);
      viewport.strokeStyle = '#ffffff';
      strokeSelection();
      viewport.lineDashOffset = 4 / options.zoom;
      viewport.strokeStyle = '#283dff';
      strokeSelection();
      viewport.restore();
    }
  }

  function schedulePreview() {
    if (!animation) animation = requestAnimationFrame(flushPreview);
  }

  function notify() {
    flushPreview();
    onChange?.(state());
  }

  function historyFrame(sheet) {
    return { image: sheet.context.getImageData(0, 0, sheet.bitmap.width, sheet.bitmap.height), order: ++clock,
      selection: sheet.selection && { ...sheet.selection } };
  }

  function removeHistory(list, index = list.length - 1) {
    const [entry] = list.splice(index, 1);
    if (entry) historyBytes -= entry.image.data.byteLength;
    return entry;
  }

  function clearHistory(list) {
    for (const entry of list) historyBytes -= entry.image.data.byteLength;
    list.length = 0;
  }

  function retainHistory(list, entry) {
    list.push(entry);
    historyBytes += entry.image.data.byteLength;
    while (list.length > maxHistory) removeHistory(list, 0);
    while (historyBytes > historyBudget) {
      let oldest;
      for (const sheet of sheets.values()) {
        for (const history of [sheet.back, sheet.forward]) if (history.length && (!oldest || history[0].order < oldest[0].order)) oldest = history;
      }
      if (!oldest) break;
      removeHistory(oldest, 0);
    }
  }

  function restoreHistory(sheet, checkpoint) {
    sheet.bitmap.width = checkpoint.image.width;
    sheet.bitmap.height = checkpoint.image.height;
    sheet.context.putImageData(checkpoint.image, 0, 0);
    sheet.selection = checkpoint.selection;
  }

  function committed(sheet, before) {
    clearHistory(sheet.forward);
    retainHistory(sheet.back, before);
    sheet.revision++;
    notify();
  }

  function cancelGesture() {
    if (!gesture) return;
    const previous = gesture;
    gesture = null;
    clearInterval(previous.sprayTimer);
    if (previous.kind === 'stroke') restoreHistory(active, previous.before);
    if (previous.fragment) destroyBitmap(previous.fragment);
    if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
  }

  function mutate(action) {
    cancelGesture();
    const sheet = active;
    const before = historyFrame(sheet);
    if (action(sheet) === false) return false;
    committed(sheet, before);
    return true;
  }

  function requireBudget(size, existing = null) {
    const current = [...sheets.values()].reduce((sum, sheet) => sum + (sheet === existing ? 0 : area(sheet.bitmap)), 0);
    if (current + area(size) > paintLimits.maxTotalPixels) throw new RangeError('Close a sheet or reduce its dimensions to stay under 32 million pixels across open sheets.');
  }

  function addSheet({ name, id, revision = 0, width = paintDefaultSize.width, height = paintDefaultSize.height, background } = {}) {
    if (sheets.size >= paintLimits.maxSheets) throw new RangeError('Close a sheet before opening another.');
    const size = dimensions(width, height);
    requireBudget(size);
    if (id !== undefined && (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || sheets.has(id))) {
      throw new Error('A sheet with this identifier already exists or is invalid.');
    }
    const bitmap = surface(size.width, size.height);
    const context = bitmap.getContext('2d', { willReadFrequently: true });
    if (colorComponents(background)) { context.fillStyle = background; context.fillRect(0, 0, bitmap.width, bitmap.height); }
    const sheet = { id: id || crypto.randomUUID(), name: String(name ?? '').trim().slice(0, 80) || `Sheet ${++paintName}`,
      revision: Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER - 1000 ? revision : 0,
      bitmap, context, selection: null, back: [], forward: [] };
    sheets.set(sheet.id, sheet);
    active = sheet;
    return sheet;
  }

  function newSheet(definition) {
    cancelGesture();
    const sheet = addSheet(definition);
    notify();
    return descriptor(sheet);
  }

  function upgradeBlankStarter(id) {
    const sheet = sheets.get(id);
    if (!sheet || sheet.name !== 'Sheet 1' || sheet.revision !== 0 || sheet.back.length || sheet.forward.length ||
        sheet.bitmap.width !== 960 || sheet.bitmap.height !== 640) return false;
    const total = [...sheets.values()].reduce((sum, item) => sum + (item === sheet ? 0 : area(item.bitmap)), area(paintDefaultSize));
    if (total > paintLimits.maxTotalPixels) return false;
    const pixels = sheet.context.getImageData(0, 0, sheet.bitmap.width, sheet.bitmap.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 0) return false;
    sheet.bitmap.width = paintDefaultSize.width;
    sheet.bitmap.height = paintDefaultSize.height;
    notify();
    return true;
  }

  function selectSheet(id) {
    if (!sheets.has(id) || active.id === id) return false;
    cancelGesture();
    active = sheets.get(id);
    notify();
    return true;
  }

  function renameSheet(id, name) {
    const sheet = sheets.get(id);
    if (!sheet) return false;
    const title = String(name ?? '').trim().slice(0, 80);
    if (!title) throw new Error('Enter a sheet name.');
    sheet.name = title;
    notify();
    return true;
  }

  function removeSheet(id = active.id) {
    const sheet = sheets.get(id);
    if (!sheet) return false;
    if (sheets.size === 1) throw new Error('Keep at least one sheet open.');
    if (sheet === active) {
      cancelGesture();
      const order = [...sheets.values()];
      const index = order.indexOf(sheet);
      active = order[index + 1] || order[index - 1];
    }
    clearHistory(sheet.back);
    clearHistory(sheet.forward);
    sheets.delete(id);
    destroyBitmap(sheet.bitmap);
    notify();
    return true;
  }

  function duplicateSheet(id = active.id) {
    const sheet = sheets.get(id);
    if (!sheet) return null;
    cancelGesture();
    const draft = addSheet({ width: sheet.bitmap.width, height: sheet.bitmap.height, name: `${sheet.name} copy`, revision: 1 });
    draft.context.drawImage(sheet.bitmap, 0, 0);
    notify();
    return descriptor(draft);
  }

  function configure(changes = {}) {
    const tool = Object.hasOwn(toolAlias, changes.tool) ? toolAlias[changes.tool] : changes.tool;
    if (toolSet.has(tool)) options.tool = tool;
    if (brushes.has(changes.brush)) options.brush = changes.brush;
    if (['rect', 'free'].includes(changes.selectionShape)) options.selectionShape = changes.selectionShape;
    for (const key of ['color', 'secondaryColor']) {
      const color = colorComponents(changes[key]);
      if (color) options[key] = pixelColor(color, 0);
    }
    for (const key of ['fill', 'stroke', 'grid', 'bold', 'italic', 'pressure', 'transparentSelection']) if (typeof changes[key] === 'boolean') options[key] = changes[key];
    for (const [key, minimum, maximum] of [['size', 1, 256], ['opacity', 0, 1], ['tolerance', 0, 255], ['hardness', 0, 1],
      ['density', .05, 1], ['grain', 0, 1], ['flow', .05, 1], ['angle', 0, 179], ['fontSize', 4, 512], ['zoom', .1, 16]]) {
      if (changes[key] !== undefined && Number.isFinite(Number(changes[key]))) options[key] = bounded(Number(changes[key]), minimum, maximum);
    }
    if (typeof changes.text === 'string') options.text = changes.text.slice(0, 5000);
    if (typeof changes.font === 'string' && /^[a-zA-Z0-9 ,_\-]{1,80}$/.test(changes.font)) options.font = changes.font;
    notify();
    return state();
  }

  async function loadImage(blob, { newSheet: create = true, name, id, revision } = {}) {
    const target = active;
    const source = await decode(blob);
    try {
      const size = dimensions(source.width, source.height);
      if (create) {
        cancelGesture();
        const sheet = addSheet({ ...size, name, id, revision: revision ?? 1 });
        sheet.context.drawImage(source.bitmap, 0, 0);
        notify();
        return descriptor(sheet);
      }
      if (target !== active) throw new Error('Select the destination sheet and open the image again.');
      requireBudget(size, active);
      mutate(sheet => {
        sheet.bitmap.width = size.width;
        sheet.bitmap.height = size.height;
        sheet.context.drawImage(source.bitmap, 0, 0);
        sheet.selection = null;
      });
      return descriptor(active);
    } finally { source.close(); }
  }

  function replay(direction) {
    cancelGesture();
    const source = direction === 'undo' ? active.back : active.forward;
    const destination = direction === 'undo' ? active.forward : active.back;
    if (!source.length) return false;
    const latest = source.at(-1);
    requireBudget(latest.image, active);
    const current = historyFrame(active);
    restoreHistory(active, removeHistory(source));
    retainHistory(destination, current);
    active.revision++;
    notify();
    return true;
  }

  function selectAll() {
    cancelGesture();
    active.selection = { x: 0, y: 0, width: active.bitmap.width, height: active.bitmap.height };
    notify();
  }

  function deselect() {
    cancelGesture();
    active.selection = null;
    notify();
  }

  function invertSelection() {
    cancelGesture();
    const previous = active.selection;
    if (!previous) return selectAll();
    const { width, height } = active.bitmap;
    if (previous.hole) active.selection = previous.hole;
    else if (!previous.points && previous.x === 0 && previous.y === 0 && previous.width === width && previous.height === height) active.selection = null;
    else active.selection = { x: 0, y: 0, width, height, hole: previous };
    notify();
  }

  function clear() {
    return mutate(sheet => { sheet.context.clearRect(0, 0, sheet.bitmap.width, sheet.bitmap.height); sheet.selection = null; });
  }

  function deleteSelection() {
    if (!active.selection) return false;
    return mutate(sheet => clearSelection(sheet.context, sheet.selection));
  }

  function crop() {
    if (!active.selection) return false;
    return mutate(sheet => {
      const snapshot = cropBitmap(sheet.bitmap, sheet.selection);
      sheet.bitmap.width = snapshot.width;
      sheet.bitmap.height = snapshot.height;
      sheet.context.drawImage(snapshot, 0, 0);
      destroyBitmap(snapshot);
      sheet.selection = null;
    });
  }

  async function copySelection() {
    const slice = active.selection ? cropBitmap(active.bitmap, active.selection, options.transparentSelection && options.secondaryColor) : duplicateBitmap(active.bitmap);
    try { return await encode(slice, 'image/png'); }
    finally { destroyBitmap(slice); }
  }

  async function cutSelection() {
    const sheet = active;
    const revision = sheet.revision;
    const coordinates = sheet.selection;
    const blob = await copySelection();
    if (sheet === active && revision === sheet.revision && coordinates === sheet.selection) {
      if (coordinates) deleteSelection();
      else clear();
    }
    return blob;
  }

  async function pasteImage(blob) {
    const target = active;
    const source = await decode(blob);
    try {
      if (active !== target) throw new Error('Select the destination sheet and paste again.');
      const width = Math.min(source.width, target.bitmap.width);
      const height = Math.min(source.height, target.bitmap.height);
      const x = Math.min(target.selection?.x ?? 0, target.bitmap.width - width);
      const y = Math.min(target.selection?.y ?? 0, target.bitmap.height - height);
      return mutate(sheet => {
        sheet.context.drawImage(source.bitmap, x, y);
        sheet.selection = { x, y, width, height };
      });
    } finally { source.close(); }
  }

  function resize(width, height, { scale = false, smooth = true } = {}) {
    const size = dimensions(width, height);
    if (size.width === active.bitmap.width && size.height === active.bitmap.height) return false;
    requireBudget(size, active);
    return mutate(sheet => {
      const copy = duplicateBitmap(sheet.bitmap);
      sheet.bitmap.width = size.width;
      sheet.bitmap.height = size.height;
      sheet.context.imageSmoothingEnabled = Boolean(smooth);
      if (scale) sheet.context.drawImage(copy, 0, 0, size.width, size.height);
      else sheet.context.drawImage(copy, 0, 0);
      destroyBitmap(copy);
      sheet.selection = null;
    });
  }

  function rotate(degrees) {
    const turn = Number(degrees);
    if (!Number.isFinite(turn) || turn % 90 !== 0) throw new Error('Rotate by 90, 180 or 270 degrees.');
    const normalized = (turn % 360 + 360) % 360;
    if (!normalized) return false;
    return mutate(sheet => {
      const copy = duplicateBitmap(sheet.bitmap);
      sheet.bitmap.width = normalized === 180 ? copy.width : copy.height;
      sheet.bitmap.height = normalized === 180 ? copy.height : copy.width;
      sheet.context.save();
      sheet.context.translate(sheet.bitmap.width / 2, sheet.bitmap.height / 2);
      sheet.context.rotate(normalized * Math.PI / 180);
      sheet.context.drawImage(copy, -copy.width / 2, -copy.height / 2);
      sheet.context.restore();
      destroyBitmap(copy);
      sheet.selection = null;
    });
  }

  function flip(axis = 'horizontal') {
    if (axis !== 'horizontal' && axis !== 'vertical') throw new Error('Choose a horizontal or vertical flip.');
    return mutate(sheet => {
      const copy = duplicateBitmap(sheet.bitmap);
      const horizontal = axis === 'horizontal';
      sheet.context.clearRect(0, 0, copy.width, copy.height);
      sheet.context.save();
      sheet.context.translate(horizontal ? copy.width : 0, horizontal ? 0 : copy.height);
      sheet.context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      sheet.context.drawImage(copy, 0, 0);
      sheet.context.restore();
      destroyBitmap(copy);
      sheet.selection = null;
    });
  }

  function removeBackground({ tolerance = 24, allPixels = false } = {}) {
    let count = 0;
    mutate(sheet => {
      const sample = sheet.context.getImageData(0, 0, sheet.bitmap.width, sheet.bitmap.height);
      count = clearBackgroundPixels(sample, bounded(Number(tolerance) || 0, 0, 255), Boolean(allPixels));
      if (!count) return false;
      sheet.context.putImageData(sample, 0, 0);
      return true;
    });
    return count;
  }

  async function exportImage({ type = 'image/png', quality = .92, background = '#ffffff', sheetId = active.id } = {}) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new Error('Choose PNG, JPEG or WebP.');
    const sheet = sheets.get(sheetId);
    if (!sheet) throw new Error('The sheet is no longer open.');
    const bitmap = surface(sheet.bitmap.width, sheet.bitmap.height);
    const context = bitmap.getContext('2d');
    if (type === 'image/jpeg') {
      context.fillStyle = colorComponents(background) ? background : '#ffffff';
      context.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    context.drawImage(sheet.bitmap, 0, 0);
    try { return await encode(bitmap, type, Number.isFinite(Number(quality)) ? bounded(Number(quality), 0, 1) : .92); }
    finally { destroyBitmap(bitmap); }
  }

  function coords(event) {
    const rect = canvas.getBoundingClientRect();
    return position(bounded((event.clientX - rect.left) * canvas.width / (rect.width || 1), 0, canvas.width - .0001),
      bounded((event.clientY - rect.top) * canvas.height / (rect.height || 1), 0, canvas.height - .0001));
  }

  function pressure(event, settings) {
    return settings.pressure && event.pointerType === 'pen' && event.pressure > 0 ? bounded(event.pressure * 1.7, .15, 1.5) : 1;
  }

  function movedBox(drag, selection, bitmap) {
    return { ...selection, x: bounded(Math.round(selection.x + drag.end.x - drag.start.x), 0, bitmap.width - selection.width),
      y: bounded(Math.round(selection.y + drag.end.y - drag.start.y), 0, bitmap.height - selection.height) };
  }

  function placeText(sheet, at, color, settings) {
    const { context } = sheet;
    const family = settings.font.includes(',') ? settings.font : `"${settings.font}", sans-serif`;
    context.save();
    context.globalAlpha = settings.opacity;
    context.fillStyle = color;
    context.textBaseline = 'top';
    context.font = `${settings.italic ? 'italic ' : ''}${settings.bold ? 'bold ' : ''}${settings.fontSize}px ${family}`;
    settings.text.split(/\r?\n/).forEach((row, index) => context.fillText(row, at.x, at.y + index * settings.fontSize * 1.2));
    context.restore();
  }

  function handleDown(event) {
    if (gesture || ![0, 2].includes(event.button)) return;
    event.preventDefault();
    const start = coords(event);
    const x = Math.floor(start.x);
    const y = Math.floor(start.y);
    const secondary = event.button === 2;
    const color = secondary ? options.secondaryColor : options.color;
    const tool = options.tool;
    if (tool === 'eyedropper') {
      const value = pixelColor(active.context.getImageData(x, y, 1, 1).data, 0);
      options[secondary ? 'secondaryColor' : 'color'] = value;
      onColor?.(value, secondary);
      return notify();
    }
    if (tool === 'text') {
      if (!options.text.trim()) return onError?.(new Error('Enter text, then click a point on the canvas.'));
      return mutate(sheet => { sheet.selection = null; placeText(sheet, start, color, options); });
    }
    if (tool === 'fill') {
      return mutate(sheet => {
        const image = sheet.context.getImageData(0, 0, sheet.bitmap.width, sheet.bitmap.height);
        if (!fillPixels(image, x, y, colorComponents(color), options.opacity, options.tolerance)) return false;
        sheet.context.putImageData(image, 0, 0);
        sheet.selection = null;
        return true;
      });
    }
    const selection = active.selection;
    const inside = selection && !selection.hole && x >= selection.x && y >= selection.y && x < selection.x + selection.width && y < selection.y + selection.height &&
      (!selection.points || active.context.isPointInPath(selectionPath(selection), x, y, 'evenodd'));
    gesture = { id: event.pointerId, start, end: start, options: { ...options }, secondary, shift: event.shiftKey };
    if (tool === 'select') {
      gesture.kind = inside ? 'move' : options.selectionShape === 'free' ? 'lasso' : 'select';
      if (inside) gesture.fragment = cropBitmap(active.bitmap, selection, options.transparentSelection && options.secondaryColor);
      if (gesture.kind === 'lasso') gesture.points = [start];
    } else if (tool === 'hand') {
      gesture.kind = 'hand';
      gesture.grab = { x: event.clientX, y: event.clientY, left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop };
    } else if (shapes.has(tool)) gesture.kind = 'shape';
    else {
      gesture.kind = 'stroke';
      gesture.before = historyFrame(active);
      active.selection = null;
      gesture.pressure = pressure(event, gesture.options);
      drawFreehand(active.context, gesture, start, start, gesture.pressure);
      if (tool === 'spray') {
        const stroke = gesture;
        stroke.sprayTimer = setInterval(() => {
          if (gesture !== stroke || performance.now() - (stroke.lastMovement ?? 0) < 65) return;
          drawFreehand(active.context, stroke, stroke.end, stroke.end, stroke.pressure);
          schedulePreview();
        }, 65);
      }
    }
    canvas.setPointerCapture(event.pointerId);
    schedulePreview();
  }

  function handleMove(event) {
    const point = coords(event);
    onPosition?.({ x: Math.floor(point.x), y: Math.floor(point.y) });
    if (gesture?.id !== event.pointerId) return;
    if (gesture.kind === 'hand') {
      scrollContainer.scrollLeft = gesture.grab.left + gesture.grab.x - event.clientX;
      scrollContainer.scrollTop = gesture.grab.top + gesture.grab.y - event.clientY;
      return;
    }
    gesture.shift = event.shiftKey;
    if (gesture.kind === 'stroke') {
      const samples = event.getCoalescedEvents?.();
      for (const item of samples?.length ? samples : [event]) {
        const at = coords(item);
        gesture.pressure = pressure(item, gesture.options);
        if (at.x !== gesture.end.x || at.y !== gesture.end.y) {
          drawFreehand(active.context, gesture, gesture.end, at, gesture.pressure);
          gesture.lastMovement = performance.now();
        }
        gesture.end = at;
      }
    } else {
      gesture.end = point;
      if (gesture.kind === 'lasso' && gesture.points.length < 2048) {
        const last = gesture.points.at(-1);
        if (Math.hypot(last.x - point.x, last.y - point.y) >= 2) gesture.points.push(point);
      }
    }
    schedulePreview();
  }

  function handleEnd(event) {
    if (gesture?.id !== event.pointerId) return;
    const drag = gesture;
    gesture = null;
    clearInterval(drag.sprayTimer);
    const point = coords(event);
    drag.shift = event.shiftKey;
    const previous = drag.end;
    drag.end = point;
    if (drag.kind === 'stroke') {
      if (point.x !== previous.x || point.y !== previous.y) drawFreehand(active.context, drag, previous, point, pressure(event, drag.options));
      return committed(active, drag.before);
    }
    if (drag.kind === 'shape') return mutate(sheet => { sheet.selection = null; drawShape(sheet.context, drag); });
    if (drag.kind === 'select') active.selection = frame(drag.start, point, active.bitmap);
    if (drag.kind === 'lasso') active.selection = lassoBox([...drag.points, point], active.bitmap);
    if (drag.kind === 'move') {
      const selected = active.selection;
      const next = movedBox(drag, selected, active.bitmap);
      if (selected.x !== next.x || selected.y !== next.y) {
        mutate(sheet => {
          clearSelection(sheet.context, selected);
          sheet.context.drawImage(drag.fragment, next.x, next.y);
          sheet.selection = next;
        });
      } else notify();
      destroyBitmap(drag.fragment);
      return;
    }
    notify();
  }

  function handleCancel(event) {
    if (gesture?.id !== event.pointerId) return;
    cancelGesture();
    notify();
  }

  function handleContext(event) { event.preventDefault(); }

  const handlers = { pointerdown: handleDown, pointermove: handleMove, pointerup: handleEnd, pointercancel: handleCancel,
    lostpointercapture: handleCancel, contextmenu: handleContext };
  function destroy() {
    cancelGesture();
    if (animation) cancelAnimationFrame(animation);
    for (const [name, callback] of Object.entries(handlers)) canvas.removeEventListener(name, callback);
    for (const sheet of sheets.values()) {
      clearHistory(sheet.back);
      clearHistory(sheet.forward);
      destroyBitmap(sheet.bitmap);
    }
    sheets.clear();
  }

  canvas.style.touchAction = 'none';
  canvas.style.imageRendering = 'pixelated';
  for (const [name, callback] of Object.entries(handlers)) canvas.addEventListener(name, callback);
  addSheet();
  flushPreview();

  return { configure, state, newSheet, upgradeBlankStarter, selectSheet, renameSheet, removeSheet, duplicateSheet, loadImage,
    undo: () => replay('undo'), redo: () => replay('redo'), clear, selectAll, deselect, invertSelection, crop, copySelection, cutSelection,
    pasteImage, deleteSelection, resize, rotate, flip, removeBackground, exportImage, destroy };
}
