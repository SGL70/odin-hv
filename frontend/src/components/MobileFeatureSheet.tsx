import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getLayer } from '../types';
import type { Feature } from '../types';
import { IconClose } from '../lib/uiIcons';

// Read-only bottom sheet för mobil kartvy (Mobilversion.odp, use case 2) — i motsats till
// skrivbordets FeaturePanel går det inte att redigera fält här, bara att granska och (om
// oklassad) godkänna. Fullredigering på fält täcks redan av /report + skrivbordet.

function criticalityLabel(value: string) {
  const cfg: Record<string, { label: string; color: string }> = {
    rod: { label: 'Kritisk', color: '#e74c3c' },
    gul: { label: 'Viktig', color: '#f39c12' },
    normal: { label: 'Normal', color: '#27ae60' },
  };
  return cfg[value] || cfg.normal;
}

function renderVal(key: string, val: string) {
  if (key === 'url' && val.startsWith('http')) {
    return <a href={val} target="_blank" rel="noreferrer" style={{ color: '#5b8cff' }}>{val.replace(/^https?:\/\//, '')}</a>;
  }
  if (key === 'datetime' || key === 'published_at') {
    try { return new Date(val).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return val; }
  }
  return val;
}

interface Props {
  feature: Feature;
  onClose: () => void;
  onClassified: (updated: Feature) => void;
}

export function MobileFeatureSheet({ feature, onClose, onClassified }: Props) {
  const { user } = useAuth();
  const canEdit = user?.role === 'editor' || user?.role === 'admin';
  const [marking, setMarking] = useState(false);

  const layerCfg = getLayer(feature.properties.layer);
  const criticality = String(feature.properties.criticality ?? 'normal');
  const crit = criticalityLabel(criticality);
  const unclassified = feature.properties.unclassified === 'true';

  async function markClassified() {
    setMarking(true);
    try {
      const { uid, layer: _l, cot_type, name, created_by, updated_by, created_at, updated_at, ...rest } = feature.properties;
      const updated = await api.updateFeature(uid, { name, geometry: feature.geometry, cot_type, ...rest, unclassified: 'false' });
      onClassified(updated as Feature);
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 20 }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 21, maxHeight: '65vh', overflowY: 'auto',
        background: '#1b1c2c', borderTop: '1px solid #2e2f45', borderRadius: '14px 14px 0 0',
        padding: '10px 18px 24px', boxShadow: '0 -8px 30px #0008',
      }}>
        <div style={{ width: 40, height: 4, background: '#3a3b52', borderRadius: 2, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#eee', flex: 1 }}>{feature.properties.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer' }}><IconClose size={17} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: '#9ea3c0' }}>{layerCfg.icon} {layerCfg.label}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: crit.color + '22', color: crit.color, border: `1px solid ${crit.color}55`,
          }}>{crit.label}</span>
        </div>

        {unclassified && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 14,
            background: '#f0a83c22', border: '1px solid #f0a83c55', borderRadius: 6,
          }}>
            <span style={{ fontSize: 12, color: '#f0a83c', flex: 1 }}>🚩 Oklassad — väntar på granskning</span>
            {canEdit && (
              <button className="btn-ghost btn-sm" onClick={markClassified} disabled={marking}>
                {marking ? 'Markerar…' : '✓ Markera som klassad'}
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {layerCfg.fields.map(f => {
            const val = feature.properties[f.key];
            if (val == null || val === '') return null;
            return (
              <div key={f.key} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                <span style={{ color: '#9ea3c0', minWidth: 130 }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
                <span style={{ color: '#ddd', wordBreak: 'break-word' }}>{renderVal(f.key, String(val))}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
