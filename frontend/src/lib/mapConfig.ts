import maplibregl from 'maplibre-gl';
import type { LayerId } from '../types';

// Delad mellan MapView.tsx (skrivbord) och MobileMapView.tsx/FieldReportView.tsx (mobil-PWA).
// Måste ligga i en egen, liten fil — att exportera samma saker direkt ur MapView.tsx fick
// Rollup att lägga hela skrivbordskomponenten (inkl. maplibre-gl, ~1,8 MB) i en delad chunk
// som mobil-PWA:n också fick ladda ner, trots att den aldrig renderar MapView-komponenten.

const LM_TOPO_URL = 'https://minkarta.lantmateriet.se/map/topowebb/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=topowebbkartan&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png';
const LM_HILL_URL = 'https://minkarta.lantmateriet.se/map/hojdmodell/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=terrangskuggning&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true';
const SVK_URL = 'https://inspire-skn.metria.se/geoserver/skn/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=US.ElectricityNetwork.Lines,US.ElectricityNetwork.Pylons,US.ElectricityNetwork.StationAreas&STYLES=skn_line,skn_point,skn_polygon&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:900913&FORMAT=image/png&TRANSPARENT=true';
const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

export const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm:            { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    'lm-topo':      { type: 'raster', tiles: [LM_TOPO_URL], tileSize: 256, attribution: '© Lantmäteriet CC BY' },
    'wms-hillshade':{ type: 'raster', tiles: [LM_HILL_URL], tileSize: 256, attribution: '© Lantmäteriet' },
    'wms-svk':      { type: 'raster', tiles: [SVK_URL],     tileSize: 256, attribution: '© Svenska kraftnät' },
    seamark:        { type: 'raster', tiles: [SEAMARK_URL], tileSize: 256, attribution: '© OpenSeaMap contributors' },
  },
  layers: [
    { id: 'osm',             type: 'raster', source: 'osm',           layout: { visibility: 'none' } },
    { id: 'lm-topo',         type: 'raster', source: 'lm-topo' },
    { id: 'wms-svk',         type: 'raster', source: 'wms-svk',       layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } },
    { id: 'wms-hillshade',   type: 'raster', source: 'wms-hillshade', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
    { id: 'seamark',         type: 'raster', source: 'seamark',       layout: { visibility: 'none' } },
  ],
};

export const POLYGON_LAYERS: LayerId[] = ['staging_areas', 'airports'];
export const LINE_LAYERS: LayerId[] = ['roads', 'railways', 'tunnels', 'powerlines'];
// Fältrapporter (FieldReportView.tsx) skickar alltid en enda GPS-punkt och mobilkartan
// (MobileMapView.tsx) visar bara punktmarkörer — lager som kräver linje-/polygonritning
// utesluts i båda.
export const DRAW_LAYERS: LayerId[] = [...POLYGON_LAYERS, ...LINE_LAYERS];

// "Oklassad"-ring — samma tekniska mönster som kritikalitetsringen (crit-${id}) men ett eget,
// universellt JSONB-attribut (attributes.unclassified) satt av fältrapporteringen tills en
// stabsmedlem godkänt rapporten. Större radie än crit-ringen så båda syns samtidigt om ett
// fältobjekt även är kritikalitetsmärkt. Strängvärdet 'true' (inte boolean) — matchar hur
// criticality m.fl. redan lagras, se fieldReportQueue.ts.
export function unclassifiedRingLayer(layerId: LayerId, sourceId: string): maplibregl.CircleLayerSpecification {
  return {
    id: `unclass-${layerId}`,
    type: 'circle', source: sourceId,
    filter: ['==', ['get', 'unclassified'], 'true'],
    layout: { visibility: 'visible' },
    paint: {
      'circle-radius': 19,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#f0a83c',
      'circle-stroke-opacity': 0.9,
    },
  };
}
