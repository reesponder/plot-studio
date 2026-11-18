import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from './studio-build-toolchain/node_modules/esbuild/lib/main.js';

const directory = fileURLToPath(new URL('./', import.meta.url));
await mkdir(new URL('./studio-build/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: directory,
  entryPoints: ['studio.mjs'],
  outfile: 'studio-build/editor.mjs',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome90', 'firefox90', 'safari15'],
  minifyWhitespace: true,
  treeShaking: false,
  sourcemap: false,
  legalComments: 'none',
  define: { 'import.meta.url': '__plotModuleBase' },
  banner: { js: 'const __plotModuleBase = new URL("/studio/studio.mjs", location.origin).href;' },
  logLevel: 'info',
});
