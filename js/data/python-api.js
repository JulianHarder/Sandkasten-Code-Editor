/* Befehlsliste für die Autovervollständigung – Python (Stand: Python 3.14). Alles lokal, nichts wird nachgeladen. */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  KON.data = KON.data || {};

  const F = (name, sig, desc) => ({ name: name, kind: 'Methode', sig: sig, desc: desc });
  const C = (name, type, desc) => ({ name: name, kind: 'Konstante', sig: type, desc: desc });
  const K = (name, desc) => ({ name: name, kind: 'Schlüsselwort', sig: '', desc: desc });
  const T = (name, desc) => ({ name: name, kind: 'Klasse', sig: '', desc: desc });
  const S = (name, text, desc) => ({ name: name, kind: 'Snippet', sig: '', desc: desc, insert: text });

  const keywords = [
    K('if', 'Führt den Block aus, wenn die Bedingung wahr ist.'), K('elif', 'Weitere Bedingung nach if.'), K('else', 'Alternativer Zweig.'), K('for', 'Schleife über eine Sammlung: for x in liste:'),
    K('while', 'Schleife, solange die Bedingung wahr ist.'), K('break', 'Beendet die Schleife.'), K('continue', 'Springt zur nächsten Runde.'), K('pass', 'Platzhalter, tut nichts.'),
    K('def', 'Definiert eine Funktion.'), K('return', 'Beendet die Funktion und gibt einen Wert zurück.'), K('class', 'Definiert eine Klasse.'), K('lambda', 'Kleine namenlose Funktion: lambda x: x * 2'),
    K('try', 'Block, in dem Fehler abgefangen werden.'), K('except', 'Behandelt einen Fehler.'), K('finally', 'Wird immer ausgeführt.'), K('raise', 'Löst einen Fehler aus.'),
    K('import', 'Lädt ein Modul.'), K('from', 'from modul import name'), K('as', 'Vergibt einen Alias.'), K('with', 'Kontextmanager-Block.'),
    K('in', 'Enthaltensein bzw. Schleifenvariable.'), K('is', 'Identitätsvergleich (z. B. is None).'), K('not', 'Logisches Nicht.'), K('and', 'Logisches Und.'), K('or', 'Logisches Oder.'),
    K('None', 'Kein Wert.'), K('True', 'Wahrheitswert wahr.'), K('False', 'Wahrheitswert falsch.'), K('global', 'Verweist auf eine globale Variable.'), K('nonlocal', 'Verweist auf eine Variable der äußeren Funktion.'),
    K('assert', 'Prüft eine Bedingung.'), K('del', 'Löscht eine Variable oder ein Element.')
  ];
  const builtins = [
    F('print', 'print(*werte, sep=" ", end="\\n")', 'Gibt Werte in der Konsole aus.'), F('input', 'input(prompt="")', 'Liest eine Zeile von der Tastatur (als str).'), F('len', 'len(objekt)', 'Anzahl der Elemente.'),
    F('range', 'range(start, stop, step)', 'Zahlenfolge für Schleifen.'), F('int', 'int(wert)', 'Wandelt in eine Ganzzahl um.'), F('float', 'float(wert)', 'Wandelt in eine Kommazahl um.'), F('str', 'str(wert)', 'Wandelt in Text um.'),
    F('bool', 'bool(wert)', 'Wandelt in einen Wahrheitswert um.'), F('list', 'list(iterable)', 'Erzeugt eine Liste.'), F('dict', 'dict()', 'Erzeugt ein Dictionary.'), F('set', 'set(iterable)', 'Erzeugt eine Menge.'), F('tuple', 'tuple(iterable)', 'Erzeugt ein Tupel.'),
    F('abs', 'abs(x)', 'Betrag.'), F('min', 'min(iterable)', 'Kleinster Wert.'), F('max', 'max(iterable)', 'Größter Wert.'), F('sum', 'sum(iterable)', 'Summe.'), F('sorted', 'sorted(iterable, key=None, reverse=False)', 'Neue sortierte Liste.'),
    F('reversed', 'reversed(sequenz)', 'Umgekehrte Reihenfolge.'), F('enumerate', 'enumerate(iterable, start=0)', 'Paare aus Index und Wert.'), F('zip', 'zip(*iterables)', 'Verbindet Sammlungen elementweise.'),
    F('map', 'map(funktion, iterable)', 'Wendet eine Funktion auf alle Elemente an.'), F('filter', 'filter(funktion, iterable)', 'Behält passende Elemente.'), F('round', 'round(zahl, stellen)', 'Rundet (zur geraden Zahl bei .5).'),
    F('pow', 'pow(x, y)', 'x hoch y.'), F('divmod', 'divmod(a, b)', 'Ergebnis und Rest.'), F('isinstance', 'isinstance(objekt, typ)', 'Prüft den Typ.'), F('type', 'type(objekt)', 'Typ eines Objekts.'),
    F('chr', 'chr(code)', 'Zeichen zu Zahlencode.'), F('ord', 'ord(zeichen)', 'Zahlencode eines Zeichens.'), F('any', 'any(iterable)', 'Ist mindestens ein Element wahr?'), F('all', 'all(iterable)', 'Sind alle Elemente wahr?'),
    F('repr', 'repr(objekt)', 'Entwickler-Darstellung als Text.'), F('format', 'format(wert, spec)', 'Formatiert einen Wert.'), F('hex', 'hex(zahl)', 'Hexadezimal-Text.'), F('bin', 'bin(zahl)', 'Binär-Text.'),
    F('hasattr', 'hasattr(objekt, name)', 'Hat das Objekt das Attribut?'), F('getattr', 'getattr(objekt, name, standard)', 'Liest ein Attribut.'), F('setattr', 'setattr(objekt, name, wert)', 'Setzt ein Attribut.'),
    F('iter', 'iter(objekt)', 'Erzeugt einen Iterator.'), F('next', 'next(iterator, standard)', 'Nächstes Element.'), F('callable', 'callable(objekt)', 'Ist aufrufbar?'), F('exit', 'exit(code=0)', 'Beendet das Programm.'),
    F('super', 'super()', 'Zugriff auf die Basisklasse.'), F('property', 'property(fget)', 'Eigenschaft einer Klasse.'), F('staticmethod', 'staticmethod(f)', 'Statische Methode.'), F('classmethod', 'classmethod(f)', 'Klassenmethode.')
  ];
  const types = [T('int', 'Ganzzahl beliebiger Größe.'), T('float', 'Kommazahl.'), T('str', 'Text.'), T('bool', 'True oder False.'), T('list', 'Veränderliche Liste.'), T('dict', 'Schlüssel-Wert-Sammlung.'),
    T('set', 'Menge ohne Duplikate.'), T('tuple', 'Unveränderliche Reihe.'), T('range', 'Zahlenfolge.'), T('Exception', 'Basisklasse der Fehler.'), T('ValueError', 'Ungültiger Wert.'), T('TypeError', 'Falscher Typ.'),
    T('KeyError', 'Schlüssel fehlt.'), T('IndexError', 'Index außerhalb.'), T('ZeroDivisionError', 'Division durch null.'), T('NameError', 'Name nicht definiert.'), T('AttributeError', 'Attribut fehlt.'),
    T('RuntimeError', 'Allgemeiner Laufzeitfehler.'), T('StopIteration', 'Iterator zu Ende.'), T('NotImplementedError', 'Noch nicht implementiert.'), T('object', 'Basis aller Klassen.')];

  const strM = [F('upper', 'upper()', 'Alles in Großbuchstaben.'), F('lower', 'lower()', 'Alles in Kleinbuchstaben.'), F('capitalize', 'capitalize()', 'Erster Buchstabe groß.'), F('title', 'title()', 'Jedes Wort groß.'),
    F('strip', 'strip()', 'Entfernt Leerraum an beiden Enden.'), F('lstrip', 'lstrip()', 'Entfernt Leerraum links.'), F('rstrip', 'rstrip()', 'Entfernt Leerraum rechts.'), F('split', 'split(sep=None)', 'Teilt in eine Liste.'),
    F('join', 'join(iterable)', 'Verbindet Elemente mit diesem Text.'), F('replace', 'replace(alt, neu)', 'Ersetzt alle Vorkommen.'), F('find', 'find(teil)', 'Position oder -1.'), F('index', 'index(teil)', 'Position (Fehler wenn nicht gefunden).'),
    F('count', 'count(teil)', 'Anzahl der Treffer.'), F('startswith', 'startswith(prefix)', 'Beginnt der Text damit?'), F('endswith', 'endswith(suffix)', 'Endet der Text damit?'), F('isdigit', 'isdigit()', 'Nur Ziffern?'),
    F('isalpha', 'isalpha()', 'Nur Buchstaben?'), F('isalnum', 'isalnum()', 'Nur Buchstaben und Ziffern?'), F('isspace', 'isspace()', 'Nur Leerraum?'), F('format', 'format(*args)', 'Setzt Werte in {} ein.'),
    F('center', 'center(breite, fuell)', 'Zentriert im Feld.'), F('ljust', 'ljust(breite)', 'Links ausrichten.'), F('rjust', 'rjust(breite)', 'Rechts ausrichten.'), F('zfill', 'zfill(breite)', 'Mit Nullen auffüllen.'),
    F('splitlines', 'splitlines()', 'Teilt an Zeilenumbrüchen.'), F('swapcase', 'swapcase()', 'Tauscht Groß-/Kleinschreibung.'), F('partition', 'partition(sep)', 'Teilt in (davor, sep, danach).')];
  const listM = [F('append', 'append(x)', 'Hängt ein Element an.'), F('extend', 'extend(iterable)', 'Hängt mehrere Elemente an.'), F('insert', 'insert(i, x)', 'Fügt an Position i ein.'), F('remove', 'remove(x)', 'Entfernt das erste x.'),
    F('pop', 'pop(i=-1)', 'Entnimmt das Element an Position i.'), F('clear', 'clear()', 'Leert die Liste.'), F('index', 'index(x)', 'Position des ersten x.'), F('count', 'count(x)', 'Anzahl von x.'),
    F('sort', 'sort(key=None, reverse=False)', 'Sortiert die Liste.'), F('reverse', 'reverse()', 'Kehrt die Liste um.'), F('copy', 'copy()', 'Flache Kopie.')];
  const dictM = [F('get', 'get(key, standard=None)', 'Wert oder Standard.'), F('keys', 'keys()', 'Alle Schlüssel.'), F('values', 'values()', 'Alle Werte.'), F('items', 'items()', 'Paare (Schlüssel, Wert).'),
    F('pop', 'pop(key, standard)', 'Entfernt und liefert den Wert.'), F('update', 'update(andere)', 'Übernimmt Einträge.'), F('setdefault', 'setdefault(key, standard)', 'Wert holen oder setzen.'), F('clear', 'clear()', 'Leert das Dictionary.'),
    F('copy', 'copy()', 'Flache Kopie.'), F('popitem', 'popitem()', 'Entfernt den letzten Eintrag.')];
  const setM = [F('add', 'add(x)', 'Fügt ein Element hinzu.'), F('remove', 'remove(x)', 'Entfernt x (Fehler wenn fehlt).'), F('discard', 'discard(x)', 'Entfernt x, falls vorhanden.'), F('pop', 'pop()', 'Entnimmt ein Element.'),
    F('clear', 'clear()', 'Leert die Menge.'), F('union', 'union(andere)', 'Vereinigung.'), F('intersection', 'intersection(andere)', 'Schnittmenge.'), F('difference', 'difference(andere)', 'Differenz.'),
    F('issubset', 'issubset(andere)', 'Teilmenge?'), F('issuperset', 'issuperset(andere)', 'Obermenge?'), F('update', 'update(andere)', 'Fügt Elemente hinzu.')];
  const tupleM = [F('count', 'count(x)', 'Anzahl von x.'), F('index', 'index(x)', 'Position von x.')];

  const members = {
    str: strM, list: listM, dict: dictM, set: setM, tuple: tupleM,
    int: [F('bit_length', 'bit_length()', 'Anzahl der Bits.')], float: [F('is_integer', 'is_integer()', 'Ist ganzzahlig?')],
    'module:math': [C('pi', 'float', 'Kreiszahl π.'), C('e', 'float', 'Eulersche Zahl.'), C('inf', 'float', 'Unendlich.'), F('sqrt', 'sqrt(x)', 'Quadratwurzel.'), F('pow', 'pow(x, y)', 'x hoch y.'), F('floor', 'floor(x)', 'Rundet ab.'),
      F('ceil', 'ceil(x)', 'Rundet auf.'), F('sin', 'sin(x)', 'Sinus (Bogenmaß).'), F('cos', 'cos(x)', 'Kosinus.'), F('tan', 'tan(x)', 'Tangens.'), F('log', 'log(x, basis)', 'Logarithmus.'), F('log10', 'log10(x)', 'Zehnerlogarithmus.'),
      F('factorial', 'factorial(n)', 'Fakultät.'), F('gcd', 'gcd(a, b)', 'Größter gemeinsamer Teiler.'), F('fabs', 'fabs(x)', 'Betrag als float.'), F('radians', 'radians(grad)', 'Grad in Bogenmaß.'), F('degrees', 'degrees(rad)', 'Bogenmaß in Grad.'),
      F('hypot', 'hypot(x, y)', 'Länge der Hypotenuse.'), F('isclose', 'isclose(a, b)', 'Nahezu gleich?'), F('trunc', 'trunc(x)', 'Schneidet Nachkommastellen ab.')],
    'module:random': [F('random', 'random()', 'Zufallszahl zwischen 0 und 1.'), F('randint', 'randint(a, b)', 'Zufällige Ganzzahl von a bis b (inklusive).'), F('choice', 'choice(sequenz)', 'Zufälliges Element.'),
      F('shuffle', 'shuffle(liste)', 'Mischt die Liste.'), F('uniform', 'uniform(a, b)', 'Zufällige Kommazahl.'), F('randrange', 'randrange(start, stop)', 'Zufällige Zahl im Bereich.'), F('sample', 'sample(sequenz, k)', 'k verschiedene Elemente.'),
      F('seed', 'seed(wert)', 'Setzt den Startwert.')],
    'module:time': [F('time', 'time()', 'Sekunden seit 1970.'), F('sleep', 'sleep(sekunden)', 'Pausiert das Programm.'), F('perf_counter', 'perf_counter()', 'Genaue Zeitmessung.')],
    'module:sys': [F('exit', 'exit(code)', 'Beendet das Programm.'), C('argv', 'list', 'Programmargumente.'), C('maxsize', 'int', 'Größter Index-Wert.')],
    'module:collections': [T('Counter', 'Zählt Elemente.'), T('defaultdict', 'Dictionary mit Standardwerten.'), T('deque', 'Doppelt verkettete Warteschlange.'), T('OrderedDict', 'Dictionary mit Reihenfolge.')],
    'module:itertools': [F('permutations', 'permutations(iterable, r)', 'Alle Anordnungen.'), F('combinations', 'combinations(iterable, r)', 'Alle Kombinationen.'), F('product', 'product(*iterables)', 'Kartesisches Produkt.'),
      F('chain', 'chain(*iterables)', 'Verkettet Sammlungen.'), F('accumulate', 'accumulate(iterable)', 'Laufende Summe.')],
    'module:functools': [F('reduce', 'reduce(funktion, iterable)', 'Faltet die Elemente zu einem Wert.'), F('lru_cache', 'lru_cache', 'Merkt sich Ergebnisse.')],
    'module:statistics': [F('mean', 'mean(daten)', 'Mittelwert.'), F('median', 'median(daten)', 'Median.'), F('mode', 'mode(daten)', 'Häufigster Wert.'), F('stdev', 'stdev(daten)', 'Standardabweichung.')],
    'module:string': [C('ascii_letters', 'str', 'Alle Buchstaben.'), C('ascii_lowercase', 'str', 'Kleinbuchstaben.'), C('ascii_uppercase', 'str', 'Großbuchstaben.'), C('digits', 'str', 'Ziffern.'), C('punctuation', 'str', 'Satzzeichen.')]
  };
  const modules = ['math', 'random', 'time', 'sys', 'collections', 'itertools', 'functools', 'statistics', 'string', 'copy', 'json', 'datetime', 'typing', 'abc', 'os'];

  const snippets = [
    S('for', 'for i in range($0):\n    ', 'Zählschleife.'), S('foreach', 'for item in $0:\n    ', 'Schleife über eine Sammlung.'), S('while', 'while $0:\n    ', 'while-Schleife.'), S('if', 'if $0:\n    ', 'if-Anweisung.'),
    S('ifelse', 'if $0:\n    \nelse:\n    ', 'if mit else.'), S('def', 'def $0():\n    ', 'Funktion.'), S('class', 'class $0:\n    def __init__(self):\n        ', 'Klasse mit Konstruktor.'),
    S('try', 'try:\n    $0\nexcept Exception as e:\n    print(e)', 'try/except-Block.'), S('main', 'if __name__ == "__main__":\n    $0', 'Startpunkt des Programms.'), S('inp', 'input("$0")', 'Eingabe mit Frage.')
  ];

  KON.data.python = { version: 'Python 3.14', keywords: keywords, builtins: builtins, types: types, members: members, modules: modules, snippets: snippets };
})(window);
