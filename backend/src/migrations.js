const db = require('./db');

// Enda källan till sanning för features_layer_check — måste innehålla ALLA lager som någonsin
// kan finnas i tabellen. Tidigare hade varje ensure*Layer()-funktion sin egen hårdkodade lista;
// eftersom de körs i fast ordning vid varje omstart oavsett om DB:n redan har rader i ett senare
// tillagt lager, orsakade en äldre funktions smalare lista ett DROP+ADD CONSTRAINT som bröts av
// redan existerande rader — kraschade backend-omstart två gånger (railway_situations 2026-07-04,
// news_reports 2026-07-05) innan detta fixades till en delad lista. Lägg alltid till nya lager
// HÄR, aldrig i en enskild funktions egen kopia.
const FEATURE_LAYERS = [
  'fuel', 'food', 'water', 'raw_materials', 'vehicles', 'firewood', 'consumables', 'roads', 'bridges',
  'maintenance', 'hygiene', 'staging_areas', 'transshipment', 'cameras', 'powerlines', 'telecom',
  'railways', 'ports', 'airports', 'medical', 'emergency', 'tunnels', 'fording_points',
  'police_events', 'road_situations', 'power_outages', 'sms_alerts', 'intelligence_reports',
  'railway_situations', 'news_reports', 'weather_warnings', 'tak_reports',
];

async function setFeatureLayerCheck(logSuffix) {
  await db.query(`ALTER TABLE features DROP CONSTRAINT IF EXISTS features_layer_check`);
  await db.query(`
    ALTER TABLE features ADD CONSTRAINT features_layer_check
      CHECK (layer IN (${FEATURE_LAYERS.map(l => `'${l}'`).join(',')}))
  `);
  console.log(`features_layer_check uppdaterad (${logSuffix})`);
}

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
  await setFeatureLayerCheck('intelligence_reports');
}

// Utökar features_layer_check med 'railway_situations' (tågstörningar via TrainAnnouncement).
async function ensureRailwaySituationsLayer() {
  await setFeatureLayerCheck('railway_situations');
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
  await setFeatureLayerCheck('news_reports');
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

  // org_id läggs till (nullable) HÄR, före seed-loopen nedan — inte i ensureNewsOrgIdColumns()
  // som körs senare. Annars: så fort org_id blir NOT NULL i ett senare boot skulle seed-INSERT:en
  // sakna kolumnen helt och krascha — "ON CONFLICT (name) DO NOTHING" fångar bara en unik-konflikt
  // på name, INTE en separat NOT NULL-överträdelse på org_id (upptäckt via uppgraderingstest).
  await db.query(`ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);

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
      `INSERT INTO news_sources (name, site_url, feed_url, org_id)
       VALUES ($1,$2,$3,(SELECT id FROM organizations WHERE slug = 'default'))
       ON CONFLICT (name) DO NOTHING`,
      [name, siteUrl, feedUrl]
    );
  }
  console.log('news_sources/news_items-schema klart');
}

// Bakfyllnad för roadmap #10 (precisionsnivå-tagg). saveFeatures() i harvest.js sätter taggen
// på nya rader, men identitetsbevarade rader (broar, vägar m.fl.) skrivs aldrig om vid en vanlig
// omskördning (ON CONFLICT DO NOTHING) — utan denna körs de aldrig ikapp. Idempotent, körs vid
// varje serverstart precis som övriga ensure*-funktioner.
async function ensureLocationPrecisionBackfill() {
  await db.query(`
    UPDATE features SET attributes = attributes || '{"location_precision":"kommun"}'::jsonb
    WHERE layer = 'police_events' AND attributes->>'location_precision' IS NULL
  `);
  await db.query(`
    UPDATE features SET attributes = attributes || '{"location_precision":"exact"}'::jsonb
    WHERE layer != 'police_events' AND attributes->>'location_precision' IS NULL
  `);
  console.log('location_precision-bakfyllnad klar');
}

// Utökar features_layer_check med 'weather_warnings' (SMHI Impact Based Weather Warnings).
async function ensureWeatherWarningsLayer() {
  await setFeatureLayerCheck('weather_warnings');
}

// Taky-integration fas 1 (docs/superpowers/specs/2026-09-12-taky-integration-inflow-design.md)
// — fältskapade CoT-markörer från ATAK/iTAK landar här via services/takyBridge.js.
async function ensureTakReportsLayer() {
  await setFeatureLayerCheck('tak_reports');
}

// Nyckelordsförfilter + Haiku-klassificering av nyhetsposter — relevant IS NULL betyder
// "ännu inte klassificerad" (t.ex. ANTHROPIC_API_KEY saknas), skiljs medvetet från false
// ("klassificerad som irrelevant"). Se services/newsClassifier.js och lib/newsKeywords.js.
async function ensureNewsClassifierColumns() {
  await db.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS relevant BOOLEAN`);
  await db.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS category TEXT`);
  await db.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS classifier_note TEXT`);
  console.log('news_items klassificeringskolumner klara');
}

