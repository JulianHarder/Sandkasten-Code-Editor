/* Python-Interpreter: führt den Syntaxbaum Schritt für Schritt (als Generator) aus. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const PY = KON.py = KON.py || {};
  const { PyClass, PyInstance, Tuple, PyDict, PySet, PyRange, PyFunction, Builtin, BoundMethod, PyModule,
    StaticMethod, ClassMethod, Property, SuperProxy, PyIter, PyThrow, ExitSignal, PyGen } = PY;
  const TICK = KON.TICK;

  class PySlice { constructor(a, b, c) { this.lower = a; this.upper = b; this.step = c; } }
  PY.PySlice = PySlice;

  const BAIL = { bail: true };
  const BREAK = { k: 'break' };
  const CONTINUE = { k: 'continue' };
  class Ret { constructor(v) { this.v = v; } }

  /* ---------- Laufzeit-Zustand (ein Lauf zur Zeit) ---------- */
  let S = null;
  PY.getState = () => S;

  PY.captureTb = function () {
    if (!S) return [];
    return S.frames.map((f) => ({ file: f.file, line: f.line, fn: f.fn }));
  };

  class Env {
    constructor(kind, parent, moduleEnv) {
      this.kind = kind; // 'module' | 'func' | 'class' | 'comp'
      this.parent = parent;
      this.vars = new Map();
      this.moduleEnv = moduleEnv || this;
      this.locals = null; this.globals = null; this.nonlocals = null;
      this.fn = null;
    }
  }
  PY.Env = Env;

  /* ---------- Namen ---------- */
  function lookup(env, name) {
    let e = env, first = true;
    while (e) {
      if (e.kind === 'class' && !first) { e = e.parent; continue; }
      if (e.globals !== null && e.globals.has(name)) { e = e.moduleEnv; first = false; if (e.kind === 'module') { const v = e.vars.get(name); if (v !== undefined) return v; break; } continue; }
      const v = e.vars.get(name);
      if (v !== undefined) return v;
      if (e.kind === 'func' && e.locals !== null && e.locals.has(name) && (e.nonlocals === null || !e.nonlocals.has(name))) {
        PY.raise('UnboundLocalError', "cannot access local variable '" + name + "' where it is not associated with a value");
      }
      e = e.parent; first = false;
    }
    const b = PY.builtinsMap.get(name);
    if (b !== undefined) return b;
    PY.raise('NameError', "name '" + name + "' is not defined");
  }
  PY.lookup = lookup;

  function assignName(env, name, value) {
    if (env.kind === 'func') {
      if (env.globals !== null && env.globals.has(name)) { env.moduleEnv.vars.set(name, value); return; }
      if (env.nonlocals !== null && env.nonlocals.has(name)) {
        let e = env.parent;
        while (e) {
          if (e.kind !== 'class' && e.vars.has(name)) { e.vars.set(name, value); return; }
          e = e.parent;
        }
        PY.raise('SyntaxError', "no binding for nonlocal '" + name + "' found");
      }
    }
    env.vars.set(name, value);
  }

  /* Lokale Namen einer Funktion bestimmen */
  function collectLocals(body, params) {
    const locals = new Set(), globals = new Set(), nonlocals = new Set();
    for (const p of params) locals.add(p.name);
    function target(t) {
      if (!t) return;
      switch (t.type) {
        case 'Name': locals.add(t.id); break;
        case 'Tuple': case 'List': t.elts.forEach(target); break;
        case 'Starred': target(t.value); break;
      }
    }
    function walkExpr(e) {
      // nur Walrus-Ausdrücke binden Namen innerhalb von Ausdrücken
      if (!e || typeof e !== 'object') return;
      if (Array.isArray(e)) { e.forEach(walkExpr); return; }
      if (e.type === 'NamedExpr') locals.add(e.target.id);
      if (e.type === 'Lambda') return;
      for (const k in e) {
        if (k === 'line' || k === 'col' || k === 'type') continue;
        const v = e[k];
        if (v && typeof v === 'object') walkExpr(v);
      }
    }
    function walk(stmts) {
      for (const s of stmts) {
        switch (s.type) {
          case 'Assign': s.targets.forEach(target); walkExpr(s.value); break;
          case 'AugAssign': target(s.target); break;
          case 'AnnAssign': if (s.value) target(s.target); break;
          case 'For': target(s.target); walk(s.body); walk(s.orelse); break;
          case 'While': walkExpr(s.test); walk(s.body); walk(s.orelse); break;
          case 'If': walkExpr(s.test); walk(s.body); walk(s.orelse); break;
          case 'With': s.items.forEach((it) => target(it.var)); walk(s.body); break;
          case 'Try':
            walk(s.body); s.handlers.forEach((h) => { if (h.name) locals.add(h.name); walk(h.body); });
            walk(s.orelse); walk(s.finalbody); break;
          case 'FunctionDef': case 'ClassDef': locals.add(s.name); break;
          case 'Import': s.names.forEach((n) => locals.add(n.asname || n.name.split('.')[0])); break;
          case 'ImportFrom': s.names.forEach((n) => locals.add(n.asname || n.name)); break;
          case 'Global': s.names.forEach((n) => globals.add(n)); break;
          case 'Nonlocal': s.names.forEach((n) => nonlocals.add(n)); break;
          case 'Del': s.targets.forEach(target); break;
          case 'ExprStmt': walkExpr(s.expr); break;
          case 'Return': walkExpr(s.value); break;
        }
      }
    }
    if (Array.isArray(body)) walk(body);
    else walkExpr(body);
    for (const g of globals) locals.delete(g);
    for (const g of nonlocals) locals.delete(g);
    return { locals, globals: globals.size ? globals : null, nonlocals: nonlocals.size ? nonlocals : null };
  }

  /* ---------- Reine Ausdrücke (ohne Aufrufe) werden ohne Generator berechnet ---------- */
  function isPure(n) {
    if (n.pure !== undefined) return n.pure;
    let p = false;
    switch (n.type) {
      case 'Num': case 'Str': case 'Const': case 'Name': p = true; break;
      case 'BinOp': p = isPure(n.left) && isPure(n.right); break;
      case 'UnaryOp': p = isPure(n.operand); break;
      case 'Compare': p = isPure(n.left) && n.comps.every(isPure); break;
      case 'BoolOp': p = n.values.every(isPure); break;
      case 'IfExp': p = isPure(n.test) && isPure(n.body) && isPure(n.orelse); break;
      case 'Subscript': p = isPure(n.value) && n.index.type !== 'Slice' && isPure(n.index); break;
      case 'Attribute': p = isPure(n.value); break;
      case 'Tuple': case 'List': p = n.elts.every((e) => e.type !== 'Starred' && isPure(e)); break;
    }
    n.pure = p;
    return p;
  }

  function isPrim(v) {
    const t = typeof v;
    return t === 'bigint' || t === 'string' || t === 'boolean' || t === 'number' || v === null;
  }

  function containsSync(c, item) {
    if (typeof c === 'string') return typeof item === 'string' ? c.indexOf(item) >= 0 : BAIL;
    if (!isPrim(item)) return BAIL;
    if (c instanceof PyDict) { try { return c.map.has(PY.hashKey(item)); } catch (e) { return BAIL; } }
    if (c instanceof PySet) return c.map.has(PY.hashKey(item));
    const arr = Array.isArray(c) ? c : c instanceof Tuple ? c.items : null;
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i];
        if (!isPrim(x)) return BAIL;
        if (x === item) return true;
        if (PY.isNum(x) && PY.isNum(item) && Number(x) === Number(item)) return true;
      }
      return false;
    }
    return BAIL;
  }

  function cmpPrimEq(a, b) {
    if (a === b) return a === a;
    if (PY.isNum(a) && PY.isNum(b)) {
      const x = typeof a === 'boolean' ? (a ? 1n : 0n) : a, y = typeof b === 'boolean' ? (b ? 1n : 0n) : b;
      // eslint-disable-next-line eqeqeq
      return x == y;
    }
    return false;
  }

  function evSync(n, env) {
    switch (n.type) {
      case 'Num': return n.value;
      case 'Str': return n.value;
      case 'Const': return n.value;
      case 'Name': return lookup(env, n.id);
      case 'BinOp': {
        const a = evSync(n.left, env); if (a === BAIL) return BAIL;
        const b = evSync(n.right, env); if (b === BAIL) return BAIL;
        const r = PY.binopPrim(n.op, a, b);
        return r === undefined ? BAIL : r;
      }
      case 'UnaryOp': {
        const a = evSync(n.operand, env); if (a === BAIL) return BAIL;
        if (n.op === 'not') { if (a instanceof PyInstance) return BAIL; return !PY.truth(a); }
        if (typeof a === 'bigint') return n.op === '-' ? -a : n.op === '+' ? a : ~a;
        if (typeof a === 'number') { if (n.op === '-') return -a; if (n.op === '+') return a; }
        return BAIL;
      }
      case 'BoolOp': {
        let v;
        for (let i = 0; i < n.values.length; i++) {
          v = evSync(n.values[i], env); if (v === BAIL) return BAIL;
          if (v instanceof PyInstance) return BAIL;
          const t = PY.truth(v);
          if (n.op === 'and' ? !t : t) return v;
        }
        return v;
      }
      case 'IfExp': {
        const t = evSync(n.test, env); if (t === BAIL || t instanceof PyInstance) return BAIL;
        return evSync(PY.truth(t) ? n.body : n.orelse, env);
      }
      case 'Compare': {
        let left = evSync(n.left, env); if (left === BAIL) return BAIL;
        for (let i = 0; i < n.ops.length; i++) {
          const right = evSync(n.comps[i], env); if (right === BAIL) return BAIL;
          const op = n.ops[i];
          let r;
          switch (op) {
            case 'is': r = left === right || (left === null && right === undefined); break;
            case 'is not': r = !(left === right); break;
            case '==': case '!=': {
              if (!(isPrim(left) && isPrim(right))) return BAIL;
              r = (left === right ? left === left : cmpPrimEq(left, right));
              if (op === '!=') r = !r;
              break;
            }
            case 'in': case 'not in': {
              r = containsSync(right, left); if (r === BAIL) return BAIL;
              if (op === 'not in') r = !r;
              break;
            }
            default: {
              const ta = typeof left, tb = typeof right;
              if (ta === 'string' && tb === 'string') r = op === '<' ? left < right : op === '<=' ? left <= right : op === '>' ? left > right : left >= right;
              else if (PY.isNum(left) && PY.isNum(right)) {
                const x = ta === 'boolean' ? (left ? 1n : 0n) : left, y = tb === 'boolean' ? (right ? 1n : 0n) : right;
                r = op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
              } else return BAIL;
            }
          }
          if (!r) return false;
          left = right;
        }
        return true;
      }
      case 'Subscript': {
        const o = evSync(n.value, env); if (o === BAIL) return BAIL;
        const ix = evSync(n.index, env); if (ix === BAIL) return BAIL;
        if (typeof ix === 'bigint') {
          if (Array.isArray(o)) {
            let i = Number(ix); if (i < 0) i += o.length;
            if (i < 0 || i >= o.length) PY.raise('IndexError', 'list index out of range');
            return o[i];
          }
          if (o instanceof Tuple) {
            let i = Number(ix); if (i < 0) i += o.items.length;
            if (i < 0 || i >= o.items.length) PY.raise('IndexError', 'tuple index out of range');
            return o.items[i];
          }
          if (typeof o === 'string') {
            let i = Number(ix); if (i < 0) i += o.length;
            if (i < 0 || i >= o.length) PY.raise('IndexError', 'string index out of range');
            return o[i];
          }
        }
        if (o instanceof PyDict && isPrim(ix) && !o.special) {
          const e = o.map.get(PY.hashKey(ix));
          if (e) return e[1];
        }
        return BAIL;
      }
      case 'Attribute': {
        const o = evSync(n.value, env); if (o === BAIL) return BAIL;
        if (o instanceof PyInstance) {
          const cv = PY.lookupClass(o.cls, n.attr);
          if (cv === undefined || cv instanceof PyFunction || cv instanceof Builtin) {
            const v = o.attrs.get(n.attr);
            if (v !== undefined) return v;
          }
        }
        return BAIL;
      }
      case 'Tuple': { const items = []; for (const e of n.elts) { const v = evSync(e, env); if (v === BAIL) return BAIL; items.push(v); } return new Tuple(items); }
      case 'List': { const items = []; for (const e of n.elts) { const v = evSync(e, env); if (v === BAIL) return BAIL; items.push(v); } return items; }
    }
    return BAIL;
  }

  /* ---------- Ausdrücke ---------- */
  function* ev(n, env) {
    if (n.pure === undefined) isPure(n);
    if (n.pure === true) {
      const r = evSync(n, env);
      if (r !== BAIL) return r;
    }
    switch (n.type) {
      case 'Num': return n.value;
      case 'Str': return n.value;
      case 'Const': return n.value;
      case 'Name': return lookup(env, n.id);
      case 'JoinedStr': {
        let out = '';
        for (const p of n.parts) {
          if (typeof p === 'string') { out += p; continue; }
          let v = yield* ev(p.expr, env);
          let s;
          const conv = p.conv || (p.selfDoc && !p.spec ? 'r' : null);
          if (conv === 'r') v = yield* PY.repr(v);
          else if (conv === 's') v = yield* PY.str(v);
          else if (conv === 'a') v = yield* PY.repr(v);
          if (p.spec) {
            let spec = '';
            for (const sp of p.spec) {
              if (typeof sp === 'string') spec += sp;
              else {
                const sv = yield* ev(sp.expr, env);
                spec += yield* PY.str(sv);
              }
            }
            s = yield* PY.formatValue(v, spec);
          } else s = typeof v === 'string' ? v : yield* PY.str(v);
          out += s;
        }
        return out;
      }
      case 'BinOp': {
        const a = yield* ev(n.left, env);
        const b = yield* ev(n.right, env);
        const r = PY.binopPrim(n.op, a, b);
        if (r !== undefined) return r;
        return yield* PY.binop(n.op, a, b);
      }
      case 'UnaryOp': return yield* PY.unary(n.op, yield* ev(n.operand, env));
      case 'BoolOp': {
        let v;
        for (let i = 0; i < n.values.length; i++) {
          v = yield* ev(n.values[i], env);
          const t = yield* PY.isTrue(v);
          if (n.op === 'and' ? !t : t) return v;
        }
        return v;
      }
      case 'IfExp': {
        const t = yield* ev(n.test, env);
        return yield* ev((yield* PY.isTrue(t)) ? n.body : n.orelse, env);
      }
      case 'Compare': {
        let left = yield* ev(n.left, env);
        for (let i = 0; i < n.ops.length; i++) {
          const right = yield* ev(n.comps[i], env);
          if (!(yield* compareOne(n.ops[i], left, right))) return false;
          left = right;
        }
        return true;
      }
      case 'Call': return yield* evCall(n, env);
      case 'Attribute': {
        const o = yield* ev(n.value, env);
        return yield* PY.getAttr(o, n.attr);
      }
      case 'Subscript': {
        const o = yield* ev(n.value, env);
        const ix = yield* ev(n.index, env);
        return yield* PY.getItem(o, ix);
      }
      case 'Slice': {
        const lo = n.lower ? yield* ev(n.lower, env) : null;
        const up = n.upper ? yield* ev(n.upper, env) : null;
        const st = n.step ? yield* ev(n.step, env) : null;
        return new PySlice(lo, up, st);
      }
      case 'Tuple': return new Tuple(yield* evElts(n.elts, env));
      case 'List': return yield* evElts(n.elts, env);
      case 'Set': {
        const s = new PySet(false);
        for (const x of yield* evElts(n.elts, env)) s.map.set(PY.hashKey(x), x);
        return s;
      }
      case 'Dict': {
        const d = new PyDict();
        for (let i = 0; i < n.keys.length; i++) {
          if (n.keys[i] === null) {
            const src = yield* ev(n.values[i], env);
            if (!(src instanceof PyDict)) PY.raise('TypeError', "'" + PY.typeName(src) + "' object is not a mapping");
            for (const [k, e] of src.map) d.map.set(k, e);
          } else {
            const k = yield* ev(n.keys[i], env);
            const v = yield* ev(n.values[i], env);
            d.map.set(PY.hashKey(k), [k, v]);
          }
        }
        return d;
      }
      case 'ListComp': case 'GenExp': {
        const out = [];
        yield* runComp(n.gens, 0, new Env('comp', env, env.moduleEnv), function* (e) { out.push(yield* ev(n.elt, e)); });
        if (n.type === 'GenExp') return PY.iterOfArray(out);
        return out;
      }
      case 'SetComp': {
        const s = new PySet(false);
        yield* runComp(n.gens, 0, new Env('comp', env, env.moduleEnv), function* (e) { const v = yield* ev(n.elt, e); s.map.set(PY.hashKey(v), v); });
        return s;
      }
      case 'DictComp': {
        const d = new PyDict();
        yield* runComp(n.gens, 0, new Env('comp', env, env.moduleEnv), function* (e) {
          const k = yield* ev(n.key, e); const v = yield* ev(n.value, e);
          d.map.set(PY.hashKey(k), [k, v]);
        });
        return d;
      }
      case 'Lambda': {
        const f = new PyFunction('<lambda>', n, env, env.moduleEnv);
        f.defaults = yield* evDefaults(n.params, env);
        if (!n._info) n._info = collectLocals(n.body, n.params);
        return f;
      }
      case 'NamedExpr': {
        const v = yield* ev(n.value, env);
        // Walrus bindet im umgebenden Funktions-/Modul-Bereich
        let e = env; while (e.kind === 'comp' && e.parent) e = e.parent;
        assignName(e, n.target.id, v);
        return v;
      }
      case 'Yield': {
        if (n.from) {
          const it = yield* PY.getIter(yield* ev(n.value, env));
          for (;;) {
            const r = it.gen ? yield* it.next() : it.next();
            if (r.done) return r.value === undefined ? null : r.value;
            yield { t: 'pyyield', value: r.value };
          }
        }
        const v = n.value ? yield* ev(n.value, env) : null;
        const sent = yield { t: 'pyyield', value: v };
        return sent === undefined ? null : sent;
      }
      case 'Starred': PY.raise('SyntaxError', "can't use starred expression here");
    }
    throw new Error('Unbekannter Ausdruck: ' + n.type);
  }

  function* evElts(elts, env) {
    const out = [];
    for (const e of elts) {
      if (e.type === 'Starred') {
        const v = yield* ev(e.value, env);
        for (const x of yield* PY.toArray(v)) out.push(x);
      } else out.push(yield* ev(e, env));
    }
    return out;
  }

  function* runComp(gens, i, env, body) {
    const g = gens[i];
    const iterable = yield* ev(g.iter, i === 0 ? env.parent : env);
    const it = yield* PY.getIter(iterable);
    for (;;) {
      const r = it.gen ? yield* it.next() : it.next();
      if (r.done) break;
      yield* assignTarget(g.target, r.value, env);
      let ok = true;
      for (const c of g.ifs) { if (!(yield* PY.isTrue(yield* ev(c, env)))) { ok = false; break; } }
      if (!ok) continue;
      if (i + 1 < gens.length) yield* runComp(gens, i + 1, env, body);
      else yield* body(env);
      if ((++S.ticks & 63) === 0) yield TICK;
    }
  }

  function* compareOne(op, a, b) {
    switch (op) {
      case 'is': return a === b || (a === null && b === undefined);
      case 'is not': return !(a === b || (a === null && b === undefined));
      case '==': return yield* PY.eq(a, b);
      case '!=': {
        if (a instanceof PyInstance) {
          const m = PY.lookupClass(a.cls, '__ne__');
          if (m) return yield* PY.isTrue(yield* PY.callValue(new BoundMethod(a, m), [b], null));
        }
        return !(yield* PY.eq(a, b));
      }
      case 'in': return yield* PY.contains(b, a);
      case 'not in': return !(yield* PY.contains(b, a));
    }
    return yield* PY.compare(op, a, b);
  }

  function* evDefaults(params, env) {
    const defs = new Map();
    for (const p of params) if (p.default) defs.set(p.name, yield* ev(p.default, env));
    return defs;
  }

  /* ---------- Aufrufe ---------- */
  function* evCall(n, env) {
    const f = n.func;
    if (f.type === 'Name' && f.id === 'super') {
      const fnv = lookup(env, 'super');
      if (fnv === PY.builtinsMap.get('super')) {
        if (n.args.length === 0) return makeSuper(env);
        if (n.args.length === 2) {
          const c = yield* ev(n.args[0].expr, env);
          const o = yield* ev(n.args[1].expr, env);
          return new SuperProxy(c, o);
        }
      }
    }
    const fn = yield* ev(f, env);
    const args = [];
    let kw = null;
    for (const a of n.args) {
      if (a.star === 0 && !a.name) args.push(yield* ev(a.expr, env));
      else if (a.name) {
        if (!kw) kw = new Map();
        if (kw.has(a.name)) throw PY.synErr(S.cur.file, a.line, a.col, "keyword argument repeated: " + a.name);
        kw.set(a.name, yield* ev(a.expr, env));
      } else if (a.star === 1) {
        const v = yield* ev(a.expr, env);
        for (const x of yield* PY.toArray(v)) args.push(x);
      } else {
        const v = yield* ev(a.expr, env);
        if (!(v instanceof PyDict)) PY.raise('TypeError', 'argument after ** must be a mapping, not ' + PY.typeName(v));
        if (!kw) kw = new Map();
        for (const [, [k, x]] of v.map) {
          if (typeof k !== 'string') PY.raise('TypeError', 'keywords must be strings');
          kw.set(k, x);
        }
      }
    }
    S.cur.line = n.line;
    return yield* PY.callValue(fn, args, kw);
  }

  function makeSuper(env) {
    let e = env;
    while (e && e.kind !== 'func') e = e.parent;
    if (!e || !e.fn || !e.fn.homeClass) PY.raise('RuntimeError', 'super(): no arguments');
    const first = e.fn.node.params[0];
    if (!first) PY.raise('RuntimeError', 'super(): no arguments');
    return new SuperProxy(e.fn.homeClass, e.vars.get(first.name));
  }

  PY.callValue = function* (fn, args, kw) {
    if (fn instanceof PyFunction) return yield { t: 'call', gen: callFunction(fn, args, kw) };
    if (fn instanceof BoundMethod) {
      const a = new Array(args.length + 1);
      a[0] = fn.self;
      for (let i = 0; i < args.length; i++) a[i + 1] = args[i];
      return yield* PY.callValue(fn.fn, a, kw);
    }
    if (fn instanceof Builtin) {
      return fn.gen ? yield* fn.fn(args, kw) : fn.fn(args, kw);
    }
    if (fn instanceof PyClass) return yield* PY.instantiate(fn, args, kw);
    if (fn instanceof PyInstance) {
      const m = PY.lookupClass(fn.cls, '__call__');
      if (m) return yield* PY.callValue(new BoundMethod(fn, m), args, kw);
    }
    if (fn instanceof StaticMethod) return yield* PY.callValue(fn.fn, args, kw);
    PY.raise('TypeError', "'" + PY.typeName(fn) + "' object is not callable");
  };

  PY.instantiate = function* (cls, args, kw) {
    if (cls.prim && cls.ctor) return yield* cls.ctor(args, kw || null);
    if (cls.abstractNames && cls.abstractNames.length) {
      PY.raise('TypeError', "Can't instantiate abstract class " + cls.name + ' without an implementation for abstract method' + (cls.abstractNames.length > 1 ? 's' : '') + " '" + cls.abstractNames.join("', '") + "'");
    }
    const inst = new PyInstance(cls);
    const init = PY.lookupClass(cls, '__init__');
    if (init) {
      const r = yield* PY.callValue(new BoundMethod(inst, init), args, kw);
      if (r !== null && r !== undefined) PY.raise('TypeError', "__init__() should return None, not '" + PY.typeName(r) + "'");
    } else if (args.length || (kw && kw.size)) {
      PY.raise('TypeError', cls.name + '() takes no arguments');
    }
    return inst;
  };

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function joinNames(names) {
    const q = names.map((x) => "'" + x + "'");
    if (q.length === 1) return q[0];
    if (q.length === 2) return q[0] + ' and ' + q[1];
    return q.slice(0, -1).join(', ') + ', and ' + q[q.length - 1];
  }

  function bindArgs(fn, env, args, kw) {
    const params = fn.node.params;
    const vars = env.vars;
    const fname = fn.qualname || fn.name;
    let ai = 0, used = 0;
    let missing = null, varargName = null, kwargName = null;
    let nPos = 0;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      switch (p.kind) {
        case 'pos': {
          nPos++;
          if (ai < args.length) {
            vars.set(p.name, args[ai++]);
            if (kw !== null && kw.has(p.name)) PY.raise('TypeError', fname + "() got multiple values for argument '" + p.name + "'");
          } else if (kw !== null && kw.has(p.name)) { vars.set(p.name, kw.get(p.name)); used++; }
          else if (fn.defaults.has(p.name)) vars.set(p.name, fn.defaults.get(p.name));
          else (missing || (missing = [])).push(p.name);
          break;
        }
        case 'vararg': varargName = p.name; vars.set(p.name, new Tuple(args.slice(ai))); ai = args.length; break;
        case 'kwonly':
          if (kw !== null && kw.has(p.name)) { vars.set(p.name, kw.get(p.name)); used++; }
          else if (fn.defaults.has(p.name)) vars.set(p.name, fn.defaults.get(p.name));
          else (missing || (missing = [])).push(p.name);
          break;
        case 'kwarg': kwargName = p.name; break;
      }
    }
    if (ai < args.length) {
      const nDef = fn.defaults.size && params.filter((p) => p.kind === 'pos' && fn.defaults.has(p.name)).length;
      const takes = nDef ? (nPos - nDef) + ' to ' + nPos + ' positional arguments' : plural(nPos, 'positional argument');
      PY.raise('TypeError', fname + '() takes ' + takes + ' but ' + args.length + (args.length === 1 ? ' was' : ' were') + ' given');
    }
    if (kw !== null && kw.size > used) {
      const d = kwargName !== null ? new PyDict() : null;
      for (const [k, v] of kw) {
        const p = params.find((q) => q.name === k && (q.kind === 'pos' || q.kind === 'kwonly'));
        if (p) continue;
        if (d) d.map.set('s' + k, [k, v]);
        else PY.raise('TypeError', fname + "() got an unexpected keyword argument '" + k + "'");
      }
      if (d) vars.set(kwargName, d);
    } else if (kwargName !== null) vars.set(kwargName, new PyDict());
    if (missing) {
      const kwOnly = params.filter((p) => p.kind === 'kwonly' && missing.indexOf(p.name) >= 0).length === missing.length && missing.length > 0;
      PY.raise('TypeError', fname + '() missing ' + plural(missing.length, kwOnly ? 'required keyword-only argument' : 'required positional argument') + ': ' + joinNames(missing));
    }
    void varargName;
  }

  function* callFunction(fn, args, kw) {
    const node = fn.node;
    if (!node._info) {
      node._info = collectLocals(node.isLambda || node.type === 'Lambda' ? node.body : node.body, node.params);
    }
    const info = node._info;
    const env = new Env('func', fn.closure, fn.module);
    env.locals = info.locals; env.globals = info.globals; env.nonlocals = info.nonlocals; env.fn = fn;
    bindArgs(fn, env, args, kw === undefined ? null : kw);
    if (node.isGen === undefined) node.isGen = node.type !== 'Lambda' && containsYield(node.body);
    if (node.isGen) {
      const gframe = { fn: fn.name, file: fn.file || S.cur.file, line: node.line };
      return new PyGen((function* () { const sig = yield* execBlock(node.body, env); return sig instanceof Ret ? sig.v : null; })(), gframe, fn.name);
    }
    if (S.frames.length >= S.limit) PY.raise('RecursionError', 'maximum recursion depth exceeded');
    const frame = { fn: fn.name, file: fn.file || S.cur.file, line: node.line };
    S.frames.push(frame);
    const saved = S.cur;
    S.cur = frame;
    try {
      if (node.type === 'Lambda') return yield* ev(node.body, env);
      const sig = yield* execBlock(node.body, env);
      if (sig instanceof Ret) return sig.v;
      return null;
    } finally {
      S.frames.pop();
      S.cur = saved;
    }
  }

  function containsYield(body) {
    let found = false;
    (function walk(n) {
      if (found || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) walk(x); return; }
      if (n.type === 'Yield') { found = true; return; }
      if (n.type === 'FunctionDef' || n.type === 'ClassDef' || n.type === 'Lambda') return;
      for (const k in n) { if (k === 'line' || k === 'col' || k === 'type') continue; walk(n[k]); }
    })(body);
    return found;
  }

  /* Einen Schritt eines Generators ausführen; Anfragen an den Runner (Aufrufe, Eingaben) werden weitergereicht */
  PY.genStep = function* (g, send) {
    if (g.done) return { done: true };
    if (g.running) PY.raise('ValueError', 'generator already executing');
    g.running = true;
    S.frames.push(g.frame);
    const saved = S.cur; S.cur = g.frame;
    try {
      let r;
      try { if (!g.started) { g.started = true; r = g.js.next(); } else r = g.js.next(send); } catch (e) { g.done = true; throw e; }
      while (!r.done) {
        const v = r.value;
        if (v && v.t === 'pyyield') return { done: false, value: v.value };
        let back, thrown;
        try { back = yield v; } catch (e) { thrown = e; }
        try { r = thrown !== undefined ? g.js.throw(thrown) : g.js.next(back); } catch (e) { g.done = true; throw e; }
      }
      g.done = true;
      return { done: true, value: r.value };
    } finally { S.frames.pop(); S.cur = saved; g.running = false; }
  };

  /* ---------- Attribute ---------- */
  PY.getAttr = function* (obj, name) {
    if (obj instanceof PyInstance) {
      const cls = obj.cls;
      const cv = PY.lookupClass(cls, name);
      if (cv !== undefined) {
        if (cv instanceof Property) {
          if (!cv.fget) PY.raise('AttributeError', "property '" + name + "' of '" + cls.name + "' object has no getter");
          return yield* PY.callValue(cv.fget, [obj], null);
        }
        const iv = obj.attrs.get(name);
        if (iv !== undefined) return iv;
        if (cv instanceof PyFunction || cv instanceof Builtin) return new BoundMethod(obj, cv);
        if (cv instanceof StaticMethod) return cv.fn;
        if (cv instanceof ClassMethod) return new BoundMethod(cls, cv.fn);
        return cv;
      }
      const iv = obj.attrs.get(name);
      if (iv !== undefined) return iv;
      if (name === '__class__') return cls;
      if (name === '__dict__') {
        const d = new PyDict();
        for (const [k, v] of obj.attrs) d.map.set('s' + k, [k, v]);
        return d;
      }
      const ga = PY.lookupClass(cls, '__getattr__');
      if (ga) return yield* PY.callValue(new BoundMethod(obj, ga), [name], null);
      PY.raise('AttributeError', "'" + cls.name + "' object has no attribute '" + name + "'");
    }
    if (obj instanceof PyClass) {
      switch (name) {
        case '__name__': case '__qualname__': return obj.name;
        case '__bases__': return new Tuple(obj.bases.slice());
        case '__mro__': return new Tuple(obj.mro.slice());
        case '__dict__': { const d = new PyDict(); for (const [k, v] of obj.dict) d.map.set('s' + k, [k, v]); return d; }
        case '__class__': return PY.types.type;
        case '__doc__': return null;
      }
      const cv = PY.lookupClass(obj, name);
      if (cv !== undefined) {
        if (cv instanceof StaticMethod) return cv.fn;
        if (cv instanceof ClassMethod) return new BoundMethod(obj, cv.fn);
        if (cv instanceof Property) return cv;
        return cv;
      }
      if (obj.prim && PY.methods[obj.prim] && PY.methods[obj.prim][name]) {
        const m = PY.methods[obj.prim][name];
        return new Builtin(name, PY.isGen(m) ? function* (a, k) { return yield* m(a[0], a.slice(1), k); } : (a, k) => m(a[0], a.slice(1), k));
      }
      if (obj.prim && PY.classMethods[obj.prim] && PY.classMethods[obj.prim][name]) return PY.classMethods[obj.prim][name];
      PY.raise('AttributeError', "type object '" + obj.name + "' has no attribute '" + name + "'");
    }
    if (obj instanceof SuperProxy) {
      const mro = obj.obj instanceof PyClass ? obj.obj.mro : PY.classOf(obj.obj).mro;
      let i = mro.indexOf(obj.cls);
      for (i = i + 1; i < mro.length; i++) {
        const cv = mro[i].dict.get(name);
        if (cv !== undefined) {
          if (cv instanceof PyFunction || cv instanceof Builtin) return new BoundMethod(obj.obj, cv);
          if (cv instanceof StaticMethod) return cv.fn;
          if (cv instanceof ClassMethod) return new BoundMethod(obj.obj instanceof PyClass ? obj.obj : obj.obj.cls, cv.fn);
          if (cv instanceof Property) return yield* PY.callValue(cv.fget, [obj.obj], null);
          return cv;
        }
      }
      if (name === '__init__') return new Builtin('__init__', () => null);
      PY.raise('AttributeError', "'super' object has no attribute '" + name + "'");
    }
    if (obj instanceof PyModule) {
      const v = obj.attrs.get(name);
      if (v !== undefined) return v;
      PY.raise('AttributeError', "module '" + obj.name + "' has no attribute '" + name + "'");
    }
    if (obj instanceof PyFunction || obj instanceof Builtin) {
      if (name === '__name__' || name === '__qualname__') return obj.name;
      if (name === '__doc__') return null;
      PY.raise('AttributeError', "'" + PY.typeName(obj) + "' object has no attribute '" + name + "'");
    }
    if (obj instanceof BoundMethod) {
      if (name === '__name__') return obj.fn.name;
      if (name === '__self__') return obj.self;
      if (name === '__func__') return obj.fn;
    }
    if (obj instanceof PyGen) {
      if (name === 'send') return new Builtin('send', function* (a) { const r = yield* PY.genStep(obj, a.length ? a[0] : null); if (r.done) PY.raise('StopIteration'); return r.value; });
      if (name === '__next__') return new Builtin('__next__', function* () { const r = yield* PY.genStep(obj); if (r.done) PY.raise('StopIteration'); return r.value; });
      if (name === '__iter__') return new Builtin('__iter__', () => obj);
      if (name === 'close') return new Builtin('close', () => { obj.done = true; return null; });
    }
    if (obj instanceof Property) {
      if (name === 'setter') return new Builtin('setter', (a) => new Property(obj.fget, a[0]));
      if (name === 'getter') return new Builtin('getter', (a) => new Property(a[0], obj.fset));
      if (name === 'deleter') return new Builtin('deleter', () => obj);
    }
    // eingebaute Typen
    const tn = obj === null ? 'NoneType' : PY.typeName(obj);
    if (name === '__class__') return PY.classOf(obj);
    const table = PY.methods[tn];
    if (table) {
      const m = table[name];
      if (m) {
        return new Builtin(name, PY.isGen(m) ? function* (a, k) { return yield* m(obj, a, k); } : (a, k) => m(obj, a, k));
      }
    }
    if (typeof obj === 'number' || typeof obj === 'bigint' || typeof obj === 'boolean') {
      if (name === 'real') return obj;
      if (name === 'imag') return typeof obj === 'number' ? 0.0 : 0n;
    }
    if (obj instanceof PyRange) {
      if (name === 'start') return obj.start; if (name === 'stop') return obj.stop; if (name === 'step') return obj.step;
    }
    if (obj instanceof PyDict && obj.special && name === 'default_factory') return obj.factory;
    PY.raise('AttributeError', "'" + tn + "' object has no attribute '" + name + "'");
  };

  PY.setAttr = function* (obj, name, value) {
    if (obj instanceof PyInstance) {
      const cv = PY.lookupClass(obj.cls, name);
      if (cv instanceof Property) {
        if (!cv.fset) PY.raise('AttributeError', "property '" + name + "' of '" + obj.cls.name + "' object has no setter");
        yield* PY.callValue(cv.fset, [obj, value], null);
        return;
      }
      const sa = PY.lookupClass(obj.cls, '__setattr__');
      if (sa && sa instanceof PyFunction) {
        yield* PY.callValue(new BoundMethod(obj, sa), [name, value], null);
        return;
      }
      obj.attrs.set(name, value);
      return;
    }
    if (obj instanceof PyClass) { obj.dict.set(name, value); return; }
    if (obj instanceof PyModule) { obj.attrs.set(name, value); return; }
    if (obj instanceof PyFunction) { obj.attrs = obj.attrs || new Map(); obj.attrs.set(name, value); return; }
    PY.raise('AttributeError', "'" + PY.typeName(obj) + "' object has no attribute '" + name + "' and no __dict__ for setting new attributes");
  };

  /* ---------- Elemente ---------- */
  function idxNum(ix, what) {
    if (typeof ix === 'bigint') return Number(ix);
    if (typeof ix === 'boolean') return ix ? 1 : 0;
    PY.raise('TypeError', what + ' indices must be integers or slices, not ' + PY.typeName(ix));
  }

  PY.getItem = function* (o, ix) {
    if (Array.isArray(o)) {
      if (ix instanceof PySlice) return PY.sliceIdx(o.length, ix.lower, ix.upper, ix.step).map((i) => o[i]);
      let i = idxNum(ix, 'list'); if (i < 0) i += o.length;
      if (i < 0 || i >= o.length) PY.raise('IndexError', 'list index out of range');
      return o[i];
    }
    if (typeof o === 'string') {
      if (ix instanceof PySlice) return PY.sliceIdx(o.length, ix.lower, ix.upper, ix.step).map((i) => o[i]).join('');
      let i = idxNum(ix, 'string'); if (i < 0) i += o.length;
      if (i < 0 || i >= o.length) PY.raise('IndexError', 'string index out of range');
      return o[i];
    }
    if (o instanceof Tuple) {
      if (ix instanceof PySlice) return new Tuple(PY.sliceIdx(o.items.length, ix.lower, ix.upper, ix.step).map((i) => o.items[i]));
      let i = idxNum(ix, 'tuple'); if (i < 0) i += o.items.length;
      if (i < 0 || i >= o.items.length) PY.raise('IndexError', 'tuple index out of range');
      return o.items[i];
    }
    if (o instanceof PyDict) {
      const e = o.map.get(PY.hashKey(ix));
      if (e) return e[1];
      if (o.special === 'defaultdict' && o.factory !== null) {
        const v = yield* PY.callValue(o.factory, [], null);
        o.map.set(PY.hashKey(ix), [ix, v]);
        return v;
      }
      if (o.special === 'counter') return 0n;
      PY.raise('KeyError', ix);
    }
    if (o instanceof PyRange) {
      const len = Number(PY.rangeLen(o));
      if (ix instanceof PySlice) {
        const idx = PY.sliceIdx(len, ix.lower, ix.upper, ix.step);
        return idx.map((i) => o.start + BigInt(i) * o.step);
      }
      let i = idxNum(ix, 'range'); if (i < 0) i += len;
      if (i < 0 || i >= len) PY.raise('IndexError', 'range object index out of range');
      return o.start + BigInt(i) * o.step;
    }
    if (o instanceof PyInstance) {
      const m = PY.lookupClass(o.cls, '__getitem__');
      if (m) return yield* PY.callValue(new BoundMethod(o, m), [ix], null);
    }
    if (o instanceof PyClass) {
      // list[int] u. ä. (Typ-Hinweise): einfach die Klasse zurückgeben
      return o;
    }
    PY.raise('TypeError', "'" + PY.typeName(o) + "' object is not subscriptable");
  };

  PY.setItem = function* (o, ix, v) {
    if (Array.isArray(o)) {
      if (ix instanceof PySlice) {
        const items = yield* PY.toArray(v);
        const idx = PY.sliceIdx(o.length, ix.lower, ix.upper, ix.step);
        if (ix.step === null || ix.step === 1n) {
          const start = idx.length ? idx[0] : Math.min(ix.lower === null ? 0 : Math.max(0, Number(ix.lower) < 0 ? Number(ix.lower) + o.length : Number(ix.lower)), o.length);
          o.splice(start, idx.length, ...items);
        } else {
          if (items.length !== idx.length) PY.raise('ValueError', 'attempt to assign sequence of size ' + items.length + ' to extended slice of size ' + idx.length);
          idx.forEach((i, k) => { o[i] = items[k]; });
        }
        return;
      }
      let i = idxNum(ix, 'list'); if (i < 0) i += o.length;
      if (i < 0 || i >= o.length) PY.raise('IndexError', 'list assignment index out of range');
      o[i] = v; return;
    }
    if (o instanceof PyDict) { o.map.set(PY.hashKey(ix), [ix, v]); return; }
    if (o instanceof PyInstance) {
      const m = PY.lookupClass(o.cls, '__setitem__');
      if (m) { yield* PY.callValue(new BoundMethod(o, m), [ix, v], null); return; }
    }
    PY.raise('TypeError', "'" + PY.typeName(o) + "' object does not support item assignment");
  };

  PY.delItem = function* (o, ix) {
    if (Array.isArray(o)) {
      if (ix instanceof PySlice) {
        const idx = PY.sliceIdx(o.length, ix.lower, ix.upper, ix.step).sort((a, b) => b - a);
        for (const i of idx) o.splice(i, 1);
        return;
      }
      let i = idxNum(ix, 'list'); if (i < 0) i += o.length;
      if (i < 0 || i >= o.length) PY.raise('IndexError', 'list assignment index out of range');
      o.splice(i, 1); return;
    }
    if (o instanceof PyDict) {
      const k = PY.hashKey(ix);
      if (!o.map.has(k)) PY.raise('KeyError', ix);
      o.map.delete(k); return;
    }
    if (o instanceof PyInstance) {
      const m = PY.lookupClass(o.cls, '__delitem__');
      if (m) { yield* PY.callValue(new BoundMethod(o, m), [ix], null); return; }
    }
    PY.raise('TypeError', "'" + PY.typeName(o) + "' object doesn't support item deletion");
  };

  PY.contains = function* (c, item) {
    if (typeof c === 'string') {
      if (typeof item !== 'string') PY.raise('TypeError', "'in <string>' requires string as left operand, not " + PY.typeName(item));
      return c.indexOf(item) >= 0;
    }
    if (c instanceof PyDict || c instanceof PySet) return c.map.has(PY.hashKey(item));
    if (c instanceof PyRange) {
      if (typeof item !== 'bigint') return false;
      if (c.step > 0n ? (item < c.start || item >= c.stop) : (item > c.start || item <= c.stop)) return false;
      return (item - c.start) % c.step === 0n;
    }
    if (c instanceof PyInstance) {
      const m = PY.lookupClass(c.cls, '__contains__');
      if (m) return yield* PY.isTrue(yield* PY.callValue(new BoundMethod(c, m), [item], null));
    }
    const arr = Array.isArray(c) ? c : c instanceof Tuple ? c.items : null;
    if (arr) {
      for (const x of arr) if (yield* PY.eq(x, item)) return true;
      return false;
    }
    if (c instanceof PyInstance || c instanceof PyIter) {
      const all = yield* PY.toArray(c);
      for (const x of all) if (yield* PY.eq(x, item)) return true;
      return false;
    }
    PY.raise('TypeError', "argument of type '" + PY.typeName(c) + "' is not iterable");
  };

  /* ---------- Iteration ---------- */
  PY.iterOfArray = function (arr) {
    let i = 0;
    const it = new PyIter(() => (i < arr.length ? { done: false, value: arr[i++] } : { done: true }), false);
    it.arr = arr;
    return it;
  };

  PY.getIter = function* (v) {
    if (Array.isArray(v)) {
      let i = 0;
      return new PyIter(() => (i < v.length ? { done: false, value: v[i++] } : { done: true }), false);
    }
    if (v instanceof PyRange) {
      let cur = v.start;
      const step = v.step, stop = v.stop;
      return new PyIter(() => {
        if (step > 0n ? cur < stop : cur > stop) { const r = cur; cur += step; return { done: false, value: r }; }
        return { done: true };
      }, false);
    }
    if (v instanceof PyIter) return v;
    if (v instanceof PyGen) return new PyIter(function* () { return yield* PY.genStep(v); }, true);
    if (v instanceof PY.PyView) return PY.iterOfArray(v.items());
    if (typeof v === 'string') { return PY.iterOfArray(Array.from(v)); }
    if (v instanceof Tuple) return PY.iterOfArray(v.items);
    if (v instanceof PyDict) return PY.iterOfArray(Array.from(v.map.values(), (e) => e[0]));
    if (v instanceof PySet) return PY.iterOfArray(Array.from(v.map.values()));
    if (v instanceof PyInstance) {
      const m = PY.lookupClass(v.cls, '__iter__');
      if (m) {
        const it = yield* PY.callValue(new BoundMethod(v, m), [], null);
        if (it instanceof PyIter) return it;
        if (it instanceof PyInstance) {
          const nx = PY.lookupClass(it.cls, '__next__');
          if (!nx) PY.raise('TypeError', "iter() returned non-iterator of type '" + it.cls.name + "'");
          return new PyIter(function* () {
            try {
              const x = yield* PY.callValue(new BoundMethod(it, nx), [], null);
              return { done: false, value: x };
            } catch (e) {
              if (e instanceof PyThrow && e.inst.cls.mro.some((c) => c.name === 'StopIteration' && c.builtinExc)) return { done: true };
              throw e;
            }
          }, true);
        }
        return yield* PY.getIter(it);
      }
      const gi = PY.lookupClass(v.cls, '__getitem__');
      if (gi) {
        let i = 0n;
        return new PyIter(function* () {
          try {
            const x = yield* PY.callValue(new BoundMethod(v, gi), [i], null);
            i += 1n;
            return { done: false, value: x };
          } catch (e) {
            if (e instanceof PyThrow && e.inst.cls.mro.some((c) => c.name === 'IndexError' && c.builtinExc)) return { done: true };
            throw e;
          }
        }, true);
      }
    }
    PY.raise('TypeError', "'" + PY.typeName(v) + "' object is not iterable");
  };

  PY.toArray = function* (v) {
    if (Array.isArray(v)) return v;
    if (v instanceof Tuple) return v.items;
    if (typeof v === 'string') return Array.from(v);
    if (v instanceof PyDict) return Array.from(v.map.values(), (e) => e[0]);
    if (v instanceof PySet) return Array.from(v.map.values());
    const it = yield* PY.getIter(v);
    const out = [];
    for (;;) {
      const r = it.gen ? yield* it.next() : it.next();
      if (r.done) break;
      out.push(r.value);
      if (out.length > 20000000) PY.raise('MemoryError', '');
    }
    return out;
  };

  /* ---------- Zuweisung ---------- */
  function* assignTarget(t, value, env) {
    switch (t.type) {
      case 'Name': assignName(env, t.id, value); return;
      case 'Attribute': yield* PY.setAttr(yield* ev(t.value, env), t.attr, value); return;
      case 'Subscript': {
        const o = yield* ev(t.value, env);
        const ix = yield* ev(t.index, env);
        yield* PY.setItem(o, ix, value);
        return;
      }
      case 'Tuple': case 'List': {
        const vals = yield* PY.toArray(value);
        const elts = t.elts;
        const si = elts.findIndex((e) => e.type === 'Starred');
        if (si < 0) {
          if (vals.length !== elts.length) {
            if (vals.length > elts.length) PY.raise('ValueError', 'too many values to unpack (expected ' + elts.length + ')');
            PY.raise('ValueError', 'not enough values to unpack (expected ' + elts.length + ', got ' + vals.length + ')');
          }
          for (let i = 0; i < elts.length; i++) yield* assignTarget(elts[i], vals[i], env);
        } else {
          const after = elts.length - si - 1;
          if (vals.length < elts.length - 1) PY.raise('ValueError', 'not enough values to unpack (expected at least ' + (elts.length - 1) + ', got ' + vals.length + ')');
          for (let i = 0; i < si; i++) yield* assignTarget(elts[i], vals[i], env);
          yield* assignTarget(elts[si].value, vals.slice(si, vals.length - after), env);
          for (let i = 0; i < after; i++) yield* assignTarget(elts[si + 1 + i], vals[vals.length - after + i], env);
        }
        return;
      }
      case 'Starred': PY.raise('SyntaxError', 'starred assignment target must be in a list or tuple');
    }
    PY.raise('SyntaxError', 'cannot assign to ' + t.type);
  }

  /* ---------- Anweisungen ---------- */
  function* execBlock(body, env) {
    for (let i = 0; i < body.length; i++) {
      const sig = yield* exec(body[i], env);
      if (sig !== undefined) return sig;
    }
    return undefined;
  }

  function* loopBody(body, env) {
    for (let i = 0; i < body.length; i++) {
      const sig = yield* exec(body[i], env);
      if (sig !== undefined) return sig;
    }
    return undefined;
  }

  function* exec(st, env) {
    S.cur.line = st.line;
    switch (st.type) {
      case 'ExprStmt': {
        if (st.expr.pure === true) { const r = evSync(st.expr, env); if (r !== BAIL) return undefined; }
        yield* ev(st.expr, env);
        return undefined;
      }
      case 'Assign': {
        const v = yield* ev(st.value, env);
        for (let i = 0; i < st.targets.length; i++) {
          const t = st.targets[i];
          if (t.type === 'Name') assignName(env, t.id, v);
          else yield* assignTarget(t, v, env);
        }
        return undefined;
      }
      case 'AugAssign': return yield* execAug(st, env);
      case 'AnnAssign': {
        if (env.kind === 'class' && st.target.type === 'Name') {
          let an = env.vars.get('__annotations__');
          if (!an) { an = []; env.vars.set('__annotations__', an); }
          an.push(st.target.id);
        }
        if (st.value) yield* assignTarget(st.target, yield* ev(st.value, env), env);
        return undefined;
      }
      case 'If': {
        let c = yield* ev(st.test, env);
        if (typeof c !== 'boolean') c = yield* PY.isTrue(c);
        if (c) return yield* execBlock(st.body, env);
        if (st.orelse.length) return yield* execBlock(st.orelse, env);
        return undefined;
      }
      case 'While': {
        for (;;) {
          let c = yield* ev(st.test, env);
          if (typeof c !== 'boolean') c = yield* PY.isTrue(c);
          if (!c) break;
          const sig = yield* loopBody(st.body, env);
          if (sig !== undefined) {
            if (sig === BREAK) return undefined;
            if (sig !== CONTINUE) return sig;
          }
          if ((++S.ticks & 63) === 0) yield TICK;
        }
        if (st.orelse.length) return yield* execBlock(st.orelse, env);
        return undefined;
      }
      case 'For': {
        const iterable = yield* ev(st.iter, env);
        const it = yield* PY.getIter(iterable);
        const simple = st.target.type === 'Name' ? st.target.id : null;
        let broke = false;
        for (;;) {
          const r = it.gen ? yield* it.next() : it.next();
          if (r.done) break;
          if (simple !== null) assignName(env, simple, r.value);
          else yield* assignTarget(st.target, r.value, env);
          const sig = yield* loopBody(st.body, env);
          if (sig !== undefined) {
            if (sig === BREAK) { broke = true; break; }
            if (sig !== CONTINUE) return sig;
          }
          if ((++S.ticks & 63) === 0) yield TICK;
        }
        if (!broke && st.orelse.length) return yield* execBlock(st.orelse, env);
        return undefined;
      }
      case 'FunctionDef': {
        let f = new PyFunction(st.name, st, env, env.moduleEnv);
        f.file = S.cur.file;
        f.defaults = yield* evDefaults(st.params, env);
        let val = f;
        for (let i = st.decorators.length - 1; i >= 0; i--) {
          const d = yield* ev(st.decorators[i], env);
          val = yield* PY.callValue(d, [val], null);
        }
        assignName(env, st.name, val);
        return undefined;
      }
      case 'ClassDef': return yield* execClass(st, env);
      case 'Return': {
        const v = st.value ? yield* ev(st.value, env) : null;
        return new Ret(v);
      }
      case 'Break': return BREAK;
      case 'Continue': return CONTINUE;
      case 'Pass': return undefined;
      case 'Global': case 'Nonlocal': return undefined;
      case 'Raise': return yield* execRaise(st, env);
      case 'Try': return yield* execTry(st, env);
      case 'Import': {
        for (const n of st.names) {
          const mod = yield* importModule(n.name, st);
          if (n.asname) assignName(env, n.asname, mod);
          else {
            const top = n.name.split('.')[0];
            assignName(env, top, top === n.name ? mod : yield* importModule(top, st));
          }
        }
        return undefined;
      }
      case 'ImportFrom': {
        const mod = yield* importModule(st.module, st);
        for (const n of st.names) {
          if (n.name === '*') {
            for (const [k, v] of mod.attrs) if (k[0] !== '_') assignName(env, k, v);
            continue;
          }
          let v = mod.attrs.get(n.name);
          if (v === undefined) {
            // Untermodul?
            try { v = yield* importModule(st.module + '.' + n.name, st); } catch (e) { v = undefined; }
          }
          if (v === undefined) PY.raise('ImportError', "cannot import name '" + n.name + "' from '" + st.module + "'");
          assignName(env, n.asname || n.name, v);
        }
        return undefined;
      }
      case 'Del': {
        for (const t of st.targets) yield* execDel(t, env);
        return undefined;
      }
      case 'Assert': {
        const c = yield* ev(st.test, env);
        if (!(yield* PY.isTrue(c))) {
          if (st.msg) PY.raise('AssertionError', yield* ev(st.msg, env));
          PY.raise('AssertionError');
        }
        return undefined;
      }
      case 'With': return yield* execWith(st, env, 0);
    }
    throw new Error('Unbekannte Anweisung: ' + st.type);
  }

  function* execDel(t, env) {
    if (t.type === 'Name') {
      if (!env.vars.has(t.id)) PY.raise('NameError', "name '" + t.id + "' is not defined");
      env.vars.delete(t.id);
    } else if (t.type === 'Subscript') {
      yield* PY.delItem(yield* ev(t.value, env), yield* ev(t.index, env));
    } else if (t.type === 'Attribute') {
      const o = yield* ev(t.value, env);
      if (o instanceof PyInstance) { if (!o.attrs.delete(t.attr)) PY.raise('AttributeError', t.attr); } else PY.raise('AttributeError', t.attr);
    } else if (t.type === 'Tuple' || t.type === 'List') {
      for (const e of t.elts) yield* execDel(e, env);
    }
  }

  function* execAug(st, env) {
    const t = st.target;
    const op = st.op;
    if (t.type === 'Name') {
      // Schnellweg: einfache Zahlen und Texte ohne Generatoraufrufe
      const cur0 = lookup(env, t.id);
      if (typeof cur0 !== 'object' || cur0 === null) {
        if (st.value.pure === undefined) isPure(st.value);
        if (st.value.pure === true) {
          const rv = evSync(st.value, env);
          if (rv !== BAIL) {
            const r0 = PY.binopPrim(op, cur0, rv);
            if (r0 !== undefined) { assignName(env, t.id, r0); return undefined; }
          }
        }
      }
    }
    let cur, o, ix;
    if (t.type === 'Name') cur = lookup(env, t.id);
    else if (t.type === 'Attribute') { o = yield* ev(t.value, env); cur = yield* PY.getAttr(o, t.attr); }
    else { o = yield* ev(t.value, env); ix = yield* ev(t.index, env); cur = yield* PY.getItem(o, ix); }
    const rhs = yield* ev(st.value, env);
    let res;
    if (Array.isArray(cur) && op === '+') {
      for (const x of yield* PY.toArray(rhs)) cur.push(x);
      res = cur;
    } else if (Array.isArray(cur) && op === '*') {
      const n = Number(rhs); const base = cur.slice();
      cur.length = 0; for (let i = 0; i < n; i++) for (const x of base) cur.push(x);
      res = cur;
    } else if (cur instanceof PySet && !cur.frozen && (op === '|' || op === '&' || op === '-' || op === '^') && rhs instanceof PySet) {
      const r2 = yield* PY.binop(op, cur, rhs);
      cur.map = r2.map; res = cur;
    } else if (cur instanceof PyInstance) {
      const m = PY.lookupClass(cur.cls, '__i' + { '+': 'add', '-': 'sub', '*': 'mul', '/': 'truediv', '//': 'floordiv', '%': 'mod', '**': 'pow' }[op] + '__');
      if (m) res = yield* PY.callValue(new BoundMethod(cur, m), [rhs], null);
      else res = yield* PY.binop(op, cur, rhs);
    } else {
      res = PY.binopPrim(op, cur, rhs);
      if (res === undefined) res = yield* PY.binop(op, cur, rhs);
    }
    if (t.type === 'Name') assignName(env, t.id, res);
    else if (t.type === 'Attribute') yield* PY.setAttr(o, t.attr, res);
    else yield* PY.setItem(o, ix, res);
    return undefined;
  }

  function* execClass(st, env) {
    const bases = [];
    for (const b of st.bases) {
      const v = yield* ev(b, env);
      if (!(v instanceof PyClass)) PY.raise('TypeError', 'bases must be types');
      bases.push(v);
    }
    if (!bases.length) bases.push(PY.objectClass);
    const cenv = new Env('class', env, env.moduleEnv);
    cenv.vars.set('__module__', '__main__');
    cenv.vars.set('__qualname__', st.name);
    const frame = { fn: '<class ' + st.name + '>', file: S.cur.file, line: st.line };
    S.frames.push(frame);
    const saved = S.cur; S.cur = frame;
    try {
      yield* execBlock(st.body, cenv);
    } finally { S.frames.pop(); S.cur = saved; }
    const dict = new Map(cenv.vars);
    dict.delete('__module__'); dict.delete('__qualname__');
    const cls = new PyClass(st.name, bases, dict);
    // Methoden mit Klasse verknüpfen (für super() und Fehlermeldungen)
    for (const [k, v] of dict) {
      const f = v instanceof StaticMethod || v instanceof ClassMethod ? v.fn : v instanceof Property ? v.fget : v;
      if (f instanceof PyFunction) { f.homeClass = cls; f.qualname = st.name + '.' + f.name; }
      if (v instanceof Property && v.fset instanceof PyFunction) v.fset.homeClass = cls;
    }
    const names = new Set();
    for (const c of cls.mro) for (const k of c.dict.keys()) names.add(k);
    cls.abstractNames = Array.from(names).filter((k) => {
      const m = PY.lookupClass(cls, k);
      const f = m instanceof StaticMethod || m instanceof ClassMethod ? m.fn : m instanceof Property ? m.fget : m;
      return f instanceof PyFunction && f.isAbstract;
    });
    let val = cls;
    for (let i = st.decorators.length - 1; i >= 0; i--) {
      const d = yield* ev(st.decorators[i], env);
      val = yield* PY.callValue(d, [val], null);
    }
    assignName(env, st.name, val);
    return undefined;
  }

  function* execRaise(st, env) {
    if (!st.exc) {
      const cur = S.excStack[S.excStack.length - 1];
      if (!cur) PY.raise('RuntimeError', 'No active exception to reraise');
      throw cur;
    }
    let v = yield* ev(st.exc, env);
    if (v instanceof PyClass) {
      if (!v.isExc) PY.raise('TypeError', 'exceptions must derive from BaseException');
      v = yield* PY.instantiate(v, [], null);
    }
    if (!(v instanceof PyInstance) || !v.cls.isExc) PY.raise('TypeError', 'exceptions must derive from BaseException');
    if (st.cause) {
      let c = yield* ev(st.cause, env);
      if (c instanceof PyClass) c = yield* PY.instantiate(c, [], null);
      v.attrs.set('__cause__', c);
    }
    const t = new PyThrow(v);
    if (S.excStack.length && !st.cause) t.context = S.excStack[S.excStack.length - 1];
    throw t;
  }

  function normalizeError(e) {
    if (e instanceof PyThrow || e instanceof ExitSignal) return e;
    if (e instanceof RangeError && /call stack|too much recursion/i.test(e.message)) {
      return new PyThrow(PY.makeExc('RecursionError', 'maximum recursion depth exceeded'));
    }
    if (e instanceof KON.LangError) {
      // SyntaxError aus eval/Import zur Laufzeit
      const inst = PY.makeExc(PY.excClasses[e.name] ? e.name : 'SyntaxError', e.message);
      const t = new PyThrow(inst); t.syntax = e; return t;
    }
    return e;
  }

  function* execTry(st, env) {
    let sig, pending = null;
    try {
      let raised = null;
      try {
        sig = yield* execBlock(st.body, env);
      } catch (e0) {
        const e = normalizeError(e0);
        if (!(e instanceof PyThrow)) throw e;
        raised = e;
      }
      if (raised) {
        let handler = null;
        for (const h of st.handlers) {
          if (!h.typ) { handler = h; break; }
          const tv = yield* ev(h.typ, env);
          if (yield* exceptionMatches(raised.inst, tv)) { handler = h; break; }
        }
        if (!handler) throw raised;
        if (handler.name) assignName(env, handler.name, raised.inst);
        S.excStack.push(raised);
        try {
          sig = yield* execBlock(handler.body, env);
        } finally {
          S.excStack.pop();
          if (handler.name) env.vars.delete(handler.name);
        }
      } else if (st.orelse.length) {
        sig = yield* execBlock(st.orelse, env);
      }
    } catch (e) {
      pending = e;
    }
    if (st.finalbody.length) {
      const fs = yield* execBlock(st.finalbody, env);
      if (fs !== undefined) return fs;
    }
    if (pending) throw pending;
    return sig;
  }

  function* exceptionMatches(inst, tv) {
    if (tv instanceof Tuple) {
      for (const t of tv.items) if (yield* exceptionMatches(inst, t)) return true;
      return false;
    }
    if (!(tv instanceof PyClass)) PY.raise('TypeError', 'catching classes that do not inherit from BaseException is not allowed');
    return inst.cls.mro.indexOf(tv) >= 0;
  }

  function* execWith(st, env, i) {
    if (i >= st.items.length) return yield* execBlock(st.body, env);
    const item = st.items[i];
    const mgr = yield* ev(item.expr, env);
    const enter = mgr instanceof PyInstance ? PY.lookupClass(mgr.cls, '__enter__') : null;
    const exit = mgr instanceof PyInstance ? PY.lookupClass(mgr.cls, '__exit__') : null;
    if (!enter || !exit) PY.raise('TypeError', "'" + PY.typeName(mgr) + "' object does not support the context manager protocol");
    const val = yield* PY.callValue(new BoundMethod(mgr, enter), [], null);
    if (item.var) yield* assignTarget(item.var, val, env);
    let sig;
    try {
      sig = yield* execWith(st, env, i + 1);
    } catch (e0) {
      const e = normalizeError(e0);
      if (!(e instanceof PyThrow)) throw e;
      const sup = yield* PY.callValue(new BoundMethod(mgr, exit), [e.inst.cls, e.inst, null], null);
      if (yield* PY.isTrue(sup)) return undefined;
      throw e;
    }
    yield* PY.callValue(new BoundMethod(mgr, exit), [null, null, null], null);
    return sig;
  }

  /* ---------- Module ---------- */
  function* importModule(name, st) {
    if (S.modules.has(name)) return S.modules.get(name);
    // eingebaute Module
    if (PY.modules[name]) {
      const m = PY.modules[name]();
      S.modules.set(name, m);
      return m;
    }
    // Projektdateien
    const parts = name.split('.');
    const fileName = parts.join('/') + '.py';
    const file = S.files.find((f) => f.name === fileName || f.name === parts[parts.length - 1] + '.py');
    if (!file) PY.raise('ModuleNotFoundError', "No module named '" + name + "'");
    const mod = new PyModule(name);
    S.modules.set(name, mod);
    const tree = PY.parse(file.content, file.name);
    const menv = new Env('module', null, null);
    menv.moduleEnv = menv;
    menv.vars.set('__name__', name);
    mod.attrs = menv.vars;
    const frame = { fn: '<module>', file: file.name, line: 1 };
    S.frames.push(frame);
    const saved = S.cur; S.cur = frame;
    try {
      yield* execBlock(tree.body, menv);
    } catch (e) {
      S.modules.delete(name);
      throw e;
    } finally { S.frames.pop(); S.cur = saved; }
    void st;
    return mod;
  }

  /* ---------- Start ---------- */
  PY.prepare = function (files, startName) {
    const file = files.find((f) => f.name === startName) || files.find((f) => /\.py$/.test(f.name));
    if (!file) {
      return { errors: [new KON.LangError({ phase: 'compile', lang: 'python', file: startName || '', line: 0, col: 0, name: 'Fehler', code: '', message: 'Keine Python-Datei zum Ausführen gefunden.' })] };
    }
    let tree;
    try {
      tree = PY.parse(file.content, file.name);
    } catch (e) {
      if (e instanceof KON.LangError) return { errors: [e] };
      throw e;
    }
    return { run: function* (io) { return yield* runProgram(tree, file, files, io); } };
  };

  function formatTraceback(e, files) {
    const lines = [];
    lines.push({ text: 'Traceback (most recent call last):' });
    for (const f of e.tb) {
      lines.push({ text: '  File "' + f.file + '", line ' + f.line + ', in ' + f.fn, loc: { file: f.file, line: f.line, col: 1 } });
      const src = KON.getLine(files, f.file, f.line).trim();
      if (src) lines.push({ text: '    ' + src });
    }
    return lines;
  }

  function* excLine(inst) {
    const name = inst.cls.name;
    const msg = yield* PY.str(inst);
    return msg ? name + ': ' + msg : name;
  }

  function* reportError(e, files, io) {
    if (e instanceof PyThrow && e.syntax) {
      const se = e.syntax;
      for (const l of PY.formatSyntaxError(se, files)) io.writeErr(l.text, l.loc);
      return;
    }
    const lines = formatTraceback(e, files);
    for (const l of lines) io.writeErr(l.text + '\n', l.loc);
    // Verkettete Ausnahmen (raise ... from ...)
    io.writeErr((yield* excLine(e.inst)) + '\n');
  }

  PY.formatSyntaxError = function (se, files) {
    const out = [];
    out.push({ text: '  File "' + se.file + '", line ' + se.line + '\n', loc: { file: se.file, line: se.line, col: se.col } });
    const src = KON.getLine(files, se.file, se.line);
    if (src) {
      const stripped = src.replace(/^\s+/, '');
      const cut = src.length - stripped.length;
      out.push({ text: '    ' + stripped.replace(/\s+$/, '') + '\n' });
      if (se.col > 0) out.push({ text: '    ' + ' '.repeat(Math.max(0, se.col - 1 - cut)) + '^\n' });
    }
    out.push({ text: (se.name || 'SyntaxError') + ': ' + se.message + '\n' });
    return out;
  };

  function* runProgram(tree, file, files, io) {
    S = {
      files: files, io: io, frames: [], cur: null, modules: new Map(), excStack: [], limit: 1000, ticks: 0
    };
    PY.reprStack.length = 0;
    PY.resetRandom && PY.resetRandom();
    const menv = new Env('module', null, null);
    menv.moduleEnv = menv;
    menv.vars.set('__name__', '__main__');
    const frame = { fn: '<module>', file: file.name, line: 1 };
    S.frames.push(frame);
    S.cur = frame;
    try {
      yield* execBlock(tree.body, menv);
      return 0;
    } catch (e0) {
      const e = normalizeError(e0);
      if (e instanceof ExitSignal) return e.code;
      if (e instanceof PyThrow) {
        if (e.inst.cls.name === 'SystemExit' && e.inst.cls.builtinExc) {
          const a = e.inst.attrs.get('args');
          const c = a && a.items.length ? a.items[0] : null;
          if (c === null || c === undefined) return 0;
          if (typeof c === 'bigint') return Number(c);
          io.writeErr((yield* PY.str(c)) + '\n');
          return 1;
        }
        yield* reportError(e, files, io);
        return 1;
      }
      throw e;
    } finally {
      S = null;
    }
  }

  PY.runTop = runProgram;
  PY.helpers = { BREAK, CONTINUE, Ret, Env, ev, execBlock, assignName, collectLocals };
})(typeof window !== 'undefined' ? window : globalThis);
