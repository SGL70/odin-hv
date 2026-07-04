# Analys & störningsscore

[← Tillbaka till ODINhv-index](00-index)

*Senast uppdaterad: 2026-07-04*

---

## Analyspanelen

Öppnas via **📊 Analys** i topbaren. Två flikar:

- **OpOmr** — sammanställning för de kommuner som är valda som Operativt Område i ⚙ Inställningar.
- **Norrbotten BD** — samma typ av sammanställning för hela länet, oavsett OpOmr-val.

Varje flik visar klickbara "pills" per kategori (elavbrott, trafikhändelser, polishändelser) — ett klick öppnar en drill-down-lista med de enskilda händelserna bakom siffran.

## Störningskartan (choropleth)

Slås på i **📊 Analys**-sektionen i vänster sidebar. Färgar varje kommunpolygon efter dess `level`:

| Färg | `level` | Betydelse |
|------|---------|-----------|
| 🟢 Grön | 0 | Ingen eller obetydlig störning |
| 🟠 Orange | 1 | Måttlig störning (score 0–2) |
| 🔴 Röd | 2 | Hög störning (score > 2) |

Håll muspekaren över en kommun för att se en popup med störningspoäng, råpoäng och antal händelser per kategori (elavbrott/trafikhändelser/polishändelser).

## Så räknas störningspoängen ut

Grundformeln (`computeDisruptionScores()` i backend):

```
rawScore = Σ över alla bidragande lager: (viktad händelsemängd i lagret × lagrets källvikt)
score    = round(rawScore / (kommunens folkmängd / 1000), 1 decimal)   [SCB 2024-data]
level    = 0 om score = 0, 1 om score ≤ 2, annars 2
```

Vilka lager som bidrar, och med vilken källvikt, styrs av inställningen **Källviktning i störningsscore** (se nedan) — inte hårdkodat i koden. Standardvikterna är elavbrott ×3, trafikhändelser ×1, polishändelser ×1, tågstörningar ×1, men vilket lager som helst kan läggas till eller viktas om.

Normaliseringen per 1000 invånare är avsiktlig — den gör att en liten kommun (t.ex. Överkalix) och en stor (t.ex. Luleå) kan jämföras rättvist. Utan normalisering skulle Luleå nästan alltid se "värst ut" bara för att det har flest invånare och därmed flest råa händelser.

## Kritikalitetsviktning

Händelser (elavbrott, trafikhändelser och övriga generiska lager i källviktningen) som ligger **nära en kritikalitetsmärkt feature** (attributet `criticality` = `gul` "Viktig" eller `röd` "Kritisk", satt på valfritt kartobjekt via FeaturePanel) räknas med en högre vikt än 1 innan de summeras in i `rawScore`. Ett elavbrott intill en kritisk bro väger alltså mer än samma avbrott mitt ute i skogen.

Inställningarna ligger under **⚙ Inställningar → Kritikalitetsviktad störningsscore**:

| Fält | Standardvärde | Betydelse |
|------|---------------|-----------|
| Avstånd till kritisk feature | 500 m | Hur nära en händelse måste vara ett kritikalitetsmärkt objekt för att viktas |
| Multiplikator, gul (Viktig) | 1,5× | Viktning för händelser nära en gul-märkt feature |
| Multiplikator, röd (Kritisk) | 3× | Viktning för händelser nära en röd-märkt feature |

**Polishändelser viktas INTE spatialt.** Polisens GPS-koordinater är bara på länsnivå (en centroid för hela Norrbotten), inte den faktiska händelseplatsen — ett avståndstest mot dem vore missvisande. Deras bidrag till `rawScore` styrs istället bara av källvikten nedan.

De råa (oviktade) räknarna `elavbrott`/`road_count`/`police_count` som visas i popupen förblir alltid oförändrade — bara den bakomliggande poängberäkningen (`raw_score`/`score`/`level`) påverkas av viktningen.

## Källviktning i störningsscore

Under **⚙ Inställningar → 📊 Källviktning i störningsscore** listas varje lager som just nu bidrar till störningsscoren, med sin vikt (0–10, steg om 0,5). Vikt `0` utesluter källan helt ur beräkningen utan att ta bort den ur listan.

Nya lager läggs till av admin direkt via `PUT /api/settings/layer_weighting` tills det finns ett UI för att lägga till rader — hör av dig till den som sköter drift om du vill lägga till en källa som inte redan finns listad.

## Historik (trend)

Ett dagligt "analysögonblick" (kl 00:05) sparas i databasen och kan visas via ⚙ Inställningar → "⚡ Spara ögonblick nu" för en manuell snapshot. Retentionstiden (hur länge historiken sparas) ställs in i samma sektion.

> **Känd avgränsning:** Historikens sparade poäng räknas fortfarande med en äldre, enklare formel — kritikalitetsviktningen och källviktningen slår bara igenom på den *nuvarande* choropleth-kartan och varningsregler, inte på historiska trendrader (ännu).
