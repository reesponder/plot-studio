import {
  DATA_OPERATIONS, DATA_TYPES, createDataField, createDataTable, executeDataQuery, formatDataValue,
  parseDataValue, validateData,
} from './data.mjs';

const typeNames = {
  text: 'Text', longText: 'Long text', number: 'Decimal', integer: 'Integer', boolean: 'Boolean',
  date: 'Date', datetime: 'Date & time', email: 'Email', url: 'URL', json: 'JSON',
};
const operationNames = {
  list: ['List records', 'Read a set of records, optionally with filters.'],
  read: ['Read one record', 'Read a record by its ID.'],
  create: ['Create records', 'Add a new record.'],
  update: ['Update records', 'Change fields on an existing record.'],
  delete: ['Delete records', 'Remove an existing record.'],
};
const icons = {
  table: '<path d="M3 7h18M3 12h18M3 17h18M9 7v13"/><rect x="3" y="4" width="18" height="16" rx="1"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  copy: '<path d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><rect x="8" y="8" width="12" height="12" rx="2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
};
const pageSize = 50;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function icon(name) {
  return `<svg class="data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function action(text, command, { value, tone, glyph, label, disabled } = {}) {
  return `<button type="button" class="data-action${tone ? ` data-action-${tone}` : ''}" data-data-command="${command}"${value === undefined ? '' : ` data-value="${esc(value)}"`}${label ? ` aria-label="${esc(label)}"` : ''}${disabled ? ' disabled' : ''}>${glyph ? icon(glyph) : ''}${esc(text)}</button>`;
}

function fieldKey(field) {
  return `<span class="data-field-key-row"><code class="data-field-key" title="${esc(field.id)}">${esc(field.id)}</code>
    ${action('Copy ID', 'copy-field-id', { value: field.id, glyph: 'copy', label: `Copy ID for ${field.name}`, tone: 'muted' })}</span>`;
}

function display(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function recordLabel(table, row) {
  const named = table.fields.find(field => field.type === 'text' || field.type === 'longText');
  const value = named && display(row[named.id]).trim();
  return value ? value.slice(0, 60) : row.id;
}

function controlFor(field, value, name = field.id, { required = field.required } = {}) {
  const attrs = `name="${esc(name)}"${required ? ' required' : ''}`;
  const kind = field.type;
  const current = formatDataValue(value, field);
  if (kind === 'longText' || kind === 'json') {
    const placeholder = kind === 'json' ? ' placeholder="Enter valid JSON"' : '';
    return `<textarea ${attrs}${placeholder} rows="${kind === 'json' ? 4 : 3}">${esc(current)}</textarea>`;
  }
  if (kind === 'boolean') {
    return `<select ${attrs}><option value="">Empty</option><option value="true"${current === 'true' ? ' selected' : ''}>True</option>
      <option value="false"${current === 'false' ? ' selected' : ''}>False</option></select>`;
  }
  let inputType = 'text';
  if (kind === 'integer' || kind === 'number') inputType = 'number';
  if (kind === 'email' || kind === 'url' || kind === 'date') inputType = kind;
  if (kind === 'datetime') inputType = 'datetime-local';
  const formatted = kind === 'datetime' ? current.slice(0, 23).replace(/Z$/, '') : current;
  const step = kind === 'integer' ? ' step="1"' : kind === 'number' || kind === 'datetime' ? ' step="any"' : '';
  return `<input ${attrs} type="${inputType}"${step} value="${esc(formatted)}">`;
}

function parseControl(field, value) {
  if (value == null) return parseDataValue(field, null);
  const text = typeof value === 'string' ? value : display(value);
  return parseDataValue(field, text && field.type === 'datetime' && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text) ? text + 'Z' : text);
}

function csvCell(value) {
  const text = String(value ?? '');
  return !text || /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function csvRows(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  let lineHasData = false;

  function saveCell() {
    cells.push(cell);
    cell = '';
    closedQuote = false;
  }

  function saveRow() {
    if (lineHasData) {
      saveCell();
      rows.push(cells);
    }
    cells = [];
    lineHasData = false;
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character !== '"') cell += character;
      else if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = false;
        closedQuote = true;
      }
      continue;
    }
    if (character === ',') {
      lineHasData = true;
      saveCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      saveRow();
    } else if (character === '"') {
      if (cell || closedQuote) throw new Error(`Invalid quote on CSV row ${rows.length + 1}.`);
      lineHasData = true;
      quoted = true;
    } else if (closedQuote) {
      throw new Error(`Unexpected text after a quote on CSV row ${rows.length + 1}.`);
    } else {
      lineHasData = true;
      cell += character;
    }
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  if (cell || cells.length || closedQuote) saveRow();
  return rows;
}

function stableName(name) {
  return name.trim().toLocaleLowerCase('en');
}

function optionalText(value) {
  return value === null || value === undefined || value === '';
}

function dataError(error) {
  return error instanceof Error && error.message ? error.message : 'The change could not be saved.';
}

export function mountDataEditor(root, { getProject, onChange, onStatus }) {
  const document = root.ownerDocument;
  let tableId;
  let tab = 'records';
  let query = '';
  let searchField = '';
  let page = 0;
  let dialogAction;
  let dialogOrigin;
  let writing = false;
  let lastData;

  root.classList.add('data-editor');
  root.innerHTML = `<aside class="data-sidebar" aria-label="Database tables"></aside>
    <section class="data-main" aria-label="Data workspace"></section>
    <dialog class="data-dialog" aria-labelledby="data-dialog-title">
      <form>
        <div class="data-dialog-head"><h2 id="data-dialog-title"></h2></div>
        <div class="data-dialog-fields"></div>
        <div class="data-dialog-foot">
          <button type="button" class="data-action" data-data-command="cancel">Cancel</button>
          <button type="submit" class="data-action data-action-primary" data-data-submit>Save</button>
        </div>
      </form>
    </dialog>`;

  const sidebar = root.querySelector('.data-sidebar');
  const main = root.querySelector('.data-main');
  const dialog = root.querySelector('.data-dialog');
  const form = dialog.querySelector('form');
  const errorOutput = '<p class="data-dialog-error" role="alert" hidden></p>';

  function data() {
    return getProject().data ?? { tables: [] };
  }

  function selected(tables = data().tables) {
    return tables.find(table => table.id === tableId);
  }

  function transact(transform, resultMessage) {
    writing = true;
    try {
      onChange(project => {
        const draft = structuredClone(project.data ?? { tables: [] });
        transform(draft);
        const [firstIssue] = validateData(draft);
        if (firstIssue) throw new Error(firstIssue.message);
        project.data = draft;
      }, { source: 'data' });
    } finally {
      writing = false;
    }
    refresh(true);
    if (resultMessage) onStatus?.(resultMessage);
  }

  function targetTable(draft, id) {
    const table = draft.tables.find(table => table.id === id);
    if (!table) throw new Error('This table has been removed.');
    return table;
  }

  function activeRows(table) {
    const needle = query.trim().toLocaleLowerCase('en');
    if (!needle) return table.rows;
    return table.rows.filter(row => {
      const values = searchField ? [row[searchField]] : Object.values(row);
      return values.some(value => display(value).toLocaleLowerCase('en').includes(needle));
    });
  }

  function pageGrid(table) {
    const rows = activeRows(table);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(totalPages - 1, page);
    const start = page * pageSize;
    const items = rows.slice(start, start + pageSize);
    const status = rows.length && query.trim()
      ? `${rows.length} of ${table.rows.length} records`
      : `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    const columns = table.fields.map(field => `<th scope="col"><span>${esc(field.name)}</span>
      <span>${esc(typeNames[field.type])}${field.required ? ' · Required' : ''}</span></th>`).join('');
    const tableRows = items.map((row, index) => {
      const remaining = table.fields.map(field => {
        const value = row[field.id];
        const label = formatDataValue(value, field);
        return `<td>${optionalText(value) ? '<span class="data-missing">—</span>' : `<span class="data-cell${value === true ? ' data-true' : ''}" title="${esc(label)}">${esc(label)}</span>`}</td>`;
      }).join('');
      const record = recordLabel(table, row);
      return `<tr><td class="data-record-number" title="${esc(row.id)}">${start + index + 1}</td>${remaining}
        <td class="data-grid-actions">
          ${action('Edit', 'edit-record', { value: row.id, label: `Edit record ${record}` })}
          ${action('Delete', 'delete-record', { value: row.id, label: `Delete record ${record}`, tone: 'muted' })}
        </td></tr>`;
    }).join('');
    const empty = rows.length ? '' : `<div class="data-empty"><h2>${table.rows.length ? 'No matching records' : 'No records yet'}</h2>
      ${table.rows.length ? '<p>Try another search or field.</p>' : action('Add a record', 'new-record', { tone: 'primary', glyph: 'add' })}</div>`;
    return `<div class="data-grid-scroll" role="region" aria-label="Record columns" tabindex="0">
      <table class="data-grid"><thead><tr><th scope="col">Row</th>${columns}<th scope="col" class="data-grid-actions">Actions</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div>${empty}
      <div class="data-grid-foot"><span role="status">${status}</span>${totalPages > 1 ? `<div>
        ${action('Previous', 'page-prev', { disabled: page === 0 })}<span>${page + 1} / ${totalPages}</span>
        ${action('Next', 'page-next', { disabled: page >= totalPages - 1 })}</div>` : ''}</div>`;
  }

  function records(table) {
    const options = table.fields.map(field => `<option value="${esc(field.id)}"${field.id === searchField ? ' selected' : ''}>${esc(field.name)}</option>`).join('');
    return `<div class="data-toolbar">
      <div class="data-search-group"><input type="search" aria-label="Search records" placeholder="Search records" data-data-search value="${esc(query)}">
        <select aria-label="Search field" data-data-search-field><option value="">All fields</option><option value="id"${searchField === 'id' ? ' selected' : ''}>Record ID</option>${options}</select></div>
      <div class="data-actions">
        ${action('Import CSV', 'csv-import', { glyph: 'upload', disabled: !table.fields.length })}
        ${action('Export CSV', 'csv-export', { glyph: 'download', disabled: !table.fields.length })}
        ${action('Add record', 'new-record', { tone: 'primary', glyph: 'add' })}
        <input type="file" accept=".csv,text/csv,text/plain" data-data-import hidden>
      </div></div><div data-data-page>${pageGrid(table)}</div>`;
  }

  function fields(table) {
    const items = table.fields.map(field => `<tr>
      <td><strong>${esc(field.name)}</strong>${fieldKey(field)}</td>
      <td>${esc(typeNames[field.type])}${field.required ? ' · Required' : ''}</td>
      <td class="data-grid-actions">${action('Edit', 'edit-field', { value: field.id, label: `Edit field ${field.name}` })}
        ${action('Delete', 'delete-field', { value: field.id, label: `Delete field ${field.name}`, tone: 'muted' })}</td></tr>`).join('');
    return `<div class="data-toolbar"><span>Field IDs stay the same when you rename a field.</span>
      ${action('Add field', 'new-field', { tone: 'primary', glyph: 'add' })}</div>
      <div class="data-grid-scroll data-fields" role="region" aria-label="Table fields" tabindex="0"><table class="data-grid"><thead><tr>
        <th scope="col">Field</th><th scope="col">Type</th><th scope="col" class="data-grid-actions">Actions</th></tr></thead>
        <tbody><tr><td><strong>Record ID</strong><br><code class="data-field-key">id</code></td><td>System</td><td></td></tr>${items}</tbody></table></div>`;
  }

  function api(table) {
    const enabled = DATA_OPERATIONS.some(operation => table.permissions[operation]);
    const permissions = DATA_OPERATIONS.map(operation => {
      const [title, description] = operationNames[operation];
      return `<label class="data-permission"><span><span class="data-method">${esc(title)}</span>${esc(description)}</span>
        <input type="checkbox" data-data-permission="${operation}"${table.permissions[operation] ? ' checked' : ''}></label>`;
    }).join('');
    return `<section class="data-api"><div><h2>Public data access</h2>
      <p>These permissions apply to the published site. Anyone who can reach its API can use the operations you enable.</p></div>
      <div class="data-api-permissions">${permissions}</div>
      <p class="data-api-note">${enabled ? 'Some public operations are enabled in this draft.' : 'Public access is off for this table.'}
       Preview uses a temporary copy of the draft database. Preview changes do not affect live records.</p>
      <div><h2>Query endpoint</h2><p><code>POST /api/data/query</code></p>
      <p>Send the operation and the table ID <code>${esc(table.id)}</code> in the request body.</p></div></section>`;
  }

  function refresh(force = false) {
    if (writing && !force) return;
    const currentData = data();
    if (!force && lastData === currentData && root.contains(document.activeElement)) return;
    const oldId = tableId;
    const oldScroll = main.scrollTop;
    const table = selected(currentData.tables) ?? currentData.tables[0];
    tableId = table?.id;
    if (oldId !== tableId) {
      query = '';
      searchField = '';
      page = 0;
    }
    lastData = currentData;
    sidebar.innerHTML = `<div class="data-sidebar-head"><h2>Tables</h2>
      ${action('New table', 'new-table', { glyph: 'add' })}</div><ul class="data-side-tables">${currentData.tables.map(entry => (
        `<li><button type="button" class="data-side-table" data-data-command="switch-table" data-value="${esc(entry.id)}"${entry.id === tableId ? ' aria-current="true"' : ''} title="${esc(entry.name)}">${icon('table')}<span>${esc(entry.name)}</span><span aria-label="${entry.rows.length} records">${entry.rows.length}</span></button></li>`
      )).join('')}</ul>`;
    if (!table) {
      main.innerHTML = `<div class="data-empty"><h1>Site database</h1>
        <p>Create a table for the information your site needs to store. Add records here and use them in the Logic editor.</p>
        ${action('Create a table', 'new-table', { tone: 'primary', glyph: 'add' })}</div>`;
      return;
    }
    if (searchField && searchField !== 'id' && !table.fields.some(field => field.id === searchField)) searchField = '';
    const tabs = [['records', 'Records'], ['fields', 'Fields'], ['api', 'API access']];
    main.innerHTML = `<div class="data-main-head">
      <div class="data-title"><h1>${esc(table.name)}</h1><p>Draft database</p></div>
      <div class="data-actions">${action('Rename', 'rename-table')}${action('Delete table', 'delete-table', { tone: 'muted' })}</div>
      </div><div class="data-tabs" role="group" aria-label="Table view">${tabs.map(([key, label]) => (
        `<button type="button" data-data-command="tab" data-value="${key}" aria-pressed="${tab === key}">${label}</button>`
      )).join('')}</div><div class="data-body">${tab === 'records' ? records(table) : tab === 'fields' ? fields(table) : api(table)}</div>`;
    if (tableId === oldId) main.scrollTop = oldScroll;
  }

  function refreshGrid(table) {
    const grid = main.querySelector('[data-data-page]');
    if (grid && table) grid.innerHTML = pageGrid(table);
  }

  function showDialog(title, content, submit, submitAction, { danger = false } = {}) {
    dialogAction = submitAction;
    dialogOrigin = document.activeElement;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('.data-dialog-fields').innerHTML = content + errorOutput;
    const button = dialog.querySelector('[data-data-submit]');
    button.textContent = submit;
    button.className = `data-action data-action-${danger ? 'danger' : 'primary'}`;
    dialog.showModal();
    dialog.querySelector('.data-dialog-fields input, .data-dialog-fields select, .data-dialog-fields textarea')?.focus();
  }

  function tableDialog(table) {
    showDialog(table ? 'Rename table' : 'New table',
      `<label><span>Table name</span><input name="name" type="text" value="${esc(table?.name || '')}" placeholder="e.g. Products" required></label>`,
      table ? 'Save name' : 'Create table', values => {
        const name = String(values.get('name')).trim();
        if (!name) throw new Error('Enter a table name.');
        const created = table ? null : createDataTable(name);
        transact(draft => {
          if (table) targetTable(draft, table.id).name = name;
          else draft.tables.push(created);
        }, table ? 'Table renamed.' : 'Table created.');
        if (created) {
          tableId = created.id;
          tab = 'fields';
          query = '';
          searchField = '';
          page = 0;
          refresh(true);
        }
      });
  }

  function removeTable(table) {
    const detail = `<p>Delete <strong>${esc(table.name)}</strong> and its ${table.rows.length} draft record${table.rows.length === 1 ? '' : 's'}?</p>`;
    showDialog('Delete table', detail, 'Delete table', () => {
      transact(draft => {
        draft.tables = draft.tables.filter(entry => entry.id !== table.id);
      }, 'Table deleted.');
    }, { danger: true });
  }

  function fieldDialog(table, field) {
    const typeOptions = DATA_TYPES.map(type => `<option value="${type}"${type === (field?.type || 'text') ? ' selected' : ''}>${esc(typeNames[type])}</option>`).join('');
    const content = `<label><span>Field name</span><input name="name" type="text" value="${esc(field?.name || '')}" required></label>
      <label><span>Type</span><select name="type" data-data-field-type>${typeOptions}</select></label>
      <label class="data-check"><input name="required" type="checkbox"${field?.required ? ' checked' : ''}><span>Required</span></label>
      ${field ? `<div class="data-field-id"><span>Field ID</span>${fieldKey(field)}</div>` : ''}
      ${table.rows.length ? '<div data-data-fill></div>' : ''}`;
    showDialog(field ? 'Edit field' : 'New field', content, field ? 'Save field' : 'Create field', values => {
      const name = String(values.get('name')).trim();
      if (!name) throw new Error('Enter a field name.');
      const type = values.get('type');
      const required = values.has('required');
      const incoming = field ? { ...field, name, type, required } : createDataField(name, type, required);
      transact(draft => {
        const current = targetTable(draft, table.id);
        const index = field ? current.fields.findIndex(entry => entry.id === field.id) : -1;
        if (field && index < 0) throw new Error('This field has been removed.');
        if (field) current.fields[index] = incoming;
        else current.fields.push(incoming);
        for (const [rowIndex, row] of current.rows.entries()) {
          const prior = row[incoming.id];
          const supplied = values.get('fill');
          const candidate = optionalText(prior) && !optionalText(supplied) ? supplied : prior;
          try {
            if (field?.type === type && candidate === prior && !optionalText(prior)) continue;
            const parsed = parseControl(incoming, candidate);
            if (parsed === null || parsed === undefined) delete row[incoming.id];
            else row[incoming.id] = parsed;
          } catch (error) {
            throw new Error(`Record ${rowIndex + 1}: ${dataError(error)}`);
          }
        }
      }, field ? 'Field updated.' : 'Field created.');
    });
    updateFillInput();
  }

  function updateFillInput() {
    const recipient = dialog.querySelector('[data-data-fill]');
    if (!recipient) return;
    const field = { type: form.elements.type.value, required: false };
    recipient.innerHTML = `<label><span>Fill missing values in existing records${field.type === 'datetime' ? ' (UTC)' : ''}</span>${controlFor(field, '', 'fill')}</label>
      <small>Optional unless the field is required and a record is missing a value.</small>`;
  }

  function removeField(table, field) {
    const content = `<p>Remove <strong>${esc(field.name)}</strong> and its values from the draft table?</p>`;
    showDialog('Delete field', content, 'Delete field', () => {
      transact(draft => {
        const current = targetTable(draft, table.id);
        current.fields = current.fields.filter(entry => entry.id !== field.id);
        current.rows.forEach(row => { delete row[field.id]; });
      }, 'Field deleted.');
    }, { danger: true });
  }

  function recordDialog(table, row) {
    const title = row ? 'Edit record' : 'New record';
    const fields = table.fields.map(field => (
      `<label><span>${esc(field.name)}${field.required ? ' *' : ''}${field.type === 'datetime' ? ' (UTC)' : ''}</span>
      ${controlFor(field, row?.[field.id], `field-${field.id}`)}</label>`
    )).join('');
    const note = row ? `<p>Record ID <code>${esc(row.id)}</code></p>` : '';
    showDialog(title, note + (fields || '<p>This table has no custom fields. A new record will contain its system ID.</p>'),
      row ? 'Save record' : 'Create record', values => {
        transact(draft => {
          const current = targetTable(draft, table.id);
          const change = Object.fromEntries(current.fields.map(field => [field.id, parseControl(field, values.get(`field-${field.id}`)) ?? null]));
          executeDataQuery(draft, { operation: row ? 'update' : 'create', table: table.id, id: row?.id, data: change }, { enforcePermissions: false });
        }, row ? 'Record updated.' : 'Record created.');
      });
  }

  function removeRecord(table, row) {
    showDialog('Delete record', `<p>Delete <strong>${esc(recordLabel(table, row))}</strong> from the draft database?</p>`,
      'Delete record', () => {
        transact(draft => {
          executeDataQuery(draft, { operation: 'delete', table: table.id, id: row.id }, { enforcePermissions: false });
        }, 'Record deleted.');
      }, { danger: true });
  }

  function exportCsv(table) {
    const names = table.fields.map(field => csvCell(
      table.fields.filter(item => stableName(item.name) === stableName(field.name)).length === 1 ? field.name : field.id,
    )).join(',');
    const lines = table.rows.map(row => table.fields.map(field => csvCell(formatDataValue(row[field.id], field))).join(','));
    const blob = new Blob([[names, ...lines].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = (table.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'records') + '.csv';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importCsv(file, tableIdAtStart, projectAtStart) {
    try {
      const [headers, ...rows] = csvRows(await file.text());
      if (!headers?.length || !rows.length) throw new Error('CSV requires a header and at least one record.');
      if (getProject() !== projectAtStart) throw new Error('The project changed while the file was opening.');
      const table = targetTable(data(), tableIdAtStart);
      const relatedFields = headers.map(header => {
        const key = stableName(header);
        const exact = table.fields.find(field => field.id === header.trim());
        const matchingNames = table.fields.filter(field => stableName(field.name) === key);
        if (!exact && matchingNames.length > 1) throw new Error(`CSV header "${header}" is shared by multiple fields. Use a field ID in that column.`);
        return exact ?? matchingNames[0];
      });
      const unmatched = headers.find((_, index) => !relatedFields[index]);
      if (unmatched !== undefined) throw new Error(`CSV column "${unmatched}" does not match a field in the table.`);
      if (new Set(relatedFields).size !== relatedFields.length) throw new Error('Two CSV columns refer to the same field.');
      const missing = table.fields.find(field => field.required && !relatedFields.includes(field));
      if (missing) throw new Error(`The CSV is missing required field "${missing.name}".`);
      transact(draft => {
        rows.forEach((row, index) => {
          if (row.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
          try {
            const values = Object.fromEntries(relatedFields.map((field, slot) => [field.id, parseControl(field, row[slot]) ?? null]));
            executeDataQuery(draft, { operation: 'create', table: tableIdAtStart, data: values }, { enforcePermissions: false });
          } catch (error) {
            throw new Error(`CSV row ${index + 2}: ${dataError(error)}`);
          }
        });
      }, 'CSV imported.');
    } catch (error) {
      const text = dataError(error);
      if (dialog.open) onStatus?.(text);
      else showDialog('Could not import CSV', `<p>${esc(text)}</p>`, 'Close', () => {});
    }
  }

  async function copyFieldId(button, id) {
    try {
      await document.defaultView.navigator.clipboard.writeText(id);
      onStatus?.('Field ID copied.');
    } catch {
      const code = button.previousElementSibling;
      const selection = document.getSelection();
      if (!code || !selection) return onStatus?.('Could not access the clipboard.');
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
      onStatus?.('Field ID selected. Use your copy shortcut.');
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      dialogAction?.(new FormData(form));
      dialog.close();
    } catch (error) {
      const output = dialog.querySelector('.data-dialog-error');
      output.textContent = dataError(error);
      output.hidden = false;
    }
  });

  dialog.addEventListener('close', () => {
    if (dialogOrigin?.isConnected) dialogOrigin.focus();
    else main.querySelector('[data-data-command="tab"][aria-pressed="true"]')?.focus();
  });

  root.addEventListener('input', event => {
    if (!event.target.matches('[data-data-search]')) return;
    query = event.target.value;
    page = 0;
    refreshGrid(selected());
  });

  root.addEventListener('change', ({ target }) => {
    if (target.matches('[data-data-search-field]')) {
      searchField = target.value;
      page = 0;
      refreshGrid(selected());
    } else if (target.matches('[data-data-field-type]')) {
      updateFillInput();
    } else if (target.matches('[data-data-import]') && target.files.length) {
      importCsv(target.files[0], tableId, getProject());
      target.value = '';
    } else if (target.dataset.dataPermission) {
      const permission = target.dataset.dataPermission;
      const checked = target.checked;
      try {
        transact(draft => {
          targetTable(draft, tableId).permissions[permission] = checked;
        }, 'Draft permissions updated.');
        main.querySelector(`[data-data-permission="${permission}"]`)?.focus();
      } catch (error) {
        target.checked = !checked;
        onStatus?.(dataError(error));
      }
    }
  });

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-data-command]');
    if (!button) return;
    const { dataCommand, value } = button.dataset;
    const table = selected();
    const record = table?.rows.find(row => row.id === value);
    const field = table?.fields.find(item => item.id === value);
    switch (dataCommand) {
      case 'cancel': dialog.close(); break;
      case 'new-table': tableDialog(); break;
      case 'rename-table': tableDialog(table); break;
      case 'delete-table': if (table) removeTable(table); break;
      case 'switch-table':
        tableId = value;
        query = '';
        searchField = '';
        page = 0;
        refresh(true);
        sidebar.querySelector('[aria-current="true"]')?.focus();
        break;
      case 'tab':
        tab = value;
        refresh(true);
        main.querySelector('[aria-pressed="true"]')?.focus();
        break;
      case 'new-field': if (table) fieldDialog(table); break;
      case 'edit-field': if (field) fieldDialog(table, field); break;
      case 'delete-field': if (field) removeField(table, field); break;
      case 'copy-field-id': copyFieldId(button, value); break;
      case 'new-record': if (table) recordDialog(table); break;
      case 'edit-record': if (record) recordDialog(table, record); break;
      case 'delete-record': if (record) removeRecord(table, record); break;
      case 'csv-import': main.querySelector('[data-data-import]')?.click(); break;
      case 'csv-export': if (table) exportCsv(table); break;
      case 'page-prev': page = Math.max(0, page - 1); refreshGrid(table); break;
      case 'page-next': page++; refreshGrid(table); break;
    }
  });

  refresh(true);
  return { refresh };
}