// Notifieringssystem v1 (docs/notifieringssystem-forslag.md) — severity+target på varningsregler
// så leveransen kan riktas per roll (io.to('role:'+r)) istället för blind broadcast, plus två
// nya regeltyper (weather_critical/news_urgent). urgent på news_items är Haiku-klassificerarens
// nya fält (se newsClassifier.js), users.email krävs för dygnsrapportens SMTP-leverans.
async function ensureNotificationColumns() {
  await db.query(`ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS severity VARCHAR(10) NOT NULL DEFAULT 'varning' CHECK (severity IN ('info','varning','kritisk'))`);
  await db.query(`ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS target JSONB NOT NULL DEFAULT '{"roles":["reader","editor","admin"]}'`);
  await db.query(`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS severity VARCHAR(10)`);
  await db.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS urgent BOOLEAN`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  // users.phone (Spår 1 SMS-leverans via 46elks, se services/sms46elks.js) — samma
  // "krävs för utgående leverans, ingen ny mottagarmodell" som users.email ovan.
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);

  await db.query(`ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_type_check`);
  await db.query(`
    ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_type_check
      CHECK (type IN ('threshold','proximity','cluster','weather_critical','news_urgent'))
  `);
  console.log('Notifieringskolumner (severity/target/urgent/email/phone) klara');
}

// settings/municipalities frågas flitigt (routes/settings.js, routes/analysis.js, routes/features.js,
// services/geo.js, routes/harvest.js) men saknades helt ur versionshanteringen — skapade manuellt i
// den levande databasen någon gång innan detta migrationsmönster fanns (se docs/multitenancy-forslag.md
// "Känt schemagap"). CREATE TABLE IF NOT EXISTS gör tillägget ofarligt mot produktion (tabellerna finns
// redan där) men gör schemat återskapbart för nya miljöer (test, framtida hosting). Kolumnerna är
// inferred från faktisk frågeanvändning, inte en garanterad exakt spegling av den skarpa tabellen.
async function ensureSettingsAndMunicipalitiesSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS municipalities (
      id SERIAL PRIMARY KEY,
      short_name VARCHAR(100) NOT NULL UNIQUE,
      geom GEOMETRY(GEOMETRY, 4326) NOT NULL
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS municipalities_geom_idx ON municipalities USING GIST(geom)`);
  console.log('settings/municipalities-schema klart');
}

// Multi-tenancy steg 2 (docs/multitenancy-forslag.md) — organizations är ett träd, inte en platt
// lista: en bataljon har parent_org_id satt till sin militärregion, en militärregion har
// parent_org_id = NULL. Självrefererande FK håller dörren öppen för fler nivåer senare (t.ex.
// kompani under bataljon) utan schemaändring. Ingen CHECK som tvingar bataljon->parent, eftersom
// den ensamma bataljon som redan finns i denna (ännu enkeltenanta) drift inte har någon region att
// höra till än — det får plattformsverktyget (steg 9) koppla ihop när flera org onboardas.
//
// Seedar en "default"-bataljon och backfyllar alla befintliga users till den, så users.org_id kan
// bli NOT NULL i samma steg utan att bryta något. Nya användare (routes/auth.js POST /users,
// ensureAdmin() nedan) sätter org_id explicit — annars vore NOT NULL en bugg som väntar på att
// hända första gången någon glömmer det.
async function ensureOrganizationsSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      org_type VARCHAR(20) NOT NULL CHECK (org_type IN ('bataljon','militarregion')),
      parent_org_id INTEGER REFERENCES organizations(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS organizations_parent_org_id_idx ON organizations(parent_org_id)`);

  await db.query(`
    INSERT INTO organizations (name, slug, org_type) VALUES ('Standardbataljon', 'default', 'bataljon')
    ON CONFLICT (slug) DO NOTHING
  `);

  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE users SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE users ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS users_org_id_idx ON users(org_id)`);
  console.log('organizations-schema klart (users.org_id backfyllad till Standardbataljon)');
}

