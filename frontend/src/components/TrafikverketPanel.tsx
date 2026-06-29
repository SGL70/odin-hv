import { useState } from 'react';
import maplibregl from 'maplibre-gl';

interface DataSource {
  id: string;
  label: string;
  layer: string;
  icon: string;
  endpoint: string;
}

const SOURCES: DataSource[] = [
  { id: 'cameras', label: 'Trafikkameror',          layer: 'cameras', icon: '📷', endpoint: '/api/trafikverket/cameras' },
  { id: 'atk',     label: 'ATK-kameror (fart)',     layer: 'cameras', icon: '🚨', endpoint: '/api/trafikverket/atk'     },
  { id: 'roads',   label: 'Vägbärighet (BK-klass)', layer: 'roads',   icon: '🛣',  endpoint: '/api/trafikverket/roads'   },
  { id: 'traffic', label: 'Trafikflöde (hastighet)', layer: 'roads',  icon: '🚗', endpoint: '/api/trafikverket/traffic'  },
  { id: 'ferries', label: 'Färjeleder',              layer: 'ports',   icon: '⛴',  endpoint: '/api/trafikverket/ferries' },
];

interface Props {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onClose: () => void;
  onImported: () => void;
}

interface GeoFeature {
  type: string;
  geometry: object;
  properties: Record<string, unknown>;
}

interface SourceResult {
  count: number;
  features: GeoFeature[];
  error?: string;
}

export function TrafikverketPanel({ mapRef, onClose, onImported }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['cameras', 'atk', 'roads', 'traffic', 'ferries']));
  const [results, setResults] = useState<Record<string, SourceResult>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState<'select' | 'preview' | 'done'>('select');

  const token = localStorage.getItem('token');

  function getBbox() {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return null;
    return {
      minlng: bounds.getWest().toFixed(6),
      minlat: bounds.getSouth().toFixed(6),
      maxlng: bounds.getEast().toFixed(6),
      maxlat: bounds.getNorth().toFixed(6),
    };
  }

  async function preview() {
    const bbox = getBbox();
    if (!bbox) return;
    setLoading(true);
    setResults({});
    setPhase('preview');

    const fetchSource = async (src: DataSource) => {
      if (!selected.has(src.id)) return;
      const params = new URLSearchParams(bbox as Record<string, string>);
      try {
        const r = await fetch(`${src.endpoint}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        setResults(prev => ({ ...prev, [src.id]: data }));
      } catch (err) {
        setResults(prev => ({ ...prev, [src.id]: { count: 0, features: [], error: String(err) } }));
      }
    };

    await Promise.all(SOURCES.map(fetchSource));
    setLoading(false);
  }

  async function importAll() {
    const allFeatures = Object.values(results).flatMap(r => r.features || []);
    if (!allFeatures.length) return;
    setImporting(true);
    try {
      const r = await fetch('/api/trafikverket/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ features: allFeatures }),
      });
      const data = await r.json();
      setResults(prev => ({ ...prev, _import: { count: data.imported, features: [], error: data.skipped > 0 ? `${data.skipped} hoppades över` : undefined } }));
      setPhase('done');
      onImported();
    } catch (err) {
      alert('Import misslyckades: ' + String(err));
    } finally {
      setImporting(false);
    }
  }

  const totalCount = Object.values(results).reduce((s, r) => s + (r.count || 0), 0);
  const importResult = results['_import'];

  return (
    <div style={{
      position: 'absolute', right: 10, top: 58, zIndex: 20,
      width: 300, background: '#1e1e30', border: '1px solid #444',
      borderRadius: 8, boxShadow: '0 4px 20px #0008',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🟡 Trafikverket Open Data</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{ padding: 14 }}>
        {phase === 'done' ? (
          <div>
            <p style={{ color: '#27ae60', fontSize: 14, marginBottom: 8 }}>
              ✅ Importerade {importResult?.count ?? 0} objekt
            </p>
            {importResult?.error && <p style={{ color: '#888', fontSize: 12 }}>{importResult.error}</p>}
            <button className="btn-primary" onClick={() => { setPhase('select'); setResults({}); }} style={{ width: '100%', marginTop: 10 }}>
              Ny import
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
              Hämtar data för <strong style={{ color: '#fff' }}>synligt kartområde</strong>. Zooma in för snabbare och mer precisa resultat.
            </p>

            <div style={{ marginBottom: 14 }}>
              {SOURCES.map(src => (
                <label key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(src.id)}
                    onChange={e => setSelected(prev => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(src.id) : next.delete(src.id);
                      return next;
                    })}
                    style={{ width: 14, height: 14 }}
                  />
                  <span>{src.icon} {src.label}</span>
                  {results[src.id] && (
                    <span style={{ marginLeft: 'auto', fontSize: 11 }}>
                      {results[src.id].error
                        ? <span style={{ color: '#e74c3c' }}>fel</span>
                        : <span style={{ color: '#27ae60' }}>{results[src.id].count} st</span>}
                    </span>
                  )}
                  {loading && selected.has(src.id) && !results[src.id] && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>…</span>
                  )}
                </label>
              ))}
            </div>

            {phase === 'select' && (
              <button className="btn-primary" onClick={preview} disabled={loading || selected.size === 0} style={{ width: '100%' }}>
                {loading ? 'Hämtar…' : 'Förhandsgranska'}
              </button>
            )}

            {phase === 'preview' && !loading && (
              <div>
                <div style={{ padding: '8px 0', borderTop: '1px solid #333', marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>Totalt: <strong style={{ color: '#5b8cff' }}>{totalCount} objekt</strong></span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary" onClick={importAll} disabled={importing || totalCount === 0} style={{ flex: 1 }}>
                    {importing ? 'Importerar…' : `Importera ${totalCount} st`}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => { setPhase('select'); setResults({}); }}>Ändra</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
