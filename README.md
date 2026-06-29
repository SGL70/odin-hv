# Resursläge

Kartbaserat resursledningssystem för Hemvärnet. Realtidslägesbild av logistiska resurser, infrastruktur och vägdata — med direkt integration mot Trafikverkets öppna data.

## Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | React + TypeScript + Vite + MapLibre GL JS |
| Backend | Node.js + Express + Socket.io |
| Databas | PostgreSQL + PostGIS |
| Auth | JWT (roller: läsare / redaktör / admin) |
| Realtid | WebSocket via Socket.io |
| Deployment | Docker Compose (Debian 12 LXC) |

## Driftsättning

### Installation

```bash
git clone https://github.com/SGL70/resurslage.git
cd resurslage

cp .env.example .env
# Redigera .env med egna lösenord och API-nycklar

docker compose up -d --build
```

Appen startar på port 80. Standardanvändare: `admin` / lösenord från `ADMIN_PASSWORD` i `.env`.

### Miljövariabler

```env
DB_PASSWORD=              # PostgreSQL-lösenord
JWT_SECRET=               # Hemlig nyckel för JWT (minst 32 tecken)
ADMIN_PASSWORD=           # Lösenord för admin vid första start
TRAFIKVERKET_API_KEY=     # Trafikverkets Öppna Data (api.trafikinfo.trafikverket.se)
TRAFIKVERKET_DATEX_KEY=   # Extra nyckel för TrafficFlow/DATEX-objekttyper
```

### Bakom reverse proxy (Caddy)

```
resurslage.example.se {
    reverse_proxy 192.168.1.x:80
}
```

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

### Infrastruktur (manuell + Trafikverket-import)

| Lager | Typ | Nyckelattribut |
|-------|-----|----------------|
| 🛣 Vägar | Linje/Punkt | BK-klass, väglag, axellast, hastighet |
| 🌉 Broar | Punkt | Maxlast (ton), fri bredd/höjd (m) |
| 📷 Kameror | Punkt | Typ (trafik/ATK), riktning, ägare |
| ⚡ Elkraft | Linje | Typ (stam/lokalnät), spänning (kV) |
| 📡 Telekommunikation | Punkt | Typ (mast/RAKEL/fiber) |
| 🚂 Järnväg | Linje | Axellast, elektrifierad |
| ⚓ Hamnar & Färjeleder | Linje/Punkt | Typ, djupgående, kajlängd |
| ✈ Flygplatser | Polygon | Banlängd (m), ICAO-kod |
| 🏥 Sjukvård | Punkt | Vårdplatser, traumanivå, helipad |
| 🚒 Räddning & Blåljus | Punkt | Typ (brand/polis/HV) |
| 🚇 Tunnlar | Linje | Fri höjd/bredd (m), maxlast |
| 〰 Vadställen | Punkt | Djup (m), bottentyp, fordonstyp |

## Trafikverket Open Data-integration

Knappen **🟡 Trafikverket** i topbaren hämtar data för synligt kartområde och importerar direkt till valfritt lager.

| Datakälla | Objecttype | Namespace | Lager | Nyckeldata |
|-----------|-----------|-----------|-------|------------|
| Trafikkameror | `Camera` | — | cameras | Namn, riktning, fotolänk |
| ATK-kameror | `TrafficSafetyCamera` | — | cameras | Vägnummer, bäring |
| Vägbärighet (BK) | `Bärighet` | `vägdata.nvdb_dk_o` | roads | BK 1–4, axellast |
| Trafikflöde | `TrafficFlow` | — | roads | Hastighet (km/h), fordon/h |
| Färjeleder | `Färjeled` | `vägdata.nvdb_dk_o` | ports | Namn, linjegeometri |

API-endpoint: `https://api.trafikinfo.trafikverket.se/v2/data.json`

NVDB-data kräver `namespace`-attribut i QUERY-elementet, t.ex.:
```xml
<QUERY objecttype="Bärighet" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="500">
```

## Övriga tillgängliga öppna datakällor (ej integrerade)

Dessa kan läggas till som WMS/WFS-lager eller via dedikerade integrationspunkter:

