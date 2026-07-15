const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { evaluateAlerts, isValidProximityConfig } = require('../services/alertEngine');

const VALID_SEVERITIES = ['info', 'varning', 'kritisk'];
const VALID_ROLES = ['reader', 'editor', 'admin'];

function validateRuleBody(name, type, config, severity, target) {
  if (!name || !['threshold', 'proximity', 'cluster', 'weather_critical', 'news_urgent'].includes(type)) {
    return 'name och giltig type krävs';
  }
  if (type === 'proximity' && !isValidProximityConfig(config || {})) {
    return 'proximity kräver layer, distance_m och antingen min_criticality eller target_uid';
  }
  if (type === 'weather_critical' && (!Array.isArray(config?.min_severity) || !config.min_severity.length)) {
    return 'weather_critical kräver minst en nivå i min_severity (t.ex. ["Orange","Röd"])';
  }
  if (severity != null && !VALID_SEVERITIES.includes(severity)) {
    return `severity måste vara en av: ${VALID_SEVERITIES.join(', ')}`;
  }
  if (target?.roles && (!Array.isArray(target.roles) || target.roles.some(r => !VALID_ROLES.includes(r)))) {
    return `target.roles får bara innehålla: ${VALID_ROLES.join(', ')}`;
  }
  return null;
}

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
  const { name, type, config, enabled, severity, target } = req.body;
  const validationError = validateRuleBody(name, type, config, severity, target);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const { rows } = await db.query(
      `INSERT INTO alert_rules (name, type, config, enabled, created_by, updated_by, severity, target)
       VALUES ($1,$2,$3,$4,$5,$5,COALESCE($6,'varning'),COALESCE($7,'{"roles":["reader","editor","admin"]}'::jsonb)) RETURNING *`,
      [name, type, config || {}, enabled !== false, req.user.id, severity, target ? JSON.stringify(target) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/rules/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type, config, enabled, severity, target } = req.body;
  const validationError = validateRuleBody(name, type, config, severity, target);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const { rows } = await db.query(
      `UPDATE alert_rules SET name=$1, type=$2, config=$3, enabled=$4, updated_by=$5,
         severity=COALESCE($7,severity), target=COALESCE($8,target)
       WHERE id=$6 RETURNING *`,
      [name, type, config || {}, enabled !== false, req.user.id, req.params.id, severity, target ? JSON.stringify(target) : null]
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
