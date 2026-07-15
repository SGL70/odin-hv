import type { LayerId } from '../types';

// Konsekvent linjeikon-språk som ersätter emoji för kartlagren (Claude Design-handoff
// 2026-07-04, se eventual-painting-codd.md steg 2). 18 av 28 är extraherade rakt av ur
// mockupens SVG-path-data (ODIN Redesign Mockup.dc.html); resterande resurslager designades
// nya i samma stil (viewBox 16x16, stroke 1.2–1.4, monokrom) eftersom mockupens Resurser-grupp
// visades hopfälld utan exempel.
//
// Färgregel från mockupen: händelselager (Händelser-gruppen) får sin status-färg på ikonen,
// alla övriga lager (Lager + Resurser) får den plana sekundärfärgen #9ea3c0 — status-färger är
// reserverade för räknar-badgen på de lagren, inte ikonen. Elkraft/Elavbrott delar samma
// blixt-form men skiljs åt med kontur (Elkraft, grå) vs fylld (Elavbrott, varning) — löser att
// ⚡ tidigare återanvändes för båda med identisk emoji.

const EVENT_ICON_COLOR: Partial<Record<LayerId, string>> = {
  road_situations: '#f0a83c',
  railway_situations: '#a878e0',
  police_events: '#4fa8e8',
  power_outages: '#f0a83c',
  sms_alerts: '#4fa8e8',
  intelligence_reports: '#34c274',
  news_reports: '#16a085',
  weather_warnings: '#e8a33c',
};

const DEFAULT_COLOR = '#9ea3c0';

type IconRender = (color: string) => JSX.Element;

