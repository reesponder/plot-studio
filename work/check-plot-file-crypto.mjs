import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createPlotFileCodec, maxPlotFileBytes } from '../outputs/plot-studio/plot-file.mjs';

const mainKey = randomBytes(32);
const codec = createPlotFileCodec(mainKey.toString('base64url'));
const project = { version: 1, name: 'Synthetic crypto fixture', pages: [{ id: 'index' }], graph: { nodes: [], edges: [] } };
const plain = Buffer.from(JSON.stringify(project));
const files = Array.from({ length: 128 }, () => codec.seal(project));
assert.equal(new Set(files.map(file => file.subarray(8, 40).toString('hex'))).size, files.length);
for (const file of files) {
  assert.equal(file.subarray(0, 8).toString(), 'PLOTSEC2');
  assert.equal(file.length, plain.length + 68);
  assert.deepEqual(codec.open(file), project);
}
const [file, other] = files;
const derived = hkdfSync('sha256', mainKey, file.subarray(8, 40), 'PLOT Studio protected file v2', 32);
const reader = createDecipheriv('aes-256-gcm', derived, file.subarray(40, 52), { authTagLength: 16 });
reader.setAAD(file.subarray(0, 52));
reader.setAuthTag(file.subarray(52, 68));
assert.deepEqual(Buffer.concat([reader.update(file.subarray(68)), reader.final()]), plain);

for (const offset of [0, 8, 39, 40, 51, 52, 67, 68, file.length - 1]) {
  const changed = Buffer.from(file);
  changed[offset] ^= 1;
  assert.throws(() => codec.open(changed), { status: 422 });
}
for (const changed of [file.subarray(0, 68), file.subarray(0, -1), Buffer.concat([file, Buffer.of(0)]), Buffer.concat([file.subarray(0, 52), other.subarray(52)])]) {
  assert.throws(() => codec.open(changed), { status: 422 });
}
assert.throws(() => createPlotFileCodec(randomBytes(32).toString('base64url')).open(file), { status: 422 });
assert.throws(() => createPlotFileCodec('').open(file), { status: 503 });
assert.throws(() => createPlotFileCodec('').seal(project), { status: 503 });
assert.throws(() => createPlotFileCodec('not a key'), /32 bytes/);
assert.throws(() => codec.open(Buffer.alloc(maxPlotFileBytes + 1)), { status: 413 });

const oldHeader = Buffer.from('PLOTSEC1');
const oldNonce = randomBytes(12);
const legacy = createCipheriv('aes-256-gcm', mainKey, oldNonce);
legacy.setAAD(oldHeader);
const oldEncrypted = Buffer.concat([legacy.update(plain), legacy.final()]);
const oldFile = Buffer.concat([oldHeader, oldNonce, legacy.getAuthTag(), oldEncrypted]);
assert.deepEqual(codec.open(oldFile), project);
assert.deepEqual(codec.open(plain), project);
oldFile[20] ^= 1;
assert.throws(() => codec.open(oldFile), { status: 422 });

console.log('PLOTSEC2 AES-GCM, key derivation, integrity, legacy files, missing/wrong keys and size limits verified.');
