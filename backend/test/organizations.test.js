// Multi-tenancy steg 2+3+4 (docs/multitenancy-forslag.md) — organizations-tabellen, users.org_id,
// tenant-tabellernas org_id, och den hierarkiska synliga org-mängden.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, listen, baseUrl, loginAsAdmin, createUserAndLogin } = require('./helpers/testApp');
const { resolveOrgId, resolveVisibleOrgIds } = require('../src/services/orgContext');

let server, base;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
});

after(async () => {
  try {
    await resetData();
  } finally {
    server.close();
    await db.pool.end();
  }
});

test('en default-bataljon finns och admin är backfyllad till den', async () => {
  const org = await db.query(`SELECT * FROM organizations WHERE slug = 'default'`);
  assert.equal(org.rows.length, 1);
  assert.equal(org.rows[0].org_type, 'bataljon');

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  assert.equal(admin.rows[0].org_id, org.rows[0].id);
});

test('users.org_id är NOT NULL', async () => {
  const res = await db.query(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'org_id'
  `);
  assert.equal(res.rows[0].is_nullable, 'NO');
});

test('en ny användare ärver den skapande adminens org_id', async () => {
  const adminToken = await loginAsAdmin(base);
  const editorToken = await createUserAndLogin(base, adminToken, { username: 'test-org-editor', password: 'testtest123', role: 'editor' });
  assert.ok(editorToken);

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  const editor = await db.query(`SELECT org_id FROM users WHERE username = 'test-org-editor'`);
  assert.equal(editor.rows[0].org_id, admin.rows[0].org_id);
});

test('features.org_id är NOT NULL', async () => {
  const res = await db.query(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'features' AND column_name = 'org_id'
  `);
  assert.equal(res.rows[0].is_nullable, 'NO');
});

test('en feature skapad via POST ärver den skapande användarens org_id', async () => {
  const adminToken = await loginAsAdmin(base);
  const create = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Org-test', geometry: { type: 'Point', coordinates: [22.1, 65.6] } }),
  });
  const { id: uid } = await create.json();

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  const feature = await db.query(`SELECT org_id FROM features WHERE uid = $1`, [uid]);
  assert.equal(feature.rows[0].org_id, admin.rows[0].org_id);
});

test('resolveOrgId(null) — systeminitierade skrivningar (schemalagd skördning, 46elks-webhook) faller tillbaka till Standardbataljon', async () => {
  const orgId = await resolveOrgId(null);
  const orgId0 = await resolveOrgId(0); // runAutoHarvest()-konventionen: userId 0 = system
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  assert.equal(orgId, org.rows[0].id);
  assert.equal(orgId0, org.rows[0].id);
});

test('alert_rules.org_id och alert_events.org_id är NOT NULL', async () => {
  const res = await db.query(`
    SELECT table_name, is_nullable FROM information_schema.columns
    WHERE table_name IN ('alert_rules', 'alert_events') AND column_name = 'org_id'
  `);
  assert.equal(res.rows.length, 2);
  for (const row of res.rows) assert.equal(row.is_nullable, 'NO', `${row.table_name}.org_id ska vara NOT NULL`);
});

test('en larmregel skapad via POST ärver den skapande användarens org_id', async () => {
  const adminToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/alerts/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Org-testregel', type: 'threshold', config: { score_threshold: 999999 } }),
  });
  assert.equal(res.status, 201);
  const rule = await res.json();

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  assert.equal(rule.org_id, admin.rows[0].org_id);
});

test('ett larmevent ärver org_id från regeln som utlöste det, inte från vem som körde evalueringen', async () => {
  const adminToken = await loginAsAdmin(base);

  // Två features nära varandra: target (A) + en källa (B) i samma lager, för en proximity-regel.
  const makeFeature = async (layer, name, coords) => {
    const r = await fetch(`${base}/api/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ layer, name, geometry: { type: 'Point', coordinates: coords } }),
    });
    return (await r.json()).id;
  };
  const targetUid = await makeFeature('power_outages', 'Mål', [22.15, 65.58]);
  await makeFeature('power_outages', 'Källa', [22.1501, 65.5801]);

  const ruleRes = await fetch(`${base}/api/alerts/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Org-testregel proximity', type: 'proximity',
      config: { layer: 'power_outages', distance_m: 5000, target_uid: targetUid },
    }),
  });
  const rule = await ruleRes.json();

  const evalRes = await fetch(`${base}/api/alerts/evaluate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(evalRes.status, 200);

  const events = await db.query(`SELECT org_id FROM alert_events WHERE rule_id = $1`, [rule.id]);
  assert.ok(events.rows.length >= 1);
  assert.ok(events.rows.every(r => r.org_id === rule.org_id));
});

test('features_history.org_id är NOT NULL', async () => {
  const res = await db.query(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'features_history' AND column_name = 'org_id'
  `);
  assert.equal(res.rows[0].is_nullable, 'NO');
});

