// FEATURE_CRITICAL_ALERTS styr /api/config — bekräftar default (av) och att env-värdet slår
// igenom, samma sätt som frontend (AuthContext) läser flaggan vid appstart.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, listen, baseUrl } = require('./helpers/testApp');

let server, base;

before(async () => {
  server = await listen();
  base = await baseUrl(server);
});

after(async () => {
  server.close();
  await db.pool.end();
});

test('GET /api/config är publik och defaultar criticalAlertsEnabled till false', async () => {
  const res = await fetch(`${base}/api/config`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.criticalAlertsEnabled, false);
});

test('GET /api/config läser FEATURE_CRITICAL_ALERTS=true', async () => {
  process.env.FEATURE_CRITICAL_ALERTS = 'true';
  try {
    const res = await fetch(`${base}/api/config`);
    const body = await res.json();
    assert.equal(body.criticalAlertsEnabled, true);
  } finally {
    delete process.env.FEATURE_CRITICAL_ALERTS;
  }
});
