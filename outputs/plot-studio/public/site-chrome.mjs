const toggle = document.querySelector('.plot-menu-button');

if (toggle) {
  const header = toggle.closest('.plot-site-header');
  const mobile = window.matchMedia('(max-width: 860px)');
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  header.addEventListener('click', (event) => {
    if (isOpen() && event.target.closest('a[href]')) setOpen(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen()) return;
    setOpen(false);
    toggle.focus({ preventScroll: true });
  });

  mobile.addEventListener('change', () => setOpen(false));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setOpen(false);
  });
}
