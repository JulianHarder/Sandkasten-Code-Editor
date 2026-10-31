/* C#-Interpreter: führt den Syntaxbaum Schritt für Schritt (als Generator) aus. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};
  const { CMulti, Dbl, Num, Chr, chr, CObject, CArray, CList, CDict, CSet, CTuple, CEnumVal, CLambda, CMethodGroup, CType, CNamespace, CStatic,
    CsThrow, ExitSignal, CRange, CIndexEnd, Slot, CClass } = CS;
  const TICK = KON.TICK;

  const BAIL = { bail: true };
  const BRK = { k: 'break' };
  const CNT = { k: 'continue' };
  class Ret { constructor(v) { this.v = v; } }
  class Scope {
    constructor(parent, frame) { this.vars = null; this.parent = parent; this.frame = frame; }
    declare(name, v, t) {
      if (this.vars === null) this.vars = new Map();
      const s = new Slot(v, t || null);
      this.vars.set(name, s);
      return s;
    }
  }
  class Frame {
    constructor(cls, thisObj, fname, file) { this.cls = cls; this.thisObj = thisObj; this.fname = fname; this.file = file; this.line = 0; this.tparams = null; }
  }
  /* Verweis auf Feld/Arrayelement (für ref/out) */
  class RefSlot {
    constructor(get, set) { this._g = get; this._s = set; }
    get v() { return this._g(); }
    set v(x) { this._s(x); }
  }

  let S = null;
  CS.getState = () => S;
  CS.captureTb = function () {
    if (!S) return [];
    return S.frames.map((f) => ({ name: f.fname, file: f.file, line: f.line }));
  };

  function lookupSlot(scope, name) {
    for (let s = scope; s !== null; s = s.parent) {
      if (s.vars !== null) {
        const sl = s.vars.get(name);
        if (sl !== undefined) return sl;
      }
    }
    return null;
  }

  /* Fehler, die zur Laufzeit wie Kompilierfehler aussehen (z. B. ungültige Umwandlung) */
  function rtCompileErr(scope, code, msg, col) {
    const f = scope && scope.frame ? scope.frame : (S && S.frames.length ? S.frames[S.frames.length - 1] : null);
    return new KON.LangError({ phase: 'compile', lang: 'csharp', file: f ? f.file : '', line: f ? f.line : 0, col: col || (f && f.col) || 1, code: code, name: code, message: msg });
  }

  /* ---------- Typen auflösen ---------- */
  function typeName(t) {
    if (!t) return 'object';
    switch (t.k) {
      case 'name': return t.name;
      case 'array': return typeName(t.elem) + '[' + ','.repeat(t.rank - 1) + ']';
      case 'null': return typeName(t.inner) + '?';
      case 'tuple': return '(' + t.elems.map((e) => typeName(e.type)).join(', ') + ')';
    }
    return '?';
  }
  CS.typeName = typeName;

  function primKind(t) {
    if (!t || t.k !== 'name') return undefined;
    return CS.PRIM_NAMES[t.name];
  }

  const KIND_NAMES = { int: 'int', long: 'long', double: 'double', float: 'float', decimal: 'decimal', char: 'char', bool: 'bool', string: 'string', byte: 'byte', sbyte: 'sbyte', short: 'short', ushort: 'ushort', uint: 'uint', ulong: 'ulong' };

  function valueTypeName(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'boolean') return 'bool';
    const k = CS.kindOf(v);
    if (k) return KIND_NAMES[k] || k;
    if (v instanceof CObject) return v.cls.name;
    if (v instanceof CList) return 'List<' + (v.et ? typeName(v.et) : 'object') + '>';
    if (v instanceof CArray) return (v.et ? typeName(v.et) : 'object') + '[]';
    if (v instanceof CDict) return 'Dictionary';
    if (v instanceof CEnumVal) return v.cls.name;
    return 'object';
  }

  function convErr(scope, v, target, explicitExists) {
    const from = valueTypeName(v);
    if (explicitExists) return rtCompileErr(scope, 'CS0266', 'Der Typ "' + from + '" kann nicht implizit in "' + target + '" konvertiert werden. Es ist bereits eine explizite Konvertierung vorhanden (Fehlt eine Umwandlung?)');
    return rtCompileErr(scope, 'CS0029', 'Der Typ "' + from + '" kann nicht implizit in "' + target + '" konvertiert werden');
  }

  /* Implizite Konvertierung beim Speichern in typisierte Ziele */
  function coerce(v, t, scope) {
    if (t === null || t === undefined) return v;
    if (t.k === 'null') return v === null ? null : coerce(v, t.inner, scope);
    if (t.k === 'tuple') {
      if (v instanceof CTuple && v.items.length === t.elems.length) {
        const items = v.items.map((x, i) => coerce(x, t.elems[i].type, scope));
        return new CTuple(items, v.names || t.elems.map((e) => e.name));
      }
      return v;
    }
    if (t.k !== 'name') return v;
    const kind = CS.PRIM_NAMES[t.name];
    if (kind === undefined) {
      if (v instanceof CObject && v.cls.isStruct) return cloneStruct(v);
      if ((t.name === 'List' || t.name === 'IList' || t.name === 'ICollection') && v instanceof CList && t.args.length && !v.et) v.et = t.args[0];
      return v;
    }
    switch (kind) {
      case 'object': return v;
      case 'string': if (v === null || typeof v === 'string') return v; throw convErr(scope, v, 'string');
      case 'bool': if (typeof v === 'boolean') return v; throw convErr(scope, v, 'bool');
      case 'int':
        if (typeof v === 'number') return v;
        if (v instanceof Chr) return v.c;
        if (v instanceof Num && (v.k === 'byte' || v.k === 'sbyte' || v.k === 'short' || v.k === 'ushort')) return v.v;
        throw convErr(scope, v, 'int', CS.isNumeric(v));
      case 'long':
        if (typeof v === 'bigint') return v;
        if (typeof v === 'number') return BigInt(v);
        if (v instanceof Chr) return BigInt(v.c);
        if (v instanceof Num && v.k !== 'ulong' && v.k !== 'float' && v.k !== 'decimal') return BigInt(v.v);
        throw convErr(scope, v, 'long', CS.isNumeric(v));
      case 'double':
        if (v instanceof Dbl) return v;
        if (typeof v === 'number') return new Dbl(v);
        if (typeof v === 'bigint') return new Dbl(Number(v));
        if (v instanceof Chr) return new Dbl(v.c);
        if (v instanceof Num && v.k !== 'decimal') return new Dbl(Number(v.v));
        throw convErr(scope, v, 'double', v instanceof Num);
      case 'float':
        if (v instanceof Num && v.k === 'float') return v;
        if (typeof v === 'number') return new Num(Math.fround(v), 'float');
        if (typeof v === 'bigint') return new Num(Math.fround(Number(v)), 'float');
        if (v instanceof Chr) return new Num(v.c, 'float');
        if (v instanceof Num && v.k !== 'decimal') return new Num(Math.fround(Number(v.v)), 'float');
        throw convErr(scope, v, 'float', CS.isNumeric(v));
      case 'decimal':
        if (v instanceof Num && v.k === 'decimal') return v;
        if (typeof v === 'number') return new Num(v, 'decimal');
        if (typeof v === 'bigint') return new Num(Number(v), 'decimal');
        if (v instanceof Chr) return new Num(v.c, 'decimal');
        if (v instanceof Num && v.k !== 'float') return new Num(Number(v.v), 'decimal');
        throw convErr(scope, v, 'decimal', CS.isNumeric(v));
      case 'char':
        if (v instanceof Chr) return v;
        throw convErr(scope, v, 'char', typeof v === 'number');
      default: { // byte, sbyte, short, ushort, uint, ulong
        if (v instanceof Num && v.k === kind) return v;
        if (typeof v === 'number') {
          const r = CS.RANGE[kind];
          if (kind === 'ulong') { if (v < 0) throw rtCompileErr(scope, 'CS0031', 'Der konstante Wert "' + v + '" kann nicht in "ulong" konvertiert werden'); return new Num(BigInt(v), 'ulong'); }
          if (v < r[0] || v > r[1]) throw rtCompileErr(scope, 'CS0031', 'Der konstante Wert "' + v + '" kann nicht in "' + kind + '" konvertiert werden');
          return new Num(v, kind);
        }
        if (v instanceof Chr && (kind === 'ushort' || kind === 'uint')) return new Num(v.c, kind);
        if (v instanceof Num && kind === 'uint' && (v.k === 'byte' || v.k === 'ushort')) return new Num(v.v, 'uint');
        if (v instanceof Num && kind === 'ushort' && v.k === 'byte') return new Num(v.v, 'ushort');
        if (v instanceof Num && kind === 'short' && (v.k === 'byte' || v.k === 'sbyte')) return new Num(v.v, 'short');
        if (typeof v === 'bigint' && kind === 'ulong') return new Num(BigInt.asUintN(64, v), 'ulong');
        throw convErr(scope, v, kind, CS.isNumeric(v));
      }
    }
  }
  CS.coerce = coerce;

  function cloneStruct(o) {
    const c = new CObject(o.cls);
    for (const [k, v] of o.f) c.f.set(k, v instanceof CObject && v.cls.isStruct ? cloneStruct(v) : v);
    return c;
  }
  const storeVal = (v) => (v instanceof CObject && v.cls.isStruct ? cloneStruct(v) : v);

  /* Explizite Umwandlung (Cast) in Zahlentypen */
  function castNumber(v, kind, scope) {
    let x;
    if (v instanceof Chr) x = v.c;
    else if (typeof v === 'bigint') x = v;
    else if (typeof v === 'number') x = v;
    else if (v instanceof Dbl) x = v.v;
    else if (v instanceof Num) x = v.v;
    else if (v instanceof CEnumVal) x = v.value;
    else throw new CsThrow(CS.makeExc('InvalidCastException', 'Das angegebene Cast ist ungültig.'));
    const isFloatSrc = v instanceof Dbl || (v instanceof Num && (v.k === 'float' || v.k === 'decimal'));
    if (isFloatSrc) {
      if (kind === 'double') return new Dbl(x);
      if (kind === 'float') return new Num(Math.fround(x), 'float');
      if (kind === 'decimal') return new Num(x, 'decimal');
      if (x !== x || !isFinite(x)) x = 0;
      x = Math.trunc(x);
      if (kind === 'long' || kind === 'ulong') return CS.mk(kind, BigInt(x));
      if (kind === 'int') return x > 2147483647 || x < -2147483648 ? (x < 0 ? -2147483648 : -2147483648) : x | 0;
      return CS.mk(kind, x);
    }
    if (typeof x === 'bigint') {
      switch (kind) {
        case 'long': return BigInt.asIntN(64, x);
        case 'ulong': return new Num(BigInt.asUintN(64, x), 'ulong');
        case 'double': return new Dbl(Number(x));
        case 'float': return new Num(Math.fround(Number(x)), 'float');
        case 'decimal': return new Num(Number(x), 'decimal');
        case 'int': return Number(BigInt.asIntN(32, x));
        case 'char': return chr(Number(BigInt.asUintN(16, x)));
        default: return CS.mk(kind, Number(BigInt.asIntN(32, x)));
      }
    }
    if (kind === 'long') return BigInt(x);
    if (kind === 'ulong') return new Num(BigInt.asUintN(64, BigInt(x)), 'ulong');
    return CS.mk(kind, x);
  }
  CS.castNumber = castNumber;

  /* ---------- Rechnen ---------- */
  function divZero() { throw new CsThrow(CS.makeExc('DivideByZeroException')); }

  function arith(op, a, b) {
    // schnelle Ganzzahl-Wege
    if (typeof a === 'number' && typeof b === 'number') {
      switch (op) {
        case '+': return (a + b) | 0;
        case '-': return (a - b) | 0;
        case '*': return Math.imul(a, b);
        case '/': if (b === 0) divZero(); return (a / b) | 0;
        case '%': if (b === 0) divZero(); return a % b | 0;
        case '&': return a & b;
        case '|': return a | b;
        case '^': return a ^ b;
        case '<<': return a << (b & 31);
        case '>>': return a >> (b & 31);
        case '>>>': return a >>> (b & 31) | 0;
      }
    }
    if (a instanceof Dbl && b instanceof Dbl) {
      switch (op) {
        case '+': return new Dbl(a.v + b.v);
        case '-': return new Dbl(a.v - b.v);
        case '*': return new Dbl(a.v * b.v);
        case '/': return new Dbl(a.v / b.v);
        case '%': return new Dbl(a.v % b.v);
      }
    }
    const ka = CS.kindOf(a), kb = CS.kindOf(b);
    if (ka === null || kb === null) return undefined;
    if (ka === 'char' && kb === 'char' && (op === '+' || op === '-' || op === '*' || op === '/' || op === '%')) return arith(op, a.c, b.c);
    const k = CS.promote(ka, kb);
    if (op === '<<' || op === '>>' || op === '>>>') {
      const sh = Number(CS.toNumber(b)) & (ka === 'long' || ka === 'ulong' ? 63 : 31);
      const kk = CS.promote(ka, 'int');
      if (kk === 'long' || kk === 'ulong') { const x = CS.toBigInt(a); return CS.mk(kk, op === '<<' ? x << BigInt(sh) : x >> BigInt(sh)); }
      const x = CS.toNumber(a);
      return CS.mk(kk, op === '<<' ? x << sh : op === '>>' ? x >> sh : x >>> sh);
    }
    if (k === 'long' || k === 'ulong') {
      const x = CS.toBigInt(a), y = CS.toBigInt(b);
      switch (op) {
        case '+': return CS.mk(k, x + y);
        case '-': return CS.mk(k, x - y);
        case '*': return CS.mk(k, x * y);
        case '/': if (y === 0n) divZero(); return CS.mk(k, x / y);
        case '%': if (y === 0n) divZero(); return CS.mk(k, x % y);
        case '&': return CS.mk(k, x & y);
        case '|': return CS.mk(k, x | y);
        case '^': return CS.mk(k, x ^ y);
      }
      return undefined;
    }
    const x = CS.toNumber(a), y = CS.toNumber(b);
    if (k === 'decimal') {
      const sa = a instanceof Num ? (a.sc || 0) : 0, sb = b instanceof Num ? (b.sc || 0) : 0;
      let res;
      switch (op) {
        case '+': res = x + y; break;
        case '-': res = x - y; break;
        case '*': res = x * y; break;
        case '/': if (y === 0) divZero(); res = x / y; break;
        case '%': if (y === 0) divZero(); res = x % y; break;
        default: return undefined;
      }
      const dn = new Num(res, 'decimal');
      dn.sc = op === '*' ? Math.min(sa + sb, 28) : op === '/' ? 0 : Math.max(sa, sb);
      return dn;
    }
    if (k === 'double' || k === 'float') {
      switch (op) {
        case '+': return CS.mk(k, x + y);
        case '-': return CS.mk(k, x - y);
        case '*': return CS.mk(k, x * y);
        case '/': if (k === 'decimal' && y === 0) divZero(); return CS.mk(k, x / y);
        case '%': if (k === 'decimal' && y === 0) divZero(); return CS.mk(k, x % y);
      }
      return undefined;
    }
    // int / uint
    switch (op) {
      case '+': return CS.mk(k, x + y);
      case '-': return CS.mk(k, x - y);
      case '*': return CS.mk(k, k === 'int' ? Math.imul(x, y) : Number(BigInt.asUintN(32, BigInt(x) * BigInt(y))));
      case '/': if (y === 0) divZero(); return CS.mk(k, Math.trunc(x / y));
      case '%': if (y === 0) divZero(); return CS.mk(k, x % y);
      case '&': return CS.mk(k, x & y);
      case '|': return CS.mk(k, x | y);
      case '^': return CS.mk(k, x ^ y);
    }
    return undefined;
  }
  CS.arith = arith;

  function relational(op, a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      switch (op) { case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b; }
    }
    const ka = CS.kindOf(a), kb = CS.kindOf(b);
    if (ka === null || kb === null) return undefined;
    let x, y;
    if (ka === 'long' || ka === 'ulong' || kb === 'long' || kb === 'ulong') {
      if (ka === 'double' || kb === 'double' || ka === 'float' || kb === 'float' || ka === 'decimal' || kb === 'decimal') { x = CS.toNumber(a); y = CS.toNumber(b); }
      else { x = CS.toBigInt(a); y = CS.toBigInt(b); }
    } else { x = CS.toNumber(a); y = CS.toNumber(b); }
    switch (op) { case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y; }
    return undefined;
  }

  /* ==, != für primitive Werte; undefined = nicht zuständig */
  function primEquals(a, b) {
    if (a === b) return !(a instanceof Dbl);
    if (a === null || b === null) return false;
    const ta = typeof a, tb = typeof b;
    if (ta === 'string' || tb === 'string' || ta === 'boolean' || tb === 'boolean') return ta === tb && a === b;
    const ka = CS.kindOf(a), kb = CS.kindOf(b);
    if (ka !== null && kb !== null) {
      if (a instanceof Chr && b instanceof Chr) return a.c === b.c;
      const r = relational('<=', a, b);
      return r && relational('>=', a, b);
    }
    if (a instanceof CEnumVal && b instanceof CEnumVal) return a.cls === b.cls && a.value === b.value;
    return undefined;
  }
  CS.primEquals = primEquals;

  /* ---------- Hilfen ---------- */
  const isPureNode = (n) => {
    if (n.pure !== undefined) return n.pure;
    let p = false;
    switch (n.type) {
      case 'Lit': p = true; break;
      case 'Ident': p = true; break;
      case 'This': p = true; break;
      case 'Binary': p = isPureNode(n.left) && isPureNode(n.right); break;
      case 'Unary': p = isPureNode(n.operand); break;
      case 'Cond': p = isPureNode(n.test) && isPureNode(n.a) && isPureNode(n.b); break;
      case 'Index': p = isPureNode(n.obj) && n.args.length === 1 && n.args[0].type !== 'Range' && isPureNode(n.args[0]); break;
      case 'Member': p = isPureNode(n.obj); break;
    }
    n.pure = p;
    return p;
  };

  function evS(n, scope) {
    switch (n.type) {
      case 'Lit': {
        if (n.cv === undefined) n.cv = literalValue(n);
        return n.cv;
      }
      case 'Ident': {
        const sl = lookupSlot(scope, n.name);
        if (sl !== null) return sl.v;
        const t = scope.frame.thisObj;
        if (t !== null && t !== undefined && t.f.has(n.name)) return t.f.get(n.name);
        return BAIL;
      }
      case 'This': return scope.frame.thisObj;
      case 'Binary': {
        const op = n.op;
        if (op === '&&') { const a = evS(n.left, scope); if (a === BAIL) return BAIL; if (a === false) return false; const b = evS(n.right, scope); if (b === BAIL) return BAIL; return b; }
        if (op === '||') { const a = evS(n.left, scope); if (a === BAIL) return BAIL; if (a === true) return true; const b = evS(n.right, scope); if (b === BAIL) return BAIL; return b; }
        if (op === '??') return BAIL;
        const a = evS(n.left, scope); if (a === BAIL) return BAIL;
        const b = evS(n.right, scope); if (b === BAIL) return BAIL;
        switch (op) {
          case '==': { const r = primEquals(a, b); return r === undefined ? BAIL : r; }
          case '!=': { const r = primEquals(a, b); return r === undefined ? BAIL : !r; }
          case '<': case '>': case '<=': case '>=': { const r = relational(op, a, b); return r === undefined ? BAIL : r; }
          case '+': if (typeof a === 'string' && typeof b === 'string') return a + b; // fallthrough
          // eslint-disable-next-line no-fallthrough
          default: { const r = arith(op, a, b); return r === undefined ? BAIL : r; }
        }
      }
      case 'Unary': {
        const a = evS(n.operand, scope); if (a === BAIL) return BAIL;
        if (n.op === '!') return typeof a === 'boolean' ? !a : BAIL;
        if (n.op === '-') { if (typeof a === 'number') return (-a) | 0; if (a instanceof Dbl) return new Dbl(-a.v); return BAIL; }
        if (n.op === '+') return CS.isNumeric(a) ? a : BAIL;
        if (n.op === '~') return typeof a === 'number' ? ~a : BAIL;
        return BAIL;
      }
      case 'Cond': {
        const c = evS(n.test, scope); if (c === BAIL) return BAIL;
        return evS(c === true ? n.a : n.b, scope);
      }
      case 'Index': {
        const o = evS(n.obj, scope); if (o === BAIL) return BAIL;
        const i = evS(n.args[0], scope); if (i === BAIL) return BAIL;
        if (typeof i !== 'number') return BAIL;
        if (o instanceof CArray && o.dims === null) {
          if (i < 0 || i >= o.a.length) throw new CsThrow(CS.makeExc('IndexOutOfRangeException'));
          return o.a[i];
        }
        if (o instanceof CList) {
          if (i < 0 || i >= o.a.length) throw new CsThrow(CS.makeExc('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. Er darf nicht negativ und muss kleiner als die Auflistungsgröße sein. (Parameter \'index\')'));
          return o.a[i];
        }
        if (typeof o === 'string') {
          if (i < 0 || i >= o.length) throw new CsThrow(CS.makeExc('IndexOutOfRangeException', 'Der Index war außerhalb des Arraybereichs.'));
          return chr(o.charCodeAt(i));
        }
        return BAIL;
      }
      case 'Member': {
        if (n.nullCond) return BAIL;
        const o = evS(n.obj, scope); if (o === BAIL) return BAIL;
        if (o instanceof CObject) {
          if (o.f.has(n.name)) return o.f.get(n.name);
          return BAIL;
        }
        if (n.name === 'Length') { if (o instanceof CArray && o.dims === null) return o.a.length; if (typeof o === 'string') return o.length; }
        else if (n.name === 'Count' && o instanceof CList) return o.a.length;
        return BAIL;
      }
    }
    return BAIL;
  }

  function literalValue(n) {
    switch (n.kind) {
      case 'int': return n.value;
      case 'long': return typeof n.value === 'bigint' ? n.value : BigInt(n.value);
      case 'double': return new Dbl(Number(n.value));
      case 'float': return new Num(Math.fround(Number(n.value)), 'float');
      case 'decimal': { const dn = new Num(Number(n.value), 'decimal'); dn.sc = n.sc || 0; return dn; }
      case 'uint': return new Num(Number(n.value), 'uint');
      case 'ulong': return new Num(BigInt(n.value), 'ulong');
      case 'string': return n.value;
      case 'char': return chr(n.value.charCodeAt(0));
      case 'bool': return n.value;
      case 'null': return null;
    }
    return null;
  }

  /* Typ-Namen im aktuellen Kontext suchen (Klassen) */
  function findClass(name, scope) {
    const fr = scope ? scope.frame : null;
    if (fr && fr.cls) {
      for (let c = fr.cls; c; c = c.outer) {
        const n = c.nested.get(name);
        if (n) return n;
      }
    }
    return S.classes.get(name) || null;
  }

  function* ensureStatics(cls) {
    if (cls.staticInit) return;
    cls.staticInit = true;
    if (cls.base && !cls.base.builtin) yield* ensureStatics(cls.base);
    yield* runStaticInit(cls);
  }

  function* runStaticInit(cls) {
    const frame = new Frame(cls, null, cls.name + '..cctor()', cls.file);
    const scope = new Scope(null, frame);
    S.frames.push(frame);
    try {
      for (const f of cls.staticFieldInits) {
        frame.line = f.line;
        const v = f.init ? yield* ev(f.init, scope, f.type) : CS.defaultFor(primKind(f.type)) ;
        cls.sfields.set(f.name, f.init ? coerce(storeVal(v), f.type, scope) : v);
      }
      if (cls.staticCtor) {
        const sc = new Scope(null, frame);
        yield* execStmts(cls.staticCtor.body.stmts, sc);
      }
    } finally { S.frames.pop(); }
  }

  /* ---------- Ausdrücke ---------- */
  function* ev(n, scope, hint) {
    if (n.pure === undefined) isPureNode(n);
    if (n.pure === true) {
      const r = evS(n, scope);
      if (r !== BAIL) return r;
    }
    switch (n.type) {
      case 'Lit': return evS(n, scope);
      case 'Interp': return yield* evInterp(n, scope);
      case 'Ident': return yield* evIdent(n, scope);
      case 'This': return scope.frame.thisObj;
      case 'Base': return scope.frame.thisObj;
      case 'Binary': return yield* evBinary(n, scope);
      case 'Unary': {
        const a = yield* ev(n.operand, scope);
        return yield* evUnary(n.op, a, scope);
      }
      case 'Cond': {
        const c = yield* ev(n.test, scope);
        return yield* ev(c === true ? n.a : n.b, scope, hint);
      }
      case 'Assign': return yield* evAssign(n, scope);
      case 'IncDec': return yield* evIncDec(n, scope);
      case 'Member': return yield* evMember(n, scope);
      case 'Call': return yield* evCall(n, scope);
      case 'Index': return yield* evIndex(n, scope);
      case 'New': return yield* evNew(n, scope, hint);
      case 'NewArray': return yield* evNewArray(n, scope);
      case 'ArrayInit': return yield* evArrayInit(n, scope, hint);
      case 'NewAnon': {
        const o = new CObject(S.anonClass);
        for (const it of n.init.items) o.f.set(it.name, yield* ev(it.expr, scope));
        o.anon = true;
        return o;
      }
      case 'Cast': return yield* evCast(n, scope);
      case 'Is': {
        const v = yield* ev(n.expr, scope);
        return yield* matchPattern(n.pattern, v, scope);
      }
      case 'As': {
        const v = yield* ev(n.expr, scope);
        return typeTest(v, n.typeRef, scope) ? v : null;
      }
      case 'Lambda': return new CLambda(n.params, n.body, scope, scope.frame);
      case 'SwitchExpr': return yield* evSwitchExpr(n, scope);
      case 'TypeOf': return new CType(typeName(n.typeRef), n.typeRef.k === 'name' ? findClass(n.typeRef.name, scope) : null);
      case 'Default': {
        const t = n.typeRef || hint;
        return CS.defaultFor(primKind(t));
      }
      case 'Tuple': {
        const items = [];
        for (const e of n.elems) items.push(storeVal(yield* ev(e.expr, scope)));
        const named = n.elems.some((e) => e.name);
        return new CTuple(items, named ? n.elems.map((e) => e.name) : null);
      }
      case 'Throw': {
        const v = yield* ev(n.expr, scope);
        if (v === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
        throw new CsThrow(v);
      }
      case 'With': {
        const src = yield* ev(n.expr, scope);
        const o = cloneStruct(src);
        o.cls = src.cls;
        for (const it of n.init.items) o.f.set(it.name, yield* ev(it.expr, scope));
        return o;
      }
      case 'FromEnd': return new CIndexEnd(yield* ev(n.expr, scope));
      case 'Range': return new CRange(n.from ? yield* ev(n.from, scope) : null, n.to ? yield* ev(n.to, scope) : null);
      case 'DeclOut': {
        const sl = scope.declare(n.name, null, n.declType);
        return sl.v;
      }
    }
    throw new Error('Unbekannter Ausdruck: ' + n.type);
  }
  CS.ev = ev;

  function* evInterp(n, scope) {
    let out = '';
    for (const p of n.parts) {
      if (typeof p === 'string') { out += p; continue; }
      const v = yield* ev(p.expr, scope);
      let s = p.fmt !== null && p.fmt !== undefined ? yield* CS.lib.fmtValue(v, p.fmt) : (typeof v === 'string' ? v : yield* CS.lib.toStr(v));
      if (p.align) {
        const w = parseInt(p.align, 10);
        if (w > 0) s = s.padStart(w); else if (w < 0) s = s.padEnd(-w);
      }
      out += s;
    }
    return out;
  }

  function* evIdent(n, scope) {
    const name = n.name;
    const sl = lookupSlot(scope, name);
    if (sl !== null) return sl.v;
    const fr = scope.frame;
    // Member der aktuellen Instanz / Klasse
    const r = yield* implicitMember(name, fr, scope, n);
    if (r !== undefined) return r;
    // Typen
    const cls = findClass(name, scope);
    if (cls) { yield* ensureStatics(cls); return cls; }
    if (CS.lib.isStaticType(name)) return new CStatic(CS.PRIM_NAMES[name] && name !== 'string' && name !== 'object' ? CS.PRIM_NAMES[name] : name);
    if (CS.lib.isNamespace(name)) return new CNamespace(name);
    for (const sName of S.staticUsings) {
      const uc = S.classes.get(sName);
      if (uc && !uc.builtin) { yield* ensureStatics(uc); if (uc.sfields.has(name)) return uc.sfields.get(name); continue; }
      const r = yield* CS.lib.getStatic(sName, name, scope);
      if (r !== undefined) return r;
    }
    throw rtCompileErr(scope, 'CS0103', 'Der Name "' + name + '" ist im aktuellen Kontext nicht vorhanden', n.col);
  }

  /* Feld, Eigenschaft oder Methode der umgebenden Klasse – undefined wenn nicht vorhanden */
  function* implicitMember(name, fr, scope, node) {
    const t = fr.thisObj;
    if (t !== null && t !== undefined) {
      if (t.f.has(name)) return t.f.get(name);
      const p = findProp(t.cls, name);
      if (p) return yield* getProp(p, t, scope);
      if (findMethods(t.cls, name).length) return new CMethodGroup(t, name, t.cls);
    }
    for (let c = fr.cls; c; c = c.outer || null) {
      // statische Mitglieder (inkl. Basisklassen)
      for (let k = c; k; k = k.base) {
        if (k.builtin) break;
        yield* ensureStatics(k);
        if (k.sfields.has(name)) return k.sfields.get(name);
        const p = k.props.get(name);
        if (p && p.isStatic) return yield* getProp(p, null, scope);
        if (k.enumMembers && k.enumMembers.has(name)) return k.enumMembers.get(name);
        if (findMethods(k, name).length) return new CMethodGroup(null, name, k);
      }
      if (c.outer === undefined) break;
    }
    if (fr.tparams && fr.tparams.has(name)) return undefined;
    return undefined;
  }

  function findProp(cls, name) {
    for (let c = cls; c; c = c.base) {
      if (c.builtin) break;
      const p = c.props.get(name);
      if (p) return p;
    }
    return null;
  }

  function* getProp(p, obj, scope) {
    if (p.auto) {
      if (p.isStatic) { yield* ensureStatics(p.cls); return p.cls.sfields.get(p.name); }
      return obj.f.get(p.name);
    }
    if (p.expr || p.get) {
      const m = { name: 'get_' + p.name, params: [], body: p.get && p.get.type === 'Block' ? p.get : null, expr: p.expr || (p.get && p.get.type === 'ExprBody' ? p.get.expr : null), cls: p.cls, ret: p.valType, isStatic: p.isStatic, line: p.line };
      return yield* invoke(m, obj, [], null);
    }
    throw rtCompileErr(scope, 'CS0154', 'Auf die Eigenschaft "' + p.name + '" kann nicht zugegriffen werden, da sie keinen get-Accessor besitzt');
  }

  function* setProp(p, obj, value, scope) {
    value = coerce(storeVal(value), p.valType, scope);
    if (p.auto) {
      if (!p.set && !p.initOnly && !scope.frame.inCtor) {
        throw rtCompileErr(scope, 'CS0200', 'Die Eigenschaft oder der Indexer "' + p.cls.name + '.' + p.name + '" kann nicht zugewiesen werden. Sie bzw. er ist schreibgeschützt');
      }
      if (p.isStatic) { yield* ensureStatics(p.cls); p.cls.sfields.set(p.name, value); } else obj.f.set(p.name, value);
      return;
    }
    if (p.set) {
      const m = { name: 'set_' + p.name, params: [{ name: 'value', type: p.valType, mods: new Set() }], body: p.set.type === 'Block' ? p.set : null, expr: p.set.type === 'ExprBody' ? p.set.expr : null, cls: p.cls, ret: null, isStatic: p.isStatic, line: p.line, isSetter: true };
      yield* invoke(m, obj, [value], null);
      return;
    }
    throw rtCompileErr(scope, 'CS0200', 'Die Eigenschaft oder der Indexer "' + p.cls.name + '.' + p.name + '" kann nicht zugewiesen werden. Sie bzw. er ist schreibgeschützt');
  }

  function* evUnary(op, a, scope) {
    switch (op) {
      case '!': if (typeof a === 'boolean') return !a; break;
      case '-':
        if (typeof a === 'number') return (-a) | 0;
        if (typeof a === 'bigint') return BigInt.asIntN(64, -a);
        if (a instanceof Dbl) return new Dbl(-a.v);
        if (a instanceof Num) return CS.mk(a.k === 'uint' ? 'long' : a.k === 'byte' || a.k === 'sbyte' || a.k === 'short' || a.k === 'ushort' ? 'int' : a.k, typeof a.v === 'bigint' ? -a.v : -a.v);
        if (a instanceof Chr) return -a.c;
        break;
      case '+': if (CS.isNumeric(a)) return a instanceof Chr ? a.c : a; if (a instanceof Chr) return a.c; break;
      case '~':
        if (typeof a === 'number') return ~a;
        if (typeof a === 'bigint') return BigInt.asIntN(64, ~a);
        if (a instanceof CEnumVal) return new CEnumVal(a.cls, String(~a.value), ~a.value);
        break;
    }
    if (a instanceof CObject) {
      const m = findOperator(a.cls, op, 1);
      if (m) return yield* invoke(m, null, [a], null);
    }
    throw rtCompileErr(scope, 'CS0023', 'Der Operator "' + op + '" kann nicht auf einen Operanden vom Typ "' + valueTypeName(a) + '" angewendet werden');
  }

  function findOperator(cls, op, nargs) {
    for (let c = cls; c; c = c.base) {
      const list = c.operators.get(op);
      if (list) for (const m of list) if (m.params.length === nargs) return m;
    }
    return null;
  }

  function* evBinary(n, scope) {
    const op = n.op;
    if (op === '&&') { const a = yield* ev(n.left, scope); if (a === false) return false; return yield* ev(n.right, scope); }
    if (op === '||') { const a = yield* ev(n.left, scope); if (a === true) return true; return yield* ev(n.right, scope); }
    if (op === '??') { const a = yield* ev(n.left, scope); if (a !== null) return a; return yield* ev(n.right, scope); }
    const a = yield* ev(n.left, scope);
    const b = yield* ev(n.right, scope);
    let r;
    switch (op) {
      case '<': case '>': case '<=': case '>=': r = relational(op, a, b); if (r !== undefined) return r; break;
      case '==': r = primEquals(a, b); if (r !== undefined) return r; break;
      case '!=': r = primEquals(a, b); if (r !== undefined) return !r; break;
      case '+': if (typeof a === 'string' && typeof b === 'string') return a + b; r = arith(op, a, b); if (r !== undefined) return r; break;
      default: r = arith(op, a, b); if (r !== undefined) return r;
    }
    return yield* binaryOp(op, a, b, scope);
  }

  const isFnVal = (v) => v instanceof CLambda || v instanceof CMethodGroup || v instanceof CMulti;

  function* binaryOp(op, a, b, scope) {
    switch (op) {
      case '==': case '!=': {
        let r = primEquals(a, b);
        if (r === undefined) {
          if (a instanceof CObject || b instanceof CObject) {
            const o = a instanceof CObject ? a : b;
            const m = findOperator(o.cls, '==', 2);
            if (m) { const res = yield* invoke(m, null, [a, b], null); r = res === true; }
            else if (o.cls.isRecord && a instanceof CObject && b instanceof CObject) r = yield* CS.lib.equals(a, b);
            else r = a === b;
          } else if (a instanceof CTuple && b instanceof CTuple) r = yield* CS.lib.equals(a, b);
          else if (a instanceof CS.CDateTime && b instanceof CS.CDateTime) r = a.ms === b.ms;
          else r = a === b;
        }
        return op === '==' ? r : !r;
      }
      case '<': case '>': case '<=': case '>=': {
        const r = relational(op, a, b);
        if (r !== undefined) return r;
        if (a instanceof CEnumVal && b instanceof CEnumVal) return relational(op, a.value, b.value);
        if (a instanceof CS.CDateTime && b instanceof CS.CDateTime) return relational(op, a.ms, b.ms);
        if (a instanceof CObject) { const m = findOperator(a.cls, op, 2); if (m) return yield* invoke(m, null, [a, b], null); }
        break;
      }
      case '+':
        if (typeof a === 'string' || typeof b === 'string') {
          return (typeof a === 'string' ? a : yield* CS.lib.toStr(a)) + (typeof b === 'string' ? b : yield* CS.lib.toStr(b));
        }
        // eslint-disable-next-line no-fallthrough
      default: {
        const r = arith(op, a, b);
        if (r !== undefined) return r;
        if (typeof a === 'boolean' && typeof b === 'boolean') {
          if (op === '&') return a && b;
          if (op === '|') return a || b;
          if (op === '^') return a !== b;
        }
        if (a instanceof CEnumVal && (op === '|' || op === '&' || op === '^')) {
          const bv = b instanceof CEnumVal ? b.value : b;
          const v = op === '|' ? a.value | bv : op === '&' ? a.value & bv : a.value ^ bv;
          return CS.lib.enumFromValue(a.cls, v);
        }
        if (a instanceof CObject || b instanceof CObject) {
          const o = a instanceof CObject ? a : b;
          const m = findOperator(o.cls, op, 2);
          if (m) return yield* invoke(m, null, [a, b], null);
        }
        if ((op === '+' || op === '-') && (isFnVal(a) || isFnVal(b))) {
          const la = a === null ? [] : a instanceof CMulti ? a.list : [a];
          if (op === '+') {
            const all = la.concat(b === null ? [] : b instanceof CMulti ? b.list : [b]);
            return all.length === 0 ? null : all.length === 1 ? all[0] : new CMulti(all);
          }
          const rm = b instanceof CMulti ? b.list : [b];
          const rest = la.slice();
          for (const x of rm) { const k = rest.findIndex((y) => y === x || (y instanceof CMethodGroup && x instanceof CMethodGroup && y.target === x.target && y.name === x.name)); if (k >= 0) rest.splice(k, 1); }
          return rest.length === 0 ? null : rest.length === 1 ? rest[0] : new CMulti(rest);
        }
        const dr = CS.lib.dateArith ? CS.lib.dateArith(op, a, b) : undefined;
        if (dr !== undefined) return dr;
        if (a === null || b === null) {
          if (op === '+' || op === '-' || op === '*' || op === '/') return null; // lifted null
        }
      }
    }
    throw rtCompileErr(scope, 'CS0019', 'Der Operator "' + op + '" kann nicht auf Operanden vom Typ "' + valueTypeName(a) + '" und "' + valueTypeName(b) + '" angewendet werden');
  }

  /* ---------- Zuweisung ---------- */
  function* evAssign(n, scope) {
    const left = n.left;
    const op = n.op;
    if (op !== '=' && op !== '??=' && left.type === 'Ident') {
      const sl = lookupSlot(scope, left.name);
      if (sl !== null) {
        const cur = sl.v;
        let rhs = n.right.pure === true ? evS(n.right, scope) : BAIL;
        if (rhs === BAIL) rhs = yield* ev(n.right, scope);
        const bop = n.bop || (n.bop = op.slice(0, -1));
        let res;
        if (typeof cur === 'string' && bop === '+') res = cur + (typeof rhs === 'string' ? rhs : yield* CS.lib.toStr(rhs));
        else {
          res = arith(bop, cur, rhs);
          if (res === undefined) res = yield* binaryOp(bop, cur, rhs, scope);
        }
        const k = CS.kindOf(cur);
        if (k && k !== 'char' && CS.isNumeric(res) && CS.kindOf(res) !== k) res = castNumber(res, k, scope);
        else if (k === 'char' && CS.kindOf(res) !== 'char') res = castNumber(res, 'char', scope);
        sl.v = res;
        return res;
      }
    }
    if (left.type === 'Index' && left.args.length === 1 && left.obj.pure === true && left.args[0].pure === true && (op === '=' || op === '??=') === (op === '=')) {
      const o = evS(left.obj, scope);
      const ix = o === BAIL ? BAIL : evS(left.args[0], scope);
      if (o instanceof CArray && o.dims === null && typeof ix === 'number' && ix >= 0 && ix < o.a.length) {
        if (op === '=') {
          const v = yield* ev(n.right, scope, o.et);
          o.a[ix] = o.et === null ? CS.storeVal(v) : coerce(CS.storeVal(v), o.et, scope);
          return o.a[ix];
        }
        const cur = o.a[ix];
        const rhs = yield* ev(n.right, scope);
        const bop = n.bop || (n.bop = op.slice(0, -1));
        let res = arith(bop, cur, rhs);
        if (res === undefined) res = yield* binaryOp(bop, cur, rhs, scope);
        const k = CS.kindOf(cur);
        if (k && k !== 'char' && CS.isNumeric(res) && CS.kindOf(res) !== k) res = castNumber(res, k, scope);
        o.a[ix] = res;
        return res;
      }
    }
    if (op === '=') {
      if (left.type === 'Tuple' || left.type === 'DeclTuple') {
        const v = yield* ev(n.right, scope);
        yield* deconstruct(left, v, scope);
        return v;
      }
      if (left.type === 'Ident') {
        const sl = lookupSlot(scope, left.name);
        if (sl !== null) {
          const v = yield* ev(n.right, scope, sl.t);
          sl.v = sl.t === null ? storeVal(v) : coerce(storeVal(v), sl.t, scope);
          return sl.v;
        }
      }
      const lv = yield* resolveLv(left, scope);
      const v = yield* ev(n.right, scope, lv.type);
      yield* lv.set(v);
      return v;
    }
    const lv = yield* resolveLv(left, scope);
    const cur = yield* lv.get();
    if (op === '??=') {
      if (cur !== null) return cur;
      const v = yield* ev(n.right, scope, lv.type);
      yield* lv.set(v);
      return v;
    }
    const rhs = yield* ev(n.right, scope);
    const bop = op.slice(0, -1);
    let res;
    if (typeof cur === 'string' && bop === '+') res = cur + (typeof rhs === 'string' ? rhs : yield* CS.lib.toStr(rhs));
    else if (cur === null && typeof rhs === 'string' && bop === '+') res = yield* binaryOp('+', '', rhs, scope);
    else res = yield* binaryOp(bop, cur, rhs, scope);
    // zusammengesetzte Zuweisung wandelt explizit in den Typ der Variablen zurück
    const k = CS.kindOf(cur);
    if (k && k !== 'char' && CS.isNumeric(res) && CS.kindOf(res) !== k) res = castNumber(res, k, scope);
    else if (k === 'char' && CS.kindOf(res) !== 'char') res = castNumber(res, 'char', scope);
    yield* lv.set(res);
    return res;
  }

  function* deconstruct(target, v, scope) {
    let items;
    if (v instanceof CTuple) items = v.items;
    else if (v instanceof CObject && v.cls.isRecord && v.cls.recordProps) items = v.cls.recordProps.map((p) => v.f.get(p.name));
    else throw rtCompileErr(scope, 'CS8130', 'Der Typ kann nicht dekonstruiert werden');
    const elems = target.type === 'Tuple' ? target.elems.map((e) => e.expr) : target.names;
    if (elems.length !== items.length) throw rtCompileErr(scope, 'CS8132', 'Ein ' + items.length + '-Element-Tupel kann nicht in ' + elems.length + ' Variablen dekonstruiert werden');
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (e.type === 'Ident' && e.name === '_') continue;
      const lv = yield* resolveLv(e, scope);
      yield* lv.set(items[i]);
    }
  }

  /* L-Wert: Objekt mit get()/set(), type = deklarierter Typ */
  function* resolveLv(n, scope) {
    switch (n.type) {
      case 'Ident': {
        const sl = lookupSlot(scope, n.name);
        if (sl !== null) {
          return { type: sl.t, *get() { return sl.v; }, *set(v) { sl.v = sl.t === null ? storeVal(v) : coerce(storeVal(v), sl.t, scope); } };
        }
        const fr = scope.frame;
        const t = fr.thisObj;
        if (t) {
          if (t.f.has(n.name) || findField(t.cls, n.name)) {
            const fd = findField(t.cls, n.name);
            const p = findProp(t.cls, n.name);
            if (!p || p.auto) {
              return { type: fd ? fd.type : (p ? p.valType : null), *get() { return t.f.get(n.name); }, *set(v) { if (fd && fd.readonly && !fr.inCtor) throw rtCompileErr(scope, 'CS0191', 'Ein schreibgeschütztes Feld kann nicht zugewiesen werden (außer in einem Konstruktor oder Variableninitialisierer)'); t.f.set(n.name, coerce(storeVal(v), fd ? fd.type : (p ? p.valType : null), scope)); } };
            }
          }
          const p = findProp(t.cls, n.name);
          if (p) return { type: p.valType, *get() { return yield* getProp(p, t, scope); }, *set(v) { yield* setProp(p, t, v, scope); } };
        }
        for (let c = fr.cls; c; c = c.outer) {
          for (let k = c; k && !k.builtin; k = k.base) {
            yield* ensureStatics(k);
            if (k.sfields.has(n.name)) {
              const ft = k.sfieldTypes.get(n.name);
              return { type: ft || null, *get() { return k.sfields.get(n.name); }, *set(v) { k.sfields.set(n.name, coerce(storeVal(v), ft, scope)); } };
            }
            const p = k.props.get(n.name);
            if (p && p.isStatic) return { type: p.valType, *get() { return yield* getProp(p, null, scope); }, *set(v) { yield* setProp(p, null, v, scope); } };
          }
        }
        throw rtCompileErr(scope, 'CS0103', 'Der Name "' + n.name + '" ist im aktuellen Kontext nicht vorhanden');
      }
      case 'Member': {
        const obj = yield* ev(n.obj, scope);
        if (obj === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
        if (obj instanceof CObject) {
          const name = n.name;
          const p = findProp(obj.cls, name);
          if (p && !p.auto) return { type: p.valType, *get() { return yield* getProp(p, obj, scope); }, *set(v) { yield* setProp(p, obj, v, scope); } };
          const fd = findField(obj.cls, name);
          if (p && p.auto) return { type: p.valType, *get() { return obj.f.get(name); }, *set(v) { yield* setProp(p, obj, v, scope); } };
          if (obj.f.has(name) || fd) {
            return { type: fd ? fd.type : null, *get() { return obj.f.get(name); }, *set(v) { if (fd && fd.readonly && !(scope.frame.inCtor && scope.frame.thisObj === obj)) throw rtCompileErr(scope, 'CS0191', 'Ein schreibgeschütztes Feld kann nicht zugewiesen werden (außer in einem Konstruktor oder Variableninitialisierer)'); obj.f.set(name, coerce(storeVal(v), fd ? fd.type : null, scope)); } };
          }
          if (obj.anon) return { type: null, *get() { return obj.f.get(name); }, *set(v) { obj.f.set(name, v); } };
          throw rtCompileErr(scope, 'CS1061', '"' + obj.cls.name + '" enthält keine Definition für "' + name + '"');
        }
        if (obj instanceof CClass) {
          yield* ensureStatics(obj);
          for (let k = obj; k && !k.builtin; k = k.base) {
            if (k.sfields.has(n.name)) { const ft = k.sfieldTypes.get(n.name); return { type: ft || null, *get() { return k.sfields.get(n.name); }, *set(v) { k.sfields.set(n.name, coerce(storeVal(v), ft, scope)); } }; }
            const p = k.props.get(n.name);
            if (p && p.isStatic) return { type: p.valType, *get() { return yield* getProp(p, null, scope); }, *set(v) { yield* setProp(p, null, v, scope); } };
          }
          throw rtCompileErr(scope, 'CS0117', '"' + obj.name + '" enthält keine Definition für "' + n.name + '"');
        }
        if (obj instanceof CTuple) {
          return { type: null, *get() { return yield* CS.lib.getMember(obj, n.name, scope); }, *set(v) { const i = CS.lib.tupleIndex(obj, n.name); if (i < 0) throw rtCompileErr(scope, 'CS1061', 'Tupel enthält keine Definition für "' + n.name + '"'); obj.items[i] = v; } };
        }
        return { type: null, *get() { return yield* CS.lib.getMember(obj, n.name, scope); }, *set(v) { yield* CS.lib.setMember(obj, n.name, v, scope); } };
      }
      case 'Index': {
        const obj = yield* ev(n.obj, scope);
        const idx = [];
        for (const a of n.args) idx.push(yield* ev(a, scope));
        if (obj === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
        return {
          type: obj instanceof CArray ? obj.et : obj instanceof CList ? obj.et : obj instanceof CDict ? obj.vt : null,
          *get() { return yield* getIndexed(obj, idx, scope); },
          *set(v) { yield* setIndexed(obj, idx, v, scope); }
        };
      }
      case 'DeclOut': { const sl = scope.declare(n.name, null, n.declType); return { type: sl.t, *get() { return sl.v; }, *set(v) { sl.v = v; } }; }
    }
    throw rtCompileErr(scope, 'CS0131', 'Die linke Seite einer Zuweisung muss eine Variable, Eigenschaft oder ein Indexer sein');
  }

  function findField(cls, name) {
    for (let c = cls; c; c = c.base) {
      if (c.builtin) break;
      for (const f of c.fields) if (f.name === name) return f;
    }
    return null;
  }

  function* evIncDec(n, scope) {
    const t = n.operand;
    let lv = null, cur;
    let sl = null;
    if (t.type === 'Ident') sl = lookupSlot(scope, t.name);
    if (sl !== null) cur = sl.v;
    else { lv = yield* resolveLv(t, scope); cur = yield* lv.get(); }
    let nv;
    if (typeof cur === 'number') nv = n.op === '++' ? (cur + 1) | 0 : (cur - 1) | 0;
    else if (cur instanceof Dbl) nv = new Dbl(n.op === '++' ? cur.v + 1 : cur.v - 1);
    else if (cur instanceof Chr) nv = chr((n.op === '++' ? cur.c + 1 : cur.c - 1) & 65535);
    else if (CS.isNumeric(cur)) nv = castNumber(arith(n.op === '++' ? '+' : '-', cur, 1), CS.kindOf(cur), scope);
    else if (cur instanceof CObject) {
      const m = findOperator(cur.cls, n.op, 1);
      if (!m) throw rtCompileErr(scope, 'CS0023', 'Der Operator "' + n.op + '" kann nicht auf einen Operanden vom Typ "' + valueTypeName(cur) + '" angewendet werden');
      nv = yield* invoke(m, null, [cur], null);
    } else throw rtCompileErr(scope, 'CS0023', 'Der Operator "' + n.op + '" kann nicht auf einen Operanden vom Typ "' + valueTypeName(cur) + '" angewendet werden');
    if (sl !== null) sl.v = nv; else yield* lv.set(nv);
    return n.prefix ? nv : cur;
  }

  /* ---------- Member / Index ---------- */
  function* evMember(n, scope) {
    const obj = yield* ev(n.obj, scope);
    if (obj === null || obj === undefined) {
      if (n.nullCond) return null;
      if (n.name === 'HasValue') return false;
      if (n.name === 'Value') throw new CsThrow(CS.makeExc('InvalidOperationException', 'Das Nullable-Objekt muss einen Wert haben.'));
      throw new CsThrow(CS.makeExc('NullReferenceException'));
    }
    scope.frame.col = n.nameCol || n.col;
    return yield* getMember(obj, n.name, scope, n);
  }

  function* getMember(obj, name, scope, node) {
    if (obj instanceof CObject) {
      if (obj.f.has(name)) return obj.f.get(name);
      const p = findProp(obj.cls, name);
      if (p) return yield* getProp(p, obj, scope);
      if (findMethods(obj.cls, name).length) return new CMethodGroup(obj, name, obj.cls);
      const r = yield* CS.lib.getMember(obj, name, scope);
      if (r !== undefined) return r;
      throw rtCompileErr(scope, 'CS1061', '"' + obj.cls.name + '" enthält keine Definition für "' + name + '", und es konnte keine zugängliche "' + name + '"-Erweiterungsmethode gefunden werden');
    }
    if (obj instanceof CClass) {
      yield* ensureStatics(obj);
      for (let k = obj; k; k = k.base) {
        if (k.builtin) break;
        if (k.sfields.has(name)) return k.sfields.get(name);
        if (k.enumMembers && k.enumMembers.has(name)) return k.enumMembers.get(name);
        const p = k.props.get(name);
        if (p && p.isStatic) return yield* getProp(p, null, scope);
        if (k.nested.has(name)) return k.nested.get(name);
        if (findMethods(k, name).length) return new CMethodGroup(null, name, k);
      }
      if (obj.builtin && obj.name === 'EventArgs' && name === 'Empty') return S.eventArgsEmpty || (S.eventArgsEmpty = new CObject(obj));
      if (obj.isEnum && name === 'MaxValue') return 0;
      throw rtCompileErr(scope, 'CS0117', '"' + obj.name + '" enthält keine Definition für "' + name + '"');
    }
    if (obj instanceof CNamespace) {
      const full = obj.name + '.' + name;
      const c = S.classes.get(name);
      if (c && (S.namespaceOf.get(c) === full || true)) { yield* ensureStatics(c); if (CS.lib.isNamespace(full)) return new CNamespace(full); return c; }
      if (CS.lib.isNamespace(full)) return new CNamespace(full);
      if (CS.lib.isStaticType(name)) return new CStatic(name);
      throw rtCompileErr(scope, 'CS0234', 'Der Typ- oder Namespacename "' + name + '" ist im Namespace "' + obj.name + '" nicht vorhanden');
    }
    if (obj instanceof CStatic) {
      const r = yield* CS.lib.getStatic(obj.name, name, scope);
      if (r !== undefined) return r;
      if (CS.lib.hasStaticMethod(obj.name, name)) return new CMethodGroup(obj, name, null);
      throw rtCompileErr(scope, 'CS0117', '"' + obj.name + '" enthält keine Definition für "' + name + '"');
    }
    const r = yield* CS.lib.getMember(obj, name, scope);
    if (r !== undefined) return r;
    if (CS.lib.hasInstanceMethod(obj, name)) return new CMethodGroup(obj, name, null);
    throw rtCompileErr(scope, 'CS1061', '"' + valueTypeName(obj) + '" enthält keine Definition für "' + name + '"');
  }

  function* evIndex(n, scope) {
    const obj = yield* ev(n.obj, scope);
    if (obj === null) {
      if (n.nullCond) return null;
      throw new CsThrow(CS.makeExc('NullReferenceException'));
    }
    const idx = [];
    for (const a of n.args) idx.push(yield* ev(a, scope));
    return yield* getIndexed(obj, idx, scope);
  }

  function resolveIndex(i, len) {
    if (i instanceof CIndexEnd) return len - (typeof i.n === 'number' ? i.n : 0);
    return i;
  }

  function* getIndexed(obj, idx, scope) {
    if (obj instanceof CArray) {
      if (idx.length > 1 || obj.dims) {
        if (!obj.dims) throw rtCompileErr(scope, 'CS0022', 'Die Anzahl der Indizes stimmt nicht mit dem Array überein');
        let off = 0;
        for (let d = 0; d < obj.dims.length; d++) {
          const i = idx[d];
          if (i < 0 || i >= obj.dims[d]) throw new CsThrow(CS.makeExc('IndexOutOfRangeException'));
          off = off * obj.dims[d] + i;
        }
        return obj.a[off];
      }
      let i = idx[0];
      if (i instanceof CRange) return CS.lib.sliceArray(obj, i);
      i = resolveIndex(i, obj.a.length);
      if (typeof i !== 'number') throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(i) + '" kann nicht implizit in "int" konvertiert werden');
      if (i < 0 || i >= obj.a.length) throw new CsThrow(CS.makeExc('IndexOutOfRangeException'));
      return obj.a[i];
    }
    if (obj instanceof CList) {
      let i = idx[0];
      if (i instanceof CRange) return CS.lib.sliceList(obj, i);
      i = resolveIndex(i, obj.a.length);
      if (typeof i !== 'number') throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(i) + '" kann nicht implizit in "int" konvertiert werden');
      if (i < 0 || i >= obj.a.length) throw new CsThrow(CS.makeExc('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. Er darf nicht negativ und muss kleiner als die Auflistungsgröße sein. (Parameter \'index\')'));
      return obj.a[i];
    }
    if (typeof obj === 'string') {
      let i = idx[0];
      if (i instanceof CRange) return CS.lib.sliceString(obj, i);
      i = resolveIndex(i, obj.length);
      if (typeof i !== 'number') throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(i) + '" kann nicht implizit in "int" konvertiert werden');
      if (i < 0 || i >= obj.length) throw new CsThrow(CS.makeExc('IndexOutOfRangeException', 'Der Index war außerhalb des Arraybereichs.'));
      return chr(obj.charCodeAt(i));
    }
    if (obj instanceof CDict) return yield* CS.lib.dictGet(obj, idx[0]);
    if (obj instanceof CObject) {
      const ix = findIndexer(obj.cls, idx.length);
      if (ix && ix.get) {
        const m = { name: 'get_Item', params: ix.params, body: ix.get.type === 'Block' ? ix.get : null, expr: ix.expr || (ix.get.type === 'ExprBody' ? ix.get.expr : null), cls: ix.cls, ret: ix.valType, line: ix.line };
        return yield* invoke(m, obj, idx, null);
      }
      if (ix && ix.expr) {
        const m = { name: 'get_Item', params: ix.params, body: null, expr: ix.expr, cls: ix.cls, ret: ix.valType, line: ix.line };
        return yield* invoke(m, obj, idx, null);
      }
    }
    const r = yield* CS.lib.getIndex(obj, idx, scope);
    if (r !== undefined) return r;
    throw rtCompileErr(scope, 'CS0021', 'Das Anwenden von [] auf einen Ausdruck vom Typ "' + valueTypeName(obj) + '" ist nicht zulässig');
  }

  function findIndexer(cls, n) {
    for (let c = cls; c; c = c.base) for (const ix of c.indexers) if (ix.params.length === n) return ix;
    return null;
  }

  function* setIndexed(obj, idx, v, scope) {
    if (obj instanceof CArray) {
      if (obj.dims) {
        let off = 0;
        for (let d = 0; d < obj.dims.length; d++) {
          const i = idx[d];
          if (i < 0 || i >= obj.dims[d]) throw new CsThrow(CS.makeExc('IndexOutOfRangeException'));
          off = off * obj.dims[d] + i;
        }
        obj.a[off] = coerce(storeVal(v), obj.et, scope);
        return;
      }
      const i = resolveIndex(idx[0], obj.a.length);
      if (typeof i !== 'number') throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(i) + '" kann nicht implizit in "int" konvertiert werden');
      if (i < 0 || i >= obj.a.length) throw new CsThrow(CS.makeExc('IndexOutOfRangeException'));
      obj.a[i] = coerce(storeVal(v), obj.et, scope);
      return;
    }
    if (obj instanceof CList) {
      const i = resolveIndex(idx[0], obj.a.length);
      if (i < 0 || i >= obj.a.length) throw new CsThrow(CS.makeExc('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. Er darf nicht negativ und muss kleiner als die Auflistungsgröße sein. (Parameter \'index\')'));
      obj.a[i] = coerce(storeVal(v), obj.et, scope);
      obj.ver = (obj.ver || 0) + 1;
      return;
    }
    if (obj instanceof CDict) { yield* CS.lib.dictSet(obj, idx[0], coerce(storeVal(v), obj.vt, scope)); return; }
    if (obj instanceof CObject) {
      const ix = findIndexer(obj.cls, idx.length);
      if (ix && ix.set) {
        const params = ix.params.concat([{ name: 'value', type: ix.valType, mods: new Set() }]);
        const m = { name: 'set_Item', params: params, body: ix.set.type === 'Block' ? ix.set : null, expr: ix.set.type === 'ExprBody' ? ix.set.expr : null, cls: ix.cls, ret: null, line: ix.line };
        yield* invoke(m, obj, idx.concat([v]), null);
        return;
      }
    }
    if (obj instanceof CS.CSB) { yield* CS.lib.setIndex(obj, idx, v, scope); return; }
    if (typeof obj === 'string') throw rtCompileErr(scope, 'CS0200', 'Die Eigenschaft oder der Indexer "string.this[int]" kann nicht zugewiesen werden. Sie bzw. er ist schreibgeschützt');
    throw rtCompileErr(scope, 'CS0021', 'Das Anwenden von [] auf einen Ausdruck vom Typ "' + valueTypeName(obj) + '" ist nicht zulässig');
  }

  /* ---------- Aufrufe ---------- */
  function* evArgs(argNodes, scope) {
    const vals = [];
    let named = null;
    for (const a of argNodes) {
      let v;
      if (a.ref) {
        v = yield* refOf(a.expr, scope);
      } else v = yield* ev(a.expr, scope);
      if (a.name) { if (!named) named = new Map(); named.set(a.name, v); }
      else vals.push(v);
    }
    return { vals, named };
  }

  function* refOf(e, scope) {
    if (e.type === 'DeclOut') return scope.declare(e.name, null, e.declType);
    if (e.type === 'Ident') {
      const sl = lookupSlot(scope, e.name);
      if (sl !== null) return sl;
    }
    const lv = yield* resolveLv(e, scope);
    // Ziel (Feld/Element) per Proxy erreichbar machen
    const slot = new RefSlot(() => { const it = lv.get(); let r = it.next(); return r.value; }, (x) => { const it = lv.set(x); it.next(); });
    return slot;
  }

  function* evCall(n, scope) {
    const tgt = n.target;
    // nameof-Ersatz & besondere Namen
    if (tgt.type === 'Ident') {
      const name = tgt.name;
      if (name === 'nameof') {
        const a = n.args[0].expr;
        return a.type === 'Member' ? a.name : (a.name || '');
      }
      const sl = lookupSlot(scope, name);
      if (sl !== null) {
        const { vals } = yield* evArgs(n.args, scope);
        return yield* callFn(sl.v, vals, scope);
      }
      const { vals, named } = yield* evArgs(n.args, scope);
      scope.frame.line = n.line;
      const fr = scope.frame;
      // Methode der aktuellen Klasse / Instanz
      for (let c = fr.cls; c; c = c.outer) {
        const cands = findMethods(fr.thisObj ? (fr.thisObj.cls) : c, name);
        const cands2 = cands.length ? cands : findMethods(c, name);
        if (cands2.length) {
          const m = pickMethod(cands2, vals, named, scope);
          if (m.isStatic) { yield* ensureStatics(m.cls); return yield* invoke(m, null, vals, named, scope); }
          if (!fr.thisObj) throw rtCompileErr(scope, 'CS0120', 'Für das nicht statische Feld, die Methode oder die Eigenschaft "' + c.name + '.' + name + '" ist ein Objektverweis erforderlich');
          return yield* callVirtual(fr.thisObj, name, m, vals, named, scope);
        }
        if (!c.outer) break;
      }
      // lokale Funktion (als Variable abgelegt) oder Delegat-Feld
      const imp = yield* implicitMember(name, fr, scope, tgt);
      if (imp !== undefined && !(imp instanceof CMethodGroup)) return yield* callFn(imp, vals, scope);
      for (const sName of S.staticUsings) {
        const uc = S.classes.get(sName);
        if (uc && !uc.builtin) {
          const cands = findMethods(uc, name).filter((m) => m.isStatic);
          if (cands.length) { yield* ensureStatics(uc); return yield* invoke(pickMethod(cands, vals, named, scope), null, vals, named, scope); }
          continue;
        }
        try { return yield* CS.lib.callStatic(sName, name, vals, scope, named, null); } catch (e) { if (e instanceof KON.LangError && e.code === 'CS0117') continue; throw e; }
      }
      throw rtCompileErr(scope, 'CS0103', 'Der Name "' + name + '" ist im aktuellen Kontext nicht vorhanden');
    }
    if (tgt.type === 'Member') return yield* evMethodCall(n, tgt, scope);
    // Aufruf eines beliebigen Ausdrucks (Delegat)
    const f = yield* ev(tgt, scope);
    const { vals } = yield* evArgs(n.args, scope);
    return yield* callFn(f, vals, scope);
  }

  function* evMethodCall(n, tgt, scope) {
    const name = tgt.name;
    // base.Methode(...)
    if (tgt.obj.type === 'Base') {
      const { vals, named } = yield* evArgs(n.args, scope);
      scope.frame.line = n.line;
      const fr = scope.frame;
      const baseCls = fr.cls.base;
      if (baseCls && !baseCls.builtin) {
        const cands = findMethods(baseCls, name);
        if (cands.length) { const m = pickMethod(cands, vals, named, scope); return yield* invoke(m, fr.thisObj, vals, named, scope); }
      }
      return yield* CS.lib.callInstance(fr.thisObj, name, vals, scope, true);
    }
    const obj = yield* ev(tgt.obj, scope);
    if (obj === null || obj === undefined) {
      if (tgt.nullCond) { return null; }
      if (name === 'GetValueOrDefault') { const r0 = yield* evArgs(n.args, scope); return r0.vals.length ? r0.vals[0] : 0; }
      throw new CsThrow(CS.makeExc('NullReferenceException'));
    }
    const { vals, named } = yield* evArgs(n.args, scope);
    scope.frame.line = n.line;
    scope.frame.col = tgt.nameCol || n.col;
    return yield* callMember(obj, name, vals, named, scope, tgt);
  }

  function* callMember(obj, name, vals, named, scope, tgt) {
    if (S.ext.length && !(obj instanceof CClass) && !(obj instanceof CStatic) && !(obj instanceof CNamespace)) {
      const ecs = S.ext.filter((m) => m.name === name && matchScore(obj, m.params[0].type) >= 2 && !(obj instanceof CObject && findMethods(obj.cls, name).length));
      if (ecs.length) {
        const all = [obj].concat(vals);
        const m = pickMethod(ecs, all, named, scope);
        return yield* invoke(m, null, all, named, scope);
      }
    }
    if (obj instanceof CObject) {
      const cands = findMethods(obj.cls, name);
      if (cands.length) {
        const m = pickMethod(cands, vals, named, scope);
        return yield* callVirtual(obj, name, m, vals, named, scope);
      }
      // Delegat-Feld / Eigenschaft
      if (obj.f.has(name) && (obj.f.get(name) instanceof CLambda || obj.f.get(name) instanceof CMethodGroup)) return yield* callFn(obj.f.get(name), vals, scope);
      return yield* CS.lib.callInstance(obj, name, vals, scope, false, named);
    }
    if (obj instanceof CClass) {
      yield* ensureStatics(obj);
      for (let k = obj; k && !k.builtin; k = k.base) {
        const cands = findMethods(k, name).filter((m) => m.isStatic);
        if (cands.length) { const m = pickMethod(cands, vals, named, scope); return yield* invoke(m, null, vals, named, scope); }
      }
      if (obj.isEnum || obj.isInterface || true) {
        const r = yield* CS.lib.callClassStatic(obj, name, vals, scope);
        if (r !== undefined) return r;
      }
      throw rtCompileErr(scope, 'CS0117', '"' + obj.name + '" enthält keine Definition für "' + name + '"');
    }
    if (obj instanceof CStatic) return yield* CS.lib.callStatic(obj.name, name, vals, scope, named, tgt);
    if (obj instanceof CNamespace) throw rtCompileErr(scope, 'CS0234', 'Namespace "' + obj.name + '" kann nicht aufgerufen werden');
    if (obj instanceof CLambda || obj instanceof CMethodGroup || obj instanceof CMulti) {
      if (name === 'Invoke') return yield* callFn(obj, vals, scope);
    }
    return yield* CS.lib.callInstance(obj, name, vals, scope, false, named);
  }

  /* Virtuelle Auflösung: bei Instanzen die am weitesten abgeleitete Überschreibung nehmen */
  function* callVirtual(obj, name, m, vals, named, scope) {
    if (m.isStatic) return yield* invoke(m, null, vals, named, scope);
    // Methode mit gleicher Signatur in abgeleiteter Klasse?
    if (obj.cls !== m.cls && !m.isNew) {
      const cands = findMethods(obj.cls, name);
      for (const c of cands) {
        if (c === m) break;
        if (c.params.length === m.params.length && sameSig(c, m) && (c.mods.has('override') || c.mods.has('virtual') || c.mods.has('abstract'))) { m = c; break; }
      }
    }
    return yield* invoke(m, obj, vals, named, scope);
  }
  function sameSig(a, b) {
    for (let i = 0; i < a.params.length; i++) if (typeName(a.params[i].type) !== typeName(b.params[i].type)) return false;
    return true;
  }

  function findMethods(cls, name) {
    const out = [];
    for (let c = cls; c; c = c.base) {
      if (c.builtin) break;
      const l = c.methods.get(name);
      if (l) for (const m of l) out.push(m);
      // Standardimplementierung in Schnittstellen
      for (const i of c.interfaces) if (i instanceof CClass && !i.builtin) { const il = i.methods.get(name); if (il) for (const m of il) if (m.body || m.expr) out.push(m); }
    }
    return out;
  }
  CS.findMethods = findMethods;

  /* Wie gut passt ein Wert zu einem Parametertyp? -1 = gar nicht */
  function matchScore(v, t) {
    if (!t) return 1;
    if (t.k === 'null') return v === null ? 3 : matchScore(v, t.inner);
    if (t.k === 'array') return v instanceof CArray ? 3 : v === null ? 1 : -1;
    if (t.k === 'tuple') return v instanceof CTuple ? 3 : -1;
    const kind = CS.PRIM_NAMES[t.name];
    if (kind === undefined) {
      if (v === null) return 1;
      const cls = S.classes.get(t.name);
      if (cls) {
        if (v instanceof CObject) {
          if (v.cls === cls) return 3;
          return CS.isSubclass(v.cls, cls) ? 2 : -1;
        }
        if (v instanceof CEnumVal) return v.cls === cls ? 3 : -1;
        return -1;
      }
      if (S.typeParamsAll.has(t.name)) return 1;
      if (v instanceof CLambda || v instanceof CMethodGroup || v instanceof CMulti) return /^(Func|Action|Predicate|Comparison|Converter|EventHandler)/.test(t.name) || S.delegates.has(t.name) ? 3 : 1;
      return CS.lib.builtinTypeScore(v, t.name);
    }
    if (kind === 'object') return v === null ? 1 : 0;
    const vk = CS.kindOf(v);
    if (kind === 'string') return typeof v === 'string' ? 3 : v === null ? 1 : -1;
    if (kind === 'bool') return typeof v === 'boolean' ? 3 : -1;
    if (kind === 'char') return v instanceof Chr ? 3 : -1;
    if (vk === null) return -1;
    if (vk === kind) return 3;
    // implizite Erweiterung
    const widen = {
      int: ['long', 'double', 'float', 'decimal'],
      long: ['double', 'float', 'decimal'], float: ['double'], char: ['int', 'long', 'double', 'float', 'decimal', 'uint', 'ushort'],
      byte: ['short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'], sbyte: ['short', 'int', 'long', 'float', 'double', 'decimal'],
      short: ['int', 'long', 'float', 'double', 'decimal'], ushort: ['int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
      uint: ['long', 'ulong', 'float', 'double', 'decimal'], ulong: ['float', 'double', 'decimal']
    };
    if (widen[vk] && widen[vk].indexOf(kind) >= 0) return widen[vk].indexOf(kind) === 0 ? 2 : 1.5;
    // Konstante int-Literale passen auch in byte/short ... (wir lassen int -> kleinere Typen zu, niedrige Wertung)
    if (vk === 'int' && (kind === 'byte' || kind === 'sbyte' || kind === 'short' || kind === 'ushort' || kind === 'uint' || kind === 'ulong')) return 0.5;
    return -1;
  }

  function pickMethod(cands, vals, named, scope) {
    if (cands.length === 1) {
      const c = cands[0];
      if (matchArity(c, vals.length, named) >= 0) return c;
      throw arityErr(c, vals.length, scope);
    }
    let best = null, bestScore = -Infinity;
    for (const m of cands) {
      const sc = scoreMethod(m, vals, named);
      if (sc > bestScore) { best = m; bestScore = sc; }
    }
    if (best === null || bestScore < 0) {
      // Mindestens nach Anzahl passende Methode suchen
      for (const m of cands) if (matchArity(m, vals.length, named) >= 0) return m;
      throw arityErr(cands[0], vals.length, scope);
    }
    return best;
  }

  function arityErr(m, n, scope) {
    return rtCompileErr(scope, 'CS1501', 'Keine Überladung für die "' + m.name + '"-Methode akzeptiert ' + n + ' Argumente');
  }

  function matchArity(m, n, named) {
    const ps = m.params;
    const hasParams = ps.length && ps[ps.length - 1].mods.has('params');
    let required = 0;
    for (const p of ps) if (!p.default && !p.mods.has('params')) required++;
    const provided = n + (named ? named.size : 0);
    if (provided < required) {
      if (named) { for (const p of ps) if (!p.default && !p.mods.has('params') && !named.has(p.name) && ps.indexOf(p) >= n) return -1; return 0; }
      return -1;
    }
    if (n > ps.length && !hasParams) return -1;
    return 0;
  }

  function scoreMethod(m, vals, named) {
    if (matchArity(m, vals.length, named) < 0) return -Infinity;
    const ps = m.params;
    let score = 0;
    for (let i = 0; i < vals.length; i++) {
      let p = ps[i];
      let t;
      if (!p || (p.mods.has('params') && i >= ps.length - 1)) {
        const last = ps[ps.length - 1];
        if (last && last.mods.has('params')) {
          // params T[]: einzelnes Element oder Array
          if (vals.length === ps.length && vals[i] instanceof CArray && i === ps.length - 1) { score += 3; continue; }
          t = last.type && last.type.k === 'array' ? last.type.elem : null;
          const s = matchScore(vals[i], t);
          if (s < 0) return -Infinity;
          score += s * 0.5;
          continue;
        }
        return -Infinity;
      }
      if (p.mods.has('ref') || p.mods.has('out')) { score += 3; continue; }
      const s = matchScore(vals[i], p.type);
      if (s < 0) return -Infinity;
      score += s;
    }
    // Weniger Standardwerte nutzen ist besser
    score -= (ps.length - vals.length) * 0.1;
    return score;
  }

  /* Methode ausführen */
  function* invoke(m, thisObj, args, named, callerScope) {
    if (m.abstractBody) throw rtCompileErr(callerScope, 'CS0500', 'Abstrakte Methode kann nicht aufgerufen werden');
    const cls = m.cls;
    const frame = new Frame(cls, thisObj, (cls ? cls.name : '') + '.' + m.name + '()', cls ? cls.file : '');
    frame.line = m.line || 0;
    if (S.frames.length > S.limit) { const e = CS.makeExc('StackOverflowException'); const t = new CsThrow(e); t.fatal = true; throw t; }
    const scope = new Scope(null, frame);
    yield* bindParams(m, scope, args, named, callerScope);
    return yield { t: 'call', gen: runBody(m, scope, frame) };
  }
  CS.invoke = invoke;

  function* bindParams(m, scope, args, named, callerScope) {
    const ps = m.params;
    let ai = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.mods.has('params')) {
        const rest = args.slice(ai);
        if (rest.length === 1 && rest[0] instanceof CArray) scope.declare(p.name, rest[0], p.type);
        else {
          const et = p.type && p.type.k === 'array' ? p.type.elem : null;
          scope.declare(p.name, new CArray(et, rest.map((x) => coerce(x, et, scope))), p.type);
        }
        ai = args.length;
        continue;
      }
      let v;
      let have = false;
      if (ai < args.length) { v = args[ai++]; have = true; }
      else if (named && named.has(p.name)) { v = named.get(p.name); have = true; }
      if (!have) {
        if (p.default) v = yield* ev(p.default, scope, p.type);
        else throw rtCompileErr(callerScope || scope, 'CS7036', 'Es wurde kein Argument angegeben, das dem erforderlichen Parameter "' + p.name + '" von "' + m.name + '" entspricht');
        scope.declare(p.name, coerce(v, p.type, scope), p.type);
        continue;
      }
      if (p.mods.has('ref') || p.mods.has('out') || p.mods.has('in')) {
        if (v instanceof Slot || v instanceof RefSlot) { if (!scope.vars) scope.vars = new Map(); scope.vars.set(p.name, v); continue; }
      }
      scope.declare(p.name, coerce(storeVal(v), p.type, scope), p.type);
    }
    if (named) for (const [k, v] of named) { if (!ps.some((p) => p.name === k)) throw rtCompileErr(callerScope || scope, 'CS1739', 'Die beste Überladung für "' + m.name + '" enthält keinen Parameter mit dem Namen "' + k + '"'); void v; }
  }

  function* runBody(m, scope, frame) {
    S.frames.push(frame);
    try {
      let result = null;
      if (m.expr) result = yield* ev(m.expr, scope, m.ret);
      else if (m.body) {
        const sig = yield* execStmts(m.body.stmts, scope);
        if (sig instanceof Ret) result = sig.v;
      }
      if (m.ret && !m.isSetter) {
        if (m.ret.k === 'name' && m.ret.name === 'void') return null;
        return coerce(storeVal(result), m.ret, scope);
      }
      return result;
    } finally { S.frames.pop(); }
  }

  /* Delegat / Lambda / Methodengruppe aufrufen */
  function* callFn(f, args, scope) {
    if (f instanceof CMulti) {
      let r = null;
      for (const x of f.list.slice()) r = yield* callFn(x, args, scope);
      return r;
    }
    if (f instanceof CLambda) {
      const fr0 = f.frame;
      const frame = new Frame(fr0.cls, fr0.thisObj, fr0.fname.replace(/\(\)$/, '') + '.<lambda>()', fr0.file);
      frame.line = fr0.line;
      frame.inCtor = fr0.inCtor;
      const sc = new Scope(f.scope, frame);
      const ps = f.params;
      for (let i = 0; i < ps.length; i++) {
        if (args[i] instanceof Slot || args[i] instanceof RefSlot) { if (!sc.vars) sc.vars = new Map(); sc.vars.set(ps[i].name, args[i]); }
        else sc.declare(ps[i].name, ps[i].type ? coerce(args[i], ps[i].type, sc) : args[i], ps[i].type || null);
      }
      return yield { t: 'call', gen: runLambda(f, sc, frame) };
    }
    if (f instanceof CMethodGroup) {
      if (f.target instanceof CStatic) return yield* CS.lib.callStatic(f.target.name, f.name, args, scope, null, null);
      if (f.cls) {
        const cands = findMethods(f.cls, f.name);
        if (cands.length) {
          const m = pickMethod(cands, args, null, scope);
          if (m.isStatic) return yield* invoke(m, null, args, null, scope);
          return yield* callVirtual(f.target, f.name, m, args, null, scope);
        }
      }
      if (f.target !== null && f.target !== undefined) return yield* CS.lib.callInstance(f.target, f.name, args, scope, false, null);
    }
    if (f === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
    throw rtCompileErr(scope, 'CS1955', 'Der nicht aufrufbare Member "' + valueTypeName(f) + '" kann nicht wie eine Methode verwendet werden');
  }
  CS.callFn = callFn;

  function* runLambda(f, sc, frame) {
    S.frames.push(frame);
    try {
      if (f.body.type === 'Block') {
        const sig = yield* execStmts(f.body.stmts, sc);
        return sig instanceof Ret ? sig.v : null;
      }
      return yield* ev(f.body, sc);
    } finally { S.frames.pop(); }
  }

  /* ---------- Objekte erzeugen ---------- */
  function* evNew(n, scope, hint) {
    let t = n.typeRef || hint;
    if (t && t.k === 'null') t = t.inner;
    if (!t) throw rtCompileErr(scope, 'CS8754', 'Der Typ für "new" konnte nicht abgeleitet werden');
    const { vals, named } = yield* evArgs(n.args, scope);
    scope.frame.line = n.line;
    if (t.k === 'tuple') throw rtCompileErr(scope, 'CS1526', 'Ein neuer Ausdruck erfordert einen Typ');
    const cls = t.k === 'name' ? findClass(t.name, scope) : null;
    let obj;
    if (cls) obj = yield* instantiate(cls, vals, named, scope);
    else obj = yield* CS.lib.construct(t, vals, scope, named);
    if (n.init) yield* applyInit(obj, n.init, scope);
    return obj;
  }

  function* instantiate(cls, vals, named, scope) {
    if (cls.isAbstract || cls.isInterface) throw rtCompileErr(scope, 'CS0144', 'Eine Instanz der abstrakten Klasse oder Schnittstelle "' + cls.name + '" kann nicht erstellt werden');
    if (cls.isStatic) throw rtCompileErr(scope, 'CS0712', 'Der statische Typ "' + cls.name + '" kann nicht erstellt werden');
    yield* ensureStatics(cls);
    const obj = new CObject(cls);
    allocFields(cls, obj);
    yield* construct(cls, obj, vals, named, scope);
    return obj;
  }
  CS.instantiate = instantiate;

  function allocFields(cls, obj) {
    if (cls.base) allocFields(cls.base, obj);
    for (const f of cls.fields) obj.f.set(f.name, f.dflt === undefined ? (f.dflt = defaultOfType(f.type)) : (f.dflt instanceof CObject ? null : f.dflt));
    for (const p of cls.props.values()) if (!p.isStatic && p.auto) obj.f.set(p.name, defaultOfType(p.valType));
    if (cls.isExc) { obj.f.set('Message', cls.defaultMsg || null); obj.f.set('InnerException', null); }
  }
  function defaultOfType(t) {
    if (!t) return null;
    if (t.k === 'null') return null;
    const k = primKind(t);
    if (k !== undefined) return CS.defaultFor(k);
    if (t.k === 'name') {
      const c = S.classes.get(t.name);
      if (c && c.isStruct) { const o = new CObject(c); allocFields(c, o); return o; }
    }
    return null;
  }

  function* runFieldInits(cls, obj, scope0) {
    if (!cls.fields.length && !cls.propInits.length) return;
    const frame = new Frame(cls, obj, cls.name + '..ctor()', cls.file);
    frame.inCtor = true;
    const scope = new Scope(null, frame);
    S.frames.push(frame);
    try {
      for (const f of cls.fields) {
        if (!f.init) continue;
        frame.line = f.line;
        obj.f.set(f.name, coerce(storeVal(yield* ev(f.init, scope, f.type)), f.type, scope));
      }
      for (const p of cls.propInits) {
        frame.line = p.line;
        obj.f.set(p.name, coerce(storeVal(yield* ev(p.init, scope, p.valType)), p.valType, scope));
      }
    } finally { S.frames.pop(); }
    void scope0;
  }

  function* construct(cls, obj, args, named, callerScope) {
    if (cls.builtin) {
      if (cls.isExc) {
        if (args.length > 0 && (typeof args[0] === 'string' || args[0] === null)) obj.f.set('Message', args[0] === null ? cls.defaultMsg : args[0]);
        if (args.length > 1 && args[1] instanceof CObject) obj.f.set('InnerException', args[1]);
        if (args.length > 0 && args[0] instanceof CObject) obj.f.set('InnerException', args[0]);
        if (cls.name === 'ArgumentException' || cls.name === 'ArgumentNullException' || cls.name === 'ArgumentOutOfRangeException') {
          if (args.length > 1 && typeof args[1] === 'string' && cls.name === 'ArgumentException') obj.f.set('ParamName', args[1]);
          else if (args.length > 0 && typeof args[0] === 'string' && cls.name !== 'ArgumentException') {
            obj.f.set('ParamName', args[0]);
            obj.f.set('Message', args.length > 1 && typeof args[1] === 'string' ? args[1] + ' (Parameter \'' + args[0] + '\')' : 'Der Wert darf nicht NULL sein. (Parameter \'' + args[0] + '\')');
            if (cls.name === 'ArgumentOutOfRangeException' && args.length < 2) obj.f.set('Message', 'Der angegebene Wert liegt außerhalb des gültigen Bereichs. (Parameter \'' + args[0] + '\')');
          }
        }
      }
      return;
    }
    const ctors = cls.ctors;
    if (!ctors.length) {
      if (args.length > 0 && !cls.isRecord) throw rtCompileErr(callerScope, 'CS1729', '"' + cls.name + '" enthält keinen Konstruktor, der ' + args.length + ' Argumente akzeptiert');
      if (cls.isRecord && cls.recordProps) {
        yield* runFieldInits(cls, obj);
        if (cls.base && !cls.base.builtin) yield* construct(cls.base, obj, [], null, callerScope);
        cls.recordProps.forEach((p, i) => { obj.f.set(p.name, coerce(storeVal(i < args.length ? args[i] : (named && named.has(p.name) ? named.get(p.name) : null)), p.type, callerScope)); });
        return;
      }
      yield* runFieldInits(cls, obj);
      if (cls.base) yield* construct(cls.base, obj, [], null, callerScope);
      return;
    }
    const ctor = pickMethod(ctors, args, named, callerScope);
    yield* runCtor(cls, ctor, obj, args, named, callerScope);
  }

  function* runCtor(cls, ctor, obj, args, named, callerScope) {
    const frame = new Frame(cls, obj, cls.name + '.' + cls.name + '()', cls.file);
    frame.line = ctor.line;
    frame.inCtor = true;
    const scope = new Scope(null, frame);
    yield* bindParams({ name: cls.name, params: ctor.params }, scope, args, named, callerScope);
    return yield { t: 'call', gen: runCtorBody(cls, ctor, obj, scope, frame, callerScope) };
  }

  function* runCtorBody(cls, ctor, obj, scope, frame, callerScope) {
    S.frames.push(frame);
    try {
      const init = ctor.init;
      if (init && init.kind === 'this') {
        const { vals, named } = yield* evArgs(init.args, scope);
        const other = pickMethod(cls.ctors.filter((c) => c !== ctor), vals, named, scope);
        yield* runCtor(cls, other, obj, vals, named, scope);
      } else {
        yield* runFieldInits(cls, obj);
        let bargs = [], bnamed = null;
        if (init) { const r = yield* evArgs(init.args, scope); bargs = r.vals; bnamed = r.named; }
        if (cls.base) yield* construct(cls.base, obj, bargs, bnamed, scope);
      }
      if (cls.isRecord && cls.recordProps && !ctor.params.length) { /* nichts */ }
      if (ctor.body) yield* execStmts(ctor.body.stmts, scope);
      return null;
    } finally { S.frames.pop(); }
  }

  function* applyInit(obj, init, scope) {
    for (const it of init.items) {
      if (it.kind === 'member') {
        const lvObj = obj;
        if (lvObj instanceof CObject) {
          const p = findProp(lvObj.cls, it.name);
          const fd = findField(lvObj.cls, it.name);
          const ty = p ? p.valType : fd ? fd.type : null;
          const v = yield* ev(it.expr, scope, ty);
          if (p) { const saveInCtor = scope.frame.inCtor; scope.frame.inCtor = true; yield* setProp(p, lvObj, v, scope); scope.frame.inCtor = saveInCtor; }
          else lvObj.f.set(it.name, coerce(storeVal(v), ty, scope));
        } else {
          const v = yield* ev(it.expr, scope);
          yield* CS.lib.setMember(obj, it.name, v, scope);
        }
      } else if (it.kind === 'index') {
        const k = yield* ev(it.index, scope);
        const v = yield* ev(it.expr, scope);
        yield* setIndexed(obj, [k], v, scope);
      } else {
        const vals = [];
        for (const e of it.exprs) vals.push(yield* ev(e, scope, obj instanceof CList ? obj.et : null));
        yield* callMember(obj, 'Add', vals, null, scope, null);
      }
    }
  }

  function* evNewArray(n, scope) {
    let et = n.elemType;
    if (n.init) {
      if (!et) {
        // new[] { ... }: Elementtyp aus Werten
        const vals = [];
        for (const e of n.init.elems) vals.push(yield* ev(e, scope));
        const t = inferElemType(vals);
        return new CArray(t, vals.map((v) => (t ? coerce(v, t, scope) : v)));
      }
      if (n.dims) {
        const sizes = [];
        for (const d of n.dims) sizes.push(yield* ev(d, scope));
      }
      const arr = yield* evArrayInit(n.init, scope, { k: 'array', elem: et, rank: n.rank });
      return arr;
    }
    const sizes = [];
    for (const d of n.dims) {
      const s = yield* ev(d, scope);
      if (typeof s !== 'number') throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(s) + '" kann nicht implizit in "int" konvertiert werden');
      if (s < 0) throw new CsThrow(CS.makeExc('OverflowException', 'Der arithmetische Vorgang hat einen Überlauf verursacht.'));
      sizes.push(s);
    }
    const total = sizes.reduce((a, b) => a * b, 1);
    if (total > 50000000) throw new CsThrow(CS.makeExc('OutOfMemoryException'));
    const dflt = defaultOfType(et);
    const a = new Array(total);
    if (dflt instanceof CObject) for (let i = 0; i < total; i++) a[i] = defaultOfType(et); else a.fill(dflt);
    return new CArray(et, a, sizes.length > 1 ? sizes : null);
  }

  function inferElemType(vals) {
    if (!vals.length) return null;
    const kinds = new Set(vals.map((v) => (typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'bool' : CS.kindOf(v) || 'obj')));
    if (kinds.size === 1) { const k = [...kinds][0]; return k === 'obj' ? null : { k: 'name', name: k, args: [] }; }
    if ([...kinds].every((k) => k === 'int' || k === 'double' || k === 'long')) return { k: 'name', name: 'double', args: [] };
    return null;
  }

  function* evArrayInit(n, scope, hint) {
    let t = hint;
    if (t && t.k === 'null') t = t.inner;
    if (t && t.k === 'name' && (t.name === 'List' || t.name === 'IEnumerable' || t.name === 'IList' || t.name === 'ICollection' || t.name === 'HashSet')) {
      const et = t.args[0] || null;
      const vals = [];
      for (const e of n.elems) vals.push(coerce(storeVal(yield* ev(e, scope, et)), et, scope));
      return t.name === 'HashSet' ? yield* CS.lib.construct(t, [new CList(vals, et)], scope) : new CList(vals, et);
    }
    const et = t && t.k === 'array' ? (t.rank > 1 ? t.elem : t.elem) : null;
    if (t && t.k === 'array' && t.rank > 1) {
      // mehrdimensional {{1,2},{3,4}}
      const dims = [];
      let cur = n;
      while (cur && cur.type === 'ArrayInit') { dims.push(cur.elems.length); cur = cur.elems[0]; }
      const flat = [];
      const walk = function* (node, depth) {
        for (const e of node.elems) {
          if (depth < dims.length - 1) yield* walk(e, depth + 1);
          else flat.push(coerce(storeVal(yield* ev(e, scope)), et, scope));
        }
      };
      yield* walk(n, 0);
      return new CArray(et, flat, dims);
    }
    const vals = [];
    for (const e of n.elems) vals.push(coerce(storeVal(yield* ev(e, scope, et)), et, scope));
    return new CArray(et, vals);
  }

  /* ---------- Umwandlung ---------- */
  function* evCast(n, scope) {
    const v = yield* ev(n.expr, scope);
    const t = n.typeRef;
    if (t.k === 'null') {
      if (v === null) return null;
      return castTo(v, t.inner, scope);
    }
    return castTo(v, t, scope);
  }

  function castTo(v, t, scope) {
    if (t.k === 'name') {
      const kind = CS.PRIM_NAMES[t.name];
      if (kind !== undefined) {
        if (kind === 'object') return v;
        if (kind === 'string') { if (v === null || typeof v === 'string') return v; throw invalidCast(v, 'String'); }
        if (kind === 'bool') { if (typeof v === 'boolean') return v; throw invalidCast(v, 'Boolean'); }
        if (v === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
        if (typeof v === 'string' || typeof v === 'boolean' || v instanceof CObject) throw invalidCast(v, 'System.' + CS.NET_NAMES[kind]);
        return castNumber(v, kind, scope);
      }
      const cls = findClass(t.name, scope);
      if (cls) {
        if (cls.isEnum) {
          if (v instanceof CEnumVal) return v.cls === cls ? v : CS.lib.enumFromValue(cls, v.value);
          if (CS.isNumeric(v) || v instanceof Chr) return CS.lib.enumFromValue(cls, Number(CS.toNumber(v)));
        }
        if (v === null) return null;
        if (v instanceof CObject) {
          if (CS.isSubclass(v.cls, cls)) return v;
          throw new CsThrow(CS.makeExc('InvalidCastException', 'Das Objekt des Typs "' + v.cls.name + '" kann nicht in Typ "' + cls.name + '" umgewandelt werden.'));
        }
        throw new CsThrow(CS.makeExc('InvalidCastException', 'Das Objekt des Typs "' + valueTypeName(v) + '" kann nicht in Typ "' + cls.name + '" umgewandelt werden.'));
      }
    }
    if (v !== null && !typeTest(v, t, scope) && t.k === 'array') throw invalidCast(v, typeName(t));
    return v;
  }
  function invalidCast(v, to) {
    return new CsThrow(CS.makeExc('InvalidCastException', 'Das Objekt des Typs "' + (CS.lib.netTypeName ? CS.lib.netTypeName(v) : valueTypeName(v)) + '" kann nicht in Typ "' + to + '" umgewandelt werden.'));
  }

  /* Typtest für is/as/catch/Muster */
  function typeTest(v, t, scope) {
    if (t.k === 'null') return v === null || typeTest(v, t.inner, scope);
    if (t.k === 'array') return v instanceof CArray;
    if (t.k === 'tuple') return v instanceof CTuple;
    if (v === null) return false;
    const kind = CS.PRIM_NAMES[t.name];
    if (kind !== undefined) {
      if (kind === 'object') return true;
      if (kind === 'string') return typeof v === 'string';
      if (kind === 'bool') return typeof v === 'boolean';
      if (kind === 'char') return v instanceof Chr;
      return CS.kindOf(v) === kind && !(v instanceof Chr);
    }
    const cls = findClass(t.name, scope);
    if (cls) {
      if (v instanceof CObject) return CS.isSubclass(v.cls, cls);
      if (v instanceof CEnumVal) return v.cls === cls;
      return false;
    }
    return CS.lib.builtinTypeTest(v, t.name);
  }
  CS.typeTest = typeTest;

  /* ---------- Muster ---------- */
  function* matchPattern(p, v, scope) {
    switch (p.k) {
      case 'discard': return true;
      case 'null': return v === null;
      case 'var': scope.declare(p.name, v, null); return true;
      case 'type':
        if (!typeTest(v, p.type, scope)) return false;
        if (p.name) scope.declare(p.name, v, p.type.k === 'name' && CS.PRIM_NAMES[p.type.name] ? p.type : null);
        return true;
      case 'const': {
        // Bezeichner kann auch ein Typ sein
        const c = yield* evPatternConst(p.expr, scope);
        if (c instanceof CType) return typeTest(v, c.node, scope);
        const r = primEquals(v, c);
        if (r !== undefined) return r;
        if (v === null || c === null) return v === c;
        return yield* CS.lib.equals(v, c);
      }
      case 'rel': {
        const c = yield* ev(p.expr, scope);
        if (v === null) return false;
        const r = relational(p.op, v, c);
        return r === true;
      }
      case 'and': return (yield* matchPattern(p.l, v, scope)) && (yield* matchPattern(p.r, v, scope));
      case 'or': return (yield* matchPattern(p.l, v, scope)) || (yield* matchPattern(p.r, v, scope));
      case 'not': return !(yield* matchPattern(p.p, v, scope));
      case 'prop': {
        if (v === null) return false;
        if (p.type && !typeTest(v, p.type, scope)) return false;
        for (const pr of p.props) {
          let cur = v;
          for (const part of pr.name.split('.')) {
            if (cur === null) return false;
            cur = yield* getMember(cur, part, scope);
          }
          if (!(yield* matchPattern(pr.pattern, cur, scope))) return false;
        }
        if (p.name) scope.declare(p.name, v, null);
        return true;
      }
      case 'pos': {
        if (v === null) return false;
        if (p.type && !typeTest(v, p.type, scope)) return false;
        let items;
        if (v instanceof CTuple) items = v.items;
        else if (v instanceof CObject && v.cls.recordProps) items = v.cls.recordProps.map((q) => v.f.get(q.name));
        else return false;
        if (items.length !== p.items.length) return false;
        for (let i = 0; i < items.length; i++) if (!(yield* matchPattern(p.items[i], items[i], scope))) return false;
        if (p.name) scope.declare(p.name, v, null);
        return true;
      }
    }
    return false;
  }

  function* evPatternConst(e, scope) {
    if (e.type === 'Ident' && !lookupSlot(scope, e.name)) {
      const cls = findClass(e.name, scope);
      if (cls && !cls.isEnum) { const t = new CType(e.name, cls); t.node = { k: 'name', name: e.name, args: [] }; return t; }
      if (CS.PRIM_NAMES[e.name]) { const t = new CType(e.name); t.node = { k: 'name', name: e.name, args: [] }; return t; }
    }
    if (e.type === 'Ident' && e.isTypeKw) { const t = new CType(e.name); t.node = { k: 'name', name: e.name, args: [] }; return t; }
    return yield* ev(e, scope);
  }

  function* evSwitchExpr(n, scope) {
    const v = yield* ev(n.expr, scope);
    for (const arm of n.arms) {
      const sc = new Scope(scope, scope.frame);
      if (yield* matchPattern(arm.pattern, v, sc)) {
        if (arm.when && (yield* ev(arm.when, sc)) !== true) continue;
        return yield* ev(arm.result, sc);
      }
    }
    throw new CsThrow(CS.makeExc('InvalidOperationException', 'Der Ausdruck switch hat keinen passenden Zweig für den Wert "' + (yield* CS.lib.toStr(v)) + '".'));
  }

  /* ---------- Anweisungen ---------- */
  function* execStmts(stmts, scope) {
    if (stmts.lf === undefined) stmts.lf = stmts.filter((s) => s.type === 'LocalFunc');
    for (const st of stmts.lf) {
      const f = new CLambda(st.params, st.body || st.expr, scope, scope.frame);
      f.name = st.name;
      scope.declare(st.name, f, null);
    }
    for (let i = 0; i < stmts.length; i++) {
      const sig = yield* exec(stmts[i], scope);
      if (sig !== undefined) return sig;
    }
    return undefined;
  }

  /* Enthält der Block (oder ein darin stehender Ausdruck) Deklarationen, die einen eigenen Bereich brauchen? */
  function needsScope(node) {
    if (node === null || typeof node !== 'object') return false;
    if (Array.isArray(node)) { for (const x of node) if (needsScope(x)) return true; return false; }
    switch (node.type) {
      case 'Local': case 'LocalTuple': case 'LocalFunc': case 'UsingDecl': case 'DeclOut': case 'LocalType': return true;
      case 'Is': case 'SwitchExpr': return true;
      case 'Lambda': return false;
      case 'Block': return false; // verschachtelte Blöcke legen selbst einen Bereich an
    }
    for (const k in node) {
      if (k === 'line' || k === 'col' || k === 'type' || k === 'cv' || k === 'pure') continue;
      const v = node[k];
      if (v && typeof v === 'object' && needsScope(v)) return true;
    }
    return false;
  }
  function* execBlock(block, scope) {
    if (block.ns === undefined) block.ns = needsScope(block.stmts);
    return yield* execStmts(block.stmts, block.ns ? new Scope(scope, scope.frame) : scope);
  }

  function* exec(st, scope) {
    scope.frame.line = st.line;
    scope.frame.col = st.col;
    switch (st.type) {
      case 'ExprStmt': {
        const e = st.expr;
        if (e.type === 'IncDec' && e.operand.type === 'Ident') {
          const sl = lookupSlot(scope, e.operand.name);
          if (sl !== null && typeof sl.v === 'number') { sl.v = e.op === '++' ? (sl.v + 1) | 0 : (sl.v - 1) | 0; return undefined; }
        }
        yield* ev(e, scope);
        return undefined;
      }
      case 'Local': {
        const t = st.varType;
        const isVar = t.k === 'name' && t.name === 'var';
        for (const d of st.decls) {
          if (scope.vars !== null && scope.vars.has(d.name) && false) throw rtCompileErr(scope, 'CS0128', 'Eine lokale Variable mit dem Namen "' + d.name + '" ist bereits in diesem Bereich definiert');
          let v = null;
          if (d.init) {
            v = yield* ev(d.init, scope, isVar ? null : t);
            v = storeVal(v);
            if (isVar) {
              scope.declare(d.name, v, inferType(v));
            } else scope.declare(d.name, coerce(v, t, scope), t);
          } else scope.declare(d.name, defaultOfType(t), t);
        }
        return undefined;
      }
      case 'LocalTuple': {
        const v = yield* ev(st.init, scope);
        let items;
        if (v instanceof CTuple) items = v.items;
        else if (v instanceof CObject && v.cls.recordProps) items = v.cls.recordProps.map((p) => v.f.get(p.name));
        else throw rtCompileErr(scope, 'CS8130', 'Der Typ kann nicht dekonstruiert werden');
        if (items.length !== st.names.length) throw rtCompileErr(scope, 'CS8132', 'Ein ' + items.length + '-Element-Tupel kann nicht in ' + st.names.length + ' Variablen dekonstruiert werden');
        st.names.forEach((nm, i) => { if (nm !== '_') scope.declare(nm, st.types ? CS.coerce(items[i], st.types[i], scope) : items[i], st.types ? st.types[i] : inferType(items[i])); });
        return undefined;
      }
      case 'If': {
        const c = yield* ev(st.cond, scope);
        if (c === true) return yield* execEmbedded(st.then, scope);
        if (c !== false) throw rtCompileErr(scope, 'CS0029', 'Der Typ "' + valueTypeName(c) + '" kann nicht implizit in "bool" konvertiert werden');
        if (st.els) return yield* execEmbedded(st.els, scope);
        return undefined;
      }
      case 'Block': return yield* execBlock(st, scope);
      case 'While': {
        for (;;) {
          const c = yield* ev(st.cond, scope);
          if (c !== true) break;
          const sig = yield* execEmbedded(st.body, scope);
          if (sig !== undefined) { if (sig === BRK) break; if (sig !== CNT) return sig; }
          if ((++S.ticks & 63) === 0) yield TICK;
        }
        return undefined;
      }
      case 'DoWhile': {
        for (;;) {
          const sig = yield* execEmbedded(st.body, scope);
          if (sig !== undefined) { if (sig === BRK) break; if (sig !== CNT) return sig; }
          const c = yield* ev(st.cond, scope);
          if (c !== true) break;
          if ((++S.ticks & 63) === 0) yield TICK;
        }
        return undefined;
      }
      case 'For': {
        const sc = new Scope(scope, scope.frame);
        for (const i of st.init) yield* exec(i, sc);
        for (;;) {
          if (st.cond) { const c = yield* ev(st.cond, sc); if (c !== true) break; }
          const sig = yield* execEmbedded(st.body, sc);
          if (sig !== undefined) { if (sig === BRK) break; if (sig !== CNT) return sig; }
          for (const it of st.iters) {
            if (it.type === 'IncDec' && it.operand.type === 'Ident') {
              const sl = lookupSlot(sc, it.operand.name);
              if (sl !== null && typeof sl.v === 'number') { sl.v = it.op === '++' ? (sl.v + 1) | 0 : (sl.v - 1) | 0; continue; }
            }
            yield* ev(it, sc);
          }
          if ((++S.ticks & 63) === 0) yield TICK;
        }
        return undefined;
      }
      case 'Foreach': return yield* execForeach(st, scope);
      case 'Switch': return yield* execSwitch(st, scope);
      case 'Break': return BRK;
      case 'Continue': return CNT;
      case 'Return': {
        if (!st.expr) return new Ret(null);
        const m = scope.frame;
        return new Ret(yield* ev(st.expr, scope, null));
        void m;
      }
      case 'Throw': {
        if (!st.expr) {
          const cur = S.excStack[S.excStack.length - 1];
          if (!cur) throw rtCompileErr(scope, 'CS0156', 'Eine throw-Anweisung ohne Argumente ist nur in einem catch-Block zulässig');
          throw cur;
        }
        const v = yield* ev(st.expr, scope);
        if (v === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
        if (!(v instanceof CObject) || !isExceptionObj(v)) throw rtCompileErr(scope, 'CS0155', 'Der abgefangene oder ausgelöste Typ muss von "System.Exception" abgeleitet sein');
        throw new CsThrow(v);
      }
      case 'Try': return yield* execTry(st, scope);
      case 'Using': {
        const sc = new Scope(scope, scope.frame);
        let res = null;
        if (st.decl) { yield* exec(st.decl, sc); } else res = yield* ev(st.expr, sc);
        let target = res;
        if (st.decl) target = sc.vars ? [...sc.vars.values()][0].v : null;
        let sig, pending = null;
        try { sig = yield* execEmbedded(st.body, sc); } catch (e) { pending = e; }
        if (target instanceof CObject) {
          const ms = findMethods(target.cls, 'Dispose');
          if (ms.length) yield* invoke(ms[0], target, [], null, sc);
        }
        if (pending) throw pending;
        return sig;
      }
      case 'UsingDecl': { yield* exec(st.decl, scope); return undefined; }
      case 'Lock': { yield* ev(st.expr, scope); return yield* execEmbedded(st.body, scope); }
      case 'LocalFunc': return undefined;
      case 'LocalType': return undefined;
      case 'Empty': return undefined;
    }
    throw new Error('Unbekannte Anweisung: ' + st.type);
  }

  function isExceptionObj(o) { for (let c = o.cls; c; c = c.base) if (c.isExc) return true; return false; }
  CS.isExceptionObj = isExceptionObj;

  function inferType(v) {
    if (typeof v === 'number') return { k: 'name', name: 'int', args: [] };
    if (typeof v === 'string') return { k: 'name', name: 'string', args: [] };
    if (typeof v === 'boolean') return { k: 'name', name: 'bool', args: [] };
    if (v instanceof Dbl) return { k: 'name', name: 'double', args: [] };
    if (typeof v === 'bigint') return { k: 'name', name: 'long', args: [] };
    if (v instanceof Num) return { k: 'name', name: v.k, args: [] };
    if (v instanceof Chr) return { k: 'name', name: 'char', args: [] };
    return null;
  }

  function* execEmbedded(st, scope) {
    if (st.type === 'Block') return yield* execBlock(st, scope);
    return yield* exec(st, new Scope(scope, scope.frame));
  }

  function* execForeach(st, scope) {
    const coll = yield* ev(st.expr, scope);
    if (coll === null) throw new CsThrow(CS.makeExc('NullReferenceException'));
    const isVar = st.varType.k === 'name' && st.varType.name === 'var';
    let ver = coll.ver || 0;
    const it = yield* CS.lib.iterator(coll, scope);
    for (;;) {
      const r = it.gen ? yield* it.next() : it.next();
      if (r.done) break;
      const sc = new Scope(scope, scope.frame);
      let v = r.value;
      if (st.names) {
        const items = v instanceof CTuple ? v.items : (v instanceof CObject && v.cls.recordProps ? v.cls.recordProps.map((p) => v.f.get(p.name)) : []);
        st.names.forEach((nm, i) => sc.declare(nm, items[i], inferType(items[i])));
      } else {
        v = storeVal(v);
        if (isVar) sc.declare(st.name, v, inferType(v));
        else {
          const k = primKind(st.varType);
          // foreach (int x in doubles) ist ein Cast
          if (k !== undefined && k !== 'object' && v !== null && CS.isNumeric(v) && CS.kindOf(v) !== k && !(typeof v === 'string')) {
            sc.declare(st.name, castNumber(v, k, scope), st.varType);
          } else sc.declare(st.name, coerce(v, st.varType, scope), st.varType);
        }
      }
      const sig = yield* execEmbedded(st.body, sc);
      if (sig !== undefined) { if (sig === BRK) break; if (sig !== CNT) return sig; }
      if ((coll.ver || 0) !== ver && (coll instanceof CList || coll instanceof CDict || coll instanceof CSet)) {
        throw new CsThrow(CS.makeExc('InvalidOperationException', 'Die Auflistung wurde geändert. Der Enumerationsvorgang kann nicht ausgeführt werden.'));
      }
      if ((++S.ticks & 63) === 0) yield TICK;
    }
    return undefined;
  }

  function* execSwitch(st, scope) {
    const v = yield* ev(st.expr, scope);
    const sc = new Scope(scope, scope.frame);
    let start = -1;
    // Passenden Abschnitt suchen (default zuletzt)
    let defIdx = -1;
    outer:
    for (let i = 0; i < st.sections.length; i++) {
      for (const lb of st.sections[i].labels) {
        if (lb.isDefault) { defIdx = i; continue; }
        if (yield* matchPattern(lb.pattern, v, sc)) {
          if (lb.when && (yield* ev(lb.when, sc)) !== true) continue;
          start = i; break outer;
        }
      }
    }
    if (start < 0) start = defIdx;
    if (start < 0) return undefined;
    // Fall-through gibt es in C# nicht – nur gestapelte Labels (bereits zusammengefasst)
    const sig = yield* execStmts(st.sections[start].stmts, sc);
    if (sig === BRK) return undefined;
    return sig;
  }

  function* execTry(st, scope) {
    let sig, pending = null;
    try {
      let raised = null;
      try {
        sig = yield* execBlock(st.block, scope);
      } catch (e0) {
        const e = normalizeError(e0);
        if (!(e instanceof CsThrow) || e.fatal) throw e;
        raised = e;
      }
      if (raised) {
        let handler = null;
        const sc = new Scope(scope, scope.frame);
        for (const h of st.catches) {
          if (h.type) {
            if (!typeTestExc(raised.obj, h.type, scope)) continue;
          }
          if (h.name) sc.declare(h.name, raised.obj, h.type);
          if (h.when) {
            S.excStack.push(raised);
            let ok;
            try { ok = (yield* ev(h.when, sc)) === true; } finally { S.excStack.pop(); }
            if (!ok) continue;
          }
          handler = h; break;
        }
        if (!handler) throw raised;
        S.excStack.push(raised);
        try {
          sig = yield* execBlock(handler.block, sc);
        } finally { S.excStack.pop(); }
      }
    } catch (e) {
      pending = e;
    }
    if (st.fin) {
      const fs = yield* execBlock(st.fin, scope);
      if (fs !== undefined) return fs;
    }
    if (pending) throw pending;
    return sig;
  }

  function typeTestExc(obj, t, scope) {
    if (t.k === 'name') {
      if (t.name === 'Exception' || t.name === 'System.Exception') return true;
      const cls = findClass(t.name, scope);
      if (cls) return CS.isSubclass(obj.cls, cls);
      return false;
    }
    return false;
  }

  function normalizeError(e) {
    if (e instanceof CsThrow || e instanceof ExitSignal) return e;
    if (e instanceof RangeError && /call stack|too much recursion/i.test(e.message)) {
      const t = new CsThrow(CS.makeExc('StackOverflowException'));
      t.fatal = true;
      return t;
    }
    return e;
  }

  /* ---------- Programm einrichten ---------- */
  function mkMethod(decl, cls, member) {
    return {
      name: member.name, params: member.params, body: member.body, expr: member.expr, mods: member.mods, cls: cls, ret: member.ret,
      isStatic: member.mods.has('static'), line: member.line, col: member.col, typeParams: member.typeParams || [], abstractBody: false,
      isNew: member.mods.has('new'), decl: member
    };
  }

  function declareType(decl, outer, file, S0) {
    const cls = new CClass(decl.name, decl.kind === 'recordstruct' ? 'recordstruct' : decl.kind);
    cls.decl = decl; cls.file = file; cls.outer = outer || null;
    cls.isAbstract = decl.mods.has('abstract'); cls.isStatic = decl.mods.has('static');
    cls.typeParams = decl.typeParams || [];
    for (const tp of cls.typeParams) S0.typeParamsAll.add(tp);
    cls.staticFieldInits = []; cls.propInits = [];
    if (outer) outer.nested.set(decl.name, cls);
    if (S0.classes.has(decl.name) && !outer) {
      throw CS.csErr(file, decl.line, decl.col, 'CS0101', 'Der Namespace enthält bereits eine Definition für "' + decl.name + '"');
    }
    if (!S0.classes.has(decl.name)) S0.classes.set(decl.name, cls);
    S0.allClasses.push(cls);
    // Mitglieder
    if (cls.isEnum) {
      cls.enumMembers = new Map();
      cls.enumDecl = decl.members;
    }
    for (const m of decl.members) {
      switch (m.type) {
        case 'TypeDecl': case 'Delegate': {
          if (m.type === 'Delegate') { S0.delegates.add(m.name); break; }
          declareType(m, cls, file, S0);
          break;
        }
        case 'Field': {
          const isStatic = m.mods.has('static') || m.mods.has('const');
          for (const d of m.decls) {
            if (isStatic) {
              cls.sfields.set(d.name, CS.defaultFor(primKind(m.valType)));
              cls.sfieldTypes.set(d.name, m.valType);
              cls.staticFieldInits.push({ name: d.name, type: m.valType, init: d.init, line: d.line, isConst: m.mods.has('const') });
            } else cls.fields.push({ name: d.name, type: m.valType, init: d.init, line: d.line, readonly: m.mods.has('readonly') });
          }
          break;
        }
        case 'Property': {
          const isStatic = m.mods.has('static');
          const auto = m.auto && !m.expr && m.get === true || (m.auto && (m.set === true || m.set === null) );
          const p = { name: m.name, valType: m.valType, get: m.get, set: m.set, expr: m.expr, auto: !!(m.get === true || (m.get === null && m.set === true)) && !m.expr, isStatic: isStatic, cls: cls, init: m.init, line: m.line, initOnly: m.initOnly, mods: m.mods };
          if (m.get === true && m.set !== null && m.set !== true) p.auto = false;
          if (m.set === true && m.get !== null && m.get !== true) p.auto = false;
          void auto;
          if (m.expr) p.auto = false;
          // Auto-Property: sowohl get;set; (true/true) oder nur get;
          if (m.get === true || (m.get === null && m.set === true)) p.auto = (m.get === true || m.get === null) && (m.set === true || m.set === null);
          cls.props.set(m.name, p);
          if (isStatic && p.auto) { cls.sfields.set(m.name, CS.defaultFor(primKind(m.valType))); if (m.init) cls.staticFieldInits.push({ name: m.name, type: m.valType, init: m.init, line: m.line }); }
          else if (m.init) cls.propInits.push(p);
          break;
        }
        case 'Method': {
          const meth = mkMethod(decl, cls, m);
          if (!m.body && !m.expr && !(cls.isInterface || m.mods.has('abstract') || m.mods.has('extern'))) {
            throw CS.csErr(file, m.line, m.col, 'CS0501', '"' + cls.name + '.' + m.name + '" muss einen Text deklarieren, da die Methode nicht als abstrakt, partiell oder extern markiert ist');
          }
          meth.abstractBody = !m.body && !m.expr;
          const arr = cls.methods.get(m.name) || [];
          for (const other of arr) {
            if (other.params.length === meth.params.length && sameSig(other, meth)) {
              throw CS.csErr(file, m.line, m.col, 'CS0111', 'Der Typ "' + cls.name + '" definiert bereits einen Member namens "' + m.name + '" mit denselben Parametertypen');
            }
          }
          arr.push(meth);
          cls.methods.set(m.name, arr);
          if (m.params.length && m.params[0].mods.has('this')) S0.ext.push(meth);
          break;
        }
        case 'Ctor': {
          if (m.mods.has('static')) { cls.staticCtor = { body: m.body }; break; }
          cls.ctors.push({ params: m.params, init: m.init, body: m.body, line: m.line, name: cls.name, cls: cls, mods: m.mods });
          break;
        }
        case 'Indexer':
          cls.indexers.push({ params: m.params, valType: m.valType, get: m.get, set: m.set, expr: m.expr, cls: cls, line: m.line });
          break;
        case 'Operator': {
          const op = { name: 'operator ' + m.op, params: m.params, body: m.body, expr: m.expr, mods: m.mods, cls: cls, ret: m.ret, isStatic: true, line: m.line };
          const arr = cls.operators.get(m.op) || [];
          arr.push(op); cls.operators.set(m.op, arr);
          break;
        }
      }
    }
    // Records: primärer Konstruktor
    if (decl.recordParams) {
      cls.recordProps = decl.recordParams.map((p) => ({ name: p.name, type: p.type }));
      for (const p of decl.recordParams) {
        if (!cls.props.has(p.name)) cls.props.set(p.name, { name: p.name, valType: p.type, get: true, set: true, auto: true, isStatic: false, cls: cls, line: p.line, initOnly: true, mods: new Set() });
      }
    }
    return cls;
  }

  function linkClass(cls, S0) {
    const decl = cls.decl;
    for (const b of decl.bases) {
      const name = b.name;
      const bc = S0.classes.get(name) || cls.outer && cls.outer.nested.get(name) || CS.exClasses[name];
      if (bc) {
        if (bc.isInterface) cls.interfaces.push(bc);
        else if (!cls.base) cls.base = bc;
        else throw CS.csErr(cls.file, b.line || decl.line, b.col || decl.col, 'CS1721', 'Die Klasse "' + cls.name + '" kann nicht mehrere Basisklassen aufweisen');
        if (bc.isStruct || bc.isEnum) { if (!cls.isInterface) throw CS.csErr(cls.file, b.line || decl.line, b.col || decl.col, 'CS0509', '"' + cls.name + '": Von dem versiegelten Typ "' + bc.name + '" kann nicht geerbt werden'); }
      } else {
        // eingebaute Schnittstellen (IComparable<T>, IEnumerable<T>, IDisposable ...)
        if (/^I[A-Z]/.test(name)) { const ic = CS.lib.builtinInterface(name); cls.interfaces.push(ic); }
        else if (cls.kind === 'class' && !cls.base && CS.lib.knownBaseClass(name)) { /* ignoriert */ }
        else throw CS.csErr(cls.file, b.line || decl.line, b.col || decl.col, 'CS0246', 'Der Typ- oder Namespacename "' + name + '" wurde nicht gefunden (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
      }
    }
    if (cls.isRecord && !cls.base) { /* keine Basis */ }
    cls.isExc = !!(cls.base && CS.isExceptionClass(cls.base));
    if (cls.isExc) cls.defaultMsg = 'Exception of type \'' + cls.name + '\' was thrown.';
  }
  CS.isExceptionClass = function (c) { for (; c; c = c.base) if (c.isExc) return true; return false; };

  function* evalConst(expr, scope) {
    return yield* ev(expr, scope);
  }

  function* initEnum(cls) {
    const frame = new Frame(cls, null, cls.name, cls.file);
    const scope = new Scope(null, frame);
    let next = 0;
    for (const m of cls.enumDecl) {
      let v = next;
      if (m.value) {
        v = yield* evalConst(m.value, scope);
        if (v instanceof CEnumVal) v = v.value;
        v = Number(CS.toNumber(v));
      }
      const e = new CEnumVal(cls, m.name, v);
      cls.enumMembers.set(m.name, e);
      next = v + 1;
    }
  }

  CS.prepare = function (files, startName) {
    const errors = [];
    const units = [];
    for (const f of files) {
      if (!/\.cs$/i.test(f.name)) continue;
      try {
        const u = CS.parse(f.content, f.name);
        u.file = f.name;
        units.push(u);
      } catch (e) {
        if (e instanceof KON.LangError) errors.push(e); else throw e;
      }
    }
    if (errors.length) return { errors: errors };
    if (!units.length) {
      return { errors: [new KON.LangError({ phase: 'compile', lang: 'csharp', file: startName || '', line: 0, col: 0, code: 'CS5001', name: 'CS5001', message: 'Keine C#-Datei zum Ausführen gefunden.' })] };
    }
    const S0 = { classes: new Map(), allClasses: [], typeParamsAll: new Set(), delegates: new Set(), namespaceOf: new Map(), anonClass: null, ext: [], staticUsings: [] };
    for (const u of units) for (const us of u.usings) if (us.isStatic) S0.staticUsings.push(us.name.split('.').pop());
    for (const [k, v] of Object.entries(CS.plainClasses)) S0.classes.set(k, v);
    S0.anonClass = new CClass('<>f__AnonymousType', 'class'); S0.anonClass.fullName = '<>f__AnonymousType0`1';
    for (const [k, v] of Object.entries(CS.exClasses)) S0.classes.set(k, v);
    try {
      for (const u of units) for (const t of u.types) { if (t.type === 'Delegate') S0.delegates.add(t.name); else declareType(t, null, u.file, S0); }
      for (const c of S0.allClasses) linkClass(c, S0);
      // Vererbungszyklen
      for (const c of S0.allClasses) { let n = 0; for (let b = c.base; b; b = b.base) if (b === c || ++n > 100) throw CS.csErr(c.file, c.decl.line, c.decl.col, 'CS0146', 'Zirkuläre Basisklassenabhängigkeit mit "' + c.name + '"'); }
    } catch (e) {
      if (e instanceof KON.LangError) return { errors: [e] };
      throw e;
    }
    // Einstiegspunkt: Startdatei bevorzugen
    const cands = [];
    for (const c of S0.allClasses) { const l = c.methods.get('Main'); if (l) for (const m of l) if (m.isStatic) cands.push(m); }
    const startUnit = units.find((u) => u.file === startName);
    let topUnit = null, mainMethod = null;
    if (startUnit && startUnit.stmts.length) topUnit = startUnit;
    else if (cands.some((m) => m.cls.file === startName)) mainMethod = cands.find((m) => m.cls.file === startName);
    else if (cands.length) mainMethod = cands.find((m) => m.cls.name === 'Program') || cands[0];
    else topUnit = units.find((u) => u.stmts.length) || null;
    const topStmts = topUnit ? topUnit.stmts.map((s) => ({ stmt: s, file: topUnit.file })) : [];
    if (!topUnit && !mainMethod) {
      const ee = new KON.LangError({ phase: 'compile', lang: 'csharp', file: units[0].file, line: 1, col: 1, code: 'CS5001', name: 'CS5001', message: 'Das Programm enthält keine statische Main-Methode, die für einen Einstiegspunkt geeignet ist' });
      return { errors: [ee] };
    }
    if (CS.check) {
      const errs = CS.check(units, S0, topStmts);
      if (errs && errs.length) return { errors: errs };
    }
    return { run: function* (io) { return yield* runProgram(S0, files, io, mainMethod, topStmts, units); } };
  };

  function* printUnhandled(e, files, io) {
    const obj = e.obj;
    let name = obj.cls.fullName && obj.cls.builtin ? obj.cls.fullName : obj.cls.name;
    for (let c = obj.cls; c && !c.builtin; c = c.base) { /* benutzerdefiniert: nur Name */ }
    const msg = obj.f.get('Message');
    let text = 'Unbehandelte Ausnahme: ' + name + ': ' + (msg === null || msg === undefined ? '' : msg);
    io.writeErr(text + '\n');
    const inner = obj.f.get('InnerException');
    if (inner instanceof CObject) {
      io.writeErr(' ---> ' + (inner.cls.builtin ? inner.cls.fullName : inner.cls.name) + ': ' + inner.f.get('Message') + '\n');
    }
    // Stapelspur (innerster Frame zuerst)
    const tb = e.tb.slice().reverse();
    for (const f of tb) {
      io.writeErr('   bei ' + f.name + ' in ' + f.file + ': Zeile ' + f.line + '\n', { file: f.file, line: f.line, col: 1 });
    }
  }
  CS.printUnhandled = printUnhandled;

  function* runProgram(S0, files, io, mainMethod, topStmts, units) {
    S = Object.assign(S0, { files: files, io: io, frames: [], excStack: [], limit: 6000, rndSeed: null, ticks: 0 });
    CS.lib.reset && CS.lib.reset();
    try {
      // Aufzählungen und statische Initialisierung
      for (const c of S.allClasses) if (c.isEnum && c.enumMembers.size === 0) yield* initEnum(c);
      let ret = 0;
      if (mainMethod) {
        yield* ensureStatics(mainMethod.cls);
        const ps = mainMethod.params;
        const args = ps.length ? [new CArray({ k: 'name', name: 'string', args: [] }, [])] : [];
        ret = yield* invoke(mainMethod, null, args, null, null);
      } else {
        const progCls = new CClass('Program', 'class'); progCls.file = topStmts[0].file;
        const frame = new Frame(progCls, null, 'Program.<Main>$()', topStmts[0].file);
        const scope = new Scope(null, frame);
        scope.declare('args', new CArray({ k: 'name', name: 'string', args: [] }, []), null);
        S.frames.push(frame);
        for (const c of S.allClasses) yield* ensureStatics(c);
        const lfs = topStmts.filter((t) => t.stmt.type === 'LocalFunc');
        for (const t of lfs) { const f = new CLambda(t.stmt.params, t.stmt.body || t.stmt.expr, scope, scope.frame); f.name = t.stmt.name; scope.declare(t.stmt.name, f, null); }
        for (const t of topStmts) {
          frame.file = t.file;
          const sig = yield* exec(t.stmt, scope);
          if (sig instanceof Ret) { ret = sig.v; break; }
        }
      }
      return typeof ret === 'number' ? ret : 0;
    } catch (e0) {
      const e = normalizeError(e0);
      if (e instanceof ExitSignal) return e.code;
      if (e instanceof CsThrow) { yield* printUnhandled(e, files, io); return e.fatal ? 134 : 134; }
      if (e instanceof KON.LangError) {
        const f = e;
        io.writeErr(f.file + '(' + f.line + ',' + f.col + '): error ' + f.code + ': ' + f.message + '\n', { file: f.file, line: f.line, col: f.col });
        return 1;
      }
      throw e;
    } finally {
      S = null;
    }
  }

  CS.Scope = Scope; CS.Frame = Frame; CS.Ret = Ret; CS.RefSlot = RefSlot;
  CS.pickMethod = pickMethod; CS.findClass = findClass; CS.lookupSlot = lookupSlot;
  CS.rtCompileErr = rtCompileErr; CS.valueTypeName = valueTypeName; CS.getMemberValue = getMember;
  CS.callMember = callMember; CS.storeVal = storeVal; CS.cloneStruct = cloneStruct; CS.inferType = inferType;
  CS.findProp = findProp; CS.getIndexed = getIndexed; CS.setIndexed = setIndexed; CS.binaryOp = binaryOp; CS.relational = relational;
  CS.ensureStatics = ensureStatics; CS.matchPattern = matchPattern; CS.defaultOfType = defaultOfType;
})(typeof window !== 'undefined' ? window : globalThis);
