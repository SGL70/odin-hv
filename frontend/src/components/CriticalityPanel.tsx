import type { Feature } from '../types';
import { CriticalityObjectsList } from './CriticalityObjectsList';

interface Props {
  features: Feature[];
  onClose: () => void;
  onSelect: (f: Feature) => void;
}

export function CriticalityPanel({ features, onClose, onSelect }: Props) {
  return (
    <div style={{
      position: 'absolute', left: 190, top: 10, bottom: 10, zIndex: 10,
      width: 360, background: '#1e1e30', border: '1px solid #333',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🎯 Kritiska objekt</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <CriticalityObjectsList features={features} onSelect={onSelect} />
      </div>
    </div>
  );
}
