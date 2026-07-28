import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();

function checkStartup(startupName) {
  return new Promise((resolve) => {
    const startupFile = path.resolve(root, startupName);
    const childEnv = { ...process.env, IN_PASSENGER: '1' };
    delete childEnv.PORT;
    const child = spawn(process.execPath, [startupFile], {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let settled = false;
    const forceStop = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
    }, 2_500);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceStop);
      resolve({ startupName, output, ...result });
    };

    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => finish({ ok: false, error }));
    child.once('close', (code, signal) => finish({
      ok: /started under Plesk\/Passenger/.test(output),
      code,
      signal
    }));
  });
}

const results = await Promise.all([
  checkStartup('_passenger.cjs'),
  checkStartup('server.cjs')
]);

for (const result of results) {
  if (result.ok) {
    console.log(`PASS  Passenger startup file — ${result.startupName}`);
    console.log('PASS  Passenger-style listener without PORT — application started successfully');
  } else {
    console.error(`FAIL  Passenger startup file did not start the application — ${result.startupName}`);
    console.error(`INFO  child exit — code=${result.code ?? 'none'} signal=${result.signal ?? 'none'}`);
    if (result.error) console.error(result.error.stack || result.error);
    if (result.output.trim()) console.error(result.output.trim());
    process.exitCode = 1;
  }
}
