const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { evaluateAlerts } = require('../services/alertEngine');

function afterHarvest(io) {
  evaluateAlerts(io).catch(err => console.error('Alert evaluation error:', err.message));
}

const router = express.Router();
const CONCURRENCY = 6;

// Active job cancellation controllers — keyed by source id
const activeJobs = new Map(); // source -> AbortController
const UA = 'curl/8.21.0';
const https = require('https');
const http  = require('http');

// Low-level HTTPS POST — avoids extra headers that Node fetch adds (Accept-Encoding etc.)
function httpsPost(url, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.from(body, 'utf8');
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
        'Accept': '*/*',
        'User-Agent': UA,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: () => Buffer.concat(chunks).toString(), json: () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(buf);
    req.end();
  });
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractJsonLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const d = JSON.parse(m[1].trim());
      return Array.isArray(d) ? d[0] : d;
    } catch {}
  }
  return null;
}

async function runBatched(items, fn, concurrency, onProgress) {
  const results = [];
  let done = 0;
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
      done++;
    }
    onProgress(done, items.length);
  }
  return results;
}

// ── OSM / Overpass ───────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  'http://overpass-api.de/api/interpreter',
  'http://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

const OSM_BRANDS = {
  'circle k': 'Circle K',
  'okq8':     'OKQ8',
  'preem':    'Preem',
  'st1':      'St1',
  'shell':    'St1',        // St1 operates Shell in Sweden
};

function normalizeBrand(raw = '') {
  const key = raw.toLowerCase().split(/[\s/]/)[0];
  return OSM_BRANDS[key] || raw;
}

async function osmFuelStations() {
  // Bounding box for Sweden (S,W,N,E) — avoids expensive area-lookup
  const query = `[out:json][timeout:90];
nwr["amenity"="fuel"]["brand"~"Circle K|OKQ8|Preem|St1",i](55.3,10.9,69.1,24.2);
out center;`;

  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await httpsPost(endpoint, `data=${encodeURIComponent(query)}`, 120000);
      if (res.status !== 200) {
        lastErr = new Error(`Overpass HTTP ${res.status}: ${res.text().slice(0, 200)}`);
        continue;
      }
      const json = res.json();
      if (!json.elements) { lastErr = new Error('Tomt svar från Overpass'); continue; }
      return buildOsmFeatures(json.elements);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Alla Overpass-noder misslyckades');
}

function buildOsmFeatures(elements) {
  return elements.map(e => {
    const tags = e.tags || {};
    const lat = e.type === 'node' ? e.lat : e.center?.lat;
    const lon = e.type === 'node' ? e.lon : e.center?.lon;
    if (!lat || !lon) return null;

    const brand = normalizeBrand(tags.brand || tags.name || '');
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const address = [street, tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(', ');
    const name = tags.name || `${brand} ${tags['addr:city'] || ''}`.trim();

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        layer: 'fuel',
        name,
        source: `OSM/${brand}`,
        brand,
        address: address || null,
        phone: tags.phone || tags['contact:phone'] || null,
        opening_hours: tags.opening_hours || null,
        osm_id: `${e.type}/${e.id}`,
        external_id: `${e.type}/${e.id}`,
        scraped_at: new Date().toISOString(),
      },
    };
  }).filter(Boolean);
}

// ── Skoogs Bränsle ───────────────────────────────────────────────────────────

const SKOOGS_PRODUCTS = {
  diesel_mk1: 'Diesel MK1', diesel_b7: 'Diesel B7',
  bensin_95: 'Bensin 95', bensin_98: 'Bensin 98', bensin_e10: 'Bensin E10',
  hvo100: 'HVO100', adblue: 'AdBlue',
};

async function skoogsFuelStations() {
  const html = await fetchHtml('https://skoogsbransle.se/tankstationer/');
  const raw = html.match(/data-location='([^']+)'/g) || [];
  return raw.map(attr => {
    try {
      const d = JSON.parse(attr.slice("data-location='".length, -1).replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      const lat = parseFloat(d.location?.lat);
      const lng = parseFloat(d.location?.lng);
      if (!lat || !lng) return null;
      const products = (d.products || []).map(p => SKOOGS_PRODUCTS[p] || p).join(', ');
      const addr = (d.location.address || '').replace(', Sverige', '').trim();
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          layer: 'fuel', name: d.post_title || 'Skoogs',
          source: 'Skoogs', brand: 'Skoogs Bränsle',
          address: addr || null,
          opening_hours: products || null,
          scraped_at: new Date().toISOString(),
        },
      };
    } catch { return null; }
  }).filter(Boolean);
}

// ── OKQ8 ─────────────────────────────────────────────────────────────────────

async function okq8Index() {
  const html = await fetchHtml('https://www.okq8.se/hitta-station/');
  const set = new Set(html.match(/https:\/\/www\.okq8\.se\/hitta-station\/[^/"]+\/[^"<\s]+/g) || []);
  return [...set];
}

async function okq8Station(url) {
  const html = await fetchHtml(url);
  const ld = extractJsonLd(html);
  if (!ld?.geo?.latitude) return null;

  const addr = ld.address || {};
  const addressStr = [addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean).join(', ');

  // Summarise opening hours
  const hours = Array.isArray(ld.openingHoursSpecification)
    ? ld.openingHoursSpecification.some(s => s.opens === '00:00' && s.closes === '23:59')
      ? '24h'
      : 'Se station'
    : null;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [parseFloat(ld.geo.longitude), parseFloat(ld.geo.latitude)] },
    properties: {
      layer: 'fuel',
      name: ld.name || url.split('/').slice(-2, -1)[0],
      source: 'OKQ8',
      address: addressStr || null,
      phone: ld.telephone || null,
      opening_hours: hours,
      station_url: url,
      external_id: url,
      scraped_at: new Date().toISOString(),
    },
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
  const dphi = (lat2 - lat1) * Math.PI / 180;
  const dlam = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// OKQ8 web data wins over OSM for matched stations (better phone/hours/address)
