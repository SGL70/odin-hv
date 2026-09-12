const tls = require('tls');
const fs = require('fs');
const db = require('../db');
const { extractCotEvents, cotEventToAttrs } = require('./cotParser');

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 60000;

let socket = null;
let buffer = '';
let reconnectDelay = RECONNECT_BASE_MS;
let reconnectTimer = null;

// Upsert per bataljon — samma db.withEachBattalion()-mönster som harvest.js::runAutoHarvest()
// använder för andra delade externa datakällor (polis/väder/trafik). org_id kommer alltid
// från battalion.id, aldrig från en egen fristående lookup.
async function upsertTakReport(tenantDb, orgId, attrs) {
  const { rows } = await tenantDb.query(
    `SELECT uid FROM features WHERE layer = 'tak_reports' AND org_id = $1 AND attributes->>'cot_uid' = $2`,
    [orgId, attrs.cot_uid]
  );
  if (rows.length) {
    // Uppdaterar bara position/callsign/cot_type — attributes || rör aldrig ett redan satt
    // confirmed (ATAK skickar om samma markör upprepat tills den blir stale).
    await tenantDb.query(
      `UPDATE features SET
         geom = ST_SetSRID(ST_MakePoint($1, $2), 4326),
         cot_type = $3,
         name = $4::text,
         updated_at = NOW(),
         attributes = attributes || jsonb_build_object('cot_callsign', $4::text)
       WHERE uid = $5`,
      [attrs.lon, attrs.lat, attrs.cot_type, attrs.callsign, rows[0].uid]
    );
  } else {
    await tenantDb.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by, org_id)
       VALUES ('tak_reports', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, NULL, NULL, $6)`,
      [attrs.callsign, attrs.lon, attrs.lat, attrs.cot_type,
        JSON.stringify({ confirmed: 'false', cot_uid: attrs.cot_uid, cot_callsign: attrs.callsign }), orgId]
    );
  }
}

async function handleEvent(xml) {
  const attrs = cotEventToAttrs(xml);
  if (!attrs) return;
  await db.withEachBattalion((tenantDb, battalion) => upsertTakReport(tenantDb, battalion.id, attrs));
}

function onData(chunk) {
  buffer += chunk;
  const { events, remainder } = extractCotEvents(buffer);
  buffer = remainder;
  for (const xml of events) {
    handleEvent(xml).catch(err => console.error('takyBridge: kunde inte spara CoT-event:', err.message));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function connect() {
  let options;
  try {
    options = {
      host: process.env.TAKY_HOST,
      port: Number(process.env.TAKY_COT_PORT || 8089),
      cert: fs.readFileSync(process.env.TAKY_CLIENT_CERT_PATH),
      key: fs.readFileSync(process.env.TAKY_CLIENT_KEY_PATH),
      ca: process.env.TAKY_CA_CERT_PATH ? fs.readFileSync(process.env.TAKY_CA_CERT_PATH) : undefined,
      rejectUnauthorized: true,
    };
  } catch (err) {
    console.error('takyBridge: kunde inte läsa certifikatfiler, avbryter:', err.message);
    return;
  }
  buffer = '';
  socket = tls.connect(options, () => {
    console.log(`takyBridge: ansluten till Taky (${options.host}:${options.port})`);
    reconnectDelay = RECONNECT_BASE_MS;
  });
  socket.setEncoding('utf8');
  socket.on('data', onData);
  socket.on('error', err => console.error('takyBridge: socket-fel:', err.message));
  socket.on('close', scheduleReconnect);
}

function isEnabled() {
  return process.env.FEATURE_TAKY_BRIDGE === 'true';
}

function start() {
  if (!isEnabled()) {
    console.log('takyBridge: inaktiverad (FEATURE_TAKY_BRIDGE != "true")');
    return;
  }
  connect();
}

module.exports = { start, upsertTakReport };
