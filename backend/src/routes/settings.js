const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolveOrgId } = require('../services/orgContext');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const orgId = await resolveOrgId(req.user.id);
  const { rows } = await req.db.query('SELECT key, value FROM settings WHERE org_id = $1', [orgId]);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.get('/opomr-bbox', requireAuth, async (req, res) => {
  const orgId = await resolveOrgId(req.user.id);
  const { rows } = await req.db.query("SELECT value FROM settings WHERE org_id = $1 AND key='op_municipalities'", [orgId]);
  const munis = rows[0]?.value || [];
  if (!munis.length) return res.status(404).json({ error: 'Inga OpOmr-kommuner konfigurerade' });
  const bbox = await req.db.query(
    `SELECT ST_XMin(e) as minlng, ST_YMin(e) as minlat, ST_XMax(e) as maxlng, ST_YMax(e) as maxlat
     FROM (SELECT ST_Extent(geom) as e FROM municipalities WHERE short_name = ANY($1)) sub`,
    [munis]
  );
  res.json(bbox.rows[0]);
});

router.put('/:key', requireAuth, requireRole('admin'), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  const orgId = await resolveOrgId(req.user.id);
  await req.db.query(
    `INSERT INTO settings (key, value, org_id, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (org_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value), orgId]
  );
  res.json({ ok: true });
});

module.exports = router;
