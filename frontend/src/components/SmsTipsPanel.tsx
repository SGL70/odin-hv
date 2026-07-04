import { useEffect, useState } from 'react';
import { api } from '../api';
import { SWEDEN } from '../lib/sweden';
import type { SmsTip } from '../types';

// Tips via SMS — granskningsinkorg för okända avsändare (se backend/src/routes/sms.js).
// Ligger helt utanför kartan tills någon läst meddelandet och geotaggat det manuellt
// (Län/Kommun/Område + valfri finjustering genom att klicka på kartan) — annars skulle
// oplacerade tips synas på en Norrbotten-mittpunkt som om det vore en riktig händelse.
interface Props {
  onClose: () => void;
  onTagged: () => void;
  tipPickMode: boolean;
  onArmTipPick: () => void;
  tipPickResult: { lat: number; lng: number } | null;
  onConsumeTipPick: () => void;
}

export function SmsTipsPanel({ onClose, onTagged, tipPickMode, onArmTipPick, tipPickResult, onConsumeTipPick }: Props) {
  const [tips, setTips] = useState<SmsTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SmsTip | null>(null);
  const [county, setCounty] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [area, setArea] = useState('');
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.sms.tips.list('pending').then(setTips).finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    if (!tipPickResult || !selected) return;
    setPickedCoords(tipPickResult);
    onConsumeTipPick();
  }, [tipPickResult, selected, onConsumeTipPick]);

  function selectTip(tip: SmsTip) {
    setSelected(tip);
    setCounty('');
    setMunicipality('');
    setArea('');
    setPickedCoords(null);
    setError('');
  }

  async function tag() {
    if (!selected) return;
    if (!municipality && !pickedCoords) { setError('Ange kommun eller finjustera på kartan'); return; }
    setSaving(true);
    setError('');
    try {
      await api.sms.tips.tag(selected.id, {
        municipality: municipality || undefined,
        area: area.trim() || undefined,
        lat: pickedCoords?.lat,
        lng: pickedCoords?.lng,
      });
      setTips(prev => prev.filter(t => t.id !== selected.id));
      setSelected(null);
      onTagged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte tagga tipset');
    } finally {
      setSaving(false);
    }
  }

  async function discard(id: number) {
    if (!confirm('Kasta tipset utan att placera det på kartan?')) return;
    await api.sms.tips.discard(id);
    setTips(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
    onTagged();
  }

  const municipalities = SWEDEN.find(c => c.name === county)?.municipalities ?? [];

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 360, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📨 Tips via SMS</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {loading && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Laddar…</div>}
        {!loading && tips.length === 0 && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Inga väntande tips.</div>}

        {tips.map(tip => (
          <div key={tip.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => selectTip(tip)}
              style={{
                padding: '8px 10px', background: selected?.id === tip.id ? '#23243a' : '#16162a',
                border: `1px solid ${selected?.id === tip.id ? '#5b8cff' : '#2a2a40'}`, borderRadius: 5, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, color: '#ddd', marginBottom: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{tip.message}</div>
              <div style={{ fontSize: 10, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                <span>{tip.from_number}</span>
                <span>{new Date(tip.received_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {selected?.id === tip.id && (
              <div style={{ padding: '10px', background: '#16162a', border: '1px solid #2a2a40', borderTop: 'none', borderRadius: '0 0 5px 5px' }}>
                <div className="field-row">
                  <label>Län</label>
                  <select value={county} onChange={e => { setCounty(e.target.value); setMunicipality(''); }}>
                    <option value="">Välj län...</option>
                    {SWEDEN.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <label>Kommun</label>
                  <select value={municipality} onChange={e => setMunicipality(e.target.value)} disabled={!county}>
                    <option value="">Välj kommun...</option>
                    {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <label>Område (valfritt)</label>
                  <input value={area} onChange={e => setArea(e.target.value)} placeholder="T.ex. centrum, ett vägnamn..." />
                </div>

                <button
                  className="btn-ghost btn-sm"
                  onClick={onArmTipPick}
                  style={{ width: '100%', marginBottom: 8, color: tipPickMode ? '#5b8cff' : undefined, borderColor: tipPickMode ? '#5b8cff' : undefined }}
                >
                  {tipPickMode ? 'Klicka på kartan…' : pickedCoords ? '📍 Plats satt — klicka för att ändra' : '📍 Finjustera på kartan'}
                </button>

                {error && <div style={{ fontSize: 11, color: '#f2545b', marginBottom: 8 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary btn-sm" onClick={tag} disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Taggar…' : 'Tagga'}
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => discard(tip.id)}>Kasta</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
