# ODIN hv

Kartbaserat situationsmedvetenhetssystem för Hemvärnet. Realtidslägesbild av logistiska resurser, infrastruktur och händelser — med direktintegration mot Trafikverkets öppna data, polisens händelse-API och kommunala driftstörningskällor.

**Domän:** odinhv.se · resurslage.jv10.se (legacy)

## Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | React + TypeScript + Vite + MapLibre GL JS |
| Backend | Node.js + Express + Socket.io |
| Databas | PostgreSQL + PostGIS |
| Auth | JWT (roller: läsare / redaktör / admin) |
| Realtid | WebSocket via Socket.io |
| Deployment | Docker Compose (Debian 12 LXC, CT 217 på haven) |

## Driftsättning

### Installation

```bash
git clone https://github.com/SGL70/odin-hv.git
cd resurslage

cp .env.example .env
# Redigera .env med egna lösenord och API-nycklar

docker compose up -d --build
```

Appen startar på port 80. Standardanvändare: `admin` / lösenord från `ADMIN_PASSWORD` i `.env`.

### Deploy av enskild fil

```bash
# Backend-fil (ingen rebuild krävs)
rsync fil.js claude@192.168.1.129:/tmp/
sudo pct push 217 /tmp/fil.js /opt/ledning/backend/src/routes/fil.js
docker restart ledning-backend-1

# Frontend-komponent (kräver rebuild)
rsync Komponent.tsx claude@192.168.1.129:/tmp/
sudo pct push 217 /tmp/Komponent.tsx /opt/ledning/frontend/src/components/Komponent.tsx
sudo pct exec 217 -- bash -c 'cd /opt/ledning && docker compose build frontend && docker compose up -d'
```

### Miljövariabler

```env
DB_PASSWORD=                  # PostgreSQL-lösenord
JWT_SECRET=                   # Hemlig nyckel för JWT (minst 32 tecken)
ADMIN_PASSWORD=               # Lösenord för admin vid första start
TRAFIKVERKET_API_KEY=         # Trafikverkets Öppna Data (api.trafikinfo.trafikverket.se)
TRAFIKVERKET_DATEX_KEY=       # Extra nyckel för TrafficFlow/DATEX-objekttyper
FORTYSIX_ELKS_API_KEY=        # 46elks SMS-gateway
```

## Funktioner

### Karta & lager

- 25 kartlager (logistik, infrastruktur, händelser) — JWT-skyddade, WebSocket-realtid
- CSV/GeoJSON-import, KMZ + CoT-export (ATAK-kompatibel)
- BK-klassfärger på vägar (grön/gul/orange/röd), bred osynlig hit-yta för klick
- Live-kamerabild i FeaturePanel med auto-refresh var 30 s
- WMS-overlays: Lantmäteriet Terrängskuggning, SVK Kraftnät
- Vänster sidebar med expanderbara grupper: 📊 Analys / 🔔 Händelser / 🗂 Lager / 📦 Resurser / 🗺 Kartunderlag
- UI-state sparas i localStorage (lagersyn, kartunderlag, overlays)

### Dataskördare (HarvestSidebar)

Höger sidebar med konfigurerbar auto-refresh:

| Källa | Data | Uppdatering |
|-------|------|-------------|
| polisen.se/api/events | Polishändelser, Norrbotten | Konfigurerbart |
| IT Norrbotten Stadsnät | Driftstörningar elnät, per kommun | Konfigurerbart |
| Trafikverket / DATEX II | Trafikkameror, ATK, trafikflöde | Konfigurerbart |
| NVDB (Trafikverket) | Vägbärighet BK-klass, Färjeleder | Manuell (statisk) |
| OSM Overpass | Drivmedelsstationer, Broar (bärighet/maxvikt) | Manuell |
| OKQ8 webb | OKQ8-stationer | Manuell |

Alla Trafikverket-källor hämtar data för OpOmr (operativt område), inte hela kartbilden.

**Obs:** Polishändelsers GPS-koordinater är länsnivå-centroiden (66.83, 20.40 för Norrbotten), inte exakta platser.

### OpOmr (Operativt Område)

- Filtrera alla kartlager på valda kommuner (Norrbottens 14 kommuner)
- Inställningar sparas i `settings`-tabellen (`op_municipalities` JSONB)
- `?opomr=1` på `/api/features` → spatial join mot `municipalities`-tabell
- Checkbox i sidebar aktiverar/avaktiverar filtret

### Analyssystem

Dagliga snapshots kl 00:05 med konfigurerbar retention (default 30 dagar).

**AnalysisPanel** (klickas fram via 📊-knappen i topbaren):
- **OpOmr-tab**: elavbrott, trafikhändelser, polishändelser per vald OpOmr-kommun
- **Norrbotten BD-tab**: hela länet
- Klickbara Pills → drill-down visar händelsenamn och detaljer per typ