// Multi-tenancy steg 3, första tabellen (docs/multitenancy-forslag.md: "en tabell i taget") —
// samma nullable→backfill→NOT NULL-mönster som users.org_id i steg 2. Alla skrivvägar till
// features (routes/features.js, import.js, trafikverket.js, sms.js, news.js, harvest.js
// saveFeatures()) är uppdaterade att sätta org_id via services/orgContext.js:s resolveOrgId() i
// samma ändring — annars vore NOT NULL en trasig produktion i väntan på att hända, precis som med
// users.org_id/ensureAdmin() förra steget.
async function ensureFeaturesOrgIdColumn() {
  await db.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE features SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE features ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS features_org_id_idx ON features(org_id)`);
  console.log('features.org_id klar (backfyllad till Standardbataljon)');
}

// Multi-tenancy steg 3, andra tabellen — alert_rules/alert_events görs i samma funktion eftersom
// ett event alltid härleder sitt org_id från regeln som utlöste det (services/alertEngine.js
// insertEvent() sätter det direkt från rule.org_id, ingen resolveOrgId-uppslagning behövs där).
// alert_events.rule_id kan vara NULL (ON DELETE SET NULL om regeln tagits bort) — då finns ingen
// regel att härleda från, samma Standardbataljon-fallback som övriga tabeller används då.
async function ensureAlertOrgIdColumns() {
  await db.query(`ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE alert_rules SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE alert_rules ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS alert_rules_org_id_idx ON alert_rules(org_id)`);

  await db.query(`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE alert_events ae SET org_id = ar.org_id FROM alert_rules ar
    WHERE ae.rule_id = ar.id AND ae.org_id IS NULL
  `);
  await db.query(`
    UPDATE alert_events SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE alert_events ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS alert_events_org_id_idx ON alert_events(org_id)`);
  console.log('alert_rules/alert_events.org_id klara');
}

// Multi-tenancy steg 3, tredje tabellen — features_history är ett arkiv av rader som redan
// tillhörde en bataljon (harvest.js archiveAndDelete() kopierar en features-rad dit innan den
// raderas), så backfillen kan inte gissa en organisation här: en arkiverad rad utan spårbar org
// (borde inte kunna hända eftersom features.org_id redan är NOT NULL, men skulle en sådan rad
// ändå dyka upp — t.ex. en historisk databasrad från innan features.org_id fanns — faller den
// tillbaka till Standardbataljon precis som övriga tabeller).
async function ensureFeaturesHistoryOrgIdColumn() {
  await db.query(`ALTER TABLE features_history ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE features_history SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE features_history ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS features_history_org_id_idx ON features_history(org_id)`);
  console.log('features_history.org_id klar (backfyllad till Standardbataljon)');
}

// Multi-tenancy steg 3, fjärde tabellen — sms_senders/sms_tips. routes/sms.js:s uppdaterade
// skrivvägar (46elks-webhooken utan inloggad användare, PUT /senders/:phone med en admin) sätter
// redan org_id på nya rader; den här migrationen backfyllar bara det som redan finns.
async function ensureSmsOrgIdColumns() {
  await db.query(`ALTER TABLE sms_senders ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE sms_senders SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE sms_senders ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS sms_senders_org_id_idx ON sms_senders(org_id)`);

  await db.query(`ALTER TABLE sms_tips ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE sms_tips SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE sms_tips ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS sms_tips_org_id_idx ON sms_tips(org_id)`);
  console.log('sms_senders/sms_tips.org_id klara');
}

// Multi-tenancy steg 3, femte tabellen — news_sources/news_items. news_items ärver org_id från
// sin källas org_id (services/newsFeeds.js pollSource() sätter det direkt från source.org_id,
// samma denormaliserings-mönster som alert_events/alert_rules) i stället för att gissa via
// resolveOrgId() — den schemalagda RSS-pollningen har ingen inloggad användare att slå upp.
async function ensureNewsOrgIdColumns() {
  await db.query(`ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE news_sources SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE news_sources ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS news_sources_org_id_idx ON news_sources(org_id)`);

  await db.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE news_items ni SET org_id = ns.org_id FROM news_sources ns
    WHERE ni.source_id = ns.id AND ni.org_id IS NULL
  `);
  await db.query(`ALTER TABLE news_items ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS news_items_org_id_idx ON news_items(org_id)`);
  console.log('news_sources/news_items.org_id klara');
}

