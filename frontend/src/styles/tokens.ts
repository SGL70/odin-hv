// Designtokens från Claude Design-handoff (2026-07-04) — se UI-Handover.md / eventual-painting-codd.md
// Ersätter det tidigare ad hoc-färgschemat (flera olika gröna/röda hex för samma betydelse).

export const BG = {
  app: '#0a0a12',
  body: '#14141f',
  panel: '#1b1c2c',
  elevated: '#23243a',
  inset: '#10111c',
} as const;

export const TEXT = {
  primary: '#eef0f7',
  secondary: '#9ea3c0',
  secondaryAlt: '#c7cae0',
  tertiary: '#666a8c',
} as const;

export const BORDER = {
  default: '#2e2f45',
  strong: '#3d3f5c',
} as const;

export const ACCENT = {
  primary: '#5b8cff',
  hover: '#7aa0ff',
} as const;

export const STATUS = {
  normal: { fg: '#34c274', chip: '#123222' },
  warning: { fg: '#f0a83c', chip: '#3a2a12' },
  critical: { fg: '#f2545b', chip: '#3a1414' },
  info: { fg: '#4fa8e8', chip: '#12293a' },
  layer: { fg: '#a878e0', chip: '#2c1e3a' },
} as const;

// px — golv 11px, inga 9/10px kvar
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  xxl: 22,
  display: 28,
  hero: 36,
} as const;

export const FONT_WEIGHT = {
  body: 400,
  label: 600,
  heading: 700,
} as const;

export const RADIUS = {
  control: 6,
  panel: 10,
  panelLg: 12,
  pill: 999,
} as const;

// px — inga godtyckliga värden utanför denna skala
export const SPACING = [4, 6, 8, 10, 12, 14, 16, 20, 24, 32] as const;
