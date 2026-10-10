// Own the loopback server lifecycle so a fresh checkout can run all web suites.
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, 'web');
const suites = ['browser.cjs', 'investments-browser.cjs', 'parity-browser.cjs', 'research-browser.cjs', 'insights-browser.cjs', 'lab-browser.cjs'];
const selected = process.argv.slice(2);
if (selected.some(name => !suites.includes(name))) throw Error('Unknown web UI suite.');
fs.mkdirSync(path.join(root, '.artifacts', 'screenshots'), {recursive: true});
const server = spawn(process.execPath, ['tests/serve.cjs'], {cwd, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true});
let current, readyTimer;
const ready = new Promise((resolve, reject) => {
  readyTimer = setTimeout(() => reject(Error('Loopback server did not start within 30 seconds.')), 30000);
  server.once('error', reject);
  server.once('exit', code => reject(Error(`Loopback server exited (${code}); port 8794 must be free.`)));
  server.stdout.on('data', data => {
    process.stdout.write(data);
    if (data.toString().includes('Synthetic private-app tests only:')) resolve();
  });
});
function stop() { if (current) current.kill(); server.kill(); }
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
(async () => {
  try {
    await ready;
    clearTimeout(readyTimer);
    for (const script of selected.length ? selected : suites) {
      await new Promise((resolve, reject) => {
        current = spawn(process.execPath, [`tests/${script}`], {cwd, stdio: 'inherit', windowsHide: true});
        const timer = setTimeout(() => { current.kill(); reject(Error(`${script} timed out.`)); }, 300000);
        current.once('error', error => { clearTimeout(timer); reject(error); });
        current.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`${script} failed (${code}).`)); });
      });
    }
  } finally { clearTimeout(readyTimer); stop(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
