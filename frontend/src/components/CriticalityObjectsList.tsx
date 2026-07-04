import { useMemo } from 'react';
import type { Feature } from '../types';
import { LayerIcon } from '../lib/layerIcons';

interface Props {
  features: Feature[];
  onSelect?: (f: Feature) => void;
  selectedUid?: string;
}

const CRIT_ORDER: Record<string, number> = { rod: 0, gul: 1 };
const CRIT_COLOR: Record<string, string> = { rod: '#f2545b', gul: '#f0a83c' };
const CRIT_LABEL: Record<string, string> = { rod: 'Kritisk', gul: 'Viktig' };

export function CriticalityObjectsList({ features, onSelect, selectedUid }: Props) {
  const objects = useMemo(() => features
    .filter(f => f.properties.criticality === 'rod' || f.properties.criticality === 'gul')
    .sort((a, b) => {
      const oa = CRIT_ORDER[String(a.properties.criticality)] ?? 2;
      const ob = CRIT_ORDER[String(b.properties.criticality)] ?? 2;
      return oa !== ob ? oa - ob : String(a.properties.name).localeCompare(String(b.properties.name));
    }), [features]);

  if (objects.length === 0) {
    return <div style={{ fontSize: 11, color: '#555' }}>Inga objekt med kritikalitet just nu.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {objects.map(f => {
        const crit = String(f.properties.criticality);
        return (
          <button
            key={f.properties.uid}
            onClick={() => onSelect?.(f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: f.properties.uid === selectedUid ? '#22224a' : '#16162a',
              border: `1px solid ${f.properties.uid === selectedUid ? '#5b8cff' : '#2a2a40'}`,
              borderRadius: 4, padding: '4px 8px', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
            }}
          >
            <LayerIcon id={f.properties.layer} />
            <span style={{ flex: 1, fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(f.properties.name)}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: CRIT_COLOR[crit], border: `1px solid ${CRIT_COLOR[crit]}55`, borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
              {CRIT_LABEL[crit] ?? crit}
            </span>
          </button>
        );
      })}
    </div>
  );
}
