import {
  PUBLICATION_DOCUMENT_MAX_BYTES, PUBLICATION_PACKET_MAX_BYTES, PUBLICATION_PACKET_MIME,
  readPublicationDocument, unpackPublicationPacket,
} from './publication-packet.mjs';

const app = document.querySelector('#hosted-app');
let frame = app.querySelector('iframe');
const status = document.querySelector('#hosted-status');
const base = app.dataset.base;
const credentials = app.dataset.public === 'true' ? 'omit' : 'same-origin';
let selected = app.dataset.page;
let fragment = location.hash.slice(1);
let loading;

async function readPage(response) {
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!response.ok || type !== PUBLICATION_PACKET_MIME ||
      Number(response.headers.get('content-length')) > PUBLICATION_PACKET_MAX_BYTES) {
    throw new Error('This page could not be loaded.');
  }
  const compressed = unpackPublicationPacket(new Uint8Array(await response.arrayBuffer()));
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PUBLICATION_DOCUMENT_MAX_BYTES) throw new Error('This page is too large to load.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return readPublicationDocument(bytes);
}

async function load(id, hash = '', navigation = true) {
  loading?.abort();
  const request = new AbortController();
  loading = request;
  try {
    const result = await fetch(`${base}_page?id=${encodeURIComponent(id)}`, {
      signal: request.signal, credentials, headers: { Accept: PUBLICATION_PACKET_MIME },
    });
    const page = await readPage(result);
    if (loading !== request) return;
    selected = id;
    fragment = hash;
    const next = frame.cloneNode(false);
    next.title = page.title;
    next.hidden = false;
    next.srcdoc = page.document;
    frame.replaceWith(next);
    frame = next;
    status.hidden = true;
    if (navigation) history.pushState({ id }, '', base + (page.slug === 'index' ? '' : `${page.slug}.html`) + (hash ? `#${hash}` : ''));
  } catch (error) {
    if (error.name === 'AbortError' || loading !== request) return;
    status.hidden = false;
    status.textContent = error.message;
  }
}

function post(payload) {
  frame.contentWindow?.postMessage({ sender: 'plot-hosted-shell', ...payload }, '*');
}

addEventListener('message', async event => {
  const request = event.data;
  if (event.source !== frame.contentWindow || request?.sender !== 'plot-hosted-child') return;
  if (request.type === 'ready' && fragment) return post({ type: 'fragment', value: fragment });
  if (request.type === 'navigate' && typeof request.page === 'string') {
    if (request.page === selected && request.fragment) { post({ type: 'fragment', value: request.fragment }); return; }
    return load(request.page, typeof request.fragment === 'string' ? request.fragment : '');
  }
  if (request.type !== 'request' || !['data', 'run'].includes(request.action) || !Number.isSafeInteger(request.id)) return;
  const documentAtRequest = loading;
  try {
    const response = await fetch(base + '_bridge', { method: 'POST', credentials, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: request.action, payload: request.payload }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'The hosted operation failed.');
    if (loading === documentAtRequest) post({ id: request.id, ok: true, result: request.action === 'data' ? result.result : result });
  } catch (error) {
    if (loading === documentAtRequest) post({ id: request.id, ok: false, error: error.message });
  }
});

addEventListener('popstate', event => {
  if (event.state?.id) load(event.state.id, location.hash.slice(1), false);
});
history.replaceState({ id: selected }, '', location.href);
load(selected, fragment, false);
