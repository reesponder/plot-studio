export const DATA_OPERATIONS = Object.freeze(['list', 'read', 'create', 'update', 'delete'])
export const DATA_TYPES = Object.freeze(['text', 'longText', 'number', 'integer', 'boolean', 'date', 'datetime', 'email', 'url', 'json'])

const textTypes = new Set(['text', 'longText', 'email', 'url'])
const orderedTypes = new Set(['number', 'integer', 'date', 'datetime'])
const filterOperators = new Set(['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty'])
const reservedIds = new Set(['id', '__proto__', 'constructor', 'prototype'])
const idPattern = /^[a-zA-Z0-9][\w.:-]{0,127}$/
const has = (object, key) => Object.hasOwn(object, key)
const list = value => Array.isArray(value) ? value : []
const record = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const validId = value => typeof value === 'string' && idPattern.test(value) && !reservedIds.has(value)
const validName = value => typeof value === 'string' && value.trim().length > 0 && !/[\uD800-\uDFFF]/u.test(value)

export class DataError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'DataError'
    this.code = code
    this.status = status
  }
}

let idCounter = 0
function createDataId(prefix) {
  idCounter += 1
  const value = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + idCounter.toString(36)
  return prefix + '-' + value
}

function normalizePermissions(permissions) {
  return Object.fromEntries(DATA_OPERATIONS.map(operation => [operation, record(permissions) && permissions[operation] === true]))
}

export function createDataField(name = 'New field', type = 'text', required = false) {
  return { id: createDataId('field'), name, type: DATA_TYPES.includes(type) ? type : 'text', required: required === true }
}

export function createDataTable(name = 'New table') {
  return { id: createDataId('table'), name, fields: [], rows: [], permissions: normalizePermissions() }
}

export function normalizeData(data) {
  const tables = list(data?.tables).map(table => {
    const source = record(table) ? table : {}
    const fields = list(source.fields).map(field => {
      const item = record(field) ? field : {}
      return { id: item.id, name: item.name, type: item.type, required: item.required === true }
    })
    return {
      id: source.id, name: source.name, fields,
      rows: list(source.rows).map(row => record(row) ? { ...row } : row),
      permissions: normalizePermissions(source.permissions),
    }
  })
  return { tables }
}

const invalidValue = (field, detail) => new DataError('INVALID_VALUE', (field.name || 'Value') + ' ' + detail)
const invalidQuery = message => new DataError('INVALID_QUERY', message)

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function canonicalDateTime(value) {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value) ||
    !validDate(value.slice(0, 10))) return null
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + 'Z')
  if (!Number.isFinite(date.getTime())) return null
  const timestamp = date.toISOString()
  return validDate(timestamp.slice(0, 10)) ? timestamp : null
}

function checkJson(value, depth = 0) {
  if (depth > 64) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'string') return !/[\uD800-\uDFFF]/u.test(value)
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return Array.from(value).every(item => checkJson(item, depth + 1))
  if (record(value)) return Object.entries(value).every(([key,item]) => checkJson(key) && checkJson(item, depth + 1))
  return false
}

function fieldValue(field, value) {
  const { type, required } = field
  if (value === undefined || value === null) {
    if (required) throw invalidValue(field, 'is required.')
    return null
  }
  if (textTypes.has(type)) {
    if (typeof value !== 'string' || /[\uD800-\uDFFF]/u.test(value)) throw invalidValue(field, 'must be text.')
    if (required && !value.trim()) throw invalidValue(field, 'is required.')
    if (type === 'email' && value && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value)) throw invalidValue(field, 'must be an email address.')
    if (type === 'url' && value) {
      let url
      if (/^https?:\/\/[^/\s\\]+/i.test(value) && !/[\s\\\u0000-\u001f\u007f]/u.test(value)) {
        try { url = new URL(value) } catch { /* Invalid URLs are reported below. */ }
      }
      if (!url?.hostname) throw invalidValue(field, 'must be an HTTP or HTTPS URL.')
    }
    return value
  }
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value
  if (type === 'integer' && Number.isSafeInteger(value)) return value === 0 ? 0 : value
  if (type === 'boolean' && typeof value === 'boolean') return value
  if (type === 'date' && validDate(value)) return value
  if (type === 'datetime') {
    const datetime = canonicalDateTime(value)
    if (datetime) return datetime
  }
  if (type === 'json' && checkJson(value)) return structuredClone(value)
  const detail = {
    number: 'must be a finite number.',
    integer: 'must be a safe whole number.',
    boolean: 'must be true or false.',
    date: 'must be a valid date (YYYY-MM-DD).',
    datetime: 'must be a valid ISO date and time.',
    json: 'must contain valid JSON.',
  }
  throw invalidValue(field, detail[type] || 'has an unsupported field type.')
}

