# ODIN hv

![ODIN hv](preview.png)

**Open Data Intelligence Node — Hemvärnet**

ODIN hv är ett kartbaserat situationsmedvetenhetssystem för Hemvärnet. Systemet samlar realtidsdata från öppna källor — Trafikverkets vägnät och kameror, polisens händelse-API, kommunala driftstörningar och OpenStreetMap — och presenterar det som en enhetlig lägesbild på karta. Syftet är att ge Hemvärnets ledning och chefer ett snabbt och samlat underlag för planering, prioritering och samordning av resurser vid övning och insats.

**Domän:** odinhv.se · resurslage.jv10.se (legacy)
**Repo:** https://github.com/SGL70/odin-hv

---

## Metodik: Activity-based Intelligence

ODIN hv:s arbetssätt utgår från ABI:s fyra pelare:

- **Georeference to Discover** — all data kopplas först till plats och tid; spatiotemporal korrelation låter mönster framträda även när plats/tid är det enda gemensamma för i övrigt disparata källor.
- **Data Neutrality** — alla datakällor är lika mycket värda oavsett klassning eller ursprung; öppna källor (OSINT) vägs inte lägre än andra flöden.
- **Sequence Neutrality** — data samlas in och lagras innan dess betydelse är känd; en pusselbit som skördas idag kan visa sig avgörande för en händelse månader senare.
- **Integration before Exploitation** — olika datatyper (multi-INT) integreras i en gemensam bild tidigt, i stället för att analyseras separat i stuprör.

Kartlagren, dataskördarna och den enhetliga lägesbilden är redan uttryck för detta, men principerna ska vara ett uttalat underlag för prioritering av fortsatt utveckling (se Roadmap).

---

## Vad som är gjort

![ODIN hv skärmbild](ODINhv.png)

### Karta & lägesbild
- 27 kartlager (logistik, infrastruktur, händelser) — JWT-skyddade, WebSocket-realtid
- Kritikalitetsmärkning på alla objekt: Normal / Viktig (gul) / Kritisk (röd) med visuell ring på kartan
- BK-klassfärger på vägar (grön/gul/orange/röd) från Trafikverkets NVDB
- Live-kamerabild i objektpanelen med auto-refresh var 30 s
- WMS-overlays: Lantmäteriet Terrängskuggning, SVK Kraftnät
- CSV/GeoJSON-import, KMZ + CoT-export (ATAK/WinTAK-kompatibel)
- UI-state persistent i localStorage

### Dataskördare
Automatisk insamling från öppna källor, konfigurerbar auto-refresh:

| Källa | Data |
|-------|------|
| polisen.se | Polishändelser för OpOmr |
| IT Norrbotten Stadsnät | Elavbrott per kommun |
| Trafikverket / DATEX II | Trafikkameror, ATK-kameror, trafikflöde |
| Trafikverket NVDB | Vägbärighet (BK-klass), färjeleder |
| OSM Overpass | Drivmedelsstationer, broar (bärighet/maxvikt) |

### Analys & störningskarta
- Störningskarta (choropleth) med kommunpolygoner — score normaliserat per 1 000 invånare (SCB 2024)
- Dagliga snapshots kl 00:05 med konfigurerbar retention
- Drill-down per händelsetyp och kommun

### Operativt Område (OpOmr)
- Välj valfria kommuner ur alla 21 svenska län som operativt område
- Kartfiltret och dataskördare begränsas automatiskt till valda kommuner
- Auto-refresh: kartlager laddas om automatiskt när OpOmr ändras

### Infrastruktur
- JWT-autentisering med roller: läsare / redaktör / admin
- Körs som Docker Compose i Debian 12 LXC (CT 217) bakom Cloudflare Tunnel
- Tillgänglig på odinhv.se (publikt) och odin.lan (lokalt)

### Varningsregler
- Regelmotor med tre regeltyper, utvärderas automatiskt efter varje skördning:
  - Tröskel: kommunens störningspoäng överstiger X
  - Proximity: objekt i valt lager inom X m från infrastruktur med kritikalitet Viktig/Kritisk
  - Kluster: N liknande händelser inom valbar radie
