/* Python-Parser: Tokens -> Syntaxbaum (Teilmenge von Python 3) */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const PY = KON.py = KON.py || {};

  const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
    'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
  PY.KEYWORDS = KEYWORDS;

  const CMP_OPS = new Set(['<', '>', '==', '>=', '<=', '!=']);
  const AUG_OPS = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '>>=', '<<=', '&=', '^=', '|=', '@=']);

  class Parser {
    constructor(src, file, opts) {
      this.file = file;
      this.src = src;
      this.lines = src.replace(/\r\n?/g, '\n').split('\n');
      this.toks = PY.lex(src, file, opts);
      this.p = 0;
    }

    get tok() { return this.toks[this.p]; }
    peek(k) { return this.toks[Math.min(this.p + (k || 1), this.toks.length - 1)]; }
    next() { return this.toks[this.p++]; }

    err(msg, tok, name) {
      tok = tok || this.tok;
      let line = tok.line, col = tok.col;
      return PY.synErr(this.file, line, col, msg, name);
    }

    /* Fehler "an der Stelle direkt hinter dem vorherigen Token" */
    errAfterPrev(msg, name) {
      const prev = this.toks[this.p - 1];
      if (prev && prev.ecol !== undefined) return PY.synErr(this.file, prev.eline || prev.line, prev.ecol, msg, name);
      return this.err(msg, null, name);
    }

    isOp(v) { const t = this.tok; return t.t === 'OP' && t.v === v; }
    isKw(v) { const t = this.tok; return t.t === 'NAME' && t.v === v; }
    acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    acceptKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }

    expectOp(v) {
      if (this.isOp(v)) return this.next();
      if (this.tok.t === 'NEWLINE' || this.tok.t === 'EOF') throw this.errAfterPrev(v === ':' ? "expected ':'" : "expected '" + v + "'");
      throw this.err(v === ':' ? "expected ':'" : 'invalid syntax');
    }
    expectKw(v) {
      if (this.isKw(v)) return this.next();
      throw this.err("expected '" + v + "'");
    }
    expectName() {
      const t = this.tok;
      if (t.t === 'NAME' && !KEYWORDS.has(t.v)) { this.p++; return t; }
      throw this.err('invalid syntax');
    }

    node(type, tok, props) {
      const n = { type: type, line: tok.line, col: tok.col };
      return Object.assign(n, props);
    }

    /* ---------- Programm ---------- */
    parseModule() {
      const body = [];
      while (this.tok.t !== 'EOF') {
        if (this.tok.t === 'NEWLINE') { this.p++; continue; }
        if (this.tok.t === 'INDENT') throw this.err('unexpected indent', this.tok, 'IndentationError');
        this.parseStatement(body);
      }
      return { type: 'Module', body: body, line: 1, col: 1 };
    }

    parseBlock(kw, kwTok) {
      // nach dem ':'
      if (this.tok.t === 'NEWLINE') {
        this.p++;
        if (this.tok.t !== 'INDENT') {
          throw this.err("expected an indented block after " + kw + ' on line ' + kwTok.line, this.tok, 'IndentationError');
        }
        this.p++;
        const body = [];
        while (this.tok.t !== 'DEDENT' && this.tok.t !== 'EOF') {
          if (this.tok.t === 'NEWLINE') { this.p++; continue; }
          if (this.tok.t === 'INDENT') throw this.err('unexpected indent', this.tok, 'IndentationError');
          this.parseStatement(body);
        }
        if (this.tok.t === 'DEDENT') this.p++;
        return body;
      }
      // Einzeiler: if x: print(1)
      const body = [];
      this.parseSimpleLine(body);
      return body;
    }

    parseStatement(out) {
      const t = this.tok;
      if (t.t === 'NAME') {
        switch (t.v) {
          case 'if': out.push(this.parseIf()); return;
          case 'while': out.push(this.parseWhile()); return;
          case 'for': out.push(this.parseFor()); return;
          case 'def': out.push(this.parseDef([])); return;
          case 'class': out.push(this.parseClass([])); return;
          case 'try': out.push(this.parseTry()); return;
          case 'with': out.push(this.parseWith()); return;
          case 'async': throw this.err('async/await wird noch nicht unterstützt');
        }
      }
      if (t.t === 'OP' && t.v === '@') { out.push(this.parseDecorated()); return; }
      this.parseSimpleLine(out);
    }

    parseSimpleLine(out) {
      for (;;) {
        out.push(this.parseSimple());
        if (this.acceptOp(';')) {
          if (this.tok.t === 'NEWLINE') break;
          continue;
        }
        break;
      }
      if (this.tok.t === 'NEWLINE') this.p++;
      else if (this.tok.t !== 'EOF') {
        throw this.err('invalid syntax');
      }
    }

    parseDecorated() {
      const decs = [];
      while (this.isOp('@')) {
        this.p++;
        decs.push(this.parseExpr());
        if (this.tok.t !== 'NEWLINE') throw this.err('invalid syntax');
        this.p++;
      }
      if (this.isKw('def')) return this.parseDef(decs);
      if (this.isKw('class')) return this.parseClass(decs);
      throw this.err('invalid syntax');
    }

    /* ---------- Einfache Anweisungen ---------- */
    parseSimple() {
      const t = this.tok;
      if (t.t === 'NAME') {
        switch (t.v) {
          case 'pass': this.p++; return this.node('Pass', t);
          case 'break': this.p++; return this.node('Break', t);
          case 'continue': this.p++; return this.node('Continue', t);
          case 'return': {
            this.p++;
            let value = null;
            if (this.tok.t !== 'NEWLINE' && !this.isOp(';') && this.tok.t !== 'EOF') value = this.parseExprList();
            return this.node('Return', t, { value: value });
          }
          case 'raise': {
            this.p++;
            let exc = null, cause = null;
            if (this.tok.t !== 'NEWLINE' && !this.isOp(';')) {
              exc = this.parseExpr();
              if (this.acceptKw('from')) cause = this.parseExpr();
            }
            return this.node('Raise', t, { exc: exc, cause: cause });
          }
          case 'global': case 'nonlocal': {
            this.p++;
            const names = [this.expectName().v];
            while (this.acceptOp(',')) names.push(this.expectName().v);
            return this.node(t.v === 'global' ? 'Global' : 'Nonlocal', t, { names: names });
          }
          case 'del': {
            this.p++;
            const targets = [this.parseTarget()];
            while (this.acceptOp(',')) { if (this.tok.t === 'NEWLINE') break; targets.push(this.parseTarget()); }
            return this.node('Del', t, { targets: targets });
          }
          case 'assert': {
            this.p++;
            const test = this.parseExpr();
            let msg = null;
            if (this.acceptOp(',')) msg = this.parseExpr();
            return this.node('Assert', t, { test: test, msg: msg });
          }
          case 'import': {
            this.p++;
            const names = [];
            do {
              let name = this.expectName().v;
              while (this.acceptOp('.')) name += '.' + this.expectName().v;
              let asname = null;
              if (this.acceptKw('as')) asname = this.expectName().v;
              names.push({ name: name, asname: asname });
            } while (this.acceptOp(','));
            return this.node('Import', t, { names: names });
          }
          case 'from': {
            this.p++;
            let module = '';
            while (this.isOp('.')) { module += '.'; this.p++; }
            if (!this.isKw('import')) {
              module += this.expectName().v;
              while (this.acceptOp('.')) module += '.' + this.expectName().v;
            }
            this.expectKw('import');
            const names = [];
            if (this.acceptOp('*')) names.push({ name: '*', asname: null });
            else {
              const paren = this.acceptOp('(');
              do {
                if (paren && this.isOp(')')) break;
                const name = this.expectName().v;
                let asname = null;
                if (this.acceptKw('as')) asname = this.expectName().v;
                names.push({ name: name, asname: asname });
              } while (this.acceptOp(','));
              if (paren) this.expectOp(')');
            }
            return this.node('ImportFrom', t, { module: module, names: names });
          }
          case 'yield': return this.node('ExprStmt', t, { expr: this.parseYield() });
          case 'await': throw this.err('async/await wird noch nicht unterstützt');
          case 'elif': case 'else': case 'except': case 'finally':
            throw this.err('invalid syntax');
        }
      }
      return this.parseExprStatement();
    }

    parseExprStatement() {
      const start = this.tok;
      const first = this.parseExprListStar();
      // Annotation:  x: int = 5
      if (this.isOp(':') && (first.type === 'Name' || first.type === 'Attribute' || first.type === 'Subscript')) {
        this.p++;
        this.parseExpr(); // Annotation ignorieren
        let value = null;
        if (this.acceptOp('=')) value = this.parseExprListStar();
        this.checkTarget(first);
        return this.node('AnnAssign', start, { target: first, value: value });
      }
      if (this.tok.t === 'OP' && AUG_OPS.has(this.tok.v)) {
        const op = this.next().v.slice(0, -1);
        if (first.type !== 'Name' && first.type !== 'Attribute' && first.type !== 'Subscript') {
          throw PY.synErr(this.file, start.line, start.col, "'" + this.describe(first) + "' is an illegal expression for augmented assignment");
        }
        const value = this.parseExprList();
        return this.node('AugAssign', start, { target: first, op: op, value: value });
      }
      if (this.isOp('=')) {
        const targets = [first];
        let value;
        while (this.acceptOp('=')) {
          value = this.isKw('yield') ? this.parseYield() : this.parseExprListStar();
          if (this.isOp('=')) targets.push(value);
        }
        for (const tg of targets) this.checkTarget(tg);
        return this.node('Assign', start, { targets: targets, value: value });
      }
      return this.node('ExprStmt', start, { expr: first });
    }

    parseYield() {
      const t = this.next(); // yield
      if (this.acceptKw('from')) return this.node('Yield', t, { value: this.parseExpr(), from: true });
      let value = null;
      if (this.tok.t !== 'NEWLINE' && !this.isOp(';') && !this.isOp(')') && this.tok.t !== 'EOF') value = this.parseExprList();
      return this.node('Yield', t, { value: value, from: false });
    }

    describe(e) {
      switch (e.type) {
        case 'Call': return 'function call';
        case 'Num': case 'Str': case 'Const': return 'literal';
        case 'BinOp': return 'expression';
        case 'Compare': return 'comparison';
        case 'List': return 'list';
        case 'Tuple': return 'tuple';
        case 'Dict': return 'dict literal';
        default: return 'expression';
      }
    }

    checkTarget(e) {
      switch (e.type) {
        case 'Name': case 'Attribute': case 'Subscript': return;
        case 'Tuple': case 'List': e.elts.forEach((x) => this.checkTarget(x)); return;
        case 'Starred': this.checkTarget(e.value); return;
      }
      let what = this.describe(e);
      let msg;
      if (e.type === 'Num' || e.type === 'Str' || e.type === 'Const') msg = 'cannot assign to literal here. Maybe you meant \'==\' instead of \'=\'?';
      else if (e.type === 'Call') msg = 'cannot assign to function call here. Maybe you meant \'==\' instead of \'=\'?';
      else msg = 'cannot assign to ' + what + ' here. Maybe you meant \'==\' instead of \'=\'?';
      throw PY.synErr(this.file, e.line, e.col, msg);
    }

    parseTarget() {
      const e = this.parseOr();
      this.checkTarget(e);
      return e;
    }

    /* ---------- Zusammengesetzte Anweisungen ---------- */
    parseIf() {
      const t = this.next(); // if / elif
      const test = this.parseNamedExpr();
      this.expectOp(':');
      const body = this.parseBlock("'" + t.v + "' statement", t);
      let orelse = [];
      if (this.isKw('elif')) {
        orelse = [this.parseIf()];
      } else if (this.isKw('else')) {
        const e = this.next();
        this.expectOp(':');
        orelse = this.parseBlock("'else' statement", e);
      }
      return this.node('If', t, { test: test, body: body, orelse: orelse });
    }

    parseWhile() {
      const t = this.next();
      const test = this.parseNamedExpr();
      this.expectOp(':');
      const body = this.parseBlock("'while' statement", t);
      let orelse = [];
      if (this.isKw('else')) { const e = this.next(); this.expectOp(':'); orelse = this.parseBlock("'else' statement", e); }
      return this.node('While', t, { test: test, body: body, orelse: orelse });
    }

    parseFor() {
      const t = this.next();
      const target = this.parseTargetList();
      if (!this.isKw('in')) throw this.err(this.tok.t === 'NEWLINE' ? "expected 'in'" : 'invalid syntax');
      this.p++;
      const iter = this.parseExprList();
      this.expectOp(':');
      const body = this.parseBlock("'for' statement", t);
      let orelse = [];
      if (this.isKw('else')) { const e = this.next(); this.expectOp(':'); orelse = this.parseBlock("'else' statement", e); }
      return this.node('For', t, { target: target, iter: iter, body: body, orelse: orelse });
    }

    /* Ziel(e) einer for-Schleife: a  oder  a, b  oder (a, b) */
    parseTargetList() {
      const start = this.tok;
      const first = this.parseStarTarget();
      if (!this.isOp(',')) { this.checkTarget(first); return first; }
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isKw('in') || this.isOp('=')) break;
        elts.push(this.parseStarTarget());
      }
      const tup = this.node('Tuple', start, { elts: elts });
      this.checkTarget(tup);
      return tup;
    }
    parseStarTarget() {
      if (this.isOp('*')) {
        const t = this.next();
        return this.node('Starred', t, { value: this.parseBitOr() });
      }
      return this.parseBitOr();
    }

    parseDef(decorators) {
      const t = this.next(); // def
      const name = this.expectName();
      this.expectOp('(');
      const params = this.parseParams(')', true);
      this.expectOp(')');
      if (this.acceptOp('->')) this.parseExpr();
      this.expectOp(':');
      const body = this.parseBlock("function definition", t);
      return this.node('FunctionDef', t, { name: name.v, params: params, body: body, decorators: decorators });
    }

    /* Parameterliste für def (mit Typangaben) und lambda */
    parseParams(close, allowAnnot) {
      const params = [];
      let seenStar = false, seenDefault = false;
      const names = new Set();
      while (!this.isOp(close) && !(close === ':' && this.isOp(':'))) {
        if (this.isOp('/')) { this.p++; if (!this.acceptOp(',')) break; continue; }
        if (this.isOp('**')) {
          this.p++;
          const nm = this.expectName();
          if (allowAnnot && this.acceptOp(':')) this.parseExpr();
          params.push({ name: nm.v, kind: 'kwarg', default: null });
          names.add(nm.v);
          if (!this.acceptOp(',')) break;
          continue;
        }
        if (this.isOp('*')) {
          this.p++;
          seenStar = true;
          if (this.tok.t === 'NAME' && !KEYWORDS.has(this.tok.v)) {
            const nm = this.next();
            if (allowAnnot && this.acceptOp(':')) this.parseExpr();
            params.push({ name: nm.v, kind: 'vararg', default: null });
            names.add(nm.v);
          }
          if (!this.acceptOp(',')) break;
          continue;
        }
        const nm = this.expectName();
        if (names.has(nm.v)) throw this.err("duplicate argument '" + nm.v + "' in function definition", nm);
        names.add(nm.v);
        if (allowAnnot && this.acceptOp(':')) this.parseExpr();
        let def = null;
        if (this.acceptOp('=')) { def = this.parseExpr(); seenDefault = true; }
        else if (seenDefault && !seenStar) throw this.err('parameter without a default follows parameter with a default', nm);
        params.push({ name: nm.v, kind: seenStar ? 'kwonly' : 'pos', default: def });
        if (!this.acceptOp(',')) break;
      }
      return params;
    }

    parseClass(decorators) {
      const t = this.next();
      const name = this.expectName();
      const bases = [];
      const kwargs = [];
      if (this.acceptOp('(')) {
        while (!this.isOp(')')) {
          if (this.tok.t === 'NAME' && this.peek().t === 'OP' && this.peek().v === '=') {
            const k = this.next().v; this.p++;
            kwargs.push({ name: k, value: this.parseExpr() });
          } else bases.push(this.parseExpr());
          if (!this.acceptOp(',')) break;
        }
        this.expectOp(')');
      }
      this.expectOp(':');
      const body = this.parseBlock("class definition", t);
      return this.node('ClassDef', t, { name: name.v, bases: bases, kwargs: kwargs, body: body, decorators: decorators });
    }

    parseTry() {
      const t = this.next();
      this.expectOp(':');
      const body = this.parseBlock("'try' statement", t);
      const handlers = [];
      let orelse = [], finalbody = [];
      while (this.isKw('except')) {
        const et = this.next();
        let typ = null, name = null;
        if (this.isOp('*')) throw this.err('except* wird noch nicht unterstützt');
        if (!this.isOp(':')) {
          typ = this.parseExpr();
          if (this.isOp(',')) {
            // except A, B:  (Python 2 Stil) -> Hinweis wie Python 3
            throw this.err('multiple exception types must be parenthesized');
          }
          if (this.acceptKw('as')) name = this.expectName().v;
        }
        this.expectOp(':');
        const hb = this.parseBlock("'except' statement", et);
        handlers.push({ typ: typ, name: name, body: hb, line: et.line, col: et.col });
      }
      if (handlers.length && this.isKw('else')) { const e = this.next(); this.expectOp(':'); orelse = this.parseBlock("'else' statement", e); }
      if (this.isKw('finally')) { const e = this.next(); this.expectOp(':'); finalbody = this.parseBlock("'finally' statement", e); }
      if (!handlers.length && !finalbody.length) throw this.err("expected 'except' or 'finally' block");
      return this.node('Try', t, { body: body, handlers: handlers, orelse: orelse, finalbody: finalbody });
    }

    parseWith() {
      const t = this.next();
      const items = [];
      do {
        const expr = this.parseExpr();
        let v = null;
        if (this.acceptKw('as')) v = this.parseTarget();
        items.push({ expr: expr, var: v });
      } while (this.acceptOp(','));
      this.expectOp(':');
      const body = this.parseBlock("'with' statement", t);
      return this.node('With', t, { items: items, body: body });
    }

    /* ---------- Ausdrücke ---------- */
    parseExprListStar() {
      // a, b, *c  oder einzelner Ausdruck
      const start = this.tok;
      const first = this.parseStarOrExpr();
      if (!this.isOp(',')) return first;
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.exprEnd()) break;
        elts.push(this.parseStarOrExpr());
      }
      return this.node('Tuple', start, { elts: elts });
    }
    parseExprList() { return this.parseExprListStar(); }

    exprEnd() {
      const t = this.tok;
      if (t.t === 'NEWLINE' || t.t === 'EOF') return true;
      if (t.t === 'OP' && (t.v === '=' || t.v === ')' || t.v === ']' || t.v === '}' || t.v === ':' || t.v === ';' || AUG_OPS.has(t.v))) return true;
      if (t.t === 'NAME' && (t.v === 'in' || t.v === 'for' || t.v === 'if' || t.v === 'else')) return true;
      return false;
    }

    parseStarOrExpr() {
      if (this.isOp('*')) {
        const t = this.next();
        return this.node('Starred', t, { value: this.parseBitOr() });
      }
      return this.parseNamedExpr();
    }

    parseNamedExpr() {
      const e = this.parseExpr();
      if (this.isOp(':=')) {
        const t = this.next();
        if (e.type !== 'Name') throw this.err('cannot use assignment expressions with ' + this.describe(e), t);
        const value = this.parseExpr();
        return this.node('NamedExpr', t, { target: e, value: value });
      }
      return e;
    }

    parseExpr() {
      if (this.isKw('lambda')) return this.parseLambda();
      const e = this.parseOr();
      if (this.isKw('if')) {
        const t = this.next();
        const test = this.parseOr();
        if (!this.isKw('else')) throw this.err("expected 'else' after 'if' expression");
        this.p++;
        const orelse = this.parseExpr();
        return this.node('IfExp', t, { test: test, body: e, orelse: orelse });
      }
      return e;
    }

    parseLambda() {
      const t = this.next();
      const params = this.parseParams(':', false);
      this.expectOp(':');
      const body = this.parseExpr();
      return this.node('Lambda', t, { params: params, body: body });
    }

    parseOr() {
      let left = this.parseAnd();
      if (this.isKw('or')) {
        const values = [left];
        const t = this.tok;
        while (this.acceptKw('or')) values.push(this.parseAnd());
        return this.node('BoolOp', t, { op: 'or', values: values });
      }
      return left;
    }
    parseAnd() {
      let left = this.parseNot();
      if (this.isKw('and')) {
        const values = [left];
        const t = this.tok;
        while (this.acceptKw('and')) values.push(this.parseNot());
        return this.node('BoolOp', t, { op: 'and', values: values });
      }
      return left;
    }
    parseNot() {
      if (this.isKw('not')) {
        const t = this.next();
        return this.node('UnaryOp', t, { op: 'not', operand: this.parseNot() });
      }
      return this.parseComparison();
    }

    parseComparison() {
      const left = this.parseBitOr();
      const ops = [], comps = [];
      let t0 = null;
      for (;;) {
        const t = this.tok;
        let op = null;
        if (t.t === 'OP' && CMP_OPS.has(t.v)) { op = t.v; this.p++; }
        else if (t.t === 'NAME') {
          if (t.v === 'in') { op = 'in'; this.p++; }
          else if (t.v === 'not' && this.peek().t === 'NAME' && this.peek().v === 'in') { op = 'not in'; this.p += 2; }
          else if (t.v === 'is') {
            this.p++;
            if (this.acceptKw('not')) op = 'is not'; else op = 'is';
          }
        }
        if (!op) break;
        if (!t0) t0 = t;
        ops.push(op);
        comps.push(this.parseBitOr());
      }
      if (!ops.length) return left;
      return this.node('Compare', t0, { left: left, ops: ops, comps: comps });
    }

    binLevel(next, ops) {
      let left = next.call(this);
      while (this.tok.t === 'OP' && ops.indexOf(this.tok.v) >= 0) {
        const t = this.next();
        const right = next.call(this);
        left = this.node('BinOp', t, { op: t.v, left: left, right: right });
      }
      return left;
    }
    parseBitOr() { return this.binLevel(this.parseBitXor, ['|']); }
    parseBitXor() { return this.binLevel(this.parseBitAnd, ['^']); }
    parseBitAnd() { return this.binLevel(this.parseShift, ['&']); }
    parseShift() { return this.binLevel(this.parseArith, ['<<', '>>']); }
    parseArith() { return this.binLevel(this.parseTerm, ['+', '-']); }
    parseTerm() { return this.binLevel(this.parseFactor, ['*', '/', '//', '%', '@']); }

    parseFactor() {
      const t = this.tok;
      if (t.t === 'OP' && (t.v === '-' || t.v === '+' || t.v === '~')) {
        this.p++;
        return this.node('UnaryOp', t, { op: t.v, operand: this.parseFactor() });
      }
      return this.parsePower();
    }

    parsePower() {
      const base = this.parsePrimary();
      if (this.isOp('**')) {
        const t = this.next();
        const exp = this.parseFactor();
        return this.node('BinOp', t, { op: '**', left: base, right: exp });
      }
      return base;
    }

    parsePrimary() {
      let e = this.parseAtom();
      for (;;) {
        const t = this.tok;
        if (t.t !== 'OP') break;
        if (t.v === '(') {
          this.p++;
          const args = this.parseCallArgs();
          this.expectCloser(')', t);
          e = this.node('Call', t, { func: e, args: args });
        } else if (t.v === '[') {
          this.p++;
          const index = this.parseSubscript();
          this.expectCloser(']', t);
          e = this.node('Subscript', t, { value: e, index: index });
        } else if (t.v === '.') {
          this.p++;
          if (this.tok.t !== 'NAME') throw this.err('invalid syntax');
          const nm = this.next();
          e = this.node('Attribute', nm, { value: e, attr: nm.v });
        } else break;
      }
      return e;
    }

    expectCloser(c, openTok) {
      if (this.isOp(c)) { this.p++; return; }
      if (this.tok.t === 'NEWLINE' || this.tok.t === 'EOF') throw PY.synErr(this.file, openTok.line, openTok.col, "'" + openTok.v + "' was never closed");
      throw this.err(this.tok.t === 'OP' && (this.tok.v === ')' || this.tok.v === ']' || this.tok.v === '}')
        ? "closing parenthesis '" + this.tok.v + "' does not match opening parenthesis '" + openTok.v + "'"
        : 'invalid syntax. Perhaps you forgot a comma?');
    }

    parseCallArgs() {
      const args = [];
      while (!this.isOp(')')) {
        const t = this.tok;
        if (this.isOp('*')) { this.p++; args.push({ expr: this.parseExpr(), star: 1 }); }
        else if (this.isOp('**')) { this.p++; args.push({ expr: this.parseExpr(), star: 2 }); }
        else if (t.t === 'NAME' && !KEYWORDS.has(t.v) && this.peek().t === 'OP' && this.peek().v === '=') {
          this.p += 2;
          args.push({ expr: this.parseExpr(), name: t.v, star: 0, line: t.line, col: t.col });
        } else {
          let e = this.parseNamedExpr();
          if (this.isKw('for')) {
            const gens = this.parseCompFor();
            e = this.node('GenExp', t, { elt: e, gens: gens });
          }
          args.push({ expr: e, star: 0 });
        }
        if (!this.acceptOp(',')) break;
      }
      return args;
    }

    parseSubscript() {
      const t = this.tok;
      const first = this.parseSliceItem();
      if (!this.isOp(',')) return first;
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isOp(']')) break;
        elts.push(this.parseSliceItem());
      }
      return this.node('Tuple', t, { elts: elts });
    }

    parseSliceItem() {
      const t = this.tok;
      let lower = null, upper = null, step = null;
      if (!this.isOp(':')) {
        lower = this.parseStarOrExpr();
        if (!this.isOp(':')) return lower;
      }
      this.expectOp(':');
      if (!this.isOp(':') && !this.isOp(']') && !this.isOp(',')) upper = this.parseExpr();
      if (this.acceptOp(':')) {
        if (!this.isOp(']') && !this.isOp(',')) step = this.parseExpr();
      }
      return this.node('Slice', t, { lower: lower, upper: upper, step: step });
    }

    parseCompFor() {
      const gens = [];
      while (this.isKw('for')) {
        this.p++;
        const target = this.parseTargetList();
        if (!this.isKw('in')) throw this.err("expected 'in'");
        this.p++;
        const iter = this.parseOr();
        const ifs = [];
        while (this.isKw('if')) {
          this.p++;
          ifs.push(this.parseOr());
        }
        gens.push({ target: target, iter: iter, ifs: ifs });
      }
      return gens;
    }

    parseAtom() {
      const t = this.tok;
      switch (t.t) {
        case 'NUM': this.p++; return this.node('Num', t, { value: t.v });
        case 'STR': case 'FSTR': return this.parseStrings();
        case 'NAME': {
          if (t.v === 'True') { this.p++; return this.node('Const', t, { value: true }); }
          if (t.v === 'False') { this.p++; return this.node('Const', t, { value: false }); }
          if (t.v === 'None') { this.p++; return this.node('Const', t, { value: null }); }
          if (KEYWORDS.has(t.v)) {
            if (t.v === 'lambda') return this.parseLambda();
            if (t.v === 'await') throw this.err('async/await wird noch nicht unterstützt');
            if (t.v === 'yield') return this.parseYield();
            throw this.err('invalid syntax');
          }
          this.p++;
          return this.node('Name', t, { id: t.v });
        }
        case 'OP': {
          if (t.v === '(') {
            this.p++;
            if (this.isOp(')')) { this.p++; return this.node('Tuple', t, { elts: [] }); }
            const first = this.parseStarOrExpr();
            if (this.isKw('for')) {
              const gens = this.parseCompFor();
              this.expectCloser(')', t);
              return this.node('GenExp', t, { elt: first, gens: gens });
            }
            if (this.isOp(',')) {
              const elts = [first];
              while (this.acceptOp(',')) {
                if (this.isOp(')')) break;
                elts.push(this.parseStarOrExpr());
              }
              this.expectCloser(')', t);
              return this.node('Tuple', t, { elts: elts, paren: true });
            }
            this.expectCloser(')', t);
            first.paren = true;
            return first;
          }
          if (t.v === '[') {
            this.p++;
            if (this.isOp(']')) { this.p++; return this.node('List', t, { elts: [] }); }
            const first = this.parseStarOrExpr();
            if (this.isKw('for')) {
              const gens = this.parseCompFor();
              this.expectCloser(']', t);
              return this.node('ListComp', t, { elt: first, gens: gens });
            }
            const elts = [first];
            while (this.acceptOp(',')) {
              if (this.isOp(']')) break;
              elts.push(this.parseStarOrExpr());
            }
            this.expectCloser(']', t);
            return this.node('List', t, { elts: elts });
          }
          if (t.v === '{') return this.parseBraces();
          if (t.v === '...') { this.p++; return this.node('Const', t, { value: PY.ELLIPSIS }); }
          if (t.v === '*') throw this.err('invalid syntax');
          throw this.err('invalid syntax');
        }
        case 'NEWLINE': case 'EOF':
          throw this.errAfterPrev('invalid syntax');
        case 'INDENT': throw this.err('unexpected indent', t, 'IndentationError');
      }
      throw this.err('invalid syntax');
    }

    parseBraces() {
      const t = this.next(); // {
      if (this.isOp('}')) { this.p++; return this.node('Dict', t, { keys: [], values: [] }); }
      if (this.isOp('**')) {
        // Dict mit Entpacken
        return this.parseDictRest(t, [], []);
      }
      const first = this.parseStarOrExpr();
      if (this.isOp(':')) {
        this.p++;
        const val = this.parseExpr();
        if (this.isKw('for')) {
          const gens = this.parseCompFor();
          this.expectCloser('}', t);
          return this.node('DictComp', t, { key: first, value: val, gens: gens });
        }
        const keys = [first], values = [val];
        if (this.acceptOp(',')) return this.parseDictRest(t, keys, values);
        this.expectCloser('}', t);
        return this.node('Dict', t, { keys: keys, values: values });
      }
      if (this.isKw('for')) {
        const gens = this.parseCompFor();
        this.expectCloser('}', t);
        return this.node('SetComp', t, { elt: first, gens: gens });
      }
      const elts = [first];
      while (this.acceptOp(',')) {
        if (this.isOp('}')) break;
        elts.push(this.parseStarOrExpr());
      }
      this.expectCloser('}', t);
      return this.node('Set', t, { elts: elts });
    }

    parseDictRest(t, keys, values) {
      while (!this.isOp('}')) {
        if (this.acceptOp('**')) {
          keys.push(null); values.push(this.parseBitOr());
        } else {
          const k = this.parseExpr();
          this.expectOp(':');
          keys.push(k); values.push(this.parseExpr());
        }
        if (!this.acceptOp(',')) break;
      }
      this.expectCloser('}', t);
      return this.node('Dict', t, { keys: keys, values: values });
    }

    /* Aufeinanderfolgende String-Literale (auch f-Strings) */
    parseStrings() {
      const first = this.tok;
      const parts = [];
      let hasF = false;
      while (this.tok.t === 'STR' || this.tok.t === 'FSTR') {
        const t = this.next();
        if (t.t === 'STR') parts.push(t.v);
        else { hasF = true; this.parseFString(t, parts); }
      }
      if (!hasF) return this.node('Str', first, { value: parts.join('') });
      // benachbarte Texte zusammenfassen
      const merged = [];
      for (const p of parts) {
        if (typeof p === 'string' && typeof merged[merged.length - 1] === 'string') merged[merged.length - 1] += p;
        else merged.push(p);
      }
      return this.node('JoinedStr', first, { parts: merged });
    }

    /* f-String-Inhalt in Textteile und {Ausdrücke} zerlegen */
    parseFString(tok, out) {
      const s = tok.v;
      const self = this;
      function fail(msg) { return PY.synErr(self.file, tok.line, tok.col, 'f-string: ' + msg); }
      function parseParts(str, depthSpec) {
        const res = [];
        let lit = '';
        let i = 0;
        const flush = () => {
          if (lit) { res.push(tok.raw ? lit : PY.decodeEscapes(lit, self.file, tok.line, tok.col)); lit = ''; }
        };
        while (i < str.length) {
          const c = str[i];
          if (c === '{') {
            if (str[i + 1] === '{' && !depthSpec) { lit += '{'; i += 2; continue; }
            flush();
            // Ausdruck bis zum passenden } (Klammern, Strings beachten)
            let j = i + 1, d = 0, q = null;
            let exprEnd = -1, conv = null, specStart = -1, end = -1;
            while (j < str.length) {
              const ch = str[j];
              if (q) {
                if (ch === '\\') { j += 2; continue; }
                if (ch === q) q = null;
                j++; continue;
              }
              if (ch === '"' || ch === "'") { q = ch; j++; continue; }
              if (ch === '(' || ch === '[' || ch === '{') d++;
              else if (ch === ')' || ch === ']') d--;
              else if (ch === '}') {
                if (d === 0) { end = j; break; }
                d--;
              } else if (d === 0 && ch === '!' && str[j + 1] !== '=') {
                exprEnd = j; conv = str[j + 1]; j += 2;
                if (str[j] === ':') { specStart = j + 1; }
                continue;
              } else if (d === 0 && ch === ':' && specStart < 0) {
                if (exprEnd < 0) exprEnd = j;
                specStart = j + 1;
                // Formatangabe bis zur passenden schließenden Klammer lesen
                let k = specStart, dd = 0;
                while (k < str.length) {
                  if (str[k] === '{') dd++;
                  else if (str[k] === '}') { if (dd === 0) break; dd--; }
                  k++;
                }
                end = k;
                break;
              }
              j++;
            }
            if (end < 0) throw fail("expecting '}'");
            if (exprEnd < 0) exprEnd = end;
            else if (specStart >= 0 && conv !== null && exprEnd < end) { /* ok */ }
            let exprSrc = str.slice(i + 1, exprEnd);
            let selfDoc = false;
            if (/=\s*$/.test(exprSrc) && !/[=!<>]=\s*$/.test(exprSrc)) { selfDoc = true; exprSrc = exprSrc.replace(/=\s*$/, ''); }
            if (!exprSrc.trim()) throw fail('valid expression required before \'}\'');
            let expr;
            try {
              const sub = new Parser(exprSrc.trim(), self.file, { noIndent: true, line: tok.line });
              expr = sub.parseExprListStar();
              if (sub.tok.t !== 'NEWLINE' && sub.tok.t !== 'EOF') throw sub.err('invalid syntax');
            } catch (e) {
              if (e instanceof KON.LangError) { e.message = 'f-string: ' + e.message; e.line = tok.line; e.col = tok.col; }
              throw e;
            }
            let spec = null;
            if (specStart >= 0) {
              const specEnd = str[end] === '}' ? end : end;
              spec = parseParts(str.slice(specStart, specEnd), true);
            }
            if (selfDoc) res.push(exprSrc + '=');
            res.push({ expr: expr, conv: conv, spec: spec, selfDoc: selfDoc });
            i = end + 1;
            continue;
          }
          if (c === '}') {
            if (str[i + 1] === '}' && !depthSpec) { lit += '}'; i += 2; continue; }
            if (depthSpec) { lit += c; i++; continue; }
            throw fail("single '}' is not allowed");
          }
          if (c === '\\' && !tok.raw) { lit += c + (str[i + 1] || ''); i += 2; continue; }
          lit += c; i++;
        }
        flush();
        return res;
      }
      for (const p of parseParts(s, false)) out.push(p);
    }
  }

  PY.Parser = Parser;
  PY.ELLIPSIS = { ellipsis: true };

  /* parse(src, file) -> Module-Baum */
  PY.parse = function (src, file) {
    const p = new Parser(src, file);
    return p.parseModule();
  };
})(typeof window !== 'undefined' ? window : globalThis);
