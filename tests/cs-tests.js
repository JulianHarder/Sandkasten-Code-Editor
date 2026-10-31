/* C#-Interpreter-Tests: node tests/cs-tests.js */
const h = require('./harness.js');
const T = [];
const t = (name, code, expected, inputs, opts) => T.push({ name, code, expected, inputs, opts: opts || {} });
const main = (body, extra) => `using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Text;\n${extra || ''}\nclass Program {\n  static void Main(string[] args) {\n${body}\n  }\n}\n`;

t('Hello', main('Console.WriteLine("Hallo Welt");'), 'Hallo Welt\n');
t('Top-Level', 'Console.WriteLine("Top");\nint x = 5;\nConsole.WriteLine(x * 2);', 'Top\n10\n');
t('Arithmetik', main(`Console.WriteLine(7 / 2); Console.WriteLine(7.0 / 2); Console.WriteLine(7 % 3); Console.WriteLine(-7 / 2); Console.WriteLine(1 / 3.0);
int a = 10; double b = 4; Console.WriteLine(a / b); Console.WriteLine(a + " " + b); long l = 3000000000L; Console.WriteLine(l * 2);
Console.WriteLine(int.MaxValue + 1); Console.WriteLine((char)('a' + 1)); Console.WriteLine('a' + 1); Console.WriteLine((int)3.99); Console.WriteLine((double)5);
Console.WriteLine(0.1 + 0.2); Console.WriteLine(10 / 4 * 2.0); Console.WriteLine(5f / 2); Console.WriteLine(1.5m * 2);`),
  '3\n3,5\n1\n-3\n0,3333333333333333\n2,5\n10 4\n6000000000\n-2147483648\nb\n98\n3\n5\n0,30000000000000004\n4\n2,5\n3,0\n'.replace('3,0\n', '3,0\n'));
t('Strings', main(`string s = "Hallo Welt";
Console.WriteLine(s.Length); Console.WriteLine(s.ToUpper()); Console.WriteLine(s.Substring(6)); Console.WriteLine(s.Substring(0, 5)); Console.WriteLine(s.IndexOf("Welt"));
Console.WriteLine(s.Replace('l', 'L')); Console.WriteLine(s.Contains("llo")); Console.WriteLine(string.Join(", ", s.Split(' '))); Console.WriteLine(s[0]); Console.WriteLine(s.PadLeft(12, '*'));
Console.WriteLine("  x ".Trim() + "|"); Console.WriteLine(string.IsNullOrEmpty("")); Console.WriteLine("abc".CompareTo("abd")); Console.WriteLine(string.Concat("a", "b", "c")); Console.WriteLine($"{s} hat {s.Length} Zeichen");
Console.WriteLine(new string('-', 5)); Console.WriteLine(string.Format("{0} + {1} = {2}", 1, 2, 3)); Console.WriteLine(s.StartsWith("Hal") && s.EndsWith("elt"));
char[] cs = s.ToCharArray(); Array.Reverse(cs); Console.WriteLine(new string(cs));`),
  '10\nHALLO WELT\nWelt\nHallo\n6\nHaLLo WeLt\nTrue\nHallo, Welt\nH\n **Hallo Welt\nx|\nTrue\n-1\nabc\nHallo Welt hat 10 Zeichen\n-----\n1 + 2 = 3\nTrue\ntleW ollaH\n'.replace(' **Hallo Welt', '**Hallo Welt'));
t('Formatierung', main(`double d = 1234.5678; int n = 42;
Console.WriteLine($"{d:F2} {d:N1} {n:D5} {n:X} {d:E2} {0.256:P1} {d:0.00} {d:#,##0.0} {n,6}|{n,-6}|");
Console.WriteLine(d.ToString("F1")); Console.WriteLine(n.ToString("000")); Console.WriteLine(1234567.891.ToString("N2")); Console.WriteLine(12.5.ToString("C"));
Console.WriteLine(string.Format("{0:0.0}|{1,8:F2}|{2:D3}", 3.14159, 2.5, 7));`),
  '1234,57 1.234,6 00042 2A 1,23E+003 25,6 % 1234,57 1.234,6     42|42    |\n1234,6\n042\n1.234.567,89\n12,50 €\n3,1|    2,50|007\n');
