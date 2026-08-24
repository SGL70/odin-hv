const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Multi-tenancy steg 9 — egen pool för Platform Admin-verktyget (services/routes/platformAdmin.js),
// medvetet HÅLLEN SEPARAT från `pool` ovan även om den idag (innan produktionens rollseparation,
// se ensureRowLevelSecurity() i migrations.js) råkar peka på samma superuser-roll och därmed
// beter sig identiskt. Poängen är att koden REDAN är förberedd: den dag `pool` pekas om till en
// begränsad, RLS-underkastad runtime-roll behöver bara PLATFORM_ADMIN_DATABASE_URL sättas till en
// roll med BYPASSRLS (eller lämnas som den priviligierade rollen) — ingen kodändring i
// platformAdmin.js krävs, eftersom den redan frågar via den HÄR poolen, inte `pool`.
const platformPool = new Pool({ connectionString: process.env.PLATFORM_ADMIN_DATABASE_URL || process.env.DATABASE_URL });

// Multi-tenancy steg 5 (docs/multitenancy-forslag.md) — checkar ut EN klient från poolen och
// sätter org-kontext på SESSION-nivå (set_config med is_local=false, dvs "SET" inte "SET LOCAL"),
// för hela klientens livstid, i stället för att slå in en hel request/jobb i en enda transaktion.
//
// Varför inte BEGIN + SET LOCAL + COMMIT (planens ursprungliga skiss)? Stora delar av kodbasen
// (t.ex. harvest.js:s saveFeatures(), som loopar hundratals rader med ETT EGET try/catch per rad
// — "catch { skipped++; }") förutsätter att en misslyckad INSERT inte spärrar efterföljande.
// Postgres markerar en HEL transaktion som "aborted" efter första felet inuti den — om alla
// frågor under en request delade samma transaktion skulle en trasig rad i en skörderunda tyst få
// ALLA senare rader att också misslyckas ("current transaction is aborted, commands ignored until
// end of transaction block"), fast de var för sig hade gått bra. Det vore INTE "oförändrat
// beteende" (steg 5:s uttalade krav), utan en tyst regression.
//
// Session-SET ger samma RLS-synlighet som SET LOCAL (current_setting läser sessionen oavsett hur
// värdet sattes — RLS-policyerna i steg 7 bryr sig inte om skillnaden) utan den bieffekten. Priset
// är att VI måste garantera RESET innan klienten går tillbaka till poolen — annars läcker en
// organisations kontext till nästa obesläktade request som råkar återanvända samma uppkoppling.
async function checkoutTenantClient({ orgId, visibleOrgIds }) {
  const client = await pool.connect();
  const ids = visibleOrgIds && visibleOrgIds.length ? visibleOrgIds : [orgId];
  try {
    await client.query(`SELECT set_config('app.org_id', $1, false)`, [String(orgId)]);
    await client.query(`SELECT set_config('app.visible_org_ids', $1, false)`, [`{${ids.join(',')}}`]);
  } catch (err) {
    client.release(err); // trasig anslutning — låt poolen förstöra den i stället för att återanvända
    throw err;
  }

  let released = false;
  return {
    client,
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query(`RESET app.org_id`);
        await client.query(`RESET app.visible_org_ids`);
        client.release();
      } catch (err) {
        client.release(err);
      }
    },
  };
}

// För bakgrundsjobb utan HTTP-request (services/dailyReport.js, services/newsFeeds.js:s
// pollning, harvest.js:s runAutoHarvest()) — checkar ut, kör fn(client), städar alltid upp.
async function withTenant({ orgId, visibleOrgIds }, fn) {
  const { client, release } = await checkoutTenantClient({ orgId, visibleOrgIds });
  try {
    return await fn(client);
  } finally {
    await release();
  }
}

// Delad hjälpare för bakgrundsjobb som ska köras en gång PER BATALJON (aldrig militärregioner —
// de äger ingen egen data, se docs/multitenancy-forslag.md). Ett fel i en bataljons körning
// stoppar inte de andra. Används av harvest.js:s runAutoHarvest(), index.js:s
// scheduleDailySnapshot(), och (kommande) newsFeeds.js/dailyReport.js.
async function withEachBattalion(fn) {
  const { rows: battalions } = await pool.query(`SELECT id FROM organizations WHERE org_type = 'bataljon'`);
  for (const battalion of battalions) {
    try {
      await withTenant({ orgId: battalion.id, visibleOrgIds: [battalion.id] }, (client) => fn(client, battalion));
    } catch (err) {
      console.error(`Bakgrundsjobb misslyckades för bataljon ${battalion.id}:`, err.message);
    }
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  checkoutTenantClient,
  withTenant,
  withEachBattalion,
  platformPool,
  platformQuery: (text, params) => platformPool.query(text, params),
};
