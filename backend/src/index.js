const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { ensureAlertSchema, ensureIntelligenceReportsLayer, ensureRailwaySituationsLayer, ensureFeatureHistorySchema, ensureUserPreferencesColumn, ensureSmsTablesSchema } = require('./migrations');

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
app.use('/api/harvest', require('./routes/harvest'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/alerts', require('./routes/alerts'));

const analysisRouter = require('./routes/analysis');
app.use('/api/analysis', analysisRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

async function ensureAdmin() {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await db.query(`
    INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')
    ON CONFLICT (username) DO NOTHING
  `, [hash]);
  console.log('Admin user ready (username: admin)');
}

async function ensureSettings() {
  await db.query(`
    INSERT INTO settings (key, value) VALUES ('snapshot_retention_days', '30')
    ON CONFLICT (key) DO NOTHING
  `);
  await db.query(`
    INSERT INTO settings (key, value) VALUES ('criticality_weighting', $1)
    ON CONFLICT (key) DO NOTHING
  `, [JSON.stringify({ distance_m: 500, gul_multiplier: 1.5, rod_multiplier: 3 })]);
  await db.query(`
    INSERT INTO settings (key, value) VALUES ('layer_weighting', $1)
    ON CONFLICT (key) DO NOTHING
  `, [JSON.stringify({ power_outages: 3, road_situations: 1, police_events: 1, railway_situations: 1 })]);
}

// Daglig snapshot-schemaläggare — sparar vid 00:05 varje natt
function scheduleDailySnapshot() {
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
  const msUntilNext = nextRun.getTime() - now.getTime();
  console.log(`Nästa analysögonblick om ${Math.round(msUntilNext / 60000)} minuter (${nextRun.toISOString()})`);
  setTimeout(() => {
    analysisRouter.saveSnapshot();
    setInterval(() => analysisRouter.saveSnapshot(), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

const PORT = process.env.PORT || 3000;

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await db.query('SELECT 1');
      break;
    } catch {
      console.log(`Waiting for database... (${retries} retries left)`);
      retries--;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  await ensureAdmin();
  await ensureSettings();
  await ensureAlertSchema();
  await ensureIntelligenceReportsLayer();
  await ensureRailwaySituationsLayer();
  await ensureFeatureHistorySchema();
  await ensureUserPreferencesColumn();
  await ensureSmsTablesSchema();
  scheduleDailySnapshot();
  server.listen(PORT, () => console.log(`Resursläge backend på port ${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
