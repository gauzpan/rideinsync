import type { CSSProperties, ReactNode } from "react";

// RideBadge — an achievement badge chip (Flow 6 ride awards).
// Built to the RideInSync design system (tokens + RoleBadge pill idiom +
// thin-stroke Lucide-style icons). NOTE: matched to the design system, not the
// exact "RideBadge" from the Claude Design project (that link is auth-gated) —
// swap the markup here when the real source is available.

type IconProps = { size?: number };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FlagIcon = ({ size = 15 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
    <path d="M5 21V4M5 4c2-1.2 4 1.2 6 0s4-1.2 6 0v8c-2 1.2-4-1.2-6 0s-4 1.2-6 0" />
  </svg>
);
const RouteIcon = ({ size = 15 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8 18h6a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h4" />
  </svg>
);
const ShieldIcon = ({ size = 15 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const ChevronsIcon = ({ size = 15 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
    <path d="M7 7l5 5-5 5M13 7l5 5-5 5" />
  </svg>
);
const StarIcon = ({ size = 15 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" />
  </svg>
);

// Known badge keys → label + icon. Unknown keys humanize the key + star.
const CATALOG: Record<string, { label: string; icon: (p: IconProps) => ReactNode }> = {
  first_ride: { label: "First ride", icon: FlagIcon },
  century: { label: "Century", icon: RouteIcon },
  safe_sweep: { label: "Safe sweep", icon: ShieldIcon },
  trailblazer: { label: "Trailblazer", icon: ChevronsIcon },
};

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Props = {
  badgeKey: string;
  /** Chip height in px (medal + label scale with it). */
  size?: number;
  style?: CSSProperties;
};

export function RideBadge({ badgeKey, size = 32, style }: Props) {
  const entry = CATALOG[badgeKey];
  const label = entry?.label ?? humanize(badgeKey);
  const Icon = entry?.icon ?? StarIcon;
  const medal = size - 8;

  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.28,
        height: size,
        paddingRight: size * 0.44,
        paddingLeft: 4,
        borderRadius: "var(--radius-full)",
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-divider)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-ui)",
        fontSize: size * 0.42,
        fontWeight: "var(--weight-semibold)",
        lineHeight: 1,
        ...style,
      }}
    >
      {/* lime medal with a near-black glyph — the one accent per chip */}
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: medal,
          height: medal,
          borderRadius: "var(--radius-full)",
          background: "var(--color-accent)",
          color: "var(--color-text-on-accent)",
        }}
      >
        <Icon size={medal * 0.56} />
      </span>
      {label}
    </span>
  );
}