// Multi-tenancy steg 3, sjätte tabellen — activity_log finns i bas-schemat (db/init.sql), inte
// migrations.js, så den existerar alltid redan när denna körs. org_id sätts av den agerande
// användaren (routes/features.js:s fyra skrivvägar), inte av objektet som loggas.
async function ensureActivityLogOrgIdColumn() {
  await db.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE activity_log SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE activity_log ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS activity_log_org_id_idx ON activity_log(org_id)`);
  console.log('activity_log.org_id klar (backfyllad till Standardbataljon)');
}

// Multi-tenancy steg 3, sista tabellen — settings är strukturellt annorlunda än övriga: en
// platt key/value-tabell med `key` som ensam PRIMARY KEY, inte en rad-ägd tabell. Görs org-scopad
// genom att byta till en sammansatt PRIMARY KEY (org_id, key) i stället för att bara lägga till
// en kolumn. Måste köras INNAN index.js:s ensureSettings() säkerhetskopierar sina default-rader
// (DROP+ADD CONSTRAINT är samma redan etablerade idempotenta mönster som features_layer_check).
async function ensureSettingsOrgIdColumn() {
  await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`);
  await db.query(`
    UPDATE settings SET org_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE org_id IS NULL
  `);
  await db.query(`ALTER TABLE settings ALTER COLUMN org_id SET NOT NULL`);
  await db.query(`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey`);
  await db.query(`ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (org_id, key)`);
  console.log('settings.org_id klar (sammansatt PRIMARY KEY org_id+key)');
}

// Multi-tenancy steg 7 (docs/multitenancy-forslag.md, arkitekturpunkt 5) — mängdbaserad
// läs-policy (synlig org-mängd) + egen-org-policy för skrivning, en tabell i taget, gated av
// RLS-testharnesset (test/rls.test.js). settings är INTE med — dess PRIMARY KEY är redan
// (org_id, key) sedan ensureSettingsOrgIdColumn(), men frågevägarna (routes/settings.js) läser
// och skriver en explicit org_id-rad i taget snarare än att förlita sig på synlig-mängd-filtrering,
// och tas därför inte upp här förrän det arkitekturvalet är uttryckligen omprövat.
//
// VIKTIGT — detta är för närvarande en SCHEMA-ändring UTAN körtidseffekt i produktion: appens
// enda databasroll (`ledning`, satt via POSTGRES_USER i docker-compose.yml) är en Postgres
// SUPERUSER, och superusers kringgår RLS ovillkorligen oavsett policy (se db-anteckning i
// checkoutTenantClient, src/db.js). Policyerna nedan biter alltså inte förrän en separat,
// uttryckligen godkänd ändring inför en begränsad runtime-roll utan SUPERUSER/BYPASSRLS som inte
// äger tabellerna — se docs/multitenancy-forslag.md. Testdatabasen har redan en sådan roll
// (`ledning_app_test`, se test/migrate.js) så testerna verifierar policyerna på riktigt.
const RLS_TENANT_TABLES = [
  'features', 'alert_rules', 'alert_events', 'features_history', 'sms_senders', 'sms_tips',
  'news_sources', 'news_items', 'activity_log',
];

