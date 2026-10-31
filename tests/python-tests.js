/* Python-Interpreter-Tests: node tests/python-tests.js */
const h = require('./harness.js');
const T = [];
const t = (name, code, expected, inputs) => T.push({ name, code, expected, inputs });

t('print/Rechnen', `print(1+2, 7/2, 7//2, -7//2, 7%3, -7%3, 2**10, 2**-1, 10/5, 3*'ab', 1_000)`, `3 3.5 3 -4 1 2 1024 0.5 2.0 ababab 1000\n`);
t('Gleitkomma-Ausgabe', `print(0.1+0.2, 1e16, 1e-5, 123456789.123, 1/3, 2.5e-7, float('inf'), -0.0, 3.0, 1e22)`, `0.30000000000000004 1e+16 1e-05 123456789.123 0.3333333333333333 2.5e-07 inf -0.0 3.0 1e+22\n`);
t('Strings', `s = "Hallo Welt"\nprint(s.upper(), s.lower(), len(s), s[0], s[-1], s[1:4], s[::-1], s.replace("l","L"), s.split())\nprint("a,b,c".split(","), "-".join(["x","y"]), "  hi ".strip()+"|", s.find("W"), s.count("l"), s.startswith("Hal"))`, `HALLO WELT hallo welt 10 H t all tleW ollaH HaLLo WeLt ['Hallo', 'Welt']\n['a', 'b', 'c'] x-y hi| 6 3 True\n`);
t('f-Strings', `x = 3.14159\nname = "Ada"\nprint(f"{name} hat {x:.2f} und {x:8.3f}|{42:05d}|{255:x}|{name!r}|{'a':>4}|{'b':<4}|{'c':^5}|{1234567:,}")\nprint(f"{x=}")\nprint(f"{{literal}} {1+2}")`, `Ada hat 3.14 und    3.142|00042|ff|'Ada'|   a|b   |  c  |1,234,567\nx=3.14159\n{literal} 3\n`);
t('format & %', `print("{} und {}".format(1, "zwei"), "{0}{1}{0}".format("a","b"), "{name}".format(name="N"), "%d %s %.2f %5d|%-5d|" % (5, "x", 3.14159, 42, 42), "%05.1f" % 3.14159, "%x" % 255, "%c%%" % 65)`, `1 und zwei aba N 5 x 3.14    42|42   | 003.1 ff A%\n`);
t('Listen', `l = [3,1,2]\nl.append(5); l.extend([7,8]); l.insert(0, 9)\nprint(l, len(l), l[1:3], l[-1], sorted(l), sorted(l, reverse=True), sum(l), min(l), max(l))\nl.sort(); print(l); l.reverse(); print(l); print(l.pop(), l.pop(0), l)\nprint([x*x for x in range(5) if x%2==0], list(range(0,10,3)), 3 in l, l.index(5), l.count(5))`, `[9, 3, 1, 2, 5, 7, 8] 7 [3, 1] 8 [1, 2, 3, 5, 7, 8, 9] [9, 8, 7, 5, 3, 2, 1] 35 1 9\n[1, 2, 3, 5, 7, 8, 9]\n[9, 8, 7, 5, 3, 2, 1]\n1 9 [8, 7, 5, 3, 2]\n[0, 4, 16] [0, 3, 6, 9] True 2 1\n`);
t('Dicts', `d = {"a": 1, "b": 2}\nd["c"] = 3\nprint(d, d["a"], d.get("z"), d.get("z", 0), list(d.keys()), list(d.values()), list(d.items()))\nfor k, v in d.items(): print(k, v, end="; ")\nprint()\nprint("a" in d, len(d), d.pop("a"), d)\nprint({k: v*2 for k, v in d.items()})\nd.update({"x": 9}); print(d)`, `{'a': 1, 'b': 2, 'c': 3} 1 None 0 ['a', 'b', 'c'] [1, 2, 3] [('a', 1), ('b', 2), ('c', 3)]\na 1; b 2; c 3; \nTrue 3 1 {'b': 2, 'c': 3}\n{'b': 4, 'c': 6}\n{'b': 2, 'c': 3, 'x': 9}\n`);
t('Tupel/Mengen', `t = (1, 2, 3)\na, b, c = t\nprint(a, b, c, t[1:], len(t), t + (4,))\ns = {1, 2, 3}; s.add(4); s.discard(1)\nprint(s, {1,2} | {2,3}, {1,2} & {2,3}, {1,2} - {2,3}, sorted({3,1,2}))\nx, *rest = [1,2,3,4]\nprint(x, rest)\na, b = b, a; print(a, b)`, `1 2 3 (2, 3) 3 (1, 2, 3, 4)\n{2, 3, 4} {1, 2, 3} {2} {1} [1, 2, 3]\n1 [2, 3, 4]\n2 1\n`);
t('Schleifen', `for i in range(3): print(i, end=" ")\nprint()\ni = 0\nwhile i < 3:\n    i += 1\n    if i == 2: continue\n    print(i)\nfor x in [1,2,3]:\n    if x == 2: break\nelse:\n    print("nie")\nfor x in []:\n    pass\nelse:\n    print("else")\nfor i, c in enumerate("ab"): print(i, c)\nfor a, b in zip([1,2],[3,4]): print(a+b)`, `0 1 2 \n1\n3\nelse\n0 a\n1 b\n4\n6\n`);
t('Funktionen', `def f(a, b=2, *args, c=5, **kw):\n    return a, b, args, c, kw\nprint(f(1))\nprint(f(1, 3, 4, 5, c=6, d=7))\ndef g(x):\n    def inner(y): return x + y\n    return inner\nprint(g(3)(4))\nsq = lambda n: n*n\nprint(sq(5), list(map(sq, [1,2,3])), list(filter(lambda v: v>1, [1,2,3])))\nprint(f(*[1,2], **{"c": 9}))`, `(1, 2, (), 5, {})\n(1, 3, (4, 5), 6, {'d': 7})\n7\n25 [1, 4, 9] [2, 3]\n(1, 2, (), 9, {})\n`);
t('global/nonlocal', `count = 0\ndef inc():\n    global count\n    count += 1\ninc(); inc(); print(count)\ndef outer():\n    n = 0\n    def inner():\n        nonlocal n\n        n += 1\n        return n\n    inner(); return inner()\nprint(outer())`, `2\n2\n`);
t('Klassen', `class Tier:\n    anzahl = 0\n    def __init__(self, name):\n        self.name = name\n        Tier.anzahl += 1\n    def laut(self): return "..."\n    def __str__(self): return f"{type(self).__name__} {self.name}"\nclass Hund(Tier):\n    def laut(self): return "Wuff"\n    def __init__(self, name, rasse):\n        super().__init__(name)\n        self.rasse = rasse\nh = Hund("Rex", "Collie")\nprint(h, h.laut(), Tier.anzahl, isinstance(h, Tier), isinstance(h, Hund), h.rasse)\nt = Tier("X"); print(t.laut(), t)\nprint(h.__class__.__name__, hasattr(h, "name"), getattr(h, "zz", 7))`, `Hund Rex Wuff 1 True True Collie\n... Tier X\nHund True 7\n`);
t('Dunder/Property', `class V:\n    def __init__(self, x, y): self.x, self.y = x, y\n    def __add__(self, o): return V(self.x+o.x, self.y+o.y)\n    def __eq__(self, o): return self.x == o.x and self.y == o.y\n    def __lt__(self, o): return self.x < o.x\n    def __repr__(self): return f"V({self.x}, {self.y})"\n    def __len__(self): return 2\n    def __getitem__(self, i): return (self.x, self.y)[i]\n    @property\n    def betrag(self): return (self.x**2 + self.y**2) ** 0.5\n    @staticmethod\n    def null(): return V(0, 0)\n    @classmethod\n    def von(cls, t): return cls(*t)\nv = V(3, 4) + V(0, 0)\nprint(v, v.betrag, v == V(3,4), len(v), v[1], V.null(), V.von((1,2)), sorted([V(2,0), V(1,0)]), V(1,2) != V(1,3))\nprint(list(v))`, `V(3, 4) 5.0 True 2 4 V(0, 0) V(1, 2) [V(1, 0), V(2, 0)] True\n[3, 4]\n`);
t('Ausnahmen', `try:\n    1/0\nexcept ZeroDivisionError as e:\n    print("Fehler:", e)\ntry:\n    int("abc")\nexcept ValueError as e:\n    print(e)\ntry:\n    [1][5]\nexcept (IndexError, KeyError) as e:\n    print(type(e).__name__, e)\ntry:\n    {}["k"]\nexcept KeyError as e:\n    print(repr(e), e)\nclass MeinFehler(Exception):\n    pass\ntry:\n    raise MeinFehler("kaputt")\nexcept Exception as e:\n    print(e, type(e).__name__)\nfinally:\n    print("fertig")\ndef f():\n    try: return 1\n    finally: print("fin")\nprint(f())\ntry:\n    undefined_name\nexcept NameError as e: print(e)\ntry:\n    "a" + 1\nexcept TypeError as e: print(e)\ntry:\n    None.x\nexcept AttributeError as e: print(e)\nelse: pass`, `Fehler: division by zero\ninvalid literal for int() with base 10: 'abc'\nIndexError list index out of range\nKeyError('k') 'k'\nkaputt MeinFehler\nfertig\nfin\n1\nname 'undefined_name' is not defined\ncan only concatenate str (not "int") to str\n'NoneType' object has no attribute 'x'\n`);
t('input', `name = input("Name? ")\nzahl = int(input("Zahl: "))\nprint(f"Hallo {name}, {zahl*2}")`, `Name? Zahl: Hallo Ada, 42\n`, ['Ada', '21']);
t('Module', `import math, random\nfrom math import sqrt, pi\nprint(math.sqrt(16), sqrt(2), round(pi, 3), math.floor(2.7), math.ceil(2.1), math.factorial(20), math.gcd(12, 18))\nrandom.seed(1)\nr = random.randint(1, 6)\nprint(1 <= r <= 6, 0 <= random.random() < 1, random.choice([5]))`, `4.0 1.4142135623730951 3.142 2 3 2432902008176640000 6\nTrue True 5\n`);
t('Mehrere Dateien', `import rechner\nfrom rechner import quad\nprint(rechner.add(1, 2), quad(3), rechner.__name__)`, `3 9 rechner\n`);
t('__main__', `if __name__ == "__main__":\n    print("main")`, `main\n`);
t('Builtins', `print(abs(-3), round(2.5), round(3.5), round(2.675, 2), divmod(7, 2), pow(2, 5), chr(65), ord("a"), bool(0), bool("x"), int(3.9), int("42"), float("1.5"), str(12), list("abc"), tuple([1]), any([0,1]), all([1,0]), max("abc"), min(3,1,2), sorted("bca"), reversed([1,2]).__class__.__name__)\nprint(bin(5), hex(255), oct(8), isinstance(1, int), isinstance(True, int), type(1) == int, type("a").__name__, id(1) > 0)\nprint(sorted(["b","a","C"], key=str.lower), sorted([(2,"b"),(1,"z")]), max([1,5,2], key=lambda x: -x))`, `3 2 4 2.67 (3, 1) 32 A 97 False True 3 42 1.5 12 ['a', 'b', 'c'] (1,) True False c 1 ['a', 'b', 'c'] iterator\n0b101 0xff 0o10 True True True str True\n['a', 'b', 'C'] [(1, 'z'), (2, 'b')] 1\n`);
t('Slicing', `l = list(range(10))\nprint(l[2:5], l[:3], l[7:], l[::2], l[::-1], l[-3:], l[1:-1:3], "hello"[1:3], l[8:2:-2])\nl[1:3] = [100, 200, 300]; print(l)\ndel l[0]; print(l[:3])`, `[2, 3, 4] [0, 1, 2] [7, 8, 9] [0, 2, 4, 6, 8] [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] [7, 8, 9] [1, 4, 7] el [8, 6, 4]\n[0, 100, 200, 300, 3, 4, 5, 6, 7, 8, 9]\n[100, 200, 300]\n`);
t('Fehler-Traceback', `def f(x):\n    return 1 / x\ndef g():\n    return f(0)\ng()`, ``);
t('Große Zahlen', `import math\nprint(2**100, math.factorial(25), 10**20 // 3, (-2)**3, 7 // -2, 1e3, int(1e3))`, `1267650600228229401496703205376 15511210043330985984000000 33333333333333333333 -8 -4 1000.0 1000\n`);
t('Vergleiche', `print(1 < 2 < 3, 1 == 1.0, "a" < "b", [1,2] < [1,3], (1,2) == (1,2), None is None, 1 is not None, not 0, 3 if 1 else 4, 0 or "x", 1 and 2, True + True)`, `True True True True True True True True 3 x 2 2\n`);
t('Generator-Ausdruck/sum', `print(sum(x for x in range(5)), sum([1.5, 2]), list(map(str, [1,2])), ",".join(str(i) for i in range(3)), max(len(w) for w in ["a","bbb"]))`, `10 3.5 ['1', '2'] 0,1,2 3\n`);
t('Rekursion', `def fak(n): return 1 if n <= 1 else n * fak(n - 1)\nprint(fak(20), fak(200) > 0)\ndef tief(n): return 0 if n == 0 else 1 + tief(n - 1)\nprint(tief(500))`, `2432902008176640000 True\n500\n`);
t('Rekursionsfehler', `def r(): return r()\ntry:\n    r()\nexcept RecursionError as e:\n    print("RecursionError:", e)`, `RecursionError: maximum recursion depth exceeded\n`);
t('collections', `from collections import Counter, defaultdict, deque\nc = Counter("hallo")\nprint(c["l"], c.most_common(1))\nd = defaultdict(list); d["a"].append(1); d["a"].append(2); print(dict(d))\nq = deque([1,2,3]); q.append(4); q.appendleft(0); print(q.popleft(), q.pop(), list(q), len(q))\nprint(q)`, `2 [('l', 2)]\n{'a': [1, 2]}\n0 4 [1, 2, 3] 3\ndeque([1, 2, 3])\n`);
t('Stringmethoden 2', `print("Hello".center(11, "*"), "42".zfill(5), "ab".ljust(4)+"|", "ab".rjust(4), "a b c".title(), "x".isalpha(), "12".isdigit(), "AbC".swapcase(), "a-b".partition("-"), "abc".index("c"), "tEsT".capitalize())`, `***Hello*** 00042 ab  |   ab A B C True True aBc ('a', '-', 'b') 2 Test\n`);
t('Syntaxfehler', `if x > 5\n    print(1)`, ``);
t('Einrückungsfehler', `def f():\nprint(1)`, ``);
t('with/Kontext', `class C:\n    def __enter__(self): print("rein"); return self\n    def __exit__(self, a, b, c): print("raus"); return False\nwith C() as c: print("drin")`, `rein\ndrin\nraus\n`);
t('Iteratoren', `class Zaehler:\n    def __init__(self, n): self.n = n; self.i = 0\n    def __iter__(self): return self\n    def __next__(self):\n        if self.i >= self.n: raise StopIteration\n        self.i += 1\n        return self.i\nprint(list(Zaehler(3)), sum(Zaehler(4)))\nit = iter([1,2]); print(next(it), next(it), next(it, "ende"))`, `[1, 2, 3] 10\n1 2 ende\n`);
t('sort stabil / key', `w = ["bb", "a", "ccc", "dd"]\nprint(sorted(w, key=len), sorted(w, key=len, reverse=True))\nw.sort(key=lambda s: (-len(s), s)); print(w)`, `['a', 'bb', 'dd', 'ccc'] ['ccc', 'bb', 'dd', 'a']\n['ccc', 'bb', 'dd', 'a']\n`);
t('Fehlermeldungen Aufruf', `def f(a, b): pass\ntry: f(1)\nexcept TypeError as e: print(e)\ntry: f(1, 2, 3)\nexcept TypeError as e: print(e)\ntry: f(1, c=2)\nexcept TypeError as e: print(e)\ntry: int([])\nexcept TypeError as e: print(e)`, `f() missing 1 required positional argument: 'b'\nf() takes 2 positional arguments but 3 were given\nf() got an unexpected keyword argument 'c'\nint() argument must be a string, a bytes-like object or a real number, not 'list'\n`);
t('Walross/ternär/chain', `if (n := 5) > 3: print(n)\nx = [1, 2, 3]\ny = x\ny.append(4); print(x, x is y, x == [1,2,3,4])\nprint("ja" if x else "nein", [i if i % 2 else -i for i in range(4)])\nz = [[0]*2 for _ in range(2)]; z[0][0] = 1; print(z)`, `5\n[1, 2, 3, 4] True True\nja [0, 1, -2, 3]\n[[1, 0], [0, 0]]\n`);
t('Endlosschleife-Abbruch', `n = 0\nwhile True:\n    n += 1\n    if n > 100000: break\nprint(n)`, `100001\n`);
t('Generatoren', `def zaehle(n):
    i = 0
    while i < n:
        yield i
        i += 1
def fib():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b
def verpackt():
    yield "start"
    yield from zaehle(3)
    return
g = zaehle(3)
print(next(g), next(g), list(g))
f = fib(); print([next(f) for _ in range(10)])
print(list(verpackt()), sum(zaehle(5)), type(g).__name__)
for x in zaehle(2): print("x", x)
def echo():
    while True:
        v = yield
        print("got", v)
e = echo(); next(e); e.send(5); e.send("hi")
print(next(zaehle(0), "ende"))`, `0 1 [2]\n[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n['start', 0, 1, 2] 10 generator\nx 0\nx 1\ngot 5\ngot hi\nende\n`);

