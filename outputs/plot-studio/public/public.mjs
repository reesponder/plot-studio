const photos = [...document.querySelectorAll('.photographs .photo')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (photos.length > 1 && !reducedMotion.matches) {
  let active = 0;
  window.setInterval(() => {
    const next = (active + 1) % photos.length;
    if (reducedMotion.matches || !photos[next].complete || !photos[next].naturalWidth) return;

    photos[active].classList.remove('photo-current');
    photos[next].classList.add('photo-current');
    active = next;
  }, 2000);
}

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('reveal-active');
      observer.unobserve(entry.target);
    }
  }, { threshold: .12 });

  document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
}
