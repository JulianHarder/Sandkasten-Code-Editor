/* Eigener Verlauf (Rückgängig / Wiederholen) pro Datei.
 * Zusammenhängendes Tippen wird zu einem Schritt zusammengefasst. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  class History {
    constructor(text) {
      this.states = [{ text: text || '', a: 0, b: 0 }];
      this.i = 0;
      this.lastKey = null;
      this.lastTime = 0;
    }
    get current() { return this.states[this.i]; }
    canUndo() { return this.i > 0; }
    canRedo() { return this.i < this.states.length - 1; }

    /* neuen Stand ablegen. key: Gruppenschlüssel ('type', 'del') oder null für eigenen Schritt */
    push(text, a, b, key) {
      const cur = this.states[this.i];
      if (cur.text === text) { cur.a = a; cur.b = b; return; }
      const now = Date.now();
      this.states.length = this.i + 1; // Redo-Zweig verwerfen
      if (key && key === this.lastKey && now - this.lastTime < 1000 && this.i > 0) {
        this.states[this.i] = { text: text, a: a, b: b };
      } else {
        this.states.push({ text: text, a: a, b: b });
        this.i++;
        if (this.states.length > 400) { this.states.shift(); this.i--; }
      }
      this.lastKey = key || null;
      this.lastTime = now;
    }
    /* Gruppe beenden, damit der nächste Schritt neu beginnt */
    breakGroup() { this.lastKey = null; }

    undo() { if (!this.canUndo()) return null; this.i--; this.lastKey = null; return this.states[this.i]; }
    redo() { if (!this.canRedo()) return null; this.i++; this.lastKey = null; return this.states[this.i]; }
    reset(text) { this.states = [{ text: text, a: 0, b: 0 }]; this.i = 0; this.lastKey = null; }
  }
  KON.History = History;
})(window);
