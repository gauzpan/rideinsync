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
    {
      label: "Ride",
      icon: "map",
      path: "/rides",
      match: (p) =>
        (p.startsWith("/rides") || p.startsWith("/ride/")) && !p.startsWith("/ride/demo"),
    },
    { label: "Discover", icon: "compass", path: "/discover", match: (p) => p.startsWith("/discover") },
    { label: "More", icon: "more-horizontal", onSelect: onOpenMore },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
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
            <Icon name={tab.icon} size={22} strokeWidth={1.75} />
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
