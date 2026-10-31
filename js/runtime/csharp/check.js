/* C#: statische Prüfung vor dem Start (Namen, einfache Typfehler, Zugriffsrechte).
 * Bewusst konservativ: Es wird nur gemeldet, was sicher ein Fehler ist. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};

  const IMPLICIT_USINGS = new Set(['System', 'System.IO', 'System.Collections.Generic', 'System.Linq', 'System.Net.Http', 'System.Threading', 'System.Threading.Tasks']);
  const NEEDS_USING = { StringBuilder: 'System.Text', Stopwatch: 'System.Diagnostics', CultureInfo: 'System.Globalization', NumberStyles: 'System.Globalization', Regex: 'System.Text.RegularExpressions', BigInteger: 'System.Numerics' };

  const KNOWN = new Set(['var', 'dynamic', 'nameof', 'List', 'Dictionary', 'HashSet', 'Queue', 'Stack', 'StringBuilder', 'Random', 'DateTime', 'TimeSpan', 'KeyValuePair', 'Func', 'Action',
    'Predicate', 'Comparison', 'Converter', 'IEnumerable', 'IEnumerator', 'IList', 'ICollection', 'IDictionary', 'ISet', 'IComparable', 'IComparer', 'IEquatable', 'IDisposable', 'IFormattable',
    'Tuple', 'ValueTuple', 'SortedDictionary', 'SortedSet', 'SortedList', 'LinkedList', 'ArrayList', 'Array', 'Enum', 'Object', 'Nullable', 'Lazy', 'Thread', 'Task', 'Guid', 'Regex',
    'BigInteger', 'Console', 'Math', 'File', 'Path', 'Directory', 'Convert', 'Environment', 'Stopwatch', 'StringComparison', 'StringComparer', 'CultureInfo', 'Enumerable', 'GC', 'Buffer',
    'Attribute', 'Type', 'Delegate', 'EventHandler', 'EventArgs', 'StringSplitOptions', 'HashCode', 'ValueType', 'IReadOnlyList', 'IReadOnlyCollection', 'IReadOnlyDictionary', 'ConsoleColor', 'ConsoleKey', 'DayOfWeek', 'MidpointRounding', 'Process',
    'ObservableCollection', 'ConcurrentDictionary', 'Interlocked', 'BitConverter', 'Comparer', 'EqualityComparer', 'Uri', 'Activator', 'NumberStyles', 'Math', 'Int32', 'Int64',
    'System', 'Collections', 'Generic', 'Linq', 'Text', 'IO', 'Threading', 'Diagnostics', 'Globalization', 'Numerics', 'Tasks', 'Microsoft']);
  const OBJECT_MEMBERS = new Set(['GetType', 'ToString', 'Equals', 'GetHashCode', 'MemberwiseClone', 'ReferenceEquals']);
  const EXC_MEMBERS = new Set(['Message', 'InnerException', 'StackTrace', 'Source', 'HelpLink', 'Data', 'HResult', 'GetBaseException', 'TargetSite', 'ParamName', 'GetObjectData']);

  const NUMERIC = ['byte', 'sbyte', 'short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'];
  const isNumT = (t) => NUMERIC.indexOf(t) >= 0 || t === 'char';

  const MATH_DBL = new Set(['Sqrt', 'Pow', 'Sin', 'Cos', 'Tan', 'Asin', 'Acos', 'Atan', 'Atan2', 'Exp', 'Log', 'Log10', 'Log2', 'Floor', 'Ceiling', 'Truncate', 'Cbrt', 'Sinh', 'Cosh', 'Tanh']);

  function typeStr(t) {
    if (!t) return null;
    if (t.k === 'name') return t.args.length ? null : (CS.PRIM_NAMES[t.name] && t.name !== 'String' && t.name !== 'Object' ? CS.PRIM_NAMES[t.name] : t.name);
    return null;
  }

  CS.check = function (units, S0, topStmts) {
    const errs = [];
    const classes = S0.classes;
    let file = '';
    let usings = new Set();

    function err(line, col, code, msg) {
      if (errs.length >= 30) return;
      if (errs.some((e) => e.line === line && e.col === col && e.code === code)) return;
      errs.push(new KON.LangError({ phase: 'compile', lang: 'csharp', file: file, line: line, col: col, code: code, name: code, message: msg }));
    }

    class Sc {
      constructor(parent, barrier) { this.vars = new Map(); this.parent = parent; this.barrier = !!barrier; }
    }
    function lookupVar(sc, name) {
      for (let s = sc; s; s = s.parent) { const v = s.vars.get(name); if (v) return v; }
      return null;
    }
    function declare(sc, name, type, node, kind, fn) {
      if (name === '_') return;
      if (kind !== 'pattern' && node) {
        const own = sc.vars.get(name);
        if (own && own.kind !== 'pattern') { err(node.line, node.col, 'CS0128', 'Eine lokale Variable mit dem Namen "' + name + '" ist bereits in diesem Bereich definiert'); }
        else {
          for (let s = sc.parent; s; s = s.parent) {
            const v = s.vars.get(name);
            if (v && v.kind !== 'pattern' && !v.lambdaParam && fn && !fn.inLambda) {
              err(node.line, node.col, 'CS0136', 'Eine lokale Variable oder ein Parameter mit dem Namen "' + name + '" kann in diesem Bereich nicht deklariert werden, da der Name in einem einschließenden Bereich für eine lokale Variable oder einen Parameter verwendet wird');
              break;
            }
            if (s.barrier) break;
          }
        }
      }
      sc.vars.set(name, { type: type || null, kind: kind || 'local', lambdaParam: kind === 'lparam' });
    }

    /* ---------- Klassen-Mitglieder nachschlagen ---------- */
    function memberOf(cls, name) {
      for (let c = cls; c; c = c.base) {
        if (c.builtin) {
          if (c.isExc && EXC_MEMBERS.has(name)) return { kind: 'builtin' };
          continue;
        }
        for (const f of c.fields) if (f.name === name) return { kind: 'field', isStatic: false, type: typeStr(f.type), mods: f.mods, cls: c };
        if (c.sfields.has(name)) { const t = c.sfieldTypes.get(name); return { kind: 'field', isStatic: true, type: typeStr(t), mods: c.sfieldMods && c.sfieldMods.get(name), cls: c }; }
        const p = c.props.get(name);
        if (p) return { kind: 'prop', isStatic: p.isStatic, type: typeStr(p.valType), mods: p.mods, cls: c };
        const ms = c.methods.get(name);
        if (ms) return { kind: 'method', isStatic: ms.every((m) => m.isStatic), methods: ms, cls: c, mods: ms[0].mods };
        if (c.nested.has(name)) return { kind: 'type', isStatic: true, cls: c };
        if (c.enumMembers && c.enumMembers.has(name)) return { kind: 'enum', isStatic: true };
        if (c.isEnum && c.enumDecl && c.enumDecl.some((m) => m.name === name)) return { kind: 'enum', isStatic: true };
        if (c.recordProps && c.recordProps.some((r) => r.name === name)) return { kind: 'prop', isStatic: false, type: typeStr(c.recordProps.find((r) => r.name === name).type), cls: c };
        for (const i of c.interfaces) if (i instanceof CS.CClass && !i.builtin) { const r = memberOf(i, name); if (r) return r; }
      }
      return null;
    }
    function hasOpaqueBase(cls) {
      // Basis ist ein eingebauter Typ, dessen Mitglieder wir nicht kennen (nicht Exception/object)
      for (let c = cls; c; c = c.base) {
        if (c.builtin && !c.isExc) return true;
      }
      for (let c = cls; c; c = c.base) for (const i of c.interfaces) if (i.builtin) { /* Schnittstellen ohne Standardimplementierung */ }
      return false;
    }
    function allMembersKnown(cls) {
      for (let c = cls; c; c = c.base) {
        if (c.builtin && !c.isExc) return false;
        if (c.decl && c.decl.bases.some((b) => !classes.has(b.name) && !/^I[A-Z]/.test(b.name))) return false;
      }
      return true;
    }

    function userClass(name, fn) {
      if (fn && fn.cls) {
        for (let c = fn.cls; c; c = c.outer) { const n = c.nested.get(name); if (n) return n; }
      }
      const c = classes.get(name);
      return c && !c.builtin ? c : null;
    }

    /* ---------- Typen prüfen (CS0246) ---------- */
    function checkType(t, fn) {
      if (!t) return;
      if (t.k === 'array') return checkType(t.elem, fn);
      if (t.k === 'null') return checkType(t.inner, fn);
      if (t.k === 'tuple') { t.elems.forEach((e) => checkType(e.type, fn)); return; }
      if (t.k !== 'name') return;
      t.args.forEach((a) => checkType(a, fn));
      const n = t.name;
      if (n === 'var' || n === 'void' || n === '?') return;
      if (CS.PRIM_NAMES[n]) return;
      if (userClass(n, fn)) return;
      if (S0.typeParamsAll.has(n) || (fn && fn.tparams && fn.tparams.has(n))) return;
      if (S0.delegates.has(n)) return;
      if (CS.exClasses[n] || KNOWN.has(n) || CS.lib.isStaticType(n)) {
        if (NEEDS_USING[n] && !usings.has(NEEDS_USING[n])) {
          err(t.line, t.col, 'CS0246', 'Der Typ- oder Namespacename "' + n + '" wurde nicht gefunden (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
        }
        return;
      }
      err(t.line, t.col, 'CS0246', 'Der Typ- oder Namespacename "' + n + '" wurde nicht gefunden (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
    }

    /* ---------- Typ-Verträglichkeit ---------- */
    function conv(from, to) {
      // 'ok' | 'explicit' | 'no' | 'unknown'
      if (!from || !to || from === 'null' && !isNumT(to) && to !== 'bool') return 'unknown';
      if (from === to) return 'ok';
      if (to === 'object' || to === 'dynamic') return 'ok';
      const prim = (x) => isNumT(x) || x === 'bool' || x === 'string';
      if (!prim(from) || !prim(to)) return 'unknown';
      if (from === 'null') return 'unknown';
      if (from === 'string' || to === 'string' || from === 'bool' || to === 'bool') return 'no';
      const rank = { byte: 1, sbyte: 1, short: 2, ushort: 2, char: 2, int: 3, uint: 3, long: 4, ulong: 4, float: 5, double: 6, decimal: 6 };
      const implicit = {
        byte: ['short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'], sbyte: ['short', 'int', 'long', 'float', 'double', 'decimal'],
        short: ['int', 'long', 'float', 'double', 'decimal'], ushort: ['int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
        char: ['ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'], int: ['long', 'float', 'double', 'decimal'],
        uint: ['long', 'ulong', 'float', 'double', 'decimal'], long: ['float', 'double', 'decimal'], ulong: ['float', 'double', 'decimal'], float: ['double']
      };
      if ((implicit[from] || []).indexOf(to) >= 0) return 'ok';
      void rank;
      return 'explicit';
    }
    function checkAssign(from, to, node, isConstInt) {
      if (!from || !to) return;
      if (to === 'var') return;
      const c = conv(from, to);
      if (c === 'ok' || c === 'unknown') return;
      if (c === 'explicit') {
        // int-Konstanten passen in kleinere Typen
        if (isConstInt && from === 'int' && ['byte', 'sbyte', 'short', 'ushort', 'uint', 'ulong'].indexOf(to) >= 0) return;
        err(node.line, node.col, 'CS0266', 'Der Typ "' + from + '" kann nicht implizit in "' + to + '" konvertiert werden. Es ist bereits eine explizite Konvertierung vorhanden (Fehlt eine Umwandlung?)');
      } else err(node.line, node.col, 'CS0029', 'Der Typ "' + from + '" kann nicht implizit in "' + to + '" konvertiert werden');
    }

    function promoteT(a, b) {
      if (!isNumT(a) || !isNumT(b)) return null;
      return CS.promote(a === 'char' ? 'char' : a, b === 'char' ? 'char' : b);
    }

    /* ---------- Ausdrücke ---------- */
    function nameInfo(node, sc, fn) {
      const name = node.name;
      const v = lookupVar(sc, name);
      if (v) return { type: v.type, local: true };
      // Mitglieder der Klasse (und äußerer Klassen)
      if (fn.cls) {
        for (let c = fn.cls; c; c = c.outer) {
          const m = memberOf(c, name);
          if (m) {
            if (m.kind !== 'type' && m.kind !== 'enum' && m.kind !== 'builtin' && !m.isStatic && fn.isStatic && c === fn.cls) {
              const full = c.name + '.' + name + (m.kind === 'method' ? '()' : '');
              err(node.line, node.col, 'CS0120', 'Für das nicht statische Feld, die Methode oder die Eigenschaft "' + full + '" ist ein Objektverweis erforderlich');
            }
            return { type: m.type || null, member: m };
          }
          if (OBJECT_MEMBERS.has(name)) return { type: null };
          if (!allMembersKnown(c)) return { type: null };
        }
      }
      if (fn.tparams && fn.tparams.has(name)) return { type: null };
      const uc = userClass(name, fn);
      if (uc) return { type: null, classRef: uc };
      if (CS.PRIM_NAMES[name] || KNOWN.has(name) || CS.exClasses[name] || CS.lib.isStaticType(name) || S0.typeParamsAll.has(name) || S0.delegates.has(name)) {
        if (NEEDS_USING[name] && !usings.has(NEEDS_USING[name])) {
          err(node.line, node.col, 'CS0103', 'Der Name "' + name + '" ist im aktuellen Kontext nicht vorhanden');
        }
        return { type: null, builtin: true };
      }
      if (S0.staticUsings.length) return { type: null, unknown: true };
      err(node.line, node.col, 'CS0103', 'Der Name "' + name + '" ist im aktuellen Kontext nicht vorhanden');
      return { type: null, unknown: true };
    }

    function accessCheck(member, name, node, fn) {
      if (!member || !member.mods || !member.cls) return;
      const priv = member.mods.has('private') || (!member.mods.has('public') && !member.mods.has('protected') && !member.mods.has('internal') && member.kind !== 'method' ? member.kind === 'field' : false);
      const isPriv = member.mods.has('private') || (member.kind === 'field' && !member.mods.has('public') && !member.mods.has('protected') && !member.mods.has('internal') && !member.mods.has('const'));
      void priv;
      if (isPriv) {
        let inside = false;
        for (let c = fn.cls; c; c = c.outer) if (c === member.cls) inside = true;
        if (!inside) err(node.nameLine || node.line, node.nameCol || node.col, 'CS0122', '"' + member.cls.name + '.' + name + '" ist aufgrund der Schutzebene nicht zugänglich');
      } else if (member.mods.has('protected') && !member.mods.has('public')) {
        let ok = false;
        for (let c = fn.cls; c; c = c.outer) if (CS.isSubclass(c, member.cls)) ok = true;
        if (!ok) err(node.nameLine || node.line, node.nameCol || node.col, 'CS0122', '"' + member.cls.name + '.' + name + '" ist aufgrund der Schutzebene nicht zugänglich');
      }
    }

    function expr(e, sc, fn) {
      if (!e) return null;
      switch (e.type) {
        case 'Lit': return e.kind === 'null' ? 'null' : (e.kind === 'string' ? 'string' : e.kind === 'bool' ? 'bool' : e.kind === 'char' ? 'char' : e.kind);
        case 'Interp': for (const p of e.parts) if (typeof p !== 'string') expr(p.expr, sc, fn); return 'string';
        case 'Ident': {
          if (e.name === '_') return null;
          if (e.isTypeKw) return null;
          const info = nameInfo(e, sc, fn);
          return info.type;
        }
        case 'This': return fn.cls ? fn.cls.name : null;
        case 'Base': return null;
        case 'Member': return memberExpr(e, sc, fn);
        case 'Call': return callExpr(e, sc, fn);
        case 'Index': {
          const t = expr(e.obj, sc, fn);
          e.args.forEach((a) => expr(a, sc, fn));
          if (t === 'string') return 'char';
          return null;
        }
        case 'New': {
          if (e.typeRef) {
            checkType(e.typeRef, fn);
            const uc = e.typeRef.k === 'name' ? userClass(e.typeRef.name, fn) : null;
            if (uc && (uc.isAbstract || uc.isInterface)) err(e.line, e.col, 'CS0144', 'Eine Instanz der abstrakten Klasse oder Schnittstelle "' + uc.name + '" kann nicht erstellt werden');
            if (uc && uc.ctors.length && !uc.isRecord) checkArity(uc.ctors.map((c) => ({ params: c.params, name: uc.name })), e.args, e, uc.name, 'ctor');
            e.args.forEach((a) => expr(a.expr, sc, fn));
            if (e.init) initExprs(e.init, sc, fn);
            return uc ? uc.name : (e.typeRef.k === 'name' && e.typeRef.name === 'string' ? 'string' : null);
          }
          e.args.forEach((a) => expr(a.expr, sc, fn));
          if (e.init) initExprs(e.init, sc, fn);
          return null;
        }
        case 'NewArray': {
          if (e.elemType) checkType(e.elemType, fn);
          (e.dims || []).forEach((d) => expr(d, sc, fn));
          if (e.init) expr(e.init, sc, fn);
          return null;
        }
        case 'ArrayInit': e.elems.forEach((x) => expr(x, sc, fn)); return null;
        case 'NewAnon': e.init.items.forEach((it) => expr(it.expr, sc, fn)); return null;
        case 'Binary': return binaryExpr(e, sc, fn);
        case 'Unary': {
          const t = expr(e.operand, sc, fn);
          if (e.op === '!') { if (t && t !== 'bool' && (isNumT(t) || t === 'string')) err(e.line, e.col, 'CS0023', 'Der Operator "!" kann nicht auf einen Operanden vom Typ "' + t + '" angewendet werden'); return 'bool'; }
          if ((e.op === '-' || e.op === '+') && t === 'string') err(e.line, e.col, 'CS0023', 'Der Operator "' + e.op + '" kann nicht auf einen Operanden vom Typ "string" angewendet werden');
          if (t === 'char' || t === 'byte' || t === 'short') return 'int';
          return t;
        }
        case 'Cast': {
          checkType(e.typeRef, fn);
          const from = expr(e.expr, sc, fn);
          const to = typeStr(e.typeRef);
          if (from && to && (from === 'string' && isNumT(to) || to === 'string' && isNumT(from) || from === 'bool' && isNumT(to) || isNumT(from) && to === 'bool')) {
            err(e.line, e.col, 'CS0030', 'Der Typ "' + from + '" kann nicht in "' + to + '" konvertiert werden');
          }
          return to;
        }
        case 'Cond': {
          const t = expr(e.test, sc, fn);
          checkCond(t, e.test);
          const a = expr(e.a, sc, fn), b = expr(e.b, sc, fn);
          if (a && b && a === b) return a;
          if (a && b && isNumT(a) && isNumT(b)) return promoteT(a, b);
          return null;
        }
        case 'Assign': return assignExpr(e, sc, fn);
        case 'IncDec': {
          const t = expr(e.operand, sc, fn);
          if (t === 'string' || t === 'bool') err(e.line, e.col, 'CS0023', 'Der Operator "' + e.op + '" kann nicht auf einen Operanden vom Typ "' + t + '" angewendet werden');
          return t;
        }
        case 'Is': { expr(e.expr, sc, fn); pattern(e.pattern, sc, fn); return 'bool'; }
        case 'As': { expr(e.expr, sc, fn); checkType(e.typeRef, fn); return null; }
        case 'Lambda': {
          const inner = new Sc(sc, true);
          const f2 = Object.assign({}, fn, { inLambda: true, ret: undefined, inLambdaBody: true });
          for (const p of e.params) { if (p.type) checkType(p.type, fn); declare(inner, p.name, typeStr(p.type), null, 'lparam', f2); }
          if (e.body.type === 'Block') block(e.body.stmts, inner, f2); else expr(e.body, inner, f2);
          return null;
        }
        case 'SwitchExpr': {
          expr(e.expr, sc, fn);
          for (const arm of e.arms) {
            const s2 = new Sc(sc);
            pattern(arm.pattern, s2, fn);
            if (arm.when) expr(arm.when, s2, fn);
            expr(arm.result, s2, fn);
          }
          return null;
        }
        case 'TypeOf': checkType(e.typeRef, fn); return null;
        case 'Default': if (e.typeRef) checkType(e.typeRef, fn); return null;
        case 'Tuple': e.elems.forEach((x) => expr(x.expr, sc, fn)); return null;
        case 'Throw': expr(e.expr, sc, fn); return null;
        case 'With': expr(e.expr, sc, fn); e.init.items.forEach((it) => expr(it.expr, sc, fn)); return null;
        case 'FromEnd': expr(e.expr, sc, fn); return null;
        case 'Range': expr(e.from, sc, fn); expr(e.to, sc, fn); return null;
        case 'DeclOut': declare(sc, e.name, typeStr(e.declType), e, 'pattern', fn); if (e.declType) checkType(e.declType, fn); return typeStr(e.declType);
      }
      return null;
    }

    function initExprs(init, sc, fn) {
      for (const it of init.items) {
        if (it.kind === 'member') expr(it.expr, sc, fn);
        else if (it.kind === 'index') { expr(it.index, sc, fn); expr(it.expr, sc, fn); }
        else it.exprs.forEach((x) => expr(x, sc, fn));
      }
    }

    function checkCond(t, node) {
      if (t && t !== 'bool' && t !== 'null' && (isNumT(t) || t === 'string')) err(node.line, node.col, 'CS0029', 'Der Typ "' + t + '" kann nicht implizit in "bool" konvertiert werden');
    }

    function binaryExpr(e, sc, fn) {
      const a = expr(e.left, sc, fn), b = expr(e.right, sc, fn);
      const op = e.op;
      const errOp = () => err(e.opLine || e.line, e.opCol || e.col, 'CS0019', 'Der Operator "' + op + '" kann nicht auf Operanden vom Typ "' + a + '" und "' + b + '" angewendet werden');
      switch (op) {
        case '&&': case '||':
          if (a && b && (a !== 'bool' || b !== 'bool') && (isNumT(a) || a === 'string' || isNumT(b) || b === 'string')) errOp();
          return 'bool';
        case '==': case '!=':
          if (a && b && a !== 'null' && b !== 'null' && ((a === 'string') !== (b === 'string') && (isNumT(a) || isNumT(b) || a === 'bool' || b === 'bool') || (a === 'bool') !== (b === 'bool') && (isNumT(a) || isNumT(b)))) errOp();
          return 'bool';
        case '<': case '>': case '<=': case '>=':
          if (a && b && (a === 'string' || b === 'string' || a === 'bool' || b === 'bool') && a !== 'null' && b !== 'null') errOp();
          return 'bool';
        case '+':
          if (a === 'string' || b === 'string') return 'string';
          if (a && b && (a === 'bool' || b === 'bool') && (isNumT(a) || isNumT(b) || a === b)) { errOp(); return null; }
          return promoteT(a, b);
        case '-': case '*': case '/': case '%':
          if (a && b && (a === 'string' || b === 'string' || a === 'bool' || b === 'bool') && a !== 'null' && b !== 'null') { errOp(); return null; }
          return promoteT(a, b);
        case '??': return a && a !== 'null' ? a : b;
        case '&': case '|': case '^':
          if (a === 'bool' && b === 'bool') return 'bool';
          return promoteT(a, b);
        case '<<': case '>>': return a === 'long' ? 'long' : 'int';
      }
      return null;
    }

    function assignExpr(e, sc, fn) {
      const l = e.left;
      let lt;
      if (l.type === 'Tuple' || l.type === 'DeclTuple') { l.elems.forEach((x) => expr(x.expr, sc, fn)); expr(e.right, sc, fn); return null; }
      lt = expr(l, sc, fn);
      const rt = expr(e.right, sc, fn);
      if (e.op === '=') {
        if (lt && rt) checkAssign(rt, lt, e.right, e.right.type === 'Lit');
      } else if (lt && rt) {
        const bop = e.op.slice(0, -1);
        if (bop === '+' && lt === 'string') return lt;
        if ((lt === 'string' || rt === 'string' || lt === 'bool' || rt === 'bool') && bop !== '??' && !(bop === '+' && (lt === 'string')) && !((bop === '&' || bop === '|' || bop === '^') && lt === 'bool' && rt === 'bool')) {
          err(e.line, e.col, 'CS0019', 'Der Operator "' + bop + '" kann nicht auf Operanden vom Typ "' + lt + '" und "' + rt + '" angewendet werden');
        }
      }
      return lt;
    }

    function memberExpr(e, sc, fn) {
      // Spezialfall: Namespace-/Typketten
      if (e.obj.type === 'Ident' && !lookupVar(sc, e.obj.name) && !(fn.cls && memberOf(fn.cls, e.obj.name))) {
        const uc = userClass(e.obj.name, fn);
        if (uc) {
          const m = memberOf(uc, e.name);
          if (!m && !(uc.isEnum && uc.enumDecl && uc.enumDecl.some((x) => x.name === e.name)) && allMembersKnown(uc) && !OBJECT_MEMBERS.has(e.name)) {
            err(e.nameLine, e.nameCol, 'CS0117', '"' + uc.name + '" enthält keine Definition für "' + e.name + '"');
          } else if (m && m.kind !== 'type' && m.kind !== 'enum' && !m.isStatic && !uc.isEnum) {
            err(e.nameLine, e.nameCol, 'CS0120', 'Für das nicht statische Feld, die Methode oder die Eigenschaft "' + uc.name + '.' + e.name + (m.kind === 'method' ? '()' : '') + '" ist ein Objektverweis erforderlich');
          } else if (m) accessCheck(m, e.name, e, fn);
          if (uc.isEnum) return uc.name;
          return m ? (m.type || null) : null;
        }
        const info = nameInfo(e.obj, sc, fn);
        void info;
        if (e.obj.name === 'string' || e.obj.name === 'String') return null;
        return null;
      }
      const t = expr(e.obj, sc, fn);
      if (t === 'string' && (e.name === 'Length')) return 'int';
      if (t && userClass(t, fn)) {
        const uc = userClass(t, fn);
        const m = memberOf(uc, e.name);
        if (!m && allMembersKnown(uc) && !OBJECT_MEMBERS.has(e.name) && !uc.anon && !uc.isInterface && !uc.isEnum && !S0.ext.some((x) => x.name === e.name)) {
          err(e.nameLine, e.nameCol, 'CS1061', '"' + uc.name + '" enthält keine Definition für "' + e.name + '", und es konnte keine zugängliche "' + e.name + '"-Erweiterungsmethode gefunden werden, die ein erstes Argument vom Typ "' + uc.name + '" akzeptiert (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
        } else if (m) accessCheck(m, e.name, e, fn);
        return m ? (m.type || null) : null;
      }
      return null;
    }

    function arityOk(params, n, named) {
      let required = 0;
      const hasParams = params.length && params[params.length - 1].mods.has('params');
      for (const p of params) if (!p.default && !p.mods.has('params')) required++;
      if (n + named < required) return false;
      if (n > params.length && !hasParams) return false;
      return true;
    }

    function checkArity(cands, args, node, name, kind) {
      const n = args.filter((a) => !a.name).length;
      const nm = args.filter((a) => a.name).length;
      if (!cands.length) return;
      if (cands.some((c) => arityOk(c.params, n, nm))) {
        // genau ein Kandidat: Argumenttypen prüfen
        if (cands.length === 1) {
          const ps = cands[0].params;
          args.forEach((a, i) => {
            if (a.name || a.ref || !ps[i] || ps[i].mods.has('params') || ps[i].mods.has('ref') || ps[i].mods.has('out')) return;
            const at = a.type_;
            const pt = typeStr(ps[i].type);
            if (!at || !pt) return;
            const c = conv(at, pt);
            if (c === 'no' || (c === 'explicit' && !(a.expr.type === 'Lit' && at === 'int'))) {
              err(a.expr.line, a.expr.col, 'CS1503', 'Argument ' + (i + 1) + ': Der Typ "' + at + '" kann nicht in "' + pt + '" konvertiert werden');
            }
          });
        }
        return;
      }
      if (kind === 'ctor') err(node.line, node.col, 'CS1729', '"' + name + '" enthält keinen Konstruktor, der ' + (n + nm) + ' Argumente akzeptiert');
      else if (cands.length === 1) {
        const c = cands[0];
        let required = 0; for (const p of c.params) if (!p.default && !p.mods.has('params')) required++;
        if (n + nm < required) {
          const missing = c.params.find((p, i) => !p.default && !p.mods.has('params') && i >= n);
          err(node.line, node.col, 'CS7036', 'Es wurde kein Argument angegeben, das dem erforderlichen Parameter "' + (missing ? missing.name : '?') + '" von "' + name + '" entspricht');
        } else err(node.line, node.col, 'CS1501', 'Keine Überladung für die "' + name + '"-Methode akzeptiert ' + (n + nm) + ' Argumente');
      } else err(node.line, node.col, 'CS1501', 'Keine Überladung für die "' + name + '"-Methode akzeptiert ' + (n + nm) + ' Argumente');
    }

    function callExpr(e, sc, fn) {
      const tgt = e.target;
      // Argumente zuerst (Typen merken)
      for (const a of e.args) a.type_ = expr(a.expr, sc, fn);
      if (tgt.type === 'Ident') {
        if (tgt.name === 'nameof') return 'string';
        const v = lookupVar(sc, tgt.name);
        if (v) return null;
        const info = nameInfo(tgt, sc, fn);
        if (info.member && info.member.kind === 'method') {
          const ms = info.member.methods;
          checkArity(ms, e.args, e, tgt.name, 'method');
          const rets = new Set(ms.map((m) => typeStr(m.ret)));
          if (rets.size === 1) { const r = [...rets][0]; return r === 'void' ? 'void' : r; }
          return null;
        }
        return null;
      }
      if (tgt.type === 'Member') {
        const o = tgt.obj;
        const name = tgt.name;
        // statische Aufrufe auf Benutzerklassen oder bekannte Typen
        if (o.type === 'Ident' && !lookupVar(sc, o.name) && !(fn.cls && memberOf(fn.cls, o.name))) {
          const uc = userClass(o.name, fn);
          if (uc) {
            const m = memberOf(uc, name);
            if (!m && !uc.isEnum && allMembersKnown(uc) && !OBJECT_MEMBERS.has(name) && !S0.ext.some((x) => x.name === name)) err(tgt.nameLine, tgt.nameCol, 'CS0117', '"' + uc.name + '" enthält keine Definition für "' + name + '"');
            else if (m && m.kind === 'method') {
              if (!m.isStatic) err(tgt.nameLine, tgt.nameCol, 'CS0120', 'Für das nicht statische Feld, die Methode oder die Eigenschaft "' + uc.name + '.' + name + '()" ist ein Objektverweis erforderlich');
              checkArity(m.methods, e.args, e, name, 'method');
              accessCheck(m, name, tgt, fn);
              const rets = new Set(m.methods.map((x) => typeStr(x.ret)));
              return rets.size === 1 ? [...rets][0] : null;
            }
            return null;
          }
          nameInfo(o, sc, fn);
          return builtinCallType(o.name, name, e.args);
        }
        const t = expr(o, sc, fn);
        if (t === 'string') {
          if (['ToUpper', 'ToLower', 'Trim', 'Substring', 'Replace', 'PadLeft', 'PadRight', 'TrimStart', 'TrimEnd', 'Insert', 'Remove', 'ToString'].includes(name)) return 'string';
          if (['IndexOf', 'LastIndexOf', 'CompareTo'].includes(name)) return 'int';
          if (['Contains', 'StartsWith', 'EndsWith', 'Equals'].includes(name)) return 'bool';
          return null;
        }
        if (t && userClass(t, fn)) {
          const uc = userClass(t, fn);
          const m = memberOf(uc, name);
          if (!m && allMembersKnown(uc) && !OBJECT_MEMBERS.has(name) && !uc.isEnum && !S0.ext.some((x) => x.name === name)) {
            err(tgt.nameLine, tgt.nameCol, 'CS1061', '"' + uc.name + '" enthält keine Definition für "' + name + '", und es konnte keine zugängliche "' + name + '"-Erweiterungsmethode gefunden werden, die ein erstes Argument vom Typ "' + uc.name + '" akzeptiert (Fehlt eine using-Direktive oder ein Assemblyverweis?)');
            return null;
          }
          if (m && m.kind === 'method') {
            checkArity(m.methods, e.args, e, name, 'method');
            accessCheck(m, name, tgt, fn);
            const rets = new Set(m.methods.map((x) => typeStr(x.ret)));
            return rets.size === 1 ? [...rets][0] : null;
          }
          if (m) accessCheck(m, name, tgt, fn);
        }
        return null;
      }
      expr(tgt, sc, fn);
      return null;
    }

    function builtinCallType(type, name, args) {
      const at = args.map((a) => a.type_);
      switch (type) {
        case 'Math':
          if (MATH_DBL.has(name)) return 'double';
          if (name === 'Abs' || name === 'Max' || name === 'Min') return at.length && at.every((x) => x && isNumT(x)) ? at.reduce((a, b) => promoteT(a, b)) : null;
          if (name === 'Round') return at[0] === 'decimal' ? 'decimal' : 'double';
          return null;
        case 'int': case 'Int32': if (name === 'Parse') return 'int'; return null;
        case 'double': case 'Double': if (name === 'Parse') return 'double'; return null;
        case 'Convert':
          return { ToInt32: 'int', ToDouble: 'double', ToString: 'string', ToInt64: 'long', ToBoolean: 'bool', ToDecimal: 'decimal', ToChar: 'char' }[name] || null;
        case 'string': case 'String': return name === 'Join' || name === 'Format' || name === 'Concat' ? 'string' : null;
        case 'Console': return name === 'ReadLine' ? 'string' : name === 'ReadKey' ? null : (name === 'WriteLine' || name === 'Write') ? 'void' : null;
      }
      return null;
    }

    /* ---------- Muster ---------- */
    function pattern(p, sc, fn) {
      if (!p) return;
      switch (p.k) {
        case 'type': checkType(p.type, fn); if (p.name) declare(sc, p.name, typeStr(p.type), null, 'pattern', fn); break;
        case 'var': declare(sc, p.name, null, null, 'pattern', fn); break;
        case 'const': expr(p.expr, sc, fn); break;
        case 'rel': expr(p.expr, sc, fn); break;
        case 'and': case 'or': pattern(p.l, sc, fn); pattern(p.r, sc, fn); break;
        case 'not': pattern(p.p, sc, fn); break;
        case 'prop': if (p.type) checkType(p.type, fn); p.props.forEach((x) => pattern(x.pattern, sc, fn)); if (p.name) declare(sc, p.name, null, null, 'pattern', fn); break;
        case 'pos': if (p.type) checkType(p.type, fn); p.items.forEach((x) => pattern(x, sc, fn)); if (p.name) declare(sc, p.name, null, null, 'pattern', fn); break;
      }
    }

    /* ---------- Anweisungen ---------- */
    function block(stmts, sc, fn) {
      // lokale Funktionen sind im ganzen Block sichtbar
      for (const s of stmts) if (s.type === 'LocalFunc') declare(sc, s.name, null, null, 'func', fn);
      for (const s of stmts) stmt(s, sc, fn);
    }

    function stmt(s, sc, fn) {
      switch (s.type) {
        case 'Block': block(s.stmts, new Sc(sc), fn); break;
        case 'Local': {
          checkType(s.varType, fn);
          const isVar = s.varType.k === 'name' && s.varType.name === 'var';
          const dt = isVar ? null : typeStr(s.varType);
          for (const d of s.decls) {
            let it = null;
            if (d.init) {
              it = expr(d.init, sc, fn);
              if (!isVar && dt && it) checkAssign(it, dt, d.init, d.init.type === 'Lit');
            }
            declare(sc, d.name, isVar ? (it === 'null' ? null : it) : dt, d, 'local', fn);
          }
          break;
        }
        case 'LocalTuple': {
          expr(s.init, sc, fn);
          s.names.forEach((n, i) => declare(sc, n, s.types ? typeStr(s.types[i]) : null, s, 'local', fn));
          break;
        }
        case 'ExprStmt': expr(s.expr, sc, fn); break;
        case 'If': {
          const t = expr(s.cond, sc, fn);
          checkCond(t, s.cond);
          stmt(s.then, new Sc(sc), fn);
          if (s.els) stmt(s.els, new Sc(sc), fn);
          break;
        }
        case 'While': { const s2 = new Sc(sc); checkCond(expr(s.cond, s2, fn), s.cond); stmt(s.body, s2, fn); break; }
        case 'DoWhile': { stmt(s.body, new Sc(sc), fn); checkCond(expr(s.cond, sc, fn), s.cond); break; }
        case 'For': {
          const s2 = new Sc(sc);
          s.init.forEach((i) => stmt(i, s2, fn));
          if (s.cond) checkCond(expr(s.cond, s2, fn), s.cond);
          s.iters.forEach((i) => expr(i, s2, fn));
          stmt(s.body, s2, fn);
          break;
        }
        case 'Foreach': {
          expr(s.expr, sc, fn);
          const s2 = new Sc(sc);
          if (s.varType) checkType(s.varType, fn);
          if (s.names) s.names.forEach((n) => declare(s2, n, null, s, 'local', fn));
          else declare(s2, s.name, s.varType.name === 'var' ? null : typeStr(s.varType), s, 'local', fn);
          stmt(s.body, s2, fn);
          break;
        }
        case 'Switch': {
          expr(s.expr, sc, fn);
          const s2 = new Sc(sc);
          for (const sec of s.sections) {
            for (const lb of sec.labels) if (!lb.isDefault) { pattern(lb.pattern, s2, fn); if (lb.when) expr(lb.when, s2, fn); }
            block(sec.stmts, s2, fn);
          }
          break;
        }
        case 'Return': {
          if (fn.ret === undefined) { if (s.expr) expr(s.expr, sc, fn); break; }
          const isVoid = fn.ret && fn.ret.k === 'name' && fn.ret.name === 'void';
          if (s.expr) {
            const t = expr(s.expr, sc, fn);
            if (isVoid && !fn.isCtor) err(s.line, s.col, 'CS0127', 'Da "' + fn.display + '" void zurückgibt, darf auf das return-Schlüsselwort kein Objektausdruck folgen');
            else if (!isVoid && fn.ret && t) checkAssign(t, typeStr(fn.ret), s.expr, s.expr.type === 'Lit');
          } else if (fn.ret && !isVoid && !fn.isCtor) {
            err(s.line, s.col, 'CS0126', 'Ein Objekt des Typs "' + (typeStr(fn.ret) || 'object') + '" muss zurückgegeben werden, da "' + fn.display + '" einen Rückgabetyp ungleich void hat');
          }
          break;
        }
        case 'Throw': if (s.expr) expr(s.expr, sc, fn); break;
        case 'Try': {
          stmt(s.block, sc, fn);
          for (const c of s.catches) {
            const s2 = new Sc(sc);
            if (c.type) checkType(c.type, fn);
            if (c.name) declare(s2, c.name, null, c, 'local', fn);
            if (c.when) expr(c.when, s2, fn);
            stmt(c.block, s2, fn);
          }
          if (s.fin) stmt(s.fin, sc, fn);
          break;
        }
        case 'Using': { const s2 = new Sc(sc); if (s.decl) stmt(s.decl, s2, fn); else expr(s.expr, s2, fn); stmt(s.body, s2, fn); break; }
        case 'UsingDecl': stmt(s.decl, sc, fn); break;
        case 'Lock': expr(s.expr, sc, fn); stmt(s.body, new Sc(sc), fn); break;
        case 'LocalFunc': {
          const inner = new Sc(sc, true);
          const f2 = Object.assign({}, fn, { inLambda: true, ret: s.ret, display: s.name, isCtor: false });
          s.params.forEach((p) => { checkType(p.type, fn); declare(inner, p.name, typeStr(p.type), null, 'lparam', f2); });
          if (s.body) block(s.body.stmts, inner, f2); else expr(s.expr, inner, f2);
          break;
        }
        case 'LocalType': break;
      }
    }

    /* Kann die Anweisung "normal" enden? (konservativ: im Zweifel nein) */
    function canComplete(s) {
      if (!s) return true;
      switch (s.type) {
        case 'Return': case 'Throw': return false;
        case 'Block': {
          for (const x of s.stmts) if (!canComplete(x)) return false;
          return true;
        }
        case 'If': return !s.els ? true : (canComplete(s.then) || canComplete(s.els));
        case 'While': return !(s.cond.type === 'Lit' && s.cond.value === true) ? true : containsBreak(s.body);
        case 'DoWhile': return containsBreak(s.body) || !(s.cond.type === 'Lit' && s.cond.value === true);
        case 'For': return s.cond ? !(s.cond.type === 'Lit' && s.cond.value === true) || containsBreak(s.body) : containsBreak(s.body);
        case 'Switch': {
          const hasDefault = s.sections.some((x) => x.labels.some((l) => l.isDefault));
          if (!hasDefault) return true;
          for (const sec of s.sections) {
            const last = sec.stmts[sec.stmts.length - 1];
            if (sec.stmts.some((x) => containsBreak(x, true))) return true;
            if (!last) return true;
            if (canComplete({ type: 'Block', stmts: sec.stmts })) return true;
          }
          return false;
        }
        case 'Try': {
          if (s.fin && !canComplete(s.fin)) return false;
          if (canComplete(s.block)) return true;
          return s.catches.some((c) => canComplete(c.block));
        }
        case 'Using': case 'Lock': return canComplete(s.body);
        case 'Foreach': return true;
        default: return true;
      }
    }
    function containsBreak(s, shallow) {
      if (!s) return false;
      switch (s.type) {
        case 'Break': return true;
        case 'Block': return s.stmts.some((x) => containsBreak(x, shallow));
        case 'If': return containsBreak(s.then, shallow) || containsBreak(s.els, shallow);
        case 'Try': return containsBreak(s.block, shallow) || s.catches.some((c) => containsBreak(c.block, shallow)) || containsBreak(s.fin, shallow);
        case 'Using': case 'Lock': return containsBreak(s.body, shallow);
        case 'Switch': return false;
        default: return false;
      }
    }

    /* ---------- Klassen ---------- */
    function checkMethod(m, cls, tparams) {
      const fn = { cls: cls, isStatic: m.isStatic, ret: m.ret, display: cls.name + '.' + m.name + '(' + m.params.map((p) => typeStr(p.type) || 'object').join(', ') + ')', tparams: tparams, isCtor: false };
      const sc = new Sc(null, true);
      if (m.ret) checkType(m.ret, fn);
      const seen = new Set();
      for (const p of m.params) {
        checkType(p.type, fn);
        if (seen.has(p.name)) err(p.line, p.col, 'CS0100', 'Der Parametername "' + p.name + '" ist ein Duplikat');
        seen.add(p.name);
        declare(sc, p.name, typeStr(p.type), null, 'param', fn);
        if (p.default) expr(p.default, sc, fn);
      }
      if (m.expr) {
        const t = expr(m.expr, sc, fn);
        const isVoid = m.ret && m.ret.k === 'name' && m.ret.name === 'void';
        if (!isVoid && m.ret && t && t !== 'void') checkAssign(t, typeStr(m.ret), m.expr, m.expr.type === 'Lit');
      } else if (m.body) {
        block(m.body.stmts, sc, fn);
        const isVoid = m.ret && m.ret.k === 'name' && m.ret.name === 'void';
        if (m.ret && !isVoid && canComplete(m.body)) {
          err(m.body.endLine || m.line, 1, 'CS0161', '"' + fn.display + '": Nicht alle Codepfade geben einen Wert zurück');
        }
      }
    }

    function checkClass(cls) {
      file = cls.file;
      const tparams = new Set(cls.typeParams);
      const usingsHere = usings;
      void usingsHere;
      const decl = cls.decl;
      for (const m of decl.members) {
        switch (m.type) {
          case 'Field': {
            const fn = { cls: cls, isStatic: m.mods.has('static') || m.mods.has('const'), ret: undefined, tparams: tparams };
            checkType(m.valType, fn);
            const dt = typeStr(m.valType);
            for (const d of m.decls) {
              if (d.init) {
                const t = expr(d.init, new Sc(null, true), fn);
                if (dt && t) checkAssign(t, dt, d.init, d.init.type === 'Lit');
              }
            }
            break;
          }
          case 'Property': {
            const fn = { cls: cls, isStatic: m.mods.has('static'), ret: undefined, tparams: tparams };
            checkType(m.valType, fn);
            const dt = typeStr(m.valType);
            const sc = new Sc(null, true);
            if (m.init) { const t = expr(m.init, sc, fn); if (dt && t) checkAssign(t, dt, m.init, m.init.type === 'Lit'); }
            if (m.expr) { const t = expr(m.expr, sc, fn); if (dt && t) checkAssign(t, dt, m.expr, m.expr.type === 'Lit'); }
            const body = (acc, isSet) => {
              if (!acc || acc === true) return;
              const sc2 = new Sc(null, true);
              if (isSet) declare(sc2, 'value', dt, null, 'param', fn);
              const f2 = Object.assign({}, fn, { ret: isSet ? { k: 'name', name: 'void', args: [] } : m.valType, display: cls.name + '.' + m.name });
              if (acc.type === 'Block') block(acc.stmts, sc2, f2); else expr(acc.expr, sc2, f2);
            };
            body(m.get, false); body(m.set, true);
            break;
          }
          case 'Method': {
            const meth = { name: m.name, params: m.params, body: m.body, expr: m.expr, ret: m.ret, isStatic: m.mods.has('static'), line: m.line };
            checkMethod(meth, cls, new Set([...tparams, ...(m.typeParams || [])]));
            break;
          }
          case 'Ctor': {
            const fn = { cls: cls, isStatic: m.mods.has('static'), ret: { k: 'name', name: 'void', args: [] }, display: cls.name + '.' + cls.name + '()', tparams: tparams, isCtor: true };
            const sc = new Sc(null, true);
            for (const p of m.params) { checkType(p.type, fn); declare(sc, p.name, typeStr(p.type), null, 'param', fn); if (p.default) expr(p.default, sc, fn); }
            if (m.init) m.init.args.forEach((a) => expr(a.expr, sc, fn));
            if (m.body) block(m.body.stmts, sc, fn);
            break;
          }
          case 'Operator': {
            const fn = { cls: cls, isStatic: true, ret: m.ret, display: cls.name + '.operator ' + m.op, tparams: tparams };
            const sc = new Sc(null, true);
            for (const p of m.params) declare(sc, p.name, typeStr(p.type), null, 'param', fn);
            if (m.body) block(m.body.stmts, sc, fn); else if (m.expr) expr(m.expr, sc, fn);
            break;
          }
          case 'Indexer': {
            const fn = { cls: cls, isStatic: false, ret: undefined, tparams: tparams };
            const sc = new Sc(null, true);
            for (const p of m.params) declare(sc, p.name, typeStr(p.type), null, 'param', fn);
            const sc2 = new Sc(sc, true); declare(sc2, 'value', typeStr(m.valType), null, 'param', fn);
            for (const acc of [m.get, m.set]) if (acc && acc !== true) { if (acc.type === 'Block') block(acc.stmts, sc2, fn); else expr(acc.expr, sc2, fn); }
            if (m.expr) expr(m.expr, sc, fn);
            break;
          }
        }
      }
      if (decl.recordParams) decl.recordParams.forEach((p) => checkType(p.type, { cls: cls, tparams: tparams }));
      // Basisklassen-Check: abstrakte Methoden implementiert?
      if (!cls.isAbstract && !cls.isInterface && !cls.isEnum && cls.base && !cls.base.builtin) {
        for (let b = cls.base; b && !b.builtin; b = b.base) {
          for (const [name, ms] of b.methods) {
            for (const am of ms) {
              if (am.mods.has('abstract')) {
                const impl = CS.findMethods(cls, name).find((x) => x !== am && x.mods.has('override') && x.params.length === am.params.length);
                if (!impl) err(decl.line, decl.col, 'CS0534', '"' + cls.name + '" implementiert den geerbten abstrakten Member "' + b.name + '.' + name + '(' + am.params.map((p) => typeStr(p.type) || 'object').join(', ') + ')" nicht');
              }
            }
          }
        }
      }
      // Schnittstellen implementiert?
      if (!cls.isInterface && !cls.isAbstract && !cls.isEnum) {
        for (const i of cls.interfaces) {
          if (!(i instanceof CS.CClass) || i.builtin) continue;
          for (const [name, ms] of i.methods) {
            for (const im of ms) {
              if (im.body || im.expr) continue;
              const impl = CS.findMethods(cls, name).find((x) => x.cls !== i && x.params.length === im.params.length);
              if (!impl && !(cls.props.has(name))) err(decl.line, decl.col, 'CS0535', '"' + cls.name + '" implementiert den Schnittstellenmember "' + i.name + '.' + name + '(' + im.params.map((p) => typeStr(p.type) || 'object').join(', ') + ')" nicht');
            }
          }
          for (const [name, p] of i.props) {
            if (!cls.props.has(name) && !CS.findMethods(cls, 'get_' + name).length) {
              let found = false;
              for (let c = cls; c; c = c.base) if (c.props.has(name) || c.fields.some((f) => f.name === name)) found = true;
              if (!found && !(cls.recordProps && cls.recordProps.some((r) => r.name === name))) err(decl.line, decl.col, 'CS0535', '"' + cls.name + '" implementiert den Schnittstellenmember "' + i.name + '.' + name + '" nicht');
            }
          }
        }
      }
    }

    // using-Direktiven je Datei
    const fileUsings = new Map();
    for (const u of units) { const set = new Set(IMPLICIT_USINGS); for (const us of u.usings) set.add(us.name); fileUsings.set(u.file, set); }

    for (const c of S0.allClasses) {
      if (c.builtin) continue;
      usings = fileUsings.get(c.file) || IMPLICIT_USINGS;
      // Mitglieder-Modifikatoren für Felder merken (für Zugriffsprüfung)
      const decl = c.decl;
      for (const m of decl.members) {
        if (m.type === 'Field') {
          for (const d of m.decls) {
            const f = c.fields.find((x) => x.name === d.name);
            if (f) f.mods = m.mods;
            if (c.sfields.has(d.name)) { c.sfieldMods = c.sfieldMods || new Map(); c.sfieldMods.set(d.name, m.mods); }
          }
        }
      }
    }
    for (const c of S0.allClasses) {
      if (c.builtin) continue;
      usings = fileUsings.get(c.file) || IMPLICIT_USINGS;
      checkClass(c);
    }
    // Top-Level-Anweisungen
    if (topStmts.length) {
      const progCls = { name: 'Program', nested: new Map(), fields: [], sfields: new Map(), props: new Map(), methods: new Map(), base: null, interfaces: [], builtin: false, outer: null, isStatic: true };
      const sc = new Sc(null, true);
      declare(sc, 'args', 'string[]', null, 'param', null);
      const fn = { cls: progCls, isStatic: true, ret: { k: 'name', name: 'int', args: [] }, display: 'Program.<Main>$(string[])', tparams: new Set(), isTopLevel: true };
      fn.ret = undefined;
      const stmts = topStmts.map((t) => t.stmt);
      for (const t of topStmts) if (t.stmt.type === 'LocalFunc') declare(sc, t.stmt.name, null, null, 'func', fn);
      for (const t of topStmts) { file = t.file; usings = fileUsings.get(t.file) || IMPLICIT_USINGS; stmt(t.stmt, sc, fn); }
      void stmts;
    }
    errs.sort((a, b) => (a.file === b.file ? (a.line - b.line || a.col - b.col) : (a.file < b.file ? -1 : 1)));
    return errs;
  };
})(typeof window !== 'undefined' ? window : globalThis);
