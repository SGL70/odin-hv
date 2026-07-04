import { useState } from 'react';
import { LAYERS } from '../types';
import type { LayerId, LayerGroup, AlertEvent } from '../types';

interface Props {
  visible: Set<LayerId>;
  onToggle: (id: LayerId) => void;
  onSetAll: (ids: LayerId[], show: boolean) => void;
  counts: Record<string, number>;
  baseMap: 'osm' | 'lm';
  overlays: Set<string>;
  onBaseMap: (b: 'osm' | 'lm') => void;
  onOverlay: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opomrFilter: boolean;
  onOpomrFilter: (v: boolean) => void;
  alerts: AlertEvent[];
  onAcknowledgeAlert: (id: number) => void;
  isAdmin: boolean;
  onManageAlertRules: () => void;
}

const WMS_OVERLAYS = [
  { id: 'hillshade', label: 'Terrängskuggning',     icon: '🏔' },
  { id: 'svk',       label: 'Kraftnät (SVK)',       icon: '⚡' },
  { id: 'seamark',   label: 'Sjökort (OpenSeaMap)', icon: '⚓' },
];

const GROUPS: { id: LayerGroup; label: string; icon: string }[] = [
  { id: 'events',    label: 'Händelser',   icon: '🔔' },
  { id: 'layers',    label: 'Lager',       icon: '🗂' },
  { id: 'resources', label: 'Resurser',    icon: '📦' },
];

