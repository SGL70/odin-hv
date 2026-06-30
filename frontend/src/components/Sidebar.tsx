import { useState } from 'react';
import { LAYERS } from '../types';
import type { LayerId } from '../types';
import { api } from '../api';


interface Props {
  visible: Set<LayerId>;
  onToggle: (id: LayerId) => void;
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

export function Sidebar({ visible, onToggle, counts, baseMap, overlays, onBaseMap, onOverlay, open, onOpenChange }: Props) {
  const [confirmLayer, setConfirmLayer] = useState<LayerId | 'all' | null>(null);
  const [clearing, setClearing] = useState<LayerId | null>(null);

  async function clearLayer(id: LayerId) {
    setClearing(id);
    try {
      await api.clearLayer(id);
    } finally {
      setClearing(null);
      setConfirmLayer(null);
    }
  }

  const anyCount = Object.values(counts).some(c => c > 0);

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
    <div style={{
      position: 'absolute', top: 58, left: 0, bottom: 0, zIndex: 15,
      display: 'flex',
    }}>
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
          <div style={{ padding: '0 12px 6px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
            Lager
          </div>
          {LAYERS.map(layer => {
            const on = visible.has(layer.id);
            const count = counts[layer.id] ?? 0;
            const isConfirm = confirmLayer === layer.id;
            const isClearing = clearing === layer.id;

            return (
              <div key={layer.id}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '5px 12px', gap: 7 }}>
                  <button onClick={() => onToggle(layer.id)} style={{
                    display: 'flex', alignItems: 'center', flex: 1,
                    background: 'none', border: 'none', cursor: 'pointer', gap: 7, textAlign: 'left', padding: 0,
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
                  {count > 0 && !isConfirm && (
                    <button
                      onClick={() => setConfirmLayer(layer.id)}
                      title={`Rensa ${layer.label}`}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                    >🗑</button>
                  )}
                </div>

                {isConfirm && (
                  <div style={{ padding: '4px 12px 8px', background: '#16162a', borderTop: '1px solid #2a2a40' }}>
                    <div style={{ fontSize: 11, color: '#e0a020', marginBottom: 6 }}>
                      Radera {count} objekt?
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => clearLayer(layer.id)}
                        disabled={isClearing}
                        style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11, background: '#8b1a1a', color: '#fff', border: 'none', cursor: 'pointer' }}
                      >{isClearing ? '…' : 'Radera'}</button>
                      <button
                        onClick={() => setConfirmLayer(null)}
                        style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11, background: '#2a2a40', color: '#aaa', border: 'none', cursor: 'pointer' }}
                      >Avbryt</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rensa alla */}
        {anyCount && confirmLayer === null && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a40' }}>
            <button
              onClick={() => setConfirmLayer('all')}
              style={{ width: '100%', padding: '5px 0', borderRadius: 4, fontSize: 11, background: '#1a1a1a', color: '#666', border: '1px solid #333', cursor: 'pointer' }}
            >🗑 Rensa alla lager</button>
          </div>
        )}

        {confirmLayer === 'all' && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a40', background: '#16162a' }}>
            <div style={{ fontSize: 11, color: '#e0a020', marginBottom: 6 }}>Radera allt på kartan?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={async () => {
                  for (const layer of LAYERS) {
                    if ((counts[layer.id] ?? 0) > 0) await clearLayer(layer.id);
                  }
                }}
                style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11, background: '#8b1a1a', color: '#fff', border: 'none', cursor: 'pointer' }}
              >Radera allt</button>
              <button
                onClick={() => setConfirmLayer(null)}
                style={{ flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11, background: '#2a2a40', color: '#aaa', border: 'none', cursor: 'pointer' }}
              >Avbryt</button>
            </div>
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