function mergeStations(osmFeatures, okq8WebFeatures, thresholdM = 150) {
  const osmOkq8  = osmFeatures.filter(f => (f.properties.brand || '').toUpperCase() === 'OKQ8');
  const osmOther = osmFeatures.filter(f => (f.properties.brand || '').toUpperCase() !== 'OKQ8');
  const merged   = [...osmOther];
  const usedIdx  = new Set();

  for (const web of okq8WebFeatures) {
    const [wLon, wLat] = web.geometry.coordinates;
    let bestIdx = -1, bestDist = thresholdM;
    for (let i = 0; i < osmOkq8.length; i++) {
      if (usedIdx.has(i)) continue;
      const [oLon, oLat] = osmOkq8[i].geometry.coordinates;
      const d = haversineMeters(wLat, wLon, oLat, oLon);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      usedIdx.add(bestIdx);
      merged.push({
        ...web,
        properties: { brand: 'OKQ8', ...web.properties, osm_id: osmOkq8[bestIdx].properties.osm_id },
      });
    } else {
      merged.push({ ...web, properties: { brand: 'OKQ8', ...web.properties } });
    }
  }
  // Keep OSM OKQ8 stations not matched to any web entry
  for (let i = 0; i < osmOkq8.length; i++) {
    if (!usedIdx.has(i)) merged.push(osmOkq8[i]);
  }
  return merged;
}

// ── Save to DB ────────────────────────────────────────────────────────────────

// Remove previously harvested features — optionally filtered by source prefix
// ABI sekvensneutralitet: flyttar rader till features_history i stället för att bara radera dem,
// så rådata finns kvar för framtida korrelation även efter att den ersatts av en nyare skördning.
async function archiveAndDelete(whereSql, params, reason) {
  await db.query(
    `INSERT INTO features_history (uid, layer, cot_type, name, geom, attributes, created_at, updated_at, archived_reason)
     SELECT uid, layer, cot_type, name, geom, attributes, created_at, updated_at, $${params.length + 1}
     FROM features WHERE ${whereSql}`,
    [...params, reason],
  );
  await db.query(`DELETE FROM features WHERE ${whereSql}`, params);
}

// Läser upp uid/kritikalitet/visningsnamn för rader som är på väg att raderas av clearHarvested(),
// så saveFeatures() kan återanvända samma uid och bevara användarsatta fält vid omskördning i
// stället för att varje körning skapar helt nya rader (se roadmap "Persistent identitet vid skördning").
async function captureIdentity(layer, sourcePattern = null) {
  const conditions = [`layer = $1`, `(attributes->>'scraped_at') IS NOT NULL`, `attributes ? 'external_id'`];
  const params = [layer];
  if (sourcePattern) { params.push(sourcePattern); conditions.push(`attributes->>'source' ILIKE $2`); }
  const { rows } = await db.query(
    `SELECT attributes->>'external_id' AS external_id, uid,
            attributes->>'criticality' AS criticality, attributes->>'display_name' AS display_name
     FROM features WHERE ${conditions.join(' AND ')}`,
    params,
  );
  const map = new Map();
  for (const r of rows) map.set(r.external_id, { uid: r.uid, criticality: r.criticality, display_name: r.display_name });
  return map;
}

async function clearHarvested(layer, sourcePattern = null) {
  if (sourcePattern) {
    await archiveAndDelete(
      `layer = $1 AND (attributes->>'scraped_at') IS NOT NULL AND attributes->>'source' ILIKE $2`,
      [layer, sourcePattern],
      'harvest_refresh',
    );
  } else {
    await archiveAndDelete(
      `layer = $1 AND (attributes->>'scraped_at') IS NOT NULL`,
      [layer],
      'harvest_refresh',
    );
  }
}

// ABI georeference to discover: källorna har redan verklig händelsetid men under olika nycklar
// per lager (start_time/scheduled_time/measured_at/datetime). Normaliserar till en gemensam
// attributes.occurred_at så tvärlager-tidskorrelation (relaterade objekt, historik) inte behöver
// känna till varje lagers egen vokabulär. scraped_at (ingestionstid) används bara som sista utväg.
function deriveOccurredAt(attrs) {
  return attrs.start_time || attrs.scheduled_time || attrs.measured_at || attrs.datetime || attrs.scraped_at || new Date().toISOString();
}

async function saveFeatures(features, userId, identityMap = null) {
  let imported = 0, skipped = 0;
  for (const f of features) {
    const { layer, name, ...attrs } = f.properties;
    if (!layer || !name || !f.geometry) { skipped++; continue; }
    if (!attrs.occurred_at) attrs.occurred_at = deriveOccurredAt(attrs);

    const identity = identityMap && attrs.external_id != null
      ? identityMap.get(String(attrs.external_id))
      : null;
    if (identity) {
      if (identity.criticality != null) attrs.criticality = identity.criticality;
      if (identity.display_name != null) attrs.display_name = identity.display_name;
    }

    try {
      const result = identity
        ? await db.query(
            `INSERT INTO features (uid, layer, name, geom, cot_type, attributes, created_by, updated_by)
             VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), 'b-m-p-s-p', $5, $6, $6)
             ON CONFLICT DO NOTHING`,
            [identity.uid, layer, name, JSON.stringify(f.geometry), attrs, userId]
          )
        : await db.query(
            `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
             VALUES ($1, $2, ST_GeomFromGeoJSON($3), 'b-m-p-s-p', $4, $5, $5)
             ON CONFLICT DO NOTHING`,
            [layer, name, JSON.stringify(f.geometry), attrs, userId]
          );
      imported += result.rowCount || 0;
      if ((result.rowCount || 0) === 0) skipped++;
    } catch { skipped++; }
  }
  return { imported, skipped };
}

// ── Trafikverket — delade hjälpfunktioner ────────────────────────────────────

const TRV_HARVEST_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

async function trvQuery(objecttype, schemaversion, filter, include, limit = 500, namespace = '', datex = false) {
  const key = datex ? process.env.TRAFIKVERKET_DATEX_KEY : process.env.TRAFIKVERKET_API_KEY;
  const nsAttr = namespace ? ` namespace="${namespace}"` : '';
  const xml = `<REQUEST>
  <LOGIN authenticationkey="${key}"/>
  <QUERY objecttype="${objecttype}"${nsAttr} schemaversion="${schemaversion}" limit="${limit}">
    <FILTER>${filter}</FILTER>
    ${include ? `<INCLUDE>${include}</INCLUDE>` : ''}
  </QUERY>
</REQUEST>`;
  const res = await fetch(TRV_HARVEST_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml,
    signal: AbortSignal.timeout(25000),
  });
  const json = await res.json();
  return json?.RESPONSE?.RESULT?.[0]?.[objecttype] || [];
}

