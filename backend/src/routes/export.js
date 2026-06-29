const express = require('express');
const archiver = require('archiver');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function toKML(rows) {
  const placemarks = rows.map(r => {
    const geom = r.geom;
    let coords = '';
    if (geom.type === 'Point') coords = `<Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]},0</coordinates></Point>`;
    else if (geom.type === 'LineString') coords = `<LineString><coordinates>${geom.coordinates.map(c => c.join(',')).join(' ')}</coordinates></LineString>`;

    const desc = Object.entries(r.attributes || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    return `
    <Placemark>
      <name>${escXML(r.name)}</name>
      <description>${escXML(desc)}</description>
      <ExtendedData>
        <Data name="uid"><value>${r.uid}</value></Data>
        <Data name="layer"><value>${r.layer}</value></Data>
        <Data name="cot_type"><value>${r.cot_type}</value></Data>
      </ExtendedData>
      ${coords}
    </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Ledningssystem export ${new Date().toISOString()}</name>
${placemarks}
</Document>
</kml>`;
}

function escXML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

router.get('/geojson', requireAuth, async (req, res) => {
  const { layer } = req.query;
  const where = layer ? 'WHERE f.layer = $1' : '';
  const params = layer ? [layer] : [];
  const { rows } = await db.query(
    `SELECT f.uid, f.layer, f.cot_type, f.name, ST_AsGeoJSON(f.geom)::json AS geom, f.attributes
     FROM features f ${where}`, params
  );
  const geojson = {
    type: 'FeatureCollection',
    features: rows.map(r => ({
      type: 'Feature',
      id: r.uid,
      geometry: r.geom,
      properties: { uid: r.uid, layer: r.layer, cot_type: r.cot_type, name: r.name, ...r.attributes },
    })),
  };
  res.setHeader('Content-Disposition', `attachment; filename="ledning-${layer || 'alla'}.geojson"`);
  res.json(geojson);
});

router.get('/kmz', requireAuth, async (req, res) => {
  const { layer } = req.query;
  const where = layer ? 'WHERE f.layer = $1' : '';
  const params = layer ? [layer] : [];
  const { rows } = await db.query(
    `SELECT f.uid, f.layer, f.cot_type, f.name, ST_AsGeoJSON(f.geom)::json AS geom, f.attributes
     FROM features f ${where}`, params
  );

  res.setHeader('Content-Type', 'application/vnd.google-earth.kmz');
  res.setHeader('Content-Disposition', `attachment; filename="ledning-${layer || 'alla'}.kmz"`);

  const archive = archiver('zip');
  archive.pipe(res);
  archive.append(toKML(rows), { name: 'doc.kml' });
  archive.finalize();
});

router.get('/cot', requireAuth, async (req, res) => {
  const { layer } = req.query;
  const where = layer ? 'WHERE f.layer = $1' : '';
  const params = layer ? [layer] : [];
  const { rows } = await db.query(
    `SELECT f.uid, f.layer, f.cot_type, f.name, ST_AsGeoJSON(f.geom)::json AS geom, f.attributes, f.updated_at
     FROM features f ${where}`, params
  );

  const events = rows.filter(r => r.geom.type === 'Point').map(r => {
    const [lon, lat] = r.geom.coordinates;
    return `<event version="2.0" uid="${r.uid}" type="${r.cot_type}" time="${r.updated_at.toISOString()}" start="${r.updated_at.toISOString()}" stale="${new Date(Date.now()+3600000).toISOString()}" how="m-g">
  <point lat="${lat}" lon="${lon}" hae="0" ce="9999999" le="9999999"/>
  <detail><contact callsign="${escXML(r.name)}"/></detail>
</event>`;
  }).join('\n');

  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0"?>\n<events>\n${events}\n</events>`);
});

module.exports = router;
