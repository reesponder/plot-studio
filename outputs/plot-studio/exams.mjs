import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examDefinitions } from './exam-grader.mjs';
import { assessmentFor, currentAssessmentVersion } from './exam-assessments.mjs';
import { createExamBrowserEvaluator } from './exam-browser.mjs';
import { createExamMailer } from './exam-mail.mjs';
import { createPlotFileCodec, plotFileMime } from './plot-file.mjs';
import sample from './certificate/sample.json' with { type: 'json' };
import builderSample from './certificate/sample-builder.json' with { type: 'json' };

export const certificationTermsVersion = '2026-11-16-certification-r3';
const api = '/certification/api/';
const stripeWebhook = '/certification/stripe/webhook';
const version = '2026-10-28.endive';
const maxAttempts = 3;
const mib = 1024 * 1024;
const tokenPattern = /^PX_[A-Za-z0-9_-]{43}$/;
const enrolmentPattern = /^exam_enr_[a-f0-9]{32}$/;
const certificatePattern = /^PLOT-[A-F0-9]{18}$/;
const qaPriceIds = new Set(['internal_builder_trial', 'internal_architect_trial']);
const sampleCertificates = new Map([sample, builderSample].map(record => [record.id, Object.freeze({
  ...record,
  title: examDefinitions[record.exam].title,
})]));
const sessionPattern = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const intentPattern = /^pi_[a-zA-Z0-9]+$/;
const storeFile = fileURLToPath(new URL('./exam_store.py', import.meta.url));
const graderFile = fileURLToPath(new URL('./exam_workflow_grade.py', import.meta.url));
const architectGraderFile = fileURLToPath(new URL('./exam_architect_v2.py', import.meta.url));
const mailFile = fileURLToPath(new URL('./exam_mail_worker.py', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const newCertificateId = () => 'PLOT-' + randomBytes(9).toString('hex').toUpperCase();

function issue(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

function download(res, body, contentType, filename) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': body.length,
  });
  res.end(body);
}

async function readBody(req, maximum) {
  if (Number(req.headers['content-length'] || 0) > maximum) {
    req.resume();
    throw issue(413, 'This request is too large.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maximum) chunks.push(chunk);
  }
  if (size > maximum) throw issue(413, 'This request is too large.');
  return Buffer.concat(chunks);
}

async function readJson(req, maximum = 8192, upload = null) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    req.resume();
    throw issue(415, 'Send an application/json request.');
  }
  const raw = await readBody(req, maximum);
  if (upload) upload.receivedAtMs = Date.now();
  try {
    const value = JSON.parse(raw.toString('utf-8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // The same response covers malformed JSON and a non-object body.
  }
  throw issue(400, 'Send a valid JSON object.');
}

function makeWorker(filename, { timeout, maxConcurrent, python }) {
  let running = 0;
  const env = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
    PYTHONUTF8: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  return async function call(args, payload) {
    if (running >= maxConcurrent) throw issue(503, 'Assessment services are busy. Try again in a moment.');
    const data = JSON.stringify(payload);
    running++;
    const result = new Promise((accept, reject) => {
      const child = spawn(python, [filename, ...args], { timeout, windowsHide: true, env });
      const output = [];
      let bytes = 0;
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > mib) child.kill();
        else output.push(chunk);
      });
      child.stderr.resume();
      child.on('error', () => reject(issue(503, 'Assessment services are temporarily unavailable.')));
      child.stdin.on('error', () => {});
      child.on('close', code => {
        if (code !== 0) return reject(issue(503, 'Assessment services are temporarily unavailable.'));
        try { accept(JSON.parse(Buffer.concat(output).toString('utf-8'))); }
        catch { reject(issue(503, 'Assessment services returned an unreadable result.')); }
      });
      child.stdin.end(data);
    });
    try { return await result; }
    finally { running--; }
  };
}

