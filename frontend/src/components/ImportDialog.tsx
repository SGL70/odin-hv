import { useState, useRef } from 'react';
import { api } from '../api';
import { LAYERS } from '../types';
import type { LayerId } from '../types';

interface Props { onClose: () => void; onImported: (layer: LayerId) => void }

export function ImportDialog({ onClose, onImported }: Props) {
  const [layer, setLayer] = useState<LayerId>('fuel');
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async () => {
    const file = ref.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    const r = await api.importCSV(layer, file);
    setResult(r);
    setLoading(false);
    if (r.imported > 0) onImported(layer);
  };

  return (
    <div style={overlay}>
      <div style={dialog}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16 }}>Importera CSV</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="field-row">
          <label>Lager</label>
          <select value={layer} onChange={e => setLayer(e.target.value as LayerId)}>
            {LAYERS.map(l => <option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
          </select>
        </div>

        <div className="field-row" style={{ marginTop: 12 }}>
          <label>CSV-fil</label>
          <input type="file" ref={ref} accept=".csv" style={{ border: 'none', padding: 0, background: 'none', color: '#e0e0e0' }} />
        </div>

        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          Obligatoriska kolumner: <code style={{ color: '#5b8cff' }}>lat</code>, <code style={{ color: '#5b8cff' }}>lon</code>, <code style={{ color: '#5b8cff' }}>name</code>
          <br />Övriga kolumner sparas som attribut.
        </div>

        {result && (
          <div style={{ marginTop: 12, padding: 10, background: '#2a2a3e', borderRadius: 6, fontSize: 13 }}>
            ✅ Importerade: <strong>{result.imported}</strong>
            {result.failed > 0 && <span style={{ color: '#e74c3c' }}>  ❌ Misslyckades: {result.failed}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" onClick={upload} disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Importerar...' : 'Importera'}
          </button>
          <button className="btn-ghost" onClick={onClose}>Stäng</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000a', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dialog: React.CSSProperties = {
  background: '#1e1e30', border: '1px solid #444', borderRadius: 10,
  padding: 24, width: 400, boxShadow: '0 20px 60px #0008',
};
