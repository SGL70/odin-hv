import { useState, useEffect } from 'react';
import { api } from '../api';
import { getLayer, LAYERS } from '../types';
import type { Feature, LayerId } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  feature: Feature | null;
  onClose: () => void;
  onSaved: (f: Feature) => void;
  onDeleted: (uid: string) => void;
  addMode: boolean;
  addLayer: LayerId;
  onAddLayerChange: (l: LayerId) => void;
}

export function FeaturePanel({ feature, onClose, onSaved, onDeleted, addMode, addLayer, onAddLayerChange }: Props) {
  const { user } = useAuth();
  const canEdit = user?.role === 'editor' || user?.role === 'admin';

  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!feature) { setName(''); setFields({}); return; }
    const { name, uid: _uid, layer: _l, cot_type: _c, created_by: _cb, updated_by: _ub, created_at: _ca, updated_at: _ua, ...rest } = feature.properties;
    setName(String(name || ''));
    setFields(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? '')])));
  }, [feature]);

  const layerCfg = getLayer(feature ? feature.properties.layer : addLayer);

  const save = async () => {
    if (!feature || !canEdit) return;
    setSaving(true); setError('');
    try {
      const saved = await api.updateFeature(feature.properties.uid, {
        name, geometry: feature.geometry, cot_type: feature.properties.cot_type, ...fields,
      });
      onSaved(saved as Feature);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fel');
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!feature || !canEdit) return;
    if (!confirm(`Ta bort "${feature.properties.name}"?`)) return;
    await api.deleteFeature(feature.properties.uid);
    onDeleted(feature.properties.uid);
  };

  if (addMode) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Lägg till objekt</span>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 14 }}>
          <div className="field-row">
            <label>Lager</label>
            <select value={addLayer} onChange={e => onAddLayerChange(e.target.value as LayerId)}>
              {LAYERS.map(l => <option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
            </select>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
            Klicka på kartan för att placera objektet.
          </p>
        </div>
      </div>
    );
  }

  if (!feature) return null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {layerCfg?.icon} {feature.properties.name}
        </span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        <div className="field-row">
          <label>Namn</label>
          <input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
        </div>
        {layerCfg?.fields.map(f => (
          <div key={f.key} className="field-row">
            <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
            {f.type === 'select' ? (
              <select value={fields[f.key] || ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} disabled={!canEdit}>
                <option value="">Välj...</option>
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={fields[f.key] || ''}
                onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                disabled={!canEdit}
              />
            )}
          </div>
        ))}
        <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
          {feature.properties.updated_by != null && <span>Ändrad av {String(feature.properties.updated_by)} · </span>}
          {feature.properties.updated_at && <span>{new Date(feature.properties.updated_at).toLocaleString('sv')}</span>}
        </div>
        {error && <p style={{ color: '#e74c3c', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>
      {canEdit && (
        <div style={{ padding: 14, borderTop: '1px solid #333', display: 'flex', gap: 8 }}>
          <button className="btn-primary btn-sm" onClick={save} disabled={saving} style={{ flex: 1 }}>
            {saving ? '...' : 'Spara'}
          </button>
          <button className="btn-danger btn-sm" onClick={del}>Ta bort</button>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', right: 10, top: 10, bottom: 10, zIndex: 10,
  width: 280, background: '#1e1e30', border: '1px solid #333',
  borderRadius: 8, display: 'flex', flexDirection: 'column',
  boxShadow: '0 4px 20px #0006',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 14px', borderBottom: '1px solid #333',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
