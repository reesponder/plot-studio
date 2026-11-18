import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = new URL('https://cheapwork.stream/stock-of-freedom/');
const sourceCatalog = new URL('catalog.json', source);
const bundledCatalog = new URL('./stock-catalog.json', import.meta.url);
const shaPattern = /^[a-f0-9]{64}$/;
const imagePath = /^photos\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:png|jpe?g|webp)$/i;
const previewPath = /^previews\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.webp$/i;
const refreshInterval = 60 * 60 * 1000;
const pageSize = 36;
const issue = (status, message) => Object.assign(new Error(message), { status });

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase();
}

function orientation(width, height) {
  if (width >= height * 2.4) return 'panorama';
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

function validateCatalog(content) {
  const index = new Map();
  for (const photo of content.photos || []) {
    const { id, file, title, category, description, width, height, sha256 } = photo;
    if (!Number.isSafeInteger(id) || id < 1 || index.has(id) || !imagePath.test(file) ||
        !shaPattern.test(sha256) || typeof title !== 'string' || !title ||
        typeof category !== 'string' || !category || typeof description !== 'string' ||
        !Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
      continue;
    }
    const location = typeof photo.location === 'string' ? photo.location : '';
    const url = new URL(file, source).href;
    const thumbnail = previewPath.test(photo.thumbnail) ? new URL(photo.thumbnail, source).href : url;
    index.set(id, { id, name: title, category, description, location, width, height, url, thumbnail,
      revision: sha256, shape: orientation(width, height), file,
      searchTitle: normalize(title), searchCategory: normalize(category),
      search: normalize([title, description, category, location, file].join(' ')),
    });
  }
  if (!index.size) throw new Error('Stock catalog is empty.');
  return index;
}

async function download(url, limit, timeout, accept) {
  const response = await fetch(url, {
    headers: { Accept: accept }, redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Stock source returned an invalid response.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Stock source exceeds its size limit.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createStockCatalog() {
  let index;
  let refresh;
  let expires = 0;

  async function catalog() {
    if (!refresh && Date.now() >= expires) {
      refresh = (async () => {
        try {
          const contents = await download(sourceCatalog, 2 * 1024 * 1024, 5000, 'application/json');
          index = validateCatalog(JSON.parse(contents));
          expires = Date.now() + refreshInterval;
        } catch {
          index ||= validateCatalog(JSON.parse(await readFile(bundledCatalog, 'utf8')));
          expires = Date.now() + 5 * 60 * 1000;
        }
        return index;
      })().finally(() => { refresh = null; });
    }
    return index || await refresh;
  }

  return {
    async search(query) {
      const all = [...(await catalog()).values()];
      const categories = [...new Set(all.map(photo => photo.category))].sort((a, b) => a.localeCompare(b));
      const q = normalize(query.get('q')).trim().slice(0, 160);
      const terms = q.split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
      const shape = query.get('shape');
      const category = query.get('category');
      const offset = Math.max(0, Math.min(all.length, Number.parseInt(query.get('offset'), 10) || 0));
      const matches = all.filter(photo => (!category || photo.category === category) &&
        (!shape || photo.shape === shape) && terms.every(term => photo.search.includes(term)));
      if (terms.length) {
        const score = photo => 10 * Number(photo.searchTitle.includes(q)) +
          terms.reduce((total, term) => total + (photo.searchTitle.includes(term) ? 4 : photo.searchCategory.includes(term) ? 2 : 1), 0);
        matches.sort((a, b) => score(b) - score(a) || a.id - b.id);
      }
      const assets = matches.slice(offset, offset + pageSize)
        .map(({ search, searchTitle, searchCategory, file, ...photo }) => ({ ...photo, stock: true }));
      return { assets, categories, total: matches.length, nextCursor: offset + pageSize < matches.length ? offset + pageSize : null };
    },

    async find(id, revision) {
      const photo = (await catalog()).get(Number(id));
      if (!photo) throw issue(404, 'This image is unavailable in The Stock of Freedom.');
      if (revision !== photo.revision) throw issue(409, 'This stock image has changed. Refresh the stock results and try again.');
      return photo;
    },

    async read(photo, limit) {
      try {
        const bytes = await download(photo.url, limit, 12000, 'image/jpeg,image/png,image/webp');
        if (createHash('sha256').update(bytes).digest('hex') !== photo.revision) throw new Error('Source revision mismatch.');
        return bytes;
      } catch {
        throw issue(502, 'The stock image could not be verified. Try again after the source is available.');
      }
    },
  };
}
