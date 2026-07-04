# UI-handover för designgranskning — ODIN hv

**Syfte med detta dokument:** ge en fristående Claude-konversation (Claude design / claude.ai) tillräcklig kontext för att granska och föreslå förbättringar av UI:et i ODIN hv, utan tillgång till kodbasen. Skärmdumpar saknas i detta dokument — se checklistan längst ner för vilka vyer som behöver fotograferas innan granskningen påbörjas.

---

## 1. Om appen

ODIN hv (Open Data Intelligence Node — Hemvärnet) är ett kartbaserat situationsmedvetenhetssystem för Hemvärnet: en enda kartvy med 28 valbara lager (logistikresurser, infrastruktur, händelser) plus sido-paneler för analys, skördning av öppna datakällor och administration. Målgrupp: Hemvärnets ledning/chefer under övning och insats — inte en publik konsumentapp. Används på dator (ingen mobilanpassning finns ännu, se avsnitt 6).

Tre roller med stigande behörighet: **läsare** (ser kartan, kan inte redigera), **redaktör** (kan lägga till/redigera objekt, köra dataskördare), **admin** (allt ovan + användarhantering, varningsregler, inställningar).

Live: https://resurslage.jv10.se (kräver inloggning — se checklista längst ner för hur skärmdumpar tas).

---

## 2. Teknisk grund för UI:et

- **React 18 + TypeScript + Vite**, kartan renderas med **MapLibre GL JS**.
- **Ingen komponentbibliotek** (ingen MUI/Chakra/Tailwind). All styling är **inline `style={{...}}`-objekt** per komponent, plus en liten global stylesheet (`index.css`, se avsnitt 4) med några återanvändbara klasser (`.btn-primary`, `.field-row`, `.badge-*`).
- **Inga designtokens/CSS-variabler.** Färger, mellanrum och radier är literala hex/px-värden upprepade i varje fil.
- **Ikoner är rena emoji-tecken** (⛽🍞💧🚛 osv.), inget ikonbibliotek (Lucide/Heroicons/etc).
- Ett separat symbolspråk finns också: **milsymbol.js** (APP-6/MIL-STD-2525) renderar taktiska symboler för lagret "Underrättelserapporter" — alltså två olika visuella symbolspråk (emoji + milsymbol) samtidigt på samma karta.
- **Mörkt tema är det enda temat** — inget ljust läge, ingen temaväxling.

---

## 3. Skärmar/vyer (levande kod — se avsnitt 5 för dödkod att ignorera)

Appens skal (`App.tsx`) växlar bara mellan två saker: **Login** (ej inloggad) och **MapView** (allt annat). MapView är en enda stor full-skärms kartvy (930 rader) som i sin tur monterar allt annat som flytande, absolut positionerade paneler ovanpå kartan:

| Komponent | Roll i UI:et |
|---|---|
| `Login.tsx` | Inloggningsformulär, centrerad kort på gradientbakgrund |
| `MapView.tsx` | Kartan (MapLibre) + toppheader (48px, logga, användarnamn+rollbadge, admin-knappar) + monterar alla nedanstående paneler |
| `Sidebar.tsx` | Vänster panel, expanderbara grupper: 📊 Analys / 🔔 Händelser / 🗂 Lager / 📦 Resurser / 🗺 Kartunderlag |
| `FeaturePanel.tsx` | Höger panel, visas när ett objekt väljs på kartan — fält, kritikalitet, relaterade objekt, live-kamerabild, spara/ta bort |
| `RelatedFeatures.tsx` | Underkomponent i FeaturePanel — lista över objekt inom valbar radie (100m/500m/1km) |
| `HarvestSidebar.tsx` | Höger panel (alternerar med FeaturePanel), dataskördare med auto-refresh-toggle per källa |
| `AnalysisPanel.tsx` | Störningsanalys: choropleth-toggle, statistik-pills, drill-down per kommun/kategori |
| `Dashboard.tsx` | Sammanfattande siffror (troligen en mindre widget, inte en egen sida) |
| `ReportListPanel.tsx` | Filterbar lista över underrättelserapporter (källvärde/infovärde/tid) |
| `SettingsModal.tsx` | Modal: OpOmr-kommunval (21 län, kryssrutor), snapshot-retention, kritikalitetsviktning, källviktning i störningspoäng |
| `AlertRulesModal.tsx` | Modal (admin): regelbyggare för varningsregler (tröskel/proximity/kluster) |
| `AlertBanner.tsx` | Transient toast-notis vid ny varning |
| `ImportDialog.tsx` | CSV/GeoJSON-import |
| `OdinLogo.tsx` | Logotyp (tre storlekar) |

