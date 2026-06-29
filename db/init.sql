CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'editor' CHECK (role IN ('reader', 'editor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE features (
  uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  layer VARCHAR(50) NOT NULL CHECK (layer IN ('fuel','food','water','raw_materials','vehicles','roads','bridges')),
  cot_type VARCHAR(50) DEFAULT 'b-m-p-s-p',
  name VARCHAR(200) NOT NULL,
  geom GEOMETRY(GEOMETRY, 4326) NOT NULL,
  attributes JSONB DEFAULT '{}',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX features_layer_idx ON features(layer);
CREATE INDEX features_geom_idx ON features USING GIST(geom);

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(50),
  action VARCHAR(20) CHECK (action IN ('create','update','delete')),
  feature_uid UUID,
  layer VARCHAR(50),
  feature_name VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER features_updated_at
  BEFORE UPDATE ON features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
