// Dygnsrapport (Spår 2, docs/notifieringssystem-forslag.md) — en torr sammanfattning skickad
// till admin-rollen varje morgon kl 06:00 (se scheduleDailyReport() i index.js), i motsats till
// Spår 1:s interruptiva larm. E-post via Mailbox.org SMTP (samma uppgifter som redan finns i
// infrastrukturen, se .env SMTP_*). No-op (loggar bara) om ingen admin har e-post satt eller
// SMTP inte är konfigurerat — dygnsrapporten är ett tillägg, inget kritiskt beroende.

const nodemailer = require('nodemailer');
const db = require('../db');
const analysisRouter = require('../routes/analysis');

async function countByLayer() {
  const { rows } = await db.query(`
    SELECT layer, count(*)::int AS n FROM features
    WHERE layer IN ('road_situations','power_outages','police_events','weather_warnings','railway_situations')
      AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY layer ORDER BY layer
  `);
  return rows;
}

async function scoreTrend() {
  const { rows } = await db.query(`
    SELECT snapshot_date, SUM(score)::numeric(8,1) AS total
    FROM analysis_snapshots
    GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 2
  `);
  if (rows.length < 2) return null;
  const [today, yesterday] = rows;
  return { today: Number(today.total), yesterday: Number(yesterday.total), delta: Number(today.total) - Number(yesterday.total) };
}

async function openAlertCount() {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM alert_events WHERE status = 'open'`);
  return rows[0].n;
}

async function newIntelReportsCount() {
  const { rows } = await db.query(`
    SELECT count(*)::int AS n FROM features
    WHERE layer = 'intelligence_reports' AND created_at > NOW() - INTERVAL '24 hours'
  `);
  return rows[0].n;
}

async function harvestHealth() {
  const { rows } = await db.query(`
    SELECT name, last_error, last_fetched_at FROM news_sources
    WHERE enabled = true ORDER BY name
  `);
  return rows;
}

async function buildReportContent() {
  const [layerCounts, trend, openAlerts, newReports, sources] = await Promise.all([
    countByLayer(), scoreTrend(), openAlertCount(), newIntelReportsCount(), harvestHealth(),
  ]);

  const lines = [`ODIN hv — Dygnsrapport ${new Date().toLocaleDateString('sv-SE')}`, ''];

  lines.push('Händelser senaste dygnet:');
  if (layerCounts.length === 0) lines.push('  Inga nya händelser.');
  for (const r of layerCounts) lines.push(`  ${r.layer}: ${r.n}`);
  lines.push('');

  if (trend) {
    const arrow = trend.delta > 0 ? '↑' : trend.delta < 0 ? '↓' : '→';
    lines.push(`Störningsscore (summa OpOmr): ${trend.today} ${arrow} (igår: ${trend.yesterday})`);
  } else {
    lines.push('Störningsscore: otillräcklig historik för trend (kräver minst två sparade dygn).');
  }
  lines.push('');

  lines.push(`Öppna larm: ${openAlerts}`);
  lines.push(`Nya underrättelserapporter: ${newReports}`);
  lines.push('');

  lines.push('Skördestatus (nyhetskällor):');
  for (const s of sources) {
    lines.push(`  ${s.name}: ${s.last_error ? 'FEL — ' + s.last_error : 'OK (' + (s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString('sv-SE') : 'aldrig') + ')'}`);
  }

  return lines.join('\n');
}

function buildTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendDailyReport() {
  const transport = buildTransport();
  if (!transport) {
    console.log('Dygnsrapport: SMTP ej konfigurerat (SMTP_HOST/SMTP_USER/SMTP_PASS), hoppar över.');
    return;
  }
  const { rows } = await db.query(`SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL AND email != ''`);
  if (!rows.length) {
    console.log('Dygnsrapport: ingen admin har e-post konfigurerad, hoppar över.');
    return;
  }
  const content = await buildReportContent();
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: rows.map(r => r.email).join(','),
    subject: `ODIN hv — Dygnsrapport ${new Date().toLocaleDateString('sv-SE')}`,
    text: content,
  });
  console.log(`Dygnsrapport skickad till ${rows.length} mottagare.`);
}

module.exports = { buildReportContent, sendDailyReport };
