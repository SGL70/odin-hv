const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceM(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function lineLengthM(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineDistanceM(points[i - 1], points[i]);
  return total;
}

// Shoelace-area på en lokalt platt-projicerad (equirectangular, skalad med cos(medel-latitud))
// approximation av ringen — tillräckligt precist på den skala (kommun/länsdel i Norrbotten)
// appen används på, utan att behöva dra in en full geodesi-dependency som turf.js.
export function polygonAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const meanLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(toRad(meanLat));
  const projected = points.map(([lng, lat]) => [lng * mPerDegLng, lat * mPerDegLat]);
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % projected.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('sv', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function formatArea(m2: number): string {
  if (m2 < 10000) return `${Math.round(m2)} m²`;
  if (m2 < 1000000) return `${(m2 / 10000).toLocaleString('sv', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`;
  return `${(m2 / 1000000).toLocaleString('sv', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km²`;
}
