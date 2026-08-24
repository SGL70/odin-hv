// Multi-tenancy steg 5 (docs/multitenancy-forslag.md) — dashboard.js/export.js/import.js hade
// ingen egen testfil sedan tidigare, men migrerades till req.db i samma svep som features.js
// m.fl. Dessa rök-tester stänger den täckningsluckan: bekräftar att req.db faktiskt fungerar i
// dessa filer, inte bara att grep inte hittade en kvarglömd _req.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, listen, baseUrl, loginAsAdmin } = require('./helpers/testApp');

let server, base, adminToken;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
  adminToken = await loginAsAdmin(base);
});

after(async () => {
  try {
    await resetData();
  } finally {
    server.close();
    await db.pool.end();
  }
});

test('GET /api/dashboard fungerar via req.db', async () => {
  const res = await fetch(`${base}/api/dashboard`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.totals));
  assert.ok(Array.isArray(body.alerts));
  assert.ok(Array.isArray(body.activity));
});

test('GET /api/export/geojson fungerar via req.db', async () => {
  await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Export-test', geometry: { type: 'Point', coordinates: [22.1, 65.6] } }),
  });
  const res = await fetch(`${base}/api/export/geojson`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, 'FeatureCollection');
  assert.ok(body.features.some(f => f.properties.name === 'Export-test'));
});

test('POST /api/import/geojson fungerar via req.db', async () => {
  const res = await fetch(`${base}/api/import/geojson`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      layer: 'road_situations',
      geojson: { type: 'Feature', properties: { name: 'Import-test' }, geometry: { type: 'Point', coordinates: [22.1, 65.6] } },
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.imported, 1);

  const check = await db.query(`SELECT name FROM features WHERE name = 'Import-test'`);
  assert.equal(check.rows.length, 1);
});
