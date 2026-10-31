/* Syntax-Highlighting: eigener Tokenizer für C# und Python, liefert HTML. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const set = (s) => new Set(s.split(' '));
  const CS_KW = set('abstract as base break case catch checked class const continue default delegate do else enum event explicit extern false finally fixed for foreach goto if implicit in interface internal is lock namespace new null operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw true try typeof unchecked unsafe using virtual void volatile while var record get set init value when where and or not async await yield partial required with global');
  const CS_TYPES = set('int long short byte sbyte uint ulong ushort double float decimal bool char string object dynamic nint nuint List Dictionary HashSet Queue Stack StringBuilder Random DateTime TimeSpan Console Math Convert Environment Array Enum Exception ArgumentException InvalidOperationException NullReferenceException FormatException DivideByZeroException IndexOutOfRangeException KeyNotFoundException NotImplementedException OverflowException InvalidCastException ArgumentNullException ArgumentOutOfRangeException IEnumerable IList ICollection IDictionary IComparable IDisposable Func Action Predicate Comparison Tuple KeyValuePair Stopwatch Thread Guid Nullable Enumerable String Char Boolean Int32 Int64 Double Decimal Object SortedDictionary SortedSet LinkedList IEquatable Convert Task');
  const PY_KW = set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case');
  const PY_TYPES = set('int float str bool list dict set tuple frozenset range object type bytes complex Exception BaseException ValueError TypeError KeyError IndexError NameError ZeroDivisionError AttributeError RuntimeError StopIteration OSError ImportError ArithmeticError LookupError AssertionError NotImplementedError RecursionError OverflowError EOFError');
  const PY_BUILTIN_FN = set('print input len range enumerate zip map filter sorted reversed sum min max abs round pow divmod isinstance issubclass type chr ord any all repr format bin hex oct id hash hasattr getattr setattr delattr callable iter next vars dir open exit quit super property staticmethod classmethod');

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function span(cls, s) { return '<span class="' + cls + '">' + esc(s) + '</span>'; }

  const isIdStart = (c) => /[A-Za-z_À-￿]/.test(c);
  const isIdChar = (c) => /[A-Za-z0-9_À-￿]/.test(c);

  /* Zeichenkette mit {Ausdruck}-Teilen (f-String / $-String) zerlegen */
  function interpolated(s) {
    let out = '', lit = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') { lit += '{{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}') { lit += '}}'; i += 2; continue; }
      if (c === '{') {
        let d = 1, j = i + 1;
        while (j < s.length && d > 0) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; }
        if (lit) { out += span('tk-st', lit); lit = ''; }
        out += span('tk-in', s.slice(i, j));
        i = j; continue;
      }
      lit += c; i++;
    }
    if (lit) out += span('tk-st', lit);
    return out;
  }

  /* Namen der im Text deklarierten Klassen sammeln */
  function declaredTypes(text, lang) {
    const set2 = new Set();
    const re = lang === 'python' ? /\bclass\s+([A-Za-z_]\w*)/g : /\b(?:class|struct|interface|enum|record|delegate\s+\w+)\s+([A-Za-z_]\w*)/g;
    let m;
    while ((m = re.exec(text))) set2.add(m[1]);
    return set2;
  }

  function highlightCSharp(text, userTypes) {
    const out = [];
    const n = text.length;
    let i = 0, prevWord = '', prevSig = '';
    const push = (html) => out.push(html);
    while (i < n) {
      const c = text[i];
      if (c === '\n' || c === ' ' || c === '\t') {
        let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
        push(text.slice(i, j)); i = j; continue;
      }
      if (c === '/' && text[i + 1] === '/') { let j = text.indexOf('\n', i); if (j < 0) j = n; push(span('tk-co', text.slice(i, j))); i = j; continue; }
      if (c === '/' && text[i + 1] === '*') { let j = text.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; push(span('tk-co', text.slice(i, j))); i = j; continue; }
      if (c === '#' && /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i))) { let j = text.indexOf('\n', i); if (j < 0) j = n; push(span('tk-kw', text.slice(i, j))); i = j; continue; }
      // Strings: "..", @"..", $".." , $@".."
      if (c === '"' || ((c === '$' || c === '@') && (text[i + 1] === '"' || ((text[i + 1] === '$' || text[i + 1] === '@') && text[i + 2] === '"')))) {
        let j = i, interp = false, verb = false;
        while (text[j] === '$' || text[j] === '@') { if (text[j] === '$') interp = true; else verb = true; j++; }
        if (text.substr(j, 3) === '"""') {
          let e = text.indexOf('"""', j + 3); e = e < 0 ? n : e + 3;
          push(span('tk-st', text.slice(i, e))); i = e; continue;
        }
        j++;
        while (j < n) {
          if (text[j] === '\\' && !verb) { j += 2; continue; }
          if (text[j] === '"') { if (verb && text[j + 1] === '"') { j += 2; continue; } j++; break; }
          if (text[j] === '\n' && !verb) break;
          j++;
        }
        const s = text.slice(i, Math.min(j, n));
        push(interp ? interpolated(s) : span('tk-st', s));
        i = Math.min(j, n); continue;
      }
      if (c === "'") {
        let j = i + 1;
        while (j < n && text[j] !== "'" && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
        if (text[j] === "'") j++;
        push(span('tk-st', text.slice(i, j))); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || '') && !isIdChar(text[i - 1] || ' '))) {
        const m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:[0-9][0-9_]*)?\.?[0-9][0-9_]*(?:[eE][+-]?[0-9]+)?)(?:[uUlLfFdDmM]{1,2})?/.exec(text.slice(i, i + 60));
        const tok = m && m[0] ? m[0] : c;
        push(span('tk-nu', tok)); i += tok.length; continue;
      }
      if (isIdStart(c) || c === '@') {
        let j = i + 1; while (j < n && isIdChar(text[j])) j++;
        const w = text.slice(i, j);
        let k = j; while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
        const next = text[k] || '';
        let cls;
        if (CS_KW.has(w) && !(w === 'value' || w === 'get' || w === 'set' || w === 'init' || w === 'var' || w === 'record' || w === 'when' || w === 'where' || w === 'and' || w === 'or' || w === 'not' || w === 'with' || w === 'global' || w === 'partial' || w === 'required' || w === 'async' || w === 'await' || w === 'yield') ) cls = 'tk-kw';
        else if (['var', 'get', 'set', 'init', 'value', 'record', 'when', 'where', 'and', 'or', 'not', 'with', 'partial', 'required', 'global'].includes(w) && (w === 'var' || w === 'record' || next === ';' || next === '{' || next === '}' || w === 'when' || w === 'and' || w === 'or' || w === 'not' || w === 'with' || w === 'partial' || w === 'required' || w === 'global' || w === 'where')) cls = 'tk-kw';
        else if (CS_TYPES.has(w) || userTypes.has(w)) cls = 'tk-ty';
        else if (prevWord === 'new' && /^[A-Z]/.test(w)) cls = 'tk-ty';
        else if (next === '(') cls = (prevSig === 'new' || prevWord === 'class' || prevWord === 'struct') ? 'tk-ty' : 'tk-fn';
        else if (/^[A-Z]/.test(w) && (next === '<' && /^[A-Z]/.test(w)) ) cls = 'tk-ty';
        else if (/^[A-Z]/.test(w) && /[A-Za-z_]/.test(next) && !CS_KW.has(next) && prevSig !== '.' && prevSig !== '=') cls = 'tk-ty';
        else if (prevSig === ':' && /^[A-Z]/.test(w) && next === '{') cls = 'tk-ty';
        else if (prevWord === 'class' || prevWord === 'struct' || prevWord === 'interface' || prevWord === 'enum' || prevWord === 'record') cls = 'tk-ty';
        else cls = 'tk-va';
        push(span(cls, w));
        prevWord = w; prevSig = w; i = j; continue;
      }
      // Operator / Klammer
      push(span('tk-op', c));
      prevSig = c; if (c !== '.') prevWord = '';
      i++;
    }
    return out.join('');
  }

  function highlightPython(text, userTypes) {
    const out = [];
    const n = text.length;
    let i = 0, prevWord = '', prevSig = '';
    const push = (html) => out.push(html);
    while (i < n) {
      const c = text[i];
      if (c === '\n' || c === ' ' || c === '\t') {
        let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
        push(text.slice(i, j)); i = j; continue;
      }
      if (c === '#') { let j = text.indexOf('\n', i); if (j < 0) j = n; push(span('tk-co', text.slice(i, j))); i = j; continue; }
      // Strings mit Präfix
      let pm = /^([rRbBuUfF]{1,2})?('''|"""|'|")/.exec(text.slice(i, i + 5));
      if (pm && (pm[1] || true) && (!pm[1] || /^[rRbBuUfF]{1,2}$/.test(pm[1])) && (isIdStart(c) ? !!pm[1] : true)) {
        const prefix = pm[1] || '', q = pm[2];
        const isF = /[fF]/.test(prefix), raw = /[rR]/.test(prefix);
        let j = i + prefix.length + q.length;
        const triple = q.length === 3;
        for (; j < n; j++) {
          if (text[j] === '\\' && !raw) { j++; continue; }
          if (text.substr(j, q.length) === q) { j += q.length; break; }
          if (text[j] === '\n' && !triple) break;
        }
        const s = text.slice(i, Math.min(j, n));
        push(isF ? interpolated(s) : span('tk-st', s));
        i = Math.min(j, n); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
        const m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*)?\.?[0-9][0-9_]*(?:[eE][+-]?[0-9]+)?j?)/.exec(text.slice(i, i + 60));
        const tok = m && m[0] ? m[0] : c;
        push(span('tk-nu', tok)); i += tok.length; continue;
      }
      if (c === '@' && /[A-Za-z_]/.test(text[i + 1] || '') && /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i))) {
        let j = i + 1; while (j < n && (isIdChar(text[j]) || text[j] === '.')) j++;
        push(span('tk-fn', text.slice(i, j))); i = j; continue;
      }
      if (isIdStart(c)) {
        let j = i + 1; while (j < n && isIdChar(text[j])) j++;
        const w = text.slice(i, j);
        let k = j; while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
        const next = text[k] || '';
        let cls;
        if (PY_KW.has(w) && !((w === 'match' || w === 'case') && !(next && next !== '=' && next !== '.' && next !== '(' && next !== ',' && next !== ')'))) cls = 'tk-kw';
        else if (prevWord === 'def') cls = 'tk-fn';
        else if (prevWord === 'class') cls = 'tk-ty';
        else if (PY_TYPES.has(w) || userTypes.has(w)) cls = next === '(' && !userTypes.has(w) && !PY_TYPES.has(w) ? 'tk-fn' : 'tk-ty';
        else if (next === '(' || PY_BUILTIN_FN.has(w) && next === '(') cls = 'tk-fn';
        else if (w === 'self' || w === 'cls') cls = 'tk-va';
        else cls = 'tk-va';
        push(span(cls, w));
        prevWord = w; prevSig = w; i = j; continue;
      }
      push(span('tk-op', c));
      prevSig = c; prevWord = '';
      i++;
    }
    void prevSig;
    return out.join('');
  }

  KON.highlight = function (text, lang) {
    const userTypes = declaredTypes(text, lang);
    return lang === 'python' ? highlightPython(text, userTypes) : highlightCSharp(text, userTypes);
  };
  KON.declaredTypes = declaredTypes;
})(window);
