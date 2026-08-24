const express = require('express');

const router = express.Router();

// Publikt (ingen requireAuth) — bara en bool, inget känsligt, och behövs innan/oberoende av
// inloggning eftersom AuthContext läser den vid appstart. Styrs av FEATURE_CRITICAL_ALERTS i
// docker-compose.yml — sätt till 'true' och starta om backend-containern för att slå på.
router.get('/', (_req, res) => {
  res.json({ criticalAlertsEnabled: process.env.FEATURE_CRITICAL_ALERTS === 'true' });
});

module.exports = router;
