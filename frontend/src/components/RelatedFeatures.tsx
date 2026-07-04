import { useState, useEffect } from 'react';
import { api } from '../api';
import { getLayer } from '../types';
import type { Feature, LayerId } from '../types';

// ABI integration before exploitation: korrelerar det valda objektet mot andra features i
// närheten direkt i panelen, i stället för att lämna tvärlager-korrelation åt att användaren
// råkar se det på kartan.
interface Props {
  uid: string;
  onSelect?: (f: Feature) => void;
}

export function RelatedFeatures({ uid, onSelect }: Props) {
  const [radius, setRadius] = useState(500);
  const [related, setRelated] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getRelatedFeatures(uid, radius)
      .then(r => { if (!cancelled) setRelated(r); })
      .catch(() => { if (!cancelled) setRelated([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, radius]);

  const radiusLabel = radius >= 1000 ? `${radius / 1000} km` : `${radius} m`;

  return (
    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #2a2a40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>🔗 Relaterade objekt</span>
        <select
          value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          style={{ background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#aaa', fontSize: 11, padding: '2px 4px' }}
        >
          <option value={100}>100 m</option>
          <option value={500}>500 m</option>
          <option value={1000}>1 km</option>
        </select>
      </div>
      {loading ? (
        <div style={{ fontSize: 11, color: '#666' }}>Söker…</div>
      ) : related.length === 0 ? (
        <div style={{ fontSize: 11, color: '#555' }}>Inga objekt inom {radiusLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {related.map(rf => {
            const layerCfg = getLayer(rf.properties.layer as LayerId);
            return (
              <button
                key={rf.properties.uid}
                onClick={() => onSelect?.(rf)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: '#16162a',
                  border: '1px solid #2a2a40', borderRadius: 4, padding: '4px 8px',
                  cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
                }}
              >
                <span>{layerCfg?.icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(rf.properties.name)}
                </span>
                <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>{Math.round(Number(rf.properties.distance_m))} m</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
