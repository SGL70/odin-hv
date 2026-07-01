interface Props {
  size?: 'sm' | 'md' | 'lg';
}

export function OdinLogo({ size = 'md' }: Props) {
  const base = { sm: 13, md: 17, lg: 32 }[size];
  return (
    <span style={{ lineHeight: 1, userSelect: 'none', display: 'inline-flex', alignItems: 'baseline', gap: 0 }}>
      <span style={{
        fontSize: base,
        fontWeight: 900,
        color: '#ffffff',
        letterSpacing: 3,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>ODIN</span>
      <span style={{
        fontSize: base * 0.62,
        fontWeight: 400,
        color: '#8899bb',
        letterSpacing: 1,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>hv</span>
    </span>
  );
}
