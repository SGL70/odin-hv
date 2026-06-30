interface Props {
  baseMap: 'osm' | 'lm';
  overlays: Set<string>;
  onBaseMap: (b: 'osm' | 'lm') => void;
  onOverlay: (id: string) => void;
}

const OVERLAYS = [
  { id: 'hillshade', label: 'Terrängskuggning', icon: '🏔' },
  { id: 'svk',       label: 'Kraftnät (SVK)',   icon: '⚡' },
];

export function BaseMapControl({ baseMap, overlays, onBaseMap, onOverlay }: Props) {
  return (
    <div style={{
      background: '#1e1e30cc', border: '1px solid #444',
      borderRadius: 8, padding: '8px 10px', backdropFilter: 'blur(6px)',
      fontSize: 12, minWidth: 160,
    }}>
      <div style={{ color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
        Kartunderlag
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['osm', 'lm'] as const).map(b => (
          <button
            key={b}
            onClick={() => onBaseMap(b)}
            style={{
              flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 11,
              background: baseMap === b ? '#5b8cff' : '#2a2a40',
              color: baseMap === b ? '#fff' : '#aaa',
              border: 'none', cursor: 'pointer',
            }}
          >
            {b === 'osm' ? 'OSM' : 'Topo'}
          </button>
        ))}
      </div>
      <div style={{ color: '#888', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
        Överlager
      </div>
      {OVERLAYS.map(o => (
        <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={overlays.has(o.id)}
            onChange={() => onOverlay(o.id)}
            style={{ width: 13, height: 13 }}
          />
          <span style={{ color: overlays.has(o.id) ? '#fff' : '#aaa' }}>{o.icon} {o.label}</span>
        </label>
      ))}
    </div>
  );
}
