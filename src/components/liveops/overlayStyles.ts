import type { CSSProperties } from "react";

// Shared look for controls that float over the live map (demo + real ride).
// The map tiles are light, so a translucent-white surface (the default
// secondary Button) and near-white text/icons vanish against them — these
// controls need a dark translucent scrim so their white content stays legible.

/** Dark translucent pill used for text+icon buttons over the map (Details,
 *  Signal, and the active-ride equivalents). Pass as a Button `style` override. */
export const MAP_OVERLAY_BUTTON: CSSProperties = {
  background: "rgba(20, 20, 22, 0.85)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  color: "var(--color-text-primary)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
