import { STUDIO_CONTENT_ORIGINS } from './studio-content-hosts.mjs';

const loader = document.querySelector('script[data-studio-boot]');
const panel = document.querySelector('#studio-boot-status');
const feedback = panel.querySelector('[role="status"]');
const encoder = new TextEncoder();

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

function encoded(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function checksum(bytes) {
  return encoded(await crypto.subtle.digest('SHA-256', bytes));
}

async function fetchPart(part, manifest, signal) {
  const key = await crypto.subtle.importKey('raw', decode(part.key), 'AES-GCM', false, ['decrypt']);
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(part.url, {
        mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('A Studio component could not be loaded.');
      const packet = await response.arrayBuffer();
      if (packet.byteLength !== part.byteLength + 16) throw new Error('A Studio component has an invalid size.');
      const bytes = await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: decode(part.iv), tagLength: 128,
        additionalData: encoder.encode(`${manifest.id}:${part.index}:${manifest.bundleHash}`),
      }, key, packet);
      if (await checksum(bytes) !== part.hash) throw new Error('A Studio component failed verification.');
      return new Uint8Array(bytes);
    } catch (error) {
      failure = error;
      if (signal.aborted) break;
    }
  }
  throw failure;
}

async function start() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  let moduleUrl;
  try {
    const id = loader.dataset.studioBoot;
    feedback.textContent = 'Verifying your workspace…';
    const response = await fetch(`/studio/boot/${id}`, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new Error('Your Studio session expired. Open Studio again.');
    const envelope = await response.json();
    const publicKey = await crypto.subtle.importKey('spki', decode(loader.dataset.bootKey),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const payload = decode(envelope.payload);
    const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(envelope.signature), payload);
    if (!verified) throw new Error('Workspace verification failed. Open Studio again.');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
    if (manifest.version !== 1 || manifest.id !== id || manifest.expiresAt <= Date.now() ||
        !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength < 1 || manifest.byteLength > 16 * 1024 * 1024 ||
        manifest.parts?.length !== STUDIO_CONTENT_ORIGINS.length) throw new Error('This workspace start has expired. Open Studio again.');
    const usedHosts = new Set();
    for (const [index, part] of manifest.parts.entries()) {
      const url = new URL(part.url);
      if (part.index !== index || !STUDIO_CONTENT_ORIGINS.includes(url.origin) || usedHosts.has(url.origin) ||
          url.pathname !== `/parts/${id}/${index}/${url.pathname.split('/').at(-1)}` || url.search || url.hash ||
          !Number.isSafeInteger(part.byteLength) || part.byteLength < 1) throw new Error('Invalid Studio component manifest.');
      usedHosts.add(url.origin);
    }
    feedback.textContent = 'Loading your workspace…';
    const pieces = await Promise.all(manifest.parts.map(part => fetchPart(part, manifest, controller.signal)));
    const code = new Uint8Array(manifest.byteLength);
    let offset = 0;
    for (const piece of pieces) { code.set(piece, offset); offset += piece.byteLength; }
    if (offset !== code.byteLength || await checksum(code) !== manifest.bundleHash) throw new Error('Studio failed its integrity check.');
    await fetch(`/studio/boot/${id}`, {
      method: 'DELETE', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    clearTimeout(timer);
    moduleUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    panel.hidden = true;
    await import(moduleUrl);
    document.documentElement.dataset.studioBoot = 'ready';
  } catch (error) {
    controller.abort();
    panel.hidden = false;
    feedback.textContent = 'Studio could not start. Open your workspace again.';
    panel.querySelector('a').hidden = false;
    document.documentElement.dataset.studioBoot = 'failed';
    if (window.parent !== window && document.referrer) {
      window.parent.postMessage({ type: 'plot-studio:failed' }, new URL(document.referrer).origin);
    }
    console.error('Studio startup verification failed.', error);
  } finally {
    clearTimeout(timer);
    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
    loader.removeAttribute('data-studio-boot');
    loader.removeAttribute('data-boot-key');
  }
}

void start();
