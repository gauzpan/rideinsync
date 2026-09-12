import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMyRides, getRideRoute, type MyRideItem } from "../hooks/useMyRides";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { RoleBadge, toBadgeRole } from "../components/ui/RoleBadge";
import { formatScheduleDateTime } from "../services/onboardingService";
import type { MemberRole } from "../lib/models";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--text-h2)",
        lineHeight: "var(--lh-h2)",
        fontWeight: "var(--weight-semibold)" as unknown as number,
        color: "var(--color-text-primary)",
        margin: "var(--space-lg) 0 var(--space-sm)",
      }}
    >
      {children}
    </h2>
  );
}

function RideCard({
  ride,
  section,
  onClick,
}: {
  ride: MyRideItem;
  section: "active" | "upcoming" | "past";
  onClick: () => void;
}) {
  const isCancelled = ride.status === "cancelled";

  return (
    <Card
      padding="var(--space-md)"
      onClick={isCancelled ? undefined : onClick}
      style={{
        cursor: isCancelled ? "default" : "pointer",
        minHeight: 56,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2xs)",
        marginBottom: "var(--space-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-body-size)",
            lineHeight: "var(--lh-body)",
            fontWeight: "var(--weight-semibold)" as unknown as number,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ride.name}
        </span>

        {isCancelled ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 var(--space-xs)",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-3)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-caption)",
              lineHeight: 1,
              fontWeight: "var(--weight-semibold)" as unknown as number,
              flexShrink: 0,
            }}
          >
            Cancelled
          </span>
        ) : ride.isPending ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 var(--space-xs)",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-3)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-caption)",
              lineHeight: 1,
              fontWeight: "var(--weight-semibold)" as unknown as number,
              flexShrink: 0,
            }}
          >
            Requested
          </span>
        ) : (
          <RoleBadge
            role={toBadgeRole(ride.role as MemberRole)}
            style={{ flexShrink: 0 }}
          />
        )}
      </div>

      {(ride.startLabel || ride.destinationLabel) && (
        <div
          style={{
            fontSize: "var(--text-label)",
            lineHeight: "var(--lh-label)",
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ride.startLabel ?? "Start"} → {ride.destinationLabel ?? "Destination"}
        </div>
      )}

      {section === "active" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-xs)",
            fontSize: "var(--text-caption)",
            lineHeight: "var(--lh-caption)",
            color: "var(--color-text-tertiary)",
          }}
        >
          <span
            style={{
              color: "var(--color-status-positive)",
              fontWeight: "var(--weight-medium)" as unknown as number,
            }}
          >
            Live now
          </span>
          {ride.memberCount > 0 && (
            <span>
              · {ride.memberCount} {ride.memberCount === 1 ? "rider" : "riders"}
            </span>
          )}
        </div>
      )}

      {section === "upcoming" && (
        <div
          style={{
            fontSize: "var(--text-caption)",
            lineHeight: "var(--lh-caption)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {ride.scheduledStart
            ? `Departs ${formatScheduleDateTime(ride.scheduledStart)}`
            : "Departure not scheduled"}
          {ride.memberCount > 0 &&
            ` · ${ride.memberCount} ${
              ride.memberCount === 1 ? "rider" : "riders"
            }`}
        </div>
      )}

      {section === "past" && (
        <div
          style={{
            fontSize: "var(--text-caption)",
            lineHeight: "var(--lh-caption)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {isCancelled
            ? "Cancelled"
            : ride.endedAt
            ? `Ended ${formatScheduleDateTime(ride.endedAt)}`
            : "Ended"}
          {!isCancelled && ride.distanceKm != null && ` · ${ride.distanceKm} km`}
          {ride.memberCount > 0 &&
            ` · ${ride.memberCount} ${
              ride.memberCount === 1 ? "rider" : "riders"
            }`}
        </div>
      )}
    </Card>
  );
}

export function MyRidesPage() {
  const navigate = useNavigate();
  const { loading, active, upcoming, past, isEmpty } = useMyRides();

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div style={containerStyle}>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
          color: "var(--color-text-primary)",
          margin: "0 0 var(--space-md)",
        }}
      >
        My rides
      </h1>

      {loading && (
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-label)",
            margin: "var(--space-md) 0",
          }}
        >
          Loading your rides...
        </p>
      )}

      {!loading && isEmpty && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-md)",
            marginTop: "var(--space-sm)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-size)",
              lineHeight: "var(--lh-body)",
              color: "var(--color-text-secondary)",
            }}
          >
            No rides yet. Create your first ride or join one with a code.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-sm)",
              marginTop: "var(--space-xs)",
            }}
          >
            <Button onClick={() => navigate("/create")}>Create ride</Button>
            <Button variant="secondary" onClick={() => navigate("/join")}>
              Join ride
            </Button>
          </div>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          {active.length > 0 && (
            <section>
              <SectionTitle>Active</SectionTitle>
              {active.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  section="active"
                  onClick={() => navigate(getRideRoute(ride))}
                />
              ))}
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <SectionTitle>Upcoming</SectionTitle>
              {upcoming.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  section="upcoming"
                  onClick={() => navigate(getRideRoute(ride))}
                />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section>
              <SectionTitle>Past</SectionTitle>
              {past.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  section="past"
                  onClick={() => navigate(getRideRoute(ride))}
                />
              ))}
            </section>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-sm)",
              marginTop: "var(--space-xl)",
            }}
          >
            <Button onClick={() => navigate("/create")}>Create ride</Button>
            <Button variant="secondary" onClick={() => navigate("/join")}>
              Join ride
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
