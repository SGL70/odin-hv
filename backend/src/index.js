const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const db = require('./db');

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
  server.listen(PORT, () => console.log(`Ledningssystem backend på port ${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
