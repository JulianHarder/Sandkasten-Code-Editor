/* Trennbalken zwischen Editor und Konsole sowie zwischen zwei Editor-Fenstern */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  /* Zieht einen Balken; vertical=true: Konsole liegt unten (Höhe ändern) */
  KON.makeSplitter = function (handle, work, consoleEl, settings, onChange) {
    let start = 0, startSize = 0, vertical = false;
    function onMove(e) {
      const pt = e.touches ? e.touches[0] : e;
      const rect = work.getBoundingClientRect();
      if (vertical) {
        const size = startSize - (pt.clientY - start);
        const max = rect.height - 140;
        settings.conSize = Math.max(60, Math.min(max, size));
      } else {
        const size = startSize - (pt.clientX - start);
        const max = rect.width - 260;
        settings.conSize = Math.max(160, Math.min(max, size));
      }
      apply();
      e.preventDefault();
    }
    function onUp() {
      handle.classList.remove('drag');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.style.userSelect = '';
      if (onChange) onChange();
    }
    function onDown(e) {
      vertical = work.classList.contains('vertical');
      const pt = e.touches ? e.touches[0] : e;
      start = vertical ? pt.clientY : pt.clientX;
      const r = consoleEl.getBoundingClientRect();
      startSize = vertical ? r.height : r.width;
      handle.classList.add('drag');
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      e.preventDefault();
    }
    function apply() {
      const vert = work.classList.contains('vertical');
      if (settings.conSize) {
        consoleEl.style.flexBasis = settings.conSize + 'px';
      } else consoleEl.style.flexBasis = '';
      void vert;
    }
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    handle.addEventListener('dblclick', () => { settings.conSize = 0; apply(); if (onChange) onChange(); });
    apply();
    return { apply: apply };
  };

  /* Balken zwischen den beiden Editor-Fenstern (Prozentwert für das linke) */
  KON.makePaneSplitter = function (handle, container, pane1, settings, onChange) {
    function apply() { pane1.style.flex = settings.split ? '0 0 ' + (settings.paneSplit || 50) + '%' : '1 1 0'; }
    handle.addEventListener('mousedown', (e) => {
      const rect = container.getBoundingClientRect();
      function move(ev) {
        settings.paneSplit = Math.max(15, Math.min(85, ((ev.clientX - rect.left) / rect.width) * 100));
        apply();
      }
      function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; if (onChange) onChange(); }
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    apply();
    return { apply: apply };
  };
})(window);
