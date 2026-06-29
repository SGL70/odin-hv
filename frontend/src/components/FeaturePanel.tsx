import { useState, useEffect, useRef } from 'react';
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
  const [imgTs, setImgTs] = useState(() => Date.now());
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!feature) { setName(''); setFields({}); return; }
    const { name, uid: _uid, layer: _l, cot_type: _c, created_by: _cb, updated_by: _ub, created_at: _ca, updated_at: _ua, ...rest } = feature.properties;
    setName(String(name || ''));
    setFields(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? '')])));
    setImgTs(Date.now());
  }, [feature]);

  // Auto-refresh camera image every 30 seconds
  useEffect(() => {
    const photoUrl = feature?.properties?.photo_url as string | undefined;
    if (!photoUrl) { if (refreshRef.current) clearInterval(refreshRef.current); return; }
    refreshRef.current = setInterval(() => setImgTs(Date.now()), 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [feature?.properties?.photo_url]);


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
        {layerCfg?.fields.map(f => {
          const val = fields[f.key];
          if (!val && val !== '0') return null;
          if (!canEdit) {
            return (
              <div key={f.key} className="field-row">
                <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                <span style={{ fontSize: 13, color: '#e0e0e0', padding: '4px 0' }}>{val}</span>
              </div>
            );
          }
          return (
            <div key={f.key} className="field-row">
              <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
              {f.type === 'select' ? (
                <select value={val} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}>
                  <option value="">Välj...</option>
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={val}
                  onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          );
        })}

        {/* Extra attributes not in layer config (imported data) */}
        {(() => {
          const HIDDEN = new Set([
            'uid', 'layer', 'cot_type', 'name', 'created_by', 'updated_by', 'created_at', 'updated_at',
            'photo_url', 'station_url', 'scraped_at', 'trv_source_id', 'osm_id', '_source_id',
            ...(layerCfg?.fields.map(f => f.key) || []),
          ]);
          const LABELS: Record<string, string> = {
            address: 'Adress', phone: 'Telefon', brand: 'Varumärke',
            opening_hours: 'Öppettider', source: 'Källa', camera_type: 'Kameratyp',
            direction: 'Riktning', status: 'Status', avg_speed_kmh: 'Hastighet (km/h)',
            flow_per_hour: 'Flöde (fordon/h)', measured_at: 'Mätt', data_quality: 'Datakvalitet',
            port_type: 'Hamntyp', bk_class: 'BK-klass', bk_winter: 'Vinterbärighet',
            max_axle_ton: 'Max axellast (ton)',
          };
          const extra = Object.entries(fields).filter(
            ([k, v]) => !HIDDEN.has(k) && v && v !== 'null' && v !== 'undefined' && v !== ''
          );
          if (!extra.length) return null;
          return (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2a2a40' }}>
              {extra.map(([k, v]) => (
                <div key={k} className="field-row">
                  <label style={{ color: '#666', fontSize: 11 }}>
                    {LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </label>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })()}
        {fields.photo_url && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#888' }}>📷 Live-bild (uppdateras var 30 s)</span>
              <a href={`${fields.photo_url}?t=${imgTs}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: '#5b8cff', textDecoration: 'none' }}>↗ Öppna</a>
            </div>
            <img
              key={imgTs}
              src={`${fields.photo_url}?t=${imgTs}`}
              alt={`Kamera ${feature.properties.name}`}
              style={{ width: '100%', borderRadius: 4, border: '1px solid #333', cursor: 'pointer' }}
              onClick={() => window.open(`${fields.photo_url}?t=${imgTs}`, '_blank')}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
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
