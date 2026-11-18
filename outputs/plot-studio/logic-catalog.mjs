const catalog = Object.create(null);

const arg = (key, label, type, initial, options = {}) => ({ key, label, type, initial, ...options });
const source = (type = 'any', label = 'Source') => arg('input', label, type, undefined, { context: true });
const config = (key, label, kind, initial, options = {}) => ({ key, label, kind, initial, ...options });
const numeric = (key, label, initial, options) => arg(key, label, 'number', initial, options);
const text = (key, label, initial, options) => arg(key, label, 'string', initial, options);
const controlKinds = { string: 'text', number: 'number', boolean: 'boolean', object: 'textarea', array: 'textarea', any: 'textarea' };
const resultPorts = [['next', 'Success'], ['fault', 'Error']];
const branchPorts = [['yes', 'Pass'], ['no', 'Fail'], ['fault', 'Error']];
const runPorts = [['next', 'Run']];
const pageOption = config('page', 'Page', 'page', '');

function operation(id, group, label, description, inputs, output, run, settings = {}) {
  const controls = inputs.map(({ key, label: fieldLabel, type, description: help, placeholder, ...details }) => {
    const format = ({ object: 'Enter a JSON object or connect an object output.', array: 'Enter a JSON array or connect a list output.' })[type];
    const description = help || (details.context ? 'Leave blank to use the latest result or event value.' : format);
    return { key, label: fieldLabel, kind: controlKinds[type], port: key, description, placeholder, ...details };
  });
  controls.push(...(settings.controls || []));
  const outputLabel = settings.branch ? 'Passed' : 'Result';
  catalog[id] = {
    label, group, description, input: true, target: Boolean(settings.target), args: inputs, controls,
    defaults: Object.fromEntries(controls.map(({ key, initial }) => [key, initial])),
    inputs: inputs.map(({ key, label: fieldLabel, type }) => [key, fieldLabel, type]),
    outputs: settings.branch ? branchPorts : resultPorts,
    values: [[ 'result', outputLabel, output ], ...(settings.projections || []), ['error', 'Error', 'object']],
    projections: settings.projections || [],
    branch: Boolean(settings.branch), run,
  };
  if (settings.target) catalog[id].defaults.target = '';
}

function trigger(id, label, description, event, values, scope = 'block', options = {}) {
  const controls = scope === 'block' ? [] : [pageOption];
  controls.push(...(options.controls || []));
  catalog[id] = {
    label, description, group: 'Event', event: { name: event, scope, delay: options.delay, minimum: options.minimum },
    target: scope === 'block', controls, outputs: runPorts, values,
    defaults: Object.fromEntries(controls.map(({ key, initial }) => [key, initial])),
  };
  if (scope === 'block') catalog[id].defaults.target = '';
}

const pointerValues = [['detail', 'Pointer', 'object'], ['x', 'Pointer X', 'number'], ['y', 'Pointer Y', 'number']];
for (const [id, label, event, description] of [
  ['double-click', 'Double click', 'dblclick', 'Run when the visitor double-clicks a block.'],
  ['pointer-enter', 'Pointer enter', 'pointerenter', 'Run when the pointer enters a block.'],
  ['pointer-leave', 'Pointer leave', 'pointerleave', 'Run when the pointer leaves a block.'],
  ['pointer-down', 'Pointer down', 'pointerdown', 'Run when a mouse, finger or pen is pressed on a block.'],
  ['pointer-up', 'Pointer up', 'pointerup', 'Run when a mouse, finger or pen is released on a block.'],
]) trigger(id, label, description, event, pointerValues);

const fieldValues = [['value', 'Value', 'any'], ['checked', 'Checked', 'boolean']];
for (const [id, label, event, description] of [
  ['committed-change', 'Committed field change', 'change', 'Run when a field commits its value. Useful for select boxes and toggles.'],
  ['focus-in', 'Focus enters', 'focusin', 'Run when a block or something inside it receives keyboard focus.'],
  ['focus-out', 'Focus leaves', 'focusout', 'Run when focus moves away from the selected control.'],
  ['form-reset', 'Form reset', 'reset', 'Run after a form reset is requested.'],
]) trigger(id, label, description, event, fieldValues);

for (const [id, label, event, description] of [
  ['media-play', 'Media plays', 'play', 'Run when the selected audio or video starts playing.'],
  ['media-pause', 'Media pauses', 'pause', 'Run when the selected audio or video is paused.'],
  ['media-ended', 'Media ends', 'ended', 'Run when the selected audio or video reaches the end.'],
]) trigger(id, label, description, event, [['value', 'Time (s)', 'number']]);

trigger('details-toggle', 'Details toggle', 'Run when the selected expandable details open or close.', 'toggle', [['checked', 'Open', 'boolean']]);
trigger('window-resize', 'Viewport resized', 'Run after the browser viewport changes size.', 'resize', [['x', 'Width', 'number'], ['y', 'Height', 'number']], 'window');
trigger('page-scroll', 'Page scrolled', 'Run with the document scroll position, at most once every 100 ms.', 'scroll', [['x', 'Scroll X', 'number'], ['y', 'Scroll Y', 'number']], 'window', { minimum: 100 });
trigger('network-online', 'Connection online', 'Run when the browser reports its network connection is back.', 'online', [], 'window');
trigger('network-offline', 'Connection offline', 'Run when the browser reports it lost network access.', 'offline', [], 'window');
trigger('visibility-change', 'Page visibility changed', 'Run when the page becomes visible or hidden, such as when switching tabs.', 'visibilitychange', [['value', 'Visible', 'boolean']], 'document');
trigger('fragment-change', 'Address fragment changed', 'Run when the fragment after # in the page address changes.', 'hashchange', [['value', 'Fragment', 'string']], 'window');
trigger('timer-after', 'Timer after delay', 'Run once after the page has been open for the configured number of milliseconds.', null, [['value', 'Tick number', 'number']], 'timer', {
  delay: 'once', controls: [config('delay', 'Delay (ms)', 'number', 1000, { min: 50, max: 60000 })],
});
trigger('timer-every', 'Timer interval', 'Run repeatedly. The next tick waits for the flow to finish before starting its delay.', null, [['value', 'Tick number', 'number']], 'timer', {
  delay: 'repeat', controls: [config('delay', 'Interval (ms)', 'number', 1000, { min: 250, max: 60000 }), config('maxTicks', 'Maximum ticks', 'number', 60, { min: 1, max: 1000 })],
});

const math = (id, label, description, inputs, run) => operation(id, 'Math', label, description, inputs, 'number', run);
const twoNumbers = [source('number', 'Number A'), numeric('other', 'Number B', 0)];
math('add-numbers', 'Add numbers', 'Add two numbers.', twoNumbers, (p, h) => h.number(p.input) + h.number(p.other));
math('subtract-numbers', 'Subtract numbers', 'Subtract B from A.', twoNumbers, (p, h) => h.number(p.input) - h.number(p.other));
math('multiply-numbers', 'Multiply numbers', 'Multiply A by B.', [twoNumbers[0], numeric('other', 'Number B', 1)], (p, h) => h.number(p.input) * h.number(p.other));
math('divide-numbers', 'Divide numbers', 'Divide A by B. A zero divisor follows Error.', [twoNumbers[0], numeric('other', 'Number B', 1)], (p, h) => h.number(p.input) / h.number(p.other));
math('modulo', 'Remainder', 'Return the remainder after dividing A by B.', twoNumbers, (p, h) => h.number(p.input) % h.number(p.other));
math('power', 'Power', 'Raise a number to the specified power.', [source('number', 'Base'), numeric('power', 'Exponent', 2)], (p, h) => h.number(p.input) ** h.number(p.power));
math('sqrt', 'Square root', 'Find the nonnegative square root. Negative values follow Error.', [source('number', 'Number')], (p, h) => Math.sqrt(h.number(p.input)));
math('negate', 'Negate', 'Flip the sign of a number.', [source('number', 'Number')], (p, h) => -h.number(p.input));
math('absolute-value', 'Absolute value', 'Return the distance from zero.', [source('number', 'Number')], (p, h) => Math.abs(h.number(p.input)));
math('round-number', 'Round number', 'Round to the requested number of decimal places.', [source('number', 'Number'), numeric('places', 'Decimal places', 0)], (p, h) => Number(h.number(p.input).toFixed(h.integer(p.places, 0, 12))));
math('round-up', 'Round up', 'Round toward positive infinity.', [source('number', 'Number')], (p, h) => Math.ceil(h.number(p.input)));
math('round-down', 'Round down', 'Round toward negative infinity.', [source('number', 'Number')], (p, h) => Math.floor(h.number(p.input)));
math('truncate-number', 'Truncate number', 'Remove the fractional part of a number.', [source('number', 'Number')], (p, h) => Math.trunc(h.number(p.input)));
math('minimum-number', 'Smaller number', 'Choose the smaller of two numbers.', twoNumbers, (p, h) => Math.min(h.number(p.input), h.number(p.other)));
math('maximum-number', 'Larger number', 'Choose the larger of two numbers.', twoNumbers, (p, h) => Math.max(h.number(p.input), h.number(p.other)));
const bounds = [numeric('min', 'Minimum', 0), numeric('max', 'Maximum', 100)];
math('clamp-number', 'Clamp number', 'Keep a number between a minimum and maximum.', [source('number', 'Number'), ...bounds], (p, h) => {
  const [min, max] = h.range(p.min, p.max); return Math.min(max, Math.max(min, h.number(p.input)));
});
math('percent-of', 'Percentage of number', 'Calculate what a percentage of the input is worth.', [source('number', 'Number'), numeric('percent', 'Percent', 10)], (p, h) => h.number(p.input) * (h.number(p.percent) / 100));
math('random-integer', 'Random integer', 'Generate a random integer between inclusive bounds.', bounds, (p, h) => {
  const [min, max] = h.range(h.integer(p.min), h.integer(p.max)); return Math.floor(Math.random() * (max - min + 1)) + min;
});
math('map-range', 'Map number between ranges', 'Linearly convert a number from one range to another.', [source('number', 'Number'), ...bounds, numeric('outMin', 'Output minimum', 0), numeric('outMax', 'Output maximum', 1)], (p, h) => {
  const [min, max] = h.range(p.min, p.max); return h.number(p.outMin) + (h.number(p.outMax) - h.number(p.outMin)) * (h.number(p.input) - min) / (max - min);
});
math('sum-list', 'Sum list', 'Add every number in a list.', [source('array', 'Numbers')], (p, h) => h.list(p.input).reduce((sum, value) => sum + h.number(value), 0));
math('average-list', 'Average list', 'Find the arithmetic mean. An empty list follows Error.', [source('array', 'Numbers')], (p, h) => {
  const list = h.list(p.input); return list.reduce((sum, value) => sum + h.number(value), 0) / list.length;
});
math('smallest-list', 'Smallest item', 'Find the smallest number in a list.', [source('array', 'Numbers')], (p, h) => Math.min(...h.list(p.input).map(h.number)));
math('largest-list', 'Largest item', 'Find the largest number in a list.', [source('array', 'Numbers')], (p, h) => Math.max(...h.list(p.input).map(h.number)));
math('parse-number', 'Convert to number', 'Read a finite number from text, a number or a boolean.', [source()], (p, h) => h.number(p.input));

