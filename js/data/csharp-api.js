/* Befehlsliste für die Autovervollständigung – C# (Stand: C# 14 / .NET 10). Alles lokal, nichts wird nachgeladen. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  KON.data = KON.data || {};

  const M = (name, sig, desc) => ({ name: name, kind: 'Methode', sig: sig, desc: desc });
  const P = (name, type, desc) => ({ name: name, kind: 'Eigenschaft', sig: type, desc: desc });
  const C = (name, type, desc) => ({ name: name, kind: 'Konstante', sig: type, desc: desc });
  const K = (name, desc) => ({ name: name, kind: 'Schlüsselwort', sig: '', desc: desc });
  const T = (name, desc) => ({ name: name, kind: 'Klasse', sig: '', desc: desc });
  const S = (name, text, desc) => ({ name: name, kind: 'Snippet', sig: '', desc: desc, insert: text });

  const keywords = [
    K('if', 'Führt den Block aus, wenn die Bedingung wahr ist.'), K('else', 'Alternativer Zweig einer if-Anweisung.'),
    K('for', 'Zählschleife: for (int i = 0; i < n; i++)'), K('foreach', 'Durchläuft alle Elemente einer Sammlung.'),
    K('while', 'Schleife, solange die Bedingung wahr ist.'), K('do', 'do { } while (Bedingung); – Schleife, die mindestens einmal läuft.'),
    K('switch', 'Mehrfachauswahl nach einem Wert.'), K('case', 'Fall innerhalb eines switch.'), K('default', 'Standardfall im switch bzw. Standardwert eines Typs.'),
    K('break', 'Beendet die Schleife oder den switch-Zweig.'), K('continue', 'Springt zur nächsten Schleifenrunde.'), K('return', 'Beendet die Methode und gibt optional einen Wert zurück.'),
    K('class', 'Deklariert eine Klasse.'), K('struct', 'Deklariert einen Werttyp.'), K('interface', 'Deklariert eine Schnittstelle.'), K('enum', 'Deklariert eine Aufzählung.'),
    K('record', 'Deklariert einen Datentyp mit Wertgleichheit.'), K('namespace', 'Gruppiert Typen in einem Namensraum.'), K('using', 'Importiert einen Namensraum bzw. gibt Ressourcen automatisch frei.'),
    K('new', 'Erzeugt ein Objekt oder Array.'), K('this', 'Verweis auf das aktuelle Objekt.'), K('base', 'Verweis auf die Basisklasse.'),
    K('public', 'Überall sichtbar.'), K('private', 'Nur innerhalb der Klasse sichtbar.'), K('protected', 'In der Klasse und abgeleiteten Klassen sichtbar.'), K('internal', 'Innerhalb der Assembly sichtbar.'),
    K('static', 'Gehört zur Klasse, nicht zum Objekt.'), K('const', 'Konstante, die sich nie ändert.'), K('readonly', 'Nur im Konstruktor zuweisbar.'),
    K('abstract', 'Unvollständige Klasse/Methode, die abgeleitet werden muss.'), K('virtual', 'Methode, die überschrieben werden darf.'), K('override', 'Überschreibt eine virtuelle Methode.'), K('sealed', 'Verhindert weitere Ableitung.'),
    K('try', 'Block, in dem Ausnahmen abgefangen werden.'), K('catch', 'Behandelt eine Ausnahme.'), K('finally', 'Wird immer ausgeführt, auch bei Fehlern.'), K('throw', 'Löst eine Ausnahme aus.'),
    K('var', 'Der Compiler leitet den Typ aus dem Wert ab.'), K('null', 'Kein Objekt / kein Wert.'), K('true', 'Wahrheitswert wahr.'), K('false', 'Wahrheitswert falsch.'),
    K('is', 'Prüft Typ oder Muster: x is string s'), K('as', 'Typumwandlung, die null liefert statt zu scheitern.'), K('typeof', 'Liefert das Type-Objekt eines Typs.'), K('nameof', 'Liefert den Namen eines Bezeichners als Text.'),
    K('out', 'Parameter, der einen Wert zurückgibt.'), K('ref', 'Parameter, der per Referenz übergeben wird.'), K('params', 'Beliebig viele Argumente als Array.'), K('void', 'Methode ohne Rückgabewert.'),
    K('get', 'Lesezugriff einer Eigenschaft.'), K('set', 'Schreibzugriff einer Eigenschaft.'), K('init', 'Schreibzugriff nur bei der Objekterzeugung.'), K('value', 'Der zugewiesene Wert in einem set-Accessor.'), K('when', 'Zusatzbedingung in catch oder case.')
  ];

  const types = [
    T('int', '32-Bit-Ganzzahl (−2.147.483.648 bis 2.147.483.647).'), T('long', '64-Bit-Ganzzahl.'), T('short', '16-Bit-Ganzzahl.'), T('byte', '8-Bit-Zahl von 0 bis 255.'),
    T('double', 'Gleitkommazahl mit doppelter Genauigkeit.'), T('float', 'Gleitkommazahl mit einfacher Genauigkeit (Suffix f).'), T('decimal', 'Exakte Dezimalzahl, ideal für Geld (Suffix m).'),
    T('bool', 'Wahrheitswert true oder false.'), T('char', 'Einzelnes Zeichen, z. B. \'a\'.'), T('string', 'Zeichenkette (unveränderlich).'), T('object', 'Basistyp aller Typen.'),
    T('List', 'Dynamische Liste: List<int> zahlen = new List<int>();'), T('Dictionary', 'Schlüssel-Wert-Sammlung: Dictionary<string, int>'), T('HashSet', 'Menge ohne doppelte Elemente.'),
    T('Queue', 'Warteschlange (FIFO).'), T('Stack', 'Stapel (LIFO).'), T('StringBuilder', 'Effizientes Zusammenbauen von Text (using System.Text;).'), T('Random', 'Zufallszahlengenerator.'),
    T('Console', 'Ein- und Ausgabe in der Konsole.'), T('Math', 'Mathematische Funktionen.'), T('Convert', 'Umwandlung zwischen Datentypen.'), T('DateTime', 'Datum und Uhrzeit.'),
    T('Exception', 'Basisklasse aller Ausnahmen.'), T('ArgumentException', 'Ungültiges Argument.'), T('InvalidOperationException', 'Vorgang im aktuellen Zustand ungültig.'),
    T('FormatException', 'Ungültiges Zahlen- oder Textformat.'), T('DivideByZeroException', 'Division durch null.'), T('IndexOutOfRangeException', 'Index außerhalb des Arrays.'),
    T('NullReferenceException', 'Zugriff auf null.'), T('KeyNotFoundException', 'Schlüssel nicht im Dictionary.'), T('NotImplementedException', 'Noch nicht implementiert.'),
    T('Environment', 'Informationen zur Umgebung, z. B. NewLine.'), T('Array', 'Statische Hilfsmethoden für Arrays.'), T('Enumerable', 'LINQ-Hilfsmethoden: Range, Repeat.'), T('Thread', 'Thread.Sleep(ms) pausiert das Programm.'),
    T('Func', 'Delegat mit Rückgabewert: Func<int, int>'), T('Action', 'Delegat ohne Rückgabewert: Action<string>'), T('Stopwatch', 'Zeitmessung (using System.Diagnostics;).'), T('TimeSpan', 'Zeitspanne.')
  ];

  const strInst = [
    P('Length', 'int', 'Anzahl der Zeichen.'), M('Substring', 'Substring(int start, int length)', 'Teil der Zeichenkette ab start.'), M('ToUpper', 'ToUpper()', 'Alles in Großbuchstaben.'),
    M('ToLower', 'ToLower()', 'Alles in Kleinbuchstaben.'), M('Trim', 'Trim()', 'Entfernt Leerraum an beiden Enden.'), M('TrimStart', 'TrimStart()', 'Entfernt Leerraum am Anfang.'), M('TrimEnd', 'TrimEnd()', 'Entfernt Leerraum am Ende.'),
    M('Split', 'Split(char separator)', 'Teilt den Text in ein string[].'), M('Replace', 'Replace(string alt, string neu)', 'Ersetzt alle Vorkommen.'), M('Contains', 'Contains(string wert)', 'Prüft, ob der Text enthalten ist.'),
    M('StartsWith', 'StartsWith(string wert)', 'Beginnt der Text mit wert?'), M('EndsWith', 'EndsWith(string wert)', 'Endet der Text mit wert?'), M('IndexOf', 'IndexOf(string wert)', 'Position des ersten Treffers oder -1.'),
    M('LastIndexOf', 'LastIndexOf(string wert)', 'Position des letzten Treffers oder -1.'), M('PadLeft', 'PadLeft(int breite, char zeichen)', 'Füllt links auf die Breite auf.'), M('PadRight', 'PadRight(int breite, char zeichen)', 'Füllt rechts auf die Breite auf.'),
    M('Insert', 'Insert(int index, string wert)', 'Fügt Text an der Position ein.'), M('Remove', 'Remove(int start, int count)', 'Entfernt Zeichen.'), M('ToCharArray', 'ToCharArray()', 'Wandelt den Text in ein char[].'),
    M('CompareTo', 'CompareTo(string andere)', 'Vergleicht zwei Texte (−1, 0, 1).'), M('Equals', 'Equals(string andere)', 'Gleichheit prüfen.'), M('ToString', 'ToString()', 'Text als string.')
  ];
  const listInst = [
    P('Count', 'int', 'Anzahl der Elemente.'), M('Add', 'Add(T item)', 'Hängt ein Element an.'), M('AddRange', 'AddRange(IEnumerable<T> items)', 'Hängt mehrere Elemente an.'), M('Insert', 'Insert(int index, T item)', 'Fügt an der Position ein.'),
    M('Remove', 'Remove(T item)', 'Entfernt das erste passende Element.'), M('RemoveAt', 'RemoveAt(int index)', 'Entfernt das Element an der Position.'), M('RemoveAll', 'RemoveAll(Predicate<T> p)', 'Entfernt alle passenden Elemente.'),
    M('Clear', 'Clear()', 'Entfernt alle Elemente.'), M('Contains', 'Contains(T item)', 'Ist das Element enthalten?'), M('IndexOf', 'IndexOf(T item)', 'Position oder -1.'), M('Sort', 'Sort()', 'Sortiert die Liste aufsteigend.'),
    M('Reverse', 'Reverse()', 'Kehrt die Reihenfolge um.'), M('Find', 'Find(Predicate<T> p)', 'Erstes passendes Element.'), M('FindAll', 'FindAll(Predicate<T> p)', 'Alle passenden Elemente.'), M('Exists', 'Exists(Predicate<T> p)', 'Gibt es ein passendes Element?'),
    M('ForEach', 'ForEach(Action<T> a)', 'Führt eine Aktion für jedes Element aus.'), M('ToArray', 'ToArray()', 'Kopiert in ein Array.'), M('GetRange', 'GetRange(int index, int count)', 'Teilliste.'),
    M('Where', 'Where(Func<T, bool> f)', 'LINQ: filtert Elemente.'), M('Select', 'Select(Func<T, R> f)', 'LINQ: wandelt jedes Element um.'), M('OrderBy', 'OrderBy(Func<T, K> f)', 'LINQ: sortiert aufsteigend.'),
    M('OrderByDescending', 'OrderByDescending(Func<T, K> f)', 'LINQ: sortiert absteigend.'), M('Sum', 'Sum()', 'LINQ: Summe.'), M('Average', 'Average()', 'LINQ: Durchschnitt.'), M('Max', 'Max()', 'LINQ: größter Wert.'), M('Min', 'Min()', 'LINQ: kleinster Wert.'),
    M('Count', 'Count()', 'LINQ: Anzahl (auch mit Bedingung).'), M('Any', 'Any()', 'LINQ: gibt es ein Element (passend)?'), M('All', 'All(Func<T, bool> f)', 'LINQ: erfüllen alle die Bedingung?'), M('First', 'First()', 'LINQ: erstes Element.'),
    M('FirstOrDefault', 'FirstOrDefault()', 'LINQ: erstes Element oder Standardwert.'), M('Last', 'Last()', 'LINQ: letztes Element.'), M('Take', 'Take(int n)', 'LINQ: die ersten n Elemente.'), M('Skip', 'Skip(int n)', 'LINQ: überspringt n Elemente.'),
    M('Distinct', 'Distinct()', 'LINQ: entfernt Duplikate.'), M('ToList', 'ToList()', 'LINQ: Kopie als Liste.'), M('GroupBy', 'GroupBy(Func<T, K> f)', 'LINQ: gruppiert nach Schlüssel.'), M('ToString', 'ToString()', 'Text.')
  ];
  const arrInst = [P('Length', 'int', 'Anzahl der Elemente.'), M('GetLength', 'GetLength(int dimension)', 'Länge einer Dimension.'), M('Clone', 'Clone()', 'Flache Kopie.'),
    ...listInst.filter((m) => ['Where', 'Select', 'OrderBy', 'OrderByDescending', 'Sum', 'Average', 'Max', 'Min', 'Count', 'Any', 'All', 'First', 'FirstOrDefault', 'Last', 'Take', 'Skip', 'Distinct', 'ToList', 'Contains', 'Reverse'].includes(m.name))];
  const dictInst = [
    P('Count', 'int', 'Anzahl der Einträge.'), P('Keys', 'Dictionary<K,V>.KeyCollection', 'Alle Schlüssel.'), P('Values', 'Dictionary<K,V>.ValueCollection', 'Alle Werte.'), M('Add', 'Add(K key, V value)', 'Fügt einen Eintrag hinzu (Fehler bei Duplikat).'),
    M('TryAdd', 'TryAdd(K key, V value)', 'Fügt hinzu, falls der Schlüssel fehlt.'), M('TryGetValue', 'TryGetValue(K key, out V value)', 'Liest sicher einen Wert.'), M('ContainsKey', 'ContainsKey(K key)', 'Gibt es den Schlüssel?'),
    M('ContainsValue', 'ContainsValue(V value)', 'Gibt es den Wert?'), M('Remove', 'Remove(K key)', 'Entfernt den Eintrag.'), M('Clear', 'Clear()', 'Entfernt alles.'), M('GetValueOrDefault', 'GetValueOrDefault(K key)', 'Wert oder Standardwert.'),
    M('Where', 'Where(Func<KeyValuePair<K,V>, bool> f)', 'LINQ: filtert Einträge.'), M('OrderBy', 'OrderBy(Func<KeyValuePair<K,V>, T> f)', 'LINQ: sortiert Einträge.'), M('ToList', 'ToList()', 'LINQ: Einträge als Liste.')
  ];
  const setInst = [P('Count', 'int', 'Anzahl der Elemente.'), M('Add', 'Add(T item)', 'Fügt hinzu, gibt false bei Duplikat.'), M('Remove', 'Remove(T item)', 'Entfernt das Element.'), M('Contains', 'Contains(T item)', 'Ist es enthalten?'),
    M('Clear', 'Clear()', 'Leert die Menge.'), M('UnionWith', 'UnionWith(IEnumerable<T> other)', 'Vereinigung.'), M('IntersectWith', 'IntersectWith(IEnumerable<T> other)', 'Schnittmenge.'), M('ExceptWith', 'ExceptWith(IEnumerable<T> other)', 'Differenz.'),
    M('IsSubsetOf', 'IsSubsetOf(IEnumerable<T> other)', 'Teilmenge?'), M('Overlaps', 'Overlaps(IEnumerable<T> other)', 'Gemeinsame Elemente?')];
  const queueInst = [P('Count', 'int', 'Anzahl der Elemente.'), M('Enqueue', 'Enqueue(T item)', 'Hinten anstellen.'), M('Dequeue', 'Dequeue()', 'Vorderstes Element entnehmen.'), M('Peek', 'Peek()', 'Vorderstes Element ansehen.'),
    M('TryDequeue', 'TryDequeue(out T item)', 'Sicher entnehmen.'), M('Contains', 'Contains(T item)', 'Ist es enthalten?'), M('Clear', 'Clear()', 'Leert die Schlange.'), M('ToArray', 'ToArray()', 'Als Array.')];
  const stackInst = [P('Count', 'int', 'Anzahl der Elemente.'), M('Push', 'Push(T item)', 'Oben ablegen.'), M('Pop', 'Pop()', 'Oberstes Element entnehmen.'), M('Peek', 'Peek()', 'Oberstes Element ansehen.'),
    M('TryPop', 'TryPop(out T item)', 'Sicher entnehmen.'), M('Contains', 'Contains(T item)', 'Ist es enthalten?'), M('Clear', 'Clear()', 'Leert den Stapel.'), M('ToArray', 'ToArray()', 'Als Array.')];
  const sbInst = [P('Length', 'int', 'Aktuelle Länge.'), M('Append', 'Append(object value)', 'Hängt Text an.'), M('AppendLine', 'AppendLine(string value)', 'Hängt Text mit Zeilenumbruch an.'), M('Insert', 'Insert(int index, string value)', 'Fügt Text ein.'),
    M('Remove', 'Remove(int start, int length)', 'Entfernt Zeichen.'), M('Replace', 'Replace(string alt, string neu)', 'Ersetzt Text.'), M('Clear', 'Clear()', 'Leert den Builder.'), M('ToString', 'ToString()', 'Fertigen Text holen.')];
  const excInst = [P('Message', 'string', 'Fehlermeldung.'), P('InnerException', 'Exception', 'Auslösende Ausnahme.'), P('StackTrace', 'string', 'Aufrufliste.'), M('ToString', 'ToString()', 'Typ und Meldung als Text.'), M('GetType', 'GetType()', 'Laufzeittyp.')];
  const dtInst = [P('Year', 'int', 'Jahr.'), P('Month', 'int', 'Monat (1–12).'), P('Day', 'int', 'Tag.'), P('Hour', 'int', 'Stunde.'), P('Minute', 'int', 'Minute.'), P('Second', 'int', 'Sekunde.'), P('DayOfWeek', 'DayOfWeek', 'Wochentag.'),
    M('AddDays', 'AddDays(double tage)', 'Neues Datum.'), M('AddHours', 'AddHours(double h)', 'Neue Uhrzeit.'), M('AddMonths', 'AddMonths(int m)', 'Neues Datum.'), M('ToString', 'ToString(string format)', 'Formatiert, z. B. "dd.MM.yyyy".')];
  const objInst = [M('ToString', 'ToString()', 'Text-Darstellung.'), M('Equals', 'Equals(object o)', 'Gleichheit prüfen.'), M('GetHashCode', 'GetHashCode()', 'Hashwert.'), M('GetType', 'GetType()', 'Laufzeittyp.')];
  const numInst = [M('ToString', 'ToString(string format)', 'Text, z. B. "F2" für 2 Nachkommastellen.'), M('CompareTo', 'CompareTo(T other)', 'Vergleicht (−1, 0, 1).'), M('Equals', 'Equals(T other)', 'Gleichheit prüfen.')];
  const charInst = [M('ToString', 'ToString()', 'Als Text.'), M('CompareTo', 'CompareTo(char c)', 'Vergleicht.')];

  const members = {
    'static:Console': [M('WriteLine', 'WriteLine(string value)', 'Gibt Text aus und springt in die nächste Zeile.'), M('Write', 'Write(string value)', 'Gibt Text ohne Zeilenumbruch aus.'), M('ReadLine', 'ReadLine()', 'Liest eine Zeile von der Tastatur.'),
      M('ReadKey', 'ReadKey()', 'Liest eine Taste.'), M('Read', 'Read()', 'Liest ein Zeichen.'), M('Clear', 'Clear()', 'Leert die Konsole.'), P('ForegroundColor', 'ConsoleColor', 'Textfarbe.'), M('ResetColor', 'ResetColor()', 'Setzt die Farben zurück.'), M('Beep', 'Beep()', 'Piepton.')],
    'static:Math': [C('PI', 'double', 'Kreiszahl π.'), C('E', 'double', 'Eulersche Zahl.'), M('Sqrt', 'Sqrt(double x)', 'Quadratwurzel.'), M('Pow', 'Pow(double x, double y)', 'x hoch y.'), M('Abs', 'Abs(x)', 'Betrag.'), M('Max', 'Max(a, b)', 'Größerer Wert.'), M('Min', 'Min(a, b)', 'Kleinerer Wert.'),
      M('Round', 'Round(double x, int stellen)', 'Rundet (kaufmännisch zur geraden Zahl).'), M('Floor', 'Floor(double x)', 'Rundet ab.'), M('Ceiling', 'Ceiling(double x)', 'Rundet auf.'), M('Truncate', 'Truncate(double x)', 'Schneidet Nachkommastellen ab.'),
      M('Sin', 'Sin(double x)', 'Sinus (Bogenmaß).'), M('Cos', 'Cos(double x)', 'Kosinus.'), M('Tan', 'Tan(double x)', 'Tangens.'), M('Log', 'Log(double x)', 'Natürlicher Logarithmus.'), M('Log10', 'Log10(double x)', 'Zehnerlogarithmus.'),
      M('Exp', 'Exp(double x)', 'e hoch x.'), M('Sign', 'Sign(x)', 'Vorzeichen (−1, 0, 1).'), M('Clamp', 'Clamp(x, min, max)', 'Begrenzt einen Wert.')],
    'static:Convert': [M('ToInt32', 'ToInt32(object value)', 'Wandelt in int um.'), M('ToDouble', 'ToDouble(object value)', 'Wandelt in double um.'), M('ToString', 'ToString(object value)', 'Wandelt in Text um.'),
      M('ToBoolean', 'ToBoolean(object value)', 'Wandelt in bool um.'), M('ToChar', 'ToChar(object value)', 'Wandelt in char um.'), M('ToInt64', 'ToInt64(object value)', 'Wandelt in long um.'), M('ToDecimal', 'ToDecimal(object value)', 'Wandelt in decimal um.')],
    'static:string': [C('Empty', 'string', 'Leerer Text ("").'), M('Join', 'Join(string trenner, IEnumerable<T> werte)', 'Verbindet Elemente zu einem Text.'), M('Format', 'Format(string format, params object[] args)', 'Setzt Werte in {0}, {1} ein.'),
      M('IsNullOrEmpty', 'IsNullOrEmpty(string s)', 'Ist null oder leer?'), M('IsNullOrWhiteSpace', 'IsNullOrWhiteSpace(string s)', 'Ist null, leer oder nur Leerraum?'), M('Concat', 'Concat(params string[] s)', 'Hängt Texte aneinander.'), M('Compare', 'Compare(string a, string b)', 'Vergleicht zwei Texte.')],
    'static:int': [C('MaxValue', 'int', 'Größter int-Wert (2147483647).'), C('MinValue', 'int', 'Kleinster int-Wert.'), M('Parse', 'Parse(string s)', 'Wandelt Text in int um (Fehler bei ungültigem Text).'), M('TryParse', 'TryParse(string s, out int result)', 'Sicheres Umwandeln, gibt true/false.')],
    'static:double': [C('MaxValue', 'double', 'Größter double-Wert.'), C('NaN', 'double', 'Keine Zahl.'), C('PositiveInfinity', 'double', 'Plus unendlich.'), M('Parse', 'Parse(string s)', 'Wandelt Text in double um.'), M('TryParse', 'TryParse(string s, out double result)', 'Sicheres Umwandeln.'), M('IsNaN', 'IsNaN(double d)', 'Ist keine Zahl?')],
    'static:long': [C('MaxValue', 'long', 'Größter long-Wert.'), C('MinValue', 'long', 'Kleinster long-Wert.'), M('Parse', 'Parse(string s)', 'Wandelt Text in long um.'), M('TryParse', 'TryParse(string s, out long result)', 'Sicheres Umwandeln.')],
    'static:char': [M('IsDigit', 'IsDigit(char c)', 'Ist eine Ziffer?'), M('IsLetter', 'IsLetter(char c)', 'Ist ein Buchstabe?'), M('IsLetterOrDigit', 'IsLetterOrDigit(char c)', 'Buchstabe oder Ziffer?'), M('IsUpper', 'IsUpper(char c)', 'Großbuchstabe?'),
      M('IsLower', 'IsLower(char c)', 'Kleinbuchstabe?'), M('IsWhiteSpace', 'IsWhiteSpace(char c)', 'Leerraum?'), M('ToUpper', 'ToUpper(char c)', 'In Großbuchstaben.'), M('ToLower', 'ToLower(char c)', 'In Kleinbuchstaben.')],
    'static:Environment': [C('NewLine', 'string', 'Zeilenumbruch.'), M('Exit', 'Exit(int code)', 'Beendet das Programm.'), P('CurrentDirectory', 'string', 'Aktuelles Verzeichnis.')],
    'static:DateTime': [P('Now', 'DateTime', 'Aktuelles Datum und Uhrzeit.'), P('Today', 'DateTime', 'Heutiges Datum.'), M('DaysInMonth', 'DaysInMonth(int jahr, int monat)', 'Tage im Monat.'), M('IsLeapYear', 'IsLeapYear(int jahr)', 'Schaltjahr?')],
    'static:Array': [M('Sort', 'Sort(Array array)', 'Sortiert das Array.'), M('Reverse', 'Reverse(Array array)', 'Kehrt das Array um.'), M('IndexOf', 'IndexOf(Array a, object v)', 'Position des Werts.'), M('Copy', 'Copy(Array quelle, Array ziel, int n)', 'Kopiert Elemente.'),
      M('Resize', 'Resize(ref T[] array, int n)', 'Ändert die Größe.'), M('Fill', 'Fill(T[] array, T value)', 'Füllt das Array.'), M('Clear', 'Clear(Array a, int index, int n)', 'Setzt Elemente zurück.')],
    'static:Enumerable': [M('Range', 'Range(int start, int count)', 'Zahlenfolge.'), M('Repeat', 'Repeat(T element, int count)', 'Wiederholt ein Element.'), M('Empty', 'Empty<T>()', 'Leere Sequenz.')],
    'static:Thread': [M('Sleep', 'Sleep(int millisekunden)', 'Pausiert das Programm.')],
    'static:Random': [P('Shared', 'Random', 'Gemeinsamer Zufallsgenerator.')],
    string: strInst, List: listInst, array: arrInst, Dictionary: dictInst, HashSet: setInst, Queue: queueInst, Stack: stackInst, StringBuilder: sbInst, Exception: excInst, DateTime: dtInst,
    object: objInst, int: numInst, double: numInst, char: charInst,
    Random: [M('Next', 'Next(int min, int max)', 'Zufällige Ganzzahl in [min, max).'), M('NextDouble', 'NextDouble()', 'Zufallszahl zwischen 0 und 1.')]
  };

  const snippets = [
    S('cw', 'Console.WriteLine($0);', 'Gibt eine Zeile aus.'), S('cr', 'Console.ReadLine()', 'Liest eine Zeile.'),
    S('for', 'for (int i = 0; i < $0; i++)\n{\n    \n}', 'Zählschleife.'), S('foreach', 'foreach (var item in $0)\n{\n    \n}', 'Schleife über eine Sammlung.'),
    S('while', 'while ($0)\n{\n    \n}', 'while-Schleife.'), S('if', 'if ($0)\n{\n    \n}', 'if-Anweisung.'), S('ifelse', 'if ($0)\n{\n    \n}\nelse\n{\n    \n}', 'if mit else.'),
    S('switch', 'switch ($0)\n{\n    case 1:\n        break;\n    default:\n        break;\n}', 'switch-Anweisung.'), S('try', 'try\n{\n    $0\n}\ncatch (Exception ex)\n{\n    Console.WriteLine(ex.Message);\n}', 'try/catch-Block.'),
    S('class', 'class $0\n{\n    \n}', 'Klasse.'), S('prop', 'public $0 Name { get; set; }', 'Auto-Eigenschaft.'), S('ctor', 'public $0()\n{\n    \n}', 'Konstruktor.'),
    S('main', 'static void Main(string[] args)\n{\n    $0\n}', 'Main-Methode.'), S('method', 'static void $0()\n{\n    \n}', 'Statische Methode.')
  ];

  KON.data.csharp = { version: 'C# 14 / .NET 10', keywords: keywords, types: types, members: members, snippets: snippets };
})(window);
