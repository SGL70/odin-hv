// Övar samtidigt schemagap-fixen (ensureSettingsAndMunicipalitiesSchema i migrations.js) —
// settings/municipalities fanns tidigare bara i den skarpa databasen, inte i repot.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, listen, baseUrl, loginAsAdmin, createUserAndLogin } = require('./helpers/testApp');

let server, base, adminToken, readerToken;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
  adminToken = await loginAsAdmin(base);
  readerToken = await createUserAndLogin(base, adminToken, { username: 'test-reader3', password: 'testtest123', role: 'reader' });
});

after(async () => {
  try {
    await resetData();
  } finally {
    server.close();
    await db.pool.end();
  }
});

test('GET /api/settings returnerar de seedade default-nycklarna', async () => {
  const res = await fetch(`${base}/api/settings`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.snapshot_retention_days, 30);
  assert.ok(body.criticality_weighting);
  assert.ok(body.layer_weighting);
});

test('PUT /api/settings/:key som admin uppdaterar värdet', async () => {
  const put = await fetch(`${base}/api/settings/snapshot_retention_days`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ value: 45 }),
  });
  assert.equal(put.status, 200);
  const get = await fetch(`${base}/api/settings`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const body = await get.json();
  assert.equal(body.snapshot_retention_days, 45);
});

test('PUT /api/settings/:key som reader nekas (403)', async () => {
  const res = await fetch(`${base}/api/settings/snapshot_retention_days`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readerToken}` },
    body: JSON.stringify({ value: 99 }),
  });
  assert.equal(res.status, 403);
});

test('opomr-bbox räknar ut en bounding box från en seedad kommunpolygon', async () => {
  // Enkel kvadrat runt Luleå — geografisk exakthet spelar ingen roll för testet, bara att
  // ST_Extent hittar rätt polygon via short_name.
  await db.query(
    `INSERT INTO municipalities (short_name, geom) VALUES ($1, ST_GeomFromGeoJSON($2))`,
    ['Luleå', JSON.stringify({ type: 'Polygon', coordinates: [[[22, 65.5], [22.5, 65.5], [22.5, 65.7], [22, 65.7], [22, 65.5]]] })]
  );
  await fetch(`${base}/api/settings/op_municipalities`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ value: ['Luleå'] }),
  });

  const res = await fetch(`${base}/api/settings/opomr-bbox`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const bbox = await res.json();
  assert.equal(bbox.minlng, 22);
  assert.equal(bbox.maxlng, 22.5);
});
