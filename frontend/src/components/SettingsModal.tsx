import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SWEDEN, type County } from '../lib/sweden';
import { api } from '../api';
import type { NewsSource } from '../types';

interface Props {
  onClose: () => void;
}

const LAYER_WEIGHT_LABELS: Record<string, string> = {
  power_outages: 'Elavbrott',
  road_situations: 'Trafikhändelser',
  police_events: 'Polishändelser',
  railway_situations: 'Tågstörningar',
};

export function SettingsModal({ onClose }: Props) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<{ id: number; username: string; role: string; created_at: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'reader' | 'editor' | 'admin'>('editor');
  const [userError, setUserError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [distanceM, setDistanceM] = useState(500);
  const [gulMultiplier, setGulMultiplier] = useState(1.5);
  const [rodMultiplier, setRodMultiplier] = useState(3);
  const [layerWeighting, setLayerWeighting] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Norrbottens län']));
  const [activeTab, setActiveTab] = useState<'opomr' | 'weighting' | 'retention' | 'users' | 'senders' | 'news'>('opomr');
  const [newsSources, setNewsSources] = useState<NewsSource[]>([]);
  const [newsSourcesLoading, setNewsSourcesLoading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [discoveringId, setDiscoveringId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [senders, setSenders] = useState<{ phone: string; status: string; label: string | null; message_count: number; last_seen_at: string }[]>([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [editingSender, setEditingSender] = useState<string | null>(null);
  const [senderLabel, setSenderLabel] = useState('');
  const [senderCounty, setSenderCounty] = useState('');
  const [senderMunicipality, setSenderMunicipality] = useState('');
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(s => {
        setMunicipalities(s.op_municipalities || []);
        setRetentionDays(s.snapshot_retention_days ?? 30);
        setDistanceM(s.criticality_weighting?.distance_m ?? 500);
        setGulMultiplier(s.criticality_weighting?.gul_multiplier ?? 1.5);
        setRodMultiplier(s.criticality_weighting?.rod_multiplier ?? 3);
        setLayerWeighting(s.layer_weighting ?? { power_outages: 3, road_situations: 1, police_events: 1, railway_situations: 1 });
      });
  }, [token]);

  function toggleMunicipality(name: string) {
    setMunicipalities(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
    setSaved(false);
  }

  function toggleCounty(county: County) {
    const allSelected = county.municipalities.every(m => municipalities.includes(m));
    if (allSelected) {
      setMunicipalities(prev => prev.filter(m => !county.municipalities.includes(m)));
    } else {
      setMunicipalities(prev => [...new Set([...prev, ...county.municipalities])]);
    }
    setSaved(false);
  }

  function toggleExpand(countyName: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(countyName) ? next.delete(countyName) : next.add(countyName);
      return next;
    });
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
      fetch('/api/settings/criticality_weighting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: { distance_m: distanceM, gul_multiplier: gulMultiplier, rod_multiplier: rodMultiplier } }),
      }),
      fetch('/api/settings/layer_weighting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: layerWeighting }),
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

  async function loadUsers() {
    setUsersLoading(true);
    const r = await fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setUsers(await r.json());
    setUsersLoading(false);
  }

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser() {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreatingUser(true);
    setUserError('');
    const r = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
    });
    if (r.ok) {
      setNewUsername(''); setNewPassword(''); setNewRole('editor');
      loadUsers();
    } else {
      const err = await r.json().catch(() => ({ error: 'Kunde inte skapa användare' }));
      setUserError(err.error || 'Kunde inte skapa användare');
    }
    setCreatingUser(false);
  }

  async function deleteUser(id: number) {
    if (!confirm('Ta bort användaren?')) return;
    const r = await fetch(`/api/auth/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) loadUsers();
    else {
      const err = await r.json().catch(() => ({ error: 'Kunde inte ta bort användaren' }));
      alert(err.error || 'Kunde inte ta bort användaren');
    }
  }

  async function loadSenders() {
    setSendersLoading(true);
    const r = await fetch('/api/sms/senders', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setSenders(await r.json());
    setSendersLoading(false);
  }

  useEffect(() => {
    if (activeTab === 'senders') loadSenders();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditSender(phone: string) {
    setEditingSender(phone);
    setSenderLabel('');
    setSenderCounty('');
    setSenderMunicipality('');
    setUserError('');
  }

  async function saveSenderKnown(phone: string) {
    if (!senderLabel.trim() || !senderMunicipality) { setUserError('Ange etikett och kommun'); return; }
    const r = await fetch(`/api/sms/senders/${encodeURIComponent(phone)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'known', label: senderLabel.trim(), municipality: senderMunicipality }),
    });
    if (r.ok) { setEditingSender(null); loadSenders(); }
    else {
      const err = await r.json().catch(() => ({ error: 'Kunde inte spara avsändaren' }));
      setUserError(err.error || 'Kunde inte spara avsändaren');
    }
  }

  async function setSenderStatus(phone: string, status: 'blocked' | 'unknown') {
    await fetch(`/api/sms/senders/${encodeURIComponent(phone)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    loadSenders();
  }

  const senderMunicipalities = SWEDEN.find(c => c.name === senderCounty)?.municipalities ?? [];

  async function loadNewsSources() {
    setNewsSourcesLoading(true);
    try { setNewsSources(await api.news.sources.list()); } finally { setNewsSourcesLoading(false); }
  }

  useEffect(() => {
    if (activeTab === 'news') loadNewsSources();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addNewsSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    setAddingSource(true);
    setSourceError('');
    try {
      const source = await api.news.sources.add({ name: newSourceName.trim(), url: newSourceUrl.trim() });
      setNewSourceName(''); setNewSourceUrl('');
      if (source.feed_url) await api.news.sources.poll();
      loadNewsSources();
    } catch (e: unknown) {
      setSourceError(e instanceof Error ? e.message : 'Kunde inte lägga till källan');
    } finally {
      setAddingSource(false);
    }
  }

  async function rediscoverSource(id: number) {
    setDiscoveringId(id);
    try { await api.news.sources.discover(id); loadNewsSources(); } finally { setDiscoveringId(null); }
  }

  async function toggleSourceEnabled(source: NewsSource) {
    await api.news.sources.update(source.id, { enabled: !source.enabled });
    loadNewsSources();
  }

  async function removeSource(id: number) {
    if (!confirm('Ta bort nyhetskällan?')) return;
    await api.news.sources.remove(id);
    loadNewsSources();
  }

  async function pollNewsNow() {
    setPolling(true);
    try { await api.news.sources.poll(); loadNewsSources(); } finally { setPolling(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }} onClick={onClose}>
      {/* Ankrad mot toppen (inte vertikalt centrerad) — annars flyttar sig hela modalen,
          och flikraden med den, varje gång flikbyte ändrar innehållshöjden. */}
      <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 640, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#eee', flex: 1, margin: 0 }}>⚙ Inställningar</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: 16 }}>
          {([
            { id: 'opomr', label: 'Operativt område' },
            { id: 'weighting', label: 'Viktning' },
            { id: 'retention', label: 'Retention' },
            { id: 'users', label: 'Användare' },
            { id: 'senders', label: 'Avsändarnummer' },
            { id: 'news', label: 'Nyhetskällor' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
              background: activeTab === t.id ? '#2a2a44' : 'none', border: 'none',
              color: activeTab === t.id ? '#7aaeff' : '#666',
              borderBottom: activeTab === t.id ? '2px solid #5b8cff' : '2px solid transparent',
              cursor: 'pointer', letterSpacing: 0.5,
            }}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'opomr' && <>
        {/* OpOmr */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Operativt Område (OpOmr)
        </div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>
          Kartfiltret och händelseskördare begränsas till valda kommuner.
          {municipalities.length > 0 && <span style={{ color: '#5b8cff' }}> {municipalities.length} valda.</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
          {SWEDEN.map(county => {
            const selectedInCounty = county.municipalities.filter(m => municipalities.includes(m)).length;
            const allSelected = selectedInCounty === county.municipalities.length;
            const someSelected = selectedInCounty > 0 && !allSelected;
            const isExpanded = expanded.has(county.name);

            return (
              <div key={county.name} style={{ border: '1px solid #2a2a40', borderRadius: 5, overflow: 'hidden' }}>
                {/* County header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background: '#16162a', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={() => toggleCounty(county)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 13, height: 13, cursor: 'pointer' }}
                  />
                  <span
                    onClick={() => toggleExpand(county.name)}
                    style={{ flex: 1, fontSize: 12, color: selectedInCounty > 0 ? '#ccd' : '#667', fontWeight: selectedInCounty > 0 ? 600 : 400 }}
                  >
                    {county.name}
                  </span>
                  {selectedInCounty > 0 && (
                    <span style={{ fontSize: 10, color: '#5b8cff', minWidth: 20, textAlign: 'right' }}>{selectedInCounty}</span>
                  )}
                  <span
                    onClick={() => toggleExpand(county.name)}
                    style={{ fontSize: 10, color: '#444', cursor: 'pointer', padding: '0 2px' }}
                  >{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Municipalities */}
                {isExpanded && (
                  <div style={{ padding: '6px 8px 8px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', background: '#1a1a2e' }}>
                    {county.municipalities.map(m => (
                      <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={municipalities.includes(m)}
                          onChange={() => toggleMunicipality(m)}
                          style={{ width: 12, height: 12 }}
                        />
                        <span style={{ fontSize: 12, color: municipalities.includes(m) ? '#ddd' : '#556' }}>{m}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>}

        {activeTab === 'retention' && <>
        {/* Historikretention */}
        <div style={{ marginBottom: 16 }}>
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
              style={{ width: 52, padding: '3px 6px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right' }}
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
        </>}

        {activeTab === 'weighting' && <>
        {/* Kritikalitetsviktning */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ⚠ Kritikalitetsviktad störningsscore
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>Avstånd till kritisk feature</span>
            <input
              type="number"
              min={0}
              max={50000}
              value={distanceM}
              onChange={e => { setDistanceM(Number(e.target.value)); setSaved(false); }}
              style={{ width: 60, padding: '3px 6px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>m</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>Multiplikator, gul (Viktig)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={gulMultiplier}
              onChange={e => { setGulMultiplier(Number(e.target.value)); setSaved(false); }}
              style={{ width: 52, padding: '3px 6px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>×</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>Multiplikator, röd (Kritisk)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={rodMultiplier}
              onChange={e => { setRodMultiplier(Number(e.target.value)); setSaved(false); }}
              style={{ width: 52, padding: '3px 6px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>×</span>
          </label>
          <div style={{ fontSize: 11, color: '#555' }}>
            Gäller elavbrott och trafikhändelser. Polishändelser har endast länsnivå-GPS och kan inte avståndsviktas.
          </div>
        </div>

        {/* Källviktning */}
        <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📊 Källviktning i störningsscore
          </div>
          {Object.keys(layerWeighting).map(layer => (
            <label key={layer} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>{LAYER_WEIGHT_LABELS[layer] ?? layer}</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={layerWeighting[layer]}
                onChange={e => { setLayerWeighting(prev => ({ ...prev, [layer]: Number(e.target.value) })); setSaved(false); }}
                style={{ width: 52, padding: '3px 6px', background: '#16162a', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 12, textAlign: 'right' }}
              />
              <span style={{ fontSize: 12, color: '#666' }}>×</span>
            </label>
          ))}
          <div style={{ fontSize: 11, color: '#555' }}>
            Vikt 0 utesluter källan helt ur störningsscoren. Nya lager läggs till av admin via API tills en UI för att lägga till rader byggs.
          </div>
        </div>
        </>}

        {activeTab === 'users' && <>
        {/* Användarhantering */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            👤 Användare
          </div>
          {usersLoading ? (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Laddar…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#16162a', border: '1px solid #2a2a40', borderRadius: 5 }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#ddd' }}>{u.username}</span>
                  <span className={`badge badge-${u.role === 'admin' ? 'orange' : u.role === 'editor' ? 'blue' : 'green'}`}>{u.role}</span>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => deleteUser(u.id)} style={{ background: 'none', border: 'none', color: '#c55', fontSize: 13, cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ny användare</div>
            <div className="field-row">
              <label>Användarnamn</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            </div>
            <div className="field-row">
              <label>Lösenord</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="field-row">
              <label>Roll</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as 'reader' | 'editor' | 'admin')}>
                <option value="reader">Läsare</option>
                <option value="editor">Redaktör</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {userError && <div style={{ fontSize: 11, color: '#c55', marginBottom: 8 }}>{userError}</div>}
            <button
              onClick={createUser}
              disabled={creatingUser || !newUsername.trim() || !newPassword.trim()}
              style={{ width: '100%', padding: '7px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
            >{creatingUser ? 'Skapar…' : 'Skapa användare'}</button>
          </div>
        </div>
        </>}

        {activeTab === 'senders' && <>
        {/* Avsändarnummer */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📨 Avsändarnummer
          </div>
          {sendersLoading ? (
            <div style={{ fontSize: 12, color: '#666' }}>Laddar…</div>
          ) : senders.length === 0 ? (
            <div style={{ fontSize: 12, color: '#666' }}>Inga nummer har hörts av än.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {senders.map(s => (
                <div key={s.phone}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#16162a', border: '1px solid #2a2a40', borderRadius: 5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#ddd' }}>{s.label || s.phone}</div>
                      {s.label && <div style={{ fontSize: 10, color: '#666' }}>{s.phone}</div>}
                    </div>
                    <span className={`badge badge-${s.status === 'known' ? 'green' : s.status === 'blocked' ? 'red' : 'blue'}`}>
                      {s.status === 'known' ? 'Känd' : s.status === 'blocked' ? 'Blockerad' : 'Okänd'}
                    </span>
                    <span style={{ fontSize: 10, color: '#555', minWidth: 50, textAlign: 'right' }}>{s.message_count} sms</span>
                    {s.status !== 'known' && (
                      <button className="btn-ghost btn-sm" onClick={() => startEditSender(s.phone)}>Sätt känd</button>
                    )}
                    {s.status === 'blocked' ? (
                      <button className="btn-ghost btn-sm" onClick={() => setSenderStatus(s.phone, 'unknown')}>Avblockera</button>
                    ) : (
                      <button className="btn-danger btn-sm" onClick={() => setSenderStatus(s.phone, 'blocked')}>Blockera</button>
                    )}
                  </div>

                  {editingSender === s.phone && (
                    <div style={{ padding: 10, background: '#16162a', border: '1px solid #2a2a40', borderTop: 'none', borderRadius: '0 0 5px 5px' }}>
                      <div className="field-row">
                        <label>Etikett</label>
                        <input value={senderLabel} onChange={e => setSenderLabel(e.target.value)} placeholder="T.ex. TVAB Kiruna" />
                      </div>
                      <div className="field-row">
                        <label>Län</label>
                        <select value={senderCounty} onChange={e => { setSenderCounty(e.target.value); setSenderMunicipality(''); }}>
                          <option value="">Välj län...</option>
                          {SWEDEN.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="field-row">
                        <label>Kommun</label>
                        <select value={senderMunicipality} onChange={e => setSenderMunicipality(e.target.value)} disabled={!senderCounty}>
                          <option value="">Välj kommun...</option>
                          {senderMunicipalities.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      {userError && <div style={{ fontSize: 11, color: '#c55', marginBottom: 8 }}>{userError}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary btn-sm" onClick={() => saveSenderKnown(s.phone)} style={{ flex: 1 }}>Spara</button>
                        <button className="btn-ghost btn-sm" onClick={() => setEditingSender(null)}>Avbryt</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </>}

        {activeTab === 'news' && <>
        {/* Nyhetskällor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📰 Nyhetskällor
          </div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
            Skördas automatiskt via RSS var 10:e minut. Nya rubriker hamnar i granskningsinkorgen "📰 Nyheter" tills någon geotaggar dem.
          </div>
          <button
            onClick={pollNewsNow}
            disabled={polling}
            style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, background: '#2a2a44', color: '#aaa', border: '1px solid #444', cursor: 'pointer', marginBottom: 12 }}
          >{polling ? 'Hämtar…' : '🔄 Uppdatera alla källor nu'}</button>
          {newsSourcesLoading ? (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Laddar…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {newsSources.map(s => (
                <div key={s.id} style={{ padding: '6px 10px', background: '#16162a', border: '1px solid #2a2a40', borderRadius: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#ddd' }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: '#666', wordBreak: 'break-all' }}>{s.site_url}</div>
                    </div>
                    <span className={`badge badge-${s.feed_url ? 'green' : 'red'}`}>
                      {s.feed_url ? 'Feed hittad' : 'Ingen feed'}
                    </span>
                    <button className="btn-ghost btn-sm" onClick={() => toggleSourceEnabled(s)}>
                      {s.enabled ? 'Aktiv' : 'Avstängd'}
                    </button>
                    <button className="btn-danger btn-sm" onClick={() => removeSource(s.id)}>✕</button>
                  </div>
                  {s.last_error && (
                    <div style={{ fontSize: 10, color: '#f2545b', marginTop: 4 }}>
                      {s.last_error}
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => rediscoverSource(s.id)}
                        disabled={discoveringId === s.id}
                        style={{ marginLeft: 8 }}
                      >{discoveringId === s.id ? 'Söker…' : 'Testa igen'}</button>
                    </div>
                  )}
                  {s.last_fetched_at && !s.last_error && (
                    <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                      Senast hämtad {new Date(s.last_fetched_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              ))}
              {newsSources.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>Inga källor konfigurerade.</div>}
            </div>
          )}

          <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lägg till källa</div>
            <div className="field-row">
              <label>Namn</label>
              <input value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="T.ex. Piteå-Tidningen" />
            </div>
            <div className="field-row">
              <label>URL</label>
              <input value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} placeholder="https://www.exempel.se" />
            </div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
              Systemet försöker automatiskt hitta en RSS/Atom-feed för adressen. Hittas ingen sparas källan ändå, med ett felmeddelande — kräver riktad skrapning som inte stöds ännu.
            </div>
            {sourceError && <div style={{ fontSize: 11, color: '#c55', marginBottom: 8 }}>{sourceError}</div>}
            <button
              onClick={addNewsSource}
              disabled={addingSource || !newSourceName.trim() || !newSourceUrl.trim()}
              style={{ width: '100%', padding: '7px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
            >{addingSource ? 'Söker feed…' : 'Lägg till källa'}</button>
          </div>
        </div>
        </>}

        {activeTab !== 'users' && activeTab !== 'senders' && activeTab !== 'news' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #2a2a40', paddingTop: 16 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ flex: 1, padding: '7px 0', borderRadius: 4, fontSize: 12, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
            >{saving ? 'Sparar…' : 'Spara'}</button>
            {saved && <span style={{ fontSize: 11, color: '#4a9' }}>✓ Sparat</span>}
          </div>
        )}
      </div>
    </div>
  );
}
