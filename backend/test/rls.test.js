// Multi-tenancy steg 6 (docs/multitenancy-forslag.md, arkitekturpunkt 5) — RLS-testharnesset.
//
// Måste köra som en riktig BEGRÄNSAD databasroll, aldrig ägaren/en superuser — Postgres RLS
// gäller inte för dem oavsett policy, så ett test som körde mot fel roll skulle ge grönt facit
// även om ENABLE ROW LEVEL SECURITY aldrig slagits på. `ledning_app_test` (skapad av
// test/migrate.js, se den filen för varför) har varken SUPERUSER eller BYPASSRLS och äger inga
// tabeller — en egen pg.Pool ansluten som DEN rollen används genomgående här, INTE den delade
// `db`-modulens pool (som fortfarande är `ledning`, superuser, för migrationernas skull).
//
// Fyra saker testas per tabell (samma fyra som doc:ens arkitekturpunkt 5 kräver):
//  1. En bataljon ser aldrig en annan bataljons rader.
//  2. En militärregion ser sina bataljoners rader, men aldrig en obesläktad bataljons.
//  3. En militärregion kan INTE skriva i en bataljons rader trots läsrätt (WITH CHECK, inte bara USING).
//  4. Ingen org-scope satt alls ger NOLL rader, inte alla — fail-closed är en egen assertion.
// Plus en sanity-check att `pg_class.relrowsecurity` är satt för varje tenant-tabell, så en ny
// tenant-tabell utan policy upptäcks (den är annars öppen som standard, inte stängd).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { db } = require('./helpers/testApp');
const { RLS_TENANT_TABLES } = require('../src/migrations');

// Separat pool mot samma databas men som den begränsade rollen — se filhuvudet.
const appPool = new Pool({
  connectionString: 'postgresql://ledning_app_test:test-app-pw@localhost:5433/ledning_test',
});

async function withTestTenant({ orgId, visibleOrgIds }, fn) {
  const client = await appPool.connect();
  try {
    if (orgId !== undefined) await client.query(`SELECT set_config('app.org_id', $1, false)`, [String(orgId)]);
    if (visibleOrgIds !== undefined) await client.query(`SELECT set_config('app.visible_org_ids', $1, false)`, [`{${visibleOrgIds.join(',')}}`]);
    return await fn(client);
  } finally {
    // DISCARD ALL (inte bara RESET av de två variablerna) — en avvisad INSERT (RLS-policyn i
    // testet nedan) lämnade annars kvar app.visible_org_ids som en tom sträng på just DEN
    // pooladeanslutningen i stället för NULL, vilket senare (helt orelaterade) test som råkade
    // återanvända samma fysiska anslutning från appPool fick "malformed array literal" av — en
    // tyst, icke-deterministisk poolkontaminering. DISCARD ALL nollställer all sessionstillstånd
    // ovillkorligen, oavsett varför RESET inte räckte.
    await client.query(`DISCARD ALL`).catch(() => {});
    client.release();
  }
}

let ORG_R, ORG_A, ORG_B; // militärregion R (förälder till A), bataljon A, obesläktad bataljon B
let NEWS_SOURCE_A, NEWS_SOURCE_B;

// Minimal, giltig INSERT per tenant-tabell — kolumnerna varierar (features kräver geom, alert_events
// kräver rule_name/rule_type/entity_key/message, sms_senders har `phone` som global PK inte org-scopad,
// osv), så en enda mekanisk mall räcker inte. Data-driven över VILKA tabeller som testas, inte över
// hur raderna ser ut.
function insertRowSql(table, orgId, suffix) {
  switch (table) {
    case 'features':
      return { text: `INSERT INTO features (org_id, layer, name, geom) VALUES ($1, 'roads', $2, ST_GeomFromText('POINT(20 67)', 4326))`, params: [orgId, `RLS-test-${suffix}`] };
    case 'alert_rules':
      return { text: `INSERT INTO alert_rules (org_id, name, type) VALUES ($1, $2, 'threshold')`, params: [orgId, `RLS-test-${suffix}`] };
    case 'alert_events':
      return { text: `INSERT INTO alert_events (org_id, rule_name, rule_type, entity_key, message) VALUES ($1, 'RLS test', 'threshold', $2, 'RLS test')`, params: [orgId, `rls-test-${suffix}`] };
    case 'features_history':
      return { text: `INSERT INTO features_history (org_id, uid, layer, name, geom, archived_reason) VALUES ($1, uuid_generate_v4(), 'roads', $2, ST_GeomFromText('POINT(20 67)', 4326), 'test')`, params: [orgId, `RLS-test-${suffix}`] };
    case 'sms_senders':
      // phone är PRIMARY KEY globalt (inte sammansatt med org_id) — måste vara unikt per rad, inte bara per org.
      return { text: `INSERT INTO sms_senders (org_id, phone) VALUES ($1, $2)`, params: [orgId, `+4670000${suffix}`] };
    case 'sms_tips':
      return { text: `INSERT INTO sms_tips (org_id, from_number, message, received_at) VALUES ($1, $2, 'RLS test', NOW())`, params: [orgId, `+4670000${suffix}`] };
    case 'news_sources':
      // name är UNIQUE globalt — måste vara unikt per rad, inte bara per org.
      return { text: `INSERT INTO news_sources (org_id, name, site_url) VALUES ($1, $2, 'https://example.test')`, params: [orgId, `RLS Test Source ${suffix}`] };
    case 'news_items':
      return { text: `INSERT INTO news_items (org_id, source_id, guid, title) VALUES ($1, $2, $3, 'RLS test')`, params: [orgId, orgId === ORG_A ? NEWS_SOURCE_A : NEWS_SOURCE_B, `rls-test-${suffix}`] };
    case 'activity_log':
      return { text: `INSERT INTO activity_log (org_id, action) VALUES ($1, 'create')`, params: [orgId] };
    default:
      throw new Error(`Ingen seed-mall för tabellen ${table}`);
  }
}

