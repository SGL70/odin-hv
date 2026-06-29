const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const TRV_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const NVDB_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

function apiKey() {
  return process.env.TRAFIKVERKET_API_KEY || '';
}

// Parse WKT geometry string → GeoJSON geometry
function parseWKT(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const s = wkt.trim();

  const pt = s.match(/^POINT\s*\(\s*([^\s)]+)\s+([^\s)]+)\s*\)/i);
  if (pt) return { type: 'Point', coordinates: [parseFloat(pt[1]), parseFloat(pt[2])] };

  // Strip Z/M modifier before parsing coordinates (3D → 2D)
  const s2 = s.replace(/\b(LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON)\s+Z\s+/i, '$1 ');

  const ls = s2.match(/^LINESTRING\s*\(([^)]+)\)/i);
  if (ls) return {
    type: 'LineString',
    coordinates: ls[1].split(',').map(p => p.trim().split(/\s+/).slice(0, 2).map(Number)),
  };

  const mls = s2.match(/^MULTILINESTRING\s*\((.+)\)\s*$/i);
  if (mls) {
    const rings = mls[1].match(/\(([^)]+)\)/g) || [];
    return {
      type: 'MultiLineString',
      coordinates: rings.map(r =>
        r.replace(/[()]/g, '').trim().split(',').map(p => p.trim().split(/\s+/).map(Number))
      ),
    };
  }

  const pg = s2.match(/^POLYGON\s*\((.+)\)\s*$/i);
  if (pg) {
    const rings = pg[1].match(/\(([^)]+)\)/g) || [];
    return {
      type: 'Polygon',
      coordinates: rings.map(r =>
        r.replace(/[()]/g, '').trim().split(',').map(p => p.trim().split(/\s+/).map(Number))
      ),
    };
  }
  return null;
}

