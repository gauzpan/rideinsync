import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

// FLAGGED ADDITION: the design system ships no tab primitive, so this is a new
// navigation component (see CODING_GUIDELINES §8 — a real gap, not a one-off
// widget). Fixed bottom bar, tokens only. "Create" deliberately stays a button
// on Home rather than a tab, keeping one accent per screen (§0.5) — Profile is
// a plain destination (no accent action of its own), so it's a tab instead.
//
// Active state uses the mandated inverse treatment (§1: selected MUST invert —
// --color-inverse-surface fill + --color-text-on-inverse — never a lime fill),
// which also leaves the single screen accent free for each screen's primary
// action. Inactive tabs sit at --color-text-tertiary.
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
// Derived from currentColor, it adapts to both tab states — the inverted active
// pill's on-inverse colour (§1) and the tertiary inactive colour — and to
// light/dark, keeping upstream's inverse active treatment (never a lime fill).
export const TAB_ICON_FILL = "color-mix(in srgb, currentColor 16%, transparent)";

const TABS: Tab[] = [
  { label: "Home", icon: "home", to: "/home", match: (p) => p === "/home" || p === "/menu" },
  { label: "Ride", icon: "map", to: "/ride/demo", match: (p) => p.startsWith("/ride") },
  { label: "Discover", icon: "compass", to: "/discover", match: (p) => p.startsWith("/discover") },
  { label: "Profile", icon: "user", to: "/profile", match: (p) => p.startsWith("/profile") },
];

// The Ride tab opens the rider's current active ride when there is one;
// otherwise it falls back to Home (the ride list), rather than a dead route.
// `activeRideId` is threaded down from AppLayout's `useActiveRide`.
function buildTabs(activeRideId: string | null): Tab[] {
  return [
    { label: "Home", icon: "home", to: "/home", match: (p) => p === "/home" || p === "/menu" },
    {
      label: "Ride",
      icon: "map",
      to: activeRideId ? `/ride/${activeRideId}` : "/home",
      match: (p) => p.startsWith("/ride"),
    },
    { label: "Discover", icon: "compass", to: "/discover", match: (p) => p.startsWith("/discover") },
    { label: "Profile", icon: "user", to: "/profile", match: (p) => p.startsWith("/profile") },
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
    bottom: 0,
    zIndex: 50,
    display: "flex",
    justifyContent: "center",
    borderTop: "1px solid var(--color-divider)",
    background: "var(--color-surface-1)",
    paddingBottom: "env(safe-area-inset-bottom)",
  };
  const inner: CSSProperties = {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    gap: "var(--space-2xs)",
    padding: "var(--space-xs) var(--space-xs)",
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
            background: active ? "var(--color-inverse-surface)" : "transparent",
            color: active ? "var(--color-text-on-inverse)" : "var(--color-text-tertiary)",
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
            fontFamily: "var(--font-ui)",
            fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
            transition: "background .15s ease, color .15s ease",
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
              <Icon name={tab.icon} size={24} fill={TAB_ICON_FILL} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
