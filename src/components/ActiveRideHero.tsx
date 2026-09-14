import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { RoleBadge, toBadgeRole } from "./ui/RoleBadge";
import type { ActiveRide } from "../hooks/useHomeData";

/** Shared "you're in a ride right now" hero — shown on Home (top of the
 *  landing) and on the Ride tab (RidesPage), so the resume/open affordance
 *  looks and behaves identically in both places. */
export function ActiveRideHero({ ride, onResume }: { ride: ActiveRide; onResume: () => void }) {
  const isDraft = ride.status === "draft";
  return (
    <Card glow padding="var(--space-lg)">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-sm)" }}>
        <div>
          <Eyebrow>{isDraft ? "Not started yet" : "Active ride"}</Eyebrow>
          <h2 style={{ margin: "var(--space-2xs) 0 0", fontFamily: "var(--font-brand)", fontSize: "calc(var(--text-h2) + 2px)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {ride.name}
          </h2>
        </div>
        {!isDraft && <LivePill />}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
        <RoleBadge role={toBadgeRole(ride.role)} />
        <Meta>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{ride.riderCount}</span>{" "}
          {ride.riderCount === 1 ? "rider" : "riders"}
        </Meta>
        <Meta>
          Code <span style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>{ride.code}</span>
        </Meta>
      </div>

      <div style={{ marginTop: "var(--space-lg)" }}>
        <Button
          variant={isDraft ? "secondary" : "primary"}
          onClick={onResume}
          style={isDraft ? { gap: "var(--space-xs)" } : undefined}
        >
          {isDraft && <Icon name="chevron-right" size={18} />}
          {isDraft ? "Open ride" : "Resume ride"}
        </Button>
      </div>
    </Card>
  );
}

export function resumePath(ride: ActiveRide): string {
  const isOps = ride.role === "leader" || ride.role === "co_leader" || ride.role === "sweep";
  return isOps ? `/ride/${ride.id}/lead` : `/ride/${ride.id}`;
}

function LivePill() {
  return (
    <span
      style={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2xs)",
        height: 26,
        padding: "0 var(--space-sm)",
        borderRadius: "var(--radius-full)",
        background: "var(--color-surface-3)",
        color: "var(--color-text-secondary)",
        fontSize: "var(--text-label)",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: "var(--color-role-member)" }} />
      Live
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-caption)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
      {children}
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>{children}</span>;
}
