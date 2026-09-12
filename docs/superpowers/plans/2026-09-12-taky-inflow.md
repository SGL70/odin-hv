# Taky-integration fas 1: inflöde av fältmarkörer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Låt fältpersonal som skapar en markör i ATAK/iTAK (ansluten till Taky, CT 220) få den markören att dyka upp direkt som ett objekt på ODIN hv:s karta (CT 217), i ett nytt lager `tak_reports`, med möjlighet för en operatör att explicit bekräfta eller radera den.

**Architecture:** En ny tjänstmodul `backend/src/services/takyBridge.js` håller en långlivad mTLS-socket mot Taky (192.168.1.140:8089), parsar inkommande CoT-XML med en egen liten regex-baserad parser (`cotParser.js` — ingen ny XML-biblioteksberoende, matchar hur `export.js` redan hand-bygger XML), och skriver/uppdaterar `features`-rader via det redan existerande `db.withEachBattalion()`-mönstret som resten av kodbasens bakgrundsjobb (t.ex. `harvest.js`s schemalagda skördning) använder. Frontend får ett nytt datadrivet lager i `LAYERS` (types.ts) och en explicit "Bekräfta"-knapp i `FeaturePanel.tsx`, byggd som en direkt kopia av det redan befintliga "Markera som klassad"-mönstret för `unclassified`.

**Tech Stack:** Node.js (backend, `node:test` för tester), Node:s inbyggda `tls`-modul (ingen ny npm-dependency), PostgreSQL/PostGIS, React/TypeScript (frontend), MapLibre GL.

**Spec:** `docs/superpowers/specs/2026-09-12-taky-integration-inflow-design.md`

## Global Constraints

- Anslutningen till Taky går direkt över LAN (192.168.1.136 → 192.168.1.140:8089), aldrig via `taky.jv10.se`.
- Ingen ny XML-parsing-dependency — hand-rullad regexbaserad parser, konsekvent med `export.js`s egen hand-byggda XML.
- Alla bakgrundsskrivningar till `features` går via `db.withEachBattalion()` (aldrig råa `db.query()` direkt), enligt samma RLS-säkra mönster som `harvest.js::runAutoHarvest()`.
- `created_by`/`updated_by` sätts till `NULL` för systemgenererade rader (matchar `harvest.js`s `userId || null`-konvention), aldrig `0`.
- Boolean-liknande JSONB-attribut lagras som strängarna `'true'`/`'false'` (matchar `attributes.unclassified`), inte riktiga booleaner och inte `'Ja'/'Nej'`.
- Bryggan är feature-flaggad via `FEATURE_TAKY_BRIDGE === 'true'` (matchar `FEATURE_CRITICAL_ALERTS`-mönstret i `config.js`) — av som default så att miljöer utan Taky-cert inte kraschar.
- Tappad socket/trasig XML/ogiltigt cert får aldrig krascha huvudprocessen — bara loggas.

---

### Task 1: Nytt lager `tak_reports` i datamodellen

**Files:**
- Modify: `backend/src/migrations.js`
- Modify: `db/init.sql`
- Modify: `backend/src/index.js`
- Test: `backend/test/features.test.js`

**Interfaces:**
- Produces: lagret `'tak_reports'` blir ett giltigt värde för `features.layer` i hela backend (CHECK-constraint) och kan skapas/hämtas/tas bort via de redan existerande `/api/features`-endpointsen. Inga nya endpoints.

- [ ] **Step 1: Lägg till lagret i `FEATURE_LAYERS`**

I `backend/src/migrations.js`, lägg till `'tak_reports'` sist i arrayen (rad ~10-16):

```js
const FEATURE_LAYERS = [
  'fuel', 'food', 'water', 'raw_materials', 'vehicles', 'firewood', 'consumables', 'roads', 'bridges',
  'maintenance', 'hygiene', 'staging_areas', 'transshipment', 'cameras', 'powerlines', 'telecom',
  'railways', 'ports', 'airports', 'medical', 'emergency', 'tunnels', 'fording_points',
  'police_events', 'road_situations', 'power_outages', 'sms_alerts', 'intelligence_reports',
  'railway_situations', 'news_reports', 'weather_warnings', 'tak_reports',
];
```

