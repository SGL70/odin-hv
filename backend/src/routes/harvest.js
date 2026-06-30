const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const CONCURRENCY = 6;
const UA = 'Mozilla/5.0 (compatible; ResurslageScraper/1.0; +https://github.com/SGL70/resurslage)';

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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

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
  const query = `[out:json][timeout:60];
area["ISO3166-1"="SE"][admin_level=2]->.s;
nwr["amenity"="fuel"]["brand"~"Circle K|OKQ8|Preem|St1",i](area.s);
out center;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();

  return (json.elements || []).map(e => {
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

// Remove all previously harvested features for a layer (preserves manually entered ones)
async function clearHarvested(layer) {
  await db.query(
    `DELETE FROM features WHERE layer = $1 AND (attributes->>'scraped_at') IS NOT NULL`,
    [layer],
  );
}

async function saveFeatures(features, userId) {
  let imported = 0, skipped = 0;
  for (const f of features) {
    const { layer, name, ...attrs } = f.properties;
    if (!layer || !name || !f.geometry) { skipped++; continue; }
    try {
      const result = await db.query(
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

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/harvest/osm/preview
router.get('/osm/preview', requireAuth, async (_req, res) => {
  res.json({
    source: 'OSM',
    total: '~1 600',
    brands: ['Circle K', 'OKQ8', 'Preem', 'St1'],
    note: 'En förfrågan, alla varumärken, ~60 s',
  });
});

// POST /api/harvest/osm/scrape — fetch all fuel stations from OpenStreetMap
router.post('/osm/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  res.json({ started: true, total: 1619 });
  const io = req.io;
  io.emit('harvest:progress', { source: 'osm', done: 0, total: 1619 });

  let features;
  try {
    features = await osmFuelStations();
  } catch (err) {
    io.emit('harvest:done', { source: 'osm', imported: 0, skipped: 0, error: err.message });
    return;
  }

  io.emit('harvest:progress', { source: 'osm', done: features.length, total: features.length });

  const { imported, skipped } = await saveFeatures(features, req.user?.id || 0);
  io.emit('harvest:done', { source: 'osm', imported, skipped });
  if (imported > 0) io.emit('features:reloaded', {});
});

// GET /api/harvest/okq8/preview — returns count (fast, single request)
router.get('/okq8/preview', requireAuth, async (_req, res) => {
  try {
    const urls = await okq8Index();
    res.json({ source: 'OKQ8', total: urls.length, sample: urls.slice(0, 3) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/harvest/okq8/scrape — scrapes all stations, streams progress via socket
router.post('/okq8/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  let urls;
  try {
    urls = await okq8Index();
  } catch (err) {
    return res.status(502).json({ error: 'Kunde inte hämta stationsindex: ' + err.message });
  }

  // Respond immediately so client isn't stuck waiting
  res.json({ started: true, total: urls.length });

  const io = req.io;
  io.emit('harvest:progress', { source: 'okq8', done: 0, total: urls.length });

  const features = await runBatched(
    urls,
    okq8Station,
    CONCURRENCY,
    (done, total) => io.emit('harvest:progress', { source: 'okq8', done, total }),
  );

  const { imported, skipped } = await saveFeatures(features, req.user?.id || 0);
  io.emit('harvest:done', { source: 'okq8', imported, skipped });
  if (imported > 0) io.emit('features:reloaded', {});
});

// GET /api/harvest/skoogs/preview
router.get('/skoogs/preview', requireAuth, async (_req, res) => {
  try {
    const html = await fetchHtml('https://skoogsbransle.se/tankstationer/');
    const count = (html.match(/data-location="/g) || []).length;
    res.json({ source: 'Skoogs', total: count, note: 'Ett anrop, allt inbakat i HTML, <5 s' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/harvest/skoogs/scrape
router.post('/skoogs/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  res.json({ started: true });
  const io = req.io;
  io.emit('harvest:progress', { source: 'skoogs', phase: 'Skoogs Bränsle…', done: 0, total: 1 });
  let features;
  try {
    features = await skoogsFuelStations();
  } catch (err) {
    io.emit('harvest:done', { source: 'skoogs', imported: 0, skipped: 0, error: err.message });
    return;
  }
  io.emit('harvest:progress', { source: 'skoogs', phase: 'Skoogs Bränsle…', done: 1, total: 1 });
  const { imported, skipped } = await saveFeatures(features, req.user?.id || 0);
  io.emit('harvest:done', { source: 'skoogs', imported, skipped });
  if (imported > 0) io.emit('features:reloaded', {});
});

// GET /api/harvest/combined/preview
router.get('/combined/preview', requireAuth, (_req, res) => {
  res.json({
    source: 'combined',
    total: 2300,
    brands: ['Circle K (~340)', 'OKQ8 (~882 webb)', 'Preem (~430)', 'St1 (~370)', 'Skoogs (~293)'],
    note: 'OSM + OKQ8 webb + Skoogs, dubbletter tas bort, ~90–120 s',
  });
});

// POST /api/harvest/combined/scrape — OSM base + OKQ8 web, deduplicated by proximity
router.post('/combined/scrape', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  res.json({ started: true });
  const io = req.io;

  // Phase 1: OSM
  io.emit('harvest:progress', { source: 'combined', phase: 'Hämtar OSM…', done: 0, total: 1 });
  let osmFeatures;
  try {
    osmFeatures = await osmFuelStations();
  } catch (err) {
    io.emit('harvest:done', { source: 'combined', imported: 0, skipped: 0, error: err.message });
    return;
  }
  io.emit('harvest:progress', { source: 'combined', phase: 'Hämtar OSM…', done: 1, total: 1 });

  // Phase 2: OKQ8 web
  let urls;
  try {
    urls = await okq8Index();
  } catch (err) {
    io.emit('harvest:done', { source: 'combined', imported: 0, skipped: 0, error: err.message });
    return;
  }
  io.emit('harvest:progress', { source: 'combined', phase: 'OKQ8 webb', done: 0, total: urls.length });
  const okq8Features = await runBatched(
    urls, okq8Station, CONCURRENCY,
    (done, total) => io.emit('harvest:progress', { source: 'combined', phase: 'OKQ8 webb', done, total }),
  );

  // Phase 3: Skoogs (single fetch)
  io.emit('harvest:progress', { source: 'combined', phase: 'Skoogs Bränsle…', done: 0, total: 1 });
  let skoogsFeatures = [];
  try {
    skoogsFeatures = await skoogsFuelStations();
  } catch { /* non-fatal */ }
  io.emit('harvest:progress', { source: 'combined', phase: 'Skoogs Bränsle…', done: 1, total: 1 });

  // Phase 4: Merge OSM + OKQ8 (deduplicated), then append Skoogs
  io.emit('harvest:progress', { source: 'combined', phase: 'Sammanfogar…', done: 0, total: 1 });
  const merged = [...mergeStations(osmFeatures, okq8Features), ...skoogsFeatures];
  io.emit('harvest:progress', { source: 'combined', phase: 'Sammanfogar…', done: 1, total: 1 });

  // Phase 4: Clear old harvested data + save
  io.emit('harvest:progress', { source: 'combined', phase: 'Sparar till karta…', done: 0, total: 1 });
  await clearHarvested('fuel');
  const { imported, skipped } = await saveFeatures(merged, req.user?.id || 0);

  io.emit('harvest:done', { source: 'combined', imported, skipped });
  if (imported > 0) io.emit('features:reloaded', {});
});

module.exports = router;