function asField(fieldOrType) {
  return typeof fieldOrType === 'string' ? { type: fieldOrType } : fieldOrType ?? { type: 'text' }
}

export function parseDataValue(fieldOrType, input) {
  const field = asField(fieldOrType)
  if (typeof input !== 'string') return fieldValue(field, input)
  const trimmed = input.trim()
  if (!trimmed && (!textTypes.has(field.type) || field.type === 'email' || field.type === 'url')) return fieldValue(field, null)
  if (field.type === 'json') {
    let decoded
    try { decoded = JSON.parse(trimmed) } catch { throw invalidValue(field, 'must contain valid JSON.') }
    return fieldValue(field, decoded)
  }
  if (field.type === 'boolean') {
    const text = trimmed.toLowerCase()
    if (['true','yes','1'].includes(text)) return true
    if (['false','no','0'].includes(text)) return false
  }
  if (['number','integer'].includes(field.type) && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return fieldValue(field, Number(trimmed))
  }
  const value = ['email','url','date','datetime'].includes(field.type) ? trimmed : input
  return fieldValue(field, value)
}

export function formatDataValue(value, fieldOrType) {
  if (value === undefined || value === null) return ''
  if (asField(fieldOrType).type === 'json') return JSON.stringify(value)
  return String(value)
}

function rowFromInput(table, id, input, previous) {
  if (!record(input)) throw invalidQuery('Provide a data object with field IDs as keys.')
  const known = new Map(table.fields.map(field => [field.id, field]))
  for (const fieldId of Object.keys(input)) {
    if (!known.has(fieldId)) throw new DataError('UNKNOWN_FIELD', 'Unknown field ID: ' + fieldId + '.')
  }
  const entries = table.fields.map(field => {
    const value = has(input,field.id) ? input[field.id] : property(previous,field.id)
    return [field.id,fieldValue(field,value)]
  })
  return Object.fromEntries([['id',id], ...entries])
}

const property = (row, key) => row && has(row,key) ? row[key] : undefined
const rowValue = (row, field) => fieldValue({ ...field, required:false }, property(row,field.id))

function presentRow(table, row) {
  return Object.fromEntries([['id',row.id], ...table.fields.map(field => [field.id, rowValue(row,field)])])
}

function validateSchema(table) {
  if (!validId(table.id) || !validName(table.name) || !Array.isArray(table.fields) || !Array.isArray(table.rows)) {
    throw new DataError('INVALID_SCHEMA', 'The table has an invalid ID, name, or structure.')
  }
  const seen = new Set()
  for (const field of table.fields) {
    if (!record(field) || !validId(field.id) || seen.has(field.id) || !validName(field.name) || !DATA_TYPES.includes(field.type) ||
      (field.required !== undefined && typeof field.required !== 'boolean')) {
      const error = new DataError('INVALID_SCHEMA', 'The table has a field with an invalid or duplicate ID, name, or type.')
      error.fieldId = field?.id
      throw error
    }
    seen.add(field.id)
  }
}

export function validateData(data) {
  if (data == null) return []
  if (!record(data) || !Array.isArray(data.tables)) return [{code:'INVALID_SCHEMA',message:'Database tables must be a list.'}]
  const issues = []
  const ids = new Set()
  for (const table of data.tables) {
    try {
      if (!record(table)) throw new DataError('INVALID_SCHEMA', 'Each table must be an object.')
      validateSchema(table)
      if (ids.has(table.id)) throw new DataError('INVALID_SCHEMA','Table IDs must be unique.')
      ids.add(table.id)
    } catch (error) {
      issues.push({ code:error.code,message:error.message,tableId:table?.id,fieldId:error.fieldId })
      continue
    }
    const rowIds = new Set()
    for (const row of table.rows) {
      try {
        if (!record(row) || !validId(row.id) || rowIds.has(row.id)) throw new DataError('INVALID_ROW','Each row must have a valid, unique ID.')
        rowIds.add(row.id)
        const { id, ...input } = row
        rowFromInput(table,id,input)
      } catch (error) {
        issues.push({ code:error.code,message:error.message,tableId:table.id,rowId:row?.id })
      }
    }
  }
  return issues
}