t('Kontrollstrukturen', main(`for (int i = 0; i < 5; i++) { if (i == 3) continue; if (i == 4) break; Console.Write(i + " "); }
Console.WriteLine();
int k = 0; while (k < 3) { k++; } do { k--; } while (k > 0); Console.WriteLine(k);
foreach (var c in "abc") Console.Write(c); Console.WriteLine();
int x = 5; string r = x > 3 ? "gross" : "klein"; Console.WriteLine(r);
switch (x) { case 1: Console.WriteLine("eins"); break; case 5: case 6: Console.WriteLine("fuenf/sechs"); break; default: Console.WriteLine("anderes"); break; }
string day = "Mo"; switch (day) { case "Mo": Console.WriteLine("Montag"); break; }
for (int i = 1; i <= 3; i++) for (int j = 1; j <= 3; j++) if (i * j == 4) Console.WriteLine($"{i}*{j}");`),
  '0 1 2 \n0\nabc\ngross\nfuenf/sechs\nMontag\n2*2\n');
t('Arrays', main(`int[] a = {5, 3, 8, 1}; Array.Sort(a); Console.WriteLine(string.Join(",", a)); Console.WriteLine(a.Length);
int[] b = new int[3]; b[1] = 7; Console.WriteLine(b[0] + " " + b[1]); int[,] m = new int[2, 3]; m[1, 2] = 9; Console.WriteLine(m[1, 2] + " " + m.GetLength(0) + " " + m.Length);
string[] names = new string[] {"b", "a"}; Array.Sort(names); Console.WriteLine(names[0]); int[][] jag = new int[2][]; jag[0] = new int[] {1,2}; jag[1] = new int[] {3}; Console.WriteLine(jag[0][1] + jag[1][0]);
Console.WriteLine(a.Max() + " " + a.Min() + " " + a.Sum() + " " + a.Average()); var rev = a.Reverse().ToArray(); Console.WriteLine(rev[0]);
double[] ds = {1, 2.5}; Console.WriteLine(ds[0] + ds[1]); Console.WriteLine(Array.IndexOf(a, 8));
try { Console.WriteLine(a[10]); } catch (IndexOutOfRangeException e) { Console.WriteLine("Fehler: " + e.Message); }`),
  '1,3,5,8\n4\n0 7\n9 2 6\na\n5\n8 1 17 4,25\n8\n3,5\n3\nFehler: Der Index war außerhalb des Arraybereichs.\n');
t('List/Dictionary', main(`var list = new List<int> {3, 1, 2}; list.Add(5); list.Sort(); Console.WriteLine(string.Join(" ", list)); Console.WriteLine(list.Count + " " + list[0] + " " + list.Contains(2) + " " + list.IndexOf(5));
list.Remove(1); list.RemoveAt(0); list.Insert(0, 9); Console.WriteLine(string.Join(",", list)); list.Reverse(); Console.WriteLine(list[0]);
var d = new Dictionary<string, int>(); d["a"] = 1; d.Add("b", 2); d["a"] += 10; foreach (var kv in d) Console.WriteLine(kv.Key + "=" + kv.Value);
Console.WriteLine(d.ContainsKey("b") + " " + d.Count); if (d.TryGetValue("a", out int v)) Console.WriteLine(v); Console.WriteLine(string.Join(",", d.Keys)); 
var hs = new HashSet<int> {1, 2, 2, 3}; Console.WriteLine(hs.Count); var q = new Queue<string>(); q.Enqueue("x"); q.Enqueue("y"); Console.WriteLine(q.Dequeue() + q.Count);
var st = new Stack<int>(); st.Push(1); st.Push(2); Console.WriteLine(st.Pop() + " " + st.Peek());
try { var e = d["zzz"]; } catch (KeyNotFoundException ex) { Console.WriteLine(ex.Message); }`),
  '1 2 3 5\n4 1 True 3\n9,3,5\n5\na=11\nb=2\nTrue 2\n11\na,b\n3\nx1\n2 1\nDer angegebene Schlüssel \'zzz\' war nicht im Wörterbuch vorhanden.\n');
