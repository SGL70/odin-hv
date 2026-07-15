import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api';
import { SWEDEN } from '../lib/sweden';
import type { NewsItem } from '../types';
import { IconClose, IconChevronUp, IconChevronDown } from '../lib/uiIcons';

// Mediabevakning — granskningsinkorg för RSS-skördade nyhetsrubriker (se backend/src/routes/news.js
// och services/newsFeeds.js). Ligger helt utanför kartan tills någon läst rubriken och geotaggat den
// manuellt (Län/Kommun/Område + valfri finjustering genom att klicka på kartan) — annars skulle
// oplacerade nyheter synas på en Norrbotten-mittpunkt som om det vore en bekräftad händelse.
//
// "Ta bort" raderar aldrig — precis som slasken i en förundersökning flyttas posten bara till
// Läst-listan längst ned, återställningsbar om den visar sig relevant igen (se /items/:id/restore).

const PILL_CLASSES = ['badge-blue', 'badge-green', 'badge-orange', 'badge-red'];
function sourcePillClass(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PILL_CLASSES[hash % PILL_CLASSES.length];
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  onClose: () => void;
  onTagged: () => void;
  newsPickMode: boolean;
  onArmNewsPick: () => void;
  newsPickResult: { lat: number; lng: number } | null;
  onConsumeNewsPick: () => void;
}

