import type { CSSProperties } from "react";

// RideInSync brand lockup (chevron mark + wordmark) served from the public
// folder. `size` drives the rendered height; width follows the image aspect.
const LOGO_SRC = "/icons/rideinsync-logo.png";

export function Mark({ size = 40, title = "RideInSync" }: { size?: number; title?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt={title}
      height={size}
      style={{ height: size, width: "auto", display: "block" }}
    />
  );
}

type LogoProps = {
  /** Logo height in px; width follows the image aspect. */
  size?: number;
  /** Kept for API compatibility — the image already includes the wordmark. */
  wordmark?: boolean;
  style?: CSSProperties;
};

/** Horizontal lockup: brand image (mark + wordmark baked in). */
export function Logo({ size = 40, wordmark = true, style }: LogoProps) {
  void wordmark;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", ...style }}>
      <Mark size={size} />
    </span>
  );
}
