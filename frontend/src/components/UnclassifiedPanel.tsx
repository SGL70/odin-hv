import { useMemo } from 'react';
import type { Feature } from '../types';
import { LayerIcon } from '../lib/layerIcons';
import { SidePanelFrame } from './SidePanelFrame';

// Klickbar motsvarighet till "🚩 Oklassade (N)"-badgen i topbaren — badgen visade tidigare
// bara ett antal utan något sätt att faktiskt hitta/välja objekten (CriticalityPanel.tsx:s
// mönster återanvänt här, samma "lista + klicka för att välja+centrera"-interaktion).
interface Props {
  features: Feature[];
  onClose: () => void;
  onSelect: (f: Feature) => void;
  sidebarOpen: boolean;
}

export function UnclassifiedPanel({ features, onClose, onSelect, sidebarOpen }: Props) {
  const objects = useMemo(() => features
    .filter(f => f.properties.unclassified === 'true')
    .sort((a, b) => String(a.properties.name).localeCompare(String(b.properties.name))), [features]);

  return (
    <SidePanelFrame icon="🚩" title="Oklassade rapporter" onClose={onClose} sidebarOpen={sidebarOpen}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {objects.length === 0 ? (
          <div style={{ fontSize: 11, color: '#555' }}>Inga oklassade rapporter just nu.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {objects.map(f => (
              <button
                key={f.properties.uid}
                onClick={() => onSelect(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#16162a', border: '1px solid #2a2a40',
                  borderRadius: 4, padding: '4px 8px', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
                }}
              >
                <LayerIcon id={f.properties.layer} />
                <span style={{ flex: 1, fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(f.properties.name)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#f0a83c', border: '1px solid #f0a83c55', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                  Oklassad
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </SidePanelFrame>
  );
}
