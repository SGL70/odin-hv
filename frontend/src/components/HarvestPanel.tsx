import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { IconClose, IconWarning } from '../lib/uiIcons';

interface Source {
  id: string;
  label: string;
  icon: string;
  layer: string;
  previewEndpoint: string;
  scrapeEndpoint: string;
}

const SOURCES: Source[] = [
  {
    id: 'combined',
    label: 'OSM + OKQ8 webb',
    icon: '⭐',
    layer: 'fuel',
    previewEndpoint: '/api/harvest/combined/preview',
    scrapeEndpoint: '/api/harvest/combined/scrape',
  },
  {
    id: 'skoogs',
    label: 'Skoogs',
    icon: '🪣',
    layer: 'fuel',
    previewEndpoint: '/api/harvest/skoogs/preview',
    scrapeEndpoint: '/api/harvest/skoogs/scrape',
  },
  {
    id: 'osm',
    label: 'Bara OSM',
    icon: '🗺',
    layer: 'fuel',
    previewEndpoint: '/api/harvest/osm/preview',
    scrapeEndpoint: '/api/harvest/osm/scrape',
  },
  {
    id: 'okq8',
    label: 'Bara OKQ8 webb',
    icon: '⛽',
    layer: 'fuel',
    previewEndpoint: '/api/harvest/okq8/preview',
    scrapeEndpoint: '/api/harvest/okq8/scrape',
  },
];

interface Progress {
  done: number;
  total: number;
  phase?: string;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function HarvestPanel({ onClose, onImported }: Props) {
  const [selected, setSelected] = useState<string>('combined');
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('harvest:progress', (data: { source: string; done: number; total: number; phase?: string }) => {
      if (data.source === selected) setProgress({ done: data.done, total: data.total, phase: data.phase });
    });
    socket.on('harvest:done', (data: { source: string; imported: number; skipped: number }) => {
      if (data.source === selected) {
        setProgress(null);
        setDone({ imported: data.imported, skipped: data.skipped });
        onImported();
      }
    });
    return () => { socket.disconnect(); };
  }, [selected, onImported]);

  const src = SOURCES.find(s => s.id === selected)!;

  async function loadPreview() {
    setLoadingPreview(true);
    setPreview(null);
    setError(null);
    try {
      const r = await fetch(src.previewEndpoint, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setPreview(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function startScrape() {
    setError(null);
    setDone(null);
    setProgress({ done: 0, total: preview?.total || 0 });
    try {
      const r = await fetch(src.scrapeEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      setError(String(e));
      setProgress(null);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{
      position: 'absolute', right: 10, top: 58, zIndex: 20,
      width: 300, background: '#1e1e30', border: '1px solid #444',
      borderRadius: 8, boxShadow: '0 4px 20px #0008',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🕷 Dataskördare</span>
        <button className="btn-ghost btn-sm" onClick={onClose}><IconClose /></button>
      </div>

      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          Hämtar stationsadresser och koordinater direkt från bolagens webbplatser och importerar till rätt lager.
        </p>

        {/* Source selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Datakälla</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SOURCES.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelected(s.id); setPreview(null); setDone(null); setProgress(null); setError(null); }}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 12, border: 'none', cursor: 'pointer',
                  background: selected === s.id ? '#5b8cff' : '#2a2a40',
                  color: selected === s.id ? '#fff' : '#aaa',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>
          Lager: <strong style={{ color: '#aaa' }}>{src.layer}</strong>
        </div>

        {/* Error */}
        {error && <p style={{ color: '#e74c3c', fontSize: 12, marginBottom: 10 }}><IconWarning size={12} /> {error}</p>}

        {/* Done state */}
        {done && !progress && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ color: '#27ae60', fontSize: 13 }}>✅ Klar!</p>
            <p style={{ color: '#aaa', fontSize: 12 }}>
              {done.imported} importerade{done.skipped > 0 ? `, ${done.skipped} hoppades över (duplicat)` : ''}
            </p>
            <button className="btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setDone(null); setPreview(null); }}>
              Kör igen
            </button>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaa', marginBottom: 6 }}>
              <span>{progress.phase || 'Hämtar stationer…'}</span>
              <span>{progress.total > 1 ? `${progress.done} / ${progress.total}` : '…'}</span>
            </div>
            <div style={{ background: '#2a2a40', borderRadius: 4, height: 6 }}>
              <div style={{ background: '#5b8cff', borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Preview + actions */}
        {!progress && !done && (
          <>
            {preview ? (
              <div>
                <p style={{ fontSize: 13, marginBottom: 10 }}>
                  Hittade <strong style={{ color: '#5b8cff' }}>{preview.total}</strong> stationer
                </p>
                <button className="btn-primary" onClick={startScrape} style={{ width: '100%' }}>
                  Skörda och importera alla
                </button>
                <p style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                  {selected === 'combined'
                    ? 'OSM (~60 s) + OKQ8 webb (~30 s). Dubbletter tas bort, befintliga stationer rensas.'
                    : selected === 'osm'
                    ? 'En förfrågan, ~60 s. Circle K, OKQ8, Preem och St1 importeras på en gång.'
                    : `Tar ~${Math.ceil(Number(preview.total) / 6 * 0.2 / 60)} min. Duplicat hoppas över automatiskt.`
                  }
                </p>
              </div>
            ) : (
              <button className="btn-primary" onClick={loadPreview} disabled={loadingPreview} style={{ width: '100%' }}>
                {loadingPreview ? 'Kontrollerar…' : 'Kontrollera källa'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
