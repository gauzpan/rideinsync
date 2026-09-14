import { useState, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Carousel } from "../components/ui/Carousel";
import { Mark } from "../components/ui/Logo";
import { useAuth } from "../hooks/useAuth";
import { ROLE_COLOR, ROLE_LABEL } from "../lib/roles";
import { formatScheduleDateTime, getMyRides, type MyRideSummary } from "../services/onboardingService";

const STATUS_LABEL: Record<MyRideSummary["status"], string> = {
  draft: "Not started",
  active: "In progress",
  ended: "Ended",
  cancelled: "Cancelled",
};

/** Where tapping a ride card should go: the leader of a still-draft ride
 *  lands back on the invite screen (they're likely still gathering riders);
 *  the leader of an active/ended ride goes to the lead view; everyone else
 *  goes to plain ride detail. */
function rideDestination(ride: MyRideSummary): string {
  const isLeader = ride.role === "leader";
  if (isLeader && ride.status === "draft") return `/ride/${ride.rideId}/invite`;
  if (isLeader) return `/ride/${ride.rideId}/lead`;
  return `/ride/${ride.rideId}`;
}

function YourRides() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [rides, setRides] = useState<MyRideSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyRides(user.id)
      .then((r) => !cancelled && setRides(r))
      .catch(() => !cancelled && setError("Couldn't load your rides right now."));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!isAuthenticated || !user) return null;

  const loading = rides === null && !error;
  if (loading) {
    return (
      <section style={{ marginTop: "var(--space-2xl)" }}>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>Loading your rides…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ marginTop: "var(--space-2xl)" }}>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-label)" }}>{error}</p>
      </section>
    );
  }

  if (!rides || rides.length === 0) {
    return (
      <section style={{ marginTop: "var(--space-2xl)" }}>
        <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          No rides yet — create one, or join with a code.
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: "var(--space-2xl)" }}>
      <p
        style={{
          fontSize: "var(--text-label)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--space-md)",
        }}
      >
        Your rides
      </p>
      {rides.map((ride) => (
        <Card
          key={ride.rideId}
          padding="var(--space-md)"
          onClick={() => navigate(rideDestination(ride))}
          style={{ cursor: "pointer", marginBottom: "var(--space-sm)", minHeight: 56 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: "var(--weight-semibold)" as unknown as number }}>{ride.name}</span>
            <span
              style={{
                color: ROLE_COLOR[ride.role],
                fontSize: "var(--text-label)",
                fontWeight: "var(--weight-semibold)" as unknown as number,
              }}
            >
              {ROLE_LABEL[ride.role]}
            </span>
          </div>
          <p style={{ margin: "var(--space-2xs) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-body-size)" }}>
            {ride.startLabel ?? "—"} → {ride.destinationLabel ?? "—"}
          </p>
          {ride.scheduledStart && (
            <p style={{ margin: "var(--space-2xs) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-caption)" }}>
              Departs {formatScheduleDateTime(ride.scheduledStart)}
            </p>
          )}
          <p style={{ margin: "var(--space-2xs) 0 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)" }}>
            {STATUS_LABEL[ride.status]} · {ride.memberCount} {ride.memberCount === 1 ? "person" : "people"}
          </p>
        </Card>
      ))}
    </section>
  );
}

type Value = { icon: ReactNode; title: string; body: string };

// Thin, rounded, monochrome glyphs (Lucide-style per design/ — placeholders).
const stroke = {
  fill: "none",
  stroke: "var(--color-accent)",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const values: Value[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" width={26} height={26} {...stroke}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.2" />
        <path d="M3.5 19c.6-3 3-4.5 5.5-4.5S14 16 14.6 19M15 15c2 .1 3.7 1.3 4.3 3.4" />
      </svg>
    ),
    title: "Ride together, stay together",
    body: "See every rider's live position and status on one map, so you adjust your pace without panicking or calling anyone.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width={26} height={26} {...stroke}>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M12 8v4M12 15h.01" />
      </svg>
    ),
    title: "One tap for help",
    body: "SOS alerts your group, your leader, and your emergency contact at once — with your location and medical info.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width={26} height={26} {...stroke}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
      </svg>
    ),
    title: "Eyes on the road",
    body: "Voice-first signals for stops, hazards, and route changes. Minimal touch, minimal distraction while you ride.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width={26} height={26} {...stroke}>
        <circle cx="6" cy="18" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <path d="M8 18h6a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h4" />
      </svg>
    ),
    title: "One shared route",
    body: "Route, stops, and points of interest synced to every rider's phone, and updated live when the leader changes the plan.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" width={26} height={26} {...stroke}>
        <path d="M6 21V4M6 4c2-1.5 4 1.5 6 0s4-1.5 6 0v8c-2 1.5-4-1.5-6 0s-4 1.5-6 0" />
      </svg>
    ),
    title: "No one left behind",
    body: "Last-known location and a sweep view catch anyone who falls behind or splits off at a junction.",
  },
];