before(async () => {
  await appPool.query('SELECT 1'); // felar tidigt och tydligt om ledning_app_test saknas (se test/migrate.js)

  const region = await db.query(`INSERT INTO organizations (name, slug, org_type) VALUES ('RLS Test Region', 'rls-test-region', 'militarregion') RETURNING id`);
  ORG_R = region.rows[0].id;
  const battalionA = await db.query(`INSERT INTO organizations (name, slug, org_type, parent_org_id) VALUES ('RLS Test Bataljon A', 'rls-test-a', 'bataljon', $1) RETURNING id`, [ORG_R]);
  ORG_A = battalionA.rows[0].id;
  const battalionB = await db.query(`INSERT INTO organizations (name, slug, org_type) VALUES ('RLS Test Bataljon B', 'rls-test-b', 'bataljon') RETURNING id`);
  ORG_B = battalionB.rows[0].id;

  // news_items.source_id måste peka på en riktig news_sources-rad — skapas separat (superuser-pool,
  // kringgår RLS naturligt vid seedning) innan huvudloopen seedar news_items självt.
  const sourceA = await db.query(`INSERT INTO news_sources (org_id, name, site_url) VALUES ($1, 'RLS Test Källa A', 'https://example.test') RETURNING id`, [ORG_A]);
  NEWS_SOURCE_A = sourceA.rows[0].id;
  const sourceB = await db.query(`INSERT INTO news_sources (org_id, name, site_url) VALUES ($1, 'RLS Test Källa B', 'https://example.test') RETURNING id`, [ORG_B]);
  NEWS_SOURCE_B = sourceB.rows[0].id;

  for (const table of RLS_TENANT_TABLES) {
    if (table === 'news_sources') continue; // redan seedad ovan (behövde skapas tidigt för news_items FK)
    const rowA = insertRowSql(table, ORG_A, 'A');
    const rowB = insertRowSql(table, ORG_B, 'B');
    await db.query(rowA.text, rowA.params);
    await db.query(rowB.text, rowB.params);
  }
});

after(async () => {
  // Superuser-poolen (db) kringgår RLS och kan alltid städa upp — oavsett vilka policyer som
  // gäller för ledning_app_test-raderna som skapades ovan.
  for (const table of RLS_TENANT_TABLES) {
    await db.query(`DELETE FROM ${table} WHERE org_id = ANY($1::int[])`, [[ORG_R, ORG_A, ORG_B]]);
  }
  await db.query(`DELETE FROM organizations WHERE id = ANY($1::int[])`, [[ORG_A, ORG_B, ORG_R]]);
  await appPool.end();
});

for (const table of RLS_TENANT_TABLES) {
  test(`${table}: bataljon A ser aldrig bataljon B:s rader`, async () => {
    const { rows } = await withTestTenant({ orgId: ORG_A, visibleOrgIds: [ORG_A] }, (client) =>
      client.query(`SELECT org_id FROM ${table} WHERE org_id = ANY($1::int[])`, [[ORG_A, ORG_B]]));
    assert.ok(rows.length > 0, `förväntade minst en rad för bataljon A i ${table}`);
    assert.ok(rows.every(r => r.org_id === ORG_A), `${table}: en rad från bataljon B läckte till bataljon A`);
  });

  test(`${table}: militärregion R ser bataljon A men aldrig bataljon B`, async () => {
    const { rows } = await withTestTenant({ orgId: ORG_R, visibleOrgIds: [ORG_R, ORG_A] }, (client) =>
      client.query(`SELECT org_id FROM ${table} WHERE org_id = ANY($1::int[])`, [[ORG_A, ORG_B]]));
    assert.ok(rows.some(r => r.org_id === ORG_A), `${table}: militärregion R såg inte bataljon A:s rad`);
    assert.ok(rows.every(r => r.org_id !== ORG_B), `${table}: en rad från obesläktad bataljon B läckte till militärregion R`);
  });

  test(`${table}: militärregion R kan inte skriva i bataljon A trots läsrätt`, async () => {
    const { text, params } = insertRowSql(table, ORG_A, 'RW'); // kort suffix — sms_senders/sms_tips phone är VARCHAR(20)
    await assert.rejects(
      () => withTestTenant({ orgId: ORG_R, visibleOrgIds: [ORG_R, ORG_A] }, (client) => client.query(text, params)),
      /row-level security/i,
      `${table}: en INSERT med org_id=A borde ha avvisats av WITH CHECK när app.org_id=R`,
    );
  });

  test(`${table}: ingen org-scope satt ger noll rader, inte alla`, async () => {
    const client = await appPool.connect();
    try {
      const { rows } = await client.query(`SELECT org_id FROM ${table} WHERE org_id = ANY($1::int[])`, [[ORG_A, ORG_B]]);
      assert.equal(rows.length, 0, `${table}: förväntade fail-closed (noll rader) utan org-scope, fick ${rows.length}`);
    } finally {
      client.release();
    }
  });
}

test('varje tenant-tabell (inkl. analysis_snapshots om den finns) har RLS påslaget', async () => {
  const { rows: existsRows } = await db.query(`SELECT to_regclass('public.analysis_snapshots') AS exists`);
  const tables = existsRows[0].exists ? [...RLS_TENANT_TABLES, 'analysis_snapshots'] : RLS_TENANT_TABLES;

  const { rows } = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)`, [tables]);
  for (const t of tables) {
    const row = rows.find(r => r.relname === t);
    assert.ok(row?.relrowsecurity, `${t} saknar ENABLE ROW LEVEL SECURITY`);
  }
});
