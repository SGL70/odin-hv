const crypto = require('crypto');
const db = require('../db');
const analysisRouter = require('../routes/analysis');

const CRITICALITY_ORDER = { normal: 0, gul: 1, rod: 2 };

// Riktar leveransen per roll (io.to('role:'+r)) istället för blind broadcast — rule.target.roles
// defaultar till alla tre roller (se migrations.js ensureNotificationColumns), så obekonfigurerade
// regler beter sig precis som innan denna ändring.
async function insertEvent(io, rule, entityKey, message, details, featureUid = null) {
  const { rows } = await db.query(`
    INSERT INTO alert_events (rule_id, rule_name, rule_type, entity_key, message, details, feature_uid, severity)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (rule_id, entity_key) WHERE status = 'open' DO NOTHING
    RETURNING *
  `, [rule.id, rule.name, rule.type, entityKey, message, details, featureUid, rule.severity]);
  if (rows.length) {
    const roles = rule.target?.roles?.length ? rule.target.roles : ['reader', 'editor', 'admin'];
    for (const role of roles) io.to(`role:${role}`).emit('alert:triggered', rows[0]);
  }
}

async function evaluateThreshold(io, rule) {
  const { score_threshold } = rule.config;
  if (typeof score_threshold !== 'number') return;
  const scores = await analysisRouter.computeDisruptionScores();
  for (const m of scores) {
    if (m.score >= score_threshold) {
      await insertEvent(
        io, rule, m.name,
        `Störningspoäng ${m.score} i ${m.name} överstiger tröskeln ${score_threshold}`,
        { municipality: m.name, score: m.score, raw_score: m.raw_score, elavbrott: m.elavbrott, road_count: m.road_count, police_count: m.police_count },
      );
    }
  }
}

function isValidProximityConfig(config) {
  if (!config || !config.layer || !config.distance_m) return false;
  if (config.target_uid) return typeof config.target_uid === 'string';
  return config.min_criticality in CRITICALITY_ORDER;
}

async function evaluateProximity(io, rule) {
  if (rule.config && rule.config.target_uid) await evaluateProximityTarget(io, rule);
  else await evaluateProximityCriticality(io, rule);
}

async function evaluateProximityCriticality(io, rule) {
  const { layer, min_criticality, distance_m } = rule.config;
  if (!layer || !distance_m || !(min_criticality in CRITICALITY_ORDER)) return;
  const allowed = Object.keys(CRITICALITY_ORDER).filter(c => CRITICALITY_ORDER[c] >= CRITICALITY_ORDER[min_criticality] && c !== 'normal');

  // "Mer specifik vinner": objekt som redan har en egen aktiverad target_uid-regel
  // exkluderas ur bas-regelns träffmängd, så samma händelse inte larmar två gånger
  // under två olika rule_id (dedup är per rad, inte cross-rule).
  const { rows: exclRows } = await db.query(
    `SELECT DISTINCT config->>'target_uid' AS uid FROM alert_rules
     WHERE type = 'proximity' AND enabled = true AND config ? 'target_uid'`
  );
  const excludedUids = exclRows.map(r => r.uid).filter(Boolean);

  const { rows } = await db.query(`
    SELECT DISTINCT ON (src.uid)
      src.uid AS source_uid, src.name AS source_name,
      tgt.uid AS target_uid, tgt.name AS target_name,
      tgt.attributes->>'criticality' AS target_criticality,
      ST_Distance(src.geom::geography, tgt.geom::geography) AS distance_m
    FROM features src
    JOIN features tgt
      ON tgt.uid <> src.uid
     AND ST_DWithin(src.geom::geography, tgt.geom::geography, $2)
    WHERE src.layer = $1
      AND tgt.attributes->>'criticality' = ANY($3::text[])
      AND NOT (tgt.uid = ANY($4::uuid[]))
    ORDER BY src.uid, distance_m ASC
  `, [layer, distance_m, allowed, excludedUids]);

  for (const r of rows) {
    await insertEvent(
      io, rule, r.source_uid,
      `${r.source_name} (${layer}) är inom ${Math.round(r.distance_m)} m från kritiskt objekt ${r.target_name} (${r.target_criticality})`,
      { source_uid: r.source_uid, source_name: r.source_name, target_uid: r.target_uid, target_name: r.target_name, target_criticality: r.target_criticality, distance_m: Math.round(r.distance_m) },
      r.source_uid,
    );
  }
}

