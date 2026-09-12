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

// Fas 1 hanterar bara fältskapade markörer ("b-m-p-*"). Enhetspositioner ("a-f-*") ignoreras
// tills fas 2 (se spec:ens "Öppna frågor").
function isMarkerType(type) {
  return typeof type === 'string' && type.startsWith('b-m-p-');
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
