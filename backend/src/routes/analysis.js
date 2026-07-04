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

const DEFAULT_CRITICALITY_WEIGHTING = { distance_m: 500, gul_multiplier: 1.5, rod_multiplier: 3 };

// ABI dataneutralitet: vilka lager som bidrar till störningspoängen, och med vilken vikt.
// power_outages/road_situations/police_events har egna namngivna fält (elavbrott/road_count/
// police_count) i choropleth-svaret av bakåtkompatibilitetsskäl (MapView.tsx-tooltip,
// alertEngine.js threshold-details) — övriga nycklar i denna inställning (t.ex. railway_situations)
// behandlas generiskt och summeras in i rawScore utan eget namngivet fält.
const DEFAULT_LAYER_WEIGHTING = { power_outages: 3, road_situations: 1, police_events: 1, railway_situations: 1 };

// Störningspoäng per kommun, normaliserat per 1000 invånare (SCB 2024).
// Delad mellan /choropleth och varningsregelmotorns tröskelregel — se backend/src/services/alertEngine.js
//
// Elavbrott/trafikhändelser/övriga generiska lager nära en 'gul'/'rod'-märkt feature
// (attributes->>'criticality') räknas med en multiplikator per händelse (criticality_weighting-
// inställning) innan de summeras in i rawScore. Polishändelser viktas INTE spatialt — deras GPS
// är endast länsnivå-centroid (se "Driftinfo kommuner BD.md"), så ett avståndstest mot dem är
// fysiskt meningslöst, men deras bidrag till rawScore är fortfarande konfigurerbart via layer_weighting.
async function computeDisruptionScores() {
  const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const weightRow = await db.query("SELECT value FROM settings WHERE key='criticality_weighting'");
  const weighting = weightRow.rows.length ? weightRow.rows[0].value : DEFAULT_CRITICALITY_WEIGHTING;
  const { distance_m, gul_multiplier, rod_multiplier } = { ...DEFAULT_CRITICALITY_WEIGHTING, ...weighting };

  const layerWeightRow = await db.query("SELECT value FROM settings WHERE key='layer_weighting'");
  const layerWeights = { ...DEFAULT_LAYER_WEIGHTING, ...(layerWeightRow.rows[0]?.value || {}) };
  const { power_outages: powerWeight, road_situations: roadWeight, police_events: policeWeight, ...extraLayerWeights } = layerWeights;
  const extraLayers = Object.keys(extraLayerWeights).filter(l => Number(extraLayerWeights[l]) > 0);

  const criticalityMultiplierSql = `
    coalesce((
      SELECT MAX(CASE WHEN tgt.attributes->>'criticality' = 'rod' THEN $2::numeric ELSE $3::numeric END)
      FROM features tgt
      WHERE tgt.uid <> f.uid
        AND tgt.attributes->>'criticality' IN ('gul','rod')
        AND ST_DWithin(f.geom::geography, tgt.geom::geography, $1)
    ), 1::numeric)
  `;

  const [muniRows, powerRows, roadRows, policeRows, extraResults] = await Promise.all([
    db.query(`SELECT short_name as name FROM municipalities ORDER BY short_name`),
    db.query(`
      SELECT m.short_name as kommun, count(*) as avbrott,
             coalesce(sum((f.attributes->>'affected_customers')::int), 0) as berorda,
             coalesce(sum(${criticalityMultiplierSql}), 0) as weighted_avbrott
      FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
      WHERE f.layer = 'power_outages' GROUP BY m.short_name
    `, [distance_m, rod_multiplier, gul_multiplier]),
    db.query(`
      SELECT m.short_name as kommun, count(*) as n,
             coalesce(sum(${criticalityMultiplierSql}), 0) as weighted_road
      FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
      WHERE f.layer = 'road_situations' GROUP BY m.short_name
    `, [distance_m, rod_multiplier, gul_multiplier]),
    db.query(`
      SELECT trim(split_part(name, ',', array_length(string_to_array(name, ','), 1))) as ort,
             count(*) as n
      FROM features WHERE layer = 'police_events'
        AND (attributes->>'datetime') > $1
      GROUP BY ort
    `, [cutoff48h]),
    Promise.all(extraLayers.map(layer =>
      db.query(`
        SELECT m.short_name as kommun, count(*) as n,
               coalesce(sum(${criticalityMultiplierSql}), 0) as weighted
        FROM features f JOIN municipalities m ON ST_Within(f.geom, m.geom)
        WHERE f.layer = $4 GROUP BY m.short_name
      `, [distance_m, rod_multiplier, gul_multiplier, layer]).then(r => ({ layer, rows: r.rows }))
    )),
  ]);

  const powerByMuni  = Object.fromEntries(powerRows.rows.map(r => [r.kommun, { avbrott: parseInt(r.avbrott), weighted: parseFloat(r.weighted_avbrott) }]));
  const roadByMuni   = Object.fromEntries(roadRows.rows.map(r => [r.kommun, { n: parseInt(r.n), weighted: parseFloat(r.weighted_road) }]));
  const policeByOrt  = policeRows.rows;
  const extraByLayerAndMuni = Object.fromEntries(extraResults.map(({ layer, rows }) => [
    layer,
    Object.fromEntries(rows.map(r => [r.kommun, { n: parseInt(r.n), weighted: parseFloat(r.weighted) }])),
  ]));

  return muniRows.rows.map(m => {
    const avbrott        = powerByMuni[m.name]?.avbrott || 0;
    const weightedAvbrott = powerByMuni[m.name]?.weighted || 0;
    const trafikhänd        = roadByMuni[m.name]?.n || 0;
    const weightedTrafikhänd = roadByMuni[m.name]?.weighted || 0;
    const polishänd = policeByOrt
      .filter(p => p.ort && p.ort.toLowerCase().includes(m.name.toLowerCase()))
      .reduce((s, p) => s + parseInt(p.n), 0);

    const extraCounts = {};
    let extraScore = 0;
    for (const layer of extraLayers) {
      const entry = extraByLayerAndMuni[layer]?.[m.name];
      if (entry) extraCounts[layer] = entry.n;
      extraScore += (entry?.weighted || 0) * Number(extraLayerWeights[layer]);
    }

    const rawScore = weightedAvbrott * Number(powerWeight) + weightedTrafikhänd * Number(roadWeight) + polishänd * Number(policeWeight) + extraScore;
    const pop = POPULATION[m.name] || 10000;
    const score = rawScore === 0 ? 0 : Math.round((rawScore / (pop / 1000)) * 10) / 10;
    const level = score === 0 ? 0 : score <= 2 ? 1 : 2;
    return { name: m.name, elavbrott: avbrott, road_count: trafikhänd, police_count: polishänd, extra_counts: extraCounts, score, raw_score: rawScore, level };
  });
}
router.computeDisruptionScores = computeDisruptionScores;

// Choropleth — kommunpolygoner med störningsindex (KPI)
router.get('/choropleth', requireAuth, async (req, res) => {
  try {
    const [scores, muniGeoRows] = await Promise.all([
      computeDisruptionScores(),
      db.query(`SELECT short_name as name, ST_AsGeoJSON(geom)::json as geom FROM municipalities ORDER BY short_name`),
    ]);
    const geomByName = Object.fromEntries(muniGeoRows.rows.map(m => [m.name, m.geom]));

    const features = scores.map(s => ({
      type: 'Feature',
      geometry: geomByName[s.name],
      properties: s,
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error('Choropleth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Spara analysögonblick per kommun (daglig historik)
// OBS: har en egen, oviktad kopia av score-formeln (avbrott×3 + roadTotal + police48h) och
// använder INTE computeDisruptionScores() eller criticality_weighting. Medvetet val — historiska
// trendrader i analysis_snapshots förblir på den gamla skalan, i väntan på en framtida refaktor.
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