const ICONS: Record<LayerId, IconRender> = {
  fuel: c => (
    <>
      <rect x={3} y={3} width={6} height={10} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M9 6h1.5a1 1 0 0 1 1 1v4.5a1 1 0 0 0 2 0V5l-1.5-1.5" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M4.5 6h3" stroke={c} strokeWidth={1.1} />
    </>
  ),
  food: c => (
    <>
      <path d="M3 13V8a5 5 0 0 1 10 0v5" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M2 13h12" stroke={c} strokeWidth={1.3} />
    </>
  ),
  water: c => (
    <path d="M8 2c3 4 5 6.3 5 8.7A5 5 0 0 1 3 10.7C3 8.3 5 6 8 2z" stroke={c} strokeWidth={1.3} fill="none" />
  ),
  raw_materials: c => (
    <>
      <path d="M5.5 3h5l1 3-1.2 7a1.8 1.8 0 0 1-1.8 1.5H7.5A1.8 1.8 0 0 1 5.7 13l-1.2-7 1-3z" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M6 3a2 2 0 0 1 4 0" stroke={c} strokeWidth={1.2} fill="none" />
    </>
  ),
  vehicles: c => (
    <>
      <rect x={1.5} y={6} width={7} height={5} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M8.5 8h2.5l2 2v1h-4.5" stroke={c} strokeWidth={1.3} fill="none" />
      <circle cx={4} cy={12.3} r={1.2} fill={c} />
      <circle cx={10.5} cy={12.3} r={1.2} fill={c} />
    </>
  ),
  firewood: c => (
    <>
      <circle cx={5} cy={8.5} r={2.8} stroke={c} strokeWidth={1.3} fill="none" />
      <circle cx={5} cy={8.5} r={1} fill={c} />
      <circle cx={11} cy={8.5} r={2.8} stroke={c} strokeWidth={1.3} fill="none" />
      <circle cx={11} cy={8.5} r={1} fill={c} />
    </>
  ),
  consumables: c => (
    <>
      <rect x={2} y={5} width={12} height={9} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M2 8h12M8 5v9" stroke={c} strokeWidth={1.1} />
    </>
  ),
  maintenance: c => (
    <path d="M9.8 2.6a3 3 0 0 0-4 4L2 10.4l1.6 1.6 3.8-3.8a3 3 0 0 0 4-4L9.6 6 8 4.4l1.8-1.8z" stroke={c} strokeWidth={1.2} strokeLinejoin="round" fill="none" />
  ),
  hygiene: c => (
    <>
      <rect x={3} y={6} width={10} height={6} rx={2.5} stroke={c} strokeWidth={1.3} fill="none" />
      <circle cx={6} cy={3.5} r={0.8} fill={c} />
      <circle cx={9} cy={2.8} r={0.6} fill={c} />
    </>
  ),
  roads: c => <path d="M2 12h12M4 12l3-8h2l3 8" stroke={c} strokeWidth={1.3} fill="none" />,
  bridges: c => (
    <>
      <path d="M1 11c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M2 6h12" stroke={c} strokeWidth={1.3} />
    </>
  ),
  cameras: c => (
    <>
      <rect x={2} y={5} width={9} height={6.5} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M11 7.5l3-2v6l-3-2" stroke={c} strokeWidth={1.3} fill="none" />
    </>
  ),
  powerlines: c => <path d="M9 1 3 9h4l-1 6 7-9H9l1-5z" stroke={c} strokeWidth={1.2} fill="none" />,
  telecom: c => (
    <>
      <path d="M3 8h3M8 4v8M11 6v4" stroke={c} strokeWidth={1.3} />
      <circle cx={3} cy={8} r={1.2} fill={c} />
    </>
  ),
  railways: c => <path d="M2 13 13 2M4 4l2 2M9 9l2 2" stroke={c} strokeWidth={1.3} />,
  ports: c => (
    <>
      <path d="M8 2v9M5 5l3-3 3 3" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M4 13h8" stroke={c} strokeWidth={1.3} />
    </>
  ),
  airports: c => <path d="M8 2 2 8l6 6 6-6z" stroke={c} strokeWidth={1.3} fill="none" />,
  medical: c => (
    <>
      <rect x={2} y={2} width={12} height={12} rx={2} stroke={c} strokeWidth={1.2} fill="none" />
      <path d="M8 5.5v5M5.5 8h5" stroke={c} strokeWidth={1.4} />
    </>
  ),
  emergency: c => (
    <>
      <rect x={5} y={7.5} width={6} height={4.5} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M8 7.5V4.5" stroke={c} strokeWidth={1.3} />
      <circle cx={8} cy={3.3} r={1.1} fill={c} />
      <path d="M3 12.5h10" stroke={c} strokeWidth={1.3} />
    </>
  ),
  tunnels: c => <path d="M2 12a6 6 0 0 1 12 0" stroke={c} strokeWidth={1.3} fill="none" />,
  fording_points: c => <path d="M2 9c1-2 2-2 3 0s2 2 3 0 2-2 3 0" stroke={c} strokeWidth={1.3} fill="none" />,
  staging_areas: c => (
    <>
      <rect x={3} y={2} width={10} height={12} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M6 5h3M6 8h2" stroke={c} strokeWidth={1.3} />
    </>
  ),
  transshipment: c => (
    <>
      <rect x={2} y={9} width={5} height={4} stroke={c} strokeWidth={1.3} fill="none" />
      <rect x={9} y={4} width={5} height={9} stroke={c} strokeWidth={1.3} fill="none" />
    </>
  ),
  road_situations: c => <path d="M8 2 1 14h14L8 2z" stroke={c} strokeWidth={1.3} fill="none" />,
  railway_situations: c => (
    <>
      <rect x={2} y={6} width={12} height={6} rx={2} stroke={c} strokeWidth={1.3} fill="none" />
      <circle cx={5} cy={13} r={1.3} fill={c} />
      <circle cx={11} cy={13} r={1.3} fill={c} />
    </>
  ),
  police_events: c => (
    <>
      <path d="M8 1.5 L13 3.5 V8 C13 11.3 10.7 13.5 8 14.5 C5.3 13.5 3 11.3 3 8 V3.5 Z" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M5 6.5h6" stroke={c} strokeWidth={1} />
    </>
  ),
  power_outages: c => <path d="M9 1 3 9h4l-1 6 7-9H9l1-5z" fill={c} />,
  sms_alerts: c => (
    <>
      <rect x={3} y={6} width={10} height={7} rx={1.5} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M6 6V4a2 2 0 0 1 4 0v2" stroke={c} strokeWidth={1.3} fill="none" />
    </>
  ),
  intelligence_reports: c => (
    <>
      <path d="M3 13V6l5-4 5 4v7" stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M6 13v-4h4v4" stroke={c} strokeWidth={1.3} fill="none" />
    </>
  ),
  news_reports: c => (
    <>
      <rect x={2} y={2.5} width={12} height={11} rx={1} stroke={c} strokeWidth={1.3} fill="none" />
      <path d="M4.5 5.5h4M4.5 8h7M4.5 10.5h7" stroke={c} strokeWidth={1.1} />
    </>
  ),
  weather_warnings: c => (
    <>
      <path d="M4.5 9.5a3 3 0 0 1 .3-6 3.6 3.6 0 0 1 6.8-1 3 3 0 0 1 .4 6" stroke={c} strokeWidth={1.2} fill="none" />
      <path d="M8.5 9.5 6.5 12.5h2.5L7.5 15" stroke={c} strokeWidth={1.2} fill="none" />
    </>
  ),
};

interface Props {
  id: LayerId;
  size?: number;
  color?: string;
}

export function LayerIcon({ id, size = 13, color }: Props) {
  const render = ICONS[id];
  if (!render) return null;
  const c = color ?? EVENT_ICON_COLOR[id] ?? DEFAULT_COLOR;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {render(c)}
    </svg>
  );
}