export function Sidebar({
  visible, onToggle, onSetAll, counts,
  baseMap, overlays, onBaseMap, onOverlay,
  open, onOpenChange,
  opomrFilter, onOpomrFilter,
  alerts, onAcknowledgeAlert, isAdmin, onManageAlertRules,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['events', 'layers', 'analysis', 'alerts'])
  );

  function toggleGroup(g: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(g) ? n.delete(g) : n.add(g);
      return n;
    });
  }

  function groupLayers(g: LayerGroup) {
    return LAYERS.filter(l => l.group === g);
  }

  function groupAllVisible(g: LayerGroup) {
    return groupLayers(g).every(l => visible.has(l.id));
  }

  function groupAllHidden(g: LayerGroup) {
    return groupLayers(g).every(l => !visible.has(l.id));
  }

  function toggleGroupAll(g: LayerGroup) {
    const ids = groupLayers(g).map(l => l.id);
    onSetAll(ids, groupAllHidden(g));
  }

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        style={{
          position: 'absolute', top: 66, left: 0, zIndex: 15,
          background: '#1e1e30ee', border: '1px solid #333',
          borderLeft: 'none', borderRadius: '0 6px 6px 0',
          color: '#aaa', fontSize: 16, width: 22, height: 40,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Visa lager"
      >›</button>
    );
  }

  const choroplethOn = overlays.has('choropleth');
  const analysisExpanded = expanded.has('analysis');

  return (
    <div style={{ position: 'absolute', top: 58, left: 0, bottom: 0, zIndex: 15, display: 'flex' }}>
      <div style={{
        width: 188, background: '#1e1e30ee', borderRight: '1px solid #333',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        backdropFilter: 'blur(8px)',
      }}>

        {/* OpOmr-filter */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a40' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={opomrFilter}
              onChange={e => onOpomrFilter(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#5b8cff' }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: opomrFilter ? '#7aaeff' : '#666', letterSpacing: 0.3 }}>
              🗺 Filtrera på OpOmr
            </span>
          </label>
        </div>

        {/* Varningar */}
        <div style={{ borderBottom: '1px solid #2a2a40' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px 7px 12px', gap: 6, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleGroup('alerts')}>
            <span style={{ fontSize: 12, flex: 1, color: alerts.length > 0 ? '#f5a' : '#ccc', fontWeight: 600 }}>
              ⚠ Varningar
            </span>
            {alerts.length > 0 && (
              <span style={{ fontSize: 9, background: '#e74c3c', color: '#fff', borderRadius: 8, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>
                {alerts.length}
              </span>
            )}
            <button onClick={e => { e.stopPropagation(); toggleGroup('alerts'); }} style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>
              {expanded.has('alerts') ? '▲' : '▼'}
            </button>
          </div>
          {expanded.has('alerts') && (
            <div style={{ paddingBottom: 6 }}>
              {alerts.length === 0 && (
                <div style={{ padding: '2px 10px 6px 28px', fontSize: 11, color: '#555' }}>Inga öppna varningar</div>
              )}
              {alerts.map(a => (
                <div key={a.id} style={{ padding: '4px 10px 4px 28px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, color: '#ddd', lineHeight: 1.3 }}>{a.message}</span>
                  <button
                    onClick={() => onAcknowledgeAlert(a.id)}
                    style={{ alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 4, fontSize: 10, background: '#2a2a40', color: '#8ab', border: '1px solid #444', cursor: 'pointer' }}
                  >Kvittera</button>
                </div>
              ))}
              {isAdmin && (
                <button
                  onClick={onManageAlertRules}
                  style={{ display: 'block', width: 'calc(100% - 38px)', margin: '6px 10px 0 28px', padding: '4px 0', borderRadius: 4, fontSize: 11, background: '#2a2a40', color: '#aaa', border: '1px solid #444', cursor: 'pointer' }}
                >⚙ Hantera regler</button>
              )}
            </div>
          )}
        </div>

        {/* Analys */}
        <div style={{ borderBottom: '1px solid #2a2a40' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px 7px 12px', gap: 6, userSelect: 'none' }}>
            <button
              onClick={() => onOverlay('choropleth')}
              title={choroplethOn ? 'Dölj' : 'Visa'}
              style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: choroplethOn ? '#5b8cff' : 'transparent',
                border: `1.5px solid ${choroplethOn ? '#5b8cff' : '#444'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {choroplethOn && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
            </button>
            <span style={{ fontSize: 12, flex: 1, color: '#ccc', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleGroup('analysis')}>
              📊 Analys
            </span>
            <button onClick={() => toggleGroup('analysis')} style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>
              {analysisExpanded ? '▲' : '▼'}
            </button>
          </div>
          {analysisExpanded && (
            <div style={{ paddingBottom: 4 }}>
              <button
                onClick={() => onOverlay('choropleth')}
                style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '4px 10px 4px 28px', background: 'none', border: 'none', cursor: 'pointer', gap: 7, textAlign: 'left' }}
              >
                <span style={{ fontSize: 13, opacity: choroplethOn ? 1 : 0.3, flexShrink: 0 }}>🟥</span>
                <span style={{ flex: 1, fontSize: 11, color: choroplethOn ? '#ddd' : '#555' }}>Störningskarta</span>
              </button>
            </div>
          )}
        </div>

        {/* Layer groups: Händelser, Lager, Resurser */}
        {GROUPS.map(group => {
          const layers = groupLayers(group.id);
          const isExpanded = expanded.has(group.id);
          const allOn = groupAllVisible(group.id);
          const allOff = groupAllHidden(group.id);
          const totalCount = layers.reduce((s, l) => s + (counts[l.id] ?? 0), 0);

          return (
            <div key={group.id} style={{ borderBottom: '1px solid #2a2a40' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px 7px 12px', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <button
                  onClick={() => toggleGroupAll(group.id)}
                  title={allOff ? 'Visa alla' : 'Dölj alla'}
                  style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    background: allOn ? '#5b8cff' : allOff ? 'transparent' : '#2a4a7f',
                    border: `1.5px solid ${allOn ? '#5b8cff' : '#444'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {!allOff && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{ fontSize: 12, flex: 1, color: '#ccc', fontWeight: 600 }} onClick={() => toggleGroup(group.id)}>
                  {group.icon} {group.label}
                </span>
                {totalCount > 0 && (
                  <span style={{ fontSize: 10, color: '#666', minWidth: 20, textAlign: 'right' }}>{totalCount}</span>
                )}
                <button onClick={() => toggleGroup(group.id)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>

              {isExpanded && (
                <div style={{ paddingBottom: 4 }}>
                  {layers.map(layer => {
                    const on = visible.has(layer.id);
                    const count = counts[layer.id] ?? 0;
                    return (
                      <button
                        key={layer.id}
                        onClick={() => onToggle(layer.id)}
                        style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '4px 10px 4px 28px', background: 'none', border: 'none', cursor: 'pointer', gap: 7, textAlign: 'left' }}
                      >
                        <span style={{ fontSize: 13, opacity: on ? 1 : 0.3, flexShrink: 0 }}>{layer.icon}</span>
                        <span style={{ flex: 1, fontSize: 11, color: on ? '#ddd' : '#555' }}>{layer.label}</span>
                        {count > 0 && (
                          <span style={{ fontSize: 9, background: on ? layer.color : '#333', color: '#fff', borderRadius: 8, padding: '1px 5px', minWidth: 16, textAlign: 'center', flexShrink: 0 }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Kartunderlag */}
        <div style={{ borderBottom: '1px solid #2a2a40' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px 7px 12px', gap: 6, cursor: 'pointer' }}
            onClick={() => toggleGroup('basemap')}>
            <span style={{ fontSize: 12, flex: 1, color: '#ccc', fontWeight: 600 }}>🗺 Kartunderlag</span>
            <span style={{ fontSize: 11, color: '#555' }}>{expanded.has('basemap') ? '▲' : '▼'}</span>
          </div>
          {expanded.has('basemap') && (
            <div style={{ padding: '0 12px 10px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {(['osm', 'lm'] as const).map(b => (
                  <button key={b} onClick={() => onBaseMap(b)} style={{
                    flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11,
                    background: baseMap === b ? '#5b8cff' : '#2a2a40',
                    color: baseMap === b ? '#fff' : '#888',
                    border: 'none', cursor: 'pointer',
                  }}>
                    {b === 'osm' ? 'OSM' : 'Topo'}
                  </button>
                ))}
              </div>
              {WMS_OVERLAYS.map(o => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={overlays.has(o.id)} onChange={() => onOverlay(o.id)} style={{ width: 13, height: 13 }} />
                  <span style={{ fontSize: 11, color: overlays.has(o.id) ? '#fff' : '#888' }}>{o.icon} {o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Collapse button */}
      <button
        onClick={() => onOpenChange(false)}
        style={{
          background: '#1e1e30ee', border: '1px solid #333',
          borderLeft: 'none', borderRadius: '0 6px 6px 0',
          color: '#aaa', fontSize: 16, width: 22, height: 40,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          alignSelf: 'flex-start', marginTop: 8, flexShrink: 0,
        }}
        title="Dölj"
      >‹</button>
    </div>
  );
}
