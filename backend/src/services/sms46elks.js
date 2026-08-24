// Utgående SMS via 46elks (docs/notifieringssystem-forslag.md, Spår 1 — kritiska larm).
// 46elks-integrationen var tidigare bara inkommande (routes/sms.js, Tips via SMS) — samma
// konto/nummer används här som avsändare för utgående, men kräver ett separat API-nyckelpar
// (ELKS_API_USERNAME/ELKS_API_PASSWORD, från 46elks-dashboarden) som inte behövs för att BLI
// uppringd av deras webhook. No-op (loggar bara) om det inte är konfigurerat än, samma mönster
// som dailyReport.js:s buildTransport() för SMTP.

const ELKS_URL = 'https://api.46elks.com/a1/SMS';

function isConfigured() {
  const { ELKS_API_USERNAME, ELKS_API_PASSWORD, ELKS_FROM } = process.env;
  return !!(ELKS_API_USERNAME && ELKS_API_PASSWORD && ELKS_FROM);
}

// fromOverride: multi-tenancy steg 11 (docs/multitenancy-forslag.md) — org-scopad
// avsändaridentitet (settings-nyckeln `sms_sender_name`, se alertEngine.js::deliverSms()), INTE
// separata 46elks-konton/credentials per org. Faller tillbaka på ELKS_FROM om orgen inte satt
// någon egen avsändare.
async function sendSms(to, message, fromOverride) {
  const { ELKS_API_USERNAME, ELKS_API_PASSWORD, ELKS_FROM } = process.env;
  if (!isConfigured()) {
    console.log('SMS ej konfigurerat (ELKS_API_USERNAME/ELKS_API_PASSWORD/ELKS_FROM), hoppar över.');
    return;
  }
  const auth = Buffer.from(`${ELKS_API_USERNAME}:${ELKS_API_PASSWORD}`).toString('base64');
  const res = await fetch(ELKS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ from: fromOverride || ELKS_FROM, to, message }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`46elks HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

module.exports = { sendSms, isConfigured };
