import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { ROLE_COLOR, ROLE_LABEL } from "../lib/roles";
import { getRideDetail, type RideDetail } from "../services/onboardingService";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--text-h2)",
        lineHeight: "var(--lh-h2)",
        fontWeight: "var(--weight-semibold)",
        margin: "var(--space-xl) 0 var(--space-md)",
      }}
    >
      {children}
    </h2>
  );
}

export function RiderViewPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    setLoading(true);
    getRideDetail(rideId)
      .then((d) => {
        if (cancelled) return;
        if (!d) setError("Ride not found.");
        setDetail(d);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the ride."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (loading) {
    return <p style={{ color: "var(--color-text-secondary)" }}>Loading ride…</p>;
  }

  if (error || !detail) {
    return (
      <div>
        <Link to="/" style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
          ‹ Home
        </Link>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{error ?? "Ride not found."}</p>
        </Card>
      </div>
    );
  }

  const { ride, stops, roster } = detail;
  const startLabel = (ride.start_point as { label?: string } | null)?.label ?? "—";
  const destinationLabel = (ride.destination as { label?: string } | null)?.label ?? "—";
  const self = roster.find((r) => r.member.user_id === user?.id);

  return (
    <div>
      <Link to="/" style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
        ‹ Home
      </Link>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-2xs)",
        }}
      >
        {ride.name}
      </h1>
      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-lg)" }}>
        {ride.status === "draft"
          ? "Waiting for the lead to start the ride."
          : ride.status === "active"
            ? "Ride is underway."
            : "This ride has ended."}
        {self && (
          <>
            {" "}
            You're in as{" "}
            <strong style={{ color: ROLE_COLOR[self.member.role] }}>{ROLE_LABEL[self.member.role]}</strong>.
          </>
        )}
      </p>

      <Card padding="var(--space-lg)">
        <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-xs)" }}>
          Route
        </p>
        <p style={{ margin: "0 0 var(--space-md)", fontSize: "var(--text-body-size)" }}>
          {startLabel} → {destinationLabel}
        </p>

        {stops.length > 0 && (
          <>
            <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-xs)" }}>
              Stops
            </p>
            <ol style={{ margin: "0 0 var(--space-md)", paddingLeft: "1.25em" }}>
              {stops.map((stop) => (
                <li key={stop.id} style={{ marginBottom: "var(--space-2xs)" }}>
                  {stop.name}
                  {stop.kind && (
                    <span style={{ color: "var(--color-text-tertiary)" }}> · {stop.kind}</span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {ride.guidelines && (
          <>
            <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-xs)" }}>
              Guidelines
            </p>
            <p style={{ margin: "0 0 var(--space-md)" }}>{ride.guidelines}</p>
          </>
        )}

        <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-xs)" }}>
          Timings
        </p>
        <p style={{ margin: 0 }}>
          Created {new Date(ride.created_at).toLocaleString()}
          {ride.member_capacity ? ` · Capacity ${roster.length} / ${ride.member_capacity}` : ` · ${roster.length} riders`}
        </p>
      </Card>

      {(self?.member.role === "leader" || self?.member.role === "co_leader") && (
        <Button
          variant="secondary"
          style={{ marginTop: "var(--space-md)" }}
          onClick={() => navigate(`/ride/${ride.id}/lead`)}
        >
          Manage roster & requests
        </Button>
      )}

      <SectionTitle>Roster</SectionTitle>
      {roster.map(({ member, profile }) => (
        <Card
          key={member.id}
          padding="var(--space-md)"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-sm)",
          }}
        >
          <span>
            {profile?.display_name ?? "Rider"}
            {member.user_id === user?.id && (
              <span style={{ color: "var(--color-text-tertiary)" }}> (you)</span>
            )}
          </span>
          <span style={{ color: ROLE_COLOR[member.role], fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {ROLE_LABEL[member.role]}
          </span>
        </Card>
      ))}
    </div>
  );
}