test('en arkiverad feature (harvest.js archiveAndDelete) behåller org_id från källraden', async () => {
  const harvestRouter = require('../src/routes/harvest');
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);

  await db.query(`
    INSERT INTO features (layer, name, geom, cot_type, attributes, org_id)
    VALUES ('road_situations', 'Att arkivera', ST_SetSRID(ST_MakePoint(22.1, 65.6), 4326), 'b-m-p-s-p', '{"scraped_at":"2026-07-17T00:00:00Z"}', $1)
  `, [org.rows[0].id]);

  await harvestRouter.archiveAndDelete(db, `layer = $1 AND (attributes->>'scraped_at') IS NOT NULL`, ['road_situations'], 'test_archive');

  const archived = await db.query(`SELECT org_id FROM features_history WHERE name = 'Att arkivera'`);
  assert.equal(archived.rows.length, 1);
  assert.equal(archived.rows[0].org_id, org.rows[0].id);
});

// Bugg hittad 2026-07-18 (levande sedan "server-schemalagd skördning" byggdes 2026-07-16/17,
// oberoende av multi-tenancy-migrationen): features.created_by/updated_by är en FOREIGN KEY mot
// users(id) (SERIAL, börjar på 1) — userId=0 (runAutoHarvest, ingen inloggad användare) gav alltså
// en FK-överträdelse på VARJE rad, tyst fångad av saveFeatures()s per-rad try/catch ("skipped",
// aldrig ett synligt fel). Auto-skördningen för polishändelser/trafikhändelser/elavbrott/
// vädervarningar/trafikflöde sparade alltså ALDRIG något sedan den byggdes. Fixat till
// `userId || null` — NULL är giltigt (kolumnen saknar NOT NULL) och betyder "systemet".
test('saveFeatures med userId=0 (schemalagd skördning) sparar raden i stället för att tyst skippa den', async () => {
  const harvestRouter = require('../src/routes/harvest');
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [22.1, 65.6] },
    properties: { layer: 'road_situations', name: 'Schemalagd-testrad', scraped_at: new Date().toISOString() },
  };
  const { imported, skipped } = await harvestRouter.saveFeatures(db, [feature], 0);
  assert.equal(imported, 1, 'raden borde ha sparats, inte skippats pga created_by=0 FK-överträdelse');
  assert.equal(skipped, 0);

  const saved = await db.query(`SELECT created_by, updated_by FROM features WHERE name = 'Schemalagd-testrad'`);
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].created_by, null);
  assert.equal(saved.rows[0].updated_by, null);

  await db.query(`DELETE FROM features WHERE name = 'Schemalagd-testrad'`);
});

test('sms_senders.org_id och sms_tips.org_id är NOT NULL', async () => {
  const res = await db.query(`
    SELECT table_name, is_nullable FROM information_schema.columns
    WHERE table_name IN ('sms_senders', 'sms_tips') AND column_name = 'org_id'
  `);
  assert.equal(res.rows.length, 2);
  for (const row of res.rows) assert.equal(row.is_nullable, 'NO', `${row.table_name}.org_id ska vara NOT NULL`);
});

