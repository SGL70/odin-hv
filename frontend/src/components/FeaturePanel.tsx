import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { getLayer, LAYERS } from '../types';
import type { Feature, LayerId } from '../types';
import { RelatedFeatures } from './RelatedFeatures';
import { LayerIcon } from '../lib/layerIcons';
import { useAuth } from '../contexts/AuthContext';

// Konverterar ISO-tidsträng (lagras alltid som UTC, t.ex. 'YYYY-MM-DDTHH:mm:ss.sssZ') till
// det lokala 'YYYY-MM-DDTHH:mm'-format som <input type="datetime-local"> kräver, och tillbaka.
function toDatetimeLocalValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocalValue(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return isNaN(d.getTime()) ? local : d.toISOString();
}

interface Props {
  feature: Feature | null;
  group?: Feature[];
  onSelectFromGroup?: (f: Feature) => void;
  onClose: () => void;
  onSaved: (f: Feature) => void;
  onDeleted: (uid: string) => void;
  addMode: boolean;
  addLayer: LayerId;
  onAddLayerChange: (l: LayerId) => void;
  // Läggs till-flödet (klicka kartan → ange namn/fält) — ägs av MapView.tsx (map-interaktionen
  // sitter där), men renderas här i Objekt-fliken i stället för en separat flytande dialog.
  pendingPlacement: boolean;
  placementInfo?: string;
  newName: string;
  onNewNameChange: (v: string) => void;
  newFields: Record<string, string>;
  onNewFieldChange: (key: string, val: string) => void;
  onSubmitNew: () => void;
  onCancelPlacement: () => void;
}

