/* Prüft, dass alle Beispiele ohne Fehler laufen. */
const h = require('./harness.js');
const path = require('path');
const fs = require('fs');
const ctxD = { window: {} }; ctxD.window.window = ctxD.window; require('vm').createContext(ctxD.window);
require('vm').runInContext(fs.readFileSync(path.join(__dirname, '../js/data/examples.js'), 'utf8'), ctxD.window);
const ex = ctxD.window.KON.data.examples;
const inputs = { io: ['Ada', '36'], calc: ['6', '/', '4'], guess: ['abc', '500', '1', '50'], errors: ['0'] };
(async () => {
  let bad = 0;
  for (const lang of ['csharp', 'python']) {
    const ctx = h.loadContext(lang === 'python' ? h.PY_FILES : h.CS_FILES);
    for (const e of ex[lang]) {
      const files = e.files.map((f) => ({ name: f.name, content: f.content }));
      const start = files[0].name;
      let inp = inputs[e.id] || [];
      if (e.id === 'guess') inp = ['abc', '500', '0', '1', '2', '3', '4', '5'].concat(Array.from({ length: 120 }, (_, i) => String(i + 1)));
      const r = await h.runProgram(ctx, lang, files, start, inp);
      const err = r.compile ? r.errors.map((x) => x.line + ':' + x.message).join('; ') : r.err;
      const ok = !err && (r.code === 0 || r.code === undefined);
      if (!ok) bad++;
      console.log((ok ? 'OK   ' : 'FEHLER ') + lang + ' ' + e.id + (ok ? '' : ' -> ' + err));
      if (process.argv[2] === '-v') console.log(r.out);
    }
  }
  process.exit(bad ? 1 : 0);
})();
