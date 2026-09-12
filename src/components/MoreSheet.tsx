import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./ui/Icon";
import { useAuth } from "../hooks/useAuth";
import "./BottomNav.css";

type Props = {
  onClose: () => void;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Bottom sheet opened from the "More" tab: dev-only demo controls entry
 *  point plus the account identity/sign-out that used to live in the
 *  top AccountBar. The one authored motion moment in the shell. */
export function MoreSheet({ onClose }: Props) {
  const navigate = useNavigate();
  const { user, profile, isGuest, signOut } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Identity display: guest -> "Guest"; else profile.first_name (trimmed)
  // -> else user.phone -> else user.email -> else "Your account".
  const firstName = profile?.first_name?.trim();
  const identity = isGuest
    ? "Guest"
    : firstName
    ? firstName
    : user?.phone
    ? user.phone
    : user?.email
    ? user.email
    : "Your account";

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="more-sheet__scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="more-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label="More options"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="more-sheet__grabber" aria-hidden />

        <button
          type="button"
          className="more-sheet__row"
          onClick={() => {
            onClose();
            navigate("/profile");
          }}
        >
          <span className="more-sheet__row-icon">
            <Icon name="user" size={20} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1 }}>Profile</span>
        </button>

        <button
          type="button"
          className="more-sheet__row"
          onClick={() => {
            onClose();
            navigate("/ride/demo");
          }}
        >
          <span className="more-sheet__row-icon">
            <Icon name="navigation" size={20} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1 }}>Live tracking demo</span>
        </button>

        <hr className="more-sheet__divider" />

        {/* Account identity — a static header, not a tappable option. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            minHeight: 56,
            padding: "var(--space-sm) var(--space-2xs)",
          }}
        >
          <span className="more-sheet__row-icon">
            <Icon name="user" size={20} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span
              style={{
                fontSize: "var(--text-caption)",
                lineHeight: "var(--lh-caption)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Signed in as
            </span>
            <span
              style={{
                fontSize: "var(--text-body-size)",
                lineHeight: "var(--lh-body)",
                color: "var(--color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {identity}
            </span>
          </span>
        </div>

        <button
          type="button"
          className="more-sheet__row"
          onClick={() => {
            onClose();
            void signOut();
          }}
        >
          <span className="more-sheet__row-icon">
            <Icon name="log-out" size={20} strokeWidth={1.75} />
          </span>
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
