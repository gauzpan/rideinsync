import { useState } from "react";
import { Button } from "./ui/Button";
import { Mark } from "./ui/Logo";
import { useAuth } from "../hooks/useAuth";
import { stashPendingJoinCode } from "../services/authService";

type Props = {
  /** Set when the sign-in sheet is showing over a `/join/:code` deep link —
   *  stashed before a Google redirect so the join resumes on return. */
  joinCode?: string;
};

/**
 * Sign-in sheet: the entry gate offering "Continue with Google" and
 * "Continue as guest". Rendered full-screen (mobile PWA has no room for a
 * true bottom sheet + backdrop) but keeps the sheet visual language — a
 * surface-1 card anchored to the bottom with pill actions.
 */
export function SignInSheet({ joinCode }: Props) {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const [pending, setPending] = useState<"google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setPending("google");
    try {
      // Guest sign-in is in-page and needs no round-trip; only the Google
      // redirect can lose the join code, so only stash it here.
      if (joinCode) stashPendingJoinCode(joinCode);
      await signInWithGoogle();
      // Browser navigates away for the OAuth round-trip; nothing else to do.
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Couldn't start Google sign-in.");
    }
  }

  async function handleGuest() {
    setError(null);
    setPending("guest");
    try {
      await signInAsGuest();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in as guest.");
    } finally {
      setPending(null);
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
        <Mark size={56} />
        <h1
          style={{
            fontSize: "var(--text-h1)",
            lineHeight: "var(--lh-h1)",
            fontWeight: "var(--weight-semibold)",
            margin: "var(--space-lg) 0 var(--space-xs)",
          }}
        >
          Welcome to RideInSync
        </h1>
        <p
          style={{
            fontSize: "var(--text-body-size)",
            lineHeight: "var(--lh-body)",
            color: "var(--color-text-secondary)",
            margin: 0,
            maxWidth: 420,
          }}
        >
          {joinCode
            ? `Sign in to continue joining with code ${joinCode}. Guests can hop into a ride in seconds — leading a ride needs a Google account.`
            : "Sign in to lead or join a ride. Guests can hop into a ride in seconds — leading a ride needs a Google account."}
        </p>
      </div>

      <div
        role="group"
        aria-label="Sign in"
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
        {error && (
          <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-label)", margin: 0 }}>{error}</p>
        )}
        <Button onClick={handleGoogle} disabled={pending !== null} loading={pending === "google"}>
          Continue with Google
        </Button>
        <Button
          variant="secondary"
          onClick={handleGuest}
          disabled={pending !== null}
          loading={pending === "guest"}
        >
          Continue as guest
        </Button>
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            margin: "var(--space-xs) 0 0",
          }}
        >
          By continuing you agree to share ride and safety details with your group.
        </p>
      </div>
    </div>
  );
}