(async () => {
  const ctx = h.loadContext(h.PY_FILES);
  let pass = 0, fail = 0;
  for (const c of T) {
    const files = [{ name: 'main.py', content: c.code }, { name: 'rechner.py', content: 'def add(a, b): return a + b\ndef quad(x): return x * x\n' }];
    let r;
    try { r = await h.runProgram(ctx, 'python', files, 'main.py', c.inputs); } catch (e) { r = { out: '', err: 'JS-FEHLER ' + e.stack, code: -9 }; }
    const ok = r.out === c.expected && !(c.expected !== '' && r.err) ;
    const special = (c.name === 'Fehler-Traceback' || c.name === 'Syntaxfehler' || c.name === 'Einrückungsfehler');
    if (special) { console.log('--- ' + c.name + ' ---\n' + (r.compile ? r.errors.map((e) => KON_fmt(ctx, e, files)).join('') : r.err)); continue; }
    if (ok) pass++; else { fail++; console.log('FEHLER: ' + c.name + '\n  erwartet: ' + JSON.stringify(c.expected) + '\n  erhalten: ' + JSON.stringify(r.out) + (r.err ? '\n  stderr: ' + r.err : '')); }
  }
  console.log(`\nPython: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail ? 1 : 0);
})();
function KON_fmt(ctx, e, files) { return ctx.KON.py.formatSyntaxError(e, files).map((l) => l.text).join(''); }
