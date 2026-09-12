const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCotEvents, cotEventToAttrs } = require('../src/services/cotParser');

const MARKER_XML = `<event version="2.0" uid="ANDROID-abc123" type="b-m-p-s-p" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="h-g-i-g-o">
  <point lat="65.5842" lon="22.1546" hae="0" ce="10" le="10"/>
  <detail><contact callsign="Alpha1"/></detail>
</event>`;

const POSITION_XML = `<event version="2.0" uid="ANDROID-abc123" type="a-f-G-U-C" time="2026-09-12T10:00:00Z" start="2026-09-12T10:00:00Z" stale="2026-09-12T11:00:00Z" how="m-g">
  <point lat="65.58" lon="22.15" hae="0" ce="9999999" le="9999999"/>
  <detail><contact callsign="Alpha1"/></detail>
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

test('cotEventToAttrs filtrerar bort icke-markör-typer (positioner, fas 2)', () => {
  assert.equal(cotEventToAttrs(POSITION_XML), null);
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