function trvBbox(field, b) {
  return `<WITHIN name="${field}" shape="box" value="${b.minlng} ${b.minlat}, ${b.maxlng} ${b.maxlat}"/>`;
}

function parseTrvWKT(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const s = wkt.trim().replace(/\b(LINESTRING|MULTILINESTRING)\s+Z\s+/i, '$1 ');
  const pt = s.match(/^POINT\s*\(\s*([^\s)]+)\s+([^\s)]+)/i);
  if (pt) return { type: 'Point', coordinates: [parseFloat(pt[1]), parseFloat(pt[2])] };
  const ls = s.match(/^LINESTRING\s*\(([^)]+)\)/i);
  if (ls) return { type: 'LineString', coordinates: ls[1].split(',').map(p => p.trim().split(/\s+/).slice(0,2).map(Number)) };
  const mls = s.match(/^MULTILINESTRING\s*\((.+)\)\s*$/i);
  if (mls) {
    const rings = mls[1].match(/\(([^)]+)\)/g) || [];
    return { type: 'MultiLineString', coordinates: rings.map(r => r.replace(/[()]/g,'').trim().split(',').map(p => p.trim().split(/\s+/).map(Number))) };
  }
  return null;
}

async function getOpOmrBbox() {
  const { rows } = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
  const munis = rows[0]?.value || [];
  if (!munis.length) throw new Error('Inga OpOmr-kommuner konfigurerade');
  const r = await db.query(
    `SELECT ST_XMin(e) as minlng, ST_YMin(e) as minlat, ST_XMax(e) as maxlng, ST_YMax(e) as maxlat
     FROM (SELECT ST_Extent(geom) as e FROM municipalities WHERE short_name = ANY($1)) sub`,
    [munis]
  );
  return r.rows[0];
}

async function fetchTrvCameras(bbox) {
  const now = new Date().toISOString();
  const items = await trvQuery('Camera', '1', trvBbox('Geometry.WGS84', bbox), 'Id,Name,Type,Direction,Status,PhotoUrl,Geometry');
  return items.map(c => ({
    type: 'Feature', geometry: parseTrvWKT(c?.Geometry?.WGS84),
    properties: { layer: 'cameras', name: c.Name || c.Id, source: 'Trafikverket/Camera',
      external_id: c.Id || undefined,
      camera_type: c.Type || 'Trafikkamera', owner: 'Trafikverket',
      direction: c.Direction ?? null, status: c.Status || 'Operativ',
      photo_url: c.PhotoUrl || null, scraped_at: now },
  })).filter(f => f.geometry);
}

async function fetchTrvAtk(bbox) {
  const now = new Date().toISOString();
  const items = await trvQuery('TrafficSafetyCamera', '1', trvBbox('Geometry.WGS84', bbox), 'Id,Name,RoadNumber,Bearing,Geometry');
  return items.map(c => ({
    type: 'Feature', geometry: parseTrvWKT(c?.Geometry?.WGS84),
    properties: { layer: 'cameras', name: c.Name || `ATK ${c.RoadNumber || c.Id}`, source: 'Trafikverket/ATK',
      external_id: c.Id || undefined,
      camera_type: 'ATK/Fartkamera', owner: 'Trafikverket',
      direction: c.Bearing ?? null, scraped_at: now },
  })).filter(f => f.geometry);
}

async function fetchTrvRoads(bbox) {
  const now = new Date().toISOString();
  const BK_TON = { 'BK 1': 10, 'BK 2': 10, 'BK 3': 8, 'BK 4': 6, 'Undantag': null };
  const items = await trvQuery('Bärighet', '1.2', trvBbox('Geometry.WKT-WGS84-3D', bbox),
    'GID,Bärighetsklass,Bärighetsklass_vinterperiod,Geometry', 500, 'vägdata.nvdb_dk_o');
  return items.map(r => {
    const geom = parseTrvWKT(r?.Geometry?.['WKT-WGS84-3D']);
    if (!geom) return null;
    const bk = r.Bärighetsklass || 'BK 1';
    return { type: 'Feature', geometry: geom,
      properties: { layer: 'roads', name: bk, source: 'Trafikverket/NVDB',
        external_id: r.GID != null ? String(r.GID) : undefined,
        bk_class: bk, bk_winter: r.Bärighetsklass_vinterperiod || null,
        max_axle_ton: BK_TON[bk] ?? null, scraped_at: now } };
  }).filter(Boolean);
}

async function fetchTrvFerries(bbox) {
  const now = new Date().toISOString();
  const items = await trvQuery('Färjeled', '1.2', trvBbox('Geometry.WKT-WGS84-3D', bbox),
    'GID,Färjeledsnamn,Geometry', 200, 'vägdata.nvdb_dk_o');
  return items.map(f => ({
    type: 'Feature', geometry: parseTrvWKT(f?.Geometry?.['WKT-WGS84-3D']),
    properties: { layer: 'ports', name: f.Färjeledsnamn || `Färjeled ${f.GID}`,
      source: 'Trafikverket/NVDB', external_id: f.GID != null ? String(f.GID) : undefined,
      port_type: 'Färjeled', scraped_at: now },
  })).filter(f => f.geometry);
}