function getTokenHash(req) {
  const match = /^Bearer (PX_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
  if (!match || !tokenPattern.test(match[1])) {
    throw issue(401, 'Enter your private exam recovery code to open this enrolment.');
  }
  return hash(match[1]);
}

function emailFor(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  return address.length <= 254 && /^[a-z0-9!#$%&'*+/=?^_{}|~.\x60-]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address)
    ? address : null;
}

function candidateName(value) {
  if (typeof value !== 'string' || value.length > 120) return null;
  const name = value.trim().normalize('NFC').replace(/\s+/g, ' ');
  return name.length >= 2 && /^[\p{L}\p{M}\p{N}.'’\- \u00b7]+$/u.test(name) && /\p{L}/u.test(name) ? name : null;
}

function hostedPaymentLink(raw) {
  try {
    const link = new URL(raw);
    if (link.origin === 'https://buy.stripe.com' && !link.username && !link.password &&
        !link.search && !link.hash && /^\/(?:test_)?[a-zA-Z0-9]{8,100}$/.test(link.pathname)) return link;
  } catch {}
  return null;
}

function paymentConfiguration() {
  const secretKey = process.env.PLOT_STRIPE_SECRET_KEY || '';
  const publishableKey = process.env.PLOT_STRIPE_PUBLISHABLE_KEY || '';
  const webhookSecret = process.env.PLOT_EXAM_STRIPE_WEBHOOK_SECRET || '';
  const mode = /^(?:rk|sk)_(live|test)_[a-zA-Z0-9]+$/.exec(secretKey)?.[1];
  const embedded = mode && new RegExp(`^pk_${mode}_[a-zA-Z0-9]+$`).test(publishableKey);
  const webhookConfigured = /^whsec_[a-zA-Z0-9]{16,}$/.test(webhookSecret);
  const live = mode === 'live';
  const offers = Object.fromEntries(Object.entries(examDefinitions).map(([exam, definition]) => {
    const prefix = `PLOT_EXAM_${exam.toUpperCase()}_`;
    const priceId = process.env[prefix + 'PRICE_ID'] || '';
    const paymentLinkId = process.env[prefix + 'PAYMENT_LINK_ID'] || '';
    const paymentLink = hostedPaymentLink(process.env[prefix + 'PAYMENT_LINK_URL']);
    let checkout = null;
    if (mode && webhookConfigured && /^price_[a-zA-Z0-9]+$/.test(priceId)) {
      if (process.env[prefix + 'CHECKOUT'] === 'payment_link') {
        if (/^plink_[a-zA-Z0-9]+$/.test(paymentLinkId) && paymentLink &&
            (paymentLink.pathname.startsWith('/test_') ? !live : live)) checkout = 'payment_link';
      } else if (embedded) {
        checkout = 'embedded';
      }
    }
    return [exam, { ...definition, amount: definition.amount, currency: 'usd', checkout, priceId, paymentLinkId, paymentLink }];
  }));
  return { secretKey, publishableKey, webhookSecret, webhookConfigured, mode, live, offers };
}

function signatureValid(raw, signature, secret) {
  if (typeof signature !== 'string' || signature.length > 2048) return false;
  const parts = signature.split(',').map(part => part.trim().split('=', 2));
  const timestamps = parts.filter(([name]) => name === 't');
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0][1])) return false;
  const timestamp = timestamps[0][1];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest();
  return parts.some(([name, value]) => name === 'v1' && /^[0-9a-f]{64}$/i.test(value) &&
    timingSafeEqual(expected, Buffer.from(value, 'hex')));
}