**Layout-mönster:** fast toppheader (z-index 20), vänster/höger paneler som flyter ovanpå kartan (också z-index 20, `position: absolute`, `top/bottom: 10px`), modaler som fullskärms mörk backdrop + centrerat kort (z-index 100). Inga breakpoints, inget flex-grid-system för layouten som helhet — allt är manuellt positionerat.

---

## 4. Nuvarande "designsystem" (ad hoc — bör granskas som helhet)

### Färger som faktiskt används (räknat i kodbasen, 300+ träffar)
Ingen enskild källa på sanning — samma avsikt uttrycks ofta med flera olika hex-värden:

| Avsikt | Hex-värden som används |
|---|---|
| Bakgrund, mörkast → ljusast | `#1a1a2e` (body), `#1e1e30` (kort/paneler), `#16162a` (input/inset), `#2a2a3a`/`#2a2a40`/`#2a2a44` (dividers/hover) |
| Text | `#e0e0e0` (primär), `#ddd`/`#ccc`, `#aaa`, `#888`, `#666`, `#555` (allt gråare för lägre vikt — ingen tydlig 2–3-stegs hierarki) |
| Kantlinjer | `#333`, `#444` |
| Primärfärg (knappar, länkar, fokus) | `#5b8cff` (konsekvent använd — det här är den ljuspunkt som faktiskt fungerar som varumärkesfärg idag) |
| "Grön" (positiv/normal) | `#27ae60`, `#4a9`, `#4a7`, `#4aaa5a` — **fyra olika gröna för samma betydelse** |
| "Röd" (kritisk/fel) | `#e74c3c`, `#c55` |
| "Gul/orange" (viktig/varning) | `#f39c12`, `#f1c40f`, `#e67e22` |
| Blå (info/badge) | `#2980b9`/`#3498db`, `#7aaeff` |
| Lila (badge/lager) | `#8e44ad`/`#9b59b6` |

### Typografi
- Systemfont: `'Segoe UI', system-ui, sans-serif` — inget eget typsnitt laddas.
- Fontstorlek: 9, 10, 11, 12, 13, 14, 16px används alla, med 11–12px som absolut vanligast. Ingen definierad typskala (t.ex. 1.25× steg) — värdena verkar valda ad hoc per komponent.

### Övrigt
- `border-radius`: 3, 4, 5, 6, 8, 10, 12px blandat, ingen konsekvent regel för när vilken används.
- Spacing (padding/gap/margin): literala px-värden per ställe, inget 4/8px-gridsystem.
- Ikoner: 28 lager har varsin emoji (se bilaga 8.1) — **⚡ återanvänds för två olika lager** ("Elkraft"/powerlines och "Elavbrott"/power_outages), vilket kan skapa förväxling i lagerlistan.

---

## 5. Dödkod att ignorera vid granskning

Dessa filer finns i `frontend/src/components/` men importeras aldrig av den körande appen (verifierat med grep mot `App.tsx`/`MapView.tsx`) — de representerar troligen tidigare UI-iterationer som ersatts men aldrig städats bort:

- `HarvestPanel.tsx` (ersatt av `HarvestSidebar.tsx`)
- `LayerControl.tsx` (troligen ersatt av lagerdelen i `Sidebar.tsx`)
- `TrafikverketPanel.tsx` (troligen införlivad i `HarvestSidebar.tsx`)
- `BaseMapControl.tsx` (kartunderlagsväxling verkar ha flyttat in i `Sidebar.tsx`/`MapView.tsx`)