function jsonEqual(first, second) {
  if (first === second) return true
  if (Array.isArray(first)) {
    return Array.isArray(second) && first.length === second.length && first.every((item,index) => jsonEqual(item,second[index]))
  }
  if (!record(first) || !record(second)) return false
  const keys = Object.keys(first)
  return keys.length === Object.keys(second).length && keys.every(key => has(second,key) && jsonEqual(first[key],second[key]))
}

function compileFilters(table, filters) {
  if (filters === undefined || filters === null) return []
  const entries = Array.isArray(filters) ? filters : [filters]
  if (entries.length > 16) throw invalidQuery('Use no more than 16 filters per query.')
  return entries.map(filter => {
    if (!record(filter) || !filterOperators.has(filter.operator)) throw invalidQuery('Each filter needs a supported operator.')
    const field = filter.field === 'id' ? { id:'id', name:'ID', type:'text' } : table.fields.find(item => item.id === filter.field)
    if (!field) throw new DataError('UNKNOWN_FIELD', 'Unknown filter field ID.')
    const { operator } = filter
    if (operator === 'empty') return row => {
      const value = rowValue(row,field)
      return value === null || value === ''
    }
    if (!has(filter,'value')) throw invalidQuery('This filter requires a value.')
    if (operator === 'contains') {
      if (!textTypes.has(field.type) || typeof filter.value !== 'string' || /[\uD800-\uDFFF]/u.test(filter.value)) {
        throw invalidQuery('Contains requires a text field and a text value.')
      }
      return row => typeof property(row,field.id) === 'string' && property(row,field.id).includes(filter.value)
    }
    const value = fieldValue({ ...field, required:false }, filter.value)
    if (operator === 'eq') return row => jsonEqual(rowValue(row,field), value)
    if (operator === 'ne') return row => !jsonEqual(rowValue(row,field), value)
    if (!orderedTypes.has(field.type) || value === null) throw invalidQuery('Ordering filters require a number, date, or date and time.')
    const compare = { gt:(a,b) => a>b, gte:(a,b) => a>=b, lt:(a,b) => a<b, lte:(a,b) => a<=b }
    return row => {
      const stored = rowValue(row,field)
      return stored !== null && compare[operator](stored, value)
    }
  })
}

function queryLimit(value, fallback, maximum) {
  if (value === undefined || value === null) return fallback
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw invalidQuery('The pagination value is out of range.')
  return value
}

export function executeDataQuery(data, query, { enforcePermissions = true } = {}) {
  if (!record(query) || !DATA_OPERATIONS.includes(query.operation)) throw invalidQuery('Choose a supported data operation.')
  const table = list(data?.tables).find(item => item?.id === query.table)
  if (!table) throw new DataError('TABLE_NOT_FOUND','The table was not found.',404)
  const { operation } = query
  if (enforcePermissions && table.permissions?.[operation] !== true) throw new DataError('FORBIDDEN','This operation is disabled for this table.',403)
  validateSchema(table)
  if (operation === 'list') {
    const limit = queryLimit(query.limit,100,500)
    const offset = queryLimit(query.offset,0,Number.MAX_SAFE_INTEGER)
    const matches = compileFilters(table,query.filter)
    return table.rows.filter(row => matches.every(predicate => predicate(row))).slice(offset,offset+limit).map(row => presentRow(table,row))
  }
  if (operation === 'create') {
    const row = rowFromInput(table,createDataId('row'),query.data ?? {})
    table.rows.push(row)
    return presentRow(table,row)
  }
  if (!validId(query.id)) throw invalidQuery('Provide a valid row ID.')
  const index = table.rows.findIndex(row => row.id === query.id)
  if (index === -1) throw new DataError('NOT_FOUND','The row was not found.',404)
  const previous = table.rows[index]
  const disclose = !enforcePermissions || table.permissions?.read === true || table.permissions?.list === true
  if (operation === 'update') {
    const input = query.data ?? {}
    const row = rowFromInput(table,previous.id,input,previous)
    table.rows[index] = row
    return disclose ? presentRow(table,row) : Object.fromEntries([['id',row.id], ...Object.keys(input).map(key => [key,structuredClone(row[key])])])
  }
  if (operation === 'delete') {
    table.rows.splice(index,1)
    if (!disclose) return { id:previous.id }
  }
  return presentRow(table,previous)
}

function physicalName(prefix, id) {
  if (/^[a-z0-9-]+$/.test(id)) return prefix + '_' + id
  const encoded = Array.from(id, character => character.charCodeAt(0).toString(16).padStart(2,'0')).join('')
  return prefix + '_encoded_' + encoded
}

