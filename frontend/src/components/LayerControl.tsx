import { LAYERS } from '../types';
import type { LayerId } from '../types';

interface Props {
  visible: Set<LayerId>;
  onToggle: (id: LayerId) => void;
  counts: Record<string, number>;
}

export function LayerControl({ visible, onToggle, counts }: Props) {
  return (
    <div style={{
      background: '#1e1e30ee', border: '1px solid #333', borderRadius: 8,
      padding: '10px 0', minWidth: 170,
    }}>
      <div style={{ padding: '0 12px 8px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
        Lager
      </div>
      {LAYERS.map(layer => {
        const on = visible.has(layer.id);
        return (
          <button
            key={layer.id}
            onClick={() => onToggle(layer.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 12px',
              background: on ? `${layer.color}22` : 'transparent',
              borderRadius: 0, justifyContent: 'space-between',
              color: on ? '#fff' : '#666',
              borderLeft: on ? `3px solid ${layer.color}` : '3px solid transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{layer.icon}</span>
              <span style={{ fontSize: 13 }}>{layer.label}</span>
            </span>
            {counts[layer.id] !== undefined && (
              <span style={{
                background: on ? layer.color : '#333',
                color: '#fff', borderRadius: 10,
                padding: '1px 7px', fontSize: 11,
              }}>
                {counts[layer.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
