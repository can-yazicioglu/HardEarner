const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'desktop');
const web = path.join(root, 'web');
for (const folder of ['screenshots', 'profiles']) fs.mkdirSync(path.join(root, '.artifacts', folder), {recursive: true});
function run(cwd, args, env = process.env) {
  const child = spawnSync(process.execPath, args, {cwd, env, stdio: 'inherit', windowsHide: true});
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status || 1);
}
switch (process.argv[2]) {
  case 'setup': {
    const npm = process.env.npm_execpath;
    if (!npm || !fs.existsSync(npm)) throw Error('Run this task with npm run setup.');
    for (const dir of [desktop, web]) run(dir, [npm, 'ci', '--no-fund']);
    break;
  }
  case 'build':
    for (const dir of [desktop, web]) run(dir, ['build.cjs']);
    break;
  case 'test':
    run(desktop, ['--test', 'tests/*.test.cjs']);
    run(web, ['tests/build.cjs']);
    run(web, ['--test', 'tests/*.test.mjs']);
    break;
  case 'desktop': {
    if (process.platform !== 'win32') throw Error('The desktop build targets Windows. Use npm run demo:web on macOS or Linux.');
    // A development checkout must never open the installed app's real profile.
    const env = {...process.env, HARDEARNER_TEST_DATA: path.join(root, '.artifacts', 'dev-profile')};
    delete env.ELECTRON_RUN_AS_NODE;
    run(desktop, ['node_modules/electron/cli.js', '.'], env);
    break;
  }
  case 'demo':
    run(web, ['tests/serve.cjs']);
    break;
  case 'desktop-ui':
    run(desktop, ['tests/hardearner-v213-ui.cjs']);
    run(desktop, ['tests/investments-ui.cjs']);
    run(desktop, ['tests/research-insights-ui.cjs']);
    break;
  default:
    throw Error('Unknown task. Use the scripts in package.json.');
}
