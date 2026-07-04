import type { CatchupData } from '../types';
import { BG, TEXT, BORDER, STATUS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../styles/tokens';

interface Props {
  data: CatchupData;
  onClose: () => void;
  onAcknowledgeAlert: (id: number) => void;
}

export function CatchupModal({ data, onClose, onAcknowledgeAlert }: Props) {
  const { alerts, changelogEntries } = data;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}
      onClick={onClose}
    >
      <div
        style={{ background: BG.panel, border: `1px solid ${BORDER.default}`, borderRadius: RADIUS.panelLg, padding: SPACING[6], width: 440, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: SPACING[6] }}>
          <h3 style={{ fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heading, color: TEXT.primary, flex: 1, margin: 0 }}>
            Sedan du var inne senast
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT.tertiary, fontSize: FONT_SIZE.xl, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: SPACING[7] }}>
          <div style={{ fontSize: FONT_SIZE.xs, color: TEXT.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING[3] }}>
            🔔 Larm du missat
          </div>
          {alerts.length === 0 && (
            <div style={{ fontSize: FONT_SIZE.sm, color: TEXT.tertiary }}>Inga missade larm.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
            {alerts.map(a => (
              <div key={a.id} style={{ border: `1px solid ${BORDER.default}`, borderRadius: RADIUS.control, padding: `${SPACING[2]}px ${SPACING[3]}px`, background: STATUS.warning.chip }}>
                <div style={{ fontSize: FONT_SIZE.sm, color: TEXT.primary, lineHeight: 1.3, marginBottom: SPACING[2] }}>{a.message}</div>
                <button
                  onClick={() => onAcknowledgeAlert(a.id)}
                  style={{ padding: '2px 8px', borderRadius: RADIUS.control, fontSize: FONT_SIZE.xs, background: BG.elevated, color: STATUS.warning.fg, border: `1px solid ${BORDER.strong}`, cursor: 'pointer' }}
                >Kvittera</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: FONT_SIZE.xs, color: TEXT.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING[3] }}>
            🆕 Nytt i appen
          </div>
          {changelogEntries.length === 0 && (
            <div style={{ fontSize: FONT_SIZE.sm, color: TEXT.tertiary }}>Inget nytt sedan sist.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
            {changelogEntries.map((e, i) => (
              <div key={i} style={{ border: `1px solid ${BORDER.default}`, borderRadius: RADIUS.control, padding: `${SPACING[2]}px ${SPACING[3]}px` }}>
                <div style={{ fontSize: FONT_SIZE.sm, color: TEXT.primary, fontWeight: FONT_WEIGHT.label }}>{e.title}</div>
                <div style={{ fontSize: FONT_SIZE.xs, color: TEXT.secondaryAlt, marginTop: 2 }}>{e.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
