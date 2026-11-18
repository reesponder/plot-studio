import { createCipheriv, createHash, generateKeyPairSync, randomBytes, randomInt, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { STUDIO_CONTENT_ORIGINS } from './studio-content-hosts.mjs';

const lifetime = 120_000;
const maximumBoots = 128;
const maximumSessionBoots = 6;

export function createStudioContent({ bundlePath, origin, isSessionActive, now = Date.now }) {
  const boots = new Map();
  const signing = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = signing.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  let bundlePromise;

  function prune() {
    for (const [id, boot] of boots) {
      if (boot.expiresAt <= now() || !isSessionActive(boot.sessionId)) boots.delete(id);
    }
  }

  async function create(identity) {
    prune();
    const existing = [...boots.values()].filter(boot => boot.sessionId === identity.id);
    if (existing.length >= maximumSessionBoots) {
      const error = new Error('Too many workspaces are starting. Wait a moment and try again.');
      error.status = 429;
      throw error;
    }
    if (boots.size >= maximumBoots) {
      const error = new Error('Studio is busy. Try again shortly.');
      error.status = 503;
      throw error;
    }
    bundlePromise ||= readFile(bundlePath).then(bytes => {
      if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('Studio bundle is missing or too large.');
      return { bytes, hash: createHash('sha256').update(bytes).digest('base64url') };
    }).catch(error => { bundlePromise = undefined; throw error; });
    const bundle = await bundlePromise;
    // Recheck after disk I/O so concurrent starts cannot bypass capacity or session checks.
    prune();
    if (!isSessionActive(identity.id)) {
      const error = new Error('Sign in again to open Studio.');
      error.status = 401;
      throw error;
    }
    if (boots.size >= maximumBoots || [...boots.values()].filter(boot => boot.sessionId === identity.id).length >= maximumSessionBoots) {
      const error = new Error('Too many workspaces are starting. Wait a moment and try again.');
      error.status = 429;
      throw error;
    }
    const id = randomBytes(32).toString('base64url');
    const issuedAt = now();
    const expiresAt = issuedAt + lifetime;
    const hosts = [...STUDIO_CONTENT_ORIGINS];
    for (let end = hosts.length - 1; end > 0; end--) {
      const selected = randomInt(end + 1);
      [hosts[end], hosts[selected]] = [hosts[selected], hosts[end]];
    }
    const encrypted = [];
    const parts = hosts.map((host, index) => {
      const start = Math.floor(bundle.bytes.length * index / hosts.length);
      const end = Math.floor(bundle.bytes.length * (index + 1) / hosts.length);
      const bytes = bundle.bytes.subarray(start, end);
      const key = randomBytes(32);
      const iv = randomBytes(12);
      const access = randomBytes(24).toString('base64url');
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.from(`${id}:${index}:${bundle.hash}`));
      const packet = Buffer.concat([cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
      const part = {
        index, url: `${host}/parts/${id}/${index}/${access}.bin`,
        key: key.toString('base64url'), iv: iv.toString('base64url'),
        hash: createHash('sha256').update(bytes).digest('base64url'),
        byteLength: bytes.length,
      };
      key.fill(0);
      encrypted.push({ packet, host, access });
      return part;
    });
    const payload = Buffer.from(JSON.stringify({
      version: 1, id, issuedAt, expiresAt, bundleHash: bundle.hash, byteLength: bundle.bytes.length, parts,
    }));
    const signature = sign('sha256', payload, { key: signing.privateKey, dsaEncoding: 'ieee-p1363' });
    const envelope = { payload: payload.toString('base64url'), signature: signature.toString('base64url') };
    boots.set(id, { id, sessionId: identity.id, expiresAt, encrypted, envelope });
    return { id, publicKey };
  }

  function manifest(id, identity) {
    prune();
    const boot = boots.get(id);
    if (!identity || boot?.sessionId !== identity.id) return null;
    return boot.envelope;
  }

  function complete(id, identity) {
    if (identity && boots.get(id)?.sessionId === identity.id) return boots.delete(id);
    return false;
  }

  function serve(req, res, url) {
    prune();
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
    res.setHeader('Vary', 'Origin');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    if (req.headers.origin !== origin) { res.writeHead(403); return res.end(); }
    const match = /^\/parts\/([A-Za-z0-9_-]{43})\/([0-9])\/([A-Za-z0-9_-]{32})\.bin$/.exec(url.pathname);
    const boot = match && boots.get(match[1]);
    const part = boot?.encrypted[Number(match[2])];
    const host = `https://${req.headers.host?.toLowerCase()}`;
    if (!part || part.host !== host || part.access !== match[3]) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream', 'Content-Length': part.packet.length,
      'Access-Control-Allow-Origin': origin,
    });
    res.end(req.method === 'HEAD' ? undefined : part.packet);
  }

  return { create, manifest, complete, serve };
}
