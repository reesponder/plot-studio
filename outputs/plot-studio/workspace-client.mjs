export const workspace = document.documentElement.dataset.workspace || '';
export const isCustomer = Boolean(workspace && workspace !== 'operator');

export function storageName(name) {
  return isCustomer ? `${name}.${workspace}` : name;
}

export function workspaceFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (workspace) headers.set('X-Plot-Workspace', workspace);
  return fetch(path, { ...options, headers });
}