- [ ] **Step 2: Lägg till migreringsfunktionen**

Direkt efter `ensureWeatherWarningsLayer()` i samma fil, lägg till:

```js
// Taky-integration fas 1 (docs/superpowers/specs/2026-09-12-taky-integration-inflow-design.md)
// — fältskapade CoT-markörer från ATAK/iTAK landar här via services/takyBridge.js.
async function ensureTakReportsLayer() {
  await setFeatureLayerCheck('tak_reports');
}
```

Lägg till `ensureTakReportsLayer,` i filens `module.exports`-block (rad ~558-565), i samma grupp som de andra `ensure*Layer`-funktionerna.

- [ ] **Step 3: Koppla in migreringen i `runMigrations()`**

I `backend/src/index.js`:
1. Lägg till `ensureTakReportsLayer` i den långa destructuring-importen från `./migrations` (rad 10), i samma grupp som `ensureWeatherWarningsLayer`.
2. I `runMigrations()` (rad ~190-218), lägg till raden direkt efter `await ensureWeatherWarningsLayer();`:

```js
  await ensureTakReportsLayer();
```

- [ ] **Step 4: Utöka `db/init.sql` för nya installationer**

I `db/init.sql` rad 14, lägg till `'tak_reports'` sist i den inline CHECK-listan (samma sträng-lista, för att nya installationer utan migreringshistorik ändå får rätt constraint direkt).

- [ ] **Step 5: Skriv testet**

I `backend/test/features.test.js`, lägg till efter det första testet (`'editor kan skapa ett objekt...'`):

```js
test('editor kan skapa ett tak_reports-objekt', async () => {
  const res = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({ layer: 'tak_reports', name: 'Testmarkör från ATAK', geometry: POINT }),
  });
  assert.equal(res.status, 201);
  const feature = await res.json();
  assert.equal(feature.properties.layer, 'tak_reports');
});
```

- [ ] **Step 6: Kör testet och verifiera att det går igenom**

Run: `cd backend && npm test`
Expected: alla tester (inklusive det nya) PASS. Om det nya testet failar med en CHECK-constraint-violation har lagret inte lagts till korrekt i steg 1/3 — kör inte vidare förrän det är grönt (migreringarna körs vid testserverns uppstart via `runMigrations()`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/migrations.js backend/src/index.js db/init.sql backend/test/features.test.js
git commit -m "$(cat <<'EOF'
Lägg till lagret tak_reports för Taky-inflöde

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VCR2fZqjqaA4HyE3rogKEH
EOF
)"
```

---

### Task 2: CoT-XML-parser (ren funktion, inget nätverk)

**Files:**
- Create: `backend/src/services/cotParser.js`
- Test: `backend/test/cotParser.test.js`

**Interfaces:**
- Produces:
  - `extractCotEvents(buffer: string): { events: string[], remainder: string }` — klipper ut kompletta `<event>...</event>`-block ur en (eventuellt ofullständig) textbuffert.
  - `cotEventToAttrs(xml: string): { cot_uid: string, cot_type: string, lat: number, lon: number, callsign: string } | null` — tolkar ett enskilt event-XML-block. Returnerar `null` om eventet saknar uid/type/point, eller om typen inte är en markör (`b-m-p-*`).
- Consumes: inget (rena strängfunktioner, inget nätverk/DB).

- [ ] **Step 1: Skriv de första failande testerna**

Skapa `backend/test/cotParser.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCotEvents, cotEventToAttrs } = require('../src/services/cotParser');

const MARKER_XML = `<event version="2.0" uid="ANDROID-abc123" type="b-m-p-s-p" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="h-g-i-g-o">
  <point lat="65.5842" lon="22.1546" hae="0" ce="10" le="10"/>
  <detail><contact callsign="Alpha1"/></detail>
</event>`;

const POSITION_XML = `<event version="2.0" uid="ANDROID-abc123" type="a-f-G-U-C" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="m-g">
  <point lat="65.58" lon="22.15" hae="0" ce="9999999" le="9999999"/>
  <detail><contact callsign="Alpha1"/></detail>
</event>`;