- Regler hanteras av admin (⚙ Hantera regler i sidopanelen); varningar är kvitterbara av alla roller
- Realtidsnotis via Socket.io: banner + persistent lista i sidopanelen

### ABI-åtgärder (2026-07-04)
Fyra konkreta åtgärder mot gap identifierade i en ABI-bedömning (se Metodik ovan):
- **Sekvensneutralitet:** rådata som annars skulle raderas vid skördning/TTL flyttas till `features_history` i stället (`archiveAndDelete()` i harvest.js), läsbar via `GET /api/features/history`
- **Dataneutralitet:** störningspoängen har en generisk, admin-konfigurerbar källviktning (`layer_weighting`-inställning) i stället för tre hårdkodade källor — railway_situations ingår nu som default
- **Integration before exploitation:** ny "Relaterade objekt"-sektion i objektpanelen korrelerar det valda objektet mot andra features inom valbar radie (`GET /api/features/:uid/related`)
- **Georeference to discover:** alla skördade objekt normaliseras till ett gemensamt `attributes.occurred_at` (härlett från källans egen tidsnyckel) för tvärlager-tidskorrelation

---

## Roadmap

Prioriteringen nedan väger även mot ABI-pelarna (se Metodik ovan) — t.ex. stärker Underrättelserapport-modulen (7 S:en) *sekvensneutralitet* genom strukturerad loggning oavsett omedelbar tolkning, och Mobildata-integration stärker *dataneutralitet* genom fler jämbördiga källor.

### Prioriterat

1. **Kritikalitetsviktad störningsscore** — händelse nära Kritisk-märkt objekt ger en multiplikator innan den summeras in i störningspoängen (kan återanvända avståndslogiken från varningsregelmotorns proximity-regel)

### Backlog

2. **Mobil fältrapportering (PWA)** — avskalad vy `/report` för rapportering i fält
   - Auto-GPS, kamerabild, touch-vänligt formulär
   - Rapporterar in händelser och resurser med positionsdata

3. **Underrättelserapport-modul** — strukturerad loggning av inkomna tips
   - De 7 S:en: Stund, Ställe, Styrka, Slag, Sysselsättning, Symbol, Sagesman
   - Klassificering per STANAG 2511 (källvärde A–F × informationsvärde 1–6)

4. **Mobildata-integration** — självkonfigurabel via inställningar (URL, nyckel, dokumentationslänk)

5. **Trendvisning** — linjediagram i analyspanelen (snapshot-historik finns, UI saknas)

6. **Lantmäteriet Topo WMTS** (kräver gratis token)

7. **milsymbol.js** — APP-6/MIL-STD-2525 symbologi per lager

8. **Rutting** med fordonsklassbegränsning (OpenRouteService)

9. **Cloudflare Access bypass** för `/api/sms/incoming` → aktivera 46elks-webhook, sedan koppla på SMS som notiskanal för varningsregler

---

## Teknisk dokumentation

### Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | React + TypeScript + Vite + MapLibre GL JS |
| Backend | Node.js + Express + Socket.io |
| Databas | PostgreSQL + PostGIS |
| Auth | JWT (roller: läsare / redaktör / admin) |
| Realtid | WebSocket via Socket.io |
| Deployment | Docker Compose (Debian 12 LXC, CT 217 på haven) |

### Installation

```bash
git clone https://github.com/SGL70/odin-hv.git
cd odin-hv

cp .env.example .env
# Redigera .env med egna lösenord och API-nycklar

docker compose up -d --build
```

Appen startar på port 80. Standardanvändare: `admin` / lösenord från `ADMIN_PASSWORD` i `.env`.

### Miljövariabler

```env
DB_PASSWORD=                  # PostgreSQL-lösenord
JWT_SECRET=                   # Hemlig nyckel för JWT (minst 32 tecken)
ADMIN_PASSWORD=               # Lösenord för admin vid första start
TRAFIKVERKET_API_KEY=         # Trafikverkets Öppna Data (api.trafikinfo.trafikverket.se)
TRAFIKVERKET_DATEX_KEY=       # Extra nyckel för TrafficFlow/DATEX-objekttyper
FORTYSIX_ELKS_API_KEY=        # 46elks SMS-gateway
```

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

