/* Projekt: Dateien, Startdatei, Tabs. Es können beliebig viele Projekte (je C# oder Python) gleichzeitig offen sein. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const EXT = { csharp: '.cs', python: '.py' };
  const LANG_OF_EXT = { '.cs': 'csharp', '.py': 'python' };

  function extOf(name) { const m = /\.[^.\/]+$/.exec(name); return m ? m[0].toLowerCase() : ''; }
  KON.extOf = extOf;
  KON.langOfName = function (name) { return LANG_OF_EXT[extOf(name)] || null; };
  KON.EXT = EXT;

  let uidCount = 0;
  KON.uid = function () { return 'p' + Date.now().toString(36) + (uidCount++).toString(36) + Math.random().toString(36).slice(2, 6); };

  class Project {
    constructor(lang, name, id) {
      this.id = id || KON.uid();
      this.lang = lang;
      this.name = name || 'MeinProjekt';
      this.files = [];
      this.start = null;
      this.open = [];       // Namen der geöffneten Tabs
      this.active = null;   // Name der aktiven Datei (linkes Fenster)
      this.pane2 = null;    // Datei im zweiten Fenster
      this.dirHandle = null;
      this.dirty = new Set();
      this.errors = {};         // Datei -> [{line, col, msg}], nicht gespeichert
      this.collapsed = false;   // in der Seitenleiste eingeklappt
      this.used = 0;            // letzte Benutzung (für „zuletzt aktives Projekt“)
    }
    get(name) { return this.files.find((f) => f.name === name) || null; }
    uniqueName(name) {
      if (!this.get(name)) return name;
      const ext = extOf(name);
      const base = ext ? name.slice(0, -ext.length) : name;
      for (let i = 2; i < 1000; i++) { const n = base + i + ext; if (!this.get(n)) return n; }
      return name;
    }
    add(name, content, markDirty) {
      const f = { name: name, content: content, history: new KON.History(content) };
      this.files.push(f);
      this.files.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      if (!this.start && this.lang === 'python') this.start = name;
      if (markDirty) this.dirty.add(name);
      return f;
    }
    remove(name) {
      this.files = this.files.filter((f) => f.name !== name);
      this.open = this.open.filter((n) => n !== name);
      this.dirty.delete(name);
      if (this.start === name) this.start = this.lang === 'python' ? (this.files.find((f) => /\.py$/.test(f.name)) || {}).name || null : null;
      if (this.active === name) this.active = this.open[this.open.length - 1] || (this.files[0] && this.files[0].name) || null;
      if (this.pane2 === name) this.pane2 = null;
    }
    rename(oldName, newName) {
      const f = this.get(oldName);
      if (!f) return;
      f.name = newName;
      this.files.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      this.open = this.open.map((n) => (n === oldName ? newName : n));
      if (this.active === oldName) this.active = newName;
      if (this.pane2 === oldName) this.pane2 = newName;
      if (this.start === oldName) this.start = newName;
      if (this.dirty.delete(oldName)) this.dirty.add(newName);
    }
    openTab(name) { if (!this.open.includes(name)) this.open.push(name); this.active = name; }
    closeTab(name) {
      const i = this.open.indexOf(name);
      if (i < 0) return;
      this.open.splice(i, 1);
      if (this.active === name) this.active = this.open[Math.min(i, this.open.length - 1)] || null;
    }
    runnable() { return this.files.filter((f) => KON.langOfName(f.name) === this.lang); }
    toJSON() {
      return {
        id: this.id, lang: this.lang, name: this.name, collapsed: this.collapsed, used: this.used, start: this.start, open: this.open, active: this.active, pane2: this.pane2,
        files: this.files.map((f) => ({ name: f.name, content: f.content })), dirty: Array.from(this.dirty)
      };
    }
    static fromJSON(o) {
      const p = new Project(o.lang, o.name, o.id);
      p.collapsed = !!o.collapsed; p.used = o.used || 0;
      for (const f of o.files || []) p.files.push({ name: f.name, content: f.content, history: new KON.History(f.content) });
      p.start = o.start; p.open = (o.open || []).filter((n) => p.get(n)); p.active = p.get(o.active) ? o.active : (p.open[0] || (p.files[0] && p.files[0].name) || null);
      p.pane2 = p.get(o.pane2) ? o.pane2 : null;
      p.dirty = new Set((o.dirty || []).filter((n) => p.get(n)));
      return p;
    }
  }

  const HELLO = {
    csharp: 'using System;\n\nConsole.WriteLine("Hallo Welt!");\n',
    python: 'print("Hallo Welt!")\n'
  };
  KON.newProject = function (lang, projName) {
    const p = new Project(lang, projName || 'MeinProjekt');
    const name = lang === 'csharp' ? 'Program.cs' : 'main.py';
    p.add(name, HELLO[lang]);
    p.openTab(name);
    if (lang === 'python') p.start = name;
    return p;
  };
  KON.Project = Project;

  /* Eindeutiger Projektname: „Name“, sonst „Name2“, „Name3“ … (except = Projekt, das gerade umbenannt wird) */
  KON.uniqueProjectName = function (projects, name, except) {
    const taken = (n) => projects.some((p) => p !== except && p.name === n);
    if (!taken(name)) return name;
    for (let i = 2; i < 1000; i++) if (!taken(name + i)) return name + i;
    return name;
  };

  /* Gespeicherten Zustand wiederherstellen. Altes Format: { projects: { csharp, python }, lang }.
   * Neues Format: { projects: [ … ], active }. Gibt immer mindestens ein Projekt zurück. */
  KON.restoreProjects = function (saved) {
    const list = [];
    let activeId = null;
    if (saved && saved.projects) {
      const old = !Array.isArray(saved.projects);
      const raw = old ? [saved.projects.csharp, saved.projects.python] : saved.projects;
      for (const o of raw) {
        if (!o) continue;
        let p;
        try { p = Project.fromJSON(o); } catch (e) { continue; }
        if (!p.files.length) continue;
        if (!p.open.length) p.openTab(p.files[0].name);
        if (list.some((q) => q.id === p.id)) p.id = KON.uid();
        p.name = KON.uniqueProjectName(list, p.name);
        list.push(p);
      }
      const wanted = old ? list.find((p) => p.lang === saved.lang) : list.find((p) => p.id === saved.active);
      if (wanted) activeId = wanted.id;
    }
    if (!list.length) list.push(KON.newProject('csharp'));
    if (!activeId) activeId = list[0].id;
    return { projects: list, activeId: activeId };
  };
})(window);