test('extractCotEvents plockar ut ett komplett event och lämnar tom rest', () => {
  const { events, remainder } = extractCotEvents(MARKER_XML);
  assert.equal(events.length, 1);
  assert.equal(remainder, '');
});

test('extractCotEvents hanterar två events i samma buffert', () => {
  const { events, remainder } = extractCotEvents(MARKER_XML + '\n' + MARKER_XML);
  assert.equal(events.length, 2);
  assert.equal(remainder, '');
});

test('extractCotEvents lämnar kvar ett ofullständigt event i remainder', () => {
  const incomplete = MARKER_XML.slice(0, 50);
  const { events, remainder } = extractCotEvents(incomplete);
  assert.equal(events.length, 0);
  assert.equal(remainder, incomplete);
});

test('cotEventToAttrs tolkar en markör korrekt', () => {
  const attrs = cotEventToAttrs(MARKER_XML);
  assert.deepEqual(attrs, {
    cot_uid: 'ANDROID-abc123',
    cot_type: 'b-m-p-s-p',
    lat: 65.5842,
    lon: 22.1546,
    callsign: 'Alpha1',
  });
});

test('cotEventToAttrs filtrerar bort icke-markör-typer (positioner, fas 2)', () => {
  assert.equal(cotEventToAttrs(POSITION_XML), null);
});

test('cotEventToAttrs returnerar null för trasig/ofullständig XML', () => {
  assert.equal(cotEventToAttrs('<event uid="x" type="b-m-p-s-p"></event>'), null);
});

test('cotEventToAttrs faller tillbaka på uid som callsign om contact saknas', () => {
  const noContact = `<event version="2.0" uid="ANDROID-xyz" type="b-m-p-s-p" time="t" start="t" stale="t" how="h-g-i-g-o">
  <point lat="65.0" lon="22.0" hae="0" ce="10" le="10"/>
</event>`;
  const attrs = cotEventToAttrs(noContact);
  assert.equal(attrs.callsign, 'ANDROID-xyz');
});
```

- [ ] **Step 2: Kör testerna och verifiera att de failar**

Run: `cd backend && node --test test/cotParser.test.js`
Expected: FAIL — `Cannot find module '../src/services/cotParser'`

- [ ] **Step 3: Implementera parsern**

Skapa `backend/src/services/cotParser.js`:

```js
// Egen liten CoT-XML-parser (Cursor-on-Target, TAK-ekosystemets meddelandeformat) —
// medvetet ingen XML-biblioteksdependency, CoT-eventens struktur är fast och enkel nog
// (attribut på <event>/<point>/<contact>, ingen nästling av <event> i <event>). Matchar
// hur export.js redan hand-bygger CoT-XML åt andra hållet.

function extractCotEvents(buffer) {
  const events = [];
  const re = /<event\b[^]*?<\/event>/g;
  let match;
  let lastIndex = 0;
  while ((match = re.exec(buffer)) !== null) {
    events.push(match[0]);
    lastIndex = re.lastIndex;
  }
  return { events, remainder: buffer.slice(lastIndex) };
}

function tagAttr(xml, tag, name) {
  const tagMatch = xml.match(new RegExp(`<${tag}\\b[^>]*`));
  if (!tagMatch) return null;
  const attrMatch = tagMatch[0].match(new RegExp(`\\b${name}="([^"]*)"`));
  return attrMatch ? attrMatch[1] : null;
}

// Fas 1 hanterar bara fältskapade markörer ("b-m-p-*"). Enhetspositioner ("a-f-*") ignoreras
// tills fas 2 (se spec:ens "Öppna frågor").
function isMarkerType(type) {
  return typeof type === 'string' && type.startsWith('b-m-p-');
}

function cotEventToAttrs(xml) {
  const uid = tagAttr(xml, 'event', 'uid');
  const type = tagAttr(xml, 'event', 'type');
  const lat = tagAttr(xml, 'point', 'lat');
  const lon = tagAttr(xml, 'point', 'lon');
  if (!uid || !type || lat == null || lon == null) return null;
  if (!isMarkerType(type)) return null;
  const callsign = tagAttr(xml, 'contact', 'callsign') || uid;
  return { cot_uid: uid, cot_type: type, lat: Number(lat), lon: Number(lon), callsign };
}

