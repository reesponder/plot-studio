import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { packPublicationPacket, PUBLICATION_DOCUMENT_MAX_BYTES, PUBLICATION_METADATA_MAX_BYTES } from './publication-packet.mjs';

const require = createRequire(new URL('./publish-toolchain/package.json', import.meta.url));
const generatedScript = /<script src="data:text\/javascript;base64,([A-Za-z0-9+/]+={0,2})"><\/script>/;
const compressDocument = promisify(gzip);
const mib = 1024 * 1024;
let toolchain;
let active = 0;

const scriptOptions = {
  compress: { defaults: false, dead_code: true, join_vars: true, conditionals: true, sequences: true },
  mangle: true,
  keep_fnames: true,
  keep_classnames: true,
  sourceMap: false,
  format: { ascii_only: true, comments: false, inline_script: true },
};

function rejected(status, message) {
  return Object.assign(new Error(message), { status, code: 'PUBLISHED_ASSET_BUILD' });
}

export function ensurePublishedToolchain() {
  if (toolchain) return toolchain;
  try {
    toolchain = {
      CleanCSS: require('clean-css'),
      minifyMarkup: require('html-minifier-terser').minify,
      minifyScript: require('terser').minify,
    };
    return toolchain;
  } catch {
    throw rejected(503, 'The public site build tools are temporarily unavailable.');
  }
}

function boundedCache(byteLimit, entryLimit) {
  const entries = new Map();
  let bytes = 0;
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      const size = Buffer.byteLength(value);
      if (size > byteLimit) return;
      const previous = entries.get(key);
      if (previous) {
        bytes -= previous.size;
        entries.delete(key);
      }
      while (entries.size >= entryLimit || bytes + size > byteLimit) {
        const oldest = entries.keys().next().value;
        bytes -= entries.get(oldest).size;
        entries.delete(oldest);
      }
      entries.set(key, { size, value });
      bytes += size;
    },
  };
}

const scripts = boundedCache(3 * mib, 24);
const styles = boundedCache(3 * mib, 24);
const pages = boundedCache(12 * mib, 96);
const pending = new Map();

async function bundleGeneratedScript(document, minifyScript) {
  const match = generatedScript.exec(document);
  if (!match) return document;
  const [, encoded] = match;
  const hash = createHash('sha256').update(encoded).digest('base64url');
  let compiled = scripts.get(hash);
  if (compiled === undefined) {
    const source = Buffer.from(encoded, 'base64').toString('utf8');
    const result = await minifyScript(source, scriptOptions);
    compiled = result.code;
    scripts.set(hash, compiled);
  }
  const tag = '<script src="data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled) + '"></script>';
  return document.slice(0, match.index) + tag + document.slice(match.index + match[0].length);
}

async function build(document) {
  if (typeof document !== 'string' || Buffer.byteLength(document) > PUBLICATION_DOCUMENT_MAX_BYTES) {
    throw rejected(422, 'This generated page is too large to publish. Split the content into smaller pages.');
  }
  const { CleanCSS, minifyMarkup, minifyScript } = ensurePublishedToolchain();
  try {
    const optimized = await minifyMarkup(document, {
      removeComments: true,
      ignoreCustomComments: [],
      minifyJS: async (source, inline) => (await minifyScript(source, {
        ...scriptOptions,
        parse: { bare_returns: Boolean(inline) },
      })).code,
      minifyCSS: (source, type) => {
        if (type) return source;
        const hash = createHash('sha256').update(source).digest('base64url');
        let optimized = styles.get(hash);
        if (optimized === undefined) {
          const { styles: result, errors, warnings } = new CleanCSS({ level: 1, inline: false, rebase: false }).minify(source);
          optimized = errors.length || warnings.length ? source : result;
          styles.set(hash, optimized);
        }
        return optimized;
      },
    });
    return await bundleGeneratedScript(optimized, minifyScript);
  } catch {
    throw rejected(422, 'A published asset could not be compiled. Check the project’s custom code.');
  }
}

export async function packPublishedDocument(document, { version, page, title = 'Page', slug = 'index' } = {}) {
  const key = version && page ? JSON.stringify([version, page]) : '';
  if (key) {
    const cached = pages.get(key);
    if (cached !== undefined) return cached;
    if (pending.has(key)) return pending.get(key);
  }
  if (active >= 4) throw rejected(503, 'The public site build tools are busy. Try again shortly.');
  active++;
  const task = build(document).then(async result => {
    const metadata = Buffer.from(JSON.stringify({ title, slug }), 'utf8');
    const content = Buffer.from(result, 'utf8');
    const header = Buffer.alloc(4);
    if (metadata.length > PUBLICATION_METADATA_MAX_BYTES || header.length + metadata.length + content.length > PUBLICATION_DOCUMENT_MAX_BYTES) {
      throw rejected(422, 'This generated page is too large to publish. Split the content into smaller pages.');
    }
    header.writeUInt32LE(metadata.length);
    const compressed = await compressDocument(Buffer.concat([header, metadata, content]));
    const packed = packPublicationPacket(compressed, randomBytes(4).readUInt32LE());
    if (key) pages.set(key, packed);
    return packed;
  });
  if (key) pending.set(key, task);
  try {
    return await task;
  } finally {
    active--;
    if (key) pending.delete(key);
  }
}
