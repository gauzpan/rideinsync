import { useState, type CSSProperties } from "react";
import { Button } from "./ui/Button";

type Props = {
  /** Resolves the SOS. The button unmounts with the alert on success. */
  onResolve: () => Promise<void>;
  /** Compact (alert-bar) sizing: auto-width buttons, stacked when armed. */
  compact?: boolean;
  style?: CSSProperties;
};

// Double-confirmation resolve control for an active SOS. First tap arms it
// ("Confirm resolve" + "Cancel"); the second tap runs onResolve. A failed
// resolve shows the error and stays armed so the lead can retry.
export function SosResolveButton({ onResolve, compact, style }: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onResolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resolve this SOS.");
      setBusy(false);
    }
  }

  function cancel() {
    setArmed(false);
    setError(null);
  }

  const buttonStyle: CSSProperties | undefined = compact
    ? { width: "auto", whiteSpace: "nowrap" }
    : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "column" : "column",
        gap: "var(--space-xs)",
        flex: compact ? "none" : undefined,
        ...style,
      }}
    >
      {!armed ? (
        <Button
          variant="ghost"
          fullWidth={!compact}
          onClick={() => setArmed(true)}
          style={buttonStyle}
        >
          Resolve
        </Button>
      ) : (
        <>
          <Button
            variant="danger"
            fullWidth={!compact}
            loading={busy}
            onClick={() => void confirm()}
            style={buttonStyle}
          >
            Confirm resolve
          </Button>
          <Button
            variant="ghost"
            fullWidth={!compact}
            disabled={busy}
            onClick={cancel}
            style={buttonStyle}
          >
            Cancel
          </Button>
        </>
      )}
      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: "var(--color-role-sweep)",
            fontSize: "var(--text-caption)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
