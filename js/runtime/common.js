/* Gemeinsame Bausteine der Interpreter: Fehlerklasse und Runner (Schritt-für-Schritt-Ausführung). */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  /* Fehler mit Ort. phase: 'compile' | 'runtime' */
  class LangError extends Error {
    constructor(o) {
      super(o.message);
      Object.assign(this, o);
    }
  }
  KON.LangError = LangError;

  /* Signale, die ein Interpreter per yield an den Runner schickt */
  const TICK = { t: 'tick' };
  KON.TICK = TICK;
  KON.inputRequest = function (prompt) { return { t: 'input', prompt: prompt || '' }; };
  KON.callRequest = function (gen) { return { t: 'call', gen: gen }; };
  KON.sleepRequest = function (ms) { return { t: 'sleep', ms: ms }; };

  /*
   * Runner: treibt einen Generator in kleinen Häppchen an.
   * So bleibt die Seite bedienbar, Stop funktioniert jederzeit
   * und Eingaben (input / ReadLine) können warten.
   */
  class Runner {
    constructor(io) {
      this.io = io;
      this.gen = null;
      this.stack = [];
      this.stopped = false;
      this.running = false;
      this.timer = null;
      this.onEnd = null;
    }

    start(gen, onEnd) {
      this.gen = gen;
      this.stack = [gen];
      this.calls = 0;
      this.waited = 0;
      this.onEnd = onEnd;
      this.stopped = false;
      this.running = true;
      this.startedAt = performance.now();
      this._loop();
    }

    stop() {
      if (!this.running) return;
      this.stopped = true;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (this.io.cancelInput) this.io.cancelInput();
      this._end(null, true);
    }

    _end(code, wasStopped) {
      if (!this.running) return;
      this.running = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      const ms = Math.max(0, performance.now() - this.startedAt - (this.waited || 0)); // Wartezeit auf Eingaben zählt nicht mit
      // Den Generator nur verwerfen (kein return()), damit keine finally-Blöcke des Programms nachlaufen.
      this.gen = null;
      this.stack = [];
      if (this.onEnd) this.onEnd({ code: code, stopped: !!wasStopped, ms: ms });
    }

    /*
     * Aufrufstapel auf dem Heap: Ruft ein Programm eine Funktion auf, schickt der Interpreter
     * {t:'call', gen} – der Runner legt den Generator auf seinen Stapel. So ist die
     * Rekursionstiefe nicht durch den JS-Stack begrenzt.
     */
    _loop(send, thrown) {
      if (!this.running) return;
      const t0 = performance.now();
      const stack = this.stack;
      for (;;) {
        const top = stack[stack.length - 1];
        let r;
        try {
          r = thrown !== undefined ? top.throw(thrown) : top.next(send);
        } catch (e) {
          stack.pop();
          if (stack.length) { thrown = e; send = undefined; continue; }
          // Der Interpreter fängt seine Fehler selbst; hier landen nur interne Fehler.
          this.io.writeErr('Interner Fehler im Interpreter: ' + (e && e.message ? e.message : e) + '\n');
          if (G.console && e && e.stack) G.console.error(e);
          this._end(1, false);
          return;
        }
        thrown = undefined;
        send = undefined;
        if (r.done) {
          stack.pop();
          if (!stack.length) { this._end(typeof r.value === 'number' ? r.value : 0, false); return; }
          send = r.value;
          continue;
        }
        const v = r.value;
        if (v === TICK) {
          if (performance.now() - t0 > 12) {
            this.timer = setTimeout(() => { this.timer = null; this._loop(); }, 0);
            return;
          }
          continue;
        }
        if (v && v.t === 'call') {
          stack.push(v.gen);
          // Auch reine Rekursion (ohne Schleifen) muss dem Browser Luft lassen, damit Stop funktioniert
          if ((++this.calls & 31) === 0 && performance.now() - t0 > 12) {
            this.timer = setTimeout(() => { this.timer = null; this._loop(); }, 0);
            return;
          }
          continue;
        }
        if (v && v.t === 'input') {
          const t1 = performance.now();
          this.io.readLine(v.prompt).then((line) => {
            if (!this.running) return;
            this.waited += performance.now() - t1;
            this._loop(line);
          });
          return;
        }
        if (v && v.t === 'sleep') {
          this.timer = setTimeout(() => { this.timer = null; this._loop(); }, v.ms);
          return;
        }
      }
    }
  }
  KON.Runner = Runner;

  /* Zeilen eines Textes ermitteln (für Fehleranzeige) */
  KON.getLine = function (files, name, line) {
    const f = files.find((x) => x.name === name);
    if (!f) return '';
    return (f.content.split('\n')[line - 1] || '').replace(/\r$/, '');
  };
})(typeof window !== 'undefined' ? window : globalThis);
