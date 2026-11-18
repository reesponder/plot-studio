import { storageName, workspaceFetch } from './workspace-client.mjs';

const api = '/studio/api/projects';
const bindingKey = storageName('99host.plot-studio.binding.v1');

function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function request(suffix = '', options = {}) {
  const response = await workspaceFetch(api + suffix, { credentials: 'same-origin', ...options });
  let result;
  try { result = await response.json(); } catch { /* A proxy error may return an HTML page. */ }
  if (!response.ok) throw Object.assign(new Error(result?.error || 'Server project storage is unavailable.'), { status: response.status });
  if (!result) throw new Error('Server project storage returned an unreadable response.');
  return result;
}

function storedBinding() {
  try {
    const value = JSON.parse(localStorage.getItem(bindingKey));
    if (typeof value?.id === 'string' && Number.isInteger(value.revision)) return value;
  } catch { /* The browser may have storage disabled. */ }
  return null;
}

export function mountRemoteProjects(dialog, { getProject, openProject, notify, onBinding }) {
  const content = dialog.querySelector('[data-remote-content]');
  const status = dialog.querySelector('[data-remote-status]');
  const heading = dialog.querySelector('#remote-heading');
  const note = dialog.querySelector('[data-remote-checkpoint]');
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  let binding = storedBinding();
  let bindingVersion = 0;
  let busy = false;
  let confirmingDelete = null;
  let revisionList = [];
  let historyId = null;
  let history = null;
  let confirmingRestore = null;
  let viewVersion = 0;

  function bind(next) {
    bindingVersion++;
    binding = next;
    try {
      if (next) localStorage.setItem(bindingKey, JSON.stringify(next));
      else localStorage.removeItem(bindingKey);
    } catch { /* The session can still use a server project. */ }
    onBinding?.(next);
  }

  function setStatus(message, failure = false) {
    status.textContent = message;
    status.dataset.error = String(failure);
  }

  function renderList() {
    heading.textContent = 'Server projects';
    content.innerHTML = revisionList.map((entry) => `<div class="remote-project-row">
      <div><strong>${escape(entry.name)}</strong><small>${escape(format.format(entry.updated))} · v${entry.revision}${entry.id === binding?.id ? ' · Open' : ''}</small></div>
      <button class="ui-button quiet" type="button" data-open-id="${escape(entry.id)}">Open</button>
      <button class="ui-button quiet" type="button" data-history-id="${escape(entry.id)}" aria-label="History for ${escape(entry.name)}">History</button>
      <button class="ui-button quiet" type="button" data-delete-id="${escape(entry.id)}">${entry.id === confirmingDelete ? 'Confirm delete' : 'Delete'}</button>
    </div>`).join('') || '<p>No projects saved to the server yet.</p>';
    dialog.querySelector('[data-remote-save]').hidden = false;
    dialog.querySelector('[data-remote-checkpoint-label]').hidden = false;
    dialog.querySelector('[data-remote-save]').textContent = binding ? 'Save current revision' : 'Save current project';
    dialog.querySelector('[data-remote-fork]').hidden = !binding;
  }

  function renderHistory() {
    heading.textContent = 'Version history';
    dialog.querySelector('[data-remote-checkpoint-label]').hidden = true;
    dialog.querySelector('[data-remote-save]').hidden = true;
    dialog.querySelector('[data-remote-fork]').hidden = true;
    const top = `<div class="remote-history-head"><button class="ui-button quiet" type="button" data-remote-back>All projects</button>${history ? `<strong>${escape(history.name)}</strong>` : ''}</div>`;
    const rows = (history?.revisions || []).map((entry) => `<div class="remote-project-row remote-history-row">
      <div><strong>v${entry.revision}${entry.revision === history.revision ? ' · Current' : ''}${entry.note ? ' · ' + escape(entry.note) : ''}</strong>
      <small>${escape(format.format(entry.updated))}${entry.restoredFrom ? ' · Restored from v' + entry.restoredFrom : ''}${entry.name !== history.name ? ' · ' + escape(entry.name) : ''}</small></div>
      <button class="ui-button quiet" type="button" data-revision-download="${entry.revision}" aria-label="Download revision ${entry.revision}">Download .plot</button>
      ${entry.revision === history.revision
        ? `<button class="ui-button quiet" type="button" data-open-id="${escape(history.id)}">Open current</button>`
        : `<button class="ui-button quiet" type="button" data-revision-restore="${entry.revision}" aria-label="${confirmingRestore === entry.revision ? 'Confirm restore' : 'Restore'} revision ${entry.revision}">${confirmingRestore === entry.revision ? 'Confirm restore' : 'Restore'}</button>`}
    </div>`).join('');
    content.innerHTML = top + rows;
  }

  async function list() {
    const version = ++viewVersion;
    historyId = null;
    history = null;
    renderList();
    setStatus('Loading projects…');
    try {
      const result = await request();
      if (version !== viewVersion) return;
      revisionList = result;
      renderList();
      setStatus(`${revisionList.length} ${revisionList.length === 1 ? 'project' : 'projects'} on this server`);
    } catch (issue) { if (version === viewVersion) setStatus(issue.message, true); }
  }

  async function loadHistory(id, { keep = false, restored = null } = {}) {
    const version = ++viewVersion;
    historyId = id;
    if (!keep) history = null;
    confirmingRestore = null;
    renderHistory();
    setStatus('Loading version history…');
    try {
      const result = await request(`/${id}/revisions`);
      if (version !== viewVersion) return;
      history = result;
      renderHistory();
      content.querySelector('[data-remote-back]')?.focus();
      setStatus(restored
        ? `Restored as v${restored}. Open current to load it. Your editor draft is unchanged.`
        : 'Up to 30 recent versions are retained. Restoring makes a new server revision.');
    } catch (issue) { if (version === viewVersion) setStatus(issue.message, true); }
  }

  async function downloadRevision(revision) {
    if (!historyId || busy) return;
    const id = historyId;
    busy = true;
    try {
      const response = await workspaceFetch(`${api}/${id}/revisions/${revision}/file`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) {
        const issue = await response.json().catch(() => ({}));
        throw new Error(issue.error || 'This checkpoint could not be downloaded.');
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const title = history?.revisions.find(entry => entry.revision === revision)?.name || 'project';
      const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name}-v${revision}.plot` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Downloaded version ${revision}`);
    } catch (issue) { if (historyId === id) setStatus(issue.message, true); }
    finally { busy = false; }
  }

  async function restoreRevision(revision) {
    if (!history || busy || revision === history.revision) return;
    if (confirmingRestore !== revision) {
      confirmingRestore = revision;
      renderHistory();
      content.querySelector(`[data-revision-restore="${revision}"]`)?.focus();
      setStatus(`Restore v${revision} as a new server revision? The current revision stays in history.`);
      return;
    }
    const { id, revision: head } = history;
    busy = true;
    try {
      const receipt = await request(`/${id}/revisions/${revision}/restore`, { method: 'POST', headers: { 'If-Match': `"${head}"` } });
      if (historyId === id && dialog.open) await loadHistory(id, { keep: true, restored: receipt.revision });
      notify(`Restored version ${revision} as v${receipt.revision}`);
    } catch (issue) {
      if (historyId === id) {
        if (issue.status === 409) await loadHistory(id, { keep: true });
        setStatus(issue.status === 409 ? 'A newer revision exists. Review the updated history and try again.' : issue.message, true);
      }
    } finally { busy = false; }
  }

  async function save({ copy = false } = {}) {
    if (busy) return;
    busy = true;
    const startingVersion = bindingVersion;
    const current = copy ? null : binding;
    try {
      const id = current?.id || crypto.randomUUID();
      const headers = { 'Content-Type': 'application/json' };
      if (current) headers['If-Match'] = `"${current.revision}"`;
      else headers['If-None-Match'] = '*';
      if (dialog.open && !historyId && note.value.trim()) headers['X-Plot-Checkpoint'] = encodeURIComponent(note.value.trim());
      const receipt = await request('/' + id, { method: 'PUT', headers, body: JSON.stringify(getProject()) });
      // A local reset while the save request was in flight should keep the new draft detached.
      if (bindingVersion === startingVersion) bind({ id: receipt.id, revision: receipt.revision });
      if (dialog.open && !historyId) { note.value = ''; await list(); }
      notify('Project saved to the server');
    } catch (issue) {
      const message = issue.status === 409 ? 'A newer revision exists. Open it from Server projects, or save this draft as a copy.' : issue.message;
      if (dialog.open) setStatus(message, true);
      notify(message);
    } finally { busy = false; }
  }

  async function open(id) {
    if (busy) return;
    busy = true;
    try {
      const source = await request('/' + id);
      dialog.close();
      openProject(source.project, () => bind({ id: source.id, revision: source.revision }));
    } catch (issue) { setStatus(issue.message, true); }
    finally { busy = false; }
  }

  async function remove(id) {
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      renderList();
      setStatus('Deleting this server project also removes its saved secrets.', true);
      return;
    }
    confirmingDelete = null;
    const entry = revisionList.find((item) => item.id === id);
    if (!entry || busy) return;
    busy = true;
    try {
      await request('/' + id, { method: 'DELETE', headers: { 'If-Match': `"${entry.revision}"` } });
      if (binding?.id === id) bind(null);
      await list();
      notify('Server project deleted');
    } catch (issue) { setStatus(issue.message, true); }
    finally { busy = false; }
  }

  dialog.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-remote-close')) dialog.close();
    if (button.hasAttribute('data-remote-save')) save();
    if (button.hasAttribute('data-remote-fork')) save({ copy: true });
    if (button.dataset.openId) open(button.dataset.openId);
    if (button.dataset.historyId) loadHistory(button.dataset.historyId);
    if (button.dataset.deleteId) remove(button.dataset.deleteId);
    if (button.hasAttribute('data-remote-back')) list();
    if (button.dataset.revisionDownload) downloadRevision(Number(button.dataset.revisionDownload));
    if (button.dataset.revisionRestore) restoreRevision(Number(button.dataset.revisionRestore));
  });
  dialog.addEventListener('close', () => { ++viewVersion; });

  return {
    show() { confirmingDelete = null; note.value = ''; dialog.showModal(); list(); },
    save,
    getBinding() { return binding; },
    detach() { bind(null); },
  };
}
