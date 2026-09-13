import { useId } from "react";
import "./Loader.css";

// App-wide animation loader: neon orbit ring + chevrons on a dark plate,
// extracted from the supplied loader artwork. Colors are the artwork's own
// neon lime values (they mirror the --color-accent family); the static track
// and plate stay near-black so the loader reads on the dark-first theme.
// The glow filter id is unique per instance so multiple loaders can mount
// on one screen without SVG id collisions.
type Props = {
  /** Rendered px size (square). Default 96. */
  size?: number;
  /** Accessible label for the status region. Default "Loading". */
  label?: string;
};

/** Loader + visible caption, centered — the standard shape for a page/section
 *  that's replacing its content with a loading state (as opposed to `Loader`
 *  alone, which is for inline use like a button's busy state). */
export function LoadingState({ label = "Loading", size = 48 }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-xs)",
        padding: "var(--space-lg) 0",
      }}
    >
      <Loader size={size} label={label} />
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>{label}</p>
    </div>
  );
}

export function Loader({ size = 96, label = "Loading" }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glowId = `loader-glow-${uid}`;

  return (
    <span role="status" aria-label={label} style={{ display: "inline-block", width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Static base: outer track ring + inner dark plate */}
        <circle cx="100" cy="100" r="70" stroke="#1f2220" strokeWidth="2.5" fill="none" />
        <circle cx="100" cy="100" r="48" stroke="#1c1f1c" strokeWidth="2" fill="#0d0e0d" />

        {/* Center chevrons */}
        <g
          stroke="#9cee00"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter={`url(#${glowId})`}
        >
          <path d="M 86 85 L 98 100 L 86 115" />
          <path d="M 104 85 L 116 100 L 104 115" />
        </g>

        {/* Rotating orbit: trail arcs + three dots */}
        <g className="loader__orbit">
          <circle
            cx="100"
            cy="100"
            r="70"
            stroke="#9cee00"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="49 87.6"
            strokeDashoffset="1"
            filter={`url(#${glowId})`}
          />
          <circle cx="100" cy="30" r="5.5" fill="#c4ff33" filter={`url(#${glowId})`} />
          <circle cx="160.62" cy="135" r="5.5" fill="#c4ff33" filter={`url(#${glowId})`} />
          <circle cx="39.38" cy="135" r="5.5" fill="#c4ff33" filter={`url(#${glowId})`} />
        </g>
      </svg>
    </span>
  );
}