const string = (id, label, description, extra, run, result = 'string') => operation(id, 'Text', label, description, [source('string', 'Text'), ...extra], result, run);
string('append-text', 'Append text', 'Add a suffix to the text.', [text('other', 'Suffix', '')], (p, h) => h.text(p.input) + h.text(p.other));
string('prepend-text', 'Prepend text', 'Add a prefix to the text.', [text('other', 'Prefix', '')], (p, h) => h.text(p.other) + h.text(p.input));
string('trim-text', 'Trim whitespace', 'Remove leading and trailing whitespace.', [], (p, h) => h.text(p.input).trim());
string('uppercase-text', 'Uppercase text', 'Convert all letters to uppercase.', [], (p, h) => h.text(p.input).toUpperCase());
string('lowercase-text', 'Lowercase text', 'Convert all letters to lowercase.', [], (p, h) => h.text(p.input).toLowerCase());
string('capitalize-text', 'Capitalize first letter', 'Uppercase the first character and keep the remaining characters.', [], (p, h) => {
  const value = h.text(p.input); return value.charAt(0).toUpperCase() + value.slice(1);
});
string('titlecase-text', 'Title case', 'Capitalize the initial letter of each whitespace-separated word.', [], (p, h) => h.text(p.input).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase()));
string('slug-text', 'Create slug', 'Convert a label to a lowercase slug separated by hyphens.', [], (p, h) => h.text(p.input).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
string('text-length', 'Text length', 'Count Unicode code points in the text.', [], (p, h) => Array.from(h.text(p.input)).length, 'number');
string('text-position', 'Find text position', 'Find the first matching position, or -1 when absent.', [text('search', 'Find', '')], (p, h) => h.text(p.input).indexOf(h.text(p.search)), 'number');
string('text-slice', 'Slice text', 'Take text between a start and an end index. The end is excluded.', [numeric('start', 'Start', 0), numeric('end', 'End', 10)], (p, h) => h.text(p.input).slice(h.integer(p.start), h.integer(p.end)));
string('split-text', 'Split text', 'Split text into a list using the separator.', [text('separator', 'Separator', ',')], (p, h) => h.text(p.input).split(h.text(p.separator), h.maxItems), 'array');
string('split-lines', 'Split lines', 'Split text at LF or CRLF line breaks.', [], (p, h) => h.text(p.input).split(/\r?\n/, h.maxItems), 'array');
string('replace-text', 'Replace first match', 'Replace the first plain-text match.', [text('search', 'Find', ''), text('replacement', 'Replace with', '')], (p, h) => h.text(p.input).replace(h.text(p.search), () => h.text(p.replacement)));
string('replace-all-text', 'Replace all matches', 'Replace every plain-text match. The resulting text is size-limited.', [text('search', 'Find', ''), text('replacement', 'Replace with', '')], (p, h) => h.replaceAll(p.input, p.search, p.replacement));
string('reverse-text', 'Reverse text', 'Reverse text by Unicode code point.', [], (p, h) => Array.from(h.text(p.input)).reverse().join(''));
string('remove-spaces', 'Remove whitespace', 'Remove spaces, tabs and line breaks throughout the text.', [], (p, h) => h.text(p.input).replace(/\s+/g, ''));
string('collapse-spaces', 'Collapse whitespace', 'Replace whitespace runs with a single space and trim the ends.', [], (p, h) => h.text(p.input).trim().replace(/\s+/g, ' '));
string('pad-start-text', 'Pad start of text', 'Add a fill character at the start to reach the requested length.', [numeric('length', 'Length', 8), text('fill', 'Fill', '0')], (p, h) => h.text(p.input).padStart(h.integer(p.length, 0, h.maxText), h.text(p.fill)));
string('pad-end-text', 'Pad end of text', 'Add a fill character at the end to reach the requested length.', [numeric('length', 'Length', 8), text('fill', 'Fill', ' ')], (p, h) => h.text(p.input).padEnd(h.integer(p.length, 0, h.maxText), h.text(p.fill)));
string('encode-url-text', 'Encode URL component', 'Encode text for use in a query value or path component.', [], (p, h) => encodeURIComponent(h.text(p.input)));
string('decode-url-text', 'Decode URL component', 'Decode a URL-encoded value. Invalid escape sequences follow Error.', [], (p, h) => decodeURIComponent(h.text(p.input)));
string('text-before', 'Text before delimiter', 'Return the text before the first delimiter, or all text if absent.', [text('delimiter', 'Delimiter', ':')], (p, h) => {
  const value = h.text(p.input); const index = value.indexOf(h.text(p.delimiter)); return index < 0 ? value : value.slice(0, index);
});
string('text-after', 'Text after delimiter', 'Return the text after the first delimiter, or blank if absent.', [text('delimiter', 'Delimiter', ':')], (p, h) => {
  const value = h.text(p.input); const delimiter = h.text(p.delimiter); const index = value.indexOf(delimiter); return index < 0 ? '' : value.slice(index + delimiter.length);
});
operation('format-template', 'Text', 'Fill text template', 'Replace {{path}} placeholders with values from an object.', [source('object', 'Values'), text('template', 'Text template', '{{name}}')], 'string',
  (p, h) => h.formatTemplate(p.template, p.input));
operation('format-number', 'Text', 'Format number', 'Format a number with locale-specific separators.', [source('number', 'Number'), numeric('places', 'Maximum decimals', 2), text('locale', 'Locale', 'en-US')], 'string',
  (p, h) => new Intl.NumberFormat(h.text(p.locale), { maximumFractionDigits: h.integer(p.places, 0, 12) }).format(h.number(p.input)));
operation('convert-text', 'Text', 'Convert value to text', 'Convert a value to text. Arrays and objects produce JSON.', [source()], 'string', (p, h) => h.shortText(p.input));

const collection = (id, label, description, inputs, result, run) => operation(id, 'Collections', label, description, inputs, result, run);
const objectSource = source('object', 'Object');
const listSource = source('array', 'List');
const objectInput = (key, label, value = {}) => arg(key, label, 'object', value);
const listInput = (key, label, value = []) => arg(key, label, 'array', value);
const fieldKey = text('key', 'Field key', 'name');
const anyValueInput = arg('value', 'Value', 'any', null);

collection('map-object-fields', 'Map object fields', 'Build an object from another object. Mapping keys are destination fields and values are source paths.', [source('object', 'Source'), objectInput('mapping', 'Field map', { name: 'name' })], 'object', (p, h) => {
  const source = h.object(p.input);
  return h.record(h.entries(p.mapping).map(([key, path]) => [key, h.path(source, h.text(path))]));
});
collection('build-object', 'Build object', 'Create a new object from literal JSON or a linked object.', [objectInput('object', 'Object', { name: 'Example' })], 'object', (p, h) => h.record(h.entries(p.object)));
collection('set-object-field', 'Set object field', 'Copy an object and write one field.', [objectSource, fieldKey, anyValueInput], 'object', (p, h) => h.record([...h.entries(p.input), [h.key(p.key), p.value]]));
collection('remove-object-field', 'Remove object field', 'Copy an object without the named field.', [objectSource, fieldKey], 'object', (p, h) => h.record(h.entries(p.input).filter(([key]) => key !== h.text(p.key))));
collection('merge-objects', 'Merge objects', 'Combine two objects. The second object wins on duplicate fields.', [objectSource, objectInput('other', 'Second object')], 'object', (p, h) => h.record([...h.entries(p.input), ...h.entries(p.other)]));
collection('keep-object-fields', 'Keep object fields', 'Copy only the requested fields from an object.', [objectSource, listInput('fields', 'Field keys', ['name'])], 'object', (p, h) => {
  const keys = new Set(h.list(p.fields).map(h.text)); return h.record(h.entries(p.input).filter(([key]) => keys.has(key)));
});
collection('object-keys', 'Object keys', 'List an object’s own field keys.', [objectSource], 'array', (p, h) => h.entries(p.input).map(([key]) => key));
collection('object-values', 'Object values', 'List an object’s own field values.', [objectSource], 'array', (p, h) => h.entries(p.input).map(([, value]) => value));
collection('object-entries', 'Object entries', 'Convert an object to a list of [key, value] pairs.', [objectSource], 'array', (p, h) => h.entries(p.input));
collection('object-from-entries', 'Object from entries', 'Build an object from a list of [key, value] pairs.', [listSource], 'object', (p, h) => h.record(h.list(p.input)));
collection('parse-json', 'Parse JSON', 'Read JSON text as a number, string, boolean, object, array or null.', [source('string', 'JSON text')], 'any', (p, h) => JSON.parse(h.text(p.input)));
collection('stringify-json', 'Write JSON', 'Convert a value to JSON text. Use zero indentation for compact output.', [source(), numeric('indent', 'Indent spaces', 2)], 'string', (p, h) => JSON.stringify(p.input, null, h.integer(p.indent, 0, 8)) ?? 'null');
collection('build-list', 'Build list', 'Create a list from literal JSON or a linked list.', [listInput('items', 'Items', [])], 'array', (p, h) => [...h.list(p.items)]);
collection('list-length', 'List length', 'Count the items in a list.', [listSource], 'number', (p, h) => h.list(p.input).length);
collection('list-item', 'Item at index', 'Read a list item. Index zero is first and -1 is last.', [listSource, numeric('index', 'Index', 0)], 'any', (p, h) => h.list(p.input).at(h.integer(p.index)));
collection('slice-list', 'Slice list', 'Take items between a start and end index. The end is excluded.', [listSource, numeric('start', 'Start', 0), numeric('end', 'End', 10)], 'array', (p, h) => h.list(p.input).slice(h.integer(p.start), h.integer(p.end)));
collection('append-list-item', 'Append list item', 'Add one item after the existing list.', [listSource, anyValueInput], 'array', (p, h) => [...h.list(p.input), p.value]);
collection('prepend-list-item', 'Prepend list item', 'Add one item before the existing list.', [listSource, anyValueInput], 'array', (p, h) => [p.value, ...h.list(p.input)]);
collection('concat-lists', 'Combine lists', 'Append the second list to the first.', [listSource, listInput('other', 'Second list')], 'array', (p, h) => [...h.list(p.input), ...h.list(p.other)]);
collection('reverse-list', 'Reverse list', 'Return the items in reverse order.', [listSource], 'array', (p, h) => [...h.list(p.input)].reverse());
collection('distinct-list', 'Unique list items', 'Remove repeated primitive values while keeping the first occurrence.', [listSource], 'array', (p, h) => [...new Set(h.list(p.input))]);
collection('sort-text-list', 'Sort text list', 'Sort list items alphabetically using their text values.', [listSource, text('locale', 'Locale', 'en-US')], 'array', (p, h) => {
  const compare = new Intl.Collator(h.text(p.locale)).compare;
  return h.list(p.input).map((value) => ({ value, label: h.shortText(value) })).sort((a, b) => compare(a.label, b.label)).map(({ value }) => value);
});
collection('sort-number-list', 'Sort numeric list', 'Sort list items from the smallest numeric value to the largest.', [listSource], 'array', (p, h) => h.list(p.input).map(h.number).sort((a, b) => a - b));
collection('join-list', 'Join list as text', 'Convert the list to text using the specified separator.', [listSource, text('separator', 'Separator', ', ')], 'string', (p, h) => h.join(h.list(p.input), p.separator));
collection('flatten-list', 'Flatten list one level', 'Expand directly nested lists into the parent list.', [listSource], 'array', (p, h) => {
  const list = h.list(p.input);
  const length = list.reduce((size, item) => size + (Array.isArray(item) ? item.length : 1), 0);
  if (length > h.maxItems) throw Error('Flattened list exceeds the item limit.');
  return list.flat();
});
collection('filter-list-field', 'Filter list by field', 'Keep objects whose field value matches the comparison value exactly.', [listSource, fieldKey, anyValueInput], 'array', (p, h) => h.list(p.input).filter((item) => Object.is(h.path(item, p.key), p.value)));
collection('pluck-list-field', 'Read field from list', 'Return one value from each list item by field key or dot path.', [listSource, fieldKey], 'array', (p, h) => h.list(p.input).map((item) => h.path(item, p.key)));
collection('first-list-match', 'Find matching list item', 'Return the first object whose field value matches, or undefined.', [listSource, fieldKey, anyValueInput], 'any', (p, h) => h.list(p.input).find((item) => Object.is(h.path(item, p.key), p.value)));
collection('list-without-value', 'Remove value from list', 'Remove every occurrence of a matching primitive value.', [listSource, anyValueInput], 'array', (p, h) => h.list(p.input).filter((item) => !Object.is(item, p.value)));

const condition = (id, label, description, ports, run) => operation(id, 'Conditions', label, description, ports, 'boolean', run, { branch: true });
condition('equals-value', 'Values equal', 'Follow Pass when the two values match exactly.', [source('any', 'First value'), anyValueInput], (p) => Object.is(p.input, p.value));
condition('value-is-empty', 'Value is empty', 'Check for null, undefined, blank text, an empty list or an empty object.', [source()], (p, h) => h.empty(p.input));
condition('value-is-present', 'Value is present', 'Check that a value is available and nonempty.', [source()], (p, h) => !h.empty(p.input));
condition('list-includes', 'List includes value', 'Check whether a list contains a matching value.', [listSource, anyValueInput], (p, h) => h.list(p.input).includes(p.value));
condition('object-has-field', 'Object has field', 'Check whether the object has a local field at the given path.', [objectSource, fieldKey], (p, h) => h.hasPath(p.input, p.key));
condition('text-contains', 'Text contains', 'Check whether text contains a case-sensitive substring.', [source('string', 'Text'), text('search', 'Find', '')], (p, h) => h.text(p.input).includes(h.text(p.search)));
condition('text-starts-with', 'Text starts with', 'Check the beginning of a string against a prefix.', [source('string', 'Text'), text('prefix', 'Prefix', '')], (p, h) => h.text(p.input).startsWith(h.text(p.prefix)));
condition('text-ends-with', 'Text ends with', 'Check the ending of a string against a suffix.', [source('string', 'Text'), text('suffix', 'Suffix', '')], (p, h) => h.text(p.input).endsWith(h.text(p.suffix)));
condition('boolean-not', 'Invert boolean', 'Pass for false. Fail for true.', [source('boolean', 'Boolean')], (p, h) => !h.boolean(p.input));
condition('boolean-and', 'Both booleans true', 'Pass when both boolean inputs are true.', [source('boolean', 'First boolean'), arg('other', 'Second boolean', 'boolean', false)], (p, h) => h.boolean(p.input) && h.boolean(p.other));
condition('boolean-or', 'Either boolean true', 'Pass when either boolean input is true.', [source('boolean', 'First boolean'), arg('other', 'Second boolean', 'boolean', false)], (p, h) => h.boolean(p.input) || h.boolean(p.other));
condition('number-in-range', 'Number within range', 'Pass when the input is inside the inclusive numeric bounds.', [source('number', 'Number'), ...bounds], (p, h) => {
  const [min, max] = h.range(p.min, p.max); const value = h.number(p.input); return value >= min && value <= max;
});
condition('page-is-visible', 'Page is visible', 'Pass when the browser reports the page visible.', [], () => document.visibilityState === 'visible');

const safeguard = (id, label, description, ports, type, run) => operation(id, 'Safeguards', label, description, ports, type, run);
const errorMessage = (initial) => text('message', 'Error message', initial);
safeguard('require-value', 'Require value', 'Pass a nonempty value forward. A blank value uses Error.', [source(), errorMessage('Enter a value.')], 'any', (p, h) => {
  h.require(!h.empty(p.input), p.message); return p.input;
});
safeguard('require-email', 'Require email', 'Trim the address and check its basic email format. A bad address uses Error.', [source('string', 'Email'), errorMessage('Enter a valid email address.')], 'string', (p, h) => {
  const value = h.text(p.input).trim(); h.require(value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), p.message); return value;
});
safeguard('require-url', 'Require website URL', 'Validate a direct absolute HTTP or HTTPS address and return its normalized form.', [source('string', 'URL'), errorMessage('Enter a valid website address.')], 'string', (p, h) => {
  try { return h.url(p.input).href; } catch { h.require(false, p.message); }
});
safeguard('require-number-range', 'Require number range', 'Pass a finite number forward only when it falls between both bounds.', [source('number', 'Number'), ...bounds, errorMessage('The value is outside the allowed range.')], 'number', (p, h) => {
  const [min, max] = h.range(p.min, p.max); const value = h.number(p.input); h.require(value >= min && value <= max, p.message); return value;
});
safeguard('require-text-length', 'Require text length', 'Pass text forward only when its character count is within the configured bounds.', [source('string', 'Text'), ...bounds, errorMessage('The text length is outside the allowed range.')], 'string', (p, h) => {
  const [min, max] = h.range(p.min, p.max); const value = h.text(p.input); const length = Array.from(value).length;
  h.require(length >= min && length <= max, p.message); return value;
});
safeguard('require-field', 'Require object field', 'Read a field from an object and use Error when the key is missing or empty.', [objectSource, fieldKey, errorMessage('A required field is missing.')], 'any', (p, h) => {
  const value = h.path(p.input, p.key); h.require(!h.empty(value), p.message); return value;
});
safeguard('default-value', 'Use fallback value', 'Provide a replacement when the current value is empty.', [source(), arg('fallback', 'Fallback', 'any', '')], 'any', (p, h) => h.empty(p.input) ? p.fallback : p.input);
safeguard('type-of-value', 'Value type', 'Report the value’s type including array, null and undefined.', [source()], 'string', (p) => Array.isArray(p.input) ? 'array' : p.input === null ? 'null' : typeof p.input);
safeguard('fail-flow', 'Send to error branch', 'Create a deliberate validation error with a configured message.', [errorMessage('This flow could not continue.')], 'any', (p, h) => h.require(false, p.message));