const sqlIdentifier = name => '"' + name.replaceAll('"','""') + '"'
const sqlType = type => type === 'number' ? 'REAL' : ['integer','boolean'].includes(type) ? 'INTEGER' : 'TEXT'

export function describeData(data, { includeRows = false } = {}) {
  const normalized = normalizeData(data)
  const errors = validateData(includeRows ? normalized : { tables:normalized.tables.map(table => ({ ...table, rows:[] })) })
  if (errors.length) throw new DataError(errors[0].code, errors[0].message)
  return {
    version: 1,
    tables: normalized.tables.map(table => ({
      id: table.id, name: table.name, permissions:table.permissions, fields:table.fields,
      ...(includeRows ? { rows: table.rows.map(({id,...value}) => rowFromInput(table,id,value)) } : {}),
    })),
  }
}

export function dataSchemaSQL(data) {
  const schema = describeData(data)
  const lines = ['-- SQLite tables generated by Plot Studio.','BEGIN;']
  for (const table of schema.tables) {
    const name = sqlIdentifier(physicalName('table',table.id))
    lines.push('-- ' + table.name.replace(/[\r\n]+/g,' '), 'CREATE TABLE IF NOT EXISTS ' + name + ' (')
    const fields = [
      '  "_position" INTEGER PRIMARY KEY AUTOINCREMENT',
      '  "id" TEXT NOT NULL UNIQUE',
      ...table.fields.map(field => {
        const column = sqlIdentifier(physicalName('field',field.id))
        return '  ' + column + ' ' + sqlType(field.type) + (field.required ? ' NOT NULL' : '') +
          (field.type === 'boolean' ? ' CHECK (' + column + ' IN (0,1))' : '')
      }),
    ]
    lines.push(fields.join(',\n'), ');')
  }
  return lines.join('\n') + '\nCOMMIT;\n'
}

export function dataClientScript() {
  return [
    '/* Plot Studio data API. Calls run on the runtime accompanying this export. */',
    '(function () {',
    '  "use strict";',
    '  async function query(request, options = {}) {',
    '    let response;',
    '    try {',
    '      response = await fetch(new URL("./api/data/query", location.href), {',
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    '        signal: options.signal,',
    '        body: JSON.stringify(request)',
    '      });',
    '    } catch (cause) {',
    '      if (cause?.name === "AbortError") throw cause;',
    '      const error = new Error("Could not reach the site database. Start the included runtime.py.", { cause });',
    '      error.code = "NETWORK_ERROR";',
    '      throw error;',
    '    }',
    '    const payload = await response.json().catch(() => ({}));',
    '    if (!response.ok || !Object.hasOwn(payload, "result")) {',
    '      const error = new Error(payload.error?.message || "The site database returned an invalid response.");',
    '      error.code = payload.error?.code || "RUNTIME_ERROR";',
    '      error.status = response.status;',
    '      throw error;',
    '    }',
    '    return payload.result;',
    '  }',
    '  globalThis.plotData = Object.freeze({ query });',
    '})();',
    '',
  ].join('\n')
}

export function buildDataExport(data, runtimeSource, options = {}) {
  if (typeof runtimeSource !== 'string' || !runtimeSource.trim()) throw new DataError('INVALID_RUNTIME','The database runtime source is missing.')
  return {
    'runtime.py':runtimeSource,
    'database/schema.json':JSON.stringify(describeData(data, options),null,2) + '\n',
    'database/schema.sql':dataSchemaSQL(data),
    'public/plot-data.js':dataClientScript(),
    'DATABASE.md': [
      '# Run this export with its database',
      '',
      'Run this command from the extracted folder using Python 3.9 or newer.',
      '',
      '    python runtime.py --port 8080',
      '',
      'Open http://127.0.0.1:8080. The runtime creates database/site.sqlite3 on first launch.',
      'Keep this SQLite file between restarts. An optional PLOT_DATA_DB environment variable',
      'can point to a persistent file outside the extracted folder.',
      '',
      'The runtime serves only the public/ folder and the data API. Keep database/ away',
      'from your public web root. The standalone SQLite runtime binds to localhost by default.',
      'For public deployment, run runtime.application in a WSGI host.',
      '',
      'Data operations enabled in the studio can be called by anyone who can reach the site.',
      'The database/schema.json file declares those permissions. All are disabled by default.',
      options.includeRows ? 'The schema includes seed rows, which are imported into an empty database on the first run.' :
        'This archive contains the schema. It starts with an empty database.',
      '',
      'Keep a backup before changing table or field definitions for an existing database.',
      'The runtime rejects incompatible schema changes and leaves the existing database intact.',
      '',
    ].join('\n'),
  }
}

