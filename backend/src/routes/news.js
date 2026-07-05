const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolveMunicipalityCentroid } = require('../services/geo');
const { discoverFeedUrl, pollAllSources } = require('../services/newsFeeds');

const router = express.Router();

// ── Nyhetskällor — administration (Inställningar) ───────────────────────────

router.get('/sources', requireAuth, requireRole('editor', 'admin'), async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM news_sources ORDER BY name');
  res.json(rows);
});

router.post('/sources', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, url } = req.body;
  if (!name?.trim() || !url?.trim()) return res.status(400).json({ error: 'Ange namn och URL' });

  let feedUrl = null, lastError = null;
  try {
    feedUrl = await discoverFeedUrl(url.trim());
    if (!feedUrl) lastError = 'Ingen RSS/Atom-feed hittades — kräver riktad skrapning (ej stött ännu)';
  } catch (err) {
    lastError = err.message;
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO news_sources (name, site_url, feed_url, last_error, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), url.trim(), feedUrl, lastError, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/sources/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, url, enabled } = req.body;
  const existing = (await db.query('SELECT * FROM news_sources WHERE id = $1', [id])).rows[0];
  if (!existing) return res.status(404).json({ error: 'Källan hittades inte' });

  let feedUrl = existing.feed_url;
  let siteUrl = existing.site_url;
  let lastError = existing.last_error;
  if (url && url.trim() !== existing.site_url) {
    siteUrl = url.trim();
    try {
      feedUrl = await discoverFeedUrl(siteUrl);
      lastError = feedUrl ? null : 'Ingen RSS/Atom-feed hittades — kräver riktad skrapning (ej stött ännu)';
    } catch (err) {
      feedUrl = null;
      lastError = err.message;
    }
  }

  try {
    const { rows } = await db.query(
      `UPDATE news_sources SET name = $1, site_url = $2, feed_url = $3, last_error = $4, enabled = $5 WHERE id = $6 RETURNING *`,
      [name?.trim() || existing.name, siteUrl, feedUrl, lastError, enabled ?? existing.enabled, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sources/:id/discover', requireAuth, requireRole('admin'), async (req, res) => {
  const existing = (await db.query('SELECT * FROM news_sources WHERE id = $1', [req.params.id])).rows[0];
  if (!existing) return res.status(404).json({ error: 'Källan hittades inte' });
  try {
    const feedUrl = await discoverFeedUrl(existing.site_url);
    const lastError = feedUrl ? null : 'Ingen RSS/Atom-feed hittades — kräver riktad skrapning (ej stött ännu)';
    const { rows } = await db.query(
      `UPDATE news_sources SET feed_url = $1, last_error = $2 WHERE id = $3 RETURNING *`,
      [feedUrl, lastError, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    await db.query(`UPDATE news_sources SET last_error = $1 WHERE id = $2`, [err.message, req.params.id]);
    res.status(502).json({ error: err.message });
  }
});

router.delete('/sources/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.query('DELETE FROM news_sources WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/poll', requireAuth, requireRole('admin'), async (req, res) => {
  await pollAllSources(req.io);
  res.json({ ok: true });
});

// ── Nyhetsposter — granskningsinkorg innan de blir kartobjekt ───────────────

router.get('/items', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await db.query(
    `SELECT ni.*, ns.name as source_name FROM news_items ni
     JOIN news_sources ns ON ns.id = ni.source_id
     WHERE ni.status = $1 ORDER BY COALESCE(ni.published_at, ni.fetched_at) DESC LIMIT 200`,
    [status]
  );
  res.json(rows);
});

router.post('/items/:id/tag', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { municipality, area, lat, lng } = req.body;
  try {
    const itemRes = await db.query(
      `SELECT ni.*, ns.name as source_name FROM news_items ni JOIN news_sources ns ON ns.id = ni.source_id
       WHERE ni.id = $1 AND ni.status = 'pending'`,
      [id]
    );
    const item = itemRes.rows[0];
    if (!item) return res.status(404).json({ error: 'Nyhetsposten hittades inte eller är redan hanterad' });

    let finalLat = lat, finalLng = lng;
    if (finalLat == null || finalLng == null) {
      if (!municipality) return res.status(400).json({ error: 'Ange kommun eller koordinater' });
      const centroid = await resolveMunicipalityCentroid(municipality);
      if (!centroid) return res.status(400).json({ error: 'Kommunen saknar kartdata — ange plats manuellt på kartan' });
      finalLat = centroid.lat;
      finalLng = centroid.lng;
    }

    const featureRes = await db.query(
      `INSERT INTO features (layer, name, geom, cot_type, attributes, created_by, updated_by)
       VALUES ('news_reports', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), 'b-m-p-s-p', $4, $5, $5)
       RETURNING uid`,
      [
        item.title.slice(0, 120), finalLng, finalLat,
        {
          description: item.summary, link: item.link, area: area || null, municipality: municipality || null,
          published_at: item.published_at, source: item.source_name,
        },
        req.user.id,
      ]
    );

    await db.query(`UPDATE news_items SET status = 'tagged', tagged_feature_uid = $1 WHERE id = $2`, [featureRes.rows[0].uid, id]);

    req.io?.emit('features:reloaded', {});
    res.json({ ok: true, feature_uid: featureRes.rows[0].uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items/:id/discard', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  await db.query(`UPDATE news_items SET status = 'discarded' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// "Slasken" — kastade poster raderas aldrig, bara flyttas ur inkorgen. Går att återställa
// härifrån om en tidigare bortvald rubrik visar sig vara relevant efter allt.
router.post('/items/:id/restore', requireAuth, requireRole('editor', 'admin'), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE news_items SET status = 'pending' WHERE id = $1 AND status = 'discarded' RETURNING id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Hittades inte i Slasken' });
  res.json({ ok: true });
});

module.exports = router;
