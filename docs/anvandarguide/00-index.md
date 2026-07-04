# 🗺 ODINhv — Användarguide

ODINhv är Hemvärnets kartbaserade logistik- och lägesbildssystem. Den här guiden täcker de två delarna som blivit tillräckligt komplexa för att förtjäna egen dokumentation utöver koden: analyssystemet och varningsregelmotorn.

## Innehåll

- **[📊 Analys & störningsscore](01-analys-och-storningsscore.md)** — Choropleth-kartan, hur störningspoängen räknas ut, och hur kritikalitetsviktning påverkar den.
- **[⚠ Varningsregler](02-varningsregler.md)** — De tre regeltyperna (tröskel/närhet/kluster), hur man skapar regler, och hur varningar kvitteras.

## Snabbfakta

- **Roller:** läsare (reader), redaktör (editor), admin. Endast admin hanterar varningsregler; redaktörer kan skapa/redigera kartobjekt.
- **Operativt Område (OpOmr):** de kommuner som valts i ⚙ Inställningar styr både kartfilter och vilken geografi analys/varningar räknar på.
- Källkod: `github.com/SGL70/odin-hv`, drift på CT 217 (haven).