module.exports = { extractCotEvents, cotEventToAttrs, isMarkerType };
```

- [ ] **Step 4: Kör testerna och verifiera att de går igenom**

Run: `cd backend && node --test test/cotParser.test.js`
Expected: PASS (7 tester)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cotParser.js backend/test/cotParser.test.js
git commit -m "$(cat <<'EOF'
Lägg till CoT-XML-parser för Taky-inflödet

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VCR2fZqjqaA4HyE3rogKEH
EOF
)"
```

---

### Task 3: `takyBridge`-tjänsten (DB-upsert + TLS-anslutning)

**Files:**
- Create: `backend/src/services/takyBridge.js`
- Modify: `backend/src/index.js`
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Test: `backend/test/takyBridge.test.js`

**Interfaces:**
- Consumes: `extractCotEvents`, `cotEventToAttrs` (Task 2); `db.withEachBattalion` (`backend/src/db.js`, redan existerande).
- Produces: `start()` — startar bryggan (no-op om `FEATURE_TAKY_BRIDGE !== 'true'`); `upsertTakReport(tenantDb, orgId, attrs)` — exporterad separat för testbarhet utan riktig socket.

- [ ] **Step 1: Skriv det failande DB-testet för upsert-logiken**

Skapa `backend/test/takyBridge.test.js` — testar `upsertTakReport` direkt mot testdatabasen (samma harness som `features.test.js`), utan att öppna någon socket:

`features` har `FORCE ROW LEVEL SECURITY` (se `ensureRowLevelSecurity()` i `migrations.js`) — policyerna läser `app.org_id`/`app.visible_org_ids` från sessionen, så testet måste öppna en riktig tenant-scopad klient via `db.withTenant()` (samma hjälpare `upsertTakReport` självt förväntas anropas med av `takyBridge.js`), inte en bar `db.query()` mot den delade poolen:

```js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, loginAsAdmin, listen, baseUrl } = require('./helpers/testApp');
const dbModule = require('../src/db');
const { upsertTakReport } = require('../src/services/takyBridge');

let server, base, adminToken, orgId;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
  adminToken = await loginAsAdmin(base);
  const { rows } = await db.query(`SELECT id FROM organizations WHERE org_type = 'bataljon' LIMIT 1`);
  orgId = rows[0].id;
});

beforeEach(async () => { await resetData(); });

after(async () => {
  server.close();
  await db.pool.end();
});

test('upsertTakReport skapar en ny feature vid första eventet', async () => {
  await dbModule.withTenant({ orgId, visibleOrgIds: [orgId] }, tenantDb =>
    upsertTakReport(tenantDb, orgId, { cot_uid: 'A-1', cot_type: 'b-m-p-s-p', lat: 65.5, lon: 22.1, callsign: 'Alpha1' })
  );

  const { rows } = await dbModule.withTenant({ orgId, visibleOrgIds: [orgId] }, tenantDb =>
    tenantDb.query(`SELECT * FROM features WHERE layer = 'tak_reports'`)
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attributes.cot_uid, 'A-1');
  assert.equal(rows[0].attributes.confirmed, 'false');
  assert.equal(rows[0].name, 'Alpha1');
});

test('upsertTakReport uppdaterar position vid återkommande event, rör inte confirmed', async () => {
  await dbModule.withTenant({ orgId, visibleOrgIds: [orgId] }, async tenantDb => {
    await upsertTakReport(tenantDb, orgId, { cot_uid: 'A-2', cot_type: 'b-m-p-s-p', lat: 65.0, lon: 22.0, callsign: 'Bravo2' });
    await tenantDb.query(`UPDATE features SET attributes = attributes || '{"confirmed":"true"}'::jsonb WHERE attributes->>'cot_uid' = 'A-2'`);
    await upsertTakReport(tenantDb, orgId, { cot_uid: 'A-2', cot_type: 'b-m-p-s-p', lat: 65.1, lon: 22.2, callsign: 'Bravo2' });

    const { rows } = await tenantDb.query(`SELECT ST_AsGeoJSON(geom)::json AS geom, attributes FROM features WHERE attributes->>'cot_uid' = 'A-2'`);
    assert.equal(rows.length, 1, 'ska uppdatera samma rad, inte skapa en ny');
    assert.deepEqual(rows[0].geom.coordinates, [22.2, 65.1]);
    assert.equal(rows[0].attributes.confirmed, 'true', 'ett återkommande CoT-event ska inte nollställa en redan bekräftad markör');
  });
});
```

