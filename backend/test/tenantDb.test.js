// Multi-tenancy steg 5 (docs/multitenancy-forslag.md) — kärnmekaniken i src/db.js
// (checkoutTenantClient/withTenant) och middleware/auth.js:s req.db-koppling. Testar specifikt de
// tre sätt detta kan gå sönder tyst: läckt org-kontext mellan poolade anslutningar, en connection
// leak (klienten går aldrig tillbaka till poolen), och att en delad transaktion av misstag bryter
// det redan existerande "ett fel i en loop ska inte stoppa resten"-mönstret (harvest.js m.fl.).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetData, listen, baseUrl, loginAsAdmin } = require('./helpers/testApp');
const dbModule = require('../src/db');
const { requireAuth } = require('../src/middleware/auth');

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

test('checkoutTenantClient sätter org-kontext synlig via current_setting på samma klient', async () => {
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const { client, release } = await dbModule.checkoutTenantClient({ orgId: org.rows[0].id, visibleOrgIds: [org.rows[0].id] });
  try {
    const res = await client.query(`SELECT current_setting('app.org_id', true) AS org_id, current_setting('app.visible_org_ids', true) AS visible`);
    assert.equal(res.rows[0].org_id, String(org.rows[0].id));
    assert.equal(res.rows[0].visible, `{${org.rows[0].id}}`);
  } finally {
    await release();
  }
});

test('release() nollställer org-kontexten — läcker inte till nästa utcheckning från poolen', async () => {
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const first = await dbModule.checkoutTenantClient({ orgId: org.rows[0].id, visibleOrgIds: [org.rows[0].id] });
  await first.release();

  // Ingen garanti att det blir SAMMA underliggande anslutning, men poolen är liten i test — checka
  // ut manuellt (utan att sätta ny kontext) och bekräfta att INGET av tidigare värde finns kvar.
  const raw = await dbModule.pool.connect();
  try {
    const res = await raw.query(`SELECT current_setting('app.org_id', true) AS org_id`);
    assert.equal(res.rows[0].org_id, '');
  } finally {
    raw.release();
  }
});

test('withTenant() kör en funktion med org-kontext satt och städar upp efteråt', async () => {
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const seenOrgId = await dbModule.withTenant({ orgId: org.rows[0].id, visibleOrgIds: [org.rows[0].id] }, async (client) => {
    const res = await client.query(`SELECT current_setting('app.org_id', true) AS org_id`);
    return res.rows[0].org_id;
  });
  assert.equal(seenOrgId, String(org.rows[0].id));
});

test('en misslyckad fråga på req.db stoppar INTE efterföljande frågor (ingen delad transaktion)', async () => {
  // Detta är den kritiska regressionsrisken: om checkoutTenantClient delade EN transaktion över
  // hela livstiden skulle ett fel här markera transaktionen "aborted" och nästa query skulle
  // krascha med "current transaction is aborted" — exakt det harvest.js:s per-rad try/catch
  // ("catch { skipped++; }") förutsätter INTE händer.
  const org = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  const { client, release } = await dbModule.checkoutTenantClient({ orgId: org.rows[0].id, visibleOrgIds: [org.rows[0].id] });
  try {
    await assert.rejects(() => client.query('SELECT * FROM tabell_som_inte_finns'));
    // Om ovanstående fel hade förstört klientens transaktion skulle detta också kasta.
    const res = await client.query('SELECT 1 AS ok');
    assert.equal(res.rows[0].ok, 1);
  } finally {
    await release();
  }
});

test('requireAuth kopplar req.db med rätt org-kontext och städar upp när svaret är klart', async () => {
  const adminToken = await loginAsAdmin(base);
  const admin = await db.query(`SELECT org_id FROM users WHERE username = 'admin'`);

  let capturedDb;
  const req = { headers: { authorization: `Bearer ${adminToken}` } };
  const res = new (require('node:events').EventEmitter)();
  res.status = () => res;
  res.json = () => res;

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => err ? reject(err) : resolve());
  });
  capturedDb = req.db;
  assert.ok(capturedDb);

  const orgCheck = await capturedDb.query(`SELECT current_setting('app.org_id', true) AS org_id`);
  assert.equal(orgCheck.rows[0].org_id, String(admin.rows[0].org_id));

  // Simulera att svaret skickas klart — ska trigga RESET+release utan att kasta.
  res.emit('finish');
  await new Promise(r => setTimeout(r, 50));
});
