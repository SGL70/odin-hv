import { useState, useEffect } from 'react';
import { api } from '../api';
import { getLayer } from '../types';
import { LayerIcon } from '../lib/layerIcons';

interface DashboardData {
  totals: { layer: string; count: string; fuel_liters?: string; food_kg?: string; water_m3?: string }[];
  alerts: { uid: string; name: string; layer: string; fill_pct: string }[];
  activity: { action: string; username: string; layer: string; feature_name: string; created_at: string }[];
}

const ACTION_LABELS: Record<string, string> = { create: 'Skapade', update: 'Ändrade', delete: 'Raderade' };

interface Props { onClose: () => void }

export function Dashboard({ onClose }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.dashboard().then(d => setData(d as DashboardData));
    const t = setInterval(() => api.dashboard().then(d => setData(d as DashboardData)), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 340, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006', overflowY: 'auto',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>Dashboard</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      {!data ? (
        <div style={{ padding: 20, color: '#888', fontSize: 13 }}>Laddar...</div>
      ) : (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {data.alerts.length > 0 && (
            <div>
              <div style={sectionTitle}>⚠ Varningar</div>
              {data.alerts.map(a => (
                <div key={a.uid} style={alertRow}>
                  <span>{a.name}</span>
                  <span className="badge badge-red">{a.fill_pct}%</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={sectionTitle}>Resurser</div>
            {data.totals.map(t => {
              const layer = getLayer(t.layer as never);
              return (
                <div key={t.layer} style={statRow}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LayerIcon id={t.layer as never} />
                    {layer?.label || t.layer}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: layer?.color }}>{t.count} st</span>
                    {t.fuel_liters && <div style={{ fontSize: 11, color: '#888' }}>{Number(t.fuel_liters).toLocaleString('sv')} L</div>}
                    {t.food_kg && <div style={{ fontSize: 11, color: '#888' }}>{Number(t.food_kg).toLocaleString('sv')} kg</div>}
                    {t.water_m3 && <div style={{ fontSize: 11, color: '#888' }}>{Number(t.water_m3).toLocaleString('sv')} m³/dygn</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div style={sectionTitle}>Aktivitet</div>
            {data.activity.map((a, i) => (
              <div key={i} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid #2a2a3a' }}>
                <span style={{ color: '#aaa' }}>{ACTION_LABELS[a.action] || a.action} </span>
                <span style={{ color: '#fff' }}>{a.feature_name}</span>
                <div style={{ color: '#666', fontSize: 11 }}>
                  {a.username} · {new Date(a.created_at).toLocaleString('sv')}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
};
const statRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '6px 0', borderBottom: '1px solid #2a2a3a', fontSize: 13,
};
const alertRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '5px 0', fontSize: 13,
};
