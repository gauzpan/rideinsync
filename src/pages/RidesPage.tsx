import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useHomeData, type PastRide } from "../hooks/useHomeData";
import { ActiveRideHero, resumePath } from "../components/ActiveRideHero";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { LoadingState } from "../components/ui/Loader";

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

      {loading && <LoadingState label="Loading…" />}

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

      {/* Demo strip — a low-key way to relaunch the simulated group ride on the
          live map. The demo is never a persisted active ride, so it belongs
          here as an on-demand trigger rather than as a ride card above. */}
      <button
        type="button"
        onClick={() => navigate("/ride/demo")}
        style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
      >
        <Card padding="var(--space-md)">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <div
              style={{
                flex: "none",
                width: 40,
                height: 40,
                borderRadius: "var(--radius-full)",
                background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-accent)",
              }}
            >
              <Icon name="play" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-body-size)", lineHeight: "22px", fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--color-text-primary)" }}>
                See a demo ride
              </div>
              <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>
                Watch a simulated group move on the live map.
              </div>
            </div>
            <span style={{ flex: "none", color: "var(--color-text-tertiary)" }}>
              <Icon name="chevron-right" size={18} />
            </span>
          </div>
        </Card>
      </button>

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
