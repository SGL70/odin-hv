const db = require('../db');

// Delad mellan tips-taggning (SMS + nyheter) — returnerar null om kommunen saknar
// geometri i municipalities-tabellen (bara Norrbottens 14 kommuner har det just nu).
async function resolveMunicipalityCentroid(municipality) {
  const { rows } = await db.query(
    `SELECT ST_Y(ST_Centroid(geom)) as lat, ST_X(ST_Centroid(geom)) as lng FROM municipalities WHERE short_name = $1`,
    [municipality]
  );
  return rows[0] || null;
}

module.exports = { resolveMunicipalityCentroid };