async function fetchTrvTraffic(bbox) {
  const now = new Date().toISOString();
  const SIDE = { northBound: 'N', southBound: 'S', eastBound: 'Ö', westBound: 'V', anyDirection: '' };
  const items = await trvQuery('TrafficFlow', '1.5', trvBbox('Geometry.WGS84', bbox),
    'SiteId,AverageVehicleSpeed,VehicleFlowRate,VehicleType,MeasurementSide,MeasurementTime,Geometry', 500, '', true);
  const bysite = {};
  for (const r of items) if (!bysite[r.SiteId] || r.VehicleType === 'anyVehicle') bysite[r.SiteId] = r;
  return Object.values(bysite).map(r => {
    const geom = parseTrvWKT(r?.Geometry?.WGS84);
    if (!geom) return null;
    const speed = r.AverageVehicleSpeed != null ? Math.round(r.AverageVehicleSpeed) : null;
    const dir   = SIDE[r.MeasurementSide] ?? '';
    return { type: 'Feature', geometry: geom,
      properties: { layer: 'roads', name: speed != null ? `${speed} km/h${dir ? ' '+dir : ''}` : `Mätpunkt ${r.SiteId}`,
        source: 'Trafikverket/Traffic', external_id: r.SiteId != null ? String(r.SiteId) : undefined,
        avg_speed_kmh: speed,
        flow_per_hour: r.VehicleFlowRate != null ? Math.round(r.VehicleFlowRate) : null,
        measured_at: r.MeasurementTime || null, scraped_at: now } };
  }).filter(Boolean);
}

function makeTrvScrapeRoute(sourceId, fetchFn, layer, clearPattern) {
  router.get(`/${sourceId}/preview`, requireAuth, async (_req, res) => {
    try {
      const bbox = await getOpOmrBbox();
      const features = await fetchFn(bbox);
      res.json({ source: sourceId, total: features.length });
    } catch (err) { res.status(502).json({ error: err.message }); }
  });

  router.post(`/${sourceId}/scrape`, requireAuth, requireRole('editor', 'admin'), async (req, res) => {
    const ctrl = startJob(sourceId);
    res.json({ started: true });
    const io = req.io;
    io.emit('harvest:progress', { source: sourceId, phase: 'Hämtar från Trafikverket…', done: 0, total: 1 });
    try {
      if (ctrl.signal.aborted) throw cancelledError(sourceId);
      const bbox = await getOpOmrBbox();
      const features = await fetchFn(bbox);
      if (ctrl.signal.aborted) throw cancelledError(sourceId);
      io.emit('harvest:progress', { source: sourceId, phase: 'Sparar…', done: 1, total: 1 });
      const identityMap = await captureIdentity(layer, clearPattern);
      await clearHarvested(layer, clearPattern);
      const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
      io.emit('harvest:done', { source: sourceId, imported, skipped });
      if (imported > 0) io.emit('features:reloaded', {});
      afterHarvest(io);
    } catch (err) {
      io.emit('harvest:done', { source: sourceId, imported: 0, skipped: 0, error: err.message });
    } finally { activeJobs.delete(sourceId); }
  });
}

makeTrvScrapeRoute('trv-cameras', fetchTrvCameras, 'cameras', 'Trafikverket/Camera');
makeTrvScrapeRoute('trv-atk',     fetchTrvAtk,     'cameras', 'Trafikverket/ATK');
makeTrvScrapeRoute('trv-roads',   fetchTrvRoads,   'roads',   'Trafikverket/NVDB');
makeTrvScrapeRoute('trv-ferries', fetchTrvFerries, 'ports',   'Trafikverket/NVDB');
makeTrvScrapeRoute('trv-traffic', fetchTrvTraffic, 'roads',   'Trafikverket/Traffic');

// ── Broar (OSM Overpass) ──────────────────────────────────────────────────────

async function fetchBridges() {
  const query = `[out:json][timeout:90];
way["bridge"="yes"]["highway"](65.0,17.0,68.5,24.5);
out center tags qt;`;

  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await httpsPost(endpoint, `data=${encodeURIComponent(query)}`, 120000);
      if (res.status !== 200) { lastErr = new Error(`Overpass HTTP ${res.status}`); continue; }
      const json = res.json();
      if (!json.elements) { lastErr = new Error('Tomt svar från Overpass'); continue; }
      return buildBridgeFeatures(json.elements);
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('Alla Overpass-noder misslyckades');
}

function buildBridgeFeatures(elements) {
  return elements.map(e => {
    const tags = e.tags || {};
    const lat = e.center?.lat ?? e.lat;
    const lon = e.center?.lon ?? e.lon;
    if (!lat || !lon) return null;

    const roadRef = tags.ref || tags.int_ref || '';
    const name = tags['bridge:name'] || tags.name || (roadRef ? `Bro ${roadRef}` : 'Bro');

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        layer: 'bridges',
        name,
        source: 'OSM',
        highway: tags.highway || '',
        road_ref: roadRef,
        maxweight: tags.maxweight || null,
        maxaxleload: tags.maxaxleload || null,
        osm_id: `way/${e.id}`,
        external_id: `way/${e.id}`,
        scraped_at: new Date().toISOString(),
      },
    };
  }).filter(Boolean);
}

// ── Polishändelser ────────────────────────────────────────────────────────────

// Kommuncentroider för Norrbottens kommuner (WGS84 lon,lat)
// Används för att ge händelser bättre GPS än länscentroid
const MUNI_COORDS = {
  'luleå':       [22.1567, 65.5842],
  'kalix':       [23.1618, 65.8534],
  'boden':       [21.6835, 65.8247],
  'piteå':       [21.5000, 65.3167],
  'älvsbyn':     [21.0036, 65.6792],
  'överkalix':   [22.8292, 66.3397],
  'övertorneå':  [23.6667, 66.3833],
  'haparanda':   [24.1167, 65.8333],
  'kiruna':      [20.2253, 67.8558],
  'gällivare':   [20.6667, 67.1333],
  'jokkmokk':    [19.8167, 66.6000],
  'arvidsjaur':  [19.1667, 65.5833],
  'arjeplog':    [17.8833, 66.0500],
  'pajala':      [23.3667, 67.2167],
};

function resolveCoords(eventName, fallbackLat, fallbackLon) {
  const lower = (eventName || '').toLowerCase();
  for (const [muni, coords] of Object.entries(MUNI_COORDS)) {
    if (lower.includes(muni)) return coords;
  }
  return [fallbackLon, fallbackLat];
}

