const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Delad mellan tips-taggning och avsändarregistrering — returnerar null om kommunen saknar
// geometri i municipalities-tabellen (bara Norrbottens 14 kommuner har det just nu).
async function resolveMunicipalityCentroid(municipality) {
  const { rows } = await db.query(
    `SELECT ST_Y(ST_Centroid(geom)) as lat, ST_X(ST_Centroid(geom)) as lng FROM municipalities WHERE short_name = $1`,
    [municipality]
  );
  return rows[0] || null;
}

// POST /api/sms/incoming — anropas av 46elks vid varje inkommande SMS
// 46elks skickar application/x-www-form-urlencoded: id, from, to, message, created, direction
//
// sms_senders är registret över ALLA nummer som någonsin hörts av (uppdateras här på varje
// inkommande SMS, oavsett klassificering) — känd/blockerad sätts via /senders-endpointen nedan.
// Kända avsändare auto-placeras som en riktig sms_alerts-feature (SMS-aviseringar). Okända
// hamnar i sms_tips-inkorgen (Tips via SMS) i stället för att gissa en plats på kartan.
router.post('/incoming', express.urlencoded({ extended: false }), async (req, res) => {
  // Svara direkt så 46elks inte gör om anropet
  res.json({ action: 'noresponse' });

  const { id, from, message, created } = req.body;
  if (!message || !from) return;

  try {
    const { rows } = await db.query(
      `INSERT INTO sms_senders (phone, message_count, last_seen_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (phone) DO UPDATE SET message_count = sms_senders.message_count + 1, last_seen_at = NOW()
       RETURNING status, label, lat, lng`,
      [from]
    );
    const sender = rows[0];

    if (sender.status === 'blocked') {
      console.log(`SMS från blockerat nummer ${from} ignorerat`);
      return;
    }

    // Första raden av SMS:et som namn, resten som beskrivning
    const lines = message.trim().split('\n');
    const name = lines[0].slice(0, 120);
    const description = lines.slice(1).join('\n').trim();

    if (sender.status === 'known') {
      await db.query(
        `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
         VALUES ('sms_alerts', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), 'b-m-p-s-p', $4, 1, 1)`,
        [
          name, sender.lng, sender.lat,
          {
            from, description, received_at: created || new Date().toISOString(),
            raw_message: message, source: sender.label || from, elks_id: id || null,
          },
        ]
      );
      req.io?.emit('features:reloaded', {});
      console.log(`SMS-avisering sparad: från ${sender.label || from} — ${name}`);
    } else {
      await db.query(
        `INSERT INTO sms_tips (elks_id, from_number, message, received_at) VALUES ($1,$2,$3,$4)`,
        [id || null, from, message, created || new Date().toISOString()]
      );
      req.io?.emit('sms_tip:new', {});
      console.log(`Tips via SMS mottaget från ${from}, väntar på geotaggning`);
    }
  } catch (err) {
    console.error('SMS webhook-fel:', err.message);
  }
});

// ── Tips via SMS — granskningsinkorg för okända avsändare ───────────────────

router.get('/tips', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await db.query(
    `SELECT id, elks_id, from_number, message, received_at, status, created_at
     FROM sms_tips WHERE status = $1 ORDER BY received_at DESC`,
    [status]
  );
  res.json(rows);
});

router.post('/tips/:id/tag', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { municipality, area, lat, lng } = req.body;
  try {
    const tipRes = await db.query(`SELECT * FROM sms_tips WHERE id = $1 AND status = 'pending'`, [id]);
    const tip = tipRes.rows[0];
    if (!tip) return res.status(404).json({ error: 'Tips hittades inte eller är redan hanterat' });

    let finalLat = lat, finalLng = lng;
    if (finalLat == null || finalLng == null) {
      if (!municipality) return res.status(400).json({ error: 'Ange kommun eller koordinater' });
      const centroid = await resolveMunicipalityCentroid(municipality);
      if (!centroid) return res.status(400).json({ error: 'Kommunen saknar kartdata — ange plats manuellt på kartan' });
      finalLat = centroid.lat;
      finalLng = centroid.lng;
    }

    const lines = tip.message.trim().split('\n');
    const name = lines[0].slice(0, 120);
    const description = lines.slice(1).join('\n').trim();

    const featureRes = await db.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
       VALUES ('sms_alerts', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), 'b-m-p-s-p', $4, $5, $5)
       RETURNING uid`,
      [
        name, finalLng, finalLat,
        {
          from: tip.from_number, description, area: area || null, municipality: municipality || null,
          received_at: tip.received_at, raw_message: tip.message, source: 'Tips via SMS', elks_id: tip.elks_id,
        },
        req.user.id,
      ]
    );

    await db.query(`UPDATE sms_tips SET status = 'tagged', tagged_feature_uid = $1 WHERE id = $2`, [featureRes.rows[0].uid, id]);

    req.io?.emit('features:reloaded', {});
    res.json({ ok: true, feature_uid: featureRes.rows[0].uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tips/:id/discard', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  await db.query(`UPDATE sms_tips SET status = 'discarded' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// ── Avsändarregister — administration av alla nummer som hörts av ───────────

router.get('/senders', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM sms_senders ORDER BY last_seen_at DESC');
  res.json(rows);
});

router.put('/senders/:phone', requireAuth, requireRole('admin'), async (req, res) => {
  const { phone } = req.params;
  const { status, label, municipality } = req.body;
  let { lat, lng } = req.body;
  try {
    if (status === 'known' && (lat == null || lng == null)) {
      if (!municipality) return res.status(400).json({ error: 'Ange kommun eller koordinater för en känd avsändare' });
      const centroid = await resolveMunicipalityCentroid(municipality);
      if (!centroid) return res.status(400).json({ error: 'Kommunen saknar kartdata — ange koordinater manuellt' });
      lat = centroid.lat;
      lng = centroid.lng;
    }
    await db.query(
      `INSERT INTO sms_senders (phone, status, label, lat, lng, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (phone) DO UPDATE SET status = $2, label = $3, lat = $4, lng = $5, updated_by = $6`,
      [phone, status, label ?? null, lat ?? null, lng ?? null, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
