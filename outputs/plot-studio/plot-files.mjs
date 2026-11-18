import { workspaceFetch } from './workspace-client.mjs';

const fileEndpoint = '/studio/api/plot-file/';
const binary = 'application/octet-stream';
const maxUpload = 12 * 1024 * 1024 + 68;

async function transfer(action, body, contentType) {
  const response = await workspaceFetch(fileEndpoint + action, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || 'Studio could not process this project file.');
  }
  return response;
}

export async function protectPlotProject(project) {
  const response = await transfer('seal', project, 'application/json');
  return response.blob();
}

export async function readPlotFile(file) {
  if (!file.size || file.size > maxUpload) throw new Error('Choose a .plot project file under 12 MB.');
  const response = await transfer('open', file, binary);
  return response.text();
}
