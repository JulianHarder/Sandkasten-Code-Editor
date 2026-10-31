/* C#-Klassenbibliothek: Console, Math, Strings, Collections, LINQ, Datum ... */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};
  const { Dbl, Num, Chr, chr, CObject, CArray, CList, CDict, CSet, CQueue, CStack, CSB, CRandom, CTuple, CEnumVal, CLambda, CMethodGroup, CType,
    CNamespace, CStatic, CDateTime, CTimeSpan, CStopwatch, CsThrow, ExitSignal, CRange, CIndexEnd, Slot, CClass } = CS;
  const lib = CS.lib = {};

  const throwErr = (n, m) => { throw new CsThrow(CS.makeExc(n, m)); };
  const callFn = (f, args, scope) => CS.callFn(f, args, scope);
  const isRef = (v) => v instanceof Slot || v instanceof CS.RefSlot;
  const isFn = (v) => v instanceof CLambda || v instanceof CMethodGroup;
  const T = (name, args) => ({ k: 'name', name: name, args: args || [] });
  const num = (v) => CS.toNumber(v);
  const int = (v) => (typeof v === 'number' ? v : Math.trunc(num(v)));
  const D = (x) => new Dbl(x);
  const bool = (v) => v === true;

  function nullArg(name) { throwErr('ArgumentNullException', 'Der Wert darf nicht NULL sein. (Parameter \'' + name + '\')'); }

  /* ---------- Zeichenfolgen-Darstellung ---------- */
  const NET_NAMES = CS.NET_NAMES;
  function netName(t) {
    if (!t) return 'Object';
    if (t.k === 'array') return netName(t.elem) + '[]';
    if (t.k === 'null') return 'Nullable`1[' + netName(t.inner) + ']';
    if (t.k === 'tuple') return 'System.ValueTuple`' + t.elems.length;
    const kind = CS.PRIM_NAMES[t.name];
    if (kind) return 'System.' + NET_NAMES[kind];
    return t.name;
  }
  lib.netTypeName = function (v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return 'System.String';
    if (typeof v === 'boolean') return 'System.Boolean';
    const k = CS.kindOf(v);
    if (k) return 'System.' + NET_NAMES[k];
    if (v instanceof CObject) return v.cls.builtin ? v.cls.fullName : v.cls.name;
    if (v instanceof CList) return 'System.Collections.Generic.List`1[' + netName(v.et || T('object')) + ']';
    if (v instanceof CArray) return netName(v.et || T('object')) + '[]';
    if (v instanceof CDict) return 'System.Collections.Generic.Dictionary`2[' + netName(v.kt || T('object')) + ',' + netName(v.vt || T('object')) + ']';
    if (v instanceof CSet) return 'System.Collections.Generic.HashSet`1[' + netName(v.et || T('object')) + ']';
    if (v instanceof CQueue) return 'System.Collections.Generic.Queue`1[System.Object]';
    if (v instanceof CStack) return 'System.Collections.Generic.Stack`1[System.Object]';
    if (v instanceof CSB) return 'System.Text.StringBuilder';
    if (v instanceof CRandom) return 'System.Random';
    if (v instanceof CEnumVal) return v.cls.name;
    if (v instanceof CDateTime) return 'System.DateTime';
    if (v instanceof CTimeSpan) return 'System.TimeSpan';
    if (v instanceof CTuple) return 'System.ValueTuple`' + v.items.length;
    if (v instanceof CLambda) return 'System.Func';
    return 'System.Object';
  };
  const shortNet = (v) => lib.netTypeName(v).replace(/^.*\./, '').replace(/\[.*$/, (m) => m);

  function* toStr(v) {
    if (v === null || v === undefined) return '';
    switch (typeof v) {
      case 'string': return v;
      case 'number': return String(v);
      case 'boolean': return v ? 'True' : 'False';
      case 'bigint': return v.toString();
    }
    if (v instanceof Dbl) return CS.dblToStr(v.v);
    if (v instanceof Num) {
      if (v.k === 'float') return CS.fltToStr(v.v);
      if (v.k === 'decimal') return CS.decToStr(v.v, v.sc);
      return String(v.v);
    }
    if (v instanceof Chr) return String.fromCharCode(v.c);
    if (v instanceof CEnumVal) return enumToString(v);
    if (v instanceof CObject) {
      const ms = CS.findMethods(v.cls, 'ToString').filter((m) => m.params.length === 0);
      if (ms.length) {
        const r = yield* CS.invoke(ms[0], v, [], null, null);
        return r === null ? '' : r;
      }
      if (v.anon) {
        const parts = [];
        for (const [k, x] of v.f) parts.push(k + ' = ' + (yield* toStr(x)));
        return '{ ' + parts.join(', ') + ' }';
      }
      if (v.cls.isRecord && v.cls.recordProps) {
        const parts = [];
        for (const p of recordAllProps(v.cls)) parts.push(p + ' = ' + (yield* toStr(v.f.get(p))));
        return v.cls.name + ' { ' + parts.join(', ') + ' }';
      }
      if (CS.isExceptionObj(v)) {
        const m = v.f.get('Message');
        let s = lib.netTypeName(v) + (m ? ': ' + m : '');
        return s;
      }
      return lib.netTypeName(v);
    }
    if (v instanceof CSB) return v.s;
    if (v instanceof CTuple) {
      const parts = [];
      for (const x of v.items) parts.push(yield* toStr(x));
      return v.kvp ? '[' + parts.join(', ') + ']' : '(' + parts.join(', ') + ')';
    }
    if (v instanceof CDateTime) return CS.formatDate(v, '');
    if (v instanceof CTimeSpan) return CS.timeSpanToStr(v);
    if (v instanceof CType) return v.name;
    if (v instanceof CArray && v.et && v.et.k === 'name' && v.et.name === 'char' && false) return '';
    if (v instanceof CList || v instanceof CArray || v instanceof CDict || v instanceof CSet || v instanceof CQueue || v instanceof CStack || v instanceof CRandom) return lib.netTypeName(v);
    if (v instanceof CLambda || v instanceof CMethodGroup) return 'System.Func`1';
    if (v instanceof CClass) return v.name;
    return String(v);
  }
  lib.toStr = toStr;

  function recordAllProps(cls) {
    const out = [];
    if (cls.base && cls.base.recordProps) out.push(...recordAllProps(cls.base));
    for (const p of cls.recordProps || []) out.push(p.name);
    for (const [n, p] of cls.props) if (!p.isStatic && !out.includes(n) && p.cls === cls) out.push(n);
    return out;
  }

  function enumToString(v) {
    if (v.cls.enumMembers) {
      for (const m of v.cls.enumMembers.values()) if (m.value === v.value) return m.name;
      // Flags-Kombination
      const parts = [];
      let rest = v.value;
      const members = [...v.cls.enumMembers.values()].filter((m) => m.value !== 0).sort((a, b) => b.value - a.value);
      for (const m of members) if ((rest & m.value) === m.value && m.value > 0 && (m.value & (m.value - 1)) === 0) { parts.unshift(m.name); rest &= ~m.value; }
      if (parts.length && rest === 0) return parts.join(', ');
    }
    return v.name !== undefined && v.name !== null && !/^-?\d+$/.test(v.name) ? v.name : String(v.value);
  }

  lib.enumFromValue = function (cls, value) {
    for (const m of cls.enumMembers.values()) if (m.value === value) return m;
    return new CEnumVal(cls, String(value), value);
  };

  function* fmtValue(v, fmt) {
    if (v === null) return '';
    if (typeof v === 'number') return CS.formatNumber(v, fmt, 'int');
    if (typeof v === 'bigint') return CS.formatNumber(v, fmt, 'long');
    if (v instanceof Dbl) return CS.formatNumber(v.v, fmt, 'double');
    if (v instanceof Num) return CS.formatNumber(v.v, fmt, v.k);
    if (v instanceof CDateTime) return CS.formatDate(v, fmt);
    if (v instanceof CTimeSpan) return CS.timeSpanToStr(v);
    if (v instanceof CEnumVal) {
      if (/^[dD]$/.test(fmt)) return String(v.value);
      if (/^[xX]$/.test(fmt)) return v.value.toString(16).toUpperCase().padStart(8, '0');
      return enumToString(v);
    }
    if (v instanceof CObject) {
      const ms = CS.findMethods(v.cls, 'ToString').filter((m) => m.params.length === 1);
      if (ms.length) return yield* CS.invoke(ms[0], v, [fmt], null, null);
    }
    return yield* toStr(v);
  }
  lib.fmtValue = fmtValue;

  /* string.Format */
  function* formatString(fmt, args) {
    let out = '';
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c === '{') {
        if (fmt[i + 1] === '{') { out += '{'; i++; continue; }
        const end = fmt.indexOf('}', i);
        if (end < 0) throwErr('FormatException', 'Das Format der Eingabezeichenfolge ist ungültig.');
        const spec = fmt.slice(i + 1, end);
        const m = /^(\d+)(?:,(-?\d+))?(?::(.*))?$/s.exec(spec);
        if (!m) throwErr('FormatException', 'Das Format der Eingabezeichenfolge ist ungültig.');
        const idx = parseInt(m[1], 10);
        if (idx >= args.length) throwErr('FormatException', 'Der Index (nullbasiert) muss größer oder gleich 0 und kleiner als die Größe der Argumentliste sein.');
        let s = m[3] !== undefined ? yield* fmtValue(args[idx], m[3]) : yield* toStr(args[idx]);
        if (m[2]) { const w = parseInt(m[2], 10); s = w >= 0 ? s.padStart(w) : s.padEnd(-w); }
        out += s;
        i = end;
      } else if (c === '}') {
        if (fmt[i + 1] === '}') { out += '}'; i++; continue; }
        throwErr('FormatException', 'Das Format der Eingabezeichenfolge ist ungültig.');
      } else out += c;
    }
    return out;
  }
  lib.formatString = formatString;

  /* ---------- Gleichheit, Vergleich, Schlüssel ---------- */
  function* equals(a, b) {
    const p = CS.primEquals(a, b);
    if (p !== undefined) return p;
    if (a === null || b === null) return a === b;
    if (a instanceof CObject) {
      const ms = CS.findMethods(a.cls, 'Equals').filter((m) => m.params.length === 1);
      if (ms.length) return (yield* CS.invoke(ms[0], a, [b], null, null)) === true;
      if (a.cls.isRecord && b instanceof CObject && a.cls === b.cls) {
        for (const [k, v] of a.f) if (!(yield* equals(v, b.f.get(k)))) return false;
        return true;
      }
      if (a.anon && b instanceof CObject && b.anon) {
        if (a.f.size !== b.f.size) return false;
        for (const [k, v] of a.f) if (!(yield* equals(v, b.f.get(k)))) return false;
        return true;
      }
      if (a.cls.isStruct && b instanceof CObject && a.cls === b.cls) {
        for (const [k, v] of a.f) if (!(yield* equals(v, b.f.get(k)))) return false;
        return true;
      }
      return a === b;
    }
    if (a instanceof CTuple && b instanceof CTuple) {
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) if (!(yield* equals(a.items[i], b.items[i]))) return false;
      return true;
    }
    if (a instanceof CDateTime && b instanceof CDateTime) return a.ms === b.ms;
    if (a instanceof CTimeSpan && b instanceof CTimeSpan) return a.ms === b.ms;
    return a === b;
  }
  lib.equals = equals;

  function* keyOf(v) {
    if (v === null) return 'n';
    switch (typeof v) {
      case 'string': return 's' + v;
      case 'number': return 'i' + v;
      case 'boolean': return v ? 'bT' : 'bF';
      case 'bigint': return 'i' + v;
    }
    if (v instanceof Dbl) return Number.isInteger(v.v) ? 'd' + v.v : 'd' + v.v;
    if (v instanceof Num) return 'i' + v.v;
    if (v instanceof Chr) return 'c' + v.c;
    if (v instanceof CEnumVal) return 'e' + v.cls.id + ':' + v.value;
    if (v instanceof CTuple) {
      const parts = [];
      for (const x of v.items) parts.push(yield* keyOf(x));
      return 't(' + parts.join(',') + ')';
    }
    if (v instanceof CObject) {
      const ms = CS.findMethods(v.cls, 'GetHashCode').filter((m) => m.params.length === 0);
      if (ms.length) return 'h' + (yield* CS.invoke(ms[0], v, [], null, null));
      if (v.cls.isRecord || v.cls.isStruct || v.anon) {
        const parts = [];
        for (const [k, x] of v.f) parts.push(k + '=' + (yield* keyOf(x)));
        return 'r' + v.cls.id + '{' + parts.join(',') + '}';
      }
      return 'o' + v.id;
    }
    if (v instanceof CDateTime) return 'D' + v.ms;
    if (v && v.id) return 'o' + v.id;
    return 'x' + String(v);
  }
  lib.keyOf = keyOf;

  const collator = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('de') : null;
  function cmpStr(a, b, ordinal) {
    if (ordinal || !collator) return a < b ? -1 : a > b ? 1 : 0;
    return collator.compare(a, b);
  }

  /* Standardvergleich (IComparable) -> -1/0/1 */
  function* compareValues(a, b) {
    if (a === null) return b === null ? 0 : -1;
    if (b === null) return 1;
    if (typeof a === 'string' && typeof b === 'string') { const c = cmpStr(a, b); return c < 0 ? -1 : c > 0 ? 1 : 0; }
    if (CS.isNumeric(a) || a instanceof Chr) {
      if (b instanceof Chr && a instanceof Chr) return a.c - b.c < 0 ? -1 : a.c > b.c ? 1 : 0;
      const lt = CS.relational('<', a, b);
      if (lt === undefined) throwErr('ArgumentException', 'Das Objekt muss vom Typ ' + shortNet(a) + ' sein.');
      return lt ? -1 : CS.relational('>', a, b) ? 1 : 0;
    }
    if (typeof a === 'boolean') return a === b ? 0 : (a ? 1 : -1);
    if (a instanceof CEnumVal && b instanceof CEnumVal) return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    if (a instanceof CDateTime && b instanceof CDateTime) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
    if (a instanceof CTimeSpan && b instanceof CTimeSpan) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
    if (a instanceof CTuple && b instanceof CTuple) {
      for (let i = 0; i < a.items.length; i++) { const c = yield* compareValues(a.items[i], b.items[i]); if (c) return c; }
      return 0;
    }
    if (a instanceof CObject) {
      const ms = CS.findMethods(a.cls, 'CompareTo');
      if (ms.length) { const r = yield* CS.invoke(CS.pickMethod(ms, [b], null, null), a, [b], null, null); return r < 0 ? -1 : r > 0 ? 1 : 0; }
    }
    throwErr('InvalidOperationException', 'Fehler beim Vergleichen von zwei Elementen im Array. Mindestens ein Objekt muss "IComparable" implementieren.');
  }
  lib.compare = compareValues;

  /* Stabile Sortierung mit generatorbasiertem Vergleich */
  function* sortWith(arr, cmp) {
    let work = arr.slice();
    const n = work.length;
    for (let width = 1; width < n; width *= 2) {
      const out = [];
      for (let lo = 0; lo < n; lo += 2 * width) {
        const mid = Math.min(lo + width, n), hi = Math.min(lo + 2 * width, n);
        let i = lo, j = mid;
        while (i < mid && j < hi) {
          const c = yield* cmp(work[i], work[j]);
          if (c > 0) out.push(work[j++]); else out.push(work[i++]);
        }
        while (i < mid) out.push(work[i++]);
        while (j < hi) out.push(work[j++]);
      }
      work = out;
      yield KON.TICK;
    }
    return work;
  }

  /* Vergleichsfunktion aus Argument (Comparison / IComparer / null) */
  function comparerFrom(arg, scope) {
    if (!arg) return compareValues;
    if (isFn(arg)) return function* (a, b) { const r = yield* callFn(arg, [a, b], scope); return typeof r === 'number' ? r : Number(CS.toNumber(r)); };
    if (arg instanceof CObject) {
      return function* (a, b) { const r = yield* CS.callMember(arg, 'Compare', [a, b], null, scope, null); return r; };
    }
    return compareValues;
  }

  /* ---------- Iteration ---------- */
  function sortedEntries(d) {
    const arr = Array.from(d.m.values());
    if (d.sorted) arr.sort((x, y) => cmpSync(x[0], y[0]));
    return arr;
  }
  function cmpSync(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return cmpStr(a, b);
    if (a instanceof Chr && b instanceof Chr) return a.c - b.c;
    if (CS.isNumeric(a)) return CS.relational('<', a, b) ? -1 : CS.relational('>', a, b) ? 1 : 0;
    if (a instanceof CEnumVal) return a.value - b.value;
    return 0;
  }
  const kvp = (k, v) => new CTuple([k, v], ['Key', 'Value'], true);

  lib.iterator = function* (coll, scope) {
    if (coll instanceof CList) { let i = 0; return { gen: false, next: () => (i < coll.a.length ? { done: false, value: coll.a[i++] } : { done: true }) }; }
    if (coll instanceof CArray) { let i = 0; return { gen: false, next: () => (i < coll.a.length ? { done: false, value: coll.a[i++] } : { done: true }) }; }
    if (typeof coll === 'string') { let i = 0; return { gen: false, next: () => (i < coll.length ? { done: false, value: chr(coll.charCodeAt(i++)) } : { done: true }) }; }
    const arr = yield* toList(coll, scope);
    let i = 0;
    return { gen: false, next: () => (i < arr.length ? { done: false, value: arr[i++] } : { done: true }) };
  };

  /* Beliebige Sammlung -> JS-Array (Momentaufnahme) */
  function* toList(v, scope) {
    if (v === null) nullArg('source');
    if (v instanceof CList || v instanceof CArray) return v.a;
    if (typeof v === 'string') return Array.from(v, (ch) => chr(ch.charCodeAt(0)));
    if (v instanceof CDict) return sortedEntries(v).map((e) => kvp(e[0], e[1]));
    if (v instanceof CSet) { const a = Array.from(v.m.values()); if (v.sorted) a.sort(cmpSync); return a; }
    if (v instanceof CQueue) return v.a.slice();
    if (v instanceof CStack) return v.a.slice().reverse();
    if (v instanceof CRange) throwErr('ArgumentException', 'Bereich kann nicht aufgezählt werden');
    if (v instanceof CObject) {
      const ge = CS.findMethods(v.cls, 'GetEnumerator');
      if (ge.length) {
        const en = yield* CS.invoke(ge[0], v, [], null, scope);
        const out = [];
        if (en instanceof CList || en instanceof CArray) return en.a;
        if (en && en.isEnumerator) return en.items.slice(en.i);
        for (;;) {
          const more = yield* CS.callMember(en, 'MoveNext', [], null, scope, null);
          if (more !== true) break;
          out.push(yield* CS.getMemberValue(en, 'Current', scope));
          if (out.length > 5000000) break;
        }
        return out;
      }
    }
    throwErr('InvalidOperationException', 'Der Typ "' + shortNet(v) + '" kann nicht aufgezählt werden.');
  }
  lib.toList = toList;

  const isEnumerable = (v) => v instanceof CList || v instanceof CArray || typeof v === 'string' || v instanceof CDict || v instanceof CSet || v instanceof CQueue || v instanceof CStack;

  /* ---------- Hilfen zum Anlegen ---------- */
  const newList = (a, et) => new CList(a, et || null);
  function setOut(slot, v) { if (isRef(slot)) slot.v = v; }
  function* dictKey(d, k) { return yield* keyOf(k); }

  lib.dictGet = function* (d, k) {
    if (k === null) nullArg('key');
    const e = d.m.get(yield* keyOf(k));
    if (!e) throwErr('KeyNotFoundException', 'Der angegebene Schlüssel \'' + (yield* toStr(k)) + '\' war nicht im Wörterbuch vorhanden.');
    return e[1];
  };
  lib.dictSet = function* (d, k, v) {
    if (k === null) nullArg('key');
    const key = yield* keyOf(k);
    const e = d.m.get(key);
    if (e) e[1] = v; else { d.m.set(key, [CS.coerce(k, d.kt, null), v]); }
    d.ver = (d.ver || 0) + 1;
  };

  /* ---------- Reflexion light ---------- */
  function mkType(v) {
    if (v instanceof CObject) return new CType(v.cls.name, v.cls);
    const full = lib.netTypeName(v);
    const t = new CType(full.replace(/^System\.(Collections\.Generic\.|Text\.)?/, '').replace(/\[.*$/, ''));
    t.full = full;
    return t;
  }

  /* ---------- Typtests für eingebaute Typen ---------- */
  lib.builtinTypeTest = function (v, name) {
    switch (name) {
      case 'List': case 'IList': case 'ICollection': return v instanceof CList || (name !== 'List' && v instanceof CArray);
      case 'IEnumerable': case 'IReadOnlyList': case 'IReadOnlyCollection': return isEnumerable(v);
      case 'Dictionary': case 'IDictionary': return v instanceof CDict;
      case 'HashSet': case 'ISet': return v instanceof CSet;
      case 'Queue': return v instanceof CQueue;
      case 'Stack': return v instanceof CStack;
      case 'StringBuilder': return v instanceof CSB;
      case 'Random': return v instanceof CRandom;
      case 'DateTime': return v instanceof CDateTime;
      case 'TimeSpan': return v instanceof CTimeSpan;
      case 'Array': return v instanceof CArray;
      case 'IComparable': return CS.isNumeric(v) || typeof v === 'string' || (v instanceof CObject && CS.findMethods(v.cls, 'CompareTo').length > 0);
      case 'Delegate': case 'Func': case 'Action': return isFn(v);
      case 'ValueType': return CS.isNumeric(v) || typeof v === 'boolean' || v instanceof Chr || (v instanceof CObject && v.cls.isStruct);
      case 'Enum': return v instanceof CEnumVal;
      case 'Exception': return v instanceof CObject && CS.isExceptionObj(v);
    }
    if (v instanceof CObject) {
      for (let c = v.cls; c; c = c.base) for (const i of c.interfaces) if (i.name === name) return true;
    }
    return false;
  };
  lib.builtinTypeScore = function (v, name) {
    if (lib.builtinTypeTest(v, name)) return 3;
    if (v === null) return 1;
    if (/^(IEnumerable|IList|List|ICollection|Dictionary|HashSet|Queue|Stack|StringBuilder|Random|DateTime|TimeSpan|Array)$/.test(name)) return -1;
    return 1;
  };
  const builtinIfaces = new Map();
  lib.builtinInterface = function (name) {
    let c = builtinIfaces.get(name);
    if (!c) { c = new CClass(name, 'interface'); c.builtin = true; builtinIfaces.set(name, c); }
    return c;
  };
  lib.knownBaseClass = (name) => name === 'Object' || name === 'object' || name === 'ValueType';

  /* ---------- Namespaces & statische Typen ---------- */
  const NAMESPACES = new Set(['System', 'System.Collections', 'System.Collections.Generic', 'System.Linq', 'System.Text', 'System.IO', 'System.Threading', 'System.Diagnostics',
    'System.Threading.Tasks', 'System.Globalization', 'System.Numerics', 'System.Text.RegularExpressions', 'Microsoft']);
  lib.isNamespace = (n) => NAMESPACES.has(n);
  const STATIC_TYPES = new Set(['Console', 'Math', 'Convert', 'String', 'string', 'Char', 'char', 'Int32', 'int', 'Int64', 'long', 'Double', 'double', 'Single', 'float', 'Decimal', 'decimal',
    'Boolean', 'bool', 'Byte', 'byte', 'SByte', 'sbyte', 'Int16', 'short', 'UInt16', 'ushort', 'UInt32', 'uint', 'UInt64', 'ulong', 'Environment', 'DateTime', 'TimeSpan',
    'Random', 'Thread', 'Array', 'Enumerable', 'Enum', 'Object', 'object', 'Stopwatch', 'Guid', 'GC', 'StringComparison', 'MidpointRounding', 'ConsoleColor', 'ConsoleKey',
    'DayOfWeek', 'List', 'Dictionary', 'Tuple', 'StringComparer', 'Path', 'File', 'Directory', 'Console.Out', 'Convert', 'Nullable', 'CultureInfo', 'NumberStyles', 'Process',
    'Task', 'Interlocked', 'Buffer', 'StringSplitOptions', 'HashCode', 'BitConverter', 'Comparer', 'EqualityComparer', 'KeyValuePair', 'Lazy', 'Activator']);
  lib.isStaticType = (n) => STATIC_TYPES.has(n);

  /* ---------- Statische Felder ---------- */
  const builtinEnums = {};
  function builtinEnum(name, members) {
    let c = builtinEnums[name];
    if (!c) {
      c = new CClass(name, 'enum'); c.builtin = true; c.fullName = 'System.' + name; c.enumMembers = new Map();
      members.forEach((m, i) => c.enumMembers.set(m, new CEnumVal(c, m, i)));
      builtinEnums[name] = c;
    }
    return c;
  }
  const ENUMS = {
    DayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    StringComparison: ['CurrentCulture', 'CurrentCultureIgnoreCase', 'InvariantCulture', 'InvariantCultureIgnoreCase', 'Ordinal', 'OrdinalIgnoreCase'],
    MidpointRounding: ['ToEven', 'AwayFromZero', 'ToZero', 'ToNegativeInfinity', 'ToPositiveInfinity'],
    ConsoleColor: ['Black', 'DarkBlue', 'DarkGreen', 'DarkCyan', 'DarkRed', 'DarkMagenta', 'DarkYellow', 'Gray', 'DarkGray', 'Blue', 'Green', 'Cyan', 'Red', 'Magenta', 'Yellow', 'White'],
    ConsoleKey: ['Enter', 'Escape', 'Spacebar', 'UpArrow', 'DownArrow', 'LeftArrow', 'RightArrow'],
    StringSplitOptions: ['None', 'RemoveEmptyEntries', 'TrimEntries']
  };

  let lastKeyBuffer = '';
  lib.reset = function () { rngShared = null; lastKeyBuffer = ''; };

  lib.getStatic = function* (type, member, scope) {
    switch (type) {
      case 'Math':
        if (member === 'PI') return D(Math.PI);
        if (member === 'E') return D(Math.E);
        if (member === 'Tau') return D(Math.PI * 2);
        break;
      case 'int': case 'Int32':
        if (member === 'MaxValue') return 2147483647;
        if (member === 'MinValue') return -2147483648;
        break;
      case 'long': case 'Int64':
        if (member === 'MaxValue') return 9223372036854775807n;
        if (member === 'MinValue') return -9223372036854775808n;
        break;
      case 'short': case 'Int16': if (member === 'MaxValue') return new Num(32767, 'short'); if (member === 'MinValue') return new Num(-32768, 'short'); break;
      case 'byte': case 'Byte': if (member === 'MaxValue') return new Num(255, 'byte'); if (member === 'MinValue') return new Num(0, 'byte'); break;
      case 'sbyte': case 'SByte': if (member === 'MaxValue') return new Num(127, 'sbyte'); if (member === 'MinValue') return new Num(-128, 'sbyte'); break;
      case 'uint': case 'UInt32': if (member === 'MaxValue') return new Num(4294967295, 'uint'); if (member === 'MinValue') return new Num(0, 'uint'); break;
      case 'ushort': case 'UInt16': if (member === 'MaxValue') return new Num(65535, 'ushort'); if (member === 'MinValue') return new Num(0, 'ushort'); break;
      case 'ulong': case 'UInt64': if (member === 'MaxValue') return new Num(18446744073709551615n, 'ulong'); if (member === 'MinValue') return new Num(0n, 'ulong'); break;
      case 'double': case 'Double':
        switch (member) {
          case 'MaxValue': return D(Number.MAX_VALUE);
          case 'MinValue': return D(-Number.MAX_VALUE);
          case 'Epsilon': return D(5e-324);
          case 'NaN': return D(NaN);
          case 'PositiveInfinity': return D(Infinity);
          case 'NegativeInfinity': return D(-Infinity);
        }
        break;
      case 'float': case 'Single':
        switch (member) {
          case 'MaxValue': return new Num(3.4028234663852886e38, 'float');
          case 'MinValue': return new Num(-3.4028234663852886e38, 'float');
          case 'Epsilon': return new Num(1.401298464324817e-45, 'float');
          case 'NaN': return new Num(NaN, 'float');
          case 'PositiveInfinity': return new Num(Infinity, 'float');
          case 'NegativeInfinity': return new Num(-Infinity, 'float');
        }
        break;
      case 'decimal': case 'Decimal':
        if (member === 'MaxValue') return new Num(7.922816251426434e28, 'decimal');
        if (member === 'MinValue') return new Num(-7.922816251426434e28, 'decimal');
        if (member === 'Zero') return new Num(0, 'decimal');
        if (member === 'One') return new Num(1, 'decimal');
        break;
      case 'char': case 'Char':
        if (member === 'MaxValue') return chr(65535);
        if (member === 'MinValue') return chr(0);
        break;
      case 'string': case 'String':
        if (member === 'Empty') return '';
        break;
      case 'Environment':
        if (member === 'NewLine') return '\n';
        if (member === 'CurrentDirectory') return '/projekt';
        if (member === 'MachineName') return 'browser';
        if (member === 'UserName') return 'user';
        if (member === 'ProcessorCount') return 4;
        if (member === 'TickCount') return Math.floor(performance.now()) | 0;
        if (member === 'TickCount64') return BigInt(Math.floor(performance.now()));
        if (member === 'OSVersion') return 'Browser';
        if (member === 'Version') return '10.0';
        break;
      case 'Console':
        if (member === 'Out') return new CStatic('ConsoleOut');
        if (member === 'Error') return new CStatic('ConsoleErr');
        if (member === 'In') return new CStatic('ConsoleIn');
        if (member === 'WindowWidth' || member === 'BufferWidth' || member === 'LargestWindowWidth') return 120;
        if (member === 'WindowHeight' || member === 'BufferHeight' || member === 'LargestWindowHeight') return 30;
        if (member === 'CursorLeft' || member === 'CursorTop') return 0;
        if (member === 'KeyAvailable') return false;
        if (member === 'ForegroundColor' || member === 'BackgroundColor') return builtinEnum('ConsoleColor', ENUMS.ConsoleColor).enumMembers.get(member === 'ForegroundColor' ? 'Gray' : 'Black');
        if (member === 'Title') return 'Konsole';
        if (member === 'OutputEncoding' || member === 'InputEncoding') return null;
        break;
      case 'DateTime':
        if (member === 'Now') return new CDateTime(Date.now());
        if (member === 'UtcNow') return new CDateTime(Date.now(), 'utc');
        if (member === 'Today') { const d = new Date(); d.setHours(0, 0, 0, 0); return new CDateTime(d.getTime()); }
        if (member === 'MinValue') return new CDateTime(new Date(1, 0, 1).getTime());
        if (member === 'MaxValue') return new CDateTime(new Date(9999, 11, 31, 23, 59, 59).getTime());
        break;
      case 'TimeSpan':
        if (member === 'Zero') return new CTimeSpan(0);
        if (member === 'MaxValue') return new CTimeSpan(Number.MAX_SAFE_INTEGER);
        if (member === 'MinValue') return new CTimeSpan(-Number.MAX_SAFE_INTEGER);
        break;
      case 'Random': if (member === 'Shared') return sharedRandom(); break;
      case 'StringComparer':
        if (member === 'Ordinal' || member === 'OrdinalIgnoreCase' || member === 'InvariantCulture' || member === 'CurrentCulture' || member === 'InvariantCultureIgnoreCase' || member === 'CurrentCultureIgnoreCase') return 'cmp:' + member;
        break;
      case 'Guid': if (member === 'Empty') return '00000000-0000-0000-0000-000000000000'; break;
      case 'CultureInfo': if (member === 'InvariantCulture' || member === 'CurrentCulture') return 'culture:' + member; break;
    }
    if (ENUMS[type]) {
      const e = builtinEnum(type, ENUMS[type]).enumMembers.get(member);
      if (e) return e;
    }
    void scope;
    return undefined;
  };

  lib.setMember = function* (obj, name, v, scope) {
    if (obj instanceof CStatic) {
      if (obj.name === 'Console' && name === 'Title') return;
      return; // ForegroundColor, CursorVisible ... werden ignoriert
    }
    if (obj instanceof CSB && name === 'Length') {
      const n = int(v);
      obj.s = n <= obj.s.length ? obj.s.slice(0, n) : obj.s + '\0'.repeat(n - obj.s.length);
      return;
    }
    if (obj instanceof CList && name === 'Capacity') return;
    if (obj instanceof CRandom) return;
    throw CS.rtCompileErr(scope, 'CS0200', 'Die Eigenschaft "' + name + '" kann nicht zugewiesen werden. Sie ist schreibgeschützt');
  };

  lib.tupleIndex = function (t, name) {
    if (t.names) { const i = t.names.indexOf(name); if (i >= 0) return i; }
    const m = /^Item(\d+)$/.exec(name);
    if (m) return parseInt(m[1], 10) - 1;
    if (t.kvp) { if (name === 'Key') return 0; if (name === 'Value') return 1; }
    return -1;
  };

  /* Eigenschaften eingebauter Werte (Length, Count, Key, Message ...) */
  lib.getMember = function* (obj, name, scope) {
    if (obj instanceof CObject) {
      if (CS.isExceptionObj(obj)) {
        switch (name) {
          case 'Message': return obj.f.get('Message');
          case 'InnerException': return obj.f.get('InnerException');
          case 'StackTrace': return obj.tbText || null;
          case 'Source': return 'Program';
          case 'HelpLink': return null;
          case 'Data': return new CDict();
          case 'HResult': return -2146233088;
          case 'ParamName': return obj.f.has('ParamName') ? obj.f.get('ParamName') : null;
          case 'TargetSite': return null;
        }
      }
      return undefined;
    }
    if (obj instanceof CTuple) {
      const i = lib.tupleIndex(obj, name);
      if (i >= 0 && i < obj.items.length) return obj.items[i];
      return undefined;
    }
    switch (name) {
      case 'Length':
        if (typeof obj === 'string') return obj.length;
        if (obj instanceof CArray) return obj.a.length;
        if (obj instanceof CSB) return obj.s.length;
        break;
      case 'LongLength': if (obj instanceof CArray) return BigInt(obj.a.length); break;
      case 'Rank': if (obj instanceof CArray) return obj.dims ? obj.dims.length : 1; break;
      case 'Count':
        if (obj instanceof CList || obj instanceof CQueue || obj instanceof CStack) return obj.a.length;
        if (obj instanceof CDict || obj instanceof CSet) return obj.m.size;
        break;
      case 'Capacity': if (obj instanceof CList) return Math.max(4, obj.a.length); break;
      case 'Key': if (obj instanceof CList && obj.groupKey !== undefined) return obj.groupKey; break;
      case 'Keys': if (obj instanceof CDict) return newList(sortedEntries(obj).map((e) => e[0]), obj.kt); break;
      case 'Values': if (obj instanceof CDict) return newList(sortedEntries(obj).map((e) => e[1]), obj.vt); break;
      case 'Comparer': return null;
      case 'Min': if (obj instanceof CSet) { const a = [...obj.m.values()].sort(cmpSync); return a[0] === undefined ? null : a[0]; } break;
      case 'Max': if (obj instanceof CSet) { const a = [...obj.m.values()].sort(cmpSync); return a.length ? a[a.length - 1] : null; } break;
      case 'HasValue': return obj !== null;
      case 'Value': if (obj !== null && !(obj instanceof CTuple)) return obj; break;
    }
    if (obj instanceof CDateTime) {
      const d = new Date(obj.ms);
      switch (name) {
        case 'Year': return d.getFullYear(); case 'Month': return d.getMonth() + 1; case 'Day': return d.getDate();
        case 'Hour': return d.getHours(); case 'Minute': return d.getMinutes(); case 'Second': return d.getSeconds(); case 'Millisecond': return d.getMilliseconds();
        case 'DayOfWeek': return builtinEnum('DayOfWeek', ENUMS.DayOfWeek).enumMembers.get(ENUMS.DayOfWeek[d.getDay()]);
        case 'DayOfYear': return Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 86400000);
        case 'Date': return new CDateTime(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
        case 'TimeOfDay': return new CTimeSpan(((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds());
        case 'Ticks': return BigInt(obj.ms) * 10000n + 621355968000000000n;
      }
    }
    if (obj instanceof CTimeSpan) {
      const ms = obj.ms;
      switch (name) {
        case 'TotalDays': return D(ms / 86400000); case 'TotalHours': return D(ms / 3600000); case 'TotalMinutes': return D(ms / 60000);
        case 'TotalSeconds': return D(ms / 1000); case 'TotalMilliseconds': return D(ms);
        case 'Days': return Math.trunc(ms / 86400000); case 'Hours': return Math.trunc(ms / 3600000) % 24; case 'Minutes': return Math.trunc(ms / 60000) % 60;
        case 'Seconds': return Math.trunc(ms / 1000) % 60; case 'Milliseconds': return Math.trunc(ms) % 1000;
        case 'Ticks': return BigInt(Math.round(ms * 10000));
      }
    }
    if (obj instanceof CStopwatch) {
      const el = obj.acc + (obj.running ? performance.now() - obj.start : 0);
      if (name === 'ElapsedMilliseconds') return BigInt(Math.floor(el));
      if (name === 'Elapsed') return new CTimeSpan(el);
      if (name === 'ElapsedTicks') return BigInt(Math.floor(el * 10000));
      if (name === 'IsRunning') return obj.running;
    }
    if (obj instanceof CEnumVal) {
      if (name === 'value__') return obj.value;
    }
    if (obj instanceof CType) {
      if (name === 'Name') return obj.name;
      if (name === 'FullName') return obj.full || obj.name;
      if (name === 'IsClass') return !!(obj.cls && !obj.cls.isStruct && !obj.cls.isEnum);
      if (name === 'BaseType') return obj.cls && obj.cls.base ? new CType(obj.cls.base.name, obj.cls.base) : new CType('Object');
    }
    if (obj instanceof Chr) { /* keine Eigenschaften */ }
    if (obj instanceof CLambda || obj instanceof CMethodGroup) { if (name === 'Method') return obj; }
    if (obj instanceof CS.CObject) return undefined;
    if (obj && obj.isEnumerator) {
      if (name === 'Current') return obj.items[obj.i - 1];
    }
    return undefined;
  };

  lib.getIndex = function* (obj, idx, scope) {
    if (obj instanceof CSB) {
      const i = idx[0];
      if (i < 0 || i >= obj.s.length) throwErr('IndexOutOfRangeException');
      return chr(obj.s.charCodeAt(i));
    }
    if (obj instanceof CTuple) return undefined;
    void scope;
    return undefined;
  };
  lib.setIndex = function* (obj, idx, v) {
    if (obj instanceof CSB) {
      const i = idx[0];
      if (i < 0 || i >= obj.s.length) throwErr('IndexOutOfRangeException');
      obj.s = obj.s.slice(0, i) + String.fromCharCode(v.c) + obj.s.slice(i + 1);
    }
  };

  lib.sliceArray = (arr, r) => { const [a, b] = rangeBounds(r, arr.a.length); return new CArray(arr.et, arr.a.slice(a, b)); };
  lib.sliceList = (l, r) => { const [a, b] = rangeBounds(r, l.a.length); return newList(l.a.slice(a, b), l.et); };
  lib.sliceString = (s, r) => { const [a, b] = rangeBounds(r, s.length); return s.slice(a, b); };
  function rangeBounds(r, len) {
    const conv = (x, dflt) => (x === null ? dflt : x instanceof CIndexEnd ? len - x.n : x);
    const a = conv(r.from, 0), b = conv(r.to, len);
    if (a < 0 || b > len || a > b) throwErr('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs.');
    return [a, b];
  }

  lib.hasStaticMethod = () => true;
  lib.hasInstanceMethod = (obj, name) => LINQ_NAMES.has(name) || /^(Add|Remove|Contains|ToString|Equals|Append|Insert|Push|Pop|Enqueue|Dequeue|Trim|ToUpper|ToLower|Substring|CompareTo|StartsWith|EndsWith|IndexOf|Split|Replace|Peek)$/.test(name);

  lib.dateArith = function (op, a, b) {
    if (a instanceof CDateTime && b instanceof CTimeSpan) return new CDateTime(op === '+' ? a.ms + b.ms : a.ms - b.ms);
    if (a instanceof CDateTime && b instanceof CDateTime && op === '-') return new CTimeSpan(a.ms - b.ms);
    if (a instanceof CTimeSpan && b instanceof CTimeSpan) return new CTimeSpan(op === '+' ? a.ms + b.ms : a.ms - b.ms);
    return undefined;
  };

  /* ---------- Parser für Zahlen ---------- */
  function needStr(s) {
    if (s !== null && typeof s !== 'string') throw CS.rtCompileErr(null, 'CS1503', 'Argument 1: Der Typ "' + CS.valueTypeName(s) + '" kann nicht in "string" konvertiert werden');
  }
  function parseIntStr(s, kind, mustThrow) {
    needStr(s);
    if (s === null) { if (mustThrow) nullArg('s'); return undefined; }
    const t = s.trim();
    if (!/^[+-]?\d+$/.test(t)) { if (mustThrow) throwErr('FormatException', 'Die Eingabezeichenfolge hatte ein ungültiges Format.'); return undefined; }
    const big = BigInt(t);
    const r = CS.RANGE[kind];
    if (big < BigInt(r[0]) || big > BigInt(r[1])) { if (mustThrow) throwErr('OverflowException', 'Der Wert war zu groß oder zu klein für einen ' + CS.NET_NAMES[kind] + '.'); return undefined; }
    return kind === 'int' ? Number(big) : CS.mk(kind, kind === 'long' || kind === 'ulong' ? big : Number(big));
  }
  function parseDouble(s, mustThrow) {
    needStr(s);
    if (s === null) { if (mustThrow) nullArg('s'); return undefined; }
    let t = s.trim();
    if (CS.culture.name === 'de-DE') t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
    if (/^[+-]?(Infinity|∞)$/.test(t)) return t[0] === '-' ? -Infinity : Infinity;
    if (/^NaN$/.test(t)) return NaN;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) { if (mustThrow) throwErr('FormatException', 'Die Eingabezeichenfolge hatte ein ungültiges Format.'); return undefined; }
    return parseFloat(t);
  }
  const parseBool = (s, must) => {
    needStr(s);
    const t = (s || '').trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (must) throwErr('FormatException', 'Die Zeichenfolge wurde nicht als gültiger Boolean erkannt.');
    return undefined;
  };

  /* ---------- Zufall ---------- */
  function rngNext(r) {
    r.state = (r.state + 0x6D2B79F5) >>> 0;
    let t = r.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let rngShared = null;
  function sharedRandom() { if (!rngShared) rngShared = new CRandom((Math.random() * 4294967296) >>> 0); return rngShared; }

  /* ---------- Konsole ---------- */
  let readBuf = '';
  function* readLine(prompt) {
    const line = yield KON.inputRequest(prompt || '');
    return line === undefined ? null : line;
  }
  function* writeText(s, err) {
    const st = CS.getState();
    if (err) st.io.writeErr(s); else st.io.write(s);
  }
  function* consoleWrite(name, args, err) {
    const nl = name === 'WriteLine';
    let s = '';
    if (args.length === 0) s = '';
    else if (args.length === 1) {
      const a = args[0];
      if (a instanceof CArray && a.et && a.et.k === 'name' && a.et.name === 'char') s = a.a.map((c) => String.fromCharCode(c.c)).join('');
      else s = typeof a === 'string' ? a : yield* toStr(a);
    } else if (typeof args[0] === 'string') {
      let rest = args.slice(1);
      if (rest.length === 1 && rest[0] instanceof CArray && !(rest[0].et && rest[0].et.name === 'char')) rest = rest[0].a;
      s = yield* formatString(args[0], rest);
    } else s = yield* toStr(args[0]);
    yield* writeText(s + (nl ? '\n' : ''), err);
    return null;
  }

  /* ---------- Math ---------- */
  function roundEven(x) {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
  }
  function roundAway(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
  function mathResult(kind, x) { return kind === 'decimal' ? new Num(x, 'decimal') : kind === 'float' ? new Num(Math.fround(x), 'float') : D(x); }
  function mathStatic(name, args, scope) {
    const a = args[0];
    const kindA = CS.kindOf(a);
    const dbl = () => num(a);
    switch (name) {
      case 'Abs':
        if (typeof a === 'number') return a === -2147483648 ? throwErr('OverflowException', 'Negieren eines Mindestwerts ist nicht möglich.') : Math.abs(a);
        if (typeof a === 'bigint') return a < 0n ? -a : a;
        if (a instanceof Dbl) return D(Math.abs(a.v));
        if (a instanceof Num) return new Num(Math.abs(a.v), a.k);
        break;
      case 'Max': case 'Min': {
        const b = args[1];
        const k = CS.promote(kindA, CS.kindOf(b));
        const lt = CS.relational('<', a, b);
        const pick = name === 'Max' ? (lt ? b : a) : (lt ? a : b);
        if (a instanceof Dbl && b instanceof Dbl && (isNaN(a.v) || isNaN(b.v))) return D(NaN);
        return CS.castNumber(pick, k, scope);
      }
      case 'Pow': return D(Math.pow(dbl(), num(args[1])));
      case 'Sqrt': return D(Math.sqrt(dbl()));
      case 'Cbrt': return D(Math.cbrt(dbl()));
      case 'Exp': return D(Math.exp(dbl()));
      case 'Log': return args.length > 1 ? D(Math.log(dbl()) / Math.log(num(args[1]))) : D(Math.log(dbl()));
      case 'Log10': return D(Math.log10(dbl()));
      case 'Log2': return D(Math.log2(dbl()));
      case 'Sin': return D(Math.sin(dbl())); case 'Cos': return D(Math.cos(dbl())); case 'Tan': return D(Math.tan(dbl()));
      case 'Asin': return D(Math.asin(dbl())); case 'Acos': return D(Math.acos(dbl())); case 'Atan': return D(Math.atan(dbl()));
      case 'Atan2': return D(Math.atan2(dbl(), num(args[1])));
      case 'Sinh': return D(Math.sinh(dbl())); case 'Cosh': return D(Math.cosh(dbl())); case 'Tanh': return D(Math.tanh(dbl()));
      case 'Floor': return mathResult(kindA === 'decimal' ? 'decimal' : 'double', Math.floor(dbl()));
      case 'Ceiling': return mathResult(kindA === 'decimal' ? 'decimal' : 'double', Math.ceil(dbl()));
      case 'Truncate': return mathResult(kindA === 'decimal' ? 'decimal' : 'double', Math.trunc(dbl()));
      case 'Round': {
        let digits = 0, mode = 'ToEven';
        if (args.length >= 2) { if (args[1] instanceof CEnumVal) mode = args[1].name; else digits = int(args[1]); }
        if (args.length >= 3 && args[2] instanceof CEnumVal) mode = args[2].name;
        const f = Math.pow(10, digits);
        const x = dbl();
        let r;
        const fn = mode === 'AwayFromZero' ? roundAway : mode === 'ToZero' ? Math.trunc : mode === 'ToNegativeInfinity' ? Math.floor : mode === 'ToPositiveInfinity' ? Math.ceil : roundEven;
        if (digits > 0) {
          // Zehnerpotenz-Fehler vermeiden: über Dezimaldarstellung runden
          const sc = parseFloat((x * f).toPrecision(15));
          r = fn(sc) / f;
        } else r = fn(x * f) / f;
        return mathResult(kindA === 'decimal' ? 'decimal' : 'double', r);
      }
      case 'Sign': {
        const x = kindA === 'long' ? Number(a) : dbl();
        if (x !== x) throwErr('ArithmeticException', 'Die Funktion ist nicht für NaN definiert.');
        return x > 0 ? 1 : x < 0 ? -1 : 0;
      }
      case 'Clamp': {
        const lo = args[1], hi = args[2];
        const k = CS.promote(kindA, CS.kindOf(lo));
        let r = a;
        if (CS.relational('<', a, lo)) r = lo; else if (CS.relational('>', a, hi)) r = hi;
        return CS.castNumber(r, k, scope);
      }
      case 'DivRem': return new CTuple([CS.arith('/', a, args[1]), CS.arith('%', a, args[1])]);
      case 'BigMul': return BigInt(a) * BigInt(args[1]);
      case 'IEEERemainder': return D(dbl() - num(args[1]) * roundEven(dbl() / num(args[1])));
      case 'FusedMultiplyAdd': return D(dbl() * num(args[1]) + num(args[2]));
      case 'IsNaN': return Number.isNaN(dbl());
      case 'IsInfinity': return Math.abs(dbl()) === Infinity;
    }
    return undefined;
  }

  /* ---------- Convert ---------- */
  function* convertStatic(name, args, scope) {
    const a = args[0];
    const toKind = { ToInt32: 'int', ToInt64: 'long', ToInt16: 'short', ToByte: 'byte', ToSByte: 'sbyte', ToUInt32: 'uint', ToUInt64: 'ulong', ToUInt16: 'ushort' }[name];
    if (toKind) {
      if (a === null) return CS.defaultFor(toKind);
      if (typeof a === 'string') {
        if (args.length > 1) { const b = int(args[1]); const v = parseInt(a, b); if (isNaN(v)) throwErr('FormatException', 'Die Eingabezeichenfolge hatte ein ungültiges Format.'); return CS.mk(toKind, toKind === 'long' ? BigInt(v) : v); }
        return parseIntStr(a, toKind, true);
      }
      if (typeof a === 'boolean') return CS.mk(toKind, a ? 1 : 0);
      if (a instanceof Chr) return CS.mk(toKind, toKind === 'long' ? BigInt(a.c) : a.c);
      if (a instanceof Dbl || (a instanceof Num && (a.k === 'float' || a.k === 'decimal'))) {
        const x = roundEven(num(a));
        const r = CS.RANGE[toKind];
        if (x < Number(r[0]) || x > Number(r[1])) throwErr('OverflowException', 'Der Wert war zu groß oder zu klein für einen ' + CS.NET_NAMES[toKind] + '.');
        return CS.mk(toKind, toKind === 'long' || toKind === 'ulong' ? BigInt(x) : x);
      }
      if (CS.isNumeric(a)) return CS.castNumber(a, toKind, scope);
      throwErr('InvalidCastException', 'Das angegebene Cast ist ungültig.');
    }
    switch (name) {
      case 'ToDouble': case 'ToSingle': case 'ToDecimal': {
        const kind = name === 'ToDouble' ? 'double' : name === 'ToSingle' ? 'float' : 'decimal';
        if (a === null) return CS.defaultFor(kind);
        if (typeof a === 'string') return CS.mk(kind, parseDouble(a, true));
        if (typeof a === 'boolean') return CS.mk(kind, a ? 1 : 0);
        if (CS.isNumeric(a) || a instanceof Chr) return CS.castNumber(a, kind, scope);
        throwErr('InvalidCastException', 'Das angegebene Cast ist ungültig.');
        break;
      }
      case 'ToBoolean':
        if (typeof a === 'boolean') return a;
        if (typeof a === 'string') return parseBool(a, true);
        if (CS.isNumeric(a)) return num(a) !== 0;
        throwErr('InvalidCastException', 'Das angegebene Cast ist ungültig.');
        break;
      case 'ToChar':
        if (a instanceof Chr) return a;
        if (typeof a === 'string') { if (a.length !== 1) throwErr('FormatException', 'Die Zeichenfolge muss genau ein Zeichen lang sein.'); return chr(a.charCodeAt(0)); }
        if (CS.isNumeric(a)) return chr(int(a) & 65535);
        break;
      case 'ToString':
        if (args.length > 1 && typeof args[1] === 'number' && CS.isNumeric(a)) {
          const b = args[1];
          if (b === 10) return yield* toStr(a);
          let v = typeof a === 'bigint' ? a : BigInt(int(a));
          if (v < 0n) v = BigInt.asUintN(typeof a === 'bigint' ? 64 : 32, v);
          return v.toString(b);
        }
        if (args.length > 1 && typeof args[1] === 'string') return yield* fmtValue(a, args[1]);
        return yield* toStr(a);
      case 'ToDateTime': return a instanceof CDateTime ? a : new CDateTime(new Date(a).getTime());
      case 'ToBase64String': return btoa(String.fromCharCode(...a.a.map((x) => num(x))));
      case 'FromBase64String': return new CArray(T('byte'), Array.from(atob(a), (c) => new Num(c.charCodeAt(0), 'byte')));
      case 'IsDBNull': return false;
      case 'ChangeType': return a;
    }
    return undefined;
  }

  /* ---------- Char ---------- */
  function charStatic(name, args) {
    const c = args[0];
    const code = typeof c === 'string' ? c.charCodeAt(args[1] || 0) : c instanceof Chr ? c.c : 0;
    const ch = String.fromCharCode(code);
    switch (name) {
      case 'IsDigit': return /\p{Nd}/u.test(ch);
      case 'IsLetter': return /\p{L}/u.test(ch);
      case 'IsLetterOrDigit': return /[\p{L}\p{Nd}]/u.test(ch);
      case 'IsUpper': return /\p{Lu}/u.test(ch);
      case 'IsLower': return /\p{Ll}/u.test(ch);
      case 'IsWhiteSpace': return /\s/.test(ch);
      case 'IsPunctuation': return /\p{P}/u.test(ch);
      case 'IsSymbol': return /\p{S}/u.test(ch);
      case 'IsControl': return /\p{Cc}/u.test(ch);
      case 'IsSeparator': return /\p{Z}/u.test(ch);
      case 'IsNumber': return /\p{N}/u.test(ch);
      case 'ToUpper': case 'ToUpperInvariant': return chr(ch.toUpperCase().charCodeAt(0));
      case 'ToLower': case 'ToLowerInvariant': return chr(ch.toLowerCase().charCodeAt(0));
      case 'GetNumericValue': return D(/\d/.test(ch) ? parseInt(ch, 10) : -1);
      case 'ConvertFromUtf32': return String.fromCodePoint(int(c));
      case 'Parse': return chr(String(c).charCodeAt(0));
      case 'ToString': return ch;
      case 'IsAscii': return code < 128;
    }
    return undefined;
  }

  /* ---------- String ---------- */
  function* joinValues(sep, items) {
    const parts = [];
    for (const x of items) parts.push(x === null ? '' : typeof x === 'string' ? x : yield* toStr(x));
    return parts.join(sep);
  }

  function cmpFlag(arg) {
    if (arg instanceof CEnumVal) return { ordinal: /Ordinal/.test(arg.name), ic: /IgnoreCase/.test(arg.name) };
    if (typeof arg === 'string' && arg.startsWith('cmp:')) return { ordinal: /Ordinal/.test(arg), ic: /IgnoreCase/.test(arg) };
    return { ordinal: false, ic: false };
  }

  function* stringStatic(name, args, scope) {
    switch (name) {
      case 'IsNullOrEmpty': return args[0] === null || args[0] === '';
      case 'IsNullOrWhiteSpace': return args[0] === null || /^\s*$/.test(args[0]);
      case 'Join': {
        let sep = args[0];
        if (sep instanceof Chr) sep = String.fromCharCode(sep.c);
        let items;
        if (args.length === 2 && !(typeof args[1] === 'string')) items = yield* toList(args[1], scope);
        else items = args.slice(1);
        return yield* joinValues(sep, items);
      }
      case 'Concat': {
        let items = args;
        if (args.length === 1 && isEnumerable(args[0]) && typeof args[0] !== 'string') items = yield* toList(args[0], scope);
        return yield* joinValues('', items);
      }
      case 'Format': {
        let rest = args.slice(1);
        if (rest.length === 1 && rest[0] instanceof CArray && !(rest[0].et && rest[0].et.name === 'char')) rest = rest[0].a;
        return yield* formatString(args[0], rest);
      }
      case 'Compare': {
        const f = args.length > 2 ? cmpFlag(args[args.length - 1]) : { ordinal: false, ic: false };
        let a = args[0], b = args[1];
        if (a === null) return b === null ? 0 : -1;
        if (b === null) return 1;
        if (f.ic) { a = a.toLowerCase(); b = b.toLowerCase(); }
        const c = cmpStr(a, b, f.ordinal);
        return c < 0 ? -1 : c > 0 ? 1 : 0;
      }
      case 'CompareOrdinal': { const c = cmpStr(args[0], args[1], true); return c < 0 ? -1 : c > 0 ? 1 : 0; }
      case 'Equals': {
        const f = args.length > 2 ? cmpFlag(args[2]) : { ic: false };
        if (args[0] === null || args[1] === null) return args[0] === args[1];
        return f.ic ? args[0].toLowerCase() === args[1].toLowerCase() : args[0] === args[1];
      }
      case 'Copy': return args[0];
      case 'Intern': return args[0];
      case 'IsInterned': return args[0];
    }
    return undefined;
  }

  function strSplit(s, args) {
    let seps = [];
    let opts = 0;
    let count = Infinity;
    for (const a of args) {
      if (typeof a === 'string') seps.push(a);
      else if (a instanceof Chr) seps.push(String.fromCharCode(a.c));
      else if (a instanceof CArray) for (const x of a.a) seps.push(x instanceof Chr ? String.fromCharCode(x.c) : x);
      else if (a instanceof CEnumVal) opts = a.value;
      else if (typeof a === 'number') { if (args.indexOf(a) === 1 && (typeof args[0] === 'string' || args[0] instanceof Chr || args[0] instanceof CArray) ) count = a; else opts = a; }
    }
    let parts;
    if (!seps.length || (seps.length === 1 && seps[0] === null)) parts = s.split(/\s+/);
    else {
      const re = new RegExp(seps.filter((x) => x !== '').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
      parts = s.split(re);
    }
    if (count !== Infinity && parts.length > count) {
      // zusammenhängenden Rest erhalten (vereinfacht)
      const head = parts.slice(0, count - 1);
      let idx = 0, pos = 0;
      for (let i = 0; i < count - 1; i++) { idx = s.indexOf(parts[i], pos) + parts[i].length; pos = idx + (seps[0] ? seps[0].length : 1); }
      parts = head.concat([s.slice(pos)]);
    }
    if (opts & 2) parts = parts.map((x) => x.trim());
    if (opts & 1) parts = parts.filter((x) => x !== '');
    return new CArray(T('string'), parts);
  }

  function* stringMethod(s, name, args, scope) {
    const a0 = args[0];
    const chStr = (x) => (x instanceof Chr ? String.fromCharCode(x.c) : x);
    switch (name) {
      case 'ToString': return s;
      case 'ToUpper': case 'ToUpperInvariant': return s.toUpperCase();
      case 'ToLower': case 'ToLowerInvariant': return s.toLowerCase();
      case 'Trim': case 'TrimStart': case 'TrimEnd': {
        const chars = args.length ? args.flatMap((a) => (a instanceof CArray ? a.a : [a])).map(chStr) : null;
        const esc = chars ? chars.map((c) => c.replace(/[\]\\^-]/g, '\\$&')).join('') : null;
        const left = name !== 'TrimEnd', right = name !== 'TrimStart';
        let r = s;
        if (esc === null) { if (left) r = r.replace(/^\s+/, ''); if (right) r = r.replace(/\s+$/, ''); }
        else { if (left) r = r.replace(new RegExp('^[' + esc + ']+'), ''); if (right) r = r.replace(new RegExp('[' + esc + ']+$'), ''); }
        return r;
      }
      case 'Substring': {
        const start = int(a0);
        if (start < 0 || start > s.length) throwErr('ArgumentOutOfRangeException', 'Der Index und die Länge müssen sich auf eine Position innerhalb der Zeichenfolge beziehen. (Parameter \'length\')');
        if (args.length > 1) {
          const len = int(args[1]);
          if (len < 0 || start + len > s.length) throwErr('ArgumentOutOfRangeException', 'Der Index und die Länge müssen sich auf eine Position innerhalb der Zeichenfolge beziehen. (Parameter \'length\')');
          return s.substr(start, len);
        }
        return s.slice(start);
      }
      case 'Contains': { if (a0 === null) nullArg('value'); const f = args[1] ? cmpFlag(args[1]) : {}; return f.ic ? s.toLowerCase().includes(chStr(a0).toLowerCase()) : s.includes(chStr(a0)); }
      case 'StartsWith': { if (a0 === null) nullArg('value'); const f = args.length > 1 ? cmpFlag(args[1]) : {}; return f.ic ? s.toLowerCase().startsWith(chStr(a0).toLowerCase()) : s.startsWith(chStr(a0)); }
      case 'EndsWith': { if (a0 === null) nullArg('value'); const f = args.length > 1 ? cmpFlag(args[1]) : {}; return f.ic ? s.toLowerCase().endsWith(chStr(a0).toLowerCase()) : s.endsWith(chStr(a0)); }
      case 'IndexOf': {
        if (a0 === null) nullArg('value');
        const start = typeof args[1] === 'number' ? args[1] : 0;
        const f = args.length > 1 ? cmpFlag(args[args.length - 1]) : {};
        return f.ic ? s.toLowerCase().indexOf(chStr(a0).toLowerCase(), start) : s.indexOf(chStr(a0), start);
      }
      case 'LastIndexOf': return s.lastIndexOf(chStr(a0), typeof args[1] === 'number' ? args[1] : Infinity);
      case 'IndexOfAny': { const set = a0.a.map(chStr); for (let i = typeof args[1] === 'number' ? args[1] : 0; i < s.length; i++) if (set.includes(s[i])) return i; return -1; }
      case 'Replace': {
        if (a0 === null) nullArg('oldValue');
        const from = chStr(a0), to = args[1] === null ? '' : chStr(args[1]);
        if (from === '') throwErr('ArgumentException', 'Die Zeichenfolge darf nicht die Länge 0 haben. (Parameter \'oldValue\')');
        return s.split(from).join(to);
      }
      case 'Split': return strSplit(s, args);
      case 'PadLeft': return s.padStart(int(a0), args.length > 1 ? chStr(args[1]) : ' ');
      case 'PadRight': return s.padEnd(int(a0), args.length > 1 ? chStr(args[1]) : ' ');
      case 'Insert': {
        const i = int(a0);
        if (i < 0 || i > s.length) throwErr('ArgumentOutOfRangeException', 'Der Index muss innerhalb der Zeichenfolge liegen. (Parameter \'startIndex\')');
        return s.slice(0, i) + args[1] + s.slice(i);
      }
      case 'Remove': {
        const i = int(a0);
        if (i < 0 || i > s.length) throwErr('ArgumentOutOfRangeException', 'Der Index muss innerhalb der Zeichenfolge liegen. (Parameter \'startIndex\')');
        return args.length > 1 ? s.slice(0, i) + s.slice(i + int(args[1])) : s.slice(0, i);
      }
      case 'Equals': {
        const f = args.length > 1 ? cmpFlag(args[1]) : {};
        if (typeof a0 !== 'string') return false;
        return f.ic ? s.toLowerCase() === a0.toLowerCase() : s === a0;
      }
      case 'CompareTo': { if (a0 === null) return 1; const c = cmpStr(s, a0); return c < 0 ? -1 : c > 0 ? 1 : 0; }
      case 'CompareOrdinal': return s < a0 ? -1 : s > a0 ? 1 : 0;
      case 'ToCharArray': return new CArray(T('char'), Array.from(s, (c) => chr(c.charCodeAt(0))));
      case 'GetHashCode': { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
      case 'Normalize': return s.normalize();
      case 'GetType': return mkType(s);
      case 'Clone': return s;
      case 'EnumerateRunes': return null;
      case 'Chars': return chr(s.charCodeAt(int(a0)));
      case 'Length': return s.length;
      case 'LastIndexOfAny': { const set = a0.a.map(chStr); for (let i = s.length - 1; i >= 0; i--) if (set.includes(s[i])) return i; return -1; }
      case 'TrimEndNewLine': return s;
    }
    return undefined;
  }

  /* ---------- LINQ & Co ---------- */
  function* sel(f, x, scope) { return yield* callFn(f, [x], scope); }
  function* pred(f, x, scope) { return (yield* callFn(f, [x], scope)) === true; }

  function* keyedSort(items, keys, scope) {
    // keys: [{fn, desc, cmp}]
    const dec = [];
    for (const x of items) {
      const ks = [];
      for (const k of keys) ks.push(yield* callFn(k.fn, [x], scope));
      dec.push({ x: x, ks: ks });
    }
    const sorted = yield* sortWith(dec, function* (p, q) {
      for (let i = 0; i < keys.length; i++) {
        const cmp = keys[i].cmp || compareValues;
        let c = yield* cmp(p.ks[i], q.ks[i]);
        if (keys[i].desc) c = -c;
        if (c !== 0) return c;
      }
      return 0;
    });
    return sorted.map((d) => d.x);
  }

  function seqMinMax(items, isMax, selector, scope) {
    return (function* () {
      if (!items.length) throwErr('InvalidOperationException', 'Die Sequenz enthält keine Elemente.');
      let best = null;
      for (let i = 0; i < items.length; i++) {
        const v = selector ? yield* callFn(selector, [items[i]], scope) : items[i];
        if (i === 0) { best = v; continue; }
        const c = yield* compareValues(v, best);
        if (isMax ? c > 0 : c < 0) best = v;
      }
      return best;
    })();
  }

  function sumKind(vals) {
    let kind = 'int';
    for (const v of vals) { const k = CS.kindOf(v) || 'int'; kind = CS.promote(kind, k === 'char' ? 'int' : k); }
    return kind;
  }

  function* linq(coll, name, args, scope) {
    const items = yield* toList(coll, scope);
    const f = args[0];
    switch (name) {
      case 'Where': {
        const out = [];
        for (let i = 0; i < items.length; i++) { const r = f.params && f.params.length === 2 ? yield* callFn(f, [items[i], i], scope) : yield* callFn(f, [items[i]], scope); if (r === true) out.push(items[i]); }
        return newList(out, coll.et);
      }
      case 'Select': {
        const out = [];
        for (let i = 0; i < items.length; i++) out.push(f.params && f.params.length === 2 ? yield* callFn(f, [items[i], i], scope) : yield* callFn(f, [items[i]], scope));
        return newList(out);
      }
      case 'SelectMany': {
        const out = [];
        for (const x of items) { const r = yield* callFn(f, [x], scope); for (const y of yield* toList(r, scope)) out.push(args.length > 1 ? yield* callFn(args[1], [x, y], scope) : y); }
        return newList(out);
      }
      case 'OrderBy': case 'OrderByDescending': {
        const keys = [{ fn: f, desc: name === 'OrderByDescending', cmp: args[1] ? comparerFrom(args[1], scope) : null }];
        const res = newList(yield* keyedSort(items, keys, scope));
        res.ordSrc = items; res.ordKeys = keys;
        return res;
      }
      case 'ThenBy': case 'ThenByDescending': {
        const keys = (coll.ordKeys || []).concat([{ fn: f, desc: name === 'ThenByDescending', cmp: null }]);
        const src = coll.ordSrc || items;
        const res = newList(yield* keyedSort(src, keys, scope));
        res.ordSrc = src; res.ordKeys = keys;
        return res;
      }
      case 'GroupBy': {
        const groups = new Map();
        for (const x of items) {
          const k = yield* callFn(f, [x], scope);
          const key = yield* keyOf(k);
          let g = groups.get(key);
          if (!g) { g = { key: k, items: [] }; groups.set(key, g); }
          g.items.push(args.length > 1 ? yield* callFn(args[1], [x], scope) : x);
        }
        const out = [];
        for (const g of groups.values()) { const l = newList(g.items); l.groupKey = g.key; out.push(l); }
        const res = newList(out);
        if (args.length > 2) { const mapped = []; for (const g of out) mapped.push(yield* callFn(args[2], [g.groupKey, g], scope)); return newList(mapped); }
        return res;
      }
      case 'Sum': {
        const vals = [];
        for (const x of items) vals.push(f ? yield* callFn(f, [x], scope) : x);
        const kind = sumKind(vals);
        let acc = CS.mk(kind, kind === 'long' ? 0n : 0);
        if (kind === 'double' || kind === 'float' || kind === 'decimal') acc = CS.mk(kind, 0);
        for (const v of vals) if (v !== null) acc = CS.arith('+', acc, v);
        return acc;
      }
      case 'Average': {
        if (!items.length) throwErr('InvalidOperationException', 'Die Sequenz enthält keine Elemente.');
        let sum = 0, kind = 'double';
        for (const x of items) { const v = f ? yield* callFn(f, [x], scope) : x; sum += num(v); if (CS.kindOf(v) === 'decimal') kind = 'decimal'; }
        return mathResult(kind, sum / items.length);
      }
      case 'Min': case 'Max': return yield* seqMinMax(items, name === 'Max', f, scope);
      case 'MinBy': case 'MaxBy': {
        if (!items.length) throwErr('InvalidOperationException', 'Die Sequenz enthält keine Elemente.');
        let best = items[0], bk = yield* callFn(f, [items[0]], scope);
        for (let i = 1; i < items.length; i++) { const k = yield* callFn(f, [items[i]], scope); const c = yield* compareValues(k, bk); if (name === 'MaxBy' ? c > 0 : c < 0) { best = items[i]; bk = k; } }
        return best;
      }
      case 'Count': {
        if (!f) return items.length;
        let n = 0; for (const x of items) if (yield* pred(f, x, scope)) n++;
        return n;
      }
      case 'LongCount': return BigInt(items.length);
      case 'Any': {
        if (!f) return items.length > 0;
        for (const x of items) if (yield* pred(f, x, scope)) return true;
        return false;
      }
      case 'All': { for (const x of items) if (!(yield* pred(f, x, scope))) return false; return true; }
      case 'First': case 'FirstOrDefault': case 'Last': case 'LastOrDefault': case 'Single': case 'SingleOrDefault': {
        const isLast = name.startsWith('Last');
        let cand = items;
        if (f) { cand = []; for (const x of items) if (yield* pred(f, x, scope)) cand.push(x); }
        if (name.startsWith('Single')) {
          if (cand.length === 1) return cand[0];
          if (cand.length > 1) throwErr('InvalidOperationException', 'Die Sequenz enthält mehr als ein übereinstimmendes Element.');
        } else if (cand.length) return isLast ? cand[cand.length - 1] : cand[0];
        if (name.endsWith('OrDefault')) {
          const et = coll.et || (coll instanceof CArray ? coll.et : null);
          return et ? CS.defaultFor(CS.PRIM_NAMES[et.name]) : (items.length && typeof items[0] === 'number' ? 0 : null);
        }
        throwErr('InvalidOperationException', f ? 'Die Sequenz enthält kein übereinstimmendes Element.' : 'Die Sequenz enthält keine Elemente.');
        break;
      }
      case 'ElementAt': case 'ElementAtOrDefault': {
        const i = int(f);
        if (i < 0 || i >= items.length) { if (name === 'ElementAt') throwErr('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. (Parameter \'index\')'); return null; }
        return items[i];
      }
      case 'Take': return newList(items.slice(0, Math.max(0, int(f))), coll.et);
      case 'Skip': return newList(items.slice(Math.max(0, int(f))), coll.et);
      case 'TakeLast': return newList(items.slice(Math.max(0, items.length - int(f))), coll.et);
      case 'SkipLast': return newList(items.slice(0, Math.max(0, items.length - int(f))), coll.et);
      case 'TakeWhile': { const out = []; for (const x of items) { if (!(yield* pred(f, x, scope))) break; out.push(x); } return newList(out, coll.et); }
      case 'SkipWhile': { let i = 0; while (i < items.length && (yield* pred(f, items[i], scope))) i++; return newList(items.slice(i), coll.et); }
      case 'Distinct': {
        const seen = new Set(); const out = [];
        for (const x of items) { const k = yield* keyOf(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
        return newList(out, coll.et);
      }
      case 'DistinctBy': {
        const seen = new Set(); const out = [];
        for (const x of items) { const k = yield* keyOf(yield* callFn(f, [x], scope)); if (!seen.has(k)) { seen.add(k); out.push(x); } }
        return newList(out, coll.et);
      }
      case 'Reverse': return newList(items.slice().reverse(), coll.et);
      case 'Concat': return newList(items.concat(yield* toList(f, scope)), coll.et);
      case 'Append': return newList(items.concat([f]), coll.et);
      case 'Prepend': return newList([f].concat(items), coll.et);
      case 'Union': case 'Intersect': case 'Except': {
        const other = yield* toList(f, scope);
        const ok = new Set(); for (const x of other) ok.add(yield* keyOf(x));
        const seen = new Set(); const out = [];
        const add = function* (x) { const k = yield* keyOf(x); if (!seen.has(k)) { seen.add(k); out.push(x); } };
        if (name === 'Union') { for (const x of items) yield* add(x); for (const x of other) yield* add(x); }
        else for (const x of items) { const k = yield* keyOf(x); if (name === 'Intersect' ? ok.has(k) : !ok.has(k)) yield* add(x); }
        return newList(out, coll.et);
      }
      case 'Zip': {
        const other = yield* toList(f, scope);
        const out = [];
        const n = Math.min(items.length, other.length);
        for (let i = 0; i < n; i++) out.push(args.length > 1 ? yield* callFn(args[1], [items[i], other[i]], scope) : new CTuple([items[i], other[i]]));
        return newList(out);
      }
      case 'Aggregate': {
        let acc, i = 0, fn = f;
        if (args.length >= 2) { acc = args[0]; fn = args[1]; } else { if (!items.length) throwErr('InvalidOperationException', 'Die Sequenz enthält keine Elemente.'); acc = items[0]; i = 1; }
        for (; i < items.length; i++) acc = yield* callFn(fn, [acc, items[i]], scope);
        return args.length === 3 ? yield* callFn(args[2], [acc], scope) : acc;
      }
      case 'ToList': return newList(items.slice(), coll.et);
      case 'ToArray': return new CArray(coll.et || (items.length && typeof items[0] === 'string' ? T('string') : null), items.slice());
      case 'ToHashSet': { const s = new CSet(coll.et); for (const x of items) s.m.set(yield* keyOf(x), x); return s; }
      case 'ToDictionary': {
        const d = new CDict();
        for (const x of items) {
          const k = yield* callFn(f, [x], scope);
          const key = yield* keyOf(k);
          if (d.m.has(key)) throwErr('ArgumentException', 'Ein Element mit dem gleichen Schlüssel wurde bereits hinzugefügt. Schlüssel: ' + (yield* toStr(k)));
          d.m.set(key, [k, args.length > 1 ? yield* callFn(args[1], [x], scope) : x]);
        }
        return d;
      }
      case 'ToLookup': return yield* linq(coll, 'GroupBy', args, scope);
      case 'Contains': {
        for (const x of items) if (yield* equals(x, f)) return true;
        return false;
      }
      case 'Cast': case 'OfType': {
        const tn = args.length ? null : null; void tn;
        return newList(items.slice(), coll.et);
      }
      case 'SequenceEqual': {
        const other = yield* toList(f, scope);
        if (other.length !== items.length) return false;
        for (let i = 0; i < items.length; i++) if (!(yield* equals(items[i], other[i]))) return false;
        return true;
      }
      case 'DefaultIfEmpty': return items.length ? newList(items.slice(), coll.et) : newList([f === undefined ? null : f], coll.et);
      case 'Chunk': { const out = []; const n = int(f); for (let i = 0; i < items.length; i += n) out.push(new CArray(coll.et, items.slice(i, i + n))); return newList(out); }
      case 'AsEnumerable': case 'AsReadOnly': case 'AsQueryable': return coll;
      case 'Order': return newList(yield* sortWith(items, compareValues));
      case 'OrderDescending': return newList((yield* sortWith(items, compareValues)).reverse());
      case 'GetEnumerator': { const en = { isEnumerator: true, items: items, i: 0 }; return en; }
    }
    return undefined;
  }

  const LINQ_NAMES = new Set(['Where', 'Select', 'SelectMany', 'OrderBy', 'OrderByDescending', 'ThenBy', 'ThenByDescending', 'GroupBy', 'Sum', 'Average', 'Min', 'Max', 'MinBy', 'MaxBy',
    'Count', 'LongCount', 'Any', 'All', 'First', 'FirstOrDefault', 'Last', 'LastOrDefault', 'Single', 'SingleOrDefault', 'ElementAt', 'ElementAtOrDefault', 'Take', 'Skip', 'TakeLast',
    'SkipLast', 'TakeWhile', 'SkipWhile', 'Distinct', 'DistinctBy', 'Reverse', 'Concat', 'Append', 'Prepend', 'Union', 'Intersect', 'Except', 'Zip', 'Aggregate', 'ToList', 'ToArray',
    'ToHashSet', 'ToDictionary', 'ToLookup', 'Contains', 'Cast', 'OfType', 'SequenceEqual', 'DefaultIfEmpty', 'Chunk', 'AsEnumerable', 'AsReadOnly', 'Order', 'OrderDescending', 'GetEnumerator']);

  /* ---------- Collections ---------- */
  const touch = (c) => { c.ver = (c.ver || 0) + 1; };

  function* listMethod(l, name, args, scope) {
    const a = l.a, a0 = args[0];
    const et = l.et;
    const co = (v) => CS.coerce(CS.storeVal(v), et, scope);
    switch (name) {
      case 'Add': a.push(co(a0)); touch(l); return null;
      case 'AddRange': { for (const x of (yield* toList(a0, scope)).slice()) a.push(co(x)); touch(l); return null; }
      case 'Insert': { const i = int(a0); if (i < 0 || i > a.length) throwErr('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. Er darf nicht negativ und muss kleiner als die Auflistungsgröße sein. (Parameter \'index\')'); a.splice(i, 0, co(args[1])); touch(l); return null; }
      case 'InsertRange': { a.splice(int(a0), 0, ...(yield* toList(args[1], scope)).slice()); touch(l); return null; }
      case 'Remove': { for (let i = 0; i < a.length; i++) if (yield* equals(a[i], a0)) { a.splice(i, 1); touch(l); return true; } return false; }
      case 'RemoveAt': { const i = int(a0); if (i < 0 || i >= a.length) throwErr('ArgumentOutOfRangeException', 'Der Index lag außerhalb des gültigen Bereichs. Er darf nicht negativ und muss kleiner als die Auflistungsgröße sein. (Parameter \'index\')'); a.splice(i, 1); touch(l); return null; }
      case 'RemoveAll': { let n = 0; for (let i = a.length - 1; i >= 0; i--) if (yield* pred(a0, a[i], scope)) { a.splice(i, 1); n++; } if (n) touch(l); return n; }
      case 'RemoveRange': { a.splice(int(a0), int(args[1])); touch(l); return null; }
      case 'Clear': a.length = 0; touch(l); return null;
      case 'Contains': { for (const x of a) if (yield* equals(x, a0)) return true; return false; }
      case 'IndexOf': { for (let i = args.length > 1 ? int(args[1]) : 0; i < a.length; i++) if (yield* equals(a[i], a0)) return i; return -1; }
      case 'LastIndexOf': { for (let i = a.length - 1; i >= 0; i--) if (yield* equals(a[i], a0)) return i; return -1; }
      case 'Sort': {
        let cmp = compareValues, items = a;
        if (args.length === 1) cmp = comparerFrom(a0, scope);
        if (args.length === 3) { items = a.slice(int(a0), int(a0) + int(args[1])); cmp = comparerFrom(args[2], scope); }
        const sorted = yield* sortWith(items, cmp);
        if (args.length === 3) a.splice(int(a0), sorted.length, ...sorted); else for (let i = 0; i < sorted.length; i++) a[i] = sorted[i];
        touch(l); return null;
      }
      case 'Reverse': if (args.length === 0) { a.reverse(); touch(l); return null; } else { const i = int(a0), n = int(args[1]); const seg = a.slice(i, i + n).reverse(); a.splice(i, n, ...seg); return null; }
      case 'Find': { for (const x of a) if (yield* pred(a0, x, scope)) return x; return et ? CS.defaultFor(CS.PRIM_NAMES[et.name]) : null; }
      case 'FindLast': { for (let i = a.length - 1; i >= 0; i--) if (yield* pred(a0, a[i], scope)) return a[i]; return null; }
      case 'FindAll': { const out = []; for (const x of a) if (yield* pred(a0, x, scope)) out.push(x); return newList(out, et); }
      case 'FindIndex': { for (let i = 0; i < a.length; i++) if (yield* pred(a0, a[i], scope)) return i; return -1; }
      case 'FindLastIndex': { for (let i = a.length - 1; i >= 0; i--) if (yield* pred(a0, a[i], scope)) return i; return -1; }
      case 'Exists': { for (const x of a) if (yield* pred(a0, x, scope)) return true; return false; }
      case 'TrueForAll': { for (const x of a) if (!(yield* pred(a0, x, scope))) return false; return true; }
      case 'ForEach': { for (const x of a.slice()) yield* callFn(a0, [x], scope); return null; }
      case 'ConvertAll': { const out = []; for (const x of a) out.push(yield* callFn(a0, [x], scope)); return newList(out); }
      case 'ToArray': return new CArray(et, a.slice());
      case 'GetRange': { const i = int(a0), n = int(args[1]); if (i < 0 || n < 0 || i + n > a.length) throwErr('ArgumentException', 'Versatz und Länge liegen außerhalb der Grenzen des Arrays oder Anzahl ist größer als die Anzahl von Elementen vom Index bis zum Ende der Quellauflistung.'); return newList(a.slice(i, i + n), et); }
      case 'CopyTo': { const dst = a0; const off = args.length > 1 ? int(args[1]) : 0; a.forEach((x, i) => { dst.a[off + i] = x; }); return null; }
      case 'AsReadOnly': return l;
      case 'TrimExcess': case 'EnsureCapacity': return null;
      case 'BinarySearch': {
        let lo = 0, hi = a.length - 1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; const c = yield* compareValues(a[mid], a0); if (c === 0) return mid; if (c < 0) lo = mid + 1; else hi = mid - 1; }
        return ~lo;
      }
      case 'GetEnumerator': return { isEnumerator: true, items: a.slice(), i: 0 };
    }
    return undefined;
  }

  function* dictMethod(d, name, args, scope) {
    const a0 = args[0];
    switch (name) {
      case 'Add': {
        if (a0 === null) nullArg('key');
        const key = yield* keyOf(a0);
        if (d.m.has(key)) throwErr('ArgumentException', 'Ein Element mit dem gleichen Schlüssel wurde bereits hinzugefügt. Schlüssel: ' + (yield* toStr(a0)));
        d.m.set(key, [CS.coerce(a0, d.kt, scope), CS.coerce(CS.storeVal(args[1]), d.vt, scope)]); touch(d); return null;
      }
      case 'TryAdd': { const key = yield* keyOf(a0); if (d.m.has(key)) return false; d.m.set(key, [a0, CS.coerce(args[1], d.vt, scope)]); touch(d); return true; }
      case 'TryGetValue': {
        const e = d.m.get(yield* keyOf(a0));
        if (e) { setOut(args[1], e[1]); return true; }
        setOut(args[1], d.vt ? CS.defaultFor(CS.PRIM_NAMES[d.vt.name]) : null);
        return false;
      }
      case 'ContainsKey': return d.m.has(yield* keyOf(a0));
      case 'ContainsValue': { for (const e of d.m.values()) if (yield* equals(e[1], a0)) return true; return false; }
      case 'Remove': {
        const key = yield* keyOf(a0); const e = d.m.get(key);
        if (!e) return false;
        d.m.delete(key); touch(d);
        if (args.length > 1) setOut(args[1], e[1]);
        return true;
      }
      case 'Clear': d.m.clear(); touch(d); return null;
      case 'GetValueOrDefault': { const e = d.m.get(yield* keyOf(a0)); if (e) return e[1]; return args.length > 1 ? args[1] : (d.vt ? CS.defaultFor(CS.PRIM_NAMES[d.vt.name]) : null); }
      case 'EnsureCapacity': case 'TrimExcess': return null;
      case 'Keys': return newList(sortedEntries(d).map((e) => e[0]), d.kt);
      case 'Values': return newList(sortedEntries(d).map((e) => e[1]), d.vt);
    }
    return undefined;
  }

  function* setMethod(s, name, args, scope) {
    const a0 = args[0];
    switch (name) {
      case 'Add': { const key = yield* keyOf(a0); if (s.m.has(key)) return false; s.m.set(key, CS.coerce(CS.storeVal(a0), s.et, scope)); touch(s); return true; }
      case 'Remove': { const r = s.m.delete(yield* keyOf(a0)); if (r) touch(s); return r; }
      case 'Contains': return s.m.has(yield* keyOf(a0));
      case 'Clear': s.m.clear(); touch(s); return null;
      case 'UnionWith': for (const x of yield* toList(a0, scope)) s.m.set(yield* keyOf(x), x); touch(s); return null;
      case 'IntersectWith': { const o = new Set(); for (const x of yield* toList(a0, scope)) o.add(yield* keyOf(x)); for (const k of [...s.m.keys()]) if (!o.has(k)) s.m.delete(k); touch(s); return null; }
      case 'ExceptWith': for (const x of yield* toList(a0, scope)) s.m.delete(yield* keyOf(x)); touch(s); return null;
      case 'SymmetricExceptWith': { for (const x of yield* toList(a0, scope)) { const k = yield* keyOf(x); if (s.m.has(k)) s.m.delete(k); else s.m.set(k, x); } touch(s); return null; }
      case 'IsSubsetOf': { const o = new Set(); for (const x of yield* toList(a0, scope)) o.add(yield* keyOf(x)); for (const k of s.m.keys()) if (!o.has(k)) return false; return true; }
      case 'IsSupersetOf': { for (const x of yield* toList(a0, scope)) if (!s.m.has(yield* keyOf(x))) return false; return true; }
      case 'Overlaps': { for (const x of yield* toList(a0, scope)) if (s.m.has(yield* keyOf(x))) return true; return false; }
      case 'SetEquals': { const o = new Set(); for (const x of yield* toList(a0, scope)) o.add(yield* keyOf(x)); if (o.size !== s.m.size) return false; for (const k of s.m.keys()) if (!o.has(k)) return false; return true; }
      case 'RemoveWhere': { let n = 0; for (const [k, v] of [...s.m]) if (yield* pred(a0, v, scope)) { s.m.delete(k); n++; } return n; }
      case 'TryGetValue': { const k = yield* keyOf(a0); if (s.m.has(k)) { setOut(args[1], s.m.get(k)); return true; } return false; }
    }
    return undefined;
  }

  function* queueMethod(q, name, args) {
    const a = q.a;
    switch (name) {
      case 'Enqueue': a.push(args[0]); return null;
      case 'Dequeue': if (!a.length) throwErr('InvalidOperationException', 'Die Warteschlange ist leer.'); return a.shift();
      case 'Peek': if (!a.length) throwErr('InvalidOperationException', 'Die Warteschlange ist leer.'); return a[0];
      case 'TryDequeue': if (!a.length) { setOut(args[0], null); return false; } setOut(args[0], a.shift()); return true;
      case 'TryPeek': if (!a.length) { setOut(args[0], null); return false; } setOut(args[0], a[0]); return true;
      case 'Clear': a.length = 0; return null;
      case 'Contains': { for (const x of a) if (yield* equals(x, args[0])) return true; return false; }
      case 'ToArray': return new CArray(null, a.slice());
      case 'EnqueueRange': for (const x of args[0].a) a.push(x); return null;
    }
    return undefined;
  }
  function* stackMethod(s, name, args) {
    const a = s.a;
    switch (name) {
      case 'Push': a.push(args[0]); return null;
      case 'Pop': if (!a.length) throwErr('InvalidOperationException', 'Der Stapel ist leer.'); return a.pop();
      case 'Peek': if (!a.length) throwErr('InvalidOperationException', 'Der Stapel ist leer.'); return a[a.length - 1];
      case 'TryPop': if (!a.length) { setOut(args[0], null); return false; } setOut(args[0], a.pop()); return true;
      case 'TryPeek': if (!a.length) { setOut(args[0], null); return false; } setOut(args[0], a[a.length - 1]); return true;
      case 'Clear': a.length = 0; return null;
      case 'Contains': { for (const x of a) if (yield* equals(x, args[0])) return true; return false; }
      case 'ToArray': return new CArray(null, a.slice().reverse());
    }
    return undefined;
  }

  function* sbMethod(sb, name, args, scope) {
    const a0 = args[0];
    switch (name) {
      case 'Append': {
        if (args.length >= 3 && typeof a0 === 'string') { sb.s += a0.substr(int(args[1]), int(args[2])); return sb; }
        if (args.length === 2 && a0 instanceof Chr) { sb.s += String.fromCharCode(a0.c).repeat(int(args[1])); return sb; }
        sb.s += a0 instanceof CArray && a0.et && a0.et.name === 'char' ? a0.a.map((c) => String.fromCharCode(c.c)).join('') : (typeof a0 === 'string' ? a0 : yield* toStr(a0));
        return sb;
      }
      case 'AppendLine': sb.s += (args.length ? (typeof a0 === 'string' ? a0 : yield* toStr(a0)) : '') + '\n'; return sb;
      case 'AppendFormat': sb.s += yield* formatString(a0, args.slice(1)); return sb;
      case 'AppendJoin': sb.s += yield* joinValues(a0 instanceof Chr ? String.fromCharCode(a0.c) : a0, yield* toList(args[1], scope)); return sb;
      case 'Insert': sb.s = sb.s.slice(0, int(a0)) + (yield* toStr(args[1])) + sb.s.slice(int(a0)); return sb;
      case 'Remove': { const i = int(a0), n = int(args[1]); if (i < 0 || i + n > sb.s.length) throwErr('ArgumentOutOfRangeException', 'Index und Länge müssen sich auf eine Position innerhalb der Zeichenfolge beziehen.'); sb.s = sb.s.slice(0, i) + sb.s.slice(i + n); return sb; }
      case 'Replace': sb.s = sb.s.split(a0 instanceof Chr ? String.fromCharCode(a0.c) : a0).join(args[1] instanceof Chr ? String.fromCharCode(args[1].c) : args[1]); return sb;
      case 'Clear': sb.s = ''; return sb;
      case 'ToString': return args.length ? sb.s.substr(int(a0), int(args[1])) : sb.s;
      case 'EnsureCapacity': return 16;
      case 'Equals': return a0 instanceof CSB && a0.s === sb.s;
    }
    return undefined;
  }

  /* ---------- Datum / Zeit ---------- */
  function dateMethod(d, name, args) {
    const dt = new Date(d.ms);
    const a0 = args[0];
    const add = (f) => { const n = new Date(d.ms); f(n); return new CDateTime(n.getTime()); };
    switch (name) {
      case 'ToString': return CS.formatDate(d, args.length && typeof a0 === 'string' ? a0 : '');
      case 'ToShortDateString': return CS.formatDate(d, 'd');
      case 'ToLongDateString': return CS.formatDate(d, 'D');
      case 'ToShortTimeString': return CS.formatDate(d, 't');
      case 'ToLongTimeString': return CS.formatDate(d, 'T');
      case 'AddDays': return new CDateTime(d.ms + num(a0) * 86400000);
      case 'AddHours': return new CDateTime(d.ms + num(a0) * 3600000);
      case 'AddMinutes': return new CDateTime(d.ms + num(a0) * 60000);
      case 'AddSeconds': return new CDateTime(d.ms + num(a0) * 1000);
      case 'AddMilliseconds': return new CDateTime(d.ms + num(a0));
      case 'AddMonths': return add((n) => n.setMonth(n.getMonth() + int(a0)));
      case 'AddYears': return add((n) => n.setFullYear(n.getFullYear() + int(a0)));
      case 'Subtract': return a0 instanceof CDateTime ? new CTimeSpan(d.ms - a0.ms) : new CDateTime(d.ms - a0.ms);
      case 'CompareTo': return d.ms < a0.ms ? -1 : d.ms > a0.ms ? 1 : 0;
      case 'Equals': return a0 instanceof CDateTime && a0.ms === d.ms;
      case 'ToUniversalTime': case 'ToLocalTime': return d;
      case 'GetHashCode': return d.ms | 0;
      case 'ToOADate': return D(d.ms / 86400000 + 25569);
    }
    void dt;
    return undefined;
  }
  function timeSpanMethod(t, name, args) {
    switch (name) {
      case 'ToString': return CS.timeSpanToStr(t);
      case 'Add': return new CTimeSpan(t.ms + args[0].ms);
      case 'Subtract': return new CTimeSpan(t.ms - args[0].ms);
      case 'Negate': return new CTimeSpan(-t.ms);
      case 'Duration': return new CTimeSpan(Math.abs(t.ms));
      case 'CompareTo': return t.ms < args[0].ms ? -1 : t.ms > args[0].ms ? 1 : 0;
      case 'Equals': return args[0] instanceof CTimeSpan && args[0].ms === t.ms;
    }
    return undefined;
  }

  function* dateTimeStatic(name, args) {
    switch (name) {
      case 'DaysInMonth': return new Date(int(args[0]), int(args[1]), 0).getDate();
      case 'IsLeapYear': { const y = int(args[0]); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
      case 'Parse': case 'ParseExact': {
        const s = args[0];
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
        if (m) return new CDateTime(new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime());
        const t = Date.parse(s);
        if (isNaN(t)) throwErr('FormatException', 'Die Zeichenfolge "' + s + '" wurde nicht als gültiges DateTime erkannt.');
        return new CDateTime(t);
      }
      case 'TryParse': {
        const s = args[0];
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec((s || '').trim());
        let t = m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() : Date.parse(s);
        if (isNaN(t)) { setOut(args[1], new CDateTime(0)); return false; }
        setOut(args[1], new CDateTime(t)); return true;
      }
    }
    return undefined;
  }

  /* ---------- Enum ---------- */
  function* enumStatic(name, args, scope) {
    const tcls = args[0] instanceof CType ? args[0].cls : null;
    switch (name) {
      case 'GetValues': { const c = tcls || (args[0] && args[0].cls); return new CArray(null, [...c.enumMembers.values()]); }
      case 'GetNames': { const c = tcls; return new CArray(T('string'), [...c.enumMembers.keys()]); }
      case 'Parse': case 'TryParse': {
        const c = tcls;
        const s = String(args[1]).trim();
        let found = null;
        if (/^-?\d+$/.test(s)) found = lib.enumFromValue(c, parseInt(s, 10));
        else {
          const ic = args[2] === true;
          for (const m of c.enumMembers.values()) if (ic ? m.name.toLowerCase() === s.toLowerCase() : m.name === s) found = m;
        }
        if (name === 'Parse') { if (!found) throwErr('ArgumentException', 'Der angeforderte Wert "' + s + '" wurde nicht gefunden.'); return found; }
        setOut(args[args.length - 1], found);
        return found !== null;
      }
      case 'IsDefined': { const c = tcls; const v = args[1]; for (const m of c.enumMembers.values()) if (typeof v === 'string' ? m.name === v : m.value === num(v)) return true; return false; }
      case 'GetName': { const c = tcls; for (const m of c.enumMembers.values()) if (m.value === num(args[1])) return m.name; return null; }
      case 'ToObject': return lib.enumFromValue(tcls, num(args[1]));
    }
    void scope;
    return undefined;
  }
  /* Generische TryParse<T>/Parse<T> sind über Ident.typeArgs nicht erreichbar -> Aufruf Enum.TryParse(str, out e) mit Slot-Typ */
  lib.callClassStatic = function* (cls, name, args, scope) {
    if (cls.isEnum) {
      switch (name) {
        case 'GetValues': return new CArray(null, [...cls.enumMembers.values()]);
      }
    }
    void scope; void args;
    return undefined;
  };

  /* ---------- Array ---------- */
  function* arrayStatic(name, args, scope) {
    const arr = args[0];
    switch (name) {
      case 'Sort': {
        if (arr === null) nullArg('array');
        let cmp = compareValues;
        let items = arr.a;
        if (args.length === 2) {
          if (arr instanceof CArray && args[1] instanceof CArray) {
            // Sort(keys, items)
            const keys = arr.a.slice(); const vals = args[1].a;
            const idx = keys.map((k, i) => i);
            const sorted = yield* sortWith(idx, function* (x, y) { return yield* compareValues(keys[x], keys[y]); });
            const nk = sorted.map((i) => keys[i]), nv = sorted.map((i) => vals[i]);
            nk.forEach((k, i) => { arr.a[i] = k; });
            nv.forEach((v, i) => { vals[i] = v; });
            return null;
          }
          cmp = comparerFrom(args[1], scope);
        } else if (args.length === 3) { items = arr.a.slice(int(args[1]), int(args[1]) + int(args[2])); }
        const sorted = yield* sortWith(items, cmp);
        if (args.length === 3) arr.a.splice(int(args[1]), sorted.length, ...sorted); else for (let i = 0; i < sorted.length; i++) arr.a[i] = sorted[i];
        return null;
      }
      case 'Reverse': if (args.length === 1) arr.a.reverse(); else { const i = int(args[1]), n = int(args[2]); const seg = arr.a.slice(i, i + n).reverse(); arr.a.splice(i, n, ...seg); } return null;
      case 'IndexOf': { for (let i = 0; i < arr.a.length; i++) if (yield* equals(arr.a[i], args[1])) return i; return -1; }
      case 'LastIndexOf': { for (let i = arr.a.length - 1; i >= 0; i--) if (yield* equals(arr.a[i], args[1])) return i; return -1; }
      case 'Copy': {
        const src = arr, dst = args[1];
        const n = args.length === 3 ? int(args[2]) : int(args[4]);
        const si = args.length === 3 ? 0 : int(args[2]), di = args.length === 3 ? 0 : int(args[3]);
        if (si + n > src.a.length || di + n > dst.a.length || n < 0) throwErr('ArgumentException', 'Quell-Array war nicht lang genug. Überprüfen Sie srcIndex und length sowie die Array-Untergrenzen.');
        const tmp = src.a.slice(si, si + n);
        for (let i = 0; i < n; i++) dst.a[di + i] = tmp[i];
        return null;
      }
      case 'Clear': { const i = args.length > 1 ? int(args[1]) : 0, n = args.length > 2 ? int(args[2]) : arr.a.length; for (let k = i; k < i + n; k++) arr.a[k] = arr.et ? CS.defaultFor(CS.PRIM_NAMES[arr.et.name]) : null; return null; }
      case 'Fill': { for (let i = 0; i < arr.a.length; i++) arr.a[i] = args[1]; return null; }
      case 'Resize': {
        const slot = arr; const n = int(args[1]);
        const a = slot.v; const na = new CArray(a.et, a.a.slice(0, n));
        while (na.a.length < n) na.a.push(a.et ? CS.defaultFor(CS.PRIM_NAMES[a.et.name]) : null);
        slot.v = na; return null;
      }
      case 'Exists': { for (const x of arr.a) if (yield* pred(args[1], x, scope)) return true; return false; }
      case 'TrueForAll': { for (const x of arr.a) if (!(yield* pred(args[1], x, scope))) return false; return true; }
      case 'Find': { for (const x of arr.a) if (yield* pred(args[1], x, scope)) return x; return null; }
      case 'FindAll': { const out = []; for (const x of arr.a) if (yield* pred(args[1], x, scope)) out.push(x); return new CArray(arr.et, out); }
      case 'FindIndex': { for (let i = 0; i < arr.a.length; i++) if (yield* pred(args[1], arr.a[i], scope)) return i; return -1; }
      case 'ForEach': { for (const x of arr.a) yield* callFn(args[1], [x], scope); return null; }
      case 'ConvertAll': { const out = []; for (const x of arr.a) out.push(yield* callFn(args[1], [x], scope)); return new CArray(null, out); }
      case 'BinarySearch': {
        let lo = 0, hi = arr.a.length - 1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; const c = yield* compareValues(arr.a[mid], args[1]); if (c === 0) return mid; if (c < 0) lo = mid + 1; else hi = mid - 1; }
        return ~lo;
      }
      case 'Empty': return new CArray(null, []);
      case 'AsReadOnly': return arr;
      case 'CreateInstance': return new CArray(null, new Array(int(args[1])).fill(null));
    }
    return undefined;
  }

  function* enumerableStatic(name, args) {
    switch (name) {
      case 'Range': { const s = int(args[0]), n = int(args[1]); if (n < 0) throwErr('ArgumentOutOfRangeException', 'Die Anzahl darf nicht negativ sein. (Parameter \'count\')'); const a = []; for (let i = 0; i < n; i++) a.push(s + i); return newList(a, T('int')); }
      case 'Repeat': { const a = []; for (let i = 0; i < int(args[1]); i++) a.push(args[0]); return newList(a); }
      case 'Empty': return newList([]);
    }
    return undefined;
  }

  /* ---------- Statische Aufrufe ---------- */
  lib.callStatic = function* (type, name, args, scope, named, tgt) {
    switch (type) {
      case 'Console': case 'ConsoleOut': case 'ConsoleErr': {
        const err = type === 'ConsoleErr';
        switch (name) {
          case 'WriteLine': case 'Write': return yield* consoleWrite(name, args, err);
          case 'ReadLine': return yield* readLine('');
          case 'Read': {
            if (!readBuf.length) { const l = yield* readLine(''); if (l === null) return -1; readBuf = l + '\n'; }
            const c = readBuf.charCodeAt(0); readBuf = readBuf.slice(1); return c;
          }
          case 'ReadKey': {
            const l = yield* readLine('');
            const ch = l && l.length ? l[0] : '\r';
            return new CTuple([chr(ch.charCodeAt(0)), builtinEnum('ConsoleKey', ENUMS.ConsoleKey).enumMembers.get('Enter')], ['KeyChar', 'Key']);
          }
          case 'Clear': { const st = CS.getState(); if (st.io.clear) st.io.clear(); return null; }
          case 'Beep': case 'ResetColor': case 'SetCursorPosition': case 'Flush': case 'SetWindowSize': case 'SetBufferSize': return null;
          case 'OpenStandardInput': return null;
        }
        break;
      }
      case 'Math': { const r = mathStatic(name, args, scope); if (r !== undefined) return r; break; }
      case 'Convert': { const r = yield* convertStatic(name, args, scope); if (r !== undefined) return r; break; }
      case 'string': case 'String': { const r = yield* stringStatic(name, args, scope); if (r !== undefined) return r; break; }
      case 'char': case 'Char': { const r = charStatic(name, args); if (r !== undefined) return r; if (name === 'TryParse') { const s = args[0]; if (typeof s === 'string' && s.length === 1) { setOut(args[1], chr(s.charCodeAt(0))); return true; } setOut(args[1], chr(0)); return false; } break; }
      case 'int': case 'Int32': case 'long': case 'Int64': case 'short': case 'Int16': case 'byte': case 'Byte': case 'sbyte': case 'SByte':
      case 'uint': case 'UInt32': case 'ulong': case 'UInt64': case 'ushort': case 'UInt16': {
        const kind = CS.PRIM_NAMES[type];
        if (name === 'Parse') return parseIntStr(args[0], kind, true);
        if (name === 'TryParse') { const r = parseIntStr(args[0], kind, false); if (r === undefined) { setOut(args[args.length - 1], CS.defaultFor(kind)); return false; } setOut(args[args.length - 1], r); return true; }
        if (name === 'Max' || name === 'Min') return mathStatic(name, args, scope);
        if (name === 'Abs') return mathStatic(name, args, scope);
        if (name === 'Sign') return mathStatic(name, args, scope);
        if (name === 'CompareTo') return yield* compareValues(args[0], args[1]);
        if (name === 'Equals') return CS.primEquals(args[0], args[1]);
        if (name === 'IsEvenInteger') return num(args[0]) % 2 === 0;
        if (name === 'IsOddInteger') return Math.abs(num(args[0])) % 2 === 1;
        if (name === 'Clamp') return mathStatic(name, args, scope);
        if (name === 'Pow') return mathStatic(name, args, scope);
        break;
      }
      case 'double': case 'Double': case 'float': case 'Single': case 'decimal': case 'Decimal': {
        const kind = CS.PRIM_NAMES[type];
        if (name === 'Parse') return CS.mk(kind, parseDouble(args[0], true));
        if (name === 'TryParse') { const r = parseDouble(args[0], false); if (r === undefined) { setOut(args[args.length - 1], CS.defaultFor(kind)); return false; } setOut(args[args.length - 1], CS.mk(kind, r)); return true; }
        if (name === 'IsNaN') return Number.isNaN(num(args[0]));
        if (name === 'IsInfinity') return Math.abs(num(args[0])) === Infinity;
        if (name === 'IsPositiveInfinity') return num(args[0]) === Infinity;
        if (name === 'IsNegativeInfinity') return num(args[0]) === -Infinity;
        if (name === 'IsFinite') return Number.isFinite(num(args[0]));
        if (name === 'Floor' || name === 'Ceiling' || name === 'Round' || name === 'Truncate' || name === 'Abs' || name === 'Max' || name === 'Min') return mathStatic(name, args, scope);
        if (name === 'Add') return CS.arith('+', args[0], args[1]);
        if (name === 'Subtract') return CS.arith('-', args[0], args[1]);
        if (name === 'Multiply') return CS.arith('*', args[0], args[1]);
        if (name === 'Divide') return CS.arith('/', args[0], args[1]);
        if (name === 'CompareTo') return yield* compareValues(args[0], args[1]);
        break;
      }
      case 'bool': case 'Boolean':
        if (name === 'Parse') return parseBool(args[0], true);
        if (name === 'TryParse') { const r = parseBool(args[0], false); if (r === undefined) { setOut(args[1], false); return false; } setOut(args[1], r); return true; }
        break;
      case 'Environment':
        if (name === 'Exit') throw new ExitSignal(int(args[0]));
        if (name === 'GetCommandLineArgs') return new CArray(T('string'), ['Program']);
        if (name === 'GetEnvironmentVariable') return null;
        if (name === 'FailFast') throw new ExitSignal(134);
        break;
      case 'DateTime': { const r = yield* dateTimeStatic(name, args); if (r !== undefined) return r; break; }
      case 'TimeSpan': {
        const n = num(args[0]);
        switch (name) {
          case 'FromDays': return new CTimeSpan(n * 86400000); case 'FromHours': return new CTimeSpan(n * 3600000);
          case 'FromMinutes': return new CTimeSpan(n * 60000); case 'FromSeconds': return new CTimeSpan(n * 1000);
          case 'FromMilliseconds': return new CTimeSpan(n);
        }
        break;
      }
      case 'Thread':
        if (name === 'Sleep') { yield KON.sleepRequest(args[0] instanceof CTimeSpan ? args[0].ms : int(args[0])); return null; }
        break;
      case 'Task': if (name === 'Delay') { yield KON.sleepRequest(int(args[0])); return null; } break;
      case 'Array': { const r = yield* arrayStatic(name, args, scope); if (r !== undefined) return r; break; }
      case 'Enumerable': { const r = yield* enumerableStatic(name, args); if (r !== undefined) return r; if (LINQ_NAMES.has(name)) { return yield* linq(args[0], name, args.slice(1), scope); } break; }
      case 'Enum': { const r = yield* enumStatic(name, args, scope); if (r !== undefined) return r; break; }
      case 'object': case 'Object':
        if (name === 'ReferenceEquals') return args[0] === args[1] || (args[0] !== null && typeof args[0] === 'string' && args[0] === args[1]);
        if (name === 'Equals') return yield* equals(args[0], args[1]);
        break;
      case 'Stopwatch':
        if (name === 'StartNew') { const s = new CStopwatch(); s.start = performance.now(); s.running = true; return s; }
        if (name === 'GetTimestamp') return BigInt(Math.floor(performance.now() * 1000));
        break;
      case 'Guid':
        if (name === 'NewGuid') { const h = () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0'); return h() + h() + '-' + h() + '-' + h() + '-' + h() + '-' + h() + h() + h(); }
        break;
      case 'GC': return null;
      case 'HashCode': {
        if (name === 'Combine') { let hsh = 17; for (const x of args) { const k = yield* keyOf(x); let kh = 0; for (let q = 0; q < k.length; q++) kh = (kh * 31 + k.charCodeAt(q)) | 0; hsh = (hsh * 31 + kh) | 0; } return hsh; }
        break;
      }
      case 'List': case 'Dictionary': break;
      case 'Tuple': if (name === 'Create') return new CTuple(args.slice()); break;
      case 'KeyValuePair': if (name === 'Create') return kvp(args[0], args[1]); break;
      case 'Interlocked': if (name === 'Increment') { args[0].v = (args[0].v + 1) | 0; return args[0].v; } if (name === 'Decrement') { args[0].v = (args[0].v - 1) | 0; return args[0].v; } break;
      case 'Path': {
        if (name === 'Combine') return args.join('/');
        if (name === 'GetFileName') return String(args[0]).split(/[\\/]/).pop();
        if (name === 'GetExtension') { const m = /\.[^.\\/]*$/.exec(args[0]); return m ? m[0] : ''; }
        break;
      }
      case 'File': case 'Directory':
        throwErr('IOException', 'Dateizugriff ist im Browser-Editor nicht verfügbar.');
        break;
      case 'CultureInfo': return args[0];
      case 'Comparer': case 'EqualityComparer': break;
      case 'StringComparer': break;
      case 'BitConverter': break;
      case 'Nullable': break;
    }
    if (named) { /* benannte Argumente bei eingebauten Methoden werden positionell behandelt */ }
    void tgt;
    // Erweiterungsstil: Enumerable-Methoden auf statischen Typ (z. B. Enumerable.Sum(list))
    throw CS.rtCompileErr(scope, 'CS0117', '"' + type + '" enthält keine Definition für "' + name + '"');
  };

  /* ---------- Instanzaufrufe auf eingebauten Werten ---------- */
  lib.callInstance = function* (obj, name, args, scope, isBase, named) {
    void named;
    if (obj === null) throwErr('NullReferenceException');
    let r;
    if (typeof obj === 'string') {
      r = yield* stringMethod(obj, name, args, scope);
      if (r !== undefined) return r;
    } else if (obj instanceof CList) { r = yield* listMethod(obj, name, args, scope); if (r !== undefined) return r; }
    else if (obj instanceof CDict) {
      r = yield* dictMethod(obj, name, args, scope); if (r !== undefined) return r;
    } else if (obj instanceof CSet) { r = yield* setMethod(obj, name, args, scope); if (r !== undefined) return r; }
    else if (obj instanceof CQueue) { r = yield* queueMethod(obj, name, args, scope); if (r !== undefined) return r; }
    else if (obj instanceof CStack) { r = yield* stackMethod(obj, name, args, scope); if (r !== undefined) return r; }
    else if (obj instanceof CSB) { r = yield* sbMethod(obj, name, args, scope); if (r !== undefined) return r; }
    else if (obj instanceof CDateTime) { r = dateMethod(obj, name, args); if (r !== undefined) return r; }
    else if (obj instanceof CTimeSpan) { r = timeSpanMethod(obj, name, args); if (r !== undefined) return r; }
    else if (obj instanceof CRandom) {
      switch (name) {
        case 'Next': {
          if (args.length === 0) return Math.floor(rngNext(obj) * 2147483647);
          let lo = 0, hi;
          if (args.length === 1) hi = int(args[0]); else { lo = int(args[0]); hi = int(args[1]); }
          if (hi < lo) throwErr('ArgumentOutOfRangeException', args.length === 1 ? 'maxValue muss größer als 0 sein. (Parameter \'maxValue\')' : '\'minValue\' darf nicht größer als maxValue sein. (Parameter \'minValue\')');
          return lo + Math.floor(rngNext(obj) * (hi - lo));
        }
        case 'NextDouble': return D(rngNext(obj));
        case 'NextSingle': return new Num(Math.fround(rngNext(obj)), 'float');
        case 'NextInt64': return BigInt(Math.floor(rngNext(obj) * 9007199254740991));
        case 'NextBytes': { for (let i = 0; i < args[0].a.length; i++) args[0].a[i] = new Num(Math.floor(rngNext(obj) * 256), 'byte'); return null; }
      }
    } else if (obj instanceof CStopwatch) {
      switch (name) {
        case 'Start': if (!obj.running) { obj.start = performance.now(); obj.running = true; } return null;
        case 'Stop': if (obj.running) { obj.acc += performance.now() - obj.start; obj.running = false; } return null;
        case 'Reset': obj.acc = 0; obj.running = false; return null;
        case 'Restart': obj.acc = 0; obj.start = performance.now(); obj.running = true; return null;
      }
    } else if (obj instanceof CEnumVal) {
      switch (name) {
        case 'ToString': return args.length ? yield* fmtValue(obj, args[0]) : enumToString(obj);
        case 'HasFlag': return (obj.value & args[0].value) === args[0].value;
        case 'CompareTo': return obj.value < args[0].value ? -1 : obj.value > args[0].value ? 1 : 0;
        case 'Equals': return args[0] instanceof CEnumVal && args[0].cls === obj.cls && args[0].value === obj.value;
        case 'GetHashCode': return obj.value;
        case 'GetTypeCode': return 9;
      }
    } else if (obj instanceof CTuple) {
      if (name === 'Equals') return yield* equals(obj, args[0]);
      if (name === 'ToString') return yield* toStr(obj);
      if (name === 'Deconstruct') { obj.items.forEach((x, i) => setOut(args[i], x)); return null; }
      if (name === 'CompareTo') return yield* compareValues(obj, args[0]);
    } else if (obj instanceof CType) {
      if (name === 'ToString') return obj.full || obj.name;
      if (name === 'Equals') return args[0] instanceof CType && args[0].name === obj.name;
      if (name === 'GetHashCode') return obj.name.length;
      if (name === 'GetProperties' || name === 'GetMethods' || name === 'GetFields') return new CArray(null, []);
    } else if (isFn(obj)) {
      if (name === 'Invoke') return yield* callFn(obj, args, scope);
      if (name === 'DynamicInvoke') return yield* callFn(obj, args, scope);
    } else if (obj && obj.isEnumerator) {
      if (name === 'MoveNext') { if (obj.i < obj.items.length) { obj.i++; return true; } return false; }
      if (name === 'Reset') { obj.i = 0; return null; }
      if (name === 'Dispose') return null;
    } else if (obj instanceof CArray) {
      switch (name) {
        case 'GetLength': return obj.dims ? obj.dims[int(args[0])] : obj.a.length;
        case 'GetUpperBound': return (obj.dims ? obj.dims[int(args[0])] : obj.a.length) - 1;
        case 'GetLowerBound': return 0;
        case 'Clone': return new CArray(obj.et, obj.a.slice(), obj.dims);
        case 'CopyTo': { const off = int(args[1]); obj.a.forEach((x, i) => { args[0].a[off + i] = x; }); return null; }
        case 'SetValue': obj.a[int(args[1])] = args[0]; return null;
        case 'GetValue': return obj.a[int(args[0])];
        case 'Initialize': return null;
        case 'IndexOf': return yield* arrayStatic('IndexOf', [obj].concat(args), scope);
      }
    }
    // Zahlen, Zeichen, Bool: Standardmethoden
    if (CS.isNumeric(obj) || obj instanceof Chr || typeof obj === 'boolean') {
      switch (name) {
        case 'ToString': {
          if (args.length && typeof args[0] === 'string' && !(obj instanceof Chr) && typeof obj !== 'boolean') return yield* fmtValue(obj, args[0]);
          return yield* toStr(obj);
        }
        case 'CompareTo': return yield* compareValues(obj, args[0]);
        case 'Equals': { const p = CS.primEquals(obj, args[0]); return p === undefined ? false : p; }
        case 'GetHashCode': return typeof obj === 'number' ? obj : (typeof obj === 'string' ? 0 : Math.floor(num(obj)) | 0);
        case 'IsNaN': return Number.isNaN(num(obj));
        case 'GetTypeCode': return 0;
        case 'ToUpper': if (obj instanceof Chr) return chr(String.fromCharCode(obj.c).toUpperCase().charCodeAt(0)); break;
        case 'ToLower': if (obj instanceof Chr) return chr(String.fromCharCode(obj.c).toLowerCase().charCodeAt(0)); break;
        case 'GetValueOrDefault': return obj;
      }
    }
    // LINQ
    if (LINQ_NAMES.has(name) && (isEnumerable(obj) || obj instanceof CObject)) {
      // List.Reverse() in-place wurde oben behandelt
      const res = yield* linq(obj, name, args, scope);
      if (res !== undefined) return res;
    }
    // System.Object
    switch (name) {
      case 'ToString': return yield* toStr(obj);
      case 'Equals': return yield* equals(obj, args[0]);
      case 'GetHashCode': return obj && obj.id ? obj.id | 0 : 0;
      case 'GetType': return mkType(obj);
      case 'ReferenceEquals': return obj === args[0];
      case 'MemberwiseClone': return obj instanceof CObject ? CS.cloneStruct(obj) : obj;
      case 'Dispose': return null;
    }
    if (obj instanceof CObject && CS.isExceptionObj(obj)) {
      if (name === 'GetBaseException') { let e = obj; while (e.f.get('InnerException') instanceof CObject) e = e.f.get('InnerException'); return e; }
      if (name === 'GetObjectData') return null;
    }
    if (obj instanceof CObject && isBase) {
      if (name === 'ToString') return lib.netTypeName(obj);
    }
    throw CS.rtCompileErr(scope, 'CS1061', '"' + CS.valueTypeName(obj) + '" enthält keine Definition für "' + name + '", und es konnte keine zugängliche "' + name + '"-Erweiterungsmethode gefunden werden, die ein erstes Argument vom Typ "' + CS.valueTypeName(obj) + '" akzeptiert (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
  };

  /* ---------- Konstruktoren eingebauter Typen ---------- */
  lib.construct = function* (t, args, scope, named) {
    const name = t.name;
    const targs = t.args || [];
    switch (name) {
      case 'List': case 'ArrayList': case 'LinkedList': case 'SortedList': case 'ObservableCollection': {
        const l = newList([], targs[0] || null);
        if (args.length === 1 && typeof args[0] !== 'number') { for (const x of yield* toList(args[0], scope)) l.a.push(CS.coerce(x, l.et, scope)); }
        else if (args.length === 1 && args[0] < 0) throwErr('ArgumentOutOfRangeException', 'Der Wert darf nicht negativ sein. (Parameter \'capacity\')');
        return l;
      }
      case 'Dictionary': case 'SortedDictionary': case 'SortedList2': case 'ConcurrentDictionary': {
        const d = new CDict(targs[0] || null, targs[1] || null);
        d.sorted = name === 'SortedDictionary';
        if (args.length === 1 && args[0] instanceof CDict) for (const [k, e] of args[0].m) d.m.set(k, [e[0], e[1]]);
        return d;
      }
      case 'HashSet': case 'SortedSet': {
        const s = new CSet(targs[0] || null);
        s.sorted = name === 'SortedSet';
        if (args.length === 1 && (isEnumerable(args[0]))) for (const x of yield* toList(args[0], scope)) s.m.set(yield* keyOf(x), x);
        return s;
      }
      case 'Queue': { const q = new CQueue(); if (args.length === 1 && isEnumerable(args[0])) q.a.push(...(yield* toList(args[0], scope))); return q; }
      case 'Stack': { const q = new CStack(); if (args.length === 1 && isEnumerable(args[0])) q.a.push(...(yield* toList(args[0], scope))); return q; }
      case 'StringBuilder': return new CSB(args.length && typeof args[0] === 'string' ? args[0] : '');
      case 'Random': return new CRandom(args.length ? int(args[0]) : (Math.random() * 4294967296) >>> 0);
      case 'DateTime': {
        if (args.length >= 3) return new CDateTime(new Date(int(args[0]), int(args[1]) - 1, int(args[2]), int(args[3] || 0), int(args[4] || 0), int(args[5] || 0), int(args[6] || 0)).getTime());
        if (args.length === 1 && typeof args[0] === 'bigint') return new CDateTime(Number((args[0] - 621355968000000000n) / 10000n));
        return new CDateTime(new Date(1, 0, 1).getTime());
      }
      case 'TimeSpan': {
        if (args.length === 3) return new CTimeSpan(((int(args[0]) * 60 + int(args[1])) * 60 + int(args[2])) * 1000);
        if (args.length === 4) return new CTimeSpan((((int(args[0]) * 24 + int(args[1])) * 60 + int(args[2])) * 60 + int(args[3])) * 1000);
        if (args.length === 1) return new CTimeSpan(Number(args[0]) / 10000);
        return new CTimeSpan(0);
      }
      case 'Stopwatch': return new CStopwatch();
      case 'KeyValuePair': return kvp(args[0], args[1]);
      case 'Tuple': case 'ValueTuple': return new CTuple(args.slice());
      case 'string': case 'String': {
        if (args.length === 0) return '';
        if (args[0] instanceof CArray) {
          let chars = args[0].a;
          if (args.length === 3) chars = chars.slice(int(args[1]), int(args[1]) + int(args[2]));
          return chars.map((c) => String.fromCharCode(c.c)).join('');
        }
        if (args[0] instanceof Chr) return String.fromCharCode(args[0].c).repeat(int(args[1]));
        return '';
      }
      case 'object': case 'Object': { const o = new CObject(CS.getState().anonClass); o.plain = true; return o; }
      case 'int': case 'Int32': return 0;
      case 'double': case 'Double': return D(0);
      case 'bool': return false;
      case 'Thread': case 'Task': throw CS.rtCompileErr(scope, 'CS8999', 'Threads und Tasks werden in diesem Editor noch nicht unterstützt');
      case 'Lazy': return args[0];
      case 'Func': case 'Action': return args[0];
      case 'Uri': case 'Guid': return args.length ? args[0] : '00000000-0000-0000-0000-000000000000';
      case 'Exception': break;
    }
    void named;
    if (CS.exClasses[name]) { const o = CS.makeExc(name); yield* CS.constructBuiltinExc(o, args); return o; }
    throw CS.rtCompileErr(scope, 'CS0246', 'Der Typ- oder Namespacename "' + name + '" wurde nicht gefunden (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
  };
  CS.constructBuiltinExc = function* (o, args) {
    if (args.length > 0 && typeof args[0] === 'string') o.f.set('Message', args[0]);
    if (args.length > 1 && args[1] instanceof CObject) o.f.set('InnerException', args[1]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
