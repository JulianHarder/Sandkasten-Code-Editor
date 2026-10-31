/* C#-Lexer */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  const CS = KON.cs = KON.cs || {};

  function csErr(file, line, col, code, msg) {
    return new KON.LangError({ phase: 'compile', lang: 'csharp', file: file, line: line, col: col, code: code, name: code, message: msg });
  }
  CS.csErr = csErr;

  const KEYWORDS = new Set(('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum ' +
    'event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator ' +
    'out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try ' +
    'typeof uint ulong unchecked unsafe ushort using virtual void volatile while').split(' '));
  CS.KEYWORDS = KEYWORDS;

  const OPS3 = ['<<=', '??=', '...'];
  const OPS2 = ['=>', '??', '?.', '?[', '::', '++', '--', '<<', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', '..'];
  const OPS1 = '+-*/%&|^~!<>=?:;,.(){}[]@#';

  const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"' };

  function lex(src, file, opts) {
    opts = opts || {};
    src = src.replace(/\r\n?/g, '\n');
    const toks = [];
    let i = 0, line = opts.line || 1, lineStart = -(opts.colOffset || 0);
    const n = src.length;

    function col(at) { return at - lineStart + 1; }
    function push(t, v, startI, startLine, startCol, extra) {
      const tok = { t: t, v: v, line: startLine, col: startCol, eline: line, ecol: col(i) };
      if (extra) Object.assign(tok, extra);
      toks.push(tok);
      return tok;
    }

    function readEscape(raw, startLine, startCol) {
      // an Position i steht der Backslash
      const c = src[i + 1];
      if (c === 'u') {
        const h = src.substr(i + 2, 4);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) throw csErr(file, line, col(i), 'CS1009', 'Nicht erkannte Escapesequenz');
        i += 6; return String.fromCharCode(parseInt(h, 16));
      }
      if (c === 'U') {
        const h = src.substr(i + 2, 8);
        if (!/^[0-9a-fA-F]{8}$/.test(h)) throw csErr(file, line, col(i), 'CS1009', 'Nicht erkannte Escapesequenz');
        i += 10; return String.fromCodePoint(parseInt(h, 16));
      }
      if (c === 'x') {
        const m = /^[0-9a-fA-F]{1,4}/.exec(src.substr(i + 2, 4));
        if (!m) throw csErr(file, line, col(i), 'CS1009', 'Nicht erkannte Escapesequenz');
        i += 2 + m[0].length; return String.fromCharCode(parseInt(m[0], 16));
      }
      if (c in SIMPLE_ESC) { i += 2; return SIMPLE_ESC[c]; }
      throw csErr(file, line, col(i), 'CS1009', 'Nicht erkannte Escapesequenz');
    }

    /* Teile eines interpolierten Strings lesen. verbatim: @-Stil. */
    function readInterpolated(verbatim, startI, startLine, startCol, dollars) {
      // i steht nach dem öffnenden "
      const parts = [];
      let cur = '';
      for (;;) {
        if (i >= n) throw csErr(file, startLine, startCol, 'CS1039', 'Nicht abgeschlossene Zeichenfolgenkonstante');
        const c = src[i];
        if (c === '"') {
          if (verbatim && src[i + 1] === '"') { cur += '"'; i += 2; continue; }
          i++; break;
        }
        if (c === '\n') {
          if (!verbatim) throw csErr(file, startLine, startCol, 'CS1010', 'Zeilenumbruch in Konstante');
          cur += '\n'; i++; line++; lineStart = i; continue;
        }
        if (c === '\\' && !verbatim) { cur += readEscape(false); continue; }
        if (c === '{') {
          if (src[i + 1] === '{') { cur += '{'; i += 2; continue; }
          if (cur) { parts.push(cur); cur = ''; }
          // Ausdruck lesen
          let j = i + 1, depth = 0, q = null, exprEnd = -1, fmtStart = -1, alignStart = -1, end = -1;
          const exprLine = line, exprCol = col(j);
          const lineAtStart = line, lsAtStart = lineStart;
          while (j < n) {
            const ch = src[j];
            if (q) {
              if (ch === '\\' && q !== '@') { j += 2; continue; }
              if (ch === q) q = null;
              j++; continue;
            }
            if (ch === '"') { q = '"'; j++; continue; }
            if (ch === "'") { q = "'"; j++; continue; }
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']') depth--;
            else if (ch === '}') {
              if (depth === 0) { end = j; break; }
              depth--;
            } else if (depth === 0 && ch === ':' && fmtStart < 0 && src[j + 1] !== ':' && src[j - 1] !== ':') {
              if (exprEnd < 0) exprEnd = j;
              fmtStart = j + 1;
              let k = fmtStart;
              while (k < n && src[k] !== '}') k++;
              end = k;
              break;
            } else if (depth === 0 && ch === ',' && alignStart < 0 && fmtStart < 0) {
              exprEnd = j; alignStart = j + 1;
            } else if (ch === '\n') { line++; lineStart = j + 1; }
            j++;
          }
          if (end < 0) throw csErr(file, startLine, startCol, 'CS1039', 'Nicht abgeschlossene Zeichenfolgenkonstante');
          if (exprEnd < 0) exprEnd = end;
          const exprSrc = src.slice(i + 1, exprEnd);
          let align = null, fmt = null;
          if (alignStart >= 0) align = src.slice(alignStart, fmtStart >= 0 ? fmtStart - 1 : end).trim();
          if (fmtStart >= 0) fmt = src.slice(fmtStart, end);
          void lineAtStart; void lsAtStart;
          parts.push({ expr: exprSrc, align: align, fmt: fmt, line: exprLine, col: exprCol });
          i = end + 1;
          continue;
        }
        if (c === '}') {
          if (src[i + 1] === '}') { cur += '}'; i += 2; continue; }
          throw csErr(file, line, col(i), 'CS8086', 'Ein einzelnes "}" ist in einem interpolierten String nicht zulässig');
        }
        cur += c; i++;
      }
      if (cur || !parts.length) parts.push(cur);
      return parts;
    }

    while (i < n) {
      const c = src[i];
      if (c === '\n') { i++; line++; lineStart = i; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿' || c === ' ') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const sl = line, sc = col(i);
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; lineStart = i + 1; } i++; }
        if (i >= n) throw csErr(file, sl, sc, 'CS1035', 'Am Ende der Datei wurde ein Kommentar ohne Abschluss gefunden');
        i += 2; continue;
      }
      if (c === '#' && /^[ \t]*$/.test(src.slice(lineStart, i))) { while (i < n && src[i] !== '\n') i++; continue; }

      const sl = line, sc = col(i), si = i;

      // Zahlen
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let m;
        let kind, val;
        const rest = src.slice(i, i + 80);
        if ((m = /^0[xX][0-9a-fA-F_]+/.exec(rest))) {
          i += m[0].length;
          val = BigInt(m[0].replace(/_/g, ''));
          kind = 'int';
        } else if ((m = /^0[bB][01_]+/.exec(rest))) {
          i += m[0].length;
          val = BigInt(m[0].replace(/_/g, ''));
          kind = 'int';
        } else {
          m = /^(?:[0-9][0-9_]*)?(?:\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
          let txt = m[0];
          // "1." gefolgt von Methodenaufruf (1.ToString()) -> nur die Ganzzahl nehmen; "1.5" ist ok
          i += txt.length;
          const clean = txt.replace(/_/g, '');
          const isFloat = /[.eE]/.test(clean);
          val = isFloat ? parseFloat(clean) : BigInt(clean);
          kind = isFloat ? 'double' : 'int';
        }
        // Suffixe
        const sfx = /^(?:[uU][lL]|[lL][uU]|[uUlLfFdDmM])(?![A-Za-z0-9_])/.exec(src.slice(i, i + 3));
        if (sfx) {
          const s = sfx[0].toLowerCase();
          i += sfx[0].length;
          if (s === 'f') { kind = 'float'; val = Number(val); }
          else if (s === 'd') { kind = 'double'; val = Number(val); }
          else if (s === 'm') { kind = 'decimal'; val = Number(val); }
          else if (s === 'l') kind = 'long';
          else if (s === 'u') kind = 'uint';
          else kind = 'ulong';
        } else if (kind === 'int') {
          if (val > 2147483647n) kind = val <= 4294967295n ? 'uint' : (val <= 9223372036854775807n ? 'long' : 'ulong');
        }
        if (i < n && /[A-Za-z_]/.test(src[i])) throw csErr(file, line, col(i), 'CS1002', '; erwartet');
        const scale = kind === 'decimal' ? ((/\.(\d+)/.exec(src.slice(si, i)) || [])[1] || '').length : 0;
        push('num', kind === 'int' ? Number(val) : (kind === 'long' || kind === 'ulong' || kind === 'uint') ? (kind === 'uint' ? Number(val) : val) : val, si, sl, sc, { kind: kind, sc: scale });
        continue;
      }

      // Bezeichner (auch @verbatim)
      if (/[A-Za-z_À-￿]/.test(c) || (c === '@' && /[A-Za-z_]/.test(src[i + 1] || ''))) {
        let verbatimId = false;
        if (c === '@') { i++; verbatimId = true; }
        let j = i;
        while (j < n && /[A-Za-z0-9_À-￿]/.test(src[j])) j++;
        const word = src.slice(i, j);
        i = j;
        push(verbatimId ? 'id' : (KEYWORDS.has(word) ? 'kw' : 'id'), word, si, sl, sc);
        continue;
      }

      // Strings
      if (c === '"' || ((c === '$' || c === '@') && (src[i + 1] === '"' || (src[i + 1] === '$' || src[i + 1] === '@') && src[i + 2] === '"'))) {
        let interp = false, verbatim = false;
        while (src[i] === '$' || src[i] === '@') { if (src[i] === '$') interp = true; else verbatim = true; i++; }
        // Raw-String """..."""
        if (src.substr(i, 3) === '"""') {
          let q = 3; while (src[i + q] === '"') q++;
          const delim = '"'.repeat(q);
          const endIdx = src.indexOf(delim, i + q);
          if (endIdx < 0) throw csErr(file, sl, sc, 'CS1039', 'Nicht abgeschlossene Zeichenfolgenkonstante');
          let body = src.slice(i + q, endIdx);
          for (const ch of body) if (ch === '\n') { line++; }
          i = endIdx + q; lineStart = src.lastIndexOf('\n', i - 1) + 1;
          // Einrückung der schließenden Zeile entfernen
          const lines = body.split('\n');
          if (lines.length > 1) {
            const lastLine = lines[lines.length - 1];
            const indent = /^[ \t]*$/.test(lastLine) ? lastLine : '';
            lines.shift(); lines.pop();
            body = lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart())).join('\n');
          }
          push('str', body, si, sl, sc);
          continue;
        }
        i++; // "
        if (interp) {
          const parts = readInterpolated(verbatim, si, sl, sc);
          push('istr', parts, si, sl, sc, { verbatim: verbatim });
          continue;
        }
        let val = '';
        for (;;) {
          if (i >= n) throw csErr(file, sl, sc, 'CS1039', 'Nicht abgeschlossene Zeichenfolgenkonstante');
          const ch = src[i];
          if (ch === '"') {
            if (verbatim && src[i + 1] === '"') { val += '"'; i += 2; continue; }
            i++; break;
          }
          if (ch === '\n') {
            if (!verbatim) throw csErr(file, sl, sc, 'CS1010', 'Zeilenumbruch in Konstante');
            val += '\n'; i++; line++; lineStart = i; continue;
          }
          if (ch === '\\' && !verbatim) { val += readEscape(false); continue; }
          val += ch; i++;
        }
        push('str', val, si, sl, sc);
        continue;
      }

      // Zeichen
      if (c === "'") {
        i++;
        let v;
        if (src[i] === '\\') v = readEscape(false);
        else if (src[i] === "'" || src[i] === '\n' || i >= n) throw csErr(file, sl, sc, 'CS1011', 'Leere Zeichenliteral');
        else { v = src[i]; i++; }
        if (src[i] !== "'") throw csErr(file, sl, sc, 'CS1012', 'Zu viele Zeichen im Zeichenliteral');
        i++;
        push('chr', v, si, sl, sc);
        continue;
      }

      // Operatoren
      const three = src.substr(i, 3), two = src.substr(i, 2);
      if (OPS3.indexOf(three) >= 0) { i += 3; push('op', three, si, sl, sc); continue; }
      if (OPS2.indexOf(two) >= 0) {
        // ">>" nicht als einen Token behandeln: bei Generics (List<List<int>>) wird es vom Parser gesplittet
        i += 2; push('op', two, si, sl, sc); continue;
      }
      if (OPS1.indexOf(c) >= 0) { i++; push('op', c, si, sl, sc); continue; }
      throw csErr(file, sl, sc, 'CS1056', 'Unerwartetes Zeichen "' + c + '"');
    }
    toks.push({ t: 'eof', v: null, line: line, col: col(i), eline: line, ecol: col(i) });
    return toks;
  }
  CS.lex = lex;
})(typeof window !== 'undefined' ? window : globalThis);