const action = (id, label, description, inputs, result, run) => operation(id, 'Page action', label, description, inputs, result, run, { target: true });
action('read-block-text', 'Read block text', 'Read the text of a selected block.', [], 'string', (p, h) => h.element(p.target).textContent);
action('read-control-value', 'Read field value', 'Read the live value of the input, select, or text area inside this block.', [], 'any', (p, h) => h.control(p.target).value);
action('read-control-checked', 'Read checked state', 'Read whether the targeted checkbox or radio field is checked.', [], 'boolean', (p, h) => h.checkable(p.target).checked);
action('read-form-fields', 'Read form fields', 'Read successful, enabled form fields as an object and group repeated names into lists.', [], 'object', (p, h) => h.formFields(p.target));
action('reset-form', 'Reset a form', 'Restore a form’s controls to their original defaults.', [], 'boolean', (p, h) => { h.form(p.target).reset(); return true; });
action('check-form', 'Check a form', 'Run the form’s browser validation and return whether it passed. No submission occurs.', [], 'boolean', (p, h) => h.form(p.target).checkValidity());
action('check-control', 'Check a field', 'Set the targeted checkbox or radio to checked.', [], 'boolean', (p, h) => { h.checkable(p.target).checked = true; return true; });
action('uncheck-control', 'Uncheck a field', 'Set the targeted checkbox or radio to unchecked.', [], 'boolean', (p, h) => { h.checkable(p.target).checked = false; return true; });
action('enable-control', 'Enable field or button', 'Allow the visitor to use the selected field or button.', [], 'boolean', (p, h) => { h.control(p.target, true).disabled = false; return true; });
action('disable-control', 'Disable field or button', 'Temporarily prevent interaction with the selected field or button.', [], 'boolean', (p, h) => { h.control(p.target, true).disabled = true; return true; });
action('focus-block', 'Focus block', 'Move keyboard focus to a control or other focusable element in the selected block.', [], 'boolean', (p, h) => {
  const block = h.element(p.target); const element = block.matches(h.focusable) ? block : block.querySelector(h.focusable) || block;
  if (element === block && !element.matches(h.focusable)) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true }); return document.activeElement === element;
});
action('blur-block', 'Release focus', 'Remove keyboard focus from the active control inside the selected block.', [], 'boolean', (p, h) => {
  const block = h.element(p.target); const active = document.activeElement; if (!(active && block.contains(active))) return false;
  active.blur(); return true;
});
action('scroll-to-block', 'Scroll to block', 'Bring the block into view. Smooth scrolling respects reduced-motion preferences.', [arg('smooth', 'Smooth scrolling', 'boolean', true)], 'boolean', (p, h) => {
  h.element(p.target).scrollIntoView({ block: 'start', behavior: p.smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' }); return true;
});
action('set-image-url', 'Set image URL', 'Change an image by its direct absolute HTTP or HTTPS address. The browser loads the file from that address.', [source('string', 'URL')], 'string', (p, h) => {
  const block = h.element(p.target);
  const url = h.url(p.input).href;
  let image = block.matches('img') ? block : block.querySelector('img');
  if (!image && block.dataset.blockType === 'image') {
    image = document.createElement('img');
    image.alt = '';
    block.querySelector('.ps-image-placeholder')?.remove();
    block.prepend(image);
  }
  if (!image) throw Error('Select an image block or a block with an existing image.');
  image.removeAttribute('srcset'); image.src = url; return url;
});
action('set-image-alt', 'Set image alternative text', 'Set text that describes the selected image for screen readers.', [source('string', 'Alt text')], 'string', (p, h) => {
  const image = h.element(p.target, 'img'); image.alt = h.text(p.input); return image.alt;
});
action('set-link-url', 'Set link URL', 'Change a link to an absolute HTTP or HTTPS website address.', [source('string', 'URL')], 'string', (p, h) => {
  const link = h.element(p.target, 'a'); link.href = h.url(p.input).href; return link.href;
});
action('set-accessible-label', 'Set accessible label', 'Set the selected block’s name for assistive technology.', [source('string', 'Label')], 'string', (p, h) => {
  const value = h.text(p.input); h.element(p.target).setAttribute('aria-label', value); return value;
});
action('set-progress', 'Set progress', 'Update a progress bar and clamp the value to its maximum.', [source('number', 'Progress value')], 'number', (p, h) => {
  const bar = h.element(p.target, 'progress'); bar.value = Math.max(0, Math.min(bar.max, h.number(p.input))); return bar.value;
});
action('play-media', 'Play audio or video', 'Play the selected media. The browser can require a visitor gesture.', [], 'boolean', async (p, h) => {
  await h.element(p.target, 'audio,video').play(); return true;
});
action('pause-media', 'Pause audio or video', 'Pause the selected audio or video.', [], 'boolean', (p, h) => { h.element(p.target, 'audio,video').pause(); return true; });
action('seek-media', 'Seek media time', 'Move the playback position to the requested number of seconds.', [source('number', 'Time (s)')], 'number', (p, h) => {
  const media = h.element(p.target, 'audio,video'); const time = h.number(p.input);
  media.currentTime = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : time, time)); return media.currentTime;
});

