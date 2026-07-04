import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { api } from '../api';
import { LAYERS, getLayer } from '../types';
import type { Feature, LayerId, AlertEvent } from '../types';
import { Sidebar } from './Sidebar';
import { FeaturePanel } from './FeaturePanel';
import { Dashboard } from './Dashboard';
import { ImportDialog } from './ImportDialog';
import { HarvestSidebar } from './HarvestSidebar';
import { SettingsModal } from './SettingsModal';
import { AnalysisPanel } from './AnalysisPanel';
import { AlertRulesModal } from './AlertRulesModal';
import { AlertBanner } from './AlertBanner';
import { OdinLogo } from './OdinLogo';
import { ReportListPanel } from './ReportListPanel';
import { registerReportIcons, buildReportIconExpression } from '../lib/reportSymbols';
import { useAuth } from '../contexts/AuthContext';
import { io } from 'socket.io-client';

const LM_TOPO_URL = 'https://minkarta.lantmateriet.se/map/topowebb/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=topowebbkartan&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png';
const LM_HILL_URL = 'https://minkarta.lantmateriet.se/map/hojdmodell/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=terrangskuggning&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true';
const SVK_URL = 'https://inspire-skn.metria.se/geoserver/skn/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=US.ElectricityNetwork.Lines,US.ElectricityNetwork.Pylons,US.ElectricityNetwork.StationAreas&STYLES=skn_line,skn_point,skn_polygon&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:900913&FORMAT=image/png&TRANSPARENT=true';
const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm:            { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    'lm-topo':      { type: 'raster', tiles: [LM_TOPO_URL], tileSize: 256, attribution: '© Lantmäteriet CC BY' },
    'wms-hillshade':{ type: 'raster', tiles: [LM_HILL_URL], tileSize: 256, attribution: '© Lantmäteriet' },
    'wms-svk':      { type: 'raster', tiles: [SVK_URL],     tileSize: 256, attribution: '© Svenska kraftnät' },
    seamark:        { type: 'raster', tiles: [SEAMARK_URL], tileSize: 256, attribution: '© OpenSeaMap contributors' },
  },
  layers: [
    { id: 'osm',             type: 'raster', source: 'osm' },
    { id: 'lm-topo',         type: 'raster', source: 'lm-topo',       layout: { visibility: 'none' } },
    { id: 'wms-svk',         type: 'raster', source: 'wms-svk',       layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } },
    { id: 'wms-hillshade',   type: 'raster', source: 'wms-hillshade', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
    { id: 'seamark',         type: 'raster', source: 'seamark',       layout: { visibility: 'none' } },
  ],
};

const POLYGON_LAYERS: LayerId[] = ['staging_areas', 'airports'];
const LINE_LAYERS: LayerId[] = ['roads', 'railways', 'tunnels', 'powerlines'];
const DRAW_LAYERS: LayerId[] = [...POLYGON_LAYERS, ...LINE_LAYERS];