- [ ] **Step 2: Kör testet och verifiera att det failar**

Run: `cd backend && node --test test/takyBridge.test.js`
Expected: FAIL — `Cannot find module '../src/services/takyBridge'`

- [ ] **Step 3: Implementera `takyBridge.js`**

```js
const tls = require('tls');
const fs = require('fs');
const db = require('../db');
const { extractCotEvents, cotEventToAttrs } = require('./cotParser');

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 60000;

let socket = null;
let buffer = '';
let reconnectDelay = RECONNECT_BASE_MS;
let reconnectTimer = null;

// Upsert per bataljon — samma db.withEachBattalion()-mönster som harvest.js::runAutoHarvest()
// använder för andra delade externa datakällor (polis/väder/trafik). org_id kommer alltid
// från battalion.id, aldrig från en egen fristående lookup.
async function upsertTakReport(tenantDb, orgId, attrs) {
  const { rows } = await tenantDb.query(
    `SELECT uid FROM features WHERE layer = 'tak_reports' AND org_id = $1 AND attributes->>'cot_uid' = $2`,
    [orgId, attrs.cot_uid]
  );
  if (rows.length) {
    // Uppdaterar bara position/callsign/cot_type — attributes || rör aldrig ett redan satt
    // confirmed (ATAK skickar om samma markör upprepat tills den blir stale).
    await tenantDb.query(
      `UPDATE features SET
         geom = ST_SetSRID(ST_MakePoint($1, $2), 4326),
         cot_type = $3,
         name = $4,
         updated_at = NOW(),
         attributes = attributes || jsonb_build_object('cot_callsign', $4::text)
       WHERE uid = $5`,
      [attrs.lon, attrs.lat, attrs.cot_type, attrs.callsign, rows[0].uid]
    );
  } else {
    await tenantDb.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by, org_id)
       VALUES ('tak_reports', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, NULL, NULL, $6)`,
      [attrs.callsign, attrs.lon, attrs.lat, attrs.cot_type,
        JSON.stringify({ confirmed: 'false', cot_uid: attrs.cot_uid, cot_callsign: attrs.callsign }), orgId]
    );
  }
}

async function handleEvent(xml) {
  const attrs = cotEventToAttrs(xml);
  if (!attrs) return;
  await db.withEachBattalion((tenantDb, battalion) => upsertTakReport(tenantDb, battalion.id, attrs));
}

