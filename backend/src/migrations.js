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

// UI-inställningar (sidopanel, högerpanel-flik, kartunderlag, WMS-lager, synliga lager,
// OpOmr-filter, skördningsintervall) per användare i stället för bara i webbläsarens
// localStorage — annars följer inte preferenserna med mellan enheter eller efter cache-rensning.
async function ensureUserPreferencesColumn() {
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'`);
  console.log('users.preferences-kolumn klar');
}

// SMS-aviseringar (kända avsändare, auto-placeras) vs Tips via SMS (okända, kräver manuell
// geotaggning innan de blir ett riktigt sms_alerts-objekt). sms_senders är registret över ALLA
// nummer som någonsin hörts av, inte bara kända — annars går det inte att administrera dem i UI.
async function ensureSmsTablesSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_senders (
      phone VARCHAR(20) PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','known','blocked')),
      label VARCHAR(200),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_tips (
      id SERIAL PRIMARY KEY,
      elks_id VARCHAR(100),
      from_number VARCHAR(20) NOT NULL,
      message TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','tagged','discarded')),
      tagged_feature_uid UUID REFERENCES features(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS sms_tips_status_idx ON sms_tips(status)`);
  console.log('sms_senders/sms_tips-schema klart');
}

// Catch-up vid inloggning ("larm du missat" + "nytt i appen") behöver veta när
// användaren senast loggade in för att kunna avgränsa vad som är nytt sedan dess.
async function ensureLastLoginColumn() {
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  console.log('users.last_login_at-kolumn klar');
}

// Utökar features_layer_check med 'news_reports' (mediabevakning, roadmap-punkt 15).
async function ensureNewsReportsLayer() {
  await db.query(`ALTER TABLE features DROP CONSTRAINT IF EXISTS features_layer_check`);
  await db.query(`
    ALTER TABLE features ADD CONSTRAINT features_layer_check CHECK (layer IN (
      'fuel','food','water','raw_materials','vehicles','firewood','consumables','roads','bridges',
      'maintenance','hygiene','staging_areas','transshipment','cameras','powerlines','telecom',
      'railways','ports','airports','medical','emergency','tunnels','fording_points',
      'police_events','road_situations','power_outages','sms_alerts','intelligence_reports',
      'railway_situations','news_reports'
    ))
  `);
  console.log('features_layer_check uppdaterad (news_reports)');
}

// Mediabevakning (roadmap #15) — nyhetskällor konfigureras i Inställningar och hämtas
// automatiskt via RSS. Liksom Tips via SMS hamnar poster i en granskningsinkorg (news_items,
// status 'pending') tills någon geotaggar dem manuellt — annars skulle nyheter utan platsangivelse
// felaktigt hamna på en kommun-mittpunkt. news_sources.feed_url är null tills discoverFeedUrl()
// (se services/newsFeeds.js) hittat en fungerande RSS/Atom-feed; last_error förklarar varför inte.
async function ensureNewsSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS news_sources (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      site_url TEXT NOT NULL,
      feed_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_fetched_at TIMESTAMPTZ,
      last_error TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS news_items (
      id SERIAL PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT,
      summary TEXT,
      published_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','tagged','discarded')),
      tagged_feature_uid UUID REFERENCES features(uid) ON DELETE SET NULL,
      UNIQUE (source_id, guid)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS news_items_status_idx ON news_items(status)`);

  // Startkällor beslutade 2026-07-05: SVT/SR/TV4 fritt tillgängliga, Kuriren vald framför
  // NSD (samma NTM-koncern, i praktiken dubblettinnehåll — se roadmap-punkt 15).
  const defaults = [
    ['SVT Nyheter Norrbotten', 'https://www.svt.se/nyheter/lokalt/norrbotten/', 'https://www.svt.se/nyheter/lokalt/norrbotten/rss.xml'],
    ['SR P4 Norrbotten', 'https://sverigesradio.se/norrbotten', 'https://api.sr.se/api/rss/channel/209'],
    ['TV4 Nyheterna', 'https://www.tv4.se/nyheter', 'https://www.tv4.se/rss'],
    ['Norrbottens-Kuriren', 'https://www.kuriren.nu/', 'https://www.kuriren.nu/rss'],
  ];
  for (const [name, siteUrl, feedUrl] of defaults) {
    await db.query(
      `INSERT INTO news_sources (name, site_url, feed_url) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
      [name, siteUrl, feedUrl]
    );
  }
  console.log('news_sources/news_items-schema klart');
}

module.exports = {
  ensureAlertSchema, ensureIntelligenceReportsLayer, ensureRailwaySituationsLayer, ensureFeatureHistorySchema,
  ensureUserPreferencesColumn, ensureSmsTablesSchema, ensureLastLoginColumn,
  ensureNewsReportsLayer, ensureNewsSchema,
};
