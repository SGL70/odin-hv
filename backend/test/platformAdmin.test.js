// Multi-tenancy steg 9 (docs/multitenancy-forslag.md) — platform_admins-tabellen och den helt
// separata auth-kodvägen (egen JWT-hemlighet, ingen org_id). Testar specifikt att detta INTE kan
// förväxlas med den vanliga användarinloggningen i någon riktning.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { db, resetData, listen, baseUrl, loginAsAdmin, loginAsPlatformAdmin } = require('./helpers/testApp');

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

test('en bootstrappad superadmin finns i platform_admins (inte i users)', async () => {
  const { rows } = await db.query(`SELECT * FROM platform_admins WHERE username = 'superadmin'`);
  assert.equal(rows.length, 1);
  const inUsers = await db.query(`SELECT * FROM users WHERE username = 'superadmin'`);
  assert.equal(inUsers.rows.length, 0);
});

test('platform_admins saknar org_id — ingen kolumn alls, till skillnad från users', async () => {
  const { rows } = await db.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'platform_admins'
  `);
  assert.ok(!rows.some(r => r.column_name === 'org_id'), 'platform_admins ska inte vara org-scopad');
});

test('POST /api/platform-admin/login med rätt lösenord ger en giltig token', async () => {
  const token = await loginAsPlatformAdmin(base);
  assert.ok(token);
  const claims = jwt.verify(token, process.env.PLATFORM_ADMIN_JWT_SECRET);
  assert.equal(claims.username, 'superadmin');
  assert.equal(claims.type, 'platform_admin');
});

test('POST /api/platform-admin/login med fel lösenord ger 401', async () => {
  const res = await fetch(`${base}/api/platform-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'fel-losenord' }),
  });
  assert.equal(res.status, 401);
});

test('GET /api/platform-admin/me med en giltig platform-admin-token fungerar', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.username, 'superadmin');
});

test('en vanlig användartoken (JWT_SECRET) accepteras ALDRIG av requirePlatformAdmin', async () => {
  const userToken = await loginAsAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/me`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.status, 401, 'en vanlig användares JWT (annan hemlighet, inget type-fält) fick åtkomst till platform-admin-endpoints');
});

test('en platform-admin-token accepteras ALDRIG av den vanliga requireAuth', async () => {
  const platformToken = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${platformToken}` },
  });
  assert.equal(res.status, 401, 'en platform-admin-token (annan hemlighet) verifierades av den vanliga requireAuth');
});

test('GET /api/platform-admin/me utan token ger 401', async () => {
  const res = await fetch(`${base}/api/platform-admin/me`);
  assert.equal(res.status, 401);
});

// ── Steg 10: org-provisionering, cross-org skördehälsa, kostnads-/användningsöversikt ──────────

test('GET /api/platform-admin/organizations kräver platform-admin-token', async () => {
  const res = await fetch(`${base}/api/platform-admin/organizations`);
  assert.equal(res.status, 401);
});

test('GET /api/platform-admin/organizations listar minst Standardbataljon med user_count/feature_count', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/organizations`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const orgs = await res.json();
  const defaultOrg = orgs.find(o => o.slug === 'default');
  assert.ok(defaultOrg);
  assert.equal(typeof defaultOrg.user_count, 'number');
  assert.equal(typeof defaultOrg.feature_count, 'number');
});

test('POST /api/platform-admin/organizations provisionerar en ny org UTAN admin-konto', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Test Bataljon Provisionering', slug: 'test-prov-1', org_type: 'bataljon' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.organization.slug, 'test-prov-1');
  assert.equal(body.admin, null);
  await db.query(`DELETE FROM organizations WHERE slug = 'test-prov-1'`);
});

test('POST /api/platform-admin/organizations provisionerar en ny org MED sitt första admin-konto', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Test Bataljon Provisionering 2', slug: 'test-prov-2', org_type: 'bataljon',
      adminUsername: 'test-prov-2-admin', adminPassword: 'testtest123',
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.admin.username, 'test-prov-2-admin');
  assert.equal(body.admin.role, 'admin');
  assert.equal(body.admin.org_id, body.organization.id);

  // Hönan-och-ägget-problemet är löst: det nya admin-kontot kan logga in DIREKT, utan att någon
  // annan admin behövde skapa det via routes/auth.js POST /users (som kräver en redan existerande org).
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-prov-2-admin', password: 'testtest123' }),
  });
  assert.equal(loginRes.status, 200);

  await db.query(`DELETE FROM users WHERE username = 'test-prov-2-admin'`);
  await db.query(`DELETE FROM organizations WHERE slug = 'test-prov-2'`);
});

test('POST /api/platform-admin/organizations avvisar ogiltig org_type', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Ogiltig', slug: 'test-prov-invalid', org_type: 'kompani' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/platform-admin/organizations avvisar adminUsername utan adminPassword', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Ofullständig', slug: 'test-prov-incomplete', org_type: 'bataljon', adminUsername: 'bara-användarnamn' }),
  });
  assert.equal(res.status, 400);
});

test('GET /api/platform-admin/harvest-health returnerar ett objekt keyat på org_id', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/harvest-health`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body, 'object');
});

test('GET /api/platform-admin/usage returnerar volymräkningar per org, inkl. Standardbataljon', async () => {
  const token = await loginAsPlatformAdmin(base);
  const res = await fetch(`${base}/api/platform-admin/usage`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const rows = await res.json();
  const defaultOrg = rows.find(r => r.name === 'Standardbataljon');
  assert.ok(defaultOrg);
  assert.equal(typeof defaultOrg.features, 'number');
  assert.equal(typeof defaultOrg.news_items_total, 'number');
  assert.equal(typeof defaultOrg.sms_tips, 'number');
});
