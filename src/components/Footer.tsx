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
  if (error === "not-allowed") return "Microphone blocked. Allow it in browser settings.";
  if (on && listening) return "Listening for 'need help'";
  return null;
}

// Fixed footer with the centred SOS control. When the rider has no active ride
// the control is shown disabled; tapping it reveals a hint instead of routing.
// A mic toggle (voice SOS) sits to the left of the circle when in a ride.
export function Footer({
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
  const footerRef = useRef<HTMLElement>(null);

  // Publish the real footer height so fixed overlays (SOS alert stack, page
  // padding) can clear it — it grows when the status line renders.
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--footer-height", `${el.offsetHeight}px`);
    };
    publish();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(publish);
      observer.observe(el);
    } else {
      window.addEventListener("resize", publish);
    }
    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", publish);
      document.documentElement.style.setProperty("--footer-height", "0px");
    };
  }, []);

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

  return (
    <footer
      ref={footerRef}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        // Sit above the fixed TabBar (which owns bottom:0 + the safe-area inset).
        bottom: "calc(var(--tabbar-height, 0px) + env(safe-area-inset-bottom))",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-xs)",
        background: "var(--color-surface-1)",
        borderTop: "1px solid var(--color-divider)",
        padding: "var(--space-sm) var(--gutter)",
        paddingBottom: "calc(var(--space-sm) + env(safe-area-inset-bottom))",
      }}
    >
      {disabled && showHint && (
        <p
          role="status"
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
            textAlign: "center",
          }}
        >
          Join or start a ride to enable SOS
        </p>
      )}

      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {showVoiceToggle && (
          <button
            type="button"
            className="btn"
            aria-label="Voice SOS listening"
            aria-pressed={voiceOn}
            disabled={!voiceSupported}
            onClick={onToggleVoice}
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--color-divider)",
              background: voiceOn && voiceListening ? "var(--color-accent)" : "var(--color-surface-2)",
              color:
                voiceOn && voiceListening
                  ? "var(--color-text-on-accent)"
                  : "var(--color-text-primary)",
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
            width: 72,
            height: 72,
            borderRadius: "var(--radius-full)",
            border: "none",
            background: disabled ? "var(--color-surface-3)" : "var(--color-danger)",
            color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-on-danger)",
            boxShadow: disabled ? "none" : "0 0 48px 8px var(--color-danger-glow)",
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

      {status && (
        <p
          role="status"
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
            textAlign: "center",
          }}
        >
          {status}
        </p>
      )}
    </footer>
  );
}