t('Klassen & Vererbung', `using System;
abstract class Tier { public string Name { get; set; } protected int alter; public static int Anzahl = 0;
  public Tier(string name, int alter) { Name = name; this.alter = alter; Anzahl++; }
  public abstract string Laut(); public virtual string Info() => $"{Name} ({alter}): {Laut()}"; }
class Hund : Tier { public Hund(string n) : base(n, 3) {} public override string Laut() => "Wuff"; public override string Info() => base.Info() + "!"; }
class Katze : Tier { public Katze(string n, int a) : base(n, a) {} public override string Laut() { return "Miau"; } }
interface IFlieger { void Fliegen(); }
class Vogel : Tier, IFlieger { public Vogel() : base("Piep", 1) {} public override string Laut() => "Tschirp"; public void Fliegen() { Console.WriteLine(Name + " fliegt"); } }
class Program { static void Main() {
  Tier[] ts = { new Hund("Rex"), new Katze("Mia", 5), new Vogel() };
  foreach (Tier t in ts) Console.WriteLine(t.Info());
  Console.WriteLine(Tier.Anzahl); IFlieger f = ts[2] as IFlieger; f.Fliegen(); Console.WriteLine(ts[0] is Hund); Console.WriteLine(ts[0] is Katze);
  if (ts[1] is Katze k && k.Name == "Mia") Console.WriteLine("Katze " + k.Name); Console.WriteLine(ts[0].GetType().Name);
} }`, 'Rex (3): Wuff!\nMia (5): Miau\nPiep (1): Tschirp\n3\nPiep fliegt\nTrue\nFalse\nKatze Mia\nHund\n');
t('Properties/Static/Overload', `using System;
class Konto { private double saldo; public double Saldo { get { return saldo; } private set { saldo = value; } } public string Inhaber { get; init; } = "?";
  public int Id { get; } public static int Counter; static Konto() { Counter = 100; }
  public Konto() { Id = ++Counter; } public void Einzahlen(double b) { if (b <= 0) throw new ArgumentException("Betrag muss positiv sein"); Saldo += b; }
  public void Einzahlen(int b) { Einzahlen((double)b); } public override string ToString() => $"Konto {Id}: {Saldo:F2}"; }
class Rechner { public static int Add(int a, int b) => a + b; public static double Add(double a, double b) => a + b; public static int Sum(params int[] n) { int s = 0; foreach (var x in n) s += x; return s; }
  public static string Gruss(string n, string g = "Hallo") => g + " " + n; }
class Program { static void Main() { var k = new Konto { Inhaber = "Ada" }; k.Einzahlen(50); k.Einzahlen(2.5); Console.WriteLine(k + " " + k.Inhaber);
  try { k.Einzahlen(-1); } catch (ArgumentException e) { Console.WriteLine(e.Message); } Console.WriteLine(new Konto().Id);
  Console.WriteLine(Rechner.Add(1, 2) + " " + Rechner.Add(1.5, 2) + " " + Rechner.Sum() + " " + Rechner.Sum(1, 2, 3) + " " + Rechner.Gruss("Bob") + " " + Rechner.Gruss(g: "Hi", n: "Al")); } }`,
  'Konto 101: 52,50 Ada\nBetrag muss positiv sein\n102\n3 3,5 0 6 Hallo Bob Hi Al\n');
t('Exceptions', main(`try { int z = 0; Console.WriteLine(5 / z); } catch (DivideByZeroException e) { Console.WriteLine("DBZ: " + e.Message); } finally { Console.WriteLine("finally"); }
try { int.Parse("abc"); } catch (FormatException e) { Console.WriteLine(e.Message); }
try { object o = "s"; int i = (int)o; } catch (InvalidCastException) { Console.WriteLine("cast"); }
try { string s = null; Console.WriteLine(s.Length); } catch (NullReferenceException e) { Console.WriteLine("NRE"); }
try { throw new MyEx("eigene", 7); } catch (MyEx e) when (e.Code > 5) { Console.WriteLine(e.Message + e.Code); }
try { try { throw new Exception("innen"); } catch (Exception e) { throw new InvalidOperationException("aussen", e); } } catch (Exception e) { Console.WriteLine(e.Message + "/" + e.InnerException.Message); }
try { throw new Exception("x"); } catch { Console.WriteLine("catch-all"); }
Console.WriteLine(Fn());`, 'class MyEx : Exception { public int Code; public MyEx(string m, int c) : base(m) { Code = c; } }\nclass X { }'),
  'DBZ: Es wurde versucht, durch 0 zu teilen.\nfinally\nDie Eingabezeichenfolge hatte ein ungültiges Format.\ncast\nNRE\neigene7\naussen/innen\ncatch-all\n1\n');
