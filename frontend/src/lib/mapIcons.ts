import type { Map as MapLibreMap } from 'maplibre-gl';
import { getLayer } from '../types';

// Rasteriserar samma linjeikon-språk som layerIcons.tsx (viewBox 16x16, stroke/fill) till
// kartbilder via Path2D + map.addImage() — samma mönster som reportSymbols.ts för
// milsymbol-ikoner, men här ritar vi själva med Canvas 2D eftersom formerna är enkla nog.
// Ersätter släta cirkelprickar för Trafikhändelser/Elavbrott/Vädervarningar/Polishändelser,
// vars nästan identiska orange/amber-nyanser (se types.ts LAYERS[].color) gjorde dem svåra
// att skilja åt på kartan — formen bär nu identiteten, färgen behöver inte längre göra det ensam.

const SCALE = 2; // rasterisera i 32x32 för skarpare rendering än 16x16-viewboxen
const SIZE = 16 * SCALE;

interface IconPath {
  d: string;
  fill?: boolean;
  strokeWidth?: number;
}

function drawIcon(paths: IconPath[], color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of paths) {
    const path2d = new Path2D(p.d);
    if (p.fill) {
      ctx.fill(path2d);
    } else {
      ctx.lineWidth = p.strokeWidth ?? 1.3;
      ctx.stroke(path2d);
    }
  }
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function registerIcon(map: MapLibreMap, id: string, paths: IconPath[], color: string) {
  if (map.hasImage(id)) return;
  map.addImage(id, drawIcon(paths, color));
}

// ── Formdefinitioner (samma path-data som layerIcons.tsx där formen redan fanns där) ──────

const ROAD_TRIANGLE: IconPath[] = [{ d: 'M8 2 1 14h14L8 2z', strokeWidth: 1.4 }];
const POWER_BOLT: IconPath[] = [{ d: 'M9 1 3 9h4l-1 6 7-9H9l1-5z', fill: true }];
const WEATHER_CLOUD: IconPath[] = [
  { d: 'M4.5 9.5a3 3 0 0 1 .3-6 3.6 3.6 0 0 1 6.8-1 3 3 0 0 1 .4 6', strokeWidth: 1.3 },
  { d: 'M8.5 9.5 6.5 12.5h2.5L7.5 15', strokeWidth: 1.3 },
];
// Sheriffbricka/sköld — ersätter den tidigare klockliknande polisikonen (cirkel + visare),
// som lästes som en klocka snarare än en myndighetssymbol.
const POLICE_SHIELD: IconPath[] = [
  { d: 'M8 1.5 L13 3.5 V8 C13 11.3 10.7 13.5 8 14.5 C5.3 13.5 3 11.3 3 8 V3.5 Z', strokeWidth: 1.4 },
  { d: 'M5 6.5h6', strokeWidth: 1.1 },
];

// Färgvarianter per händelsetyp för Trafikhändelser — exakt samma färger som det tidigare
// circle-color-uttrycket i MapView.tsx, så informationen (olycka vs vägarbete vs halka...)
// inte går förlorad när prickar blir ikoner.
const ROAD_EVENT_COLORS: Record<string, string> = {
  'Olycka': '#e74c3c',
  'Vägarbete': '#f39c12',
  'Hinder': '#f1c40f',
  'Halka': '#3498db',
  'Väglag': '#3498db',
  'Brobegränsning': '#9b59b6',
  'Körfältsrestriktion': '#9b59b6',
  'Restriktion': '#9b59b6',
};
const ROAD_DEFAULT_ICON = 'road-triangle-default';

export const POWER_ICON_ID = 'power-bolt';
export const WEATHER_ICON_ID = 'weather-cloud';
export const POLICE_ICON_ID = 'police-shield';

export function ensureMapIcons(map: MapLibreMap) {
  for (const [eventType, color] of Object.entries(ROAD_EVENT_COLORS)) {
    registerIcon(map, `road-triangle-${eventType}`, ROAD_TRIANGLE, color);
  }
  registerIcon(map, ROAD_DEFAULT_ICON, ROAD_TRIANGLE, '#888');
  registerIcon(map, POWER_ICON_ID, POWER_BOLT, getLayer('power_outages')?.color ?? '#e67e22');
  registerIcon(map, WEATHER_ICON_ID, WEATHER_CLOUD, getLayer('weather_warnings')?.color ?? '#e8a33c');
  registerIcon(map, POLICE_ICON_ID, POLICE_SHIELD, getLayer('police_events')?.color ?? '#3498db');
}

// Bygger samma 'match'-uttryck som tidigare styrde circle-color, fast mot ikon-id istället.
export function buildRoadIconExpression(): unknown[] {
  const pairs: unknown[] = [];
  for (const eventType of Object.keys(ROAD_EVENT_COLORS)) {
    pairs.push(eventType, `road-triangle-${eventType}`);
  }
  return ['match', ['get', 'event_type'], ...pairs, ROAD_DEFAULT_ICON];
}
