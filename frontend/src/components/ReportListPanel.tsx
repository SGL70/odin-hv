import { useMemo, useState } from 'react';
import type { Feature } from '../types';
import { IconClose } from '../lib/uiIcons';

interface Props {
  features: Feature[];
  onClose: () => void;
  onSelect: (f: Feature) => void;
}

const SOURCE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const INFO_DIGITS = ['1', '2', '3', '4', '5', '6'];
type TimeFilter = '24h' | '48h' | '7d' | 'alla';

function classification(f: Feature): string {
  const sv = String(f.properties.source_value || '').charAt(0);
  const iv = String(f.properties.info_value || '').charAt(0);
  return `${sv || '?'}${iv || '?'}`;
}

function cutoffFor(t: TimeFilter): string | null {
  if (t === 'alla') return null;
  const hours = t === '24h' ? 24 : t === '48h' ? 48 : 24 * 7;
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export function ReportListPanel({ features, onClose, onSelect }: Props) {
  const [sourceFilter, setSourceFilter] = useState('Alla');
  const [infoFilter, setInfoFilter] = useState('Alla');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('alla');

  const reports = useMemo(() => {
    const cutoff = cutoffFor(timeFilter);
    return features
      .filter(f => f.properties.layer === 'intelligence_reports')
      .filter(f => sourceFilter === 'Alla' || String(f.properties.source_value || '').charAt(0) === sourceFilter)
      .filter(f => infoFilter === 'Alla' || String(f.properties.info_value || '').charAt(0) === infoFilter)
      .filter(f => !cutoff || String(f.properties.datetime || '') > cutoff)
      .sort((a, b) => String(b.properties.datetime || '').localeCompare(String(a.properties.datetime || '')));
  }, [features, sourceFilter, infoFilter, timeFilter]);

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 360, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🕵 Underrättelserapporter</span>
        <button className="btn-ghost btn-sm" onClick={onClose}><IconClose /></button>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['24h', '48h', '7d', 'alla'] as TimeFilter[]).map(t => (
            <button key={t} onClick={() => setTimeFilter(t)} style={{
              flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 700,
              background: timeFilter === t ? '#2a2a44' : 'none',
              border: '1px solid #333', borderRadius: 4,
              color: timeFilter === t ? '#7aaeff' : '#666', cursor: 'pointer',
            }}>{t === 'alla' ? 'Alla' : t === '7d' ? '7 dagar' : `Senaste ${t}`}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ flex: 1, fontSize: 12, background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', padding: '3px 6px' }}>
            <option value="Alla">Källvärde: Alla</option>
            {SOURCE_LETTERS.map(l => <option key={l} value={l}>Källvärde: {l}</option>)}
          </select>
          <select value={infoFilter} onChange={e => setInfoFilter(e.target.value)} style={{ flex: 1, fontSize: 12, background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', padding: '3px 6px' }}>
            <option value="Alla">Infovärde: Alla</option>
            {INFO_DIGITS.map(d => <option key={d} value={d}>Infovärde: {d}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {reports.length === 0 && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Inga rapporter matchar filtret.</div>}
        {reports.map(f => (
          <div
            key={f.properties.uid}
            onClick={() => onSelect(f)}
            style={{
              padding: '8px 10px', marginBottom: 6, background: '#16162a',
              border: '1px solid #2a2a40', borderRadius: 5, cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>{f.properties.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#7aaeff', border: '1px solid #345', borderRadius: 3, padding: '1px 5px' }}>
                {classification(f)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {String(f.properties.slag || '')} · {String(f.properties.affiliation || '')}
            </div>
            {!!f.properties.datetime && (
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                {(() => { try { return new Date(String(f.properties.datetime)).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return String(f.properties.datetime); } })()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