test('46elks-webhooken (ingen inloggad användare) sätter org_id till Standardbataljon på en okänd avsändare', async () => {
  const res = await fetch(`${base}/api/sms/incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: 'test-elks-1', from: '+46700000001', message: 'Ett tips', created: new Date().toISOString() }),
  });
  assert.equal(res.status, 200);

  // Webhooken svarar direkt ("noresponse" till 46elks) och fortsätter skriva till DB asynkront
  // efteråt — pollar tills raderna dyker upp i stället för att anta att de redan finns.
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  let tip;
  for (let i = 0; i < 20; i++) {
    tip = await db.query(`SELECT org_id FROM sms_tips WHERE from_number = '+46700000001'`);
    if (tip.rows.length) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const sender = await db.query(`SELECT org_id FROM sms_senders WHERE phone = '+46700000001'`);
  assert.equal(sender.rows[0].org_id, org.rows[0].id);
  assert.equal(tip.rows[0].org_id, org.rows[0].id);
});

test('PUT /senders/:phone som admin sätter org_id på en ny avsändare', async () => {
  const adminToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/sms/senders/${encodeURIComponent('+46700000002')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'known', label: 'Testavsändare', lat: 65.6, lng: 22.1 }),
  });
  assert.equal(res.status, 200);

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  const sender = await db.query(`SELECT org_id FROM sms_senders WHERE phone = '+46700000002'`);
  assert.equal(sender.rows[0].org_id, admin.rows[0].org_id);
});

test('news_sources.org_id och news_items.org_id är NOT NULL, och default-källorna är backfyllda', async () => {
  const res = await db.query(`
    SELECT table_name, is_nullable FROM information_schema.columns
    WHERE table_name IN ('news_sources', 'news_items') AND column_name = 'org_id'
  `);
  assert.equal(res.rows.length, 2);
  for (const row of res.rows) assert.equal(row.is_nullable, 'NO', `${row.table_name}.org_id ska vara NOT NULL`);

  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const sources = await db.query(`SELECT org_id FROM news_sources WHERE name = 'SVT Nyheter Norrbotten'`);
  assert.equal(sources.rows[0].org_id, org.rows[0].id);
});

test('en nyhetskälla skapad via POST ärver den skapande adminens org_id', async () => {
  const adminToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/news/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Org-testkälla', url: 'https://exempel-utan-rss.invalid/' }),
  });
  assert.equal(res.status, 200);
  const source = await res.json();

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  assert.equal(source.org_id, admin.rows[0].org_id);
});

test('analysis_snapshots.org_id sätts till Standardbataljon (systemberäkning över alla kommuner, inte en specifik org)', async () => {
  await db.query(
    `INSERT INTO municipalities (short_name, geom) VALUES ('Org-testkommun', ST_GeomFromGeoJSON($1)) ON CONFLICT (short_name) DO NOTHING`,
    [JSON.stringify({ type: 'Polygon', coordinates: [[[22, 65.5], [22.5, 65.5], [22.5, 65.7], [22, 65.7], [22, 65.5]]] })]
  );
  const adminToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/analysis/snapshot`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);

  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const snapshot = await db.query(`SELECT org_id FROM analysis_snapshots WHERE municipality = 'Org-testkommun'`);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].org_id, org.rows[0].id);
});

// Bugg hittad 2026-07-17 (docs/multitenancy-forslag.md "Öppna frågor"): den ursprungliga
// UNIQUE(snapshot_date, municipality) saknade org_id, så två bataljoner kunde inte båda spara ett
// analysögonblick för samma kommun samma dag — en unik-konflikt hade uppstått trots att raderna
// hör till olika organisationer. Testar direkt mot schemat (inte via routen, som bara stödjer den
// inloggade användarens egen org) att BÅDA insätts utan krock, och att en riktig dubblett
// (samma dag+kommun+org) fortfarande uppdaterar i stället för att skapa en andra rad.
test('analysis_snapshots: två olika organisationer kan spara ett ögonblick för samma kommun samma dag utan unik-konflikt', async () => {
  const defaultOrg = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const otherOrg = await db.query(
    `INSERT INTO organizations (name, slug, org_type) VALUES ('Analys-testbataljon', 'analys-test-org', 'bataljon') RETURNING id`
  );
  try {
    const upsert = (orgId, score) => db.query(
      `INSERT INTO analysis_snapshots (snapshot_date, municipality, score, org_id)
       VALUES (CURRENT_DATE, 'Analys-krocktest', $1, $2)
       ON CONFLICT (snapshot_date, municipality, org_id) DO UPDATE SET score = $1`,
      [score, orgId]
    );
    await assert.doesNotReject(() => upsert(defaultOrg.rows[0].id, 1));
    await assert.doesNotReject(() => upsert(otherOrg.rows[0].id, 2));

    const rows = await db.query(`SELECT org_id, score FROM analysis_snapshots WHERE municipality = 'Analys-krocktest' ORDER BY org_id`);
    assert.equal(rows.rows.length, 2, 'båda organisationernas rader ska finnas kvar samtidigt');

    // Riktig dubblett (samma dag+kommun+org) ska fortfarande uppdatera, inte skapa en till rad.
    await upsert(defaultOrg.rows[0].id, 99);
    const afterUpdate = await db.query(`SELECT score FROM analysis_snapshots WHERE municipality = 'Analys-krocktest' AND org_id = $1`, [defaultOrg.rows[0].id]);
    assert.equal(afterUpdate.rows.length, 1);
    assert.equal(Number(afterUpdate.rows[0].score), 99);
  } finally {
    await db.query(`DELETE FROM analysis_snapshots WHERE municipality = 'Analys-krocktest'`);
    await db.query(`DELETE FROM organizations WHERE id = $1`, [otherOrg.rows[0].id]);
  }
});

