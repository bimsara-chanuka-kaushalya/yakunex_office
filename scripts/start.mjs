import { spawn } from 'child_process';

const isWin = process.platform === 'win32';

function spawnNpm(args) {
  if (isWin) {
    return spawn('cmd.exe', ['/c', 'npm', ...args], {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });
  }
  return spawn('npm', args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
}

console.log('\x1b[32m%s\x1b[0m', '⚡ Starting Yakunex Hub (API + Web Frontend) in Production Mode...\n');

const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

const web = spawnNpm(['--prefix', 'apps/web', 'run', 'start']);

function cleanup() {
  try {
    if (isWin) {
      if (api.pid) spawn('taskkill', ['/pid', api.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
      if (web.pid) spawn('taskkill', ['/pid', web.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    } else {
      api.kill('SIGINT');
      web.kill('SIGINT');
    }
  } catch {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

api.on('exit', (code) => {
  if (code && code !== 0) console.error(`[API] process exited with code ${code}`);
});

web.on('exit', (code) => {
  if (code && code !== 0) console.error(`[Web] process exited with code ${code}`);
});