export function LandingPage() {
  const { signInWithGoogle, signInAsGuest, signInDev } = useAuth();
  const [pending, setPending] = useState<"google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;

  async function handleGoogle() {
    setError(null);
    setPending("google");
    try {
      await signInWithGoogle(); // redirects away for the OAuth round-trip
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Couldn't start Google sign-in.");
    }
  }

  async function handleGuest() {
    setError(null);
    setPending("guest");
    try {
      await signInAsGuest(); // AppLayout redirects "/" → "/menu" once signed in
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in as guest.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      {/* Hero */}
      <section style={{ position: "relative", paddingTop: "var(--space-2xl)" }}>
        {/* Ambient brand glow */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -40,
            right: -80,
            width: 320,
            height: 320,
            borderRadius: "var(--radius-full)",
            background:
              "radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Mark size={64} />
          <h1
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            RideInSync
          </h1>
          {/* Signature mixed-weight tagline */}
          <p
            style={{
              fontSize: "var(--text-h2)",
              lineHeight: "var(--lh-h2)",
              color: "var(--color-text-secondary)",
              marginTop: "var(--space-sm)",
              maxWidth: 420,
            }}
          >
            Ride as a group, not a scatter.{" "}
            <strong style={{ color: "var(--color-text-primary)", fontWeight: "var(--weight-semibold)" }}>
              Everyone tracked
            </strong>
            , every route shared, and{" "}
            <strong style={{ color: "var(--color-text-primary)", fontWeight: "var(--weight-semibold)" }}>
              help one tap away
            </strong>
            .
          </p>
        </div>
      </section>

      {/* Value carousel */}
      <section style={{ marginTop: "var(--space-2xl)" }}>
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-text-secondary)",
            textTransform: "none",
            margin: "0 0 var(--space-md)",
          }}
        >
          Why RideInSync
        </p>
        <Carousel aria-label="What RideInSync gives you">
          {values.map((v) => (
            <div key={v.title} style={{ padding: "0 2px" }}>
              <Card padding="var(--space-lg)" style={{ minHeight: 220 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-surface-3)",
                    boxShadow: "var(--glow-accent)",
                  }}
                >
                  {v.icon}
                </div>
                <h2
                  style={{
                    fontSize: "var(--text-h2)",
                    lineHeight: "var(--lh-h2)",
                    fontWeight: "var(--weight-semibold)",
                    margin: "var(--space-md) 0 var(--space-xs)",
                  }}
                >
                  {v.title}
                </h2>
                <p
                  style={{
                    fontSize: "var(--text-body-size)",
                    lineHeight: "var(--lh-body)",
                    color: "var(--color-text-secondary)",
                    margin: 0,
                  }}
                >
                  {v.body}
                </p>
              </Card>
            </div>
          ))}
        </Carousel>
      </section>

      {/* Login */}
      <section
        aria-label="Sign in"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
          marginTop: "var(--space-2xl)",
        }}
      >
        {error && (
          <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-label)", margin: 0 }}>
            {error}
          </p>
        )}
        <Button onClick={handleGoogle} disabled={pending !== null} loading={pending === "google"}>
          Continue with Google
        </Button>
        <Button
          variant="secondary"
          onClick={handleGuest}
          disabled={pending !== null}
          loading={pending === "guest"}
        >
          Continue as guest
        </Button>
        {isDev && (
          <Button variant="ghost" onClick={signInDev} disabled={pending !== null}>
            Continue as developer (dev)
          </Button>
        )}
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            margin: "var(--space-xs) 0 0",
          }}
        >
          By continuing you agree to share ride and safety details with your group.
        </p>
      </section>
    </div>
  );
}
