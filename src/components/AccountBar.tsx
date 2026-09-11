import { useAuth } from "../hooks/useAuth";

/** Minimal signed-in indicator + sign-out — the app's visible proof that a
 * session exists and who it belongs to. Flow 2 owns the real profile/menu UI. */
export function AccountBar() {
  const { profile, isGuest, signOut } = useAuth();
  const label = profile?.display_name ?? (isGuest ? "Guest" : "Rider");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--space-md)",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-label)",
          color: "var(--color-text-secondary)",
        }}
      >
        {label}
        {isGuest && (
          <span
            style={{
              marginLeft: "var(--space-xs)",
              padding: "2px var(--space-xs)",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-3)",
              color: "var(--color-text-tertiary)",
              fontSize: "var(--text-caption)",
            }}
          >
            guest
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-text-tertiary)",
          fontSize: "var(--text-label)",
          cursor: "pointer",
          padding: "var(--space-2xs) var(--space-xs)",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
