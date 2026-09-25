'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const files = ['tests', 'position-guard'].flatMap(dir => fs.readdirSync(path.join(root, dir))
  .filter(name => name.endsWith('.test.js')).map(name => `${dir}/${name}`));
files.push('telegram-control/unit-test.js', 'position-guard/unit-test.js', 'position-guard/simulation-test.js');
let failures = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--require', './tests/offline.cjs', file], {
    cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, JEV_ENABLED: 'false', JEV_OBSERVE_ONLY: 'true' }
  });
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file}`);
  if (!ok) { failures++; console.error(result.error?.code || '', result.stdout, result.stderr); }
}
console.log(`${files.length - failures}/${files.length} test files passed (offline)`);
process.exitCode = failures ? 1 : 0;
