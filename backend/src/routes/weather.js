const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// SMHI bytte 2026-03-31 ut pmp3g mot snow1g (samma öppna, nyckelfria punktprognos-API, nytt
// kategorinamn och platta läsbara parameternamn i data.json). Ingen version 2, bara version 1.
const SMHI_FORECAST_URL = 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point';

// Cache i minnet — SMHI publicerar en ny prognos per timme, ingen anledning att slå mot deras
// API oftare än så även om panelen öppnas upprepade gånger för samma trakt.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // "lat,lng" (avrundat) -> { at, data }

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

router.get('/forecast', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng krävs' });
  }

  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const url = `${SMHI_FORECAST_URL}/lon/${lng}/lat/${lat}/data.json`;
    const smhiRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!smhiRes.ok) throw new Error(`SMHI HTTP ${smhiRes.status}`);
    const raw = await smhiRes.json();

    const hourly = (raw.timeSeries || []).slice(0, 13).map(ts => ({
      time: ts.time,
      temperature: ts.data.air_temperature ?? null,
      wind_direction: ts.data.wind_from_direction ?? null,
      wind_speed: ts.data.wind_speed ?? null,
      wind_gust: ts.data.wind_speed_of_gust ?? null,
      precipitation_mm: ts.data.precipitation_amount_mean ?? null,
      precipitation_probability: ts.data.probability_of_precipitation ?? null,
    }));

    const data = {
      lat, lng,
      grid_point: raw.geometry?.coordinates || null,
      reference_time: raw.referenceTime || null,
      current: hourly[0] || null,
      hourly,
    };

    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
