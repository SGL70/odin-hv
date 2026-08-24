// Delad testuppstart. Miljövariablerna sätts INNAN ../../src/index (och därmed ../../src/db)
// laddas, eftersom db.js skapar sin pg.Pool vid require-tid mot process.env.DATABASE_URL — samma
// mönster som produktionskoden, bara pekat mot testdatabasen (se test/run.sh).
process.env.DATABASE_URL ||= 'postgresql://ledning:test@localhost:5433/ledning_test';
process.env.JWT_SECRET ||= 'test-secret-do-not-use-in-prod';
process.env.ADMIN_PASSWORD ||= 'test-admin-pw';
process.env.PLATFORM_ADMIN_JWT_SECRET ||= 'test-platform-admin-secret-do-not-use-in-prod';
process.env.PLATFORM_ADMIN_PASSWORD ||= 'test-platform-admin-pw';
process.env.UPLOAD_DIR ||= '/tmp/ledning-test-uploads';

const { app } = require('../../src/index');
const db = require('../../src/db');

// Rensar tenant-data mellan testfiler men behåller schemat och den seed-data runMigrations()
// sätter upp (admin-användaren, news_sources-defaults, settings-defaults). Schemat måste redan
// vara migrerat innan testfilerna körs — se test/migrate.js, körs en gång av test/run.sh.
async function resetData() {
  // activity_log.user_id har en FK mot users(id) utan ON DELETE-klausul (RESTRICT) — måste
  // tömmas INNAN icke-admin-användare tas bort, annars: "violates foreign key constraint
  // activity_log_user_id_fkey". features.created_by/updated_by har samma begränsning mot
  // users, men features TRUNCATE:as redan i samma sats som activity_log här.
  await db.query(`TRUNCATE features, features_history, alert_events, sms_tips, sms_senders, news_items, activity_log RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM users WHERE username != 'admin'`);
  await db.query(`DELETE FROM municipalities`);
}

// Lyssnar på en ledig, godtycklig port (0) — separat från den http.Server/socket.io-instans
// index.js själv exporterar, som aldrig behöver lyssna i testerna.
async function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function loginAsAdmin(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
  });
  const body = await res.json();
  return body.token;
}

async function loginAsPlatformAdmin(base) {
  const res = await fetch(`${base}/api/platform-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: process.env.PLATFORM_ADMIN_PASSWORD }),
  });
  const body = await res.json();
  return body.token;
}

// Skapar en användare med given roll via det riktiga admin-skyddade API:t (övar routes/auth.js:s
// POST /users på samma gång) och loggar in som den, så testerna får en riktig JWT — inte en
// handsignerad genväg som kan tappa synk med vad routes/auth.js faktiskt producerar.
async function createUserAndLogin(base, adminToken, { username, password, role }) {
  const create = await fetch(`${base}/api/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username, password, role }),
  });
  if (create.status !== 201) throw new Error(`Kunde inte skapa testanvändare ${username}: ${create.status}`);
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  return body.token;
}

module.exports = { db, resetData, listen, baseUrl, loginAsAdmin, createUserAndLogin, loginAsPlatformAdmin };
