// Dygnsrapport (Spår 2, docs/notifieringssystem-forslag.md) — en torr sammanfattning skickad
// till admin-rollen varje morgon kl 06:00 (se scheduleDailyReport() i index.js), i motsats till
// Spår 1:s interruptiva larm. E-post via Mailbox.org SMTP (samma uppgifter som redan finns i
// infrastrukturen, se .env SMTP_*). No-op (loggar bara) om ingen admin har e-post satt eller
// SMTP inte är konfigurerat — dygnsrapporten är ett tillägg, inget kritiskt beroende.

const nodemailer = require('nodemailer');

// Svenska visningsnamn för händelselager, samma som frontend/src/types.ts FEATURE_LAYERS.
const LAYER_LABELS = {
  road_situations: 'Trafikhändelser',
  power_outages: 'Elavbrott',
  police_events: 'Polishändelser',
  weather_warnings: 'Vädervarningar',
  railway_situations: 'Tågstörningar',
};

async function countByLayer(db, orgId) {
  const { rows } = await db.query(`
    SELECT layer, count(*)::int AS n FROM features
    WHERE layer IN ('road_situations','power_outages','police_events','weather_warnings','railway_situations')
      AND created_at > NOW() - INTERVAL '24 hours' AND org_id = $1
    GROUP BY layer ORDER BY layer
  `, [orgId]);
  return rows;
}

async function scoreTrend(db, orgId) {
  const { rows } = await db.query(`
    SELECT snapshot_date, SUM(score)::numeric(8,1) AS total
    FROM analysis_snapshots
    WHERE org_id = $1
    GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 2
  `, [orgId]);
  if (rows.length < 2) return null;
  const [today, yesterday] = rows;
  return { today: Number(today.total), yesterday: Number(yesterday.total), delta: Number(today.total) - Number(yesterday.total) };
}

async function openAlertCount(db, orgId) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM alert_events WHERE status = 'open' AND org_id = $1`, [orgId]);
  return rows[0].n;
}

async function newIntelReportsCount(db, orgId) {
  const { rows } = await db.query(`
    SELECT count(*)::int AS n FROM features
    WHERE layer = 'intelligence_reports' AND created_at > NOW() - INTERVAL '24 hours' AND org_id = $1
  `, [orgId]);
  return rows[0].n;
}

async function harvestHealth(db, orgId) {
  const { rows } = await db.query(`
    SELECT name, last_error, last_fetched_at FROM news_sources
    WHERE enabled = true AND org_id = $1 ORDER BY name
  `, [orgId]);
  return rows;
}

async function fetchReportData(db, orgId) {
  const [layerCounts, trend, openAlerts, newReports, sources] = await Promise.all([
    countByLayer(db, orgId), scoreTrend(db, orgId), openAlertCount(db, orgId), newIntelReportsCount(db, orgId), harvestHealth(db, orgId),
  ]);
  return { generatedAt: new Date(), layerCounts, trend, openAlerts, newReports, sources };
}

function buildReportContent(data) {
  const { generatedAt, layerCounts, trend, openAlerts, newReports, sources } = data;
  const lines = [`ODIN hv — Dygnsrapport ${generatedAt.toLocaleDateString('sv-SE')}`, ''];

  lines.push('Händelser senaste dygnet:');
  if (layerCounts.length === 0) lines.push('  Inga nya händelser.');
  for (const r of layerCounts) lines.push(`  ${LAYER_LABELS[r.layer] || r.layer}: ${r.n}`);
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

  lines.push('Skördestatus (nyhetskällor, endast Adminrollen):');
  for (const s of sources) {
    lines.push(`  ${s.name}: ${s.last_error ? 'FEL — ' + s.last_error : 'OK (' + (s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString('sv-SE') : 'aldrig') + ')'}`);
  }

  return lines.join('\n');
}

function formatDateline(date) {
  const s = date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSourceTimestamp(ts) {
  if (!ts) return 'aldrig';
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('sv-SE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const FONT_SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sectionWrap(labelHtml, bodyHtml, { withRule = true } = {}) {
  return `
    <tr><td style="padding:0 30px 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-family:${FONT_SANS};font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#2f5d6b;font-weight:600;margin-bottom:8px;">${labelHtml}</div>
      ${bodyHtml}
    </td></tr>
    ${withRule ? `<tr><td style="padding:0 30px;"><hr style="border:0;border-top:1px solid #d9dedb;margin:0 0 16px;" /></td></tr>` : ''}`;
}

function ledgerHtml(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${rows.map(([label, value], i) => `
      <tr>
        <td style="padding:4px 0;font-size:13px;font-family:${FONT_SANS};color:#1e2a32;${i > 0 ? 'border-top:1px solid #eceeec;' : ''}">${escapeHtml(label)}</td>
        <td style="padding:4px 0;font-size:13px;font-family:${FONT_MONO};color:#1e2a32;text-align:right;${i > 0 ? 'border-top:1px solid #eceeec;' : ''}">${escapeHtml(value)}</td>
      </tr>`).join('')}
  </table>`;
}

