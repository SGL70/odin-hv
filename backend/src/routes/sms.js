const express = require('express');
const db = require('../db');

const router = express.Router();

// Known sender numbers → { label, lat, lng }
// Add numbers here as services are registered with the 46elks number
const KNOWN_SENDERS = {
  // Example (fill in as SMS subscriptions are set up):
  // '+46XXXXXXXXX': { label: 'TVAB Kiruna', lat: 67.8557, lng: 20.2253 },
  // '+46XXXXXXXXX': { label: 'Lumire Luleå', lat: 65.5848, lng: 22.1547 },
  // '+46XXXXXXXXX': { label: 'Gällivare kommun', lat: 67.1363, lng: 20.6523 },
  // '+46XXXXXXXXX': { label: 'Överkalix VA', lat: 66.3966, lng: 22.8440 },
};

// Norrbotten center fallback
const NORRBOTTEN_CENTER = { lat: 66.8309, lng: 20.3994 };

// POST /api/sms/incoming — called by 46elks on every inbound SMS
// 46elks sends application/x-www-form-urlencoded with: id, from, to, message, created, direction
router.post('/incoming', express.urlencoded({ extended: false }), async (req, res) => {
  // Always respond immediately so 46elks doesn't retry
  res.json({ action: 'noresponse' });

  const { id, from, message, created } = req.body;
  if (!message) return;

  const sender = KNOWN_SENDERS[from] || null;
  const label = sender?.label || from || 'SMS-avisering';
  const lat = sender?.lat ?? NORRBOTTEN_CENTER.lat;
  const lng = sender?.lng ?? NORRBOTTEN_CENTER.lng;

  // First line of SMS as name, rest as description
  const lines = message.trim().split('\n');
  const name = lines[0].slice(0, 120);
  const description = lines.slice(1).join('\n').trim();

  try {
    await db.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
       VALUES ('sms_alerts', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), 'b-m-p-s-p', $4, 1, 1)`,
      [
        name,
        lng, lat,
        {
          from,
          description,
          received_at: created || new Date().toISOString(),
          raw_message: message,
          source: label,
          elks_id: id || null,
        },
      ]
    );
    // Notify connected clients
    req.io?.emit('features:reloaded', {});
    console.log(`SMS-alert sparad: från ${from} — ${name}`);
  } catch (err) {
    console.error('SMS webhook DB-fel:', err.message);
  }
});

module.exports = router;
