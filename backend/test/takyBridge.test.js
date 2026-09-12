const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, loginAsAdmin, listen, baseUrl } = require('./helpers/testApp');
const dbModule = require('../src/db');
const { upsertTakReport, start, handleEvent } = require('../src/services/takyBridge');

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

test('handleEvent sänder features:reloaded till rätt org-rum efter en lyckad upsert', async () => {
  // Regression: den ursprungliga implementationen skrev direkt till DB utan att sända samma
  // 'features:reloaded'-event som POST /api/features och harvest.js — inga anslutna webbläsare
  // fick veta att en ny markör fanns förrän någon manuellt laddade om sidan (upptäckt vid det
  // första produktionstestet 2026-09-12).
  const emitted = [];
  const fakeIo = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  start(fakeIo); // FEATURE_TAKY_BRIDGE är inte satt i testmiljön — sätter bara ioInstance, öppnar ingen socket

  const xml = `<event version="2.0" uid="TEST-EMIT-1" type="b-m-p-s-p" time="t" start="t" stale="t" how="h-g-i-g-o">
  <point lat="65.2" lon="22.3" hae="0" ce="10" le="10"/>
  <detail><contact callsign="Charlie3"/></detail>
</event>`;
  await handleEvent(xml);

  // Filtrera på vårt org-rum, inte total längd — andra testfiler i samma körning lämnar kvar
  // egna bataljon-orgs (resetData() rensar aldrig organizations-tabellen), så withEachBattalion
  // kan iterera fler än en battalion när hela sviten kör.
  const forOurOrg = emitted.filter(e => e.room === `org:${orgId}`);
  assert.equal(forOurOrg.length, 1);
  assert.equal(forOurOrg[0].event, 'features:reloaded');
});
