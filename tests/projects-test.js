/* Projektliste: Speichern/Wiederherstellen, Migration vom alten Format, eindeutige Namen. */
const { loadContext } = require('./harness');
const ctx = loadContext(['js/editor/history.js', 'js/files/project.js']);
const KON = ctx.KON;
let ok = 0, bad = 0;
function check(name, cond) { if (cond) ok++; else { bad++; console.log('FEHLER: ' + name); } }

// Neuer Zustand: mehrere Projekte, Reihenfolge und aktives Projekt bleiben erhalten
const a = KON.newProject('csharp', 'Rechner'), b = KON.newProject('python', 'Spiel'), c = KON.newProject('csharp', 'Rechner2');
b.collapsed = true; b.used = 5;
const saved = JSON.parse(JSON.stringify({ projects: [a, b, c].map((p) => p.toJSON()), active: b.id }));
const r = KON.restoreProjects(saved);
check('drei Projekte', r.projects.length === 3);
check('Reihenfolge', r.projects.map((p) => p.name).join() === 'Rechner,Spiel,Rechner2');
check('aktives Projekt', r.activeId === b.id);
check('eingeklappt gemerkt', r.projects[1].collapsed === true && r.projects[1].used === 5);
check('Sprache', r.projects[1].lang === 'python' && r.projects[1].get('main.py'));

// Altes Format: { projects: { csharp, python }, lang }
const old = { lang: 'python', projects: { csharp: KON.newProject('csharp').toJSON(), python: KON.newProject('python').toJSON() } };
delete old.projects.csharp.id; delete old.projects.python.id;
const m = KON.restoreProjects(old);
check('Migration: zwei Projekte', m.projects.length === 2);
check('Migration: aktive Sprache', m.projects.find((p) => p.id === m.activeId).lang === 'python');
check('Migration: Namen eindeutig', m.projects[0].name !== m.projects[1].name);
check('Migration: IDs vergeben', m.projects[0].id && m.projects[1].id && m.projects[0].id !== m.projects[1].id);

// Leerer oder kaputter Zustand
check('ohne Zustand ein C#-Projekt', KON.restoreProjects(null).projects.length === 1 && KON.restoreProjects(null).projects[0].lang === 'csharp');
check('leere Projekte werden verworfen', KON.restoreProjects({ projects: [{ lang: 'csharp', name: 'x', files: [] }] }).projects[0].name === 'MeinProjekt');
check('unbekanntes aktives Projekt', KON.restoreProjects({ projects: [a.toJSON()], active: 'gibts-nicht' }).activeId === a.id);

// Doppelte IDs bekommen neue
const dup = KON.restoreProjects({ projects: [a.toJSON(), a.toJSON()], active: a.id });
check('doppelte ID', dup.projects[0].id !== dup.projects[1].id);

// Namen
const list = [a, c];
check('freier Name bleibt', KON.uniqueProjectName(list, 'Neu') === 'Neu');
check('belegter Name', KON.uniqueProjectName(list, 'Rechner') === 'Rechner3');
check('eigener Name zählt nicht', KON.uniqueProjectName(list, 'Rechner', a) === 'Rechner');

console.log('Projekte: ' + ok + ' bestanden, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
