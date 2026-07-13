import { useEffect, useState } from 'react';
import { api } from '../api';
import type { WeatherForecast } from '../types';

// Väder-vid-plats (SMHI punktprognos) — komplement till Vädervarningar-lagret. Varningar täcker
// stora områden och grova hot; den här panelen svarar på "vad blir det för vind/temp/nederbörd
// HÄR de kommande timmarna", t.ex. vindriktning vid ett gasutsläpp eller temperatur/nederbörd
// vid eftersök av en saknad person. Samma "finjustera på kartan"-mönster som Tips/Nyheter, se
// weatherPickMode/weatherPickResult i MapView.tsx.

function fmtHour(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function windArrowRotation(fromDeg: number | null) {
  if (fromDeg == null) return 0;
  // Pilen visar vart vinden blåser (motsatt "från"-riktningen), meteorologisk konvention.
  return (fromDeg + 180) % 360;
}

interface Props {
  onClose: () => void;
  weatherPickMode: boolean;
  onArmWeatherPick: () => void;
  weatherPickResult: { lat: number; lng: number } | null;
  onConsumeWeatherPick: () => void;
}

export function WeatherPanel({ onClose, weatherPickMode, onArmWeatherPick, weatherPickResult, onConsumeWeatherPick }: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!weatherPickResult) return;
    setCoords(weatherPickResult);
    onConsumeWeatherPick();
  }, [weatherPickResult, onConsumeWeatherPick]);

  useEffect(() => {
    if (!coords) return;
    setLoading(true);
    setError('');
    api.weather.forecast(coords.lat, coords.lng)
      .then(setForecast)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte hämta prognos'))
      .finally(() => setLoading(false));
  }, [coords]);

  const current = forecast?.current;

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 340, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🌤 Väder vid plats</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <button
          className="btn-ghost btn-sm"
          onClick={onArmWeatherPick}
          style={{ width: '100%', marginBottom: 10, color: weatherPickMode ? '#5b8cff' : undefined, borderColor: weatherPickMode ? '#5b8cff' : undefined }}
        >
          {weatherPickMode ? 'Klicka på kartan…' : coords ? '📍 Plats vald — klicka för att ändra' : '📍 Välj plats på kartan'}
        </button>

        {!coords && !weatherPickMode && (
          <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Välj en plats på kartan för att se väderprognos där.</div>
        )}

        {error && <div style={{ fontSize: 11, color: '#f2545b', marginBottom: 8 }}>{error}</div>}
        {loading && <div style={{ color: '#666', fontSize: 12, padding: 8 }}>Hämtar prognos…</div>}

        {current && !loading && (
          <>
            <div style={{ background: '#16162a', border: '1px solid #2a2a40', borderRadius: 6, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>{fmtHour(current.time)} · {coords!.lat.toFixed(3)}, {coords!.lng.toFixed(3)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 24, transform: `rotate(${windArrowRotation(current.wind_direction)}deg)`, lineHeight: 1 }}>↑</div>
                  <div style={{ fontSize: 11, color: '#ddd' }}>{current.wind_speed ?? '–'} m/s</div>
                  {current.wind_gust != null && <div style={{ fontSize: 9, color: '#888' }}>byar {current.wind_gust} m/s</div>}
                  <div style={{ fontSize: 9, color: '#666' }}>från {current.wind_direction ?? '–'}°</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, color: '#ddd' }}>{current.temperature ?? '–'}°C</div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    Nederbörd {current.precipitation_mm ?? 0} mm/h
                    {current.precipitation_probability != null && ` (${current.precipitation_probability}% sannolikhet)`}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Kommande timmar</div>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#666', textAlign: 'left' }}>
                  <th style={{ padding: '3px 4px' }}>Tid</th>
                  <th style={{ padding: '3px 4px' }}>Temp</th>
                  <th style={{ padding: '3px 4px' }}>Vind</th>
                  <th style={{ padding: '3px 4px' }}>Nederbörd</th>
                </tr>
              </thead>
              <tbody>
                {(forecast?.hourly || []).slice(1).map(h => (
                  <tr key={h.time} style={{ borderTop: '1px solid #2a2a40' }}>
                    <td style={{ padding: '3px 4px', color: '#aaa' }}>{fmtHour(h.time)}</td>
                    <td style={{ padding: '3px 4px', color: '#ddd' }}>{h.temperature ?? '–'}°</td>
                    <td style={{ padding: '3px 4px', color: '#ddd' }}>
                      <span style={{ display: 'inline-block', transform: `rotate(${windArrowRotation(h.wind_direction)}deg)` }}>↑</span> {h.wind_speed ?? '–'} m/s
                    </td>
                    <td style={{ padding: '3px 4px', color: '#ddd' }}>{h.precipitation_mm ?? 0} mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
