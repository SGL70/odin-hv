const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { evaluateAlerts } = require('../services/alertEngine');

const router = express.Router();

router.get('/rules', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM alert_rules ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type, config, enabled } = req.body;
  if (!name || !['threshold', 'proximity', 'cluster'].includes(type)) {
    return res.status(400).json({ error: 'name och giltig type krävs' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO alert_rules (name, type, config, enabled, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
      [name, type, config || {}, enabled !== false, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/rules/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type, config, enabled } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE alert_rules SET name=$1, type=$2, config=$3, enabled=$4, updated_by=$5
       WHERE id=$6 RETURNING *`,
      [name, type, config || {}, enabled !== false, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ej funnen' });
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/rules/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM alert_rules WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ej funnen' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events', requireAuth, async (req, res) => {
  try {
    const { status, since } = req.query;
    const conditions = [];
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    } else if (!status) {
      conditions.push(`e.status = 'open'`);
    }
    if (since) {
      params.push(since);
      conditions.push(`e.created_at > $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT e.*, u.username AS acknowledged_by_name
      FROM alert_events e
      LEFT JOIN users u ON u.id = e.acknowledged_by
      ${where}
      ORDER BY e.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE alert_events SET status='acknowledged', acknowledged_by=$1, acknowledged_at=NOW()
       WHERE id=$2 AND status='open' RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ej funnen eller redan kvitterad' });
    req.io.emit('alert:acknowledged', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/evaluate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await evaluateAlerts(req.io);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
