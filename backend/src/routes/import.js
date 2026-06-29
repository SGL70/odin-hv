const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const LAYER_COT = {
  fuel: 'b-m-p-s-p', food: 'b-m-p-s-p', water: 'b-m-p-s-p',
  raw_materials: 'b-m-p-s-p', vehicles: 'a-f-G-U-C-V',
  maintenance: 'b-m-p-s-p', hygiene: 'b-m-p-s-p',
  staging_areas: 'b-m-p-s-p', transshipment: 'b-m-p-s-p',
  cameras: 'b-m-p-s-p', powerlines: 'b-m-p-s-p', telecom: 'b-m-p-s-p',
  railways: 'b-m-p-s-p', ports: 'b-m-p-s-p', airports: 'b-m-p-s-p',
  medical: 'b-m-p-s-p', emergency: 'b-m-p-s-p', tunnels: 'b-m-p-s-p', fording_points: 'b-m-p-s-p',
  roads: 'b-m-p-s-p', bridges: 'b-m-p-s-p',
};

router.post('/csv', requireAuth, requireRole('editor', 'admin'), upload.single('file'), async (req, res) => {
  const { layer } = req.query;
  if (!layer) return res.status(400).json({ error: 'layer krävs' });
  if (!req.file) return res.status(400).json({ error: 'fil krävs' });

  const text = req.file.buffer.toString('utf8');
  const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (errors.length) return res.status(400).json({ error: 'CSV-fel', details: errors.slice(0, 5) });

  const imported = [];
  const failed = [];

  for (const row of data) {
    const lat = parseFloat(row.lat || row.latitude || row.bredd);
    const lon = parseFloat(row.lon || row.lng || row.longitude || row.langd);
    const name = row.name || row.namn || row.beteckning || 'Okänd';
    if (isNaN(lat) || isNaN(lon)) { failed.push({ row, reason: 'Saknar lat/lon' }); continue; }

    const { lat: _lat, lon: _lon, lng: _lng, latitude: _la, longitude: _lo, name: _n, namn: _na, bredd: _b, langd: _lg, beteckning: _be, ...attrs } = row;
    try {
      const { rows } = await db.query(
        `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
         VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326),$5,$6,$7,$7) RETURNING uid`,
        [layer, name, lon, lat, LAYER_COT[layer] || 'b-m-p-s-p', attrs, req.user.id]
      );
      imported.push(rows[0].uid);
    } catch (err) {
      failed.push({ row, reason: err.message });
    }
  }

  if (imported.length) req.io.emit('features:reloaded', { layer });
  res.json({ imported: imported.length, failed: failed.length, failures: failed.slice(0, 10) });
});

router.post('/geojson', requireAuth, requireRole('editor', 'admin'), express.json({ limit: '20mb' }), async (req, res) => {
  const { layer, geojson } = req.body;
  if (!layer || !geojson) return res.status(400).json({ error: 'layer och geojson krävs' });

  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  const imported = [];
  for (const f of features) {
    const { name, namn, ...attrs } = f.properties || {};
    try {
      const { rows } = await db.query(
        `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
         VALUES ($1,$2,ST_GeomFromGeoJSON($3),$4,$5,$6,$6) RETURNING uid`,
        [layer, name || namn || 'Import', JSON.stringify(f.geometry), LAYER_COT[layer] || 'b-m-p-s-p', attrs, req.user.id]
      );
      imported.push(rows[0].uid);
    } catch {}
  }
  if (imported.length) req.io.emit('features:reloaded', { layer });
  res.json({ imported: imported.length });
});

module.exports = router;