export function FeaturePanel({
  feature, group = [], onSelectFromGroup, onClose, onSaved, onDeleted, addMode, addLayer, onAddLayerChange,
  pendingPlacement, placementInfo, newName, onNewNameChange, newFields, onNewFieldChange, onSubmitNew, onCancelPlacement,
}: Props) {
  const { user } = useAuth();
  const canEdit = user?.role === 'editor' || user?.role === 'admin';

  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [markingClassified, setMarkingClassified] = useState(false);
  const [error, setError] = useState('');
  const [imgTs, setImgTs] = useState(() => Date.now());
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalFields = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!feature) { setName(''); setFields({}); originalFields.current = {}; return; }
    const { name, uid: _uid, layer: _l, cot_type: _c, created_by: _cb, updated_by: _ub, created_at: _ca, updated_at: _ua, ...rest } = feature.properties;
    const parsed = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? '')]));
    setName(String(name || ''));
    setFields(parsed);
    originalFields.current = parsed;
    setImgTs(Date.now());
  }, [feature]);

  useEffect(() => {
    const photoUrl = feature?.properties?.photo_url as string | undefined;
    if (!photoUrl) { if (refreshRef.current) clearInterval(refreshRef.current); return; }
    refreshRef.current = setInterval(() => setImgTs(Date.now()), 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [feature?.properties?.photo_url]);

  const layerCfg = getLayer(feature ? feature.properties.layer : addLayer);

  const FUEL_DATA_KEYS = ['diesel_cap_l', 'diesel_level_pct', 'bensin_cap_l', 'bensin_level_pct', 'hvo_cap_l', 'hvo_level_pct'];
  const MULTILINE_KEYS = new Set(['description', 'summary', 'location', 'road_name', 'location_description', 'sysselsattning']);

  const save = async () => {
    if (!feature || !canEdit) return;
    setSaving(true); setError('');
    try {
      const saveFields = { ...fields };
      if (feature.properties.layer === 'fuel') {
        const fuelChanged = FUEL_DATA_KEYS.some(k => saveFields[k] !== (originalFields.current[k] ?? ''));
        if (fuelChanged) saveFields.data_date = new Date().toISOString().slice(0, 10);
      }
      if (feature.properties.layer === 'intelligence_reports' && !saveFields.datetime) {
        saveFields.datetime = new Date().toISOString();
      }
      const saved = await api.updateFeature(feature.properties.uid, {
        name, geometry: feature.geometry, cot_type: feature.properties.cot_type, ...saveFields,
      });
      onSaved(saved as Feature);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fel');
    } finally { setSaving(false); }
  };

  // Fältrapporter (FieldReportView.tsx) skapas direkt med attributes.unclassified: 'true' —
  // en egen, omedelbar åtgärd i stället för det vanliga Spara-flödet, samma mönster som
  // "Sätt känd"/"Blockera" i Avsändarnummer-fliken i Inställningar.
  const markClassified = async () => {
    if (!feature || !canEdit) return;
    setMarkingClassified(true);
    try {
      const saved = await api.updateFeature(feature.properties.uid, {
        name, geometry: feature.geometry, cot_type: feature.properties.cot_type, ...fields, unclassified: 'false',
      });
      onSaved(saved as Feature);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte markera som klassad');
    } finally { setMarkingClassified(false); }
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
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <LayerIcon id={addLayer} size={15} />
            {pendingPlacement ? `Nytt ${layerCfg?.label}` : 'Lägg till objekt'}
          </span>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          {!pendingPlacement && (
            <>
              <div className="field-row">
                <label>Lager</label>
                {/* <option> kan bara innehålla text, inte SVG — behåller emoji här som enda undantag */}
                <select value={addLayer} onChange={e => onAddLayerChange(e.target.value as LayerId)}>
                  {LAYERS.map(l => <option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
                </select>
              </div>
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                Klicka på kartan för att placera objektet.
              </p>
            </>
          )}

          {pendingPlacement && (
            <>
              {placementInfo && (
                <p style={{ fontSize: 12, color: '#5b8cff', marginBottom: 12 }}>{placementInfo}</p>
              )}
              <div className="field-row">
                <label>Namn *</label>
                <input
                  value={newName}
                  onChange={e => onNewNameChange(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && onSubmitNew()}
                />
              </div>
              {layerCfg?.fields.slice(0, 3).map(f => (
                <div key={f.key} className="field-row">
                  <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                  {f.type === 'select' ? (
                    <select value={newFields[f.key] || ''} onChange={e => onNewFieldChange(f.key, e.target.value)}>
                      <option value="">Välj...</option>
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={newFields[f.key] || ''}
                      onChange={e => onNewFieldChange(f.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-primary btn-sm" onClick={onSubmitNew} style={{ flex: 1 }} disabled={!newName.trim()}>Skapa</button>
                <button className="btn-ghost btn-sm" onClick={onCancelPlacement}>Tillbaka</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!feature) {
    return (
      <div style={{ ...panelStyle, alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#666a8c' }}>
          Klicka på ett objekt i kartan för att se detaljer, eller klicka <b>+ Lägg till</b> för att skapa ett nytt.
        </p>
      </div>
    );
  }

  // Group navigation (multiple features at same click point)
  const groupIdx = group.length > 1 ? group.findIndex(f => f.properties.uid === feature.properties.uid) : -1;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
          {feature.properties.layer && <LayerIcon id={feature.properties.layer as LayerId} size={15} />}
          {feature.properties.name}
        </span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      {/* Group navigation */}
      {groupIdx >= 0 && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #2a2a40', display: 'flex', alignItems: 'center', gap: 6, background: '#16162a' }}>
          <span style={{ fontSize: 10, color: '#666', flex: 1 }}>{groupIdx + 1} / {group.length} händelser</span>
          <button disabled={groupIdx === 0} onClick={() => onSelectFromGroup?.(group[groupIdx - 1])}
            style={{ background: 'none', border: '1px solid #333', borderRadius: 3, color: groupIdx === 0 ? '#333' : '#888', fontSize: 11, padding: '1px 6px', cursor: groupIdx === 0 ? 'default' : 'pointer' }}>◀</button>
          <button disabled={groupIdx === group.length - 1} onClick={() => onSelectFromGroup?.(group[groupIdx + 1])}
            style={{ background: 'none', border: '1px solid #333', borderRadius: 3, color: groupIdx === group.length - 1 ? '#333' : '#888', fontSize: 11, padding: '1px 6px', cursor: groupIdx === group.length - 1 ? 'default' : 'pointer' }}>▶</button>
        </div>
      )}

      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        <div className="field-row">
          <label>Namn</label>
          <input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
        </div>

        {/* Visningsnamn — överlever omskördning, till skillnad från Namn som skrivs över av källdata */}
        <div className="field-row">
          <label>Visningsnamn (valfritt)</label>
          {canEdit ? (
            <input
              value={fields.display_name || ''}
              onChange={e => setFields(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Överlever nästa skördning, till skillnad från Namn"
            />
          ) : (
            <span style={{ fontSize: 13, color: '#e0e0e0', padding: '4px 0' }}>{fields.display_name || '—'}</span>
          )}
        </div>

        {/* Oklassad — satt av fältrapportering (FieldReportView.tsx), universellt fält */}
        {fields.unclassified === 'true' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 12,
            background: '#f0a83c22', border: '1px solid #f0a83c55', borderRadius: 6,
          }}>
            <span style={{ fontSize: 12, color: '#f0a83c', flex: 1 }}>🚩 Oklassad rapport — väntar på granskning</span>
            {canEdit && (
              <button className="btn-ghost btn-sm" onClick={markClassified} disabled={markingClassified}>
                {markingClassified ? 'Markerar…' : '✓ Markera som klassad'}
              </button>
            )}
          </div>
        )}

        {/* Precisionsnivå — tyst infobadge, ingen åtgärd (roadmap #10), bara synlig när
            platsen INTE är exakt (kommun-centroid m.m.) */}
        {fields.location_precision && fields.location_precision !== 'exact' && (
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
            📍 Ungefärlig plats ({fields.location_precision === 'kommun' ? 'kommunnivå' : 'länsnivå'})
          </div>
        )}

        {/* Kritikalitet — universellt fält på alla features */}
        <div className="field-row">
          <label>Kritikalitet</label>
          {canEdit ? (
            <select
              value={fields.criticality || 'normal'}
              onChange={e => setFields(p => ({ ...p, criticality: e.target.value }))}
            >
              <option value="normal">🟢 Normal</option>
              <option value="gul">🟡 Viktig</option>
              <option value="rod">🔴 Kritisk</option>
            </select>
          ) : (
            <CriticalityBadge value={fields.criticality || 'normal'} />
          )}
        </div>
        {layerCfg?.fields.map(f => {
          const val = fields[f.key];
          if (!canEdit && !val && val !== '0') return null;
          const isMultiline = MULTILINE_KEYS.has(f.key) || (val && val.length > 80);
          if (!canEdit) {
            return (
              <div key={f.key} className="field-row" style={isMultiline ? { alignItems: 'flex-start' } : undefined}>
                <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                <span style={{ fontSize: 13, color: '#e0e0e0', padding: '4px 0', whiteSpace: isMultiline ? 'pre-wrap' : undefined, wordBreak: 'break-word', display: 'block', flex: 1 }}>
                  {renderVal(f.key, val)}
                </span>
              </div>
            );
          }
          return (
            <div key={f.key} className="field-row" style={isMultiline ? { alignItems: 'flex-start' } : undefined}>
              <label>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
              {f.type === 'select' ? (
                <select value={val} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}>
                  <option value="">Välj...</option>
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'text' && isMultiline ? (
                <textarea
                  rows={3}
                  value={val}
                  onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              ) : f.type === 'datetime' ? (
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(val)}
                  onChange={e => setFields(p => ({ ...p, [f.key]: fromDatetimeLocalValue(e.target.value) }))}
                />
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

        {/* Extra attributes not in layer config */}
        {(() => {
          const HIDDEN = new Set([
            'uid', 'layer', 'cot_type', 'name', 'criticality', 'display_name', 'unclassified', 'location_precision', 'created_by', 'updated_by', 'created_at', 'updated_at',
            'photo_url', 'station_url', 'scraped_at', 'trv_source_id', 'osm_id', '_source_id', 'police_id', 'external_id',
            ...(layerCfg?.fields.map(f => f.key) || []),
          ]);
          const LABELS: Record<string, string> = {
            address: 'Adress', phone: 'Telefon', brand: 'Varumärke',
            opening_hours: 'Öppettider', source: 'Källa', camera_type: 'Kameratyp',
            direction: 'Riktning', status: 'Status', avg_speed_kmh: 'Hastighet (km/h)',
            flow_per_hour: 'Flöde (fordon/h)', measured_at: 'Mätt', data_quality: 'Datakvalitet',
            port_type: 'Hamntyp', bk_class: 'BK-klass', bk_winter: 'Vinterbärighet',
            max_axle_ton: 'Max axellast (ton)', event_type: 'Typ', datetime: 'Tid',
            summary: 'Sammanfattning', location: 'Plats', url: 'Länk',
          };
          const extra = Object.entries(fields).filter(
            ([k, v]) => !HIDDEN.has(k) && v && v !== 'null' && v !== 'undefined' && v !== ''
          );
          if (!extra.length) return null;
          return (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2a2a40' }}>
              {extra.map(([k, v]) => {
                const long = MULTILINE_KEYS.has(k) || v.length > 80;
                return (
                  <div key={k} className="field-row" style={long ? { alignItems: 'flex-start' } : undefined}>
                    <label style={{ color: '#666', fontSize: 11 }}>
                      {LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </label>
                    <span style={{ fontSize: 12, color: '#aaa', whiteSpace: long ? 'pre-wrap' : undefined, wordBreak: 'break-word', display: 'block', flex: 1 }}>
                      {renderVal(k, v)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <RelatedFeatures uid={feature.properties.uid} onSelect={onSelectFromGroup} />

        {fields.photo_url && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#888' }}>📷 Live-bild (var 30 s)</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setImgTs(Date.now())}
                  title="Begär en ny ögonblicksbild nu"
                  style={{ background: 'none', border: 'none', color: '#5b8cff', fontSize: 11, cursor: 'pointer', padding: 0 }}
                >🔄 Uppdatera nu</button>
                <a href={`${fields.photo_url}?t=${imgTs}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: '#5b8cff', textDecoration: 'none' }}>↗ Öppna</a>
              </div>
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
          {feature.properties.updated_at && <span>{new Date(String(feature.properties.updated_at)).toLocaleString('sv')}</span>}
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

function CriticalityBadge({ value }: { value: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    rod:    { label: 'Kritisk', color: '#e74c3c' },
    gul:    { label: 'Viktig',  color: '#f39c12' },
    normal: { label: 'Normal',  color: '#27ae60' },
  };
  const { label, color } = cfg[value] || cfg.normal;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
      background: color + '22', color, border: `1px solid ${color}55`,
    }}>{label}</span>
  );
}

function renderVal(key: string, val: string) {
  if (key === 'url' && val.startsWith('http')) {
    return <a href={val} target="_blank" rel="noreferrer" style={{ color: '#5b8cff', fontSize: 12, wordBreak: 'break-all' }}>{val.replace(/^https?:\/\//, '')}</a>;
  }
  if (key === 'datetime') {
    try { return new Date(val).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return val; }
  }
  return val;
}

// Fyller RightPanel.tsx:s tabbytta — RightPanel äger den absoluta positioneringen/kortet
// (tidigare stod FeaturePanel för sin egen absolut-positionerade panel, se
// eventual-painting-codd.md steg 7).
const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  padding: '12px 14px', borderBottom: '1px solid #333',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
