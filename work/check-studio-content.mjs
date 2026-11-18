import assert from 'node:assert/strict';
import { createDecipheriv, createHash, createPublicKey, verify } from 'node:crypto';
import { createStudioContent } from '../outputs/plot-studio/studio-content.mjs';
import { STUDIO_CONTENT_ORIGINS } from '../outputs/plot-studio/studio-content-hosts.mjs';

const origin = 'https://plotstudio.pro';
const active = new Set(['session-a', 'session-b']);
let now = Date.now();
const service = createStudioContent({
  bundlePath: new URL('../outputs/plot-studio/studio-build/editor.mjs', import.meta.url),
  origin, isSessionActive: id => active.has(id), now: () => now,
});
const identity = { id: 'session-a' };
const boot = await service.create(identity);
const envelope = service.manifest(boot.id, identity);
const payload = Buffer.from(envelope.payload, 'base64url');
assert.ok(verify('sha256', payload, {
  key: createPublicKey({ key: Buffer.from(boot.publicKey, 'base64url'), type: 'spki', format: 'der' }),
  dsaEncoding: 'ieee-p1363',
}, Buffer.from(envelope.signature, 'base64url')));
const manifest = JSON.parse(payload);
assert.equal(new Set(manifest.parts.map(part => new URL(part.url).origin)).size, 10);
assert.deepEqual(new Set(manifest.parts.map(part => new URL(part.url).origin)), new Set(STUDIO_CONTENT_ORIGINS));
assert.equal(service.manifest(boot.id, { id: 'session-b' }), null);

function request(part, changes = {}) {
  const url = new URL(part.url);
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
    end(bytes) { this.body = bytes; } };
  service.serve({ method: 'GET', headers: { host: url.host, origin, ...changes } }, response, url);
  return response;
}

const pieces = [];
for (const part of manifest.parts) {
  const response = request(part);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store, private');
  assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
  assert.equal(response.headers['Access-Control-Allow-Credentials'], undefined);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(part.key, 'base64url'), Buffer.from(part.iv, 'base64url'));
  decipher.setAAD(Buffer.from(`${manifest.id}:${part.index}:${manifest.bundleHash}`));
  decipher.setAuthTag(response.body.subarray(-16));
  pieces.push(Buffer.concat([decipher.update(response.body.subarray(0, -16)), decipher.final()]));
  const modified = Buffer.from(response.body);
  modified[0] ^= 1;
  const invalid = createDecipheriv('aes-256-gcm', Buffer.from(part.key, 'base64url'), Buffer.from(part.iv, 'base64url'));
  invalid.setAAD(Buffer.from(`${manifest.id}:${part.index}:${manifest.bundleHash}`));
  invalid.setAuthTag(modified.subarray(-16));
  invalid.update(modified.subarray(0, -16));
  assert.throws(() => invalid.final());
  assert.equal(request(part, { origin: 'https://unrelated.example' }).status, 403);
  const foreignHost = new URL(manifest.parts[(part.index + 1) % 10].url).host;
  assert.equal(request(part, { host: foreignHost }).status, 404);
}
assert.equal(createHash('sha256').update(Buffer.concat(pieces)).digest('base64url'), manifest.bundleHash);
assert.equal(service.complete(boot.id, { id: 'session-b' }), false);
assert.equal(service.complete(boot.id, identity), true);
assert.equal(request(manifest.parts[0]).status, 404);
assert.equal(service.manifest(boot.id, identity), null);

const expired = await service.create(identity);
const expiringManifest = JSON.parse(Buffer.from(service.manifest(expired.id, identity).payload, 'base64url'));
now += 120_001;
assert.equal(request(expiringManifest.parts[0]).status, 404);
assert.equal(service.manifest(expired.id, identity), null);

const revoked = await service.create(identity);
const revokedManifest = JSON.parse(Buffer.from(service.manifest(revoked.id, identity).payload, 'base64url'));
active.delete(identity.id);
assert.equal(request(revokedManifest.parts[0]).status, 404);
active.add(identity.id);
const simultaneous = await Promise.allSettled(Array.from({ length: 10 }, () => service.create(identity)));
assert.equal(simultaneous.filter(result => result.status === 'fulfilled').length, 6);
assert.equal(simultaneous.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 4);
console.log('Encrypted Studio startup passed signed manifest, ten origins, per-part decryption, origin restriction, completion, expiry, revocation and concurrent capacity.');
