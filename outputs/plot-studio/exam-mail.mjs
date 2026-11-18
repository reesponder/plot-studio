import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const emailPattern = /^[A-Za-z0-9][A-Za-z0-9._+%-]{0,63}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const hostPattern = /^(?:localhost|127\.0\.0\.1|::1|[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?)$/;
const accessPattern = /^PXE_(exam_enr_[a-f0-9]{32})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/;
const probeFreshness = 3 * 60 * 1000;
const probeRetry = 45 * 1000;

export function examAccessSigningKey() {
  const value = process.env.PLOT_EXAM_ACCESS_SECRET || '';
  if (!/^[A-Za-z0-9_-]{43,172}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64url');
  return key.length >= 32 ? key : null;
}

function configuration() {
  const host = process.env.PLOT_EXAM_MAIL_HOST || '';
  const mode = process.env.PLOT_EXAM_MAIL_MODE || '';
  const sender = process.env.PLOT_EXAM_MAIL_FROM || '';
  const username = process.env.PLOT_EXAM_MAIL_USERNAME || '';
  const password = process.env.PLOT_EXAM_MAIL_PASSWORD || '';
  const relay = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const port = Number(process.env.PLOT_EXAM_MAIL_PORT || ({ local: 25, tls: 465, starttls: 587 }[mode] || 0));
  const signingKey = examAccessSigningKey();
  const credentialsOK = username.length <= 254 && password.length <= 1024 && !/[\r\n\0]/.test(username + password);
  const transportOK = mode === 'local' ? relay && !username && !password : ['tls', 'starttls'].includes(mode) && !!username && !!password;
  const smtp = signingKey && hostPattern.test(host) && emailPattern.test(sender) && sender.length <= 254 &&
    credentialsOK && transportOK && Number.isSafeInteger(port) && port >= 1 && port <= 65535
    ? { host, mode, sender, username, password, port } : null;
  return { smtp, signingKey };
}

function mac(key, id, nonce) {
  return createHmac('sha256', key).update('plot-studio-certification/email-access/v1\0').update(id).update('\0').update(nonce).digest();
}

export function signedLink(origin, key, item) {
  const url = new URL('/certification/attempt', origin);
  const tag = mac(key, item.enrolment, item.nonce).toString('base64url');
  url.hash = new URLSearchParams({ access: `PXE_${item.enrolment}.${item.nonce}.${tag}` }).toString();
  return url.href;
}

function emailPayload(origin, smtp, signingKey, item) {
  const url = signedLink(origin, signingKey, item);
  const exam = item.exam === 'architect' ? 'Workflow Architect' : 'Builder';
  const host = new URL(origin).hostname;
  let note = 'Open the enrolment to see your assessment brief and starter project.';
  if (item.timeLimits) {
    const [workMs, breakMs, maxBreaks] = item.timeLimits;
    const minutes = breakMs / 60000;
    const breakNote = maxBreaks === 1
      ? `You can take one break of up to ${minutes} minutes.`
      : `You can take up to ${maxBreaks} breaks of ${minutes} minutes each.`;
    note = `Your ${workMs / 3600000} hours of working time start when you select Start exam. ${breakNote}`;
  }
  return {
    smtp,
    recipient: item.email,
    messageId: `<plot-exam-${item.enrolment}@${host}>`,
    text: [
      `Your payment for the PLOT Studio Certified ${exam} exam has been confirmed.`,
      'Open your private enrolment link:',
      url,
      'You can use this link once. It expires 30 days after payment. Save the recovery code shown after opening your enrolment.',
      note,
      'PLOT Studio · CONVRO LTD',
    ].join('\n\n'),
  };
}

export function createExamMailer({ origin, db, worker, enabled }) {
  const { smtp, signingKey } = configuration();
  const manual = process.env.PLOT_EXAM_DELIVERY_MODE === 'manual';
  let nextProbeAt = 0;
  let availableUntil = 0;
  let probe;
  let delivering = false;
  let overdueNoticeAt = 0;

  async function check() {
    if (!enabled) return false;
    if (manual) return Boolean(signingKey);
    if (!smtp) return false;
    const at = Date.now();
    if (probe) return probe;
    if (at < nextProbeAt) return at < availableUntil;
    probe = (async () => {
      const outcome = await worker([], { smtp, probe: true }).catch(() => ({ status: 'SMTP_UNAVAILABLE' }));
      const checkedAt = Date.now();
      const ready = outcome.status === 'accepted';
      availableUntil = ready ? checkedAt + probeFreshness : 0;
      nextProbeAt = checkedAt + (ready ? probeFreshness : probeRetry);
      if (!ready) console.warn('Certification email readiness check failed:', outcome.status);
      return ready;
    })().finally(() => { probe = null; });
    return probe;
  }

  async function drain() {
    if (manual || delivering || !enabled || !smtp) return;
    delivering = true;
    try {
      const at = Date.now();
      if (at > overdueNoticeAt) {
        const counts = await db('mail_stats', {});
        if (counts.overdue) console.warn('Certification access email pending beyond 24 hours:', counts.overdue);
        overdueNoticeAt = at + 60 * 60 * 1000;
      }
      if (!await check()) return;
      const lease = randomBytes(16).toString('hex');
      const job = await db('claim_mail', { lease });
      if (!job) return;
      const outcome = await worker([], emailPayload(origin, smtp, signingKey, job)).catch(() => ({ status: 'SMTP_UNAVAILABLE' }));
      await db('finish_mail', { enrolment: job.enrolment, lease, status: outcome.status });
      if (outcome.status !== 'accepted') console.warn('Certification access email delivery deferred:', outcome.status);
    } catch (error) {
      console.warn('Certification access email worker will retry:', error?.status || 500);
    } finally {
      delivering = false;
    }
  }

  function verifyAccessToken(value) {
    if (!signingKey || typeof value !== 'string') return null;
    const match = accessPattern.exec(value);
    if (!match) return null;
    const [, id, nonce, signature] = match;
    const expected = mac(signingKey, id, nonce);
    const supplied = Buffer.from(signature, 'base64url');
    return supplied.length === expected.length && supplied.toString('base64url') === signature &&
      timingSafeEqual(expected, supplied) ? { id, nonce } : null;
  }

  if (enabled && smtp && !manual) {
    setInterval(() => void drain(), 10000).unref();
  }
  return { check, drain, verifyAccessToken };
}
