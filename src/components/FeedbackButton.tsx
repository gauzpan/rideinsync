import { useEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { useAuth } from "../hooks/useAuth";
import { FEEDBACK_MAX, submitAppFeedback } from "../lib/feedback";

type Props = {
  /** Where this button lives, stored with the feedback (e.g. "home", "ride_end"). */
  context: string;
  /** "icon" = round icon button (headers); "link" = inline text button. */
  variant?: "icon" | "link";
  /** Text for the "link" variant. */
  label?: string;
};

/**
 * A drop-in feedback entry point: a trigger that opens a bottom sheet where the
 * signed-in user can send free-text feedback / grievances. The name is fetched
 * automatically from their profile; the message is stored in Supabase
 * (app_feedback) scoped to them by RLS. Place it wherever feedback is likely —
 * the home screen, the post-ride summary, etc.
 */
export function FeedbackButton({ context, variant = "icon", label = "Send feedback" }: Props) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "link" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2xs)",
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-label)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
          cursor: "pointer",
        }}
      >
        <Icon name="message-square" size={16} />
        {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        style={{
          width: 44,
          height: 44,
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--color-divider)",
          background: "var(--color-surface-3)",
          color: "var(--color-text-primary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Icon name="message-square" size={20} />
      </button>
    );

  return (
    <>
      {trigger}
      {open && <FeedbackSheet context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackSheet({ context, onClose }: { context: string; onClose: () => void }) {
  const { user, profile } = useAuth();
  const name = profile?.display_name?.trim() || "Rider";
  const [bug, setBug] = useState("");
  const [improvement, setImprovement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (!user) {
      setError("Sign in to send feedback.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Bugs and requests are filed as separate rows, tagged via context, so
      // the dashboard can tell an issue apart from a feature request.
      if (bug.trim()) {
        await submitAppFeedback({ userId: user.id, userName: name, message: bug, context: `${context}:bug` });
      }
      if (improvement.trim()) {
        await submitAppFeedback({ userId: user.id, userName: name, message: improvement, context: `${context}:improvement` });
      }
      setDone(true);
      window.setTimeout(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your feedback. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Portal to <body>: rendered inline it sits inside AppLayout's stacking
  // context, where the fixed bottom nav paints over the sheet's submit button
  // (z-index:1000 doesn't escape a nested stacking context). The portal lifts it
  // above everything.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface-1)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-lg) var(--gutter) calc(var(--space-lg) + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        {done ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-md) 0" }}>
            <span style={{ color: "var(--color-accent)" }}>
              <Icon name="check" size={24} />
            </span>
            <span style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
              Thanks, {name} — we got it.
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "var(--text-h2)", fontWeight: "var(--weight-semibold)" }}>Share feedback</h2>
                <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                  We're in early days, still learning what riders need, so things may
                  break. Sending as {name}. Flag anything that's not working, or
                  request something you'd like the app to do.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{ flex: "none", border: "none", background: "transparent", color: "var(--color-text-tertiary)", cursor: "pointer", padding: 4 }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <FeedbackField
              inputRef={textareaRef}
              label="Something's not working"
              value={bug}
              onChange={setBug}
              placeholder="Describe the bug or issue you hit…"
            />

            <FeedbackField
              label="A feature you'd like"
              value={improvement}
              onChange={setImprovement}
              placeholder="Tell us what the app should do…"
            />

            {error && (
              <p role="alert" style={{ margin: 0, color: "var(--color-role-sweep)", fontSize: "var(--text-label)" }}>
                {error}
              </p>
            )}

            <Button onClick={() => void handleSubmit()} loading={submitting} disabled={!bug.trim() && !improvement.trim()}>
              Send feedback
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function FeedbackField({
  inputRef,
  label,
  value,
  onChange,
  placeholder,
}: {
  inputRef?: Ref<HTMLTextAreaElement>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xs)" }}>
      <span style={{ fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--color-text-primary)" }}>
        {label}
      </span>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={FEEDBACK_MAX}
        rows={3}
        placeholder={placeholder}
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          minHeight: 80,
          padding: "var(--space-md)",
          background: "var(--color-surface-2)",
          border: "1px solid transparent",
          borderRadius: "var(--radius-md)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--text-body-size)",
          outline: "none",
        }}
      />
    </label>
  );
}
