/* Automatisches Einrücken: für eingefügten Code und für das ganze Dokument. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  /* Text in "nur Code" umwandeln (Strings/Kommentare durch Leerzeichen ersetzt) und
   * Zeilen merken, die mitten in einem mehrzeiligen Kommentar/String beginnen. */
  function scan(text, lang) {
    const py = lang === 'python';
    const out = text.split('');
    const n = text.length;
    const cont = new Set();
    let i = 0, ln = 0;
    const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
    const markSpan = (a, b) => { let l = ln; for (let k = a; k < b && k < n; k++) if (text[k] === '\n') { l++; cont.add(l); } ln = l; };
    while (i < n) {
      const c = text[i];
      if (c === '\n') { ln++; i++; continue; }
      if (py ? c === '#' : (c === '/' && text[i + 1] === '/')) { const e = text.indexOf('\n', i); const end = e < 0 ? n : e; blank(i, end); i = end; continue; }
      if (!py && c === '/' && text[i + 1] === '*') {
        const e = text.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2;
        blank(i, end); markSpan(i, end); i = end; continue;
      }
      if (c === '"' || c === "'") {
        let verbatim = false;
        if (!py) { let p = i - 1; while (p >= 0 && (text[p] === '$' || text[p] === '@')) { if (text[p] === '@') verbatim = true; p--; } }
        const triple = text.substr(i, 3) === c.repeat(3) && (py || c === '"');
        const q = triple ? c.repeat(3) : c;
        let j = i + q.length;
        while (j < n) {
          if (text[j] === '\\' && !verbatim && !(triple && !py)) { j += 2; continue; }
          if (verbatim && text[j] === '"' && text[j + 1] === '"') { j += 2; continue; }
          if (text.substr(j, q.length) === q) { j += q.length; break; }
          if (text[j] === '\n' && !triple && !verbatim) break;
          j++;
        }
        const end = Math.min(j, n);
        blank(i, end); markSpan(i, end); i = end; continue;
      }
      i++;
    }
    return { clean: out.join(''), cont: cont };
  }

  const CASE_RE = /^(?:case\b[^;]*|default)\s*:(?!:)/;
  const HEAD_RE = /^(?:\}\s*)?(?:else\s+)?(?:if|for|foreach|while|using|lock|fixed)\b.*\)\s*$/;
  const ELSE_RE = /^(?:\}\s*)?else\s*$/;

  /* C#: Einrückung pro Zeile aus der Klammerstruktur ableiten.
   * Liefert ein Array mit der Einrückungstiefe (in Stufen) oder null (Zeile unverändert lassen). */
  function csharpLevels(text, upTo) {
    const lines = text.split('\n');
    const sc = scan(text, 'csharp');
    const clines = sc.clean.split('\n');
    const levels = new Array(lines.length).fill(null);
    const stack = []; // { sw: bool, p0: Klammertiefe beim Öffnen }
    let paren = 0, carry = 0, switchCount = 0, prevHeadSwitch = false;
    const last = Math.min(upTo, lines.length - 1);
    for (let i = 0; i <= last; i++) {
      const raw = lines[i];
      const code = clines[i].trim();
      if (sc.cont.has(i)) continue; // mitten in Kommentar/String: nicht anfassen
      if (raw.trim() === '') { levels[i] = -1; continue; }
      let k = 0;
      const startsBrace = code[0] === '{';
      // führende schließende Klammern
      while (k < code.length && (code[k] === '}' || code[k] === ')' || code[k] === ']')) {
        if (code[k] === '}') { const b = stack.pop(); if (b && b.sw) switchCount--; }
        else paren = Math.max(0, paren - 1);
        k++;
      }
      const base = stack.length ? stack[stack.length - 1].p0 : 0;
      let level = stack.length + switchCount + Math.max(0, paren - base);
      if (code === '') { levels[i] = level; continue; } // reine Kommentarzeile
      if (CASE_RE.test(code) && stack.length && stack[stack.length - 1].sw) level -= 1;
      if (!startsBrace && code[0] !== '}') level += carry;
      else if (startsBrace) { /* Block öffnet auf eigener Zeile: Kopfzeile bestimmt die Stufe */ }
      if (code[0] === '.' && carry === 0) level += 1;
      levels[i] = Math.max(0, level);
      // Rest der Zeile auswerten
      const isSwitchHead = /\bswitch\s*(\(|$)/.test(code) && !/;\s*$/.test(code);
      for (let j = k; j < code.length; j++) {
        const ch = code[j];
        if (ch === '{') { const sw = (isSwitchHead && j > 0) || (startsBrace && j === 0 && prevHeadSwitch); stack.push({ sw: sw, p0: paren }); if (sw) switchCount++; }
        else if (ch === '}') { const b = stack.pop(); if (b && b.sw) switchCount--; }
        else if (ch === '(' || ch === '[') paren++;
        else if (ch === ')' || ch === ']') paren = Math.max(0, paren - 1);
      }
      prevHeadSwitch = isSwitchHead && code.indexOf('{') < 0;
      // Einzelanweisung nach if/for/while/else ohne Klammer
      if (startsBrace) carry = 0;
      else if ((HEAD_RE.test(code) || ELSE_RE.test(code) || /^do$/.test(code)) && !/[{;]\s*$/.test(code)) carry += 1;
      else if (code[code.length - 1] === ';' || code[code.length - 1] === '}' || code[code.length - 1] === '{') carry = 0;
    }
    return levels;
  }

  function indentWidth(line, tab) {
    let w = 0;
    for (const c of line) { if (c === ' ') w++; else if (c === '\t') w += tab - (w % tab); else break; }
    return w;
  }

  /* Lines [from..to] (0-basiert) von C#-Text neu einrücken; gibt neuen Gesamttext zurück */
  function reindentCSharp(text, from, to, unit) {
    const lines = text.split('\n');
    const levels = csharpLevels(text, to);
    for (let i = from; i <= to && i < lines.length; i++) {
      const lv = levels[i];
      if (lv === null) continue;
      if (lv === -1) { lines[i] = ''; continue; }
      lines[i] = unit.repeat(lv) + lines[i].trim();
    }
    return lines.join('\n');
  }

  /* Python: eingefügte Zeilen relativ zur Zielposition einrücken.
   * pasted: Zeilen des eingefügten Textes; target: Einrückung (Leerzeichen) der Zielzeile;
   * atStart: Einfügen beginnt am Zeilenanfang (erste Zeile wird mit eingerückt) */
  function pythonPaste(pasted, target, atStart, unitLen) {
    const tab = unitLen;
    const lines = pasted.map((l) => l.replace(/\s+$/, ''));
    const widths = lines.map((l) => (l.trim() === '' ? null : indentWidth(l, tab)));
    const restW = widths.slice(1).filter((w) => w !== null);
    const mR = restW.length ? Math.min(...restW) : null;
    const f = widths[0];
    let baseRest;
    let firstExtra = 0;
    if (f !== null && mR !== null && f < mR && /:\s*(#.*)?$/.test(lines[0])) baseRest = mR - tab; // Auswahl begann erst hinter der Einrückung
    else if (f !== null && mR !== null) baseRest = Math.min(f, mR);
    else baseRest = mR !== null ? mR : (f || 0);
    if (f !== null && mR !== null && f < mR && /:\s*(#.*)?$/.test(lines[0])) firstExtra = 0;
    // Ohne Einrückung kopierter Code: Zeile nach einem Doppelpunkt gehört in den Block
    let bump = 0, bodyRel = null, prevRel = null, prevColon = false;
    return lines.map((l, i) => {
      if (l.trim() === '') return '';
      const w = widths[i];
      const rel = i === 0 ? 0 : Math.max(0, w - baseRest);
      if (i > 0) {
        if (prevColon && rel <= prevRel) { bump += tab; bodyRel = rel; }
        else if (bodyRel !== null && rel < bodyRel) { bump = Math.max(0, bump - tab); bodyRel = rel; }
      }
      prevColon = /:\s*(#.*)?$/.test(l);
      prevRel = rel;
      return (i === 0 ? (atStart ? ' '.repeat(target) : '') : ' '.repeat(target + rel + bump)) + l.trim();
    });
  }

  KON.Indent = { scan: scan, csharpLevels: csharpLevels, reindentCSharp: reindentCSharp, pythonPaste: pythonPaste, indentWidth: indentWidth };
})(window);
