import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { OdinLogo } from './OdinLogo';
import { LAYERS, getLayer } from '../types';
import type { LayerId } from '../types';
import { trySubmitOrQueue, flushQueue, getQueueCount } from '../lib/fieldReportQueue';
import { DRAW_LAYERS } from '../lib/mapConfig';

// En fältrapport är alltid en enda GPS-punkt — lager som kräver linje-/polygonritning
// (vägar, järnvägar, uppställningsplatser m.fl.) går inte att välja här. police_events
// utesluts också — det lagret fylls uteslutande av polisen.se-skördaren och klustras på
// kartan, vilket krånglar till "oklassad"-ringen (se MapView.tsx); "Underrättelserapporter"
// täcker redan behovet av att logga en egen fältobservation.
const REPORTABLE_LAYERS = LAYERS.filter(l => !DRAW_LAYERS.includes(l.id) && l.id !== 'police_events');

// STANAG 2511-bedömningen (källans tillförlitlighet/uppgiftens trovärdighet) görs av den som
// GRANSKAR rapporten, inte av den som samlade in den på fältet — en fältobservatör ska inte
// betygsätta sin egen källas tillförlitlighet. Dessa två fält finns kvar i FeaturePanel.tsx för
// den som markerar rapporten som klassad, men visas inte i fältformuläret.
const STAFF_ONLY_FIELDS = new Set(['source_value', 'info_value']);

// Avskalad fältvy (roadmap "Mobil fältrapportering") — egen, medvetet enklare formulärrenderare
// än FeaturePanel.tsx:s täta skrivbordslayout. Rapporter skapas direkt (attributes.unclassified:
// true) i stället för att gå via en granskningsinkorg som Tips via SMS/Mediabevakning, eftersom
// det här är en inloggad användare med riktig GPS — förtroendemodellen skiljer sig.

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Skalar ner bilden client-side innan uppladdning — fältanvändare har ofta dålig uppkoppling.
function resizeImage(file: File, maxWidth = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Kunde inte bearbeta bilden')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Kunde inte bearbeta bilden')), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Kunde inte läsa bilden'));
    img.src = URL.createObjectURL(file);
  });
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 16, borderRadius: 8,
  background: '#16162a', border: '1px solid #2e2f45', color: '#eee', marginTop: 6,
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ea3c0', fontWeight: 600 };

interface Props {
  onBack?: () => void;
}

export function FieldReportView({ onBack }: Props = {}) {
  const { user, logout } = useAuth();
  const [layer, setLayer] = useState<LayerId>('intelligence_reports');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [posError, setPosError] = useState('');
  const [posLoading, setPosLoading] = useState(true);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);
  const [error, setError] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const layerCfg = getLayer(layer);

  function capturePosition() {
    setPosLoading(true);
    setPosError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setPosLoading(false); },
      err => { setPosError(err.message || 'Kunde inte hämta position'); setPosLoading(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  useEffect(capturePosition, []);
  useEffect(() => { setFields({}); }, [layer]);

  const refreshQueueCount = () => getQueueCount().then(setQueueCount);
  useEffect(() => {
    refreshQueueCount();
    flushQueue().then(refreshQueueCount);
    const onOnline = () => flushQueue().then(refreshQueueCount);
    window.addEventListener('online', onOnline);
    const interval = setInterval(onOnline, 60000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(interval); };
  }, []);

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await resizeImage(file);
      setPhotoBlob(blob);
      setPhotoPreview(URL.createObjectURL(blob));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunde inte bearbeta bilden');
    }
  }

  async function submit() {
    if (!name.trim()) { setError('Ange ett namn för rapporten'); return; }
    if (!position) { setError('Väntar på position — försök igen'); return; }
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const outcome = await trySubmitOrQueue({
        layer,
        name: name.trim(),
        geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
        fields,
        photoBlob: photoBlob ?? undefined,
      });
      setResult(outcome);
      setName('');
      setFields({});
      setPhotoBlob(null);
      setPhotoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refreshQueueCount();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka rapporten');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#0d0d16', color: '#eee', paddingBottom: 40 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: '#1b1c2ce6', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #2e2f45', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {onBack && <button className="btn-ghost btn-sm" onClick={onBack}>← Karta</button>}
        <OdinLogo size="sm" />
        <span style={{ fontSize: 13, color: '#9ea3c0', flex: 1 }}>Fältrapport · {user?.username}</span>
        {queueCount > 0 && (
          <span style={{ fontSize: 11, color: '#f0a83c', background: '#f0a83c22', padding: '3px 8px', borderRadius: 999 }}>
            {queueCount} köade
          </span>
        )}
        <button className="btn-ghost btn-sm" onClick={logout}>Logga ut</button>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div>
          <div style={labelStyle}>Position</div>
          {posLoading && <div style={{ fontSize: 14, color: '#9ea3c0', marginTop: 6 }}>Hämtar position…</div>}
          {!posLoading && position && (
            <div style={{ fontSize: 14, color: '#4ade80', marginTop: 6 }}>
              ✓ {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </div>
          )}
          {!posLoading && posError && <div style={{ fontSize: 14, color: '#f2545b', marginTop: 6 }}>{posError}</div>}
          <button className="btn-ghost btn-sm" onClick={capturePosition} style={{ marginTop: 8 }}>📍 Hämta position igen</button>
        </div>

        <div>
          <label style={labelStyle}>Typ av rapport</label>
          <select value={layer} onChange={e => setLayer(e.target.value as LayerId)} style={inputStyle}>
            {REPORTABLE_LAYERS.map(l => <option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Namn / rubrik</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Kort beskrivning..." autoFocus />
        </div>

        {layerCfg.fields.filter(f => !STAFF_ONLY_FIELDS.has(f.key)).map(f => (
          <div key={f.key}>
            <label style={labelStyle}>{f.label}</label>
            {f.type === 'select' ? (
              <select value={fields[f.key] || ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle}>
                <option value="">Välj...</option>
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'datetime' ? (
              <input
                type="datetime-local"
                value={fields[f.key] ? toDatetimeLocal(fields[f.key]) : ''}
                onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
                style={inputStyle}
              />
            ) : (
              <input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={fields[f.key] || ''}
                onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                style={inputStyle}
              />
            )}
          </div>
        ))}

        <div>
          <label style={labelStyle}>Foto (valfritt)</label>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoSelected} style={{ marginTop: 6 }} />
          {photoPreview && (
            <img src={photoPreview} alt="Förhandsvisning" style={{ width: '100%', borderRadius: 8, marginTop: 10, border: '1px solid #2e2f45' }} />
          )}
        </div>

        {error && <div style={{ fontSize: 14, color: '#f2545b' }}>{error}</div>}
        {result === 'sent' && <div style={{ fontSize: 14, color: '#4ade80' }}>✓ Rapport skickad</div>}
        {result === 'queued' && <div style={{ fontSize: 14, color: '#f0a83c' }}>📥 Ingen anslutning — rapport köad, skickas automatiskt</div>}

        <button
          className="btn-primary"
          onClick={submit}
          disabled={submitting}
          style={{ width: '100%', padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 8 }}
        >
          {submitting ? 'Skickar…' : '📤 Skicka rapport'}
        </button>
      </div>
    </div>
  );
}