const browser = (id, label, description, inputs, type, run) => operation(id, 'Browser', label, description, inputs, type, run);
browser('read-url-query', 'Read address parameter', 'Read a query parameter from the current page address.', [text('name', 'Parameter', 'search')], 'string', (p, h) => new URL(location.href).searchParams.get(h.text(p.name)) ?? '');
browser('read-url-fragment', 'Read address fragment', 'Read the current page’s fragment after #.', [], 'string', () => location.hash.slice(1));
browser('read-viewport', 'Read viewport size', 'Return an object with the viewport width and height in pixels.', [], 'object', () => ({ width: innerWidth, height: innerHeight }));
browser('read-scroll', 'Read scroll position', 'Return an object with the horizontal and vertical scroll offsets.', [], 'object', () => ({ x: scrollX, y: scrollY }));
browser('read-network', 'Read network status', 'Return the browser’s estimate of whether the network is available.', [], 'boolean', () => navigator.onLine);
browser('copy-text', 'Copy text', 'Write text to the clipboard. Browser permission and a visitor gesture can be required.', [source('string', 'Text')], 'boolean', async (p, h) => {
  if (!navigator.clipboard?.writeText) throw Error('Clipboard access is unavailable.'); await navigator.clipboard.writeText(h.text(p.input)); return true;
});
browser('now-iso', 'Current timestamp', 'Return the browser’s current date and time as UTC ISO text.', [], 'string', () => new Date().toISOString());
browser('now-epoch', 'Current time in milliseconds', 'Return the current timestamp as milliseconds since 1970.', [], 'number', () => Date.now());
browser('format-date', 'Format date', 'Format a date or timestamp with a locale-specific calendar.', [source('any', 'Date or timestamp'), text('locale', 'Locale', 'en-US')], 'string', (p, h) => {
  if (p.input == null || h.empty(p.input)) throw Error('Provide a date or timestamp.');
  return new Intl.DateTimeFormat(h.text(p.locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(p.input));
});
browser('emit-custom-event', 'Send custom event', 'Dispatch a project event on this page with an optional detail value.', [text('name', 'Event name', 'site:change'), source('any', 'Event detail')], 'boolean', (p, h) => {
  const name = h.text(p.name).trim();
  if (!/^[a-zA-Z][\w.-]*:[\w:.-]{1,127}$/.test(name) || name.startsWith('plot:')) throw Error('Use a project event name such as site:change.');
  return window.dispatchEvent(new CustomEvent(name, { detail: p.input }));
});

operation('wait-flow', 'Flow', 'Wait', 'Pause the current run for up to 30 seconds, then resume with the current value.', [numeric('delay', 'Wait (ms)', 250), source()], 'any', async (p, h) => {
  await new Promise((resolve) => setTimeout(resolve, h.integer(p.delay, 0, 30000))); return p.input;
});
operation('run-once', 'Flow', 'Run once per page', 'Follow Pass the first time this node runs, then Fail until the page reloads.', [], 'boolean', (p, h, context, id) => {
  const state = h.state(context); if (state.has(id)) return false; state.set(id, true); return true;
}, { branch: true });
operation('throttle-flow', 'Flow', 'Throttle flow', 'Follow Pass at most once in the configured window. Other runs follow Fail.', [numeric('interval', 'Interval (ms)', 500)], 'boolean', (p, h, context, id) => {
  const state = h.state(context); const now = performance.now();
  if (now - (state.get(id) ?? -Infinity) < h.integer(p.interval, 0, 60000)) return false;
  state.set(id, now); return true;
}, { branch: true });
operation('choose-random', 'Flow', 'Random branch', 'Follow Pass according to a percentage chance. Otherwise follow Fail.', [numeric('percent', 'Chance (0–100)', 50)], 'boolean', (p, h) => Math.random() < h.integer(p.percent, 0, 100) / 100, { branch: true });

const backendMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
operation('call-backend', 'Code & HTTP', 'Call backend route', 'Call a same-site backend route under /api/. Use its status, body and headers on Success. An unsuccessful response follows Error.', [
  text('path', 'API path', '/api/contact', { placeholder: '/api/contact' }),
  text('method', 'HTTP method', 'GET', { kind: 'select', options: backendMethods.map((method) => [method, method]) }),
  arg('body', 'Request body', 'any', null, { description: 'Use JSON or connect a request body. GET and HEAD ignore this field.' }),
  objectInput('query', 'Query values'),
], 'object', (p, h) => h.callBackend(p), {
  projections: [['status', 'HTTP status', 'number'], ['body', 'Response body', 'any'], ['headers', 'Response headers', 'object']],
});

// Local text, language and encoding operations.
const locale = text('locale', 'Locale', 'en-US', { description: 'A locale tag such as en-US, pl-PL or fr-FR.' });
const precision = numeric('places', 'Maximum decimal places', 2);
const units = numeric('amount', 'Amount', 1);
const decimalPoint = text('decimal', 'Decimal separator', '.');
string('text-code-unit-length', 'Text UTF-16 length', 'Count the UTF-16 code units used by JavaScript and many form controls.', [], (p, h) => h.text(p.input).length, 'number');
string('text-byte-length', 'Text UTF-8 size', 'Count the bytes this string needs in UTF-8.', [], (p, h) => new TextEncoder().encode(h.text(p.input)).byteLength, 'number');
string('text-word-count', 'Count words', 'Count language-aware words. Useful for scores, limits and summaries.', [locale], (p, h) => h.segments(p.input, p.locale, 'word').filter((item) => item.isWordLike).length, 'number');
string('text-grapheme-count', 'Count visible characters', 'Count grapheme clusters, including combining marks and joined emoji.', [locale], (p, h) => h.segments(p.input, p.locale, 'grapheme').length, 'number');
string('text-lines-count', 'Count text lines', 'Count line breaks and the lines they separate.', [], (p, h) => (h.text(p.input).match(/\n/g)?.length || 0) + 1, 'number');
string('text-locale-uppercase', 'Uppercase for locale', 'Apply language-specific uppercase rules, including Turkish I.', [locale], (p, h) => h.text(p.input).toLocaleUpperCase(h.text(p.locale)));
string('text-locale-lowercase', 'Lowercase for locale', 'Apply language-specific lowercase rules, including Turkish I.', [locale], (p, h) => h.text(p.input).toLocaleLowerCase(h.text(p.locale)));
string('text-normalize-unicode', 'Normalize Unicode text', 'Canonicalize equivalent Unicode spellings using the selected transformation.', [text('form', 'Normalization form', 'NFC', { kind: 'select', options: ['NFC','NFD','NFKC','NFKD'].map((value) => [value,value]) })], (p, h) => h.text(p.input).normalize(h.text(p.form)));
string('text-strip-diacritics', 'Remove combining marks', 'Remove accents represented by Unicode combining marks.', [], (p, h) => h.text(p.input).normalize('NFD').replace(/\p{M}+/gu, ''));
string('text-remove-numbers', 'Remove digits', 'Remove Unicode decimal digits while retaining other characters.', [], (p, h) => h.text(p.input).replace(/\p{Nd}/gu, ''));
string('text-extract-numbers', 'Extract digits', 'Keep decimal digits only, for example to normalize a copied identifier.', [], (p, h) => h.text(p.input).replace(/[^\p{Nd}]+/gu, ''));
string('text-remove-control-chars', 'Remove control characters', 'Remove C0 and C1 controls while preserving tab, carriage return and newline.', [], (p, h) => h.text(p.input).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ''));
string('text-normalize-line-endings', 'Normalize line breaks', 'Convert Windows and classic Mac line endings to LF.', [], (p, h) => h.text(p.input).replace(/\r\n?/g, '\n'));
string('text-last-position', 'Find last text position', 'Find the last matching index or -1 when absent.', [text('search', 'Find', '')], (p, h) => h.text(p.input).lastIndexOf(h.text(p.search)), 'number');
string('text-match-count', 'Count text matches', 'Count non-overlapping plain-text occurrences.', [text('search', 'Find', '')], (p, h) => h.matchCount(p.input, p.search), 'number');
string('text-repeat', 'Repeat text', 'Repeat a string up to the text output limit.', [numeric('count', 'Repetitions', 2)], (p, h) => {
  const value = h.text(p.input); const count = h.integer(p.count, 0, h.maxText);
  if (value.length * count > h.maxText) throw Error('Repeated value is too long.');
  return value.repeat(count);
});
string('text-truncate', 'Truncate with marker', 'Shorten a string and append a marker within the selected length.', [numeric('count', 'Maximum code points', 48), text('marker', 'Marker', '…')], (p, h) => {
  const points = Array.from(h.text(p.input)); const limit = h.integer(p.count, 0, h.maxText);
  if (points.length <= limit) return points.join('');
  const marker = Array.from(h.text(p.marker)).slice(0, limit); return points.slice(0, limit - marker.length).join('') + marker.join('');
});
string('text-line-at', 'Read one text line', 'Select a zero-based line. Negative indices count from the end.', [numeric('index', 'Line index', 0)], (p, h) => h.text(p.input).split(/\r?\n/, h.maxItems).at(h.integer(p.index)) ?? '');
string('text-codepoint-at', 'Read Unicode code point', 'Return the numeric Unicode code point at a character index or -1 when absent.', [numeric('index', 'Index', 0)], (p, h) => Array.from(h.text(p.input)).at(h.integer(p.index))?.codePointAt(0) ?? -1, 'number');
operation('character-from-codepoint', 'Text', 'Character from code point', 'Convert a valid Unicode code-point number into text.', [source('number', 'Code point')], 'string', (p, h) => String.fromCodePoint(h.integer(p.input, 0, 1114111)));
string('text-to-word-array', 'Segment words', 'Return language-aware words without spaces or punctuation-only segments.', [locale], (p, h) => h.segments(p.input, p.locale, 'word').filter((item) => item.isWordLike).map(({ segment }) => segment), 'array');
string('text-to-sentence-array', 'Segment sentences', 'Split paragraphs into language-aware sentences.', [locale], (p, h) => h.segments(p.input, p.locale, 'sentence').map(({ segment }) => segment.trim()).filter(Boolean), 'array');
string('text-to-base64', 'Encode UTF-8 Base64', 'Encode a text string safely for transport in a Base64 field.', [], (p, h) => h.toBase64(p.input));
string('text-from-base64', 'Decode UTF-8 Base64', 'Decode Base64 text. Invalid Base64 or UTF-8 follows Error.', [], (p, h) => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(h.text(p.input)), (character) => character.charCodeAt(0))));
operation('locale-currency', 'Locale formats', 'Format currency', 'Format a number using an ISO currency code and locale.', [source('number', 'Amount'), locale, text('currency', 'Currency', 'USD')], 'string', (p, h) => new Intl.NumberFormat(h.text(p.locale), { style: 'currency', currency: h.text(p.currency) }).format(h.number(p.input)));
operation('locale-percent', 'Locale formats', 'Format percentage', 'Format a fraction as a localized percentage. For example, 0.25 becomes 25%.', [source('number', 'Fraction'), locale, precision], 'string', (p, h) => new Intl.NumberFormat(h.text(p.locale), { style: 'percent', maximumFractionDigits: h.integer(p.places, 0, 12) }).format(h.number(p.input)));
operation('locale-compact-number', 'Locale formats', 'Format compact number', 'Format large values in compact notation such as 1.2K.', [source('number', 'Number'), locale, precision], 'string', (p, h) => new Intl.NumberFormat(h.text(p.locale), { notation: 'compact', maximumFractionDigits: h.integer(p.places, 0, 12) }).format(h.number(p.input)));
operation('locale-unit', 'Locale formats', 'Format measurement unit', 'Format a measurement with an Intl unit such as kilometer or liter.', [source('number', 'Amount'), locale, text('unit', 'Measurement unit', 'kilometer')], 'string', (p, h) => new Intl.NumberFormat(h.text(p.locale), { style: 'unit', unit: h.text(p.unit) }).format(h.number(p.input)));
operation('locale-list', 'Locale formats', 'Format natural language list', 'Join list items with language-specific separators and conjunctions.', [listSource, locale], 'string', (p, h) => new Intl.ListFormat(h.text(p.locale)).format(h.list(p.input).map(h.shortText)));
operation('locale-relative-time', 'Locale formats', 'Format relative time', 'Localize a signed duration such as yesterday or in two days.', [source('number', 'Signed amount'), locale, text('unit', 'Time unit', 'day', { kind: 'select', options: ['second','minute','hour','day','week','month','year'].map((value) => [value,value]) })], 'string', (p, h) => new Intl.RelativeTimeFormat(h.text(p.locale), { numeric: 'auto' }).format(h.number(p.input), p.unit));
operation('locale-plural', 'Locale formats', 'Choose plural category', 'Return the locale’s plural category, such as one, few or other.', [source('number', 'Count'), locale], 'string', (p, h) => new Intl.PluralRules(h.text(p.locale)).select(h.number(p.input)));
operation('locale-language-name', 'Locale formats', 'Display language name', 'Translate a language tag into a readable localized language name.', [source('string', 'Language tag'), locale], 'string', (p, h) => new Intl.DisplayNames([h.text(p.locale)], { type: 'language' }).of(h.text(p.input)));
operation('locale-region-name', 'Locale formats', 'Display region name', 'Translate an ISO region code, such as PL, into a localized region name.', [source('string', 'Region code'), locale], 'string', (p, h) => new Intl.DisplayNames([h.text(p.locale)], { type: 'region' }).of(h.text(p.input)));
operation('locale-compare-text', 'Locale formats', 'Compare text alphabetically', 'Return -1, 0 or 1 from the locale’s alphabetic and numeric ordering.', [source('string', 'First text'), text('other', 'Second text', ''), locale], 'number', (p, h) => Math.sign(new Intl.Collator(h.text(p.locale), { numeric: true }).compare(h.text(p.input), h.text(p.other))));
operation('locale-parse-decimal', 'Locale formats', 'Parse decimal with separators', 'Read a number using the configured decimal separator and optional grouping separator.', [source('string', 'Number text'), decimalPoint, text('grouping', 'Group separator', ',')], 'number', (p, h) => {
  const decimal = h.text(p.decimal); const grouping = h.text(p.grouping);
  if (decimal.length !== 1 || decimal === grouping) throw Error('Choose distinct separators.');
  const value = grouping ? h.text(p.input).replaceAll(grouping, '') : h.text(p.input);
  const normalized = value.trim().replace(decimal, '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw Error('Enter a number with the selected separators.');
  return h.number(normalized);
});

// Addresses and web request data are manipulated without sending network calls.
const address = source('string', 'Absolute URL');
const urlAction = (id, label, description, inputs, result, run) => operation(id, 'URLs & API data', label, description, inputs, result, run);
const queryKey = text('key', 'Query key', 'page');
const pathValue = text('path', 'Path', '/');
urlAction('url-parts', 'Read URL parts', 'Return scheme, hostname, port, origin, path, query and fragment.', [address], 'object', (p, h) => h.urlParts(h.url(p.input)));
urlAction('url-absolute-relative', 'Resolve relative URL', 'Resolve a path relative to an absolute base address.', [source('string', 'Relative path'), text('base', 'Base URL', 'https://example.com/')], 'string', (p, h) => h.url(new URL(h.text(p.input), h.url(p.base)).href).href);
urlAction('url-origin', 'Read URL origin', 'Read scheme, hostname and port together.', [address], 'string', (p, h) => h.url(p.input).origin);
urlAction('url-host', 'Read hostname', 'Extract the hostname without scheme, port or path.', [address], 'string', (p, h) => h.url(p.input).hostname);
urlAction('url-path', 'Read URL path', 'Extract the pathname without query or fragment.', [address], 'string', (p, h) => h.url(p.input).pathname);
urlAction('url-query-map', 'Read URL query object', 'Convert URL query parameters to an object. Repeated keys become arrays.', [address], 'object', (p, h) => h.queryRecord(h.url(p.input).searchParams));
urlAction('url-query-first', 'Read first query value', 'Get the first value for a key in a supplied address.', [address, queryKey], 'any', (p, h) => h.url(p.input).searchParams.get(h.text(p.key)));
urlAction('url-query-all', 'Read repeated query values', 'Get every value for a query key in a supplied address.', [address, queryKey], 'array', (p, h) => h.url(p.input).searchParams.getAll(h.text(p.key)));
urlAction('url-query-set', 'Replace query value', 'Replace all prior values for a key with the provided value.', [address, queryKey, text('value', 'Query value', '1')], 'string', (p, h) => {
  const url = h.url(p.input); url.searchParams.set(h.key(p.key), h.text(p.value)); return url.href;
});
urlAction('url-query-append', 'Append repeated query value', 'Add one value to a query key while preserving earlier values.', [address, queryKey, text('value', 'Query value', 'item')], 'string', (p, h) => {
  const url = h.url(p.input); url.searchParams.append(h.key(p.key), h.text(p.value)); return url.href;
});
urlAction('url-query-delete', 'Remove query key', 'Remove a query key and all its values.', [address, queryKey], 'string', (p, h) => {
  const url = h.url(p.input); url.searchParams.delete(h.key(p.key)); return url.href;
});
urlAction('url-query-replace', 'Replace URL query object', 'Build the address query from an object whose arrays become repeated values.', [address, objectInput('query', 'Query values')], 'string', (p, h) => {
  const url = h.url(p.input); url.search = h.queryParams(p.query).toString(); return url.href;
});
urlAction('url-query-sort', 'Sort URL query keys', 'Canonicalize URL query order while preserving order within repeated keys.', [address], 'string', (p, h) => {
  const url = h.url(p.input); url.searchParams.sort(); return url.href;
});
urlAction('url-path-replace', 'Replace URL path', 'Set the path while preserving origin, query and fragment.', [address, pathValue], 'string', (p, h) => {
  const url = h.url(p.input); url.pathname = h.text(p.path); return url.href;
});
urlAction('url-path-append-segment', 'Append URL path segment', 'Safely percent-encode one path segment and append it.', [address, text('segment', 'Path segment', 'item')], 'string', (p, h) => {
  const url = h.url(p.input); const segment = h.text(p.segment);
  if (segment === '.' || segment === '..') throw Error('A literal dot is not a path segment.');
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + encodeURIComponent(segment); return url.href;
});
urlAction('url-fragment-set', 'Set URL fragment', 'Change the fragment while preserving the rest of the address.', [address, text('value', 'Fragment', 'details')], 'string', (p, h) => {
  const url = h.url(p.input); url.hash = h.text(p.value); return url.href;
});
urlAction('url-without-fragment', 'Remove URL fragment', 'Return the address without its fragment.', [address], 'string', (p, h) => {
  const url = h.url(p.input); url.hash = ''; return url.href;
});
urlAction('url-to-path-query', 'Create request target', 'Return the path plus query string, without origin or fragment.', [address], 'string', (p, h) => { const url = h.url(p.input); return url.pathname + url.search; });
urlAction('query-string-parse', 'Parse query string', 'Convert a URL-encoded query string to an object.', [source('string', 'Query string')], 'object', (p, h) => h.queryRecord(new URLSearchParams(h.text(p.input))));
urlAction('query-string-build', 'Build query string', 'Encode an object as a URL query string without a leading question mark.', [source('object', 'Query values')], 'string', (p, h) => h.queryParams(p.input).toString());
urlAction('header-object-normalize', 'Normalize HTTP headers', 'Validate HTTP header names and create an object with lowercase keys.', [source('object', 'Headers')], 'object', (p, h) => Object.fromEntries(new Headers(h.object(p.input))));
urlAction('header-value-read', 'Read HTTP header', 'Get a value using a case-insensitive header name.', [source('object', 'Headers'), text('name', 'Header name', 'content-type')], 'any', (p, h) => new Headers(h.object(p.input)).get(h.text(p.name)));
urlAction('header-merge', 'Merge HTTP header objects', 'Merge two header objects. The second value wins for matching names.', [source('object', 'Headers'), objectInput('other', 'Additional headers')], 'object', (p, h) => {
  const headers = new Headers(h.object(p.input)); for (const [name,value] of new Headers(h.object(p.other))) headers.set(name,value); return Object.fromEntries(headers);
});
urlAction('http-status-category', 'Classify HTTP status', 'Return informational, success, redirect, client-error or server-error for a valid status.', [source('number', 'HTTP status')], 'string', (p, h) => ['informational','success','redirect','client-error','server-error'][Math.floor(h.integer(p.input, 100, 599) / 100) - 1]);
condition('url-is-same-origin', 'Addresses share an origin', 'Compare two URLs by protocol, hostname and port.', [address, text('other', 'Second URL', 'https://example.com/')], (p, h) => h.url(p.input).origin === h.url(p.other).origin);
condition('url-has-query-key', 'URL has query key', 'Check if an address contains the specified query parameter.', [address, queryKey], (p, h) => h.url(p.input).searchParams.has(h.text(p.key)));
condition('http-status-success', 'HTTP response succeeded', 'Pass for an HTTP status in the 200–299 range.', [source('number', 'HTTP status')], (p, h) => { const status = h.integer(p.input, 100, 599); return status >= 200 && status < 300; });

// UTC arithmetic provides reproducible date calculations across visitors.
const when = source('any', 'Date or timestamp');
const secondDate = arg('other', 'Second date or timestamp', 'any', '2030-01-01');
const timeUnit = text('unit', 'Calendar unit', 'day', { kind: 'select', options: ['second','minute','hour','day','week','month','year'].map((value) => [value,value]) });
const datetime = (id,label,description,inputs,type,run) => operation(id,'Date & time',label,description,inputs,type,run);
datetime('date-iso', 'Convert date to UTC ISO', 'Normalize a valid date or timestamp into standard UTC ISO text.', [when], 'string', (p,h) => h.date(p.input).toISOString());
datetime('date-to-epoch', 'Convert date to epoch milliseconds', 'Return milliseconds from the Unix epoch for a supplied date.', [when], 'number', (p,h) => h.date(p.input).getTime());
datetime('date-unix-to-iso', 'Convert Unix seconds to UTC ISO', 'Read a Unix timestamp expressed in seconds and return UTC date text.', [source('number','Unix seconds')], 'string', (p,h) => h.date(h.number(p.input) * 1000).toISOString());
datetime('date-to-unix-seconds', 'Convert date to Unix seconds', 'Return whole seconds since the Unix epoch.', [when], 'number', (p,h) => Math.floor(h.date(p.input).getTime() / 1000));
datetime('date-only', 'Read UTC date', 'Return just the UTC calendar date as YYYY-MM-DD.', [when], 'string', (p,h) => h.date(p.input).toISOString().split('T')[0]);
datetime('date-time-only', 'Read UTC time', 'Return hours, minutes and seconds from a date in UTC.', [when], 'string', (p,h) => h.date(p.input).toISOString().split('T')[1].slice(0, 8));
datetime('date-parts', 'Read UTC date parts', 'Return year, month, day, weekday, hour, minute, second and millisecond.', [when], 'object', (p,h) => h.dateParts(h.date(p.input)));
datetime('date-add', 'Add calendar time', 'Add a signed amount of the selected unit in UTC. End-of-month dates clamp to the target month.', [when, units, timeUnit], 'string', (p,h) => h.addDate(p.input, p.amount, p.unit).toISOString());
datetime('date-difference', 'Calculate date difference', 'Calculate elapsed milliseconds by subtracting the second date from the first.', [when, secondDate], 'number', (p,h) => h.date(p.input).getTime() - h.date(p.other).getTime());
datetime('date-difference-days', 'Calculate elapsed days', 'Return elapsed 24-hour periods as a signed fractional number.', [when, secondDate], 'number', (p,h) => (h.date(p.input).getTime() - h.date(p.other).getTime()) / 86400000);
datetime('date-start-day', 'Start of UTC day', 'Reset the time to midnight for the same UTC calendar date.', [when], 'string', (p,h) => { const date = h.date(p.input); date.setUTCHours(0,0,0,0); return date.toISOString(); });
datetime('date-start-week', 'Start of ISO week', 'Find the Monday opening the current UTC week.', [when], 'string', (p,h) => { const date = h.date(p.input); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); date.setUTCHours(0,0,0,0); return date.toISOString(); });
datetime('date-start-month', 'Start of UTC month', 'Find midnight on the first day of the current UTC month.', [when], 'string', (p,h) => { const date = h.date(p.input); date.setUTCDate(1); date.setUTCHours(0,0,0,0); return date.toISOString(); });
datetime('date-start-year', 'Start of UTC year', 'Find January 1 at midnight for the supplied year.', [when], 'string', (p,h) => { const date = h.date(p.input); date.setUTCMonth(0,1); date.setUTCHours(0,0,0,0); return date.toISOString(); });
datetime('date-days-in-month', 'Count days in UTC month', 'Return the day count for the supplied month and year.', [when], 'number', (p,h) => h.daysInMonth(h.date(p.input)));
datetime('date-quarter', 'Read calendar quarter', 'Return the UTC calendar quarter 1 through 4.', [when], 'number', (p,h) => Math.floor(h.date(p.input).getUTCMonth() / 3) + 1);
datetime('date-iso-week', 'Read ISO week', 'Return the ISO week number and ISO week year for the UTC date.', [when], 'object', (p,h) => h.isoWeek(h.date(p.input)));
datetime('date-weekday-name', 'Format weekday name', 'Display the UTC weekday using the visitor’s selected locale.', [when,locale], 'string', (p,h) => new Intl.DateTimeFormat(h.text(p.locale), { weekday:'long', timeZone:'UTC' }).format(h.date(p.input)));
datetime('date-month-name', 'Format month name', 'Display the UTC month using the selected locale.', [when,locale], 'string', (p,h) => new Intl.DateTimeFormat(h.text(p.locale), { month:'long', timeZone:'UTC' }).format(h.date(p.input)));
datetime('date-timezone-format', 'Format date in timezone', 'Display date and time in an IANA timezone such as Europe/Warsaw.', [when,locale,text('zone','IANA timezone','Europe/Warsaw')], 'string', (p,h) => new Intl.DateTimeFormat(h.text(p.locale), { dateStyle:'medium', timeStyle:'short', timeZone:h.text(p.zone) }).format(h.date(p.input)));
datetime('date-timezone-parts', 'Read timezone date parts', 'Return localized calendar and time field parts for an IANA timezone.', [when,locale,text('zone','IANA timezone','UTC')], 'object', (p,h) => Object.fromEntries(new Intl.DateTimeFormat(h.text(p.locale), { year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:h.text(p.zone),hourCycle:'h23' }).formatToParts(h.date(p.input)).filter(({ type }) => type !== 'literal').map(({ type,value }) => [type,value])));
datetime('date-from-parts', 'Build UTC date', 'Build and validate an ISO date from calendar parts. Month starts at 1.', [numeric('year','Year',2030), numeric('month','Month',1), numeric('day','Day',1), numeric('hour','Hour',0), numeric('minute','Minute',0), numeric('second','Second',0)], 'string', (p,h) => h.buildDate(p).toISOString());
datetime('duration-parts', 'Read duration parts', 'Break elapsed milliseconds into signed days, hours, minutes, seconds and milliseconds.', [source('number','Milliseconds')], 'object', (p,h) => h.durationParts(p.input));
datetime('duration-to-timer-label', 'Format timer duration', 'Format elapsed milliseconds as HH:MM:SS with an optional negative sign.', [source('number','Milliseconds')], 'string', (p,h) => {
  const value = h.durationParts(p.input); const pad = (number) => String(number).padStart(2,'0');
  return (value.sign < 0 ? '-' : '') + [value.days * 24 + value.hours, value.minutes, value.seconds].map(pad).join(':');
});
condition('date-is-before', 'Date is before', 'Pass when the first date occurs before the second date.', [when,secondDate], (p,h) => h.date(p.input).getTime() < h.date(p.other).getTime());
condition('date-is-weekend', 'UTC date is a weekend', 'Pass when the UTC weekday is Saturday or Sunday.', [when], (p,h) => [0,6].includes(h.date(p.input).getUTCDay()));
condition('date-is-leap-year', 'Year has leap day', 'Pass when the UTC year has a February 29.', [when], (p,h) => { const year = h.date(p.input).getUTCFullYear(); return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); });