En designgranskning bör inte spendera tid på dessa — men värt att notera som städbehov (radera eller dokumentera varför de sparas).

---

## 6. Kända observationer värda att gräva i

1. **Ingen mobil-/responsiv anpassning.** Fast pixel-baserad layout (paneler med fast `width: 280px` etc). Roadmap planerar en helt separat, avskalad `/report`-vy för fältbruk (PWA) snarare än att göra huvudvyn responsiv — värt att ifrågasätta om det är rätt strategi eller om huvudvyn också borde skalas ner.
2. **Ingen tillgänglighet implementerad.** Nästan inga `aria-*`/`role`-attribut i hela kodbasen, bara 2 `alt`-texter totalt. Tangentbordsnavigering (fokusordning, Escape för att stänga modaler, osv.) är inte verifierad.
3. **Dubbla symbolspråk på samma karta**: emoji för 27 av 28 lager, MIL-STD-2525-symboler (milsymbol.js) för underrättelserapporter. Är det avsiktlig differentiering (taktisk info ska sticka ut) eller en inkonsekvens att adressera?
4. **Färgpalett har inga tokens** (se avsnitt 4) — fyra "gröna", två-tre "röda/gula". Bra tillfälle att etablera en verklig tokenlista (semantic: `color.status.critical`, `color.status.warning` osv.) i samband med en designgranskning.
5. **En känd XSS-relaterad renderingsskillnad**: kartpopups för drivmedelsstationer använder MapLibres `setHTML()` (rå HTML, inte React) medan resten av UI:et React-renderar och auto-escaperar. Utöver säkerhetsfrågan (dokumenterad separat i `SecIssues.md`) är det också en konsekvens-fråga: den popupen kan se/bete sig annorlunda än övriga UI-mönster.
6. **Höger panel kan vara `FeaturePanel` OCH `HarvestSidebar` samtidigt** (FeaturePanel flyttar sig 230px åt vänster via `rightOffset` när skördarpanelen är öppen, se skärmdump 07) — värt att se om den trepanelslayouten (vänster sidebar + FeaturePanel + HarvestSidebar) blir för trång på en 13"-skärm.
7. **Choropleth-overlayen (Störningskarta) har låg kontrast mot underliggande karta** (skärmdump 02) — en halvtransparent rosa/beige ton läggs över hela kartan och gör vägar/vatten svårlästa samtidigt som färgskalan (grön→orange→röd i README) knappt syns i det här datasetet.
8. **AnalysisPanel-flikens etikett bryter illa** när många kommuner är valda i OpOmr (skärmdump 03) — "OPOMR (ÖVERKALIX, KALIX, ...)" radbryts och tränger ihop sig mot flik-kanten.
9. **Varningsregler visar interna fältnamn rakt av** i regellistan (skärmdump 08): "proximity · police_events inom 500 m från rod" — `police_events` och `rod` är backend-värden, inte de svenska etiketter (Polishändelser/Kritisk) som används i övriga UI:et.
10. **Persisterat overlay-state kan bli "smutsigt" mellan sessioner** — choropleth-läget sparas inte i `localStorage` (bara lagerval/basmap/OpOmr gör), men eftersom det styrs av samma `wmsOverlays`-Set som WMS-lagren kan en tidigare session lämna kartan färglagd nästa gång någon annan öppnar samma webbläsarprofil. Värt att dubbelkolla om det är avsett.

---

## 7. Förslag på granskningsfokus

I prioritetsordning, men ändra gärna:

