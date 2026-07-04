import { useEffect, useState } from 'react';
import { api } from '../api';
import { LAYERS } from '../types';
import type { AlertRule, AlertRuleType, AlertRuleConfig, Feature } from '../types';
import { CriticalityObjectsList } from './CriticalityObjectsList';

interface Props {
  features: Feature[];
  onClose: () => void;
}

const EMPTY_CONFIG: AlertRuleConfig = {};

export function AlertRulesModal({ features, onClose }: Props) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState<AlertRuleType>('threshold');
  const [config, setConfig] = useState<AlertRuleConfig>(EMPTY_CONFIG);
  const [proximityMode, setProximityMode] = useState<'criticality' | 'target'>('criticality');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.alerts.listRules().then(setRules).finally(() => setLoading(false));
  }

  useEffect(load, []);

  function resetForm() {
    setName('');
    setType('threshold');
    setConfig(EMPTY_CONFIG);
    setProximityMode('criticality');
  }

  async function createRule() {
    if (!name.trim()) return;
    if (type === 'proximity' && proximityMode === 'target' && !config.target_uid) {
      setError('Välj ett objekt');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.alerts.createRule({ name, type, config, enabled: true });
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa regel');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule: AlertRule) {
    await api.alerts.updateRule(rule.id, { name: rule.name, type: rule.type, config: rule.config, enabled: !rule.enabled });
    load();
  }

  async function deleteRule(id: number) {
    if (!confirm('Ta bort regeln?')) return;
    await api.alerts.deleteRule(id);
    load();
  }

  // Läsbara svenska meningar i stället för interna fältnamn (police_events, rod) rakt av —
  // Claude Design-handoff 2026-07-04. Lagernamn återanvänder LAYERS[].label (redan finns),
  // bara kritikalitetsvärden behöver en egen liten etikettkarta.
  const CRITICALITY_LABELS: Record<string, string> = { gul: 'Viktig', rod: 'Kritisk' };

  function layerLabel(id?: string): string {
    return LAYERS.find(l => l.id === id)?.label ?? id ?? '?';
  }

  function ruleSentence(rule: AlertRule) {
    const c = rule.config;
    if (rule.type === 'threshold') {
      return <>Larma när störningspoängen är ≥ <b>{c.score_threshold ?? '?'}</b></>;
    }
    if (rule.type === 'proximity') {
      if (c.target_uid) {
        const targetName = features.find(f => f.properties.uid === c.target_uid)?.properties.name ?? c.target_uid;
        return <>Larma när <b>{layerLabel(c.layer)}</b> inträffar inom <b>{c.distance_m ?? '?'} m</b> från <b>{String(targetName)}</b></>;
      }
      const crit = CRITICALITY_LABELS[c.min_criticality ?? ''] ?? c.min_criticality ?? '?';
      return <>Larma när <b>{layerLabel(c.layer)}</b> inträffar inom <b>{c.distance_m ?? '?'} m</b> från ett objekt med kritikalitet <b>{crit}</b></>;
    }
    return <>Larma vid <b>{c.min_count ?? '?'}+</b> händelser i <b>{layerLabel(c.layer)}</b> inom <b>{c.radius_m ?? '?'} m</b></>;
  }

  // Rå fältsträng bevaras som liten monospace-rad för admin-felsökning — inte längre huvudinformationen.
  function rawConfigString(rule: AlertRule): string {
    const c = rule.config;
    if (rule.type === 'threshold') return `${rule.type} · ${c.score_threshold ?? '?'}`;
    if (rule.type === 'proximity') return `${rule.type} · ${c.layer ?? '?'} · ${c.target_uid ? `mål:${c.target_uid}` : (c.min_criticality ?? '?')}`;
    return `${rule.type} · ${c.layer ?? '?'} · ${c.min_count ?? '?'} · ${c.radius_m ?? '?'}`;
  }

  const inputStyle = { width: '100%', padding: '5px 8px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 11, color: '#888', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }} onClick={onClose}>
      {/* Ankrad mot toppen — formulärets höjd ändras med vald regeltyp, annars hoppar modalen */}
      <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 420, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#eee', flex: 1, margin: 0 }}>⚠ Varningsregler</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {loading && <div style={{ fontSize: 12, color: '#666' }}>Laddar…</div>}
          {!loading && rules.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>Inga regler skapade än.</div>}
          {rules.map(rule => (
            <div key={rule.id} style={{ border: '1px solid #2a2a40', borderRadius: 5, padding: '8px 10px', background: '#16162a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={rule.enabled} onChange={() => toggleEnabled(rule)} style={{ width: 13, height: 13, cursor: 'pointer' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: rule.enabled ? '#ddd' : '#667', fontWeight: 600 }}>{rule.name}</div>
                <div style={{ fontSize: 11, color: rule.enabled ? '#c7cae0' : '#667', marginTop: 2 }}>{ruleSentence(rule)}</div>
                <div style={{ fontSize: 10.5, color: '#3d3f5c', marginTop: 2, fontFamily: 'monospace' }}>{rawConfigString(rule)}</div>
              </div>
              <button onClick={() => deleteRule(rule.id)} style={{ background: 'none', border: 'none', color: '#c55', fontSize: 13, cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ny regel</div>

          <div style={{ marginBottom: 10 }}>
            <span style={labelStyle}>Namn</span>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="T.ex. Hög störningsnivå Luleå" />
          </div>

          <div style={{ marginBottom: 10 }}>
            <span style={labelStyle}>Typ</span>
            <select style={inputStyle} value={type} onChange={e => { setType(e.target.value as AlertRuleType); setConfig(EMPTY_CONFIG); setProximityMode('criticality'); }}>
              <option value="threshold">Tröskel — störningspoäng per kommun</option>
              <option value="proximity">Proximity — nära kritiskt objekt</option>
              <option value="cluster">Kluster — flera händelser nära varandra</option>
            </select>
          </div>

          {type === 'threshold' && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Störningspoäng ≥</span>
              <input type="number" style={inputStyle} value={config.score_threshold ?? ''}
                onChange={e => setConfig({ ...config, score_threshold: Number(e.target.value) })} />
            </div>
          )}

          {type === 'proximity' && (
            <>
              <div style={{ marginBottom: 10, display: 'flex', gap: 14 }}>
                <label style={{ fontSize: 12, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="radio" checked={proximityMode === 'criticality'}
                    onChange={() => { setProximityMode('criticality'); setConfig({ layer: config.layer, distance_m: config.distance_m }); }} />
                  Kritikalitet
                </label>
                <label style={{ fontSize: 12, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="radio" checked={proximityMode === 'target'}
                    onChange={() => { setProximityMode('target'); setConfig({ layer: config.layer, distance_m: config.distance_m }); }} />
                  Specifikt objekt
                </label>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Lager</span>
                <select style={inputStyle} value={config.layer ?? ''} onChange={e => setConfig({ ...config, layer: e.target.value as AlertRuleConfig['layer'] })}>
                  <option value="">Välj lager…</option>
                  {LAYERS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              {proximityMode === 'criticality' && (
                <div style={{ marginBottom: 10 }}>
                  <span style={labelStyle}>Lägsta kritikalitet på kritiskt objekt</span>
                  <select style={inputStyle} value={config.min_criticality ?? ''} onChange={e => setConfig({ ...config, min_criticality: e.target.value as AlertRuleConfig['min_criticality'] })}>
                    <option value="">Välj…</option>
                    <option value="gul">Viktig (gul) eller högre</option>
                    <option value="rod">Kritisk (röd)</option>
                  </select>
                </div>
              )}
              {proximityMode === 'target' && (
                <div style={{ marginBottom: 10 }}>
                  <span style={labelStyle}>Objekt</span>
                  {config.target_uid ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...inputStyle, padding: '5px 8px' }}>
                      <span style={{ flex: 1, fontSize: 12, color: '#ddd' }}>
                        {String(features.find(f => f.properties.uid === config.target_uid)?.properties.name ?? config.target_uid)}
                      </span>
                      <button onClick={() => setConfig({ ...config, target_uid: undefined })}
                        style={{ background: 'none', border: 'none', color: '#7aaeff', fontSize: 11, cursor: 'pointer' }}>Byt</button>
                    </div>
                  ) : (
                    <CriticalityObjectsList features={features} onSelect={f => setConfig({ ...config, target_uid: f.properties.uid })} />
                  )}
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Avstånd (m)</span>
                <input type="number" style={inputStyle} value={config.distance_m ?? ''}
                  onChange={e => setConfig({ ...config, distance_m: Number(e.target.value) })} />
              </div>
            </>
          )}

          {type === 'cluster' && (
            <>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Lager</span>
                <select style={inputStyle} value={config.layer ?? ''} onChange={e => setConfig({ ...config, layer: e.target.value as AlertRuleConfig['layer'] })}>
                  <option value="">Välj lager…</option>
                  {LAYERS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Antal händelser (min)</span>
                <input type="number" style={inputStyle} value={config.min_count ?? ''}
                  onChange={e => setConfig({ ...config, min_count: Number(e.target.value) })} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Radie (m)</span>
                <input type="number" style={inputStyle} value={config.radius_m ?? ''}
                  onChange={e => setConfig({ ...config, radius_m: Number(e.target.value) })} />
              </div>
            </>
          )}

          {error && <div style={{ fontSize: 11, color: '#c55', marginBottom: 8 }}>{error}</div>}

          <button onClick={createRule} disabled={saving || !name.trim()}
            style={{ width: '100%', padding: '7px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Sparar…' : 'Skapa regel'}
          </button>
        </div>
      </div>
    </div>
  );
}