test('activity_log.org_id är NOT NULL och sätts av den agerande användaren (create/update/delete)', async () => {
  const res = await db.query(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'activity_log' AND column_name = 'org_id'
  `);
  assert.equal(res.rows[0].is_nullable, 'NO');

  const adminToken = await loginAsAdmin(base);
  const create = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Activity-log-test', geometry: { type: 'Point', coordinates: [22.1, 65.6] } }),
  });
  const { id: uid } = await create.json();

  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);
  const log = await db.query(`SELECT org_id FROM activity_log WHERE feature_uid = $1 AND action = 'create'`, [uid]);
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].org_id, admin.rows[0].org_id);
});

test('settings har en sammansatt PRIMARY KEY (org_id, key), inte bara key', async () => {
  const res = await db.query(`
    SELECT a.attname FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'settings'::regclass AND i.indisprimary
    ORDER BY a.attname
  `);
  assert.deepEqual(res.rows.map(r => r.attname).sort(), ['key', 'org_id']);
});

test('/api/analysis/choropleth fungerar med org-scopade criticality_weighting/layer_weighting-inställningar', async () => {
  const adminToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/analysis/choropleth`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, 'FeatureCollection');
});

test('en threshold-larmregel läser org-scopade settings via computeDisruptionScores(rule.org_id)', async () => {
  const adminToken = await loginAsAdmin(base);
  const ruleRes = await fetch(`${base}/api/alerts/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Org-testregel threshold', type: 'threshold', config: { score_threshold: 0 } }),
  });
  const rule = await ruleRes.json();

  // score_threshold 0 borde träffa Org-testkommun (seedad av analysis_snapshots-testet ovan) —
  // om computeDisruptionScores(rule.org_id) kastade (t.ex. fel antal SQL-parametrar) skulle
  // /evaluate ge 500 i stället för att bara inte hitta någon kommun med data.
  const evalRes = await fetch(`${base}/api/alerts/evaluate`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(evalRes.status, 200);

  const events = await db.query(`SELECT org_id FROM alert_events WHERE rule_id = $1`, [rule.id]);
  for (const e of events.rows) assert.equal(e.org_id, rule.org_id);
});

test('resolveVisibleOrgIds — en bataljon ser bara sig själv', async () => {
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const visible = await resolveVisibleOrgIds(org.rows[0].id);
  assert.deepEqual(visible, [org.rows[0].id]);
});

test('resolveVisibleOrgIds — en militärregion ser sig själv plus sina bataljoner', async () => {
  const region = await db.query(
    `INSERT INTO organizations (name, slug, org_type) VALUES ('Militärregion Test', 'mr-test', 'militarregion') RETURNING id`
  );
  const battalion = await db.query(
    `INSERT INTO organizations (name, slug, org_type, parent_org_id) VALUES ('Bataljon under MR', 'bataljon-under-mr', 'bataljon', $1) RETURNING id`,
    [region.rows[0].id]
  );
  const otherBattalion = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);

  const visible = await resolveVisibleOrgIds(region.rows[0].id);
  assert.deepEqual(visible.sort(), [region.rows[0].id, battalion.rows[0].id].sort());
  assert.ok(!visible.includes(otherBattalion.rows[0].id));
});
