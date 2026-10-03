const fs = require('node:fs');
const path = require('node:path');
const {version} = require('./package.json');
(async () => {
  const {packager} = await import('@electron/packager');
  const stageRoot = path.resolve(__dirname, '../.artifacts/stage');
  fs.mkdirSync(stageRoot, {recursive: true});
  const stage = fs.mkdtempSync(path.join(stageRoot, `hardearner-${version}-`));
  for (const name of ['electron', 'dist', 'assets']) fs.cpSync(path.join(__dirname, name), path.join(stage, name), {recursive: true});
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
    name: 'hardearner-desktop', productName: 'HardEarner', version,
    main: 'electron/main.cjs', author: 'Can Yazicioglu',
    description: 'Personal wealth, beautifully clear.', license: 'UNLICENSED'
  }, null, 2));
  const paths = await packager({
    dir: stage, name: 'HardEarner', platform: 'win32', arch: 'x64', overwrite: true,
    out: path.resolve(__dirname, '../.artifacts/packages', `HardEarner-${version}`),
    electronVersion: require('electron/package.json').version, asar: true, prune: false,
    icon: path.resolve(__dirname, 'assets/icon.ico'), appCopyright: 'Copyright Can Yazicioglu. All rights reserved.',
    win32metadata: {CompanyName: 'HardEarner', FileDescription: 'HardEarner · Personal wealth', ProductName: 'HardEarner', OriginalFilename: 'HardEarner.exe'}
  });
  console.log(paths.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
