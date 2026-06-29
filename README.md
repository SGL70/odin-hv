# Resursläge

Kartbaserat resursledningssystem för Hemvärnet. Realtidslägesbild av logistiska resurser: drivmedel, livsmedel, vatten, råvaror, fordon, uppställningsytor och mer.

## Skärmbild

```
┌──────────────────────────────────────────────────────────┐
│ 🗺 Resursläge          [Dashboard] [+ Lägg till] ...  │
├──────────────┬───────────────────────────────────────────┤
│ LAGER        │                                           │
│ ⛽ Drivmedel │           [Interaktiv karta]              │
│ 🍞 Livsmedel │                                           │
│ 💧 Vatten    │    • Klicka för att lägga till objekt     │
│ 🌾 Råvaror   │    • Klicka på objekt för att redigera   │
│              │    • Realtidsuppdatering för alla         │
│              │      inloggade användare                  │
└──────────────┴───────────────────────────────────────────┘
```

## Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | React + TypeScript + Vite |
| Karta | MapLibre GL JS (OpenStreetMap-tiles) |
| Backend | Node.js + Express + Socket.io |
| Databas | PostgreSQL + PostGIS |
| Auth | JWT (roller: läsare / redaktör / admin) |
| Realtid | WebSocket via Socket.io |
| Deployment | Docker Compose |

## Driftsättning

### Krav
- Docker + Docker Compose
- Linux-server (testat på Debian 12 LXC)

### Installation

```bash
git clone https://github.com/SGL70/resurslage.git
cd resurslage

cp .env.example .env
# Redigera .env med egna lösenord och hemligheter

docker compose up -d --build
```

Appen startar på port 80. Standardanvändare: `admin` / lösenord från `ADMIN_PASSWORD` i `.env`.

### Miljövariabler

```env
DB_PASSWORD=    # PostgreSQL-lösenord
JWT_SECRET=     # Hemlig nyckel för JWT-tokens (minst 32 tecken)
ADMIN_PASSWORD= # Lösenord för admin-kontot vid första start
```

### Bakom reverse proxy (Caddy)

```
resurslage.jv10.se {
    reverse_proxy 192.168.1.136:80
}
```

## Kartlager

| Lager | Typ | Nyckelattribut | CoT-typ |
|-------|-----|----------------|---------|
| Drivmedel | Punkt | Bränsletyp, volym (L), fyllnadsgrad (%) | `b-m-p-s-p` |
| Livsmedel | Punkt | Kategori, vikt (kg), hållbarhetsdatum | `b-m-p-s-p` |
| Vatten | Punkt | Typ, kapacitet (m³/dygn) | `b-m-p-s-p` |
| Råvaror | Punkt | Typ (mjöl/foder/djur), mängd + enhet | `b-m-p-s-p` |
| Fordon *(fas 2)* | Punkt | Fordonstyp, maxlast (ton), status | `a-f-G-U-C-V` |
| Vägbärighet *(fas 2)* | Linje | BK-klass (1–4), axellast (ton) | — |
| Brobärighet *(fas 2)* | Punkt | Maxlast (ton), bredd (m), höjd (m) | `b-m-p-s-p` |

## API

```
POST /api/auth/login              Logga in → JWT-token
GET  /api/features?layer=fuel     Hämta alla objekt (valfritt filtrera per lager)
POST /api/features                Skapa objekt
PUT  /api/features/:uid           Uppdatera objekt
DEL  /api/features/:uid           Ta bort objekt

POST /api/import/csv?layer=fuel   Importera CSV (kolumner: lat, lon, name, + attribut)
GET  /api/export/kmz              Exportera alla lager som KMZ (ATAK-kompatibel)
GET  /api/export/geojson          Exportera som GeoJSON
GET  /api/export/cot              CoT XML-ström för TAK-integration

GET  /api/dashboard               Totaler, varningar och aktivitetslogg
```

## TAK-integration

Systemet exporterar data i TAK-kompatibla format:

- **KMZ-export** — importeras direkt i ATAK/WinTAK via Data Package
- **CoT XML** — Cursor on Target, streambart till FreeTAK Server
- Varje objekt har `uid` (UUID) och `cot_type` i enlighet med CoT-specen

FreeTAK Server kan aktiveras som sidecar (kommenterat i `docker-compose.yml`):
```yaml
# freetakserver:
#   image: freetakteam/freetakserver:1.9.9
#   ports:
#     - "8087:8087/tcp"
```

## Öppna datakällor (integrerade / planerade)

| Källa | Data | Status |
|-------|------|--------|
| OpenStreetMap | Kartunderlag | ✅ Aktivt |
| Trafikverket NVDB | Vägbärighet (BK1–BK4), axellast | 📋 Fas 2 |
| Trafikverket Broar | Brobärighet, mått | 📋 Fas 2 |
| Lantmäteriet WMTS | Topografisk karta (alternativt lager) | 📋 Fas 2 |

## Nästa steg (fas 2)

### Lager 5–7
- [ ] Fordon — position, fordonstyp, maxlast, status
- [ ] Vägbärighet — linjer från NVDB med BK-klass och axellast
- [ ] Brobärighet — punkter från Trafikverket med mått

### NVDB-integration
- [ ] UI för att rita ett område och hämta vägdata direkt från Trafikverket API
- [ ] API-nyckel konfigureras i `.env`: `TRAFIKVERKET_API_KEY`
- [ ] Automatisk klassning: BK1 (röd) → BK4 (grön) på karta

### Symbologi
- [ ] milsymbol.js — APP-6/MIL-STD-2525 militärsymbolik för alla objekt
- [ ] Konfigurerbara SIDC-koder per lager

### Övrigt
- [ ] Lösenordsändring i UI för egna konton
- [ ] Admin-sida för användarhantering (listan finns, behöver UI)
- [ ] Mobilanpassning (fungerar men inte optimerad)
- [ ] Lantmäteriet topografisk karta som alternativt kartlager
- [ ] Rutting med fordonsklassbegränsning (OpenRouteService)
- [ ] Utskriftslayout (A3 karta med legend)

## Projektstruktur

```
resurslage/
├── docker-compose.yml
├── .env.example
├── db/
│   └── init.sql              # Schema: features, users, activity_log
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js          # Express + Socket.io server
│       ├── db.js             # PostgreSQL-pool
│       ├── middleware/
│       │   └── auth.js       # JWT-verifiering
│       └── routes/
│           ├── auth.js       # Login, användarhantering
│           ├── features.js   # CRUD för kartlager
│           ├── import.js     # CSV + GeoJSON import
│           ├── export.js     # KMZ, GeoJSON, CoT export
│           └── dashboard.js  # Aggregerade data och varningar
└── frontend/
    ├── Dockerfile
    ├── nginx.conf            # Reverse proxy till backend
    ├── package.json
    └── src/
        ├── App.tsx
        ├── types.ts          # Lager-definitioner och typer
        ├── api.ts            # API-klient
        ├── contexts/
        │   └── AuthContext.tsx
        └── components/
            ├── MapView.tsx   # Huvud-kartkomponent (MapLibre GL JS)
            ├── LayerControl.tsx
            ├── FeaturePanel.tsx
            ├── Dashboard.tsx
            └── ImportDialog.tsx
```

## Licens

MIT
