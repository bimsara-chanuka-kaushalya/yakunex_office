import { spawn } from 'child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Yakunex Hub (API + Web Frontend) in Development Mode...\n');

const api = spawn(npmCmd, ['--prefix', 'apps/api', 'run', 'start:dev'], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FORCE_COLOR: '1' },
});

const web = spawn(npmCmd, ['--prefix', 'apps/web', 'run', 'dev'], {
  stdio: 'inherit',
  shell: false,
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