**Störningskarta (Choropleth)**:
- Toggle i 📊 Analys-sektionen i vänster sidebar
- Kommunpolygoner färgkodade: grön (score 0) / orange (≤2) / röd (>2)
- Score = (elavbrott × 3 + trafikhändelser × 1 + polishändelser(48h) × 1) / (befolkning / 1000)
- Normaliserat per 1 000 invånare (SCB 2024, hårdkodad per kommun)
- Mouseover popup visar namn, normaliserad score och råpoäng

**Kritikalitetsfält** (universellt på alla features):
- Värden: `normal` / `gul` (Viktig) / `rod` (Kritisk)
- Lagras i `attributes` JSONB — ingen schemaändring
- FeaturePanel: badge för läsare, dropdown för redaktörer
- Karta: röd/gul ytterring (circle-stroke) på märkta punkt-features

## Kartlager

### Logistik (manuell inmatning eller CSV-import)

| Lager | Typ | Nyckelattribut |
|-------|-----|----------------|
| ⛽ Drivmedel | Punkt | Bränsletyp, volym (L), fyllnadsgrad (%) |
| 🍞 Livsmedel | Punkt | Kategori, vikt (kg), hållbarhetsdatum |
| 💧 Vatten | Punkt | Typ, kapacitet (m³/dygn) |
| 🌾 Råvaror | Punkt | Typ (mjöl/foder/djur), mängd + enhet |
| 🔧 Underhåll | Punkt | Utrustningstyp, antal, status |
| 🚿 Hygien | Punkt | Typ (dusch/toalett/tvätt), kapacitet |
| 🚗 Fordon | Punkt | Fordonstyp, maxlast (ton), status |
| 🏕 Uppställningsytor | Polygon | Area (m²/ha), markklass |
| 🏭 Omlastningsplatser | Punkt | Typ (lastkaj/ramp), kapacitet |

### Infrastruktur (manuell + automatisk import)

| Lager | Typ | Källa | Nyckelattribut |
|-------|-----|-------|----------------|
| 🛣 Vägar | Linje | Trafikverket NVDB | BK-klass, axellast, hastighet |
| 🌉 Broar | Punkt | OSM Overpass | Maxlast (ton), fri bredd/höjd, vägnummer |
| 📷 Kameror | Punkt | Trafikverket | Typ (trafik/ATK), riktning, fotolänk |
| ⚡ Elkraft | Linje | Manuell | Typ (stam/lokalnät), spänning (kV) |
| 📡 Telekommunikation | Punkt | Manuell | Typ (mast/RAKEL/fiber) |
| 🚂 Järnväg | Linje | Manuell | Axellast, elektrifierad |
| ⚓ Hamnar & Färjeleder | Linje/Punkt | Trafikverket NVDB | Namn, linjegeometri |
| ✈ Flygplatser | Polygon | Manuell | Banlängd (m), ICAO-kod |
| 🏥 Sjukvård | Punkt | Manuell | Vårdplatser, traumanivå, helipad |
| 🚒 Räddning & Blåljus | Punkt | Manuell | Typ (brand/polis/HV) |
| 🚇 Tunnlar | Linje | Manuell | Fri höjd/bredd (m), maxlast |
| 〰 Vadställen | Punkt | Manuell | Djup (m), bottentyp, fordonstyp |

### Händelser (automatisk skördning)

| Lager | Källa | Uppdatering |
|-------|-------|-------------|
| 🚨 Polishändelser | polisen.se API | Konfigurerbart |
| 🚧 Trafikhändelser | Trafikverket DATEX II | Konfigurerbart |
| ⚡ Elavbrott | IT Norrbotten Stadsnät | Konfigurerbart |

## API

