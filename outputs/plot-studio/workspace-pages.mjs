import { readFile } from 'node:fs/promises';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const template = new URL('./public/workspace-access.html', import.meta.url);
const pages = {
  signIn: { title: 'Sign in', intro: 'Enter your email and licence key, or use the password set up for your account.', swap: '<a href="/register">Activate a licence</a>', action: '/sign-in' },
  register: { title: 'Activate your licence', intro: 'Enter the email you used at checkout and the licence key we sent you.', swap: '<a href="/sign-in">Already activated? Sign in</a>', action: '/register' },
  operator: { title: 'Operator sign-in', intro: 'For the administrator of this Studio instance.', swap: '<a href="/sign-in">Sign in with a licence</a>', action: '/login' },
};

export function accessPage(req, res, mode, { status = 200, message = '', email = '', next = '' } = {}) {
  const page = pages[mode];
  const operator = mode === 'operator';
  const details = operator ? '' : `<div class="access-field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" value="${escape(email)}" required></div>`;
  const label = operator ? 'Access password' : mode === 'register' ? 'Licence key' : 'Licence key or password';
  const name = operator ? 'password' : 'licence';
  const notes = operator ? '' : `<p class="access-help">Need a key? <a href="/license">Get a licence</a>. Lost your key? <a href="mailto:peter@usereesponder.com">Contact support</a>.</p>`;
  const content = `${message ? `<p class="access-error" role="alert">${escape(message)}</p>` : ''}
    <form class="access-form" action="${page.action}" method="post">
      <input type="hidden" name="next" value="${escape(next)}">${details}
      <div class="access-field"><label for="access-key">${label}</label><input id="access-key" name="${name}" type="password" maxlength="${operator ? 1024 : 128}" autocomplete="current-password" autocapitalize="none" spellcheck="false" required></div>
      <button class="access-button" type="submit">${mode === 'register' ? 'Activate and open Studio' : 'Sign in'}</button>
    </form><p class="access-swap">${page.swap}</p>${notes}`;
  return render(req, res, { title: page.title, intro: page.intro, content, status });
}

export function accountPage(req, res, account) {
  return render(req, res, { title: 'Your account', intro: 'The licence attached to this workspace is active.',
    content: `<dl class="access-summary"><dt>Email address</dt><dd>${escape(account.email)}</dd><dt>Licence</dt><dd>Active</dd></dl><a class="access-button" href="/studio/">Open Studio</a><form class="access-swap" method="post" action="/studio/logout"><button class="access-link" type="submit">Sign out</button></form>` });
}

export function licencesPage(req, res, records, { status = 200, message = '', revealed = null } = {}) {
  const result = revealed ? `<div class="access-issued"><strong>Copy this key now. It is shown only once.</strong><label for="new-key">Key for ${escape(revealed.email)}</label><input id="new-key" readonly value="${escape(revealed.license)}"><p>Send it to the customer with <a href="/register">the activation link</a>.</p></div>` : '';
  const rows = records.map(row => `<li class="licence-row"><div><strong>${escape(row.email)}</strong><span>${row.revoked ? 'Revoked' : row.activatedAt ? 'Active' : 'Awaiting activation'}</span></div>
    <form method="post" action="/studio/licences"><input type="hidden" name="id" value="${escape(row.id)}"><button class="access-link" name="action" value="replace">Replace key</button>${row.revoked ? '' : '<button class="access-link access-danger" name="action" value="revoke">Revoke</button>'}</form></li>`).join('');
  const content = `${message ? `<p class="${status < 400 ? 'access-result' : 'access-error'}" role="status">${escape(message)}</p>` : ''}${result}
    <form class="access-form" method="post" action="/studio/licences"><div class="access-field"><label for="email">Checkout email</label><input id="email" name="email" type="email" maxlength="254" required></div><button class="access-button" name="action" value="issue">Issue licence</button></form>
    <h2 class="licence-list-title">Issued licences</h2>${rows ? `<ul class="licence-list">${rows}</ul>` : '<p class="access-help">No licences have been issued.</p>'}<p class="access-swap"><a href="/studio/">Back to Studio</a></p>`;
  return render(req, res, { title: 'Manage licences', intro: 'Verify the customer’s payment in Stripe before issuing a key. Replacing or revoking a key signs the customer out immediately.', content, status, wide: true });
}

async function render(req, res, { title, intro, content, status = 200, wide = false }) {
  const html = (await readFile(template, 'utf8')).replace(/\{\{(title|intro|content|variant)\}\}/g, (_all, key) => ({ title: escape(title), intro: escape(intro), content, variant: wide ? 'access-wide' : '' })[key]);
  res.setHeader('X-Robots-Tag', 'noindex');
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(req.method === 'HEAD' ? undefined : html);
}
