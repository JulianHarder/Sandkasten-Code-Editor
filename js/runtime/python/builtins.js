/* Python: eingebaute Funktionen, Typen, Methoden und Module */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const PY = KON.py = KON.py || {};
  const { PyClass, PyInstance, Tuple, PyDict, PySet, PyRange, PyFunction, Builtin, BoundMethod, PyModule,
    StaticMethod, ClassMethod, Property, SuperProxy, PyIter, PyThrow, ExitSignal, PyView } = PY;
  const TICK = KON.TICK;

  PY.builtinsMap = new Map();
  PY.methods = { str: {}, list: {}, dict: {}, set: {}, frozenset: {}, tuple: {}, int: {}, float: {}, bool: {}, range: {}, dict_keys: {}, dict_values: {}, dict_items: {} };
  PY.classMethods = {};
  PY.modules = {};
  const M = PY.methods;
  const B = PY.builtinsMap;

  const big = (n) => BigInt(n);
  const isInt = (v) => typeof v === 'bigint' || typeof v === 'boolean';
  const toInt = (v) => (typeof v === 'boolean' ? (v ? 1n : 0n) : v);
  const tn = PY.typeName;

  function def(name, fn) { B.set(name, new Builtin(name, fn)); }
  function argErr(name, got, min, max) {
    const exp = min === max ? 'exactly ' + min : 'at most ' + max;
    PY.raise('TypeError', name + '() takes ' + exp + ' argument' + ((max === 1 || min === 1) && min === max ? '' : 's') + ' (' + got + ' given)');
  }
  function needInt(v, what) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v ? 1n : 0n;
    if (v instanceof PyInstance) { /* __index__ */ }
    PY.raise('TypeError', "'" + tn(v) + "' object cannot be interpreted as an integer");
  }
  function kwGet(kw, name, dflt) { return kw && kw.has(name) ? kw.get(name) : dflt; }

  /* ---------- Typen ---------- */
  function mkType(name, bases, ctor) {
    const c = new PyClass(name, bases || [PY.objectClass], new Map());
    c.prim = name; c.ctor = ctor || null;
    PY.types[name] = c;
    B.set(name, c);
    return c;
  }
  PY.types.object = PY.objectClass;
  PY.objectClass.ctor = function* (args) {
    const inst = new PyInstance(PY.objectClass);
    return inst;
  };
  PY.objectClass.dict.set('__init__', new Builtin('__init__', () => null));
  B.set('object', PY.objectClass);

  const intType = mkType('int', null, function* (args, kw) {
    if (args.length === 0) return 0n;
    const v = args[0];
    const base = args.length > 1 ? Number(args[1]) : kw && kw.has('base') ? Number(kw.get('base')) : 10;
    return yield* toIntValue(v, base, args.length > 1 || (kw && kw.has('base')));
  });
  function* toIntValue(v, base, hasBase) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v ? 1n : 0n;
    if (typeof v === 'number') {
      if (v !== v) PY.raise('ValueError', 'cannot convert float NaN to integer');
      if (!isFinite(v)) PY.raise('OverflowError', 'cannot convert float infinity to integer');
      return BigInt(Math.trunc(v));
    }
    if (typeof v === 'string') {
      let s = v.trim().replace(/_/g, '');
      let neg = false;
      if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
      let b = base;
      if (b === 0 || (b === 16 && /^0x/i.test(s)) || (b === 8 && /^0o/i.test(s)) || (b === 2 && /^0b/i.test(s))) {
        if (/^0x/i.test(s)) { b = 16; s = s.slice(2); }
        else if (/^0o/i.test(s)) { b = 8; s = s.slice(2); }
        else if (/^0b/i.test(s)) { b = 2; s = s.slice(2); }
        else if (b === 0) b = 10;
      }
      const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, b);
      let ok = s.length > 0 && v.trim().indexOf('__') < 0 && !/^_|_$/.test(v.trim());
      for (const ch of s.toLowerCase()) if (digits.indexOf(ch) < 0) { ok = false; break; }
      if (!ok) PY.raise('ValueError', 'invalid literal for int() with base ' + b + ': ' + PY.strRepr(v));
      let r = 0n;
      const bb = BigInt(b);
      for (const ch of s.toLowerCase()) r = r * bb + BigInt(digits.indexOf(ch));
      return neg ? -r : r;
    }
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__int__') || PY.lookupClass(v.cls, '__index__');
      if (m) return yield* PY.callValue(new BoundMethod(v, m), [], null);
    }
    PY.raise('TypeError', "int() argument must be a string, a bytes-like object or a real number, not '" + tn(v) + "'");
  }

  const floatType = mkType('float', null, function* (args) {
    if (args.length === 0) return 0.0;
    const v = args[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const s = v.trim().replace(/_/g, '').toLowerCase();
      if (/^[+-]?(inf|infinity)$/.test(s)) return s[0] === '-' ? -Infinity : Infinity;
      if (/^[+-]?nan$/.test(s)) return NaN;
      if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s)) return parseFloat(s);
      PY.raise('ValueError', 'could not convert string to float: ' + PY.strRepr(v));
    }
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__float__');
      if (m) return yield* PY.callValue(new BoundMethod(v, m), [], null);
    }
    PY.raise('TypeError', "float() argument must be a string or a real number, not '" + tn(v) + "'");
  });

  const strType = mkType('str', null, function* (args) {
    if (args.length === 0) return '';
    return yield* PY.str(args[0]);
  });
  const boolType = mkType('bool', [intType], function* (args) {
    if (args.length === 0) return false;
    return yield* PY.isTrue(args[0]);
  });
  mkType('list', null, function* (args) {
    if (args.length === 0) return [];
    return (yield* PY.toArray(args[0])).slice();
  });
  mkType('tuple', null, function* (args) {
    if (args.length === 0) return new Tuple([]);
    return new Tuple((yield* PY.toArray(args[0])).slice());
  });
  mkType('dict', null, function* (args, kw) {
    const d = new PyDict();
    if (args.length) {
      const src = args[0];
      if (src instanceof PyDict) { for (const [k, e] of src.map) d.map.set(k, [e[0], e[1]]); }
      else {
        for (const item of yield* PY.toArray(src)) {
          const kv = yield* PY.toArray(item);
          if (kv.length !== 2) PY.raise('ValueError', 'dictionary update sequence element has length ' + kv.length + '; 2 is required');
          d.map.set(PY.hashKey(kv[0]), [kv[0], kv[1]]);
        }
      }
    }
    if (kw) for (const [k, v] of kw) d.map.set('s' + k, [k, v]);
    return d;
  });
  mkType('set', null, function* (args) {
    const s = new PySet(false);
    if (args.length) for (const x of yield* PY.toArray(args[0])) s.map.set(PY.hashKey(x), x);
    return s;
  });
  mkType('frozenset', null, function* (args) {
    const s = new PySet(true);
    if (args.length) for (const x of yield* PY.toArray(args[0])) s.map.set(PY.hashKey(x), x);
    return s;
  });
  mkType('range', null, function* (args) {
    if (args.length < 1 || args.length > 3) PY.raise('TypeError', 'range expected at most 3 arguments, got ' + args.length);
    const a = args.map((x) => needInt(x));
    if (a.length === 1) return new PyRange(0n, a[0], 1n);
    if (a.length === 2) return new PyRange(a[0], a[1], 1n);
    if (a[2] === 0n) PY.raise('ValueError', 'range() arg 3 must not be zero');
    return new PyRange(a[0], a[1], a[2]);
  });
  mkType('type', null, function* (args) {
    if (args.length === 1) return PY.classOf(args[0]);
    PY.raise('NotImplementedError', 'type() mit drei Argumenten wird noch nicht unterstützt');
  });
  for (const n of ['NoneType', 'function', 'builtin_function_or_method', 'method', 'module', 'iterator', 'generator', 'ellipsis', 'dict_keys', 'dict_values', 'dict_items']) {
    const c = new PyClass(n, [PY.objectClass], new Map()); c.prim = n; PY.types[n] = c;
  }
  for (const [name, c] of Object.entries(PY.excClasses)) B.set(name, c);
  B.set('NotImplemented', PY.NotImplemented);
  B.set('Ellipsis', PY.ELLIPSIS);

  /* ---------- Klassenmethoden von Typen ---------- */
  PY.classMethods.dict = {
    fromkeys: new Builtin('fromkeys', function (a) {
      const d = new PyDict();
      const keys = a[0] instanceof PyDict ? Array.from(a[0].map.values(), (e) => e[0]) : Array.isArray(a[0]) ? a[0] : typeof a[0] === 'string' ? Array.from(a[0]) : a[0] instanceof Tuple ? a[0].items : [];
      for (const k of keys) d.map.set(PY.hashKey(k), [k, a.length > 1 ? a[1] : null]);
      return d;
    })
  };
  PY.classMethods.str = {
    maketrans: new Builtin('maketrans', function (a) {
      const d = new PyDict();
      if (a.length === 1 && a[0] instanceof PyDict) return a[0];
      for (let i = 0; i < a[0].length; i++) d.map.set('i' + BigInt(a[0].charCodeAt(i)), [BigInt(a[0].charCodeAt(i)), a[1][i]]);
      if (a[2]) for (const ch of a[2]) d.map.set('i' + BigInt(ch.charCodeAt(0)), [BigInt(ch.charCodeAt(0)), null]);
      return d;
    })
  };
  PY.classMethods.int = { from_bytes: new Builtin('from_bytes', () => PY.raise('NotImplementedError', 'bytes werden nicht unterstützt')) };
  PY.classMethods.float = {};

  /* ---------- isinstance ---------- */
  PY.isInstanceOf = function (v, cls) {
    if (cls instanceof Tuple) return cls.items.some((c) => PY.isInstanceOf(v, c));
    if (!(cls instanceof PyClass)) PY.raise('TypeError', 'isinstance() arg 2 must be a type, a tuple of types, or a union');
    if (cls === PY.objectClass) return true;
    return PY.classOf(v).mro.indexOf(cls) >= 0;
  };

  /* ---------- Sortieren ---------- */
  PY.sortArray = function* (arr, key, reverse) {
    const keys = [];
    if (key) { for (const x of arr) keys.push(yield* PY.callValue(key, [x], null)); }
    else for (const x of arr) keys.push(x);
    const items = arr.map((v, i) => ({ v: v, k: keys[i] }));
    const allBig = keys.every((k) => typeof k === 'bigint');
    const allStr = keys.every((k) => typeof k === 'string');
    const allNum = keys.every((k) => typeof k === 'bigint' || typeof k === 'number' || typeof k === 'boolean');
    if ((allBig || allStr || allNum) && !keys.some((k) => k !== k)) {
      const cmp = allStr ? (a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)
        : (a, b) => { const x = toInt(a.k), y = toInt(b.k); return x < y ? -1 : x > y ? 1 : 0; };
      items.sort(reverse ? (a, b) => cmp(b, a) : cmp);
      return items.map((i) => i.v);
    }
    // allgemeiner, stabiler Merge-Sort mit Python-Vergleichen
    const less = function* (a, b) { return yield* PY.compare('<', a.k, b.k); };
    let work = items;
    for (let width = 1; width < work.length; width *= 2) {
      const out = [];
      for (let lo = 0; lo < work.length; lo += 2 * width) {
        const mid = Math.min(lo + width, work.length), hi = Math.min(lo + 2 * width, work.length);
        let i = lo, j = mid;
        while (i < mid && j < hi) {
          const takeRight = reverse ? yield* less(work[i], work[j]) : yield* less(work[j], work[i]);
          if (takeRight) out.push(work[j++]); else out.push(work[i++]);
        }
        while (i < mid) out.push(work[i++]);
        while (j < hi) out.push(work[j++]);
        yield TICK;
      }
      work = out;
    }
    return work.map((i) => i.v);
  };

  /* ---------- Funktionen ---------- */
  def('print', function* (args, kw) {
    const sep = kwGet(kw, 'sep', ' '), end = kwGet(kw, 'end', '\n'), file = kwGet(kw, 'file', null);
    if (sep !== null && typeof sep !== 'string') PY.raise('TypeError', 'sep must be None or a string, not ' + tn(sep));
    if (end !== null && typeof end !== 'string') PY.raise('TypeError', 'end must be None or a string, not ' + tn(end));
    let out = '';
    for (let i = 0; i < args.length; i++) {
      if (i) out += sep === null ? ' ' : sep;
      const a = args[i];
      out += typeof a === 'string' ? a : yield* PY.str(a);
    }
    out += end === null ? '\n' : end;
    const st = PY.getState();
    if (file instanceof PyModule && file.name === 'stderr') st.io.writeErr(out);
    else st.io.write(out);
    return null;
  });
  def('input', function* (args) {
    const prompt = args.length ? yield* PY.str(args[0]) : '';
    const line = yield KON.inputRequest(prompt);
    if (line === null || line === undefined) PY.raise('EOFError', 'EOF when reading a line');
    return line;
  });
  def('len', function* (args) {
    if (args.length !== 1) argErr('len', args.length, 1, 1);
    const v = args[0];
    if (typeof v === 'string') return big(Array.from(v).length === v.length ? v.length : Array.from(v).length);
    if (Array.isArray(v)) return big(v.length);
    if (v instanceof Tuple) return big(v.items.length);
    if (v instanceof PyDict || v instanceof PySet) return big(v.map.size);
    if (v instanceof PyRange) return PY.rangeLen(v);
    if (v instanceof PyView) return big(v.d.map.size);
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__len__');
      if (m) {
        const r = yield* PY.callValue(new BoundMethod(v, m), [], null);
        if (typeof r !== 'bigint') PY.raise('TypeError', "'" + tn(r) + "' object cannot be interpreted as an integer");
        if (r < 0n) PY.raise('ValueError', '__len__() should return >= 0');
        return r;
      }
    }
    PY.raise('TypeError', "object of type '" + tn(v) + "' has no len()");
  });
  def('abs', function* (a) {
    const v = a[0];
    if (typeof v === 'bigint') return v < 0n ? -v : v;
    if (typeof v === 'number') return Math.abs(v);
    if (typeof v === 'boolean') return v ? 1n : 0n;
    if (v instanceof PyInstance) { const m = PY.lookupClass(v.cls, '__abs__'); if (m) return yield* PY.callValue(new BoundMethod(v, m), [], null); }
    PY.raise('TypeError', "bad operand type for abs(): '" + tn(v) + "'");
  });
  function* minmax(name, args, kw, wantMax) {
    const key = kwGet(kw, 'key', null);
    const hasDefault = kw && kw.has('default');
    let items;
    if (args.length === 1) items = yield* PY.toArray(args[0]);
    else items = args;
    if (!items.length) {
      if (hasDefault) return kw.get('default');
      PY.raise('ValueError', name + '() iterable argument is empty');
    }
    if (args.length === 0) PY.raise('TypeError', name + ' expected at least 1 argument, got 0');
    let best = items[0];
    let bestKey = key ? yield* PY.callValue(key, [best], null) : best;
    for (let i = 1; i < items.length; i++) {
      const k = key ? yield* PY.callValue(key, [items[i]], null) : items[i];
      const better = yield* PY.compare(wantMax ? '>' : '<', k, bestKey);
      if (better) { best = items[i]; bestKey = k; }
    }
    return best;
  }
  def('min', function* (a, k) { return yield* minmax('min', a, k, false); });
  def('max', function* (a, k) { return yield* minmax('max', a, k, true); });
  def('sum', function* (args, kw) {
    let acc = args.length > 1 ? args[1] : kwGet(kw, 'start', 0n);
    if (typeof acc === 'string') PY.raise('TypeError', "sum() can't sum strings [use ''.join(seq) instead]");
    for (const x of yield* PY.toArray(args[0])) {
      const r = PY.binopPrim('+', acc, x);
      acc = r !== undefined ? r : yield* PY.binop('+', acc, x);
    }
    return acc;
  });
  def('sorted', function* (args, kw) {
    if (args.length !== 1) argErr('sorted', args.length, 1, 1);
    const arr = (yield* PY.toArray(args[0])).slice();
    return yield* PY.sortArray(arr, kwGet(kw, 'key', null), yield* PY.isTrue(kwGet(kw, 'reverse', false)));
  });
  def('reversed', function* (args) {
    const v = args[0];
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__reversed__');
      if (m) return yield* PY.callValue(new BoundMethod(v, m), [], null);
    }
    const arr = (yield* PY.toArray(v)).slice().reverse();
    return PY.iterOfArray(arr);
  });
  def('enumerate', function* (args, kw) {
    const it = yield* PY.getIter(args[0]);
    let i = args.length > 1 ? needInt(args[1]) : kw && kw.has('start') ? needInt(kw.get('start')) : 0n;
    return new PyIter(function* () {
      const r = it.gen ? yield* it.next() : it.next();
      if (r.done) return r;
      return { done: false, value: new Tuple([i++, r.value]) };
    }, true);
  });
  def('zip', function* (args) {
    const its = [];
    for (const a of args) its.push(yield* PY.getIter(a));
    return new PyIter(function* () {
      if (!its.length) return { done: true };
      const vals = [];
      for (const it of its) {
        const r = it.gen ? yield* it.next() : it.next();
        if (r.done) return r;
        vals.push(r.value);
      }
      return { done: false, value: new Tuple(vals) };
    }, true);
  });
  def('map', function* (args) {
    const f = args[0];
    const its = [];
    for (const a of args.slice(1)) its.push(yield* PY.getIter(a));
    return new PyIter(function* () {
      const vals = [];
      for (const it of its) {
        const r = it.gen ? yield* it.next() : it.next();
        if (r.done) return r;
        vals.push(r.value);
      }
      return { done: false, value: yield* PY.callValue(f, vals, null) };
    }, true);
  });
  def('filter', function* (args) {
    const f = args[0];
    const it = yield* PY.getIter(args[1]);
    return new PyIter(function* () {
      for (;;) {
        const r = it.gen ? yield* it.next() : it.next();
        if (r.done) return r;
        const keep = f === null ? yield* PY.isTrue(r.value) : yield* PY.isTrue(yield* PY.callValue(f, [r.value], null));
        if (keep) return r;
      }
    }, true);
  });
  def('iter', function* (args) { return yield* PY.getIter(args[0]); });
  def('next', function* (args) {
    const it = args[0];
    if (it instanceof PY.PyGen) {
      const r = yield* PY.genStep(it);
      if (r.done) { if (args.length > 1) return args[1]; PY.raise('StopIteration'); }
      return r.value;
    }
    if (!(it instanceof PyIter)) {
      if (it instanceof PyInstance) {
        const m = PY.lookupClass(it.cls, '__next__');
        if (m) return yield* PY.callValue(new BoundMethod(it, m), [], null);
      }
      PY.raise('TypeError', "'" + tn(it) + "' object is not an iterator");
    }
    const r = it.gen ? yield* it.next() : it.next();
    if (r.done) {
      if (args.length > 1) return args[1];
      PY.raise('StopIteration');
    }
    return r.value;
  });
  def('range_', () => null);
  B.delete('range_');

  function roundHalfEven(x) {
    const r = Math.round(x);
    if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
    return r;
  }
  def('round', function* (args, kw) {
    const x = args[0];
    const nd = args.length > 1 ? args[1] : kwGet(kw, 'ndigits', null);
    if (x instanceof PyInstance) {
      const m = PY.lookupClass(x.cls, '__round__');
      if (m) return yield* PY.callValue(new BoundMethod(x, m), nd === null ? [] : [nd], null);
    }
    if (typeof x === 'string' || x === null || !PY.isNum(x)) PY.raise('TypeError', "type " + tn(x) + " doesn't define __round__ method");
    if (nd === null) {
      if (typeof x === 'number') {
        if (x !== x) PY.raise('ValueError', 'cannot convert float NaN to integer');
        if (!isFinite(x)) PY.raise('OverflowError', 'cannot convert float infinity to integer');
        return BigInt(roundHalfEven(x));
      }
      return toInt(x);
    }
    const n = Number(needInt(nd));
    if (typeof x === 'number') {
      if (!isFinite(x)) return x;
      if (n >= 0) return parseFloat(PY.toFixed(x, Math.min(n, 100)));
      const f = Math.pow(10, -n);
      return roundHalfEven(x / f) * f;
    }
    const xi = toInt(x);
    if (n >= 0) return xi;
    const f = 10n ** BigInt(-n);
    const q = xi / f, r = xi % f;
    let res = q;
    const twice = (r < 0n ? -r : r) * 2n;
    if (twice > f || (twice === f && (q % 2n !== 0n))) res = q + (xi < 0n ? -1n : 1n);
    return res * f;
  });
  def('pow', function* (args) {
    if (args.length === 3) {
      let b = needInt(args[0]), e = needInt(args[1]); const m = needInt(args[2]);
      if (m === 0n) PY.raise('ValueError', 'pow() 3rd argument cannot be 0');
      let r = 1n; b = ((b % m) + m) % m;
      if (e < 0n) PY.raise('ValueError', 'negative exponent bei 3-Argument-pow wird nicht unterstützt');
      while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
      return r;
    }
    return yield* PY.binop('**', args[0], args[1]);
  });
  def('divmod', function* (a) {
    return new Tuple([yield* PY.binop('//', a[0], a[1]), yield* PY.binop('%', a[0], a[1])]);
  });
  def('isinstance', (a) => PY.isInstanceOf(a[0], a[1]));
  def('issubclass', (a) => {
    const f = (c) => { if (!(c instanceof PyClass)) PY.raise('TypeError', 'issubclass() arg 1 must be a class'); return a[1] instanceof Tuple ? a[1].items.some((t) => c.mro.indexOf(t) >= 0) : c.mro.indexOf(a[1]) >= 0; };
    return f(a[0]);
  });
  def('chr', (a) => {
    const n = Number(needInt(a[0]));
    if (n < 0 || n > 0x10ffff) PY.raise('ValueError', 'chr() arg not in range(0x110000)');
    return String.fromCodePoint(n);
  });
  def('ord', (a) => {
    if (typeof a[0] !== 'string') PY.raise('TypeError', 'ord() expected string of length 1, but ' + tn(a[0]) + ' found');
    if (Array.from(a[0]).length !== 1) PY.raise('TypeError', 'ord() expected a character, but string of length ' + Array.from(a[0]).length + ' found');
    return big(a[0].codePointAt(0));
  });
  def('any', function* (a) {
    for (const x of yield* PY.toArray(a[0])) if (yield* PY.isTrue(x)) return true;
    return false;
  });
  def('all', function* (a) {
    for (const x of yield* PY.toArray(a[0])) if (!(yield* PY.isTrue(x))) return false;
    return true;
  });
  def('repr', function* (a) { return yield* PY.repr(a[0]); });
  def('ascii', function* (a) { return yield* PY.repr(a[0]); });
  def('format', function* (a) { return yield* PY.formatValue(a[0], a.length > 1 ? a[1] : ''); });
  function baseStr(name, base, prefix) {
    def(name, (a) => {
      const n = needInt(a[0]);
      return (n < 0n ? '-' : '') + prefix + (n < 0n ? -n : n).toString(base);
    });
  }
  baseStr('bin', 2, '0b'); baseStr('hex', 16, '0x'); baseStr('oct', 8, '0o');
  def('id', (a) => big(a[0] && a[0].id ? a[0].id * 48 + 140000000 : typeof a[0] === 'bigint' ? Number(a[0]) * 32 + 10000 : 94000000));
  def('hash', (a) => {
    const k = PY.hashKey(a[0]);
    if (k[0] === 'i') return BigInt(k.slice(1));
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
    return big(h);
  });
  def('hasattr', function* (a) {
    try { yield* PY.getAttr(a[0], a[1]); return true; } catch (e) {
      if (e instanceof PyThrow && e.inst.cls.name === 'AttributeError') return false;
      throw e;
    }
  });
  def('getattr', function* (a) {
    try { return yield* PY.getAttr(a[0], a[1]); } catch (e) {
      if (a.length > 2 && e instanceof PyThrow && e.inst.cls.name === 'AttributeError') return a[2];
      throw e;
    }
  });
  def('setattr', function* (a) { yield* PY.setAttr(a[0], a[1], a[2]); return null; });
  def('delattr', function* (a) {
    if (a[0] instanceof PyInstance) a[0].attrs.delete(a[1]); return null;
  });
  def('callable', (a) => {
    const v = a[0];
    return v instanceof PyFunction || v instanceof Builtin || v instanceof BoundMethod || v instanceof PyClass || (v instanceof PyInstance && !!PY.lookupClass(v.cls, '__call__'));
  });
  def('dir', function* (a) {
    const names = new Set();
    const o = a[0];
    if (o instanceof PyInstance) { for (const k of o.attrs.keys()) names.add(k); for (const c of o.cls.mro) for (const k of c.dict.keys()) names.add(k); }
    else if (o instanceof PyClass) for (const c of o.mro) for (const k of c.dict.keys()) names.add(k);
    else if (o instanceof PyModule) for (const k of o.attrs.keys()) names.add(k);
    else { const t = M[tn(o)]; if (t) for (const k of Object.keys(t)) names.add(k); }
    return Array.from(names).sort();
  });
  def('vars', function* (a) { return yield* PY.getAttr(a[0], '__dict__'); });
  def('exit', (a) => { throw new ExitSignal(a.length && typeof a[0] === 'bigint' ? Number(a[0]) : 0); });
  B.set('quit', B.get('exit'));
  def('super', () => PY.raise('RuntimeError', 'super(): no arguments'));
  def('open', () => PY.raise('OSError', 'open(): Dateizugriff ist im Browser-Editor nicht verfügbar'));
  def('eval', () => PY.raise('NotImplementedError', 'eval() wird nicht unterstützt'));
  def('exec', () => PY.raise('NotImplementedError', 'exec() wird nicht unterstützt'));
  def('globals', () => new PyDict());
  def('locals', () => new PyDict());
  def('property', (a, kw) => new Property(a.length ? a[0] : kwGet(kw, 'fget', null), a.length > 1 ? a[1] : kwGet(kw, 'fset', null)));
  def('staticmethod', (a) => new StaticMethod(a[0]));
  def('classmethod', (a) => new ClassMethod(a[0]));
  def('slice', (a) => (a.length === 1 ? new PY.PySlice(null, a[0], null) : new PY.PySlice(a[0], a[1], a[2] === undefined ? null : a[2])));

  /* ---------- Hilfen für Methoden ---------- */
  function* strArg(v, what) {
    if (typeof v !== 'string') PY.raise('TypeError', what + ' must be str, not ' + tn(v));
    return v;
  }
  const WS = /^[\s\u0085]+/;
  const WSEND = /[\s\u0085]+$/;
  function stripChars(s, chars, left, right) {
    if (chars === null || chars === undefined) {
      if (left) s = s.replace(WS, '');
      if (right) s = s.replace(WSEND, '');
      return s;
    }
    let i = 0, j = s.length;
    if (left) while (i < j && chars.indexOf(s[i]) >= 0) i++;
    if (right) while (j > i && chars.indexOf(s[j - 1]) >= 0) j--;
    return s.slice(i, j);
  }

  /* ---------- str ---------- */
  Object.assign(M.str, {
    upper: (s) => s.toUpperCase(),
    lower: (s) => s.toLowerCase(),
    casefold: (s) => s.toLowerCase(),
    capitalize: (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s),
    title: (s) => s.toLowerCase().replace(/(^|[^A-Za-zÀ-ɏ])([A-Za-zÀ-ɏ])/g, (m, a, b) => a + b.toUpperCase()),
    swapcase: (s) => Array.from(s).map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
    strip: (s, a) => stripChars(s, a.length ? a[0] : null, true, true),
    lstrip: (s, a) => stripChars(s, a.length ? a[0] : null, true, false),
    rstrip: (s, a) => stripChars(s, a.length ? a[0] : null, false, true),
    split(s, a, kw) {
      const sep = a.length ? a[0] : kwGet(kw, 'sep', null);
      let max = a.length > 1 ? Number(a[1]) : Number(kwGet(kw, 'maxsplit', -1n));
      if (sep === null) {
        const t = s.replace(WS, '');
        if (!t) return [];
        if (max < 0) return t.split(/[\s\u0085]+/).filter((x, i, arr) => !(i === arr.length - 1 && x === ''));
        const out = []; let rest = t;
        while (max-- > 0) {
          const m = /[\s]+/.exec(rest);
          if (!m) break;
          out.push(rest.slice(0, m.index)); rest = rest.slice(m.index + m[0].length);
          if (!rest) return out;
        }
        out.push(rest.replace(WSEND, '') === '' ? '' : rest); if (out[out.length - 1] === '') out.pop();
        return out;
      }
      if (sep === '') PY.raise('ValueError', 'empty separator');
      if (max < 0) return s.split(sep);
      const out = []; let rest = s;
      while (max-- > 0) {
        const i = rest.indexOf(sep);
        if (i < 0) break;
        out.push(rest.slice(0, i)); rest = rest.slice(i + sep.length);
      }
      out.push(rest);
      return out;
    },
    rsplit(s, a, kw) {
      const sep = a.length ? a[0] : kwGet(kw, 'sep', null);
      let max = a.length > 1 ? Number(a[1]) : Number(kwGet(kw, 'maxsplit', -1n));
      if (sep === null) return M.str.split(s, a, kw);
      if (max < 0) return s.split(sep);
      const out = []; let rest = s;
      while (max-- > 0) {
        const i = rest.lastIndexOf(sep);
        if (i < 0) break;
        out.unshift(rest.slice(i + sep.length)); rest = rest.slice(0, i);
      }
      out.unshift(rest);
      return out;
    },
    splitlines: (s, a) => {
      const keep = a.length && PY.truth(a[0]);
      const parts = s.split(/(\r\n|\r|\n)/);
      const out = [];
      for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 < parts.length) out.push(keep ? parts[i] + parts[i + 1] : parts[i]);
        else if (parts[i] !== '') out.push(parts[i]);
      }
      return out;
    },
    join: function* (s, a) {
      const items = yield* PY.toArray(a[0]);
      const parts = [];
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i] !== 'string') PY.raise('TypeError', 'sequence item ' + i + ': expected str instance, ' + tn(items[i]) + ' found');
        parts.push(items[i]);
      }
      return parts.join(s);
    },
    replace(s, a) {
      if (typeof a[0] !== 'string' || typeof a[1] !== 'string') PY.raise('TypeError', 'replace() argument must be str');
      const count = a.length > 2 ? Number(a[2]) : -1;
      if (count < 0) return a[0] === '' ? Array.from(s).join(a[1]).replace(/^/, a[1]) + a[1] : s.split(a[0]).join(a[1]);
      let out = '', rest = s, n = count;
      while (n-- > 0) {
        const i = rest.indexOf(a[0]);
        if (i < 0) break;
        out += rest.slice(0, i) + a[1]; rest = rest.slice(i + a[0].length);
      }
      return out + rest;
    },
    find(s, a) { const st = a.length > 1 ? Number(a[1]) : 0; const r = s.indexOf(a[0], st < 0 ? Math.max(0, s.length + st) : st); return big(r); },
    rfind(s, a) { return big(s.lastIndexOf(a[0])); },
    index(s, a) { const r = s.indexOf(a[0], a.length > 1 ? Number(a[1]) : 0); if (r < 0) PY.raise('ValueError', 'substring not found'); return big(r); },
    rindex(s, a) { const r = s.lastIndexOf(a[0]); if (r < 0) PY.raise('ValueError', 'substring not found'); return big(r); },
    count(s, a) {
      if (typeof a[0] !== 'string') PY.raise('TypeError', 'must be str, not ' + tn(a[0]));
      if (a[0] === '') return big(s.length + 1);
      return big(s.split(a[0]).length - 1);
    },
    startswith(s, a) {
      const t = a[0] instanceof Tuple ? a[0].items : [a[0]];
      const st = a.length > 1 ? Number(a[1]) : 0;
      return t.some((p) => { if (typeof p !== 'string') PY.raise('TypeError', 'startswith first arg must be str or a tuple of str, not ' + tn(p)); return s.startsWith(p, st); });
    },
    endswith(s, a) {
      const t = a[0] instanceof Tuple ? a[0].items : [a[0]];
      return t.some((p) => { if (typeof p !== 'string') PY.raise('TypeError', 'endswith first arg must be str or a tuple of str, not ' + tn(p)); return s.endsWith(p); });
    },
    isdigit: (s) => s.length > 0 && /^[0-9²³¹]+$/.test(s),
    isdecimal: (s) => s.length > 0 && /^[0-9]+$/.test(s),
    isnumeric: (s) => s.length > 0 && /^[0-9²³¹¼-¾]+$/.test(s),
    isalpha: (s) => s.length > 0 && /^[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]+$/.test(s),
    isalnum: (s) => s.length > 0 && /^[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ]+$/.test(s),
    isspace: (s) => s.length > 0 && /^\s+$/.test(s),
    isupper: (s) => /[A-Za-zÀ-ɏ]/.test(s) && s === s.toUpperCase(),
    islower: (s) => /[A-Za-zÀ-ɏ]/.test(s) && s === s.toLowerCase(),
    istitle: (s) => /[A-Za-z]/.test(s) && s === M.str.title(s),
    isidentifier: (s) => /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*$/.test(s) && !PY.KEYWORDS.has(s),
    isascii: (s) => /^[\x00-\x7f]*$/.test(s),
    center(s, a) {
      const w = Number(a[0]), f = a.length > 1 ? a[1] : ' ';
      const total = w - s.length; if (total <= 0) return s;
      const left = Math.floor(total / 2) + (total % 2 && w % 2 ? 1 : 0);
      return f.repeat(left) + s + f.repeat(total - left);
    },
    ljust: (s, a) => { const w = Number(a[0]); return s.length >= w ? s : s + (a.length > 1 ? a[1] : ' ').repeat(w - s.length); },
    rjust: (s, a) => { const w = Number(a[0]); return s.length >= w ? s : (a.length > 1 ? a[1] : ' ').repeat(w - s.length) + s; },
    zfill(s, a) {
      const w = Number(a[0]);
      if (s.length >= w) return s;
      const sign = s[0] === '-' || s[0] === '+' ? s[0] : '';
      return sign + '0'.repeat(w - s.length) + s.slice(sign.length);
    },
    partition(s, a) { const i = s.indexOf(a[0]); return i < 0 ? new Tuple([s, '', '']) : new Tuple([s.slice(0, i), a[0], s.slice(i + a[0].length)]); },
    rpartition(s, a) { const i = s.lastIndexOf(a[0]); return i < 0 ? new Tuple(['', '', s]) : new Tuple([s.slice(0, i), a[0], s.slice(i + a[0].length)]); },
    expandtabs: (s, a) => s.replace(/\t/g, ' '.repeat(a.length ? Number(a[0]) : 8)),
    removeprefix: (s, a) => (s.startsWith(a[0]) ? s.slice(a[0].length) : s),
    removesuffix: (s, a) => (a[0] && s.endsWith(a[0]) ? s.slice(0, s.length - a[0].length) : s),
    encode: () => PY.raise('NotImplementedError', 'bytes werden nicht unterstützt'),
    translate(s, a) {
      let out = '';
      for (const ch of s) {
        const e = a[0].map.get('i' + BigInt(ch.codePointAt(0)));
        if (!e) out += ch;
        else if (e[1] === null) continue;
        else out += typeof e[1] === 'bigint' ? String.fromCodePoint(Number(e[1])) : e[1];
      }
      return out;
    },
    format: function* (s, a, kw) { return yield* strFormat(s, a, kw); },
    __len__: (s) => big(s.length),
    __contains__: (s, a) => s.indexOf(a[0]) >= 0
  });

  /* str.format */
  function* strFormat(fmt, args, kw) {
    let out = '', auto = 0, i = 0;
    while (i < fmt.length) {
      const c = fmt[i];
      if (c === '{') {
        if (fmt[i + 1] === '{') { out += '{'; i += 2; continue; }
        let d = 1, j = i + 1;
        while (j < fmt.length && d > 0) { if (fmt[j] === '{') d++; else if (fmt[j] === '}') d--; j++; }
        if (d > 0) PY.raise('ValueError', "expected '}' before end of string");
        const field = fmt.slice(i + 1, j - 1);
        i = j;
        const m = /^([^!:]*)(?:!([rsa]))?(?::(.*))?$/s.exec(field);
        let name = m[1], conv = m[2], spec = m[3] || '';
        if (spec.indexOf('{') >= 0) spec = yield* strFormat(spec, args, kw);
        const first = /^[^.\[]*/.exec(name)[0];
        let v;
        if (first === '') { if (auto >= args.length) PY.raise('IndexError', 'Replacement index ' + auto + ' out of range for positional args tuple'); v = args[auto++]; }
        else if (/^\d+$/.test(first)) { const n = parseInt(first, 10); if (n >= args.length) PY.raise('IndexError', 'Replacement index ' + n + ' out of range for positional args tuple'); v = args[n]; }
        else { if (!kw || !kw.has(first)) PY.raise('KeyError', first); v = kw.get(first); }
        let rest = name.slice(first.length);
        while (rest) {
          let mm;
          if ((mm = /^\.([A-Za-z_]\w*)/.exec(rest))) { v = yield* PY.getAttr(v, mm[1]); rest = rest.slice(mm[0].length); }
          else if ((mm = /^\[([^\]]*)\]/.exec(rest))) { v = yield* PY.getItem(v, /^\d+$/.test(mm[1]) ? BigInt(mm[1]) : mm[1]); rest = rest.slice(mm[0].length); }
          else break;
        }
        if (conv === 'r' || conv === 'a') v = yield* PY.repr(v);
        else if (conv === 's') v = yield* PY.str(v);
        out += yield* PY.formatValue(v, spec);
        continue;
      }
      if (c === '}') {
        if (fmt[i + 1] === '}') { out += '}'; i += 2; continue; }
        PY.raise('ValueError', "Single '}' encountered in format string");
      }
      out += c; i++;
    }
    return out;
  }

  /* %-Formatierung */
  PY.percentFormat = function* (fmt, arg) {
    const args = arg instanceof Tuple ? arg.items : [arg];
    let ai = 0, out = '';
    const re = /%(?:\((\w+)\))?([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+))?[hlL]?([diouxXeEfFgGcrsa%])/g;
    let last = 0, m;
    while ((m = re.exec(fmt))) {
      out += fmt.slice(last, m.index); last = re.lastIndex;
      const type = m[5];
      if (type === '%') { out += '%'; continue; }
      let v;
      if (m[1] !== undefined) {
        if (!(arg instanceof PyDict)) PY.raise('TypeError', 'format requires a mapping');
        const e = arg.map.get('s' + m[1]); if (!e) PY.raise('KeyError', m[1]);
        v = e[1];
      } else {
        let width = m[3], prec = m[4];
        if (width === '*') width = String(args[ai++]);
        if (prec === '*') prec = String(args[ai++]);
        m[3] = width; m[4] = prec;
        if (ai >= args.length) PY.raise('TypeError', 'not enough arguments for format string');
        v = args[ai++];
      }
      const flags = m[2] || '';
      let spec = '';
      if (flags.indexOf('-') >= 0) spec += '<'; else if (flags.indexOf('0') >= 0 && 'diouxXeEfFgG'.indexOf(type) >= 0) spec += '0'; else if (type !== 's' && type !== 'r' && type !== 'a' && type !== 'c') spec += '>';
      else spec += '>';
      if (flags.indexOf('+') >= 0) spec = spec.replace(/^(.)?/, (x) => x + '+');
      if (flags.indexOf('0') >= 0 && flags.indexOf('-') < 0 && 'diouxXeEfFgG'.indexOf(type) >= 0) spec = (flags.indexOf('+') >= 0 ? '+' : '') + '0';
      if (flags.indexOf('#') >= 0) spec += '#';
      if (m[3]) spec += m[3];
      if (m[4] !== undefined) spec += '.' + m[4];
      let t = type;
      let val = v;
      if (type === 'd' || type === 'i' || type === 'u') {
        if (typeof v === 'number') val = BigInt(Math.trunc(v));
        else if (typeof v === 'string' || !PY.isNum(v)) PY.raise('TypeError', '%d format: a real number is required, not ' + tn(v));
        t = 'd';
      } else if (type === 's') { val = yield* PY.str(v); t = 's'; }
      else if (type === 'r' || type === 'a') { val = yield* PY.repr(v); t = 's'; }
      else if (type === 'c') { val = typeof v === 'bigint' ? String.fromCodePoint(Number(v)) : v; t = 's'; }
      else if (type === 'F') t = 'F';
      if (!/[<>=^]/.test(spec[0] || '') && /^[0+]/.test(spec)) { /* nur Nullen: Standard rechts */ }
      out += yield* PY.formatValue(val, spec + (t === 's' ? 's' : t));
    }
    out += fmt.slice(last);
    if (ai < args.length && !(arg instanceof PyDict)) PY.raise('TypeError', 'not all arguments converted during string formatting');
    return out;
  };

  /* ---------- list ---------- */
  Object.assign(M.list, {
    append(l, a) { if (a.length !== 1) PY.raise('TypeError', 'list.append() takes exactly one argument (' + a.length + ' given)'); l.push(a[0]); return null; },
    extend: function* (l, a) { for (const x of (yield* PY.toArray(a[0])).slice()) l.push(x); return null; },
    insert(l, a) { let i = Number(needInt(a[0])); if (i < 0) i = Math.max(0, i + l.length); l.splice(Math.min(i, l.length), 0, a[1]); return null; },
    remove: function* (l, a) {
      for (let i = 0; i < l.length; i++) if (yield* PY.eq(l[i], a[0])) { l.splice(i, 1); return null; }
      PY.raise('ValueError', 'list.remove(x): x not in list');
    },
    pop(l, a) {
      if (!l.length) PY.raise('IndexError', 'pop from empty list');
      let i = a.length ? Number(needInt(a[0])) : l.length - 1;
      if (i < 0) i += l.length;
      if (i < 0 || i >= l.length) PY.raise('IndexError', 'pop index out of range');
      return l.splice(i, 1)[0];
    },
    clear(l) { l.length = 0; return null; },
    index: function* (l, a) {
      for (let i = a.length > 1 ? Number(a[1]) : 0; i < l.length; i++) if (yield* PY.eq(l[i], a[0])) return big(i);
      PY.raise('ValueError', (yield* PY.repr(a[0])) + ' is not in list');
    },
    count: function* (l, a) { let n = 0; for (const x of l) if (yield* PY.eq(x, a[0])) n++; return big(n); },
    sort: function* (l, a, kw) {
      const sorted = yield* PY.sortArray(l.slice(), kwGet(kw, 'key', null), yield* PY.isTrue(kwGet(kw, 'reverse', false)));
      for (let i = 0; i < sorted.length; i++) l[i] = sorted[i];
      return null;
    },
    reverse(l) { l.reverse(); return null; },
    copy(l) { return l.slice(); },
    __len__: (l) => big(l.length)
  });

  /* ---------- tuple ---------- */
  Object.assign(M.tuple, {
    count: function* (t, a) { let n = 0; for (const x of t.items) if (yield* PY.eq(x, a[0])) n++; return big(n); },
    index: function* (t, a) {
      for (let i = 0; i < t.items.length; i++) if (yield* PY.eq(t.items[i], a[0])) return big(i);
      PY.raise('ValueError', 'tuple.index(x): x not in tuple');
    }
  });

  /* ---------- dict ---------- */
  Object.assign(M.dict, {
    get(d, a) { const e = d.map.get(PY.hashKey(a[0])); return e ? e[1] : (a.length > 1 ? a[1] : null); },
    keys: (d) => new PyView(d, 'keys'),
    values: (d) => new PyView(d, 'values'),
    items: (d) => new PyView(d, 'items'),
    pop(d, a) {
      const k = PY.hashKey(a[0]); const e = d.map.get(k);
      if (!e) { if (a.length > 1) return a[1]; PY.raise('KeyError', a[0]); }
      d.map.delete(k); return e[1];
    },
    popitem(d) {
      if (!d.map.size) PY.raise('KeyError', 'popitem(): dictionary is empty');
      const last = Array.from(d.map.entries()).pop();
      d.map.delete(last[0]); return new Tuple([last[1][0], last[1][1]]);
    },
    update: function* (d, a, kw) {
      if (a.length) {
        const src = a[0];
        if (src instanceof PyDict) for (const [k, e] of src.map) d.map.set(k, [e[0], e[1]]);
        else for (const item of yield* PY.toArray(src)) { const kv = yield* PY.toArray(item); d.map.set(PY.hashKey(kv[0]), [kv[0], kv[1]]); }
      }
      if (kw) for (const [k, v] of kw) d.map.set('s' + k, [k, v]);
      return null;
    },
    setdefault(d, a) {
      const k = PY.hashKey(a[0]); const e = d.map.get(k);
      if (e) return e[1];
      const v = a.length > 1 ? a[1] : null; d.map.set(k, [a[0], v]); return v;
    },
    clear(d) { d.map.clear(); return null; },
    copy(d) { const n = new PyDict(); for (const [k, e] of d.map) n.map.set(k, [e[0], e[1]]); n.special = d.special; n.factory = d.factory; return n; },
    most_common(d, a) {
      const items = Array.from(d.map.values()).map((e) => [e[0], e[1]]);
      items.sort((x, y) => (x[1] < y[1] ? 1 : x[1] > y[1] ? -1 : 0));
      const n = a.length && a[0] !== null ? Number(a[0]) : items.length;
      return items.slice(0, n).map((e) => new Tuple(e));
    },
    elements(d) { const out = []; for (const e of d.map.values()) for (let i = 0n; i < e[1]; i++) out.push(e[0]); return PY.iterOfArray(out); },
    total(d) { let t = 0n; for (const e of d.map.values()) t += e[1]; return t; },
    __len__: (d) => big(d.map.size)
  });
  M.dict_keys = M.dict_values = M.dict_items = {};

  /* ---------- set ---------- */
  function* otherSet(a) {
    if (a instanceof PySet) return a;
    const s = new PySet(false);
    for (const x of yield* PY.toArray(a)) s.map.set(PY.hashKey(x), x);
    return s;
  }
  const setCommon = {
    copy(s) { const n = new PySet(s.frozen); for (const [k, v] of s.map) n.map.set(k, v); return n; },
    union: function* (s, a) { const n = new PySet(s.frozen); for (const [k, v] of s.map) n.map.set(k, v); for (const o of a) for (const [k, v] of (yield* otherSet(o)).map) n.map.set(k, v); return n; },
    intersection: function* (s, a) { const n = new PySet(s.frozen); for (const [k, v] of s.map) if (a.every((o) => true)) { let ok = true; for (const o of a) if (!(yield* otherSet(o)).map.has(k)) { ok = false; break; } if (ok) n.map.set(k, v); } return n; },
    difference: function* (s, a) { const n = new PySet(s.frozen); for (const [k, v] of s.map) { let ok = true; for (const o of a) if ((yield* otherSet(o)).map.has(k)) { ok = false; break; } if (ok) n.map.set(k, v); } return n; },
    symmetric_difference: function* (s, a) { return yield* PY.binop('^', s, yield* otherSet(a[0])); },
    issubset: function* (s, a) { const o = yield* otherSet(a[0]); for (const k of s.map.keys()) if (!o.map.has(k)) return false; return true; },
    issuperset: function* (s, a) { const o = yield* otherSet(a[0]); for (const k of o.map.keys()) if (!s.map.has(k)) return false; return true; },
    isdisjoint: function* (s, a) { const o = yield* otherSet(a[0]); for (const k of s.map.keys()) if (o.map.has(k)) return false; return true; },
    __len__: (s) => big(s.map.size)
  };
  Object.assign(M.frozenset, setCommon);
  Object.assign(M.set, setCommon, {
    add(s, a) { s.map.set(PY.hashKey(a[0]), a[0]); return null; },
    remove(s, a) { const k = PY.hashKey(a[0]); if (!s.map.has(k)) PY.raise('KeyError', a[0]); s.map.delete(k); return null; },
    discard(s, a) { s.map.delete(PY.hashKey(a[0])); return null; },
    pop(s) { if (!s.map.size) PY.raise('KeyError', 'pop from an empty set'); const k = s.map.keys().next().value; const v = s.map.get(k); s.map.delete(k); return v; },
    clear(s) { s.map.clear(); return null; },
    update: function* (s, a) { for (const o of a) for (const [k, v] of (yield* otherSet(o)).map) s.map.set(k, v); return null; },
    intersection_update: function* (s, a) { const r = yield* setCommon.intersection(s, a); s.map = r.map; return null; },
    difference_update: function* (s, a) { const r = yield* setCommon.difference(s, a); s.map = r.map; return null; }
  });

  /* ---------- int / float ---------- */
  Object.assign(M.int, {
    bit_length: (n) => big(toInt(n) === 0n ? 0 : (toInt(n) < 0n ? -toInt(n) : toInt(n)).toString(2).length),
    is_integer: () => true,
    conjugate: (n) => toInt(n),
    __index__: (n) => toInt(n)
  });
  M.bool = M.int;
  Object.assign(M.float, {
    is_integer: (x) => Number.isInteger(x),
    hex: (x) => x.toString(16),
    conjugate: (x) => x,
    as_integer_ratio: (x) => { let d = 1n; let n = x; while (!Number.isInteger(n) && d < 2n ** 60n) { n *= 2; d *= 2n; } const nn = BigInt(n); const g = (a, b) => (b === 0n ? (a < 0n ? -a : a) : g(b, a % b)); const gg = g(nn, d) || 1n; return new Tuple([nn / gg, d / gg]); }
  });

  /* ---------- Module ---------- */
  function mod(name, attrs) {
    const m = new PyModule(name);
    for (const [k, v] of Object.entries(attrs)) m.attrs.set(k, v instanceof Function && !(v instanceof Builtin) ? new Builtin(k, v) : v);
    return m;
  }
  const num = (v) => { if (typeof v === 'number') return v; if (typeof v === 'bigint') return Number(v); if (typeof v === 'boolean') return v ? 1 : 0; PY.raise('TypeError', 'must be real number, not ' + tn(v)); };

  PY.modules.math = () => {
    const m = mod('math', {
      pi: Math.PI, e: Math.E, tau: 2 * Math.PI, inf: Infinity, nan: NaN,
      sqrt: (a) => { const x = num(a[0]); if (x < 0) PY.raise('ValueError', 'math domain error'); return Math.sqrt(x); },
      floor: (a) => (typeof a[0] === 'bigint' ? a[0] : BigInt(Math.floor(num(a[0])))),
      ceil: (a) => (typeof a[0] === 'bigint' ? a[0] : BigInt(Math.ceil(num(a[0])))),
      trunc: (a) => (typeof a[0] === 'bigint' ? a[0] : BigInt(Math.trunc(num(a[0])))),
      fabs: (a) => Math.abs(num(a[0])),
      pow: (a) => Math.pow(num(a[0]), num(a[1])),
      exp: (a) => Math.exp(num(a[0])),
      log: (a) => { const x = num(a[0]); if (x <= 0) PY.raise('ValueError', 'math domain error'); return a.length > 1 ? Math.log(x) / Math.log(num(a[1])) : Math.log(x); },
      log10: (a) => { const x = num(a[0]); if (x <= 0) PY.raise('ValueError', 'math domain error'); return Math.log10(x); },
      log2: (a) => { const x = num(a[0]); if (x <= 0) PY.raise('ValueError', 'math domain error'); return Math.log2(x); },
      sin: (a) => Math.sin(num(a[0])), cos: (a) => Math.cos(num(a[0])), tan: (a) => Math.tan(num(a[0])),
      asin: (a) => Math.asin(num(a[0])), acos: (a) => Math.acos(num(a[0])), atan: (a) => Math.atan(num(a[0])),
      atan2: (a) => Math.atan2(num(a[0]), num(a[1])),
      sinh: (a) => Math.sinh(num(a[0])), cosh: (a) => Math.cosh(num(a[0])), tanh: (a) => Math.tanh(num(a[0])),
      degrees: (a) => num(a[0]) * 180 / Math.PI, radians: (a) => num(a[0]) * Math.PI / 180,
      hypot: (a) => Math.hypot(...a.map(num)),
      isnan: (a) => Number.isNaN(num(a[0])), isinf: (a) => Math.abs(num(a[0])) === Infinity, isfinite: (a) => Number.isFinite(num(a[0])),
      isclose: (a, kw) => { const x = num(a[0]), y = num(a[1]); const rt = num(kwGet(kw, 'rel_tol', 1e-9)), at = num(kwGet(kw, 'abs_tol', 0)); return Math.abs(x - y) <= Math.max(rt * Math.max(Math.abs(x), Math.abs(y)), at); },
      factorial: (a) => { const n = needInt(a[0]); if (n < 0n) PY.raise('ValueError', 'factorial() not defined for negative values'); let r = 1n; for (let i = 2n; i <= n; i++) r *= i; return r; },
      gcd: (a) => { let x = needInt(a[0]), y = needInt(a[1]); if (x < 0n) x = -x; if (y < 0n) y = -y; while (y) { [x, y] = [y, x % y]; } return x; },
      lcm: (a) => { let x = needInt(a[0]), y = needInt(a[1]); if (!x || !y) return 0n; const p = x * y; let g = x < 0n ? -x : x, h = y < 0n ? -y : y; while (h) { [g, h] = [h, g % h]; } return (p < 0n ? -p : p) / g; },
      comb: (a) => { const n = needInt(a[0]), k = needInt(a[1]); if (k > n) return 0n; let r = 1n; for (let i = 1n; i <= k; i++) r = r * (n - k + i) / i; return r; },
      perm: (a) => { const n = needInt(a[0]); const k = a.length > 1 ? needInt(a[1]) : n; if (k > n) return 0n; let r = 1n; for (let i = 0n; i < k; i++) r *= (n - i); return r; },
      isqrt: (a) => { const n = needInt(a[0]); if (n < 0n) PY.raise('ValueError', 'isqrt() argument must be nonnegative'); if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x; },
      fsum: function* (a) { let s = 0; for (const x of yield* PY.toArray(a[0])) s += num(x); return s; },
      prod: function* (a) { let p = 1n; for (const x of yield* PY.toArray(a[0])) p = yield* PY.binop('*', p, x); return p; },
      copysign: (a) => Math.sign(num(a[1])) * Math.abs(num(a[0])) || (Object.is(num(a[1]), -0) ? -Math.abs(num(a[0])) : Math.abs(num(a[0]))),
      fmod: (a) => num(a[0]) % num(a[1]),
      modf: (a) => { const x = num(a[0]); const i = Math.trunc(x); return new Tuple([x - i, i]); },
      dist: (a) => Math.hypot(...a[0].items.map((v, i) => num(v) - num(a[1].items[i])))
    });
    return m;
  };

  /* Zufall: Mulberry32 (seedbar) */
  let rngState = (Math.random() * 4294967296) >>> 0;
  function rnd() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  PY.resetRandom = () => { rngState = (Math.random() * 4294967296) >>> 0; };
  PY.modules.random = () => mod('random', {
    random: () => rnd(),
    seed: (a) => { rngState = a.length && a[0] !== null ? Number(BigInt.asUintN(32, typeof a[0] === 'bigint' ? a[0] : BigInt(Math.floor(num(a[0]))))) : (Math.random() * 4294967296) >>> 0; return null; },
    randint: (a) => { const lo = needInt(a[0]), hi = needInt(a[1]); if (hi < lo) PY.raise('ValueError', 'empty range in randrange(' + lo + ', ' + (hi + 1n) + ')'); return lo + BigInt(Math.floor(rnd() * Number(hi - lo + 1n))); },
    randrange: (a) => {
      let lo = 0n, hi, st = 1n;
      if (a.length === 1) hi = needInt(a[0]); else { lo = needInt(a[0]); hi = needInt(a[1]); if (a.length > 2) st = needInt(a[2]); }
      const n = st > 0n ? (hi - lo + st - 1n) / st : (lo - hi - st - 1n) / (-st);
      if (n <= 0n) PY.raise('ValueError', 'empty range for randrange()');
      return lo + st * BigInt(Math.floor(rnd() * Number(n)));
    },
    uniform: (a) => num(a[0]) + (num(a[1]) - num(a[0])) * rnd(),
    choice: function* (a) {
      const arr = yield* PY.toArray(a[0]);
      if (!arr.length) PY.raise('IndexError', 'Cannot choose from an empty sequence');
      return arr[Math.floor(rnd() * arr.length)];
    },
    choices: function* (a, kw) {
      const arr = yield* PY.toArray(a[0]); const k = Number(kwGet(kw, 'k', 1n)); const out = [];
      for (let i = 0; i < k; i++) out.push(arr[Math.floor(rnd() * arr.length)]);
      return out;
    },
    shuffle: (a) => { const l = a[0]; for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return null; },
    sample: function* (a) {
      const arr = (yield* PY.toArray(a[0])).slice(); const k = Number(needInt(a[1]));
      if (k > arr.length) PY.raise('ValueError', 'Sample larger than population or is negative');
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr.slice(0, k);
    },
    gauss: (a) => { const u = 1 - rnd(), v = rnd(); return num(a[0]) + num(a[1]) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  });

  PY.modules.time = () => mod('time', {
    time: () => Date.now() / 1000,
    perf_counter: () => performance.now() / 1000,
    monotonic: () => performance.now() / 1000,
    process_time: () => performance.now() / 1000,
    sleep: function* (a) { yield KON.sleepRequest(Math.max(0, num(a[0]) * 1000)); return null; },
    ctime: () => new Date().toString(),
    strftime: (a) => {
      const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
      return a[0].replace(/%([YmdHMSyBbAaj%])/g, (m, c) => ({ Y: d.getFullYear(), m: p2(d.getMonth() + 1), d: p2(d.getDate()), H: p2(d.getHours()), M: p2(d.getMinutes()), S: p2(d.getSeconds()), y: p2(d.getFullYear() % 100), '%': '%' }[c] ?? m));
    }
  });

  PY.modules.sys = () => {
    const out = mod('stdout', {
      write: function* (a) { const s = yield* PY.str(a[0]); PY.getState().io.write(s); return big(s.length); },
      flush: () => null
    });
    const err = mod('stderr', {
      write: function* (a) { const s = yield* PY.str(a[0]); PY.getState().io.writeErr(s); return big(s.length); },
      flush: () => null
    });
    const inp = mod('stdin', {
      readline: function* () { const line = yield KON.inputRequest(''); return line === null ? '' : line + '\n'; }
    });
    return mod('sys', {
      argv: [ 'main.py' ], stdout: out, stderr: err, stdin: inp, maxsize: 9223372036854775807n,
      version: '3.14.0 (Browser-Interpreter)', platform: 'browser', path: [], modules: new PyDict(),
      exit: (a) => {
        if (!a.length || a[0] === null) throw new ExitSignal(0);
        if (typeof a[0] === 'bigint') throw new ExitSignal(Number(a[0]));
        throw new PyThrow(PY.makeExc('SystemExit', a[0]));
      },
      setrecursionlimit: (a) => { const st = PY.getState(); if (st) st.limit = Math.min(Number(a[0]), 3000); return null; },
      getrecursionlimit: () => big(PY.getState().limit)
    });
  };

  PY.modules.string = () => mod('string', {
    ascii_lowercase: 'abcdefghijklmnopqrstuvwxyz', ascii_uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ascii_letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', hexdigits: '0123456789abcdefABCDEF',
    octdigits: '01234567', punctuation: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', whitespace: ' \t\n\r\x0b\x0c',
    printable: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ \t\n\r\x0b\x0c'
  });

  function deepCopy(v, memo) {
    if (v === null || typeof v !== 'object') return v;
    if (memo.has(v)) return memo.get(v);
    if (Array.isArray(v)) { const r = []; memo.set(v, r); for (const x of v) r.push(deepCopy(x, memo)); return r; }
    if (v instanceof Tuple) return new Tuple(v.items.map((x) => deepCopy(x, memo)));
    if (v instanceof PyDict) { const r = new PyDict(); r.special = v.special; r.factory = v.factory; memo.set(v, r); for (const [k, e] of v.map) r.map.set(k, [deepCopy(e[0], memo), deepCopy(e[1], memo)]); return r; }
    if (v instanceof PySet) { const r = new PySet(v.frozen); for (const [k, x] of v.map) r.map.set(k, deepCopy(x, memo)); return r; }
    if (v instanceof PyInstance) { const r = new PyInstance(v.cls); memo.set(v, r); for (const [k, x] of v.attrs) r.attrs.set(k, deepCopy(x, memo)); return r; }
    return v;
  }
  PY.modules.copy = () => mod('copy', {
    copy: (a) => {
      const v = a[0];
      if (Array.isArray(v)) return v.slice();
      if (v instanceof PyDict) return M.dict.copy(v);
      if (v instanceof PySet) return setCommon.copy(v);
      if (v instanceof PyInstance) { const r = new PyInstance(v.cls); for (const [k, x] of v.attrs) r.attrs.set(k, x); return r; }
      return v;
    },
    deepcopy: (a) => deepCopy(a[0], new Map())
  });

  PY.modules.functools = () => mod('functools', {
    reduce: function* (a) {
      const items = (yield* PY.toArray(a[1])).slice();
      let acc, i = 0;
      if (a.length > 2) acc = a[2]; else { if (!items.length) PY.raise('TypeError', 'reduce() of empty iterable with no initial value'); acc = items[i++]; }
      for (; i < items.length; i++) acc = yield* PY.callValue(a[0], [acc, items[i]], null);
      return acc;
    },
    lru_cache: (a) => {
      const wrap = (f) => {
        const cache = new Map();
        return new Builtin(f.name || 'cached', function* (args, kw) {
          const key = args.map((x) => PY.hashKey(x)).join('|') + (kw ? '#' + Array.from(kw.entries()).map(([k, v]) => k + '=' + PY.hashKey(v)).join(',') : '');
          if (cache.has(key)) return cache.get(key);
          const r = yield* PY.callValue(f, args, kw);
          cache.set(key, r); return r;
        });
      };
      if (a.length && (a[0] instanceof PyFunction)) return wrap(a[0]);
      return new Builtin('lru_cache', (b) => wrap(b[0]));
    },
    cache: (a) => PY.modules.functools().attrs.get('lru_cache').fn(a),
    wraps: () => new Builtin('wraps', (b) => b[0]),
    partial: (a, kw) => {
      const f = a[0], pre = a.slice(1), pkw = kw;
      return new Builtin('partial', function* (args, kw2) {
        let k = null;
        if (pkw || kw2) { k = new Map(pkw || []); if (kw2) for (const [x, y] of kw2) k.set(x, y); }
        return yield* PY.callValue(f, pre.concat(args), k);
      });
    }
  });

  PY.modules.itertools = () => mod('itertools', {
    permutations: function* (a) {
      const arr = yield* PY.toArray(a[0]); const r = a.length > 1 && a[1] !== null ? Number(a[1]) : arr.length; const out = [];
      const rec = (cur, used) => { if (cur.length === r) { out.push(new Tuple(cur.slice())); return; } for (let i = 0; i < arr.length; i++) if (!used[i]) { used[i] = true; cur.push(arr[i]); rec(cur, used); cur.pop(); used[i] = false; } };
      rec([], []); return PY.iterOfArray(out);
    },
    combinations: function* (a) {
      const arr = yield* PY.toArray(a[0]); const r = Number(a[1]); const out = [];
      const rec = (start, cur) => { if (cur.length === r) { out.push(new Tuple(cur.slice())); return; } for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } };
      rec(0, []); return PY.iterOfArray(out);
    },
    product: function* (a, kw) {
      const pools = []; for (const x of a) pools.push(yield* PY.toArray(x));
      const rep = Number(kwGet(kw, 'repeat', 1n)); let all = []; for (let i = 0; i < rep; i++) all = all.concat(pools);
      let res = [[]]; for (const p of all) { const n = []; for (const r of res) for (const x of p) n.push(r.concat([x])); res = n; }
      return PY.iterOfArray(res.map((r) => new Tuple(r)));
    },
    chain: function* (a) { let out = []; for (const x of a) out = out.concat(yield* PY.toArray(x)); return PY.iterOfArray(out); },
    accumulate: function* (a) {
      const items = yield* PY.toArray(a[0]); const out = []; let acc;
      for (let i = 0; i < items.length; i++) { acc = i === 0 ? items[0] : (a.length > 1 && a[1] !== null ? yield* PY.callValue(a[1], [acc, items[i]], null) : yield* PY.binop('+', acc, items[i])); out.push(acc); }
      return PY.iterOfArray(out);
    },
    repeat: (a) => PY.iterOfArray(Array(Number(a[1])).fill(a[0])),
    count: (a) => { let i = a.length ? needInt(a[0]) : 0n; return new PyIter(() => ({ done: false, value: i++ }), false); },
    islice: function* (a) {
      const it = yield* PY.getIter(a[0]); let start = 0, stop, step = 1;
      if (a.length === 2) stop = a[1] === null ? Infinity : Number(a[1]); else { start = Number(a[1] || 0); stop = a[2] === null ? Infinity : Number(a[2]); step = a.length > 3 ? Number(a[3]) : 1; }
      const out = []; let i = 0;
      while (i < stop) { const r = it.gen ? yield* it.next() : it.next(); if (r.done) break; if (i >= start && (i - start) % step === 0) out.push(r.value); i++; if (out.length > 5e6) break; }
      return PY.iterOfArray(out);
    },
    zip_longest: function* (a, kw) {
      const lists = []; for (const x of a) lists.push(yield* PY.toArray(x)); const fill = kwGet(kw, 'fillvalue', null);
      const n = Math.max(...lists.map((l) => l.length), 0); const out = [];
      for (let i = 0; i < n; i++) out.push(new Tuple(lists.map((l) => (i < l.length ? l[i] : fill))));
      return PY.iterOfArray(out);
    }
  });

  PY.modules.statistics = () => mod('statistics', {
    mean: function* (a) { const x = (yield* PY.toArray(a[0])).map(num); if (!x.length) PY.raise('ValueError', 'mean requires at least one data point'); return x.reduce((s, y) => s + y, 0) / x.length; },
    median: function* (a) { const x = (yield* PY.toArray(a[0])).map(num).sort((p, q) => p - q); if (!x.length) PY.raise('ValueError', 'no median for empty data'); const m = x.length >> 1; const r = x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; return Number.isInteger(r) && x.every((v) => Number.isInteger(v)) && x.length % 2 ? BigInt(r) : r; },
    mode: function* (a) { const x = yield* PY.toArray(a[0]); const c = new Map(); let best = null, bn = 0; for (const v of x) { const k = PY.hashKey(v); const n = (c.get(k) || 0) + 1; c.set(k, n); if (n > bn) { bn = n; best = v; } } return best; },
    variance: function* (a) { const x = (yield* PY.toArray(a[0])).map(num); const m = x.reduce((s, y) => s + y, 0) / x.length; return x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1); },
    stdev: function* (a) { const x = (yield* PY.toArray(a[0])).map(num); const m = x.reduce((s, y) => s + y, 0) / x.length; return Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1)); },
    pstdev: function* (a) { const x = (yield* PY.toArray(a[0])).map(num); const m = x.reduce((s, y) => s + y, 0) / x.length; return Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / x.length); }
  });

  /* typing: Typ-Hinweise sind erlaubt, werden aber nicht geprüft */
  PY.modules.typing = () => {
    const attrs = {};
    for (const n of ['List', 'Dict', 'Set', 'Tuple', 'Optional', 'Union', 'Any', 'Callable', 'Iterable', 'Iterator', 'Sequence', 'Type', 'FrozenSet', 'Mapping', 'Generator', 'Literal', 'ClassVar', 'Final']) {
      const c = new PyClass(n, [PY.objectClass], new Map()); c.prim = 'typing'; attrs[n] = c;
    }
    attrs.TYPE_CHECKING = false;
    attrs.NamedTuple = attrs.Any;
    return mod('typing', attrs);
  };

  PY.modules.abc = () => {
    const ABC = new PyClass('ABC', [PY.objectClass], new Map());
    return mod('abc', {
      ABC: ABC, ABCMeta: ABC,
      abstractmethod: (a) => { if (a[0] instanceof PyFunction) a[0].isAbstract = true; return a[0]; }
    });
  };

  /* collections: Counter, defaultdict, deque, OrderedDict */
  function makeDequeClass() {
    const cls = new PyClass('deque', [PY.objectClass], new Map());
    const items = (self) => self.attrs.get('_items');
    const d = cls.dict;
    d.set('__init__', new Builtin('__init__', function* (a, kw) {
      const arr = a.length > 1 && a[1] !== null ? (yield* PY.toArray(a[1])).slice() : [];
      a[0].attrs.set('_items', arr);
      const ml = a.length > 2 ? a[2] : kwGet(kw, 'maxlen', null);
      a[0].attrs.set('_maxlen', ml === null ? null : Number(ml));
      return null;
    }));
    const trim = (self, left) => { const ml = self.attrs.get('_maxlen'); const it = items(self); if (ml !== null) while (it.length > ml) { if (left) it.shift(); else it.pop(); } };
    d.set('append', new Builtin('append', (a) => { items(a[0]).push(a[1]); trim(a[0], true); return null; }));
    d.set('appendleft', new Builtin('appendleft', (a) => { items(a[0]).unshift(a[1]); trim(a[0], false); return null; }));
    d.set('pop', new Builtin('pop', (a) => { if (!items(a[0]).length) PY.raise('IndexError', 'pop from an empty deque'); return items(a[0]).pop(); }));
    d.set('popleft', new Builtin('popleft', (a) => { if (!items(a[0]).length) PY.raise('IndexError', 'pop from an empty deque'); return items(a[0]).shift(); }));
    d.set('extend', new Builtin('extend', function* (a) { for (const x of yield* PY.toArray(a[1])) items(a[0]).push(x); trim(a[0], true); return null; }));
    d.set('extendleft', new Builtin('extendleft', function* (a) { for (const x of yield* PY.toArray(a[1])) items(a[0]).unshift(x); trim(a[0], false); return null; }));
    d.set('clear', new Builtin('clear', (a) => { items(a[0]).length = 0; return null; }));
    d.set('rotate', new Builtin('rotate', (a) => { const it = items(a[0]); let n = a.length > 1 ? Number(a[1]) : 1; if (!it.length) return null; n = ((n % it.length) + it.length) % it.length; const tail = it.splice(it.length - n, n); it.unshift(...tail); return null; }));
    d.set('copy', new Builtin('copy', (a) => { const r = new PyInstance(cls); r.attrs.set('_items', items(a[0]).slice()); r.attrs.set('_maxlen', a[0].attrs.get('_maxlen')); return r; }));
    d.set('__len__', new Builtin('__len__', (a) => big(items(a[0]).length)));
    d.set('__iter__', new Builtin('__iter__', (a) => PY.iterOfArray(items(a[0]))));
    d.set('__getitem__', new Builtin('__getitem__', function* (a) { return yield* PY.getItem(items(a[0]), a[1]); }));
    d.set('__setitem__', new Builtin('__setitem__', function* (a) { yield* PY.setItem(items(a[0]), a[1], a[2]); return null; }));
    d.set('__contains__', new Builtin('__contains__', function* (a) { return yield* PY.contains(items(a[0]), a[1]); }));
    d.set('__repr__', new Builtin('__repr__', function* (a) { return 'deque(' + (yield* PY.repr(items(a[0]))) + ')'; }));
    d.set('__bool__', new Builtin('__bool__', (a) => items(a[0]).length > 0));
    return cls;
  }
  PY.modules.collections = () => {
    const deque = makeDequeClass();
    const counter = mkClassLike('Counter', function* (args, kw) {
      const d = new PyDict(); d.special = 'counter';
      if (args.length) {
        if (args[0] instanceof PyDict) for (const [k, e] of args[0].map) d.map.set(k, [e[0], e[1]]);
        else for (const x of yield* PY.toArray(args[0])) { const k = PY.hashKey(x); const e = d.map.get(k); if (e) e[1] += 1n; else d.map.set(k, [x, 1n]); }
      }
      if (kw) for (const [k, v] of kw) d.map.set('s' + k, [k, v]);
      return d;
    });
    const dd = mkClassLike('defaultdict', function* (args) {
      const d = new PyDict(); d.special = 'defaultdict'; d.factory = args.length ? args[0] : null;
      if (args.length > 1 && args[1] instanceof PyDict) for (const [k, e] of args[1].map) d.map.set(k, [e[0], e[1]]);
      return d;
    });
    const od = mkClassLike('OrderedDict', function* (args) { return yield* PY.callValue(PY.types.dict, args, null); });
    return mod('collections', { deque: deque, Counter: counter, defaultdict: dd, OrderedDict: od });
  };
  function mkClassLike(name, ctor) {
    const c = new PyClass(name, [PY.objectClass], new Map());
    c.prim = name; c.ctor = ctor;
    return c;
  }

  PY.modules.datetime = () => {
    const mk = (d) => {
      const o = new PyInstance(dtClass);
      o.attrs.set('year', big(d.getFullYear())); o.attrs.set('month', big(d.getMonth() + 1)); o.attrs.set('day', big(d.getDate()));
      o.attrs.set('hour', big(d.getHours())); o.attrs.set('minute', big(d.getMinutes())); o.attrs.set('second', big(d.getSeconds()));
      return o;
    };
    const dtClass = new PyClass('datetime', [PY.objectClass], new Map());
    const p2 = (n) => String(n).padStart(2, '0');
    dtClass.dict.set('__str__', new Builtin('__str__', (a) => { const g = (k) => Number(a[0].attrs.get(k)); return g('year') + '-' + p2(g('month')) + '-' + p2(g('day')) + ' ' + p2(g('hour')) + ':' + p2(g('minute')) + ':' + p2(g('second')); }));
    dtClass.dict.set('strftime', new Builtin('strftime', (a) => {
      const g = (k) => Number(a[0].attrs.get(k));
      return a[1].replace(/%([YmdHMSy%])/g, (m, c) => ({ Y: g('year'), m: p2(g('month')), d: p2(g('day')), H: p2(g('hour')), M: p2(g('minute')), S: p2(g('second')), y: p2(g('year') % 100), '%': '%' }[c]));
    }));
    dtClass.dict.set('now', new StaticMethod(new Builtin('now', () => mk(new Date()))));
    dtClass.dict.set('today', new StaticMethod(new Builtin('today', () => mk(new Date()))));
    return mod('datetime', { datetime: dtClass, date: dtClass });
  };

  PY.modules.os = () => mod('os', { name: 'posix', sep: '/', linesep: '\n', getcwd: () => '/projekt', listdir: () => [], getenv: (a) => (a.length > 1 ? a[1] : null) });

  PY.modules.json = () => mod('json', {
    dumps: function* (a, kw) {
      const indent = kwGet(kw, 'indent', null);
      const conv = function* (v, level) {
        if (v === null) return 'null';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'bigint') return v.toString();
        if (typeof v === 'number') return isFinite(v) ? PY.floatRepr(v) : (v !== v ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity');
        if (typeof v === 'string') return JSON.stringify(v);
        const nl = indent !== null ? '\n' + ' '.repeat(Number(indent) * (level + 1)) : '';
        const nlEnd = indent !== null ? '\n' + ' '.repeat(Number(indent) * level) : '';
        const sep = indent !== null ? ',' : ', ';
        if (Array.isArray(v) || v instanceof Tuple) {
          const arr = Array.isArray(v) ? v : v.items; if (!arr.length) return '[]';
          const parts = []; for (const x of arr) parts.push(nl + (yield* conv(x, level + 1)));
          return '[' + parts.join(sep) + nlEnd + ']';
        }
        if (v instanceof PyDict) {
          if (!v.map.size) return '{}';
          const parts = []; for (const [k, x] of v.map.values()) parts.push(nl + JSON.stringify(typeof k === 'string' ? k : yield* PY.str(k)) + ': ' + (yield* conv(x, level + 1)));
          return '{' + parts.join(sep) + nlEnd + '}';
        }
        PY.raise('TypeError', 'Object of type ' + tn(v) + ' is not JSON serializable');
      };
      return yield* conv(a[0], 0);
    },
    loads: function* (a) {
      const fromJs = (x) => {
        if (x === null) return null;
        if (typeof x === 'boolean') return x;
        if (typeof x === 'number') return Number.isInteger(x) && !/[.eE]/.test(String(x)) ? BigInt(x) : x;
        if (typeof x === 'string') return x;
        if (Array.isArray(x)) return x.map(fromJs);
        const d = new PyDict(); for (const k of Object.keys(x)) d.map.set('s' + k, [k, fromJs(x[k])]); return d;
      };
      try { return fromJs(JSON.parse(a[0])); } catch (e) { PY.raise('ValueError', 'Expecting value: ' + e.message); }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
