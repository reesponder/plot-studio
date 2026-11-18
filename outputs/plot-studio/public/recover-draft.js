const status = document.getElementById('recovery-status');
const button = document.getElementById('recovery-download');
let draft;
try { draft = localStorage.getItem('99host.plot-studio.project.v1'); } catch {}
if (draft) {
  button.hidden = false;
  status.textContent = 'A local project draft is available.';
} else status.textContent = 'No project draft was found in this browser.';
button.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([draft], { type: 'application/json' }));
  const link = document.createElement('a');
  link.download = 'recovered-plot-studio.plot';
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
