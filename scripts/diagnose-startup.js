import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const startupFile = path.resolve(root, 'server.cjs');
const child = spawn(process.execPath, [startupFile], {
  cwd: root,
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const forceStop = setTimeout(() => {
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
}, 2_500);

child.once('error', (error) => {
  clearTimeout(forceStop);
  console.error('FAIL  Passenger startup process could not be launched');
  console.error(error.stack || error);
  process.exitCode = 1;
});

child.once('close', (code, signal) => {
  clearTimeout(forceStop);
  if (/started under Plesk\/Passenger/.test(output)) {
    console.log('PASS  Passenger startup file — server.cjs');
    console.log('PASS  temporary Passenger-style listener — application started successfully');
    return;
  }

  console.error('FAIL  Passenger startup file did not start the application');
  console.error(`INFO  child exit — code=${code ?? 'none'} signal=${signal ?? 'none'}`);
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
});
