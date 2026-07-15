import type { AlertEvent } from '../types';
import { IconClose, IconWarning } from '../lib/uiIcons';

interface Props {
  alerts: AlertEvent[];
  onDismiss: (id: number) => void;
  onAcknowledge: (id: number) => void;
}

export function AlertBanner({ alerts, onDismiss, onAcknowledge }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', top: 56, right: 10, zIndex: 25,
      display: 'flex', flexDirection: 'column', gap: 6, width: 300,
    }}>
      {alerts.map(a => (
        <div key={a.id} style={{
          background: '#3a1e1eee', border: '1px solid #e74c3c', borderRadius: 6,
          padding: '8px 10px', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px #0006',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ color: '#e74c3c' }}><IconWarning size={14} /></span>
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
      ))}
    </div>
  );
}
