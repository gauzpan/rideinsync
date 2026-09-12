import { useState } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { usePersistedToggle } from "../lib/preference";
import { VOICE_COMMANDS_KEY } from "../lib/voiceCommands";
import { SIGNAL_LABEL, SIGNAL_TYPES } from "../lib/signals";
import { primeAudioContext } from "../lib/earcon";

type Props = { onDone: () => void };

/**
 * One-time, shown right after sign-in (see AppLayout): asks for microphone
 * access up front so "RideInSync, ___" voice commands work the first time a
 * rider tries them mid-ride, instead of hitting a cold permission prompt then.
 * Declining just leaves the Profile toggle off — nothing else is blocked.
 */
export function VoicePermissionSheet({ onDone }: Props) {
  const [, setVoiceOn] = usePersistedToggle(VOICE_COMMANDS_KEY, false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnable() {
    setError(null);
    setRequesting(true);
    // Fired synchronously, before the getUserMedia await below, so it
    // actually lands inside this click's user-gesture window — see
    // primeAudioContext's doc comment.
    primeAudioContext();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only the permission grant is needed here; the wake-word listener opens
      // its own recognition session later.
      stream.getTracks().forEach((track) => track.stop());
      setVoiceOn(true);
      onDone();
    } catch {
      setError("Microphone access was denied. You can turn this on later from Profile.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-base)",
        zIndex: 100,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 280,
          height: 280,
          borderRadius: "var(--radius-full)",
          background: "radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--space-lg) var(--gutter)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--space-lg)",
            color: "var(--color-accent)",
          }}
        >
          <Icon name="signal" size={28} />
        </div>
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-accent)",
            fontWeight: "var(--weight-semibold)" as unknown as number,
            margin: "0 0 var(--space-2xs)",
          }}
        >
          Since RideInSync is voice-first
        </p>
        <h1
          style={{
            fontSize: "var(--text-h1)",
            lineHeight: "var(--lh-h1)",
            fontWeight: "var(--weight-semibold)",
            margin: "0 0 var(--space-xs)",
          }}
        >
          Try hands-free voice commands
        </h1>
        <p
          style={{
            fontSize: "var(--text-body-size)",
            lineHeight: "var(--lh-body)",
            color: "var(--color-text-secondary)",
            margin: "0 0 var(--space-lg)",
            maxWidth: 420,
          }}
        >
          Say "sync" followed by one of these to signal your group without touching your
          phone.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}>
          {SIGNAL_TYPES.map(({ kind, icon, color }) => (
            <div
              key={kind}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                background: "var(--color-surface-2)",
                borderRadius: "var(--radius-full)",
                padding: "var(--space-2xs) var(--space-sm) var(--space-2xs) var(--space-2xs)",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "var(--radius-full)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: color,
                  color: "var(--color-text-on-accent)",
                  flex: "none",
                }}
              >
                <Icon name={icon} size={16} />
              </span>
              <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-primary)" }}>
                {SIGNAL_LABEL[kind]}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--color-text-tertiary)",
            margin: "var(--space-lg) 0 0",
          }}
        >
          You can turn this off anytime from Profile.
        </p>

        {error && (
          <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-label)", marginTop: "var(--space-md)" }}>
            {error}
          </p>
        )}
      </div>

      <div
        role="group"
        aria-label="Enable voice commands"
        style={{
          background: "var(--color-surface-1)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-lg) var(--gutter) calc(var(--space-2xl) + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        <Button onClick={() => void handleEnable()} loading={requesting}>
          Enable voice commands
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            primeAudioContext();
            onDone();
          }}
          disabled={requesting}
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
