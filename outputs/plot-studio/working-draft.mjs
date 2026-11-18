import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parsePlotProject } from './plot-file.mjs';

const cap = 12 * 1024 * 1024;
const issue = (status, message) => Object.assign(new Error(message), { status });
const scope = 'customer-working-draft';

export function createWorkingDraft(directory, encryption, origin) {
  const file = resolve(directory, 'working-draft.bin');
  let writing = false;
  async function get() {
    const data = await readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    return data ? JSON.parse(encryption.open(data, scope)) : null;
  }
  return async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (req.method === 'GET') {
        const current = await get();
        res.setHeader('ETag', current ? `"${current.id}"` : '"empty"');
        return json(200, current?.project || null);
      }
      if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); throw issue(405, 'Method not allowed.'); }
      if (req.headers.origin !== origin) throw issue(403, 'Request origin is not allowed.');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw issue(415, 'Expected a project in JSON format.');
      if (Number(req.headers['content-length']) > cap) throw issue(413, 'This project exceeds the working draft limit.');
      if (writing) throw issue(409, 'Another tab is saving this draft.');
      writing = true;
      try {
        const previous = await get();
        if (req.headers['if-match'] !== (previous ? `"${previous.id}"` : '"empty"')) throw issue(409, 'Your draft changed in another tab.');
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size <= cap) chunks.push(chunk);
        }
        if (size > cap) throw issue(413, 'This project exceeds the working draft limit.');
        const next = { id: randomUUID(), project: parsePlotProject(Buffer.concat(chunks)) };
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temp = `${file}.${next.id}`;
        try {
          await writeFile(temp, encryption.seal(JSON.stringify(next), scope), { flag: 'wx', mode: 0o600 });
          await rename(temp, file);
        } catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; }
        res.setHeader('ETag', `"${next.id}"`);
        return json(200, { saved: true });
      } finally { writing = false; }
    } catch (error) {
      if (!req.complete) req.resume();
      return json(error.status || 500, { error: error.status ? error.message : 'Your draft is temporarily unavailable.' });
    }
  };
}
