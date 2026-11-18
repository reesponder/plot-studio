const canonical = 'https://plotstudio.pro';
const access = document.querySelector('#studio-access');
const status = document.querySelector('#studio-status');
const editor = document.querySelector('#studio-frame');
const retry = document.querySelector('.retry');

async function checkSession() {
  const request = new AbortController();
  const timeout = setTimeout(() => request.abort(), 8000);
  try {
    const response = await fetch(canonical + '/studio/session', {
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: request.signal,
    });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error('Session check failed.');
    return (await response.json())?.authenticated === true;
  } finally {
    clearTimeout(timeout);
  }
}

function loadEditor() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), 45000);
    function finish(ready) {
      window.removeEventListener('message', receive);
      clearTimeout(timeout);
      resolve(ready);
    }
    function receive(event) {
      if (event.origin !== canonical || event.source !== editor.contentWindow) return;
      if (event.data?.type === 'plot-studio:ready') finish(true);
      if (event.data?.type === 'plot-studio:failed') finish(false);
    }
    window.addEventListener('message', receive);
    editor.hidden = false;
    editor.src = canonical + '/studio/editor';
  });
}

async function openStudio() {
  try {
    if (!await checkSession()) {
      status.textContent = 'Sign in to open the editor.';
      return;
    }
    status.textContent = 'Opening your workspace…';
    if (!await loadEditor()) {
      editor.remove();
      throw new Error('The editor did not start.');
    }
    const restoreFocus = access.contains(document.activeElement);
    editor.classList.add('ready');
    access.hidden = true;
    if (restoreFocus) editor.focus({ preventScroll: true });
  } catch {
    status.textContent = 'Studio could not load. Try again or sign in.';
    retry.hidden = false;
  }
}

openStudio();
