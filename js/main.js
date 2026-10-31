/* Start der Anwendung: verbindet Editor, Dateien, Konsole und Interpreter. */
(function (G) {
  'use strict';
  const KON = G.KON;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = { fontSize: 14, tabSize: 4, suggest: true, orientation: 'horizontal', conSize: 0, conCollapsed: false, split: false, paneSplit: 50, culture: 'de', sidebarHidden: false, autoIndentPaste: true, warnOnClose: true, introVersion: 0 };
  const LANG_LABEL = { csharp: 'C# · .NET 10 / C# 14', python: 'Python 3.14' };

  const state = {
    settings: Object.assign({}, DEFAULTS),
    lang: 'csharp',      // Sprache des aktiven Projekts
    projects: [],        // alle offenen Projekte, in Anzeigereihenfolge
    activeId: null,
    runner: null,
    runProject: null,    // Projekt, das gerade läuft
    running: false,
    lastFocus: 1
  };

  /* ---------- Zustand laden ---------- */
  function loadState() {
    const saved = KON.Storage.loadState();
    if (saved) Object.assign(state.settings, saved.settings || {});
    const r = KON.restoreProjects(saved);
    state.projects = r.projects;
    state.activeId = r.activeId;
    state.lang = project().lang;
  }
  const byId = (id) => state.projects.find((p) => p.id === id) || null;
  const project = () => byId(state.activeId) || state.projects[0];
  const fileLang = (file) => (file && KON.langOfName(file.name)) || state.lang;
  const uniqueProjectName = (name, except) => KON.uniqueProjectName(state.projects, name, except);

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  function saveNow() {
    if (state.ed1) state.ed1.unbindState && state.ed1.unbindState();
    KON.Storage.saveState({ settings: state.settings, active: state.activeId, projects: state.projects.map((p) => p.toJSON()) });
  }

  /* ---------- Hilfen: Meldungen & Dialoge ---------- */
  let msgTimer = null;
  function flash(text, ms) {
    $('stMsg').textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('stMsg').textContent = ''; }, ms || 4000);
  }

  function ask(title, text, value, okLabel) {
    return new Promise((resolve) => {
      const m = $('askModal'), inp = $('askInput');
      $('askTitle').textContent = title;
      $('askText').textContent = text || '';
      $('askText').hidden = !text;
      inp.hidden = value === null || value === undefined;
      inp.value = value || '';
      $('askOk').textContent = okLabel || 'OK';
      m.hidden = false;
      if (!inp.hidden) { inp.focus(); inp.select(); } else $('askOk').focus();
      const done = (v) => { m.hidden = true; cleanup(); resolve(v); };
      const onOk = () => done(inp.hidden ? true : inp.value.trim());
      const onCancel = () => done(null);
      const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } else if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
      function cleanup() { $('askOk').removeEventListener('click', onOk); $('askCancel').removeEventListener('click', onCancel); m.removeEventListener('keydown', onKey); }
      $('askOk').addEventListener('click', onOk);
      $('askCancel').addEventListener('click', onCancel);
      m.addEventListener('keydown', onKey);
    });
  }

  /* ---------- Einführung: kurze Tour über die echten Bedienelemente (nur beim ersten Öffnen) ---------- */
  const INTRO_VERSION = 3;   // erhöhen, damit die Tour einmalig noch einmal erscheint
  const TOUR = [
    { title: 'Willkommen im Sandkasten', text: 'C# und Python direkt im Browser schreiben und starten. Eine kurze Tour zeigt dir das Wichtigste.' },
    { sel: '#langSwitch', title: 'Sprache', text: '<b>C#</b> oder <b>Python</b> wählen. Jede Sprache hat eigene Projekte.' },
    { sel: '#sidebar', title: 'Projekte', text: 'Hier stehen deine Projekte. Mit <b>+</b> legst du neue an.' },
    { sel: '#menuExamples [data-menu-toggle]', title: 'Beispiele', text: 'Fertige Programme zum Ausprobieren.' },
    { sel: '#btnRun', title: 'Starten', text: '<b>Run</b> oder <kbd>F5</kbd> startet, <b>Stop</b> bricht ab.' },
    { sel: '#console', title: 'Konsole', text: 'Hier erscheint die Ausgabe. Eingaben tippst du auch hier.' },
    { sel: 'label.toggle', title: 'Vorschläge', text: 'Vorschläge beim Tippen: <kbd>Enter</kbd> übernimmt, <kbd>Esc</kbd> schließt. Hier schaltest du sie aus.' },
    { sel: '#settingsPop', open: 'settings', title: 'Einstellungen', text: 'Schriftgröße, Zahlenformat und mehr.' },
    { sel: '#menuFile [data-menu-toggle]', also: '#menuFile [data-menu-pop]', open: 'menuFile', title: 'Speichern', text: '<kbd>Strg+S</kbd> speichert dein Projekt als Ordner. Nur im Browser ist es nicht sicher. <b>●</b> heißt: noch nicht gespeichert.', note: 'Die Tour findest du wieder unter ⚙ Einstellungen.' }
  ];
  let tourStep = 0;

  function tourReset() {
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    $('settingsPop').hidden = true;
  }
  function placeTour() {
    const st = TOUR[tourStep], spot = $('tourSpot'), modal = $('introModal');
    const target = st.sel && document.querySelector(st.sel);
    let r = target && target.getBoundingClientRect();
    if (r && (r.width < 4 || r.height < 4)) r = null;   // z. B. Seitenleiste eingeklappt oder zu schmales Fenster
    if (r && st.also) {
      const o = document.querySelector(st.also).getBoundingClientRect();
      const l = Math.min(r.left, o.left), t = Math.min(r.top, o.top);
      r = { left: l, top: t, right: Math.max(r.right, o.right), bottom: Math.max(r.bottom, o.bottom) };
      r.width = r.right - l; r.height = r.bottom - t;
    }
    modal.classList.toggle('center', !r);
    if (!r) return;
    const pad = 5;
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
  }
  function showTourStep(i) {
    tourStep = Math.max(0, Math.min(TOUR.length - 1, i));
    const st = TOUR[tourStep], last = tourStep === TOUR.length - 1;
    tourReset();
    if (st.open === 'settings') $('settingsPop').hidden = false;
    else if (st.open) document.querySelector('#' + st.open + ' [data-menu-toggle]').click();
    $('tourTitle').textContent = st.title;
    $('tourText').innerHTML = st.text;
    $('tourNote').innerHTML = st.note || '';
    $('tourNote').hidden = !st.note;
    $('tourCount').textContent = (tourStep + 1) + ' / ' + TOUR.length;
    $('introBack').hidden = tourStep === 0;
    $('introSkip').hidden = last;
    $('introNext').textContent = last ? 'Los geht’s' : 'Weiter';
    placeTour();
    $('introNext').focus();
  }
  function openIntro() {
    $('introModal').hidden = false;
    showTourStep(0);
    // Schon beim Öffnen als gesehen merken: Wer mittendrin den Tab schließt, bekommt sie nicht noch einmal.
    if ((state.settings.introVersion || 0) < INTRO_VERSION) { state.settings.introVersion = INTRO_VERSION; scheduleSave(); }
  }
  function closeIntro() { tourReset(); $('introModal').hidden = true; state.ed1.focus(); }
  function wireIntro() {
    const next = () => { if (tourStep >= TOUR.length - 1) closeIntro(); else showTourStep(tourStep + 1); };
    $('introNext').addEventListener('click', next);
    $('introBack').addEventListener('click', () => showTourStep(tourStep - 1));
    $('introSkip').addEventListener('click', closeIntro);
    $('btnIntro').addEventListener('click', () => { $('settingsPop').hidden = true; openIntro(); });
    // Klicks in der Tour dürfen die Menüs und die Einstellungen dahinter nicht schließen
    $('introModal').addEventListener('click', (e) => e.stopPropagation());
    $('introModal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeIntro(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (tourStep < TOUR.length - 1) showTourStep(tourStep + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showTourStep(tourStep - 1); }
    });
    window.addEventListener('resize', () => { if (!$('introModal').hidden) placeTour(); });
  }

  /* ---------- Editor-Fenster ---------- */
  function edOpts(which) {
    return {
      settings: state.settings,
      getLang: (file) => fileLang(file),
      getProjectText: () => project().files.map((f) => f.content).join('\n'),
      onChange: (file) => {
        project().dirty.add(file.name);
        const other = which === 1 ? state.ed2 : state.ed1;
        if (other && other.file === file) other.refresh();
        renderTabs(); renderFileList(); updateUndoButtons(); scheduleSave();
      },
      onErrorsCleared: (file) => { delete project().errors[file.name]; },
      onMessage: (t) => flash(t),
      onCursor: (p) => { $('stPos').textContent = 'Zeile ' + p.line + ', Spalte ' + p.col; }
    };
  }

  function initEditors() {
    state.ed1 = new KON.CodeEditor($('edHost1'), edOpts(1));
    state.ed1.ta.addEventListener('focus', () => { state.lastFocus = 1; updateUndoButtons(); });
    // Platzhalter, wenn keine Datei geöffnet ist
    const empty = document.createElement('div');
    empty.className = 'ed-empty';
    empty.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6e7681;text-align:center;padding:20px;';
    empty.innerHTML = '<div>Keine Datei geöffnet.<br>Wähle links eine Datei oder lege mit <b>Strg+N</b> eine neue an.</div>';
    empty.hidden = true;
    $('edHost1').appendChild(empty);
    state.empty1 = empty;
  }
  function ensureEd2() {
    if (state.ed2) return;
    state.ed2 = new KON.CodeEditor($('edHost2'), edOpts(2));
    state.ed2.ta.addEventListener('focus', () => { state.lastFocus = 2; updateUndoButtons(); });
  }
  const activeEditor = () => (state.lastFocus === 2 && state.settings.split && state.ed2 ? state.ed2 : state.ed1);

  function bindPane1() {
    const p = project();
    const f = p.active ? p.get(p.active) : null;
    if (state.ed1.file && state.ed1.file !== f) state.ed1.unbind();
    state.empty1.hidden = !!f;
    state.ed1.root.style.visibility = f ? '' : 'hidden';
    if (f) {
      if (state.ed1.file !== f) state.ed1.bindFile(f); else state.ed1.refresh();
      state.ed1.setErrors(p.errors[f.name] || []);
    } else state.ed1.file = null;
    $('stFile').textContent = f ? p.name + ' › ' + f.name : p.name;
  }
  function bindPane2() {
    if (!state.settings.split) return;
    ensureEd2();
    const p = project();
    let f = p.pane2 ? p.get(p.pane2) : null;
    if (!f) { f = p.get(p.active) || p.files[0] || null; p.pane2 = f ? f.name : null; }
    if (state.ed2.file && state.ed2.file !== f) state.ed2.unbind();
    if (f) { if (state.ed2.file !== f) state.ed2.bindFile(f); else state.ed2.refresh(); state.ed2.setErrors(p.errors[f.name] || []); }
    else state.ed2.file = null;
    const sel = $('selPane2');
    sel.innerHTML = p.files.map((x) => '<option value="' + escAttr(x.name) + '"' + (f && x.name === f.name ? ' selected' : '') + '>' + escHtml(x.name) + '</option>').join('');
  }

  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');

  /* ---------- Tabs & Dateiliste ---------- */
  function renderTabs() {
    const p = project();
    const box = $('tabs1');
    box.innerHTML = p.open.map((n) => {
      const dirty = p.dirty.has(n) ? '<span class="dirty" title="Ungespeicherte Änderungen">●</span>' : '';
      return '<div class="tab' + (n === p.active ? ' active' : '') + '" role="tab" tabindex="0" draggable="true" data-name="' + escAttr(n) + '" aria-selected="' + (n === p.active) + '">' +
        '<span>' + escHtml(n) + '</span>' + dirty + '<span class="x" data-close="' + escAttr(n) + '" title="Schließen"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></span></div>';
    }).join('');
  }

  const CHEV = '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5"/></svg>';
  const ICO_PLUS = '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>';
  const ICO_X = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

  function renderFileList() {
    $('fileList').innerHTML = state.projects.filter((p) => p.lang === state.lang).map((p) => {
      const isActive = p.id === state.activeId;
      const lang = p.lang === 'python' ? 'py' : 'cs';
      const dot = p.dirty.size ? '<span class="dot" title="Ungespeicherte Änderungen">●</span>' : '';
      const runDot = state.running && state.runProject === p ? '<span class="running" title="Programm läuft">●</span>' : '';
      const head = '<div class="proj-head" tabindex="0" data-pid="' + escAttr(p.id) + '" title="' + escAttr(p.name) + (isActive ? '' : ' – Klick zum Wechseln') + '">' +
        '<span class="chev" data-toggle title="' + (p.collapsed ? 'Ausklappen' : 'Einklappen') + '">' + CHEV + '</span>' +
        '<span class="fi ' + lang + '">' + (lang === 'py' ? 'py' : 'C#') + '</span><span class="pn">' + escHtml(p.name) + '</span>' + runDot + dot +
        '<span class="acts"><button type="button" class="ibtn small" data-newfile title="Neue Datei in diesem Projekt">' + ICO_PLUS + '</button>' +
        '<button type="button" class="ibtn small" data-closeproj title="Projekt schließen">' + ICO_X + '</button></span></div>';
      let files = '';
      if (!p.collapsed) {
        files = '<div class="proj-files" role="list">' + (p.files.length ? p.files.map((f) => {
          const ext = KON.extOf(f.name) === '.py' ? 'py' : 'cs';
          const start = p.start === f.name ? '<span class="start" title="Startdatei">▶</span>' : '';
          const fdot = p.dirty.has(f.name) ? '<span class="dot" title="Ungespeichert">●</span>' : '';
          return '<div class="file' + (isActive && f.name === p.active ? ' active' : '') + '" role="listitem" tabindex="0" data-name="' + escAttr(f.name) + '">' +
            '<span class="fi ' + ext + '">' + (ext === 'py' ? 'py' : 'C#') + '</span><span class="fn" title="' + escAttr(f.name) + '">' + escHtml(f.name) + '</span>' + start + fdot + '</div>';
        }).join('') : '<div class="proj-empty">Keine Dateien</div>') + '</div>';
      }
      return '<div class="proj' + (isActive ? ' active' : '') + (p.collapsed ? '' : ' open') + '" data-pid="' + escAttr(p.id) + '">' + head + files + '</div>';
    }).join('');
  }

  function renderAll() {
    $('langSwitch').querySelectorAll('button').forEach((b) => { const on = b.dataset.lang === state.lang; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    state.lang = project().lang;
    $('stLang').textContent = LANG_LABEL[state.lang];
    $('sideTitle').textContent = (state.lang === 'csharp' ? 'C#' : 'Python') + '-Projekte';
    $('zipAllLabel').textContent = 'Alle ' + (state.lang === 'csharp' ? 'C#' : 'Python') + '-Projekte als ZIP';
    renderTabs(); renderFileList(); bindPane1(); bindPane2(); updateUndoButtons(); buildExamplesMenu();
    $('fileInput').accept = state.lang === 'python' ? '.py,.txt' : '.cs,.txt';
  }

  function updateUndoButtons() {
    const ed = activeEditor();
    const h = ed && ed.file ? ed.file.history : null;
    $('btnUndo').disabled = !h || !h.canUndo();
    $('btnRedo').disabled = !h || !h.canRedo();
  }

  /* ---------- Dateien ---------- */
  function openFile(name, focus) {
    const p = project();
    if (!p.get(name)) return;
    p.openTab(name);
    renderTabs(); renderFileList(); bindPane1();
    if (focus !== false) state.ed1.focus();
    scheduleSave();
  }
  function closeTab(name) {
    project().closeTab(name);
    renderTabs(); renderFileList(); bindPane1(); scheduleSave();
  }

  function defaultNewName() {
    const p = project();
    const ext = KON.EXT[state.lang];
    return p.uniqueName((state.lang === 'csharp' ? 'Klasse1' : 'modul1') + ext);
  }
  function fileTemplate(name) {
    const base = name.replace(/\.[^.]+$/, '').split('/').pop().replace(/[^A-Za-z0-9_]/g, '_') || 'Klasse1';
    if (state.lang === 'csharp') return 'using System;\n\nclass ' + base + '\n{\n    \n}\n';
    return '';
  }
  async function newFile() {
    const p = project();
    const ext = KON.EXT[state.lang];
    let name = await ask('Neue Datei', 'Name der neuen Datei (Endung ' + ext + '):', defaultNewName(), 'Anlegen');
    if (!name) return;
    name = name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!/\.[A-Za-z0-9]+$/.test(name)) name += ext;
    if (KON.langOfName(name) !== state.lang && KON.extOf(name) !== '.txt') { flash('In einem ' + (state.lang === 'csharp' ? 'C#' : 'Python') + '-Projekt sind nur ' + ext + '-Dateien vorgesehen.'); return; }
    if (p.get(name)) { flash('Die Datei "' + name + '" gibt es schon.'); openFile(name); return; }
    p.add(name, fileTemplate(name), true);
    openFile(name);
  }
  async function renameFile(name, p) {
    p = p || project();
    let nn = await ask('Datei umbenennen', 'Neuer Name für "' + name + '":', name, 'Umbenennen');
    if (!nn || nn === name) return;
    if (!/\.[A-Za-z0-9]+$/.test(nn)) nn += KON.extOf(name);
    if (p.get(nn)) { flash('Die Datei "' + nn + '" gibt es schon.'); return; }
    p.rename(name, nn);
    if (p.errors[name]) { p.errors[nn] = p.errors[name]; delete p.errors[name]; }
    renderAll(); scheduleSave();
  }
  async function deleteFile(name, p) {
    p = p || project();
    const ok = await ask('Datei löschen', '"' + name + '" wirklich löschen? Das lässt sich nicht rückgängig machen.', null, 'Löschen');
    if (!ok) return;
    p.remove(name);
    renderAll(); scheduleSave();
  }
  function setStart(name, p) { p = p || project(); p.start = name; renderFileList(); scheduleSave(); flash('Startdatei: ' + name); }

  /* ---------- Projekte ---------- */
  function activateProject(id) {
    const p = byId(id);
    if (!p || p.id === state.activeId) return;
    if (state.ed1.file) state.ed1.unbind();
    if (state.ed2 && state.ed2.file) state.ed2.unbind();
    state.activeId = p.id;
    p.used = Date.now();
    state.lang = p.lang;
    renderAll();
    scheduleSave();
  }
  /* Zuletzt benutztes Projekt einer Sprache; gibt es keines, wird eins angelegt */
  function projectForLang(lang) {
    const cur = project();
    if (cur.lang === lang) return cur;
    const cand = state.projects.filter((p) => p.lang === lang).sort((a, b) => b.used - a.used)[0];
    if (cand) return cand;
    const np = KON.newProject(lang, uniqueProjectName('MeinProjekt'));
    state.projects.push(np);
    return np;
  }
  function setLang(lang) {
    if (lang === state.lang) return;
    activateProject(projectForLang(lang).id);
  }

  /* Neues Projekt in der aktuell gewählten Sprache */
  function openNewProjectDialog() {
    const m = $('projModal');
    const lang = state.lang;
    $('projTitle').textContent = 'Neues ' + (lang === 'csharp' ? 'C#' : 'Python') + '-Projekt';
    $('projNameInput').value = uniqueProjectName('MeinProjekt');
    m.hidden = false;
    $('projNameInput').focus(); $('projNameInput').select();
    const done = (ok) => {
      m.hidden = true;
      $('projOk').removeEventListener('click', onOk); $('projCancel').removeEventListener('click', onCancel); m.removeEventListener('keydown', onKey);
      if (!ok) return;
      const name = uniqueProjectName(sanitizeFolder($('projNameInput').value));
      const np = KON.newProject(lang, name);
      state.projects.push(np);
      activateProject(np.id);
      flash('Projekt "' + name + '" angelegt.');
    };
    const onOk = () => done(true), onCancel = () => done(false);
    const onKey = (e) => { if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); onOk(); } else if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    $('projOk').addEventListener('click', onOk); $('projCancel').addEventListener('click', onCancel); m.addEventListener('keydown', onKey);
  }

  async function renameProject(p) {
    const n = await ask('Projektname', 'Name des Projekts (wird beim Speichern als Ordnername benutzt):', p.name, 'Übernehmen');
    if (!n) return;
    p.name = uniqueProjectName(sanitizeFolder(n), p);
    renderFileList(); $('stFile').textContent = project().name + (project().active ? ' › ' + project().active : ''); scheduleSave();
  }

  async function closeProject(p) {
    if (state.running && state.runProject === p) { flash('Bitte erst das Programm beenden.'); return; }
    const warn = p.dirty.size ? ' Es hat ungespeicherte Änderungen, die verloren gehen.' : '';
    const ok = await ask('Projekt schließen', '"' + p.name + '" aus dem Editor entfernen?' + warn + ' Bereits gespeicherte Ordner auf der Festplatte bleiben unverändert.', null, 'Schließen');
    if (!ok) return;
    removeProject(p);
    flash('Projekt "' + p.name + '" geschlossen.');
  }
  function removeProject(p) {
    const wasActive = p.id === state.activeId;
    const i = state.projects.indexOf(p);
    if (wasActive) {
      if (state.ed1.file) state.ed1.unbind();
      if (state.ed2 && state.ed2.file) state.ed2.unbind();
      state.ed1.file = null;
      if (state.ed2) state.ed2.file = null;
    }
    state.projects.splice(i, 1);
    if (!state.projects.length) state.projects.push(KON.newProject(p.lang, 'MeinProjekt'));
    if (wasActive) {
      const same = state.projects.filter((q) => q.lang === p.lang);
      const next = same.find((q) => state.projects.indexOf(q) >= i) || same[same.length - 1];
      state.activeId = next.id; next.used = Date.now(); state.lang = next.lang;
    }
    renderAll(); scheduleSave();
  }

  /* ---------- Ausführen ---------- */
  function pickStart(p) {
    const runnable = p.runnable();
    if (p.lang === 'python') {
      if (p.start && p.get(p.start) && KON.langOfName(p.start) === 'python') return p.start;
      const a = p.get(p.active);
      if (a && KON.langOfName(a.name) === 'python') return a.name;
      return runnable[0] ? runnable[0].name : null;
    }
    const hasMain = (f) => /\bstatic\s+(?:async\s+)?(?:void|int|Task)\s+Main\s*\(/.test(f.content);
    const noClass = (f) => !/\b(?:class|struct|interface|enum|record)\s+\w+/.test(f.content) || /^\s*(?:using\s+[\w.]+;\s*)*(?!\s*(?:namespace|class|struct|interface|enum|record|public|internal|abstract|static|sealed|partial))\S/m.test(f.content.replace(/\/\/.*$/gm, ''));
    const a = p.get(p.active);
    if (a && KON.langOfName(a.name) === 'csharp' && (hasMain(a))) return a.name;
    if (p.start && p.get(p.start) && KON.langOfName(p.start) === 'csharp' && hasMain(p.get(p.start))) return p.start;
    const m = runnable.find(hasMain);
    if (m) return m.name;
    if (a && KON.langOfName(a.name) === 'csharp' && noClass(a)) return a.name;
    const t = runnable.find(noClass);
    return t ? t.name : (runnable[0] ? runnable[0].name : null);
  }

  function setRunning(on) {
    state.running = on;
    $('btnRun').disabled = on;
    $('btnStop').disabled = !on;
    $('conStatus').textContent = on ? 'läuft …' : '';
    $('conStatus').classList.toggle('running', on);
    renderFileList();
  }

  function fmtSeconds(ms) { return (ms / 1000).toFixed(2).replace('.', ','); }

  function markErrors(list, p) {
    p = p || project();
    p.errors = {};
    for (const e of list) {
      if (!e.file) continue;
      (p.errors[e.file] = p.errors[e.file] || []).push({ line: e.line, col: e.col, msg: e.msg });
    }
    if (p === project()) {
      if (state.ed1.file) state.ed1.setErrors(p.errors[state.ed1.file.name] || []);
      if (state.ed2 && state.ed2.file) state.ed2.setErrors(p.errors[state.ed2.file.name] || []);
    }
    renderFileList();
  }

  /* loc.pid sagt, zu welchem Projekt die Stelle gehört (die Konsole bleibt beim Projektwechsel stehen) */
  function jumpTo(loc) {
    const p = (loc.pid && byId(loc.pid)) || project();
    if (p !== project()) activateProject(p.id);
    let f = p.get(loc.file) || p.files.find((x) => x.name.split('/').pop() === String(loc.file).split('/').pop());
    if (!f) return;
    if (p.active !== f.name) { p.openTab(f.name); renderTabs(); renderFileList(); bindPane1(); }
    state.ed1.gotoLine(loc.line, loc.col);
  }

  function run() {
    if (state.running) return;
    const p = project();
    const lang = p.lang;
    const files = p.runnable();
    if (!files.length) { flash('Keine ' + (lang === 'csharp' ? 'C#' : 'Python') + '-Datei zum Ausführen.'); return; }
    const lib = lang === 'csharp' ? KON.cs : KON.py;
    const at = (loc) => (loc ? Object.assign({}, loc, { pid: p.id }) : loc);
    const start = pickStart(p);
    if (state.settings.conCollapsed) setConsoleCollapsed(false);
    if (lang === 'csharp') KON.cs.setCulture(state.settings.culture);
    con.clear();
    markErrors([], p);
    const sources = files.map((f) => ({ name: f.name, content: f.content }));
    const errLocs = [];
    const io = {
      write: (s) => con.write(s),
      writeErr: (s, loc) => { con.writeErr(s, at(loc)); if (loc) errLocs.push({ file: loc.file, line: loc.line, col: loc.col, msg: s.trim() }); },
      readLine: (prompt) => con.readLine(prompt),
      cancelInput: () => con.cancelInput(),
      clear: () => con.clear()
    };
    let prep;
    try { prep = lib.prepare(sources, start); } catch (e) { con.writeErr('Interner Fehler: ' + (e && e.message ? e.message : e) + '\n'); G.console.error(e); return; }
    if (prep.errors) {
      const marks = [];
      for (const e of prep.errors) {
        if (lang === 'python') {
          for (const l of KON.py.formatSyntaxError(e, sources)) con.writeErr(l.text, at(l.loc));
        } else {
          con.writeErr(e.file + '(' + e.line + ',' + e.col + '): error ' + e.code + ': ' + e.message + '\n', at({ file: e.file, line: e.line, col: e.col }));
        }
        marks.push({ file: e.file, line: e.line, col: e.col, msg: e.message });
      }
      con.info('\n' + (lang === 'csharp' ? 'Erstellung fehlgeschlagen (' + prep.errors.length + (prep.errors.length === 1 ? ' Fehler' : ' Fehler') + '). Das Programm wurde nicht gestartet.' : 'Programm nicht gestartet (Syntaxfehler).') + '\n', 'bad');
      markErrors(marks, p);
      if (marks[0]) jumpTo(Object.assign({ pid: p.id }, marks[0]));
      $('conStatus').textContent = 'Fehler';
      return;
    }
    state.runProject = p;
    setRunning(true);
    con.info('', '');
    state.runner = new KON.Runner(io);
    state.runner.start(prep.run(io), (res) => {
      state.runProject = null;
      setRunning(false);
      if (res.stopped) con.info('\nProgramm abgebrochen – ' + fmtSeconds(res.ms) + ' s\n', 'bad');
      else con.info('\nProgramm beendet (Exit-Code ' + res.code + ') – ' + fmtSeconds(res.ms) + ' s\n', res.code === 0 ? 'ok' : 'bad');
      if (errLocs.length) {
        const pick = lang === 'csharp' ? errLocs[0] : errLocs[errLocs.length - 1];
        markErrors([pick], p);
      }
      con.flush();
    });
  }
  function stop() { if (state.running && state.runner) state.runner.stop(); }

  /* ---------- Konsole & Layout ---------- */
  function setConsoleCollapsed(on) {
    state.settings.conCollapsed = on;
    $('work').classList.toggle('con-collapsed', on);
    $('collapseIcon').setAttribute('d', on ? 'M11 3 6 8l5 5' : 'M5 3l5 5-5 5');
    scheduleSave();
  }
  function setOrientation(o) {
    state.settings.orientation = o;
    $('work').classList.toggle('vertical', o === 'vertical');
    $('splitter').setAttribute('aria-orientation', o === 'vertical' ? 'horizontal' : 'vertical');
    $('layoutIcon').setAttribute('d', o === 'vertical' ? 'M2 9h12' : 'M9.5 3v10');
    state.settings.conSize = 0;
    state.split && state.split.apply();
    scheduleSave();
  }
  function setSplit(on) {
    state.settings.split = on;
    $('pane2').hidden = !on;
    $('paneSplit').hidden = !on;
    $('btnSplit').classList.toggle('on', on);
    if (on) { const p = project(); if (!p.pane2) p.pane2 = (p.files.find((f) => f.name !== p.active) || p.get(p.active) || {}).name || null; bindPane2(); }
    state.paneSplit.apply();
    scheduleSave();
  }
  function setSidebar(hidden) {
    state.settings.sidebarHidden = hidden;
    $('sidebar').classList.toggle('hidden', hidden);
    $('btnOpenSide').hidden = !hidden;
    scheduleSave();
  }
  function setFontSize(n) {
    n = Math.max(10, Math.min(28, n));
    if (n === state.settings.fontSize) return;
    state.settings.fontSize = n;
    applySettingsToEditors(); scheduleSave();
    flash('Schriftgröße ' + n + ' px', 1500);
  }
  const modalOpen = () => !!document.querySelector('.modal:not([hidden])');

  /* Strg+G: zu Zeile (und optional Spalte) springen */
  async function gotoLineDialog() {
    if (modalOpen()) return;
    const ed = activeEditor();
    if (!ed || !ed.file) return;
    const n = ed.lineStarts.length;
    const v = await ask('Gehe zu Zeile', 'Zeilennummer (1–' + n + '), optional mit Spalte, z. B. 12 oder 12:5', '', 'Springen');
    if (!v) { ed.focus(); return; }
    const m = /^(\d+)(?:\s*[:,]\s*(\d+))?$/.exec(v);
    if (!m) { flash('Bitte eine Zeilennummer eingeben.'); ed.focus(); return; }
    ed.gotoLine(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 1);
  }

  /* Konsolenausgabe in die Zwischenablage */
  async function copyConsole() {
    con.flush();
    const text = $('conOut').textContent.replace(/\s+$/, '');
    if (!text) { flash('Die Konsole ist leer.'); return; }
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* Rückfall unten */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    flash(ok ? 'Konsolenausgabe kopiert.' : 'Kopieren nicht möglich – Text in der Konsole markieren und Strg+C drücken.');
  }

  function applySettingsToEditors() {
    state.ed1.applySettings();
    if (state.ed2) state.ed2.applySettings();
    $('chkSuggest').checked = state.settings.suggest;
    $('chkSuggest2').checked = state.settings.suggest;
    $('chkPasteIndent').checked = state.settings.autoIndentPaste !== false;
    $('chkWarnClose').checked = state.settings.warnOnClose !== false;
    $('valFont').textContent = state.settings.fontSize;
    $('selTab').value = String(state.settings.tabSize);
    $('selCulture').value = state.settings.culture;
  }

  /* ---------- Beispiele ---------- */
  function buildExamplesMenu() {
    const pop = $('menuExamples').querySelector('[data-menu-pop]');
    const list = KON.data.examples[state.lang];
    pop.innerHTML = list.map((e) => '<button type="button" data-ex="' + e.id + '"><span>' + escHtml(e.title) + '<span class="desc">' + escHtml(e.desc) + '</span></span></button>').join('');
  }
  async function loadExample(id) {
    const ex = KON.data.examples[state.lang].find((e) => e.id === id);
    if (!ex) return;
    const p = project();
    let first = null;
    for (const f of ex.files) {
      const existing = p.get(f.name);
      let name = f.name;
      if (existing) {
        if (existing.content === f.content) { first = first || name; continue; }
        name = p.uniqueName(f.name);
      }
      p.add(name, f.content, true);
      first = first || name;
    }
    p.start = first;
    openFile(first);
    ex.files.forEach((f) => { if (p.get(f.name) && f.name !== first) { /* weitere Dateien bleiben im Dateibaum */ } });
    flash('Beispiel "' + ex.title + '" geladen. Mit F5 starten.');
  }

  /* ---------- Speichern & Öffnen ---------- */
  function sanitizeFolder(n) { return (n || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_') || 'MeinProjekt'; }

  async function saveProject() {
    const p = project();
    if (p.dirHandle && KON.Storage.supportsFS) {
      try {
        const ok = await KON.Storage.writeBack(p);
        if (ok) { p.dirty.clear(); renderTabs(); renderFileList(); flash('Gespeichert in Ordner "' + p.dirHandle.name + '".'); scheduleSave(); return; }
      } catch (e) { flash('Speichern fehlgeschlagen: ' + (e && e.message ? e.message : e)); return; }
    }
    openSaveDialog();
  }
  function openSaveDialog() {
    const m = $('saveModal');
    $('saveName').value = project().name;
    $('saveFolder').hidden = !KON.Storage.supportsFS;
    $('saveHint').textContent = KON.Storage.supportsFS
      ? 'Es wird ein Ordner mit diesem Namen am gewählten Speicherort angelegt und alle Dateien werden hineingeschrieben.'
      : 'Dein Browser kann keine Ordner direkt beschreiben. Das Projekt wird als ZIP-Datei mit allen Dateien heruntergeladen.';
    m.hidden = false;
    $('saveName').focus(); $('saveName').select();
  }
  async function doSaveFolder() {
    const p = project();
    const name = sanitizeFolder($('saveName').value);
    try {
      const dir = await KON.Storage.saveNewFolder(p, name);
      p.dirHandle = dir; p.name = name; p.dirty.clear();
      $('saveModal').hidden = true;
      renderAll(); scheduleSave();
      flash('Projekt im Ordner "' + name + '" gespeichert.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      flash('Speichern fehlgeschlagen: ' + (e && e.message ? e.message : e));
    }
  }
  function doSaveZip() {
    const p = project();
    p.name = sanitizeFolder($('saveName').value);
    KON.Storage.downloadZip(p);
    p.dirty.clear();
    $('saveModal').hidden = true;
    renderAll(); scheduleSave();
    flash('ZIP-Datei "' + p.name + '.zip" heruntergeladen.');
  }
  /* Alle Projekte der gewählten Sprache in einem ZIP, jedes in einem eigenen Ordner */
  function downloadAllZip() {
    const list = state.projects.filter((p) => p.lang === state.lang);
    const name = (state.lang === 'csharp' ? 'CSharp' : 'Python') + '-Projekte.zip';
    KON.Storage.download(KON.makeProjectsZip(list), name);
    flash('ZIP-Datei "' + name + '" mit ' + list.length + (list.length === 1 ? ' Projekt' : ' Projekten') + ' heruntergeladen.');
  }
  function downloadZipNow() {
    const p = project();
    KON.Storage.downloadZip(p);
    flash('ZIP-Datei "' + p.name + '.zip" heruntergeladen.');
  }

  function detectLang(files) {
    let cs = 0, py = 0;
    for (const f of files) { const l = KON.langOfName(f.name); if (l === 'csharp') cs++; else if (l === 'python') py++; }
    if (!cs && !py) return null;
    return cs >= py ? 'csharp' : 'python';
  }
  /* Dialog „Hinzufügen oder Ersetzen“; Ergebnis { mode: 'add' | 'replace', target } oder null */
  function askAddReplace(name, lang, count) {
    return new Promise((resolve) => {
      const m = $('importModal'), sel = $('impReplaceSel');
      const label = lang === 'csharp' ? 'C#' : 'Python';
      $('impText').textContent = 'Der Ordner "' + name + '" (' + label + ', ' + count + (count === 1 ? ' Datei' : ' Dateien') + ') soll geöffnet werden. Zu den ' + label + '-Projekten hinzufügen' + (state.projects.some((p) => p.lang === lang) ? ' oder eines davon ersetzen?' : '?');
      const same = state.projects.filter((p) => p.lang === lang);
      const pre = same.find((p) => p.id === state.activeId) || same.slice().sort((a, b) => b.used - a.used)[0];
      sel.innerHTML = same.map((p) => '<option value="' + escAttr(p.id) + '"' + (p === pre ? ' selected' : '') + '>' + escHtml(p.name) + (p.dirty.size ? ' – ungespeichert' : '') + '</option>').join('');
      $('impReplaceRow').hidden = $('impReplace').hidden = !same.length;
      const warn = () => {
        const t = byId(sel.value);
        $('impWarn').hidden = !(t && t.dirty.size);
        if (t && t.dirty.size) $('impWarn').textContent = '"' + t.name + '" hat ungespeicherte Änderungen, die beim Ersetzen verloren gehen.';
      };
      warn();
      m.hidden = false;
      $('impAdd').focus();
      const done = (v) => {
        m.hidden = true;
        $('impAdd').removeEventListener('click', onAdd); $('impReplace').removeEventListener('click', onRep); $('impCancel').removeEventListener('click', onCancel);
        sel.removeEventListener('change', warn); m.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onAdd = () => done({ mode: 'add' });
      const onRep = () => done({ mode: 'replace', target: sel.value });
      const onCancel = () => done(null);
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
      $('impAdd').addEventListener('click', onAdd); $('impReplace').addEventListener('click', onRep); $('impCancel').addEventListener('click', onCancel);
      sel.addEventListener('change', warn); m.addEventListener('keydown', onKey);
    });
  }

  async function importProject(files, name, handle) {
    const lang = detectLang(files);
    if (!lang) { flash('Keine .cs- oder .py-Dateien gefunden.'); return; }
    const count = files.filter((f) => KON.langOfName(f.name) === lang || KON.extOf(f.name) === '.txt').length;
    const choice = await askAddReplace(name, lang, count);
    if (!choice) return;
    const target = choice.mode === 'replace' ? byId(choice.target) : null;
    if (target && state.running && state.runProject === target) { flash('Bitte erst das Programm beenden.'); return; }
    const p = new KON.Project(lang, uniqueProjectName(sanitizeFolder(name), target));
    for (const f of files) if (KON.langOfName(f.name) === lang || KON.extOf(f.name) === '.txt') p.add(f.name, f.content);
    p.dirHandle = handle || null;
    p.start = lang === 'python' ? ((p.files.find((f) => /(^|\/)(main|__main__|app)\.py$/.test(f.name)) || p.files.find((f) => f.name.endsWith('.py')) || {}).name || null) : null;
    const first = (lang === 'csharp' ? p.files.find((f) => /Program\.cs$/.test(f.name)) : p.get(p.start)) || p.files[0];
    p.openTab(first.name);
    p.used = Date.now();
    if (state.ed1.file) state.ed1.unbind();
    if (state.ed2 && state.ed2.file) state.ed2.unbind();
    if (target) state.projects[state.projects.indexOf(target)] = p; else state.projects.push(p);
    state.activeId = p.id; state.lang = lang;
    state.ed1.file = null;
    renderAll(); scheduleSave();
    flash('Projekt "' + p.name + '" ' + (target ? 'ersetzt' : 'hinzugefügt') + ' (' + p.files.length + ' Dateien).');
  }
  async function openFolder() {
    if (KON.Storage.supportsFS) {
      try { const r = await KON.Storage.openFolder(); await importProject(r.files, r.name, r.handle); }
      catch (e) { if (!(e && e.name === 'AbortError')) flash('Öffnen fehlgeschlagen: ' + (e && e.message ? e.message : e)); }
    } else $('dirInput').click();
  }
  /* Einzelne Dateien kommen ins aktive Projekt; passt dessen Sprache nicht, ins zuletzt benutzte Projekt der Sprache */
  async function addFiles(files) {
    if (!files.length) { flash('Keine passenden Dateien gefunden.'); return; }
    const lang = detectLang(files) || state.lang;
    const p = projectForLang(lang);
    if (p.id !== state.activeId) activateProject(p.id); else renderAll();
    let last = null;
    for (const f of files) {
      if (KON.langOfName(f.name) !== lang && KON.extOf(f.name) !== '.txt') continue;
      const name = p.uniqueName(f.name);
      p.add(name, f.content, true);
      last = name;
    }
    if (last) { p.openTab(last); renderAll(); scheduleSave(); flash(files.length + (files.length === 1 ? ' Datei' : ' Dateien') + ' zu "' + p.name + '" hinzugefügt.'); }
  }

  /* ---------- Kontextmenü ---------- */
  function showCtx(x, y, items) {
    const m = $('ctxMenu');
    m.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : '<button type="button" data-i="' + i + '">' + escHtml(it.label) + '</button>').join('');
    m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(x, innerWidth - w - 6) + 'px';
    m.style.top = Math.min(y, innerHeight - h - 6) + 'px';
    m.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; m.hidden = true; items[parseInt(b.dataset.i, 10)].run(); };
  }

  /* ---------- Tabs wechseln ---------- */
  function cycleTab(dir) {
    const p = project();
    if (p.open.length < 2) return;
    const i = p.open.indexOf(p.active);
    openFile(p.open[(i + dir + p.open.length) % p.open.length]);
  }

  /* ---------- Ereignisse ---------- */
  function wire() {
    $('langSwitch').addEventListener('click', (e) => { const b = e.target.closest('button[data-lang]'); if (b) setLang(b.dataset.lang); });
    $('btnRun').addEventListener('click', run);
    $('btnStop').addEventListener('click', stop);
    $('btnUndo').addEventListener('click', () => { const ed = activeEditor(); if (ed && ed.file) { ed.undo(); ed.focus(); } updateUndoButtons(); });
    $('btnRedo').addEventListener('click', () => { const ed = activeEditor(); if (ed && ed.file) { ed.redo(); ed.focus(); } updateUndoButtons(); });
    for (const id of ['chkSuggest', 'chkSuggest2']) $(id).addEventListener('change', (e) => { state.settings.suggest = e.target.checked; applySettingsToEditors(); scheduleSave(); });
    $('btnClear').addEventListener('click', () => con.clear());
    $('btnCopy').addEventListener('click', copyConsole);
    // Strg+Mausrad (auch Zwei-Finger-Zoom am Touchpad) ändert die Schriftgröße
    let wheelAcc = 0;
    $('editors').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 40) return;
      setFontSize(state.settings.fontSize + (wheelAcc < 0 ? 1 : -1));
      wheelAcc = 0;
    }, { passive: false });
    $('btnCollapse').addEventListener('click', () => setConsoleCollapsed(!state.settings.conCollapsed));
    $('btnLayout').addEventListener('click', () => setOrientation(state.settings.orientation === 'vertical' ? 'horizontal' : 'vertical'));
    $('btnSplit').addEventListener('click', () => setSplit(!state.settings.split));
    $('btnClosePane2').addEventListener('click', () => setSplit(false));
    $('selPane2').addEventListener('change', (e) => { project().pane2 = e.target.value; bindPane2(); });
    $('btnNewProject').addEventListener('click', openNewProjectDialog);
    $('btnToggleSide').addEventListener('click', () => setSidebar(true));
    $('btnOpenSide').addEventListener('click', () => setSidebar(false));

    // Tabs
    $('tabs1').addEventListener('click', (e) => {
      const x = e.target.closest('[data-close]');
      if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
      const t = e.target.closest('.tab');
      if (t) openFile(t.dataset.name);
    });
    $('tabs1').addEventListener('keydown', (e) => {
      const t = e.target.closest('.tab');
      if (t && e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFile(t.dataset.name); }
    });
    // Tabs per Maus umsortieren
    let dragTab = null;
    const clearDrop = () => $('tabs1').querySelectorAll('.drop-before, .drop-after, .dragging').forEach((t) => t.classList.remove('drop-before', 'drop-after', 'dragging'));
    $('tabs1').addEventListener('dragstart', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      dragTab = t.dataset.name;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-kon-tab', dragTab);
      setTimeout(() => t.classList.add('dragging'), 0);
    });
    $('tabs1').addEventListener('dragover', (e) => {
      if (!dragTab) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const t = e.target.closest('.tab');
      $('tabs1').querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      if (!t) { const last = $('tabs1').lastElementChild; if (last) last.classList.add('drop-after'); return; }
      const r = t.getBoundingClientRect();
      t.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
    });
    $('tabs1').addEventListener('drop', (e) => {
      if (!dragTab) return;
      e.preventDefault();
      const t = e.target.closest('.tab');
      const p = project();
      const from = p.open.indexOf(dragTab);
      if (from >= 0) {
        let to = p.open.length;
        if (t) {
          const r = t.getBoundingClientRect();
          to = p.open.indexOf(t.dataset.name) + (e.clientX < r.left + r.width / 2 ? 0 : 1);
        }
        p.open.splice(from, 1);
        if (to > from) to--;
        p.open.splice(to, 0, dragTab);
        scheduleSave();
      }
      dragTab = null; clearDrop(); renderTabs();
    });
    $('tabs1').addEventListener('dragend', () => { dragTab = null; clearDrop(); });
    $('tabs1').addEventListener('auxclick', (e) => { const t = e.target.closest('.tab'); if (t && e.button === 1) { e.preventDefault(); closeTab(t.dataset.name); } });

    // Projekt- und Dateiliste
    const pidOf = (el) => { const b = el.closest('.proj'); return b ? b.dataset.pid : null; };
    const toggleProject = (p) => { p.collapsed = !p.collapsed; renderFileList(); scheduleSave(); };
    const clickProjectHead = (e) => {
      const p = byId(pidOf(e.target)); if (!p) return;
      if (e.target.closest('[data-closeproj]')) { e.stopPropagation(); closeProject(p); return; }
      if (e.target.closest('[data-newfile]')) { e.stopPropagation(); activateProject(p.id); if (p.collapsed) toggleProject(p); newFile(); return; }
      if (e.target.closest('[data-toggle]')) { toggleProject(p); return; }
      if (p.id !== state.activeId) activateProject(p.id);
      if (p.collapsed) toggleProject(p);
    };
    $('fileList').addEventListener('click', (e) => {
      if (e.target.closest('.proj-head')) { clickProjectHead(e); return; }
      const f = e.target.closest('.file');
      if (!f) return;
      activateProject(pidOf(f));
      openFile(f.dataset.name);
    });
    $('fileList').addEventListener('dblclick', (e) => {
      const n = e.target.closest('.pn'); if (!n) return;
      const p = byId(pidOf(n)); if (p) renameProject(p);
    });
    $('fileList').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('button')) return;
      const f = e.target.closest('.file');
      if (f) { e.preventDefault(); activateProject(pidOf(f)); openFile(f.dataset.name); return; }
      if (e.target.closest('.proj-head')) { e.preventDefault(); clickProjectHead(e); }
    });
    $('fileList').addEventListener('contextmenu', (e) => {
      const f = e.target.closest('.file'), h = e.target.closest('.proj-head');
      const p = byId(pidOf(e.target));
      if (!p || (!f && !h)) return;
      e.preventDefault();
      if (f) {
        const n = f.dataset.name;
        const items = [{ label: 'Öffnen', run: () => { activateProject(p.id); openFile(n); } }, { label: 'In zweitem Fenster öffnen', run: () => { activateProject(p.id); project().pane2 = n; setSplit(true); bindPane2(); } }];
        if (KON.langOfName(n) === p.lang) items.push({ label: 'Als Startdatei', run: () => setStart(n, p) });
        items.push('-', { label: 'Umbenennen …', run: () => renameFile(n, p) }, { label: 'Löschen …', run: () => deleteFile(n, p) });
        showCtx(e.clientX, e.clientY, items);
      } else {
        showCtx(e.clientX, e.clientY, [
          { label: 'Neue Datei …', run: () => { activateProject(p.id); if (p.collapsed) toggleProject(p); newFile(); } },
          { label: 'Projekt umbenennen …', run: () => renameProject(p) },
          '-',
          { label: 'Speichern …', run: () => { activateProject(p.id); saveProject(); } },
          { label: 'Als ZIP herunterladen', run: () => { KON.Storage.downloadZip(p); flash('ZIP-Datei "' + p.name + '.zip" heruntergeladen.'); } },
          '-',
          { label: 'Projekt schließen …', run: () => closeProject(p) }
        ]);
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#ctxMenu')) $('ctxMenu').hidden = true; });
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('.file, .proj-head')) $('ctxMenu').hidden = true; });

    // Menüs
    document.querySelectorAll('.menu').forEach((menu) => {
      menu.querySelector('[data-menu-toggle]').addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !menu.classList.contains('open');
        document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
        if (open) {
          menu.classList.add('open');
          const r = e.currentTarget.getBoundingClientRect();
          const pop = menu.querySelector('[data-menu-pop]');
          pop.style.left = Math.max(4, Math.min(r.left, innerWidth - 240)) + 'px';
          pop.style.top = (r.bottom + 4) + 'px';
        }
      });
    });
    document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')));
    $('menuExamples').addEventListener('click', (e) => { const b = e.target.closest('button[data-ex]'); if (b) { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); loadExample(b.dataset.ex); } });
    $('menuFile').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
      switch (b.dataset.act) {
        case 'save': saveProject(); break;
        case 'open-folder': openFolder(); break;
        case 'open-files': $('fileInput').click(); break;
        case 'zip': downloadZipNow(); break;
        case 'zip-all': downloadAllZip(); break;
        case 'format': { const ed = activeEditor(); if (ed && ed.file) { ed.formatDocument(); ed.focus(); } break; }
        case 'new-file': newFile(); break;
        case 'new-project': openNewProjectDialog(); break;
      }
    });
    $('fileInput').addEventListener('change', async (e) => { const files = await KON.Storage.readFiles(e.target.files); e.target.value = ''; addFiles(files); });
    $('dirInput').addEventListener('change', async (e) => {
      const list = e.target.files;
      const name = list.length && list[0].webkitRelativePath ? list[0].webkitRelativePath.split('/')[0] : 'Ordner';
      const files = await KON.Storage.readFiles(list);
      e.target.value = '';
      importProject(files, name, null);
    });

    // Speichern-Dialog
    $('saveCancel').addEventListener('click', () => { $('saveModal').hidden = true; });
    $('saveZip').addEventListener('click', doSaveZip);
    $('saveFolder').addEventListener('click', doSaveFolder);
    $('saveModal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('saveModal').hidden = true;
      else if (e.key === 'Enter') { e.preventDefault(); if (KON.Storage.supportsFS) doSaveFolder(); else doSaveZip(); }
    });

    // Einstellungen
    $('btnSettings').addEventListener('click', (e) => { e.stopPropagation(); $('settingsPop').hidden = !$('settingsPop').hidden; });
    $('settingsPop').addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button[data-step]');
      if (b) setFontSize(state.settings.fontSize + parseInt(b.dataset.step, 10));
    });
    document.addEventListener('click', () => { $('settingsPop').hidden = true; });
    $('chkWarnClose').addEventListener('change', (e) => { state.settings.warnOnClose = e.target.checked; scheduleSave(); });
    $('chkPasteIndent').addEventListener('change', (e) => { state.settings.autoIndentPaste = e.target.checked; scheduleSave(); });
    $('selTab').addEventListener('change', (e) => { state.settings.tabSize = parseInt(e.target.value, 10); applySettingsToEditors(); scheduleSave(); });
    $('selCulture').addEventListener('change', (e) => { state.settings.culture = e.target.value; scheduleSave(); });

    // Tastenkürzel
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F5') { e.preventDefault(); if (e.shiftKey) stop(); else run(); return; }
      if (!ctrl) { if (e.key === 'Escape') { $('settingsPop').hidden = true; $('ctxMenu').hidden = true; } return; }
      const k = e.key.toLowerCase();
      if (k === 's' && !e.shiftKey) { e.preventDefault(); saveProject(); }
      else if (k === 'o') { e.preventDefault(); openFolder(); }
      else if (k === 'n' && !e.shiftKey) { e.preventDefault(); newFile(); }
      else if (k === 'j') { e.preventDefault(); setConsoleCollapsed(!state.settings.conCollapsed); }
      else if (k === 'g' && !e.shiftKey) { e.preventDefault(); gotoLineDialog(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!modalOpen()) run(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setFontSize(state.settings.fontSize + 1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setFontSize(state.settings.fontSize - 1); }
      else if (e.key === '0') { e.preventDefault(); setFontSize(DEFAULTS.fontSize); }
      else if (e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
    }, true);
    // Alt+N als Ersatz für Strg+N (der Browser reserviert Strg+N oft für neue Fenster)
    document.addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newFile(); } });

    // Drag & Drop
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; $('dropZone').hidden = false; } });
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropZone').hidden = true; });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); dragDepth = 0; $('dropZone').hidden = true;
      const r = await KON.Storage.readDropped(e.dataTransfer);
      if (r.dirName) await importProject(r.files, r.dirName, null); else await addFiles(r.files);
    });

    // Fenstergröße
    // Browser-Tab oder Fenster schließen: Der Browser zeigt seine eigene Rückfrage (Text und Knöpfe kann die Seite nicht ändern).
    // Sie erscheint nur, wenn irgendein Projekt Änderungen hat, die noch nicht in einem Ordner oder ZIP gesichert sind.
    window.addEventListener('beforeunload', (e) => {
      saveNow();
      if (state.settings.warnOnClose !== false && state.projects.some((p) => p.dirty.size)) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------- Start ---------- */
  let con;
  function start() {
    loadState();
    con = new KON.ConsolePane($('conBody'), $('conOut'), jumpTo);
    initEditors();
    wire();
    state.split = KON.makeSplitter($('splitter'), $('work'), $('console'), state.settings, scheduleSave);
    state.paneSplit = KON.makePaneSplitter($('paneSplit'), $('editors'), $('pane1'), state.settings, scheduleSave);
    $('work').classList.toggle('vertical', state.settings.orientation === 'vertical');
    $('layoutIcon').setAttribute('d', state.settings.orientation === 'vertical' ? 'M2 9h12' : 'M9.5 3v10');
    setConsoleCollapsed(state.settings.conCollapsed);
    setSidebar(state.settings.sidebarHidden);
    applySettingsToEditors();
    renderAll();
    if (state.settings.split) setSplit(true);
    state.split.apply();
    if (!KON.Storage.supportsFS) $('saveFolder').hidden = true;
    state.ed1.focus();
    wireIntro();
    if ((state.settings.introVersion || 0) < INTRO_VERSION) openIntro();
    G.KON.app = { state: state, run: run, stop: stop, con: () => con, openFile: openFile, newFile: newFile, importProject: importProject, activateProject: activateProject };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
