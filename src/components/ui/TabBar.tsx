import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

// FLAGGED ADDITION: the design system ships no tab primitive, so this is a new
// navigation component (see CODING_GUIDELINES §8 — a real gap, not a one-off
// widget). Fixed bottom bar, tokens only. "Create" deliberately stays a button
// on Home rather than a center tab, keeping one accent per screen (§0.5) and
// avoiding a 4th nav concept.
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

const TABS: Tab[] = [
  { label: "Home", icon: "home", to: "/home", match: (p) => p === "/home" || p === "/menu" },
  { label: "Ride", icon: "map", to: "/ride/demo", match: (p) => p.startsWith("/ride") },
  { label: "Discover", icon: "compass", to: "/discover", match: (p) => p.startsWith("/discover") },
];

export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
              <Icon name={tab.icon} size={24} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
