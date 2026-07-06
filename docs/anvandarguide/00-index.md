# 🗺 ODINhv — Användarguide

ODINhv är Hemvärnets kartbaserade logistik- och lägesbildssystem. Den här guiden täcker de två delarna som blivit tillräckligt komplexa för att förtjäna egen dokumentation utöver koden: analyssystemet och varningsregelmotorn.

## Vad kan appen göra?

### Kartan & lägesbild
- Se en samlad lägesbild med 28 kartlager — infrastruktur, logistik och pågående händelser
- Märka objekt med kritikalitet (Normal / Viktig / Kritisk), synligt direkt på kartan
- Se vägars bärighetsklass (BK-klass) färgkodad direkt på kartan
- Se live-kamerabild för trafikkameror direkt i objektpanelen
- Lägga på kartunderlag som terrängskuggning och kraftnät
- Importera CSV/GeoJSON och exportera till KMZ (ATAK/WinTAK-kompatibelt)

### Automatisk datainsamling
- Hämta polishändelser, elavbrott, trafikkameror/ATK, vägbärighet, färjeleder, drivmedelsstationer och broar automatiskt från öppna källor
- Begränsa insamlingen till ett valfritt Operativt Område (valfria kommuner) — hämtas om automatiskt när området ändras
- Behålla namn och kritikalitetsmärkning vid omskördning, i stället för att förlora dem varje gång

### Analys & varningar
- Se en störningskarta över hur drabbade kommunerna är, normaliserat per invånare
- Se "Relaterade objekt" — andra händelser eller objekt nära det man tittar på
- Sätta upp regler som varnar automatiskt vid tröskelvärden, närhet till viktig infrastruktur, eller flera liknande händelser i kluster
- Få varningar i realtid som banner och lista, kvitterbara av alla

### Rapportering
- Skapa underrättelserapporter (7S) direkt i appen
- Rapportera direkt från fält via mobilen, med GPS och kamerabild — fungerar även utan täckning och skickas automatiskt när anslutningen är tillbaka
- Använda en förenklad mobil kartvy för att orientera sig i fält

### SMS & nyheter
- Ta emot larm och tips via SMS — kända avsändare placeras ut automatiskt, okända hamnar i en granskningskö för manuell geotaggning
- Bevaka lokala nyhetskällor automatiskt och geotagga relevanta rubriker manuellt

### Verktyg på kartan
- Rita en polygon och läsa av ytan (m², ha eller km²)
- Mäta avstånd genom att klicka punkter på kartan
- Söka inom en ritad polygon för att se vilka händelser och objekt som finns i området — uppdelat i exakta träffar och ungefärliga kommunnivå-träffar

### Användare
- Logga in med roller (läsare / redaktör / admin) som styr vad man kan se och göra
- Hantera användare direkt i appen, utan databasåtkomst

## Innehåll

- **[📊 Analys & störningsscore](01-analys-och-storningsscore.md)** — Choropleth-kartan, hur störningspoängen räknas ut, och hur kritikalitetsviktning påverkar den.
- **[⚠ Varningsregler](02-varningsregler.md)** — De tre regeltyperna (tröskel/närhet/kluster), hur man skapar regler, och hur varningar kvitteras.

## Snabbfakta

- **Roller:** läsare (reader), redaktör (editor), admin. Endast admin hanterar varningsregler; redaktörer kan skapa/redigera kartobjekt.
- **Operativt Område (OpOmr):** de kommuner som valts i ⚙ Inställningar styr både kartfilter och vilken geografi analys/varningar räknar på.
- Källkod: `github.com/SGL70/odin-hv`, drift på CT 217 (haven).
