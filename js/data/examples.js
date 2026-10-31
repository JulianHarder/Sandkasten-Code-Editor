/* Beispiel-Code-Schnipsel (Menü "Beispiele") */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};
  KON.data = KON.data || {};

  const cs = [
    { id: 'hello', title: 'Hello World', desc: 'Einfachste Ausgabe', files: [{ name: 'HelloWelt.cs', content:
`using System;

class HelloWelt
{
    static void Main()
    {
        Console.WriteLine("Hallo Welt!");
    }
}
` }] },
    { id: 'io', title: 'Eingabe & Ausgabe', desc: 'Namen abfragen und begrüßen', files: [{ name: 'EingabeAusgabe.cs', content:
`using System;

class EingabeAusgabe
{
    static void Main()
    {
        Console.Write("Wie heißt du? ");
        string name = Console.ReadLine();

        Console.Write("Wie alt bist du? ");
        int alter = int.Parse(Console.ReadLine());

        Console.WriteLine($"Hallo {name}! In 10 Jahren bist du {alter + 10}.");
    }
}
` }] },
    { id: 'calc', title: 'Taschenrechner', desc: 'Zwei Zahlen einlesen, Rechenart wählen', files: [{ name: 'Taschenrechner.cs', content:
`using System;

class Taschenrechner
{
    static void Main()
    {
        Console.Write("Erste Zahl: ");
        double a = double.Parse(Console.ReadLine());
        Console.Write("Rechenart (+ - * /): ");
        string op = Console.ReadLine();
        Console.Write("Zweite Zahl: ");
        double b = double.Parse(Console.ReadLine());

        switch (op)
        {
            case "+": Console.WriteLine($"Ergebnis: {a + b}"); break;
            case "-": Console.WriteLine($"Ergebnis: {a - b}"); break;
            case "*": Console.WriteLine($"Ergebnis: {a * b}"); break;
            case "/":
                if (b == 0) Console.WriteLine("Durch 0 teilen geht nicht!");
                else Console.WriteLine($"Ergebnis: {a / b:F2}");
                break;
            default: Console.WriteLine("Unbekannte Rechenart."); break;
        }
    }
}
` }] },
    { id: 'loops', title: 'Schleifen', desc: 'for, while, Einmaleins', files: [{ name: 'Schleifen.cs', content:
`using System;

class Schleifen
{
    static void Main()
    {
        for (int i = 1; i <= 5; i++)
            Console.Write(i + " ");
        Console.WriteLine();

        int n = 10;
        while (n > 0)
        {
            Console.Write(n + " ");
            n -= 3;
        }
        Console.WriteLine();

        Console.WriteLine("Einmaleins:");
        for (int zeile = 1; zeile <= 5; zeile++)
        {
            for (int spalte = 1; spalte <= 5; spalte++)
                Console.Write($"{zeile * spalte,4}");
            Console.WriteLine();
        }
    }
}
` }] },
    { id: 'funcs', title: 'Funktionen', desc: 'Eigene Methoden mit Rückgabewert', files: [{ name: 'Funktionen.cs', content:
`using System;

class Funktionen
{
    static int Quadrat(int x)
    {
        return x * x;
    }

    static double Durchschnitt(params double[] werte)
    {
        double summe = 0;
        foreach (double w in werte) summe += w;
        return summe / werte.Length;
    }

    static int Fakultaet(int n)
    {
        return n <= 1 ? 1 : n * Fakultaet(n - 1);
    }

    static void Main()
    {
        Console.WriteLine(Quadrat(7));
        Console.WriteLine(Durchschnitt(2, 4, 9));
        Console.WriteLine(Fakultaet(10));
    }
}
` }] },
    { id: 'lists', title: 'Listen', desc: 'Zahlen sammeln, Summe und Durchschnitt', files: [{ name: 'Listen.cs', content:
`using System;
using System.Collections.Generic;
using System.Linq;

class Listen
{
    static void Main()
    {
        List<int> zahlen = new List<int> { 5, 3, 8, 1 };
        zahlen.Add(10);
        zahlen.Sort();

        Console.WriteLine("Sortiert: " + string.Join(", ", zahlen));
        Console.WriteLine("Summe: " + zahlen.Sum());
        Console.WriteLine("Durchschnitt: " + zahlen.Average());
        Console.WriteLine("Größte Zahl: " + zahlen.Max());

        var gerade = zahlen.Where(z => z % 2 == 0).ToList();
        Console.WriteLine("Gerade: " + string.Join(", ", gerade));

        Dictionary<string, int> alter = new Dictionary<string, int>();
        alter["Anna"] = 31;
        alter["Ben"] = 27;
        foreach (var paar in alter)
            Console.WriteLine($"{paar.Key} ist {paar.Value} Jahre alt");
    }
}
` }] },
    { id: 'guess', title: 'Zahlenraten', desc: 'Zufallszahl erraten', files: [{ name: 'Zahlenraten.cs', content:
`using System;

class Zahlenraten
{
    static void Main()
    {
        Random zufall = new Random();
        int geheim = zufall.Next(1, 101);
        int versuche = 0;
        Console.WriteLine("Ich denke an eine Zahl zwischen 1 und 100.");

        while (true)
        {
            Console.Write("Dein Tipp: ");
            string eingabe = Console.ReadLine();
            if (!int.TryParse(eingabe, out int tipp))
            {
                Console.WriteLine("Bitte eine Zahl eingeben!");
                continue;
            }
            versuche++;
            if (tipp < geheim) Console.WriteLine("Zu klein.");
            else if (tipp > geheim) Console.WriteLine("Zu groß.");
            else
            {
                Console.WriteLine($"Richtig! Du hast {versuche} Versuche gebraucht.");
                break;
            }
        }
    }
}
` }] },
    { id: 'classes', title: 'Klassen', desc: 'Einfache Klasse Konto', files: [{ name: 'KlassenBeispiel.cs', content:
`using System;

class Konto
{
    public string Inhaber { get; }
    public decimal Kontostand { get; private set; }

    public Konto(string inhaber, decimal start)
    {
        Inhaber = inhaber;
        Kontostand = start;
    }

    public void Einzahlen(decimal betrag)
    {
        if (betrag <= 0) throw new ArgumentException("Der Betrag muss positiv sein.");
        Kontostand += betrag;
    }

    public bool Abheben(decimal betrag)
    {
        if (betrag > Kontostand) return false;
        Kontostand -= betrag;
        return true;
    }

    public override string ToString() => $"{Inhaber}: {Kontostand:C}";
}

class KlassenBeispiel
{
    static void Main()
    {
        Konto k = new Konto("Julian", 100m);
        k.Einzahlen(50.5m);
        Console.WriteLine(k);
        Console.WriteLine(k.Abheben(500m) ? "Abgehoben" : "Nicht genug Geld");
    }
}
` }] },
    { id: 'errors', title: 'Fehlerbehandlung', desc: 'try / catch / finally', files: [{ name: 'Fehlerbehandlung.cs', content:
`using System;

class Fehlerbehandlung
{
    static void Main()
    {
        try
        {
            Console.Write("Zahl eingeben: ");
            int zahl = int.Parse(Console.ReadLine());
            Console.WriteLine("100 / " + zahl + " = " + (100 / zahl));
        }
        catch (FormatException)
        {
            Console.WriteLine("Das war keine Zahl!");
        }
        catch (DivideByZeroException ex)
        {
            Console.WriteLine("Fehler: " + ex.Message);
        }
        finally
        {
            Console.WriteLine("Fertig.");
        }
    }
}
` }] },
    { id: 'multi', title: 'Mehrere Dateien', desc: 'Beispielprojekt mit zwei Dateien', files: [
      { name: 'MehrDateien.cs', content:
`using System;

class MehrDateien
{
    static void Main()
    {
        Rechner r = new Rechner();
        Console.WriteLine("3 + 4 = " + r.Addiere(3, 4));
        Console.WriteLine("Quadrat von 9: " + Rechner.Quadrat(9));
    }
}
` },
      { name: 'Rechner.cs', content:
`class Rechner
{
    public int Addiere(int a, int b)
    {
        return a + b;
    }

    public static int Quadrat(int x)
    {
        return x * x;
    }
}
` }] }
  ];

  const py = [
    { id: 'hello', title: 'Hello World', desc: 'Einfachste Ausgabe', files: [{ name: 'hallo_welt.py', content: 'print("Hallo Welt!")\n' }] },
    { id: 'io', title: 'Eingabe & Ausgabe', desc: 'Namen abfragen und begrüßen', files: [{ name: 'eingabe_ausgabe.py', content:
`name = input("Wie heißt du? ")
alter = int(input("Wie alt bist du? "))

print(f"Hallo {name}! In 10 Jahren bist du {alter + 10}.")
` }] },
    { id: 'calc', title: 'Taschenrechner', desc: 'Zwei Zahlen einlesen, Rechenart wählen', files: [{ name: 'taschenrechner.py', content:
`a = float(input("Erste Zahl: "))
op = input("Rechenart (+ - * /): ")
b = float(input("Zweite Zahl: "))

if op == "+":
    print("Ergebnis:", a + b)
elif op == "-":
    print("Ergebnis:", a - b)
elif op == "*":
    print("Ergebnis:", a * b)
elif op == "/":
    if b == 0:
        print("Durch 0 teilen geht nicht!")
    else:
        print(f"Ergebnis: {a / b:.2f}")
else:
    print("Unbekannte Rechenart.")
` }] },
    { id: 'loops', title: 'Schleifen', desc: 'for, while, Einmaleins', files: [{ name: 'schleifen.py', content:
`for i in range(1, 6):
    print(i, end=" ")
print()

n = 10
while n > 0:
    print(n, end=" ")
    n -= 3
print()

print("Einmaleins:")
for zeile in range(1, 6):
    for spalte in range(1, 6):
        print(f"{zeile * spalte:4}", end="")
    print()
` }] },
    { id: 'funcs', title: 'Funktionen', desc: 'Eigene Funktion mit Rückgabewert', files: [{ name: 'funktionen.py', content:
`def quadrat(x):
    return x * x


def durchschnitt(*werte):
    return sum(werte) / len(werte)


def fakultaet(n):
    return 1 if n <= 1 else n * fakultaet(n - 1)


def begruessung(name, gruss="Hallo"):
    return f"{gruss} {name}!"


print(quadrat(7))
print(durchschnitt(2, 4, 9))
print(fakultaet(10))
print(begruessung("Ada"), begruessung("Bob", gruss="Moin"))
` }] },
    { id: 'lists', title: 'Listen', desc: 'Zahlen sammeln, Summe und Durchschnitt', files: [{ name: 'listen.py', content:
`zahlen = [5, 3, 8, 1]
zahlen.append(10)
zahlen.sort()

print("Sortiert:", zahlen)
print("Summe:", sum(zahlen))
print("Durchschnitt:", sum(zahlen) / len(zahlen))
print("Größte Zahl:", max(zahlen))

gerade = [z for z in zahlen if z % 2 == 0]
print("Gerade:", gerade)

alter = {"Anna": 31, "Ben": 27}
alter["Clara"] = 45
for name, jahre in alter.items():
    print(f"{name} ist {jahre} Jahre alt")
` }] },
    { id: 'guess', title: 'Zahlenraten', desc: 'Zufallszahl erraten', files: [{ name: 'zahlenraten.py', content:
`import random

geheim = random.randint(1, 100)
versuche = 0
print("Ich denke an eine Zahl zwischen 1 und 100.")

while True:
    eingabe = input("Dein Tipp: ")
    if not eingabe.isdigit():
        print("Bitte eine Zahl eingeben!")
        continue
    tipp = int(eingabe)
    versuche += 1
    if tipp < geheim:
        print("Zu klein.")
    elif tipp > geheim:
        print("Zu groß.")
    else:
        print(f"Richtig! Du hast {versuche} Versuche gebraucht.")
        break
` }] },
    { id: 'classes', title: 'Klassen', desc: 'Einfache Klasse Konto', files: [{ name: 'klassen.py', content:
`class Konto:
    def __init__(self, inhaber, start=0):
        self.inhaber = inhaber
        self.kontostand = start

    def einzahlen(self, betrag):
        if betrag <= 0:
            raise ValueError("Der Betrag muss positiv sein.")
        self.kontostand += betrag

    def abheben(self, betrag):
        if betrag > self.kontostand:
            return False
        self.kontostand -= betrag
        return True

    def __str__(self):
        return f"{self.inhaber}: {self.kontostand:.2f} EUR"


k = Konto("Julian", 100)
k.einzahlen(50.5)
print(k)
print("Abgehoben" if k.abheben(500) else "Nicht genug Geld")
` }] },
    { id: 'errors', title: 'Fehlerbehandlung', desc: 'try / except / finally', files: [{ name: 'fehlerbehandlung.py', content:
`try:
    zahl = int(input("Zahl eingeben: "))
    print("100 /", zahl, "=", 100 / zahl)
except ValueError:
    print("Das war keine Zahl!")
except ZeroDivisionError as fehler:
    print("Fehler:", fehler)
finally:
    print("Fertig.")
` }] },
    { id: 'multi', title: 'Mehrere Dateien', desc: 'Beispielprojekt mit zwei Dateien', files: [
      { name: 'mehr_dateien.py', content:
`import rechner

print("3 + 4 =", rechner.addiere(3, 4))
print("Quadrat von 9:", rechner.quadrat(9))
` },
      { name: 'rechner.py', content:
`def addiere(a, b):
    return a + b


def quadrat(x):
    return x * x
` }] }
  ];

  KON.data.examples = { csharp: cs, python: py };
})(window);
