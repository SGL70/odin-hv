// Multi-tenancy steg 8 (docs/multitenancy-forslag.md) — org-scopade Socket.io-rum. Ingen
// befintlig testfil övade Socket.io alls (alla andra använder `helpers/testApp.js`:s `listen()`,
// som startar en HELT EGEN `app.listen()` — separat från index.js:s modulnivå-`server`/`io` som
// faktiskt har WebSocket-uppgraderingen kopplad). Den här filen lyssnar på RIKTIGA `server`
// (samma instans `io` är bunden till) och kopplar upp riktiga socket.io-client-anslutningar, så
// att rumstilldelningen (index.js:s `io.on('connection', ...)`) verifieras på riktigt, inte bara
// att koden kompilerar.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');
const { db, resetData } = require('./helpers/testApp');
const { server, io } = require('../src/index');

let base;
let ORG_R, ORG_A, ORG_B;

function signToken(orgId, role = 'admin') {
  return jwt.sign({ id: 1, username: 'rls-socket-test', role, org_id: orgId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function connect(token) {
  return ioClient(base, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
}

function waitForConnect(socket) {
  return new Promise((resolve) => socket.on('connect', resolve));
}

// index.js:s connection-handler är ASYNC (den slår upp resolveVisibleOrgIds() mot databasen
// innan den joinar rum) — klientens EGET 'connect'-event triggas så fort transporten är uppe,
// INNAN servern hunnit joina rummen. Utan denna poll skulle testet racea och emitta innan
// rummet ens finns, vilket är exakt det som orsakade de två första körningarnas falska "läckte
// aldrig"-resultat (rummet var faktiskt bara inte klart än).
async function waitUntilInRoom(room, socketId, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const members = io.sockets.adapter.rooms.get(room);
    if (members?.has(socketId)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Socket ${socketId} gick aldrig med i rummet ${room} inom ${timeoutMs}ms`);
}

// Väntar på ETT event av given typ, eller tidsout — så ett test kan påstå "detta kom INTE" utan
// att hänga i evighet (positiv detektion via race mot en kort timer, samma mönster överallt där
// frånvaro av något ska verifieras).
function waitForEventOrTimeout(socket, event, ms = 400) {
  return new Promise((resolve) => {
    let done = false;
    socket.once(event, (payload) => { if (!done) { done = true; resolve(payload); } });
    setTimeout(() => { if (!done) { done = true; resolve(undefined); } }, ms);
  });
}

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const region = await db.query(`INSERT INTO organizations (name, slug, org_type) VALUES ('Socket Test Region', 'socket-test-region', 'militarregion') RETURNING id`);
  ORG_R = region.rows[0].id;
  const battalionA = await db.query(`INSERT INTO organizations (name, slug, org_type, parent_org_id) VALUES ('Socket Test Bataljon A', 'socket-test-a', 'bataljon', $1) RETURNING id`, [ORG_R]);
  ORG_A = battalionA.rows[0].id;
  const battalionB = await db.query(`INSERT INTO organizations (name, slug, org_type) VALUES ('Socket Test Bataljon B', 'socket-test-b', 'bataljon') RETURNING id`);
  ORG_B = battalionB.rows[0].id;
});

after(async () => {
  try {
    await db.query(`DELETE FROM organizations WHERE id = ANY($1::int[])`, [[ORG_A, ORG_B, ORG_R]]);
    await resetData();
  } finally {
    io.close();
    await db.pool.end();
  }
});

test('en socket i bataljon A får ett event skickat till org:A', async () => {
  const clientA = connect(signToken(ORG_A));
  try {
    await waitForConnect(clientA);
    await waitUntilInRoom(`org:${ORG_A}`, clientA.id);
    const received = waitForEventOrTimeout(clientA, 'feature:created');
    io.to(`org:${ORG_A}`).emit('feature:created', { marker: 'for-A' });
    assert.deepEqual(await received, { marker: 'for-A' });
  } finally {
    clientA.close();
  }
});

test('en socket i bataljon A får ALDRIG ett event skickat till org:B', async () => {
  const clientA = connect(signToken(ORG_A));
  try {
    await waitForConnect(clientA);
    await waitUntilInRoom(`org:${ORG_A}`, clientA.id);
    const received = waitForEventOrTimeout(clientA, 'feature:created');
    io.to(`org:${ORG_B}`).emit('feature:created', { marker: 'for-B-only' });
    assert.equal(await received, undefined, 'bataljon A:s socket tog emot ett event avsett för bataljon B');
  } finally {
    clientA.close();
  }
});

test('en socket i militärregion R får event för sin egen bataljon A men aldrig obesläktad bataljon B', async () => {
  const clientR = connect(signToken(ORG_R));
  try {
    await waitForConnect(clientR);
    await waitUntilInRoom(`org:${ORG_A}`, clientR.id); // R:s synliga org-mängd inkluderar A (förälder->barn)

    const receivedA = waitForEventOrTimeout(clientR, 'feature:created');
    io.to(`org:${ORG_A}`).emit('feature:created', { marker: 'for-A' });
    assert.deepEqual(await receivedA, { marker: 'for-A' }, 'militärregion R såg inte sin egen bataljon A:s event');

    const receivedB = waitForEventOrTimeout(clientR, 'feature:created');
    io.to(`org:${ORG_B}`).emit('feature:created', { marker: 'for-B-only' });
    assert.equal(await receivedB, undefined, 'militärregion R:s socket tog emot ett event avsett för en obesläktad bataljon B');
  } finally {
    clientR.close();
  }
});

test('larm riktas per org OCH roll — en admin i bataljon B ser aldrig ett larm riktat till admin i bataljon A', async () => {
  const adminA = connect(signToken(ORG_A, 'admin'));
  const adminB = connect(signToken(ORG_B, 'admin'));
  try {
    await Promise.all([waitForConnect(adminA), waitForConnect(adminB)]);
    await Promise.all([
      waitUntilInRoom(`org:${ORG_A}:role:admin`, adminA.id),
      waitUntilInRoom(`org:${ORG_B}:role:admin`, adminB.id),
    ]);

    const receivedA = waitForEventOrTimeout(adminA, 'alert:triggered');
    const receivedB = waitForEventOrTimeout(adminB, 'alert:triggered');
    io.to(`org:${ORG_A}:role:admin`).emit('alert:triggered', { marker: 'alert-for-A-admin' });
    const [payloadA, payloadB] = await Promise.all([receivedA, receivedB]);
    assert.deepEqual(payloadA, { marker: 'alert-for-A-admin' });
    assert.equal(payloadB, undefined, 'bataljon B:s admin tog emot ett larm riktat till bataljon A:s admin');
  } finally {
    adminA.close();
    adminB.close();
  }
});

test('en socket utan giltig token går inte med i något org-rum', async () => {
  const clientNoToken = connect(null);
  try {
    await waitForConnect(clientNoToken);
    // Ingen token → ingen resolveVisibleOrgIds()-uppslagning alls → inget att polla på. En kort
    // paus (rundligt tilltagen jämfört med den riktiga uppslagningens svarstid) i stället.
    await new Promise((r) => setTimeout(r, 200));
    const received = waitForEventOrTimeout(clientNoToken, 'feature:created');
    io.to(`org:${ORG_A}`).emit('feature:created', { marker: 'for-A' });
    assert.equal(await received, undefined, 'en oautentiserad socket fick ändå ett org-scopat event');
  } finally {
    clientNoToken.close();
  }
});