function onData(chunk) {
  buffer += chunk;
  const { events, remainder } = extractCotEvents(buffer);
  buffer = remainder;
  for (const xml of events) {
    handleEvent(xml).catch(err => console.error('takyBridge: kunde inte spara CoT-event:', err.message));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function connect() {
  let options;
  try {
    options = {
      host: process.env.TAKY_HOST,
      port: Number(process.env.TAKY_COT_PORT || 8089),
      cert: fs.readFileSync(process.env.TAKY_CLIENT_CERT_PATH),
      key: fs.readFileSync(process.env.TAKY_CLIENT_KEY_PATH),
      ca: process.env.TAKY_CA_CERT_PATH ? fs.readFileSync(process.env.TAKY_CA_CERT_PATH) : undefined,
      rejectUnauthorized: true,
    };
  } catch (err) {
    console.error('takyBridge: kunde inte läsa certifikatfiler, avbryter:', err.message);
    return;
  }
  buffer = '';
  socket = tls.connect(options, () => {
    console.log(`takyBridge: ansluten till Taky (${options.host}:${options.port})`);
    reconnectDelay = RECONNECT_BASE_MS;
  });
  socket.setEncoding('utf8');
  socket.on('data', onData);
  socket.on('error', err => console.error('takyBridge: socket-fel:', err.message));
  socket.on('close', scheduleReconnect);
}

function isEnabled() {
  return process.env.FEATURE_TAKY_BRIDGE === 'true';
}

function start() {
  if (!isEnabled()) {
    console.log('takyBridge: inaktiverad (FEATURE_TAKY_BRIDGE != "true")');
    return;
  }
  connect();
}

module.exports = { start, upsertTakReport };
```

- [ ] **Step 4: Kör testet och verifiera att det går igenom**

Run: `cd backend && node --test test/takyBridge.test.js`
Expected: PASS (2 tester)

- [ ] **Step 5: Koppla in bryggan i `index.js`**

Lägg till importen nära toppen av `backend/src/index.js`:

```js
const takyBridge = require('./services/takyBridge');
```

I `start()`-funktionen (rad ~220-229), lägg till efter `scheduleDailyReport();`:

```js
  takyBridge.start();
```

- [ ] **Step 6: Lägg till miljövariabler och cert-volym i `docker-compose.yml`**

Ersätt den utkommenterade, inaktuella `# FreeTAK Server`-sektionen (rad 64-70 — historisk kvarleva från när FreeTAKServer testades innan bytet till Taky, se CLAUDE.md) med:

```yaml
      FEATURE_TAKY_BRIDGE: ${FEATURE_TAKY_BRIDGE:-false}
      TAKY_HOST: ${TAKY_HOST:-192.168.1.140}
      TAKY_COT_PORT: ${TAKY_COT_PORT:-8089}
      TAKY_CLIENT_CERT_PATH: /app/certs/taky/client.crt
      TAKY_CLIENT_KEY_PATH: /app/certs/taky/client.key
      TAKY_CA_CERT_PATH: /app/certs/taky/ca.crt
```

lagt till i `backend`-tjänstens `environment`-block (efter `FEATURE_CRITICAL_ALERTS`-raden), och lägg till en volymrad i samma tjänsts `volumes`-block:

```yaml
      - ./certs/taky:/app/certs/taky:ro
```

Ta sedan bort de gamla kommentarraderna 64-70 i sin helhet (den utkommenterade `freetakserver`-sektionen) — de beskriver ett alternativ som redan avfärdats (se CLAUDE.md "Bakgrund"-avsnittet om Taky).

- [ ] **Step 7: Gitignorea cert-katalogen**

Lägg till i `.gitignore`:

```
certs/
```

- [ ] **Step 8: Kör hela backend-testsviten**

Run: `cd backend && npm test`
Expected: alla tester PASS (inklusive de nya från Task 1-3). `FEATURE_TAKY_BRIDGE` är inte satt i testmiljön, så `takyBridge.start()` loggar bara att den är inaktiverad — ingen socket öppnas under testerna.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/takyBridge.js backend/src/index.js backend/test/takyBridge.test.js docker-compose.yml .gitignore
git commit -m "$(cat <<'EOF'
Lägg till takyBridge: mTLS-inflöde av CoT-markörer från Taky

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VCR2fZqjqaA4HyE3rogKEH
EOF
)"
```

---

### Task 4: Frontend — nytt lager i `LAYERS`

**Files:**
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Produces: `LayerId` inkluderar `'tak_reports'`; `LAYERS` innehåller motsvarande `LayerConfig`. Konsumeras automatiskt av `LayerControl.tsx` (redan datadriven av `LAYERS`), `MapView.tsx` och `FeaturePanel.tsx` utan ytterligare kopplingskod.

- [ ] **Step 1: Utöka `LayerId`-typen**

I `frontend/src/types.ts` rad 136, lägg till `'tak_reports'` sist i unionen.

- [ ] **Step 2: Lägg till layer-config**

I `LAYERS`-arrayen (samma fil), lägg till en ny post — placera den i `group: 'events'` tillsammans med `police_events`/`power_outages` eftersom det är händelsedata, inte en planerad resurs:

```ts
  {
    id: 'tak_reports',
    label: 'Fältmarkörer (Taky)',
    color: '#9b59b6',
    icon: '📍',
    group: 'events',
    fields: [],
  },
```

`fields: []` är avsiktligt tomt — `confirmed` och `cot_callsign` renderas via dedikerade UI-block i `FeaturePanel.tsx` (Task 5), inte via den generiska fältlistan.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: inga nya fel. (Inget test-steg i vanlig mening — det här är ren konfiguration; korrektheten verifieras av TypeScript-kompilatorn plus de manuella UI-stegen i Task 5.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts
git commit -m "$(cat <<'EOF'
Lägg till lagret tak_reports i frontend-konfigurationen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VCR2fZqjqaA4HyE3rogKEH
EOF
)"
```

---

### Task 5: Frontend — obekräftad-ring på kartan + explicit "Bekräfta"-knapp

**Files:**
- Modify: `frontend/src/lib/mapConfig.ts`
- Modify: `frontend/src/components/MapView.tsx`
- Modify: `frontend/src/components/FeaturePanel.tsx`

**Interfaces:**
- Consumes: `LayerId` (Task 4), MapLibre `CircleLayerSpecification`.
- Produces: `unconfirmedRingLayer(layerId, sourceId): maplibregl.CircleLayerSpecification` (mapConfig.ts) — analog med redan existerande `unclassifiedRingLayer`.

- [ ] **Step 1: Lägg till `unconfirmedRingLayer` i `mapConfig.ts`**

Direkt efter den existerande `unclassifiedRingLayer`-funktionen i `frontend/src/lib/mapConfig.ts`:

```ts
// Samma tekniska mönster som unclassifiedRingLayer, men för tak_reports-lagrets explicita
// confirmed-fält ('true'/'false') i stället för det universella unclassified-attributet —
// se docs/superpowers/specs/2026-09-12-taky-integration-inflow-design.md ("Att bekräfta måste
// vara en explicit handling", inte samma auto-clear-vid-spara som unclassified har).
export function unconfirmedRingLayer(layerId: LayerId, sourceId: string): maplibregl.CircleLayerSpecification {
  return {
    id: `unconfirmed-${layerId}`,
    type: 'circle', source: sourceId,
    filter: ['!=', ['get', 'confirmed'], 'true'],
    layout: { visibility: 'visible' },
    paint: {
      'circle-radius': 16,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#9b59b6',
      'circle-stroke-opacity': 0.9,
    },
  };
}
```

(Ingen `circle-dasharray` — den paint-egenskapen finns bara för line-lager i MapLibre GL JS, inte circle. Den tjockare, distinkt lila ringen [`#9b59b6`, skiljer sig redan från kritikalitetsringens röd/gul] räcker för att sticka ut visuellt.)

- [ ] **Step 2: Rita ringen för `tak_reports` i `MapView.tsx`**

I den generiska `else`-grenen i features-synk-`useEffect` (`frontend/src/components/MapView.tsx`, blocket med kommentaren `// Criticality ring — outer halo...` runt rad ~515-525), lägg till direkt efter raden `map.addLayer(unclassifiedRingLayer(layer.id, sourceId));`:

```ts
        if (layer.id === 'tak_reports') map.addLayer(unconfirmedRingLayer(layer.id, sourceId));
```

Lägg till `unconfirmedRingLayer` i importen från `'../lib/mapConfig'` högst upp i filen (rad 28), bredvid `unclassifiedRingLayer`.

- [ ] **Step 3: Dölj `cot_uid`/`confirmed` i den generiska attributlistan i `FeaturePanel.tsx`**

I `HIDDEN`-mängden (rad ~345-348), lägg till `'cot_uid'` och `'confirmed'` i listan (de renderas av det dedikerade blocket i Step 4/5, inte den generiska fallback-listan). Lägg till `cot_callsign: 'Anropssignal'` i `LABELS`-mappen strax under, så den syns med ett vettigt namn i den generiska listan.

- [ ] **Step 4: Lägg till `markConfirmed`-handlern**

Direkt efter den existerande `markClassified`-funktionen (rad ~109-120):

```ts
  // tak_reports-markörer bekräftas explicit av en operatör (aldrig implicit via vanlig
  // Spara, till skillnad från unclassified) — se spec:ens beslut om explicit handling.
  const markConfirmed = async () => {
    if (!feature || !canEdit) return;
    setMarkingConfirmed(true);
    try {
      const saved = await api.updateFeature(feature.properties.uid, {
        name, geometry: feature.geometry, cot_type: feature.properties.cot_type, ...fields, confirmed: 'true',
      });
      onSaved(saved as Feature);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte bekräfta markören');
    } finally { setMarkingConfirmed(false); }
  };
```

Lägg till motsvarande state-variabel bredvid `markingClassified` (rad ~57):

```ts
  const [markingConfirmed, setMarkingConfirmed] = useState(false);
```

- [ ] **Step 5: Lägg till bekräfta-banderollen i UI**

Direkt efter det existerande `{fields.unclassified === 'true' && (...)}`-blocket (rad ~252-264):

```tsx
        {/* Fältmarkör från Taky (services/takyBridge.js), väntar på explicit bekräftelse */}
        {feature.properties.layer === 'tak_reports' && fields.confirmed !== 'true' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 12,
            background: '#9b59b622', border: '1px solid #9b59b655', borderRadius: 6,
          }}>
            <span style={{ fontSize: 12, color: '#9b59b6', flex: 1 }}>📍 Obekräftad fältmarkör</span>
            {canEdit && (
              <button className="btn-ghost btn-sm" onClick={markConfirmed} disabled={markingConfirmed}>
                {markingConfirmed ? 'Bekräftar…' : '✓ Bekräfta'}
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: inga fel.

- [ ] **Step 7: Manuellt UI-test**

1. Starta frontend lokalt (`cd frontend && npm run dev`) mot en backend där du för hand kört:
   ```sql
   INSERT INTO features (layer, name, geom, cot_type, attributes, org_id)
   VALUES ('tak_reports', 'Test Alpha1', ST_SetSRID(ST_MakePoint(22.15, 65.58), 4326), 'b-m-p-s-p',
     '{"confirmed":"false","cot_uid":"test-1","cot_callsign":"Alpha1"}', 1);
   ```
2. Öppna kartan, verifiera att markören syns med en streckad lila ring.
3. Klicka på markören, verifiera att panelen visar "📍 Obekräftad fältmarkör" med en "✓ Bekräfta"-knapp, och att "Anropssignal: Alpha1" syns i attributlistan.
4. Klicka "✓ Bekräfta" — verifiera att banderollen och ringen försvinner utan sidladdning.
5. Verifiera att "Ta bort"-knappen fungerar som för alla andra lager.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/mapConfig.ts frontend/src/components/MapView.tsx frontend/src/components/FeaturePanel.tsx
git commit -m "$(cat <<'EOF'
Lägg till obekräftad-ring och explicit bekräfta-knapp för tak_reports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VCR2fZqjqaA4HyE3rogKEH
EOF
)"
```

---

## Efter planen — manuellt end-to-end-test mot riktig Taky (ej en del av CI)

Detta kräver ett riktigt klientcertifikat och görs manuellt, inte som en automatiserad step ovan:

1. På CT 220: `sudo pct exec 220 -- taky-client odinhv-bridge --host 192.168.1.140`, hämta ut `.zip`, extrahera cert+nyckel till `certs/taky/` i CT 217 (`client.crt`, `client.key`, `ca.crt`).
2. Sätt `FEATURE_TAKY_BRIDGE=true` i CT 217:s `.env`, kör `docker compose up -d backend`.
3. Verifiera i loggarna (`docker compose logs -f backend`) att `takyBridge: ansluten till Taky (192.168.1.140:8089)` skrivs ut.
4. Skapa en markör i en ATAK/iTAK-klient ansluten till Taky, eller skicka en test-CoT-event manuellt mot porten.
5. Verifiera att en ny `tak_reports`-feature dyker upp i ODIN hv:s karta inom några sekunder, obekräftad.
