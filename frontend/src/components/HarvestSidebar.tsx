import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Source {
  id: string;
  label: string;
  previewEndpoint: string;
  scrapeEndpoint: string;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  defaultSource: string;
  sources: Source[];
  placeholder?: boolean;
  auto?: boolean;        // API-driven, kan schemaläggas
  note?: string;         // visningsnotering
}

// Intervals in minutes (0 = manual only)
const REFRESH_OPTIONS = [
  { value: 0,  label: 'Manuell' },
  { value: 5,  label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

const CATEGORIES: Category[] = [
  {
    id: 'police',
    label: 'Polishändelser',
    icon: '🚔',
    defaultSource: 'police',
    auto: true,
    note: 'Senaste 48h · OpOmr-filtrerat',
    sources: [
      { id: 'police', label: 'Polisen öppna API', previewEndpoint: '/api/harvest/police/preview', scrapeEndpoint: '/api/harvest/police/scrape' },
    ],
  },
  {
    id: 'situations',
    label: 'Trafikhändelser',
    icon: '🚧',
    defaultSource: 'situations',
    auto: true,
    note: 'Olyckor · Vägarbeten · Hinder',
    sources: [
      { id: 'situations', label: 'Trafikverket Situation', previewEndpoint: '/api/harvest/situations/preview', scrapeEndpoint: '/api/harvest/situations/scrape' },
    ],
  },
  {
    id: 'power',
    label: 'Elavbrott',
    icon: '⚡',
    defaultSource: 'power',
    auto: true,
    note: 'Vattenfall · PiteEnergi · 27 leverantörer · OpOmr-filtrerat',
    sources: [
      { id: 'power', label: 'avbrott.se (realtid)', previewEndpoint: '/api/harvest/power/preview', scrapeEndpoint: '/api/harvest/power/scrape' },
    ],
  },
  {
    id: 'weather',
    label: 'Vädervarningar',
    icon: '⛈',
    defaultSource: 'weather-warnings',
    auto: true,
    note: 'SMHI IBW · OpOmr-filtrerat',
    sources: [
      { id: 'weather-warnings', label: 'SMHI IBW', previewEndpoint: '/api/harvest/weather-warnings/preview', scrapeEndpoint: '/api/harvest/weather-warnings/scrape' },
    ],
  },
  {
    id: 'trv-cameras',
    label: 'Trafikkameror',
    icon: '📷',
    defaultSource: 'trv-cameras',
    note: 'Trafikverket · OpOmr',
    sources: [
      { id: 'trv-cameras', label: 'Trafikkameror (TRV)',  previewEndpoint: '/api/harvest/trv-cameras/preview', scrapeEndpoint: '/api/harvest/trv-cameras/scrape' },
      { id: 'trv-atk',     label: 'ATK-kameror (fart)',   previewEndpoint: '/api/harvest/trv-atk/preview',     scrapeEndpoint: '/api/harvest/trv-atk/scrape'     },
    ],
  },
  {
    id: 'trv-roads',
    label: 'Vägbärighet (BK-klass)',
    icon: '🛣',
    defaultSource: 'trv-roads',
    note: 'NVDB · statisk · OpOmr-filtrerat',
    sources: [
      { id: 'trv-roads', label: 'NVDB via Trafikverket', previewEndpoint: '/api/harvest/trv-roads/preview', scrapeEndpoint: '/api/harvest/trv-roads/scrape' },
    ],
  },
  {
    id: 'trv-traffic',
    label: 'Trafikflöde',
    icon: '🚗',
    defaultSource: 'trv-traffic',
    auto: true,
    note: 'Realtid · hastighet · OpOmr-filtrerat',
    sources: [
      { id: 'trv-traffic', label: 'TrafficFlow (TRV)', previewEndpoint: '/api/harvest/trv-traffic/preview', scrapeEndpoint: '/api/harvest/trv-traffic/scrape' },
    ],
  },
  {
    id: 'trv-ferries',
    label: 'Färjeleder',
    icon: '⛴',
    defaultSource: 'trv-ferries',
    note: 'NVDB · statisk · OpOmr-filtrerat',
    sources: [
      { id: 'trv-ferries', label: 'NVDB via Trafikverket', previewEndpoint: '/api/harvest/trv-ferries/preview', scrapeEndpoint: '/api/harvest/trv-ferries/scrape' },
    ],
  },
  {
    id: 'trv-railway',
    label: 'Tågstörningar',
    icon: '🚆',
    defaultSource: 'trv-railway',
    note: 'TrainAnnouncement · OpOmr',
    sources: [
      { id: 'trv-railway', label: 'Tågstörningar (TRV)', previewEndpoint: '/api/harvest/railway-situations/preview', scrapeEndpoint: '/api/harvest/railway-situations/scrape' },
    ],
  },
  {
    id: 'bridges',
    label: 'Broar',
    icon: '🌉',
    defaultSource: 'bridges',
    note: 'Bärighet · maxvikt · OSM · OpOmr-filtrerat',
    sources: [
      { id: 'bridges', label: 'OpenStreetMap', previewEndpoint: '/api/harvest/bridges/preview', scrapeEndpoint: '/api/harvest/bridges/scrape' },
    ],
  },
  { id: 'telecom', label: 'Telekom driftstatus', icon: '📡', defaultSource: '', sources: [], placeholder: true },
  {
    id: 'fuel',
    label: 'Drivmedelsstationer',
    icon: '⛽',
    defaultSource: 'combined',
    note: 'Uppdateras sällan',
    sources: [
      { id: 'combined', label: 'OSM + OKQ8 + Skoogs', previewEndpoint: '/api/harvest/combined/preview', scrapeEndpoint: '/api/harvest/combined/scrape' },
      { id: 'osm',      label: 'Bara OSM',             previewEndpoint: '/api/harvest/osm/preview',      scrapeEndpoint: '/api/harvest/osm/scrape' },
      { id: 'okq8',     label: 'Bara OKQ8',            previewEndpoint: '/api/harvest/okq8/preview',     scrapeEndpoint: '/api/harvest/okq8/scrape' },
      { id: 'skoogs',   label: 'Bara Skoogs',          previewEndpoint: '/api/harvest/skoogs/preview',   scrapeEndpoint: '/api/harvest/skoogs/scrape' },
    ],
  },
];

interface JobState {
  phase?: string;
  done: number;
  total: number;
  result?: { imported: number; skipped: number; error?: string };
}

interface Props {
  onImported: () => void;
  onActivityChange?: (active: boolean) => void;
  refreshInterval: number;
  onRefreshIntervalChange: (v: number) => void;
}

function fmtDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HarvestSidebar({ onImported, onActivityChange, refreshInterval, onRefreshIntervalChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);
  const token = localStorage.getItem('token');

  // Auto-refresh timer for event sources
  useEffect(() => {
    if (refreshInterval === 0) return;
    const autoSources = CATEGORIES.filter(c => c.auto && !c.placeholder);
    const ms = refreshInterval * 60 * 1000;
    const t = setInterval(() => {
      autoSources.forEach(cat => {
        const src = cat.sources.find(s => s.id === cat.defaultSource);
        if (src) scrape(src);
      });
    }, ms);
    return () => clearInterval(t);
  }, [refreshInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchStatus() {
    const r = await fetch('/api/harvest/status', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setStatus(await r.json());
  }

  useEffect(() => { fetchStatus(); }, []);

  // Grön aktivitetsprick på RightPanel.tsx:s "Skördare"-flik när minst en skördning pågår.
  useEffect(() => {
    onActivityChange?.(Object.values(jobs).some(j => !j.result));
  }, [jobs, onActivityChange]);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('harvest:progress', (d: { source: string; phase?: string; done: number; total: number }) => {
      setJobs(prev => ({ ...prev, [d.source]: { phase: d.phase, done: d.done, total: d.total } }));
    });
    socket.on('harvest:done', (d: { source: string; imported: number; skipped: number; error?: string }) => {
      setJobs(prev => ({ ...prev, [d.source]: { done: 1, total: 1, result: d } }));
      if (!d.error && d.imported > 0) { onImported(); fetchStatus(); }
    });
    return () => { socket.disconnect(); };
  }, [onImported]);

  async function scrape(src: Source) {
    setJobs(prev => ({ ...prev, [src.id]: { done: 0, total: 0 } }));
    const r = await fetch(src.scrapeEndpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      setJobs(prev => ({ ...prev, [src.id]: { done: 0, total: 0, result: { imported: 0, skipped: 0, error: err.error } } }));
    }
  }

  async function cancel(sourceId: string) {
    await fetch(`/api/harvest/${sourceId}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  }

  async function scrapeAll() {
    for (const cat of CATEGORIES.filter(c => !c.placeholder)) {
      const src = cat.sources.find(s => s.id === cat.defaultSource);
      if (src) await scrape(src);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function clearJob(id: string) {
    setJobs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #2a2a40' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🕷 Dataskördare
          </div>
          <button
            onClick={scrapeAll}
            style={{ width: '100%', padding: '6px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer', marginBottom: 8 }}
          >
            Skörda alla
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>↻ Auto:</span>
            <select
              value={refreshInterval}
              onChange={e => onRefreshIntervalChange(parseInt(e.target.value))}
              style={{
                flex: 1, background: '#2a2a40', border: '1px solid #444', borderRadius: 4,
                color: refreshInterval > 0 ? '#7aaeff' : '#666', fontSize: 10, padding: '2px 4px',
              }}
            >
              {REFRESH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Categories */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {CATEGORIES.map(cat => {
            const isOpen = expanded.has(cat.id);
            const defSrc = cat.sources.find(s => s.id === cat.defaultSource);
            const defJob = defSrc ? jobs[defSrc.id] : undefined;

            const lastAt = fmtDate(status[cat.defaultSource]);

            return (
              <div key={cat.id} style={{ borderBottom: '1px solid #2a2a40' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 8 }}>
                  <span style={{ fontSize: 14, opacity: cat.placeholder ? 0.35 : 1 }}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 12, color: cat.placeholder ? '#555' : '#ccc' }}>{cat.label}</span>
                  {cat.auto && (
                    <span style={{ fontSize: 9, fontWeight: 700, background: '#1a3a1a', color: '#4a9', border: '1px solid #2a5a2a', borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>AUTO</span>
                  )}
                  {!cat.placeholder && (
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
                    >{isOpen ? '▲' : '▼'}</button>
                  )}
                </div>

                {!cat.placeholder && (
                  <div style={{ padding: '0 12px 2px', fontSize: 10, color: lastAt ? '#4a7' : '#444' }}>
                    {lastAt ? `Senast: ${lastAt}` : 'Ej hämtat'}
                    {cat.note && <span style={{ color: '#446', marginLeft: 4 }}>· {cat.note}</span>}
                  </div>
                )}

                {defSrc && !cat.auto && (
                  <div style={{ padding: '4px 12px 8px' }}>
                    <JobRow job={defJob} onScrape={() => scrape(defSrc)} onCancel={() => cancel(defSrc.id)} onClear={() => clearJob(defSrc.id)} label="Skörda" primary />
                  </div>
                )}

                {defSrc && cat.auto && (
                  <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {defJob && !defJob.result ? (
                      <span style={{ fontSize: 10, color: '#888', flex: 1 }}>{defJob.phase || 'Arbetar…'}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#444', flex: 1 }}>
                        {defJob?.result?.error
                          ? <span style={{ color: '#e74c3c' }}>⚠ {defJob.result.error.slice(0, 50)}</span>
                          : defJob?.result
                          ? <span style={{ color: '#4a7' }}>✓ {defJob.result.imported} händelser</span>
                          : null
                        }
                      </span>
                    )}
                    <button
                      onClick={() => { if (defSrc) scrape(defSrc); }}
                      title="Hämta nu"
                      style={{ background: 'none', border: '1px solid #333', borderRadius: 4, color: '#555', fontSize: 12, width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >↻</button>
                    {defJob?.result && (
                      <button onClick={() => clearJob(defSrc.id)} style={{ background: 'none', border: 'none', color: '#333', fontSize: 10, cursor: 'pointer' }}>✕</button>
                    )}
                  </div>
                )}

                {isOpen && (
                  <div style={{ background: '#16162a', padding: '4px 12px 8px', borderTop: '1px solid #2a2a40' }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Enskilda källor</div>
                    {cat.sources.filter(s => s.id !== cat.defaultSource).map(src => {
                      const job = jobs[src.id];
                      return (
                        <div key={src.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#777', marginBottom: 4 }}>{src.label}</div>
                          <JobRow job={job} onScrape={() => scrape(src)} onCancel={() => cancel(src.id)} onClear={() => clearJob(src.id)} label="Skörda" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}

function JobRow({ job, onScrape, onCancel, onClear, label, primary }: {
  job?: JobState; onScrape: () => void; onCancel: () => void; onClear: () => void; label: string; primary?: boolean;
}) {
  if (!job) {
    return (
      <button onClick={onScrape} style={{
        width: '100%', padding: '5px 0', borderRadius: 4, fontSize: 11,
        background: primary ? '#2a3a5a' : '#222235', color: primary ? '#7aaeff' : '#888',
        border: `1px solid ${primary ? '#3a5080' : '#333'}`, cursor: 'pointer',
      }}>{label}</button>
    );
  }

  if (job.result) {
    const { imported, skipped, error } = job.result;
    return (
      <div style={{ fontSize: 11 }}>
        {error
          ? <span style={{ color: '#e74c3c' }}>⚠ {error.slice(0, 80)}</span>
          : <span style={{ color: '#27ae60' }}>✓ {imported} importerade{skipped > 0 ? `, ${skipped} hoppades` : ''}</span>
        }
        <button onClick={onClear} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#555', fontSize: 10, cursor: 'pointer' }}>✕</button>
      </div>
    );
  }

  const pct = job.total > 1 ? Math.round((job.done / job.total) * 100) : 50;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3, gap: 6 }}>
        <span style={{ fontSize: 10, color: '#888', flex: 1 }}>{job.phase || 'Arbetar…'} {job.total > 1 ? `${job.done}/${job.total}` : ''}</span>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #555', borderRadius: 3, color: '#888', fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>Avbryt</button>
      </div>
      <div style={{ background: '#2a2a40', borderRadius: 3, height: 4 }}>
        <div style={{ background: '#5b8cff', borderRadius: 3, height: 4, width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}
