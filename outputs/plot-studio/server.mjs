import { createServer } from 'node:http';
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createDraftStore } from './draft-store.mjs';
import { renderNodeReference } from './docs-reference.mjs';
import { createHosted } from './hosted.mjs';
import { checkoutTermsVersion, createStripeCheckout } from './stripe-checkout.mjs';
import { createExamService } from './exams.mjs';
import { renderCertificate } from './certificate.mjs';
import { createPlotFileCodec, createPlotFileService, parsePlotProject, sendPlotFile } from './plot-file.mjs';
import { createImageAssets } from './image-assets.mjs';
import { createProjectSecrets } from './project-secrets.mjs';
import { createPrivateProjectStorage } from './private-project-storage.mjs';
import { createStudioRotation, isStudioAliasHost, isStudioAliasOrigin, STUDIO_ALIAS_ORIGINS, STUDIO_WORKSPACE_PATH } from './studio-rotation.mjs';
import { accountEmail, accountId, createWorkspaceAccounts, licensePattern } from './workspace-accounts.mjs';
import { accessPage, accountPage, licencesPage } from './workspace-pages.mjs';
import { createWorkingDraft } from './working-draft.mjs';
import { createStudioContent } from './studio-content.mjs';
import { isStudioContentHost } from './studio-content-hosts.mjs';

const deriveKey = promisify(scrypt);
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 14990);
const publicFiles = resolve(root, 'public');
const assetRoot = resolve(root, 'assets');
const certificationPages = new Map([
  ['/certification', 'certification.html'],
  ['/certification/builder', 'exam-builder.html'],
  ['/certification/builder/practice', 'exam-builder-practice.html'],
  ['/certification/workflow-architect', 'exam-workflow-architect.html'],
  ['/certification/workflow-architect/practice', 'exam-architect-practice.html'],
  ['/certification/attempt', 'exam-attempt.html'],
  ['/certification/verify', 'verify-certificate.html'],
]);
const studioAliasFiles = new Map([
  ['/xaxxaxaxaxa.mjs', 'studio-alias.mjs'],
  ['/xaxxaxaxaxa.css', 'studio-alias.css'],
]);
const cookieName = '__Secure-99host_session';
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const studioFiles = new Set([
  'index.html', 'studio.css', 'studio.mjs', 'project.mjs', 'logic.mjs', 'logic.css', 'logic-catalog.mjs',
  'inspector.mjs', 'inspector.css',
  'workspace-shell.css', 'dock-layout.mjs', 'dock-layout.css',
  'canvas-transform.mjs',
  'block-design-catalog.mjs', 'block-variants.mjs', 'block-variant-picker.mjs', 'block-variant-picker.css', 'canvas-transform.mjs',
  'data.mjs', 'data-editor.mjs', 'data-editor.css', 'remote-projects.mjs',
  'plot-files.mjs', 'workspace-client.mjs', 'phone-preview.mjs', 'phone-preview.css',
  'studio-bootstrap.mjs', 'studio-bootstrap.css', 'studio-content-hosts.mjs',
  'image-library.mjs', 'image-library.css', 'paint-editor.mjs', 'paint-editor.css', 'paint-engine.mjs', 'paint-pixels.mjs', 'paint-ribbon.mjs', 'paint-color-dialog.mjs',
  'runtime.py',
  'backend-editor.mjs', 'backend-editor.css', 'backend-model.mjs', 'backend_engine.py', 'backend_services.py', 'backend_native.rs',
  'python_runner.py', 'python_sandbox.py', 'python_scratch.py', 'python-packages-linux310.txt',
  'workflow_packages.py', 'workflow-package-requirements.txt',
  'hosted-runner.mjs', 'hosted.css',
]);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.plot': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.py': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.rs': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.vtt': 'text/vtt',
};
const publicDirectives = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:",
  "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
];
const publicPolicy = publicDirectives.join('; ');
const checkoutPolicy = [
  ...publicDirectives.filter(directive => !/^(?:script|img)-src /.test(directive)),
  "script-src 'self' https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com",
  "img-src 'self' data: https://*.stripe.com https://*.link.com",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://link.com https://*.link.com",
  "frame-src https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://link.com https://*.link.com",
].join('; ');

async function hashPassword() {
  process.stdin.setEncoding('utf8');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk;
    if (Buffer.byteLength(password) > 1026) throw new Error('Password cannot exceed 1024 bytes.');
  }
  password = password.replace(/\r?\n$/, '');
  if (!password) throw new Error('Enter a password on standard input.');
  if (Buffer.byteLength(password) > 1024) throw new Error('Password cannot exceed 1024 bytes.');
  const salt = randomBytes(16);
  const digest = await deriveKey(password, salt, 32, scryptOptions);
  process.stdout.write(`scrypt$32768$8$1$${salt.toString('base64url')}$${digest.toString('base64url')}\n`);
}

