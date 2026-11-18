import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const gateway = resolve(process.env.PLOT_ASSET_TEST_GATEWAY || 'outputs/plot-studio/server.mjs');
const origin = 'http://localhost:15183';
const password = randomBytes(24).toString('hex');
const python = process.env.PLOT_ASSET_PYTHON || (process.platform === 'win32' ? 'python' : '/usr/bin/python3');
const hash = spawnSync(process.execPath, [gateway, 'hash'], { input: password, encoding: 'utf8' });
assert.equal(hash.status, 0, hash.stderr);
const fixtures = spawnSync(python, ['-I', '-c', `
import base64, io, json
from PIL import Image, PngImagePlugin

def prepare(mode, color, size, format, **options):
    stream = io.BytesIO()
    Image.new(mode, size, color).save(stream, format, **options)
    return base64.b64encode(stream.getvalue()).decode()

metadata = PngImagePlugin.PngInfo()
metadata.add_text('Comment', 'private-metadata-marker')
exif = Image.Exif()
exif[274] = 6
print(json.dumps({
    'png': prepare('RGBA', (35, 80, 160, 0), (7, 5), 'PNG', pnginfo=metadata),
    'jpeg': prepare('RGB', 'red', (9, 3), 'JPEG', exif=exif),
    'webp': prepare('RGBA', (18, 25, 35, 96), (14, 8), 'WEBP'),
    'huge': prepare('RGB', 'blue', (9000, 1), 'PNG'),
}))
`], { encoding: 'utf8' });
assert.equal(fixtures.status, 0, fixtures.stderr);
const { png, jpeg, webp, huge } = Object.fromEntries(Object.entries(JSON.parse(fixtures.stdout)).map(([key, value]) => [key, Buffer.from(value, 'base64')]));
const directory = await mkdtemp(join(tmpdir(), 'plot-image-assets-'));
let child;
let cookie;

async function runGateway() {
  child = spawn(process.execPath, [gateway], { env: { ...process.env, PORT: '15183', PUBLIC_ORIGIN: origin, PLOT_STATE_DIR: directory,
    STUDIO_PASSWORD_HASH: hash.stdout.trim(), STUDIO_SESSION_SECRET: randomBytes(32).toString('base64url'),
    PLOT_PROJECT_STORAGE_KEY: randomBytes(32).toString('base64url'), PLOT_FILE_KEY: randomBytes(32).toString('base64url'),
  }, stdio: ['ignore', 'ignore', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    ready = await fetch(origin).then(res => res.ok).catch(() => false);
    if (!ready) await wait(120);
  }
  assert.ok(ready);
  const login = await fetch(origin + '/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }), redirect: 'manual' });
  assert.equal(login.status, 303);
  cookie = login.headers.get('set-cookie').split(';')[0];
}

async function stopGateway() {
  if (child.exitCode !== null) return;
  await new Promise(resolveExit => { child.once('exit', resolveExit); child.kill(); });
}

function submit(bytes, filename, type, headers = {}) {
  return fetch(origin + '/studio/api/assets', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': type,
    'X-Plot-Asset-Name': encodeURIComponent(filename), ...headers }, body: bytes });
}

async function upload(bytes, filename, type) {
  const result = await submit(bytes, filename, type);
  assert.equal(result.status, 201, await result.clone().text());
  return (await result.json()).asset;
}

try {
  await runGateway();
  assert.equal((await fetch(origin + '/studio/api/assets')).status, 401);
  assert.equal((await fetch(origin + '/asset/')).status, 404);
  assert.equal((await submit(png, 'photo.png', 'image/png', { Cookie: '' })).status, 401);
  assert.equal((await submit(png, 'photo.png', 'image/png', { Origin: 'https://different.example' })).status, 403);
  assert.equal((await submit(png, 'photo.png', 'image/jpeg')).status, 415);
  assert.equal((await submit(png, 'photo.svg', 'image/svg+xml')).status, 415);
  assert.equal((await submit(png, '../photo.png', 'image/png')).status, 400);
  assert.equal((await submit(Buffer.from('just text'), 'photo.png', 'image/png')).status, 422);
  assert.equal((await submit(png, 'photo.jpg', 'image/jpeg')).status, 422);
  assert.equal((await submit(huge, 'huge.png', 'image/png')).status, 413);
  assert.equal((await submit(Buffer.alloc(12 * 1024 * 1024 + 1), 'oversized.png', 'image/png')).status, 413);

  const first = await upload(png, 'Łabędź.PNG', 'image/png');
  assert.equal(first.name, 'Łabędź.PNG');
  assert.equal(first.mime, 'image/png');
  assert.deepEqual([first.width, first.height], [7, 5]);
  assert.match(first.url, /^http:\/\/localhost:15183\/asset\/[a-f0-9]{32}\.png$/);
  const second = await upload(jpeg, 'rotated.jpeg', 'image/jpeg');
  assert.match(second.url, /\.jpg$/);
  assert.deepEqual([second.width, second.height], [3, 9]);
  const third = await upload(webp, 'cover.webp', 'application/octet-stream');
  assert.match(third.url, /\.webp$/);
  const publicImage = await fetch(first.url);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get('content-type'), 'image/png');
  assert.equal(publicImage.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(publicImage.headers.get('access-control-allow-origin'), '*');
  assert.equal(publicImage.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.match(publicImage.headers.get('cache-control'), /immutable/);
  assert.equal(publicImage.headers.get('set-cookie'), null);
  const output = Buffer.from(await publicImage.arrayBuffer());
  assert.equal(output.includes(Buffer.from('private-metadata-marker')), false);
  const transparency = spawnSync(python, ['-I', '-c', 'import io,sys; from PIL import Image; print(Image.open(io.BytesIO(sys.stdin.buffer.read())).getpixel((0,0))[-1])'], { input: output, encoding: 'utf8' });
  assert.equal(transparency.stdout.trim(), '0', transparency.stderr);
  const head = await fetch(first.url, { method: 'HEAD' });
  assert.equal(Number(head.headers.get('content-length')), first.size);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const fresh = await fetch(first.url, { headers: { 'If-None-Match': head.headers.get('etag') } });
  assert.equal(fresh.status, 304);
  assert.equal((await fetch(first.url.replace('.png', '.jpg'))).status, 404);

  const listing = await fetch(origin + '/studio/api/assets?limit=2', { headers: { Cookie: cookie } }).then(res => res.json());
  assert.deepEqual(listing.assets.map(asset => asset.id), [third.id, second.id]);
  assert.equal(listing.nextCursor, second.id);
  const remainder = await fetch(origin + `/studio/api/assets?cursor=${listing.nextCursor}`, { headers: { Cookie: cookie } }).then(res => res.json());
  assert.deepEqual(remainder.assets.map(asset => asset.id), [first.id]);
  assert.equal(remainder.nextCursor, null);
  await stopGateway();
  await runGateway();
  assert.equal((await fetch(first.url)).status, 200);
  assert.equal((await fetch(origin + '/studio/api/assets', { headers: { Cookie: cookie } }).then(res => res.json())).assets.length, 3);
  console.log('Asset upload formats, orientation, transparency, metadata stripping, limits, auth and CSRF, public MIME and CORS, caching, pagination and restart verified.');
} finally {
  await stopGateway();
  await rm(directory, { recursive: true, force: true });
}
