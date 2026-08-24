const jwt = require('jsonwebtoken');
const db = require('../db');

// Multi-tenancy steg 9 (docs/multitenancy-forslag.md) — helt separat auth-kodväg från
// requireAuth (middleware/auth.js). Egen JWT-hemlighet (PLATFORM_ADMIN_JWT_SECRET) — INTE samma
// som JWT_SECRET — så en vanlig användartoken kan aldrig av misstag verifieras här, oavsett vilka
// fält den råkar innehålla. req.platformDb pekar mot db.js:s egen platformPool (se den filens
// kommentar), aldrig den org-scopade req.db/req.tenant som resten av appen använder — en platform
// admin ska se tvärs alla organisationer, inte en enda.
async function requirePlatformAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Ej autentiserad' });

  let claims;
  try {
    claims = jwt.verify(header.slice(7), process.env.PLATFORM_ADMIN_JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Ogiltig token' });
  }
  if (claims.type !== 'platform_admin') return res.status(401).json({ error: 'Ogiltig token' });

  req.platformAdmin = { id: claims.id, username: claims.username };
  req.platformDb = db.platformPool;
  next();
}

module.exports = { requirePlatformAdmin };
