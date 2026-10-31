/* Speichern & Öffnen: localStorage (Autosave), Ordner (File System Access API), ZIP-Rückfall */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const KEY = 'kon.editor.v1';
  const CODE_EXT = /\.(cs|py)$/i;
  const SKIP_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs', '.idea', '__pycache__', '.venv', 'venv']);

  const Storage = {
    supportsFS: typeof G.showDirectoryPicker === 'function',

    loadState() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    saveState(obj) {
      try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
    },
    clearState() { try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } },

    /* ---------- Ordner speichern ---------- */
    async pickParent() {
      return await G.showDirectoryPicker({ mode: 'readwrite' });
    },
    async writeFileTo(dir, path, content) {
      const parts = path.split('/');
      let d = dir;
      for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
      const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    },
    /* Neuen Ordner im gewählten Speicherort anlegen und alle Dateien schreiben */
    async saveNewFolder(project, folderName) {
      const parent = await Storage.pickParent();
      const dir = await parent.getDirectoryHandle(folderName, { create: true });
      for (const f of project.files) await Storage.writeFileTo(dir, f.name, f.content);
      return dir;
    },
    /* Geöffneten Ordner aktualisieren (Strg+S) */
    async writeBack(project) {
      const dir = project.dirHandle;
      if (!dir) return false;
      if (dir.queryPermission) {
        let p = await dir.queryPermission({ mode: 'readwrite' });
        if (p !== 'granted') p = await dir.requestPermission({ mode: 'readwrite' });
        if (p !== 'granted') return false;
      }
      for (const f of project.files) await Storage.writeFileTo(dir, f.name, f.content);
      return true;
    },

    /* ---------- Ordner öffnen ---------- */
    async readDir(dir, prefix, depth, out) {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          if (depth < 4 && !SKIP_DIRS.has(name) && !name.startsWith('.')) await Storage.readDir(handle, prefix + name + '/', depth + 1, out);
        } else if (CODE_EXT.test(name)) {
          const file = await handle.getFile();
          if (file.size < 2000000) out.push({ name: prefix + name, content: await file.text() });
        }
      }
    },
    async openFolder() {
      const dir = await G.showDirectoryPicker({ mode: 'readwrite' });
      const files = [];
      await Storage.readDir(dir, '', 0, files);
      return { name: dir.name, files: files, handle: dir };
    },

    /* ---------- Einzelne Dateien / Drag & Drop / Ordnerauswahl per <input> ---------- */
    async readFiles(fileList) {
      const out = [];
      for (const f of Array.from(fileList)) {
        if (!CODE_EXT.test(f.name) && !/\.txt$/i.test(f.name)) continue;
        if (f.size > 2000000) continue;
        const rel = f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name;
        if (rel.split('/').some((p) => SKIP_DIRS.has(p))) continue;
        out.push({ name: rel || f.name, content: await f.text() });
      }
      return out;
    },
    async readEntry(entry, prefix, out, depth) {
      if (entry.isFile) {
        if (!CODE_EXT.test(entry.name)) return;
        const file = await new Promise((res, rej) => entry.file(res, rej));
        if (file.size < 2000000) out.push({ name: prefix + entry.name, content: await file.text() });
      } else if (entry.isDirectory && depth < 4 && !SKIP_DIRS.has(entry.name)) {
        const reader = entry.createReader();
        const entries = [];
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          entries.push(...batch);
        }
        for (const e of entries) await Storage.readEntry(e, prefix + (depth === 0 ? '' : entry.name + '/'), out, depth + 1);
      }
    },
    async readDropped(dt) {
      const out = [];
      let dirName = null;
      if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
        const entries = [];
        for (const it of Array.from(dt.items)) { const e = it.webkitGetAsEntry(); if (e) entries.push(e); }
        for (const e of entries) {
          if (e.isDirectory && entries.length === 1) dirName = e.name;
          await Storage.readEntry(e, '', out, 0);
        }
        if (out.length || !dt.files.length) return { files: out, dirName: dirName };
        // Rückfall, falls der Browser keine Einträge liefert
      }
      return { files: await Storage.readFiles(dt.files), dirName: null };
    },

    /* ---------- ZIP ---------- */
    downloadZip(project) {
      const blob = KON.makeZip(project.files, project.name);
      Storage.download(blob, project.name + '.zip');
    },
    download(blob, filename) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
  };

  KON.Storage = Storage;
})(window);
