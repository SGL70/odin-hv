const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { ensureSettingsAndMunicipalitiesSchema, ensureOrganizationsSchema, ensureFeaturesOrgIdColumn, ensureAlertOrgIdColumns, ensureFeaturesHistoryOrgIdColumn, ensureSmsOrgIdColumns, ensureNewsOrgIdColumns, ensureActivityLogOrgIdColumn, ensureSettingsOrgIdColumn, ensureAlertSchema, ensureIntelligenceReportsLayer, ensureRailwaySituationsLayer, ensureFeatureHistorySchema, ensureUserPreferencesColumn, ensureSmsTablesSchema, ensureLastLoginColumn, ensureNewsReportsLayer, ensureNewsSchema, ensureLocationPrecisionBackfill, ensureWeatherWarningsLayer, ensureNewsClassifierColumns, ensureNotificationColumns, ensureRowLevelSecurity, ensurePlatformAdminsSchema } = require('./migrations');
const { pollAllSources } = require('./services/newsFeeds');
const { resolveVisibleOrgIds } = require('./services/orgContext');
const { sendDailyReport } = require('./services/dailyReport');
const harvestRouter = require('./routes/harvest');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Inject socket.io into requests
app.use((req, _res, next) => { req.io = io; next(); });

app.use('/api/auth', require('./routes/auth'));
app.use('/api/features', require('./routes/features'));
app.use('/api/import', require('./routes/import'));
app.use('/api/export', require('./routes/export'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/trafikverket', require('./routes/trafikverket'));
app.use('/api/harvest', harvestRouter);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/news', require('./routes/news'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/platform-admin', require('./routes/platformAdmin'));
app.use('/api/config', require('./routes/config'));
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
app.use('/uploads', express.static(UPLOAD_DIR));

const analysisRouter = require('./routes/analysis');
app.use('/api/analysis', analysisRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Multi-tenancy steg 8 (docs/multitenancy-forslag.md) — org-scopade rum i stället för blind
// broadcast. En socket går med i `org:<id>` för VARJE synlig org (den egna + barn-bataljoner om
// den tillhör en militärregion, se resolveVisibleOrgIds) — så en regionanvändare prenumererar på
// flera org-rum, precis som doc:en beskriver, inte ett nytt serverkoncept. `org:<id>:role:<roll>`
// är den tidigare rena `role:<roll>`-rummet (alertEngine.js:s riktade larmleverans), nu sammansatt
// med org — annars skulle en larmregel i en bataljon fortfarande läcka till admins i en HELT
// annan bataljon bara för att de delar samma roll (io.to() med flera .to()-anrop är en UNION,
// inte en snittmängd, så ett sammansatt rumsnamn är det enkla sättet att kräva BÅDA).
io.on('connection', async socket => {
  console.log('Client connected:', socket.id);
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const { role, org_id } = jwt.verify(token, process.env.JWT_SECRET);
      socket.orgId = org_id;
      const visibleOrgIds = await resolveVisibleOrgIds(org_id);
      for (const id of visibleOrgIds) {
        socket.join(`org:${id}`);
        if (role) socket.join(`org:${id}:role:${role}`);
      }
    }
  } catch { /* ingen/ogiltig token — sockeln får bara inget rum */ }
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

async function ensureAdmin() {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  // users.org_id är NOT NULL sedan ensureOrganizationsSchema() (körs innan detta i runMigrations()),
  // så en helt ny databas skulle annars misslyckas här — Standardbataljon finns redan vid det här laget.
  await db.query(`
    INSERT INTO users (username, password_hash, role, org_id)
    VALUES ('admin', $1, 'admin', (SELECT id FROM organizations WHERE slug = 'default'))
    ON CONFLICT (username) DO NOTHING
  `, [hash]);
  console.log('Admin user ready (username: admin)');
}

// Multi-tenancy steg 9 — bootstrap för DEN FÖRSTA platform-admin-kontot, samma idempotenta
// ON CONFLICT-mönster som ensureAdmin() ovan men mot platform_admins i stället för users
// (helt separat identitet, se migrations.js::ensurePlatformAdminsSchema). Eget
// PLATFORM_ADMIN_PASSWORD-env-värde — delar INTE ADMIN_PASSWORD, annars skulle den vanliga
// org-admin-bootstrappen och superadmin-bootstrappen av misstag dela lösenord.
async function ensurePlatformAdmin() {
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'platformadmin123';
  const hash = await bcrypt.hash(password, 10);
  await db.query(`
    INSERT INTO platform_admins (username, password_hash)
    VALUES ('superadmin', $1)
    ON CONFLICT (username) DO NOTHING
  `, [hash]);
  console.log('Platform admin ready (username: superadmin)');
}

// settings.org_id är del av en sammansatt PRIMARY KEY (org_id, key) sedan ensureSettingsOrgIdColumn()
// (körs innan detta i runMigrations()) — "ON CONFLICT (key)" ensam skulle inte längre matcha någon
// unik constraint och kasta fel, precis den bugg-klassen som redan hittades och fixades för
// news_sources default-källor (ON CONFLICT fångar bara sin egen konflikt-target, inget annat).
async function ensureSettings() {
  const defaultOrg = `(SELECT id FROM organizations WHERE slug = 'default')`;
  await db.query(`
    INSERT INTO settings (key, value, org_id) VALUES ('snapshot_retention_days', '30', ${defaultOrg})
    ON CONFLICT (org_id, key) DO NOTHING
  `);
  await db.query(`
    INSERT INTO settings (key, value, org_id) VALUES ('criticality_weighting', $1, ${defaultOrg})
    ON CONFLICT (org_id, key) DO NOTHING
  `, [JSON.stringify({ distance_m: 500, gul_multiplier: 1.5, rod_multiplier: 3 })]);
  await db.query(`
    INSERT INTO settings (key, value, org_id) VALUES ('layer_weighting', $1, ${defaultOrg})
    ON CONFLICT (org_id, key) DO NOTHING
  `, [JSON.stringify({ power_outages: 3, road_situations: 1, police_events: 1, railway_situations: 1 })]);
}

// Daglig snapshot-schemaläggare — sparar vid 00:05 varje natt
function scheduleDailySnapshot() {
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
  const msUntilNext = nextRun.getTime() - now.getTime();
  console.log(`Nästa analysögonblick om ${Math.round(msUntilNext / 60000)} minuter (${nextRun.toISOString()})`);
  setTimeout(() => {
    db.withEachBattalion((tenantDb) => analysisRouter.saveSnapshot(tenantDb));
    setInterval(() => db.withEachBattalion((tenantDb) => analysisRouter.saveSnapshot(tenantDb)), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Mediabevakning — pollar RSS-källor med jämna mellanrum (se services/newsFeeds.js).
// Första körningen dröjer 15s för att låta servern/db-anslutningen bli klar.
function scheduleNewsPolling() {
  // org:<id> (steg 8) — samma skäl som runAutoHarvest() i harvest.js: io här är den globala
  // instansen, inget request att härleda org-scopet från, så varje bataljons broadcast måste
  // skopas explicit i loopen.
  const pollEachBattalion = () => db.withEachBattalion((tenantDb, battalion) => pollAllSources(io.to(`org:${battalion.id}`), tenantDb));
  setTimeout(pollEachBattalion, 15000);
  setInterval(pollEachBattalion, 10 * 60 * 1000);
}

// Polishändelser/Trafikhändelser/Elavbrott/Vädervarningar/Trafikflöde (routes/harvest.js
// runAutoHarvest) — tidigare bara klientstyrd (HarvestSidebar.tsx:s "Auto"-dropdown, 15 min
// default), vilket betydde att skördningen pausade så fort ingen hade appen öppen i en flik.
// Samma 15 min som det gamla klient-defaultet, men körs nu oavsett. Dröjer 20s (efter
// nyhetspollningens 15s) så de inte konkurrerar om databasen/nätverket vid uppstart samtidigt.
function scheduleAutoHarvest() {
  setTimeout(() => harvestRouter.runAutoHarvest(io), 20000);
  setInterval(() => harvestRouter.runAutoHarvest(io), 15 * 60 * 1000);
}

// Dygnsrapport (Spår 2) — skickas kl 06:00 varje morgon, samma "räkna ms till nästa
// fasta tidpunkt"-mönster som scheduleDailySnapshot().
function scheduleDailyReport() {
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() >= 6 ? 1 : 0), 6, 0, 0);
  const msUntilNext = nextRun.getTime() - now.getTime();
  console.log(`Nästa dygnsrapport om ${Math.round(msUntilNext / 60000)} minuter (${nextRun.toISOString()})`);
  const sendEachBattalion = () => db.withEachBattalion((tenantDb, battalion) => sendDailyReport(tenantDb, battalion.id))
    .catch(err => console.error('Dygnsrapport misslyckades:', err.message));
  setTimeout(() => {
    sendEachBattalion();
    setInterval(sendEachBattalion, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

const PORT = process.env.PORT || 3000;

async function waitForDatabase() {
  let retries = 10;
  while (retries > 0) {
    try {
      await db.query('SELECT 1');
      return;
    } catch {
      console.log(`Waiting for database... (${retries} retries left)`);
      retries--;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// Utdraget från start() så testsviten (backend/test/) kan bygga upp exakt samma schema mot en
// disponibel testdatabas utan att också dra igång schemaläggarna/server.listen() nedan.
async function runMigrations() {
  await ensureSettingsAndMunicipalitiesSchema();
  await ensureOrganizationsSchema();
  await ensureFeaturesOrgIdColumn();
  await ensureActivityLogOrgIdColumn();
  await ensureSettingsOrgIdColumn();
  await ensureAdmin();
  await ensureSettings();
  await ensureAlertSchema();
  await ensureAlertOrgIdColumns();
  await ensureIntelligenceReportsLayer();
  await ensureRailwaySituationsLayer();
  await ensureFeatureHistorySchema();
  await ensureFeaturesHistoryOrgIdColumn();
  await ensureUserPreferencesColumn();
  await ensureSmsTablesSchema();
  await ensureSmsOrgIdColumns();
  await ensureLastLoginColumn();
  await ensureNewsReportsLayer();
  await ensureNewsSchema();
  await ensureNewsOrgIdColumns();
  await ensureLocationPrecisionBackfill();
  await ensureWeatherWarningsLayer();
  await ensureNewsClassifierColumns();
  await ensureNotificationColumns();
  await ensureRowLevelSecurity();
  await ensurePlatformAdminsSchema();
  await ensurePlatformAdmin();
}

async function start() {
  await waitForDatabase();
  await runMigrations();
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  scheduleDailySnapshot();
  scheduleNewsPolling();
  scheduleAutoHarvest();
  scheduleDailyReport();
  server.listen(PORT, () => console.log(`Resursläge backend på port ${PORT}`));
}

module.exports = { app, server, io, runMigrations, start };

// Bara starta servern (och alla bakgrundsjobb) när filen körs direkt (`node src/index.js`),
// inte när testsviten gör `require('../../src/index')` för att komma åt `app`/`runMigrations`.
if (require.main === module) {
  start().catch(err => { console.error(err); process.exit(1); });
}
