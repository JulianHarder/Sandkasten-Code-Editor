/* C#-Parser: Tokens -> Syntaxbaum (Teilmenge von C# 12) */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};

  const TYPE_KW = new Set(['int', 'string', 'bool', 'double', 'char', 'decimal', 'long', 'short', 'byte', 'float', 'object', 'uint', 'ulong', 'ushort', 'sbyte', 'void']);
  const MODS = new Set(['public', 'private', 'protected', 'internal', 'static', 'readonly', 'const', 'abstract', 'virtual', 'override', 'sealed', 'partial',
    'new', 'extern', 'unsafe', 'volatile', 'async', 'required', 'file']);
  const BINPREC = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, 'is': 7, 'as': 7,
    '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10
  };
  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '??=']);

  class Parser {
    constructor(src, file, opts) {
      this.file = file;
      this.toks = CS.lex(src, file, opts);
      this.p = 0;
    }
    get tok() { return this.toks[this.p]; }
    peek(k) { return this.toks[Math.min(this.p + (k || 1), this.toks.length - 1)]; }
    next() { return this.toks[this.p++]; }

    err(code, msg, tok) {
      tok = tok || this.tok;
      return CS.csErr(this.file, tok.line, tok.col, code, msg);
    }
    errAfterPrev(code, msg) {
      const prev = this.toks[this.p - 1];
      if (!prev) return this.err(code, msg);
      return CS.csErr(this.file, prev.eline, prev.ecol, code, msg);
    }
    tokText(t) {
      if (t.t === 'eof') return 'EOF';
      if (t.t === 'str') return '"' + t.v + '"';
      if (t.t === 'istr') return '$"';
      if (t.t === 'chr') return "'" + t.v + "'";
      return String(t.v);
    }

    isOp(v) { const t = this.tok; return t.t === 'op' && t.v === v; }
    isKw(v) { const t = this.tok; return t.t === 'kw' && t.v === v; }
    isId(v) { const t = this.tok; return t.t === 'id' && (v === undefined || t.v === v); }
    acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    acceptKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
    acceptId(v) { if (this.isId(v)) { this.p++; return true; } return false; }

    expectOp(v) {
      if (this.isOp(v)) return this.next();
      if (v === ';') throw this.errAfterPrev('CS1002', '; erwartet');
      if (v === ')') throw this.errAfterPrev('CS1026', ') erwartet');
      if (v === '}') throw this.eofOrErr('CS1513', '} erwartet');
      if (v === '{') throw this.errAfterPrev('CS1514', '{ erwartet');
      throw this.errAfterPrev('CS1003', 'Syntaxfehler, "' + v + '" erwartet');
    }
    eofOrErr(code, msg) {
      if (this.tok.t === 'eof') return this.errAfterPrev(code, msg);
      return this.errAfterPrev(code, msg);
    }
    expectKw(v) {
      if (this.isKw(v)) return this.next();
      throw this.errAfterPrev('CS1003', 'Syntaxfehler, "' + v + '" erwartet');
    }
    expectIdent() {
      const t = this.tok;
      if (t.t === 'id') { this.p++; return t; }
      if (t.t === 'kw') throw this.err('CS1001', 'Bezeichner erwartet');
      throw this.errAfterPrev('CS1001', 'Bezeichner erwartet');
    }

    node(type, tok, props) { return Object.assign({ type: type, line: tok.line, col: tok.col }, props); }

    /* ---------- Typen ---------- */
    /* Splittet ">>" bei verschachtelten Generics */
    closeAngle() {
      const t = this.tok;
      if (t.t === 'op' && t.v === '>') { this.p++; return true; }
      return false;
    }

    /* Zusammengesetzte Operatoren aus einzelnen ">"-Tokens (>>, >>=) erkennen */
    combinedOp() {
      const t = this.tok;
      if (t.t !== 'op') return null;
      if (t.v === '>') {
        const n = this.peek();
        if (n.t === 'op' && n.line === t.line && n.col === t.ecol) {
          if (n.v === '>') return { op: '>>', count: 2 };
          if (n.v === '>=') return { op: '>>=', count: 2 };
        }
      }
      return { op: t.v, count: 1 };
    }

    /* Versucht einen Typ zu lesen; bei Misserfolg Position zurücksetzen und null liefern */
    tryParseType(opts) {
      const save = this.p;
      const saveToks = null;
      void saveToks;
      try {
        const t = this.parseType(opts);
        return t;
      } catch (e) {
        if (e instanceof KON.LangError) { this.p = save; return null; }
        throw e;
      }
    }

    parseType(opts) {
      opts = opts || {};
      const start = this.tok;
      let t;
      if (start.t === 'kw' && TYPE_KW.has(start.v)) {
        this.p++;
        t = { k: 'name', name: start.v, args: [], line: start.line, col: start.col };
      } else if (start.t === 'id') {
        let name = this.next().v;
        let args = [];
        if (this.isOp('::')) { this.p++; name = this.expectIdent().v; }
        if (this.isOp('<')) args = this.parseTypeArgs();
        while (this.isOp('.') && this.peek().t === 'id') {
          this.p++;
          name = this.next().v;
          args = [];
          if (this.isOp('<')) args = this.parseTypeArgs();
        }
        t = { k: 'name', name: name, args: args, line: start.line, col: start.col };
      } else if (start.t === 'op' && start.v === '(') {
        this.p++;
        const elems = [];
        do {
          const et = this.parseType();
          let nm = null;
          if (this.tok.t === 'id' && !(this.peek().t === 'op' && (this.peek().v === '.' || this.peek().v === '<'))) nm = this.next().v;
          elems.push({ type: et, name: nm });
        } while (this.acceptOp(','));
        if (!this.acceptOp(')')) throw this.err('CS1026', ') erwartet');
        if (elems.length < 2) throw this.err('CS8124', 'Tupel müssen mindestens zwei Elemente enthalten');
        t = { k: 'tuple', elems: elems, line: start.line, col: start.col };
      } else {
        throw this.err('CS1031', 'Typ erwartet');
      }
      // Nullable und Arrays
      for (;;) {
        if (this.isOp('?') && !opts.noNullable) {
          // nur wenn danach kein Ausdruck beginnt (bei is/as) – in Deklarationen immer
          if (opts.checkNullable) {
            const n = this.peek();
            const exprStart = n.t === 'id' || n.t === 'num' || n.t === 'str' || n.t === 'istr' || n.t === 'chr' || (n.t === 'kw' && !TYPE_KW.has(n.v) ) || (n.t === 'op' && (n.v === '(' || n.v === '!' || n.v === '-' || n.v === '['));
            if (exprStart) break;
          }
          this.p++;
          t = { k: 'null', inner: t, line: start.line, col: start.col };
          continue;
        }
        if (this.isOp('[')) {
          // Array-Spezifizierer: [] oder [,]
          let j = this.p + 1, rank = 1;
          while (this.toks[j].t === 'op' && this.toks[j].v === ',') { rank++; j++; }
          if (this.toks[j].t === 'op' && this.toks[j].v === ']') {
            this.p = j + 1;
            t = { k: 'array', elem: t, rank: rank, line: start.line, col: start.col };
            continue;
          }
        }
        break;
      }
      return t;
    }

    parseTypeArgs() {
      this.expectOp('<');
      const args = [];
      if (this.isOp('>')) { this.p++; return args; } // offene Generics typeof(List<>)
      do {
        if (this.isOp(',')) { args.push({ k: 'name', name: '?', args: [] }); continue; }
        args.push(this.parseType());
      } while (this.acceptOp(','));
      if (!this.closeAngle()) throw this.err('CS1003', 'Syntaxfehler, ">" erwartet');
      return args;
    }

    /* ---------- Programm ---------- */
    parseUnit() {
      const unit = { type: 'Unit', usings: [], types: [], stmts: [], line: 1, col: 1 };
      while (this.tok.t !== 'eof') {
        this.parseTopLevel(unit);
      }
      return unit;
    }

    parseTopLevel(unit) {
      const t = this.tok;
      if (t.t === 'kw' && t.v === 'using' && !(this.peek().t === 'op' && this.peek().v === '(') && this.isUsingDirective()) {
        this.p++;
        let isStatic = false, alias = null;
        if (this.acceptKw('static')) isStatic = true;
        if (this.tok.t === 'id' && this.peek().t === 'op' && this.peek().v === '=') { alias = this.next().v; this.p++; }
        let name = this.parseQualifiedName();
        this.expectOp(';');
        unit.usings.push({ name: name, alias: alias, isStatic: isStatic, line: t.line, col: t.col });
        return;
      }
      if (t.t === 'id' && t.v === 'global' && this.peek().t === 'kw' && this.peek().v === 'using') { this.p++; return this.parseTopLevel(unit); }
      if (t.t === 'kw' && t.v === 'namespace') {
        this.p++;
        const name = this.parseQualifiedName();
        if (this.acceptOp(';')) {
          // dateibezogener Namespace: Rest der Datei
          while (this.tok.t !== 'eof') this.parseTopLevel(unit);
          return;
        }
        this.expectOp('{');
        while (!this.isOp('}')) {
          if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
          this.parseTopLevel(unit);
        }
        this.p++;
        void name;
        return;
      }
      if (t.t === 'op' && t.v === '[') {
        // Attribut: [Serializable] – überspringen
        this.skipAttributes();
        return this.parseTopLevel(unit);
      }
      // Typdeklaration?
      if (this.isTypeDeclStart()) {
        unit.types.push(this.parseTypeDecl());
        return;
      }
      // Top-Level-Anweisung
      unit.stmts.push(this.parseStatement());
    }

    isUsingDirective() {
      // using System;  /  using X = Y;  /  using static ...;   (nicht: using var x = ...; using (...))
      const n = this.peek();
      if (n.t === 'kw' && n.v === 'static') return true;
      if (n.t === 'id' && n.v === 'var') return false;
      if (n.t !== 'id') return false;
      // using Name.Name;  oder using Alias = ...;
      let j = this.p + 1;
      while (this.toks[j].t === 'id' && this.toks[j + 1].t === 'op' && this.toks[j + 1].v === '.') j += 2;
      if (this.toks[j].t !== 'id') return false;
      const after = this.toks[j + 1];
      return after.t === 'op' && (after.v === ';' || after.v === '=');
    }

    skipAttributes() {
      while (this.isOp('[')) {
        let d = 0;
        do {
          if (this.isOp('[')) d++;
          else if (this.isOp(']')) d--;
          else if (this.tok.t === 'eof') throw this.err('CS1003', 'Syntaxfehler, "]" erwartet');
          this.p++;
        } while (d > 0);
      }
    }

    parseQualifiedName() {
      let name = this.expectIdent().v;
      while (this.isOp('.')) { this.p++; name += '.' + this.expectIdent().v; }
      return name;
    }

    isTypeDeclStart() {
      let j = this.p;
      for (;;) {
        const t = this.toks[j];
        if (t.t === 'kw' && (MODS.has(t.v))) { j++; continue; }
        if (t.t === 'id' && (t.v === 'partial' || t.v === 'required' || t.v === 'file') && this.toks[j + 1].t !== 'op') { j++; continue; }
        break;
      }
      const t = this.toks[j];
      if (t.t === 'kw' && (t.v === 'class' || t.v === 'struct' || t.v === 'interface' || t.v === 'enum' || t.v === 'delegate')) return true;
      if (t.t === 'id' && t.v === 'record' && (this.toks[j + 1].t === 'id' || (this.toks[j + 1].t === 'kw' && (this.toks[j + 1].v === 'class' || this.toks[j + 1].v === 'struct')))) return true;
      return false;
    }

    parseModifiers() {
      const mods = new Set();
      for (;;) {
        const t = this.tok;
        if (t.t === 'kw' && MODS.has(t.v)) {
          // 'new' als Modifikator nur vor Typ/Member, nicht vor Ausdruck – hier immer Modifikator
          mods.add(t.v); this.p++; continue;
        }
        if (t.t === 'id' && (t.v === 'partial' || t.v === 'required' || t.v === 'file') && (this.peek().t === 'kw' || this.peek().t === 'id')) { mods.add(t.v); this.p++; continue; }
        if (t.t === 'id' && t.v === 'async' && (this.peek().t === 'kw' || this.peek().t === 'id')) { throw this.err('CS8999', 'async/await wird in diesem Editor noch nicht unterstützt'); }
        break;
      }
      return mods;
    }

    parseTypeParams() {
      const names = [];
      if (this.isOp('<')) {
        this.p++;
        do {
          while (this.isId('in') || this.isKw('in') || this.isKw('out')) this.p++;
          names.push(this.expectIdent().v);
        } while (this.acceptOp(','));
        if (!this.closeAngle()) throw this.err('CS1003', 'Syntaxfehler, ">" erwartet');
      }
      return names;
    }

    skipConstraints() {
      while (this.isId('where')) {
        this.p++;
        this.expectIdent(); this.expectOp(':');
        do {
          if (this.isKw('new')) { this.p++; this.expectOp('('); this.expectOp(')'); }
          else if (this.isKw('class') || this.isKw('struct')) this.p++;
          else this.parseType();
        } while (this.acceptOp(','));
      }
    }

    parseTypeDecl() {
      const startTok = this.tok;
      const mods = this.parseModifiers();
      const t = this.tok;
      if (t.t === 'kw' && t.v === 'delegate') {
        this.p++;
        const ret = this.parseType();
        const name = this.expectIdent().v;
        this.parseTypeParams();
        this.expectOp('(');
        const params = this.parseParams();
        this.expectOp(')');
        this.skipConstraints();
        this.expectOp(';');
        return this.node('Delegate', startTok, { name: name, params: params, ret: ret, mods: mods });
      }
      let kind;
      if (t.t === 'kw' && (t.v === 'class' || t.v === 'struct' || t.v === 'interface' || t.v === 'enum')) { kind = t.v; this.p++; }
      else if (t.t === 'id' && t.v === 'record') {
        this.p++;
        kind = 'record';
        if (this.isKw('class')) this.p++;
        else if (this.isKw('struct')) { this.p++; kind = 'recordstruct'; }
      } else throw this.err('CS1519', 'Ungültiges Token "' + this.tokText(t) + '" in einer Klassen-, Struktur- oder Schnittstellenmemberdeklaration');
      const name = this.expectIdent();
      const typeParams = this.parseTypeParams();
      let recordParams = null;
      if ((kind === 'record' || kind === 'recordstruct') && this.isOp('(')) {
        this.p++;
        recordParams = this.parseParams();
        this.expectOp(')');
      }
      const bases = [];
      if (this.acceptOp(':')) {
        do { bases.push(this.parseType()); } while (this.acceptOp(','));
      }
      this.skipConstraints();
      const decl = this.node('TypeDecl', name, { kind: kind, name: name.v, typeParams: typeParams, bases: bases, mods: mods, members: [], recordParams: recordParams });
      if (kind !== 'enum' && (kind === 'record' || kind === 'recordstruct') && this.acceptOp(';')) return decl;
      this.expectOp('{');
      if (kind === 'enum') {
        while (!this.isOp('}')) {
          if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
          if (this.isOp('[')) this.skipAttributes();
          const mn = this.expectIdent();
          let value = null;
          if (this.acceptOp('=')) value = this.parseExpression();
          decl.members.push({ type: 'EnumMember', name: mn.v, value: value, line: mn.line, col: mn.col });
          if (!this.acceptOp(',')) break;
        }
        this.expectOp('}');
        return decl;
      }
      while (!this.isOp('}')) {
        if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
        this.parseMember(decl);
      }
      this.p++;
      return decl;
    }

    parseParams() {
      const params = [];
      while (!this.isOp(')')) {
        if (this.isOp('[')) this.skipAttributes();
        const pm = { mods: new Set() };
        const st = this.tok;
        for (;;) {
          if (this.isKw('ref') || this.isKw('out') || this.isKw('in') || this.isKw('params') || this.isKw('this') || this.isId('scoped')) { pm.mods.add(this.next().v); continue; }
          break;
        }
        pm.type = this.parseType();
        const nm = this.expectIdent();
        pm.name = nm.v; pm.line = nm.line; pm.col = nm.col;
        pm.default = null;
        if (this.acceptOp('=')) pm.default = this.parseExpression();
        void st;
        params.push(pm);
        if (!this.acceptOp(',')) break;
      }
      return params;
    }

    parseMember(decl) {
      if (this.isOp('[')) { this.skipAttributes(); return; }
      const startTok = this.tok;
      if (this.isOp(';')) { this.p++; return; }
      if (this.isTypeDeclStart()) { decl.members.push(this.parseTypeDecl()); return; }
      const mods = this.parseModifiers();
      const t = this.tok;
      // Konstruktor: Name(
      if (t.t === 'id' && t.v === decl.name && this.peek().t === 'op' && this.peek().v === '(') {
        this.p += 2;
        const params = this.parseParams();
        this.expectOp(')');
        let init = null;
        if (this.acceptOp(':')) {
          const k = this.tok;
          if (!(this.isKw('this') || this.isKw('base'))) throw this.err('CS1003', 'Syntaxfehler, "this" oder "base" erwartet');
          this.p++;
          this.expectOp('(');
          const args = this.parseArgs(')');
          this.expectOp(')');
          init = { kind: k.v, args: args };
        }
        let body = null;
        if (this.isOp('{')) body = this.parseBlock(); else this.expectOp(';');
        decl.members.push(this.node('Ctor', startTok, { mods: mods, params: params, init: init, body: body }));
        return;
      }
      // Destruktor
      if (t.t === 'op' && t.v === '~') { this.p++; this.expectIdent(); this.expectOp('('); this.expectOp(')'); decl.members.push(this.node('Dtor', startTok, { body: this.parseBlock() })); return; }
      // Operator / Konvertierung
      if (this.isKw('implicit') || this.isKw('explicit')) {
        const kind = this.next().v;
        this.expectKw('operator');
        const type = this.parseType();
        this.expectOp('('); const params = this.parseParams(); this.expectOp(')');
        const body = this.parseBodyOrExpr();
        decl.members.push(this.node('Operator', startTok, { mods: mods, op: kind, ret: type, params: params, body: body.body, expr: body.expr }));
        return;
      }
      if (this.isKw('event')) {
        this.p++;
        const evType = this.parseType();
        const evName = this.expectIdent();
        if (this.isOp('{')) throw this.err('CS8999', 'Ereignis-Accessoren (add/remove) werden noch nicht unterstützt');
        this.expectOp(';');
        decl.members.push(this.node('Field', startTok, { mods: mods, valType: evType, decls: [{ name: evName.v, init: null, line: evName.line, col: evName.col }], isEvent: true }));
        return;
      }
      if (!(t.t === 'id' || (t.t === 'kw' && TYPE_KW.has(t.v)) || (t.t === 'op' && t.v === '('))) {
        throw this.err('CS1519', 'Ungültiges Token "' + this.tokText(t) + '" in einer Klassen-, Struktur- oder Schnittstellenmemberdeklaration');
      }
      const type = this.parseType();
      // Operator-Überladung
      if (this.isKw('operator')) {
        this.p++;
        const opTok = this.next();
        let op = opTok.v;
        if ((op === '>' && this.isOp('>'))) { op = '>>'; this.p++; }
        this.expectOp('('); const params = this.parseParams(); this.expectOp(')');
        const body = this.parseBodyOrExpr();
        decl.members.push(this.node('Operator', startTok, { mods: mods, op: op, ret: type, params: params, body: body.body, expr: body.expr }));
        return;
      }
      // Indexer
      if (this.isKw('this')) {
        this.p++;
        this.expectOp('[');
        const params = this.parseParams();
        this.expectOp(']');
        const acc = this.parseAccessors();
        decl.members.push(this.node('Indexer', startTok, { mods: mods, valType: type, params: params, get: acc.get, set: acc.set, expr: acc.expr }));
        return;
      }
      const nameTok = this.tok;
      if (nameTok.t !== 'id') {
        if (this.isOp('(') && type.k === 'name') {
          // Methode ohne Rückgabetyp (Konstruktor mit falschem Namen)
          throw CS.csErr(this.file, type.line, type.col, 'CS1520', 'Methoden müssen einen Rückgabetyp aufweisen');
        }
        throw this.err('CS1001', 'Bezeichner erwartet');
      }
      this.p++;
      // Explizite Schnittstellenimplementierung IFoo.Method
      let name = nameTok.v;
      if (this.isOp('.')) { this.p++; name = this.expectIdent().v; }
      if (this.isOp('<') && this.peek().t === 'id') {
        // generische Methode
        const tp = this.parseTypeParams();
        return this.finishMethod(decl, startTok, mods, type, name, tp);
      }
      if (this.isOp('(')) return this.finishMethod(decl, startTok, mods, type, name, []);
      // Eigenschaft
      if (this.isOp('{') || this.isOp('=>')) {
        const acc = this.parseAccessors();
        let init = null;
        if (this.isOp('=') ) { this.p++; init = this.parseInitializer(); this.expectOp(';'); }
        decl.members.push(this.node('Property', startTok, { mods: mods, valType: type, name: name, get: acc.get, set: acc.set, expr: acc.expr, init: init, auto: acc.auto, initOnly: acc.initOnly, setPrivate: acc.setPrivate }));
        return;
      }
      // Feld(er)
      const decls = [];
      let first = true;
      let cur = { name: name, init: null, line: nameTok.line, col: nameTok.col };
      for (;;) {
        if (!first) {
          const nt = this.expectIdent();
          cur = { name: nt.v, init: null, line: nt.line, col: nt.col };
        }
        first = false;
        if (this.acceptOp('=')) cur.init = this.parseInitializer();
        decls.push(cur);
        if (!this.acceptOp(',')) break;
      }
      this.expectOp(';');
      decl.members.push(this.node('Field', startTok, { mods: mods, valType: type, decls: decls }));
    }

    finishMethod(decl, startTok, mods, ret, name, typeParams) {
      this.expectOp('(');
      const params = this.parseParams();
      this.expectOp(')');
      this.skipConstraints();
      const body = this.parseBodyOrExpr();
      decl.members.push(this.node('Method', startTok, { mods: mods, ret: ret, name: name, typeParams: typeParams, params: params, body: body.body, expr: body.expr }));
    }

    parseBodyOrExpr() {
      if (this.isOp('{')) return { body: this.parseBlock(), expr: null };
      if (this.acceptOp('=>')) {
        const e = this.parseExpression();
        this.expectOp(';');
        return { body: null, expr: e };
      }
      this.expectOp(';');
      return { body: null, expr: null };
    }

    parseAccessors() {
      const res = { get: null, set: null, expr: null, auto: false, initOnly: false, setPrivate: false };
      if (this.acceptOp('=>')) {
        res.expr = this.parseExpression();
        this.expectOp(';');
        return res;
      }
      this.expectOp('{');
      while (!this.isOp('}')) {
        if (this.isOp('[')) this.skipAttributes();
        let accMods = new Set();
        while (this.isKw('private') || this.isKw('protected') || this.isKw('internal') || this.isKw('public')) accMods.add(this.next().v);
        const t = this.tok;
        if (t.t !== 'id' || !(t.v === 'get' || t.v === 'set' || t.v === 'init')) throw this.err('CS1014', 'Ein get- oder set-Accessor wurde erwartet');
        this.p++;
        let body;
        if (this.isOp('{')) body = this.parseBlock();
        else if (this.acceptOp('=>')) { const e = this.parseExpression(); this.expectOp(';'); body = { type: 'ExprBody', expr: e, line: t.line, col: t.col }; }
        else { this.expectOp(';'); body = true; res.auto = true; }
        if (t.v === 'get') res.get = body;
        else { res.set = body; if (t.v === 'init') res.initOnly = true; if (accMods.has('private')) res.setPrivate = true; }
      }
      this.p++;
      if (res.get === true && res.set === null) res.auto = true;
      return res;
    }

    /* Initialisierer von Feldern/Variablen: Ausdruck oder {a, b} */
    parseInitializer() {
      if (this.isOp('{')) return this.parseArrayInit();
      return this.parseExpression();
    }
    parseArrayInit() {
      const t = this.next(); // {
      const elems = [];
      while (!this.isOp('}')) {
        elems.push(this.parseInitializer());
        if (!this.acceptOp(',')) break;
      }
      this.expectOp('}');
      return this.node('ArrayInit', t, { elems: elems });
    }

    /* ---------- Anweisungen ---------- */
    parseBlock() {
      const t = this.tok;
      this.expectOp('{');
      const stmts = [];
      while (!this.isOp('}')) {
        if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
        stmts.push(this.parseStatement());
      }
      const end = this.next();
      return this.node('Block', t, { stmts: stmts, endLine: end.line });
    }

    isDeclStart() {
      const t = this.tok;
      if (t.t === 'kw' && TYPE_KW.has(t.v) && t.v !== 'void') {
        const n = this.peek();
        if (n.t === 'op' && (n.v === '.' || n.v === '(')) return false;
        return true;
      }
      if (t.t === 'id') {
        if (t.v === 'var' && (this.peek().t === 'id' || (this.peek().t === 'op' && this.peek().v === '('))) return true;
        if (t.v === 'await' || t.v === 'yield') return false;
        const save = this.p;
        const ty = this.tryParseType();
        let result = false;
        if (ty && this.tok.t === 'id') {
          const n = this.peek();
          result = n.t === 'op' && (n.v === '=' || n.v === ';' || n.v === ',' || n.v === ')' || n.v === '[' || n.v === ':') || (n.t === 'id' && n.v === 'in') || (n.t === 'kw' && n.v === 'in');
          // Methode lokal? "int Foo(" -> lokale Funktion
          if (!result && n.t === 'op' && n.v === '(') result = true;
          if (!result && n.t === 'op' && n.v === '<') result = true;
        }
        this.p = save;
        return result;
      }
      if (t.t === 'op' && t.v === '(') {
        const save = this.p;
        const ty = this.tryParseType();
        const result = !!ty && ty.k === 'tuple' && this.tok.t === 'id';
        this.p = save;
        return result;
      }
      return false;
    }

    parseStatement() {
      const t = this.tok;
      if (t.t === 'op') {
        if (t.v === '{') return this.parseBlock();
        if (t.v === ';') { this.p++; return this.node('Empty', t); }
        if (t.v === '[') { this.skipAttributes(); return this.parseStatement(); }
      }
      if (t.t === 'kw') {
        switch (t.v) {
          case 'if': return this.parseIf();
          case 'while': {
            this.p++; this.expectOp('(');
            const cond = this.parseExpression();
            this.expectOp(')');
            return this.node('While', t, { cond: cond, body: this.parseEmbedded() });
          }
          case 'do': {
            this.p++;
            const body = this.parseEmbedded();
            this.expectKw('while'); this.expectOp('(');
            const cond = this.parseExpression();
            this.expectOp(')'); this.expectOp(';');
            return this.node('DoWhile', t, { cond: cond, body: body });
          }
          case 'for': return this.parseFor();
          case 'foreach': return this.parseForeach();
          case 'switch': return this.parseSwitch();
          case 'break': this.p++; this.expectOp(';'); return this.node('Break', t);
          case 'continue': this.p++; this.expectOp(';'); return this.node('Continue', t);
          case 'return': {
            this.p++;
            let expr = null;
            if (!this.isOp(';')) expr = this.parseExpression();
            this.expectOp(';');
            return this.node('Return', t, { expr: expr });
          }
          case 'throw': {
            this.p++;
            let expr = null;
            if (!this.isOp(';')) expr = this.parseExpression();
            this.expectOp(';');
            return this.node('Throw', t, { expr: expr });
          }
          case 'try': return this.parseTry();
          case 'using': {
            if (this.peek().t === 'op' && this.peek().v === '(') {
              this.p += 2;
              let decl = null, expr = null;
              if (this.isDeclStart()) decl = this.parseLocalDecl(false); else expr = this.parseExpression();
              this.expectOp(')');
              return this.node('Using', t, { decl: decl, expr: expr, body: this.parseEmbedded() });
            }
            // using var x = ...;
            this.p++;
            const decl = this.parseLocalDecl(true);
            this.expectOp(';');
            return this.node('UsingDecl', t, { decl: decl });
          }
          case 'lock': {
            this.p++; this.expectOp('(');
            const e = this.parseExpression(); this.expectOp(')');
            return this.node('Lock', t, { expr: e, body: this.parseEmbedded() });
          }
          case 'checked': case 'unchecked':
            if (this.peek().t === 'op' && this.peek().v === '{') { this.p++; return this.parseBlock(); }
            break;
          case 'goto': throw this.err('CS8999', 'goto wird in diesem Editor noch nicht unterstützt');
          case 'const': {
            this.p++;
            const d = this.parseLocalDecl(true);
            d.isConst = true;
            this.expectOp(';');
            return d;
          }
          case 'static': {
            // lokale statische Funktion
            this.p++;
            return this.parseStatement();
          }
          case 'class': case 'struct': case 'interface': case 'enum': case 'abstract': case 'sealed': case 'public': case 'private': case 'internal': case 'protected': case 'delegate':
            if (this.isTypeDeclStart()) return this.node('LocalType', t, { decl: this.parseTypeDecl() });
            break;
        }
      }
      if (t.t === 'id') {
        if (t.v === 'yield') throw this.err('CS8999', 'yield (Iteratoren) wird in diesem Editor noch nicht unterstützt');
        if (t.v === 'await' || (t.v === 'async' && this.peek().t !== 'op')) throw this.err('CS8999', 'async/await wird in diesem Editor noch nicht unterstützt');
        if (t.v === 'record' && this.isTypeDeclStart()) return this.node('LocalType', t, { decl: this.parseTypeDecl() });
        // Beschriftung (label:) -> nicht unterstützt
      }
      if (this.isTypeDeclStart() && t.t !== 'id') return this.node('LocalType', t, { decl: this.parseTypeDecl() });
      if (t.t === 'op' && t.v === '(') {
        const save0 = this.p;
        const tty = this.tryParseType();
        if (tty && tty.k === 'tuple' && this.isOp('=') && tty.elems.every((e) => e.name)) {
          this.p++;
          const init = this.parseExpression();
          this.expectOp(';');
          return this.node('LocalTuple', t, { names: tty.elems.map((e) => e.name), types: tty.elems.map((e) => e.type), init: init });
        }
        this.p = save0;
      }
      if (t.t === 'kw' && t.v === 'void' && this.peek().t === 'id') {
        this.p++;
        const nameTok = this.next();
        if (this.isOp('<')) this.parseTypeParams();
        this.expectOp('(');
        const params = this.parseParams();
        this.expectOp(')');
        this.skipConstraints();
        const body = this.parseBodyOrExpr();
        return this.node('LocalFunc', nameTok, { name: nameTok.v, ret: { k: 'name', name: 'void', args: [] }, params: params, body: body.body, expr: body.expr });
      }
      if (this.isDeclStart()) {
        // lokale Funktion?
        const save = this.p;
        const ty = this.tryParseType();
        if (ty && this.tok.t === 'id' && this.peek().t === 'op' && (this.peek().v === '(' || this.peek().v === '<')) {
          const nameTok = this.next();
          if (this.isOp('<')) this.parseTypeParams();
          this.expectOp('(');
          const params = this.parseParams();
          this.expectOp(')');
          this.skipConstraints();
          const body = this.parseBodyOrExpr();
          return this.node('LocalFunc', nameTok, { name: nameTok.v, ret: ty, params: params, body: body.body, expr: body.expr });
        }
        this.p = save;
        const d = this.parseLocalDecl(false);
        this.expectOp(';');
        return d;
      }
      // Ausdrucksanweisung
      const e = this.parseExpression();
      if (!this.isOp(';')) {
        if (this.tok.t === 'eof' || true) throw this.errAfterPrev('CS1002', '; erwartet');
      }
      this.p++;
      if (!this.isStatementExpr(e)) throw CS.csErr(this.file, e.line, e.col, 'CS0201', 'Nur Zuweisungs-, Aufruf-, Inkrement-, Dekrement- und neue Objektausdrücke können als Anweisung verwendet werden');
      return this.node('ExprStmt', t, { expr: e });
    }

    isStatementExpr(e) {
      switch (e.type) {
        case 'Assign': case 'Call': case 'New': case 'IncDec': case 'Throw': case 'Await': return true;
        case 'Tuple': return false;
      }
      return false;
    }

    parseEmbedded() {
      const t = this.tok;
      if (this.isDeclStart() && !this.isOp('{')) {
        // Deklaration als eingebettete Anweisung ist nicht erlaubt (CS1023)
        const save = this.p;
        try { this.parseLocalDecl(false); } catch (e) { this.p = save; return this.parseStatement(); }
        throw CS.csErr(this.file, t.line, t.col, 'CS1023', 'Eine eingebettete Anweisung darf keine Deklaration oder gekennzeichnete Anweisung sein');
      }
      return this.parseStatement();
    }

    parseLocalDecl(isConst) {
      const t = this.tok;
      let type;
      let tupleNames = null;
      if (this.isId('var')) {
        const vt = this.next();
        if (this.isOp('(')) {
          // var (a, b) = ...
          this.p++;
          tupleNames = [];
          do { tupleNames.push(this.expectIdent().v); } while (this.acceptOp(','));
          this.expectOp(')');
          this.expectOp('=');
          const init = this.parseExpression();
          return this.node('LocalTuple', t, { names: tupleNames, init: init });
        }
        type = { k: 'name', name: 'var', args: [], line: vt.line, col: vt.col };
      } else {
        type = this.parseType();
      }
      const decls = [];
      do {
        const nm = this.expectIdent();
        let init = null;
        if (this.acceptOp('=')) init = this.parseInitializer();
        else if (type.k === 'name' && type.name === 'var') throw CS.csErr(this.file, nm.line, nm.col, 'CS0818', 'Implizit typisierte Variablen müssen initialisiert werden');
        decls.push({ name: nm.v, init: init, line: nm.line, col: nm.col });
      } while (this.acceptOp(','));
      return this.node('Local', t, { varType: type, decls: decls, isConst: !!isConst });
    }

    parseIf() {
      const t = this.next();
      this.expectOp('(');
      const cond = this.parseExpression();
      this.expectOp(')');
      const then = this.parseEmbedded();
      let els = null;
      if (this.acceptKw('else')) els = this.parseEmbedded();
      return this.node('If', t, { cond: cond, then: then, els: els });
    }

    parseFor() {
      const t = this.next();
      this.expectOp('(');
      let init = [];
      if (!this.isOp(';')) {
        if (this.isDeclStart()) init = [this.parseLocalDecl(false)];
        else {
          do { init.push(this.node('ExprStmt', this.tok, { expr: this.parseExpression() })); } while (this.acceptOp(','));
        }
      }
      this.expectOp(';');
      let cond = null;
      if (!this.isOp(';')) cond = this.parseExpression();
      this.expectOp(';');
      const iters = [];
      if (!this.isOp(')')) { do { iters.push(this.parseExpression()); } while (this.acceptOp(',')); }
      this.expectOp(')');
      return this.node('For', t, { init: init, cond: cond, iters: iters, body: this.parseEmbedded() });
    }

    parseForeach() {
      const t = this.next();
      this.expectOp('(');
      let varType = null, name = null, names = null;
      if (this.isId('var') && this.peek().t === 'op' && this.peek().v === '(') {
        this.p += 2; names = [];
        do { names.push(this.expectIdent().v); } while (this.acceptOp(','));
        this.expectOp(')');
        varType = { k: 'name', name: 'var', args: [] };
      } else {
        if (this.isId('var')) { const vt = this.next(); varType = { k: 'name', name: 'var', args: [], line: vt.line, col: vt.col }; }
        else varType = this.parseType();
        name = this.expectIdent().v;
      }
      if (!(this.isKw('in'))) throw this.errAfterPrev('CS1515', '"in" erwartet');
      this.p++;
      const expr = this.parseExpression();
      this.expectOp(')');
      return this.node('Foreach', t, { varType: varType, name: name, names: names, expr: expr, body: this.parseEmbedded() });
    }

    parseSwitch() {
      const t = this.next();
      this.expectOp('(');
      const expr = this.parseExpression();
      this.expectOp(')');
      this.expectOp('{');
      const sections = [];
      while (!this.isOp('}')) {
        if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
        const labels = [];
        for (;;) {
          if (this.isKw('case')) {
            const ct = this.next();
            const pat = this.parsePattern();
            let when = null;
            if (this.isId('when')) { this.p++; when = this.parseExpression(); }
            this.expectOp(':');
            labels.push({ pattern: pat, when: when, line: ct.line, col: ct.col });
          } else if (this.isKw('default')) {
            this.p++; this.expectOp(':');
            labels.push({ isDefault: true });
          } else break;
        }
        if (!labels.length) throw this.err('CS1003', 'Syntaxfehler, "case" erwartet');
        const stmts = [];
        while (!this.isKw('case') && !this.isKw('default') && !this.isOp('}')) {
          if (this.tok.t === 'eof') throw this.errAfterPrev('CS1513', '} erwartet');
          stmts.push(this.parseStatement());
        }
        sections.push({ labels: labels, stmts: stmts });
      }
      this.p++;
      return this.node('Switch', t, { expr: expr, sections: sections });
    }

    parseTry() {
      const t = this.next();
      const block = this.parseBlock();
      const catches = [];
      let fin = null;
      while (this.isKw('catch')) {
        const ct = this.next();
        let type = null, name = null, when = null;
        if (this.acceptOp('(')) {
          type = this.parseType();
          if (this.tok.t === 'id') name = this.next().v;
          this.expectOp(')');
        }
        if (this.isId('when')) { this.p++; this.expectOp('('); when = this.parseExpression(); this.expectOp(')'); }
        catches.push({ type: type, name: name, when: when, block: this.parseBlock(), line: ct.line, col: ct.col });
      }
      if (this.acceptKw('finally')) fin = this.parseBlock();
      if (!catches.length && !fin) throw this.err('CS1524', 'Nach dem try-Block wurde "catch" oder "finally" erwartet');
      return this.node('Try', t, { block: block, catches: catches, fin: fin });
    }

    /* ---------- Muster ---------- */
    parsePattern() {
      let left = this.parsePatternPrimary();
      for (;;) {
        if (this.isId('and')) { this.p++; left = { k: 'and', l: left, r: this.parsePatternPrimary() }; }
        else if (this.isId('or')) { this.p++; left = { k: 'or', l: left, r: this.parsePatternPrimary() }; }
        else break;
      }
      return left;
    }

    parsePatternPrimary() {
      const t = this.tok;
      if (this.isId('not')) { this.p++; return { k: 'not', p: this.parsePatternPrimary() }; }
      if (t.t === 'op' && (t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=')) {
        this.p++;
        return { k: 'rel', op: t.v, expr: this.parseBinary(8) };
      }
      if (t.t === 'op' && t.v === '(') {
        // (p1, p2) positional oder (pattern)
        this.p++;
        const items = [this.parsePattern()];
        while (this.acceptOp(',')) items.push(this.parsePattern());
        this.expectOp(')');
        if (items.length === 1) return items[0];
        return { k: 'pos', items: items };
      }
      if (t.t === 'op' && t.v === '{') return this.parsePropPattern(null);
      if (t.t === 'kw' && t.v === 'null') { this.p++; return { k: 'null' }; }
      if (t.t === 'id' && t.v === '_' ) { this.p++; return { k: 'discard' }; }
      if (t.t === 'id' && t.v === 'var' && (this.peek().t === 'id')) { this.p++; return { k: 'var', name: this.next().v }; }
      if (t.t === 'num' || t.t === 'str' || t.t === 'chr' || (t.t === 'kw' && (t.v === 'true' || t.v === 'false')) || (t.t === 'op' && t.v === '-')) {
        return { k: 'const', expr: this.parseBinary(8) };
      }
      // Typ-Muster oder Konstante (z. B. Enum-Wert)
      const save = this.p;
      const ty = this.tryParseType({ checkNullable: true });
      if (ty) {
        if (this.tok.t === 'id' && !(this.tok.v === 'and' || this.tok.v === 'or' || this.tok.v === 'when')) {
          return { k: 'type', type: ty, name: this.next().v };
        }
        if (this.isOp('{')) return this.parsePropPattern(ty);
        if (this.isOp('(') && ty.k === 'name') {
          this.p++;
          const items = [];
          if (!this.isOp(')')) { items.push(this.parsePattern()); while (this.acceptOp(',')) items.push(this.parsePattern()); }
          this.expectOp(')');
          let nm = null;
          if (this.tok.t === 'id' && !(this.tok.v === 'and' || this.tok.v === 'or' || this.tok.v === 'when')) nm = this.next().v;
          return { k: 'pos', type: ty, items: items, name: nm };
        }
        if (ty.k === 'name' && TYPE_KW.has(ty.name)) return { k: 'type', type: ty, name: null };
        if (ty.k === 'array' || ty.k === 'null') return { k: 'type', type: ty, name: null };
        // Bezeichner / Member -> Konstante oder Typ (zur Laufzeit entschieden)
        this.p = save;
        return { k: 'const', expr: this.parseBinary(8) };
      }
      this.p = save;
      return { k: 'const', expr: this.parseBinary(8) };
    }

    parsePropPattern(type) {
      this.expectOp('{');
      const props = [];
      while (!this.isOp('}')) {
        let name = this.expectIdent().v;
        while (this.isOp('.')) { this.p++; name += '.' + this.expectIdent().v; }
        this.expectOp(':');
        props.push({ name: name, pattern: this.parsePattern() });
        if (!this.acceptOp(',')) break;
      }
      this.expectOp('}');
      let nm = null;
      if (this.tok.t === 'id' && !(this.tok.v === 'and' || this.tok.v === 'or' || this.tok.v === 'when')) nm = this.next().v;
      return { k: 'prop', type: type, props: props, name: nm };
    }

    /* ---------- Ausdrücke ---------- */
    parseExpression() { return this.parseAssignment(); }

    parseAssignment() {
      const left = this.parseConditional();
      const t = this.tok;
      const co = this.combinedOp();
      if (co && ASSIGN_OPS.has(co.op)) {
        this.p += co.count;
        const right = this.parseAssignment();
        if (!(left.type === 'Ident' || left.type === 'Member' || left.type === 'Index' || left.type === 'Tuple' || left.type === 'DeclTuple')) {
          throw CS.csErr(this.file, left.line, left.col, 'CS0131', 'Die linke Seite einer Zuweisung muss eine Variable, Eigenschaft oder ein Indexer sein');
        }
        return this.node('Assign', t, { op: co.op, left: left, right: right, line: left.line, col: left.col });
      }
      return left;
    }

    parseConditional() {
      const cond = this.parseCoalesce();
      if (this.isOp('?')) {
        const t = this.next();
        const a = this.parseAssignment();
        if (!this.isOp(':')) throw this.errAfterPrev('CS1003', 'Syntaxfehler, ":" erwartet');
        this.p++;
        const b = this.parseAssignment();
        return this.node('Cond', t, { test: cond, a: a, b: b, line: cond.line, col: cond.col });
      }
      return cond;
    }

    parseCoalesce() {
      const left = this.parseBinary(1);
      if (this.isOp('??')) {
        const t = this.next();
        const right = this.parseCoalesce();
        return this.node('Binary', t, { op: '??', left: left, right: right, line: left.line, col: left.col });
      }
      return left;
    }

    parseBinary(minPrec) {
      let left = this.parseUnary();
      for (;;) {
        const t = this.tok;
        let op = null, cnt = 1;
        if (t.t === 'op') {
          const co = this.combinedOp();
          if (co.op === '>>=') break;
          if (BINPREC[co.op] !== undefined) { op = co.op; cnt = co.count; }
        } else if (t.t === 'kw' && (t.v === 'is' || t.v === 'as')) op = t.v;
        if (!op || BINPREC[op] < minPrec) break;
        const prec = BINPREC[op];
        this.p += cnt;
        if (op === 'is') {
          // Typtest oder Muster
          if (this.isId('not') || this.isOp('{') || this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=') || this.isKw('null') || this.tok.t === 'num' || this.tok.t === 'str' || this.tok.t === 'chr' || this.isKw('true') || this.isKw('false') || this.isOp('(')) {
            left = this.node('Is', t, { expr: left, pattern: this.parsePattern(), line: left.line, col: left.col });
          } else {
            const save = this.p;
            const ty = this.tryParseType({ checkNullable: true });
            if (ty && this.tok.t === 'id' && this.tok.v !== 'and' && this.tok.v !== 'or' && this.tok.v !== 'when') {
              left = this.node('Is', t, { expr: left, pattern: { k: 'type', type: ty, name: this.next().v }, line: left.line, col: left.col });
            } else if (ty) {
              this.p = save;
              left = this.node('Is', t, { expr: left, pattern: this.parsePattern(), line: left.line, col: left.col });
            } else {
              throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + this.tokText(this.tok) + '"');
            }
          }
          continue;
        }
        if (op === 'as') {
          const ty = this.parseType({ checkNullable: true });
          left = this.node('As', t, { expr: left, typeRef: ty, line: left.line, col: left.col });
          continue;
        }
        const right = this.parseBinary(prec + 1);
        left = this.node('Binary', t, { op: op, left: left, right: right, line: left.line, col: left.col, opLine: t.line, opCol: t.col });
      }
      return left;
    }

    parseUnary() {
      const t = this.tok;
      if (t.t === 'op') {
        switch (t.v) {
          case '+': case '-': case '!': case '~': {
            this.p++;
            const operand = this.parseUnary();
            if (t.v === '-' && operand.type === 'Lit' && (operand.kind === 'int' || operand.kind === 'long' || operand.kind === 'double' || operand.kind === 'float' || operand.kind === 'decimal') && !operand.negated) {
              return Object.assign({}, operand, { value: typeof operand.value === 'bigint' ? -operand.value : -operand.value, negated: true, line: t.line, col: t.col });
            }
            return this.node('Unary', t, { op: t.v, operand: operand });
          }
          case '++': case '--': {
            this.p++;
            const operand = this.parseUnary();
            return this.node('IncDec', t, { op: t.v, prefix: true, operand: operand });
          }
          case '^': {
            this.p++;
            return this.node('FromEnd', t, { expr: this.parseUnary() });
          }
          case '(': {
            const cast = this.tryParseCast();
            if (cast) return cast;
            break;
          }
        }
      }
      if (t.t === 'kw' && t.v === 'throw') {
        this.p++;
        return this.node('Throw', t, { expr: this.parseUnary() });
      }
      if (t.t === 'id' && t.v === 'await') throw this.err('CS8999', 'async/await wird in diesem Editor noch nicht unterstützt');
      return this.parsePostfix();
    }

    tryParseCast() {
      const save = this.p;
      const t = this.tok;
      this.p++; // (
      const ty = this.tryParseType({ checkNullable: true });
      if (ty && this.isOp(')')) {
        const n = this.peek();
        let isCast = false;
        const predefined = ty.k === 'name' && TYPE_KW.has(ty.name) && ty.args.length === 0 || ty.k === 'array' || ty.k === 'null';
        if (predefined) {
          // (int)-x ist ein Cast; (int) allein nicht
          isCast = !(n.t === 'op' && (n.v === ')' || n.v === ';' || n.v === ',' || n.v === '.' || n.v === ']' || n.v === '}' || n.v === ':' || n.v === '?' && false));
          if (n.t === 'op' && (n.v === '.' )) isCast = false;
        } else {
          isCast = n.t === 'id' || n.t === 'num' || n.t === 'str' || n.t === 'istr' || n.t === 'chr' ||
            (n.t === 'kw' && (n.v === 'this' || n.v === 'new' || n.v === 'true' || n.v === 'false' || n.v === 'null' || n.v === 'typeof' || n.v === 'default' || n.v === 'base' || TYPE_KW.has(n.v) || n.v === 'checked' || n.v === 'unchecked')) ||
            (n.t === 'op' && (n.v === '(' || n.v === '!' || n.v === '~'));
          // (a) (b) ist eher Aufruf eines Delegaten – hier als Cast behandeln nur wenn Typ nach Großbuchstaben aussieht
          if (isCast && n.t === 'op' && n.v === '(' && ty.k === 'name' && !/^[A-Z]/.test(ty.name)) isCast = false;
          if (isCast && n.t === 'id' && (n.v === 'is' || n.v === 'as')) isCast = false;
        }
        if (isCast) {
          this.p++; // )
          const operand = this.parseUnary();
          return this.node('Cast', t, { typeRef: ty, expr: operand });
        }
      }
      this.p = save;
      return null;
    }

    parsePostfix() {
      let e = this.parsePrimary();
      for (;;) {
        const t = this.tok;
        if (t.t !== 'op') {
          if (t.t === 'id' && t.v === 'switch' ) break;
          break;
        }
        if (t.v === '.' || t.v === '?.') {
          this.p++;
          const nullCond = t.v === '?.';
          if (this.tok.t !== 'id' && this.tok.t !== 'kw') throw this.errAfterPrev('CS1001', 'Bezeichner erwartet');
          const nm = this.next();
          let typeArgs = null;
          if (this.isOp('<')) {
            const save = this.p;
            try {
              typeArgs = this.parseTypeArgs();
              if (!this.isOp('(')) { this.p = save; typeArgs = null; }
            } catch (err) { if (err instanceof KON.LangError) { this.p = save; typeArgs = null; } else throw err; }
          }
          e = this.node('Member', nm, { obj: e, name: nm.v, nullCond: nullCond, typeArgs: typeArgs, line: e.line, col: e.col, nameLine: nm.line, nameCol: nm.col });
        } else if (t.v === '(') {
          this.p++;
          const args = this.parseArgs(')');
          this.expectOp(')');
          e = this.node('Call', t, { target: e, args: args, line: e.line, col: e.col });
        } else if (t.v === '[' || t.v === '?[') {
          this.p++;
          const nullCond = t.v === '?[';
          const args = [];
          do { args.push(this.parseIndexArg()); } while (this.acceptOp(','));
          if (!this.isOp(']')) throw this.errAfterPrev('CS1003', 'Syntaxfehler, "]" erwartet');
          this.p++;
          e = this.node('Index', t, { obj: e, args: args, nullCond: nullCond, line: e.line, col: e.col });
        } else if (t.v === '++' || t.v === '--') {
          this.p++;
          e = this.node('IncDec', t, { op: t.v, prefix: false, operand: e, line: e.line, col: e.col });
        } else if (t.v === '!') {
          // null-vergebender Operator  x!  (nicht !=)
          const n = this.peek();
          if (n.t === 'op' && (n.v === '=' || n.v === '==')) break;
          this.p++;
        } else break;
      }
      // switch-Ausdruck
      while (this.isKw('switch') && this.peek().t === 'op' && this.peek().v === '{') {
        const t = this.next();
        this.p++;
        const arms = [];
        while (!this.isOp('}')) {
          const pat = this.parsePattern();
          let when = null;
          if (this.isId('when')) { this.p++; when = this.parseExpression(); }
          this.expectOp('=>');
          const result = this.parseExpression();
          arms.push({ pattern: pat, when: when, result: result });
          if (!this.acceptOp(',')) break;
        }
        this.expectOp('}');
        e = this.node('SwitchExpr', t, { expr: e, arms: arms, line: e.line, col: e.col });
      }
      // with-Ausdruck
      if (this.isId('with') && this.peek().t === 'op' && this.peek().v === '{') {
        const t = this.next();
        const init = this.parseObjectInit();
        e = this.node('With', t, { expr: e, init: init });
      }
      return e;
    }

    parseIndexArg() {
      const t = this.tok;
      if (this.isOp('..')) {
        this.p++;
        let to = null;
        if (!this.isOp(']') && !this.isOp(',')) to = this.parseBinary(1);
        return this.node('Range', t, { from: null, to: to });
      }
      const e = this.parseExpression();
      if (this.isOp('..')) {
        this.p++;
        let to = null;
        if (!this.isOp(']') && !this.isOp(',')) to = this.parseBinary(1);
        return this.node('Range', t, { from: e, to: to });
      }
      return e;
    }

    parseArgs(close) {
      const args = [];
      while (!this.isOp(close)) {
        const a = { name: null, ref: null, expr: null };
        if (this.tok.t === 'id' && this.peek().t === 'op' && this.peek().v === ':' && !(this.peek(2).t === 'op' && this.peek(2).v === ':')) {
          a.name = this.next().v; this.p++;
        }
        if (this.isKw('ref') || this.isKw('out') || this.isKw('in')) {
          a.ref = this.next().v;
          if (a.ref === 'out') {
            // out var x / out int x / out _
            if (this.isId('var') && this.peek().t === 'id') {
              this.p++; const nm = this.next();
              a.expr = this.node('DeclOut', nm, { name: nm.v, declType: null });
              args.push(a);
              if (!this.acceptOp(',')) break;
              continue;
            }
            if (this.isDeclStart() ) {
              const ty = this.parseType(); const nm = this.expectIdent();
              a.expr = this.node('DeclOut', nm, { name: nm.v, declType: ty });
              args.push(a);
              if (!this.acceptOp(',')) break;
              continue;
            }
          }
        }
        a.expr = this.parseExpression();
        args.push(a);
        if (!this.acceptOp(',')) break;
        if (this.isOp(close)) throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + this.tokText(this.tok) + '"');
      }
      return args;
    }

    parseObjectInit() {
      // { A = 1, B = 2 }  oder { 1, 2 }  oder { {k, v}, ["a"] = 1 }
      const t = this.next(); // {
      const items = [];
      while (!this.isOp('}')) {
        if (this.tok.t === 'id' && this.peek().t === 'op' && this.peek().v === '=') {
          const nm = this.next().v; this.p++;
          items.push({ kind: 'member', name: nm, expr: this.parseInitializer() });
        } else if (this.isOp('[')) {
          this.p++;
          const idx = this.parseExpression();
          this.expectOp(']'); this.expectOp('=');
          items.push({ kind: 'index', index: idx, expr: this.parseInitializer() });
        } else if (this.isOp('{')) {
          this.p++;
          const parts = [];
          do { parts.push(this.parseExpression()); } while (this.acceptOp(','));
          this.expectOp('}');
          items.push({ kind: 'add', exprs: parts });
        } else {
          items.push({ kind: 'add', exprs: [this.parseInitializer()] });
        }
        if (!this.acceptOp(',')) break;
      }
      this.expectOp('}');
      return { items: items, line: t.line, col: t.col };
    }

    isLambdaAhead() {
      // (a, b) => ...   (int a, int b) => ...   () => ...
      if (!this.isOp('(')) return false;
      let d = 0, j = this.p;
      for (;;) {
        const t = this.toks[j];
        if (t.t === 'eof') return false;
        if (t.t === 'op') {
          if (t.v === '(') d++;
          else if (t.v === ')') { d--; if (d === 0) break; }
        }
        j++;
      }
      const n = this.toks[j + 1];
      return n.t === 'op' && n.v === '=>';
    }

    parseLambdaBody(params, t) {
      let body;
      if (this.isOp('{')) body = this.parseBlock();
      else body = this.parseAssignment();
      return this.node('Lambda', t, { params: params, body: body });
    }

    parsePrimary() {
      const t = this.tok;
      switch (t.t) {
        case 'num': this.p++; return this.node('Lit', t, { kind: t.kind, value: t.v, sc: t.sc });
        case 'str': this.p++; return this.node('Lit', t, { kind: 'string', value: t.v });
        case 'chr': this.p++; return this.node('Lit', t, { kind: 'char', value: t.v });
        case 'istr': {
          this.p++;
          const parts = t.v.map((p) => {
            if (typeof p === 'string') return p;
            const sub = new Parser(p.expr, this.file, { line: p.line, colOffset: -(p.col - 1) });
            let expr;
            try {
              expr = sub.parseExpression();
              if (sub.tok.t !== 'eof') throw sub.err('CS1073', 'Unerwartetes Token "' + sub.tokText(sub.tok) + '"');
            } catch (e) {
              if (e instanceof KON.LangError) { e.file = this.file; }
              throw e;
            }
            return { expr: expr, align: p.align, fmt: p.fmt };
          });
          return this.node('Interp', t, { parts: parts });
        }
        case 'id': {
          // Lambda: x => ...
          if (this.peek().t === 'op' && this.peek().v === '=>') {
            this.p += 2;
            return this.parseLambdaBody([{ name: t.v, type: null }], t);
          }
          this.p++;
          // generische Methode / Typ im Ausdruck: Foo<int>(...)  List<int>.Method
          if (this.isOp('<')) {
            const save = this.p;
            try {
              const args = this.parseTypeArgs();
              const n = this.tok;
              if (n.t === 'op' && (n.v === '(' || n.v === '.' || n.v === ')' || n.v === ']' || n.v === ';' || n.v === ',' || n.v === ':' || n.v === '}' ) ) {
                return this.node('Ident', t, { name: t.v, typeArgs: args });
              }
            } catch (e) { if (!(e instanceof KON.LangError)) throw e; }
            this.p = save;
          }
          if (this.isOp('::')) { this.p++; const nm = this.expectIdent(); return this.node('Ident', nm, { name: nm.v }); }
          return this.node('Ident', t, { name: t.v });
        }
        case 'kw': return this.parseKeywordPrimary(t);
        case 'op': {
          if (t.v === '(') {
            if (this.isLambdaAhead()) {
              this.p++;
              const params = [];
              while (!this.isOp(')')) {
                let ty = null;
                if (this.tok.t === 'id' && (this.peek().t === 'op' && (this.peek().v === ',' || this.peek().v === ')'))) {
                  params.push({ name: this.next().v, type: null });
                } else {
                  while (this.isKw('ref') || this.isKw('out') || this.isKw('in')) this.p++;
                  ty = this.parseType();
                  params.push({ name: this.expectIdent().v, type: ty });
                }
                if (!this.acceptOp(',')) break;
              }
              this.expectOp(')');
              this.expectOp('=>');
              return this.parseLambdaBody(params, t);
            }
            this.p++;
            // Tupel oder Klammerausdruck
            const elems = [];
            let named = false;
            do {
              let nm = null;
              if (this.tok.t === 'id' && this.peek().t === 'op' && this.peek().v === ':') { nm = this.next().v; this.p++; named = true; }
              elems.push({ name: nm, expr: this.parseExpression() });
            } while (this.acceptOp(','));
            if (!this.isOp(')')) {
              if (this.tok.t === 'eof' || this.isOp(';')) throw this.errAfterPrev('CS1026', ') erwartet');
              throw this.errAfterPrev('CS1026', ') erwartet');
            }
            this.p++;
            if (elems.length === 1 && !named) { const inner = elems[0].expr; return Object.assign({}, inner, { paren: true }); }
            return this.node('Tuple', t, { elems: elems });
          }
          if (t.v === '{') throw this.err('CS1525', 'Ungültiger Ausdrucksterm "{"');
          if (t.v === '..') {
            this.p++;
            let to = null;
            if (!this.isOp(']')) to = this.parseBinary(1);
            return this.node('Range', t, { from: null, to: to });
          }
          throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + t.v + '"');
        }
        case 'eof': throw this.errAfterPrev('CS1733', 'Ausdruck erwartet');
      }
      throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + this.tokText(t) + '"');
    }

    parseKeywordPrimary(t) {
      switch (t.v) {
        case 'true': this.p++; return this.node('Lit', t, { kind: 'bool', value: true });
        case 'false': this.p++; return this.node('Lit', t, { kind: 'bool', value: false });
        case 'null': this.p++; return this.node('Lit', t, { kind: 'null', value: null });
        case 'this': this.p++; return this.node('This', t);
        case 'base': this.p++; return this.node('Base', t);
        case 'typeof': {
          this.p++; this.expectOp('(');
          const ty = this.parseType(); this.expectOp(')');
          return this.node('TypeOf', t, { typeRef: ty });
        }
        case 'sizeof': throw this.err('CS8999', 'sizeof wird nicht unterstützt');
        case 'default': {
          this.p++;
          if (this.acceptOp('(')) { const ty = this.parseType(); this.expectOp(')'); return this.node('Default', t, { typeRef: ty }); }
          return this.node('Default', t, { typeRef: null });
        }
        case 'checked': case 'unchecked': {
          this.p++; this.expectOp('(');
          const e = this.parseExpression(); this.expectOp(')');
          return e;
        }
        case 'delegate': {
          this.p++;
          let params = [];
          if (this.acceptOp('(')) { params = this.parseParams().map((p) => ({ name: p.name, type: p.type })); this.expectOp(')'); }
          const body = this.parseBlock();
          return this.node('Lambda', t, { params: params, body: body });
        }
        case 'new': return this.parseNew();
        case 'int': case 'string': case 'bool': case 'double': case 'char': case 'decimal': case 'long': case 'short': case 'byte':
        case 'float': case 'object': case 'uint': case 'ulong': case 'ushort': case 'sbyte': {
          // int.Parse(...), string.Join(...)
          this.p++;
          return this.node('Ident', t, { name: t.v, isTypeKw: true });
        }
        case 'ref': case 'out': case 'in': throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + t.v + '"');
        case 'switch': throw this.err('CS1525', 'Ungültiger Ausdrucksterm "switch"');
      }
      throw this.err('CS1525', 'Ungültiger Ausdrucksterm "' + t.v + '"');
    }

    parseNew() {
      const t = this.next(); // new
      // new[] {..}
      if (this.isOp('[')) {
        this.p++; this.expectOp(']');
        const init = this.parseArrayInit();
        return this.node('NewArray', t, { elemType: null, dims: null, rank: 1, init: init });
      }
      // new { A = 1 }  anonym
      if (this.isOp('{')) {
        const init = this.parseObjectInit();
        return this.node('NewAnon', t, { init: init });
      }
      // new(args) – zielgetypt
      if (this.isOp('(')) {
        this.p++;
        const args = this.parseArgs(')');
        this.expectOp(')');
        let init = null;
        if (this.isOp('{')) init = this.parseObjectInit();
        return this.node('New', t, { typeRef: null, args: args, init: init });
      }
      const ty = this.parseTypeNoArray();
      if (this.isOp('[')) {
        // Array-Erzeugung
        this.p++;
        const dims = [];
        let rank = 1;
        if (this.isOp(']') || this.isOp(',')) {
          while (this.acceptOp(',')) rank++;
          this.expectOp(']');
          // weitere [] für Jagged
          let elem = ty;
          let r = rank;
          while (this.isOp('[') && this.peek().t === 'op' && (this.peek().v === ']' || this.peek().v === ',')) {
            this.p++; let rr = 1; while (this.acceptOp(',')) rr++; this.expectOp(']');
            elem = { k: 'array', elem: elem, rank: r }; r = rr;
          }
          const init = this.isOp('{') ? this.parseArrayInit() : null;
          return this.node('NewArray', t, { elemType: elem, dims: null, rank: r, init: init });
        }
        do { dims.push(this.parseExpression()); } while (this.acceptOp(','));
        this.expectOp(']');
        let elem = ty;
        // jagged: new int[3][]
        let rank2 = dims.length;
        const extra = [];
        while (this.isOp('[') && this.peek().t === 'op' && (this.peek().v === ']' || this.peek().v === ',')) {
          this.p++; let rr = 1; while (this.acceptOp(',')) rr++; this.expectOp(']');
          extra.push(rr);
        }
        let elemType = elem;
        for (let i = extra.length - 1; i >= 0; i--) elemType = { k: 'array', elem: elemType, rank: extra[i] };
        const init = this.isOp('{') ? this.parseArrayInit() : null;
        return this.node('NewArray', t, { elemType: elemType, dims: dims, rank: rank2, init: init });
      }
      let args = [];
      let hadParens = false;
      if (this.isOp('(')) {
        this.p++; hadParens = true;
        args = this.parseArgs(')');
        this.expectOp(')');
      }
      let init = null;
      if (this.isOp('{')) init = this.parseObjectInit();
      if (!hadParens && !init) throw this.errAfterPrev('CS1526', 'Nach "new" muss ein Typ mit ( oder [ folgen');
      return this.node('New', t, { typeRef: ty, args: args, init: init });
    }

    parseTypeNoArray() {
      // Typ ohne Array-Klammern (für new T[...])
      const start = this.tok;
      if (start.t === 'kw' && TYPE_KW.has(start.v)) { this.p++; return { k: 'name', name: start.v, args: [], line: start.line, col: start.col }; }
      if (start.t === 'id') {
        let name = this.next().v, args = [];
        if (this.isOp('<')) args = this.parseTypeArgs();
        while (this.isOp('.') && this.peek().t === 'id') { this.p++; name = this.next().v; args = []; if (this.isOp('<')) args = this.parseTypeArgs(); }
        let t = { k: 'name', name: name, args: args, line: start.line, col: start.col };
        if (this.isOp('?') && this.peek().t === 'op' && this.peek().v === '[') { this.p++; t = { k: 'null', inner: t }; }
        return t;
      }
      if (start.t === 'op' && start.v === '(') return this.parseType();
      throw this.errAfterPrev('CS1031', 'Typ erwartet');
    }
  }

  CS.Parser = Parser;
  CS.TYPE_KW = TYPE_KW;
  CS.parse = function (src, file) {
    return new Parser(src, file).parseUnit();
  };
})(typeof window !== 'undefined' ? window : globalThis);
