/* Python-Lexer: zerlegt Quelltext in Tokens (mit INDENT/DEDENT/NEWLINE). */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const PY = KON.py = KON.py || {};

  function synErr(file, line, col, msg, name) {
    return new KON.LangError({
      phase: 'compile', lang: 'python', file: file, line: line, col: col,
      name: name || 'SyntaxError', code: name || 'SyntaxError', message: msg
    });
  }
  PY.synErr = synErr;

  const OPS3 = ['**=', '//=', '>>=', '<<=', '...'];
  const OPS2 = ['->', ':=', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=', '**', '//', '<<', '>>'];
  const OPS1 = '+-*/%@&|^~<>()[]{},:.;=';

  const ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"' };

  /* Escape-Sequenzen eines (nicht rohen) Strings auflösen */
  function decodeEscapes(s, file, line, col) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== '\\') { out += c; continue; }
      const n = s[i + 1];
      if (n === undefined) { out += '\\'; break; }
      if (n === '\n') { i++; continue; }
      if (n === 'x') {
        const h = s.substr(i + 2, 2);
        if (!/^[0-9a-fA-F]{2}$/.test(h)) throw synErr(file, line, col, "(unicode error) 'unicodeescape' codec can't decode bytes: truncated \\xXX escape");
        out += String.fromCharCode(parseInt(h, 16)); i += 3; continue;
      }
      if (n === 'u') {
        const h = s.substr(i + 2, 4);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) throw synErr(file, line, col, "(unicode error) 'unicodeescape' codec can't decode bytes: truncated \\uXXXX escape");
        out += String.fromCharCode(parseInt(h, 16)); i += 5; continue;
      }
      if (n === 'U') {
        const h = s.substr(i + 2, 8);
        if (!/^[0-9a-fA-F]{8}$/.test(h)) throw synErr(file, line, col, "(unicode error) 'unicodeescape' codec can't decode bytes: truncated \\UXXXXXXXX escape");
        out += String.fromCodePoint(parseInt(h, 16)); i += 9; continue;
      }
      if (n in ESC) { out += ESC[n]; i++; continue; }
      out += '\\' + n; i++;
    }
    return out;
  }
  PY.decodeEscapes = decodeEscapes;

  function isIdStart(c) { return /[A-Za-z_À-￿]/.test(c); }
  function isIdChar(c) { return /[A-Za-z0-9_À-￿]/.test(c); }

  /* lex(src, file, opts) -> Token[]; opts.line = Startzeile (für f-String-Ausdrücke), opts.noIndent = true */
  function lex(src, file, opts) {
    opts = opts || {};
    const toks = [];
    src = src.replace(/\r\n?/g, '\n');
    let i = 0, line = opts.line || 1, lineStart = 0 - (opts.colOffset || 0);
    const n = src.length;
    const indents = [0];
    let depth = 0;
    let atLineStart = !opts.noIndent;
    const brackets = [];

    function push(t, v, startI, extra) {
      const tok = { t: t, v: v, line: line, col: startI - lineStart + 1 };
      if (extra) Object.assign(tok, extra);
      toks.push(tok);
      return tok;
    }

    while (i < n) {
      if (toks.length) {
        const lt = toks[toks.length - 1];
        if (lt.ecol === undefined && lt.t !== 'NEWLINE' && lt.t !== 'INDENT' && lt.t !== 'DEDENT') { lt.ecol = i - lineStart + 1; lt.eline = line; }
      }
      if (atLineStart && depth === 0) {
        // Einrückung messen
        let col = 0, j = i;
        while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\f')) {
          col = src[j] === '\t' ? (Math.floor(col / 8) + 1) * 8 : (src[j] === '\f' ? 0 : col + 1);
          j++;
        }
        if (j >= n) { i = j; break; }
        if (src[j] === '\n') { i = j + 1; line++; lineStart = i; continue; }
        if (src[j] === '#') {
          while (j < n && src[j] !== '\n') j++;
          i = j;
          continue;
        }
        if (src[j] === '\\' && src[j + 1] === '\n') { i = j + 2; line++; lineStart = i; continue; }
        i = j;
        atLineStart = false;
        const top = indents[indents.length - 1];
        if (col > top) {
          indents.push(col);
          push('INDENT', col, i);
        } else if (col < top) {
          while (indents[indents.length - 1] > col) {
            indents.pop();
            push('DEDENT', col, i);
          }
          if (indents[indents.length - 1] !== col) {
            throw synErr(file, line, i - lineStart + 1, 'unindent does not match any outer indentation level', 'IndentationError');
          }
        }
      }
      const c = src[i];
      if (c === '\n') {
        if (depth === 0) {
          if (toks.length && toks[toks.length - 1].t !== 'NEWLINE') push('NEWLINE', '\n', i);
          atLineStart = !opts.noIndent;
        }
        i++; line++; lineStart = i;
        continue;
      }
      if (c === ' ' || c === '\t' || c === '\f') { i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '\\') {
        if (src[i + 1] === '\n') { i += 2; line++; lineStart = i; continue; }
        throw synErr(file, line, i - lineStart + 1, 'unexpected character after line continuation character');
      }

      // Zahlen
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const start = i;
        let m;
        const rest = src.slice(i, i + 80);
        if ((m = /^0[xX][0-9a-fA-F_]+/.exec(rest))) {
          i += m[0].length; push('NUM', BigInt(m[0].replace(/_/g, '')), start);
        } else if ((m = /^0[oO][0-7_]+/.exec(rest))) {
          i += m[0].length; push('NUM', BigInt(m[0].replace(/_/g, '')), start);
        } else if ((m = /^0[bB][01_]+/.exec(rest))) {
          i += m[0].length; push('NUM', BigInt(m[0].replace(/_/g, '')), start);
        } else {
          m = /^(?:[0-9][0-9_]*)?(?:\.[0-9][0-9_]*|\.(?![A-Za-z_]))?(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
          let txt = m[0];
          if (!txt) txt = c;
          i += txt.length;
          if (src[i] === 'j' || src[i] === 'J') throw synErr(file, line, start - lineStart + 1, 'komplexe Zahlen werden noch nicht unterstützt');
          const clean = txt.replace(/_/g, '');
          if (/[.eE]/.test(clean)) push('NUM', parseFloat(clean), start);
          else {
            if (clean.length > 1 && clean[0] === '0' && /[1-9]/.test(clean)) throw synErr(file, line, start - lineStart + 1, 'leading zeros in decimal integer literals are not permitted; use an 0o prefix for octal integers');
            push('NUM', BigInt(clean), start);
          }
        }
        if (i < n && isIdStart(src[i])) throw synErr(file, line, i - lineStart + 1, 'invalid decimal literal');
        continue;
      }

      // Namen und String-Präfixe
      if (isIdStart(c)) {
        const start = i;
        let j = i;
        while (j < n && isIdChar(src[j])) j++;
        const word = src.slice(i, j);
        if (/^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/.test(word) && (src[j] === '"' || src[j] === "'")) {
          // String mit Präfix
          i = j;
          readString(word.toLowerCase(), start);
          continue;
        }
        i = j;
        push('NAME', word, start);
        continue;
      }

      if (c === '"' || c === "'") { readString('', i); continue; }

      // Operatoren
      const three = src.substr(i, 3), two = src.substr(i, 2);
      if (OPS3.indexOf(three) >= 0) { push('OP', three, i); i += 3; continue; }
      if (OPS2.indexOf(two) >= 0) { push('OP', two, i); i += 2; continue; }
      if (OPS1.indexOf(c) >= 0) {
        if (c === '(' || c === '[' || c === '{') { depth++; brackets.push({ c: c, line: line, col: i - lineStart + 1 }); }
        else if (c === ')' || c === ']' || c === '}') {
          if (!brackets.length) throw synErr(file, line, i - lineStart + 1, "unmatched '" + c + "'");
          const o = brackets.pop();
          const want = o.c === '(' ? ')' : o.c === '[' ? ']' : '}';
          if (c !== want) throw synErr(file, line, i - lineStart + 1, "closing parenthesis '" + c + "' does not match opening parenthesis '" + o.c + "'" + (o.line !== line ? ' on line ' + o.line : ''));
          depth--;
        }
        push('OP', c, i); i++;
        continue;
      }
      if (c === '$' || c === '?' || c === '!' || c === '`') throw synErr(file, line, i - lineStart + 1, 'invalid syntax');
      throw synErr(file, line, i - lineStart + 1, "invalid character '" + c + "' (U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')');
    }

    if (brackets.length) {
      const o = brackets[brackets.length - 1];
      throw synErr(file, o.line, o.col, "'" + o.c + "' was never closed");
    }
    if (toks.length && toks[toks.length - 1].t !== 'NEWLINE') push('NEWLINE', '\n', i);
    while (indents.length > 1) { indents.pop(); push('DEDENT', 0, i); }
    push('EOF', null, i);
    return toks;

    function readString(prefix, startI) {
      const q = src[i];
      const triple = src[i + 1] === q && src[i + 2] === q;
      const startLine = line, startCol = startI - lineStart + 1;
      i += triple ? 3 : 1;
      const bodyStart = i;
      const raw = prefix.indexOf('r') >= 0;
      let closed = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') {
          if (src[i + 1] === '\n') { line++; lineStart = i + 2; }
          i += 2; continue;
        }
        if (ch === '\n') {
          if (!triple) break;
          line++; lineStart = i + 1; i++; continue;
        }
        if (ch === q && (!triple || (src[i + 1] === q && src[i + 2] === q))) { closed = true; break; }
        i++;
      }
      if (!closed) {
        throw synErr(file, startLine, startCol, triple ? 'unterminated triple-quoted string literal (detected at line ' + line + ')' : 'unterminated string literal (detected at line ' + startLine + ')');
      }
      const body = src.slice(bodyStart, i);
      i += triple ? 3 : 1;
      const endLine = line;
      const savedLine = line;
      const tok = { line: startLine, col: startCol, endLine: endLine };
      if (prefix.indexOf('b') >= 0) throw synErr(file, startLine, startCol, 'bytes-Literale werden noch nicht unterstützt');
      if (prefix.indexOf('f') >= 0) {
        tok.t = 'FSTR'; tok.v = body; tok.raw = raw; tok.bodyLine = startLine;
        tok.bodyCol = startCol + prefix.length + (triple ? 3 : 1);
      } else {
        tok.t = 'STR';
        tok.v = raw ? body : decodeEscapes(body, file, startLine, startCol);
      }
      void savedLine;
      toks.push(tok);
    }
  }

  PY.lex = lex;
})(typeof window !== 'undefined' ? window : globalThis);
