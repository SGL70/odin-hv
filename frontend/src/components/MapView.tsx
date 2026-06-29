import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { api } from '../api';
import { LAYERS, getLayer } from '../types';
import type { Feature, LayerId } from '../types';
import { LayerControl } from './LayerControl';
import { FeaturePanel } from './FeaturePanel';
import { Dashboard } from './Dashboard';
import { ImportDialog } from './ImportDialog';
import { TrafikverketPanel } from './TrafikverketPanel';
import { HarvestPanel } from './HarvestPanel';
import { BaseMapControl } from './BaseMapControl';
import { useAuth } from '../contexts/AuthContext';
import { io } from 'socket.io-client';

const LM_TOPO_URL = 'https://minkarta.lantmateriet.se/map/topowebb/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=topowebbkartan&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png';
const LM_HILL_URL = 'https://minkarta.lantmateriet.se/map/hojdmodell/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=terrangskuggning&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true';
const SVK_URL = 'https://inspire-skn.metria.se/geoserver/skn/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=US.ElectricityNetwork.Lines,US.ElectricityNetwork.Pylons,US.ElectricityNetwork.Stations&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true';

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm:            { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    'lm-topo':      { type: 'raster', tiles: [LM_TOPO_URL], tileSize: 256, attribution: '© Lantmäteriet CC BY' },
    'wms-hillshade':{ type: 'raster', tiles: [LM_HILL_URL], tileSize: 256, attribution: '© Lantmäteriet' },
    'wms-svk':      { type: 'raster', tiles: [SVK_URL],     tileSize: 256, attribution: '© Svenska kraftnät' },
  },
  layers: [
    { id: 'osm',             type: 'raster', source: 'osm' },
    { id: 'lm-topo',         type: 'raster', source: 'lm-topo',       layout: { visibility: 'none' } },
    { id: 'wms-hillshade',   type: 'raster', source: 'wms-hillshade', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
    { id: 'wms-svk',         type: 'raster', source: 'wms-svk',       layout: { visibility: 'none' } },
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
  const [visible, setVisible] = useState<Set<LayerId>>(new Set(LAYERS.map(l => l.id)));
  const [selected, setSelected] = useState<Feature | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addLayer, setAddLayer] = useState<LayerId>('fuel');
  const [showDash, setShowDash] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTrv, setShowTrv] = useState(false);
  const [showHarvest, setShowHarvest] = useState(false);
  const [baseMap, setBaseMap] = useState<'osm' | 'lm'>('osm');
  const [wmsOverlays, setWmsOverlays] = useState<Set<string>>(new Set());
  const [addDialog, setAddDialog] = useState<{ lngLat: maplibregl.LngLat } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polygonReady, setPolygonReady] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<Record<string, string>>({});

  const canEdit = user?.role === 'editor' || user?.role === 'admin';
  const isPolygonMode = addMode && POLYGON_LAYERS.includes(addLayer);
  const isLineMode = addMode && LINE_LAYERS.includes(addLayer);
  const isDrawMode = addMode && DRAW_LAYERS.includes(addLayer);

  const loadFeatures = useCallback(async () => {
    const fc = await api.getFeatures();
    setFeatures((fc.features || []) as Feature[]);
  }, []);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  // Socket.io real-time
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('feature:created', (f: Feature) => setFeatures(prev => [f, ...prev.filter(p => p.properties.uid !== f.properties.uid)]));
    socket.on('feature:updated', (f: Feature) => setFeatures(prev => prev.map(p => p.properties.uid === f.properties.uid ? f : p)));
    socket.on('feature:deleted', ({ uid }: { uid: string }) => setFeatures(prev => prev.filter(p => p.properties.uid !== uid)));
    socket.on('features:reloaded', () => loadFeatures());
    return () => { socket.disconnect(); };
  }, [loadFeatures]);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [15.6, 58.4],
      zoom: 6,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    return () => map.remove();
  }, []);

  // Sync features to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    LAYERS.forEach(layer => {
      const sourceId = `src-${layer.id}`;
      const layerFeatures = features.filter(f => f.properties.layer === layer.id);
      const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: layerFeatures };

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        return;
      }

      map.addSource(sourceId, { type: 'geojson', data: geojson });

      if (LINE_LAYERS.includes(layer.id)) {
        const dashed = layer.id === 'tunnels';
        map.addLayer({
          id: `lyr-${layer.id}`,
          type: 'line', source: sourceId,
          layout: { visibility: 'visible' },
          paint: {
            'line-color': layer.color,
            'line-width': layer.id === 'roads' ? 4 : layer.id === 'railways' ? 3 : 2,
            'line-opacity': 0.85,
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
        map.addLayer({
          id: `lbl-${layer.id}`,
          type: 'symbol', source: sourceId,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', visibility: 'visible' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
        });
      }

      map.on('click', `lyr-${layer.id}`, e => {
        if (addMode) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const feat = features.find(f => f.properties.uid === props.uid);
        if (feat) setSelected(feat);
      });
      map.on('mouseenter', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = addMode ? 'crosshair' : ''; });
    });
  }, [features, addMode]);

  // Visibility toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    LAYERS.forEach(layer => {
      const vis = visible.has(layer.id) ? 'visible' : 'none';
      if (map.getLayer(`lyr-${layer.id}`)) map.setLayoutProperty(`lyr-${layer.id}`, 'visibility', vis);
      if (map.getLayer(`lyr-${layer.id}-outline`)) map.setLayoutProperty(`lyr-${layer.id}-outline`, 'visibility', vis);
      if (map.getLayer(`lbl-${layer.id}`)) map.setLayoutProperty(`lbl-${layer.id}`, 'visibility', vis);
    });
  }, [visible]);

  // Base map switch: OSM ↔ Lantmäteriet topo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('osm'))     map.setLayoutProperty('osm',     'visibility', baseMap === 'osm' ? 'visible' : 'none');
    if (map.getLayer('lm-topo')) map.setLayoutProperty('lm-topo', 'visibility', baseMap === 'lm'  ? 'visible' : 'none');
  }, [baseMap]);

  // WMS overlays: terrängskuggning + SVK kraftnät
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = (id: string) => wmsOverlays.has(id) ? 'visible' : 'none';
    if (map.getLayer('wms-hillshade')) map.setLayoutProperty('wms-hillshade', 'visibility', vis('hillshade'));
    if (map.getLayer('wms-svk'))       map.setLayoutProperty('wms-svk',       'visibility', vis('svk'));
  }, [wmsOverlays]);

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
      return next;
    });
  };

  const toggleOverlay = (id: string) => {
    setWmsOverlays(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

    const f = await api.createFeature({
      layer: addLayer,
      name: newName.trim(),
      geometry,
      cot_type: addLayer === 'vehicles' ? 'a-f-G-U-C-V' : 'b-m-p-s-p',
      ...newFields,
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
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginRight: 8 }}>🗺 Resursläge</span>
        <button className="btn-ghost btn-sm" onClick={() => setShowDash(d => !d)}>📊 Dashboard</button>
        {canEdit && (
          <button
            className={addMode ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
            onClick={() => addMode ? cancelAdd() : setAddMode(true)}
          >
            {addMode ? '✕ Avbryt' : '+ Lägg till'}
          </button>
        )}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setShowImport(true)}>⬆ Importera</button>}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setShowTrv(t => !t)}>🟡 Trafikverket</button>}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setShowHarvest(h => !h)}>🕷 Skörda</button>}
        <div style={{ flex: 1 }} />
        <a href="/api/export/kmz" style={{ fontSize: 12, color: '#888', textDecoration: 'none', padding: '4px 8px', border: '1px solid #444', borderRadius: 4 }} download>⬇ KMZ</a>
        <span style={{ fontSize: 12, color: '#888' }}>
          {user?.username} <span className={`badge badge-${user?.role === 'admin' ? 'orange' : user?.role === 'editor' ? 'blue' : 'green'}`}>{user?.role}</span>
        </span>
        <button className="btn-ghost btn-sm" onClick={logout}>Logga ut</button>
      </div>

      <div style={{ position: 'absolute', top: 58, left: 10, zIndex: 10 }}>
        <LayerControl visible={visible} onToggle={toggleLayer} counts={counts} />
      </div>

      {showDash && (
        <div style={{ position: 'absolute', top: 58, left: 190, zIndex: 10 }}>
          <Dashboard onClose={() => setShowDash(false)} />
        </div>
      )}

      {showTrv && (
        <TrafikverketPanel
          mapRef={mapRef}
          onClose={() => setShowTrv(false)}
          onImported={loadFeatures}
        />
      )}

      {showHarvest && (
        <HarvestPanel
          onClose={() => setShowHarvest(false)}
          onImported={loadFeatures}
        />
      )}

      {(selected || addMode) && (
        <FeaturePanel
          feature={selected}
          onClose={cancelAdd}
          onSaved={f => setSelected(f)}
          onDeleted={uid => { setFeatures(p => p.filter(f => f.properties.uid !== uid)); setSelected(null); }}
          addMode={addMode && !showDialog}
          addLayer={addLayer}
          onAddLayerChange={id => { setAddLayer(id); setPolygonPoints([]); setPolygonReady(false); }}
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

      <BaseMapControl
        baseMap={baseMap}
        overlays={wmsOverlays}
        onBaseMap={setBaseMap}
        onOverlay={toggleOverlay}
      />

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