async function policeEvents(municipalities) {
  const res = await fetch('https://polisen.se/api/events', {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Polisen HTTP ${res.status}`);
  const events = await res.json();

  const muniLower = municipalities.map(m => m.toLowerCase());

  return events
    .filter(e => {
      const loc = (e.location?.name || '').toLowerCase();
      const title = (e.name || '').toLowerCase();
      return muniLower.some(m => loc.includes(m) || title.includes(m));
    })
    .map(e => {
      const [fallbackLat, fallbackLon] = (e.location?.gps || '0,0').split(',').map(Number);
      if (!fallbackLat || !fallbackLon) return null;
      const [lon, lat] = resolveCoords(e.name, fallbackLat, fallbackLon);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          layer: 'police_events',
          name: e.name,
          event_type: e.type,
          datetime: e.datetime,
          summary: e.summary || '',
          location: e.location?.name || '',
          url: `https://polisen.se${e.url}`,
          source: 'Polisen',
          police_id: String(e.id),
          external_id: e.id != null ? String(e.id) : undefined,
          scraped_at: new Date().toISOString(),
        },
      };
    })
    .filter(Boolean);
}

// ── Trafikhändelser (Trafikverket Situation API) ──────────────────────────────

const TRV_SIT_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

function parseWKT2D(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const s = wkt.trim();
  const pt = s.match(/^POINT\s*\(\s*([^\s)]+)\s+([^\s)]+)/i);
  if (pt) return { type: 'Point', coordinates: [parseFloat(pt[1]), parseFloat(pt[2])] };
  const ls = s.replace(/\b(LINESTRING)\s+Z\s+/i, 'LINESTRING ').match(/^LINESTRING\s*\(([^)]+)\)/i);
  if (ls) return { type: 'LineString', coordinates: ls[1].split(',').map(p => p.trim().split(/\s+/).slice(0,2).map(Number)) };
  return null;
}

const SIT_TYPE_SV = {
  'Olycka': 'Olycka', 'Vägarbete': 'Vägarbete', 'Hinder': 'Hinder',
  'LaneRestrictions': 'Körfältsrestriktion', 'WeatherCondition': 'Väglag',
  'BridgeRestriction': 'Brobegränsning', 'TrafficInformation': 'Trafikinformation',
  'IcyRoad': 'Halka', 'Restriktion': 'Restriktion', 'DangerousSlowdown': 'Farlig köbildning',
};

async function fetchSituations(bbox) {
  const xml = `<REQUEST>
  <LOGIN authenticationkey="${process.env.TRAFIKVERKET_API_KEY}"/>
  <QUERY objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6" limit="500">
    <FILTER>
      ${trvBbox('Deviation.Geometry.WGS84', bbox)}
    </FILTER>
  </QUERY>
</REQUEST>`;

  const res = await fetch(TRV_SIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = json?.RESPONSE?.RESULT?.[0]?.ERROR;
    throw new Error(`TRV Situation HTTP ${res.status}: ${err?.MESSAGE || err?.SOURCE || JSON.stringify(err)}`);
  }
  return json?.RESPONSE?.RESULT?.[0]?.Situation || [];
}

function buildSituationFeatures(situations) {
  const features = [];
  for (const s of situations) {
    const devs = Array.isArray(s.Deviation) ? s.Deviation : s.Deviation ? [s.Deviation] : [];
    for (const d of devs) {
      const geom = parseWKT2D(d?.Geometry?.WGS84);
      if (!geom) continue;
      const typeSv = SIT_TYPE_SV[d.MessageType] || d.MessageType || 'Trafikhändelse';
      const name = d.Header || `${typeSv}${d.RoadNumber ? ' ' + d.RoadNumber : ''}`;
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          layer: 'road_situations',
          name,
          event_type: typeSv,
          severity: d.SeverityCode != null ? String(d.SeverityCode) : '',
          start_time: d.StartTime || '',
          end_time:   d.EndTime   || '',
          road_number: d.RoadNumber || '',
          description: d.Message || '',
          source: 'Trafikverket',
          scraped_at: new Date().toISOString(),
        },
      });
    }
  }
  return features;
}

router.get('/situations/preview', requireAuth, async (_req, res) => {
  try {
    const bbox = await getOpOmrBbox();
    const sits = await fetchSituations(bbox);
    const features = buildSituationFeatures(sits);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/situations/scrape', requireAuth, async (req, res) => {
  const ctrl = startJob('situations');
  const io = req.io;
  io.emit('harvest:progress', { source: 'situations', phase: 'Hämtar från Trafikverket…', done: 0, total: 1 });
  try {
    if (ctrl.signal.aborted) throw new Error('Avbrutet');
    const bbox = await getOpOmrBbox();
    const sits = await fetchSituations(bbox);
    const features = buildSituationFeatures(sits);
    // Purge closed situations and stale data older than 4h (arkiveras, raderas inte)
    await archiveAndDelete(
      `layer = 'road_situations' AND (
        (attributes->>'end_time' <> '' AND (attributes->>'end_time')::timestamptz < NOW()) OR
        (attributes->>'scraped_at')::timestamptz < NOW() - INTERVAL '4 hours'
      )`,
      [],
      'ttl_expired',
    );
    const identityMap = await captureIdentity('road_situations', null);
    await clearHarvested('road_situations');
    io.emit('harvest:progress', { source: 'situations', phase: 'Sparar…', done: 1, total: 1 });
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'situations', imported, skipped });
    io.emit('features:reloaded', {});
    afterHarvest(io);
    res.json({ imported, skipped });
  } catch (err) {
    io.emit('harvest:done', { source: 'situations', imported: 0, skipped: 0, error: err.message });
    res.status(500).json({ error: err.message });
  } finally { activeJobs.delete('situations'); }
});

// ── Tågstörningar (Trafikverket TrainStation + TrainAnnouncement) ────────────
// TrainMessage-objektet finns inte i TRV:s API (verifierat live) — bygger istället på
// TrainAnnouncement (avgångs-/ankomstposter per station) + TrainStation (stationskoordinater).
// OBS: Norrbottens avlånga form gör att den vanliga bbox-rektangel-metoden (trvBbox/getOpOmrBbox)
// fångar nästan hela länets stationer (118 av 122 testat) — här görs istället en riktig
// polygonkoll (ST_Contains) mot municipalities, vilket gav 64 relevanta stationer i samma test.