// POST to Trafikverket Open Data API
async function trvQuery(objecttype, schemaversion, filter, include, limit = 500, namespace = '') {
  const nsAttr = namespace ? ` namespace="${namespace}"` : '';
  const includeTag = include ? `<INCLUDE>${include}</INCLUDE>` : '';
  const xml = `<REQUEST>
  <LOGIN authenticationkey="${apiKey()}"/>
  <QUERY objecttype="${objecttype}"${nsAttr} schemaversion="${schemaversion}" limit="${limit}">
    <FILTER>${filter}</FILTER>
    ${includeTag}
  </QUERY>
</REQUEST>`;
  const res = await fetch(TRV_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  return json?.RESPONSE?.RESULT?.[0]?.[objecttype] || [];
}

function bboxFilter(field, minlng, minlat, maxlng, maxlat) {
  return `<WITHIN name="${field}" shape="box" value="${minlng} ${minlat}, ${maxlng} ${maxlat}"/>`;
}

// ── CAMERAS ──────────────────────────────────────────────────────────────────
router.get('/cameras', requireAuth, async (req, res) => {
  const { minlng, minlat, maxlng, maxlat } = req.query;
  try {
    const items = await trvQuery(
      'Camera', '1',
      bboxFilter('Geometry.WGS84', minlng, minlat, maxlng, maxlat),
      'Id, Name, Type, Direction, Status, PhotoUrl, Geometry'
    );
    const features = items.map(c => ({
      type: 'Feature',
      geometry: parseWKT(c?.Geometry?.WGS84),
      properties: {
        layer: 'cameras', name: c.Name || c.Id,
        camera_type: c.Type || 'Trafikkamera', owner: 'Trafikverket',
        direction: c.Direction ?? null, status: c.Status || 'Operativ',
        photo_url: c.PhotoUrl || null,
        _source_id: c.Id,
      },
    })).filter(f => f.geometry);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── FÄRJELEDER (NVDB) ────────────────────────────────────────────────────────
router.get('/ferries', requireAuth, async (req, res) => {
  const { minlng, minlat, maxlng, maxlat } = req.query;
  try {
    const items = await trvQuery(
      'Färjeled', '1.2',
      bboxFilter('Geometry.WKT-WGS84-3D', minlng, minlat, maxlng, maxlat),
      'GID, Färjeledsnamn, Geometry',
      200,
      'vägdata.nvdb_dk_o'
    );
    const features = items.map(f => ({
      type: 'Feature',
      geometry: parseWKT(f?.Geometry?.['WKT-WGS84-3D']),
      properties: {
        layer: 'ports',
        name: f.Färjeledsnamn || `Färjeled ${f.GID}`,
        port_type: 'Färjeled',
        _source_id: String(f.GID || ''),
      },
    })).filter(f => f.geometry);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── ATK-KAMEROR (fartkameror) ─────────────────────────────────────────────────
router.get('/atk', requireAuth, async (req, res) => {
  const { minlng, minlat, maxlng, maxlat } = req.query;
  try {
    const items = await trvQuery(
      'TrafficSafetyCamera', '1',
      bboxFilter('Geometry.WGS84', minlng, minlat, maxlng, maxlat),
      'Id, Name, RoadNumber, Bearing, Geometry'
    );
    const features = items.map(c => ({
      type: 'Feature',
      geometry: parseWKT(c?.Geometry?.WGS84),
      properties: {
        layer: 'cameras',
        name: c.Name || `ATK ${c.RoadNumber || c.Id}`,
        camera_type: 'ATK/Fartkamera',
        owner: 'Trafikverket',
        direction: c.Bearing ?? null,
        _source_id: c.Id,
      },
    })).filter(f => f.geometry);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── NVDB BÄRIGHET (BK-klass) via vägdata.nvdb_dk_o namespace ────────────────
router.get('/roads', requireAuth, async (req, res) => {
  const { minlng, minlat, maxlng, maxlat } = req.query;
  try {
    const items = await trvQuery(
      'Bärighet', '1.2',
      bboxFilter('Geometry.WKT-WGS84-3D', minlng, minlat, maxlng, maxlat),
      'GID,Bärighetsklass,Bärighetsklass_vinterperiod,Startdatum_sommarperiod,Geometry',
      500,
      'vägdata.nvdb_dk_o'
    );
    const BK_TON = { 'BK 1': 10, 'BK 2': 10, 'BK 3': 8, 'BK 4': 6, 'Undantag': null };
    const features = items.map(r => {
      const bk = r.Bärighetsklass || 'BK 1';
      const geom = parseWKT(r?.Geometry?.['WKT-WGS84-3D']);
      if (!geom) return null;
      return {
        type: 'Feature', geometry: geom,
        properties: {
          layer: 'roads',
          name: bk,
          bk_class: bk,
          bk_winter: r.Bärighetsklass_vinterperiod || null,
          max_axle_ton: BK_TON[bk] ?? null,
          _source_id: String(r.GID || ''),
        },
      };
    }).filter(Boolean);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── BRIDGES — not available in Trafikinfo API; placeholder ───────────────────
router.get('/bridges', requireAuth, async (_req, res) => {
  res.json({ count: 0, features: [], note: 'Brodata ej tillgänglig via Trafikinfo API' });
});

// ── IMPORT: Write fetched features to DB ──────────────────────────────────────
router.post('/import', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { features } = req.body;
  if (!Array.isArray(features) || !features.length)
    return res.status(400).json({ error: 'Inga features att importera' });

  const COT = { vehicles: 'a-f-G-U-C-V' };
  let imported = 0, skipped = 0;

  for (const f of features) {
    const { layer, name, _source_id, ...attrs } = f.properties || {};
    if (!layer || !name || !f.geometry) { skipped++; continue; }
    try {
      await db.query(
        `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
         VALUES ($1,$2,ST_GeomFromGeoJSON($3),$4,$5,$6,$6)
         ON CONFLICT DO NOTHING`,
        [layer, name, JSON.stringify(f.geometry), COT[layer] || 'b-m-p-s-p',
         { ...attrs, trv_source_id: _source_id }, req.user.id]
      );
      imported++;
    } catch { skipped++; }
  }

  if (imported > 0) req.io.emit('features:reloaded', {});
  res.json({ imported, skipped });
});

module.exports = router;