async function evaluateProximityTarget(io, rule) {
  // Framtida utökningspunkt: extra filter (t.ex. exclude_bearing_deg) kan läggas
  // som ytterligare valfria nycklar i config och läsas ut här — bygg inte nu.
  const { layer, distance_m, target_uid } = rule.config;
  if (!layer || !distance_m || !target_uid) return;

  const { rows } = await db.query(`
    SELECT src.uid AS source_uid, src.name AS source_name,
           tgt.uid AS target_uid, tgt.name AS target_name,
           ST_Distance(src.geom::geography, tgt.geom::geography) AS distance_m
    FROM features src
    JOIN features tgt ON tgt.uid = $3
    WHERE src.layer = $1 AND src.uid <> tgt.uid
      AND ST_DWithin(src.geom::geography, tgt.geom::geography, $2)
  `, [layer, distance_m, target_uid]);

  for (const r of rows) {
    await insertEvent(
      io, rule, r.source_uid,
      `${r.source_name} (${layer}) är inom ${Math.round(r.distance_m)} m från ${r.target_name}`,
      { source_uid: r.source_uid, source_name: r.source_name, target_uid: r.target_uid, target_name: r.target_name, distance_m: Math.round(r.distance_m) },
      r.source_uid,
    );
  }
}

async function evaluateCluster(io, rule) {
  const { layer, min_count, radius_m } = rule.config;
  if (!layer || !min_count || !radius_m) return;

  const { rows } = await db.query(`
    SELECT cluster_id, count(*) AS n,
           array_agg(uid ORDER BY uid) AS uids,
           array_agg(name ORDER BY uid) AS names
    FROM (
      SELECT uid, name,
             ST_ClusterDBSCAN(ST_Transform(geom, 3006), eps := $2, minpoints := $3) OVER () AS cluster_id
      FROM features WHERE layer = $1
    ) sub
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    HAVING count(*) >= $3
  `, [layer, radius_m, min_count]);

  for (const r of rows) {
    const entityKey = 'cluster:' + crypto.createHash('md5').update(r.uids.join(',')).digest('hex');
    await insertEvent(
      io, rule, entityKey,
      `${r.n} händelser i lager ${layer} klustrade inom ${radius_m} m (tröskel ${min_count})`,
      { layer, count: Number(r.n), radius_m, uids: r.uids, names: r.names },
    );
  }
}

// Spår 1, användningsfall 1: kritisk vädervarning i OpOmr. Vädervarningar är redan
// OpOmr-filtrerade vid skördning (harvest.js) så ingen ytterligare geo-koll behövs här.
async function evaluateWeatherCritical(io, rule) {
  const minSeverity = rule.config?.min_severity;
  if (!Array.isArray(minSeverity) || !minSeverity.length) return;
  const { rows } = await db.query(
    `SELECT uid, name, attributes FROM features WHERE layer = 'weather_warnings' AND attributes->>'severity' = ANY($1)`,
    [minSeverity]
  );
  for (const r of rows) {
    await insertEvent(
      io, rule, r.uid,
      `${r.name} (${r.attributes.severity})`,
      { feature_uid: r.uid, severity_level: r.attributes.severity },
      r.uid,
    );
  }
}

// Spår 1, användningsfall 4: AI-klassificerad brådskande nyhet (Haiku, se newsClassifier.js).
async function evaluateNewsUrgent(io, rule) {
  const { rows } = await db.query(
    `SELECT id, title, category FROM news_items WHERE relevant = true AND urgent = true AND status != 'discarded'`
  );
  for (const r of rows) {
    await insertEvent(
      io, rule, `news:${r.id}`,
      `${r.title}${r.category ? ' (' + r.category + ')' : ''}`,
      { news_item_id: r.id, category: r.category },
    );
  }
}

async function evaluateAlerts(io) {
  const { rows: rules } = await db.query(`SELECT * FROM alert_rules WHERE enabled = true`);
  for (const rule of rules) {
    try {
      if (rule.type === 'threshold') await evaluateThreshold(io, rule);
      else if (rule.type === 'proximity') await evaluateProximity(io, rule);
      else if (rule.type === 'cluster') await evaluateCluster(io, rule);
      else if (rule.type === 'weather_critical') await evaluateWeatherCritical(io, rule);
      else if (rule.type === 'news_urgent') await evaluateNewsUrgent(io, rule);
    } catch (err) {
      console.error(`Alert rule "${rule.name}" (${rule.type}) evaluation failed:`, err.message);
    }
  }
}

module.exports = { evaluateAlerts, isValidProximityConfig };
