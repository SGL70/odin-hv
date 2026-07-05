import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { io } from 'socket.io-client';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { LAYERS } from '../types';
import type { Feature, LayerId, AlertEvent } from '../types';
import { STYLE, DRAW_LAYERS, unclassifiedRingLayer } from '../lib/mapConfig';
import { Sidebar } from './Sidebar';
import { MobileFeatureSheet } from './MobileFeatureSheet';
import { OdinLogo } from './OdinLogo';

// Mobil kartvy (Mobilversion.odp, use case 1+2) — egen, enklare kartkomponent i stället för
// att återanvända MapView.tsx rakt av (klustring/rit-lägen/skrivbordspaneler hör inte hemma
// här). Visar bara punkt-representerbara lager, samma DRAW_LAYERS-uteslutning som
// FieldReportView.tsx redan använder för fältrapporter av samma skäl.
const POINT_LAYERS = LAYERS.filter(l => !DRAW_LAYERS.includes(l.id));

// Motsvarighet till kritikalitetsringen i MapView.tsx, men skriven lokalt här i stället för
// att bryta ut den ur den redan komplexa LAYERS.forEach-blocket i MapView.tsx.
function criticalityRingLayer(layerId: LayerId, sourceId: string): maplibregl.CircleLayerSpecification {
  return {
    id: `crit-${layerId}`,
    type: 'circle', source: sourceId,
    filter: ['in', ['get', 'criticality'], ['literal', ['rod', 'gul']]],
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 3,
      'circle-stroke-color': ['match', ['get', 'criticality'], 'rod', '#e74c3c', 'gul', '#f39c12', '#888'] as maplibregl.ExpressionSpecification,
      'circle-stroke-opacity': 0.85,
    },
  };
}

interface Props {
  onAddNew: () => void;
}