1. **Helhetsintryck & visuell konsekvens** — känns det som ett sammanhållet system eller som lager på lager av separat byggda komponenter (vilket det tekniskt sett är, se avsnitt 2)?
2. **Färg- och typografisystem** — konsolidera dubbletter (avsnitt 4), föreslå en faktisk tokenlista och typskala.
3. **Informationsdensitet i FeaturePanel/Sidebar** — 280px breda paneler med mycket textinnehåll; läsbarhet och skanningsbarhet vid skarpt läge (stress, dåligt ljus, fältbruk).
4. **Ikonspråk** — emoji vs. milsymbol.js vs. ett tredje alternativ (t.ex. ett konsekvent linjeikon-set) för de 27 icke-taktiska lagren.
5. **Tillgänglighet** — även om primär användare sitter vid dator i ledningsmiljö, är kontrastnivåer (mörkt tema) och tangentbordsnavigering värda en snabb WCAG-koll.
6. **Mobil/fältstrategi** — är en helt separat PWA-vy (roadmap) rätt väg, eller borde huvud-UI:et skalas ner istället/också?

---

## 8. Bilagor

### 8.1 Lager & ikoner (28 st)

⛽ Drivmedel · 🍞 Livsmedel · 💧 Vatten · 🌾 Råvaror · 🚛 Fordon · 🛣 Vägbärighet · 🌉 Brobärighet · 🪵 Ved · 📦 Förbrukningsart · 🔧 Underhåll · 🚿 Hygien · 📷 Kameror · ⚡ Elkraft · 📡 Telekommunikation · 🚂 Järnväg · ⚓ Hamnar & Färjelägen · ✈ Flygplatser · 🏥 Sjukvård · 🚒 Räddning & Blåljus · 🚇 Tunnlar · 〰 Vadställen · 🅿 Uppställningsytor · 🏗 Omlastningsplatser · ⚠ Trafikhändelser · 🚆 Tågstörningar · 🚔 Polishändelser · ⚡ Elavbrott · 📱 SMS-aviseringar · 🕵 Underrättelserapporter

### 8.2 Rollbaserade skillnader i UI

- **Läsare:** ser kartan och panelerna men kan inte redigera fält (visas som badge/text i stället för input), ser aldrig lagret "Underrättelserapporter" (OPSEC, filtreras bort helt).
- **Redaktör:** kan redigera/skapa/ta bort objekt, köra dataskördare, importera CSV/GeoJSON.
- **Admin:** allt ovan + användarhantering, varningsregelbyggare, inställningar (OpOmr, retention, viktning).
- Rollbadge visas i toppheadern med färgkodning: orange=admin, blå=redaktör, grön=läsare.

### 8.3 Skärmdumpar

Tagna automatiskt (Playwright, headless Chromium) mot prod och sparade i `design-screenshots/` (gitignored, ligger bara lokalt på den här maskinen):

- [x] `00-login.png` — Inloggningssidan
- [x] `01-map-sidebar.png` — Huvudkartan med vänster sidopanel öppen
- [x] `02-choropleth.png` — Störningskarta aktiv (se observation 7 ovan om kontrast)
- [x] `03-analysis-panel.png` — AnalysisPanel, OpOmr-flik (se observation 8 om flik-etiketten)
- [x] `04-harvest-sidebar.png` — HarvestSidebar (höger panel)
- [x] `05-settings-modal.png` — SettingsModal (OpOmr-vyn, kritikalitets-/källviktning kräver scroll)
- [x] `07-featurepanel-report.png` — FeaturePanel för en underrättelserapport (7S/STANAG-fält, milsymbol-dropdowns) + ReportListPanel bakom
- [x] `08-alert-rules-modal.png` — AlertRulesModal med en existerande regel (se observation 9 om interna fältnamn)
- [ ] FeaturePanel för ett vanligt objekt (t.ex. en drivmedelsstation) — inte fångad, kräver att klicka en specifik kartpunkt vilket är svårt att träffa tillförlitligt headless
- [ ] "Relaterade objekt"-sektionen expanderad med träff — fanns längre ner i `07`-panelen än viewporten, kräver scroll i panelen
- [ ] En aktiv AlertBanner-notis — kan inte framkallas utan att trigga en riktig varningsregel

Bifoga mappen `design-screenshots/` tillsammans med detta dokument i den nya konversationen.