T[T.length - 1].code = main(`try { int z = 0; Console.WriteLine(5 / z); } catch (DivideByZeroException e) { Console.WriteLine("DBZ: " + e.Message); } finally { Console.WriteLine("finally"); }
try { int.Parse("abc"); } catch (FormatException e) { Console.WriteLine(e.Message); }
try { object o = "s"; int i = (int)o; } catch (InvalidCastException) { Console.WriteLine("cast"); }
try { string s = null; Console.WriteLine(s.Length); } catch (NullReferenceException e) { Console.WriteLine("NRE"); }
try { throw new MyEx("eigene", 7); } catch (MyEx e) when (e.Code > 5) { Console.WriteLine(e.Message + e.Code); }
try { try { throw new Exception("innen"); } catch (Exception e) { throw new InvalidOperationException("aussen", e); } } catch (Exception e) { Console.WriteLine(e.Message + "/" + e.InnerException.Message); }
try { throw new Exception("x"); } catch { Console.WriteLine("catch-all"); }
Console.WriteLine(Fn());`).replace('class Program {', 'class MyEx : Exception { public int Code; public MyEx(string m, int c) : base(m) { Code = c; } }\nclass Program {\n  static int Fn() { try { return 1; } finally { } }');
t('Unbehandelte Ausnahme', main('int[] a = new int[2];\nConsole.WriteLine("vorher");\na[5] = 1;'), 'vorher\n');
t('Pattern/Switch-Ausdruck', main(`object[] os = { 1, "text", 3.5, null, 'c', new int[] {1} };
foreach (var o in os) { string d = o switch { int n when n > 0 => "positiv " + n, int n => "int", string s => "string " + s.Length, double dd => "double", null => "null", char => "char", _ => "anderes" }; Console.WriteLine(d); }
int w = 15; string cat = w switch { < 10 => "klein", >= 10 and < 20 => "mittel", _ => "gross" }; Console.WriteLine(cat);
var p = (x: 1, y: 2); Console.WriteLine(p.x + p.y); (int a, int b) = (3, 4); Console.WriteLine(a * b); var (q, r) = (10, 3); Console.WriteLine(q % r);
if (os[0] is int i && i == 1) Console.WriteLine("eins"); Console.WriteLine(os[1] is not null);`),
  'positiv 1\nstring 4\ndouble\nnull\nchar\nanderes\nmittel\n3\n12\n1\neins\nTrue\n');
t('Enums/Structs/Records', `using System;
enum Farbe { Rot, Gruen = 5, Blau }
struct Punkt { public int X, Y; public Punkt(int x, int y) { X = x; Y = y; } public double Laenge() => Math.Sqrt(X * X + Y * Y); }
record Person(string Name, int Alter);
class Program { static void Main() {
  Farbe f = Farbe.Gruen; Console.WriteLine(f + " " + (int)f + " " + Farbe.Blau + " " + (Farbe)0); Console.WriteLine(Enum.Parse(typeof(Farbe), "Blau"));
  foreach (Farbe c in Enum.GetValues(typeof(Farbe))) Console.Write(c + ";"); Console.WriteLine();
  switch (f) { case Farbe.Rot: Console.WriteLine("rot"); break; case Farbe.Gruen: Console.WriteLine("gruen"); break; }
  Punkt p = new Punkt(3, 4); Punkt q = p; q.X = 10; Console.WriteLine(p.X + " " + q.X + " " + p.Laenge());
  var a = new Person("Ada", 36); var b = a with { Alter = 37 }; Console.WriteLine(a + " " + b.Alter + " " + (a == new Person("Ada", 36)));
} }`, 'Gruen 5 Blau Rot\nBlau\nRot;Gruen;Blau;\ngruen\n3 10 5\nPerson { Name = Ada, Alter = 36 } 37 True\n');
t('Lambdas/LINQ/Delegates', main(`Func<int, int> sq = x => x * x; Action<string> pr = s => Console.WriteLine("> " + s); Func<int, int, int> add = (a, b) => a + b;
pr("hi"); Console.WriteLine(sq(5) + add(1, 2));
var nums = new List<int> {5, 2, 8, 1, 9, 3};
Console.WriteLine(string.Join(",", nums.Where(n => n > 2).OrderBy(n => n).Select(n => n * 10)));
Console.WriteLine(nums.Sum() + " " + nums.Max() + " " + nums.Count(n => n % 2 == 1) + " " + nums.Any(n => n > 8) + " " + nums.All(n => n > 0) + " " + nums.First() + " " + nums.Last());
var words = new[] {"apfel", "birne", "kiwi", "ananas"}; var g = words.GroupBy(w => w.Length); foreach (var grp in g.OrderBy(x => x.Key)) Console.WriteLine(grp.Key + ": " + string.Join(",", grp));
Console.WriteLine(string.Join(" ", words.OrderByDescending(w => w.Length).ThenBy(w => w))); Console.WriteLine(nums.Skip(2).Take(2).ToList().Count);
var dict = words.ToDictionary(w => w, w => w.Length); Console.WriteLine(dict["kiwi"]); nums.ForEach(n => Console.Write(n)); Console.WriteLine();
Console.WriteLine(Enumerable.Range(1, 5).Select(i => i * i).Sum()); nums.Sort((a, b) => b.CompareTo(a)); Console.WriteLine(nums[0]); Console.WriteLine(words.Select(w => w.ToUpper()).First());`),
  '> hi\n28\n30,50,80,90\n28 9 4 True True 5 3\n4: kiwi\n5: apfel,birne\n6: ananas\nananas apfel birne kiwi\n2\n4\n528193\n55\n9\nAPFEL\n');
