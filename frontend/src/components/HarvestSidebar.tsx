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
  placeholder?: boolean; // future category, not yet implemented
}

const CATEGORIES: Category[] = [
  {
    id: 'fuel',
    label: 'Drivmedelsstationer',
    icon: '⛽',
    defaultSource: 'combined',
    sources: [
      { id: 'combined', label: 'Kombinerat (OSM + OKQ8 + Skoogs)', previewEndpoint: '/api/harvest/combined/preview', scrapeEndpoint: '/api/harvest/combined/scrape' },
      { id: 'osm',      label: 'Bara OSM',       previewEndpoint: '/api/harvest/osm/preview',    scrapeEndpoint: '/api/harvest/osm/scrape' },
      { id: 'okq8',     label: 'Bara OKQ8 webb', previewEndpoint: '/api/harvest/okq8/preview',   scrapeEndpoint: '/api/harvest/okq8/scrape' },
      { id: 'skoogs',   label: 'Bara Skoogs',    previewEndpoint: '/api/harvest/skoogs/preview', scrapeEndpoint: '/api/harvest/skoogs/scrape' },
    ],
  },
  { id: 'police',  label: 'Polishändelser',        icon: '🚔', defaultSource: '', sources: [], placeholder: true },
  { id: 'energy',  label: 'Energi driftstatus',    icon: '⚡', defaultSource: '', sources: [], placeholder: true },
  { id: 'telecom', label: 'Telekom driftstatus',   icon: '📡', defaultSource: '', sources: [], placeholder: true },
];

interface JobState {
  phase?: string;
  done: number;
  total: number;
  result?: { imported: number; skipped: number; error?: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function HarvestSidebar({ open, onOpenChange, onImported }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const socketRef = useRef<Socket | null>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('harvest:progress', (d: { source: string; phase?: string; done: number; total: number }) => {
      setJobs(prev => ({ ...prev, [d.source]: { phase: d.phase, done: d.done, total: d.total } }));
    });
    socket.on('harvest:done', (d: { source: string; imported: number; skipped: number; error?: string }) => {
      setJobs(prev => ({ ...prev, [d.source]: { done: 1, total: 1, result: d } }));
      if (!d.error && d.imported > 0) onImported();
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

  const toggleBtn = (
    <button
      onClick={() => onOpenChange(!open)}
      style={{
        position: 'absolute', top: 66, right: 0, zIndex: 15,
        background: '#1e1e30ee', border: '1px solid #333',
        borderRight: 'none', borderRadius: '6px 0 0 6px',
        color: '#aaa', fontSize: 16, width: 22, height: 40,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      title={open ? 'Dölj skördare' : 'Visa skördare'}
    >{open ? '›' : '‹'}</button>
  );

  if (!open) return toggleBtn;

  return (
    <div style={{ position: 'absolute', top: 58, right: 0, bottom: 0, zIndex: 15, display: 'flex' }}>
      {toggleBtn}

      <div style={{
        width: 220, background: '#1e1e30ee', borderLeft: '1px solid #333',
        display: 'flex', flexDirection: 'column', backdropFilter: 'blur(8px)',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #2a2a40' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🕷 Dataskördare
          </div>
          <button
            onClick={scrapeAll}
            style={{ width: '100%', padding: '6px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Skörda alla
          </button>
        </div>

        {/* Categories */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {CATEGORIES.map(cat => {
            const isOpen = expanded.has(cat.id);
            const defSrc = cat.sources.find(s => s.id === cat.defaultSource);
            const defJob = defSrc ? jobs[defSrc.id] : undefined;

            return (
              <div key={cat.id} style={{ borderBottom: '1px solid #2a2a40' }}>
                {/* Category row */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
                  <span style={{ fontSize: 14, opacity: cat.placeholder ? 0.35 : 1 }}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 12, color: cat.placeholder ? '#555' : '#ccc' }}>{cat.label}</span>
                  {!cat.placeholder && (
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
                    >{isOpen ? '▲' : '▼'}</button>
                  )}
                </div>

                {/* Default action (always visible for non-placeholder) */}
                {defSrc && (
                  <div style={{ padding: '0 12px 8px' }}>
                    <JobRow
                      job={defJob}
                      onScrape={() => scrape(defSrc)}
                      onClear={() => clearJob(defSrc.id)}
                      label="Skörda"
                      primary
                    />
                  </div>
                )}

                {/* Expanded sub-sources */}
                {isOpen && (
                  <div style={{ background: '#16162a', padding: '4px 12px 8px', borderTop: '1px solid #2a2a40' }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Enskilda källor</div>
                    {cat.sources.filter(s => s.id !== cat.defaultSource).map(src => {
                      const job = jobs[src.id];
                      return (
                        <div key={src.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#777', marginBottom: 4 }}>{src.label}</div>
                          <JobRow job={job} onScrape={() => scrape(src)} onClear={() => clearJob(src.id)} label="Skörda" />
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
    </div>
  );
}

function JobRow({ job, onScrape, onClear, label, primary }: {
  job?: JobState; onScrape: () => void; onClear: () => void; label: string; primary?: boolean;
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
          ? <span style={{ color: '#e74c3c' }}>⚠ {error.slice(0, 60)}</span>
          : <span style={{ color: '#27ae60' }}>✓ {imported} importerade{skipped > 0 ? `, ${skipped} hoppades` : ''}</span>
        }
        <button onClick={onClear} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#555', fontSize: 10, cursor: 'pointer' }}>✕</button>
      </div>
    );
  }

  const pct = job.total > 1 ? Math.round((job.done / job.total) * 100) : 50;
  return (
    <div>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{job.phase || 'Arbetar…'} {job.total > 1 ? `${job.done}/${job.total}` : ''}</div>
      <div style={{ background: '#2a2a40', borderRadius: 3, height: 4 }}>
        <div style={{ background: '#5b8cff', borderRadius: 3, height: 4, width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}
