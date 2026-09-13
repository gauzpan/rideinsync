import type { CSSProperties } from "react";

// Night-bike wallpaper. Pure predicate so the routing rule is unit-tested
// without a DOM: the wallpaper shows on every screen EXCEPT the SOS screen
// ("/sos" and any "/sos/..." sub-route), which needs a plain surface.
export function shouldShowWallpaper(pathname: string): boolean {
  return pathname !== "/sos" && !pathname.startsWith("/sos/");
}

const BASE = import.meta.env.BASE_URL;

// Scrim tuned by eye over the founder-approved art: darkest at the very top
// (header text needs the most contrast), lifting through a mid-band so the
// bike reads as an atmospheric layer rather than fighting the UI, then
// deepening again so the card/button band and the nav clearance sit on almost
// -black. rgba base (11,11,12) ~= --color-bg-base #0A0A0B.
const SCRIM =
  "linear-gradient(180deg, rgba(11,11,12,.88) 0%, rgba(11,11,12,.55) 35%, rgba(11,11,12,.4) 55%, rgba(11,11,12,.75) 75%, rgba(11,11,12,.94) 100%)";

const fill: CSSProperties = { position: "absolute", inset: 0 };

export function HomeWallpaper() {
  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    >
      {/* Image layer. Uses className `home-wallpaper__img` (global.css) for the
          image-set() so the -webkit- prefix (iOS-PWA Safari) can sit beside the
          unprefixed form — inline styles cannot carry both. */}
      <div className="home-wallpaper__img" style={fill} />
      {/* Scrim on top of the image. */}
      <div style={{ ...fill, backgroundImage: SCRIM }} />
    </div>
  );
}

export { BASE as HOME_WALLPAPER_BASE };