function createLimiter(clientIp) {
  const windows = new Map();
  return function limit(req, name, count, milliseconds) {
    const bucket = name + ':' + (clientIp?.(req) || req.socket.remoteAddress || 'loopback');
    const timestamp = Date.now();
    const previous = windows.get(bucket);
    if (previous && previous.expires > timestamp) {
      if (previous.used >= count) throw issue(429, 'Too many attempts. Try again in a moment.');
      previous.used++;
      return;
    }
    if (windows.size >= 4096) {
      for (const [id, value] of windows) if (value.expires <= timestamp) windows.delete(id);
      if (windows.size >= 4096) throw issue(503, 'Assessment services are busy. Try again in a moment.');
    }
    windows.set(bucket, { expires: timestamp + milliseconds, used: 1 });
  };
}

function stripeClient(secretKey) {
  return async (endpoint, params = null, idempotencyKey = '') => {
    let response;
    try {
      response = await fetch('https://api.stripe.com/v1/' + endpoint, {
        method: params ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Stripe-Version': version,
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: params || undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw issue(502, 'Stripe could not be reached. Try again in a moment.');
    }
    if (!response.ok) {
      console.warn('Certification Stripe API returned', response.status, response.headers.get('request-id'));
      await response.body?.cancel().catch(() => {});
      throw issue(502, 'Stripe could not confirm this checkout. Try again in a moment.');
    }
    return response.json();
  };
}

function certificateView(row) {
  return !qaPriceIds.has(row.price_id) && row.state === 'passed' && row.certificate_id ? {
    id: row.certificate_id,
    name: row.name,
    exam: row.exam,
    title: examDefinitions[row.exam].title,
    issuedAt: row.issued_at,
    assessmentVersion: row.assessment_version,
  } : null;
}

function enrolmentView(row) {
  const accessGranted = !!row.access_granted;
  const timer = accessGranted ? row.timer : null;
  const canViewBrief = accessGranted && taskAccess(row);
  const assessment = assessmentFor(row.exam, row.assessment_version);
  return {
    exam: row.exam,
    state: row.state,
    name: accessGranted ? row.name : null,
    accessGranted,
    emailDelivery: row.email_delivery,
    timer,
    attempts: accessGranted ? row.attempts : 0,
    maxAttempts,
    ...(qaPriceIds.has(row.price_id) ? { testAttempt: true } : {}),
    assessmentVersion: row.assessment_version,
    taskCount: assessment.brief.tasks.length,
    passScore: examDefinitions[row.exam].passScore,
    latestResult: accessGranted ? row.latest_result : null,
    certificate: accessGranted ? certificateView(row) : null,
    ...(canViewBrief ? { brief: assessment.brief } : {}),
  };
}

function taskAccess(row) {
  return ['paid', 'passed'].includes(row.state) && (!row.timer || row.timer.state === 'running');
}

export function createExamService({ directory, origin, renderCertificate, clientIp, plotFiles = createPlotFileCodec(), starterFiles = plotFiles, openSubmission = file => plotFiles.open(file) }) {
  const settings = paymentConfiguration();
  const database = directory && resolve(directory, 'certification.sqlite3');
  const python = process.env.PLOT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const storage = makeWorker(storeFile, { timeout: 11000, maxConcurrent: 10, python });
  const evaluator = makeWorker(graderFile, { timeout: 9500, maxConcurrent: 2, python });
  const architectEvaluator = makeWorker(architectGraderFile, { timeout: 34000, maxConcurrent: 2, python });
  const evaluateBrowser = createExamBrowserEvaluator();
  const mailTransport = makeWorker(mailFile, { timeout: 12000, maxConcurrent: 2, python });
  const limit = createLimiter(clientIp);
  const stripe = stripeClient(settings.secretKey);
  let pdfs = 0;

  async function db(operation, params) {
    if (!database) throw issue(503, 'Certification enrolments are not configured.');
    const result = await storage([database, operation], params);
    if (result.status >= 400) throw issue(result.status, result.payload.error);
    return result.payload;
  }

  const mailer = createExamMailer({ origin, db, worker: mailTransport, enabled: !!database });

  async function getEnrolment(req, requireWorkspace = false) {
    const tokenHash = getTokenHash(req);
    const row = await db('token', { tokenHash });
    if (!row) throw issue(404, 'No enrolment matches this recovery code.');
    if (requireWorkspace && !row.access_granted) {
      throw issue(403, 'Open the access link sent to your checkout email.');
    }
    return { tokenHash, row };
  }

  function requireOrigin(req) {
    if (req.headers.origin !== origin) throw issue(403, 'Request origin is not allowed.');
  }

  async function checkOffer(offer) {
    const price = await stripe('prices/' + offer.priceId);
    if (!price.active || price.livemode !== settings.live || price.currency !== offer.currency ||
        price.unit_amount !== offer.amount || price.type !== 'one_time' || price.tax_behavior === 'inclusive') {
      throw issue(503, 'This assessment price is being configured. Come back soon.');
    }
    if (offer.checkout !== 'payment_link') return;
    const link = await stripe('payment_links/' + offer.paymentLinkId);
    const lineItems = await stripe('payment_links/' + offer.paymentLinkId + '/line_items?limit=2');
    if (!link.active || link.livemode !== settings.live || link.url !== offer.paymentLink.href ||
        link.automatic_tax?.enabled !== true || link.allow_promotion_codes ||
        !matchingLineItem(lineItems, offer.priceId)) {
      throw issue(503, 'This assessment payment link is being configured. Come back soon.');
    }
  }

  function matchingLineItem(items, expected) {
    return items.has_more === false && items.data?.length === 1 &&
      items.data[0]?.price?.id === expected && items.data[0]?.quantity === 1;
  }

  async function checkout(req, res) {
    requireOrigin(req);
    limit(req, 'purchase', 8, 15 * 60 * 1000);
    const values = await readJson(req);
    const exam = values.exam;
    if (typeof exam !== 'string' || !Object.hasOwn(settings.offers, exam)) throw issue(404, 'Assessment not found.');
    const name = candidateName(values.name);
    const email = emailFor(values.email);
    if (!name || !email) throw issue(422, 'Enter a certificate name and a valid email for Stripe.');
    if (values.acceptedTerms !== certificationTermsVersion) throw issue(409, 'Accept the current certification terms before continuing.');
    const offer = settings.offers[exam];
    if (!database || !offer.checkout || !await mailer.check()) throw issue(503, 'Enrolment is not open for this assessment yet.');
    await checkOffer(offer);
    const id = 'exam_enr_' + randomBytes(16).toString('hex');
    const token = 'PX_' + randomBytes(32).toString('base64url');
    const acceptedAt = now();
    await db('create', {
      id, tokenHash: hash(token), exam, name, email, termsVersion: certificationTermsVersion, acceptedAt,
      assessmentVersion: currentAssessmentVersion,
      checkoutKind: offer.checkout, priceId: offer.priceId, amount: offer.amount,
      paymentLinkId: offer.checkout === 'payment_link' ? offer.paymentLinkId : null,
    });
    if (offer.checkout === 'payment_link') {
      const paymentUrl = new URL(offer.paymentLink.href);
      paymentUrl.searchParams.set('client_reference_id', id);
      return json(res, 201, { token, paymentUrl: paymentUrl.href });
    }
    try {
      const options = new URLSearchParams({
        ui_mode: 'embedded_page',
        mode: 'payment',
        redirect_on_completion: 'never',
        client_reference_id: id,
        customer_email: email,
        'automatic_tax[enabled]': 'true',
        'adaptive_pricing[enabled]': 'false',
        'line_items[0][price]': offer.priceId,
        'line_items[0][quantity]': '1',
      });
      const audit = { program: 'plot-studio-certification', exam, enrolment: id, terms_version: certificationTermsVersion, terms_accepted_at: acceptedAt };
      for (const [field, value] of Object.entries(audit)) {
        options.set(`metadata[${field}]`, value);
        options.set(`payment_intent_data[metadata][${field}]`, value);
      }
      const session = await stripe('checkout/sessions', options, id);
      if (sessionPattern.exec(session.id)?.[1] !== settings.mode || session.livemode !== settings.live ||
          typeof session.client_secret !== 'string') {
        throw issue(502, 'Stripe returned an invalid checkout session.');
      }
      await db('checkout_session', { id, session: session.id });
      return json(res, 201, { token, clientSecret: session.client_secret, publishableKey: settings.publishableKey });
    } catch (error) {
      await db('discard', { id }).catch(() => {});
      throw error;
    }
  }

  async function stripeEvent(req, res) {
    if (!database || !settings.mode || !settings.webhookConfigured) {
      throw issue(503, 'The certification webhook is not configured.');
    }
    const body = await readBody(req, mib);
    if (!signatureValid(body, req.headers['stripe-signature'], settings.webhookSecret)) {
      throw issue(400, 'Invalid Stripe signature.');
    }
    let event;
    try { event = JSON.parse(body.toString('utf-8')); }
    catch { throw issue(400, 'Invalid Stripe event.'); }
    const payload = event?.data?.object;
    if (event?.livemode !== settings.live || !payload) return json(res, 200, { received: true });
    if (event.type === 'charge.refunded') {
      if (payload.refunded === true && intentPattern.test(payload.payment_intent)) {
        await db('refund', { intent: payload.payment_intent, at: now(),
          certificationPayment: payload.metadata?.program === 'plot-studio-certification' });
      }
      return json(res, 200, { received: true });
    }
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) ||
        payload.status !== 'complete' || payload.payment_status !== 'paid' || payload.mode !== 'payment' ||
        !enrolmentPattern.test(payload.client_reference_id) ||
        sessionPattern.exec(payload.id)?.[1] !== settings.mode || !intentPattern.test(payload.payment_intent)) {
      return json(res, 200, { received: true });
    }
    const row = await db('reference', { id: payload.client_reference_id });
    if (!row || row.state !== 'awaiting_payment') return json(res, 200, { received: true });
    const matchesCheckout = row.checkout_kind === 'embedded'
      ? !payload.payment_link && payload.id === row.stripe_session && payload.metadata?.enrolment === row.id &&
        payload.metadata?.program === 'plot-studio-certification' && payload.metadata?.exam === row.exam
      : payload.payment_link === row.payment_link_id;
    const email = emailFor(payload.customer_details?.email || payload.customer_email);
    if (!matchesCheckout || email !== row.email || payload.currency !== 'usd' || payload.amount_subtotal !== row.amount ||
        !Number.isSafeInteger(payload.amount_total) || payload.amount_total < row.amount) {
      console.warn('Certification payment requires manual reconciliation for', row.id);
      return json(res, 200, { received: true });
    }
    const lineItems = await stripe('checkout/sessions/' + payload.id + '/line_items?limit=2');
    if (!matchingLineItem(lineItems, row.price_id)) {
      console.warn('Certification payment price mismatch for', row.id);
      return json(res, 200, { received: true });
    }
    let refunded = false;
    if (row.checkout_kind === 'payment_link') {
      const payment = await stripe('payment_intents/' + payload.payment_intent + '?expand[]=latest_charge');
      refunded = payment.latest_charge?.refunded === true;
    }
    const atMs = Date.now();
    const activation = await db('activate', {
      id: row.id, session: payload.id, intent: payload.payment_intent,
      at: new Date(atMs).toISOString(), atMs, refunded, inviteNonce: randomBytes(18).toString('base64url'),
    });
    if (activation.changed) void mailer.drain();
    return json(res, 200, { received: true });
  }

  async function submission(req, res) {
    requireOrigin(req);
    limit(req, 'submissions', 10, 10 * 60 * 1000);
    const { row, tokenHash } = await getEnrolment(req, true);
    if (row.state === 'passed') return json(res, 200, enrolmentView(row));
    if (row.state !== 'paid') throw issue(409, 'The assessment requires a confirmed payment.');
    if (row.attempts >= maxAttempts) throw issue(409, 'All three scored submissions for this enrolment have been used.');
    const upload = {};
    let values;
    if (req.headers['content-type'] === plotFileMime) {
      const raw = await readBody(req, 4 * mib);
      upload.receivedAtMs = Date.now();
      const consent = req.headers['x-plot-publish-certificate'];
      values = { project: await openSubmission(raw, row.email), publishCertificate: consent === 'true' ? true : consent === 'false' ? false : undefined };
    } else values = await readJson(req, 4 * mib, upload);
    const testAttempt = qaPriceIds.has(row.price_id);
    if (!testAttempt && typeof values.publishCertificate !== 'boolean') {
      throw issue(422, 'Choose whether your certificate can be verified publicly.');
    }
    const projectSource = JSON.stringify(values.project);
    if (projectSource === undefined) throw issue(422, 'Upload the editable .plot project file from PLOT Studio.');
    const projectHash = hash(projectSource);
    const lease = randomBytes(16).toString('hex');
    const reservation = await db('reserve_submission', {
      tokenHash, projectHash, lease, acceptedMs: upload.receivedAtMs,
    });
    if (!reservation.reserved) return json(res, 200, enrolmentView(reservation.enrolment));
    try {
      const assessment = assessmentFor(row.exam, row.assessment_version);
      const evaluateBackend = row.assessment_version === 2 ? architectEvaluator : evaluator;
      const result = await assessment.grade(values.project, payload => evaluateBackend([], payload), evaluateBrowser);
      const graded = await db('submission', {
        tokenHash, lease, projectHash, result, at: now(), certificateId: testAttempt ? null : newCertificateId(),
        publishCertificate: !testAttempt && values.publishCertificate,
      });
      return json(res, 200, enrolmentView(graded));
    } catch (error) {
      await db('release_submission', { lease }).catch(() => {});
      throw error;
    }
  }

  async function adjustTimer(req, res, action) {
    requireOrigin(req);
    limit(req, 'exam-timer', 35, 15 * 60 * 1000);
    const { tokenHash } = await getEnrolment(req, true);
    await readJson(req);
    const row = await db('clock', { tokenHash, action });
    return json(res, 200, enrolmentView(row));
  }

  async function redeemAccess(req, res) {
    requireOrigin(req);
    limit(req, 'exam-access', 30, 15 * 60 * 1000);
    const { accessToken } = await readJson(req);
    const invite = mailer.verifyAccessToken(accessToken);
    if (!invite) throw issue(404, 'The exam access link is invalid or has expired.');
    const token = 'PX_' + randomBytes(32).toString('base64url');
    const row = await db('redeem', { ...invite, tokenHash: hash(token) });
    return json(res, 200, { token, enrolment: enrolmentView(row) });
  }

  async function publish(req, res) {
    requireOrigin(req);
    limit(req, 'certificate-publish', 10, 10 * 60 * 1000);
    const tokenHash = getTokenHash(req);
    const request = await readJson(req);
    if (request.publishCertificate !== true) throw issue(422, 'Confirm public verification of this certificate.');
    const row = await db('publish', { tokenHash, certificateId: newCertificateId(), at: now() });
    return json(res, 200, enrolmentView(row));
  }

  async function pdf(req, res) {
    limit(req, 'certificate-pdf', 10, 10 * 60 * 1000);
    const { row } = await getEnrolment(req, true);
    const certificate = certificateView(row);
    if (!certificate) throw issue(404, 'Issue a verifiable certificate before downloading it.');
    if (typeof renderCertificate !== 'function') throw issue(503, 'Certificate downloads are temporarily unavailable.');
    if (pdfs >= 2) throw issue(503, 'Certificate downloads are busy. Try again in a moment.');
    pdfs++;
    try {
      const file = await renderCertificate(certificate);
      if (!Buffer.isBuffer(file) || file.length < 5 || file.subarray(0, 5).toString() !== '%PDF-') {
        throw issue(503, 'Certificate downloads are temporarily unavailable.');
      }
      return download(res, file, 'application/pdf', certificate.id + '.pdf');
    } finally {
      pdfs--;
    }
  }

  return async function handle(req, res, url) {
    const route = url.pathname;
    try {
      const timerAction = /^\/certification\/api\/timer\/(start|pause|resume)$/.exec(route);
      const post = new Set([api + 'checkout', api + 'submission', api + 'certificate', api + 'access/redeem', stripeWebhook]);
      const get = new Set([api + 'offers', api + 'enrolment', api + 'certificate.pdf']);
      const starter = /^\/certification\/api\/starter\/(builder|architect)$/.exec(route);
      const verifier = /^\/certification\/api\/certificates\/(PLOT-(?:[A-F0-9]{18}|SAMPLE(?:-BUILDER)?))$/i.exec(route);
      if ((post.has(route) || timerAction) && req.method !== 'POST' || (get.has(route) || starter || verifier) && req.method !== 'GET') {
        res.setHeader('Allow', post.has(route) || timerAction ? 'POST' : 'GET');
        throw issue(405, 'Method not allowed.');
      }
      if (route === stripeWebhook) return await stripeEvent(req, res);
      if (route === api + 'offers') {
        const emailDeliveryReady = await mailer.check();
        return json(res, 200, Object.fromEntries(Object.entries(settings.offers).map(([exam, offer]) => [exam, {
          available: !!database && !!offer.checkout && emailDeliveryReady, amount: offer.amount, currency: offer.currency,
          checkout: database && emailDeliveryReady ? offer.checkout : null,
          emailDeliveryReady,
          assessmentVersion: currentAssessmentVersion,
          taskCount: assessmentFor(exam, currentAssessmentVersion).brief.tasks.length,
        }])));
      }
      if (route === api + 'checkout') return await checkout(req, res);
      if (route === api + 'submission') return await submission(req, res);
      if (route === api + 'certificate') return await publish(req, res);
      if (route === api + 'certificate.pdf') return await pdf(req, res);
      if (route === api + 'access/redeem') return await redeemAccess(req, res);
      if (timerAction) return await adjustTimer(req, res, timerAction[1]);
      if (route === api + 'enrolment') {
        limit(req, 'enrolment', 90, 5 * 60 * 1000);
        const { row } = await getEnrolment(req);
        return json(res, 200, enrolmentView(row));
      }
      if (starter) {
        limit(req, 'starter', 30, 5 * 60 * 1000);
        const { row } = await getEnrolment(req, true);
        if (row.exam !== starter[1] || !['paid', 'passed'].includes(row.state)) {
          throw issue(403, 'Open a paid enrolment for this assessment to download its starter.');
        }
        if (!taskAccess(row)) throw issue(409, 'The starter project is available during working time.');
        const name = `plot-${starter[1]}-starter.plot`;
        const body = starterFiles.seal(assessmentFor(row.exam, row.assessment_version).starter());
        return download(res, body, plotFileMime, name);
      }
      if (verifier) {
        limit(req, 'verify', 60, 5 * 60 * 1000);
        const id = verifier[1].toUpperCase();
        const sampleCertificate = sampleCertificates.get(id);
        if (sampleCertificate) return json(res, 200, sampleCertificate);
        const row = certificatePattern.test(id) ? await db('certificate', { id }) : null;
        const certificate = row && certificateView(row);
        if (!certificate) throw issue(404, 'No active certification matches this ID.');
        return json(res, 200, certificate);
      }
      throw issue(404, 'Certification endpoint not found.');
    } catch (error) {
      if (!error.status) console.error('Certification request failed:', error?.name || 'Error');
      return json(res, error.status || 500, { error: error.status ? error.message : 'Certification services are temporarily unavailable.' });
    }
  };
}