function buildReportHtml(data) {
  const { generatedAt, layerCounts, trend, openAlerts, newReports, sources } = data;

  const eventsBody = layerCounts.length === 0
    ? `<p style="margin:0;font-size:13.5px;font-family:${FONT_SANS};color:#1e2a32;">Inga nya händelser.</p>`
    : ledgerHtml(layerCounts.map((r) => [LAYER_LABELS[r.layer] || r.layer, String(r.n)]));

  const trendHtml = trend
    ? `<div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-family:${FONT_MONO};font-size:24px;font-variant-numeric:tabular-nums;color:#1e2a32;line-height:1;">${trend.today}</span>
        <span style="font-size:12px;font-weight:600;color:${trend.delta > 0 ? '#a3423a' : trend.delta < 0 ? '#3e7a52' : '#6b7680'};font-family:${FONT_SANS};">${trend.delta > 0 ? '↑ ökning' : trend.delta < 0 ? '↓ minskning' : '→ oförändrad'}</span>
      </div>
      <div style="font-size:12px;color:#6b7680;margin-top:3px;font-family:${FONT_SANS};">Summa OpOmr. Igår: ${trend.yesterday}.</div>`
    : `<p style="margin:0;font-size:13px;font-family:${FONT_SANS};color:#6b7680;">Otillräcklig historik för trend (kräver minst två sparade dygn).</p>`;

  const alertsBody = ledgerHtml([
    ['Öppna larm', String(openAlerts)],
    ['Nya underrättelserapporter', String(newReports)],
  ]);

  const sourcesBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${sources.map((s, i) => {
      const ok = !s.last_error;
      return `<tr>
        <td style="padding:5px 0;font-size:13px;font-family:${FONT_SANS};color:#1e2a32;${i > 0 ? 'border-top:1px solid #eceeec;' : ''}">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:7px;background:${ok ? '#3e7a52' : '#a3423a'};"></span>${escapeHtml(s.name)}
        </td>
        <td style="padding:5px 0;font-size:11px;font-family:${FONT_MONO};color:#6b7680;text-align:right;white-space:nowrap;${i > 0 ? 'border-top:1px solid #eceeec;' : ''}">
          <span style="font-weight:600;color:${ok ? '#3e7a52' : '#a3423a'};">${ok ? 'OK' : 'FEL'}</span> ${ok ? formatSourceTimestamp(s.last_fetched_at) : escapeHtml(s.last_error)}
        </td>
      </tr>`;
    }).join('')}
  </table>`;

  const sections = [
    sectionWrap('Händelser senaste dygnet', eventsBody),
    sectionWrap('Störningsscore', trendHtml),
    sectionWrap('Larm &amp; rapporter', alertsBody),
    sectionWrap(
      `<span>Skördestatus — nyhetskällor</span><span style="font-family:${FONT_MONO};font-size:9px;letter-spacing:.06em;color:#6b7680;border:1px solid #d9dedb;border-radius:2px;padding:1px 5px;text-transform:none;font-weight:500;">ENDAST ADMIN</span>`,
      sourcesBody,
      { withRule: false },
    ),
  ].join('');

  return `<!doctype html>
<html lang="sv">
<body style="margin:0;background:#eef0ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0ee;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fbfbf9;border-radius:3px;overflow:hidden;">
        <tr><td style="padding:26px 30px 0;">
          <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:.11em;color:#2f5d6b;text-transform:uppercase;">ODIN HV · SYSTEMRAPPORT</div>
          <div style="font-family:${FONT_SANS};font-weight:600;font-size:22px;line-height:1.15;margin:6px 0 2px;color:#1e2a32;">Dygnsrapport</div>
          <div style="font-family:${FONT_SANS};font-size:12.5px;color:#6b7680;">${formatDateline(generatedAt)}</div>
          <hr style="border:0;border-top:2px solid #1e2a32;margin:12px 0 14px;" />
        </td></tr>
        ${sections}
        <tr><td style="padding:12px 30px 14px;background:#f2f3f0;border-top:1px solid #d9dedb;">
          <p style="margin:0;font-family:${FONT_SANS};font-size:10.5px;color:#6b7680;line-height:1.5;">Automatiskt genererad av ODIN hv kl 06:00 · Endast till Adminrollen · Svara inte på detta meddelande.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

// db: en withTenant()-scopad klient för battalion.id (se scheduleDailyReport() i index.js, som
// loopar en rapport per bataljon via db.withEachBattalion — samma mönster som scheduleDailySnapshot).
async function sendDailyReport(db, orgId) {
  const transport = buildTransport();
  if (!transport) {
    console.log('Dygnsrapport: SMTP ej konfigurerat (SMTP_HOST/SMTP_USER/SMTP_PASS), hoppar över.');
    return;
  }
  const { rows } = await db.query(`SELECT email FROM users WHERE role = 'admin' AND org_id = $1 AND email IS NOT NULL AND email != ''`, [orgId]);
  if (!rows.length) {
    console.log('Dygnsrapport: ingen admin har e-post konfigurerad, hoppar över.');
    return;
  }
  const data = await fetchReportData(db, orgId);
  // Multi-tenancy steg 11 — org-scopad avsändaridentitet (settings-nyckeln `email_sender_name`),
  // INTE ett separat SMTP-konto per org (SMTP_USER/SMTP_PASS förblir delade, samma Gmail-konto).
  // Bara visningsnamnet i From-headern skiljer sig, så varje bataljon kan synas som avsändare av
  // sin egen dygnsrapport utan att äga en egen e-postbrevlåda.
  const senderRow = await db.query(`SELECT value FROM settings WHERE org_id = $1 AND key = 'email_sender_name'`, [orgId]);
  const senderName = typeof senderRow.rows[0]?.value === 'string' && senderRow.rows[0].value.trim() ? senderRow.rows[0].value.trim() : 'ODIN hv';
  await transport.sendMail({
    from: `"${senderName}" <${process.env.SMTP_USER}>`,
    to: rows.map(r => r.email).join(','),
    subject: `ODIN hv — Dygnsrapport ${data.generatedAt.toLocaleDateString('sv-SE')}`,
    text: buildReportContent(data),
    html: buildReportHtml(data),
  });
  console.log(`Dygnsrapport skickad till ${rows.length} mottagare.`);
}

module.exports = { buildReportContent, buildReportHtml, fetchReportData, sendDailyReport };
