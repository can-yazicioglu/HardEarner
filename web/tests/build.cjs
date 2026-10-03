// Test-only Cloudflare platform replacement, used by both unit and UI tests.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('../../desktop/node_modules/esbuild');
const {adapters} = require('../build.cjs');
async function buildTestWorker() {
  fs.mkdirSync('build', {recursive: true});
  await esbuild.build({
    entryPoints: [path.resolve('server/worker.mjs')], bundle: true, platform: 'node',
    format: 'esm', outfile: 'build/test-worker.mjs', external: ['node:*'],
    inject: ['server/platform-fetch.mjs'],
    plugins: [adapters(false), {name: 'test-platform', setup(build) {
      build.onResolve({filter: /^cloudflare:workers$/}, () => ({path: path.resolve('tests/platform-shim.mjs')}));
    }}]
  });
}
module.exports = {buildTestWorker};
if (require.main === module) buildTestWorker().catch(error => {console.error(error); process.exitCode = 1;});
