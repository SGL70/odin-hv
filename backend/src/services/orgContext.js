const db = require('../db');

// Multi-tenancy steg 3 (docs/multitenancy-forslag.md) — källan för vilken organisation en ny rad
// hör till vid skrivning: den skrivande användarens egen org, eller Standardbataljon för
// systeminitierade skrivningar (schemalagd skördning — userId 0 per redan existerande konvention
// i harvest.js, se runAutoHarvest — och 46elks-webhooken i sms.js som saknar en inloggad
// användare helt). org_id finns numera även i JWT:t (steg 4) för läsning av req.user.org_id direkt,
// men denna slår alltid upp den skrivande radens org_id i DB — enda korrekta källan vid skrivning.
async function resolveOrgId(userId) {
  if (userId) {
    const { rows } = await db.query('SELECT org_id FROM users WHERE id = $1', [userId]);
    if (rows[0]) return rows[0].org_id;
  }
  const { rows } = await db.query(`SELECT id FROM organizations WHERE slug = 'default'`);
  return rows[0].id;
}

// Multi-tenancy steg 4 — den "synliga org-mängden" en användare får LÄSA (inte skriva i, se
// docs/multitenancy-forslag.md arkitekturpunkt 2): en bataljonsanvändare ser bara sin egen org;
// en militärregion-användare ser sig själv plus alla bataljoner med parent_org_id satt till den.
// Platt query räcker eftersom hierarkin bara är två nivåer djup i dagsläget (se öppen fråga i
// planen om vad som krävs — en rekursiv CTE — om ett tredje steg någonsin läggs till).
async function resolveVisibleOrgIds(orgId) {
  const { rows } = await db.query(
    'SELECT id FROM organizations WHERE id = $1 OR parent_org_id = $1',
    [orgId]
  );
  return rows.map(r => r.id);
}

module.exports = { resolveOrgId, resolveVisibleOrgIds };
