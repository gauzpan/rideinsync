import { buildOwnSosStatus, type Responder } from "../lib/sos";

/**
 * The SOS raiser's own "help is coming" status bar. useSosAlerts (and the shared
 * SosAlertStack) filter out the raiser's own alert, so this is the only surface
 * that tells the rider who raised the SOS whether anyone has responded. Shown on
 * every in-app screen except /sos (which has its own responder list) — including
 * the ride view, where LiveOps embeds SosAlertStack but renders no own-SOS UI.
 */
export function OwnSosBar({ responders, onView }: { responders: Responder[]; onView: () => void }) {
  return (
    <button
      type="button"
      onClick={onView}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-sm)",
        width: "100%",
        textAlign: "left",
        padding: "var(--space-xs) var(--space-md)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-divider)",
        boxShadow: "var(--shadow-card, 0 8px 24px rgba(0,0,0,.5))",
        color: "var(--color-text-primary)",
        fontSize: "var(--text-body-strong)",
        fontWeight: "var(--weight-semibold)" as unknown as number,
        cursor: "pointer",
      }}
    >
      <span style={{ minWidth: 0 }}>{buildOwnSosStatus(responders)}</span>
      <span
        style={{
          flexShrink: 0,
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-label)",
          fontWeight: "var(--weight-regular)" as unknown as number,
        }}
      >
        View
      </span>
    </button>
  );
}
