const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
    const previousLoginAt = user.last_login_at;
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    // Multi-tenancy steg 4 (docs/multitenancy-forslag.md) — org_id i JWT-payloaden, så requireAuth
    // (som bara avkodar token till req.user) automatiskt bär med sig organisationen på alla
    // efterföljande requests utan någon egen kodändring där.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, org_id: user.org_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, org_id: user.org_id }, previousLoginAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// UI-preferenser per användare (sidopanel, kartunderlag, WMS-lager osv.) — en enda JSONB-klump,
// PUT gör en shallow merge (preferences || $1) så olika komponenter kan spara sin egen nyckel
// utan att skriva över varandras, se frontend/src/components/MapView.tsx.
router.get('/preferences', requireAuth, async (req, res) => {
  const { rows } = await req.db.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]?.preferences || {});
});

router.put('/preferences', requireAuth, async (req, res) => {
  const { value } = req.body;
  await req.db.query(
    'UPDATE users SET preferences = preferences || $1::jsonb WHERE id = $2',
    [JSON.stringify(value || {}), req.user.id]
  );
  res.json({ ok: true });
});

router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await req.db.query('SELECT id, username, role, email, phone, created_at FROM users ORDER BY id');
  res.json(rows);
});

// E-post krävs för dygnsrapportens SMTP-leverans (services/dailyReport.js), telefonnummer för
// larm-SMS (services/sms46elks.js) — samma redigeringsväg för båda kontaktvägarna på en gång.
router.patch('/users/:id/contact', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, phone } = req.body;
  const { rows } = await req.db.query(
    'UPDATE users SET email = $1, phone = $2 WHERE id = $3 RETURNING id, username, role, email, phone',
    [email?.trim() || null, phone?.trim() || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Hittades inte' });
  res.json(rows[0]);
});

// Multi-tenancy steg 2 — org_id är NOT NULL, så en ny användare måste ärva någon organisations-id.
// Enklast korrekta valet innan JWT/requests bär org_id (steg 4): slå upp den skapande adminens
// egen org_id och sätt det på den nya användaren — fungerar likadant oavsett hur många
// organisationer som finns, utan att behöva vänta på resten av multi-tenancy-arbetet.
router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await req.db.query(
      `INSERT INTO users (username, password_hash, role, org_id)
       VALUES ($1, $2, $3, (SELECT org_id FROM users WHERE id = $4))
       RETURNING id,username,role`,
      [username, hash, role || 'editor', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Kan inte ta bort dig själv' });
  await req.db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
