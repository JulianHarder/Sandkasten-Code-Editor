/* Editor: durchsichtiges Eingabefeld über einer farbigen Ebene, Zeilennummern,
 * automatische Einrückung, Klammern, Rückgängig/Wiederholen, Suchen & Ersetzen. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
  const CLOSERS = new Set([')', ']', '}', '"', "'"]);
  const COMMENT = { csharp: '//', python: '#' };

  function visCol(line, idx, tab) {
    let col = 0;
    for (let i = 0; i < idx && i < line.length; i++) col += line[i] === '\t' ? tab - (col % tab) : 1;
    return col;
  }

  class CodeEditor {
    /* opts: { settings, getLang(), onChange(file), onCursor(pos), onRun(), getProjectText() } */
    constructor(host, opts) {
      this.host = host;
      this.opts = opts;
      this.settings = opts.settings;
      this.file = null;
      this.errors = [];
      this.finds = [];
      this.findIdx = -1;
      this.renderQueued = false;
      this.lineCount = 0;
      this.lineStarts = [0];
      this.metrics = { cw: 8.4 };

      const root = document.createElement('div');
      root.className = 'ed';
      root.innerHTML =
        '<div class="ed-gutter"><div class="ed-gutter-inner"></div></div>' +
        '<div class="ed-body">' +
        '<div class="ed-layer ed-guides" aria-hidden="true"></div>' +
        '<div class="ed-layer ed-deco"></div>' +
        '<pre class="ed-layer ed-hl" aria-hidden="true"></pre>' +
        '<textarea class="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Code-Editor"></textarea>' +
        '</div>';
      host.appendChild(root);
      this.root = root;
      this.gutter = root.querySelector('.ed-gutter');
      this.gutterInner = root.querySelector('.ed-gutter-inner');
      this.body = root.querySelector('.ed-body');
      this.guides = root.querySelector('.ed-guides');
      this.deco = root.querySelector('.ed-deco');
      this.hl = root.querySelector('.ed-hl');
      this.ta = root.querySelector('.ed-ta');
      this.ac = new KON.Autocomplete(this, this.body);
      this.applySettings();

      const ta = this.ta;
      ta.addEventListener('input', (e) => this.onInput(e));
      ta.addEventListener('keydown', (e) => this.onKeydown(e));
      ta.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); }
        else if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); }
      });
      ta.addEventListener('paste', (e) => this.onPaste(e));
      ta.addEventListener('scroll', () => { this.syncScroll(); this.scheduleGuides(); });
      ta.addEventListener('keyup', (e) => { if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) this.cursorMoved(); });
      ta.addEventListener('mouseup', () => { this.ac.close(); this.cursorMoved(); });
      ta.addEventListener('focus', () => this.cursorMoved());
      ta.addEventListener('blur', () => setTimeout(() => this.ac.close(), 120));
      ta.addEventListener('mousedown', () => this.ac.close());
      new ResizeObserver(() => { this.syncScroll(); this.scheduleRender(); }).observe(this.body);
    }

    getLang() { return this.opts.getLang(this.file); }

    /* ---------- Einstellungen & Maße ---------- */
    applySettings() {
      const s = this.settings;
      this.root.style.setProperty('--fs', s.fontSize + 'px');
      this.lineHeight = Math.round(s.fontSize * 1.5);
      this.root.style.setProperty('--lh', this.lineHeight + 'px');
      this.root.style.setProperty('--tab', s.tabSize);
      this.measure();
      this.scheduleRender();
    }
    measure() {
      const c = document.createElement('canvas').getContext('2d');
      const cs = getComputedStyle(this.ta);
      c.font = cs.fontSize + ' ' + cs.fontFamily;
      const w = c.measureText('MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM').width / 40;
      if (w > 1) this.metrics.cw = w;
    }

    /* ---------- Datei binden ---------- */
    bindFile(file) {
      this.file = file;
      this.ta.value = file.content;
      this.errors = [];
      this.closeFind();
      this.lineCount = -1;
      this.renderNow();
      this.ta.scrollTop = file.scrollTop || 0;
      this.ta.scrollLeft = file.scrollLeft || 0;
      const sel = file.sel || [0, 0];
      this.ta.setSelectionRange(Math.min(sel[0], file.content.length), Math.min(sel[1], file.content.length));
      this.syncScroll();
      this.ac.close();
    }
    unbind() {
      if (this.file) { this.file.scrollTop = this.ta.scrollTop; this.file.scrollLeft = this.ta.scrollLeft; this.file.sel = [this.ta.selectionStart, this.ta.selectionEnd]; }
    }
    /* Inhalt wurde von außen verändert (z. B. zweites Fenster) */
    refresh() {
      if (!this.file || this.ta.value === this.file.content) return;
      const a = this.ta.selectionStart, b = this.ta.selectionEnd;
      this.ta.value = this.file.content;
      this.ta.setSelectionRange(Math.min(a, this.ta.value.length), Math.min(b, this.ta.value.length));
      this.updateLineStarts();
      this.scheduleRender();
    }
    focus() { this.ta.focus({ preventScroll: true }); }
    getValue() { return this.ta.value; }

    /* ---------- Rendern ---------- */
    scheduleRender() {
      if (this.renderQueued) return;
      this.renderQueued = true;
      const go = () => { if (!this.renderQueued) return; this.renderQueued = false; this.renderNow(); };
      requestAnimationFrame(go);
      setTimeout(go, 60); // Rückfall, falls das Fenster im Hintergrund keine Animationsframes bekommt
    }
    renderNow() {
      if (!this.file) return;
      const text = this.ta.value;
      this.hl.innerHTML = KON.highlight(text, this.getLang()) + '\n';
      this.updateLineStarts();
      this.renderGutter();
      this.renderDeco();
      this.renderGuides();
      this.syncScroll();
    }
    updateLineStarts() {
      const text = this.ta.value;
      const starts = [0];
      for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
      this.lineStarts = starts;
    }
    renderGutter() {
      const n = this.lineStarts.length;
      const digits = Math.max(3, String(n).length);
      this.root.style.setProperty('--gw', (digits * this.metrics.cw + 30) + 'px');
      if (n !== this.lineCount) {
        let html = '';
        for (let i = 1; i <= n; i++) html += '<div class="gl">' + i + '</div>';
        this.gutterInner.innerHTML = html;
        this.lineCount = n;
      }
      const errLines = new Set(this.errors.map((e) => e.line));
      const cur = this.currentLine();
      const kids = this.gutterInner.children;
      for (let i = 0; i < kids.length; i++) {
        const cls = 'gl' + (i + 1 === cur ? ' cur' : '') + (errLines.has(i + 1) ? ' err' : '');
        if (kids[i].className !== cls) kids[i].className = cls;
      }
    }
    currentLine() { return this.lineOf(this.ta.selectionStart) + 1; }
    lineOf(pos) {
      const s = this.lineStarts;
      let lo = 0, hi = s.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= pos) lo = mid; else hi = mid - 1; }
      return lo;
    }
    renderDeco() {
      const lh = this.lineHeight, cw = this.metrics.cw, tab = this.settings.tabSize;
      const parts = [];
      const w = Math.max(this.ta.scrollWidth, this.body.clientWidth);
      this.deco.style.width = w + 'px';
      this.deco.style.height = Math.max(this.ta.scrollHeight, this.body.clientHeight) + 'px';
      if (this.ta.selectionStart === this.ta.selectionEnd && document.activeElement === this.ta) {
        parts.push('<div class="dec-cur" style="top:' + (8 + this.lineOf(this.ta.selectionStart) * lh) + 'px"></div>');
      }
      this.bracketRects(parts, lh, cw, tab);
      this.occurrenceRects(parts, lh, cw, tab);
      for (const e of this.errors) parts.push('<div class="dec-err" style="top:' + (8 + (e.line - 1) * lh) + 'px" title="' + String(e.msg || '').replace(/"/g, '&quot;') + '"></div>');
      if (this.finds.length) {
        const text = this.ta.value;
        this.finds.slice(0, 1500).forEach((f, i) => {
          const ln = this.lineOf(f.start);
          const ls = this.lineStarts[ln];
          const lineText = text.slice(ls, text.indexOf('\n', ls) < 0 ? text.length : text.indexOf('\n', ls));
          const c0 = visCol(lineText, f.start - ls, tab), c1 = visCol(lineText, Math.min(f.end - ls, lineText.length), tab);
          parts.push('<div class="dec-find' + (i === this.findIdx ? ' cur' : '') + '" style="top:' + (8 + ln * lh) + 'px;left:' + (12 + c0 * cw) + 'px;width:' + Math.max(cw, (c1 - c0) * cw) + 'px"></div>');
        });
      }
      this.deco.innerHTML = parts.join('');
    }
    /* Text ohne Kommentare und Zeichenketten (gleiche Länge), zwischengespeichert */
    cleanText() {
      const text = this.ta.value;
      if (this.occText !== text || this.occLang !== this.getLang()) { this.occClean = KON.Autocomplete.stripLiterals(text, this.getLang()); this.occText = text; this.occLang = this.getLang(); }
      return this.occClean;
    }
    /* Klammer neben dem Cursor und ihr Gegenstück hervorheben */
    bracketRects(parts, lh, cw, tab) {
      const ta = this.ta;
      if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd || ta.value.length > 400000) return;
      const OPEN = { '(': ')', '[': ']', '{': '}' }, CLOSE = { ')': '(', ']': '[', '}': '{' };
      const clean = this.cleanText();
      const pos = ta.selectionStart;
      let at = -1;
      if (pos > 0 && (OPEN[clean[pos - 1]] || CLOSE[clean[pos - 1]])) at = pos - 1;
      else if (pos < clean.length && (OPEN[clean[pos]] || CLOSE[clean[pos]])) at = pos;
      if (at < 0) return;
      const ch = clean[at];
      let match = -1, depth = 0;
      if (OPEN[ch]) {
        for (let i = at; i < clean.length; i++) { const c = clean[i]; if (c === ch) depth++; else if (c === OPEN[ch] && --depth === 0) { match = i; break; } }
      } else {
        for (let i = at; i >= 0; i--) { const c = clean[i]; if (c === ch) depth++; else if (c === CLOSE[ch] && --depth === 0) { match = i; break; } }
      }
      if (match < 0) return;
      const text = ta.value;
      for (const i of [at, match]) {
        const ln = this.lineOf(i), ls = this.lineStarts[ln];
        const nl = text.indexOf('\n', ls);
        const c0 = visCol(text.slice(ls, nl < 0 ? text.length : nl), i - ls, tab);
        parts.push('<div class="dec-pair" style="top:' + (8 + ln * lh) + 'px;left:' + (12 + c0 * cw) + 'px;width:' + cw + 'px"></div>');
      }
    }
    /* Senkrechte Einrückungslinien, nur für die sichtbaren Zeilen (plus Rand) */
    scheduleGuides() {
      if (this.guideQueued) return;
      this.guideQueued = true;
      requestAnimationFrame(() => { this.guideQueued = false; this.renderGuides(); });
    }
    renderGuides() {
      if (!this.file) return;
      const lh = this.lineHeight, cw = this.metrics.cw, tab = this.settings.tabSize || 4;
      const text = this.ta.value, starts = this.lineStarts;
      const first = Math.max(0, Math.floor((this.ta.scrollTop - 8) / lh) - 30);
      const last = Math.min(starts.length - 1, Math.ceil((this.ta.scrollTop + this.ta.clientHeight) / lh) + 30);
      const ind = [];
      for (let ln = first; ln <= last; ln++) {
        const e0 = text.indexOf('\n', starts[ln]), e = e0 < 0 ? text.length : e0;
        let col = 0, i = starts[ln];
        for (; i < e; i++) { const c = text[i]; if (c === ' ') col++; else if (c === '\t') col += tab - (col % tab); else break; }
        ind.push(i === e ? -1 : col);
      }
      // leere Zeilen übernehmen die kleinere Einrückung ihrer Nachbarn, damit die Linien durchlaufen
      let prev = 0;
      const nextOf = new Array(ind.length);
      let nx = 0;
      for (let k = ind.length - 1; k >= 0; k--) { if (ind[k] >= 0) nx = ind[k]; nextOf[k] = nx; }
      for (let k = 0; k < ind.length; k++) { if (ind[k] >= 0) prev = ind[k]; else ind[k] = Math.min(prev, nextOf[k]); }
      const maxInd = Math.max(0, ...ind);
      const parts = [];
      for (let lvl = 0; lvl * tab < maxInd; lvl++) {
        let run = -1;
        for (let k = 0; k <= ind.length; k++) {
          const on = k < ind.length && ind[k] > lvl * tab;
          if (on && run < 0) run = k;
          else if (!on && run >= 0) {
            parts.push('<div class="dec-ig" style="top:' + (8 + (first + run) * lh) + 'px;left:' + (12 + lvl * tab * cw) + 'px;height:' + ((k - run) * lh) + 'px"></div>');
            run = -1;
          }
        }
      }
      this.guides.innerHTML = parts.join('');
    }
    /* Alle Vorkommen des Namens unter dem Cursor markieren */
    occurrenceRects(parts, lh, cw, tab) {
      if (document.activeElement !== this.ta || this.findBar) return;
      const ta = this.ta, text = ta.value;
      const a = ta.selectionStart, b = ta.selectionEnd;
      if (text.length > 400000) return;
      const isId = (c) => c !== undefined && /[A-Za-z0-9_\u00c0-\uffff]/.test(c);
      let ws = a, we = b;
      if (a === b) { while (ws > 0 && isId(text[ws - 1])) ws--; while (we < text.length && isId(text[we])) we++; }
      else if (!(/^[A-Za-z_\u00c0-\uffff][A-Za-z0-9_\u00c0-\uffff]*$/.test(text.slice(a, b)) && !isId(text[a - 1]) && !isId(text[b]))) return;
      const word = text.slice(ws, we);
      if (word.length < 2 || /^[0-9]/.test(word)) return;
      const clean = this.cleanText();
      // Cursor in Kommentar/Text: nichts markieren
      if (clean.slice(ws, we) !== word) return;
      const found = [];
      for (let i = clean.indexOf(word); i >= 0 && found.length < 400; i = clean.indexOf(word, i + word.length)) {
        if (!isId(clean[i - 1]) && !isId(clean[i + word.length])) found.push(i);
      }
      if (found.length < 2) return;
      for (const i of found) {
        const ln = this.lineOf(i);
        const ls = this.lineStarts[ln];
        const nl = text.indexOf('\n', ls);
        const lineText = text.slice(ls, nl < 0 ? text.length : nl);
        const c0 = visCol(lineText, i - ls, tab);
        const c1 = visCol(lineText, i - ls + word.length, tab);
        parts.push('<div class="dec-occ' + (i === ws ? ' cur' : '') + '" style="top:' + (8 + ln * lh) + 'px;left:' + (12 + c0 * cw) + 'px;width:' + ((c1 - c0) * cw) + 'px"></div>');
      }
    }
    syncScroll() {
      const x = -this.ta.scrollLeft, y = -this.ta.scrollTop;
      this.hl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      this.deco.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      this.guides.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      this.gutterInner.style.transform = 'translateY(' + y + 'px)';
    }

    /* Pixelposition (relativ zu .ed-body) eines Textindex */
    coordsOf(pos) {
      const ln = this.lineOf(pos);
      const ls = this.lineStarts[ln];
      const text = this.ta.value;
      const end = text.indexOf('\n', ls);
      const lineText = text.slice(ls, end < 0 ? text.length : end);
      const col = visCol(lineText, pos - ls, this.settings.tabSize);
      return { left: 12 + col * this.metrics.cw - this.ta.scrollLeft, top: 8 + ln * this.lineHeight - this.ta.scrollTop };
    }

    ensureCaretVisible() {
      const ta = this.ta;
      const p = this.coordsOf(ta.selectionEnd);
      const lh = this.lineHeight;
      if (p.top < 0) ta.scrollTop += p.top - 4;
      else if (p.top + lh > ta.clientHeight) ta.scrollTop += p.top + lh - ta.clientHeight + 8;
      if (p.left < 20) ta.scrollLeft += p.left - 40;
      else if (p.left > ta.clientWidth - 24) ta.scrollLeft += p.left - ta.clientWidth + 60;
      this.syncScroll();
    }

    gotoLine(line, col) {
      const text = this.ta.value;
      const lines = this.lineStarts;
      const ln = Math.max(0, Math.min(lines.length - 1, line - 1));
      const lineEnd = ln + 1 < lines.length ? lines[ln + 1] - 1 : text.length;
      const pos = Math.min(lines[ln] + Math.max(0, (col || 1) - 1), lineEnd);
      this.ta.setSelectionRange(pos, pos);
      this.ta.focus({ preventScroll: true });
      const p = this.coordsOf(pos);
      this.ta.scrollTop = Math.max(0, this.ta.scrollTop + p.top - this.ta.clientHeight / 3);
      this.syncScroll();
      this.cursorMoved();
    }

    setErrors(list) {
      this.errors = list || [];
      this.lineCount = -1;
      this.scheduleRender();
    }

    cursorMoved() {
      const pos = this.ta.selectionStart;
      const ln = this.lineOf(pos);
      const col = pos - this.lineStarts[ln] + 1;
      if (this.opts.onCursor) this.opts.onCursor({ line: ln + 1, col: col });
      this.renderGutter();
      this.renderDeco();
    }

    /* ---------- Änderungen ---------- */
    /* Text ersetzen und Cursor setzen; alle eigenen Änderungen laufen hierüber */
    replaceRange(start, end, text, selA, selB, key) {
      const ta = this.ta;
      this.history().breakGroup();
      ta.focus({ preventScroll: true });
      ta.setRangeText(text, start, end, 'end');
      ta.setSelectionRange(selA, selB);
      this.afterChange(key);
      this.ensureCaretVisible();
    }
    history() { return this.file.history; }
    afterChange(key) {
      const ta = this.ta;
      this.updateLineStarts();
      this.file.content = ta.value;
      this.history().push(ta.value, ta.selectionStart, ta.selectionEnd, key);
      if (this.errors.length) { this.errors = []; this.lineCount = -1; if (this.opts.onErrorsCleared) this.opts.onErrorsCleared(this.file); }
      if (this.finds.length) this.refreshFind(true);
      this.scheduleRender();
      if (this.opts.onChange) this.opts.onChange(this.file);
      this.cursorMoved();
    }
    onInput(e) {
      const t = e.inputType || '';
      let key = null;
      if (t === 'insertText' && e.data && /^[A-Za-z0-9_]$/.test(e.data)) key = 'type';
      else if (t === 'deleteContentBackward') key = 'del';
      this.afterChange(key);
      this.ac.update(false);
    }

    undo() {
      const st = this.history().undo();
      if (st) this.applyState(st);
      this.ac.close();
    }
    redo() {
      const st = this.history().redo();
      if (st) this.applyState(st);
      this.ac.close();
    }
    applyState(st) {
      this.ta.value = st.text;
      this.ta.setSelectionRange(st.a, st.b);
      this.updateLineStarts();
      this.file.content = st.text;
      if (this.errors.length) { this.errors = []; this.lineCount = -1; }
      this.scheduleRender();
      this.ensureCaretVisible();
      if (this.opts.onChange) this.opts.onChange(this.file);
      this.cursorMoved();
    }

    unit() { return ' '.repeat(this.settings.tabSize); }

    /* ---------- Einfügen mit automatischer Einrückung ---------- */
    onPaste(e) {
      if (this.settings.autoIndentPaste === false || !e.clipboardData) return;
      let t = e.clipboardData.getData('text/plain');
      if (!t || (t.indexOf('\n') < 0 && t.indexOf('\r') < 0)) return; // einzeilig: normal einfügen
      e.preventDefault();
      t = t.replace(/\r\n?/g, '\n');
      const lang = this.getLang();
      const ta = this.ta, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      const unit = this.unit(), tab = this.settings.tabSize;
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const prefix = v.slice(lineStart, s);
      const atStart = /^[ \t]*$/.test(prefix);
      const eol = v.indexOf('\n', en);
      const lineEnd = eol < 0 ? v.length : eol;
      const tail = v.slice(en, lineEnd);
      const lineIdx = this.lineOf(s);
      const pasted = t.split('\n');
      if (lang === 'python') {
        const fullLine = v.slice(lineStart, lineEnd);
        let target;
        if (!atStart || prefix.length > 0) target = KON.Indent.indentWidth(atStart ? prefix : fullLine, tab);
        else if (fullLine.trim() !== '') target = KON.Indent.indentWidth(fullLine, tab);
        else {
          // leere Zeile: wie die vorherige Zeile (nach einem Doppelpunkt eine Stufe tiefer)
          let p = lineIdx - 1, prev = '';
          const ls = this.lineStarts;
          while (p >= 0) { const l = v.slice(ls[p], p + 1 < ls.length ? ls[p + 1] - 1 : v.length); if (l.trim() !== '') { prev = l; break; } p--; }
          target = KON.Indent.indentWidth(prev, tab) + (/:\s*(#.*)?$/.test(prev) ? tab : 0);
        }
        const out = KON.Indent.pythonPaste(pasted, target, atStart, tab).join('\n');
        const from = atStart ? lineStart : s;
        const caret = from + out.length;
        this.replaceRange(from, en, out, caret, caret, null);
        return;
      }
      // C#: Einrückung aus der Klammerstruktur ableiten
      const rs = atStart ? lineStart : s;
      const combined = v.slice(0, rs) + t + v.slice(en);
      const first = atStart ? lineIdx : lineIdx + 1;
      const last = lineIdx + pasted.length - 1;
      const result = KON.Indent.reindentCSharp(combined, first, last, unit);
      const rl = result.split('\n');
      let endNew = 0;
      for (let i = 0; i <= last; i++) endNew += rl[i].length + 1;
      endNew -= 1;
      const caret = endNew - tail.length;
      this.replaceRange(rs, en + tail.length, result.slice(rs, endNew), caret, caret, null);
    }

    /* Ganzes Dokument (oder die markierten Zeilen) einrücken */
    formatDocument() {
      const lang = this.getLang();
      const ta = this.ta, v = ta.value;
      if (lang === 'python') {
        const out = v.replace(/^\t+/gm, (m) => this.unit().repeat(m.length));
        if (out === v) { if (this.opts.onMessage) this.opts.onMessage('Python: Die Einrückung hat Bedeutung und wird nicht verändert (nur Tabs werden ersetzt).'); return; }
        const p = ta.selectionStart;
        this.replaceRange(0, v.length, out, p, p, null);
        if (this.opts.onMessage) this.opts.onMessage('Tabs durch Leerzeichen ersetzt.');
        return;
      }
      const s = ta.selectionStart, en = ta.selectionEnd;
      const hasSel = s !== en;
      const from = hasSel ? this.lineOf(s) : 0;
      let to = hasSel ? this.lineOf(en > s && v[en - 1] === '\n' ? en - 1 : en) : v.split('\n').length - 1;
      const result = KON.Indent.reindentCSharp(v, from, to, this.unit());
      if (result === v) { if (this.opts.onMessage) this.opts.onMessage('Der Code ist bereits richtig eingerückt.'); return; }
      // Cursor beibehalten: gleiche Zeile, gleiche Spalte relativ zum Text nach der Einrückung
      const cl = this.lineOf(s), ls = this.lineStarts[cl];
      const oldLine = v.slice(ls, v.indexOf('\n', ls) < 0 ? v.length : v.indexOf('\n', ls));
      const oldInd = /^[ \t]*/.exec(oldLine)[0].length;
      const rl = result.split('\n');
      let ns = 0; for (let i = 0; i < cl; i++) ns += rl[i].length + 1;
      const newInd = /^[ \t]*/.exec(rl[cl])[0].length;
      const caret = Math.min(ns + rl[cl].length, ns + newInd + Math.max(0, (s - ls) - oldInd));
      this.replaceRange(0, v.length, result, caret, caret, null);
      if (this.opts.onMessage) this.opts.onMessage(hasSel ? 'Markierte Zeilen eingerückt.' : 'Code eingerückt.');
    }

    /* ---------- Tasten ---------- */
    onKeydown(e) {
      const lang = this.getLang();
      const ctrl = e.ctrlKey || e.metaKey;
      if (this.ac.onKeydown(e)) return;
      const ta = this.ta;
      const key = e.key;

      if (ctrl && !e.altKey) {
        const k = key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
        if (key === ' ' || key === 'Spacebar') { e.preventDefault(); this.ac.update(true); return; }
        if (key === '/' || k === '#') { e.preventDefault(); this.toggleComment(lang); return; }
        if (k === 'f') { e.preventDefault(); this.openFind(false); return; }
        if (k === 'h') { e.preventDefault(); this.openFind(true); return; }
        if (k === 'd') { e.preventDefault(); this.duplicateLine(); return; }
        return; // Strg+S, F5 usw. behandelt main.js
      }
      if (e.altKey && e.shiftKey && key.toLowerCase() === 'f') { e.preventDefault(); this.formatDocument(); return; }
      if (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) { e.preventDefault(); this.moveLines(key === 'ArrowUp' ? -1 : 1); return; }
      if (e.altKey || ctrl) return;

      const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;

      if (key === 'Tab') {
        e.preventDefault();
        this.handleTab(e.shiftKey);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        this.handleEnter(lang);
        return;
      }
      if (key === 'Backspace' && s === en && s > 0) {
        const pb = v[s - 1], pa = v[s];
        if (PAIRS[pb] && PAIRS[pb] === pa) { e.preventDefault(); this.replaceRange(s - 1, s + 1, '', s - 1, s - 1, 'del'); return; }
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const lead = v.slice(ls, s);
        if (lead.length > 0 && /^ +$/.test(lead)) {
          const u = this.settings.tabSize;
          const rem = lead.length % u === 0 ? u : lead.length % u;
          e.preventDefault();
          this.replaceRange(s - rem, s, '', s - rem, s - rem, 'del');
          return;
        }
        return;
      }
      if (key === 'Escape') { if (this.findBar) this.closeFind(); return; }

      if (key.length === 1) {
        // C#: öffnende Klammer eines Blocks kommt in eine eigene Zeile (wie beim Snippet "if")
        if (key === '{' && lang === 'csharp' && s === en && /^[ \t]*(\r?\n|$)/.test(v.slice(en, en + 2) + (v[en] === undefined ? '' : ''))) {
          const ls0 = v.lastIndexOf('\n', s - 1) + 1;
          const before = v.slice(ls0, s);
          const code = before.replace(/\s+$/, '');
          const nextIsEnd = v[en] === undefined || v[en] === '\n';
          const isBlockHead = /\)$/.test(code) || /^\s*(else|try|do|finally)$/.test(code) ||
            /^\s*(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly)\s+)*(?:class|struct|interface|enum|namespace|record)\b[^;={]*$/.test(code);
          if (nextIsEnd && code.trim() !== '' && isBlockHead && !/=>\s*$/.test(code) && !/["'$@]/.test(code.replace(/\/\/.*$/, '').replace(/"[^"]*"/g, ''))) {
            e.preventDefault();
            const indent = /^[ \t]*/.exec(before)[0];
            const u = this.unit();
            const text = '\n' + indent + '{\n' + indent + u + '\n' + indent + '}';
            const start = ls0 + code.length;
            const caret = start + ('\n' + indent + '{\n' + indent + u).length;
            this.replaceRange(start, s, text, caret, caret, null);
            return;
          }
        }
        // Auto-Schließen, Überspringen, Umklammern
        if (s !== en && PAIRS[key]) {
          e.preventDefault();
          const sel = v.slice(s, en);
          this.replaceRange(s, en, key + sel + PAIRS[key], s + 1, en + 1, null);
          return;
        }
        if (s === en && CLOSERS.has(key) && v[s] === key) {
          e.preventDefault();
          ta.setSelectionRange(s + 1, s + 1);
          this.cursorMoved();
          return;
        }
        if (s === en && PAIRS[key]) {
          const quote = key === '"' || key === "'";
          const prev = v[s - 1] || '';
          const next = v[s] || '';
          let allow = next === '' || /[\s)\]};,:.]/.test(next);
          if (quote && /[A-Za-z0-9_]/.test(prev)) {
            // Präfixe wie f"..." / r'...' / $"..." erlauben, sonst Apostroph im Wort
            const pp = v[s - 2] || '';
            const prefixOk = (lang === 'python' && /^[rRbBfFuU]$/.test(prev) && !/[A-Za-z0-9_]/.test(pp));
            if (!prefixOk) allow = false;
          }
          if (quote && lang === 'csharp' && (prev === '$' || prev === '@')) allow = next === '' || /[\s)\]};,:.]/.test(next);
          if (quote && lang === 'csharp' && key === "'" && /[A-Za-z0-9_]/.test(prev)) allow = false;
          if (key === "'" && lang === 'python' && /[A-Za-z0-9_]/.test(prev)) allow = false;
          e.preventDefault();
          if (allow) this.replaceRange(s, s, key + PAIRS[key], s + 1, s + 1, null);
          else this.replaceRange(s, s, key, s + 1, s + 1, null);
          this.ac.close();
          return;
        }
        if (key === '}' && lang === 'csharp' && s === en) {
          // Schließende Klammer auf leerer, eingerückter Zeile: eine Stufe ausrücken
          const ls = v.lastIndexOf('\n', s - 1) + 1;
          const lead = v.slice(ls, s);
          if (/^ +$/.test(lead) && lead.length >= this.settings.tabSize) {
            e.preventDefault();
            const cut = this.settings.tabSize;
            this.replaceRange(s - cut, s, '}', s - cut + 1, s - cut + 1, null);
            return;
          }
        }
      }
    }

    handleTab(back) {
      const ta = this.ta, v = ta.value;
      let s = ta.selectionStart, en = ta.selectionEnd;
      const u = this.settings.tabSize;
      if (s === en && !back) {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const col = visCol(v.slice(ls, s), s - ls, u);
        const n = u - (col % u);
        this.replaceRange(s, s, ' '.repeat(n), s + n, s + n, null);
        return;
      }
      // mehrere Zeilen ein-/ausrücken
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', en > s && v[en - 1] === '\n' ? en - 1 : en);
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const lines = block.split('\n');
      let newLines, deltaFirst = 0, deltaTotal = 0;
      if (back) {
        newLines = lines.map((l, i) => {
          const m = /^( {1,}|\t)/.exec(l);
          if (!m) return l;
          const cut = m[0] === '\t' ? 1 : Math.min(u, m[0].length);
          if (i === 0) deltaFirst = -cut;
          deltaTotal -= cut;
          return l.slice(cut);
        });
      } else {
        newLines = lines.map((l, i) => { if (l.trim() === '' && lines.length > 1) return l; if (i === 0) deltaFirst = u; deltaTotal += u; return ' '.repeat(u) + l; });
      }
      const text = newLines.join('\n');
      const na = Math.max(ls, s + deltaFirst), nb = Math.max(na, en + deltaTotal);
      this.replaceRange(ls, le, text, na, nb, null);
    }

    handleEnter(lang) {
      const ta = this.ta, v = ta.value;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const lineBefore = v.slice(ls, s);
      const indent = /^[ \t]*/.exec(lineBefore)[0];
      const u = this.unit();
      let code = lineBefore;
      if (lang === 'python') code = lineBefore.replace(/\s*#[^"']*$/, '');
      else code = lineBefore.replace(/\s*\/\/[^"']*$/, '');
      const trimmed = code.replace(/\s+$/, '');
      const last = trimmed.slice(-1);
      const prev = v[s - 1], next = v[en];
      let extra = '';
      if (lang === 'python') {
        if (last === ':' || last === '(' || last === '[' || last === '{') extra = u;
      } else {
        if (last === '{') extra = u;
        else if (last === '(' || last === '[') extra = u;
        else if (/^\s*(if|else\s+if|for|foreach|while|using|lock)\b.*\)\s*$/.test(trimmed) || /^\s*else\s*$/.test(trimmed)) extra = u;
      }
      if (s === en && prev && PAIRS[prev] && prev !== '"' && prev !== "'" && PAIRS[prev] === next) {
        const text = '\n' + indent + u + '\n' + indent;
        const caret = s + 1 + indent.length + u.length;
        this.replaceRange(s, en, text, caret, caret, null);
        return;
      }
      // Beim Zeilenumbruch in Python nach 'return'/'pass'/'break' wird nicht ausgerückt
      const text = '\n' + indent + extra;
      const caret = s + text.length;
      this.replaceRange(s, en, text, caret, caret, null);
    }

    toggleComment(lang) {
      const ta = this.ta, v = ta.value;
      const mark = COMMENT[lang];
      const s = ta.selectionStart, en = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', en > s && v[en - 1] === '\n' ? en - 1 : en);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split('\n');
      const nonEmpty = lines.filter((l) => l.trim() !== '');
      const allCommented = nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith(mark));
      let firstDelta = 0, total = 0;
      const out = lines.map((l, i) => {
        if (l.trim() === '') return l;
        if (allCommented) {
          const idx = l.indexOf(mark);
          const cut = l.slice(idx + mark.length, idx + mark.length + 1) === ' ' ? mark.length + 1 : mark.length;
          if (i === 0) firstDelta = -cut;
          total -= cut;
          return l.slice(0, idx) + l.slice(idx + cut);
        }
        const minIndent = Math.min(...nonEmpty.map((x) => /^[ \t]*/.exec(x)[0].length));
        if (i === 0) firstDelta = mark.length + 1;
        total += mark.length + 1;
        return l.slice(0, minIndent) + mark + ' ' + l.slice(minIndent);
      });
      this.replaceRange(ls, le, out.join('\n'), Math.max(ls, s + firstDelta), Math.max(ls, en + total), null);
    }

    duplicateLine() {
      const ta = this.ta, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', en);
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      this.replaceRange(le, le, '\n' + block, s + block.length + 1, en + block.length + 1, null);
    }

    moveLines(dir) {
      const ta = this.ta, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', en);
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      if (dir < 0) {
        if (ls === 0) return;
        const ps = v.lastIndexOf('\n', ls - 2) + 1;
        const prevLine = v.slice(ps, ls - 1);
        this.replaceRange(ps, le, block + '\n' + prevLine, s - prevLine.length - 1, en - prevLine.length - 1, null);
      } else {
        if (le >= v.length) return;
        let ne = v.indexOf('\n', le + 1);
        if (ne < 0) ne = v.length;
        const nextLine = v.slice(le + 1, ne);
        this.replaceRange(ls, ne, nextLine + '\n' + block, s + nextLine.length + 1, en + nextLine.length + 1, null);
      }
    }

    /* ---------- Suchen & Ersetzen ---------- */
    openFind(replace) {
      if (!this.findBar) {
        const bar = document.createElement('div');
        bar.className = 'findbar';
        bar.innerHTML =
          '<div class="fr"><input type="text" class="f-find" placeholder="Suchen" spellcheck="false" aria-label="Suchen">' +
          '<span class="cnt"></span>' +
          '<button type="button" class="fb f-case" title="Groß-/Kleinschreibung beachten">Aa</button>' +
          '<button type="button" class="fb f-prev" title="Vorheriger Treffer (Umschalt+Enter)">↑</button>' +
          '<button type="button" class="fb f-next" title="Nächster Treffer (Enter)">↓</button>' +
          '<button type="button" class="fb f-close" title="Schließen (Esc)">✕</button></div>' +
          '<div class="fr f-rrow"><input type="text" class="f-repl" placeholder="Ersetzen durch" spellcheck="false" aria-label="Ersetzen durch">' +
          '<button type="button" class="fb f-r1" title="Ersetzen">Ersetzen</button>' +
          '<button type="button" class="fb f-rall" title="Alle ersetzen">Alle</button></div>';
        this.body.appendChild(bar);
        this.findBar = bar;
        this.fi = bar.querySelector('.f-find');
        this.fr = bar.querySelector('.f-repl');
        this.fcase = false;
        this.fi.addEventListener('input', () => this.refreshFind(false));
        this.fi.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this.findStep(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); this.focus(); }
        });
        this.fr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); }
          else if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); this.focus(); }
        });
        bar.querySelector('.f-next').onclick = () => this.findStep(1);
        bar.querySelector('.f-prev').onclick = () => this.findStep(-1);
        bar.querySelector('.f-close').onclick = () => { this.closeFind(); this.focus(); };
        bar.querySelector('.f-case').onclick = (ev) => { this.fcase = !this.fcase; ev.currentTarget.classList.toggle('on', this.fcase); this.refreshFind(false); };
        bar.querySelector('.f-r1').onclick = () => this.replaceOne();
        bar.querySelector('.f-rall').onclick = () => this.replaceAll();
        bar.addEventListener('keydown', (e) => e.stopPropagation());
      }
      this.findBar.querySelector('.f-rrow').hidden = !replace;
      const sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
      if (sel && !sel.includes('\n')) this.fi.value = sel;
      this.fi.focus();
      this.fi.select();
      this.refreshFind(false);
    }
    closeFind() {
      if (this.findBar) { this.findBar.remove(); this.findBar = null; }
      this.finds = []; this.findIdx = -1;
      this.scheduleRender();
    }
    refreshFind(keepIdx) {
      if (!this.findBar) return;
      const q = this.fi.value;
      const text = this.ta.value;
      this.finds = [];
      if (q) {
        const hay = this.fcase ? text : text.toLowerCase();
        const needle = this.fcase ? q : q.toLowerCase();
        for (let i = hay.indexOf(needle); i >= 0 && this.finds.length < 20000; i = hay.indexOf(needle, i + Math.max(1, needle.length))) this.finds.push({ start: i, end: i + needle.length });
      }
      if (!keepIdx) {
        const pos = this.ta.selectionStart;
        let idx = this.finds.findIndex((f) => f.start >= pos);
        if (idx < 0) idx = this.finds.length ? 0 : -1;
        this.findIdx = idx;
      } else if (this.findIdx >= this.finds.length) this.findIdx = this.finds.length - 1;
      this.updateFindCount();
      if (this.findIdx >= 0 && !keepIdx) this.revealFind();
      this.scheduleRender();
    }
    updateFindCount() {
      const c = this.findBar.querySelector('.cnt');
      c.textContent = this.finds.length ? (this.findIdx + 1) + ' / ' + this.finds.length : (this.fi.value ? 'kein Treffer' : '');
    }
    findStep(d) {
      if (!this.finds.length) return;
      this.findIdx = (this.findIdx + d + this.finds.length) % this.finds.length;
      this.updateFindCount();
      this.revealFind();
      this.scheduleRender();
    }
    revealFind() {
      const f = this.finds[this.findIdx];
      if (!f) return;
      this.ta.setSelectionRange(f.start, f.end);
      const p = this.coordsOf(f.start);
      if (p.top < 0 || p.top + this.lineHeight > this.ta.clientHeight) this.ta.scrollTop = Math.max(0, this.ta.scrollTop + p.top - this.ta.clientHeight / 3);
      if (p.left < 0 || p.left > this.ta.clientWidth - 40) this.ta.scrollLeft = Math.max(0, this.ta.scrollLeft + p.left - 60);
      this.syncScroll();
      this.cursorMoved();
    }
    replaceOne() {
      const f = this.finds[this.findIdx];
      if (!f) return;
      const r = this.fr.value;
      const at = f.start;
      this.ta.setRangeText(r, f.start, f.end, 'end');
      this.ta.setSelectionRange(at + r.length, at + r.length);
      this.afterChange(null);
      this.history().breakGroup();
      this.refreshFind(false);
    }
    replaceAll() {
      if (!this.finds.length) return;
      const r = this.fr.value;
      const text = this.ta.value;
      let out = '', last = 0;
      for (const f of this.finds) { out += text.slice(last, f.start) + r; last = f.end; }
      out += text.slice(last);
      this.ta.value = out;
      this.afterChange(null);
      this.history().breakGroup();
      this.refreshFind(false);
    }
  }

  KON.CodeEditor = CodeEditor;
})(window);