### DB-snapshot (snabb återställning)

```bash
/usr/local/bin/odin-snapshot save <namn>    # Ta snapshot
/usr/local/bin/odin-snapshot restore <namn> # Återställ
/usr/local/bin/odin-snapshot list           # Lista snapshots
```

### Projektstruktur

```
odin-hv/
├── docker-compose.yml
├── .env.example
├── db/
│   └── init.sql                    # Schema: features, users, municipalities, settings
├── backend/
│   └── src/
│       ├── index.js                # Express + Socket.io + daglig snapshot-schemaläggare
│       ├── migrations.js           # Idempotent schema-tillägg (alert_rules/alert_events)
│       ├── services/
│       │   └── alertEngine.js      # Varningsregelmotor: tröskel/proximity/kluster
│       └── routes/
│           ├── auth.js             # Login, användarhantering
│           ├── features.js         # CRUD för kartlager (+ opomr-filter)
│           ├── import.js           # CSV + GeoJSON import
│           ├── export.js           # KMZ, GeoJSON, CoT export
│           ├── dashboard.js        # Aggregerade data och varningar
│           ├── analysis.js         # Analys, choropleth, snapshots, drill-down
│           ├── harvest.js          # Dataskördare (polis, el, trafik, broar, TRV)
│           ├── alerts.js           # Varningsregler CRUD + events + kvittering
│           ├── settings.js         # Inställnings-CRUD + opomr-bbox
│           ├── trafikverket.js     # Trafikverket Open Data
│           └── sms.js              # 46elks webhook
└── frontend/
    ├── public/
    │   └── korp.png                # Korpsilhuett (logotypbild)
    └── src/
        ├── types.ts                # Lagerdefinitioner (27 lager) + Alert-typer
        └── components/
            ├── MapView.tsx         # Huvudkartkomponent
            ├── Sidebar.tsx         # Vänster sidebar (inkl. Varningar-sektion)
            ├── HarvestSidebar.tsx  # Dataskördare inkl. TRV
            ├── AnalysisPanel.tsx   # Störningsanalys med drill-down
            ├── FeaturePanel.tsx    # Objektpanel med kritikalitet
            ├── SettingsModal.tsx   # OpOmr, retention, snapshot
            ├── AlertRulesModal.tsx # Regelbyggare för varningar (admin)
            ├── AlertBanner.tsx     # Transient notisbanner för nya varningar
            ├── OdinLogo.tsx        # Logotyp (sm/md/lg)
            └── Login.tsx           # Inloggningssida
```

### Datamodell — fallgropar

- `features_layer_check`-constraint måste uppdateras när nya lager läggs till i DB.
- `attributes` är JSONB — pg-drivern deserialiserar automatiskt, använd aldrig `JSON.parse()` på värden från `db.query()`.
- GeoJSON property-namn måste vara ren ASCII — svenska tecken förstörs i MapLibre:s tile-pipeline.
- `municipalities.short_name` används som nyckel för OpOmr-filtret — måste matcha exakt med vad UI:t sparar.
- Anropa `map.moveLayer()` på broar och crit-lager efter varje features-reload, annars täcker väglager dem.

### TAK-integration

- **KMZ-export** importeras direkt i ATAK/WinTAK via Data Package
- **CoT XML** streambart till FreeTAK Server (aktiveras som sidecar i docker-compose.yml)

### Öppna datakällor (ej integrerade)

| Källa | Organisation | Data |
|-------|-------------|------|
| Topografi 10/50 | Lantmäteriet | Vägar, bebyggelse, höjdkurvor |
| Ortofoto | Lantmäteriet | Flygfoto 0,16–0,5 m/pixel |
| Höjdmodell | Lantmäteriet | Markhöjd 1 m upplösning |
| Transmissionsnät | Svenska Kraftnät | 400/220 kV ledningar |
| Sjöfartsdata | Sjöfartsverket | Sjökort, farleder, hamnar |
| Jordarter | SGU | Berggrund, grundvatten |
| Vattendrag | SMHI | Avrinningslinjer, sjöar |
| Befolkningsrutor | SCB | Befolkningstäthet per km² |

## Licens

MIT
