/* Python-Werte: Typen, Ausnahmen, Text-Darstellung, Vergleiche, Rechnen */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const PY = KON.py = KON.py || {};

  const GenFn = Object.getPrototypeOf(function* () { }).constructor;
  const isGen = (f) => f instanceof GenFn;
  PY.isGen = isGen;

  /* ---------- Wert-Klassen ---------- */
  class PyClass {
    constructor(name, bases, dict) {
      this.name = name;
      this.bases = bases || [];
      this.dict = dict || new Map();
      this.mro = PY.computeMro(this);
      this.prim = null; // Name eines eingebauten Typs ('int', 'str', ...)
      this.ctor = null;
      this.isExc = this.mro.some((c) => c.name === 'BaseException' && c.builtinExc);
      this.id = ++PY.idCounter;
    }
  }
  class PyInstance {
    constructor(cls) { this.cls = cls; this.attrs = new Map(); this.id = ++PY.idCounter; }
  }
  class Tuple { constructor(items) { this.items = items; } }
  class PyDict { constructor() { this.map = new Map(); } }
  class PySet { constructor(frozen) { this.map = new Map(); this.frozen = !!frozen; } }
  class PyRange { constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; } }
  class PyFunction {
    constructor(name, node, closure, module) {
      this.name = name; this.node = node; this.closure = closure; this.module = module;
      this.defaults = null; this.homeClass = null; this.id = ++PY.idCounter;
    }
  }
  class Builtin {
    constructor(name, fn) { this.name = name; this.fn = fn; this.gen = isGen(fn); }
  }
  class BoundMethod { constructor(self, fn) { this.self = self; this.fn = fn; } }
  class PyModule { constructor(name) { this.name = name; this.attrs = new Map(); } }
  class StaticMethod { constructor(fn) { this.fn = fn; } }
  class ClassMethod { constructor(fn) { this.fn = fn; } }
  class Property { constructor(fget, fset) { this.fget = fget; this.fset = fset || null; } }
  class SuperProxy { constructor(cls, obj) { this.cls = cls; this.obj = obj; } }
  class PyIter {
    // next() -> {done, value}; gen=true: next ist ein Generator
    constructor(next, gen) { this.next = next; this.gen = !!gen; }
  }
  /* Wird als JS-Ausnahme geworfen: trägt die Python-Ausnahme-Instanz */
  class PyThrow {
    constructor(inst) { this.inst = inst; this.tb = PY.captureTb ? PY.captureTb() : []; }
  }
  class PyGen { constructor(js, frame, name) { this.js = js; this.frame = frame; this.name = name; this.done = false; this.started = false; this.running = false; this.id = ++PY.idCounter; } }
  class ExitSignal { constructor(code) { this.code = code; } }
  /* dict.keys() / values() / items() */
  class PyView {
    constructor(d, kind) { this.d = d; this.kind = kind; }
    items() {
      const vals = Array.from(this.d.map.values());
      if (this.kind === 'keys') return vals.map((e) => e[0]);
      if (this.kind === 'values') return vals.map((e) => e[1]);
      return vals.map((e) => new Tuple([e[0], e[1]]));
    }
  }

  Object.assign(PY, {
    idCounter: 0, PyClass, PyInstance, Tuple, PyDict, PySet, PyRange, PyFunction, Builtin, BoundMethod, PyModule,
    StaticMethod, ClassMethod, Property, SuperProxy, PyIter, PyThrow, ExitSignal, PyView, PyGen
  });

  /* ---------- Methodenauflösungsreihenfolge (C3) ---------- */
  PY.computeMro = function (cls) {
    const seqs = cls.bases.map((b) => b.mro.slice());
    seqs.push(cls.bases.slice());
    const res = [cls];
    for (;;) {
      const nonEmpty = seqs.filter((s) => s.length);
      if (!nonEmpty.length) return res;
      let cand = null;
      for (const s of nonEmpty) {
        const c = s[0];
        if (!nonEmpty.some((o) => o.indexOf(c, 1) >= 0)) { cand = c; break; }
      }
      if (!cand) PY.raise('TypeError', 'Cannot create a consistent method resolution order (MRO) for bases ' + cls.bases.map((b) => b.name).join(', '));
      res.push(cand);
      for (const s of seqs) if (s[0] === cand) s.shift();
    }
  };

  /* ---------- Typen und Ausnahmen anlegen ---------- */
  const objectClass = new PyClass('object', [], new Map());
  objectClass.prim = 'object';
  PY.objectClass = objectClass;
  PY.types = {};
  PY.excClasses = {};

  const EXC_TREE = [
    ['BaseException', null], ['Exception', 'BaseException'], ['SystemExit', 'BaseException'], ['KeyboardInterrupt', 'BaseException'],
    ['ArithmeticError', 'Exception'], ['ZeroDivisionError', 'ArithmeticError'], ['OverflowError', 'ArithmeticError'], ['FloatingPointError', 'ArithmeticError'],
    ['LookupError', 'Exception'], ['IndexError', 'LookupError'], ['KeyError', 'LookupError'],
    ['ValueError', 'Exception'], ['UnicodeError', 'ValueError'],
    ['TypeError', 'Exception'], ['NameError', 'Exception'], ['UnboundLocalError', 'NameError'], ['AttributeError', 'Exception'],
    ['RuntimeError', 'Exception'], ['NotImplementedError', 'RuntimeError'], ['RecursionError', 'RuntimeError'],
    ['StopIteration', 'Exception'], ['AssertionError', 'Exception'], ['ImportError', 'Exception'], ['ModuleNotFoundError', 'ImportError'],
    ['OSError', 'Exception'], ['FileNotFoundError', 'OSError'], ['PermissionError', 'OSError'], ['EOFError', 'Exception'],
    ['MemoryError', 'Exception'], ['SyntaxError', 'Exception'], ['IndentationError', 'SyntaxError']
  ];
  for (const [name, base] of EXC_TREE) {
    const c = new PyClass(name, [base ? PY.excClasses[base] : objectClass], new Map());
    c.builtinExc = true;
    c.isExc = true;
    PY.excClasses[name] = c;
  }
  PY.excClasses.BaseException.dict.set('__init__', new Builtin('__init__', (args) => { args[0].attrs.set('args', new Tuple(args.slice(1))); return null; }));
  PY.excClasses.BaseException.dict.set('__str__', new Builtin('__str__', function* (args) { return yield* PY.excStr(args[0]); }));

  PY.excStr = function* (inst) {
    const a = inst.attrs.get('args');
    const items = a ? a.items : [];
    if (inst.cls.mro.some((c) => c.name === 'KeyError' && c.builtinExc) && items.length === 1) return yield* PY.repr(items[0]);
    if (items.length === 0) return '';
    if (items.length === 1) return yield* PY.str(items[0]);
    return yield* PY.repr(new Tuple(items));
  };

  PY.makeExc = function (clsName, msg) {
    const cls = typeof clsName === 'string' ? PY.excClasses[clsName] : clsName;
    const inst = new PyInstance(cls);
    inst.attrs.set('args', new Tuple(msg === undefined ? [] : [msg]));
    return inst;
  };
  /* Python-Ausnahme werfen: PY.raise('ValueError', 'text') */
  PY.raise = function (clsName, msg) {
    throw new PyThrow(PY.makeExc(clsName, msg));
  };

  /* ---------- Typnamen & Hilfen ---------- */
  PY.typeName = function (v) {
    switch (typeof v) {
      case 'bigint': return 'int';
      case 'number': return 'float';
      case 'string': return 'str';
      case 'boolean': return 'bool';
      case 'undefined': return 'NoneType';
    }
    if (v === null) return 'NoneType';
    if (Array.isArray(v)) return 'list';
    if (v instanceof PyInstance) return v.cls.name;
    if (v instanceof Tuple) return 'tuple';
    if (v instanceof PyDict) return 'dict';
    if (v instanceof PySet) return v.frozen ? 'frozenset' : 'set';
    if (v instanceof PyRange) return 'range';
    if (v instanceof PyView) return 'dict_' + v.kind;
    if (v instanceof PyGen) return 'generator';
    if (v instanceof PyFunction) return 'function';
    if (v instanceof Builtin) return 'builtin_function_or_method';
    if (v instanceof BoundMethod) return 'method';
    if (v instanceof PyClass) return 'type';
    if (v instanceof PyModule) return 'module';
    if (v instanceof PyIter) return 'iterator';
    if (v === PY.ELLIPSIS) return 'ellipsis';
    return 'object';
  };

  /* Klasse eines Werts (für isinstance/type) */
  PY.classOf = function (v) {
    if (v instanceof PyInstance) return v.cls;
    return PY.types[PY.typeName(v)] || objectClass;
  };

  PY.lookupClass = function (cls, name) {
    const mro = cls.mro;
    for (let i = 0; i < mro.length; i++) {
      const v = mro[i].dict.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  /* ---------- Wahrheitswert ---------- */
  PY.truth = function (v) {
    switch (typeof v) {
      case 'boolean': return v;
      case 'bigint': return v !== 0n;
      case 'number': return v !== 0;
      case 'string': return v.length > 0;
      case 'undefined': return false;
    }
    if (v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof Tuple) return v.items.length > 0;
    if (v instanceof PyDict || v instanceof PySet) return v.map.size > 0;
    if (v instanceof PyRange) return PY.rangeLen(v) > 0n;
    if (v instanceof PyView) return v.d.map.size > 0;
    return true;
  };
  PY.truthInst = function* (v) {
    const b = PY.lookupClass(v.cls, '__bool__');
    if (b) {
      const r = yield* PY.callValue(new BoundMethod(v, b), [], null);
      if (typeof r !== 'boolean') PY.raise('TypeError', '__bool__ should return bool, returned ' + PY.typeName(r));
      return r;
    }
    const l = PY.lookupClass(v.cls, '__len__');
    if (l) {
      const r = yield* PY.callValue(new BoundMethod(v, l), [], null);
      return r !== 0n;
    }
    return true;
  };
  PY.isTrue = function* (v) {
    if (typeof v === 'boolean') return v;
    if (v instanceof PyInstance) return yield* PY.truthInst(v);
    return PY.truth(v);
  };

  /* ---------- Zahlen ---------- */
  PY.rangeLen = function (r) {
    if (r.step > 0n) return r.stop > r.start ? (r.stop - r.start + r.step - 1n) / r.step : 0n;
    return r.start > r.stop ? (r.start - r.stop - r.step - 1n) / (-r.step) : 0n;
  };

  PY.floatRepr = function (x) {
    if (x !== x) return 'nan';
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
    const exp = x.toExponential(); // kürzeste Darstellung: d.ddde+X
    const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(exp);
    const sign = m[1], digits = m[2] + (m[3] || ''), e = parseInt(m[4], 10);
    if (e >= -4 && e < 16) {
      if (e >= 0) {
        if (digits.length <= e + 1) return sign + digits + '0'.repeat(e + 1 - digits.length) + '.0';
        return sign + digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
      }
      return sign + '0.' + '0'.repeat(-e - 1) + digits;
    }
    const es = (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
    return sign + digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + es;
  };

  /* toFixed mit Python-Rundung (Mitte -> gerade) */
  PY.toFixed = function (x, d) {
    if (!isFinite(x)) return x !== x ? 'nan' : (x < 0 ? '-inf' : 'inf');
    let s;
    if (Math.abs(x) >= 1e21) {
      s = BigInt(x).toString() + (d > 0 ? '.' + '0'.repeat(d) : '');
      return s;
    }
    if (d <= 70) {
      const full = Math.abs(x).toFixed(d + 25);
      const dot = full.indexOf('.');
      if (/^50*$/.test(full.slice(dot + 1 + d))) {
        // genau in der Mitte: zur geraden Ziffer runden
        const digits = full.slice(0, dot) + full.slice(dot + 1, dot + 1 + d);
        let n = BigInt(digits);
        if (n % 2n === 1n) n += 1n;
        s = n.toString().padStart(d + 1, '0');
        if (d > 0) s = s.slice(0, s.length - d) + '.' + s.slice(s.length - d);
        return (x < 0 || Object.is(x, -0) ? '-' : '') + s;
      }
    }
    s = x.toFixed(d);
    if (x < 0 && /^-0(\.0*)?$/.test(s)) return s; // -0.00 bleibt wie in Python
    return s;
  };

  PY.toExp = function (x, p, upper) {
    if (!isFinite(x)) return x !== x ? 'nan' : (x < 0 ? '-inf' : 'inf');
    let s = x.toExponential(p);
    s = s.replace(/e([+-])(\d)$/, 'e$10$2');
    return upper ? s.toUpperCase() : s;
  };

  PY.toGeneral = function (x, p, alt, upper) {
    if (!isFinite(x)) return x !== x ? 'nan' : (x < 0 ? '-inf' : 'inf');
    if (p === 0) p = 1;
    if (x === 0) return alt ? '0.' + '0'.repeat(p - 1) : '0';
    const e = parseInt(x.toExponential(p - 1).split('e')[1], 10);
    let s;
    if (e >= -4 && e < p) {
      s = PY.toFixed(x, Math.max(0, p - 1 - e));
      if (!alt && s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    } else {
      s = PY.toExp(x, p - 1, false);
      if (!alt) s = s.replace(/\.?0+e/, 'e');
    }
    return upper ? s.toUpperCase() : s;
  };

  /* ---------- Hash-Schlüssel für dict/set ---------- */
  PY.hashKey = function (v) {
    switch (typeof v) {
      case 'string': return 's' + v;
      case 'bigint': return 'i' + v;
      case 'boolean': return v ? 'i1' : 'i0';
      case 'number': return Number.isInteger(v) ? 'i' + BigInt(v) : 'f' + v;
    }
    if (v === null || v === undefined) return 'N';
    if (v instanceof Tuple) return 't(' + v.items.map(PY.hashKey).join(',') + ')';
    if (v instanceof PySet && v.frozen) return 'F(' + Array.from(v.map.keys()).sort().join(',') + ')';
    if (Array.isArray(v) || v instanceof PyDict || v instanceof PySet) PY.raise('TypeError', "unhashable type: '" + PY.typeName(v) + "'");
    if (v instanceof PyInstance) {
      if (PY.lookupClass(v.cls, '__eq__') && !PY.lookupClass(v.cls, '__hash__')) PY.raise('TypeError', "unhashable type: '" + v.cls.name + "'");
      return 'o' + v.id;
    }
    if (v instanceof PyClass || v instanceof PyFunction) return 'o' + v.id;
    if (v instanceof PyRange) return 'r' + v.start + ',' + v.stop + ',' + v.step;
    return 'x' + PY.typeName(v);
  };

  /* ---------- Darstellung (str / repr) ---------- */
  PY.strRepr = function (s) {
    let q = "'";
    if (s.indexOf("'") >= 0 && s.indexOf('"') < 0) q = '"';
    let out = q;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === q || ch === '\\') out += '\\' + ch;
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (c < 32 || c === 127) out += '\\x' + c.toString(16).padStart(2, '0');
      else out += ch;
    }
    return out + q;
  };

  PY.fakeAddr = function (id) { return '0x' + (0x7f3a5c000000 + id * 48).toString(16).padStart(12, '0'); };

  PY.repr = function* (v) {
    switch (typeof v) {
      case 'string': return PY.strRepr(v);
      case 'bigint': return v.toString();
      case 'number': return PY.floatRepr(v);
      case 'boolean': return v ? 'True' : 'False';
      case 'undefined': return 'None';
    }
    if (v === null) return 'None';
    if (Array.isArray(v)) {
      if (PY.reprStack.indexOf(v) >= 0) return '[...]';
      PY.reprStack.push(v);
      try {
        const parts = [];
        for (const x of v) parts.push(yield* PY.repr(x));
        return '[' + parts.join(', ') + ']';
      } finally { PY.reprStack.pop(); }
    }
    if (v instanceof Tuple) {
      const parts = [];
      for (const x of v.items) parts.push(yield* PY.repr(x));
      return '(' + parts.join(', ') + (parts.length === 1 ? ',' : '') + ')';
    }
    if (v instanceof PyDict) {
      if (PY.reprStack.indexOf(v) >= 0) return '{...}';
      PY.reprStack.push(v);
      try {
        const parts = [];
        for (const [k, x] of v.map.values()) parts.push((yield* PY.repr(k)) + ': ' + (yield* PY.repr(x)));
        return '{' + parts.join(', ') + '}';
      } finally { PY.reprStack.pop(); }
    }
    if (v instanceof PySet) {
      const parts = [];
      for (const x of v.map.values()) parts.push(yield* PY.repr(x));
      if (v.frozen) return 'frozenset(' + (parts.length ? '{' + parts.join(', ') + '}' : '') + ')';
      return parts.length ? '{' + parts.join(', ') + '}' : 'set()';
    }
    if (v instanceof PyView) {
      const parts = [];
      for (const x of v.items()) parts.push(yield* PY.repr(x));
      return 'dict_' + v.kind + '([' + parts.join(', ') + '])';
    }
    if (v instanceof PyRange) return 'range(' + v.start + ', ' + v.stop + (v.step !== 1n ? ', ' + v.step : '') + ')';
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__repr__');
      if (m) {
        const r = yield* PY.callValue(new BoundMethod(v, m), [], null);
        if (typeof r !== 'string') PY.raise('TypeError', '__repr__ returned non-string (type ' + PY.typeName(r) + ')');
        return r;
      }
      if (v.cls.isExc) {
        const a = v.attrs.get('args');
        const items = a ? a.items : [];
        const parts = [];
        for (const x of items) parts.push(yield* PY.repr(x));
        return v.cls.name + '(' + parts.join(', ') + ')';
      }
      return '<__main__.' + v.cls.name + ' object at ' + PY.fakeAddr(v.id) + '>';
    }
    if (v instanceof PyClass) return "<class '" + (v.prim || v.builtinExc ? '' : '__main__.') + v.name + "'>";
    if (v instanceof PyFunction) return '<function ' + v.name + ' at ' + PY.fakeAddr(v.id) + '>';
    if (v instanceof Builtin) return '<built-in function ' + v.name + '>';
    if (v instanceof BoundMethod) return '<bound method ' + (v.fn.name || '?') + ' of ' + (yield* PY.repr(v.self)) + '>';
    if (v instanceof PyGen) return '<generator object ' + v.name + ' at ' + PY.fakeAddr(v.id) + '>';
    if (v instanceof PyModule) return "<module '" + v.name + "'>";
    if (v === PY.ELLIPSIS) return 'Ellipsis';
    if (v instanceof PyIter) return '<iterator object>';
    return String(v);
  };
  PY.reprStack = [];

  PY.str = function* (v) {
    if (typeof v === 'string') return v;
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__str__');
      if (m) {
        const r = yield* PY.callValue(new BoundMethod(v, m), [], null);
        if (typeof r !== 'string') PY.raise('TypeError', '__str__ returned non-string (type ' + PY.typeName(r) + ')');
        return r;
      }
    }
    return yield* PY.repr(v);
  };

  /* ---------- Formatierung  format(value, spec) ---------- */
  PY.formatValue = function* (v, spec) {
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__format__');
      if (m) return yield* PY.callValue(new BoundMethod(v, m), [spec], null);
      if (!spec) return yield* PY.str(v);
    }
    if (!spec) return yield* PY.str(v);
    const m = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/s.exec(spec);
    if (!m) PY.raise('ValueError', 'Invalid format specifier');
    let fill = m[1], align = m[2];
    const sign = m[3] || '-', alt = !!m[4], zero = !!m[5];
    const width = m[6] ? parseInt(m[6], 10) : 0, group = m[7] || '';
    const prec = m[8] !== undefined ? parseInt(m[8], 10) : -1;
    let type = m[9] || '';
    let body, neg = false, prefix = '';
    const isNum = typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean';
    if (typeof v === 'string' || (!isNum)) {
      if (type && type !== 's') PY.raise('ValueError', "Unknown format code '" + type + "' for object of type '" + PY.typeName(v) + "'");
      body = typeof v === 'string' ? v : yield* PY.str(v);
      if (prec >= 0) body = body.slice(0, prec);
      if (!align) align = '<';
      if (sign !== '-') PY.raise('ValueError', 'Sign not allowed in string format specifier');
    } else {
      let x = typeof v === 'boolean' ? (v ? 1n : 0n) : v;
      if (typeof x === 'bigint' && 'eEfFgG%'.indexOf(type) >= 0 && type) x = Number(x);
      if (typeof x === 'bigint') {
        if (type === '' || type === 'd' || type === 'n') { neg = x < 0n; body = (neg ? -x : x).toString(); }
        else if (type === 'x' || type === 'X' || type === 'o' || type === 'b') {
          neg = x < 0n;
          body = (neg ? -x : x).toString(type === 'o' ? 8 : type === 'b' ? 2 : 16);
          if (type === 'X') body = body.toUpperCase();
          if (alt) prefix = '0' + type;
        } else if (type === 'c') { body = String.fromCodePoint(Number(x)); }
        else PY.raise('ValueError', "Unknown format code '" + type + "' for object of type 'int'");
      } else {
        neg = x < 0 || Object.is(x, -0);
        const ax = Math.abs(x);
        if (type === '' && prec < 0) body = PY.floatRepr(ax);
        else if (type === '' ) body = PY.toGeneral(ax, prec, alt, false);
        else if (type === 'f' || type === 'F') body = PY.toFixed(ax, prec < 0 ? 6 : prec);
        else if (type === 'e' || type === 'E') body = PY.toExp(ax, prec < 0 ? 6 : prec, type === 'E');
        else if (type === 'g' || type === 'G') body = PY.toGeneral(ax, prec < 0 ? 6 : prec, alt, type === 'G');
        else if (type === '%') body = PY.toFixed(ax * 100, prec < 0 ? 6 : prec) + '%';
        else if (type === 'n') body = PY.toGeneral(ax, prec < 0 ? 6 : prec, alt, false);
        else PY.raise('ValueError', "Unknown format code '" + type + "' for object of type 'float'");
        if (type === 'F' || type === 'G') body = body.toUpperCase();
      }
      if (group && !/[eE]/.test(body)) {
        const parts = body.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, group);
        body = parts.join('.');
      }
      const signStr = neg ? '-' : (sign === '+' ? '+' : sign === ' ' ? ' ' : '');
      if (zero && !align) { align = '='; fill = '0'; }
      if (!align) align = '>';
      const head = signStr + prefix;
      if (align === '=') {
        const padLen = Math.max(0, width - head.length - body.length);
        return head + (fill || ' ').repeat(padLen) + body;
      }
      body = head + body;
    }
    const padLen = Math.max(0, width - [...body].length);
    const f = fill || ' ';
    if (align === '<') return body + f.repeat(padLen);
    if (align === '>') return f.repeat(padLen) + body;
    if (align === '^') { const l = Math.floor(padLen / 2); return f.repeat(l) + body + f.repeat(padLen - l); }
    return body;
  };

  /* ---------- Vergleiche ---------- */
  function isNum(v) { const t = typeof v; return t === 'bigint' || t === 'number' || t === 'boolean'; }
  function numCmp(a, b) {
    // liefert -1,0,1 (oder NaN bei nan)
    if (typeof a === 'boolean') a = a ? 1n : 0n;
    if (typeof b === 'boolean') b = b ? 1n : 0n;
    if (a !== a || b !== b) return NaN;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  PY.isNum = isNum;

  PY.eq = function* (a, b) {
    if (a === b) return !(typeof a === 'number' && a !== a);
    const ta = typeof a, tb = typeof b;
    if (isNum(a) && isNum(b)) return numCmp(a, b) === 0;
    if (ta === 'string' || tb === 'string') return false;
    if (a === null || b === null || a === undefined || b === undefined) {
      if (a instanceof PyInstance) return yield* instEq(a, b);
      if (b instanceof PyInstance) return yield* instEq(b, a);
      return false;
    }
    if (a instanceof PyInstance) return yield* instEq(a, b);
    if (b instanceof PyInstance) return yield* instEq(b, a);
    if (Array.isArray(a) && Array.isArray(b)) return yield* seqEq(a, b);
    if (a instanceof Tuple && b instanceof Tuple) return yield* seqEq(a.items, b.items);
    if (a instanceof PyDict && b instanceof PyDict) {
      if (a.map.size !== b.map.size) return false;
      for (const [k, [kk, v]] of a.map) {
        const o = b.map.get(k);
        if (!o || !(yield* PY.eq(v, o[1]))) return false;
      }
      return true;
    }
    if (a instanceof PySet && b instanceof PySet) {
      if (a.map.size !== b.map.size) return false;
      for (const k of a.map.keys()) if (!b.map.has(k)) return false;
      return true;
    }
    if (a instanceof PyRange && b instanceof PyRange) return PY.rangeLen(a) === PY.rangeLen(b) && (PY.rangeLen(a) === 0n || (a.start === b.start && a.step === b.step));
    return false;
  };
  function* instEq(a, b) {
    const m = PY.lookupClass(a.cls, '__eq__');
    if (m) {
      const r = yield* PY.callValue(new BoundMethod(a, m), [b], null);
      if (r !== PY.NotImplemented) return yield* PY.isTrue(r);
    }
    if (b instanceof PyInstance) {
      const m2 = PY.lookupClass(b.cls, '__eq__');
      if (m2 && b !== a) {
        const r = yield* PY.callValue(new BoundMethod(b, m2), [a], null);
        if (r !== PY.NotImplemented) return yield* PY.isTrue(r);
      }
    }
    return a === b;
  }
  function* seqEq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!(yield* PY.eq(a[i], b[i]))) return false;
    return true;
  }
  PY.NotImplemented = { notImplemented: true };

  const CMP_NAMES = { '<': '__lt__', '<=': '__le__', '>': '__gt__', '>=': '__ge__' };
  const CMP_REFLECT = { '<': '__gt__', '<=': '__ge__', '>': '__lt__', '>=': '__le__' };

  /* Ordnungsvergleich a <op> b */
  PY.compare = function* (op, a, b) {
    if (isNum(a) && isNum(b)) {
      const c = numCmp(a, b);
      if (c !== c) return false;
      return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0;
    }
    if (typeof a === 'string' && typeof b === 'string') {
      return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    }
    if (a instanceof PyInstance) {
      const m = PY.lookupClass(a.cls, CMP_NAMES[op]);
      if (m) {
        const r = yield* PY.callValue(new BoundMethod(a, m), [b], null);
        if (r !== PY.NotImplemented) return yield* PY.isTrue(r);
      }
    }
    if (b instanceof PyInstance) {
      const m = PY.lookupClass(b.cls, CMP_REFLECT[op]);
      if (m) {
        const r = yield* PY.callValue(new BoundMethod(b, m), [a], null);
        if (r !== PY.NotImplemented) return yield* PY.isTrue(r);
      }
    }
    const sa = Array.isArray(a) ? a : a instanceof Tuple ? a.items : null;
    const sb = Array.isArray(b) ? b : b instanceof Tuple ? b.items : null;
    if (sa && sb && (Array.isArray(a) === Array.isArray(b))) {
      const n = Math.min(sa.length, sb.length);
      for (let i = 0; i < n; i++) {
        if (!(yield* PY.eq(sa[i], sb[i]))) return yield* PY.compare(op, sa[i], sb[i]);
      }
      const la = sa.length, lb = sb.length;
      return op === '<' ? la < lb : op === '<=' ? la <= lb : op === '>' ? la > lb : la >= lb;
    }
    if (a instanceof PySet && b instanceof PySet) {
      const sub = (x, y) => { for (const k of x.map.keys()) if (!y.map.has(k)) return false; return true; };
      if (op === '<=') return sub(a, b);
      if (op === '>=') return sub(b, a);
      if (op === '<') return a.map.size < b.map.size && sub(a, b);
      return b.map.size < a.map.size && sub(b, a);
    }
    PY.raise('TypeError', "'" + op + "' not supported between instances of '" + PY.typeName(a) + "' and '" + PY.typeName(b) + "'");
  };

  /* ---------- Rechnen ---------- */
  function toBig(v) { return typeof v === 'boolean' ? (v ? 1n : 0n) : v; }
  function toFloat(v) { return typeof v === 'number' ? v : Number(toBig(v)); }

  function floorDivBig(a, b) {
    let q = a / b;
    if ((a % b !== 0n) && ((a < 0n) !== (b < 0n))) q -= 1n;
    return q;
  }
  function modBig(a, b) {
    const r = a % b;
    return (r !== 0n && ((r < 0n) !== (b < 0n))) ? r + b : r;
  }
  function modFloat(a, b) {
    const r = a % b;
    return (r !== 0 && ((r < 0) !== (b < 0))) ? r + b : r;
  }

  const OP_NAMES = {
    '+': ['__add__', '__radd__'], '-': ['__sub__', '__rsub__'], '*': ['__mul__', '__rmul__'], '/': ['__truediv__', '__rtruediv__'],
    '//': ['__floordiv__', '__rfloordiv__'], '%': ['__mod__', '__rmod__'], '**': ['__pow__', '__rpow__'], '@': ['__matmul__', '__rmatmul__'],
    '&': ['__and__', '__rand__'], '|': ['__or__', '__ror__'], '^': ['__xor__', '__rxor__'], '<<': ['__lshift__', '__rlshift__'], '>>': ['__rshift__', '__rrshift__']
  };

  /* Schneller Weg für einfache Typen. Gibt undefined zurück, wenn nicht zuständig. */
  PY.binopPrim = function (op, a, b) {
    const ta = typeof a, tb = typeof b;
    if (ta === 'bigint' && tb === 'bigint') {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0n) PY.raise('ZeroDivisionError', 'division by zero'); return Number(a) / Number(b);
        case '//': if (b === 0n) PY.raise('ZeroDivisionError', 'integer division or modulo by zero'); return floorDivBig(a, b);
        case '%': if (b === 0n) PY.raise('ZeroDivisionError', 'integer modulo by zero'); return modBig(a, b);
        case '**':
          if (b < 0n) return Math.pow(Number(a), Number(b));
          if (b > 100000n && a !== 0n && a !== 1n && a !== -1n) PY.raise('OverflowError', 'Ergebnis zu groß');
          return a ** b;
        case '&': return a & b;
        case '|': return a | b;
        case '^': return a ^ b;
        case '<<': if (b < 0n) PY.raise('ValueError', 'negative shift count'); return a << b;
        case '>>': if (b < 0n) PY.raise('ValueError', 'negative shift count'); return a >> b;
      }
      return undefined;
    }
    if ((ta === 'number' || ta === 'bigint' || ta === 'boolean') && (tb === 'number' || tb === 'bigint' || tb === 'boolean') && (ta === 'number' || tb === 'number')) {
      const x = toFloat(a), y = toFloat(b);
      switch (op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': if (y === 0) PY.raise('ZeroDivisionError', 'float division by zero'); return x / y;
        case '//': if (y === 0) PY.raise('ZeroDivisionError', 'float floor division by zero'); return Math.floor(x / y);
        case '%': if (y === 0) PY.raise('ZeroDivisionError', 'float modulo by zero'); return modFloat(x, y);
        case '**':
          if (x === 0 && y < 0) PY.raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
          if (x < 0 && !Number.isInteger(y)) PY.raise('ValueError', 'komplexe Ergebnisse werden nicht unterstützt');
          return Math.pow(x, y);
      }
      return undefined;
    }
    if (ta === 'boolean' && tb === 'boolean' && (op === '&' || op === '|' || op === '^')) {
      return op === '&' ? a && b : op === '|' ? a || b : a !== b;
    }
    if ((ta === 'boolean' || tb === 'boolean') && (ta === 'bigint' || ta === 'boolean') && (tb === 'bigint' || tb === 'boolean')) {
      return PY.binopPrim(op, toBig(a), toBig(b));
    }
    if (ta === 'string') {
      if (op === '+' && tb === 'string') return a + b;
      if (op === '*' && (tb === 'bigint' || tb === 'boolean')) {
        const n = Number(toBig(b));
        if (n * a.length > 50000000) PY.raise('MemoryError', '');
        return n > 0 ? a.repeat(n) : '';
      }
    }
    if (tb === 'string' && op === '*' && (ta === 'bigint' || ta === 'boolean')) {
      const n = Number(toBig(a));
      return n > 0 ? b.repeat(n) : '';
    }
    return undefined;
  };

  PY.binop = function* (op, a, b) {
    const r = PY.binopPrim(op, a, b);
    if (r !== undefined) return r;
    if (op === '%' && typeof a === 'string') return yield* PY.percentFormat(a, b);
    if (op === '+') {
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      if (a instanceof Tuple && b instanceof Tuple) return new Tuple(a.items.concat(b.items));
    }
    if (op === '*') {
      if (Array.isArray(a) && (typeof b === 'bigint' || typeof b === 'boolean')) return PY.repeatSeq(a, Number(toBig(b)));
      if (Array.isArray(b) && (typeof a === 'bigint' || typeof a === 'boolean')) return PY.repeatSeq(b, Number(toBig(a)));
      if (a instanceof Tuple && (typeof b === 'bigint' || typeof b === 'boolean')) return new Tuple(PY.repeatSeq(a.items, Number(toBig(b))));
      if (b instanceof Tuple && (typeof a === 'bigint' || typeof a === 'boolean')) return new Tuple(PY.repeatSeq(b.items, Number(toBig(a))));
    }
    if (a instanceof PySet && b instanceof PySet) {
      const res = new PySet(a.frozen);
      if (op === '|') { for (const [k, v] of a.map) res.map.set(k, v); for (const [k, v] of b.map) res.map.set(k, v); return res; }
      if (op === '&') { for (const [k, v] of a.map) if (b.map.has(k)) res.map.set(k, v); return res; }
      if (op === '-') { for (const [k, v] of a.map) if (!b.map.has(k)) res.map.set(k, v); return res; }
      if (op === '^') { for (const [k, v] of a.map) if (!b.map.has(k)) res.map.set(k, v); for (const [k, v] of b.map) if (!a.map.has(k)) res.map.set(k, v); return res; }
    }
    if (a instanceof PyDict && b instanceof PyDict && op === '|') {
      const res = new PyDict();
      for (const [k, v] of a.map) res.map.set(k, v);
      for (const [k, v] of b.map) res.map.set(k, v);
      return res;
    }
    const names = OP_NAMES[op];
    if (names) {
      if (a instanceof PyInstance) {
        const m = PY.lookupClass(a.cls, names[0]);
        if (m) {
          const r2 = yield* PY.callValue(new BoundMethod(a, m), [b], null);
          if (r2 !== PY.NotImplemented) return r2;
        }
      }
      if (b instanceof PyInstance) {
        const m = PY.lookupClass(b.cls, names[1]);
        if (m) {
          const r2 = yield* PY.callValue(new BoundMethod(b, m), [a], null);
          if (r2 !== PY.NotImplemented) return r2;
        }
      }
    }
    if (op === '+' && typeof a === 'string') PY.raise('TypeError', 'can only concatenate str (not "' + PY.typeName(b) + '") to str');
    if (op === '*' && (typeof a === 'string' || typeof b === 'string' || Array.isArray(a) || Array.isArray(b))) PY.raise('TypeError', "can't multiply sequence by non-int of type '" + PY.typeName(typeof a === 'string' || Array.isArray(a) ? b : a) + "'");
    PY.raise('TypeError', "unsupported operand type(s) for " + op + ": '" + PY.typeName(a) + "' and '" + PY.typeName(b) + "'");
  };

  PY.repeatSeq = function (arr, n) {
    if (n <= 0) return [];
    if (arr.length * n > 20000000) PY.raise('MemoryError', '');
    const out = [];
    for (let i = 0; i < n; i++) for (const x of arr) out.push(x);
    return out;
  };

  PY.unary = function* (op, v) {
    if (op === 'not') return !(yield* PY.isTrue(v));
    if (typeof v === 'boolean') v = v ? 1n : 0n;
    if (op === '-') {
      if (typeof v === 'bigint') return -v;
      if (typeof v === 'number') return -v;
    } else if (op === '+') {
      if (typeof v === 'bigint' || typeof v === 'number') return v;
    } else if (op === '~') {
      if (typeof v === 'bigint') return ~v;
    }
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, op === '-' ? '__neg__' : op === '+' ? '__pos__' : '__invert__');
      if (m) return yield* PY.callValue(new BoundMethod(v, m), [], null);
    }
    PY.raise('TypeError', "bad operand type for unary " + op + ": '" + PY.typeName(v) + "'");
  };

  /* ---------- Teilbereiche ---------- */
  PY.sliceIdx = function (len, lower, upper, step) {
    const toN = (x) => typeof x === 'bigint' ? Number(x) : typeof x === 'boolean' ? (x ? 1 : 0) : x;
    if (step === null || step === undefined) step = 1; else step = toN(step);
    if (step === 0) PY.raise('ValueError', 'slice step cannot be zero');
    let lo, hi;
    if (step > 0) {
      lo = lower === null || lower === undefined ? 0 : toN(lower);
      hi = upper === null || upper === undefined ? len : toN(upper);
      if (lo < 0) lo = Math.max(0, lo + len); else lo = Math.min(lo, len);
      if (hi < 0) hi = Math.max(0, hi + len); else hi = Math.min(hi, len);
    } else {
      lo = lower === null || lower === undefined ? len - 1 : toN(lower);
      hi = upper === null || upper === undefined ? -1 : toN(upper);
      if (lower !== null && lower !== undefined) { if (lo < 0) lo = Math.max(-1, lo + len); else lo = Math.min(lo, len - 1); }
      if (upper !== null && upper !== undefined) { if (hi < 0) hi = Math.max(-1, hi + len); else hi = Math.min(hi, len - 1); }
    }
    const idx = [];
    if (step > 0) for (let i = lo; i < hi; i += step) idx.push(i);
    else for (let i = lo; i > hi; i += step) idx.push(i);
    return idx;
  };
})(typeof window !== 'undefined' ? window : globalThis);
