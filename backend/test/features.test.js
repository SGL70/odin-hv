const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, listen, baseUrl, loginAsAdmin, createUserAndLogin } = require('./helpers/testApp');

let server, base, adminToken, editorToken, readerToken;

const POINT = { type: 'Point', coordinates: [22.15, 65.58] }; // nära Luleå

before(async () => {
  server = await listen();
  base = await baseUrl(server);
  adminToken = await loginAsAdmin(base);
  editorToken = await createUserAndLogin(base, adminToken, { username: 'test-editor', password: 'testtest123', role: 'editor' });
  readerToken = await createUserAndLogin(base, adminToken, { username: 'test-reader2', password: 'testtest123', role: 'reader' });
});

// try/finally: en trasig resetData() ska inte lämna http-servern lyssnande för alltid — det
// håller processen vid liv på obestämd tid eftersom inget annat någonsin stänger den (så hände
// när activity_log/users-FK-buggen fanns här: after() kastade, server.close() nåddes aldrig).
after(async () => {
  try {
    await resetData();
  } finally {
    server.close();
    await db.pool.end();
  }
});

test('editor kan skapa ett objekt (POST /api/features)', async () => {
  const res = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Testhändelse', geometry: POINT }),
  });
  assert.equal(res.status, 201);
  const feature = await res.json();
  assert.equal(feature.properties.layer, 'road_situations');
  assert.ok(feature.id);
});

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

test('reader nekas att skapa objekt (403)', async () => {
  const res = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readerToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Ska nekas', geometry: POINT }),
  });
  assert.equal(res.status, 403);
});

test('reader ser aldrig intelligence_reports-lagret (OPSEC), men editor/admin gör det', async () => {
  const createRes = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({ layer: 'intelligence_reports', name: 'Hemlig rapport', geometry: POINT }),
  });
  assert.equal(createRes.status, 201);

  const asReader = await fetch(`${base}/api/features`, { headers: { Authorization: `Bearer ${readerToken}` } });
  const readerFeatures = await asReader.json();
  assert.ok(readerFeatures.features.every(f => f.properties.layer !== 'intelligence_reports'));

  const asEditor = await fetch(`${base}/api/features`, { headers: { Authorization: `Bearer ${editorToken}` } });
  const editorFeatures = await asEditor.json();
  assert.ok(editorFeatures.features.some(f => f.properties.layer === 'intelligence_reports'));
});

test('PUT/DELETE nekar reader men tillåter editor', async () => {
  const create = await fetch(`${base}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({ layer: 'road_situations', name: 'Att uppdatera', geometry: POINT }),
  });
  const { id: uid } = await create.json();

  const putAsReader = await fetch(`${base}/api/features/${uid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readerToken}` },
    body: JSON.stringify({ name: 'Ska nekas', geometry: POINT }),
  });
  assert.equal(putAsReader.status, 403);

  const putAsEditor = await fetch(`${base}/api/features/${uid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({ name: 'Uppdaterad', geometry: POINT }),
  });
  assert.equal(putAsEditor.status, 200);

  const deleteAsReader = await fetch(`${base}/api/features/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(deleteAsReader.status, 403);
});
