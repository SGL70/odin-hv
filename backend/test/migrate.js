// Kör schemat en gång, innan node --test startar testfilerna. De körs som separata, samtidiga
// processer (--test-isolation=process, parallellt) — lät varje fils egen before()-hook köra
// runMigrations() själv orsakade en kapplöpning på migrations.js:s DROP CONSTRAINT/ADD CONSTRAINT
// mot samma delade testdatabas (två processer kunde råka droppa/lägga till features_layer_check
// omlott, vilket gav "constraint already exists" eller en väntande DDL-lock).
process.env.DATABASE_URL ||= 'postgresql://ledning:test@localhost:5433/ledning_test';
process.env.JWT_SECRET ||= 'test-secret-do-not-use-in-prod';
process.env.ADMIN_PASSWORD ||= 'test-admin-pw';
process.env.PLATFORM_ADMIN_JWT_SECRET ||= 'test-platform-admin-secret-do-not-use-in-prod';
process.env.PLATFORM_ADMIN_PASSWORD ||= 'test-platform-admin-pw';

const { runMigrations } = require('../src/index');
const db = require('../src/db');

// RLS-testharnesset (test/rls.test.js, docs/multitenancy-forslag.md arkitekturpunkt 5) måste köra
// som en riktig begränsad databasroll — ANSLUTNINGSROLLEN i produktion (`ledning`, satt via
// POSTGRES_USER) är SUPERUSER (bootstrap-rollen som postgres-imaget skapar), och Postgres RLS
// gäller aldrig för en superuser oavsett policy. Ett test som körde mot samma roll som skapade
// tabellerna (ägaren) skulle ge grönt facit even om ENABLE ROW LEVEL SECURITY aldrig slogs på.
// Denna roll finns BARA i testdatabasen (skapas här, aldrig i src/migrations.js) — produktionens
// motsvarande rollseparation är ett eget, uttryckligen bekräftat steg (se doc), inte del av detta.
async function ensureTestAppRole() {
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledning_app_test') THEN
        CREATE ROLE ledning_app_test LOGIN PASSWORD 'test-app-pw' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);
  await db.query(`GRANT USAGE ON SCHEMA public TO ledning_app_test`);
  await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledning_app_test`);
  await db.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledning_app_test`);
}

runMigrations()
  .then(() => ensureTestAppRole())
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