const NORRBOTTEN_COUNTY_NO = 25;

async function fetchOpOmrRailwayStations() {
  const opomrRow = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
  const munis = opomrRow.rows[0]?.value || [];
  if (!munis.length) throw new Error('Inga OpOmr-kommuner konfigurerade');

  const items = await trvQuery('TrainStation', '1.4', `<EQ name="CountyNo" value="${NORRBOTTEN_COUNTY_NO}"/>`, 'LocationSignature,AdvertisedLocationName,Geometry', 500);
  const parsed = items.map(s => {
    const m = s.Geometry?.WGS84?.match(/POINT \(([\d.]+) ([\d.]+)\)/);
    return m ? { sig: s.LocationSignature, name: s.AdvertisedLocationName, lng: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
  }).filter(Boolean);

  const { rows } = await db.query(`
    SELECT st.sig, st.name, st.lng, st.lat, m.short_name AS municipality
    FROM jsonb_to_recordset($1::jsonb) AS st(sig text, name text, lng float, lat float)
    JOIN municipalities m ON ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(st.lng, st.lat), 4326))
    WHERE m.short_name = ANY($2)
  `, [JSON.stringify(parsed), munis]);
  return rows;
}

async function fetchRailwayAnnouncements(stations) {
  if (!stations.length) return [];
  const now = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const in48h = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const locFilter = `<OR>${stations.map(s => `<EQ name="LocationSignature" value="${s.sig}"/>`).join('')}</OR>`;
  const filter = `<AND>${locFilter}<GT name="AdvertisedTimeAtLocation" value="${now}"/><LT name="AdvertisedTimeAtLocation" value="${in48h}"/></AND>`;
  const anns = await trvQuery('TrainAnnouncement', '1.6', filter, 'ActivityType,AdvertisedTimeAtLocation,AdvertisedTrainIdent,Canceled,Deviation,LocationSignature,Operator', 500);
  return anns.filter(a => (a.Deviation && a.Deviation.length) || a.Canceled);
}

function buildRailwayFeatures(announcements, stations) {
  const stationBySig = Object.fromEntries(stations.map(s => [s.sig, s]));
  const features = [];
  for (const a of announcements) {
    const st = stationBySig[a.LocationSignature];
    if (!st) continue;
    const devText = (a.Deviation || []).map(d => d.Description).join(', ');
    const externalId = a.AdvertisedTrainIdent && a.LocationSignature && a.AdvertisedTimeAtLocation
      ? `${a.AdvertisedTrainIdent}:${a.LocationSignature}:${a.AdvertisedTimeAtLocation}`
      : undefined;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [st.lng, st.lat] },
      properties: {
        layer: 'railway_situations',
        name: `${a.Canceled ? 'Inställt tåg' : 'Tågstörning'} vid ${st.name}`,
        external_id: externalId,
        event_type: devText || (a.Canceled ? 'Inställt' : 'Störning'),
        activity_type: a.ActivityType || '',
        scheduled_time: a.AdvertisedTimeAtLocation || '',
        train_ident: a.AdvertisedTrainIdent || '',
        canceled: a.Canceled ? 'Ja' : 'Nej',
        operator: a.Operator || '',
        description: devText,
        source: 'Trafikverket',
        scraped_at: new Date().toISOString(),
      },
    });
  }
  return features;
}