| Källa | Organisation | Data | URL/Format |
|-------|-------------|------|------------|
| Topografi 10/50 | Lantmäteriet | Vägar, bebyggelse, höjdkurvor, vatten | WFS / nedladdning |
| Ortofoto | Lantmäteriet | Flygfoto 0,16–0,5 m/pixel, RGB + IR | WMS |
| Höjdmodell | Lantmäteriet | Markhöjd 1 m upplösning | Grid-nedladdning |
| Transmissionsnät | Svenska Kraftnät | 400/220 kV kraftledningar, transformatorstationer | WMS (INSPIRE) `https://inspire-skn.metria.se/geoserver/skn/ows` |
| Sjöfartsdata | Sjöfartsverket | Sjökort, farleder, hamnar | WMS/WFS `https://geokatalog.sjofartsverket.se/mapservice/` |
| Jordarter & grundvatten | SGU | Jordarter, berggrund, grundvattenmagasin | WMS `https://resource.sgu.se/service/wms/` |
| Vattendrag | SMHI | Avrinningslinjer, vattendrag, sjöar | WMS/WFS `https://opendata-view.smhi.se/SMHI_vatten/wms` |
| Befolkningsrutor | SCB | Befolkningstäthet per km² | WMS/WFS `http://geodata.scb.se/geoserver/stat/wms` |
| Skredrisker | SGI | Skredriskområden, erosion | WMS/WFS `https://mapsext.sgi.se/geoserver/wms` |
| Vägnät WMS | Trafikverket | NVDB vägnät visuell tjänst | WMS `https://geo-netinfo.trafikverket.se/MapService/wms.axd/NetInfo_1_8` |
| Järnvägsnät WMS | Trafikverket | Järnvägslinjer och stationer | WMS `http://geo-baninfo.trafikverket.se/mapservice/wms.axd/BanInfo_1_4` |

## API

```
POST /api/auth/login                  Logga in → JWT-token
GET  /api/features?layer=fuel         Hämta objekt (valfritt lagerfilter)
POST /api/features                    Skapa objekt
PUT  /api/features/:uid               Uppdatera objekt
DEL  /api/features/:uid               Ta bort objekt

POST /api/import/csv?layer=roads      Importera CSV (kolumner: lat, lon, name, + attribut)
POST /api/import/geojson              Importera GeoJSON

GET  /api/export/kmz                  Exportera alla lager som KMZ (ATAK-kompatibel)
GET  /api/export/geojson              Exportera som GeoJSON
GET  /api/export/cot                  CoT XML-ström för TAK-integration

GET  /api/dashboard                   Totaler, varningar och aktivitetslogg

GET  /api/trafikverket/cameras?bbox=  Hämta trafikkameror (Trafikverket)
GET  /api/trafikverket/atk?bbox=      Hämta ATK-kameror (Trafikverket)
GET  /api/trafikverket/roads?bbox=    Hämta BK-klass (NVDB)
GET  /api/trafikverket/traffic?bbox=  Hämta trafikflöde/hastighet
GET  /api/trafikverket/ferries?bbox=  Hämta färjeleder (NVDB)
POST /api/trafikverket/import         Spara hämtad data till databasen
```

`bbox`-parametrar: `minlng`, `minlat`, `maxlng`, `maxlat`

## TAK-integration

- **KMZ-export** — importeras direkt i ATAK/WinTAK via Data Package
- **CoT XML** — Cursor on Target, streambart till FreeTAK Server
- Varje objekt har `uid` (UUID) och `cot_type` i enlighet med CoT-specen

FreeTAK Server aktiveras som sidecar i `docker-compose.yml` (kommenterat).

## Nästa steg

- [ ] Lantmäteriet topografisk karta som alternativt kartlager (WMTS)
- [ ] Svenska Kraftnät kraftledningar som bakgrundslager (WMS)
- [ ] Sjöfartsverket farleder och sjökort (WMS)
- [ ] Väglag (RoadCondition) — is/snö/torrt från Trafikverket
- [ ] milsymbol.js — APP-6/MIL-STD-2525 symbologi per lager
- [ ] Admin-UI för användarhantering
- [ ] Mobilanpassning
- [ ] Rutting med fordonsklassbegränsning (OpenRouteService)
- [ ] Utskriftslayout A3 med legend

## Projektstruktur

```
resurslage/
├── docker-compose.yml
├── .env.example
├── db/
│   └── init.sql                    # Schema: features, users, activity_log
├── backend/
│   └── src/
│       ├── index.js                # Express + Socket.io server
│       └── routes/
│           ├── auth.js             # Login, användarhantering
│           ├── features.js         # CRUD för kartlager
│           ├── import.js           # CSV + GeoJSON import
│           ├── export.js           # KMZ, GeoJSON, CoT export
│           ├── dashboard.js        # Aggregerade data och varningar
│           └── trafikverket.js     # Trafikverket Open Data integration
└── frontend/
    └── src/
        ├── types.ts                # Lagerdefinitioner (21 lager)
        └── components/
            ├── MapView.tsx         # Huvudkartkomponent
            ├── TrafikverketPanel.tsx  # Dataimport-panel
            ├── FeaturePanel.tsx
            ├── LayerControl.tsx
            ├── Dashboard.tsx
            └── ImportDialog.tsx
```

## Licens

MIT