// List and record shaping for form submissions, databases and API responses.
const direction = text('direction','Sort direction','ascending',{ kind:'select',options:[['ascending','Ascending'],['descending','Descending']] });
const firstCount = numeric('count','Items',5);
const otherList = listInput('other','Second list');
collection('object-assign-path', 'Write nested object field', 'Copy a record and set a value at a dot-separated path.', [objectSource, fieldKey, anyValueInput], 'object', (p,h) => h.writePath(p.input,p.key,p.value));
collection('object-rename-key', 'Rename object field', 'Rename an own field while retaining its value.', [objectSource,fieldKey,text('name','New field name','title')], 'object', (p,h) => {
  const key = h.key(p.key); const name = h.key(p.name); const fields = h.entries(p.input);
  if (key !== name && Object.hasOwn(p.input,name) && Object.hasOwn(p.input,key)) throw Error('The destination field already exists.');
  return h.record(fields.map(([old,value]) => [old === key ? name : old,value]));
});
collection('object-compact-fields', 'Remove empty object fields', 'Remove blank text, null, undefined, empty arrays and empty records.', [objectSource], 'object', (p,h) => h.record(h.entries(p.input).filter(([,value]) => !h.empty(value))));
collection('object-field-count', 'Count object fields', 'Count own enumerable fields in an object.', [objectSource], 'number', (p,h) => h.entries(p.input).length);
collection('object-fill-defaults', 'Fill missing object fields', 'Copy defaults into fields not present in the input. Existing values are kept.', [objectSource,objectInput('defaults','Default fields')], 'object', (p,h) => h.record([...h.entries(p.defaults),...h.entries(p.input)]));
collection('object-filter-values', 'Keep object fields matching value', 'Keep fields whose values exactly equal the reference value.', [objectSource,anyValueInput], 'object', (p,h) => h.record(h.entries(p.input).filter(([,value]) => Object.is(value,p.value))));
collection('object-zip-lists', 'Build object from keys and values', 'Pair equally sized arrays of keys and values.', [listInput('keys','Keys',['name']),listInput('values','Values',['Ada'])], 'object', (p,h) => {
  const keys = h.list(p.keys); const values = h.list(p.values);
  if (keys.length !== values.length) throw Error('Provide the same number of keys and values.');
  return h.record(keys.map((key,index) => [key,values[index]]));
});
collection('object-sort-keys', 'Sort object keys', 'Rebuild an object with keys ordered using the specified locale.', [objectSource,locale], 'object', (p,h) => {
  const compare = new Intl.Collator(h.text(p.locale)).compare; return h.record(h.entries(p.input).sort(([a],[b]) => compare(a,b)));
});
collection('list-numbers-only', 'Keep numeric items', 'Keep only finite numbers. Text remains excluded.', [listSource], 'array', (p,h) => h.list(p.input).filter(Number.isFinite));
collection('list-strings-only', 'Keep text items', 'Keep only string items.', [listSource], 'array', (p,h) => h.list(p.input).filter((item) => typeof item === 'string'));
collection('list-objects-only', 'Keep record items', 'Keep object records and remove primitive values and nested arrays.', [listSource], 'array', (p,h) => h.list(p.input).filter((item) => item && typeof item === 'object' && !Array.isArray(item)));
collection('list-compact', 'Remove empty list items', 'Drop empty values while preserving zero and false.', [listSource], 'array', (p,h) => h.list(p.input).filter((item) => !h.empty(item)));
collection('list-take', 'Take first items', 'Return the requested number of leading items.', [listSource,firstCount], 'array', (p,h) => h.list(p.input).slice(0,h.integer(p.count,0,h.maxItems)));
collection('list-drop', 'Drop first items', 'Skip a requested number of leading items.', [listSource,firstCount], 'array', (p,h) => h.list(p.input).slice(h.integer(p.count,0,h.maxItems)));
collection('list-take-last', 'Take last items', 'Return the requested number of trailing items.', [listSource,firstCount], 'array', (p,h) => { const list = h.list(p.input); return list.slice(Math.max(0,list.length - h.integer(p.count,0,h.maxItems))); });
collection('list-chunk', 'Divide list into chunks', 'Group consecutive list items into equally sized arrays except for the final chunk.', [listSource,numeric('size','Chunk size',10)], 'array', (p,h) => h.chunks(p.input,p.size));
collection('list-insert-at', 'Insert list item', 'Insert a value at a zero-based index. An end index appends.', [listSource,numeric('index','Index',0),anyValueInput], 'array', (p,h) => {
  const result = [...h.list(p.input)]; result.splice(h.integer(p.index,0,result.length),0,p.value); return result;
});
collection('list-replace-at', 'Replace list item', 'Replace one item by index. Negative indices count from the end.', [listSource,numeric('index','Index',0),anyValueInput], 'array', (p,h) => {
  const list = h.list(p.input); return list.with(h.integer(p.index,-list.length,list.length-1),p.value);
});
collection('list-remove-at', 'Remove list item by index', 'Remove one item at a zero-based index.', [listSource,numeric('index','Index',0)], 'array', (p,h) => {
  const result = [...h.list(p.input)]; result.splice(h.integer(p.index,0,result.length-1),1); return result;
});
collection('list-move-item', 'Move list item', 'Move one item from an index to a new index in the same list.', [listSource,numeric('from','From index',0),numeric('to','To index',1)], 'array', (p,h) => {
  const result = [...h.list(p.input)]; const end = result.length-1;
  const from = h.integer(p.from,0,end); const to = h.integer(p.to,0,end); const [item] = result.splice(from,1); result.splice(to,0,item); return result;
});
collection('list-index-first', 'Find first list index', 'Return the first matching value’s index or -1.', [listSource,anyValueInput], 'number', (p,h) => h.list(p.input).findIndex((item) => Object.is(item,p.value)));
collection('list-index-last', 'Find last list index', 'Return the last matching value’s index or -1.', [listSource,anyValueInput], 'number', (p,h) => h.list(p.input).findLastIndex((item) => Object.is(item,p.value)));
collection('list-count-value', 'Count matching list items', 'Count items exactly equal to a selected value.', [listSource,anyValueInput], 'number', (p,h) => h.list(p.input).reduce((count,item) => count + Number(Object.is(item,p.value)),0));
collection('list-union', 'Union of two lists', 'Return each value found in either list once.', [listSource,otherList], 'array', (p,h) => [...new Set([...h.list(p.input),...h.list(p.other)])]);
collection('list-intersection', 'Intersection of two lists', 'Return distinct values present in both lists.', [listSource,otherList], 'array', (p,h) => { const other = new Set(h.list(p.other)); return [...new Set(h.list(p.input).filter((value) => other.has(value)))]; });
collection('list-subtract-values', 'Subtract values from list', 'Keep items from the first list which are absent from the second.', [listSource,otherList], 'array', (p,h) => { const other = new Set(h.list(p.other)); return h.list(p.input).filter((value) => !other.has(value)); });
collection('list-zip', 'Pair two lists', 'Pair list entries in order, stopping at the shorter list.', [listSource,otherList], 'array', (p,h) => { const other = h.list(p.other); return h.list(p.input).slice(0,other.length).map((value,index) => [value,other[index]]); });
collection('list-random-item', 'Pick random list item', 'Pick one random entry. An empty list returns undefined.', [listSource], 'any', (p,h) => { const list = h.list(p.input); return list[Math.floor(Math.random()*list.length)]; });
collection('list-shuffle', 'Shuffle list', 'Return the same items in randomized order.', [listSource], 'array', (p,h) => {
  const result = [...h.list(p.input)]; for (let i=result.length-1;i>0;i--) { const at=Math.floor(Math.random()*(i+1)); [result[i],result[at]]=[result[at],result[i]]; } return result;
});
collection('list-group-field', 'Group records by field', 'Group list items into arrays based on a field value.', [listSource,fieldKey], 'object', (p,h) => h.groupByField(p.input,p.key,false));
collection('list-count-field-groups', 'Count records by field', 'Count list items within each field value group.', [listSource,fieldKey], 'object', (p,h) => h.groupByField(p.input,p.key,true));
collection('list-distinct-field', 'Remove duplicate records by field', 'Keep the first record for each exact field value.', [listSource,fieldKey], 'array', (p,h) => {
  const seen = new Set(); return h.list(p.input).filter((item) => { const key=h.path(item,p.key); if (seen.has(key)) return false; seen.add(key); return true; });
});
collection('list-sort-field-number', 'Sort records by numeric field', 'Order records by their numeric field value.', [listSource,fieldKey,direction], 'array', (p,h) => {
  const factor=p.direction==='descending'?-1:1; return h.list(p.input).map((value) => ({value,key:h.number(h.path(value,p.key))})).sort((a,b) => factor*(a.key-b.key)).map(({value}) => value);
});
collection('list-sort-field-text', 'Sort records by text field', 'Order records alphabetically by a text field and locale.', [listSource,fieldKey,direction,locale], 'array', (p,h) => {
  const compare = new Intl.Collator(h.text(p.locale),{numeric:true}).compare; const factor=p.direction==='descending'?-1:1;
  return h.list(p.input).map((value) => ({value,key:h.shortText(h.path(value,p.key))})).sort((a,b) => factor*compare(a.key,b.key)).map(({value}) => value);
});
collection('list-sum-field', 'Sum numeric field', 'Add the numeric value of a field from every record.', [listSource,fieldKey], 'number', (p,h) => h.list(p.input).reduce((sum,value) => sum+h.number(h.path(value,p.key)),0));
collection('list-page', 'Paginate list', 'Return page items and metadata including page count, total and next page.', [listSource,numeric('page','Page number',1),numeric('size','Items per page',20)], 'object', (p,h) => {
  const list=h.list(p.input); const size=h.integer(p.size,1,h.maxItems); const pages=Math.ceil(list.length/size); const page=h.integer(p.page,1,Math.max(1,pages));
  return {items:list.slice((page-1)*size,page*size),page,pages,total:list.length,next:page<pages?page+1:null,previous:page>1?page-1:null};
});
collection('list-index-by-field', 'Index records by field', 'Create a lookup object from record keys. Later duplicate keys replace earlier records.', [listSource,fieldKey], 'object', (p,h) => h.record(h.list(p.input).map((item) => [h.path(item,p.key),item])));
collection('csv-to-list', 'Parse CSV rows', 'Parse delimited text with quoted cells, escaped quotes and line breaks.', [source('string','CSV text'),text('separator','Separator',',')], 'array', (p,h) => h.parseCsv(p.input,p.separator));
collection('list-to-csv', 'Write CSV rows', 'Turn a list of row arrays into delimited text. Spreadsheet formula escaping is on by default.', [listSource,text('separator','Separator',','),arg('safe','Escape spreadsheet formulas','boolean',true)], 'string', (p,h) => h.writeCsv(p.input,p.separator,p.safe));
collection('records-to-csv', 'Export records as CSV', 'Use the configured field keys as CSV columns, including a header row.', [listSource,listInput('fields','Field keys',['name']),text('separator','Separator',','),arg('safe','Escape spreadsheet formulas','boolean',true)], 'string', (p,h) => {
  const fields=h.list(p.fields).map(h.key); return h.writeCsv([fields,...h.list(p.input).map((item) => fields.map((path) => h.path(item,path)))],p.separator,p.safe);
});

