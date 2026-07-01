const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const settingsRow = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
    const opOmr = settingsRow.rows.length ? settingsRow.rows[0].value : [];

    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [powerRows, roadsRows, policeRows, overallPowerRows] = await Promise.all([
      db.query(`
        SELECT m.short_name as kommun,
               count(*) as avbrott,
               coalesce(sum((f.attributes->>'affected_customers')::int), 0) as berorda,
               string_agg(DISTINCT f.attributes->>'provider', ', ') as leverantorer,
               bool_or((f.attributes->>'is_planned')::boolean) as har_planerade,
               min(f.attributes->>'completion_time') as forsta_aterst
        FROM features f
        JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'power_outages'
        GROUP BY m.short_name
        ORDER BY berorda DESC
      `),
      db.query(`
        SELECT m.short_name as kommun,
               f.attributes->>'event_type' as typ,
               f.attributes->>'severity' as severity,
               count(*) as n
        FROM features f
        JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'road_situations'
        GROUP BY m.short_name, typ, severity
        ORDER BY m.short_name, n DESC
      `),
      db.query(`
        SELECT trim(split_part(name, ',', array_length(string_to_array(name, ','), 1))) as ort,
               f.attributes->>'event_type' as typ,
               count(*) as n,
               max(f.attributes->>'datetime') as senast
        FROM features f
        WHERE f.layer = 'police_events'
          AND (f.attributes->>'datetime') > $1
        GROUP BY ort, typ
        ORDER BY n DESC
      `, [cutoff48h]),
      db.query(`
        SELECT count(*) as total_avbrott,
               coalesce(sum((attributes->>'affected_customers')::int), 0) as total_berorda,
               count(*) FILTER (WHERE (attributes->>'is_planned')::boolean) as planerade,
               count(*) FILTER (WHERE NOT coalesce((attributes->>'is_planned')::boolean, false)) as akuta
        FROM features WHERE layer = 'power_outages'
      `),
    ]);

    const opOmrPower = powerRows.rows.filter(r => opOmr.includes(r.kommun));
    const opOmrRoads = roadsRows.rows.filter(r => opOmr.includes(r.kommun));

    const opOmrRoadSummary = {};
    for (const r of opOmrRoads) {
      if (!opOmrRoadSummary[r.kommun]) opOmrRoadSummary[r.kommun] = { vagarbete: 0, olycka: 0, meddelande: 0, hinder: 0, total: 0 };
      const n = parseInt(r.n);
      const typ = (r.typ || '').toLowerCase();
      if (typ.includes('vägarbete')) opOmrRoadSummary[r.kommun].vagarbete += n;
      else if (typ.includes('olycka')) opOmrRoadSummary[r.kommun].olycka += n;
      else if (typ.includes('hinder')) opOmrRoadSummary[r.kommun].hinder += n;
      else opOmrRoadSummary[r.kommun].meddelande += n;
      opOmrRoadSummary[r.kommun].total += n;
    }

    const highSeverity = opOmrRoads.filter(r => ['4','5'].includes(r.severity));
    const highSeverityCount = highSeverity.reduce((s, r) => s + parseInt(r.n), 0);

    const opOmrPolice = policeRows.rows.filter(r =>
      opOmr.some(k => r.ort && r.ort.toLowerCase().includes(k.toLowerCase()))
    );
    const policeTotalOpOmr = opOmrPolice.reduce((s, r) => s + parseInt(r.n), 0);

    res.json({
      op_municipalities: opOmr,
      opomr: {
        power: {
          municipalities: opOmrPower,
          total_avbrott: opOmrPower.reduce((s, r) => s + parseInt(r.avbrott), 0),
          total_berorda: opOmrPower.reduce((s, r) => s + parseInt(r.berorda), 0),
        },
        roads: {
          per_municipality: opOmrRoadSummary,
          total: Object.values(opOmrRoadSummary).reduce((s, v) => s + (v.total || 0), 0),
          high_severity: highSeverityCount,
        },
        police: {
          events: opOmrPolice,
          total: policeTotalOpOmr,
        },
      },
      norrbotten: {
        power: overallPowerRows.rows[0],
        roads: { per_municipality: roadsRows.rows },
        police: {
          events: policeRows.rows,
          total: policeRows.rows.reduce((s, r) => s + parseInt(r.n), 0),
        },
      },
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Händelsedetaljer för drill-down (spatial join mot municipality)
router.get('/events', requireAuth, async (req, res) => {
  try {
    const { layer, municipality } = req.query;
    if (!layer || !municipality) return res.status(400).json({ error: 'layer och municipality krävs' });
    const { rows } = await db.query(`
      SELECT f.uid, f.name, f.attributes
      FROM features f
      JOIN municipalities m ON ST_Within(f.geom, m.geom)
      WHERE f.layer = $1 AND m.short_name = $2
      ORDER BY f.updated_at DESC
    `, [layer, municipality]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SCB 2024 befolkningsdata för Norrbottens 14 kommuner
const POPULATION = {
  'Arjeplog':    2686,
  'Arvidsjaur':  6418,
  'Boden':      27473,
  'Gällivare':  18193,
  'Haparanda':  10638,
  'Jokkmokk':    4893,
  'Kalix':      16228,
  'Kiruna':     23502,
  'Luleå':      78967,
  'Pajala':      5712,
  'Piteå':      43462,
  'Älvsbyn':     7871,
  'Överkalix':   3478,
  'Övertorneå':  4563,
};

// Choropleth — kommunpolygoner med störningsindex (KPI)
router.get('/choropleth', requireAuth, async (req, res) => {
  try {
    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const [muniRows, powerRows, roadRows, policeRows] = await Promise.all([
      db.query(`SELECT short_name as name, ST_AsGeoJSON(geom)::json as geom FROM municipalities ORDER BY short_name`),
      db.query(`
        SELECT m.short_name as kommun, count(*) as avbrott,
               coalesce(sum((f.attributes->>'affected_customers')::int), 0) as berorda
        FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'power_outages' GROUP BY m.short_name
      `),
      db.query(`
        SELECT m.short_name as kommun, count(*) as n
        FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'road_situations' GROUP BY m.short_name
      `),
      db.query(`
        SELECT trim(split_part(name, ',', array_length(string_to_array(name, ','), 1))) as ort,
               count(*) as n
        FROM features WHERE layer = 'police_events'
          AND (attributes->>'datetime') > $1
        GROUP BY ort
      `, [cutoff48h]),
    ]);

    const powerByMuni  = Object.fromEntries(powerRows.rows.map(r => [r.kommun, parseInt(r.avbrott)]));
    const roadByMuni   = Object.fromEntries(roadRows.rows.map(r => [r.kommun, parseInt(r.n)]));
    const policeByOrt  = policeRows.rows;

    const features = muniRows.rows.map(m => {
      const avbrott   = powerByMuni[m.name] || 0;
      const trafikhänd = roadByMuni[m.name]  || 0;
      const polishänd = policeByOrt
        .filter(p => p.ort && p.ort.toLowerCase().includes(m.name.toLowerCase()))
        .reduce((s, p) => s + parseInt(p.n), 0);
      const rawScore = avbrott * 3 + trafikhänd + polishänd;
      const pop = POPULATION[m.name] || 10000;
      const score = rawScore === 0 ? 0 : Math.round((rawScore / (pop / 1000)) * 10) / 10;
      const level = score === 0 ? 0 : score <= 2 ? 1 : 2;
      return {
        type: 'Feature',
        geometry: m.geom,
        properties: { name: m.name, elavbrott: avbrott, road_count: trafikhänd, police_count: polishänd, score, raw_score: rawScore, level },
      };
    });

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error('Choropleth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Spara analysögonblick per kommun (daglig historik)
async function saveSnapshot() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS analysis_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
        municipality VARCHAR(80) NOT NULL,
        elavbrott INTEGER DEFAULT 0,
        berorda INTEGER DEFAULT 0,
        road_total INTEGER DEFAULT 0,
        police_48h INTEGER DEFAULT 0,
        score NUMERIC(6,1) DEFAULT 0,
        UNIQUE(snapshot_date, municipality)
      )
    `);

    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const [muniRows, powerRows, roadRows, policeRows] = await Promise.all([
      db.query(`SELECT short_name as name FROM municipalities`),
      db.query(`
        SELECT m.short_name as kommun, count(*) as avbrott,
               coalesce(sum((f.attributes->>'affected_customers')::int), 0) as berorda
        FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'power_outages' GROUP BY m.short_name
      `),
      db.query(`
        SELECT m.short_name as kommun, count(*) as n
        FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = 'road_situations' GROUP BY m.short_name
      `),
      db.query(`
        SELECT trim(split_part(name, ',', array_length(string_to_array(name, ','), 1))) as ort, count(*) as n
        FROM features WHERE layer = 'police_events' AND (attributes->>'datetime') > $1 GROUP BY ort
      `, [cutoff48h]),
    ]);

    const powerByMuni = Object.fromEntries(powerRows.rows.map(r => [r.kommun, { avbrott: parseInt(r.avbrott), berorda: parseInt(r.berorda) }]));
    const roadByMuni  = Object.fromEntries(roadRows.rows.map(r => [r.kommun, parseInt(r.n)]));
    const policeByOrt = policeRows.rows;

    for (const m of muniRows.rows) {
      const avbrott   = powerByMuni[m.name]?.avbrott || 0;
      const berorda   = powerByMuni[m.name]?.berorda || 0;
      const roadTotal = roadByMuni[m.name] || 0;
      const police48h = policeByOrt.filter(p => p.ort && p.ort.toLowerCase().includes(m.name.toLowerCase()))
                          .reduce((s, p) => s + parseInt(p.n), 0);
      const score     = avbrott * 3 + roadTotal + police48h;

      await db.query(`
        INSERT INTO analysis_snapshots (snapshot_date, municipality, elavbrott, berorda, road_total, police_48h, score)
        VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
        ON CONFLICT (snapshot_date, municipality) DO UPDATE SET
          elavbrott = $2, berorda = $3, road_total = $4, police_48h = $5, score = $6
      `, [m.name, avbrott, berorda, roadTotal, police48h, score]);
    }

    // Rensa ögonblick äldre än retentionstiden
    const retRow = await db.query("SELECT value FROM settings WHERE key='snapshot_retention_days'");
    const days = retRow.rows.length ? parseInt(retRow.rows[0].value) : 30;
    const { rowCount } = await db.query('DELETE FROM analysis_snapshots WHERE snapshot_date < CURRENT_DATE - $1::int', [days]);
    if (rowCount > 0) console.log(`Rensade ${rowCount} gamla snapshot-rader (retention: ${days} dagar)`);

    console.log(`Analysögonblick sparat ${new Date().toISOString()}`);
  } catch (err) {
    console.error('saveSnapshot error:', err);
  }
}

// Manuell trigger (admin)
router.post('/snapshot', requireAuth, requireRole('admin'), async (_req, res) => {
  await saveSnapshot();
  res.json({ ok: true });
});

// Historik per kommun (för framtida trendvisning)
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { municipality } = req.query;
    const q = municipality
      ? db.query(`SELECT * FROM analysis_snapshots WHERE municipality = $1 ORDER BY snapshot_date DESC LIMIT 90`, [municipality])
      : db.query(`SELECT * FROM analysis_snapshots ORDER BY snapshot_date DESC, municipality LIMIT 500`);
    const { rows } = await q;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kommuner med metadata
router.get('/municipalities', requireAuth, async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT code, short_name, name, county_name,
             round(ST_Area(geom::geography)/1000000) as yta_km2
      FROM municipalities ORDER BY short_name
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.saveSnapshot = saveSnapshot;
module.exports = router;
