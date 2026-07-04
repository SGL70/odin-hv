import type { Feature, LayerId } from '../types';
import { FeaturePanel } from './FeaturePanel';
import { HarvestSidebar } from './HarvestSidebar';

// Slår ihop FeaturePanel + HarvestSidebar till EN tabbad panel (Claude Design-handoff
// 2026-07-04, se eventual-painting-codd.md steg 7) — tidigare kunde båda visas sida vid sida
// och FeaturePanel knuffades 230px åt vänster (rightOffset) när skördarpanelen var öppen.
// Båda barnen hålls monterade hela tiden (CSS display, inte villkorlig montering) så att
// HarvestSidebar:s socket-anslutning och pågående skördning inte tappas när man byter flik.
type RightTab = 'feature' | 'harvest';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: RightTab;
  onActiveTabChange: (tab: RightTab) => void;
  harvestActive: boolean;
  onHarvestActivityChange: (active: boolean) => void;

  feature: Feature | null;
  group?: Feature[];
  onSelectFromGroup?: (f: Feature) => void;
  onCloseFeature: () => void;
  onSaved: (f: Feature) => void;
  onDeleted: (uid: string) => void;
  addMode: boolean;
  addLayer: LayerId;
  onAddLayerChange: (l: LayerId) => void;
  pendingPlacement: boolean;
  placementInfo?: string;
  newName: string;
  onNewNameChange: (v: string) => void;
  newFields: Record<string, string>;
  onNewFieldChange: (key: string, val: string) => void;
  onSubmitNew: () => void;
  onCancelPlacement: () => void;

  onImported: () => void;
  harvestRefreshInterval: number;
  onHarvestRefreshIntervalChange: (v: number) => void;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'feature', label: 'Objekt' },
  { id: 'harvest', label: 'Skördare' },
];

export function RightPanel({
  open, onOpenChange, activeTab, onActiveTabChange, harvestActive, onHarvestActivityChange,
  feature, group, onSelectFromGroup, onCloseFeature, onSaved, onDeleted, addMode, addLayer, onAddLayerChange,
  pendingPlacement, placementInfo, newName, onNewNameChange, newFields, onNewFieldChange, onSubmitNew, onCancelPlacement,
  onImported, harvestRefreshInterval, onHarvestRefreshIntervalChange,
}: Props) {
  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        style={{
          position: 'absolute', top: 66, right: 0, zIndex: 15,
          background: '#1b1c2cee', border: '1px solid #2e2f45',
          borderRight: 'none', borderRadius: '6px 0 0 6px',
          color: '#9ea3c0', fontSize: 16, width: 22, height: 40,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Visa panel"
      >‹</button>
    );
  }

  return (
    <div style={{ position: 'absolute', top: 58, right: 0, bottom: 10, zIndex: 15, display: 'flex', flexDirection: 'row-reverse' }}>
      <div style={{
        width: 340, background: '#1b1c2cee', border: '1px solid #2e2f45', borderRadius: 10,
        display: 'flex', flexDirection: 'column', backdropFilter: 'blur(8px)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #2e2f45', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => onActiveTabChange(t.id)} style={{
              flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 700,
              background: activeTab === t.id ? '#23243a' : 'none', border: 'none',
              color: activeTab === t.id ? '#7aa0ff' : '#666a8c',
              borderBottom: activeTab === t.id ? '2px solid #5b8cff' : '2px solid transparent',
              cursor: 'pointer', letterSpacing: 0.5,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {t.label}
                {t.id === 'harvest' && harvestActive && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c274' }} />
                )}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: activeTab === 'feature' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <FeaturePanel
            feature={feature}
            group={group}
            onSelectFromGroup={onSelectFromGroup}
            onClose={onCloseFeature}
            onSaved={onSaved}
            onDeleted={onDeleted}
            addMode={addMode}
            addLayer={addLayer}
            onAddLayerChange={onAddLayerChange}
            pendingPlacement={pendingPlacement}
            placementInfo={placementInfo}
            newName={newName}
            onNewNameChange={onNewNameChange}
            newFields={newFields}
            onNewFieldChange={onNewFieldChange}
            onSubmitNew={onSubmitNew}
            onCancelPlacement={onCancelPlacement}
          />
        </div>
        <div style={{ display: activeTab === 'harvest' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <HarvestSidebar
            onImported={onImported}
            onActivityChange={onHarvestActivityChange}
            refreshInterval={harvestRefreshInterval}
            onRefreshIntervalChange={onHarvestRefreshIntervalChange}
          />
        </div>
      </div>
    </div>
  );
}