router.get('/railway-situations/preview', requireAuth, async (_req, res) => {
  try {
    const stations = await fetchOpOmrRailwayStations();
    const anns = await fetchRailwayAnnouncements(stations);
    const features = buildRailwayFeatures(anns, stations);
    res.json({ count: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/railway-situations/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('railway-situations');
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'railway-situations', phase: 'Hämtar från Trafikverket…', done: 0, total: 1 });
  try {
    if (ctrl.signal.aborted) throw cancelledError('railway-situations');
    const stations = await fetchOpOmrRailwayStations();
    const anns = await fetchRailwayAnnouncements(stations);
    const features = buildRailwayFeatures(anns, stations);
    if (ctrl.signal.aborted) throw cancelledError('railway-situations');
    io.emit('harvest:progress', { source: 'railway-situations', phase: 'Sparar…', done: 1, total: 1 });
    const identityMap = await captureIdentity('railway_situations', null);
    await clearHarvested('railway_situations');
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'railway-situations', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'railway-situations', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('railway-situations'); }
});

router.get('/bridges/preview', requireAuth, async (_req, res) => {
  try {
    const features = await fetchBridges();
    res.json({ source: 'bridges', total: features.length, sample: features.slice(0, 3) });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.post('/bridges/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('bridges');
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'bridges', phase: 'Hämtar från OSM…', done: 0, total: 1 });
  try {
    if (ctrl.signal.aborted) throw cancelledError('bridges');
    const features = await fetchBridges();
    if (ctrl.signal.aborted) throw cancelledError('bridges');
    io.emit('harvest:progress', { source: 'bridges', phase: 'Sparar…', done: 1, total: 1 });
    const identityMap = await captureIdentity('bridges', null);
    await clearHarvested('bridges');
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'bridges', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'bridges', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('bridges'); }
});

// ── Routes ────────────────────────────────────────────────────────────────────

function startJob(source) {
  activeJobs.get(source)?.abort();
  const ctrl = new AbortController();
  activeJobs.set(source, ctrl);
  return ctrl;
}

function cancelledError(source) {
  return new Error(`Skördning avbruten (${source})`);
}

// GET /api/harvest/status — last scraped_at per source, derived from features table
router.get('/status', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        CASE
          WHEN layer = 'fuel' AND attributes->>'source' ILIKE 'OSM%' THEN 'osm'
          WHEN layer = 'fuel' AND attributes->>'source' = 'OKQ8'     THEN 'okq8'
          WHEN layer = 'fuel' AND attributes->>'source' = 'Skoogs'   THEN 'skoogs'
          WHEN layer = 'police_events'   THEN 'police'
          WHEN layer = 'road_situations' THEN 'situations'
          WHEN layer = 'power_outages'   THEN 'power'
          WHEN layer = 'bridges'         THEN 'bridges'
          WHEN layer = 'cameras' AND attributes->>'source' = 'Trafikverket/Camera'  THEN 'trv-cameras'
          WHEN layer = 'cameras' AND attributes->>'source' = 'Trafikverket/ATK'     THEN 'trv-atk'
          WHEN layer = 'roads'   AND attributes->>'source' = 'Trafikverket/NVDB'    THEN 'trv-roads'
          WHEN layer = 'roads'   AND attributes->>'source' = 'Trafikverket/Traffic' THEN 'trv-traffic'
          WHEN layer = 'ports'   AND attributes->>'source' = 'Trafikverket/NVDB'    THEN 'trv-ferries'
        END AS src,
        MAX(attributes->>'scraped_at') AS last_at
      FROM features
      WHERE attributes->>'scraped_at' IS NOT NULL
      GROUP BY 1
    `);
    const status = {};
    for (const r of rows) if (r.src) status[r.src] = r.last_at;
    const times = [status.osm, status.okq8, status.skoogs].filter(Boolean);
    if (times.length > 0) status.combined = times.sort()[0];
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/harvest/:source/cancel
router.post('/:source/cancel', requireAuth, (req, res) => {
  const ctrl = activeJobs.get(req.params.source);
  if (ctrl) { ctrl.abort(); activeJobs.delete(req.params.source); }
  res.json({ cancelled: !!ctrl });
});

// GET /api/harvest/osm/preview
router.get('/osm/preview', requireAuth, async (_req, res) => {
  res.json({ source: 'OSM', total: '~1 600', brands: ['Circle K', 'OKQ8', 'Preem', 'St1'], note: 'En förfrågan, ~60 s' });
});

// POST /api/harvest/osm/scrape
router.post('/osm/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('osm');
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'osm', done: 0, total: 1 });
  try {
    if (ctrl.signal.aborted) throw cancelledError('osm');
    const features = await osmFuelStations();
    if (ctrl.signal.aborted) throw cancelledError('osm');
    io.emit('harvest:progress', { source: 'osm', done: features.length, total: features.length });
    const identityMap = await captureIdentity('fuel', 'OSM%');
    await clearHarvested('fuel', 'OSM%');
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'osm', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'osm', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('osm'); }
});

// GET /api/harvest/okq8/preview
router.get('/okq8/preview', requireAuth, async (_req, res) => {
  try {
    const urls = await okq8Index();
    res.json({ source: 'OKQ8', total: urls.length, sample: urls.slice(0, 3) });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// POST /api/harvest/okq8/scrape
router.post('/okq8/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('okq8');
  let urls;
  try {
    urls = await okq8Index();
  } catch (err) {
    return res.status(502).json({ error: 'Kunde inte hämta stationsindex: ' + err.message });
  }
  res.json({ started: true, total: urls.length });
  const io = req.io;
  io.emit('harvest:progress', { source: 'okq8', done: 0, total: urls.length });
  try {
    const features = await runBatched(urls, okq8Station, CONCURRENCY,
      (done, total) => {
        if (ctrl.signal.aborted) throw cancelledError('okq8');
        io.emit('harvest:progress', { source: 'okq8', done, total });
      });
    const identityMap = await captureIdentity('fuel', 'OKQ8');
    await clearHarvested('fuel', 'OKQ8');
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'okq8', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'okq8', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('okq8'); }
});

// GET /api/harvest/skoogs/preview
router.get('/skoogs/preview', requireAuth, async (_req, res) => {
  try {
    const html = await fetchHtml('https://skoogsbransle.se/tankstationer/');
    const count = (html.match(/data-location='/g) || []).length;
    res.json({ source: 'Skoogs', total: count, note: 'Ett anrop, allt inbakat i HTML, <5 s' });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// POST /api/harvest/skoogs/scrape
router.post('/skoogs/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('skoogs');
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'skoogs', phase: 'Skoogs Bränsle…', done: 0, total: 1 });
  try {
    if (ctrl.signal.aborted) throw cancelledError('skoogs');
    const features = await skoogsFuelStations();
    io.emit('harvest:progress', { source: 'skoogs', phase: 'Skoogs Bränsle…', done: 1, total: 1 });
    const identityMap = await captureIdentity('fuel', 'Skoogs');
    await clearHarvested('fuel', 'Skoogs');
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'skoogs', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'skoogs', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('skoogs'); }
});

// GET /api/harvest/combined/preview
router.get('/combined/preview', requireAuth, (_req, res) => {
  res.json({ source: 'combined', total: 2300, brands: ['Circle K (~340)', 'OKQ8 (~882 webb)', 'Preem (~430)', 'St1 (~370)', 'Skoogs (~293)'], note: 'OSM + OKQ8 webb + Skoogs, dubbletter tas bort, ~90–120 s' });
});

// POST /api/harvest/combined/scrape
router.post('/combined/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('combined');
  res.json({ started: true });
  const io = req.io;

  const aborted = () => ctrl.signal.aborted;
  const checkAbort = (phase) => { if (aborted()) throw cancelledError(phase); };

  try {
    // Phase 1: OSM
    io.emit('harvest:progress', { source: 'combined', phase: 'Hämtar OSM…', done: 0, total: 1 });
    checkAbort('OSM');
    const osmFeatures = await osmFuelStations();
    checkAbort('OSM');
    io.emit('harvest:progress', { source: 'combined', phase: 'Hämtar OSM…', done: 1, total: 1 });

    // Phase 2: OKQ8 web
    const urls = await okq8Index();
    checkAbort('OKQ8');
    io.emit('harvest:progress', { source: 'combined', phase: 'OKQ8 webb', done: 0, total: urls.length });
    const okq8Features = await runBatched(urls, okq8Station, CONCURRENCY, (done, total) => {
      checkAbort('OKQ8');
      io.emit('harvest:progress', { source: 'combined', phase: 'OKQ8 webb', done, total });
    });

    // Phase 3: Skoogs
    checkAbort('Skoogs');
    io.emit('harvest:progress', { source: 'combined', phase: 'Skoogs Bränsle…', done: 0, total: 1 });
    let skoogsFeatures = [];
    try { skoogsFeatures = await skoogsFuelStations(); } catch { /* non-fatal */ }
    checkAbort('Skoogs');
    io.emit('harvest:progress', { source: 'combined', phase: 'Skoogs Bränsle…', done: 1, total: 1 });

    // Phase 4: Merge + save
    io.emit('harvest:progress', { source: 'combined', phase: 'Sammanfogar…', done: 0, total: 1 });
    const merged = [...mergeStations(osmFeatures, okq8Features), ...skoogsFeatures];
    io.emit('harvest:progress', { source: 'combined', phase: 'Sparar till karta…', done: 0, total: 1 });
    const identityMap = await captureIdentity('fuel', null);
    await clearHarvested('fuel');
    const { imported, skipped } = await saveFeatures(merged, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'combined', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'combined', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('combined'); }
});

// ── Polishändelser routes ────────────────────────────────────────────────────

router.get('/police/preview', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
    const municipalities = rows[0]?.value || [];
    const r = await fetch('https://polisen.se/api/events', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const all = await r.json();
    const muniLower = municipalities.map(m => m.toLowerCase());
    const filtered = all.filter(e => {
      const loc = (e.location?.name || '').toLowerCase();
      const title = (e.name || '').toLowerCase();
      return muniLower.some(m => loc.includes(m) || title.includes(m));
    });
    res.json({ source: 'police', total: filtered.length, of: all.length, municipalities });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.post('/police/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const ctrl = startJob('police');
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'police', phase: 'Hämtar händelser…', done: 0, total: 1 });
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key='op_municipalities'");
    const municipalities = rows[0]?.value || [];
    if (ctrl.signal.aborted) throw cancelledError('police');

    const features = await policeEvents(municipalities);
    if (ctrl.signal.aborted) throw cancelledError('police');

    // Purge events older than 30 days (arkiveras, raderas inte)
    await archiveAndDelete(
      `layer='police_events' AND (attributes->>'scraped_at')::timestamptz < NOW() - INTERVAL '30 days'`,
      [],
      'ttl_expired',
    );
    // Clear previous harvest of same events (matchning mot police_id via external_id, se captureIdentity)
    const identityMap = await captureIdentity('police_events', null);
    await clearHarvested('police_events');
    io.emit('harvest:progress', { source: 'police', phase: 'Sparar…', done: 1, total: 1 });
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'police', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
  } catch (err) {
    io.emit('harvest:done', { source: 'police', imported: 0, skipped: 0, error: err.message });
  } finally { activeJobs.delete('police'); }
});

// ── EL-AVBROTT (avbrott.se) ────────────────────────────────────────────────────
// Covers 27 Swedish grid operators incl. Vattenfall (inland BD) + PiteEnergi
const AVBROTT_URL = 'https://avbrott.se/api/outages';
// Norrbotten bounding box
const BD_LAT = [65.0, 68.5];
const BD_LNG = [17.0, 24.5];

function inNorrbotten(o) {
  const county = (o.county || '').toLowerCase();
  if (county.includes('norrbotten')) return true;
  // Providers that don't set county — fall back to coordinates
  if (o.lat && o.lng) {
    return o.lat >= BD_LAT[0] && o.lat <= BD_LAT[1] &&
           o.lng >= BD_LNG[0] && o.lng <= BD_LNG[1];
  }
  return false;
}

async function fetchPowerOutages() {
  const res = await fetch(AVBROTT_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`avbrott.se HTTP ${res.status}`);
  const data = await res.json();
  const now = new Date().toISOString();

  return (data.outages || [])
    .filter(o => !o.is_ended && inNorrbotten(o))
    .map(o => {
      let geom;
      if (o.has_polygon && Array.isArray(o.polygon) && o.polygon.length >= 3) {
        const coords = o.polygon.map(([lng, lat]) => [lng, lat]);
        // Close ring if needed
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
        geom = { type: 'Polygon', coordinates: [coords] };
      } else if (o.lat && o.lng) {
        geom = { type: 'Point', coordinates: [o.lng, o.lat] };
      } else {
        return null;
      }

      const label = o.is_planned ? 'Planerat avbrott' : 'Elavbrott';
      return {
        type: 'Feature', geometry: geom,
        properties: {
          layer: 'power_outages',
          name: `${label}${o.municipality ? ' – ' + o.municipality : ''}${o.placenames && o.placenames !== o.municipality ? ' (' + o.placenames + ')' : ''}`,
          provider: o.provider || '',
          municipality: o.municipality || '',
          affected_customers: o.affected_customers != null ? String(o.affected_customers) : '',
          status: o.status_label || '',
          description: o.free_text || o.description || '',
          is_planned: o.is_planned ? 'true' : 'false',
          start_time: o.start_time || '',
          completion_time: o.completion_time || '',
          source: 'avbrott.se',
          scraped_at: now,
          _source_id: o.id || '',
          external_id: o.id ? String(o.id) : undefined,
        },
      };
    })
    .filter(Boolean);
}

router.get('/power/preview', requireAuth, async (_req, res) => {
  try {
    const features = await fetchPowerOutages();
    res.json({ source: 'power', total: features.length, features });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/power/scrape', requireAuth, async (req, res) => {
  const ctrl = startJob('power');
  const io = req.io;
  io.emit('harvest:progress', { source: 'power', phase: 'Hämtar från avbrott.se…', done: 0, total: 1 });
  try {
    const features = await fetchPowerOutages();
    if (ctrl.signal.aborted) throw cancelledError('power');
    const identityMap = await captureIdentity('power_outages', null);
    await clearHarvested('power_outages');
    io.emit('harvest:progress', { source: 'power', phase: 'Sparar…', done: 1, total: 1 });
    const { imported, skipped } = await saveFeatures(features, req.user?.id || 0, identityMap);
    io.emit('harvest:done', { source: 'power', imported, skipped });
    if (imported > 0) io.emit('features:reloaded', {});
    afterHarvest(io);
    res.json({ imported, skipped });
  } catch (err) {
    io.emit('harvest:done', { source: 'power', imported: 0, skipped: 0, error: err.message });
    res.status(502).json({ error: err.message });
  } finally { activeJobs.delete('power'); }
});

module.exports = router;
