const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.get('/opomr-bbox', requireAuth, async (_req, res) => {
  const { rows } = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
  const munis = rows[0]?.value || [];
  if (!munis.length) return res.status(404).json({ error: 'Inga OpOmr-kommuner konfigurerade' });
  const bbox = await db.query(
    `SELECT ST_XMin(e) as minlng, ST_YMin(e) as minlat, ST_XMax(e) as maxlng, ST_YMax(e) as maxlat
     FROM (SELECT ST_Extent(geom) as e FROM municipalities WHERE short_name = ANY($1)) sub`,
    [munis]
  );
  res.json(bbox.rows[0]);
});

router.put('/:key', requireAuth, requireRole('admin'), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
  res.json({ ok: true });
});

module.exports = router;