// Enskild tabell — delad av ensureRowLevelSecurity() (loopen nedan) OCH routes/analysis.js:s
// saveSnapshot(), som skapar analysis_snapshots lazy vid FÖRSTA analysögonblicket, alltså ofta
// EFTER att runMigrations() redan kört klart. Utan detta som en fristående, återanvändbar
// funktion skulle analysis_snapshots aldrig få RLS-policyer alls på en databas som seedas och
// kör sitt första analysögonblick inom samma process (precis vad testsviten gör).
async function applyRlsPolicies(table) {
  await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  await db.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

  await db.query(`DROP POLICY IF EXISTS ${table}_select_policy ON ${table}`);
  await db.query(`
    CREATE POLICY ${table}_select_policy ON ${table} FOR SELECT
      USING (org_id = ANY(NULLIF(current_setting('app.visible_org_ids', true), '')::int[]))
  `);

  await db.query(`DROP POLICY IF EXISTS ${table}_insert_policy ON ${table}`);
  await db.query(`
    CREATE POLICY ${table}_insert_policy ON ${table} FOR INSERT
      WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::int)
  `);

  await db.query(`DROP POLICY IF EXISTS ${table}_update_policy ON ${table}`);
  await db.query(`
    CREATE POLICY ${table}_update_policy ON ${table} FOR UPDATE
      USING (org_id = NULLIF(current_setting('app.org_id', true), '')::int)
      WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::int)
  `);

  await db.query(`DROP POLICY IF EXISTS ${table}_delete_policy ON ${table}`);
  await db.query(`
    CREATE POLICY ${table}_delete_policy ON ${table} FOR DELETE
      USING (org_id = NULLIF(current_setting('app.org_id', true), '')::int)
  `);
}

async function ensureRowLevelSecurity() {
  for (const table of RLS_TENANT_TABLES) {
    await applyRlsPolicies(table);
  }

  // analysis_snapshots skapas lazy (routes/analysis.js saveSnapshot()), inte här — kan alltså
  // saknas helt på en databas som aldrig kört ett analysögonblick än. to_regclass gör detta
  // ofarligt att köra vid varje omstart utan att anta att tabellen redan finns. Om tabellen
  // skapas SENARE (första analysögonblicket, efter att runMigrations() redan kört klart)
  // applicerar saveSnapshot() sina egna policyer direkt via samma applyRlsPolicies()) — se där.
  const { rows } = await db.query(`SELECT to_regclass('public.analysis_snapshots') AS exists`);
  if (rows[0].exists) await applyRlsPolicies('analysis_snapshots');

  console.log('RLS-policyer klara (mängdbaserad läsning, egen-org skrivning) — inert tills produktionsrollen inte längre är superuser');
}

// Multi-tenancy steg 9 — platform_admins är en HELT EGEN identitet, inte en rad i `users` och
// INTE org-scopad (ingen org_id, tas medvetet inte upp i RLS_TENANT_TABLES — en superadmin ska
// per definition kunna se/administrera ALLA organisationer, inte en enda). Separat tabell +
// separat JWT-hemlighet (se middleware/platformAdminAuth.js) håller detta helt frikopplat från
// den vanliga inloggningen — en vanlig användartoken ska aldrig av misstag kunna tolkas som en
// platform-admin-token, även om någon råkar återanvända fältnamn.
async function ensurePlatformAdminsSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('platform_admins-schema klart');
}

module.exports = {
  ensureSettingsAndMunicipalitiesSchema, ensureOrganizationsSchema, ensureFeaturesOrgIdColumn, ensureAlertOrgIdColumns,
  ensureFeaturesHistoryOrgIdColumn, ensureSmsOrgIdColumns, ensureNewsOrgIdColumns, ensureActivityLogOrgIdColumn,
  ensureSettingsOrgIdColumn,
  ensureAlertSchema, ensureIntelligenceReportsLayer, ensureRailwaySituationsLayer, ensureFeatureHistorySchema,
  ensureUserPreferencesColumn, ensureSmsTablesSchema, ensureLastLoginColumn,
  ensureNewsReportsLayer, ensureNewsSchema, ensureLocationPrecisionBackfill,
  ensureWeatherWarningsLayer, ensureNewsClassifierColumns, ensureNotificationColumns, ensureTakReportsLayer,
  ensureRowLevelSecurity, RLS_TENANT_TABLES, applyRlsPolicies,
  ensurePlatformAdminsSchema,
};