t('ref/out/params/local', main(`int a = 1, b = 2; Swap(ref a, ref b); Console.WriteLine(a + " " + b); int r; Teile(10, 3, out r); Console.WriteLine(r);
if (int.TryParse("42", out int n)) Console.WriteLine(n + 1); Console.WriteLine(int.TryParse("x", out int m) + " " + m);
int Fak(int k) => k <= 1 ? 1 : k * Fak(k - 1); Console.WriteLine(Fak(10));
static void Swap(ref int x, ref int y) { int t = x; x = y; y = t; }
static void Teile(int x, int y, out int rest) { rest = x % y; }`),
  '2 1\n1\n43\nFalse 0\n3628800\n');
t('Generics & Interfaces', `using System;
using System.Collections.Generic;
class Box<T> { public T Wert; public Box(T w) { Wert = w; } public override string ToString() => "Box(" + Wert + ")"; }
class Stapel<T> { private List<T> items = new List<T>(); public void Push(T x) { items.Add(x); } public T Pop() { var x = items[items.Count - 1]; items.RemoveAt(items.Count - 1); return x; } public int Count => items.Count; }
interface IForm { double Flaeche(); } class Kreis : IForm, IComparable<Kreis> { public double R; public Kreis(double r) { R = r; } public double Flaeche() => Math.PI * R * R; public int CompareTo(Kreis o) => R.CompareTo(o.R); }
class Program { static T Max<T>(T a, T b) where T : IComparable<T> { return a.CompareTo(b) > 0 ? a : b; }
static void Main() { var b = new Box<int>(5); Console.WriteLine(b); var s = new Stapel<string>(); s.Push("a"); s.Push("b"); Console.WriteLine(s.Pop() + s.Count); Console.WriteLine(Max(3, 7) + Max("a", "b"));
  var ks = new List<Kreis> { new Kreis(3), new Kreis(1), new Kreis(2) }; ks.Sort(); Console.WriteLine(ks[0].R + " " + ks[2].R); IForm f = ks[0]; Console.WriteLine(Math.Round(f.Flaeche(), 2)); } }`,
  'Box(5)\nb1\n7b\n1 3\n3,14\n');
t('ReadLine', main(`Console.Write("Name: "); string n = Console.ReadLine(); Console.Write("Alter: "); int a = int.Parse(Console.ReadLine()); Console.WriteLine($"{n} ist {a} Jahre alt");`), 'Name: Alter: Ada ist 36 Jahre alt\n', ['Ada', '36']);
t('StringBuilder/Math', main(`var sb = new StringBuilder(); for (int i = 0; i < 3; i++) sb.Append(i).Append(','); sb.AppendLine("x"); sb.Insert(0, "["); Console.Write(sb.ToString());
Console.WriteLine(Math.Sqrt(16) + " " + Math.Pow(2, 10) + " " + Math.Abs(-3) + " " + Math.Max(3, 7.5) + " " + Math.Floor(2.7) + " " + Math.Ceiling(2.1) + " " + Math.Round(2.5) + " " + Math.Round(3.5) + " " + Math.Round(2.567, 1) + " " + Math.PI);
var rnd = new Random(42); int r = rnd.Next(1, 7); Console.WriteLine(r >= 1 && r <= 6); Console.WriteLine(Math.Truncate(-2.7) + " " + Math.Sign(-5) + " " + (int)Math.Round(2.4));`),
  '[0,1,2,x\n4 1024 3 7,5 2 3 2 4 2,6 3,141592653589793\nTrue\n-2 -1 2\n');
