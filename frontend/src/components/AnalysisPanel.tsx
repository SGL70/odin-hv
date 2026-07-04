import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

interface PowerMuni {
  kommun: string;
  avbrott: string;
  berorda: string;
  leverantorer: string;
  har_planerade: boolean;
  forsta_aterst: string | null;
}

interface RoadMuniSummary {
  vagarbete: number;
  olycka: number;
  meddelande: number;
  hinder: number;
  total: number;
}

interface PoliceEvent {
  ort: string;
  typ: string;
  n: string;
  senast: string;
}

interface AnalysisData {
  op_municipalities: string[];
  opomr: {
    power: { municipalities: PowerMuni[]; total_avbrott: number; total_berorda: number };
    roads: { per_municipality: Record<string, RoadMuniSummary>; total: number; high_severity: number };
    police: { events: PoliceEvent[]; total: number };
  };
  norrbotten: {
    power: { total_avbrott: string; total_berorda: string; planerade: string; akuta: string };
    roads: { per_municipality: { kommun: string; typ: string; n: string }[] };
    police: { events: PoliceEvent[]; total: number };
  };
}

interface RoadEvent {
  uid: string;
  name: string;
  attributes: Record<string, string>;
}

interface Props { onClose: () => void }

export function AnalysisPanel({ onClose }: Props) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [tab, setTab] = useState<'opomr' | 'bd'>('opomr');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<AnalysisData>('/api/analysis/summary').then(d => { setData(d); setLoading(false); });
  }, []);

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 360, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📊 Lägesanalys</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
        {(['opomr', 'bd'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
            background: tab === t ? '#2a2a44' : 'none', border: 'none',
            color: tab === t ? '#7aaeff' : '#666',
            borderBottom: tab === t ? '2px solid #5b8cff' : '2px solid transparent',
            cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            {t === 'opomr' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                OpOmr
                <span style={{ background: '#23243a', color: '#9ea3c0', borderRadius: 999, fontSize: 10.5, padding: '1px 7px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                  {data?.op_municipalities.length ?? 0} valda
                </span>
              </span>
            ) : 'Norrbotten BD'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {loading && <div style={{ color: '#888', fontSize: 13 }}>Beräknar…</div>}
        {data && tab === 'opomr' && <OpOmrTab data={data} />}
        {data && tab === 'bd'    && <BDTab data={data} />}
      </div>
    </div>
  );
}

type DrillType = 'vagarbete' | 'olycka' | 'hinder' | 'info';

function roadTypeLabel(t: DrillType) {
  return { vagarbete: 'Vägarbete', olycka: 'Olycka', hinder: 'Hinder', info: 'Information' }[t];
}

function matchesType(typ: string, dt: DrillType) {
  const t = (typ || '').toLowerCase();
  if (dt === 'vagarbete') return t.includes('vägarbete');
  if (dt === 'olycka')    return t.includes('olycka');
  if (dt === 'hinder')    return t.includes('hinder');
  return !t.includes('vägarbete') && !t.includes('olycka') && !t.includes('hinder');
}

function OpOmrTab({ data }: { data: AnalysisData }) {
  const { opomr, op_municipalities } = data;
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [drillEvents, setDrillEvents] = useState<Record<string, RoadEvent[]>>({});
  const [drillLoading, setDrillLoading] = useState(false);

  const openDrill = useCallback(async (municipality: string, type: DrillType) => {
    const key = `${municipality}:${type}`;
    if (drillKey === key) { setDrillKey(null); return; }
    setDrillKey(key);
    if (!drillEvents[municipality]) {
      setDrillLoading(true);
      const events = await api.get<RoadEvent[]>(`/api/analysis/events?layer=road_situations&municipality=${encodeURIComponent(municipality)}`);
      setDrillEvents(prev => ({ ...prev, [municipality]: events }));
      setDrillLoading(false);
    }
  }, [drillKey, drillEvents]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ fontSize: 11, color: '#666a8c' }}>
        Kommuner: {op_municipalities.length ? op_municipalities.join(', ') : '—'}
      </div>

      {/* Snabbläge */}
      <div>
        <SectionTitle>Snabbläge</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard icon="⚡" value={opomr.power.total_avbrott} label="elavbrott" color="#e67e22"
            sub={opomr.power.total_berorda > 0 ? `${opomr.power.total_berorda.toLocaleString('sv')} abonnenter` : undefined} />
          <StatCard icon="🚧" value={opomr.roads.total} label="trafikhänd." color="#e74c3c"
            sub={opomr.roads.high_severity > 0 ? `varav ${opomr.roads.high_severity} allvarliga` : undefined} />
          <StatCard icon="🚔" value={opomr.police.total} label="polishänd. 48h" color="#9b59b6" />
        </div>
      </div>

      {/* Elavbrott per kommun */}
      <div>
        <SectionTitle>Elavbrott per kommun</SectionTitle>
        {opomr.power.municipalities.length === 0
          ? <div style={{ color: '#4a9', fontSize: 12 }}>✓ Inga aktiva elavbrott i OpOmr</div>
          : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#555', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={th}>Kommun</th>
                  <th style={th}>Avbrott</th>
                  <th style={th}>Abonnenter</th>
                  <th style={th}>Leverantör</th>
                </tr>
              </thead>
              <tbody>
                {opomr.power.municipalities.map(r => (
                  <tr key={r.kommun} style={{ borderBottom: '1px solid #2a2a3a' }}>
                    <td style={td}>{r.kommun}</td>
                    <td style={{ ...td, color: '#e67e22', fontWeight: 700 }}>{r.avbrott}</td>
                    <td style={td}>{Number(r.berorda).toLocaleString('sv')}</td>
                    <td style={{ ...td, color: '#666' }}>{r.leverantorer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {/* Trafikhändelser per kommun */}
      <div>
        <SectionTitle>Trafikhändelser per kommun</SectionTitle>
        {op_municipalities.map(k => {
          const r = opomr.roads.per_municipality[k];
          const muniEvents = drillEvents[k] || [];
          return (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #2a2a3a', fontSize: 12 }}>
                <span style={{ color: '#aaa', minWidth: 80 }}>{k}</span>
                {!r
                  ? <span style={{ color: '#4a9' }}>✓ Inga händelser</span>
                  : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {r.vagarbete > 0 && <Pill color="#e67e22" active={drillKey === `${k}:vagarbete`} onClick={() => openDrill(k, 'vagarbete')}>{r.vagarbete} arbete</Pill>}
                      {r.olycka > 0    && <Pill color="#e74c3c" active={drillKey === `${k}:olycka`}    onClick={() => openDrill(k, 'olycka')}>{r.olycka} olycka</Pill>}
                      {r.hinder > 0    && <Pill color="#f39c12" active={drillKey === `${k}:hinder`}    onClick={() => openDrill(k, 'hinder')}>{r.hinder} hinder</Pill>}
                      {r.meddelande > 0 && <Pill color="#666"   active={drillKey === `${k}:info`}      onClick={() => openDrill(k, 'info')}>{r.meddelande} info</Pill>}
                    </div>
                  )
                }
              </div>
              {drillKey && drillKey.startsWith(k + ':') && (
                <div style={{ background: '#16162a', borderRadius: 4, padding: '8px 10px', marginBottom: 6, fontSize: 11 }}>
                  {drillLoading && !drillEvents[k]
                    ? <div style={{ color: '#888' }}>Hämtar…</div>
                    : (() => {
                        const dtype = drillKey.split(':')[1] as DrillType;
                        const filtered = muniEvents.filter(e => matchesType(e.attributes?.event_type || '', dtype));
                        if (!filtered.length) return <div style={{ color: '#888' }}>Inga händelser hittades</div>;
                        return (
                          <>
                            <div style={{ color: '#888', fontSize: 10, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {roadTypeLabel(dtype)} · {k}
                            </div>
                            {filtered.map(e => (
                              <div key={e.uid} style={{ borderBottom: '1px solid #2a2a3a', padding: '4px 0', color: '#ccc', lineHeight: 1.4 }}>
                                {e.name || e.attributes?.description || 'Okänd händelse'}
                                {e.attributes?.road_number && (
                                  <span style={{ color: '#666', marginLeft: 6 }}>{e.attributes.road_number}</span>
                                )}
                              </div>
                            ))}
                          </>
                        );
                      })()
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Polishändelser */}
      <div>
        <SectionTitle>Polishändelser (senaste 48h)</SectionTitle>
        {opomr.police.events.length === 0
          ? <div style={{ color: '#4a9', fontSize: 12 }}>✓ Inga polishändelser i OpOmr</div>
          : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#555', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={th}>Ort</th>
                  <th style={th}>Typ</th>
                  <th style={{ ...th, textAlign: 'right' }}>Antal</th>
                </tr>
              </thead>
              <tbody>
                {opomr.police.events.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #2a2a3a' }}>
                    <td style={td}>{e.ort || '—'}</td>
                    <td style={{ ...td, color: '#9b59b6' }}>{e.typ || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ccc' }}>{e.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

    </div>
  );
}

function BDTab({ data }: { data: AnalysisData }) {
  const { norrbotten } = data;
  const pw = norrbotten.power;

  const roadByMuni: Record<string, { total: number; vagarbete: number; olycka: number }> = {};
  for (const r of norrbotten.roads.per_municipality) {
    if (!roadByMuni[r.kommun]) roadByMuni[r.kommun] = { total: 0, vagarbete: 0, olycka: 0 };
    const n = parseInt(r.n);
    roadByMuni[r.kommun].total += n;
    const t = (r.typ || '').toLowerCase();
    if (t.includes('vägarbete')) roadByMuni[r.kommun].vagarbete += n;
    else if (t.includes('olycka')) roadByMuni[r.kommun].olycka += n;
  }
  const sortedMunis = Object.entries(roadByMuni).sort((a, b) => b[1].total - a[1].total);
  const totalRoad = sortedMunis.reduce((s, [, v]) => s + v.total, 0);

  const policeByOrt = norrbotten.police.events;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div>
        <SectionTitle>Elavbrott — hela Norrbotten</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <StatCard icon="⚡" value={Number(pw.total_avbrott)} label="totalt" color="#e67e22"
            sub={`${Number(pw.total_berorda).toLocaleString('sv')} abonnenter`} />
          <StatCard icon="🔴" value={Number(pw.akuta)} label="akuta" color="#e74c3c" />
          <StatCard icon="📅" value={Number(pw.planerade)} label="planerade" color="#f39c12" />
        </div>
      </div>

      <div>
        <SectionTitle>Trafikhändelser per kommun ({totalRoad} totalt)</SectionTitle>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#555', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={th}>Kommun</th>
              <th style={{ ...th, textAlign: 'right' }}>Totalt</th>
              <th style={{ ...th, textAlign: 'right' }}>Arbete</th>
              <th style={{ ...th, textAlign: 'right' }}>Olycka</th>
            </tr>
          </thead>
          <tbody>
            {sortedMunis.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid #2a2a3a' }}>
                <td style={td}>{k}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ccc' }}>{v.total}</td>
                <td style={{ ...td, textAlign: 'right', color: '#e67e22' }}>{v.vagarbete || ''}</td>
                <td style={{ ...td, textAlign: 'right', color: '#e74c3c' }}>{v.olycka || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <SectionTitle>Polishändelser senaste 48h ({norrbotten.police.total} totalt)</SectionTitle>
        {policeByOrt.length === 0
          ? <div style={{ color: '#4a9', fontSize: 12 }}>✓ Inga polishändelser registrerade</div>
          : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#555', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={th}>Ort</th>
                  <th style={th}>Typ</th>
                  <th style={{ ...th, textAlign: 'right' }}>Antal</th>
                </tr>
              </thead>
              <tbody>
                {policeByOrt.slice(0, 15).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #2a2a3a' }}>
                    <td style={td}>{e.ort || '—'}</td>
                    <td style={{ ...td, color: '#9b59b6' }}>{e.typ || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ccc' }}>{e.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

    </div>
  );
}

function StatCard({ icon, value, label, color, sub }: { icon: string; value: number; label: string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#16162a', border: '1px solid #2a2a40', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>{icon} {label.toUpperCase()}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Pill({ children, color, active, onClick }: { children: React.ReactNode; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 10,
        background: active ? color + '44' : color + '22',
        color,
        border: `1px solid ${active ? color : color + '55'}`,
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {children}
    </span>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 6px 4px 0', fontWeight: 600 };
const td: React.CSSProperties = { padding: '5px 6px 5px 0', color: '#aaa' };