export function MapView() {
  const { user, logout } = useAuth();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [visible, setVisible] = useState<Set<LayerId>>(() => {
    try {
      const s = localStorage.getItem('layerVisible');
      if (s) return new Set(JSON.parse(s) as LayerId[]);
    } catch { /* ignore */ }
    return new Set(LAYERS.map(l => l.id));
  });
  const [selected, setSelected] = useState<Feature | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Feature[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [addLayer, setAddLayer] = useState<LayerId>('fuel');
  const [showDash, setShowDash] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [harvestOpen, setHarvestOpen] = useState(() => localStorage.getItem('harvestOpen') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showAlertRules, setShowAlertRules] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<AlertEvent[]>([]);
  const [bannerAlerts, setBannerAlerts] = useState<AlertEvent[]>([]);
  const [opomrFilter, setOpomrFilter] = useState(() => localStorage.getItem('opomrFilter') === 'true');
  const [baseMap, setBaseMap] = useState<'osm' | 'lm'>(() => (localStorage.getItem('baseMap') as 'osm' | 'lm') || 'osm');
  const [wmsOverlays, setWmsOverlays] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('wmsOverlays');
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const [addDialog, setAddDialog] = useState<{ lngLat: maplibregl.LngLat } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polygonReady, setPolygonReady] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [mapLoaded, setMapLoaded] = useState(false);

  const canEdit = user?.role === 'editor' || user?.role === 'admin';
  const isPolygonMode = addMode && POLYGON_LAYERS.includes(addLayer);
  const isLineMode = addMode && LINE_LAYERS.includes(addLayer);
  const isDrawMode = addMode && DRAW_LAYERS.includes(addLayer);

  const loadFeatures = useCallback(async (withOpomr?: boolean) => {
    const useFilter = withOpomr !== undefined ? withOpomr : opomrFilter;
    const path = useFilter ? '/features?opomr=1' : '/features';
    const fc = await api.get<GeoJSON.FeatureCollection>(path);
    setFeatures(((fc as GeoJSON.FeatureCollection).features || []) as Feature[]);
  }, [opomrFilter]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  useEffect(() => { api.alerts.listEvents('open').then(setOpenAlerts); }, []);

  async function acknowledgeAlert(id: number) {
    await api.alerts.acknowledge(id);
    setOpenAlerts(prev => prev.filter(e => e.id !== id));
    setBannerAlerts(prev => prev.filter(e => e.id !== id));
  }

  // Reload when OpOmr filter changes
  useEffect(() => {
    localStorage.setItem('opomrFilter', String(opomrFilter));
    loadFeatures(opomrFilter);
  }, [opomrFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket.io real-time
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('feature:created', (f: Feature) => setFeatures(prev => [f, ...prev.filter(p => p.properties.uid !== f.properties.uid)]));
    socket.on('feature:updated', (f: Feature) => setFeatures(prev => prev.map(p => p.properties.uid === f.properties.uid ? f : p)));
    socket.on('feature:deleted', ({ uid }: { uid: string }) => setFeatures(prev => prev.filter(p => p.properties.uid !== uid)));
    socket.on('features:reloaded', () => loadFeatures());
    socket.on('alert:triggered', (event: AlertEvent) => {
      setOpenAlerts(prev => [event, ...prev]);
      setBannerAlerts(prev => [event, ...prev]);
      setTimeout(() => setBannerAlerts(prev => prev.filter(e => e.id !== event.id)), 10000);
    });
    socket.on('alert:acknowledged', (event: AlertEvent) => {
      setOpenAlerts(prev => prev.filter(e => e.id !== event.id));
      setBannerAlerts(prev => prev.filter(e => e.id !== event.id));
    });
    return () => { socket.disconnect(); };
  }, [loadFeatures]);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [22.848, 66.330],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      // Choropleth source + layers (rendered below all feature layers)
      map.addSource('choropleth-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'choropleth-fill', type: 'fill', source: 'choropleth-src',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': ['case',
            ['==', ['get', 'level'], 2], 'rgba(231,76,60,0.3)',
            ['==', ['get', 'level'], 1], 'rgba(230,126,34,0.25)',
            'rgba(74,170,90,0.2)',
          ],
        },
      });
      map.addLayer({
        id: 'choropleth-outline', type: 'line', source: 'choropleth-src',
        layout: { visibility: 'none' },
        paint: {
          'line-color': ['case',
            ['==', ['get', 'level'], 2], '#e74c3c',
            ['==', ['get', 'level'], 1], '#e67e22',
            '#4aaa5a',
          ],
          'line-width': 2, 'line-opacity': 0.8,
        },
      });
      map.addLayer({
        id: 'choropleth-label', type: 'symbol', source: 'choropleth-src',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11, 'text-anchor': 'center', visibility: 'none',
        },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 },
      });
      setMapLoaded(true);
    });
    mapRef.current = map;
    return () => map.remove();
  }, []);

  // Sync features to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    LAYERS.forEach(layer => {
      const sourceId = `src-${layer.id}`;
      const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const layerFeatures = features.filter(f => {
        if (f.properties.layer !== layer.id) return false;
        if (layer.id === 'police_events') {
          const dt = f.properties.datetime || f.properties.scraped_at;
          return dt && dt > cutoff48h;
        }
        return true;
      });
      const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: layerFeatures };

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        return;
      }

      // Police events: clustered source so stacked county-centroid dots show a count
      if (layer.id === 'police_events') {
        map.addSource(sourceId, { type: 'geojson', data: geojson, cluster: true, clusterMaxZoom: 12, clusterRadius: 40 });
        // Cluster circle
        map.addLayer({ id: `lyr-${layer.id}-cluster`, type: 'circle', source: sourceId,
          filter: ['has', 'point_count'],
          paint: { 'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 20, 22],
            'circle-color': layer.color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-opacity': 0.9 } });
        // Cluster count label
        map.addLayer({ id: `lyr-${layer.id}-cluster-count`, type: 'symbol', source: sourceId,
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
          paint: { 'text-color': '#fff' } });
        // Individual unclustered point
        map.addLayer({ id: `lyr-${layer.id}`, type: 'circle', source: sourceId,
          filter: ['!', ['has', 'point_count']],
          paint: { 'circle-radius': 9, 'circle-color': layer.color,
            'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-opacity': 0.85 } });
        map.on('mouseenter', `lyr-${layer.id}-cluster`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `lyr-${layer.id}-cluster`, () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = ''; });
        return;
      }

      // Road situations: colour-coded by event_type
      if (layer.id === 'road_situations') {
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'circle', source: sourceId,
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': 10,
            'circle-color': ['match', ['get', 'event_type'],
              'Olycka',              '#e74c3c',
              'Vägarbete',           '#f39c12',
              'Hinder',              '#f1c40f',
              'Halka',               '#3498db',
              'Väglag',              '#3498db',
              'Brobegränsning',      '#9b59b6',
              'Körfältsrestriktion', '#9b59b6',
              'Restriktion',         '#9b59b6',
              '#888',
            ] as maplibregl.ExpressionSpecification,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        });
        map.addLayer({
          id: `crit-${layer.id}`,
          type: 'circle', source: sourceId,
          filter: ['in', ['get', 'criticality'], ['literal', ['rod', 'gul']]],
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3, 'circle-stroke-opacity': 0.85,
            'circle-stroke-color': ['match', ['get', 'criticality'],
              'rod', '#e74c3c', 'gul', '#f39c12', '#888',
            ] as maplibregl.ExpressionSpecification,
          },
        });
        map.addLayer({
          id: `lbl-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: { 'text-field': ['get', 'event_type'], 'text-size': 10, 'text-offset': [0, 1.6], 'text-anchor': 'top', visibility: 'visible' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
        map.on('mouseenter', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = ''; });
        return;
      }

      // Underrättelserapporter: APP-6-symbol via förregistrerade milsymbol-ikoner
      if (layer.id === 'intelligence_reports') {
        registerReportIcons(map);
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: {
            'icon-image': buildReportIconExpression() as unknown as maplibregl.ExpressionSpecification,
            'icon-size': 1,
            'icon-allow-overlap': true,
            visibility: 'visible',
          },
        });
        map.on('mouseenter', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = ''; });
        return;
      }

      map.addSource(sourceId, { type: 'geojson', data: geojson });

      if (LINE_LAYERS.includes(layer.id)) {
        const dashed = layer.id === 'tunnels';

        // Invisible wide hit layer so thin lines are easy to click
        map.addLayer({
          id: `hit-${layer.id}`,
          type: 'line', source: sourceId,
          layout: { visibility: 'visible' },
          paint: { 'line-width': 20, 'line-opacity': 0 },
        });

        // Roads: colour by BK-class; other lines: static colour
        const lineColor = layer.id === 'roads'
          ? ['match', ['get', 'bk_class'],
              'BK 1', '#27ae60',
              'BK 2', '#f1c40f',
              'BK 3', '#e67e22',
              'BK 4', '#e74c3c',
              layer.color] as maplibregl.ExpressionSpecification
          : layer.color;

        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'line', source: sourceId,
          layout: { visibility: 'visible' },
          paint: {
            'line-color': lineColor,
            'line-width': layer.id === 'roads' ? 4 : layer.id === 'railways' ? 3 : 2,
            'line-opacity': 0.9,
            ...(dashed ? { 'line-dasharray': [4, 3] } : {}),
          },
        });
        map.addLayer({
          id: `lbl-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'symbol-placement': 'line', visibility: 'visible' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
      } else if (layer.id === 'staging_areas') {
        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'fill', source: sourceId,
          layout: { visibility: 'visible' },
          paint: { 'fill-color': layer.color, 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: `lyr-${layer.id}-outline`,
          type: 'line', source: sourceId,
          layout: { visibility: 'visible' },
          paint: { 'line-color': layer.color, 'line-width': 2 },
        });
        map.addLayer({
          id: `lbl-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11, visibility: 'visible' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
      } else {
        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'circle', source: sourceId,
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': 9, 'circle-color': layer.color,
            'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-opacity': 0.9,
          },
        });
        // Criticality ring — outer halo for Röd/Gul classified features
        map.addLayer({
          id: `crit-${layer.id}`,
          type: 'circle', source: sourceId,
          filter: ['in', ['get', 'criticality'], ['literal', ['rod', 'gul']]],
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': 14,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3,
            'circle-stroke-color': ['match', ['get', 'criticality'],
              'rod', '#e74c3c', 'gul', '#f39c12', '#888',
            ] as maplibregl.ExpressionSpecification,
            'circle-stroke-opacity': 0.85,
          },
        });
        map.addLayer({
          id: `lbl-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', visibility: 'visible' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
      }

      const setCursor = (c: string) => () => { map.getCanvas().style.cursor = c; };
      for (const lid of [`lyr-${layer.id}`, `hit-${layer.id}`]) {
        if (map.getLayer(lid)) {
          map.on('mouseenter', lid, setCursor('pointer'));
          map.on('mouseleave', lid, setCursor(addMode ? 'crosshair' : ''));
        }
      }
    });

    // Bridges must sit above road lines so their click area isn't swallowed by hit-roads
    for (const lid of ['lyr-bridges', 'crit-bridges', 'lbl-bridges']) {
      if (map.getLayer(lid)) map.moveLayer(lid);
    }
  }, [features, addMode, mapLoaded]);

  // Visibility toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    LAYERS.forEach(layer => {
      const vis = visible.has(layer.id) ? 'visible' : 'none';
      if (map.getLayer(`hit-${layer.id}`))                map.setLayoutProperty(`hit-${layer.id}`,                'visibility', vis);
      if (map.getLayer(`lyr-${layer.id}`))                map.setLayoutProperty(`lyr-${layer.id}`,                'visibility', vis);
      if (map.getLayer(`lyr-${layer.id}-outline`))        map.setLayoutProperty(`lyr-${layer.id}-outline`,        'visibility', vis);
      if (map.getLayer(`crit-${layer.id}`))               map.setLayoutProperty(`crit-${layer.id}`,               'visibility', vis);
      if (map.getLayer(`lbl-${layer.id}`))                map.setLayoutProperty(`lbl-${layer.id}`,                'visibility', vis);
      if (map.getLayer(`lyr-${layer.id}-cluster`))        map.setLayoutProperty(`lyr-${layer.id}-cluster`,        'visibility', vis);
      if (map.getLayer(`lyr-${layer.id}-cluster-count`))  map.setLayoutProperty(`lyr-${layer.id}-cluster-count`,  'visibility', vis);
    });
  }, [visible]);

  // Base map switch: OSM ↔ Lantmäteriet topo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('osm'))     map.setLayoutProperty('osm',     'visibility', baseMap === 'osm' ? 'visible' : 'none');
    if (map.getLayer('lm-topo')) map.setLayoutProperty('lm-topo', 'visibility', baseMap === 'lm'  ? 'visible' : 'none');
  }, [baseMap]);

  // WMS overlays: terrängskuggning + SVK kraftnät + sjökort (OpenSeaMap)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const vis = (id: string) => wmsOverlays.has(id) ? 'visible' : 'none';
    if (map.getLayer('wms-hillshade')) map.setLayoutProperty('wms-hillshade', 'visibility', vis('hillshade'));
    if (map.getLayer('wms-svk'))       map.setLayoutProperty('wms-svk',       'visibility', vis('svk'));
    if (map.getLayer('seamark'))       map.setLayoutProperty('seamark',       'visibility', vis('seamark'));
  }, [wmsOverlays]);

  // Choropleth overlay — hämta och rendera kommuners störningsindex
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const isOn = wmsOverlays.has('choropleth');
    const v = isOn ? 'visible' : 'none';
    ['choropleth-fill', 'choropleth-outline', 'choropleth-label'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
    });
    if (isOn) {
      api.get<GeoJSON.FeatureCollection>('/api/analysis/choropleth').then(fc => {
        const src = map.getSource('choropleth-src') as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(fc);
      });
    }
  }, [wmsOverlays, mapLoaded]);

  // Choropleth mouseover popup — mousemove so it updates when crossing municipality borders
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '230px' });

    const buildPopup = (lngLat: maplibregl.LngLat, props: Record<string, unknown>) => {
      // Use Number() with fallback to guard against undefined/NaN coming through MapLibre's tile pipeline
      const roadCount   = Number(props.road_count)   || 0;
      const policeCount = Number(props.police_count)  || 0;
      const avbrott     = Number(props.elavbrott)     || 0;
      const score       = Number(props.score)         || 0;
      const rawScore    = Number(props.raw_score)     || 0;
      const level       = Number(props.level)         || 0;
      const name        = String(props.name || '');
      const levelColor  = level === 2 ? '#e74c3c' : level === 1 ? '#e67e22' : '#4aaa5a';

      const rows = [
        { icon: '🚔', label: 'Polis (48h)', value: policeCount },
        { icon: '🚧', label: 'Trafik',      value: roadCount   },
        { icon: '⚡', label: 'Elavbrott',   value: avbrott     },
      ];

      const rowHtml = rows.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #333;font-size:11px">
          <span style="color:#aaa">${r.icon} ${r.label}</span>
          <b style="color:${r.value > 0 ? '#eee' : '#555'}">${r.value}</b>
        </div>`).join('');

      popup.setLngLat(lngLat).setHTML(`
        <div style="font-size:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b>${name}</b>
            <span style="background:${levelColor}22;color:${levelColor};border:1px solid ${levelColor}66;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">
              ${score}/tkap
            </span>
          </div>
          ${rowHtml}
          <div style="color:#555;font-size:10px;margin-top:5px;text-align:right">råpoäng ${rawScore}</div>
        </div>`);
      if (!popup.isOpen()) popup.addTo(map);
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      // queryRenderedFeatures is more reliable than e.features for complex polygon sources
      const hits = map.queryRenderedFeatures(e.point, { layers: ['choropleth-fill'] });
      if (!hits.length) { popup.remove(); return; }
      buildPopup(e.lngLat, hits[0].properties as Record<string, unknown>);
      map.getCanvas().style.cursor = 'default';
    };

    const onLeave = () => { popup.remove(); map.getCanvas().style.cursor = ''; };

    map.on('mousemove', 'choropleth-fill', onMove);
    map.on('mouseleave', 'choropleth-fill', onLeave);
    return () => {
      map.off('mousemove', 'choropleth-fill', onMove);
      map.off('mouseleave', 'choropleth-fill', onLeave);
      popup.remove();
    };
  }, [mapLoaded]);

  // Draw in-progress polygon preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const pts = polygonPoints;
    const ring: [number, number][] = pts.length >= 2 ? [...pts, pts[0]] : pts;
    const geojson: GeoJSON.FeatureCollection = pts.length >= 2 ? {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {},
      }],
    } : { type: 'FeatureCollection', features: [] };

    const vertexGeojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
    };

    if (map.getSource('draw-preview')) {
      (map.getSource('draw-preview') as maplibregl.GeoJSONSource).setData(geojson);
      (map.getSource('draw-vertices') as maplibregl.GeoJSONSource).setData(vertexGeojson);
    } else {
      map.addSource('draw-preview', { type: 'geojson', data: geojson });
      map.addSource('draw-vertices', { type: 'geojson', data: vertexGeojson });
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-preview', paint: { 'fill-color': '#5b8cff', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'draw-line', type: 'line', source: 'draw-preview', paint: { 'line-color': '#5b8cff', 'line-width': 2, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: 'draw-dots', type: 'circle', source: 'draw-vertices', paint: { 'circle-radius': 5, 'circle-color': '#5b8cff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    }
  }, [polygonPoints]);

  // Single map-level click handler — picks topmost feature (point > line) via queryRenderedFeatures
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (addMode) return;
      try {
        // Build clickable layer list — include cluster layer only if it exists
        const clusterLayerId = 'lyr-police_events-cluster';
        const extraLayers = map.getLayer(clusterLayerId) ? [clusterLayerId] : [];
        const layerIds = [
          ...extraLayers,
          ...LAYERS.flatMap(l => [`lyr-${l.id}`, `lyr-${l.id}-outline`, `hit-${l.id}`])
            .filter(id => !!map.getLayer(id)),
        ];

        const hits = map.queryRenderedFeatures(e.point, { layers: layerIds });
        if (!hits.length) { setSelected(null); setSelectedGroup([]); return; }

        // Police cluster → zoom in and show event list
        if (hits[0].properties?.cluster) {
          const src = map.getSource('src-police_events') as maplibregl.GeoJSONSource;
          const clusterId = hits[0].properties.cluster_id as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (src as any).getClusterExpansionZoom(clusterId, (_err: unknown, zoom: number) => {
            const coords = (hits[0].geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.min(zoom + 1, 14) });
          });
          const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
          const policeFeats = features.filter(f => {
            if (f.properties.layer !== 'police_events') return false;
            const dt = f.properties.datetime || f.properties.scraped_at;
            return dt && dt > cutoff48h;
          });
          if (policeFeats.length) { setSelected(policeFeats[0]); setSelectedGroup(policeFeats); }
          return;
        }

        // Regular feature — collect all distinct at this point
        const uids = [...new Set(hits.map(h => h.properties?.uid).filter(Boolean))] as string[];
        const hitFeatures = uids.map(uid => features.find(f => f.properties.uid === uid)).filter(Boolean) as Feature[];
        if (!hitFeatures.length) { setSelected(null); setSelectedGroup([]); return; }
        setSelected(hitFeatures[0]);
        setSelectedGroup(hitFeatures);
      } catch (err) {
        console.error('Map click error:', err);
      }
    };
    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [features, addMode, mapLoaded]);

  // Fuel station hover popup with capacity/level bars
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '220px' });

    const onEnter = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const uid = e.features?.[0]?.properties?.uid as string | undefined;
      if (!uid) return;
      const feat = features.find(f => f.properties.uid === uid);
      if (!feat) return;
      const p = feat.properties;

      const TYPES = [
        { label: 'Diesel', cap: Number(p.diesel_cap_l) || 0,  pct: p.diesel_level_pct != null && p.diesel_level_pct !== '' ? Number(p.diesel_level_pct) : null },
        { label: 'Bensin', cap: Number(p.bensin_cap_l) || 0,  pct: p.bensin_level_pct != null && p.bensin_level_pct !== '' ? Number(p.bensin_level_pct) : null },
        { label: 'HVO',    cap: Number(p.hvo_cap_l) || 0,     pct: p.hvo_level_pct    != null && p.hvo_level_pct    !== '' ? Number(p.hvo_level_pct)    : null },
      ].filter(t => t.cap > 0 || t.pct !== null);

      if (!TYPES.length) return;

      const bars = TYPES.map(t => {
        const pct = t.pct ?? 0;
        const color = pct > 50 ? '#27ae60' : pct > 20 ? '#f39c12' : '#e74c3c';
        const capTxt = t.cap ? `<span style="color:#555;font-size:10px"> · ${t.cap.toLocaleString('sv')} L</span>` : '';
        const pctTxt = t.pct !== null ? `<b style="color:${color}">${pct}%</b>` : '<span style="color:#444">–</span>';
        return `
          <div style="margin-bottom:5px">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
              <span>${t.label}${capTxt}</span>${pctTxt}
            </div>
            <div style="background:#2a2a40;border-radius:3px;height:5px">
              <div style="background:${color};border-radius:3px;height:5px;width:${Math.min(pct,100)}%"></div>
            </div>
          </div>`;
      }).join('');

      const date = p.data_date ? `<div style="font-size:10px;color:#555;margin-top:6px">Uppdaterat: ${String(p.data_date)}</div>` : '';

      popup
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-size:12px;font-weight:600;margin-bottom:8px">⛽ ${String(p.name)}</div>${bars}${date}`)
        .addTo(map);
    };

    const onLeave = () => popup.remove();

    if (map.getLayer('lyr-fuel')) {
      map.on('mouseenter', 'lyr-fuel', onEnter);
      map.on('mouseleave', 'lyr-fuel', onLeave);
    }

    return () => {
      popup.remove();
      if (map.getLayer('lyr-fuel')) {
        map.off('mouseenter', 'lyr-fuel', onEnter);
        map.off('mouseleave', 'lyr-fuel', onLeave);
      }
    };
  }, [features, mapLoaded]);

  // Add mode: cursor + click/dblclick handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = addMode ? 'crosshair' : '';

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!addMode) return;
      if (isDrawMode) {
        setPolygonPoints(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
      } else {
        setAddDialog({ lngLat: e.lngLat });
        setNewName('');
        setNewFields({});
      }
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [addMode, isPolygonMode]);

  const cancelAdd = () => {
    setAddMode(false);
    setSelected(null);
    setPolygonPoints([]);
    setPolygonReady(false);
    setAddDialog(null);
  };

  const toggleLayer = (id: LayerId) => {
    setVisible(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('layerVisible', JSON.stringify([...next]));
      return next;
    });
  };

  const setAllLayers = (ids: LayerId[], show: boolean) => {
    setVisible(prev => {
      const next = new Set(prev);
      ids.forEach(id => show ? next.add(id) : next.delete(id));
      localStorage.setItem('layerVisible', JSON.stringify([...next]));
      return next;
    });
  };

  const toggleOverlay = (id: string) => {
    setWmsOverlays(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('wmsOverlays', JSON.stringify([...next]));
      return next;
    });
  };

  const counts = Object.fromEntries(LAYERS.map(l => [l.id, features.filter(f => f.properties.layer === l.id).length]));

  const submitNew = async () => {
    if (!newName.trim()) return;

    let geometry: GeoJSON.Geometry;
    if (polygonReady) {
      if (isLineMode) {
        if (polygonPoints.length < 2) return;
        geometry = { type: 'LineString', coordinates: polygonPoints };
      } else {
        if (polygonPoints.length < 3) return;
        geometry = { type: 'Polygon', coordinates: [[...polygonPoints, polygonPoints[0]]] };
      }
    } else {
      if (!addDialog) return;
      geometry = { type: 'Point', coordinates: [addDialog.lngLat.lng, addDialog.lngLat.lat] };
    }

    const fields = { ...newFields };
    if (addLayer === 'intelligence_reports' && !fields.datetime) {
      fields.datetime = new Date().toISOString();
    }

    const f = await api.createFeature({
      layer: addLayer,
      name: newName.trim(),
      geometry,
      cot_type: addLayer === 'vehicles' ? 'a-f-G-U-C-V' : 'b-m-p-s-p',
      ...fields,
    });

    setAddDialog(null);
    setPolygonPoints([]);
    setPolygonReady(false);
    setAddMode(false);
    setSelected(f as Feature);
  };

  const layerCfg = getLayer(addLayer);
  const showDialog = addDialog || polygonReady;

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Topbar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 48,
        background: '#1a1a2ecc', borderBottom: '1px solid #333',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, zIndex: 20,
        backdropFilter: 'blur(8px)',
      }}>
        <OdinLogo size="md" />
        <button className="btn-ghost btn-sm" onClick={() => setShowDash(d => !d)}>📊 Dashboard</button>
        <button className="btn-ghost btn-sm" onClick={() => setShowAnalysis(a => !a)}>📊 Analys</button>
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setShowReports(r => !r)}>🕵 Rapporter</button>}
        {canEdit && (
          <button
            className={addMode ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
            onClick={() => addMode ? cancelAdd() : setAddMode(true)}
          >
            {addMode ? '✕ Avbryt' : '+ Lägg till'}
          </button>
        )}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setShowImport(true)}>⬆ Importera</button>}
        {user?.role === 'admin' && (
          <button className="btn-ghost btn-sm" onClick={() => setShowSettings(true)}>⚙ Inställningar</button>
        )}
        <div style={{ flex: 1 }} />
        <a href="/docs/00-index.html" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#888', textDecoration: 'none', padding: '4px 8px', border: '1px solid #444', borderRadius: 4 }}>📖 Hjälp</a>
        <a href="/api/export/kmz" style={{ fontSize: 12, color: '#888', textDecoration: 'none', padding: '4px 8px', border: '1px solid #444', borderRadius: 4 }} download>⬇ KMZ</a>
        <span style={{ fontSize: 12, color: '#888' }}>
          {user?.username} <span className={`badge badge-${user?.role === 'admin' ? 'orange' : user?.role === 'editor' ? 'blue' : 'green'}`}>{user?.role}</span>
        </span>
        <button className="btn-ghost btn-sm" onClick={logout}>Logga ut</button>
      </div>

      <Sidebar
        open={sidebarOpen} onOpenChange={v => { setSidebarOpen(v); localStorage.setItem('sidebarOpen', String(v)); }}
        visible={visible} onToggle={toggleLayer} onSetAll={setAllLayers} counts={counts}
        baseMap={baseMap} overlays={wmsOverlays} onBaseMap={b => { setBaseMap(b); localStorage.setItem('baseMap', b); }} onOverlay={toggleOverlay}
        opomrFilter={opomrFilter} onOpomrFilter={setOpomrFilter}
        alerts={openAlerts} onAcknowledgeAlert={acknowledgeAlert}
        isAdmin={user?.role === 'admin'} onManageAlertRules={() => setShowAlertRules(true)}
      />

      <AlertBanner
        alerts={bannerAlerts}
        onDismiss={id => setBannerAlerts(prev => prev.filter(e => e.id !== id))}
        onAcknowledge={acknowledgeAlert}
      />

      {showDash && <Dashboard onClose={() => setShowDash(false)} />}

      <HarvestSidebar
        open={harvestOpen}
        onOpenChange={v => { setHarvestOpen(v); localStorage.setItem('harvestOpen', String(v)); }}
        onImported={loadFeatures}
      />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showAnalysis && <AnalysisPanel onClose={() => setShowAnalysis(false)} />}

      {showReports && (
        <ReportListPanel
          features={features}
          onClose={() => setShowReports(false)}
          onSelect={f => setSelected(f)}
        />
      )}

      {showAlertRules && <AlertRulesModal onClose={() => setShowAlertRules(false)} />}

      {(selected || addMode) && (
        <FeaturePanel
          feature={selected}
          group={selectedGroup}
          onSelectFromGroup={f => setSelected(f)}
          onClose={() => { cancelAdd(); setSelected(null); setSelectedGroup([]); }}
          onSaved={f => setSelected(f)}
          onDeleted={uid => { setFeatures(p => p.filter(f => f.properties.uid !== uid)); setSelected(null); setSelectedGroup([]); }}
          addMode={addMode && !showDialog}
          addLayer={addLayer}
          onAddLayerChange={id => { setAddLayer(id); setPolygonPoints([]); setPolygonReady(false); }}
          rightOffset={harvestOpen ? 230 : 10}
        />
      )}

      {/* Create dialog (point or polygon) */}
      {showDialog && (
        <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 360 }}>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>{layerCfg?.icon} Nytt {layerCfg?.label}-objekt</h3>
            {polygonReady && (
              <p style={{ fontSize: 12, color: '#5b8cff', marginBottom: 12 }}>
                {isLineMode ? `Linje med ${polygonPoints.length} punkter` : `Polygon med ${polygonPoints.length} hörn`}
              </p>
            )}
            <div className="field-row">
              <label>Namn *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && submitNew()} />
            </div>
            {layerCfg?.fields.slice(0, 3).map(f => (
              <div key={f.key} className="field-row">
                <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                {f.type === 'select' ? (
                  <select value={newFields[f.key] || ''} onChange={e => setNewFields(p => ({ ...p, [f.key]: e.target.value }))}>
                    <option value="">Välj...</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} value={newFields[f.key] || ''}
                    onChange={e => setNewFields(p => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-primary" onClick={submitNew} style={{ flex: 1 }} disabled={!newName.trim()}>Skapa</button>
              <button className="btn-ghost" onClick={() => { setAddDialog(null); setPolygonReady(false); }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportDialog onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); loadFeatures(); }} />
      )}


      {/* Bottom hint */}
      {addMode && !showDialog && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          background: '#1e1e30cc', border: '1px solid #5b8cff', borderRadius: 8,
          padding: '8px 16px', fontSize: 13, color: '#5b8cff', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {isDrawMode ? (
            isLineMode
              ? polygonPoints.length < 2
                ? `Klicka punkter för ${layerCfg?.label.toLowerCase()} (${polygonPoints.length} av minst 2)`
                : `${polygonPoints.length} punkter — fortsätt eller`
              : polygonPoints.length < 3
                ? `Klicka hörn för ${layerCfg?.label.toLowerCase()} (${polygonPoints.length} av minst 3)`
                : `${polygonPoints.length} hörn — klicka fler eller`
          ) : (
            `Klicka på kartan för att placera ${layerCfg?.label.toLowerCase()}`
          )}
          {isDrawMode && ((isLineMode && polygonPoints.length >= 2) || (!isLineMode && polygonPoints.length >= 3)) && (
            <button
              className="btn-primary btn-sm"
              onClick={() => { setPolygonReady(true); setNewName(''); setNewFields({}); }}
            >
              {isLineMode ? 'Avsluta linje' : 'Avsluta yta'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
