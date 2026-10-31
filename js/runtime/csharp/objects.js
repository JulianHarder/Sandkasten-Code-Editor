/* C#-Werte: Zahlentypen, Klassen, Ausnahmen, Formatierung */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};

  /* ---------- Werte ---------- */
  class Dbl { constructor(v) { this.v = v; } }
  class Num { constructor(v, k) { this.v = v; this.k = k; } } // float, decimal, byte, sbyte, short, ushort, uint, ulong
  class Chr { constructor(c) { this.c = c; } }
  const chrCache = [];
  function chr(code) {
    let c = chrCache[code];
    if (!c) { c = new Chr(code); chrCache[code] = c; }
    return c;
  }
  class CObject {
    constructor(cls) { this.cls = cls; this.f = new Map(); this.id = ++CS.idCounter; }
  }
  class CArray {
    constructor(et, a, dims) { this.et = et; this.a = a; this.dims = dims || null; this.id = ++CS.idCounter; }
  }
  class CList { constructor(a, et) { this.a = a; this.et = et || null; this.id = ++CS.idCounter; } }
  class CDict { constructor(kt, vt) { this.m = new Map(); this.kt = kt || null; this.vt = vt || null; this.id = ++CS.idCounter; this.sorted = false; } }
  class CSet { constructor(et) { this.m = new Map(); this.et = et || null; this.id = ++CS.idCounter; this.sorted = false; } }
  class CQueue { constructor() { this.a = []; this.id = ++CS.idCounter; } }
  class CStack { constructor() { this.a = []; this.id = ++CS.idCounter; } }
  class CSB { constructor(s) { this.s = s || ''; this.id = ++CS.idCounter; } }
  class CRandom { constructor(seed) { this.state = seed >>> 0; this.id = ++CS.idCounter; } }
  class CTuple { constructor(items, names, kvp) { this.items = items; this.names = names || null; this.kvp = !!kvp; } }
  class CEnumVal { constructor(cls, name, value) { this.cls = cls; this.name = name; this.value = value; } }
  class CLambda {
    constructor(params, body, scope, frame) { this.params = params; this.body = body; this.scope = scope; this.frame = frame; this.id = ++CS.idCounter; }
  }
  class CMulti { constructor(list) { this.list = list; } }
  class CMethodGroup { constructor(target, name, cls) { this.target = target; this.name = name; this.cls = cls || null; } }
  class CType { constructor(name, cls) { this.name = name; this.cls = cls || null; } }
  class CNamespace { constructor(name) { this.name = name; } }
  class CStatic { constructor(name) { this.name = name; } } // eingebaute statische Klasse (Console, Math ...)
  class CDateTime { constructor(ms, kind) { this.ms = ms; this.kind = kind || 'local'; } }
  class CTimeSpan { constructor(ms) { this.ms = ms; } }
  class CStopwatch { constructor() { this.start = 0; this.acc = 0; this.running = false; } }
  class CsThrow { constructor(obj) { this.obj = obj; this.tb = CS.captureTb ? CS.captureTb() : []; } }
  class ExitSignal { constructor(code) { this.code = code; } }
  class CRange { constructor(from, to) { this.from = from; this.to = to; } }
  class CIndexEnd { constructor(n) { this.n = n; } }

  class Slot { constructor(v, t) { this.v = v; this.t = t; } }

  class CClass {
    constructor(name, kind) {
      this.name = name; this.kind = kind || 'class';
      this.base = null; this.interfaces = [];
      this.methods = new Map(); this.props = new Map(); this.fields = []; this.sfields = new Map(); this.sfieldTypes = new Map();
      this.ctors = []; this.indexers = []; this.operators = new Map(); this.nested = new Map();
      this.enumMembers = null; this.decl = null; this.builtin = false; this.id = ++CS.idCounter;
      this.isAbstract = false; this.isStatic = false; this.isStruct = kind === 'struct' || kind === 'recordstruct';
      this.isRecord = kind === 'record' || kind === 'recordstruct'; this.isInterface = kind === 'interface'; this.isEnum = kind === 'enum';
      this.typeParams = []; this.fullName = name; this.staticInit = false; this.file = null; this.recordProps = null;
      this.staticCtor = null; this.outer = null; this.staticFieldInits = []; this.propInits = [];
    }
  }

  Object.assign(CS, { idCounter: 0, CMulti, Dbl, Num, Chr, chr, CObject, CArray, CList, CDict, CSet, CQueue, CStack, CSB, CRandom, CTuple, CEnumVal, CLambda,
    CMethodGroup, CType, CNamespace, CStatic, CDateTime, CTimeSpan, CStopwatch, CsThrow, ExitSignal, CRange, CIndexEnd, Slot, CClass });

  /* ---------- Ausnahmen ---------- */
  CS.exClasses = {};
  const EX = [
    ['Exception', null, 'System', 'Exception of type \'System.Exception\' was thrown.'],
    ['SystemException', 'Exception', 'System', 'Systemfehler'],
    ['ApplicationException', 'Exception', 'System', 'Anwendungsfehler'],
    ['ArgumentException', 'SystemException', 'System', 'Der Wert liegt außerhalb des erwarteten Bereichs.'],
    ['ArgumentNullException', 'ArgumentException', 'System', 'Der Wert darf nicht NULL sein.'],
    ['ArgumentOutOfRangeException', 'ArgumentException', 'System', 'Der angegebene Wert liegt außerhalb des gültigen Bereichs.'],
    ['ArithmeticException', 'SystemException', 'System', 'Fehler bei einem arithmetischen Vorgang.'],
    ['DivideByZeroException', 'ArithmeticException', 'System', 'Es wurde versucht, durch 0 zu teilen.'],
    ['OverflowException', 'ArithmeticException', 'System', 'Der arithmetische Vorgang hat einen Überlauf verursacht.'],
    ['FormatException', 'SystemException', 'System', 'Das Format der Eingabezeichenfolge ist ungültig.'],
    ['IndexOutOfRangeException', 'SystemException', 'System', 'Der Index war außerhalb des Arraybereichs.'],
    ['InvalidCastException', 'SystemException', 'System', 'Das angegebene Cast ist ungültig.'],
    ['InvalidOperationException', 'SystemException', 'System', 'Der Vorgang ist ungültig.'],
    ['NotSupportedException', 'SystemException', 'System', 'Der angegebene Member wird nicht unterstützt.'],
    ['NotImplementedException', 'SystemException', 'System', 'Die Methode oder der Vorgang ist nicht implementiert.'],
    ['NullReferenceException', 'SystemException', 'System', 'Der Objektverweis wurde nicht auf eine Objektinstanz festgelegt.'],
    ['OutOfMemoryException', 'SystemException', 'System', 'Nicht genügend Arbeitsspeicher.'],
    ['StackOverflowException', 'SystemException', 'System', 'Stapelüberlauf.'],
    ['TimeoutException', 'SystemException', 'System', 'Das Zeitlimit für den Vorgang wurde überschritten.'],
    ['ObjectDisposedException', 'InvalidOperationException', 'System', 'Auf das verworfene Objekt kann nicht zugegriffen werden.'],
    ['KeyNotFoundException', 'SystemException', 'System.Collections.Generic', 'Der angegebene Schlüssel war nicht im Wörterbuch vorhanden.'],
    ['IOException', 'SystemException', 'System.IO', 'Fehler bei der Ein-/Ausgabe.'],
    ['FileNotFoundException', 'IOException', 'System.IO', 'Die angegebene Datei wurde nicht gefunden.'],
    ['DirectoryNotFoundException', 'IOException', 'System.IO', 'Das angegebene Verzeichnis wurde nicht gefunden.'],
    ['UnauthorizedAccessException', 'SystemException', 'System', 'Der Zugriff wurde verweigert.']
  ];
  for (const [name, base, ns, msg] of EX) {
    const c = new CClass(name, 'class');
    c.base = base ? CS.exClasses[base] : null;
    c.builtin = true; c.isExc = true; c.defaultMsg = msg; c.fullName = ns + '.' + name;
    CS.exClasses[name] = c;
  }

  /* Einfache eingebaute Basisklassen, von denen Benutzerklassen erben dürfen */
  CS.plainClasses = {};
  for (const n of ['EventArgs']) { const c = new CClass(n, 'class'); c.builtin = true; c.fullName = 'System.' + n; CS.plainClasses[n] = c; }

  CS.isSubclass = function (cls, target) {
    for (let c = cls; c; c = c.base) {
      if (c === target) return true;
      if (c.interfaces.length) for (const i of c.interfaces) if (i === target || (i instanceof CClass && CS.isSubclass(i, target))) return true;
    }
    return false;
  };

  CS.makeExc = function (name, msg) {
    const cls = typeof name === 'string' ? CS.exClasses[name] : name;
    const o = new CObject(cls);
    o.f.set('Message', msg === undefined || msg === null ? cls.defaultMsg : msg);
    o.f.set('InnerException', null);
    return o;
  };
  CS.throwErr = function (name, msg) { throw new CsThrow(CS.makeExc(name, msg)); };

  /* ---------- Zahlentypen ---------- */
  const INT_KINDS = { int: 1, uint: 1, long: 1, ulong: 1, byte: 1, sbyte: 1, short: 1, ushort: 1 };
  CS.RANGE = {
    byte: [0, 255], sbyte: [-128, 127], short: [-32768, 32767], ushort: [0, 65535], int: [-2147483648, 2147483647], uint: [0, 4294967295],
    long: [-9223372036854775808n, 9223372036854775807n], ulong: [0n, 18446744073709551615n]
  };

  CS.kindOf = function (v) {
    switch (typeof v) {
      case 'number': return 'int';
      case 'bigint': return 'long';
    }
    if (v instanceof Dbl) return 'double';
    if (v instanceof Num) return v.k;
    if (v instanceof Chr) return 'char';
    return null;
  };
  const isNumeric = (v) => typeof v === 'number' || typeof v === 'bigint' || v instanceof Dbl || v instanceof Num;
  CS.isNumeric = isNumeric;

  /* Zahl als JS-number (für alles außer long/ulong) */
  CS.toNumber = function (v) {
    if (typeof v === 'number') return v;
    if (v instanceof Dbl) return v.v;
    if (v instanceof Num) return Number(v.v);
    if (typeof v === 'bigint') return Number(v);
    if (v instanceof Chr) return v.c;
    return NaN;
  };
  CS.toBigInt = function (v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(v);
    if (v instanceof Num) return typeof v.v === 'bigint' ? v.v : BigInt(Math.trunc(v.v));
    if (v instanceof Dbl) return BigInt(Math.trunc(v.v));
    if (v instanceof Chr) return BigInt(v.c);
    return 0n;
  };

  /* Wert aus Rohzahl und Typ erzeugen (mit Umbruch bei Überlauf) */
  CS.mk = function (kind, x) {
    switch (kind) {
      case 'int': return x | 0;
      case 'long': return BigInt.asIntN(64, typeof x === 'bigint' ? x : BigInt(Math.trunc(x)));
      case 'double': return new Dbl(x);
      case 'float': return new Num(Math.fround(x), 'float');
      case 'decimal': return new Num(x, 'decimal');
      case 'uint': return new Num(x >>> 0, 'uint');
      case 'ulong': return new Num(BigInt.asUintN(64, typeof x === 'bigint' ? x : BigInt(Math.trunc(x))), 'ulong');
      case 'byte': return new Num(x & 255, 'byte');
      case 'sbyte': return new Num((x << 24) >> 24, 'sbyte');
      case 'short': return new Num((x << 16) >> 16, 'short');
      case 'ushort': return new Num(x & 65535, 'ushort');
      case 'char': return chr(x & 65535);
    }
    return x;
  };

  const RANK = { decimal: 7, double: 6, float: 5, ulong: 4, long: 3, uint: 2, int: 1 };
  CS.promote = function (ka, kb) {
    if (ka === 'char') ka = 'int'; if (kb === 'char') kb = 'int';
    if (ka === 'decimal' || kb === 'decimal') return 'decimal';
    if (ka === 'double' || kb === 'double') return 'double';
    if (ka === 'float' || kb === 'float') return 'float';
    if (ka === 'ulong' || kb === 'ulong') return 'ulong';
    if (ka === 'long' || kb === 'long') return 'long';
    if (ka === 'uint' || kb === 'uint') return (ka === 'uint' && kb === 'uint') ? 'uint' : ((ka === 'uint' ? kb : ka) === 'int' || (ka === 'uint' ? kb : ka) === 'short' || (ka === 'uint' ? kb : ka) === 'sbyte' ? 'long' : 'uint');
    return 'int';
  };

  /* ---------- Darstellung von Zahlen ---------- */
  CS.culture = { dec: ',', grp: '.', cur: '€', name: 'de-DE' };
  CS.setCulture = function (name) {
    if (name === 'en') CS.culture = { dec: '.', grp: ',', cur: '¤', name: 'en-US' };
    else CS.culture = { dec: ',', grp: '.', cur: '€', name: 'de-DE' };
  };

  function sciDigits(x) {
    const exp = x.toExponential();
    const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(exp);
    return { sign: m[1], digits: m[2] + (m[3] || ''), e: parseInt(m[4], 10) };
  }
  function layoutShortest(sign, digits, e, sciFrom) {
    if (e >= sciFrom || e < -5) {
      const es = (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
      return sign + digits[0] + (digits.length > 1 ? CS.culture.dec + digits.slice(1) : '') + 'E' + es;
    }
    if (e >= 0) {
      if (digits.length <= e + 1) return sign + digits + '0'.repeat(e + 1 - digits.length);
      return sign + digits.slice(0, e + 1) + CS.culture.dec + digits.slice(e + 1);
    }
    return sign + '0' + CS.culture.dec + '0'.repeat(-e - 1) + digits;
  }
  CS.dblToStr = function (x) {
    if (x !== x) return 'NaN';
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    if (x === 0) return Object.is(x, -0) ? '-0' : '0';
    const s = sciDigits(x);
    return layoutShortest(s.sign, s.digits, s.e, 15);
  };
  CS.fltToStr = function (x) {
    if (x !== x) return 'NaN';
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    if (x === 0) return Object.is(x, -0) ? '-0' : '0';
    let str = '';
    for (let p = 1; p <= 9; p++) {
      str = x.toPrecision(p);
      if (Math.fround(parseFloat(str)) === x) break;
    }
    const s = sciDigits(parseFloat(str));
    return layoutShortest(s.sign, s.digits, s.e, 15);
  };
  CS.decToStr = function (x, sc) {
    if (sc > 0 && Math.abs(x) < 1e15) return x.toFixed(Math.min(sc, 28)).replace('.', CS.culture.dec);
    if (x === 0) return '0';
    let s = String(parseFloat(x.toPrecision(15)));
    if (/e/.test(s)) s = x.toFixed(10).replace(/\.?0+$/, '');
    return s.replace('.', CS.culture.dec);
  };

  function groupInt(str) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, CS.culture.grp);
  }

  /* toFixed mit "weg von Null"-Rundung (wie .NET Core 3+) */
  function toFixedAway(ax, d) {
    if (ax >= 1e21) return BigInt(ax).toString() + (d ? '.' + '0'.repeat(d) : '');
    return ax.toFixed(Math.min(d, 100));
  }

  /* Standard- und benutzerdefinierte Formate: x ist number oder bigint */
  CS.formatNumber = function (x, fmt, kind) {
    const isBig = typeof x === 'bigint';
    const isIntKind = kind && INT_KINDS[kind];
    const m = /^([A-Za-z])(\d*)$/.exec(fmt);
    if (m) {
      const spec = m[1], hasPrec = m[2] !== '';
      const prec = hasPrec ? parseInt(m[2], 10) : -1;
      const up = spec === spec.toUpperCase();
      const neg = isBig ? x < 0n : (x < 0 || Object.is(x, -0));
      const ax = isBig ? (neg ? -x : x) : Math.abs(x);
      const sign = neg ? '-' : '';
      const nx = isBig ? Number(ax) : ax;
      switch (spec.toUpperCase()) {
        case 'F': {
          if (!isFinite(nx)) return CS.dblToStr(x);
          const d = prec < 0 ? 2 : prec;
          let s = isBig ? ax.toString() + (d ? '.' + '0'.repeat(d) : '') : toFixedAway(ax, d);
          if (neg && /^[0.]*$/.test(s)) return s.replace('.', CS.culture.dec);
          return sign + s.replace('.', CS.culture.dec);
        }
        case 'N': {
          if (!isFinite(nx)) return CS.dblToStr(x);
          const d = prec < 0 ? 2 : prec;
          const s = isBig ? ax.toString() + (d ? '.' + '0'.repeat(d) : '') : toFixedAway(ax, d);
          const parts = s.split('.');
          const out = groupInt(parts[0]) + (parts[1] ? CS.culture.dec + parts[1] : '');
          return (neg && !/^[0.,]*$/.test(out) ? '-' : '') + out;
        }
        case 'D': {
          if (!(isBig || isIntKind || Number.isInteger(x))) throw new CsThrow(CS.makeExc('FormatException', 'Das Format der Eingabezeichenfolge ist ungültig.'));
          let s = (isBig ? ax : BigInt(Math.trunc(ax))).toString();
          if (prec > s.length) s = '0'.repeat(prec - s.length) + s;
          return sign + s;
        }
        case 'X': {
          let v = isBig ? x : BigInt(Math.trunc(x));
          if (v < 0n) v = BigInt.asUintN(kind === 'long' ? 64 : 32, v);
          let s = v.toString(16);
          if (up) s = s.toUpperCase();
          if (prec > s.length) s = '0'.repeat(prec - s.length) + s;
          return s;
        }
        case 'E': {
          const p = prec < 0 ? 6 : prec;
          let s = nx.toExponential(p);
          s = s.replace(/e([+-])(\d+)$/, (mm, sg, dg) => 'E' + sg + dg.padStart(3, '0'));
          if (!up) s = s.replace('E', 'e');
          return sign + s.replace('.', CS.culture.dec);
        }
        case 'G': {
          if (prec <= 0) {
            if (kind === 'float') return CS.fltToStr(x);
            if (kind === 'decimal') return CS.decToStr(x);
            return isBig ? x.toString() : CS.dblToStr(x);
          }
          if (nx === 0) return '0';
          const e = parseInt(nx.toExponential(prec - 1).split('e')[1], 10);
          if (e >= prec || e < -5) {
            let s = nx.toExponential(prec - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d+)$/, (mm, sg, dg) => 'E' + sg + dg.padStart(2, '0'));
            return sign + s.replace('.', CS.culture.dec);
          }
          let s = nx.toPrecision(prec);
          if (s.indexOf('.') >= 0 && !/e/.test(s)) s = s.replace(/\.?0+$/, '');
          return sign + s.replace('.', CS.culture.dec);
        }
        case 'P': {
          const d = prec < 0 ? 2 : prec;
          const s = toFixedAway(nx * 100, d);
          const parts = s.split('.');
          return sign + groupInt(parts[0]) + (parts[1] ? CS.culture.dec + parts[1] : '') + (CS.culture.name === 'de-DE' ? ' %' : '%');
        }
        case 'C': {
          const d = prec < 0 ? 2 : prec;
          const s = toFixedAway(nx, d);
          const parts = s.split('.');
          const body = groupInt(parts[0]) + (parts[1] ? CS.culture.dec + parts[1] : '');
          return CS.culture.name === 'de-DE' ? sign + body + ' ' + CS.culture.cur : sign + CS.culture.cur + body;
        }
        case 'R': return isBig ? x.toString() : CS.dblToStr(x);
      }
      throw new CsThrow(CS.makeExc('FormatException', 'Das Format "' + fmt + '" wird nicht unterstützt.'));
    }
    return customNumberFormat(isBig ? Number(x) : x, fmt);
  };

  function customNumberFormat(x, fmt) {
    // Abschnitte positiv;negativ;null
    const secs = splitSections(fmt);
    let f = secs[0];
    let neg = x < 0 || Object.is(x, -0);
    if (secs.length > 1 && neg) { f = secs[1]; neg = false; x = Math.abs(x); }
    else if (secs.length > 2 && x === 0) f = secs[2];
    const ax = Math.abs(x);
    // Literale und Platzhalter trennen
    let pct = 0;
    const tokens = [];
    for (let i = 0; i < f.length; i++) {
      const c = f[i];
      if (c === "'" || c === '"') { const j = f.indexOf(c, i + 1); tokens.push({ lit: f.slice(i + 1, j < 0 ? f.length : j) }); i = j < 0 ? f.length : j; }
      else if (c === '\\') { tokens.push({ lit: f[i + 1] || '' }); i++; }
      else if (c === '%') { pct++; tokens.push({ lit: '%' }); }
      else tokens.push({ ch: c });
    }
    let val = ax * Math.pow(100, pct ? 1 : 0) / (pct ? 1 : 1);
    if (pct) val = ax * Math.pow(100, 1);
    const chars = tokens.filter((t) => t.ch).map((t) => t.ch).join('');
    const dotIdx = chars.indexOf('.');
    const intPat = dotIdx < 0 ? chars : chars.slice(0, dotIdx);
    const fracPat = dotIdx < 0 ? '' : chars.slice(dotIdx + 1);
    const group = /,/.test(intPat) && /[0#]/.test(intPat);
    let scaleDown = 0;
    // Komma direkt vor dem Punkt/Ende teilt durch 1000
    const trailing = /,+$/.exec(intPat.replace(/[^0#,]/g, ''));
    if (trailing && /[0#]/.test(intPat)) scaleDown = trailing[0].length;
    val = val / Math.pow(1000, scaleDown);
    const intDigits = intPat.replace(/[^0#]/g, '');
    const fracDigits = fracPat.replace(/[^0#]/g, '');
    let s = toFixedAway(val, fracDigits.length);
    let [ip, fp = ''] = s.split('.');
    if (ip === '0' && !/0/.test(intDigits)) ip = '';
    const minInt = (intDigits.match(/0/g) || []).length;
    ip = ip.padStart(minInt, '0');
    // überzählige Ziffern: links belassen; zu wenige: nicht auffüllen (außer 0)
    if (group) ip = groupInt(ip);
    // Nachkomma: überflüssige Nullen bei # entfernen
    let fracOut = '';
    for (let i = 0; i < fracDigits.length; i++) {
      const ch = fp[i] || '0';
      fracOut += ch;
    }
    for (let i = fracDigits.length - 1; i >= 0; i--) {
      if (fracDigits[i] === '#' && fracOut[fracOut.length - 1] === '0' && fracOut.length === i + 1) fracOut = fracOut.slice(0, -1);
      else break;
    }
    const numStr = ip + (fracOut ? CS.culture.dec + fracOut : '');
    // Platzhalter im Muster durch die Zahl ersetzen
    let out = '', placed = false;
    for (const t of tokens) {
      if (t.lit !== undefined) out += t.lit;
      else if (/[0#.,]/.test(t.ch)) { if (!placed) { out += numStr; placed = true; } }
      else out += t.ch;
    }
    if (!placed) return (neg && x !== 0 ? '-' : '') + out;
    return (neg && /[1-9]/.test(numStr) ? '-' : '') + out;
  }
  function splitSections(fmt) {
    const out = []; let cur = '', q = null;
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      if (c === ';') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  /* ---------- Datum ---------- */
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  CS.MONTHS = MONTHS; CS.DAYS = DAYS;
  CS.formatDate = function (d, fmt) {
    const dt = new Date(d.ms);
    const p2 = (n) => String(n).padStart(2, '0');
    if (!fmt || fmt === 'G') return p2(dt.getDate()) + '.' + p2(dt.getMonth() + 1) + '.' + dt.getFullYear() + ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes()) + ':' + p2(dt.getSeconds());
    if (fmt === 'd') return p2(dt.getDate()) + '.' + p2(dt.getMonth() + 1) + '.' + dt.getFullYear();
    if (fmt === 'D') return DAYS[dt.getDay()] + ', ' + dt.getDate() + '. ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear();
    if (fmt === 't') return p2(dt.getHours()) + ':' + p2(dt.getMinutes());
    if (fmt === 'T') return p2(dt.getHours()) + ':' + p2(dt.getMinutes()) + ':' + p2(dt.getSeconds());
    if (fmt === 'f') return DAYS[dt.getDay()] + ', ' + dt.getDate() + '. ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear() + ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes());
    if (fmt === 'o' || fmt === 'O' || fmt === 's') return dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate()) + 'T' + p2(dt.getHours()) + ':' + p2(dt.getMinutes()) + ':' + p2(dt.getSeconds()) + (fmt === 's' ? '' : '.' + String(dt.getMilliseconds()).padStart(3, '0') + '0000');
    if (fmt === 'M' || fmt === 'm') return dt.getDate() + '. ' + MONTHS[dt.getMonth()];
    if (fmt === 'Y' || fmt === 'y') return MONTHS[dt.getMonth()] + ' ' + dt.getFullYear();
    return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|fff|ff|f|tt|t|'[^']*'|\\./g, (tok) => {
      switch (tok) {
        case 'yyyy': return String(dt.getFullYear()).padStart(4, '0');
        case 'yy': return p2(dt.getFullYear() % 100);
        case 'MMMM': return MONTHS[dt.getMonth()];
        case 'MMM': return MONTHS[dt.getMonth()].slice(0, 3);
        case 'MM': return p2(dt.getMonth() + 1);
        case 'M': return String(dt.getMonth() + 1);
        case 'dddd': return DAYS[dt.getDay()];
        case 'ddd': return DAYS[dt.getDay()].slice(0, 2);
        case 'dd': return p2(dt.getDate());
        case 'd': return String(dt.getDate());
        case 'HH': return p2(dt.getHours());
        case 'H': return String(dt.getHours());
        case 'hh': return p2(dt.getHours() % 12 || 12);
        case 'h': return String(dt.getHours() % 12 || 12);
        case 'mm': return p2(dt.getMinutes());
        case 'm': return String(dt.getMinutes());
        case 'ss': return p2(dt.getSeconds());
        case 's': return String(dt.getSeconds());
        case 'fff': return String(dt.getMilliseconds()).padStart(3, '0');
        case 'ff': return String(dt.getMilliseconds()).padStart(3, '0').slice(0, 2);
        case 'f': return String(dt.getMilliseconds()).padStart(3, '0').slice(0, 1);
        case 'tt': return dt.getHours() < 12 ? 'AM' : 'PM';
        case 't': return dt.getHours() < 12 ? 'A' : 'P';
      }
      if (tok[0] === "'") return tok.slice(1, -1);
      if (tok[0] === '\\') return tok[1];
      return tok;
    });
  };
  CS.timeSpanToStr = function (t) {
    let ms = t.ms; const neg = ms < 0; ms = Math.abs(ms);
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000); ms -= s * 1000;
    const p2 = (n) => String(n).padStart(2, '0');
    return (neg ? '-' : '') + (d ? d + '.' : '') + p2(h) + ':' + p2(m) + ':' + p2(s) + (ms ? '.' + String(Math.round(ms)).padStart(3, '0') + '0000' : '');
  };

  /* ---------- Typen: Standardwerte und Namen ---------- */
  CS.PRIM_NAMES = {
    int: 'int', Int32: 'int', long: 'long', Int64: 'long', short: 'short', Int16: 'short', byte: 'byte', Byte: 'byte', sbyte: 'sbyte', SByte: 'sbyte',
    uint: 'uint', UInt32: 'uint', ulong: 'ulong', UInt64: 'ulong', ushort: 'ushort', UInt16: 'ushort', double: 'double', Double: 'double',
    float: 'float', Single: 'float', decimal: 'decimal', Decimal: 'decimal', char: 'char', Char: 'char', bool: 'bool', Boolean: 'bool',
    string: 'string', String: 'string', object: 'object', Object: 'object'
  };
  CS.defaultFor = function (kind) {
    switch (kind) {
      case 'int': return 0;
      case 'long': return 0n;
      case 'double': return new Dbl(0);
      case 'float': return new Num(0, 'float');
      case 'decimal': return new Num(0, 'decimal');
      case 'uint': case 'byte': case 'sbyte': case 'short': case 'ushort': return new Num(0, kind);
      case 'ulong': return new Num(0n, 'ulong');
      case 'char': return chr(0);
      case 'bool': return false;
    }
    return null;
  };
  /* Anzeigename des .NET-Typs */
  CS.NET_NAMES = {
    int: 'Int32', long: 'Int64', short: 'Int16', byte: 'Byte', sbyte: 'SByte', uint: 'UInt32', ulong: 'UInt64', ushort: 'UInt16',
    double: 'Double', float: 'Single', decimal: 'Decimal', char: 'Char', bool: 'Boolean', string: 'String', object: 'Object'
  };
})(typeof window !== 'undefined' ? window : globalThis);
