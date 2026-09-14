import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Logo } from "./ui/Logo";
import { Icon } from "./ui/Icon";
import { useVoiceListening } from "../lib/voiceActivity";

/** Top app bar: the RideInSync logo on the left, and a single account icon on
 *  the right. The icon's menu shows the rider's identity, a "Profile" item
 *  (moved here from the tab bar — an identity destination, not primary nav),
 *  and sign-out last. */
export function AccountBar() {
  const { profile, isGuest, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const label = profile?.display_name ?? (isGuest ? "Guest" : "Rider");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // App-wide: voice commands run globally (not just on the Ride screen), so
  // "is it actually listening right now" needs to be visible from anywhere.
  const voiceListening = useVoiceListening();

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

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
        {voiceListening && (
          <span
            role="status"
            aria-label="Voice commands listening"
            title="Voice commands listening"
            className="mic-listening"
            style={{
              width: 28,
              height: 28,
              flex: "none",
              borderRadius: "var(--radius-full)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-surface-3)",
              color: "var(--color-accent)",
            }}
          >
            <Icon name="signal" size={16} />
          </span>
        )}
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

            <div
              aria-hidden
              style={{
                height: 1,
                margin: "var(--space-xs) 0",
                background: "var(--color-divider)",
              }}
            />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/profile");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                width: "100%",
                minHeight: 44,
                padding: "var(--space-xs) var(--space-sm)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--color-text-primary)",
                fontSize: "var(--text-body-size)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <Icon name="user" size={18} />
              Profile
            </button>

            <div
              aria-hidden
              style={{
                height: 1,
                margin: "var(--space-xs) 0",
                background: "var(--color-divider)",
              }}
            />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // Sign out, then land back on "/". AppLayout's own guard would
                // also bounce protected routes there, but an explicit redirect
                // covers the public paths (e.g. /ride/create) where it
                // otherwise leaves the signed-out visitor in place. Join
                // deep-links are the exception: AppLayout swaps those to the
                // SignInSheet so the rider can log straight back into the join.
                void (async () => {
                  await signOut();
                  if (!/^\/join\//.test(pathname) && !/^\/groups\/join\//.test(pathname)) {
                    navigate("/", { replace: true });
                  }
                })();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                width: "100%",
                minHeight: 44,
                padding: "var(--space-xs) var(--space-sm)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--color-text-primary)",
                fontSize: "var(--text-body-size)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <Icon name="log-out" size={18} />
              Sign out
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
