import { access, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGraph } from './logic.mjs';
import { buildSite } from './project.mjs';

const sources = dirname(fileURLToPath(import.meta.url));
const defaultChrome = '/opt/plot-studio/exam-browser/chrome-headless-shell';
const outputLimit = 4 * 1024 * 1024;

function unavailable(message = 'The browser assessment service is temporarily unavailable. Submit again in a moment.') {
  return Object.assign(new Error(message), { status: 503 });
}

async function parameters(browser, directory) {
  const worker = join(sources, 'exam-browser-worker.mjs');
  if (process.platform !== 'linux') return [process.execPath, worker, browser];
  const browserDirectory = dirname(browser);
  const base = ['/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
    '--setenv', 'HOME', '/tmp', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C.UTF-8',
    '--dev', '/dev', '--proc', '/proc', '--bind', directory, '/tmp', '--chdir', '/tmp',
    '--ro-bind', '/usr/lib', '/usr/lib', '--symlink', '/usr/lib', '/lib',
    '--ro-bind', '/usr/lib64', '/usr/lib64', '--symlink', '/usr/lib64', '/lib64',
    '--ro-bind', process.execPath, '/usr/bin/node', '--ro-bind', browserDirectory, '/browser',
    '--ro-bind', worker, '/exam-browser-worker.mjs', '--ro-bind', join(sources, 'data.mjs'), '/data.mjs'];
  for (const item of ['/etc/fonts', '/usr/share/fontconfig', '/usr/share/fonts', '/usr/share/zoneinfo']) {
    try { await access(item); base.push('--ro-bind', item, item); } catch {}
  }
  base.push('--remount-ro', '/', '--', '/usr/bin/node', '/exam-browser-worker.mjs', '/browser/' + browser.split('/').at(-1));
  return ['/usr/bin/unshare', '--user', '--map-root-user', '--mount', '--propagation', 'private', '--',
    '/usr/bin/python3', '-I', '-S', '-B', join(sources, 'python_scratch.py'), directory, ...base];
}

async function runBrowser(browser, input) {
  const directory = await mkdtemp(join(tmpdir(), 'plot-exam-browser-'));
  try {
    const [command, ...args] = await parameters(browser, directory);
    const environment = { LANG: 'C.UTF-8', PATH: process.env.PATH || '/usr/bin:/bin', TEMP: directory,
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
    return await new Promise((accept, reject) => {
      const child = spawn(command, args, { timeout: 42000, killSignal: 'SIGKILL', windowsHide: true, env: environment });
      let bytes = 0;
      const output = [];
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > outputLimit) child.kill('SIGKILL');
        else output.push(chunk);
      });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.on('error', () => reject(unavailable()));
      child.on('close', code => {
        if (code !== 0) return reject(unavailable());
        try { return accept(JSON.parse(Buffer.concat(output).toString('utf8'))); }
        catch { return reject(unavailable()); }
      });
      child.stdin.end(JSON.stringify({ ...input, profile: process.platform === 'linux' ? '/tmp/profile' : join(directory, 'profile') }));
    });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
  }
}

export function createExamBrowserEvaluator({ browser = process.env.PLOT_EXAM_BROWSER || defaultChrome } = {}) {
  let active = false;
  return async function evaluate({ project, probes }) {
    if (!Array.isArray(probes) || probes.length > 32 || probes.some(probe => !Array.isArray(probe.steps) || probe.steps.length > 120)) {
      throw new TypeError('Invalid internal browser assessment definition.');
    }
    if (!probes.length) return {};
    const compiled = compileGraph(project.graph, project);
    if (compiled.diagnostics.some(item => item.severity === 'error')) return {};
    try { await access(resolve(browser)); } catch { throw unavailable(); }
    if (active) throw unavailable('The browser assessor is grading another submission. Try again shortly.');
    active = true;
    try {
      const files = buildSite(project, compiled.code);
      const tables = (project.data?.tables ?? []).map(table => ({ ...table, rows: [] }));
      return await runBrowser(resolve(browser), { probes, files, tables });
    } finally {
      active = false;
    }
  };
}
