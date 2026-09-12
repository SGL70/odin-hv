// Egen liten CoT-XML-parser (Cursor-on-Target, TAK-ekosystemets meddelandeformat) —
// medvetet ingen XML-biblioteksdependency, CoT-eventens struktur är fast och enkel nog
// (attribut på <event>/<point>/<contact>, ingen nästling av <event> i <event>). Matchar
// hur export.js redan hand-bygger CoT-XML åt andra hållet.

function extractCotEvents(buffer) {
  const events = [];
  const re = /<event\b[^]*?<\/event>/g;
  let match;
  let lastIndex = 0;
  while ((match = re.exec(buffer)) !== null) {
    events.push(match[0]);
    lastIndex = re.lastIndex;
  }
  return { events, remainder: buffer.slice(lastIndex) };
}

function tagAttr(xml, tag, name) {
  const tagMatch = xml.match(new RegExp(`<${tag}\\b[^>]*`));
  if (!tagMatch) return null;
  const attrMatch = tagMatch[0].match(new RegExp(`\\b${name}="([^"]*)"`));
  return attrMatch ? attrMatch[1] : null;
}

// Ursprungligen begränsat till "b-m-p-*" (rena, symbollösa punkter) i tron att det täckte
// "fältskapade markörer" och att affiliation-kodade typer ("a-f/h/n/u-*") bara var enhets-
// positioner (fas 2). Fel — upptäckt vid första riktiga fälttestet 2026-09-12: när en användare
// droppar en markör och väljer en 2525-symbol (Egen/Fientlig/Neutral/Okänd, det normala sättet
// att sätta ut en markör i ATAK) blir CoT-typen "a-[fhnu]-...", inte "b-m-p-*" — filtret gjorde
// att markören tystnade helt utan felmeddelande. CoT-typkoden ensam skiljer inte på en manuellt
// satt symbol och en enhets levande självrapporterade position (båda kan vara "a-f-*"); det
// kräver att man tittar på <track>-elementet (fart/kurs), vilket inte görs här än. Tar därför med
// båda mönstren i fas 1 — en enhets egen position kommer alltså också synas som tak_reports tills
// vidare, vilket är ofarligt (samma cot_uid → uppdaterar samma rad, ingen radexplosion).
function isMarkerType(type) {
  return typeof type === 'string' && (type.startsWith('b-m-p-') || /^a-[fhnu]-/.test(type));
}

function cotEventToAttrs(xml) {
  const uid = tagAttr(xml, 'event', 'uid');
  const type = tagAttr(xml, 'event', 'type');
  const lat = tagAttr(xml, 'point', 'lat');
  const lon = tagAttr(xml, 'point', 'lon');
  if (!uid || !type || lat == null || lon == null) return null;
  if (!isMarkerType(type)) return null;
  const callsign = tagAttr(xml, 'contact', 'callsign') || uid;
  return { cot_uid: uid, cot_type: type, lat: Number(lat), lon: Number(lon), callsign };
}

module.exports = { extractCotEvents, cotEventToAttrs, isMarkerType };
