import { useEffect, useState } from 'react';

const ALL_NORRBOTTEN_MUNICIPALITIES = [
  'Arjeplog', 'Arvidsjaur', 'Boden', 'Gällivare', 'Haparanda',
  'Jokkmokk', 'Kalix', 'Kiruna', 'Luleå', 'Pajala',
  'Piteå', 'Älvsbyn', 'Överkalix', 'Övertorneå',
];

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(s => {
        setMunicipalities(s.op_municipalities || []);
        setRetentionDays(s.snapshot_retention_days ?? 30);
      });
  }, [token]);

  function toggle(name: string) {
    setMunicipalities(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await Promise.all([
      fetch('/api/settings/op_municipalities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: municipalities }),
      }),
      fetch('/api/settings/snapshot_retention_days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: retentionDays }),
      }),
    ]);
    setSaving(false);
    setSaved(true);
  }

  async function triggerSnapshot() {
    setSnapshotting(true);
    await fetch('/api/analysis/snapshot', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setSnapshotting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 320, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#eee', flex: 1, margin: 0 }}>⚙ Inställningar</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {/* OpOmr */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Operativt Område (OpOmr) — kommuner
        </div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 14 }}>
          Polishändelser och kartfiltret begränsas till dessa kommuner.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {ALL_NORRBOTTEN_MUNICIPALITIES.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={municipalities.includes(m)}
                onChange={() => toggle(m)}
                style={{ width: 13, height: 13 }}
              />
              <span style={{ fontSize: 13, color: municipalities.includes(m) ? '#ddd' : '#666' }}>{m}</span>
            </label>
          ))}
        </div>

        {/* Historikretention */}
        <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📅 Historik & retention
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>Behåll snapshot-historik</span>
            <input
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={e => { setRetentionDays(Number(e.target.value)); setSaved(false); }}
              style={{
                width: 52, padding: '3px 6px', background: '#16162a', border: '1px solid #444',
                borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right',
              }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>dagar</span>
          </label>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
            Sparas automatiskt kl 00:05 varje natt. Äldre data rensas vid nästa sparning.
          </div>
          <button
            onClick={triggerSnapshot}
            disabled={snapshotting}
            style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, background: '#2a2a44', color: '#aaa', border: '1px solid #444', cursor: 'pointer' }}
          >{snapshotting ? 'Sparar…' : '⚡ Spara ögonblick nu'}</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, padding: '7px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
          >{saving ? 'Sparar…' : 'Spara'}</button>
          {saved && <span style={{ fontSize: 11, color: '#4a9' }}>✓ Sparat</span>}
        </div>
      </div>
    </div>
  );
}
