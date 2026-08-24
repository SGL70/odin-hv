const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [totals, activity] = await Promise.all([
      req.db.query(`
        SELECT layer, COUNT(*) AS count,
          SUM((attributes->>'volume_l')::numeric) FILTER (WHERE layer='fuel') AS fuel_liters,
          SUM((attributes->>'weight_kg')::numeric) FILTER (WHERE layer='food') AS food_kg,
          SUM((attributes->>'capacity_m3')::numeric) FILTER (WHERE layer='water') AS water_m3
        FROM features GROUP BY layer ORDER BY layer
      `),
      req.db.query(`
        SELECT action, username, layer, feature_name, created_at
        FROM activity_log ORDER BY created_at DESC LIMIT 20
      `),
    ]);

    const alerts = await req.db.query(`
      SELECT uid, name, layer,
        (attributes->>'fill_pct')::numeric AS fill_pct
      FROM features
      WHERE layer='fuel' AND (attributes->>'fill_pct')::numeric < 30
      ORDER BY (attributes->>'fill_pct')::numeric ASC
    `);

    res.json({
      totals: totals.rows,
      alerts: alerts.rows,
      activity: activity.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
