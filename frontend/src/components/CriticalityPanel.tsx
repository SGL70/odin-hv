import type { Feature } from '../types';
import { CriticalityObjectsList } from './CriticalityObjectsList';
import { SidePanelFrame } from './SidePanelFrame';

interface Props {
  features: Feature[];
  onClose: () => void;
  onSelect: (f: Feature) => void;
  sidebarOpen: boolean;
}

export function CriticalityPanel({ features, onClose, onSelect, sidebarOpen }: Props) {
  return (
    <SidePanelFrame icon="🎯" title="Kritiska objekt" onClose={onClose} sidebarOpen={sidebarOpen}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <CriticalityObjectsList features={features} onSelect={onSelect} />
      </div>
    </SidePanelFrame>
  );
}
