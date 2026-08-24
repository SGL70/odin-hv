import type { ReactNode } from 'react';
import { IconClose } from '../lib/uiIcons';

// Delad inramning för de flytande panelerna som öppnas från topbaren (Analys, Rapporter,
// Kritiska objekt, Oklassade, Tips, Nyheter, Väder, Dashboard, Polygon-sök). Tidigare hade
// var och en sin egen kopia av detta skal med left:190/top:10 hårdkodat — det brydde sig
// varken om Sidebar var infälld eller om topbaren (48px + zIndex 20) låg ovanpå. Positionen
// och färgpaletten här matchar RightPanel.tsx:s korta-look (#1b1c2cee/#2e2f45/borderRadius 10)
// så vänster och höger sida av kartan upplevs som samma designspråk.
const SIDEBAR_OPEN_WIDTH = 210;   // 188px lagerträd + 22px infällningsknapp, ingen gap mellan dem
const SIDEBAR_COLLAPSED_WIDTH = 22;
const GAP = 10;

interface Props {
  icon?: string;
  title: string;
  onClose: () => void;
  sidebarOpen: boolean;
  width?: number;
  children: ReactNode;
}

export function SidePanelFrame({ icon, title, onClose, sidebarOpen, width = 360, children }: Props) {
  const left = (sidebarOpen ? SIDEBAR_OPEN_WIDTH : SIDEBAR_COLLAPSED_WIDTH) + GAP;

  return (
    <div style={{
      position: 'absolute', left, top: 58, bottom: 10, zIndex: 10,
      width, background: '#1b1c2cee', border: '1px solid #2e2f45',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 20px #0006', backdropFilter: 'blur(8px)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #2e2f45', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{icon ? `${icon} ` : ''}{title}</span>
        <button className="btn-ghost btn-sm" onClick={onClose}><IconClose /></button>
      </div>
      {children}
    </div>
  );
}
