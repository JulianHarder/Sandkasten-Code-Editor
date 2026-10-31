/* Test-Hilfe: lädt die Interpreter in einen Node-vm-Kontext und führt Programme aus. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function loadContext(files) {
  const ctx = { console, performance, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

const PY_FILES = ['js/runtime/common.js', 'js/runtime/python/lexer.js', 'js/runtime/python/parser.js', 'js/runtime/python/objects.js',
  'js/runtime/python/builtins.js', 'js/runtime/python/interpreter.js'];
const CS_FILES = ['js/runtime/common.js', 'js/runtime/csharp/lexer.js', 'js/runtime/csharp/parser.js', 'js/runtime/csharp/objects.js',
  'js/runtime/csharp/interpreter.js', 'js/runtime/csharp/library.js', 'js/runtime/csharp/check.js'];

/* Führt ein Programm synchron aus. inputs = Zeilen für input()/ReadLine() */
function runProgram(ctx, lang, files, start, inputs) {
  const KON = ctx.KON;
  const lib = lang === 'python' ? KON.py : KON.cs;
  let out = '', err = '';
  const queue = (inputs || []).slice();
  const io = {
    write: (s) => { out += s; },
    writeErr: (s) => { err += s; },
    readLine: (p) => { if (p) out += p; return Promise.resolve(queue.length ? queue.shift() : null); }
  };
  const prep = lib.prepare(files, start);
  if (prep.errors) {
    return Promise.resolve({ out: '', err: '', code: 1, compile: true, errors: prep.errors });
  }
  return new Promise((resolve) => {
    const runner = new KON.Runner(io);
    const timer = setTimeout(() => { runner.stop(); out += '[Timeout]'; }, 30000);
    runner.start(prep.run(io), (res) => { clearTimeout(timer); resolve({ out, err, code: res.code }); });
  });
}
module.exports = { loadContext, runProgram, PY_FILES, CS_FILES };
