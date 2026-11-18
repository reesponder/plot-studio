import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createStockCatalog } from './stock-assets.mjs';

const worker = fileURLToPath(new URL('./image-asset-worker.py', import.meta.url));
const mib = 1024 * 1024;
const maxInput = 12 * mib;
const maxOutput = 16 * mib;
const maxStorage = 1024 * mib;
const maxAssets = 2000;
const idPattern = /^[a-f0-9]{32}$/;
const publicPattern = /^\/asset\/([a-f0-9]{32})\.(png|jpg|webp)$/;
const formats = {
  png: { kind: 'PNG', ext: 'png', mime: 'image/png' },
  jpg: { kind: 'JPEG', ext: 'jpg', mime: 'image/jpeg' },
  webp: { kind: 'WEBP', ext: 'webp', mime: 'image/webp' },
};

const issue = (status, message) => Object.assign(new Error(message), { status });

function json(req, res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function uploadDetails(headers) {
  let name;
  const filename = headers['x-plot-asset-name'];
  try {
    if (typeof filename === 'string' && filename.length <= 1024) name = decodeURIComponent(filename).normalize('NFC').trim();
  } catch {}
  if (!name || Buffer.byteLength(name) > 180 || /[\u0000-\u001f\u007f/\\]/.test(name)) {
    throw issue(400, 'Use a filename of up to 180 bytes without path separators.');
  }
  const ending = /\.(png|jpe?g|webp)$/i.exec(name)?.[1]?.toLowerCase();
  const format = formats[ending === 'jpeg' ? 'jpg' : ending];
  if (!format) throw issue(415, 'Choose a .png, .jpeg, .jpg, or .webp image.');
  const type = String(headers['content-type'] || '').split(';')[0].toLowerCase().trim();
  if (type !== 'application/octet-stream' && type !== format.mime) {
    throw issue(415, 'The image type must match its filename.');
  }
  return { name, format };
}

async function imageBody(req) {
  if (Number(req.headers['content-length'] || 0) > maxInput) throw issue(413, 'The upload exceeds 12 MB.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maxInput) chunks.push(chunk);
  }
  if (size > maxInput) throw issue(413, 'The upload exceeds 12 MB.');
  return Buffer.concat(chunks, size);
}

async function decoder(python, kind) {
  if (process.platform !== 'linux' || process.env.PLOT_ASSET_SANDBOX !== '1') return [python, '-I', '-B', worker, kind];
  if (!isAbsolute(python)) throw issue(503, 'The Linux image decoder is not configured.');
  const bwrap = ['/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
    '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'HOME', '/tmp', '--dev', '/dev', '--dir', '/tmp', '--chdir', '/tmp'];
  for (const path of ['/usr/lib', '/usr/lib64', '/lib', '/lib64']) {
    const file = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (file?.isSymbolicLink()) bwrap.push('--symlink', await readlink(path), path);
    else if (file?.isDirectory()) bwrap.push('--ro-bind', path, path);
  }
  const interpreter = await realpath(python);
  const venv = dirname(dirname(python));
  const hasVenv = await access(join(venv, 'pyvenv.cfg')).then(() => true).catch(() => false);
  bwrap.push('--ro-bind', interpreter, interpreter);
  if (hasVenv) bwrap.push('--ro-bind', venv, venv);
  if (python !== interpreter && (!hasVenv || python.startsWith('/usr/bin/'))) bwrap.push('--ro-bind', interpreter, python);
  if (hasVenv && interpreter.startsWith('/usr/bin/') && interpreter !== '/usr/bin/python3') {
    bwrap.push('--ro-bind', interpreter, '/usr/bin/python3');
  }
  bwrap.push('--ro-bind', worker, '/image-asset-worker.py', '--remount-ro', '/', '--', python, '-I', '-B', '/image-asset-worker.py', kind);
  return bwrap;
}

async function convertImage(bytes, format, python) {
  const [command, ...args] = await decoder(python, format.kind);
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
  return new Promise((resolveImage, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, timeout: 25000, killSignal: 'SIGKILL' });
    const chunks = [];
    let length = 0;
    child.stdout.on('data', part => {
      length += part.length;
      if (length > maxOutput + 1024) child.kill('SIGKILL');
      else chunks.push(part);
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => reject(issue(503, 'Image processing is temporarily unavailable.')));
    child.on('close', code => {
      if (code !== 0) return reject(issue(503, 'Image processing is temporarily unavailable.'));
      const output = Buffer.concat(chunks);
      const boundary = output.indexOf(10);
      if (boundary < 1 || boundary > 1000) return reject(issue(503, 'The image could not be processed.'));
      let response;
      try { response = JSON.parse(output.subarray(0, boundary).toString('ascii')); }
      catch { return reject(issue(503, 'The image could not be processed.')); }
      if (response.status !== 200) return reject(issue(response.status === 413 ? 413 : 422, response.error));
      const image = output.subarray(boundary + 1);
      if (!image.length || image.length > maxOutput || !Number.isSafeInteger(response.width) || !Number.isSafeInteger(response.height)) {
        return reject(issue(503, 'The image could not be processed.'));
      }
      resolveImage({ image, width: response.width, height: response.height });
    });
    child.stdin.end(bytes);
  });
}

export function createImageAssets({ directory, origin, namespace = '', uploadSlots = { active: 0 } }) {
  const library = directory ? resolve(directory, 'image-library') : null;
  const python = process.env.PLOT_ASSET_PYTHON || (process.platform === 'win32' ? 'python' : '/usr/bin/python3');
  const stock = createStockCatalog();
  let catalogue;
  let processing = false;

  function entry(record) {
    const imageUrl = new URL(`/asset/${namespace ? `u/${namespace}/` : ''}${record.id}.${record.ext}`, origin).href;
    return { id: record.id, name: record.name, url: imageUrl, width: record.width, height: record.height,
      size: record.size, mime: formats[record.ext].mime, createdAt: record.createdAt,
      ...(record.stock ? { stockId: record.stock.id, alt: record.stock.description } : {}) };
  }

  function list() {
    if (catalogue) return catalogue;
    catalogue = (async () => {
      const directories = await readdir(library, { withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const items = [];
      for (const directory of directories) {
        if (!directory.isDirectory()) continue;
        if (/^\.incoming-[A-Za-z0-9]{6}$/.test(directory.name)) {
          const abandoned = join(library, directory.name);
          const information = await stat(abandoned).catch(() => null);
          if (information && Date.now() - information.mtimeMs > 60 * 60 * 1000) {
            await rm(abandoned, { recursive: true, force: true }).catch(() => {});
          }
          continue;
        }
        if (!idPattern.test(directory.name)) continue;
        const path = join(library, directory.name, 'metadata.json');
        const record = JSON.parse(await readFile(path, 'utf8'));
        if (record?.id !== directory.name || !Object.hasOwn(formats, record.ext) || !Number.isSafeInteger(record.size) ||
            record.size < 1 || record.size > maxOutput || typeof record.createdAt !== 'string' || typeof record.name !== 'string') {
          throw new Error('The image library contains an invalid entry.');
        }
        items.push(record);
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return { items, totalBytes: items.reduce((total, record) => total + record.size, 0) };
    })().catch(error => {
      catalogue = null;
      throw error;
    });
    return catalogue;
  }

  async function add(read, { name, format, stockPhoto }) {
    if (processing || uploadSlots.active >= 4) throw issue(429, 'Another image is being processed. Try again shortly.');
    processing = true;
    uploadSlots.active++;
    let staging;
    try {
      const index = await list();
      if (stockPhoto) {
        const saved = index.items.find(record => record.stock?.id === stockPhoto.id && record.stock.revision === stockPhoto.revision);
        if (saved) return { asset: entry(saved), created: false };
      }
      if (index.items.length >= maxAssets || index.totalBytes >= maxStorage) throw issue(507, 'The Studio image library is full.');
      const { image, width, height } = await convertImage(await read(), format, python);
      if (index.totalBytes + image.length > maxStorage) throw issue(507, 'The Studio image library is full.');
      const id = randomBytes(16).toString('hex');
      const record = { id, name, ext: format.ext, width, height, size: image.length, createdAt: new Date().toISOString() };
      if (stockPhoto) record.stock = { id: stockPhoto.id, revision: stockPhoto.revision, description: stockPhoto.description };
      await mkdir(library, { mode: 0o700, recursive: true });
      staging = await mkdtemp(join(library, '.incoming-'));
      await writeFile(join(staging, `image.${record.ext}`), image, { mode: 0o600, flag: 'wx' });
      await writeFile(join(staging, 'metadata.json'), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      await rename(staging, join(library, id));
      staging = null;
      index.items.unshift(record);
      index.totalBytes += image.length;
      return { asset: entry(record), created: true };
    } finally {
      processing = false;
      uploadSlots.active--;
      if (staging) await rm(staging, { force: true, recursive: true }).catch(() => {});
    }
  }

  async function serve(req, res, route) {
    const match = publicPattern.exec(route);
    if (!match || !library) throw issue(404, 'Image not found.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      throw issue(405, 'Method not allowed.');
    }
    const [, id, ext] = match;
    const file = join(library, id, `image.${ext}`);
    const image = await stat(file).catch(error => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw issue(404, 'Image not found.');
      throw error;
    });
    if (!image.isFile()) throw issue(404, 'Image not found.');
    const etag = `"${id}.${ext}"`;
    const headers = {
      'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': formats[ext].mime, 'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff', ETag: etag,
    };
    const conditional = String(req.headers['if-none-match'] || '').split(',').map(value => value.trim());
    if (conditional.some(value => value === '*' || value.replace(/^W\//, '') === etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, { ...headers, 'Content-Length': image.size });
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(file), res);
  }

  return async function handle(req, res, url, session) {
    try {
      if (url.pathname === '/asset' || url.pathname.startsWith('/asset/')) return await serve(req, res, url.pathname);
      if (!session) throw issue(401, 'Sign in to Studio to manage assets.');
      if (url.pathname === '/studio/api/assets/stock') {
        if (req.method === 'GET') return json(req, res, 200, await stock.search(url.searchParams));
        res.setHeader('Allow', 'GET');
        throw issue(405, 'Method not allowed.');
      }
      if (!library) throw issue(503, 'The Studio image library is unavailable.');
      const stockId = /^\/studio\/api\/assets\/stock\/([1-9]\d{0,14})$/.exec(url.pathname)?.[1];
      if (stockId) {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          throw issue(405, 'Method not allowed.');
        }
        if (req.headers.origin !== origin) throw issue(403, 'Send this request from the Studio origin.');
        req.resume();
        const photo = await stock.find(stockId, url.searchParams.get('revision'));
        const name = photo.file.split('/').at(-1);
        const extension = name.split('.').at(-1).toLowerCase();
        const format = formats[extension === 'jpeg' ? 'jpg' : extension];
        const result = await add(() => stock.read(photo, maxInput), { name, format, stockPhoto: photo });
        return json(req, res, result.created ? 201 : 200, { asset: result.asset });
      }
      if (url.pathname !== '/studio/api/assets') throw issue(404, 'Asset route not found.');
      if (req.method === 'POST') {
        if (req.headers.origin !== origin) throw issue(403, 'Send this upload from the Studio origin.');
        const { asset } = await add(() => imageBody(req), uploadDetails(req.headers));
        return json(req, res, 201, { asset });
      }
      if (req.method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const limitQuery = url.searchParams.get('limit');
        if (limitQuery !== null && (!/^[1-9]\d{0,2}$/.test(limitQuery) || Number(limitQuery) > 100)) {
          throw issue(400, 'Choose an asset page size from 1 to 100.');
        }
        if (cursor !== null && !idPattern.test(cursor)) throw issue(400, 'The asset page cursor is invalid.');
        const { items } = await list();
        const start = cursor ? items.findIndex(record => record.id === cursor) + 1 : 0;
        if (cursor && !start) throw issue(400, 'The asset page cursor expired. Refresh the library.');
        const limit = Number(limitQuery || 60);
        const assets = items.slice(start, start + limit).map(entry);
        return json(req, res, 200, { assets, nextCursor: start + limit < items.length ? assets.at(-1).id : null });
      }
      res.setHeader('Allow', 'GET, POST');
      throw issue(405, 'Method not allowed.');
    } catch (error) {
      if (!req.complete) req.resume();
      if (res.headersSent || res.destroyed) return;
      if (error.status === 429) res.setHeader('Retry-After', '1');
      if (!error.status) console.error('Studio asset request failed:', error.code || error.name);
      return json(req, res, error.status || 500, { error: error.status ? error.message : 'The image library request failed.' });
    }
  };
}