export function MobileMapView({ onAddNew }: Props) {
  const { user, logout } = useAuth();
  const canEdit = user?.role === 'editor' || user?.role === 'admin';
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<Feature[]>([]);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [visible, setVisible] = useState<Set<LayerId>>(() => new Set(POINT_LAYERS.map(l => l.id)));
  const [baseMap, setBaseMap] = useState<'osm' | 'lm'>('lm');
  const [overlays, setOverlays] = useState<Set<string>>(new Set());
  const [opomrFilter, setOpomrFilter] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [openAlerts, setOpenAlerts] = useState<AlertEvent[]>([]);

  useEffect(() => { featuresRef.current = features; }, [features]);
  const selected = features.find(f => f.properties.uid === selectedUid) ?? null;

  const loadFeatures = useCallback(async (withOpomr?: boolean) => {
    const useFilter = withOpomr !== undefined ? withOpomr : opomrFilter;
    const path = useFilter ? '/features?opomr=1' : '/features';
    const fc = await api.get<GeoJSON.FeatureCollection>(path);
    setFeatures(((fc as GeoJSON.FeatureCollection).features || []) as Feature[]);
  }, [opomrFilter]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);
  useEffect(() => { api.alerts.listEvents('open').then(setOpenAlerts); }, []);
  useEffect(() => { loadFeatures(opomrFilter); }, [opomrFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acknowledgeAlert(id: number) {
    await api.alerts.acknowledge(id);
    setOpenAlerts(prev => prev.filter(e => e.id !== id));
  }

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('feature:created', (f: Feature) => setFeatures(prev => [f, ...prev.filter(p => p.properties.uid !== f.properties.uid)]));
    socket.on('feature:updated', (f: Feature) => setFeatures(prev => prev.map(p => p.properties.uid === f.properties.uid ? f : p)));
    socket.on('feature:deleted', ({ uid }: { uid: string }) => setFeatures(prev => prev.filter(p => p.properties.uid !== uid)));
    socket.on('features:reloaded', () => loadFeatures());
    socket.on('alert:triggered', (event: AlertEvent) => setOpenAlerts(prev => [event, ...prev]));
    socket.on('alert:acknowledged', (event: AlertEvent) => setOpenAlerts(prev => prev.filter(e => e.id !== event.id)));
    return () => { socket.disconnect(); };
  }, [loadFeatures]);

  // Kartinit — en gång
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE,
      center: [22.848, 66.330], zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Bas-/overlaykartlager — samma mönster som MapView.tsx
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setLayoutProperty('osm', 'visibility', baseMap === 'osm' ? 'visible' : 'none');
      map.setLayoutProperty('lm-topo', 'visibility', baseMap === 'lm' ? 'visible' : 'none');
      map.setLayoutProperty('wms-hillshade', 'visibility', overlays.has('hillshade') ? 'visible' : 'none');
      map.setLayoutProperty('wms-svk', 'visibility', overlays.has('svk') ? 'visible' : 'none');
      map.setLayoutProperty('seamark', 'visibility', overlays.has('seamark') ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [baseMap, overlays]);

  // Skapar källor/lager en gång per lager, uppdaterar bara data därefter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      for (const layer of POINT_LAYERS) {
        const sourceId = `src-${layer.id}`;
        const layerFeatures = features.filter(f => f.properties.layer === layer.id);
        const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: layerFeatures };
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (src) { src.setData(geojson); continue; }

        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: `lyr-${layer.id}`, type: 'circle', source: sourceId,
          layout: { visibility: visible.has(layer.id) ? 'visible' : 'none' },
          paint: {
            'circle-radius': 8, 'circle-color': layer.color,
            'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-opacity': 0.9,
          },
        });
        map.addLayer(criticalityRingLayer(layer.id, sourceId));
        map.addLayer(unclassifiedRingLayer(layer.id, sourceId));

        map.on('click', `lyr-${layer.id}`, e => {
          const uid = e.features?.[0]?.properties?.uid as string | undefined;
          if (uid) setSelectedUid(uid);
        });
        map.on('mouseenter', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `lyr-${layer.id}`, () => { map.getCanvas().style.cursor = ''; });
      }
    };
    if (map.isStyleLoaded()) render(); else map.once('load', render);
  }, [features]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lagersynlighet
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const layer of POINT_LAYERS) {
      const id = `lyr-${layer.id}`;
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible.has(layer.id) ? 'visible' : 'none');
    }
  }, [visible]);

  function toggleLayer(id: LayerId) {
    setVisible(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setAllLayers(ids: LayerId[], show: boolean) {
    setVisible(prev => {
      const next = new Set(prev);
      ids.forEach(id => show ? next.add(id) : next.delete(id));
      return next;
    });
  }

  const counts = Object.fromEntries(POINT_LAYERS.map(l => [l.id, features.filter(f => f.properties.layer === l.id).length]));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d16' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, background: '#1b1c2ce6', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #2e2f45', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Meny"
          style={{ background: 'none', border: 'none', color: '#eee', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
        >☰</button>
        <OdinLogo size="sm" />
        <span style={{ fontSize: 12, color: '#9ea3c0', flex: 1 }}>{user?.username}</span>
        <button className="btn-ghost btn-sm" onClick={logout}>Logga ut</button>
      </div>

      {canEdit && (
        <button
          onClick={onAddNew}
          aria-label="Ny rapport"
          style={{
            position: 'absolute', top: 66, right: 14, zIndex: 5, width: 48, height: 48, borderRadius: '50%',
            background: '#5b8cff', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer',
            boxShadow: '0 4px 14px #0006', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      )}

      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 10 }} />
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 11, width: 260, overflowY: 'auto', boxShadow: '4px 0 20px #0008' }}>
            <Sidebar
              visible={visible} onToggle={toggleLayer} onSetAll={setAllLayers} counts={counts}
              baseMap={baseMap} overlays={overlays} onBaseMap={setBaseMap} onOverlay={id => setOverlays(prev => {
                const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
              })}
              open={true} onOpenChange={open => setDrawerOpen(open)}
              opomrFilter={opomrFilter} onOpomrFilter={setOpomrFilter}
              alerts={openAlerts} onAcknowledgeAlert={acknowledgeAlert}
              isAdmin={false} onManageAlertRules={() => {}}
            />
          </div>
        </>
      )}

      {selected && (
        <MobileFeatureSheet
          feature={selected}
          onClose={() => setSelectedUid(null)}
          onClassified={updated => setFeatures(prev => prev.map(p => p.properties.uid === updated.properties.uid ? updated : p))}
        />
      )}
    </div>
  );
}
