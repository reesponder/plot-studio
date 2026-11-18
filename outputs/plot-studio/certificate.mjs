import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const renderer = fileURLToPath(new URL('./certificate/render.py', import.meta.url));

export function renderCertificate({ name, exam, issuedAt, id }) {
  const interpreter = process.env.PLOT_CERTIFICATE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return new Promise((resolve, reject) => {
    const child = execFile(interpreter, [renderer], {
      encoding: 'buffer',
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    }, (error, pdf) => {
      if (error || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        reject(new Error('The certificate renderer could not generate a PDF.'));
        return;
      }
      resolve(pdf);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ name, exam, issuedAt, id }));
  });
}
