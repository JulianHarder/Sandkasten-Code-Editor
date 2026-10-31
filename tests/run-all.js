/* Führt alle Tests nacheinander aus:  node tests/run-all.js */
const { spawnSync } = require('child_process');
const path = require('path');
let failed = 0;
for (const f of ['python-tests.js', 'cs-tests.js', 'examples-test.js', 'zip-test.js', 'projects-test.js']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').filter((l) => /bestanden|OK|No errors/.test(l)).pop() || '';
  const bad = r.status !== 0;
  if (bad) failed++;
  console.log((bad ? 'FEHLER  ' : 'OK      ') + f + (last ? '  – ' + last.trim() : ''));
  if (bad) console.log(r.stdout + r.stderr);
}
process.exit(failed ? 1 : 0);
