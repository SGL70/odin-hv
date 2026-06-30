import { LAYERS } from '../types';
import type { LayerId } from '../types';

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
}

const OVERLAYS = [
  { id: 'hillshade', label: 'Terrängskuggning', icon: '🏔' },
  { id: 'svk',       label: 'Kraftnät (SVK)',   icon: '⚡' },
];

export function Sidebar({ visible, onToggle, onSetAll, counts, baseMap, overlays, onBaseMap, onOverlay, open, onOpenChange }: Props) {
  const allHidden = LAYERS.every(l => !visible.has(l.id));
  const allVisible = LAYERS.every(l => visible.has(l.id));

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
        title="Visa lager och kartunderlag"
      >›</button>
    );
  }

  return (
    <div style={{ position: 'absolute', top: 58, left: 0, bottom: 0, zIndex: 15, display: 'flex' }}>
      {/* Panel */}
      <div style={{
        width: 180, background: '#1e1e30ee', borderRight: '1px solid #333',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        backdropFilter: 'blur(8px)',
      }}>
        {/* Kartunderlag */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #2a2a40' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Kartunderlag
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['osm', 'lm'] as const).map(b => (
              <button key={b} onClick={() => onBaseMap(b)} style={{
                flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11,
                background: baseMap === b ? '#5b8cff' : '#2a2a40',
                color: baseMap === b ? '#fff' : '#aaa',
                border: 'none', cursor: 'pointer',
              }}>
                {b === 'osm' ? 'OSM' : 'Topo'}
              </button>
            ))}
          </div>
          {OVERLAYS.map(o => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={overlays.has(o.id)} onChange={() => onOverlay(o.id)} style={{ width: 13, height: 13 }} />
              <span style={{ fontSize: 11, color: overlays.has(o.id) ? '#fff' : '#aaa' }}>{o.icon} {o.label}</span>
            </label>
          ))}
        </div>

        {/* Lager */}
        <div style={{ padding: '8px 0', flex: 1 }}>
          <div style={{ padding: '0 12px 6px', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Lager</span>
            <button
              onClick={() => onSetAll(LAYERS.map(l => l.id), allHidden)}
              style={{ background: 'none', border: 'none', color: '#555', fontSize: 10, cursor: 'pointer', padding: '0 2px' }}
              title={allHidden ? 'Visa alla' : 'Dölj alla'}
            >{allHidden ? '◉' : '○'}</button>
          </div>
          {LAYERS.map(layer => {
            const on = visible.has(layer.id);
            const count = counts[layer.id] ?? 0;
            return (
              <button key={layer.id} onClick={() => onToggle(layer.id)} style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '5px 12px', background: 'none', border: 'none',
                cursor: 'pointer', gap: 7, textAlign: 'left',
              }}>
                <span style={{ fontSize: 13, opacity: on ? 1 : 0.35 }}>{layer.icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: on ? '#e0e0e0' : '#555' }}>{layer.label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, background: on ? layer.color : '#333',
                    color: '#fff', borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Visa/dölj alla */}
        {!allHidden && !allVisible && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a40', display: 'flex', gap: 4 }}>
            <button onClick={() => onSetAll(LAYERS.map(l => l.id), true)}
              style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, background: '#2a2a40', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              Visa alla
            </button>
            <button onClick={() => onSetAll(LAYERS.map(l => l.id), false)}
              style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, background: '#2a2a40', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              Dölj alla
            </button>
          </div>
        )}
        {allVisible && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a40' }}>
            <button onClick={() => onSetAll(LAYERS.map(l => l.id), false)}
              style={{ width: '100%', padding: '4px 0', borderRadius: 4, fontSize: 10, background: '#2a2a40', color: '#aaa', border: 'none', cursor: 'pointer' }}>
              Dölj alla lager
            </button>
          </div>
        )}
        {allHidden && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a40' }}>
            <button onClick={() => onSetAll(LAYERS.map(l => l.id), true)}
              style={{ width: '100%', padding: '4px 0', borderRadius: 4, fontSize: 10, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Visa alla lager
            </button>
          </div>
        )}
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
