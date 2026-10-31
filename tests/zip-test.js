/* Erzeugt ein ZIP mit dem selbst geschriebenen Code und prüft es mit "unzip -t". */
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const { execSync } = require('child_process');
const ctx = { TextEncoder, Blob, Uint8Array, Uint32Array, Date }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/files/zip.js'), 'utf8'), ctx);
const files = [{ name: 'Program.cs', content: 'using System;\nConsole.WriteLine("Grüße – äöü €");\n' }, { name: 'sub/Rechner.cs', content: 'class R {}\n' }, { name: 'leer.py', content: '' }];
const blob = ctx.KON.makeZip(files, 'MeinRechner');
const multi = ctx.KON.makeProjectsZip([{ name: 'Rechner', files: [{ name: 'Program.cs', content: 'a\n' }] }, { name: 'Spiel', files: [{ name: 'main.py', content: 'b\n' }, { name: 'sub/x.py', content: 'c\n' }] }]);
multi.arrayBuffer().then((buf) => {
  const out = path.join(process.env.TMPDIR || '/tmp', 'kon-test-multi.zip');
  fs.writeFileSync(out, Buffer.from(buf));
  const list = execSync('unzip -Z1 "' + out + '"').toString().trim().split('\n').sort().join(',');
  if (list !== 'Rechner/Program.cs,Spiel/main.py,Spiel/sub/x.py') { console.log('FEHLER Mehrfach-ZIP: ' + list); process.exit(1); }
  console.log('Mehrfach-ZIP OK');
});
blob.arrayBuffer().then((buf) => {
  const out = path.join(process.env.TMPDIR || '/tmp', 'kon-test.zip');
  fs.writeFileSync(out, Buffer.from(buf));
  try {
    console.log(execSync('unzip -t "' + out + '"').toString());
    console.log(execSync('unzip -p "' + out + '" MeinRechner/Program.cs').toString());
  } catch (e) { console.log('FEHLER', e.stdout && e.stdout.toString(), e.stderr && e.stderr.toString()); process.exit(1); }
});