// Deliberately named numeric operations cover analytics, indexes and motion.
math('numeric-sign', 'Read number sign', 'Read -1 for negative, 0 for zero or 1 for positive.', [source('number','Number')], (p,h) => Math.sign(h.number(p.input)));
math('numeric-cube-root', 'Cube root', 'Calculate the cube root, including negative values.', [source('number','Number')], (p,h) => Math.cbrt(h.number(p.input)));
math('numeric-log', 'Logarithm with base', 'Find the logarithm of a positive value with a positive base other than one.', [source('number','Value'),numeric('base','Base',10)], (p,h) => Math.log(h.number(p.input))/Math.log(h.number(p.base)));
math('numeric-natural-exp', 'Natural exponential', 'Calculate e raised to the input power.', [source('number','Exponent')], (p,h) => Math.exp(h.number(p.input)));
math('numeric-positive-modulo', 'Wrap index', 'Wrap a signed number into a nonnegative range smaller than the modulus.', [source('number','Index'), numeric('modulus','Modulus',10)], (p,h) => { const n=h.integer(p.input); const span=h.integer(p.modulus,1); return (n%span+span)%span; });
math('numeric-snap-step', 'Round to nearest step', 'Snap a number to the nearest multiple of a positive interval.', [source('number','Number'),numeric('step','Step',5)], (p,h) => {
  const step=h.number(p.step); if (step<=0) throw Error('Choose a positive step.'); return Math.round(h.number(p.input)/step)*step;
});
math('numeric-normalize-range', 'Normalize number to range', 'Convert an input range to a zero-to-one relative position.', [source('number','Number'),...bounds], (p,h) => { const [min,max]=h.range(p.min,p.max); return (h.number(p.input)-min)/(max-min); });
math('numeric-lerp', 'Interpolate number', 'Blend two endpoints using a fraction. Zero returns Start and one returns End.', [numeric('start','Start',0),numeric('end','End',100),source('number','Fraction')], (p,h) => { const start=h.number(p.start); return start+(h.number(p.end)-start)*h.number(p.input); });
math('numeric-random-decimal', 'Random decimal', 'Generate a decimal in an interval with an exclusive upper endpoint.', bounds, (p,h) => { const [min,max]=h.range(p.min,p.max); return min+Math.random()*(max-min); });
math('numeric-choose-percent-change', 'Calculate percent change', 'Calculate the signed percentage change from the first number to the second.', [source('number','Original value'),numeric('other','New value',1)], (p,h) => { const before=h.number(p.input); return (h.number(p.other)-before)/Math.abs(before)*100; });
math('numeric-apply-percent-increase', 'Apply percentage change', 'Increase or decrease a number by a signed percentage.', [source('number','Original value'),numeric('percent','Percent',10)], (p,h) => h.number(p.input)*(1+h.number(p.percent)/100));
math('numeric-percent-ratio', 'Convert ratio to percentage', 'Express a numerator’s portion of a denominator as a percentage.', [source('number','Numerator'),numeric('other','Denominator',100)], (p,h) => h.number(p.input)/h.number(p.other)*100);
math('numeric-gcd', 'Greatest common divisor', 'Find the largest integer that evenly divides both integers.', [source('number','First integer'),numeric('other','Second integer',1)], (p,h) => h.gcd(p.input,p.other));
math('numeric-lcm', 'Least common multiple', 'Find the least common multiple of two nonzero integers. Zero returns zero.', [source('number','First integer'),numeric('other','Second integer',1)], (p,h) => { const a=h.integer(p.input); const b=h.integer(p.other); return a && b ? h.integer(Math.abs(a/h.gcd(a,b)*b)) : 0; });
math('angle-to-radians', 'Degrees to radians', 'Convert an angle measured in degrees to radians.', [source('number','Degrees')], (p,h) => h.number(p.input)*Math.PI/180);
math('angle-to-degrees', 'Radians to degrees', 'Convert an angle measured in radians to degrees.', [source('number','Radians')], (p,h) => h.number(p.input)*180/Math.PI);
math('angle-normalize', 'Normalize degrees', 'Wrap a signed angle to the interval from zero up to 360 degrees.', [source('number','Degrees')], (p,h) => (h.number(p.input)%360+360)%360);
math('angle-sine', 'Sine of angle', 'Calculate the sine of an angle given in radians.', [source('number','Radians')], (p,h) => Math.sin(h.number(p.input)));
math('angle-cosine', 'Cosine of angle', 'Calculate the cosine of an angle given in radians.', [source('number','Radians')], (p,h) => Math.cos(h.number(p.input)));
math('angle-tangent', 'Tangent of angle', 'Calculate the tangent of an angle given in radians.', [source('number','Radians')], (p,h) => Math.tan(h.number(p.input)));
math('angle-at-point', 'Angle to point', 'Calculate the angle in radians from the origin to a point.', [numeric('x','X',1),numeric('y','Y',1)], (p,h) => Math.atan2(h.number(p.y),h.number(p.x)));
math('distance-between-points', 'Distance between points', 'Calculate Euclidean distance between two two-dimensional points.', [numeric('x','First X',0),numeric('y','First Y',0),numeric('otherX','Second X',1),numeric('otherY','Second Y',1)], (p,h) => Math.hypot(h.number(p.otherX)-h.number(p.x),h.number(p.otherY)-h.number(p.y)));
math('math-aspect-ratio', 'Calculate aspect ratio', 'Divide a width by its height.', [numeric('width','Width',16),numeric('height','Height',9)], (p,h) => h.number(p.width)/h.number(p.height));
math('math-fit-width', 'Height at matching ratio', 'Find the height that preserves a source ratio at a new width.', [numeric('width','Original width',1920),numeric('height','Original height',1080),source('number','New width')], (p,h) => h.number(p.input)*h.number(p.height)/h.number(p.width));
math('math-fit-height', 'Width at matching ratio', 'Find the width that preserves a source ratio at a new height.', [numeric('width','Original width',1920),numeric('height','Original height',1080),source('number','New height')], (p,h) => h.number(p.input)*h.number(p.width)/h.number(p.height));
math('stats-median', 'Median of numbers', 'Find the middle value or the mean of the two middle values.', [source('array','Numbers')], (p,h) => h.quantile(p.input,0.5));
math('stats-percentile', 'Percentile of numbers', 'Find a percentile with linear interpolation between sorted samples.', [source('array','Numbers'),numeric('percent','Percentile',90)], (p,h) => h.quantile(p.input,h.number(p.percent)/100));
math('stats-variance', 'Population variance', 'Measure the mean squared deviation from the population mean.', [source('array','Numbers')], (p,h) => h.variance(p.input));
math('stats-deviation', 'Population standard deviation', 'Return the square root of population variance.', [source('array','Numbers')], (p,h) => Math.sqrt(h.variance(p.input)));
math('stats-weighted-average', 'Weighted average', 'Average values using a matching array of nonnegative weights.', [source('array','Numbers'),listInput('weights','Weights',[1])], (p,h) => {
  const numbers=h.list(p.input); const weights=h.list(p.weights);
  if (numbers.length!==weights.length) throw Error('Use equally sized value and weight lists.');
  let sum=0, total=0;
  for (const [index,value] of numbers.entries()) { const weight=h.number(weights[index]); if (weight<0) throw Error('Weights cannot be negative.'); sum+=h.number(value)*weight; total+=weight; }
  return sum/total;
});
math('stats-numeric-range', 'Numeric spread', 'Return the maximum value minus the minimum value in a list.', [source('array','Numbers')], (p,h) => { const numbers=h.list(p.input).map(h.number); return Math.max(...numbers)-Math.min(...numbers); });
collection('math-number-sequence', 'Generate number sequence', 'Build a bounded sequence starting at a value and increasing by Step.', [numeric('start','Start',0),numeric('step','Step',1),numeric('size','Items',10)], 'array', (p,h) => {
  const start=h.number(p.start); const step=h.number(p.step); return Array.from({length:h.integer(p.size,0,h.maxItems)},(_,index) => h.number(start+step*index));
});
condition('numeric-is-even', 'Integer is even', 'Pass when the number is an even integer.', [source('number','Integer')], (p,h) => h.integer(p.input)%2===0);
condition('numeric-is-integer', 'Number is an integer', 'Pass when the number is a safe whole number.', [source('number','Number')], (p,h) => Number.isSafeInteger(h.number(p.input)));
condition('numeric-within-tolerance', 'Numbers approximately equal', 'Pass when the difference is no larger than the absolute tolerance.', [source('number','First number'),numeric('other','Second number',0),numeric('tolerance','Absolute tolerance',0.001)], (p,h) => Math.abs(h.number(p.input)-h.number(p.other))<=Math.abs(h.number(p.tolerance)));

const colorPort = source('string','Hex color');
const secondColor = text('other','Second hex color','#ffffff');
const colorAction = (id,label,description,inputs,type,run) => operation(id,'Color',label,description,inputs,type,run);
colorAction('color-from-rgb', 'Build hex color from RGB', 'Build a CSS hex color from RGB byte values and an optional alpha channel.', [numeric('red','Red',0),numeric('green','Green',0),numeric('blue','Blue',0),numeric('alpha','Alpha',1)], 'string', (p,h) => h.colorHex({r:p.red,g:p.green,b:p.blue,a:p.alpha}));
colorAction('color-read-rgb', 'Read RGB channels', 'Extract red, green, blue and alpha from a CSS hex color.', [colorPort], 'object', (p,h) => h.readColor(p.input));
colorAction('color-read-hsl', 'Read HSL channels', 'Convert a hex color to hue, saturation, lightness and alpha.', [colorPort], 'object', (p,h) => h.rgbToHsl(h.readColor(p.input)));
colorAction('color-from-hsl', 'Build hex color from HSL', 'Convert hue in degrees, saturation and lightness fractions to a CSS hex color.', [numeric('hue','Hue degrees',180),numeric('saturation','Saturation (0–1)',0.5),numeric('lightness','Lightness (0–1)',0.5),numeric('alpha','Alpha',1)], 'string', (p,h) => h.colorHex(h.hslToRgb({h:p.hue,s:p.saturation,l:p.lightness,a:p.alpha})));
colorAction('color-mix', 'Blend two colors', 'Blend RGB channels using a fraction between zero and one.', [colorPort,secondColor,numeric('ratio','Second color portion',0.5)], 'string', (p,h) => h.colorHex(h.mixColor(p.input,p.other,p.ratio)));
colorAction('color-lighten', 'Lighten color', 'Blend the selected color toward white by the configured amount.', [colorPort,numeric('amount','Amount (0–1)',0.2)], 'string', (p,h) => h.colorHex(h.mixColor(p.input,'#fff',p.amount)));
colorAction('color-darken', 'Darken color', 'Blend the selected color toward black by the configured amount.', [colorPort,numeric('amount','Amount (0–1)',0.2)], 'string', (p,h) => h.colorHex(h.mixColor(p.input,'#000',p.amount)));
colorAction('color-alpha', 'Replace color opacity', 'Set the alpha channel while keeping existing RGB colors.', [colorPort,numeric('alpha','Alpha (0–1)',0.5)], 'string', (p,h) => h.colorHex({...h.readColor(p.input),a:p.alpha}));
colorAction('color-invert', 'Invert RGB color', 'Invert each RGB channel and retain alpha.', [colorPort], 'string', (p,h) => { const {r,g,b,a}=h.readColor(p.input); return h.colorHex({r:255-r,g:255-g,b:255-b,a}); });
colorAction('color-luminance', 'Relative color luminance', 'Calculate relative luminance for contrast testing.', [colorPort], 'number', (p,h) => h.luminance(h.readColor(p.input)));
colorAction('color-contrast', 'Color contrast ratio', 'Calculate the contrast ratio of two opaque sRGB colors.', [colorPort,secondColor], 'number', (p,h) => h.contrast(p.input,p.other));
colorAction('color-readability', 'Choose readable text color', 'Choose black or white by contrast ratio against an opaque background.', [colorPort], 'string', (p,h) => h.contrast(p.input,'#000000')>=h.contrast(p.input,'#ffffff')?'#000000':'#ffffff');
colorAction('color-rotate-hue', 'Rotate color hue', 'Rotate hue by a signed angle while retaining saturation, lightness and alpha.', [colorPort,numeric('angle','Degrees',90)], 'string', (p,h) => { const value=h.rgbToHsl(h.readColor(p.input)); value.h+=h.number(p.angle); return h.colorHex(h.hslToRgb(value)); });
condition('color-passes-contrast', 'Color contrast meets target', 'Pass when the requested color ratio is at or above the threshold.', [colorPort,secondColor,numeric('minimum','Minimum ratio',4.5)], (p,h) => h.contrast(p.input,p.other)>=h.number(p.minimum));

