import type { Feature } from '../types';
import { LayerIcon } from '../lib/layerIcons';

// Polygon-sökning (roadmap #11) — tre träfftyper i stället för en enda lista, eftersom
// kommun-/länsnivå-träffar bygger på grov platsangivelse (location_precision, roadmap #10)
// och inte ska blandas ihop med exakta träffar rakt av.
interface Props {
  results: { exact: Feature[]; kommun: Feature[]; lan: Feature[] };
  onClose: () => void;
  onSelect: (f: Feature) => void;
}

function Row({ f, onSelect, approx }: { f: Feature; onSelect: (f: Feature) => void; approx?: 'kommun' | 'lan' }) {
  return (
    <button
      onClick={() => onSelect(f)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#16162a', border: '1px solid #2a2a40',
        borderRadius: 4, padding: '4px 8px', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
      }}
    >
      <LayerIcon id={f.properties.layer} />
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: approx ? '#888' : '#ddd',
      }}>
        {String(f.properties.name)}
      </span>
      {approx && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#888', border: '1px solid #55555599', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
          ≈ {approx === 'kommun' ? 'kommun' : 'län'}
        </span>
      )}
    </button>
  );
}

export function PolygonSearchPanel({ results, onClose, onSelect }: Props) {
  const { exact, kommun, lan } = results;
  const total = exact.length + kommun.length + lan.length;

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 360, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🔍 Sökresultat ({total})</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ea3c0', marginBottom: 6 }}>
            Exakta träffar ({exact.length})
          </div>
          {exact.length === 0 ? (
            <div style={{ fontSize: 11, color: '#555' }}>Inga exakta träffar i ytan.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {exact.map(f => <Row key={f.properties.uid} f={f} onSelect={onSelect} />)}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>
            Kommunnivå — ungefärligt ({kommun.length})
          </div>
          {kommun.length === 0 ? (
            <div style={{ fontSize: 11, color: '#555' }}>Inga kommunnivå-träffar i ytan.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kommun.map(f => <Row key={f.properties.uid} f={f} onSelect={onSelect} approx="kommun" />)}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>
            Länsnivå — ungefärligt ({lan.length})
          </div>
          {lan.length === 0 ? (
            <div style={{ fontSize: 11, color: '#555' }}>Inga källor ger länsnivå-precision ännu.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lan.map(f => <Row key={f.properties.uid} f={f} onSelect={onSelect} approx="lan" />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