```
POST /api/auth/login                       Logga in → JWT-token
GET  /api/features?layer=fuel              Hämta objekt (valfritt lagerfilter)
GET  /api/features?opomr=1                 Hämta objekt filtrerat på OpOmr-kommuner
POST /api/features                         Skapa objekt
PUT  /api/features/:uid                    Uppdatera objekt
DEL  /api/features/:uid                    Ta bort objekt

POST /api/import/csv?layer=roads           Importera CSV
POST /api/import/geojson                   Importera GeoJSON

GET  /api/export/kmz                       Exportera alla lager som KMZ (ATAK)
GET  /api/export/geojson                   Exportera som GeoJSON
GET  /api/export/cot                       CoT XML-ström för TAK-integration

GET  /api/dashboard                        Totaler, varningar och aktivitetslogg

GET  /api/analysis/summary                 Elavbrott/trafik/polis per OpOmr + Norrbotten
GET  /api/analysis/choropleth              GeoJSON med störningsindex per kommun
GET  /api/analysis/events?layer=X&municipality=Y  Händelsedetaljer (drill-down)
GET  /api/analysis/history?municipality=X  Snapshot-historik (trenddata)
POST /api/analysis/snapshot                Spara ögonblick manuellt (admin)
GET  /api/analysis/municipalities          Kommunmetadata (yta, kod, namn)

GET  /api/settings                         Läs inställningar
PUT  /api/settings/:key                    Uppdatera inställning
GET  /api/settings/opomr-bbox              ST_Extent för valda OpOmr-kommuner

GET  /api/harvest/status                   Skördningsstatus per källa
GET  /api/harvest/fuel/preview             Förhandsgranska drivmedelsdata
POST /api/harvest/fuel/scrape              Skörda drivmedelsstationer
GET  /api/harvest/bridges/preview          Förhandsgranska brodata (OSM)
POST /api/harvest/bridges/scrape           Skörda broar
GET  /api/harvest/trv-cameras/preview      Förhandsgranska trafikkameror
POST /api/harvest/trv-cameras/scrape       Skörda trafikkameror + ATK
GET  /api/harvest/trv-roads/preview        Förhandsgranska BK-klass
POST /api/harvest/trv-roads/scrape         Skörda vägbärighet
GET  /api/harvest/trv-traffic/preview      Förhandsgranska trafikflöde
POST /api/harvest/trv-traffic/scrape       Skörda trafikflöde
GET  /api/harvest/trv-ferries/preview      Förhandsgranska färjeleder
POST /api/harvest/trv-ferries/scrape       Skörda färjeleder

POST /api/sms/incoming                     46elks SMS-webhook (OBS: blockeras av CF Access)
```

## Datamodell — viktiga detaljer

### PostgreSQL/PostGIS

- `features`-tabellen har en `features_layer_check`-constraint som listar tillåtna lagernamn. **Måste uppdateras när nya lager läggs till.**
- `attributes` är JSONB. pg-drivern deserialiserar JSONB automatiskt — använd aldrig `JSON.parse()` på ett värde som redan hämtats via `db.query()`.
- `jsonb_array_elements_text()` krävs för att konvertera JSONB-array till `text[]` för `ANY()`-jämförelser.
- `municipalities`-tabellen: 14 Norrbottens kommuner, PostGIS MultiPolygon, `short_name` används som nyckel.
- `analysis_snapshots`-tabellen skapas automatiskt vid första körning (CREATE TABLE IF NOT EXISTS).
- `criticality` sparas i `attributes` JSONB — ingen schemaändring behövs.

### MapLibre GL JS

- **GeoJSON property-namn måste vara ren ASCII.** Svenska tecken i property-namn förstörs i MapLibre:s tile-pipeline → `NaN` i `queryRenderedFeatures`.
- **Mouseover på fill-lager**: använd alltid `mousemove` + `map.queryRenderedFeatures(e.point)` — `mouseenter` fires bara en gång per lager-enter.
- **Defensiv parsing**: omslut property-värden med `Number(prop) || 0` — MapLibre garanterar inte JS-typer.
- **Z-ordning för klickbara lager**: anropa `map.moveLayer()` på broar och crit-lager efter varje features-reload så de ligger ovanför väglager.

## Kända begränsningar

- **Polishändelser GPS** — polisen.se API returnerar länsnivå-centroid, inte exakt plats. Municipalities-matchning sker på ortnamn i `name`-fältet, inte spatial join.
- **SVK Kraftnät WMS** — hämtas utan API-nyckel, kan sluta fungera utan förvarning.
- **IT Norrbotten Stadsnät** — HTML-scraping. Täcker: Arvidsjaur, Kalix, Älvsbyn, Jokkmokk, Pajala, Överkalix.
- **46elks SMS-webhook** (`POST /api/sms/incoming`) — blockeras av Cloudflare Access. Behöver bypass-regel i CF Zero Trust.

## Roadmap

### Prioriterat

1. **Varningsregler** — regelmotor med UI för att skapa/redigera larmregler, utvärderas vid varje skördning
   - Regeltyper:
     - **Proximity** — händelse av typ X inom Y m från infrastruktur med kritikalitet Z
     - **Kluster** — N liknande händelser inom område (radie eller OpOmr-polygon)
     - **Tröskel** — kommunens störningspoäng överstiger X
   - `alert_rules`-tabell: `rule_type`, `event_layer`, `radius_m`, `criticality_min`, `cluster_count`, `notify_channels`
   - Notis: Socket.io → frontend-banner + SMS via 46elks

2. **Kritikalitetsviktad choropleth-score** — händelse nära Kritisk-märkt bro/pump väger mer
   - Spatial join: trafikhändelse inom 500 m från Röd/Gul feature → multiplicera score (Röd=×3, Gul=×2)

3. **Auto-refresh vid OpOmr-ändring** — features auto-reloadar när OpOmr-filtret är aktivt och kommuner ändras

