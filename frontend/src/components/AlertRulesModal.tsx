import { useEffect, useState } from 'react';
import { api } from '../api';
import { LAYERS } from '../types';
import type { AlertRule, AlertRuleType, AlertRuleConfig } from '../types';

interface Props {
  onClose: () => void;
}

const EMPTY_CONFIG: AlertRuleConfig = {};

export function AlertRulesModal({ onClose }: Props) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState<AlertRuleType>('threshold');
  const [config, setConfig] = useState<AlertRuleConfig>(EMPTY_CONFIG);
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
  }

  async function createRule() {
    if (!name.trim()) return;
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

  function describeConfig(rule: AlertRule): string {
    const c = rule.config;
    if (rule.type === 'threshold') return `score ≥ ${c.score_threshold ?? '?'}`;
    if (rule.type === 'proximity') return `${c.layer ?? '?'} inom ${c.distance_m ?? '?'} m från ${c.min_criticality ?? '?'}`;
    return `${c.min_count ?? '?'}+ i ${c.layer ?? '?'} inom ${c.radius_m ?? '?'} m`;
  }

  const inputStyle = { width: '100%', padding: '5px 8px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 11, color: '#888', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 420, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
                <div style={{ fontSize: 10, color: '#666' }}>{rule.type} · {describeConfig(rule)}</div>
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
            <select style={inputStyle} value={type} onChange={e => { setType(e.target.value as AlertRuleType); setConfig(EMPTY_CONFIG); }}>
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
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Lager</span>
                <select style={inputStyle} value={config.layer ?? ''} onChange={e => setConfig({ ...config, layer: e.target.value as AlertRuleConfig['layer'] })}>
                  <option value="">Välj lager…</option>
                  {LAYERS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={labelStyle}>Lägsta kritikalitet på kritiskt objekt</span>
                <select style={inputStyle} value={config.min_criticality ?? ''} onChange={e => setConfig({ ...config, min_criticality: e.target.value as AlertRuleConfig['min_criticality'] })}>
                  <option value="">Välj…</option>
                  <option value="gul">Viktig (gul) eller högre</option>
                  <option value="rod">Kritisk (röd)</option>
                </select>
              </div>
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