// Typed DOM actions use block IDs and scoped selectors rather than arbitrary markup.
const fieldText = source('string','Field text');
action('field-set-placeholder', 'Set field placeholder', 'Change placeholder text on the selected input or textarea.', [fieldText], 'string', (p,h) => {
  const field=h.element(p.target,'input,textarea'); field.placeholder=h.text(p.input); return field.placeholder;
});
action('field-set-required', 'Set field requirement', 'Choose whether the targeted form field is required.', [arg('required','Required','boolean',true)], 'boolean', (p,h) => { const field=h.control(p.target); field.required=p.required; return field.required; });
action('field-set-readonly', 'Set read-only field', 'Choose whether a text input or textarea allows editing.', [arg('readOnly','Read only','boolean',true)], 'boolean', (p,h) => { const field=h.element(p.target,'input,textarea'); field.readOnly=p.readOnly; return field.readOnly; });
action('field-read-validity', 'Read field validation', 'Return validity, validation message and common constraint flags for a field.', [], 'object', (p,h) => {
  const field=h.control(p.target); const validity=field.validity;
  return { valid:validity.valid, message:field.validationMessage, missing:validity.valueMissing, mismatch:validity.typeMismatch||validity.patternMismatch, tooShort:validity.tooShort, tooLong:validity.tooLong, outOfRange:validity.rangeUnderflow||validity.rangeOverflow };
});
action('field-set-validation-message', 'Set field validation error', 'Set a custom browser validation message. Blank clears an existing message.', [text('message','Message','')], 'boolean', (p,h) => {
  const field=h.control(p.target); field.setCustomValidity(h.text(p.message)); return field.validity.valid;
});
action('field-report-validation', 'Show field validation feedback', 'Ask the browser to show validation feedback for this field.', [], 'boolean', (p,h) => h.control(p.target).reportValidity());
action('form-report-validation', 'Show form validation feedback', 'Ask the browser to display the first form constraint error.', [], 'boolean', (p,h) => h.form(p.target).reportValidity());
action('form-request-submit', 'Request form submission', 'Submit a form through normal browser validation and its Submit flow.', [], 'boolean', (p,h) => { h.form(p.target).requestSubmit(); return true; });
action('select-read-options', 'Read select options', 'Return each option’s label, value, selected status and disabled status.', [], 'array', (p,h) => Array.from(h.element(p.target,'select').options,({label,value,selected,disabled}) => ({label,value,selected,disabled})));
action('select-read-selected', 'Read selected option values', 'Return selected option values, including multiple selections.', [], 'array', (p,h) => Array.from(h.element(p.target,'select').selectedOptions,({value}) => value));
action('select-set-by-index', 'Choose select option by index', 'Select a zero-based option in a select. Use -1 to clear.', [numeric('index','Option index',0)], 'string', (p,h) => {
  const field=h.element(p.target,'select'); field.selectedIndex=h.integer(p.index,-1,field.options.length-1); return field.value;
});
action('select-set-values', 'Choose multiple option values', 'Apply a list of selected values to a multiple-selection field.', [source('array','Selected values')], 'array', (p,h) => {
  const field=h.element(p.target,'select[multiple]'); const values=new Set(h.list(p.input).map(h.text));
  for (const option of field.options) option.selected=values.has(option.value);
  return Array.from(field.selectedOptions,({value}) => value);
});
action('field-select-entire-text', 'Select text in field', 'Focus a supported text field and select its complete value.', [], 'boolean', (p,h) => {
  const field=h.element(p.target,'input,textarea'); field.focus({preventScroll:true}); field.select(); return document.activeElement===field;
});
action('read-block-rectangle', 'Read block position and size', 'Read viewport-relative X, Y, width and height in CSS pixels.', [], 'object', (p,h) => {
  const {x,y,width,height}=h.element(p.target).getBoundingClientRect(); return {x,y,width,height};
});
const cssProperties=createCatalogHelpers().visualProperties;
const styleChoice=text('property','CSS property','background-color',{kind:'select',options:cssProperties.map((value)=>[value,value])});
action('set-inline-style', 'Set visual style property', 'Apply a supported CSS value to an allowed visual property. Blank removes the inline value.', [styleChoice,text('value','CSS value','#e5ded2')], 'string', (p,h) => h.visualStyle(p.target,p.property,p.value));
action('read-computed-style', 'Read computed visual style', 'Read the computed browser CSS value for a supported visual property.', [styleChoice], 'string', (p,h) => getComputedStyle(h.element(p.target)).getPropertyValue(h.styleProperty(p.property)).trim());
action('set-css-custom-property', 'Set CSS custom property', 'Write a visual CSS variable on a selected block.', [text('name','Custom property','--accent'),text('value','CSS value','#e5ded2')], 'string', (p,h) => {
  const name=h.text(p.name); if (!/^--[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(name)) throw Error('Choose a CSS variable such as --accent.');
  const value=h.safeStyleValue(p.value); const block=h.element(p.target); if (value) block.style.setProperty(name,value); else block.style.removeProperty(name); return value;
});
action('read-block-class-list', 'Read block class list', 'Return all CSS classes applied to the selected block.', [], 'array', (p,h) => Array.from(h.element(p.target).classList));
action('set-block-tooltip', 'Set block tooltip', 'Set the title annotation shown by the browser for a block.', [source('string','Tooltip text')], 'string', (p,h) => { const block=h.element(p.target); block.title=h.text(p.input); return block.title; });
action('set-details-open', 'Set disclosure open state', 'Open or close the details element inside the block.', [arg('open','Open','boolean',true)], 'boolean', (p,h) => {
  const details=h.element(p.target,'details'); details.open=p.open; return details.open;
});
action('read-details-open', 'Read disclosure open state', 'Return whether a details element in the selected block is expanded.', [], 'boolean', (p,h) => h.element(p.target,'details').open);
action('media-read-state', 'Read media playback state', 'Read current time, duration, volume, muted, paused and ended flags.', [], 'object', (p,h) => {
  const {currentTime,duration,volume,muted,paused,ended,playbackRate}=h.element(p.target,'audio,video'); return {currentTime,duration:Number.isFinite(duration)?duration:null,volume,muted,paused,ended,playbackRate};
});
action('media-set-volume', 'Set media volume', 'Set volume from zero to one. Some mobile browsers control volume externally.', [source('number','Volume fraction')], 'number', (p,h) => { const media=h.element(p.target,'audio,video'); media.volume=h.fraction(p.input); return media.volume; });
action('media-set-muted', 'Set media muted state', 'Mute or unmute the selected audio or video.', [arg('muted','Muted','boolean',true)], 'boolean', (p,h) => { const media=h.element(p.target,'audio,video'); media.muted=p.muted; return media.muted; });
action('media-set-speed', 'Set playback speed', 'Set audio or video speed as a positive fraction or multiple of normal speed.', [numeric('speed','Speed',1)], 'number', (p,h) => {
  const media=h.element(p.target,'audio,video'); const speed=h.number(p.speed); if (speed<0.25||speed>4) throw Error('Use speed between 0.25 and 4.'); media.playbackRate=speed; return media.playbackRate;
});
action('media-set-loop', 'Set media loop', 'Choose whether audio or video starts again after reaching the end.', [arg('loop','Loop playback','boolean',true)], 'boolean', (p,h) => { const media=h.element(p.target,'audio,video'); media.loop=p.loop; return media.loop; });
action('read-image-size', 'Read image natural size', 'Read the original image width and height. Unloaded images report zero.', [], 'object', (p,h) => { const {naturalWidth,naturalHeight,complete}=h.element(p.target,'img'); return {width:naturalWidth,height:naturalHeight,complete}; });
action('animate-fade', 'Animate block opacity', 'Animate opacity between two values and apply the ending opacity. Respects reduced motion.', [numeric('from','Starting opacity',0),numeric('to','Ending opacity',1),numeric('duration','Duration (ms)',250)], 'boolean', async (p,h) => {
  const block=h.element(p.target); const from=h.fraction(p.from); const to=h.fraction(p.to); await h.animate(block,[{opacity:from},{opacity:to}],p.duration); block.style.opacity=String(to); return true;
});
action('animate-translate', 'Slide block into position', 'Animate from an X/Y offset back to the current layout position.', [numeric('x','Starting X offset',0),numeric('y','Starting Y offset',16),numeric('duration','Duration (ms)',250)], 'boolean', async (p,h) => {
  const block=h.element(p.target); const x=h.integer(p.x,-4000,4000); const y=h.integer(p.y,-4000,4000);
  await h.animate(block,[{translate:`${x}px ${y}px`},{translate:'0px 0px'}],p.duration); return true;
});
action('animate-scale-in', 'Scale block into position', 'Animate from a starting scale to normal size without changing document layout.', [numeric('scale','Starting scale',0.85),numeric('duration','Duration (ms)',250)], 'boolean', async (p,h) => {
  const scale=h.number(p.scale); if (scale<0||scale>4) throw Error('Use scale between zero and four.');
  await h.animate(h.element(p.target),[{scale},{scale:1}],p.duration); return true;
});
browser('scroll-page-by', 'Scroll page by offset', 'Move the current document by horizontal and vertical pixel offsets.', [numeric('x','X offset',0),numeric('y','Y offset',300),arg('smooth','Smooth motion','boolean',true)], 'boolean', (p,h) => {
  window.scrollBy({left:h.number(p.x),top:h.number(p.y),behavior:p.smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'}); return true;
});
browser('read-page-title', 'Read page title', 'Return the current document’s title.', [], 'string', () => document.title);
browser('set-page-title', 'Set page title', 'Update the title shown in the browser tab.', [source('string','New title')], 'string', (p,h) => { document.title=h.text(p.input); return document.title; });
browser('read-language', 'Read language preference', 'Return the browser’s preferred language tags in order.', [], 'array', () => Array.from(navigator.languages));
browser('read-reduced-motion', 'Read reduced-motion preference', 'Return whether the browser requests less motion.', [], 'boolean', () => matchMedia('(prefers-reduced-motion: reduce)').matches);
browser('read-color-preference', 'Read color-scheme preference', 'Return dark or light according to the browser’s color-scheme preference.', [], 'string', () => matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
browser('read-viewport-pixel-ratio', 'Read display pixel ratio', 'Return the ratio between device pixels and CSS pixels.', [], 'number', () => devicePixelRatio);
browser('read-timezone', 'Read browser timezone', 'Return the browser’s resolved IANA timezone name.', [], 'string', () => new Intl.DateTimeFormat().resolvedOptions().timeZone);
const storeScope=text('scope','Storage lifetime','session',{kind:'select',options:[['session','This browser tab'],['local','This website across visits']]});
const storeKey=text('key','Storage key','preference');
browser('storage-save-value', 'Store browser value', 'Save a JSON value in this website’s storage. Use for non-secret preferences. Opaque preview can block access.', [storeScope,storeKey,source()], 'boolean', (p,h) => {
  const encoded=JSON.stringify(p.input??null); h.projectStorage(p.scope).setItem('plot-site:'+h.key(p.key),h.text(encoded)); return true;
});
browser('storage-read-value', 'Read browser value', 'Read a stored JSON value with an optional fallback. Opaque preview can block access.', [storeScope,storeKey,arg('fallback','Fallback','any',null)], 'any', (p,h) => {
  const value=h.projectStorage(p.scope).getItem('plot-site:'+h.key(p.key)); return value===null?p.fallback:JSON.parse(value);
});
browser('storage-delete-value', 'Remove browser value', 'Remove one website-owned storage key.', [storeScope,storeKey], 'boolean', (p,h) => { h.projectStorage(p.scope).removeItem('plot-site:'+h.key(p.key)); return true; });
condition('storage-has-value', 'Browser value exists', 'Check whether a website-owned storage key is present.', [storeScope,storeKey], (p,h) => h.projectStorage(p.scope).getItem('plot-site:'+h.key(p.key))!==null);
condition('pointer-prefers-touch', 'Primary pointer coarse', 'Pass for a coarse primary pointer, commonly a touch screen.', [], () => matchMedia('(pointer: coarse)').matches);
condition('viewport-is-portrait', 'Viewport is portrait', 'Pass when the viewport orientation is portrait.', [], () => matchMedia('(orientation: portrait)').matches);
trigger('form-validation-failed','Form field invalid','Run when the browser finds a field that failed a form constraint.','invalid',fieldValues);
trigger('media-duration-changed','Media duration changed','Run when the browser learns or changes the duration of media.','durationchange',[['value','Duration (s)','any']]);
trigger('media-buffering','Media needs data','Run when audio or video is paused while it waits for more content.','waiting',[['value','Time (s)','number']]);
trigger('media-seeked','Media seek completes','Run after the audio or video playback position changes through seeking.','seeked',[['value','Time (s)','number']]);
trigger('image-resource-loaded','Image finished loading','Run after an image inside a block successfully loads.','load',[['detail','Image details','object']]);
trigger('image-resource-failed','Image loading failed','Run after an image inside a block fails to load.','error',[['detail','Image details','object']]);
trigger('animation-completed','CSS animation completed','Run after a CSS animation on a selected block finishes.','animationend',[['detail','Animation','object']]);
trigger('transition-completed','CSS transition completed','Run after a CSS transition on a selected block finishes.','transitionend',[['detail','Transition','object']]);

export const catalogNodes = Object.freeze(catalog);

export function readCatalogValue(value, type) {
  if (type === 'number') {
    if (typeof value === 'string' && value.trim()) value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Enter a finite number.');
    return value;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw Error('Choose true or false.');
    return value;
  }
  if (type === 'string') return String(value ?? '');
  if (type === 'any') {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (type === 'array' && !Array.isArray(parsed)) throw Error('Enter a JSON list, for example [1, 2].');
  if (type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw Error('Enter a JSON object, for example {"name":"Ada"}.');
  return parsed;
}

// This factory is embedded in exported JavaScript and must remain self-contained.
export function createCatalogHelpers() {
  const maxItems = 4000;
  const maxText = 250000;
  const focusable = 'a[href],input,button,textarea,select,summary,[tabindex]';
  const guards = new WeakMap();
  const blocked = new Set(['__proto__', 'prototype', 'constructor']);
  const visualProperties=['color','background-color','border-color','border-radius','border-width','opacity','font-size','font-weight','text-align','margin','padding','width','height','max-width','min-height','gap','line-height','letter-spacing','text-decoration','object-fit'];

  function text(input) {
    const result = String(input ?? '');
    if (result.length > maxText) throw Error('Text exceeds the 250,000 character limit.');
    return result;
  }

  function shortText(input) {
    if (input != null && typeof input === 'object') return text(JSON.stringify(input));
    return text(input);
  }

  function number(input) {
    if (!['number', 'string', 'boolean'].includes(typeof input) || String(input).trim() === '') throw Error('This node expects a finite number.');
    const result = Number(input);
    if (!Number.isFinite(result)) throw Error('This node produced or received a non-finite number.');
    return result;
  }

  function integer(input, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const result = number(input);
    if (!Number.isSafeInteger(result) || result < min || result > max) throw Error(`Use an integer between ${min} and ${max}.`);
    return result;
  }

  function boolean(input) {
    if (typeof input !== 'boolean') throw Error('This node expects a true or false value.');
    return input;
  }

  function range(first, last) {
    const min = number(first);
    const max = number(last);
    if (min > max) throw Error('The minimum must not exceed the maximum.');
    return [min, max];
  }

  function object(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('This node expects an object.');
    return input;
  }

  function list(input) {
    if (!Array.isArray(input)) throw Error('This node expects a list.');
    if (input.length > maxItems) throw Error('List exceeds the 4,000 item limit.');
    return input;
  }

  function entries(input) {
    return list(Object.entries(object(input)));
  }

  function key(input) {
    const name = text(input);
    if (name.length > 240 || !name || blocked.has(name)) throw Error('Enter a valid object field name.');
    return name;
  }

  function record(pairs) {
    return Object.fromEntries(list(pairs).map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw Error('Each entry needs a field key and a value.');
      return [key(pair[0]), pair[1]];
    }));
  }

  function find(input, route) {
    const parts = text(route).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    if (!parts.length || parts.length > 40) return { found: false };
    for (const part of parts) {
      if (blocked.has(part) || input == null || !Object.hasOwn(Object(input), part)) return { found: false };
      input = input[part];
    }
    return { found: true, value: input };
  }

  function empty(input) {
    if (input == null) return true;
    if (typeof input === 'string') return !text(input).trim();
    if (Array.isArray(input)) return !input.length;
    if (typeof input !== 'object') return false;
    return !Object.keys(input).length;
  }

  function require(condition, message) {
    if (!condition) throw Object.assign(new Error(text(message) || 'The value did not pass validation.'), { code: 'VALIDATION_FAILED' });
  }

  function element(block, selector) {
    const result = selector && !block?.matches(selector) ? block?.querySelector(selector) : block;
    if (!result) throw Error(selector ? `The selected block does not contain ${selector}.` : 'The selected block is missing on this page.');
    return result;
  }

  function form(block) {
    return element(block, 'form');
  }

  function control(block, alsoButton = false) {
    return element(block, alsoButton ? 'input,select,textarea,button' : 'input,select,textarea');
  }

  function checkable(block) {
    return element(block, 'input[type=checkbox],input[type=radio]');
  }

  function styleProperty(value) {
    const name=text(value).trim().toLowerCase();
    if (!visualProperties.includes(name)) throw Error('Choose an available visual CSS property.');
    return name;
  }

  function safeStyleValue(value) {
    const content=text(value).trim();
    if (content.length>1000 || /[\\;{}@<>]|(?:url|expression)\s*\(/i.test(content)) throw Error('Use a plain visual CSS value.');
    return content;
  }

  function visualStyle(block, property, value) {
    const node=element(block);
    const name=styleProperty(property);
    const content=safeStyleValue(value);
    if (content && !CSS.supports(name,content)) throw Error('The browser does not support this CSS property value.');
    if (content) node.style.setProperty(name,content);
    else node.style.removeProperty(name);
    return node.style.getPropertyValue(name);
  }

  function projectStorage(scope) {
    if (!['local','session'].includes(scope)) throw Error('Select a storage lifetime.');
    try { return scope==='local' ? globalThis.localStorage : globalThis.sessionStorage; }
    catch { throw Error('Browser storage is unavailable in this preview or browser context.'); }
  }

  async function animate(block, frames, duration) {
    const time=integer(duration,0,3000);
    if (!time || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    await block.animate(frames,{duration:time,easing:'ease-out'}).finished;
  }

  function formFields(block) {
    const values = Object.create(null);
    let count = 0;
    for (const [name, value] of new FormData(form(block))) {
      const previous = values[key(name)];
      if (previous === undefined) {
        if (count++ >= maxItems) throw Error('Too many form fields.');
        values[name] = value;
      }
      else if (Array.isArray(previous)) { if (previous.length >= maxItems) throw Error('Too many values for one field.'); previous.push(value); }
      else values[name] = [previous, value];
    }
    return values;
  }

  function url(input) {
    const result = new URL(text(input).trim());
    if (!['https:', 'http:'].includes(result.protocol) || !result.hostname || result.username || result.password) throw Error('Enter an absolute HTTP or HTTPS URL without credentials.');
    return result;
  }

  function urlParts(value) {
    return { scheme: value.protocol.slice(0,-1), hostname:value.hostname, port:value.port, origin:value.origin, path:value.pathname, query:queryRecord(value.searchParams), fragment:value.hash.slice(1) };
  }

  function queryRecord(query) {
    const result = Object.create(null);
    let count = 0;
    for (const [name,value] of query) {
      if (++count > maxItems) throw Error('Too many query values.');
      const property = key(name);
      if (!Object.hasOwn(result,property)) result[property] = value;
      else if (Array.isArray(result[property])) result[property].push(value);
      else result[property] = [result[property],value];
    }
    return result;
  }

  function queryParams(values) {
    const query = new URLSearchParams();
    let count = 0;
    let length = 0;
    for (const [name,value] of entries(values)) {
      for (const item of Array.isArray(value) ? list(value) : [value]) {
        if (item == null) continue;
        if (++count > maxItems) throw Error('Too many query values.');
        if (typeof item === 'object') throw Error('Query values must be text, numbers, booleans or arrays of these types.');
        const label = key(name);
        const value = text(item);
        length += label.length + value.length;
        if (length > maxText) throw Error('The query exceeds the text limit.');
        query.append(label,value);
      }
    }
    return query;
  }

  function segments(value, locale, kind) {
    const iterator = new Intl.Segmenter(text(locale), { granularity:kind }).segment(text(value));
    const result = [];
    for (const record of iterator) {
      if (result.length >= 50000) throw Error('Text contains too many segments.');
      result.push(record);
    }
    return result;
  }

  function matchCount(value, query) {
    const source = text(value);
    const term = text(query);
    if (!term) return 0;
    let count = 0;
    for (let index = source.indexOf(term); index !== -1; index = source.indexOf(term,index + term.length)) count++;
    return count;
  }

  function toBase64(value) {
    const bytes = new TextEncoder().encode(text(value));
    if (Math.ceil(bytes.length / 3) * 4 > maxText) throw Error('Encoded text exceeds the text limit.');
    let raw = '';
    for (let start = 0; start < bytes.length; start += 16384) raw += String.fromCharCode(...bytes.subarray(start,start + 16384));
    return btoa(raw);
  }

  function date(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) throw Error('Enter a date or timestamp.');
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw Error('The date is invalid.');
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && parsed.toISOString().slice(0,10) !== value) throw Error('The calendar date is invalid.');
    return parsed;
  }

  function dateParts(value) {
    return { year:value.getUTCFullYear(), month:value.getUTCMonth()+1, day:value.getUTCDate(), weekday:value.getUTCDay(), hour:value.getUTCHours(), minute:value.getUTCMinutes(), second:value.getUTCSeconds(), millisecond:value.getUTCMilliseconds() };
  }

  function daysInMonth(value) {
    const last = new Date(value);
    last.setUTCMonth(last.getUTCMonth()+1,0);
    return last.getUTCDate();
  }

  function addDate(value, amount, unit) {
    const target = date(value);
    const count = integer(amount,-1000000,1000000);
    const scale = ({ second:1000, minute:60000, hour:3600000, day:86400000, week:604800000 })[unit];
    if (scale) return date(target.getTime() + count * scale);
    if (!['month','year'].includes(unit)) throw Error('Choose a valid time unit.');
    const originalDay = target.getUTCDate();
    target.setUTCMonth(target.getUTCMonth() + count * (unit === 'year' ? 12 : 1),1);
    target.setUTCDate(Math.min(originalDay,daysInMonth(target)));
    return date(target);
  }

  function isoWeek(value) {
    const week = new Date(value);
    week.setUTCHours(0,0,0,0);
    const weekday = week.getUTCDay() || 7;
    week.setUTCDate(week.getUTCDate() + 4 - weekday);
    const first = new Date(week);
    first.setUTCMonth(0,1);
    return { year:week.getUTCFullYear(), week:Math.ceil(((week - first) / 86400000 + 1) / 7) };
  }

  function buildDate({year,month,day,hour,minute,second}) {
    const value = new Date(0);
    value.setUTCFullYear(integer(year,1,9999),integer(month,1,12)-1,integer(day,1,31));
    value.setUTCHours(integer(hour,0,23),integer(minute,0,59),integer(second,0,59),0);
    if (value.getUTCDate() !== number(day)) throw Error('The day does not exist in the selected month.');
    return value;
  }

  function durationParts(value) {
    const elapsed = integer(value);
    const span = Math.abs(elapsed);
    return { sign:Math.sign(elapsed), days:Math.floor(span/86400000), hours:Math.floor(span/3600000)%24, minutes:Math.floor(span/60000)%60, seconds:Math.floor(span/1000)%60, milliseconds:span%1000 };
  }

  function writePath(value, route, assignment) {
    const parts = text(route).split('.').map(key);
    if (!parts.length || parts.length > 40) throw Error('Use a field path of at most 40 keys.');
    const result = record(entries(value));
    let source = value;
    let target = result;
    for (const key of parts.slice(0,-1)) {
      const child = Object.hasOwn(source,key) ? source[key] : {};
      target[key] = record(entries(child));
      target = target[key];
      source = child;
    }
    target[parts.at(-1)] = assignment;
    return result;
  }

  function chunks(value, size) {
    const items = list(value);
    const count = integer(size,1,maxItems);
    const result = [];
    for (let start=0;start<items.length;start+=count) result.push(items.slice(start,start+count));
    return result;
  }

  function groupByField(value, path, onlyCount) {
    const groups = Object.create(null);
    for (const item of list(value)) {
      const label = shortText(find(item,path).value) || '(missing)';
      if (onlyCount) groups[label] = (groups[label] || 0)+1;
      else (groups[label] ??= []).push(item);
    }
    return groups;
  }

  function csvSeparator(value) {
    const delimiter = text(value);
    if (delimiter.length !== 1 || ['\n','\r','"'].includes(delimiter)) throw Error('Use one separator other than a newline or double quote.');
    return delimiter;
  }

  function parseCsv(value, separator) {
    const input = text(value);
    const delimiter = csvSeparator(separator);
    if (!input) return [];
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;
    const addField = () => {
      if (row.length >= maxItems) throw Error('The CSV has too many columns.');
      row.push(field);
      field = '';
      closedQuote = false;
    };
    const addRow = () => {
      addField();
      if (rows.length >= maxItems) throw Error('The CSV has too many rows.');
      rows.push(row);
      row = [];
    };
    for (let index=0;index<input.length;index++) {
      const character = input[index];
      if (quoted) {
        if (character !== '"') field += character;
        else if (input[index+1] === '"') { field += '"'; index++; }
        else { quoted = false; closedQuote = true; }
        continue;
      }
      if (character === delimiter) { addField(); continue; }
      if (character === '\n' || character === '\r') {
        if (character === '\r' && input[index+1] === '\n') index++;
        addRow(); continue;
      }
      if (closedQuote) throw Error('Unexpected text after a quoted CSV field.');
      if (character === '"') {
        if (field) throw Error('A quote must open a CSV field.');
        quoted = true;
      } else field += character;
    }
    if (quoted) throw Error('A quoted CSV field was not closed.');
    if (!/[\r\n]$/.test(input) || row.length || field || closedQuote) addRow();
    return rows;
  }

  function writeCsv(value, separator, safe) {
    const delimiter = csvSeparator(separator);
    let length = 0;
    return list(value).map((row) => list(row).map((part) => {
      let cell = shortText(part);
      if (safe && typeof part === 'string' && /^\s*[=+@\-]/.test(cell)) cell = "'"+cell;
      if (cell.includes(delimiter) || /["\r\n]/.test(cell)) cell = '"'+cell.replaceAll('"','""')+'"';
      length += cell.length+1;
      if (length > maxText) throw Error('CSV output exceeds the text limit.');
      return cell;
    }).join(delimiter)).join('\r\n');
  }

  function gcd(first, second) {
    let a=Math.abs(integer(first));
    let b=Math.abs(integer(second));
    while (b) [a,b]=[b,a%b];
    return a;
  }

  function quantile(value, probability) {
    const samples = list(value).map(number).sort((a,b) => a-b);
    if (!samples.length || probability<0 || probability>1) throw Error('Provide samples and a percentile between zero and 100.');
    const index=(samples.length-1)*probability;
    const left=Math.floor(index);
    const right=Math.ceil(index);
    return samples[left]+(samples[right]-samples[left])*(index-left);
  }

  function variance(value) {
    const samples=list(value).map(number);
    if (!samples.length) throw Error('Provide at least one value.');
    const average=samples.reduce((sum,value) => sum+value,0)/samples.length;
    return samples.reduce((sum,value) => sum+(value-average)**2,0)/samples.length;
  }

  function fraction(value) {
    const result=number(value);
    if (result<0 || result>1) throw Error('Use a fraction from 0 to 1.');
    return result;
  }

  function readColor(value) {
    const input=text(value).trim().toLowerCase();
    if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(input)) throw Error('Enter a CSS hex color such as #3366ff or #3366ff80.');
    const hex=input.length<=5 ? Array.from(input.slice(1),(part) => part.repeat(2)).join('') : input.slice(1);
    const [r,g,b,opacity=255]=hex.match(/../g).map((pair) => Number.parseInt(pair,16));
    return {r,g,b,a:opacity/255};
  }

  function colorHex({r,g,b,a}) {
    const opacity=fraction(a);
    const channels=opacity===1 ? [r,g,b] : [r,g,b,opacity*255];
    return '#'+channels.map((part) => integer(Math.round(number(part)),0,255).toString(16).padStart(2,'0')).join('');
  }

  function rgbToHsl({r,g,b,a}) {
    const [red,green,blue]=[r,g,b].map((channel) => channel/255);
    const hi=Math.max(red,green,blue);
    const lo=Math.min(red,green,blue);
    const delta=hi-lo;
    const l=(hi+lo)/2;
    if (!delta) return {h:0,s:0,l,a};
    const wheel=hi===red ? (green-blue)/delta : hi===green ? 2+(blue-red)/delta : 4+(red-green)/delta;
    return {h:(wheel*60+360)%360,s:delta/(1-Math.abs(2*l-1)),l,a};
  }

  function hslToRgb({h,s,l,a}) {
    const hue=(number(h)%360+360)%360;
    const saturation=fraction(s);
    const lightness=fraction(l);
    const value=saturation*Math.min(lightness,1-lightness);
    const channel=(offset) => {
      const x=(offset+hue/30)%12;
      return 255*(lightness-value*Math.max(-1,Math.min(x-3,9-x,1)));
    };
    return {r:channel(0),g:channel(8),b:channel(4),a:fraction(a)};
  }

  function mixColor(first,second,ratio) {
    const a=readColor(first);
    const b=readColor(second);
    const t=fraction(ratio);
    return Object.fromEntries(['r','g','b','a'].map((key) => [key,a[key]+(b[key]-a[key])*t]));
  }

  function luminance({r,g,b,a}) {
    if (a!==1) throw Error('Use opaque colors for luminance or contrast.');
    const linear=([r,g,b]).map((value) => value/255).map((value) => value<=0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2];
  }

  function contrast(first,second) {
    const a=luminance(readColor(first));
    const b=luminance(readColor(second));
    return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  }

  async function callBackend({ path, method, body, query }) {
    path = text(path).trim();
    method = text(method).toUpperCase();
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (!allowedMethods.includes(method)) throw Error('Choose a supported HTTP method.');
    if (!/^\/api\/(?!\/)[^\\\s?#]+$/.test(path) || /%(?:2f|5c|2e)/i.test(path) || path.split('/').some((segment) => segment === '.' || segment === '..')) {
      throw Error('Enter a local API path such as /api/contact. Pass query values separately.');
    }
    const queryObject = object(query);
    const sendsBody = !['GET', 'HEAD'].includes(method) && body != null;
    if (sendsBody && new TextEncoder().encode(JSON.stringify(body)).byteLength > 1000000) throw Error('Request body exceeds the 1 MB limit.');
    let answer;
    if (typeof globalThis.plotBackend?.request === 'function') {
      answer = await globalThis.plotBackend.request(path, { method, body: sendsBody ? body : undefined, query: queryObject });
    } else {
      if (!['http:', 'https:'].includes(location.protocol)) throw Error('Serve the export over HTTP to use its backend routes.');
      const address = new URL(path, location.origin);
      address.search = queryParams(queryObject).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(Error('Backend request timed out.')), 30000);
      try {
        const response = await fetch(address, {
          method, credentials: 'same-origin', redirect: 'error', signal: controller.signal,
          ...(sendsBody ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
        });
        const limit = 2000000;
        if (Number(response.headers.get('content-length')) > limit) throw Error('Backend response exceeds the 2 MB limit.');
        let raw = '';
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let size = 0;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > limit) { controller.abort(); throw Error('Backend response exceeds the 2 MB limit.'); }
              raw += decoder.decode(value, { stream: true });
            }
            raw += decoder.decode();
          } finally { reader.releaseLock(); }
        }
        const headers = Object.fromEntries(response.headers);
        const data = /[/+]json\b/i.test(headers['content-type'] || '') && raw ? JSON.parse(raw) : raw || null;
        answer = { status: response.status, body: data, headers };
      } finally { clearTimeout(timer); }
    }
    const status = integer(answer?.status, 100, 599);
    const headers = answer?.headers || {};
    if (status < 200 || status >= 300) {
      throw Object.assign(Error(`Backend returned HTTP ${status}.`), { code: 'BACKEND_HTTP', status, data: answer.body, headers });
    }
    return { status, body: answer.body, headers };
  }

  function replaceAll(input, search, replacement) {
    const value = text(input);
    const match = text(search);
    const change = text(replacement);
    if (!match) return value;
    const start = value.indexOf(match);
    if (start < 0) return value;
    let count = 1;
    for (let position = value.indexOf(match, start + match.length); position >= 0; position = value.indexOf(match, position + match.length)) count++;
    if (value.length + (change.length - match.length) * count > maxText) throw Error('Replacement exceeds the text limit.');
    return value.replaceAll(match, () => change);
  }

  function join(items, separator) {
    const delimiter = text(separator);
    let size = Math.max(0, items.length - 1) * delimiter.length;
    return items.map((item) => {
      const value = shortText(item);
      size += value.length;
      if (size > maxText) throw Error('Joined text exceeds the text limit.');
      return value;
    }).join(delimiter);
  }

  function formatTemplate(template, values) {
    const source = text(template);
    let size = source.length;
    return source.replace(/{{\s*([\w.[\]-]+)\s*}}/g, (placeholder, key) => {
      const value = shortText(find(values, key).value);
      size += value.length - placeholder.length;
      if (size > maxText) throw Error('The filled template exceeds the text size limit.');
      return value;
    });
  }

  function state(context) {
    if (!guards.has(context.state)) guards.set(context.state, new Map());
    return guards.get(context.state);
  }

  function validateResult(value, type) {
    if (type === 'number') return number(value);
    if (type === 'boolean') return boolean(value);
    if (type === 'array') return list(value);
    if (type === 'string') return text(value);
    if (type === 'object') object(value);
    return value;
  }

  return { number, integer, boolean, range, list, object, entries, key, record, empty, require, text, shortText, maxText, maxItems,
    path: (input, route) => find(input, route).value, hasPath: (input, route) => find(input, route).found,
    element, form, control, checkable, formFields, focusable, visualProperties, styleProperty, safeStyleValue, visualStyle, projectStorage, animate,
    url, urlParts, queryRecord, queryParams, segments, matchCount, toBase64,
    date, dateParts, daysInMonth, addDate, isoWeek, buildDate, durationParts, writePath, chunks, groupByField, parseCsv, writeCsv, gcd, quantile, variance,
    fraction, readColor, colorHex, rgbToHsl, hslToRgb, mixColor, luminance, contrast, callBackend, replaceAll, join, formatTemplate, state, validateResult };
}