function readConfig() {
  const origin = new URL(process.env.PUBLIC_ORIGIN || 'https://plotstudio.pro');
  if (origin.origin !== origin.href.slice(0, -1) || (
    origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)
  )) throw new Error('PUBLIC_ORIGIN requires an HTTPS origin without a path.');
  const match = /^scrypt\$32768\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(process.env.STUDIO_PASSWORD_HASH || '');
  if (!match) throw new Error('Generate STUDIO_PASSWORD_HASH using node server.mjs hash.');
  const salt = Buffer.from(match[1], 'base64url');
  const digest = Buffer.from(match[2], 'base64url');
  const rawSessionSecret = process.env.STUDIO_SESSION_SECRET || '';
  const sessionSecret = Buffer.from(rawSessionSecret, 'base64url');
  if (!/^[A-Za-z0-9_-]+$/.test(rawSessionSecret) || sessionSecret.length < 32) {
    throw new Error('STUDIO_SESSION_SECRET requires at least 32 bytes encoded as base64url.');
  }
  const ttl = Number(process.env.STUDIO_SESSION_TTL || 43200);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 604800) {
    throw new Error('STUDIO_SESSION_TTL must be a whole number of seconds between 60 and 604800.');
  }
  return { origin: origin.origin, salt, digest, sessionSecret, ttl, trustProxy: process.env.TRUST_PROXY === '1' };
}

function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function redirect(res, to, status = 303) {
  res.writeHead(status, { Location: to });
  res.end();
}

function respond(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function serveFile(req, res, path, headers = {}) {
  const contentType = mime[extname(path)];
  if (!contentType) return respond(res, 404, 'File not found.');
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) return respond(res, 404, 'File not found.');
    throw error;
  }
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.length, ...headers });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

async function readForm(req) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) return;
  if (Number(req.headers['content-length']) > 4096) {
    req.resume();
    return;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
    else break;
  }
  if (size > 4096) return;
  const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (new Set(body.keys()).size !== [...body.keys()].length) return;
  return body;
}

function studioDestination(next) {
  return /^\/studio\/sites\/(?:u\/[a-f0-9]{32}\/)?[a-z0-9-]+\/(?:[a-z0-9-]+(?:\.html)?)?$/.test(next) ? next : '/studio/';
}

function isStudioFrameNavigation(req) {
  if (req.headers['sec-fetch-dest'] !== 'iframe' || req.headers['sec-fetch-mode'] !== 'navigate' ||
      req.headers['sec-fetch-site'] !== 'same-site') return false;
  try { return isStudioAliasOrigin(new URL(req.headers.referer).origin); }
  catch { return false; }
}

async function readPassword(req) {
  const body = await readForm(req);
  if (!body) return;
  const [password] = body.getAll('password');
  if (!password || body.getAll('password').length !== 1 || Buffer.byteLength(password) > 1024) return;
  return { password, next: studioDestination(body.get('next') || '') };
}

