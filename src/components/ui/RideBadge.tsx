import { useState, type CSSProperties } from "react";

// ============================================================================
// RideBadge / BadgeGrid — collectible hex-medallion achievement system.
// 5 tiers (Rookie · Rider · Voyager · Pathfinder · Legend) per vehicle
// (car / bike / cycle / trek). Level drives ring luminance + glow; the top
// tier (Legend) fills the medallion with the accent. earned={false} shows a
// locked padlock. Stays within the lime accent scale — no new colors.
// ============================================================================

export type Vehicle = "car" | "bike" | "cycle" | "trek";
export type Level = 1 | 2 | 3 | 4 | 5;

export const TIERS: { level: Level; name: string }[] = [
  { level: 1, name: "Rookie" },
  { level: 2, name: "Rider" },
  { level: 3, name: "Voyager" },
  { level: 4, name: "Pathfinder" },
  { level: 5, name: "Legend" },
];

export const VEHICLES: { key: Vehicle; label: string }[] = [
  { key: "car", label: "Car" },
  { key: "bike", label: "Bike" },
  { key: "cycle", label: "Cycle" },
  { key: "trek", label: "Trek" },
];

// Lifetime distance (km) to unlock each tier, per vehicle. Tier 1 = first ride.
// Placeholder values — final thresholds are a product decision (per-mode).
export const THRESHOLDS: Record<Vehicle, [number, number, number, number, number]> = {
  car: [0, 500, 2000, 6000, 15000],
  bike: [0, 250, 1000, 3000, 8000],
  cycle: [0, 50, 200, 600, 1500],
  trek: [0, 25, 100, 300, 800],
};

/** Label for the threshold that unlocks `level` on `vehicle`. */
export function badgeThresholdLabel(vehicle: Vehicle, level: Level): string {
  if (level <= 1) return "First ride";
  return `${THRESHOLDS[vehicle][level - 1].toLocaleString()} km`;
}

/** Highest tier unlocked for a lifetime distance (km) on a vehicle. */
export function levelForDistance(vehicle: Vehicle, km: number): Level {
  let lvl: Level = 1;
  const t = THRESHOLDS[vehicle];
  for (let i = 1; i < 5; i++) if (km >= t[i]) lvl = (i + 1) as Level;
  return lvl;
}

// Ring luminance (stroke opacity) and glow (px) per tier.
const RING = [0.35, 0.5, 0.68, 0.85, 1] as const;
const GLOW = [0, 6, 12, 20, 30] as const;

// Pointy-top hexagon inscribed in a 100×100 box.
const HEX = "50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27";

const strokeIcon = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Vehicle glyphs (thin-stroke, 24-grid), plus a padlock for the locked state.
function VehicleGlyph({ vehicle }: { vehicle: Vehicle }) {
  switch (vehicle) {
    case "car":
      return (
        <g {...strokeIcon}>
          <path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4H3z" />
          <circle cx="7.5" cy="17" r="1.6" />
          <circle cx="16.5" cy="17" r="1.6" />
        </g>
      );
    case "bike":
      return (
        <g {...strokeIcon}>
          <circle cx="6" cy="16" r="3.5" />
          <circle cx="18" cy="16" r="3.5" />
          <path d="M6 16l4-6h5l2 6M10 10l-1-3h3" />
        </g>
      );
    case "cycle":
      return (
        <g {...strokeIcon}>
          <circle cx="6" cy="16" r="3.5" />
          <circle cx="18" cy="16" r="3.5" />
          <path d="M6 16l5-7 3 7M11 9h4l1 3M9 9h4" />
        </g>
      );
    case "trek":
      return (
        <g {...strokeIcon}>
          <path d="M3 19l6-11 4 6 2-3 6 8z" />
          <circle cx="9" cy="6" r="1.4" />
        </g>
      );
  }
}

type BadgeProps = {
  vehicle: Vehicle;
  level: Level;
  earned?: boolean;
  size?: number;
  showLabel?: boolean;
  style?: CSSProperties;
};

export function RideBadge({
  vehicle,
  level,
  earned = true,
  size = 76,
  showLabel = true,
  style,
}: BadgeProps) {
  const i = Math.min(Math.max(level, 1), 5) - 1;
  const isLegend = earned && level === 5;
  const tierName = TIERS[i].name;

  const hexFill = !earned
    ? "var(--color-surface-2)"
    : isLegend
      ? "var(--color-accent)"
      : "var(--color-surface-1)";
  const ringStroke = !earned
    ? "var(--color-divider)"
    : isLegend
      ? "var(--color-accent-bright)"
      : "var(--color-accent)";
  const glyphColor = !earned
    ? "var(--color-text-tertiary)"
    : isLegend
      ? "var(--color-text-on-accent)"
      : "var(--color-accent)";
  const glow = earned ? GLOW[i] : 0;

  return (
    <span
      title={`${VEHICLES.find((v) => v.key === vehicle)?.label} · ${tierName}`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6, ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ filter: glow ? `drop-shadow(0 0 ${glow}px var(--color-accent-glow))` : "none" }}
      >
        <polygon
          points={HEX}
          fill={hexFill}
          stroke={ringStroke}
          strokeOpacity={earned && !isLegend ? RING[i] : 1}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        {earned ? (
          <g transform="translate(26,26) scale(2)" stroke={glyphColor} strokeOpacity={isLegend ? 1 : RING[i]}>
            <VehicleGlyph vehicle={vehicle} />
          </g>
        ) : (
          // Padlock
          <g transform="translate(38,36) scale(1)" stroke={glyphColor} {...strokeIcon}>
            <rect x="0" y="8" width="24" height="16" rx="3" />
            <path d="M5 8V5a7 7 0 0 1 14 0v3" />
          </g>
        )}
      </svg>
      {showLabel && (
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: "var(--weight-semibold)",
            color: earned ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}
        >
          {tierName}
        </span>
      )}
    </span>
  );
}

type GridProps = {
  vehicle: Vehicle;
  unlockedLevel: number;
  onVehicleChange?: (v: Vehicle) => void;
};

/** The five-tier shelf for one vehicle: earned tiers lit, higher ones locked. */
export function BadgeGrid({ vehicle, unlockedLevel, onVehicleChange }: GridProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      {onVehicleChange && (
        <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
          {VEHICLES.map((v) => {
            const active = v.key === vehicle;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => onVehicleChange(v.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-full)",
                  cursor: "pointer",
                  border: "1px solid var(--color-divider)",
                  background: active ? "var(--color-accent)" : "var(--color-surface-3)",
                  color: active ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: "var(--weight-semibold)",
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap", justifyContent: "space-between" }}>
        {TIERS.map((t) => (
          <span key={t.level} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <RideBadge vehicle={vehicle} level={t.level} earned={t.level <= unlockedLevel} size={64} />
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-ui)" }}>
              {badgeThresholdLabel(vehicle, t.level)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small demo wrapper: a BadgeGrid with the vehicle filter wired to local state. */
export function BadgeCollection({ initial = "bike", unlockedLevel = 1 }: { initial?: Vehicle; unlockedLevel?: number }) {
  const [vehicle, setVehicle] = useState<Vehicle>(initial);
  return <BadgeGrid vehicle={vehicle} unlockedLevel={unlockedLevel} onVehicleChange={setVehicle} />;
}
