const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { evaluateAlerts } = require('../services/alertEngine');

const router = express.Router();

function toGeoJSON(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(r => ({
      type: 'Feature',
      id: r.uid,
      geometry: r.geom,
      properties: {
        uid: r.uid,
        layer: r.layer,
        cot_type: r.cot_type,
        name: r.name,
        ...r.attributes,
        created_by: r.created_by_name,
        updated_by: r.updated_by_name,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
    })),
  };
}

const BASE_QUERY = `
  SELECT f.uid, f.layer, f.cot_type, f.name,
    ST_AsGeoJSON(f.geom)::json AS geom,
    f.attributes, f.created_at, f.updated_at,
    u1.username AS created_by_name,
    u2.username AS updated_by_name
  FROM features f
  LEFT JOIN users u1 ON u1.id = f.created_by
  LEFT JOIN users u2 ON u2.id = f.updated_by
`;

router.get('/', requireAuth, async (req, res) => {
  try {
    const { layer, opomr } = req.query;
    const conditions = [];
    const params = [];

    if (layer) {
      params.push(layer);
      conditions.push(`f.layer = $${params.length}`);
    }

    // OPSEC: underrättelserapporter är editor/admin-only, läsare ser dem aldrig
    if (req.user.role === 'reader') {
      conditions.push(`f.layer != 'intelligence_reports'`);
    }

    if (opomr === '1') {
      conditions.push(`EXISTS (
        SELECT 1 FROM municipalities m
        JOIN settings s ON s.key = 'op_municipalities'
        WHERE m.short_name = ANY(ARRAY(SELECT jsonb_array_elements_text(s.value)))
          AND ST_Within(f.geom, m.geom)
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(`${BASE_QUERY} ${where} ORDER BY f.updated_at DESC`, params);
    res.json(toGeoJSON(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ABI sekvensneutralitet: läs ut arkiverad rådata (annars vore features_history skrivbar men oanvändbar)
router.get('/history', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  try {
    const { layer, since, until } = req.query;
    const conditions = [];
    const params = [];

    if (layer) { params.push(layer); conditions.push(`layer = $${params.length}`); }
    if (since) { params.push(since); conditions.push(`archived_at >= $${params.length}`); }
    if (until) { params.push(until); conditions.push(`archived_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT uid, layer, cot_type, name, ST_AsGeoJSON(geom)::json AS geom, attributes, created_at, updated_at, archived_at, archived_reason
       FROM features_history ${where} ORDER BY archived_at DESC LIMIT 500`,
      params,
    );
    res.json({
      type: 'FeatureCollection',
      features: rows.map(r => ({
        type: 'Feature',
        id: r.uid,
        geometry: r.geom,
        properties: {
          uid: r.uid, layer: r.layer, cot_type: r.cot_type, name: r.name,
          ...r.attributes,
          created_at: r.created_at, updated_at: r.updated_at,
          archived_at: r.archived_at, archived_reason: r.archived_reason,
        },
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ABI integration before exploitation: korrelerar ett objekt mot andra features inom given radie,
// samma ST_DWithin-mönster som alertEngine.js::evaluateProximity, i stället för att lämna
// tvärlager-korrelation åt att användaren råkar se det på kartan.
router.get('/:uid/related', requireAuth, async (req, res) => {
  try {
    const { uid } = req.params;
    const radius = Math.min(Math.max(Number(req.query.radius_m) || 500, 1), 50000);
    const conditions = [`tgt.uid <> $1`, `ST_DWithin(src.geom::geography, tgt.geom::geography, $2)`];
    if (req.user.role === 'reader') conditions.push(`tgt.layer != 'intelligence_reports'`);

    const { rows } = await db.query(
      `SELECT tgt.uid, tgt.layer, tgt.cot_type, tgt.name, tgt.attributes, tgt.created_at, tgt.updated_at,
         ST_AsGeoJSON(tgt.geom)::json AS geom,
         ST_Distance(src.geom::geography, tgt.geom::geography) AS distance_m
       FROM features src
       JOIN features tgt ON ${conditions.join(' AND ')}
       WHERE src.uid = $1
       ORDER BY distance_m ASC
       LIMIT 20`,
      [uid, radius],
    );
    res.json(rows.map(r => ({
      type: 'Feature',
      id: r.uid,
      geometry: r.geom,
      properties: {
        uid: r.uid,
        layer: r.layer,
        cot_type: r.cot_type,
        name: r.name,
        ...r.attributes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        distance_m: Math.round(r.distance_m),
      },
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { layer, name, geometry, cot_type, ...rest } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
       VALUES ($1,$2,ST_GeomFromGeoJSON($3),$4,$5,$6,$6)
       RETURNING uid`,
      [layer, name, JSON.stringify(geometry), cot_type || 'b-m-p-s-p', rest, req.user.id]
    );
    const { rows: feat } = await db.query(`${BASE_QUERY} WHERE f.uid = $1`, [rows[0].uid]);
    await db.query(
      'INSERT INTO activity_log (user_id,username,action,feature_uid,layer,feature_name) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, req.user.username, 'create', rows[0].uid, layer, name]
    );
    const feature = toGeoJSON(feat).features[0];
    req.io.emit('feature:created', feature);
    // Manuellt skapade objekt är en lika giltig signal som skördad data (ABI-dataneutralitet) —
    // en ny/uppdaterad kritikalitetsmärkning eller rapport ska kunna trigga varningsregler direkt,
    // inte bara vänta till nästa skördning (samma mönster som afterHarvest() i harvest.js).
    evaluateAlerts(req.io).catch(err => console.error('Alert evaluation error:', err.message));
    res.status(201).json(feature);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:uid', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { name, geometry, cot_type, ...rest } = req.body;
  try {
    await db.query(
      `UPDATE features SET name=$1, geom=ST_GeomFromGeoJSON($2), cot_type=$3, attributes=$4, updated_by=$5
       WHERE uid=$6`,
      [name, JSON.stringify(geometry), cot_type, rest, req.user.id, req.params.uid]
    );
    const { rows } = await db.query(`${BASE_QUERY} WHERE f.uid = $1`, [req.params.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Ej funnen' });
    await db.query(
      'INSERT INTO activity_log (user_id,username,action,feature_uid,layer,feature_name) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, req.user.username, 'update', req.params.uid, rows[0].layer, name]
    );
    const feature = toGeoJSON(rows).features[0];
    req.io.emit('feature:updated', feature);
    evaluateAlerts(req.io).catch(err => console.error('Alert evaluation error:', err.message));
    res.json(feature);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/layer/:layer', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  try {
    const { layer } = req.params;
    const { rows } = await db.query('DELETE FROM features WHERE layer=$1 RETURNING uid', [layer]);
    await db.query(
      'INSERT INTO activity_log (user_id,username,action,layer,feature_name) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, req.user.username, 'delete', layer, `Rensade ${rows.length} objekt`]
    );
    req.io.emit('features:reloaded', {});
    res.json({ deleted: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:uid', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM features WHERE uid=$1 RETURNING uid,layer,name', [req.params.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Ej funnen' });
    await db.query(
      'INSERT INTO activity_log (user_id,username,action,feature_uid,layer,feature_name) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, req.user.username, 'delete', req.params.uid, rows[0].layer, rows[0].name]
    );
    req.io.emit('feature:deleted', { uid: req.params.uid });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
