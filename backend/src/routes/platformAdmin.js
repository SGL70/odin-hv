const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requirePlatformAdmin } = require('../middleware/platformAdminAuth');

const router = express.Router();

// Multi-tenancy steg 9 — samma login-mönster som routes/auth.js, men mot platform_admins i
// stället för users, och med `type: 'platform_admin'` i JWT-payloaden så requirePlatformAdmin
// aldrig kan förväxla den med en vanlig användartoken (se den filens kommentar).
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
  try {
    const { rows } = await db.platformQuery('SELECT * FROM platform_admins WHERE username = $1', [username]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash)))
      return res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
    const token = jwt.sign(
      { id: admin.id, username: admin.username, type: 'platform_admin' },
      process.env.PLATFORM_ADMIN_JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requirePlatformAdmin, (req, res) => res.json(req.platformAdmin));

// ── Org-provisionering (steg 10) ─────────────────────────────────────────────
// Ersätter ADMIN_PASSWORD-bootstrapen (index.js::ensureAdmin(), som bara seedar EN admin i EN
// hårdkodad "default"-org) — en superadmin kan nu provisionera en NY organisation OCH dess
// första admin-konto i samma anrop, utan att behöva vara inloggad som en admin i en redan
// existerande org (det hönan-och-ägget-problemet fanns annars: routes/auth.js POST /users kräver
// requireRole('admin') i en org som redan finns).
router.get('/organizations', requirePlatformAdmin, async (req, res) => {
  try {
    const { rows } = await req.platformDb.query(`
      SELECT o.id, o.name, o.slug, o.org_type, o.parent_org_id, o.created_at,
             (SELECT count(*)::int FROM users u WHERE u.org_id = o.id) AS user_count,
             (SELECT count(*)::int FROM features f WHERE f.org_id = o.id) AS feature_count
      FROM organizations o
      ORDER BY o.org_type, o.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/organizations', requirePlatformAdmin, async (req, res) => {
  const { name, slug, org_type, parent_org_id, adminUsername, adminPassword } = req.body;
  if (!name || !slug || !org_type) return res.status(400).json({ error: 'name, slug och org_type krävs' });
  if (!['bataljon', 'militarregion'].includes(org_type)) return res.status(400).json({ error: "org_type måste vara 'bataljon' eller 'militarregion'" });
  if ((adminUsername && !adminPassword) || (!adminUsername && adminPassword))
    return res.status(400).json({ error: 'adminUsername och adminPassword måste anges tillsammans' });

  const client = await req.platformDb.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO organizations (name, slug, org_type, parent_org_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, org_type, parent_org_id || null]
    );
    const org = rows[0];

    let admin = null;
    if (adminUsername) {
      const hash = await bcrypt.hash(adminPassword, 10);
      const { rows: userRows } = await client.query(
        `INSERT INTO users (username, password_hash, role, org_id) VALUES ($1, $2, 'admin', $3) RETURNING id, username, role, org_id`,
        [adminUsername, hash, org.id]
      );
      admin = userRows[0];
    }
    await client.query('COMMIT');
    res.status(201).json({ organization: org, admin });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Cross-org skördehälsa (steg 10) ──────────────────────────────────────────
// Samma källogik som routes/harvest.js GET /status, men grupperat per org_id i stället för
// req.tenant-scopat till en enda — en superadmin behöver se ALLA organisationers skördestatus i
// en enda vy, inte logga in per bataljon. news_sources har till skillnad från features en riktig
// last_error-kolumn, så bara den kan visa faktiska felmeddelanden, inte bara "senast lyckad".
router.get('/harvest-health', requirePlatformAdmin, async (req, res) => {
  try {
    const { rows: featureRows } = await req.platformDb.query(`
      SELECT org_id,
        CASE
          WHEN layer = 'fuel' AND attributes->>'source' ILIKE 'OSM%' THEN 'osm'
          WHEN layer = 'fuel' AND attributes->>'source' = 'OKQ8'     THEN 'okq8'
          WHEN layer = 'fuel' AND attributes->>'source' = 'Skoogs'   THEN 'skoogs'
          WHEN layer = 'police_events'   THEN 'police'
          WHEN layer = 'road_situations' THEN 'situations'
          WHEN layer = 'power_outages'   THEN 'power'
          WHEN layer = 'bridges'         THEN 'bridges'
          WHEN layer = 'railway_situations' THEN 'railway-situations'
          WHEN layer = 'cameras' AND attributes->>'source' = 'Trafikverket/Camera'  THEN 'trv-cameras'
          WHEN layer = 'cameras' AND attributes->>'source' = 'Trafikverket/ATK'     THEN 'trv-atk'
          WHEN layer = 'roads'   AND attributes->>'source' = 'Trafikverket/NVDB'    THEN 'trv-roads'
          WHEN layer = 'roads'   AND attributes->>'source' = 'Trafikverket/Traffic' THEN 'trv-traffic'
          WHEN layer = 'ports'   AND attributes->>'source' = 'Trafikverket/NVDB'    THEN 'trv-ferries'
          WHEN layer = 'weather_warnings' THEN 'weather-warnings'
        END AS src,
        MAX(attributes->>'scraped_at') AS last_at
      FROM features
      WHERE attributes->>'scraped_at' IS NOT NULL
      GROUP BY org_id, 2
    `);
    const { rows: newsRows } = await req.platformDb.query(`
      SELECT org_id, name, last_fetched_at, last_error FROM news_sources WHERE enabled = true ORDER BY org_id, name
    `);

    const byOrg = {};
    const ensure = (orgId) => (byOrg[orgId] ||= { sources: {}, news: [] });
    for (const r of featureRows) {
      if (!r.src) continue;
      ensure(r.org_id).sources[r.src] = r.last_at;
    }
    for (const r of newsRows) {
      ensure(r.org_id).news.push({ name: r.name, last_fetched_at: r.last_fetched_at, last_error: r.last_error });
    }
    res.json(byOrg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kostnads-/användningsöversikt (steg 10) ──────────────────────────────────
// OBS: det finns ingen faktisk kostnads-/token-loggning någonstans i kodbasen idag (varken för
// Anthropic-klassificeringen, Trafikverket-anropen eller 46elks-SMS) — det här är VOLYMRÄKNINGAR
// som proxy för kostnad (fler klassificerade nyhetsposter ≈ fler Haiku-anrop, fler sms_tips ≈ fler
// inkommande 46elks-meddelanden), inte en riktig fakturaöversikt. Ärligt begränsat till vad som
// faktiskt går att räkna ut ur befintliga tabeller — se docs/multitenancy-forslag.md "Öppna frågor"
// om faktisk kostnadsfördelning, som fortfarande är obeslutad.
router.get('/usage', requirePlatformAdmin, async (req, res) => {
  try {
    const { rows } = await req.platformDb.query(`
      SELECT
        o.id AS org_id, o.name, o.org_type,
        (SELECT count(*)::int FROM users u WHERE u.org_id = o.id) AS users,
        (SELECT count(*)::int FROM features f WHERE f.org_id = o.id) AS features,
        (SELECT count(*)::int FROM news_items ni WHERE ni.org_id = o.id) AS news_items_total,
        (SELECT count(*)::int FROM news_items ni WHERE ni.org_id = o.id AND ni.relevant IS NOT NULL) AS news_items_classified,
        (SELECT count(*)::int FROM alert_events ae WHERE ae.org_id = o.id) AS alert_events_total,
        (SELECT count(*)::int FROM alert_events ae WHERE ae.org_id = o.id AND ae.status = 'open') AS alert_events_open,
        (SELECT count(*)::int FROM sms_tips st WHERE st.org_id = o.id) AS sms_tips
      FROM organizations o
      ORDER BY o.org_type, o.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
