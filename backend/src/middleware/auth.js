const jwt = require('jsonwebtoken');
const db = require('../db');
const { resolveVisibleOrgIds } = require('../services/orgContext');

// Multi-tenancy steg 5 — checkar ut en org-scopad DB-klient för hela requestens livstid direkt
// här (inte en separat middleware efter denna), så alla ~14 route-filer som redan gör
// `requireAuth` får `req.db` gratis utan att någonstans behöva lägga till ett andra
// middleware-anrop. Klienten släpps (RESET+release, se db.js) när svaret är klart — oavsett om
// det slutar med finish eller en avbruten anslutning (close) — annars läcker den ur poolen.
// RLS är inte påslaget än (steg 7), så det här ändrar inga query-resultat idag, bara vilken
// uppkoppling frågorna körs på.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Ej autentiserad' });

  let user;
  try {
    user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Ogiltig token' });
  }
  req.user = user;

  let tenantHandle, visibleOrgIds;
  try {
    visibleOrgIds = await resolveVisibleOrgIds(user.org_id);
    tenantHandle = await db.checkoutTenantClient({ orgId: user.org_id, visibleOrgIds });
  } catch (err) {
    return next(err);
  }
  req.db = tenantHandle.client;
  // Exponerat separat från req.db (som stängs när SVARET är klart) för rutter som medvetet svarar
  // tidigt och sedan fortsätter jobba i bakgrunden (t.ex. "started: true" + en fire-and-forget
  // skördning/larmutvärdering). De MÅSTE öppna en egen db.withTenant(req.tenant, ...)-scope för
  // det efterföljande arbetet — att återanvända req.db där är en race mot att den redan
  // återlämnats (RESET+release) till poolen och kan ha delats ut till en helt annan request.
  req.tenant = { orgId: user.org_id, visibleOrgIds };

  let closed = false;
  const closeTenant = () => {
    if (closed) return;
    closed = true;
    tenantHandle.release().catch(err => console.error('Tenant-anslutning kunde inte städas:', err.message));
  };
  res.on('finish', closeTenant);
  res.on('close', closeTenant);

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Otillräcklig behörighet' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
