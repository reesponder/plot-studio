import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const legacySignature = Buffer.from('PLOTSEC1');
const signature = Buffer.from('PLOTSEC2');
const fileKeyContext = Buffer.from('PLOT Studio protected file v2');
const saltBytes = 32;
const nonceBytes = 12;
const tagBytes = 16;
const maxProjectBytes = 12 * 1024 * 1024;
const headerBytes = signature.length + saltBytes + nonceBytes + tagBytes;
export const plotFileMime = 'application/octet-stream';
export const maxPlotFileBytes = maxProjectBytes + headerBytes;

function error(status, message) {
  return Object.assign(new Error(message), { status });
}

export function parsePlotProject(raw) {
  let project;
  try { project = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw error(422, 'The file does not contain a valid PLOT project.'); }
  if (project?.version !== 1 || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 150 ||
      !Array.isArray(project.pages) || !project.pages.length || project.pages.length > 500 ||
      !Array.isArray(project.graph?.nodes) || !Array.isArray(project.graph?.edges)) {
    throw error(422, 'The file does not contain a valid PLOT project.');
  }
  return project;
}

export function createPlotFileCodec(secret = process.env.PLOT_FILE_KEY) {
  const key = typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret) ? Buffer.from(secret, 'base64url') : null;
  if (secret && (key?.length !== 32 || key.toString('base64url') !== secret)) throw new Error('PLOT_FILE_KEY must contain 32 bytes encoded as base64url.');

  function requireKey() {
    if (!key) throw error(503, 'Protected project files are unavailable on this server.');
  }

  return {
    seal(project) {
      requireKey();
      const plain = Buffer.from(JSON.stringify(project));
      if (plain.length > maxProjectBytes) throw error(413, 'The project exceeds 12 MB.');
      const salt = randomBytes(saltBytes);
      const nonce = randomBytes(nonceBytes);
      const header = Buffer.concat([signature, salt, nonce]);
      const fileKey = hkdfSync('sha256', key, salt, fileKeyContext, 32);
      const cipher = createCipheriv('aes-256-gcm', fileKey, nonce, { authTagLength: tagBytes });
      cipher.setAAD(header);
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([header, cipher.getAuthTag(), encrypted]);
    },
    open(file) {
      if (file.length > maxPlotFileBytes) throw error(413, 'The project exceeds 12 MB.');
      const marker = file.subarray(0, signature.length);
      const current = marker.equals(signature);
      const legacy = marker.equals(legacySignature);
      if (!current && !legacy) {
        if (file.length > maxProjectBytes) throw error(413, 'The project exceeds 12 MB.');
        return parsePlotProject(file);
      }
      requireKey();
      const nonceOffset = current ? signature.length + saltBytes : legacySignature.length;
      const tagOffset = nonceOffset + nonceBytes;
      const cipherOffset = tagOffset + tagBytes;
      if (file.length <= cipherOffset) throw error(422, 'The protected project file is incomplete.');
      if (file.length - cipherOffset > maxProjectBytes) throw error(413, 'The project exceeds 12 MB.');
      const nonce = file.subarray(nonceOffset, tagOffset);
      const fileKey = current ? hkdfSync('sha256', key, file.subarray(signature.length, nonceOffset), fileKeyContext, 32) : key;
      const decipher = createDecipheriv('aes-256-gcm', fileKey, nonce, { authTagLength: tagBytes });
      decipher.setAAD(current ? file.subarray(0, tagOffset) : legacySignature);
      decipher.setAuthTag(file.subarray(tagOffset, cipherOffset));
      let plain;
      try { plain = Buffer.concat([decipher.update(file.subarray(cipherOffset)), decipher.final()]); }
      catch { throw error(422, 'The protected project file is damaged or belongs to another Studio server.'); }
      return parsePlotProject(plain);
    },
  };
}

export function sendPlotFile(req, res, file, filename) {
  res.writeHead(200, {
    'Content-Type': plotFileMime,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'Content-Length': file.length,
  });
  res.end(req.method === 'HEAD' ? undefined : file);
}

async function readFileRequest(req, limit) {
  if (Number(req.headers['content-length'] || 0) > limit) {
    req.resume();
    throw error(413, 'The project exceeds 12 MB.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  if (size > limit) throw error(413, 'The project exceeds 12 MB.');
  return Buffer.concat(chunks);
}

export function createPlotFileService({ codec, origin }) {
  let active = 0;
  return async (req, res, seal, session) => {
    let acquired = false;
    try {
      if (!session) throw error(401, 'Sign in to Studio to open or protect project files.');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw error(405, 'Method not allowed.');
      }
      if (req.headers.origin !== origin) throw error(403, 'Request origin is not allowed.');
      const type = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      if (type !== (seal ? 'application/json' : plotFileMime)) throw error(415, 'Use the project file tools in Studio.');
      if (active >= 4) throw error(503, 'The project file service is busy. Try again shortly.');
      active++;
      acquired = true;
      const file = await readFileRequest(req, seal ? maxProjectBytes : maxPlotFileBytes);
      if (seal) return sendPlotFile(req, res, codec.seal(parsePlotProject(file)), 'project.plot');
      const body = JSON.stringify(codec.open(file));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (issue) {
      if (!req.complete) req.resume();
      res.writeHead(issue.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: issue.status ? issue.message : 'The project file could not be processed.' }));
    } finally {
      if (acquired) active--;
    }
  };
}
