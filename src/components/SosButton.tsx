import { useNavigate } from "react-router-dom";

// Floating SOS button footprint above the tab bar — the single source of truth
// consumed by AppLayout so nothing duplicates these magic numbers. The button is
// SOS_BUTTON_SIZE px square, anchored SOS_BUTTON_BOTTOM above the nav+safe-area.
// SOS_BUTTON_FOOTPRINT is the vertical space it occupies above the nav (offset +
// height): AppLayout pads scrolling content clear of it AND keeps the fixed alert
// container above it so the button stays tappable.
export const SOS_BUTTON_SIZE = 60;
export const SOS_BUTTON_BOTTOM = "var(--space-md)";
export const SOS_BUTTON_FOOTPRINT = `${SOS_BUTTON_BOTTOM} + ${SOS_BUTTON_SIZE}px`;

type Props = {
  showVoiceToggle: boolean; // rideId is set
  voiceOn: boolean;
  voiceSupported: boolean;
  voiceListening: boolean;
  voiceError: string | null;
  onToggleVoice: () => void;
};

// Pure gate for the floating SOS button (tested in SosButton.test.ts). The
// button shows ONLY for a user in a started ride, and never on the /sos screen
// itself (that screen has its own Send SOS button, so a floating duplicate
// there is redundant). No ride → no button at all: no grey state, no hint.
export function shouldShowSos(
  inApp: boolean,
  rideId: string | null,
  pathname: string,
): boolean {
  return inApp && Boolean(rideId) && !pathname.startsWith("/sos");
}

function voiceStatus(
  supported: boolean,
  on: boolean,
  listening: boolean,
  error: string | null,
): string | null {
  if (!supported) return "Voice not supported in this browser";
  if (error === "not-allowed") return "Microphone blocked. Allow it in settings.";
  if (on && listening) return "Listening for 'need help'";
  return null;
}

// Floating SOS control — a corner action rather than a full-width footer bar so
// it stays visible during a ride without sitting under the thumb where the map
// and nav controls are tapped (avoids accidental triggers). A tap opens the SOS
// confirm screen (never an instant alert). The voice-SOS toggle and its status
// ride along above it, and both clear the fixed TabBar below.
export function SosButton({
  showVoiceToggle,
  voiceOn,
  voiceSupported,
  voiceListening,
  voiceError,
  onToggleVoice,
}: Props) {
  const navigate = useNavigate();

  const status = showVoiceToggle
    ? voiceStatus(voiceSupported, voiceOn, voiceListening, voiceError)
    : null;

  return (
    <div
      style={{
        position: "fixed",
        right: "var(--gutter)",
        bottom: `calc(var(--tabbar-height) + env(safe-area-inset-bottom) + ${SOS_BUTTON_BOTTOM})`,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "var(--space-xs)",
      }}
    >
      {status && (
        <p
          role="status"
          style={{
            margin: 0,
            maxWidth: 220,
            textAlign: "right",
            padding: "var(--space-2xs) var(--space-sm)",
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-divider)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
          }}
        >
          {status}
        </p>
      )}

      {showVoiceToggle && (
        <button
          type="button"
          className="btn"
          aria-label="Voice SOS listening"
          aria-pressed={voiceOn}
          disabled={!voiceSupported}
          onClick={onToggleVoice}
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--color-divider)",
            background: voiceOn && voiceListening ? "var(--color-accent)" : "var(--color-surface-2)",
            color: voiceOn && voiceListening ? "var(--color-text-on-accent)" : "var(--color-text-primary)",
            boxShadow: voiceOn && voiceListening ? "0 0 32px 4px var(--color-accent-glow)" : "none",
            cursor: voiceSupported ? "pointer" : "not-allowed",
            opacity: voiceSupported ? 1 : 0.5,
            fontFamily: "var(--font-ui)",
            fontSize: "var(--text-label)",
            fontWeight: "var(--weight-semibold)" as unknown as number,
          }}
        >
          Mic
        </button>
      )}

      <button
        type="button"
        className="btn ui-raised"
        aria-label="SOS"
        onClick={() => navigate("/sos")}
        style={{
          width: SOS_BUTTON_SIZE,
          height: SOS_BUTTON_SIZE,
          borderRadius: "var(--radius-full)",
          border: "2px solid var(--color-surface-1)",
          background: "var(--grad-danger)",
          color: "var(--color-text-on-danger)",
          boxShadow: "0 0 40px 6px var(--color-danger-glow), var(--shadow-raised-danger)",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--text-body-size)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
          letterSpacing: "0.04em",
        }}
      >
        SOS
      </button>
    </div>
  );
}
