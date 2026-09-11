import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Logo } from "./ui/Logo";
import { Icon } from "./ui/Icon";

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text-primary)",
  fontSize: "var(--text-label)",
  fontFamily: "var(--font-ui)",
  cursor: "pointer",
  padding: "var(--space-sm)",
};

/** Top app bar: the RideInSync logo on the left, and a single account icon on
 *  the right. The rider's identity, profile link, and sign-out live together in
 *  the icon's menu — no separate name label or sign-out link. */
export function AccountBar() {
  const { profile, isGuest, signOut } = useAuth();
  const navigate = useNavigate();
  const label = profile?.display_name ?? (isGuest ? "Guest" : "Rider");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--space-md)",
      }}
    >
      <Logo size={28} />

      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          aria-label={`Account: ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--color-divider)",
            background: profile?.avatar_url
              ? `center / cover no-repeat url(${profile.avatar_url})`
              : "var(--color-surface-3)",
            color: "var(--color-text-primary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!profile?.avatar_url && <Icon name="user" size={22} />}
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + var(--space-xs))",
              zIndex: 60,
              minWidth: 180,
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-divider)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              padding: "var(--space-xs)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                padding: "var(--space-xs) var(--space-sm)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-body-size)",
                  fontWeight: "var(--weight-medium)" as unknown as number,
                  color: "var(--color-text-primary)",
                }}
              >
                {label}
              </span>
              {isGuest && (
                <span
                  style={{
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
            </div>
            <div style={{ height: 1, background: "var(--color-divider)", margin: "var(--space-2xs) 0" }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/profile");
              }}
              style={menuItemStyle}
            >
              Profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              style={menuItemStyle}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
