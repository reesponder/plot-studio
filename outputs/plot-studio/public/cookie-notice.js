(() => {
  const storageKey = 'plot.cookie-notice.v1';
  const template = document.createElement('template');
  template.innerHTML = `
    <aside class="plot-cookie-notice" id="plot-cookie-notice" aria-labelledby="plot-cookie-title" hidden>
      <div class="plot-cookie-body">
        <div class="plot-cookie-copy">
          <h2 id="plot-cookie-title" tabindex="-1">Cookies and browser storage</h2>
          <p>PLOT Studio uses a session cookie when you sign in. It keeps your editor session active until you sign out or the session expires. Studio saves your draft, linked server project and editor preferences in this browser so you can pick up where you left off. The exam workspace can also save your recovery details here after you open an enrolment.</p>
          <p>When you open checkout, Stripe may use its own cookies and browser storage to process the payment and prevent fraud. You can clear PLOT Studio browser data in your browser settings. Download a .plot copy of any work you want to keep first. Your acknowledgement of this notice is saved in this browser.</p>
          <div class="plot-cookie-links">
            <a href="/terms#site-storage">How PLOT uses site data</a>
            <a href="https://stripe.com/legal/cookies-policy">Stripe cookie policy</a>
          </div>
        </div>
        <button class="plot-cookie-dismiss" type="button">Got it</button>
      </div>
    </aside>`;

  const notice = template.content.firstElementChild;
  const title = notice.querySelector('h2');
  const dismiss = notice.querySelector('button');
  const footer = document.querySelector('.plot-site-footer .plot-site-nav');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'plot-cookie-settings';
  settings.textContent = 'Cookie notice';
  settings.setAttribute('aria-controls', notice.id);
  settings.setAttribute('aria-expanded', 'false');
  let openedFromFooter = false;

  function open(focus = false) {
    openedFromFooter = focus;
    notice.hidden = false;
    settings.setAttribute('aria-expanded', 'true');
    if (focus) title.focus({ preventScroll: true });
  }

  function close() {
    try { localStorage.setItem(storageKey, 'seen'); } catch {}
    notice.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
    if (openedFromFooter) settings.focus({ preventScroll: true });
  }

  dismiss.addEventListener('click', close);
  settings.addEventListener('click', () => open(true));
  notice.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/99host-assets/cookie-notice.css?v=1';
  stylesheet.addEventListener('load', () => {
    document.body.append(notice);
    if (footer) {
      footer.classList.add('plot-cookie-footer');
      footer.append(settings);
    }
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === 'seen'; } catch {}
    if (!seen) open();
  }, { once: true });
  document.head.append(stylesheet);
})();
