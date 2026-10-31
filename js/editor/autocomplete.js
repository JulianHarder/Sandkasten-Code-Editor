/* Autovervollständigung: lokale Befehlslisten + eigene Symbole aus dem Projekt. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const KIND_LETTER = { 'Schlüsselwort': 'K', 'Methode': 'M', 'Klasse': 'C', 'Variable': 'V', 'Eigenschaft': 'P', 'Snippet': 'S', 'Konstante': '#' };
  const CS_KEYWORDS = new Set(KON.data.csharp.keywords.map((k) => k.name));
  const PY_KEYWORDS = new Set(KON.data.python.keywords.map((k) => k.name));

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------- C#: Typ-Schlüssel für Mitglieder ---------- */
  function csMemberKey(typeName) {
    if (!typeName) return null;
    let t = typeName.replace(/\?$/, '');
    if (/\[\]$/.test(t)) return 'array';
    t = t.replace(/<.*$/, '');
    switch (t) {
      case 'string': case 'String': return 'string';
      case 'List': case 'IList': case 'ICollection': case 'IEnumerable': case 'IReadOnlyList': case 'ArrayList': case 'LinkedList': return 'List';
      case 'Dictionary': case 'IDictionary': case 'SortedDictionary': case 'SortedList': return 'Dictionary';
      case 'HashSet': case 'ISet': case 'SortedSet': return 'HashSet';
      case 'Queue': return 'Queue';
      case 'Stack': return 'Stack';
      case 'StringBuilder': return 'StringBuilder';
      case 'Random': return 'Random';
      case 'DateTime': return 'DateTime';
      case 'int': case 'long': case 'short': case 'byte': case 'uint': case 'ulong': case 'Int32': case 'Int64': return 'int';
      case 'double': case 'float': case 'decimal': case 'Double': return 'double';
      case 'char': case 'Char': return 'char';
      case 'object': case 'Object': return 'object';
    }
    if (/Exception$/.test(t)) return 'Exception';
    return null;
  }

  /* Mitglieder einer vom Benutzer definierten Klasse (C#) aus dem Quelltext lesen */
  function csClassBody(text, name) {
    const re = new RegExp('\\b(?:class|struct|record|interface)\\s+' + name + '\\b([^{;]*)\\{');
    const m = re.exec(text);
    if (!m) return null;
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    while (i < text.length && depth > 0) { const c = text[i]; if (c === '{') depth++; else if (c === '}') depth--; i++; }
    const base = /:\s*([A-Za-z_]\w*)/.exec(m[1]);
    return { body: text.slice(start, i - 1), base: base ? base[1] : null };
  }
  function csUserMembers(text, name, staticOnly, seen) {
    seen = seen || new Set();
    if (seen.has(name)) return [];
    seen.add(name);
    const cb = csClassBody(text, name);
    if (!cb) return [];
    const out = [];
    // nur Mitglieder der obersten Ebene (Tiefe 1)
    let depth = 0, top = '';
    for (const ch of cb.body) { if (ch === '{') { depth++; if (depth === 1) top += '{'; } else if (ch === '}') { depth--; if (depth === 0) top += '}'; } else if (depth === 0) top += ch; }
    const re = /((?:(?:public|private|protected|internal|static|readonly|const|virtual|override|abstract|sealed|new)\s+)*)([A-Za-z_][\w<>,\[\]\?\.]*)\s+([A-Za-z_]\w*)\s*(\(([^)]*)\)|\{|=|;)/g;
    let m;
    while ((m = re.exec(top))) {
      const mods = m[1] || '';
      const type = m[2], nm = m[3], tail = m[4];
      if (['return', 'new', 'else', 'using', 'namespace', 'class', 'struct', 'if', 'for', 'while', 'foreach', 'switch', 'throw', 'case', 'var'].includes(type) && !mods) continue;
      if (/\bprivate\b/.test(mods) && !staticOnly && false) continue;
      const isStatic = /\bstatic\b|\bconst\b/.test(mods);
      if (staticOnly && !isStatic) continue;
      if (!staticOnly && isStatic) continue;
      if (tail.startsWith('(')) out.push({ name: nm, kind: 'Methode', sig: nm + '(' + (m[5] || '').trim() + ')', desc: 'Methode aus deinem Code → ' + type });
      else out.push({ name: nm, kind: tail === '{' ? 'Eigenschaft' : 'Variable', sig: type, desc: (tail === '{' ? 'Eigenschaft' : 'Feld') + ' aus deinem Code' });
    }
    // Enum-Werte
    const em = new RegExp('\\benum\\s+' + name + '\\b\\s*\\{([^}]*)\\}').exec(text);
    if (em && staticOnly) for (const part of em[1].split(',')) { const n2 = part.trim().split(/[\s=]/)[0]; if (n2) out.push({ name: n2, kind: 'Konstante', sig: name, desc: 'Wert der Aufzählung ' + name }); }
    if (cb.base && !staticOnly) out.push(...csUserMembers(text, cb.base, false, seen));
    return out;
  }

  /* ---------- Python: Mitglieder einer Klasse ---------- */
  function pyClassBody(text, name) {
    const m = new RegExp('^class\\s+' + name + '\\b([^\\n]*):', 'm').exec(text);
    if (!m) return null;
    const lines = text.slice(m.index + m[0].length).split('\n').slice(1);
    const body = [];
    for (const l of lines) { if (l.trim() === '' || /^\s/.test(l)) body.push(l); else break; }
    const base = /\(\s*([A-Za-z_]\w*)/.exec(m[1]);
    return { body: body.join('\n'), base: base ? base[1] : null };
  }
  function pyUserMembers(text, name, seen) {
    seen = seen || new Set();
    if (seen.has(name)) return [];
    seen.add(name);
    const cb = pyClassBody(text, name);
    if (!cb) return [];
    const out = [], names = new Set();
    let m;
    const reDef = /^\s+def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/gm;
    while ((m = reDef.exec(cb.body))) {
      if (m[1].startsWith('__') && m[1].endsWith('__')) continue;
      if (names.has(m[1])) continue;
      names.add(m[1]);
      const ps = m[2].split(',').map((p) => p.trim()).filter((p) => p && p !== 'self' && p !== 'cls').join(', ');
      out.push({ name: m[1], kind: 'Methode', sig: m[1] + '(' + ps + ')', desc: 'Methode aus deinem Code' });
    }
    const reAttr = /self\.([A-Za-z_]\w*)\s*(?::[^=\n]+)?=/g;
    while ((m = reAttr.exec(cb.body))) { if (names.has(m[1])) continue; names.add(m[1]); out.push({ name: m[1], kind: 'Variable', sig: '', desc: 'Attribut aus deinem Code' }); }
    const reCls = /^\s{1,8}([A-Za-z_]\w*)\s*(?::[^=\n]+)?=/gm;
    while ((m = reCls.exec(cb.body))) { if (names.has(m[1])) continue; names.add(m[1]); out.push({ name: m[1], kind: 'Variable', sig: '', desc: 'Klassenattribut aus deinem Code' }); }
    if (cb.base) out.push(...pyUserMembers(text, cb.base, seen));
    return out;
  }

  class Autocomplete {
    constructor(editor, host) {
      this.ed = editor;
      this.list = document.createElement('ul');
      this.list.className = 'ac';
      this.list.hidden = true;
      this.list.setAttribute('role', 'listbox');
      host.appendChild(this.list);
      this.items = [];
      this.sel = 0;
      this.range = null;
      this.open = false;
      /* Auswahl folgt der Maus; mousemove statt mouseover, damit Tastatur-Scrollen unter ruhender Maus die Auswahl nicht verschiebt */
      let lastX = -1, lastY = -1;
      this.list.addEventListener('mousemove', (e) => {
        if (e.clientX === lastX && e.clientY === lastY) return;
        lastX = e.clientX; lastY = e.clientY;
        const li = e.target.closest('li');
        if (!li) return;
        const i = parseInt(li.dataset.i, 10);
        if (i !== this.sel) { this.sel = i; this.paintSel(true); }
      });
      this.list.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const li = e.target.closest('li');
        if (li) { this.sel = parseInt(li.dataset.i, 10); this.accept(); }
      });
    }

    isOpen() { return this.open; }
    close() { if (this.open) { this.open = false; this.list.hidden = true; } }

    /* Tasten behandeln, wenn die Liste offen ist; true = verbraucht */
    onKeydown(e) {
      if (!this.open) return false;
      switch (e.key) {
        case 'ArrowDown': this.move(1); e.preventDefault(); return true;
        case 'ArrowUp': this.move(-1); e.preventDefault(); return true;
        case 'PageDown': this.move(6); e.preventDefault(); return true;
        case 'PageUp': this.move(-6); e.preventDefault(); return true;
        case 'Enter': case 'Tab': if (e.shiftKey && e.key === 'Tab') { this.close(); return false; } this.accept(); e.preventDefault(); return true;
        case 'Escape': this.close(); e.preventDefault(); return true;
        case 'ArrowLeft': case 'ArrowRight': case 'Home': case 'End': this.close(); return false;
      }
      return false;
    }

    move(d) {
      this.sel = Math.max(0, Math.min(this.items.length - 1, this.sel + d));
      this.paintSel();
    }
    paintSel(noScroll) {
      const lis = this.list.children;
      for (let i = 0; i < lis.length; i++) lis[i].classList.toggle('sel', i === this.sel);
      const cur = lis[this.sel];
      if (cur && !noScroll) {
        const top = cur.offsetTop, bottom = top + cur.offsetHeight;
        if (top < this.list.scrollTop) this.list.scrollTop = top - 3;
        else if (bottom > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = bottom - this.list.clientHeight + 3;
      }
    }

    update(manual) {
      if (!this.ed.settings.suggest && !manual) { this.close(); return; }
      const ta = this.ed.ta;
      if (ta.selectionStart !== ta.selectionEnd) { this.close(); return; }
      const pos = ta.selectionStart;
      const text = ta.value;
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
      const before = text.slice(lineStart, pos);
      if (this.inCommentOrString(before)) { this.close(); return; }
      const pm = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
      const prefix = pm ? pm[1] : '';
      const start = pos - prefix.length;
      const charBefore = text[start - 1];
      let cands;
      const lang = this.ed.getLang();
      const afterDot = charBefore === '.' && !/^\d/.test(before.slice(0, before.length - prefix.length - 1).slice(-1));
      if (afterDot) {
        const objM = /([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\]|\([^()]*\))?\.$/.exec(before.slice(0, before.length - prefix.length));
        cands = this.memberCandidates(lang, objM ? objM[1] : null, objM ? objM[2] : null, text, start);
        if (cands === null) { if (!manual) { this.close(); return; } cands = []; }
      } else {
        if (!prefix && !manual) { this.close(); return; }
        if (!manual && /^\d/.test(prefix)) { this.close(); return; }
        if (/[0-9]$/.test(before.slice(0, before.length - prefix.length))) { this.close(); return; }
        cands = this.globalCandidates(lang, text, prefix, pos);
      }
      const lp = prefix.toLowerCase();
      let filtered = cands.filter((c) => c.name.toLowerCase().startsWith(lp));
      if (lp && filtered.length < 6) {
        const extra = cands.filter((c) => !c.name.toLowerCase().startsWith(lp) && c.name.toLowerCase().includes(lp));
        filtered = filtered.concat(extra);
      }
      filtered.forEach((c, i) => { c._i = i; });
      filtered.sort((a, b) => {
        const ap = a.name.startsWith(prefix) ? 0 : a.name.toLowerCase().startsWith(lp) ? 1 : 2;
        const bp = b.name.startsWith(prefix) ? 0 : b.name.toLowerCase().startsWith(lp) ? 1 : 2;
        if (!afterDot) return ap - bp || (a.rank || 5) - (b.rank || 5) || a.name.length - b.name.length || a.name.localeCompare(b.name);
        return ap - bp || a._i - b._i; // bei Mitgliedern die kuratierte Reihenfolge behalten
      });
      // Duplikate (Name+Art)
      const seen = new Set();
      filtered = filtered.filter((c) => { const k = c.name + '|' + c.kind; if (seen.has(k)) return false; seen.add(k); return true; });
      if (!filtered.length || (filtered.length === 1 && filtered[0].name === prefix && filtered[0].kind !== 'Snippet')) { this.close(); return; }
      this.items = filtered.slice(0, 40);
      this.range = { start: start, end: pos };
      this.prefix = prefix;
      this.sel = 0;
      this.render();
      this.position(start);
    }

    inCommentOrString(before) {
      const lang = this.ed.getLang();
      let q = null;
      for (let i = 0; i < before.length; i++) {
        const c = before[i];
        if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'") { q = c; continue; }
        if (lang === 'python' ? c === '#' : (c === '/' && before[i + 1] === '/')) return true;
      }
      return q !== null && !(lang === 'csharp' && before.indexOf('$"') >= 0 && false);
    }

    memberCandidates(lang, obj, suffix, text, pos) {
      const data = KON.data[lang].members;
      if (!obj) return null;
      if (lang === 'csharp') {
        if (obj === 'this') {
          const cls = this.enclosingClass(text, pos, 'csharp');
          return cls ? csUserMembers(text, cls, false).concat(data.object) : data.object;
        }
        if (this.userTypeNames(text, 'csharp').has(obj) && !this.hasVariable(text, obj)) {
          const stat = csUserMembers(text, obj, true);
          return stat;
        }
        const alias = { String: 'string', Int32: 'int', Int64: 'long', Double: 'double', Char: 'char' }[obj] || obj;
        if (data['static:' + alias] && !this.hasVariable(text, obj)) return data['static:' + alias];
        let type = this.inferCsType(text, obj, pos);
        if (suffix && suffix.startsWith('[') && type) {
          if (/\[\]$/.test(type)) type = type.slice(0, -2);
          else { const g = /<([^<>,]+)(?:,\s*([^<>]+))?>/.exec(type); type = g ? (g[2] || g[1]) : null; }
        }
        if (!type) return null;
        const key = csMemberKey(type);
        if (key && data[key]) return data[key].concat(key === 'object' ? [] : data.object);
        const base = type.replace(/<.*$/, '').replace(/\[\]$/, '');
        const um = csUserMembers(text, base, false);
        if (um.length) return um.concat(data.object);
        return data.object;
      }
      // Python
      if (obj === 'self') {
        const cls = this.enclosingClass(text, pos, 'python');
        return cls ? pyUserMembers(text, cls) : null;
      }
      const mod = this.pyModuleFor(text, obj);
      if (mod && data['module:' + mod]) return data['module:' + mod];
      if (this.userTypeNames(text, 'python').has(obj) && !this.hasVariable(text, obj)) return pyUserMembers(text, obj);
      let t = this.inferPyType(text, obj);
      if (t && data[t]) return data[t];
      if (t && this.userTypeNames(text, 'python').has(t)) return pyUserMembers(text, t);
      if (suffix) return null;
      if (obj === 'str' || obj === 'list' || obj === 'dict' || obj === 'set') return null;
      return null;
    }

    hasVariable(text, name) {
      return new RegExp('(?:\\b[A-Za-z_][\\w<>,\\[\\]\\?]*\\s+' + name + '\\s*[=;,)]|^\\s*' + name + '\\s*=[^=])', 'm').test(text);
    }
    userTypeNames(text, lang) { return KON.declaredTypes(text, lang); }

    enclosingClass(text, pos, lang) {
      const before = text.slice(0, pos);
      const re = lang === 'python' ? /^class\s+([A-Za-z_]\w*)/gm : /\b(?:class|struct|record)\s+([A-Za-z_]\w*)/g;
      let m, last = null;
      while ((m = re.exec(before))) last = m[1];
      return last;
    }

    inferCsType(text, name, pos) {
      const before = text.slice(0, pos);
      const esc2 = name.replace(/[$]/g, '\\$');
      const reType = new RegExp('\\b([A-Za-z_][\\w\\.]*(?:<[^;=()]*?>)?(?:\\[[,]*\\])*\\??)\\s+' + esc2 + '\\s*(?:=|;|,|\\)|:|in\\b)', 'g');
      let m, type = null;
      while ((m = reType.exec(before))) { if (!['return', 'new', 'else', 'case', 'throw', 'in', 'is', 'as'].includes(m[1])) type = m[1]; }
      if (type && type !== 'var') return type;
      const reVar = new RegExp('\\bvar\\s+' + esc2 + '\\s*=\\s*([^;]+);', 'g');
      let init = null;
      while ((m = reVar.exec(before))) init = m[1].trim();
      if (init) {
        let nm = /^new\s+([A-Za-z_]\w*(?:<[^()]*>)?(?:\[[^\]]*\])?)/.exec(init);
        if (nm) return nm[1].replace(/\[[^\]]*\]$/, '[]');
        if (/^\$?@?"/.test(init)) return 'string';
        if (/^-?\d+$/.test(init)) return 'int';
        if (/^-?\d*\.\d+/.test(init)) return 'double';
        if (/^'.'$/.test(init)) return 'char';
        if (/\.(?:ToList)\(\)$/.test(init)) return 'List';
        if (/\.(?:Split)\(/.test(init)) return 'string[]';
        if (/\.ToArray\(\)$/.test(init)) return 'array[]';
        const call = /^([A-Za-z_]\w*)\(/.exec(init);
        if (call) { const rm = new RegExp('\\b([A-Za-z_][\\w<>\\[\\],\\?]*)\\s+' + call[1] + '\\s*\\(').exec(text); if (rm) return rm[1]; }
        if (/^Console\.ReadLine/.test(init)) return 'string';
      }
      return null;
    }

    pyModuleFor(text, name) {
      let m = new RegExp('^\\s*import\\s+([A-Za-z_][\\w\\.]*)\\s+as\\s+' + name + '\\b', 'm').exec(text);
      if (m) return m[1];
      if (new RegExp('^\\s*import\\s+(?:[\\w\\.]+\\s*,\\s*)*' + name + '\\b(?!\\s+as)', 'm').test(text)) return name;
      return null;
    }

    inferPyType(text, name) {
      const re = new RegExp('^[ \\t]*' + name + '\\s*(?::[^=\\n]+)?=\\s*([^\\n#]+)', 'gm');
      let m, last = null;
      while ((m = re.exec(text))) last = m[1].trim();
      if (last === null) {
        if (new RegExp('def\\s+\\w+\\([^)]*\\b' + name + '\\s*:\\s*(str|list|dict|set|int|float)').test(text)) return RegExp.$1;
        return null;
      }
      if (/^[rbfu]*(["']).*\1$/.test(last) || /^(f|r)?"""/.test(last) || /^str\(/.test(last) || /^input\(/.test(last) || /\.(?:strip|lower|upper|join|format|replace|title|capitalize)\(.*\)$/.test(last)) return 'str';
      if (/^\[/.test(last) || /^list\(/.test(last) || /\.split\(/.test(last) || /^sorted\(/.test(last)) return 'list';
      if (/^\{\s*\}/.test(last) || /^dict\(/.test(last) || /^\{[^}]*:[^}]*\}/.test(last)) return 'dict';
      if (/^set\(/.test(last) || /^\{[^:}]+\}/.test(last)) return 'set';
      if (/^\(/.test(last) || /^tuple\(/.test(last)) return 'tuple';
      if (/^-?\d+$/.test(last) || /^int\(/.test(last)) return 'int';
      if (/^-?\d*\.\d+$/.test(last) || /^float\(/.test(last)) return 'float';
      const cm = /^([A-Z][A-Za-z_]\w*)\(/.exec(last);
      if (cm) return cm[1];
      return null;
    }

    globalCandidates(lang, text, prefix, pos) {
      const d = KON.data[lang];
      const out = [];
      for (const k of d.keywords) out.push(Object.assign({ rank: 2 }, k));
      for (const t of d.types) out.push(Object.assign({ rank: 3 }, t));
      if (lang === 'python') for (const b of d.builtins) out.push(Object.assign({ rank: 3 }, b));
      for (const s of d.snippets) out.push(Object.assign({ rank: 1 }, s));
      if (lang === 'python') {
        for (const m of d.modules) if (/^\s*(?:import|from)\s+[\w\., ]*$/.test(text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos))) out.push({ name: m, kind: 'Klasse', sig: '', desc: 'Modul', rank: 0 });
      }
      // eigene Symbole
      const own = new Map();
      const src = (this.ed.getProjectText ? this.ed.getProjectText() : text) || text;
      const kw = lang === 'python' ? PY_KEYWORDS : CS_KEYWORDS;
      const reDecl = lang === 'python' ? /\b(?:class|def)\s+([A-Za-z_]\w*)/g : /\b(?:class|struct|interface|enum|record)\s+([A-Za-z_]\w*)/g;
      let m;
      while ((m = reDecl.exec(src))) own.set(m[1], { name: m[1], kind: /\bdef\b/.test(m[0]) ? 'Methode' : 'Klasse', sig: '', desc: 'aus deinem Code', rank: 0 });
      // Nur Namen vorschlagen, die im Code wirklich deklariert sind (nicht jedes Wort aus Texten/Kommentaren)
      const clean = KON.Autocomplete.stripLiterals(text, lang);
      const curWordStart = pos - prefix.length;
      const add = (name, kind, desc) => {
        if (!name || name.length < 2 || kw.has(name) || own.has(name)) return;
        if (name === prefix && clean.indexOf(name, curWordStart) === curWordStart) { /* gerade getippt */ }
        own.set(name, { name: name, kind: kind, sig: '', desc: desc || 'aus deinem Code', rank: kind === 'Variable' ? 4 : 1 });
      };
      if (lang === 'python') {
        for (const mm of clean.matchAll(/^[ \t]*([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/gm)) add(mm[1], 'Variable');
        for (const mm of clean.matchAll(/^[ \t]*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=(?!=)/gm)) mm[1].split(',').forEach((n) => add(n.trim(), 'Variable'));
        for (const mm of clean.matchAll(/\bfor\s+([A-Za-z_][\w\s,]*?)\s+in\b/g)) mm[1].split(',').forEach((n) => add(n.trim(), 'Variable'));
        for (const mm of clean.matchAll(/\bdef\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
          add(mm[1], 'Methode');
          mm[2].split(',').forEach((p) => { const n = p.replace(/[*]/g, '').split(/[:=]/)[0].trim(); if (n !== 'self' && n !== 'cls') add(n, 'Variable', 'Parameter aus deinem Code'); });
        }
        for (const mm of clean.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) add(mm[1], 'Variable');
        for (const mm of clean.matchAll(/\bimport\s+([A-Za-z_]\w*)/g)) add(mm[1], 'Variable', 'importiertes Modul');
        for (const mm of clean.matchAll(/\bfrom\s+[\w.]+\s+import\s+([\w\s,]+)/g)) mm[1].split(',').forEach((n) => add(n.trim(), 'Variable', 'importiert'));
      } else {
        const typeRe = '[A-Za-z_][\\w<>,\\[\\]\\?\\.]*';
        const notType = new Set(['return', 'new', 'else', 'case', 'throw', 'in', 'is', 'as', 'using', 'namespace', 'goto', 'yield', 'await', 'typeof', 'nameof', 'sizeof', 'default', 'when']);
        for (const mm of clean.matchAll(new RegExp('\\b(' + typeRe + ')\\s+([A-Za-z_]\\w*)\\s*(?=[=;,):]|\\bin\\b)', 'g'))) if (!notType.has(mm[1])) add(mm[2], 'Variable');
        for (const mm of clean.matchAll(new RegExp('\\b(' + typeRe + ')\\s+([A-Za-z_]\\w*)\\s*(?:<[^>()]*>)?\\(([^()]*)\\)\\s*(?=\\{|=>|\\n\\s*\\{|where\\b)', 'g'))) {
          if (notType.has(mm[1])) continue;
          add(mm[2], 'Methode');
          mm[3].split(',').forEach((p) => { const t2 = p.replace(/\b(?:ref|out|in|params|this)\b/g, '').replace(/=.*/, '').trim().split(/\s+/); if (t2.length >= 2) add(t2[t2.length - 1], 'Variable', 'Parameter aus deinem Code'); });
        }
        for (const mm of clean.matchAll(/\b(?:foreach|for)\s*\(\s*(?:var|[A-Za-z_][\w<>,\[\]\?]*)\s+([A-Za-z_]\w*)/g)) add(mm[1], 'Variable');
        for (const mm of clean.matchAll(/\bout\s+(?:var|[A-Za-z_][\w<>,\[\]\?]*)\s+([A-Za-z_]\w*)/g)) add(mm[1], 'Variable');
        for (const mm of clean.matchAll(/\b(?:is|catch\s*\(\s*[A-Za-z_]\w*)\s+(?:[A-Za-z_][\w<>,\[\]]*\s+)?([a-z_]\w*)\s*[)&|]/g)) add(mm[1], 'Variable');
        for (const mm of clean.matchAll(/(?:^|[(,])\s*\(?([a-z_]\w*)\)?\s*=>/gm)) add(mm[1], 'Variable', 'Lambda-Parameter');
        for (const mm of clean.matchAll(/\b(?:public|private|protected|internal)\s+(?:static\s+|readonly\s+|const\s+)*[A-Za-z_][\w<>,\[\]\?]*\s+([A-Za-z_]\w*)\s*(?:\{|=|;)/g)) add(mm[1], 'Eigenschaft');
      }
      for (const v of own.values()) out.push(v);
      // C#: Methoden der aktuellen Klasse
      return out;
    }

    render() {
      const lp = this.prefix || '';
      this.list.innerHTML = this.items.map((c, i) => {
        const name = lp && c.name.toLowerCase().startsWith(lp.toLowerCase()) ? '<b>' + esc(c.name.slice(0, lp.length)) + '</b>' + esc(c.name.slice(lp.length)) : esc(c.name);
        const sig = c.sig && c.kind === 'Methode' ? c.sig.replace(c.name, '') : (c.sig && c.kind !== 'Methode' ? ': ' + c.sig : '');
        return '<li data-i="' + i + '" role="option" title="' + esc(c.kind) + '"><span class="kind k-' + c.kind + '">' + (KIND_LETTER[c.kind] || '?') + '</span>' +
          '<span class="nm">' + name + '<span class="sig">' + esc(sig) + '</span></span>' +
          '<span class="ds">' + esc(c.kind) + (c.desc ? ' · ' + esc(c.desc) : '') + '</span></li>';
      }).join('');
      this.open = true;
      this.list.hidden = false;
      this.list.scrollTop = 0;
      this.paintSel();
    }

    position(startPos) {
      const ed = this.ed;
      const p = ed.coordsOf(startPos);
      const bodyW = ed.body.clientWidth, bodyH = ed.body.clientHeight;
      const lw = this.list.offsetWidth, lh = this.list.offsetHeight;
      let left = p.left, top = p.top + ed.lineHeight;
      if (left + lw > bodyW - 6) left = Math.max(4, bodyW - lw - 6);
      if (top + lh > bodyH - 4 && p.top - lh > 0) top = p.top - lh;
      this.list.style.left = Math.max(2, left) + 'px';
      this.list.style.top = Math.max(2, top) + 'px';
    }

    accept() {
      const c = this.items[this.sel];
      if (!c || !this.range) { this.close(); return; }
      const ed = this.ed, ta = ed.ta;
      const { start, end } = this.range;
      const text = ta.value;
      let ins, caret;
      if (c.kind === 'Snippet') {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const indent = /^[ \t]*/.exec(text.slice(lineStart, start))[0];
        const body = c.insert.replace(/\n/g, '\n' + indent);
        const k = body.indexOf('$0');
        ins = body.replace('$0', '');
        caret = start + (k < 0 ? ins.length : k);
      } else if (c.kind === 'Methode' && !/\)\s*$/.test('') ) {
        const hasParams = /\(\s*[^)\s]/.test(c.sig);
        const nextCh = text[end];
        if (nextCh === '(') { ins = c.name; caret = start + ins.length; }
        else { ins = c.name + '()'; caret = start + c.name.length + (hasParams ? 1 : 2); }
      } else { ins = c.name; caret = start + ins.length; }
      this.close();
      ed.replaceRange(start, end, ins, caret, caret, null);
    }
  }

  /* Strings und Kommentare durch Leerzeichen ersetzen (Länge bleibt gleich) */
  Autocomplete.stripLiterals = function (text, lang) {
    const out = text.split('');
    const n = text.length;
    const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
    let i = 0;
    while (i < n) {
      const c = text[i];
      if (lang === 'python' ? c === '#' : (c === '/' && text[i + 1] === '/')) { const e = text.indexOf('\n', i); const end = e < 0 ? n : e; blank(i, end); i = end; continue; }
      if (lang !== 'python' && c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
      if (c === '"' || c === "'") {
        const triple = lang === 'python' && text.substr(i, 3) === c.repeat(3);
        const q = triple ? c.repeat(3) : c;
        let j = i + q.length;
        while (j < n) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text.substr(j, q.length) === q) { j += q.length; break; }
          if (text[j] === '\n' && !triple) break;
          j++;
        }
        const end = Math.min(j, n);
        blank(i, end);
        // Interpolierte Strings ($"..." in C#, f"..." in Python): Ausdrücke in {...} bleiben sichtbar
        let p = i - 1, interp = false;
        if (lang === 'python') { while (p >= 0 && /[A-Za-z]/.test(text[p])) { if (/[fF]/.test(text[p])) interp = true; p--; } }
        else { while (p >= 0 && (text[p] === '$' || text[p] === '@')) { if (text[p] === '$') interp = true; p--; } }
        if (interp) {
          let d = 0;
          for (let k = i + q.length; k < end - q.length + (end >= n ? q.length : 0) && k < n; k++) {
            const ch = text[k];
            if (d === 0) { if (ch === '{') { if (text[k + 1] === '{') { k++; continue; } d = 1; } }
            else if (ch === '{') { d++; out[k] = ch; }
            else if (ch === '}') { d--; }
            else out[k] = ch;
          }
        }
        i = end; continue;
      }
      i++;
    }
    return out.join('');
  };

  KON.Autocomplete = Autocomplete;
})(window);
