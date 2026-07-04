import { useEffect, useState } from 'react';

interface County {
  name: string;
  municipalities: string[];
}

const SWEDEN: County[] = [
  { name: 'Norrbottens län', municipalities: ['Arjeplog','Arvidsjaur','Boden','Gällivare','Haparanda','Jokkmokk','Kalix','Kiruna','Luleå','Pajala','Piteå','Älvsbyn','Överkalix','Övertorneå'] },
  { name: 'Västerbottens län', municipalities: ['Bjurholm','Dorotea','Lycksele','Malå','Nordmaling','Norsjö','Robertsfors','Skellefteå','Sorsele','Storuman','Umeå','Vilhelmina','Vindeln','Vännäs','Åsele'] },
  { name: 'Jämtlands län', municipalities: ['Berg','Bräcke','Härjedalen','Krokom','Ragunda','Strömsund','Åre','Östersund'] },
  { name: 'Västernorrlands län', municipalities: ['Härnösand','Kramfors','Sollefteå','Sundsvall','Timrå','Ånge','Örnsköldsvik'] },
  { name: 'Gävleborgs län', municipalities: ['Bollnäs','Gävle','Hofors','Hudiksvall','Ljusdal','Nordanstig','Ockelbo','Ovanåker','Sandviken','Söderhamn'] },
  { name: 'Dalarnas län', municipalities: ['Avesta','Borlänge','Falun','Gagnef','Hedemora','Leksand','Ludvika','Malung-Sälen','Mora','Orsa','Rättvik','Smedjebacken','Säter','Vansbro','Älvdalen'] },
  { name: 'Värmlands län', municipalities: ['Arvika','Eda','Filipstad','Forshaga','Grums','Hagfors','Hammarö','Karlstad','Kil','Kristinehamn','Munkfors','Storfors','Sunne','Säffle','Torsby','Årjäng'] },
  { name: 'Örebro län', municipalities: ['Askersund','Degerfors','Hallsberg','Hällefors','Karlskoga','Kumla','Laxå','Lekeberg','Lindesberg','Ljusnarsberg','Nora','Örebro'] },
  { name: 'Västmanlands län', municipalities: ['Arboga','Fagersta','Hallstahammar','Kungsör','Köping','Norberg','Sala','Skinnskatteberg','Surahammar','Västerås'] },
  { name: 'Uppsala län', municipalities: ['Enköping','Heby','Håbo','Knivsta','Tierp','Uppsala','Älvkarleby','Östhammar'] },
  { name: 'Stockholms län', municipalities: ['Botkyrka','Danderyd','Ekerö','Haninge','Huddinge','Järfälla','Lidingö','Nacka','Norrtälje','Nykvarn','Nynäshamn','Salem','Sigtuna','Sollentuna','Solna','Stockholm','Sundbyberg','Södertälje','Tyresö','Täby','Upplands-Bro','Upplands Väsby','Vallentuna','Vaxholm','Värmdö','Österåker'] },
  { name: 'Södermanlands län', municipalities: ['Eskilstuna','Flen','Gnesta','Katrineholm','Nyköping','Oxelösund','Strängnäs','Trosa','Vingåker'] },
  { name: 'Västra Götalands län', municipalities: ['Ale','Alingsås','Bengtsfors','Bollebygd','Borås','Dals-Ed','Essunga','Falköping','Färgelanda','Grästorp','Gullspång','Göteborg','Götene','Herrljunga','Hjo','Härryda','Karlsborg','Kungälv','Lerum','Lidköping','Lilla Edet','Lysekil','Mariestad','Mark','Mellerud','Munkedal','Mölndal','Orust','Partille','Skara','Skövde','Sotenäs','Stenungsund','Strömstad','Svenljunga','Tanum','Tibro','Tidaholm','Tjörn','Tranemo','Trollhättan','Töreboda','Uddevalla','Ulricehamn','Vara','Vårgårda','Åmål','Öckerö'] },
  { name: 'Östergötlands län', municipalities: ['Boxholm','Finspång','Kinda','Linköping','Mjölby','Motala','Norrköping','Söderköping','Vadstena','Valdemarsvik','Ydre','Åtvidaberg','Ödeshög'] },
  { name: 'Gotlands län', municipalities: ['Gotland'] },
  { name: 'Jönköpings län', municipalities: ['Aneby','Eksjö','Gislaved','Gnosjö','Habo','Jönköping','Mullsjö','Nässjö','Sävsjö','Tranås','Vaggeryd','Vetlanda','Värnamo'] },
  { name: 'Kalmar län', municipalities: ['Borgholm','Emmaboda','Hultsfred','Högsby','Kalmar','Mönsterås','Mörbylånga','Nybro','Oskarshamn','Torsås','Vimmerby','Västervik'] },
  { name: 'Hallands län', municipalities: ['Falkenberg','Halmstad','Hylte','Kungsbacka','Laholm','Varberg'] },
  { name: 'Kronobergs län', municipalities: ['Alvesta','Lessebo','Ljungby','Markaryd','Tingsryd','Uppvidinge','Växjö','Älmhult'] },
  { name: 'Blekinge län', municipalities: ['Karlshamn','Karlskrona','Olofström','Ronneby','Sölvesborg'] },
  { name: 'Skåne län', municipalities: ['Bjuv','Bromölla','Burlöv','Båstad','Eslöv','Helsingborg','Hässleholm','Höganäs','Hörby','Höör','Klippan','Kristianstad','Kävlinge','Landskrona','Lomma','Lund','Malmö','Osby','Perstorp','Simrishamn','Sjöbo','Skurup','Staffanstorp','Svalöv','Svedala','Tomelilla','Trelleborg','Vellinge','Ystad','Åstorp','Ängelholm','Örkelljunga','Östra Göinge'] },
];

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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1e1e30', border: '1px solid #444', borderRadius: 10, padding: 24, width: 360, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#eee', flex: 1, margin: 0 }}>⚙ Inställningar</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

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
                  <div style={{ padding: '6px 8px 8px 28px', display: 'flex', flexDirection: 'column', gap: 4, background: '#1a1a2e' }}>
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

        {/* Kritikalitetsviktning */}
        <div style={{ borderTop: '1px solid #2a2a40', paddingTop: 16, marginBottom: 16 }}>
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
