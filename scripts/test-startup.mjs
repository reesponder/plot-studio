import { spawn } from 'node:child_process';

const test = spawn(process.execPath, ['work/check-studio-rotation.mjs'], {
  env: { ...process.env, PLOT_TEST_DISTRIBUTED_BOOT: '1' }, stdio: 'inherit',
});
test.on('error', error => { console.error(error); process.exitCode = 1; });
test.on('exit', code => { process.exitCode = code ?? 1; });
