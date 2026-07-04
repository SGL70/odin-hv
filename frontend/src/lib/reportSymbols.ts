import type { Map as MapLibreMap } from 'maplibre-gl';
// milsymbol v2's type declarations (named exports) don't match its actual runtime module
// (a single default export object) — verified against the installed package. Bypass with a
// minimal local type instead of fighting the mismatched .d.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import msModule from 'milsymbol';
const ms = msModule as unknown as {
  Symbol: new (sidc: string, options?: Record<string, unknown>) => { asCanvas(): HTMLCanvasElement };
};

// APP-6/MIL-STD-2525C-koder. Verifierade genom faktisk rendering (asSVG) mot installerad
// milsymbol-version — inte gissade. Understrecket i sidc-mallen byts ut mot tillhörighetsbokstaven.
const AFFILIATION_CODE: Record<string, string> = {
  'Egen (Friendly)': 'F',
  'Fientlig (Hostile)': 'H',
  'Neutral': 'N',
  'Okänd (Unknown)': 'U',
};

// Trailing 'D' på Ledning/Stab-koden är 2525C:s HQ/Task Force-modifierarfält — ger
// den klassiska 3-punkts-markeringen ovanför ramen, verifierat visuellt.
const SYMBOL_TYPE_SIDC: Record<string, string> = {
  'Markstyrka (allmän)': 'S_GPUCI-----',
  'Mekaniserad/Fordon': 'S_GPUCA-----',
  'Eldenhet/Beväpning': 'S_GPUCF-----',
  'Ledning/Stab': 'S_GPU------D',
  'Anläggning/Installation': 'S_GPINS-----',
};

export function reportIconId(affiliation: string, symbolType: string): string {
  const affCode = AFFILIATION_CODE[affiliation] || 'U';
  const typeKey = SYMBOL_TYPE_SIDC[symbolType] ? symbolType : 'Markstyrka (allmän)';
  return `rpt-${affCode}-${typeKey}`.replace(/[^a-zA-Z0-9-]/g, '_');
}

export function registerReportIcons(map: MapLibreMap) {
  for (const affiliation of Object.keys(AFFILIATION_CODE)) {
    for (const symbolType of Object.keys(SYMBOL_TYPE_SIDC)) {
      const id = reportIconId(affiliation, symbolType);
      if (map.hasImage(id)) continue;
      const sidc = SYMBOL_TYPE_SIDC[symbolType].replace('_', AFFILIATION_CODE[affiliation]);
      const sym = new ms.Symbol(sidc, { size: 30 });
      const canvas = sym.asCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height));
    }
  }
}

export const DEFAULT_REPORT_ICON_ID = reportIconId('Okänd (Unknown)', 'Markstyrka (allmän)');

// Bygger en MapLibre 'match'-expression som slår upp rätt förregistrerad ikon-id per feature,
// baserat på dess affiliation+symbol_type-fält (fallback till "okänd markstyrka" om okänt/tomt).
export function buildReportIconExpression(): unknown[] {
  const pairs: unknown[] = [];
  for (const affiliation of Object.keys(AFFILIATION_CODE)) {
    for (const symbolType of Object.keys(SYMBOL_TYPE_SIDC)) {
      pairs.push(`${affiliation}|${symbolType}`, reportIconId(affiliation, symbolType));
    }
  }
  return [
    'match',
    ['concat', ['get', 'affiliation'], '|', ['get', 'symbol_type']],
    ...pairs,
    DEFAULT_REPORT_ICON_ID,
  ];
}
