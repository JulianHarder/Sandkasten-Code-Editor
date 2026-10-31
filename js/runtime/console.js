/* Konsole: Ausgabe, Eingabefeld für input()/ReadLine(), klickbare Fehler */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const MAX_CHARS = 1500000;

  class ConsolePane {
    constructor(bodyEl, outEl, onJump) {
      this.body = bodyEl;
      this.out = outEl;
      this.onJump = onJump;
      this.buf = [];
      this.queued = false;
      this.chars = 0;
      this.truncated = false;
      this.cur = null;
      this.inputEl = null;
      this.resolveInput = null;
      this.clear();
      this.out.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-file]');
        if (a) { e.preventDefault(); this.onJump({ file: a.dataset.file, line: parseInt(a.dataset.line, 10), col: parseInt(a.dataset.col, 10) || 1, pid: a.dataset.pid }); }
      });
      this.body.addEventListener('mousedown', (e) => {
        // Klick in die Konsole fokussiert das Eingabefeld, sofern eines aktiv ist (Textauswahl bleibt möglich)
        if (this.inputEl && !window.getSelection().toString()) setTimeout(() => { if (this.inputEl && !window.getSelection().toString()) this.inputEl.focus(); }, 0);
      });
    }

    clear() {
      this.cancelInput();
      this.out.textContent = '';
      this.buf = [];
      this.chars = 0;
      this.truncated = false;
      this.cur = document.createTextNode('');
      this.out.appendChild(this.cur);
    }

    /* normaler Text */
    write(text) {
      if (text === '' || text === undefined) return;
      if (this.truncated) return;
      this.chars += text.length;
      if (this.chars > MAX_CHARS) {
        this.buf.push({ t: 'info', text: '\n… Ausgabe abgeschnitten (zu viel Text). Das Programm läuft weiter.\n', cls: 'bad' });
        this.truncated = true;
      } else this.buf.push({ t: 'text', text: text });
      this.schedule();
    }
    /* Fehlertext, optional klickbar (loc = {file, line, col}) */
    writeErr(text, loc) {
      if (this.truncated) return;
      this.buf.push({ t: 'err', text: text, loc: loc });
      this.schedule();
    }
    info(text, cls) {
      this.buf.push({ t: 'info', text: text, cls: cls });
      this.schedule();
    }
    schedule() {
      if (this.queued) return;
      this.queued = true;
      const go = () => { if (!this.queued) return; this.queued = false; this.flush(); };
      requestAnimationFrame(go);
      setTimeout(go, 40);
    }
    flush() {
      if (!this.buf.length) return;
      const atBottom = this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 40;
      const items = this.buf; this.buf = [];
      let pendingText = '';
      const flushText = () => { if (pendingText) { this.cur.appendData(pendingText); pendingText = ''; } };
      for (const it of items) {
        if (it.t === 'text') { pendingText += it.text; continue; }
        flushText();
        let el;
        if (it.t === 'err' && it.loc) {
          el = document.createElement('a');
          el.href = '#';
          el.className = 'con-err';
          el.dataset.file = it.loc.file; el.dataset.line = it.loc.line; el.dataset.col = it.loc.col || 1;
          if (it.loc.pid) el.dataset.pid = it.loc.pid;
          el.title = 'Zur Zeile springen';
        } else {
          el = document.createElement('span');
          el.className = it.t === 'err' ? 'con-err' : 'con-info' + (it.cls ? ' ' + it.cls : '');
        }
        el.textContent = it.text;
        if (this.inputEl) this.out.insertBefore(el, this.inputWrap); else this.out.appendChild(el);
        this.cur = document.createTextNode('');
        if (this.inputEl) this.out.insertBefore(this.cur, this.inputWrap); else this.out.appendChild(this.cur);
      }
      flushText();
      if (atBottom) this.body.scrollTop = this.body.scrollHeight;
    }

    /* Eingabe: Prompt wird bereits vom Programm ausgegeben, hier erscheint nur das Eingabefeld */
    readLine(prompt) {
      if (prompt) this.write(prompt);
      this.flush();
      return new Promise((resolve) => {
        const wrap = document.createElement('span');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'con-input';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'Eingabe für das Programm');
        wrap.appendChild(input);
        this.out.appendChild(wrap);
        this.inputEl = input;
        this.inputWrap = wrap;
        this.resolveInput = resolve;
        const fit = () => { input.style.width = Math.max(6, input.value.length + 2) + 'ch'; };
        fit();
        input.addEventListener('input', fit);
        // Pfeil hoch/runter blättert durch frühere Eingaben (bleibt über mehrere Programmläufe erhalten)
        const hist = this.hist = this.hist || [];
        let hi = hist.length, draft = '';
        input.addEventListener('keydown', (e) => {
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && hist.length) {
            e.preventDefault();
            if (hi === hist.length) draft = input.value;
            hi = Math.max(0, Math.min(hist.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
            input.value = hi === hist.length ? draft : hist[hi];
            fit();
            input.setSelectionRange(input.value.length, input.value.length);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = input.value;
            if (v && hist[hist.length - 1] !== v) { hist.push(v); if (hist.length > 50) hist.shift(); }
            const echo = document.createElement('span');
            echo.className = 'con-echo';
            echo.textContent = v + '\n';
            this.out.replaceChild(echo, wrap);
            this.inputEl = null; this.inputWrap = null;
            this.cur = document.createTextNode('');
            this.out.appendChild(this.cur);
            const r = this.resolveInput; this.resolveInput = null;
            if (r) r(v);
            this.body.scrollTop = this.body.scrollHeight;
          }
        });
        input.focus();
        this.body.scrollTop = this.body.scrollHeight;
      });
    }
    cancelInput() {
      if (this.inputEl) {
        const v = this.inputEl.value;
        if (this.inputWrap && this.inputWrap.parentNode) {
          const echo = document.createElement('span');
          echo.className = 'con-echo';
          echo.textContent = v;
          this.out.replaceChild(echo, this.inputWrap);
        }
        this.inputEl = null; this.inputWrap = null;
        this.cur = document.createTextNode('');
        this.out.appendChild(this.cur);
      }
      if (this.resolveInput) { const r = this.resolveInput; this.resolveInput = null; r(null); }
    }
  }

  KON.ConsolePane = ConsolePane;
})(window);
