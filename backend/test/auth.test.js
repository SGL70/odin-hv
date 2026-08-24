const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { db, resetData, listen, baseUrl } = require('./helpers/testApp');

let server, base;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
});

after(async () => {
  server.close();
  await db.pool.end();
});

test('login med rätt lösenord ger en giltig JWT med id/username/role', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.username, 'admin');
  assert.equal(body.user.role, 'admin');
  assert.ok(body.user.org_id);
  const decoded = jwt.verify(body.token, process.env.JWT_SECRET);
  assert.equal(decoded.username, 'admin');
  assert.equal(decoded.role, 'admin');
  assert.ok(decoded.org_id);
});

test('login med fel lösenord ger 401', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'fel-losenord' }),
  });
  assert.equal(res.status, 401);
});

test('login med okänt användarnamn ger 401 (inte 500 eller skillnad mot fel lösenord)', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'finns-inte', password: 'vad-som-helst' }),
  });
  assert.equal(res.status, 401);
});

test('skyddad route utan Authorization-header ger 401', async () => {
  const res = await fetch(`${base}/api/features`);
  assert.equal(res.status, 401);
});

test('skyddad route med ogiltig token ger 401', async () => {
  const res = await fetch(`${base}/api/features`, {
    headers: { Authorization: 'Bearer inte-en-riktig-token' },
  });
  assert.equal(res.status, 401);
});

test('requireRole nekar fel roll (reader mot admin-only /auth/users) med 403', async () => {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
  });
  const adminToken = (await loginRes.json()).token;

  await fetch(`${base}/api/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username: 'test-reader', password: 'testtest123', role: 'reader' }),
  });
  const readerLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-reader', password: 'testtest123' }),
  });
  const readerToken = (await readerLogin.json()).token;

  const res = await fetch(`${base}/api/auth/users`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  assert.equal(res.status, 403);

  await resetData();
});
