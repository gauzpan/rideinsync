import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

// FLAGGED ADDITION: the design system ships no tab primitive, so this is a new
// navigation component (see CODING_GUIDELINES §8 — a real gap, not a one-off
// widget). Floating rounded bar, tokens only. "Create" deliberately stays a
// button on Home rather than a tab — Profile is a plain destination (no
// accent action of its own), so it's a tab instead.
//
// Active state: icon + label switch to --color-accent with a soft glow
// (matches the reference nav design supplied for this bar) — this is a
// deliberate departure from the "one accent action per screen" rule (CLAUDE.md
// §3) for this one component; the previous inverse-surface-pill treatment is
// still available via TAB_ICON_FILL below if that's ever reverted.
type Tab = {
  label: string;
  icon: IconName;
  /** route this tab navigates to */
  to: string;
  /** true when the current path belongs to this tab */
  match: (pathname: string) => boolean;
};

// Duotone footer glyphs: a translucent fill of the icon's own colour behind the
// stroke, so each tab icon reads as two-tone without introducing a new accent.
// Derived from currentColor, it adapts to both tab states and to light/dark.
export const TAB_ICON_FILL = "color-mix(in srgb, currentColor 16%, transparent)";

// The Ride tab opens the rider's current active ride when there is one;
// otherwise it falls back to the Ride tab's own base page (RidesPage — active
// + past rides, empty state when there's none), rather than a dead route.
// `activeRideId` is threaded down from AppLayout's `useActiveRide`.
// Profile moved to the AccountBar (top bar) menu — it's an identity
// destination, not a primary nav tab, so this bar is now Home / Ride /
// Groups / Discover, with Groups next to Discover.
function buildTabs(activeRideId: string | null): Tab[] {
  return [
    { label: "Home", icon: "home", to: "/home", match: (p) => p === "/home" || p === "/menu" },
    {
      label: "Ride",
      icon: "map",
      to: activeRideId ? `/ride/${activeRideId}` : "/ride",
      match: (p) => p.startsWith("/ride"),
    },
    { label: "Groups", icon: "users", to: "/groups", match: (p) => p.startsWith("/groups") },
    { label: "Discover", icon: "compass", to: "/discover", match: (p) => p.startsWith("/discover") },
  ];
}

export function TabBar({ activeRideId = null }: { activeRideId?: string | null }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const TABS = buildTabs(activeRideId);

  const bar: CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    // Floats clear of the safe area rather than sitting flush against the
    // screen edge — reads as a card, not a docked toolbar.
    bottom: "calc(env(safe-area-inset-bottom) + var(--space-sm))",
    zIndex: 50,
    display: "flex",
    justifyContent: "center",
    padding: "0 var(--gutter)",
  };
  const inner: CSSProperties = {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    gap: "var(--space-2xs)",
    padding: "var(--space-xs) var(--space-2xs)",
    borderRadius: "var(--radius-lg)",
    background: "var(--color-surface-1)",
    border: "1px solid var(--color-divider)",
    boxShadow: "var(--shadow-card)",
  };

  return (
    <nav style={bar} aria-label="Primary">
      <div style={inner}>
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const tabStyle: CSSProperties = {
            flex: 1,
            minHeight: "var(--control-height)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2xs)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            background: "transparent",
            // Label goes white when active (icon stays lime, set explicitly
            // below) — docs/plan-update-visual.md §12: icon carries the
            // accent, the label reads as "selected", not another accent use.
            color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
            fontFamily: "var(--font-ui)",
            fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
            transition: "color .15s ease",
          };
          return (
            <button
              key={tab.to}
              type="button"
              style={tabStyle}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(tab.to)}
            >
              <Icon
                name={tab.icon}
                size={24}
                color={active ? "var(--color-accent)" : "currentColor"}
                fill={TAB_ICON_FILL}
                style={
                  active
                    ? { color: "var(--color-accent)", filter: "drop-shadow(0 0 6px var(--color-accent-glow))" }
                    : undefined
                }
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
