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
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role }, previousLoginAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// UI-preferenser per användare (sidopanel, kartunderlag, WMS-lager osv.) — en enda JSONB-klump,
// PUT gör en shallow merge (preferences || $1) så olika komponenter kan spara sin egen nyckel
// utan att skriva över varandras, se frontend/src/components/MapView.tsx.
router.get('/preferences', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]?.preferences || {});
});

router.put('/preferences', requireAuth, async (req, res) => {
  const { value } = req.body;
  await db.query(
    'UPDATE users SET preferences = preferences || $1::jsonb WHERE id = $2',
    [JSON.stringify(value || {}), req.user.id]
  );
  res.json({ ok: true });
});

router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query('SELECT id, username, role, email, created_at FROM users ORDER BY id');
  res.json(rows);
});

// E-post krävs för dygnsrapportens SMTP-leverans (services/dailyReport.js) — ingen
// redigeringsväg för konton fanns alls tidigare, bara skapa/ta bort.
router.patch('/users/:id/email', requireAuth, requireRole('admin'), async (req, res) => {
  const { email } = req.body;
  const { rows } = await db.query(
    'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, role, email',
    [email?.trim() || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Hittades inte' });
  res.json(rows[0]);
});

router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id,username,role',
      [username, hash, role || 'editor']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Kan inte ta bort dig själv' });
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
