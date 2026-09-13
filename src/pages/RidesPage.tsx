import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useHomeData, type ActiveRide, type PastRide } from "../hooks/useHomeData";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { RoleBadge, toBadgeRole } from "../components/ui/RoleBadge";

/** Base page for the Ride tab: the active ride (if any), past rides, and the
 *  entry points into the create/join flows — Home stays a separate landing
 *  (greeting, stats, quick actions) and just links here instead of duplicating
 *  this content. */
export function RidesPage() {
  const navigate = useNavigate();
  const { loading, activeRide, pastRides } = useHomeData();

  const col: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-lg)",
  };

  return (
    <div style={col}>
      <h1
        style={{
          margin: 0,
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
        }}
      >
        Rides
      </h1>

      {loading && (
        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>Loading…</p>
      )}

      {!loading && activeRide && (
        <ActiveRideHero ride={activeRide} onResume={() => navigate(resumePath(activeRide))} />
      )}

      {!loading && !activeRide && (
        <Card padding="var(--space-lg)">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "var(--space-md)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-full)",
                background: "var(--color-surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-tertiary)",
              }}
            >
              <Icon name="map" size={26} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "var(--text-h2)",
                  lineHeight: "var(--lh-h2)",
                  fontWeight: "var(--weight-semibold)" as unknown as number,
                }}
              >
                No active ride
              </div>
              <p
                style={{
                  margin: "var(--space-2xs) 0 0",
                  fontSize: "var(--text-label)",
                  lineHeight: "var(--lh-label)",
                  color: "var(--color-text-secondary)",
                }}
              >
                You're not part of a ride right now.
                <br />
                Create one to lead a group, or join with a code.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Create/join stays reachable from here regardless of ride state — this
          is one of the only two entry points into the create form (the other
          is Home's quick-actions button). */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <Button variant={activeRide ? "secondary" : "primary"} onClick={() => navigate("/ride/create")}>
          {activeRide ? "Create another ride" : "Create a ride"}
        </Button>
        <Button variant="secondary" onClick={() => navigate("/join")}>
          Join a ride
        </Button>
      </div>

      {pastRides.length > 0 && (
        <section>
          <Eyebrow>Past rides</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", marginTop: "var(--space-sm)" }}>
            {pastRides.map((r) => (
              <PastRideRow key={r.rideId} ride={r} onClick={() => navigate(`/ride/${r.rideId}/summary`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function resumePath(ride: ActiveRide): string {
  const isOps = ride.role === "leader" || ride.role === "co_leader" || ride.role === "sweep";
  return isOps ? `/ride/${ride.id}/lead` : `/ride/${ride.id}`;
}

function ActiveRideHero({ ride, onResume }: { ride: ActiveRide; onResume: () => void }) {
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
        <Button variant="primary" onClick={onResume}>
          {isDraft ? "Open ride" : "Resume ride"}
        </Button>
      </div>
    </Card>
  );
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

function PastRideRow({ ride, onClick }: { ride: PastRide; onClick: () => void }) {
  const date = new Date(ride.endedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: "none", background: "transparent", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
    >
      <Card padding="var(--space-sm) var(--space-md)">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-medium)" as unknown as number, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ride.name}
            </div>
            <div style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>{date}</div>
          </div>
          <div style={{ flex: "none", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {ride.distanceKm} km
          </div>
        </div>
      </Card>
    </button>
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
