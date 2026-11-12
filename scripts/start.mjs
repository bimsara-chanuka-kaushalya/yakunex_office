import { spawn } from 'child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('\x1b[32m%s\x1b[0m', '⚡ Starting Yakunex Hub (API + Web Frontend) in Production Mode...\n');

const api = spawn('node', ['apps/api/dist/main.js'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});

const web = spawn(npmCmd, ['--prefix', 'apps/web', 'run', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});

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
