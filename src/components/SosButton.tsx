import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  disabled: boolean; // SOS disabled (no active ride)
  showVoiceToggle: boolean; // rideId is set
  voiceOn: boolean;
  voiceSupported: boolean;
  voiceListening: boolean;
  voiceError: string | null;
  onToggleVoice: () => void;
};

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
  disabled,
  showVoiceToggle,
  voiceOn,
  voiceSupported,
  voiceListening,
  voiceError,
  onToggleVoice,
}: Props) {
  const navigate = useNavigate();
  const [showHint, setShowHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHint) return;
    function onOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setShowHint(false);
      }
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [showHint]);

  function onPress() {
    if (disabled) {
      setShowHint(true);
      return;
    }
    navigate("/sos");
  }

  const status = showVoiceToggle
    ? voiceStatus(voiceSupported, voiceOn, voiceListening, voiceError)
    : null;
  const message = disabled && showHint ? "Join or start a ride to enable SOS" : status;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        right: "var(--gutter)",
        bottom: "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-md))",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "var(--space-xs)",
      }}
    >
      {message && (
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
          {message}
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
        className="btn"
        aria-label="SOS"
        aria-disabled={disabled}
        onClick={onPress}
        style={{
          width: 60,
          height: 60,
          borderRadius: "var(--radius-full)",
          border: disabled ? "1px solid var(--color-divider)" : "2px solid var(--color-surface-1)",
          background: disabled ? "var(--color-surface-3)" : "var(--color-danger)",
          color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-on-danger)",
          boxShadow: disabled ? "none" : "0 0 40px 6px var(--color-danger-glow)",
          cursor: disabled ? "not-allowed" : "pointer",
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
