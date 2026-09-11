import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { FeedbackSentiment, Ride, RideMember, RideSummary, UserBadge } from "../lib/models";
import {
  closeRide,
  getHomeRoster,
  getRideBadges,
  getRideSummary,
  markReachedHome,
  submitFeedback,
} from "../lib/ending";
import { shareRide } from "../lib/shareCard";

const sentiments: { value: FeedbackSentiment; label: string }[] = [
  { value: "like", label: "Liked it" },
  { value: "can_be_better", label: "Can be better" },
  { value: "dislike", label: "Disliked" },
];

export function RideSummaryPage() {
  const { rideId = "" } = useParams();
  const [me, setMe] = useState<string | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [summary, setSummary] = useState<RideSummary | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [sentiment, setSentiment] = useState<FeedbackSentiment | null>(null);
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const { data: r } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
      const [sum, mem] = await Promise.all([getRideSummary(rideId), getHomeRoster(rideId)]);
      const bdg = uid ? await getRideBadges(rideId, uid) : [];
      if (!active) return;
      setMe(uid);
      setRide(r);
      setSummary(sum);
      setMembers(mem);
      setBadges(bdg);
    })().catch((e) => setStatus(String(e?.message ?? e)));
    return () => {
      active = false;
    };
  }, [rideId]);

  const myMember = members.find((m) => m.user_id === me);
  const isLead = myMember?.role === "leader" || myMember?.role === "co_leader";
  const homeCount = members.filter((m) => m.reached_home_at).length;
  const iAmHome = Boolean(myMember?.reached_home_at);

  // Nudge: all arrived + ride still active + lead viewing. (60-min timer is
  // demo-grade client-side; a scheduled function is the robust path.)
  const allArrived = members.length > 0 && members.every((m) => m.status === "arrived");
  const showNudge = isLead && ride?.status === "active" && allArrived;

  async function run(label: string, fn: () => Promise<unknown>) {
    setStatus("");
    try {
      await fn();
      setStatus(label);
    } catch (e) {
      setStatus(String((e as Error)?.message ?? e));
    }
  }

  const distanceKm = (summary?.total_distance_m ?? 0) / 1000;
  const durationMin = Math.round((summary?.total_time_s ?? 0) / 60);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <div>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: "var(--weight-semibold)", margin: 0 }}>
          {ride?.name ?? "Ride"} — summary
        </h1>
        <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-2xs) 0 0" }}>
          {ride ? `${ride.status === "ended" ? "Completed" : "In progress"} · ${ride.travel_mode}` : "Loading…"}
        </p>
      </div>

      {showNudge && (
        <Card glow padding="var(--space-md)">
          <strong>Everyone's arrived.</strong> Ready to wrap up?
          <div style={{ marginTop: "var(--space-sm)" }}>
            <Button onClick={() => run("Trip completed.", () => closeRide(rideId))}>
              Mark trip complete
            </Button>
          </div>
        </Card>
      )}

      {/* Pod stats */}
      <Card>
        <div style={{ display: "flex", gap: "var(--space-xl)", flexWrap: "wrap" }}>
          <Stat value={`${distanceKm.toFixed(1)} km`} label="Pod distance" />
          <Stat value={`${Math.floor(durationMin / 60)}h ${durationMin % 60}m`} label="Duration" />
          <Stat value={`${summary?.riders_home ?? homeCount}/${summary?.riders_total ?? members.length}`} label="Home" />
        </div>
        {(summary?.arrival_unconfirmed ?? 0) > 0 && (
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-label)", marginBottom: 0 }}>
            {summary?.arrival_unconfirmed} rider(s) with arrival unconfirmed.
          </p>
        )}
      </Card>

      {/* Badges */}
      {badges.length > 0 && (
        <Card>
          <h2 style={{ fontSize: "var(--text-h2)", margin: "0 0 var(--space-sm)" }}>Badges earned</h2>
          <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
            {badges.map((b) => (
              <span
                key={b.badge_key}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-surface-3)",
                  color: "var(--color-accent)",
                  fontSize: "var(--text-label)",
                }}
              >
                {b.badge_key}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Home ack */}
      <Card>
        <h2 style={{ fontSize: "var(--text-h2)", margin: "0 0 var(--space-sm)" }}>Reached home?</h2>
        <Button
          variant={iAmHome ? "secondary" : "primary"}
          disabled={iAmHome}
          onClick={() => run("Marked home — the lead can see it.", () => markReachedHome(rideId))}
        >
          {iAmHome ? "You're marked home ✓" : "I reached home"}
        </Button>
      </Card>

      {/* Feedback */}
      <Card>
        <h2 style={{ fontSize: "var(--text-h2)", margin: "0 0 var(--space-sm)" }}>How was the ride?</h2>
        <div style={{ display: "flex", gap: "var(--space-xs)", marginBottom: "var(--space-sm)" }}>
          {sentiments.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSentiment(s.value)}
              style={{
                flex: 1,
                padding: "var(--space-sm)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                border: "1px solid var(--color-divider)",
                background: sentiment === s.value ? "var(--color-accent)" : "var(--color-surface-3)",
                color: sentiment === s.value ? "var(--color-text-on-accent)" : "var(--color-text-primary)",
                fontWeight: "var(--weight-medium)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          placeholder="What did you like? (optional)"
          value={liked}
          onChange={(e) => setLiked(e.target.value)}
          style={textareaStyle}
        />
        <textarea
          placeholder="What could improve? (optional)"
          value={improve}
          onChange={(e) => setImprove(e.target.value)}
          style={textareaStyle}
        />
        <Button
          disabled={!sentiment || !me}
          onClick={() =>
            run("Thanks for the feedback.", () =>
              submitFeedback({
                rideId,
                userId: me!,
                sentiment: sentiment!,
                likedText: liked || undefined,
                improveText: improve || undefined,
              })
            )
          }
        >
          Submit feedback
        </Button>
      </Card>

      {/* Share */}
      <Button
        variant="secondary"
        onClick={() =>
          run("Shared.", async () => {
            const res = await shareRide({
              rideName: ride?.name ?? "My ride",
              fromCity: (ride?.start_point as { label?: string } | null)?.label ?? ride?.city ?? "Start",
              toCity: (ride?.destination as { label?: string } | null)?.label ?? "Destination",
              distanceKm,
              durationMin,
              badges: badges.map((b) => b.badge_key),
              appUrl: window.location.origin,
            });
            if (res === "link-copied") setStatus("Link copied.");
          })
        }
      >
        Share this ride
      </Button>

      {status && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>{status}</p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-metric)", fontWeight: "var(--weight-semibold)", color: "var(--color-accent)" }}>
        {value}
      </div>
      <div style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>{label}</div>
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 64,
  marginBottom: "var(--space-sm)",
  padding: "var(--space-sm)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-divider)",
  background: "var(--color-surface-2)",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--text-body-size)",
  resize: "vertical",
  boxSizing: "border-box",
};