### Backlog

4. **Underrättelserapport-modul** — logga inkomna tips/rapporter med strukturerat formulär
   - Fält: Stund, Ställe, Styrka, Slag, Sysselsättning, Symbol, Sagesman (de 7 S:en)
   - Klassificering per STANAG 2511: källvärde A–F × informationsvärde 1–6 (t.ex. B2)
   - Ställe kopplas till kartan, Symbol till APP-6/milsymbol.js

5. **Mobildata-integration** — vid avtal med mobiloperatör: självkonfigurabel via SettingsModal
   - Fält: API-URL, API-nyckel, dokumentationslänk
   - Ny skördkategori i HarvestSidebar med varning om ej konfigurerat

6. **Trendvisning** — history-endpoint finns, bygg linjediagram i AnalysisPanel
7. **Cloudflare Access bypass** för `/api/sms/incoming` → aktivera 46elks-webhook live
8. **Registrera 46elks** hos kommunala SMS-tjänster (Överkalix VA, TVAB Kiruna, Lumire, Gällivare)
9. **Lantmäteriet Topo WMTS** (kräver gratis token från api.lantmateriet.se)
10. **milsymbol.js** — APP-6/MIL-STD-2525 symbologi per lager
11. **Admin-UI** för användarhantering
12. **Rutting** med fordonsklassbegränsning (OpenRouteService)
13. **Utskriftslayout** A3 med legend

## TAK-integration

- **KMZ-export** — importeras direkt i ATAK/WinTAK via Data Package
- **CoT XML** — Cursor on Target, streambart till FreeTAK Server
- Varje objekt har `uid` (UUID) och `cot_type` i enlighet med CoT-specen

FreeTAK Server aktiveras som sidecar i `docker-compose.yml` (kommenterat).

## Övriga öppna datakällor (ej integrerade)

| Källa | Organisation | Data |
|-------|-------------|------|
| Topografi 10/50 | Lantmäteriet | Vägar, bebyggelse, höjdkurvor, vatten |
| Ortofoto | Lantmäteriet | Flygfoto 0,16–0,5 m/pixel |
| Höjdmodell | Lantmäteriet | Markhöjd 1 m upplösning |
| Transmissionsnät | Svenska Kraftnät | 400/220 kV ledningar, transformatorstationer |
| Sjöfartsdata | Sjöfartsverket | Sjökort, farleder, hamnar |
| Jordarter | SGU | Jordarter, berggrund, grundvatten |
| Vattendrag | SMHI | Avrinningslinjer, sjöar |
| Befolkningsrutor | SCB | Befolkningstäthet per km² |
| Skredrisker | SGI | Skredriskområden, erosion |

## Projektstruktur

```
ledning/
├── docker-compose.yml
├── .env.example
├── db/
│   └── init.sql                    # Schema: features, users, municipalities, settings, activity_log
├── backend/
│   └── src/
│       ├── index.js                # Express + Socket.io + daglig snapshot-schemaläggare
│       └── routes/
│           ├── auth.js             # Login, användarhantering
│           ├── features.js         # CRUD för kartlager (+ opomr-filter)
│           ├── import.js           # CSV + GeoJSON import
│           ├── export.js           # KMZ, GeoJSON, CoT export
│           ├── dashboard.js        # Aggregerade data och varningar
│           ├── trafikverket.js     # Trafikverket Open Data (preview-endpoints)
│           ├── analysis.js         # Analys, choropleth, snapshots, drill-down
│           ├── harvest.js          # Dataskördare (polis, el, trafik, broar, TRV)
│           ├── settings.js         # Inställnings-CRUD + opomr-bbox
│           └── sms.js              # 46elks webhook
└── frontend/
    ├── public/
    │   └── korp.png                # Logotypbild (vit korpsilhuett)
    └── src/
        ├── types.ts                # Lagerdefinitioner (25 lager)
        └── components/
            ├── MapView.tsx         # Huvudkartkomponent (choropleth, kritikalitetsring, localStorage)
            ├── Sidebar.tsx         # Vänster sidebar (Analys + lagergrupper + kartunderlag)
            ├── HarvestSidebar.tsx  # Höger sidebar — dataskördare inkl. TRV
            ├── AnalysisPanel.tsx   # Analys-modal (OpOmr + BD, drill-down, polis/trafik/el)
            ├── FeaturePanel.tsx    # Objekt-panel (kritikalitetsfält, multirow, foto)
            ├── SettingsModal.tsx   # Inställningar (OpOmr, retention, manuell snapshot)
            ├── OdinLogo.tsx        # Logotyp-komponent (sm/md/lg)
            ├── Login.tsx           # Inloggningssida
            ├── Dashboard.tsx
            └── ImportDialog.tsx
```

## Licens

MIT
