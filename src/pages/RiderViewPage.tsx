import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { useAuth } from "../hooks/useAuth";
import { ROLE_COLOR, ROLE_LABEL } from "../lib/roles";
import {
  formatScheduleDateTime,
  getEligibleRidersForPillion,
  getRideDetail,
  leaveRide,
  linkPillionToRider,
  STOP_ICONS,
  STOP_LABELS,
  type PillionRiderOption,
  type RideDetail,
  type StopKind,
} from "../services/onboardingService";

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

  // Pillion "link my rider" fallback (ticket 06) — covers a pillion whose
  // join went through the non-demo pending-approval path, where the join
  // flow's own linking step can't run yet because they weren't a ride
  // member at the time. Self-service here works for any unlinked member.
  const [pillionPickerOpen, setPillionPickerOpen] = useState(false);
  const [eligibleRiders, setEligibleRiders] = useState<PillionRiderOption[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Leave-before-start (ticket 07): a rider can back out of a ride that
  // hasn't started yet. Mid-ride leaving is Flow 3/4 territory, out of scope.
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

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

  async function openPillionPicker() {
    if (!rideId || !user) return;
    setLinkError(null);
    setSelectedRiderId("");
    setPillionPickerOpen(true);
    setLinking(true);
    try {
      const riders = await getEligibleRidersForPillion(rideId, user.id);
      setEligibleRiders(riders);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Couldn't load the roster.");
    } finally {
      setLinking(false);
    }
  }

  async function confirmPillionLink() {
    if (!rideId || !user || !selectedRiderId) return;
    setLinking(true);
    setLinkError(null);
    try {
      await linkPillionToRider(rideId, user.id, selectedRiderId);
      const refreshed = await getRideDetail(rideId);
      if (refreshed) setDetail(refreshed);
      setPillionPickerOpen(false);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Couldn't link to that rider. Try again.");
    } finally {
      setLinking(false);
    }
  }

  async function handleLeave() {
    if (!rideId || !user) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await leaveRide(rideId, user.id);
      navigate("/");
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : "Couldn't leave the ride. Try again.");
      setLeaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--color-text-secondary)" }}>Loading ride…</p>;
  }

  if (error || !detail) {
    return (
      <div>
        <BackLink to="/">Home</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{error ?? "Ride not found."}</p>
        </Card>
      </div>
    );
  }

  const { ride, stops, roster, pillionLinks } = detail;
  const startLabel = (ride.start_point as { label?: string } | null)?.label ?? "—";
  const destinationLabel = (ride.destination as { label?: string } | null)?.label ?? "—";
  const self = roster.find((r) => r.member.user_id === user?.id);

  // ticket 06 — pair each pillion with their rider for the roster display;
  // the map (Flow 3) reads the same table to keep one dot per bike.
  const nameById = new Map(roster.map((r) => [r.member.user_id, r.profile?.display_name ?? "Rider"]));
  const riderIdByPillion = new Map(pillionLinks.map((l) => [l.pillion_user_id, l.rider_user_id]));
  const pillionIdsByRider = new Map<string, string[]>();
  for (const link of pillionLinks) {
    const list = pillionIdsByRider.get(link.rider_user_id) ?? [];
    list.push(link.pillion_user_id);
    pillionIdsByRider.set(link.rider_user_id, list);
  }
  const selfIsLinkedPillion = !!(user && riderIdByPillion.has(user.id));

  return (
    <div>
      <BackLink to="/">Home</BackLink>
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
              {stops.map((stop) => {
                const kind = stop.kind as StopKind | null;
                const iconName = kind && kind in STOP_ICONS ? STOP_ICONS[kind] : undefined;
                const label = kind && kind in STOP_LABELS ? STOP_LABELS[kind] : stop.kind;
                return (
                  <li key={stop.id} style={{ marginBottom: "var(--space-2xs)" }}>
                    <span>{stop.name}</span>
                    {kind && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--space-2xs)",
                          marginLeft: "var(--space-xs)",
                          color: "var(--color-text-tertiary)",
                          fontSize: "var(--text-caption)",
                          verticalAlign: "middle",
                        }}
                      >
                        {iconName && (
                          <Icon
                            name={iconName}
                            size={16}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            color="var(--color-text-tertiary)"
                          />
                        )}
                        <span>{label}</span>
                      </span>
                    )}
                  </li>
                );
              })}
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
          {ride.scheduled_start ? (
            <>
              Departs {formatScheduleDateTime(ride.scheduled_start)}
              {ride.scheduled_end && ` · Expected end ${formatScheduleDateTime(ride.scheduled_end)}`}
            </>
          ) : (
            `Created ${new Date(ride.created_at).toLocaleString()}`
          )}
          {ride.member_capacity ? ` · Capacity ${roster.length} / ${ride.member_capacity}` : ` · ${roster.length} people`}
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
      {(self?.member.role === "leader" || ride.leader_id === user?.id) && ride.status === "draft" && (
        <Button
          variant="secondary"
          style={{ marginTop: "var(--space-sm)" }}
          onClick={() => navigate(`/ride/${ride.id}/edit`)}
        >
          Edit ride
        </Button>
      )}
      {self && (
        <Button
          variant="secondary"
          style={{ marginTop: "var(--space-sm)" }}
          onClick={() => navigate(`/profile?rideId=${ride.id}`)}
        >
          Complete your profile (optional)
        </Button>
      )}
      {/* Leave-before-start (ticket 07): a leader leaving needs reassignment
          first (out of scope here), and once the ride is active/ended this
          is Flow 3/4 territory — so both are excluded. */}
      {self && ride.status === "draft" && self.member.role !== "leader" && (
        <Button
          variant="secondary"
          style={{ marginTop: "var(--space-sm)" }}
          onClick={() => setLeaveConfirmOpen(true)}
        >
          Leave ride
        </Button>
      )}
      {leaveConfirmOpen && (
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-md)" }}>
          <p style={{ margin: "0 0 var(--space-md)" }}>Leave "{ride.name}"? You'll need the join code to come back.</p>
          {leaveError && (
            <p style={{ color: "var(--color-role-sweep)", margin: "0 0 var(--space-md)" }}>{leaveError}</p>
          )}
          <Button onClick={() => void handleLeave()} loading={leaving}>
            Leave ride
          </Button>
          <Button
            variant="ghost"
            style={{ marginTop: "var(--space-sm)" }}
            onClick={() => setLeaveConfirmOpen(false)}
            disabled={leaving}
          >
            Cancel
          </Button>
        </Card>
      )}

      <SectionTitle>Roster</SectionTitle>
      {self && !selfIsLinkedPillion && (
        <div style={{ margin: "0 0 var(--space-md)" }}>
          <button
            type="button"
            onClick={() => void openPillionPicker()}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-label)",
              fontFamily: "var(--font-ui)",
              textDecoration: "underline",
              cursor: "pointer",
              minHeight: 56,
            }}
          >
            Riding pillion? Link to your rider
          </button>
        </div>
      )}

      {pillionPickerOpen && (
        <Card padding="var(--space-lg)" style={{ marginBottom: "var(--space-md)" }}>
          {linking && eligibleRiders.length === 0 && !linkError ? (
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>Loading roster…</p>
          ) : eligibleRiders.length === 0 ? (
            <>
              <p style={{ margin: "0 0 var(--space-sm)" }}>None of the riders in this ride have joined yet.</p>
              <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-md)" }}>
                Ask your rider to join first, then check again.
              </p>
              <Button onClick={() => void openPillionPicker()} loading={linking}>
                Check again
              </Button>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 var(--space-md)" }}>Whose bike are you riding on?</p>
              {eligibleRiders.map((r) => {
                const active = r.userId === selectedRiderId;
                return (
                  <Card
                    key={r.userId}
                    padding="var(--space-md)"
                    onClick={() => setSelectedRiderId(r.userId)}
                    style={{
                      marginBottom: "var(--space-sm)",
                      cursor: "pointer",
                      minHeight: 56,
                      display: "flex",
                      alignItems: "center",
                      border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
                    }}
                  >
                    {r.displayName}
                  </Card>
                );
              })}
              <Button onClick={() => void confirmPillionLink()} disabled={!selectedRiderId} loading={linking}>
                Link to this rider
              </Button>
            </>
          )}
          {linkError && (
            <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0 0" }}>{linkError}</p>
          )}
          <Button
            variant="ghost"
            style={{ marginTop: "var(--space-sm)" }}
            onClick={() => setPillionPickerOpen(false)}
          >
            Cancel
          </Button>
        </Card>
      )}

      {roster.map(({ member, profile }) => {
        const riderId = riderIdByPillion.get(member.user_id);
        const pillionIds = pillionIdsByRider.get(member.user_id) ?? [];
        return (
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
            {riderId && (
              <span style={{ display: "block", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)" }}>
                Pillion · riding with {nameById.get(riderId) ?? "rider"}
              </span>
            )}
            {!riderId && pillionIds.length > 0 && (
              <span style={{ display: "block", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)" }}>
                + {pillionIds.map((id) => nameById.get(id) ?? "pillion").join(", ")} riding pillion
              </span>
            )}
          </span>
          <span style={{ color: ROLE_COLOR[member.role], fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {ROLE_LABEL[member.role]}
          </span>
        </Card>
        );
      })}
    </div>
  );
}
