// UI-kromikoner (stäng/inställningar/importera/uppdatera/expandera/varning) i samma
// linjeikon-språk som layerIcons.tsx (viewBox 16x16, stroke, monokrom) — ersätter bara
// Unicode-symboler (✕ ⚙ ⬆ ↻ ▲ ▼ ⚠) som saknar glyf i vissa typsnitt/plattformar och därför
// visas som tomma rutor, till skillnad från riktiga emoji (🌤 🚗 🗑 m.fl.) som alltid har
// en fallback-font. Ärver textfärg via currentColor, precis som de ersatta glyferna gjorde.

interface IconProps {
  size?: number;
}

export function IconClose({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function IconSettings({ size = 14 }: IconProps) {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 8 + Math.cos(a) * 5.2, y1 = 8 + Math.sin(a) * 5.2;
    const x2 = 8 + Math.cos(a) * 7, y2 = 8 + Math.sin(a) * 7;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {ticks}
      <circle cx={8} cy={8} r={3.2} stroke="currentColor" strokeWidth={1.4} fill="none" />
    </svg>
  );
}

export function IconImport({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M8 11.5V3M4.5 6.5L8 3l3.5 3.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 13h10" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

export function IconRefresh({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M3.5 8a4.5 4.5 0 0 1 7.6-3.25M12.5 8a4.5 4.5 0 0 1-7.6 3.25" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <path d="M11.5 3.5v2.2h-2.2M4.5 12.5v-2.2h2.2" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconChevronUp({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconChevronDown({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconWarning({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M8 2.5l6.2 11H1.8L8 2.5z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
      <line x1={8} y1={6.5} x2={8} y2={9.5} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={8} cy={11.5} r={0.9} fill="currentColor" />
    </svg>
  );
}
