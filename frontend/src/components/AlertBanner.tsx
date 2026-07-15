import type { AlertEvent, AlertSeverity } from '../types';
import { IconClose, IconWarning } from '../lib/uiIcons';

interface Props {
  alerts: AlertEvent[];
  onDismiss: (id: number) => void;
  onAcknowledge: (id: number) => void;
}

// Kritisk (röd) är dagens etablerade utseende — varning/info nedtonas något så en översvämning
// av lägre-prioriterade larm inte ser lika alarmerande ut som ett faktiskt kritiskt larm.
const SEVERITY_COLOR: Record<AlertSeverity, string> = { kritisk: '#e74c3c', varning: '#f0a83c', info: '#4fa8e8' };

export function AlertBanner({ alerts, onDismiss, onAcknowledge }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', top: 56, right: 10, zIndex: 25,
      display: 'flex', flexDirection: 'column', gap: 6, width: 300,
    }}>
      {alerts.map(a => {
        const color = SEVERITY_COLOR[a.severity ?? 'kritisk'] ?? SEVERITY_COLOR.kritisk;
        return (
        <div key={a.id} style={{
          background: '#3a1e1eee', border: `1px solid ${color}`, borderRadius: 6,
          padding: '8px 10px', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px #0006',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ color }}><IconWarning size={14} /></span>
            <div style={{ flex: 1, fontSize: 12, color: '#fdd', lineHeight: 1.4 }}>{a.message}</div>
            <button onClick={() => onDismiss(a.id)} style={{ background: 'none', border: 'none', color: '#a88', fontSize: 13, cursor: 'pointer' }}><IconClose size={13} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={() => onAcknowledge(a.id)}
              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: '#5b8cff', color: '#fff', border: 'none', cursor: 'pointer' }}
            >Kvittera</button>
          </div>
        </div>
        );
      })}
    </div>
  );
}
