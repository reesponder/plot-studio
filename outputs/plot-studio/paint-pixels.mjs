export function colorComponents(value) {
  if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) return null;
  const hex = value.length === 4 ? [...value.slice(1)].map(character => character.repeat(2)).join('') : value.slice(1);
  return hex.match(/../g).map(pair => Number.parseInt(pair, 16));
}

export function pixelColor(data, offset) {
  return '#' + Array.from(data.slice(offset, offset + 3), channel => channel.toString(16).padStart(2, '0')).join('');
}

function matchesColor(pixels, offset, reference, tolerance) {
  const alpha = pixels[offset + 3];
  if (!alpha && !reference[3]) return true;
  if (Math.abs(alpha - reference[3]) > tolerance) return false;
  const difference = (pixels[offset] - reference[0]) ** 2 + (pixels[offset + 1] - reference[1]) ** 2 +
    (pixels[offset + 2] - reference[2]) ** 2;
  return difference <= 3 * tolerance ** 2;
}

function reachable(width, height, valid, seed, apply) {
  const queued = new Uint8Array(width * height);
  const stack = new Uint32Array(width * height);
  let end = 0;
  let count = 0;
  const enqueue = index => {
    if (queued[index] || !valid(index * 4)) return;
    queued[index] = 1;
    stack[end++] = index;
  };
  seed(enqueue);
  while (end) {
    const index = stack[--end];
    if (apply(index * 4)) count++;
    const column = index % width;
    if (column > 0) enqueue(index - 1);
    if (column < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < queued.length - width) enqueue(index + width);
  }
  return count;
}

export function fillPixels(image, x, y, color, opacity, tolerance) {
  const { width, height, data } = image;
  const origin = y * width + x;
  const sample = data.slice(origin * 4, origin * 4 + 4);
  if (opacity === 0 || sample[3] === 255 && color.every((value, index) => value === sample[index])) return 0;
  return reachable(width, height, offset => matchesColor(data, offset, sample, tolerance), enqueue => enqueue(origin), offset => {
    const originalAlpha = data[offset + 3] / 255 * (1 - opacity);
    const nextAlpha = opacity + originalAlpha;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = (color[channel] * opacity + data[offset + channel] * originalAlpha) / nextAlpha;
    data[offset + 3] = Math.round(nextAlpha * 255);
    return true;
  });
}

function backgroundColor(image, tolerance) {
  const { width, height, data } = image;
  const radius = Math.min(4, Math.floor(Math.min(width, height) / 4));
  const corners = [];
  for (const top of [0, height - 1]) {
    for (const left of [0, width - 1]) {
      for (let dy = 0; dy <= radius; dy += Math.max(radius, 1)) {
        for (let dx = 0; dx <= radius; dx += Math.max(radius, 1)) {
          const x = left === 0 ? dx : left - dx;
          const y = top === 0 ? dy : top - dy;
          const index = (y * width + x) * 4;
          corners.push(data.slice(index, index + 4));
        }
      }
    }
  }
  return corners.reduce((best, current) => {
    const count = corners.filter(sample => matchesColor(sample, 0, current, tolerance)).length;
    return count > best.count ? { count, sample: current } : best;
  }, { count: 0, sample: corners[0] }).sample;
}

function gradientBackground(image, tolerance) {
  const { width, height, data } = image;
  if (width < 16 || height < 16) return null;
  const edgeX = width - 1;
  const edgeY = height - 1;
  const at = (x, y) => (y * width + x) * 4;
  const offsets = [at(0, 0), at(edgeX, 0), at(0, edgeY), at(edgeX, edgeY)];
  const colors = offsets.map(offset => data.slice(offset, offset + 4));
  if (colors.some(color => color[3] < 250) || colors.every(color => matchesColor(color, 0, colors[0], Math.max(6, tolerance)))) return null;
  const [topLeft, topRight, bottomLeft, bottomRight] = colors;
  const top = Array.from({ length: 3 }, (_, channel) => Float32Array.from({ length: width }, (_, x) =>
    topLeft[channel] + (topRight[channel] - topLeft[channel]) * x / edgeX));
  const bottom = Array.from({ length: 3 }, (_, channel) => Float32Array.from({ length: width }, (_, x) =>
    bottomLeft[channel] + (bottomRight[channel] - bottomLeft[channel]) * x / edgeX));
  const rowProgress = Float32Array.from({ length: height }, (_, y) => y / edgeY);

  function resembles(offset, threshold) {
    if (255 - data[offset + 3] > threshold) return false;
    const index = offset / 4;
    const x = index % width;
    const ratio = rowProgress[(index - x) / width];
    let difference = 0;
    for (let channel = 0; channel < 3; channel++) {
      difference += (data[offset + channel] - Math.round(top[channel][x] + (bottom[channel][x] - top[channel][x]) * ratio)) ** 2;
    }
    return difference <= 3 * threshold ** 2;
  }

  const check = Math.max(6, tolerance / 2);
  let agreeing = 0;
  for (let sample = 1; sample <= 7; sample++) {
    const x = Math.round(edgeX * sample / 8);
    const y = Math.round(edgeY * sample / 8);
    for (const offset of [at(x, 0), at(x, edgeY), at(0, y), at(edgeX, y)]) if (resembles(offset, check)) agreeing++;
  }
  return agreeing >= 26 ? offset => resembles(offset, tolerance) : null;
}

export function clearBackgroundPixels(image, tolerance, allPixels) {
  const { width, height, data } = image;
  const reference = backgroundColor(image, tolerance);
  const gradient = gradientBackground(image, tolerance);
  const matches = offset => data[offset + 3] === 0 || (gradient ? gradient(offset) : matchesColor(data, offset, reference, tolerance));
  const clear = offset => {
    if (data[offset + 3] === 0) return false;
    data.fill(0, offset, offset + 4);
    return true;
  };
  if (allPixels) {
    let count = 0;
    for (let offset = 0; offset < data.length; offset += 4) if (matches(offset) && clear(offset)) count++;
    return count;
  }
  return reachable(width, height, matches, enqueue => {
    for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  }, clear);
}
