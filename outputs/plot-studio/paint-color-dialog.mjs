import { paintPalette } from './paint-ribbon.mjs';

const hexPattern = /^#[a-f0-9]{6}$/i;
const clamp = (n, max) => Math.min(max, Math.max(0, n));
const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
const rgbFromHex = value => value.slice(1).match(/../g).map(channel => Number.parseInt(channel, 16));

function hslToRgb([hue, saturation, lightness]) {
  const s = saturation / 100;
  const l = lightness / 100;
  const f = offset => {
    const channel = (offset + hue / 30) % 12;
    return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(channel - 3, 9 - channel, 1)));
  };
  return [f(0), f(8), f(4)].map(Math.round);
}

function rgbToHsl(rgb) {
  const [r, g, b] = rgb.map(value => value / 255);
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const chroma = max - min;
  const l = (max + min) / 2;
  if (!chroma) return [0, 0, l * 100];
  let hue;
  if (max === r) hue = (g - b) / chroma;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return [(hue * 60 + 360) % 360, chroma / (1 - Math.abs(2 * l - 1)) * 100, l * 100];
}

const basic = [...paintPalette, ...[72, 50, 32, 17].flatMap(lightness =>
  [0, 31, 65, 124, 189, 234, 293].map(hue => hex(hslToRgb([hue, 87, lightness]))))];
const colorButton = value => `<button type="button" class="paint-swatch" data-color-basic="${value}" style="--swatch:${value}" aria-label="Choose ${value}" title="${value}"></button>`;
const numeric = ([key, label, max]) => `<label><span>${label}</span><input type="number" inputmode="numeric" min="0" max="${max}" data-color-channel="${key}" aria-label="${label}"></label>`;

export function paintColorMarkup() {
  return `<div class="paint-color-editor">
    <div class="paint-color-presets"><label>Basic colors</label><div class="paint-color-swatches">${basic.map(colorButton).join('')}</div>
      <label>Custom colors</label><div class="paint-color-swatches paint-color-custom">${Array.from({ length: 10 }, (_, index) => `<button type="button" class="paint-swatch" data-color-slot="${index}" aria-label="Custom color ${index + 1}" aria-pressed="false"></button>`).join('')}</div></div>
    <div class="paint-color-detail"><div class="paint-color-picker"><div class="paint-color-spectrum" tabindex="0" role="group" aria-label="Hue and saturation spectrum" title="Drag to select hue and saturation. Arrow keys also work." data-color-spectrum><span aria-hidden="true"></span></div><input type="range" title="Luminance" aria-label="Luminance slider" min="0" max="100" data-color-lightness></div>
      <div class="paint-color-values"><div class="paint-color-sample"><output aria-label="Selected color" data-color-sample></output><label><span class="sr-only">Hex color</span><input type="text" aria-label="Hex color" maxlength="7" data-color-hex></label></div>
        <div>${[['h', 'Hue', 359], ['s', 'Saturation', 100], ['l', 'Luminance', 100]].map(numeric).join('')}</div><div>${[['r', 'Red', 255], ['g', 'Green', 255], ['b', 'Blue', 255]].map(numeric).join('')}</div></div>
      <button type="button" class="paint-button" data-color-add>Add to Custom Colors</button>
    </div><input type="hidden" name="pickedColor" data-color-value></div>`;
}

export function mountPaintColors(root, initial, slots, onAdd) {
  const find = selector => root.querySelector(selector);
  const spectrum = find('[data-color-spectrum]');
  const lightness = find('[data-color-lightness]');
  const channels = [...root.querySelectorAll('[data-color-channel]')];
  const input = find('[data-color-hex]');
  const custom = [...root.querySelectorAll('[data-color-slot]')];
  let rgb = rgbFromHex(initial);
  let hsl = rgbToHsl(rgb);
  let slot = Math.max(0, slots.findIndex(color => !color));

  function sync(origin) {
    const value = hex(rgb);
    const [h, s, l] = hsl;
    const [r, g, b] = rgb;
    const values = { h: Math.min(359, Math.round(h)), s: Math.round(s), l: Math.round(l), r, g, b };
    find('[data-color-value]').value = value;
    find('[data-color-sample]').style.backgroundColor = value;
    if (origin !== input) input.value = value.toUpperCase();
    for (const channel of channels) if (origin !== channel) channel.value = values[channel.dataset.colorChannel];
    lightness.value = l;
    lightness.style.setProperty('--mid-color', `hsl(${h} ${s}% 50%)`);
    spectrum.style.setProperty('--hue', `${h / 360 * 100}%`);
    spectrum.style.setProperty('--sat', `${100 - s}%`);
    custom.forEach((button, index) => {
      button.style.setProperty('--swatch', slots[index] || '#fff');
      button.setAttribute('aria-pressed', String(index === slot));
    });
  }
  function choose(value, origin) {
    rgb = rgbFromHex(value);
    hsl = rgbToHsl(rgb);
    sync(origin);
  }
  function point(event) {
    const rect = spectrum.getBoundingClientRect();
    hsl[0] = clamp((event.clientX - rect.left) / rect.width * 360, 359.99);
    hsl[1] = 100 - clamp((event.clientY - rect.top) / rect.height * 100, 100);
    rgb = hslToRgb(hsl);
    sync();
  }
  spectrum.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    spectrum.setPointerCapture(event.pointerId);
    point(event);
  });
  spectrum.addEventListener('pointermove', event => { if (spectrum.hasPointerCapture(event.pointerId)) point(event); });
  spectrum.addEventListener('keydown', event => {
    const axis = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1] }[event.key];
    if (!axis) return;
    event.preventDefault();
    event.stopPropagation();
    const increment = event.shiftKey ? 10 : 1;
    hsl[0] = clamp(hsl[0] + axis[0] * increment, 359);
    hsl[1] = clamp(hsl[1] + axis[1] * increment, 100);
    rgb = hslToRgb(hsl);
    sync();
  });
  lightness.addEventListener('input', () => { hsl[2] = Number(lightness.value); rgb = hslToRgb(hsl); sync(); });
  input.addEventListener('input', () => {
    const value = input.value.startsWith('#') ? input.value : `#${input.value}`;
    if (hexPattern.test(value)) choose(value, input);
  });
  input.addEventListener('blur', () => sync());
  for (const channel of channels) {
    channel.addEventListener('input', () => {
      if (channel.value === '') return;
      const key = channel.dataset.colorChannel;
      const value = clamp(Number(channel.value), Number(channel.max));
      if ('hsl'.includes(key)) { hsl['hsl'.indexOf(key)] = value; rgb = hslToRgb(hsl); }
      else { rgb['rgb'.indexOf(key)] = value; hsl = rgbToHsl(rgb); }
      sync(channel);
    });
    channel.addEventListener('blur', () => sync());
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.colorBasic) choose(button.dataset.colorBasic);
    else if (button.dataset.colorSlot !== undefined) {
      slot = Number(button.dataset.colorSlot);
      if (slots[slot]) choose(slots[slot]);
      else sync();
    } else if (button.hasAttribute('data-color-add')) {
      onAdd(slot, hex(rgb));
      slot = (slot + 1) % custom.length;
      sync();
    }
  });
  sync();
}