function start() {
  const { origin, salt, digest, sessionSecret, ttl, trustProxy } = readConfig();
  const rotation = createStudioRotation({ origin, enabled: process.env.PLOT_STUDIO_ALIAS_ROTATION === '1' });
  const master = process.env.PLOT_FILE_KEY || '';
  const plotFiles = createPlotFileCodec(master);
  // The codec owns the export key. Do not pass it to child processes via the environment.
  delete process.env.PLOT_FILE_KEY;
  const directory = process.env.PLOT_STATE_DIR;
  const accounts = createWorkspaceAccounts(directory);
  const derivePlotCodec = namespace => createPlotFileCodec(master ? createHmac('sha256', Buffer.from(master, 'base64url'))
    .update(`PLOT export scope v1\0${namespace}`).digest('base64url') : '');
  const templateCodec = derivePlotCodec('public-templates');
  function withTemplates(codec) {
    return {
      seal: project => codec.seal(project),
      open(file) {
        try { return codec.open(file); }
        catch (error) {
          if (error.status !== 422 || file.subarray(0, 8).toString() !== 'PLOTSEC2') throw error;
          return templateCodec.open(file);
        }
      },
    };
  }
  const runnerSlots = { active: 0, public: 0 };
  const uploadSlots = { active: 0 };
  const workspaceCache = new Map();
  function makeWorkspace(namespace) {
    const home = namespace ? resolve(directory, 'customer-workspaces', namespace) : directory;
    const storage = home ? createPrivateProjectStorage(namespace) : null;
    const projectSecrets = home ? createProjectSecrets({ directory: home, privateProjects: storage }) : null;
    const codec = withTemplates(namespace ? derivePlotCodec(`customer:${namespace}`) : plotFiles);
    const drafts = createDraftStore({ directory: home, origin, plotFiles: codec, projectSecrets, namespace });
    const hosted = createHosted({ directory: home, origin, sessionSecret, privateProjects: storage, projectSecrets,
      checkSecretProject: id => drafts?.exists(id), namespace, runnerSlots });
    return { drafts, hosted, assets: createImageAssets({ directory: home, origin, namespace, uploadSlots }),
      workingDraft: namespace ? createWorkingDraft(home, storage, origin) : null,
      files: createPlotFileService({ codec, origin }) };
  }
  function workspaceFor(namespace = '') {
    if (!workspaceCache.has(namespace)) workspaceCache.set(namespace, makeWorkspace(namespace));
    return workspaceCache.get(namespace);
  }
  const operator = workspaceFor();
  const createCheckoutSession = createStripeCheckout();
  const exams = createExamService({ directory, origin, renderCertificate, clientIp, plotFiles: withTemplates(plotFiles),
    starterFiles: templateCodec, async openSubmission(file, email) {
      const owner = await accounts?.findEmail(email);
      if (owner) return withTemplates(derivePlotCodec(`customer:${owner.id}`)).open(file);
      return withTemplates(plotFiles).open(file);
    } });
  const sessions = new Map();
  const content = process.env.PLOT_STUDIO_DISTRIBUTED_BOOT === '1' && rotation.enabled
    ? createStudioContent({
      origin, bundlePath: resolve(root, 'studio-build', 'editor.mjs'),
      isSessionActive: id => (sessions.get(id)?.expires || 0) > Date.now(),
    }) : null;
  const attempts = new Map();
  const licenceAttempts = new Map();
  const checkoutAttempts = new Map();
  const maxAttempts = 6;
  const attemptWindow = 15 * 60 * 1000;
  let activeAuth = 0;
  let activeLicence = 0;
  let activeCheckouts = 0;

  function marker(id) {
    return createHmac('sha256', sessionSecret).update(id).digest('base64url');
  }

  function session(req) {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim())
      .find(value => value.startsWith(`${cookieName}=`));
    const value = cookie?.slice(cookieName.length + 1) || '';
    const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (!match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(marker(match[1])))) return;
    const id = match[1];
    const entry = sessions.get(id);
    if (entry?.expires > Date.now()) return { id, ...entry };
    sessions.delete(id);
  }

  function pickStudioDestination(req, identity) {
    const entry = sessions.get(identity.id);
    const alias = rotation.pick(entry.studioAlias);
    if (req.method === 'GET') entry.studioAlias = alias;
    return `${alias}${STUDIO_WORKSPACE_PATH}`;
  }

  function cookie(value, maxAge) {
    return `${cookieName}=${value}; Path=/studio/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
  }

  function sessionCookie(req, owner = null) {
    const now = Date.now();
    for (const [id, entry] of sessions) if (entry.expires <= now) sessions.delete(id);
    const prior = session(req);
    if (prior) sessions.delete(prior.id);
    if (sessions.size >= 2048) sessions.delete(sessions.keys().next().value);
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { expires: now + ttl * 1000, owner });
    return cookie(`${id}.${marker(id)}`, ttl);
  }

  function revokeSessions(id) {
    for (const [key, entry] of sessions) if (entry.owner?.id === id) sessions.delete(key);
  }

  function workspaceContext(req, res) {
    const identity = session(req);
    const name = req.headers['x-plot-workspace'];
    if (identity && (identity.owner ? name !== identity.owner.id : name && name !== 'operator')) {
      respond(res, 409, 'The active workspace changed. Reopen Studio in this tab.');
      return null;
    }
    return { identity, workspace: identity?.owner ? workspaceFor(identity.owner.id) : operator };
  }

  async function serveEditor(req, res, identity) {
    let html = (await readFile(resolve(root, 'index.html'), 'utf8')).replace('<html lang="en">',
      `<html lang="en" data-workspace="${identity.owner?.id || 'operator'}">`);
    if (content && req.method !== 'HEAD') {
      let boot;
      try { boot = await content.create(identity); }
      catch (error) { return respond(res, error.status || 503, 'Studio could not start. Try again shortly.'); }
      html = html.replace('</head>', '<link rel="stylesheet" href="/studio/studio-bootstrap.css"></head>')
        .replace('<script type="module" src="./studio.mjs"></script>',
          '<section class="studio-boot-status" id="studio-boot-status" aria-label="Opening Studio">' +
          '<img src="/99host-assets/plot-mark.webp" width="54" height="54" alt="PLOT Studio">' +
          '<p role="status" aria-live="polite">Opening your workspace…</p>' +
          '<a href="/studio/" target="_top" hidden>Open Studio again</a></section>' +
          `<script type="module" src="/studio/studio-bootstrap.mjs" data-studio-boot="${boot.id}" data-boot-key="${boot.publicKey}"></script>`);
    }
    res.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': Buffer.byteLength(html) });
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  function clientIp(req) {
    const peer = req.socket.remoteAddress;
    const forwarded = req.headers['x-real-ip'];
    if (trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) && isIP(forwarded || '')) return forwarded;
    return peer;
  }

  function reserveAttempt(ip, entries = attempts, limit = maxAttempts, window = attemptWindow) {
    const now = Date.now();
    const previous = entries.get(ip);
    if (previous?.expires > now) {
      if (previous.count >= limit) return Math.ceil((previous.expires - now) / 1000);
      previous.count++;
      return 0;
    }
    if (entries.size >= 2048) {
      for (const [address, entry] of entries) if (entry.expires <= now) entries.delete(address);
      if (entries.size >= 2048) return 60;
    }
    entries.set(ip, { count: 1, expires: now + window });
    return 0;
  }

  async function handleCheckout(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return respond(res, 405, 'Method not allowed.');
    }
    if (req.headers.origin !== origin) return respond(res, 403, 'Request origin is not allowed.');
    if (!createCheckoutSession) return respond(res, 503, 'Checkout is unavailable.');
    if (req.headers['x-plot-accepted-terms'] !== checkoutTermsVersion) {
      return respond(res, 409, 'Accept the current terms before opening checkout.');
    }
    if (Number(req.headers['content-length'] || 0) || req.headers['transfer-encoding']) {
      return respond(res, 400, 'Expected an empty request body.');
    }
    const retryAfter = reserveAttempt(clientIp(req), checkoutAttempts, 8, 5 * 60 * 1000);
    if (retryAfter || activeCheckouts >= 12) {
      res.setHeader('Retry-After', String(retryAfter || 5));
      return respond(res, 429, 'Please try again in a moment.');
    }
    activeCheckouts++;
    try {
      const session = await createCheckoutSession();
      if (!session) return respond(res, 502, 'Could not open checkout.');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(session));
    } catch {
      return respond(res, 502, 'Could not reach checkout.');
    } finally {
      activeCheckouts--;
    }
  }

  async function handleAccountAccess(req, res, route, url) {
    const mode = route === '/register' ? 'register' : 'signIn';
    res.setHeader('Content-Security-Policy', publicPolicy);
    if (req.method === 'GET' || req.method === 'HEAD') return accessPage(req, res, mode, { next: studioDestination(url.searchParams.get('next') || '') });
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return respond(res, 405, 'Method not allowed.'); }
    if (req.headers.origin !== origin) return respond(res, 403, 'Request origin is not allowed.');
    if (!accounts) return accessPage(req, res, mode, { status: 503, message: 'Licence access is unavailable.' });
    const retry = reserveAttempt(clientIp(req), licenceAttempts, 14, 15 * 60 * 1000);
    if (retry || activeLicence >= 12) {
      res.setHeader('Retry-After', String(retry || 5));
      return accessPage(req, res, mode, { status: 429, message: 'Too many attempts. Try again later.' });
    }
    activeLicence++;
    try {
      const data = await readForm(req);
      const email = accountEmail(data?.get('email'));
      const credential = data?.get('licence') || '';
      const licence = credential.trim();
      const next = studioDestination(data?.get('next') || '');
      if (!email || !licence) return accessPage(req, res, mode, { status: 400, message: 'Enter your email and sign-in details.', email, next });
      let owner;
      try {
        if (mode === 'register') owner = await accounts.register(email, licence);
        else if (licensePattern.test(licence)) owner = await accounts.signIn(email, licence);
        else {
          const ip = clientIp(req);
          const retryPassword = reserveAttempt(ip);
          if (retryPassword || activeAuth >= 3) {
            res.setHeader('Retry-After', String(retryPassword || 5));
            return accessPage(req, res, mode, { status: 429, message: 'Too many attempts. Try again later.', email, next });
          }
          activeAuth++;
          try { owner = await accounts.signInWithPassword(email, credential); }
          finally { activeAuth--; }
          if (owner) attempts.delete(ip);
        }
      } catch (error) {
        if (!error.status) throw error;
        return accessPage(req, res, mode, { status: error.status, message: error.message, email, next });
      }
      if (!owner) return accessPage(req, res, mode, { status: 401, message: 'The email and sign-in details could not be matched to an active account.', email, next });
      licenceAttempts.delete(clientIp(req));
      res.setHeader('Set-Cookie', sessionCookie(req, owner));
      return redirect(res, rotation.enabled && next === '/studio/' ? '/studio/launch' : next);
    } finally { activeLicence--; }
  }

  const licenceNotices = new Map();
  async function handleLicences(req, res) {
    const identity = session(req);
    if (!identity) return redirect(res, '/admin/sign-in', 302);
    if (identity.owner) return respond(res, 403, 'Only the operator can manage licences.');
    if (!accounts) return respond(res, 503, 'Licence access is unavailable.');
    res.setHeader('Content-Security-Policy', publicPolicy);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const notice = licenceNotices.get(identity.id);
      if (req.method === 'GET') licenceNotices.delete(identity.id);
      return licencesPage(req, res, await accounts.list(), notice?.expires > Date.now() ? notice : undefined);
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return respond(res, 405, 'Method not allowed.'); }
    if (req.headers.origin !== origin) return respond(res, 403, 'Request origin is not allowed.');
    const data = await readForm(req);
    const action = data?.get('action');
    let notice;
    try {
      if (action === 'issue') {
        const email = accountEmail(data.get('email'));
        if (!email) return licencesPage(req, res, await accounts.list(), { status: 400, message: 'Enter the email used at checkout.' });
        notice = { revealed: await accounts.issue(email) };
      } else if (action === 'provision') {
        const email = accountEmail(data.get('email'));
        if (!email) return licencesPage(req, res, await accounts.list(), { status: 400, message: 'Enter an account email.' });
        if (activeAuth >= 3) {
          res.setHeader('Retry-After', '5');
          return respond(res, 429, 'Sign-in services are busy. Try again shortly.');
        }
        activeAuth++;
        try {
          const updated = await accounts.provision(email, data.get('password') || '');
          revokeSessions(updated.id);
        } finally { activeAuth--; }
        notice = { message: 'The account can now sign in with its password.' };
      } else if (['replace', 'revoke'].includes(action) && accountId.test(data.get('id') || '')) {
        const updated = await accounts.change(data.get('id'), action);
        revokeSessions(updated.id);
        notice = action === 'replace' ? { revealed: updated } : { message: 'Licence revoked.' };
      } else return respond(res, 400, 'Choose a licence operation.');
    } catch (error) {
      if (!error.status) throw error;
      return licencesPage(req, res, await accounts.list(), { status: error.status, message: error.message });
    }
    const expires = Date.now() + 2 * 60 * 1000;
    licenceNotices.set(identity.id, { ...notice, expires });
    setTimeout(() => { if (licenceNotices.get(identity.id)?.expires === expires) licenceNotices.delete(identity.id); }, 2 * 60 * 1000).unref();
    return redirect(res, '/studio/licences');
  }

  async function handlePost(req, res, route) {
    if (req.headers.origin !== origin) return respond(res, 403, 'Request origin is not allowed.');
    if (route === '/logout') return redirect(res, '/studio/logout', 307);
    if (route === '/studio/logout') {
      const identity = session(req);
      if (identity) { sessions.delete(identity.id); licenceNotices.delete(identity.id); }
      res.setHeader('Set-Cookie', cookie('', 0));
      return redirect(res, '/');
    }
    const ip = clientIp(req);
    const retryAfter = reserveAttempt(ip);
    if (retryAfter || activeAuth >= 3) {
      res.setHeader('Retry-After', String(retryAfter || 5));
      return respond(res, 429, 'Too many sign-in attempts. Try again later.');
    }
    const credentials = await readPassword(req);
    if (!credentials) return redirect(res, '/admin/sign-in?login=failed');
    if (activeAuth >= 3) {
      res.setHeader('Retry-After', '5');
      return respond(res, 429, 'Too many sign-in attempts. Try again later.');
    }
    activeAuth++;
    try {
      const expected = await deriveKey(credentials.password, salt, 32, scryptOptions);
      if (!timingSafeEqual(expected, digest)) return redirect(res, `/admin/sign-in?login=failed&next=${encodeURIComponent(credentials.next)}`);
    } finally {
      activeAuth--;
    }
    attempts.delete(ip);
    res.setHeader('Set-Cookie', sessionCookie(req));
    const destination = rotation.enabled && credentials.next === '/studio/' ? '/studio/launch' : credentials.next;
    return redirect(res, destination);
  }

  async function serveStudioAlias(req, res, url) {
    if (!rotation.enabled) return respond(res, 404, 'Page not found.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return respond(res, 405, 'Method not allowed.');
    }
    const route = url.pathname;
    const asset = studioAliasFiles.get(route);
    if (asset) return serveFile(req, res, resolve(root, asset));
    if (!['/', '/studio', '/studio/'].includes(route)) return respond(res, 404, 'Page not found.');
    if (route !== '/studio/' || url.searchParams.get('workspace') !== '1') {
      return redirect(res, `${origin}/studio/launch`, 302);
    }
    res.setHeader('Content-Security-Policy', [
      "default-src 'none'", "style-src 'self'", "script-src 'self'", `connect-src ${origin}`,
      `frame-src ${origin}`, "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'",
    ].join('; '));
    return serveFile(req, res, resolve(root, 'studio-alias.html'));
  }

  const server = createServer({ requestTimeout: 12000, headersTimeout: 10000 }, async (req, res) => {
    headers(res);
    try {
      const url = new URL(req.url, origin);
      const route = url.pathname;
      if (isStudioContentHost(req.headers.host)) {
        if (!content) return respond(res, 404, 'Page not found.');
        return content.serve(req, res, url);
      }
      if (isStudioAliasHost(req.headers.host)) return await serveStudioAlias(req, res, url);
      const bootRoute = /^\/studio\/boot\/([A-Za-z0-9_-]{43})$/.exec(route);
      if (bootRoute) {
        if (!content) return respond(res, 404, 'Page not found.');
        const identity = session(req);
        if (!identity) return respond(res, 401, 'Sign in to Studio.');
        if (req.method === 'DELETE') {
          if (req.headers.origin !== origin) return respond(res, 403, 'Send this request from Studio.');
          content.complete(bootRoute[1], identity);
          res.writeHead(204);
          return res.end();
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD, DELETE');
          return respond(res, 405, 'Method not allowed.');
        }
        const manifest = content.manifest(bootRoute[1], identity);
        if (!manifest) return respond(res, 404, 'This workspace start expired.');
        const bytes = Buffer.from(JSON.stringify(manifest));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (route.startsWith('/certification/api/') || route === '/certification/stripe/webhook') {
        return await exams(req, res, url);
      }
      if (route === '/license/checkout/session') return await handleCheckout(req, res);
      if (route === '/sign-in' || route === '/register') return await handleAccountAccess(req, res, route, url);
      if (route === '/studio/licences') return await handleLicences(req, res);
      if (route === '/asset' || route.startsWith('/asset/')) {
        const scoped = /^\/asset\/u\/([a-f0-9]{32})\/(.+)$/.exec(route);
        if (!scoped) return await operator.assets(req, res, url, false);
        if (!await accounts?.find(scoped[1])) return respond(res, 404, 'Image not found.');
        url.pathname = `/asset/${scoped[2]}`;
        return await workspaceFor(scoped[1]).assets(req, res, url, false);
      }
      if (route === '/studio/api/assets' || route === '/studio/api/assets/stock' || route.startsWith('/studio/api/assets/stock/')) {
        const context = workspaceContext(req, res);
        if (context) return await context.workspace.assets(req, res, url, context.identity);
        return;
      }
      if (['/s/_assets/hosted.css', '/s/_assets/hosted-runner.mjs', '/s/_assets/publication-packet.mjs'].includes(route) && ['GET', 'HEAD'].includes(req.method)) {
        return await serveFile(req, res, resolve(root, route.split('/').at(-1)));
      }
      if (route.startsWith('/s/')) {
        const scoped = /^\/s\/u\/([a-f0-9]{32})\/(.+)$/.exec(route);
        if (!scoped) return await operator.hosted(req, res, url, false);
        if (!await accounts?.find(scoped[1])) return respond(res, 404, 'This hosted site was not found.');
        url.pathname = `/s/${scoped[2]}`;
        return await workspaceFor(scoped[1]).hosted(req, res, url, false);
      }
      if (route === '/studio/api/plot-file/seal' || route === '/studio/api/plot-file/open') {
        const context = workspaceContext(req, res);
        if (context) return await context.workspace.files(req, res, route.endsWith('/seal'), context.identity);
        return;
      }
      if (route.startsWith('/studio/sites/')) {
        const scoped = /^\/studio\/sites\/u\/([a-f0-9]{32})\/(.+)$/.exec(route);
        const identity = session(req);
        if (!scoped) {
          if (identity?.owner) return respond(res, 404, 'This hosted site was not found.');
          return await operator.hosted(req, res, url, identity);
        }
        if ((identity && identity.owner?.id !== scoped[1]) || !await accounts?.find(scoped[1])) return respond(res, 404, 'This hosted site was not found.');
        url.pathname = `/studio/sites/${scoped[2]}`;
        return await workspaceFor(scoped[1]).hosted(req, res, url, identity);
      }
      if (route.startsWith('/studio/api/backend/') || route === '/studio/api/sites' || route.startsWith('/studio/api/sites/')) {
        const context = workspaceContext(req, res);
        if (context) return await context.workspace.hosted(req, res, url, context.identity);
        return;
      }
      if (route === '/studio/api/projects' || route.startsWith('/studio/api/projects/')) {
        const context = workspaceContext(req, res);
        if (!context) return;
        if (!context.workspace.drafts) return respond(res, 503, 'Server projects are unavailable.');
        return await context.workspace.drafts(req, res, route, context.identity);
      }
      if (route === '/studio/api/working-draft') {
        const context = workspaceContext(req, res);
        if (!context) return;
        if (!context.identity) return respond(res, 401, 'Sign in to Studio to continue.');
        if (!context.workspace.workingDraft) return respond(res, 404, 'A licensed workspace is required.');
        return await context.workspace.workingDraft(req, res);
      }
      const isPostRoute = ['/login', '/logout', '/studio/logout'].includes(route);
      if (isPostRoute && req.method === 'POST') return await handlePost(req, res, route);
      if (isPostRoute || !['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', isPostRoute ? 'POST' : 'GET, HEAD');
        return respond(res, 405, 'Method not allowed.');
      }
      if (route === '/') {
        res.setHeader('Content-Security-Policy', publicPolicy);
        return await serveFile(req, res, resolve(publicFiles, 'index.html'));
      }
      if (['/sign-in/', '/register/', '/admin/sign-in/', '/studio/account/'].includes(route)) return redirect(res, route.slice(0, -1) + url.search, 308);
      if (route === '/admin/sign-in') {
        res.setHeader('Content-Security-Policy', publicPolicy);
        return await accessPage(req, res, 'operator', { next: studioDestination(url.searchParams.get('next') || ''), message: url.searchParams.get('login') === 'failed' ? 'Incorrect password. Try again.' : '' });
      }
      if (route === '/studio/account') {
        const identity = session(req);
        if (!identity) return redirect(res, '/sign-in', 302);
        if (!identity.owner) return redirect(res, '/studio/licences', 302);
        res.setHeader('Content-Security-Policy', publicPolicy);
        return await accountPage(req, res, identity.owner);
      }
      if (route === '/docs/' || route === '/docs/nodes/' || route === '/docs/design/') return redirect(res, route.slice(0, -1) + url.search, 308);
      if (route === '/docs' || route === '/docs/design') {
        res.setHeader('Content-Security-Policy', publicPolicy);
        return await serveFile(req, res, resolve(publicFiles, route === '/docs' ? 'docs.html' : 'design-handbook.html'));
      }
      const designTemplate = /^\/docs\/design\/templates\/([a-z0-9]+(?:-[a-z0-9]+)*\.plot)$/.exec(route);
      if (designTemplate) {
        const file = designTemplate[1];
        const raw = await readFile(resolve(publicFiles, 'media', 'design-templates', file)).catch(error => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (!raw) return respond(res, 404, 'Page not found.');
        return sendPlotFile(req, res, templateCodec.seal(parsePlotProject(raw)), file);
      }
      if (route === '/license/') return redirect(res, '/license' + url.search, 308);
      if (route === '/license') {
        res.setHeader('Content-Security-Policy', checkoutPolicy);
        return await serveFile(req, res, resolve(publicFiles, 'license.html'));
      }
      if (route === '/terms/') return redirect(res, '/terms' + url.search, 308);
      if (route === '/terms') {
        res.setHeader('Content-Security-Policy', publicPolicy);
        return await serveFile(req, res, resolve(publicFiles, 'terms.html'));
      }
      if (route.endsWith('/') && certificationPages.has(route.slice(0, -1))) {
        return redirect(res, route.slice(0, -1) + url.search, 308);
      }
      if (certificationPages.has(route)) {
        const acceptsPayment = route === '/certification/builder' || route === '/certification/workflow-architect';
        res.setHeader('Content-Security-Policy', acceptsPayment ? checkoutPolicy : publicPolicy);
        if (route === '/certification/attempt' || route === '/certification/verify') res.setHeader('X-Robots-Tag', 'noindex');
        return await serveFile(req, res, resolve(publicFiles, certificationPages.get(route)));
      }
      if (route === '/certification/sample-certificate.pdf' || route === '/certification/sample-certificate-builder.pdf') {
        return await serveFile(req, res, resolve(publicFiles, 'media', route.split('/').at(-1)));
      }
      if (route === '/docs/nodes') {
        const contents = Buffer.from(await renderNodeReference(url));
        res.setHeader('Content-Security-Policy', publicPolicy);
        res.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': contents.length });
        return res.end(req.method === 'HEAD' ? undefined : contents);
      }
      if (route === '/99host-assets/public.css' || route === '/99host-assets/public.mjs') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return await serveFile(req, res, resolve(publicFiles, route.split('/').at(-1)));
      }
      if (route === '/99host-assets/docs.css' || route === '/99host-assets/node-reference.css' || route === '/99host-assets/site-chrome.css' ||
          route === '/99host-assets/design-handbook.css' ||
          route === '/99host-assets/site-chrome.mjs' ||
          route === '/99host-assets/license-checkout.mjs' || route === '/99host-assets/certification.css' || route === '/99host-assets/certification-admissions.css' ||
          route === '/99host-assets/certification-practice.css' || route === '/99host-assets/certification.mjs' ||
          route === '/99host-assets/cookie-notice.css' || route === '/99host-assets/cookie-notice.js' || route === '/99host-assets/workspace-access.css') {
        return await serveFile(req, res, resolve(publicFiles, route.split('/').at(-1)));
      }
      const sketch = /^\/99host-assets\/handbook\/([a-z0-9]+(?:-[a-z0-9]+)*\.webp)$/.exec(route);
      if (sketch) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return await serveFile(req, res, resolve(publicFiles, 'media', 'handbook', sketch[1]));
      }
      const hotelImage = /^\/99host-assets\/hotel\/([a-z0-9]+(?:-[a-z0-9]+)*\.webp)$/.exec(route);
      if (hotelImage) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return await serveFile(req, res, resolve(assetRoot, 'hotel', hotelImage[1]));
      }
      if (/^\/99host-assets\/(?:design|logic|data|plot-mark|certificate(?:-builder)?-preview|entry-(?:ribs|basalt|glass|night-palms|painter)|overview-(?:design|blueprint|backend|publish)|product-(?:studio-lifetime|certified-builder|workflow-architect)|store-(?:studio|builder|architect))\.webp$/.test(route)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return await serveFile(req, res, resolve(publicFiles, 'media', route.split('/').at(-1)));
      }
      if (route === '/studio') return redirect(res, '/studio/', 308);
      if (route === '/studio/launch') {
        const identity = session(req);
        if (!identity) return redirect(res, '/sign-in', 302);
        if (!rotation.enabled) return redirect(res, '/studio/', 302);
        const destination = pickStudioDestination(req, identity);
        const document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Open PLOT Studio</title>' +
          `<meta http-equiv="refresh" content="0;url=${destination}"></head>` +
          `<body><a href="${destination}">Open Studio</a></body></html>`;
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(document) });
        return res.end(req.method === 'HEAD' ? undefined : document);
      }
      if (route === '/studio/session') {
        const source = req.headers.origin;
        if (!rotation.enabled || !isStudioAliasOrigin(source)) return respond(res, 404, 'Page not found.');
        const authenticated = Boolean(session(req));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin',
          'Access-Control-Allow-Origin': source, 'Access-Control-Allow-Credentials': 'true',
        });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ authenticated }));
      }
      if (route === '/studio/editor') {
        if (!rotation.enabled) return respond(res, 404, 'Page not found.');
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          return respond(res, 405, 'Method not allowed.');
        }
        const identity = session(req);
        if (req.headers['sec-fetch-dest'] !== 'iframe') {
          return redirect(res, identity ? pickStudioDestination(req, identity) : '/sign-in', 302);
        }
        if (!isStudioFrameNavigation(req)) return respond(res, 403, 'Open Studio from its launch page.');
        if (!identity) return respond(res, 401, 'Sign in to Studio to continue.');
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', `frame-ancestors ${STUDIO_ALIAS_ORIGINS.join(' ')}`);
        return await serveEditor(req, res, identity);
      }
      if (route.startsWith('/studio/')) {
        const identity = session(req);
        if (!identity) return redirect(res, '/sign-in', 302);
        if (rotation.enabled && (route === '/studio/' || route === '/studio/index.html')) {
          return redirect(res, pickStudioDestination(req, identity), 302);
        }
        const relative = route.slice('/studio/'.length) || 'index.html';
        if (relative === 'index.html') return await serveEditor(req, res, identity);
        if (studioFiles.has(relative)) return await serveFile(req, res, resolve(root, relative));
        if (/^assets\/(?:[\w-]+\/)*[\w.-]+$/.test(relative)) {
          const path = resolve(root, relative);
          if (path.startsWith(assetRoot + sep)) return await serveFile(req, res, path);
        }
      }
      return respond(res, 404, 'Page not found.');
    } catch (error) {
      if (!res.headersSent && !res.destroyed) respond(res, 500, 'Internal server error.');
      else if (!res.destroyed) res.destroy();
      if (error.code !== 'ECONNRESET') console.error(error.message);
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`PLOT Studio listening on 127.0.0.1:${port}.`));
}

try {
  if (process.argv[2] === 'hash') await hashPassword();
  else start();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