t('Nullable/??', main(`int? a = null; Console.WriteLine(a.HasValue); a = 5; Console.WriteLine(a.Value + 1); string s = null; Console.WriteLine(s ?? "default"); Console.WriteLine(s?.Length);
int? b = a ?? 0; Console.WriteLine(b); s ??= "neu"; Console.WriteLine(s); double? d = 2.5; Console.WriteLine(d * 2);`), 'False\n6\ndefault\n\n5\nneu\n5\n');
t('Rekursion tief', `using System;\nclass P { static int F(int n) => n == 0 ? 0 : 1 + F(n - 1); static void Main() { Console.WriteLine(F(3000)); } }`, '3000\n');
t('Rueckgabecode', `using System;\nclass P { static int Main() { Console.WriteLine("x"); return 3; } }`, 'x\n');
t('Kompilierfehler Strichpunkt', 'class P { static void Main() { int x = 5\nConsole.WriteLine(x); } }', '');
t('Kompilierfehler Name', 'using System;\nclass P { static void Main() {\n int x = 5;\n Console.WriteLine(y);\n} }', '');
t('Typfehler', 'using System;\nclass P { static void Main() {\n int x = "text";\n} }', '');

t('Events/Delegates/Erweiterungen/using static', `using System;
using static System.Console;
using static System.Math;
delegate void Gruss(string name);
class Knopf { public event EventHandler Geklickt; public event Gruss Begruessung; public void Klick() { Geklickt?.Invoke(this, EventArgs.Empty); Begruessung?.Invoke("Ada"); } }
static class Helfer { public static string Laut(this string s) => s.ToUpper() + "!"; public static int Doppelt(this int x) => x * 2; }
class Datum : EventArgs { public int Wert; }
class Program {
  static void Gehoert(object s, EventArgs e) { WriteLine("Handler 1"); }
  static void Main() {
    var k = new Knopf();
    k.Geklickt += Gehoert;
    k.Geklickt += (s, e) => WriteLine("Handler 2");
    k.Begruessung += n => WriteLine("Hallo " + n);
    k.Klick();
    k.Geklickt -= Gehoert;
    k.Klick();
    WriteLine("abc".Laut() + " " + 21.Doppelt() + " " + Max(3, 9) + " " + PI);
    Gruss g = n => WriteLine("direkt " + n); g("x"); g += n => WriteLine("zweite " + n); g("y");
    WriteLine(new Datum { Wert = 5 }.Wert);
  } }`, 'Handler 1\nHandler 2\nHallo Ada\nHandler 2\nHallo Ada\nABC! 42 9 3,141592653589793\ndirekt x\ndirekt y\nzweite y\n5\n');

(async () => {
  const ctx = h.loadContext(h.CS_FILES);
  let pass = 0, fail = 0;
  for (const c of T) {
    ctx.KON.cs.setCulture('de');
    const files = [{ name: "Program.cs", content: c.code }];
    let r;
    try { r = await h.runProgram(ctx, 'csharp', files, 'Program.cs', c.inputs); } catch (e) { r = { out: '', err: 'JS-FEHLER ' + e.stack, code: -9 }; }
    const special = ['Unbehandelte Ausnahme', 'Kompilierfehler Strichpunkt', 'Kompilierfehler Name', 'Typfehler'].includes(c.name);
    if (special) { console.log('--- ' + c.name + ' ---\n' + (r.compile ? r.errors.map((e) => e.file + '(' + e.line + ',' + e.col + '): error ' + e.code + ': ' + e.message).join('\n') : r.out + r.err)); continue; }
    if (r.out === c.expected && !r.err) pass++; else { fail++; console.log('FEHLER: ' + c.name + '\n  erwartet: ' + JSON.stringify(c.expected) + '\n  erhalten: ' + JSON.stringify(r.out) + (r.err ? '\n  stderr: ' + r.err : '') + (r.compile ? '\n  compile: ' + r.errors.map((e) => e.line + ',' + e.col + ' ' + e.code + ' ' + e.message) : '')); }
  }
  console.log(`\nC#: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail ? 1 : 0);
})();
