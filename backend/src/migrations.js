const db = require('./db');

async function ensureAlertSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('threshold','proximity','cluster')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      config JSONB NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES alert_rules(id) ON DELETE SET NULL,
      rule_name VARCHAR(200) NOT NULL,
      rule_type VARCHAR(20) NOT NULL,
      entity_key VARCHAR(300) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged')),
      message VARCHAR(500) NOT NULL,
      details JSONB DEFAULT '{}',
      feature_uid UUID REFERENCES features(uid) ON DELETE SET NULL,
      acknowledged_by INTEGER REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS alert_events_open_dedup_idx
      ON alert_events(rule_id, entity_key) WHERE status = 'open'
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS alert_events_status_idx ON alert_events(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS features_geog_idx ON features USING GIST ((geom::geography))`);

  await db.query(`
    DROP TRIGGER IF EXISTS alert_rules_updated_at ON alert_rules;
    CREATE TRIGGER alert_rules_updated_at
      BEFORE UPDATE ON alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);

  console.log('Alert-schema klart (alert_rules, alert_events)');
}

// Utökar features_layer_check med 'intelligence_reports' (underrättelserapporter).
// Inline CHECK-constraint saknar ADD VALUE-genväg (till skillnad från ENUM) — måste drop+recreate.
async function ensureIntelligenceReportsLayer() {
  await db.query(`ALTER TABLE features DROP CONSTRAINT IF EXISTS features_layer_check`);
  await db.query(`
    ALTER TABLE features ADD CONSTRAINT features_layer_check CHECK (layer IN (
      'fuel','food','water','raw_materials','vehicles','firewood','consumables','roads','bridges',
      'maintenance','hygiene','staging_areas','transshipment','cameras','powerlines','telecom',
      'railways','ports','airports','medical','emergency','tunnels','fording_points',
      'police_events','road_situations','power_outages','sms_alerts','intelligence_reports',
      'railway_situations'
    ))
  `);
  console.log('features_layer_check uppdaterad (intelligence_reports)');
}

// Utökar features_layer_check med 'railway_situations' (tågstörningar via TrainAnnouncement).
async function ensureRailwaySituationsLayer() {
  await db.query(`ALTER TABLE features DROP CONSTRAINT IF EXISTS features_layer_check`);
  await db.query(`
    ALTER TABLE features ADD CONSTRAINT features_layer_check CHECK (layer IN (
      'fuel','food','water','raw_materials','vehicles','firewood','consumables','roads','bridges',
      'maintenance','hygiene','staging_areas','transshipment','cameras','powerlines','telecom',
      'railways','ports','airports','medical','emergency','tunnels','fording_points',
      'police_events','road_situations','power_outages','sms_alerts','intelligence_reports',
      'railway_situations'
    ))
  `);
  console.log('features_layer_check uppdaterad (railway_situations)');
}

// ABI sekvensneutralitet: rådata som annars skulle raderas vid skördning/TTL flyttas hit
// i stället för att gå förlorad. Ingen FK mot features.uid — raden är per definition borttagen därifrån.
async function ensureFeatureHistorySchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS features_history (
      id SERIAL PRIMARY KEY,
      uid UUID NOT NULL,
      layer VARCHAR(50) NOT NULL,
      cot_type VARCHAR(50),
      name VARCHAR(200) NOT NULL,
      geom GEOMETRY(GEOMETRY, 4326) NOT NULL,
      attributes JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_reason VARCHAR(50) NOT NULL
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS features_history_layer_idx ON features_history(layer)`);
  await db.query(`CREATE INDEX IF NOT EXISTS features_history_geom_idx ON features_history USING GIST(geom)`);
  await db.query(`CREATE INDEX IF NOT EXISTS features_history_archived_at_idx ON features_history(archived_at)`);
  console.log('features_history-schema klart');
}

module.exports = { ensureAlertSchema, ensureIntelligenceReportsLayer, ensureRailwaySituationsLayer, ensureFeatureHistorySchema };
