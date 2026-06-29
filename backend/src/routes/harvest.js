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

// ── Save to DB ────────────────────────────────────────────────────────────────

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

module.exports = router;
