const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCotEvents, cotEventToAttrs } = require('../src/services/cotParser');

const MARKER_XML = `<event version="2.0" uid="ANDROID-abc123" type="b-m-p-s-p" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="h-g-i-g-o">
  <point lat="65.5842" lon="22.1546" hae="0" ce="10" le="10"/>
  <detail><contact callsign="Alpha1"/></detail>
</event>`;

// Ping/kontrollmeddelande — inte en markör, inte affiliation-kodad. Ska filtreras bort.
const PING_XML = `<event version="2.0" uid="ANDROID-abc123" type="t-x-c-t" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="m-g">
  <point lat="65.58" lon="22.15" hae="0" ce="9999999" le="9999999"/>
</event>`;

// En markör satt via ATAK:s symbolpalett (t.ex. "Okänd" ground-ikon) — vanligaste sättet att
// droppa en taktisk markör i praktiken, se cotParser.js:s kommentar om varför detta inte längre
// filtreras bort.
const AFFILIATION_MARKER_XML = `<event version="2.0" uid="ANDROID-u12" type="a-u-G" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="h-g-i-g-o">
  <point lat="66.265916" lon="22.83632" hae="0" ce="10" le="10"/>
  <detail><contact callsign="u.12.235456"/></detail>
</event>`;

test('extractCotEvents plockar ut ett komplett event och lämnar tom rest', () => {
  const { events, remainder } = extractCotEvents(MARKER_XML);
  assert.equal(events.length, 1);
  assert.equal(remainder, '');
});

test('extractCotEvents hanterar två events i samma buffert', () => {
  const { events, remainder } = extractCotEvents(MARKER_XML + '\n' + MARKER_XML);
  assert.equal(events.length, 2);
  assert.equal(remainder, '');
});

test('extractCotEvents lämnar kvar ett ofullständigt event i remainder', () => {
  const incomplete = MARKER_XML.slice(0, 50);
  const { events, remainder } = extractCotEvents(incomplete);
  assert.equal(events.length, 0);
  assert.equal(remainder, incomplete);
});

test('cotEventToAttrs tolkar en markör korrekt', () => {
  const attrs = cotEventToAttrs(MARKER_XML);
  assert.deepEqual(attrs, {
    cot_uid: 'ANDROID-abc123',
    cot_type: 'b-m-p-s-p',
    lat: 65.5842,
    lon: 22.1546,
    callsign: 'Alpha1',
  });
});

test('cotEventToAttrs filtrerar bort ping/kontrollmeddelanden', () => {
  assert.equal(cotEventToAttrs(PING_XML), null);
});

test('cotEventToAttrs tar med affiliation-kodade markörer (a-u-/a-f-/a-h-/a-n-)', () => {
  const attrs = cotEventToAttrs(AFFILIATION_MARKER_XML);
  assert.deepEqual(attrs, {
    cot_uid: 'ANDROID-u12',
    cot_type: 'a-u-G',
    lat: 66.265916,
    lon: 22.83632,
    callsign: 'u.12.235456',
  });
});

test('cotEventToAttrs returnerar null för trasig/ofullständig XML', () => {
  assert.equal(cotEventToAttrs('<event uid="x" type="b-m-p-s-p"></event>'), null);
});

test('cotEventToAttrs faller tillbaka på uid som callsign om contact saknas', () => {
  const noContact = `<event version="2.0" uid="ANDROID-xyz" type="b-m-p-s-p" time="t" start="t" stale="t" how="h-g-i-g-o">
  <point lat="65.0" lon="22.0" hae="0" ce="10" le="10"/>
</event>`;
  const attrs = cotEventToAttrs(noContact);
  assert.equal(attrs.callsign, 'ANDROID-xyz');
});