export function NewsPanel({ onClose, onTagged, newsPickMode, onArmNewsPick, newsPickResult, onConsumeNewsPick }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [county, setCounty] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [area, setArea] = useState('');
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discardedOpen, setDiscardedOpen] = useState(false);
  const [discarded, setDiscarded] = useState<NewsItem[]>([]);
  const [discardedLoading, setDiscardedLoading] = useState(false);

  function load() {
    setLoading(true);
    api.news.items.list('pending').then(setItems).finally(() => setLoading(false));
  }

  useEffect(load, []);

  // news_item:new emitteras både vid nya RSS-poster och efter en efterklassificeringskörning
  // (se newsFeeds.js) — poster som klassificeras irrelevanta flyttas automatiskt till Slasken,
  // så listan behöver laddas om för att spegla det utan att användaren manuellt stänger/öppnar
  // panelen.
  useEffect(() => {
    const socket = io({ path: '/socket.io', auth: { token: localStorage.getItem('token') } });
    socket.on('news_item:new', load);
    return () => { socket.disconnect(); };
  }, []);

  // Relevanta överst, oklassificerade (null) i mitten — bedömt irrelevanta poster flyttas till
  // Slasken (status 'discarded') och visas därför inte alls i den väntande listan längre.
  const relevanceRank = (r: boolean | null) => (r === true ? 0 : r === null ? 1 : 2);
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => relevanceRank(a.relevant) - relevanceRank(b.relevant)),
    [items]
  );

  useEffect(() => {
    if (!newsPickResult || !selected) return;
    setPickedCoords(newsPickResult);
    onConsumeNewsPick();
  }, [newsPickResult, selected, onConsumeNewsPick]);

  function selectItem(item: NewsItem) {
    setSelected(item);
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
      await api.news.items.tag(selected.id, {
        municipality: municipality || undefined,
        area: area.trim() || undefined,
        lat: pickedCoords?.lat,
        lng: pickedCoords?.lng,
      });
      setItems(prev => prev.filter(i => i.id !== selected.id));
      setSelected(null);
      onTagged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte tagga nyheten');
    } finally {
      setSaving(false);
    }
  }

  async function discard(id: number) {
    await api.news.items.discard(id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (selected?.id === id) setSelected(null);
    onTagged();
  }

  function loadDiscarded() {
    setDiscardedLoading(true);
    api.news.items.list('discarded').then(setDiscarded).finally(() => setDiscardedLoading(false));
  }

  function toggleDiscarded() {
    const next = !discardedOpen;
    setDiscardedOpen(next);
    if (next) loadDiscarded();
  }

  async function restore(id: number) {
    await api.news.items.restore(id);
    setDiscarded(prev => prev.filter(i => i.id !== id));
    load();
    onTagged();
  }

  const municipalities = SWEDEN.find(c => c.name === county)?.municipalities ?? [];

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 380, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📰 Nyheter</span>
        <button className="btn-ghost btn-sm" onClick={onClose}><IconClose /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {loading && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Laddar…</div>}
        {!loading && items.length === 0 && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Inga väntande nyheter.</div>}

        {sortedItems.map(item => (
          <div key={item.id} style={{ marginBottom: 6, opacity: item.relevant === false ? 0.6 : 1 }}>
            <div
              onClick={() => selectItem(item)}
              style={{
                padding: '8px 10px', background: selected?.id === item.id ? '#23243a' : '#16162a',
                border: `1px solid ${selected?.id === item.id ? '#5b8cff' : '#2a2a40'}`, borderRadius: 5, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, color: '#ddd', marginBottom: 3, wordBreak: 'break-word' }}>{item.title}</div>
              {item.relevant != null && (
                <div
                  title={item.classifier_note || undefined}
                  style={{ fontSize: 9, marginBottom: 3, color: item.relevant ? '#34c274' : '#888' }}
                >
                  {item.relevant ? '● Relevant' : '○ Bedömd irrelevant'}{item.category ? ` · ${item.category}` : ''}
                </div>
              )}
              {item.summary && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3, wordBreak: 'break-word' }}>{item.summary}</div>
              )}
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 10, color: '#5b8cff', display: 'inline-block', marginBottom: 4 }}
                >Öppna artikel ↗</a>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${sourcePillClass(item.source_name)}`} style={{ fontSize: 9 }}>{item.source_name}</span>
                <span style={{ fontSize: 10, color: '#666', flex: 1 }}>{fmtTime(item.published_at || item.fetched_at)}</span>
                <button
                  className="btn-ghost btn-sm"
                  title="Tagga"
                  onClick={e => { e.stopPropagation(); selectItem(item); }}
                >✓ Tagga</button>
                <button
                  className="btn-ghost btn-sm"
                  title="Ta bort (hamnar i Läst)"
                  onClick={e => { e.stopPropagation(); discard(item.id); }}
                >🗑 Ta bort</button>
              </div>
            </div>

            {selected?.id === item.id && (
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
                  onClick={onArmNewsPick}
                  style={{ width: '100%', marginBottom: 8, color: newsPickMode ? '#5b8cff' : undefined, borderColor: newsPickMode ? '#5b8cff' : undefined }}
                >
                  {newsPickMode ? 'Klicka på kartan…' : pickedCoords ? '📍 Plats satt — klicka för att ändra' : '📍 Finjustera på kartan'}
                </button>

                {error && <div style={{ fontSize: 11, color: '#f2545b', marginBottom: 8 }}>{error}</div>}

                <button className="btn-primary btn-sm" onClick={tag} disabled={saving} style={{ width: '100%' }}>
                  {saving ? 'Taggar…' : '✓ Bekräfta plats och tagga'}
                </button>
              </div>
            )}
          </div>
        ))}

        <div style={{ borderTop: '1px solid #333', marginTop: 8, paddingTop: 8 }}>
          <div
            onClick={toggleDiscarded}
            style={{ cursor: 'pointer', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', padding: '2px 2px 6px' }}
          >
            <span>🗑 Läst (Slasken)</span>
            <span>{discardedOpen ? <IconChevronUp /> : <IconChevronDown />}</span>
          </div>
          {discardedOpen && (
            <div>
              {discardedLoading && <div style={{ fontSize: 11, color: '#666', padding: 8 }}>Laddar…</div>}
              {!discardedLoading && discarded.length === 0 && (
                <div style={{ fontSize: 11, color: '#666', padding: 8 }}>Inget i Slasken.</div>
              )}
              {discarded.map(item => (
                <div key={item.id} style={{ padding: '8px 10px', background: '#16162a', border: '1px solid #2a2a40', borderRadius: 5, marginBottom: 6, opacity: 0.75 }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4, wordBreak: 'break-word' }}>{item.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`badge ${sourcePillClass(item.source_name)}`} style={{ fontSize: 9 }}>{item.source_name}</span>
                    <span style={{ fontSize: 10, color: '#555', flex: 1 }}>{fmtTime(item.published_at || item.fetched_at)}</span>
                    <button className="btn-ghost btn-sm" title="Återställ till inkorgen" onClick={() => restore(item.id)}>↩ Återställ</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
