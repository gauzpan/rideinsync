import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./ui/Icon";
import "./BottomNav.css";

type Tab = {
  label: string;
  icon: IconName;
  path?: string;
  /** Whether the current path belongs to this tab (defaults to exact match). */
  match?: (pathname: string) => boolean;
  onSelect?: () => void;
};

type Props = {
  onOpenMore: () => void;
  moreOpen: boolean;
};

/** Persistent post-login shell nav — Home / Ride / Discover / More. Fixed to
 *  the bottom, capped at the same 600px column as the rest of the app. Profile
 *  and account live in the More sheet. */
export function BottomNav({ onOpenMore, moreOpen }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs: Tab[] = [
    { label: "Home", icon: "home", path: "/", match: (p) => p === "/" },
    { label: "Ride", icon: "map", path: "/ride/demo", match: (p) => p.startsWith("/ride") },
    { label: "Discover", icon: "compass", path: "/discover", match: (p) => p.startsWith("/discover") },
    { label: "More", icon: "more-horizontal", onSelect: onOpenMore },
  ];

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary"
      style={{ boxShadow: "var(--shadow-nav, 0 -6px 18px rgba(0,0,0,.45))" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.path
          ? (tab.match ? tab.match(location.pathname) : location.pathname === tab.path)
          : moreOpen;
        return (
          <button
            key={tab.label}
            type="button"
            className={`bottom-nav__tab${isActive ? " bottom-nav__tab--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => (tab.path ? navigate(tab.path) : tab.onSelect?.())}
          >
            {isActive && <span className="bottom-nav__indicator" aria-hidden />}
            <Icon
              name={tab.icon}
              size={22}
              strokeWidth={2}
              fill={isActive ? "rgba(201,255,61,.18)" : "rgba(255,255,255,.08)"}
              style={isActive ? { filter: "drop-shadow(0 0 8px rgba(201,255,61,.55))" } : undefined}
            />
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
