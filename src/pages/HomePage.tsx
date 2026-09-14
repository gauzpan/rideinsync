import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useHomeData } from "../hooks/useHomeData";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { VoicePermissionSheet } from "../components/VoicePermissionSheet";
import { usePersistedToggle } from "../lib/preference";
import { VOICE_COMMANDS_KEY } from "../lib/voiceCommands";

export function HomePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { completeness, stats, pastRides } = useHomeData();
  const [voiceOn] = usePersistedToggle(VOICE_COMMANDS_KEY, false);
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);

  // Profile display_name is the default "Rider" for most OAuth sign-ins (the
  // provisioning trigger only reads a `display_name` metadata key), so fall
  // back to the provider-supplied name from the auth session.
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim().length > 0);
  const profileName = profile?.display_name?.trim();
  const name = (profileName && profileName !== "Rider" ? profileName : metaName) ?? "rider";
  const firstName = name.trim().split(/\s+/)[0];

  const col: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-lg)",
  };

  if (showVoiceSheet) {
    return <VoicePermissionSheet onDone={() => setShowVoiceSheet(false)} />;
  }

  return (
    <div style={col}>
      {/* 1. Greeting — identity/avatar now live in the top AccountBar. Stacked
          rather than run-in, per docs/plan-update-visual.md §3, so the name
          reads as the emphasized half rather than a continuation of "Hey,". */}
      <h1 style={{ margin: 0, fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-regular)" as unknown as number }}>
        <span style={{ display: "block", color: "var(--color-text-secondary)" }}>Hey,</span>
        <span style={{ display: "block", color: "var(--color-text-primary)", fontWeight: "var(--weight-bold)" as unknown as number }}>
          {firstName}
        </span>
      </h1>

      {/* 2. Quick actions — active/past rides now live on the Ride tab (see
          RidesPage.tsx) instead of being duplicated here. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <Button onClick={() => navigate("/ride/create")}>
          Create a ride
        </Button>
        <Button variant="secondary" onClick={() => navigate("/join")}>
          Join a ride
        </Button>
      </div>

      {/* 3. Profile-completeness nudge — disappears when complete */}
      {completeness.done < completeness.total && (
        <button
          type="button"
          onClick={() => navigate("/profile")}
          style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
        >
          <Card padding="var(--space-md)">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div>
                <div style={{ fontSize: "var(--text-body-size)", lineHeight: "22px", fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--color-text-primary)" }}>
                  Finish your rider setup
                </div>
                <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {completeness.done} of {completeness.total}
                  </span>{" "}
                  done — needed for SOS and emergency help.
                </div>
              </div>
              <SetupMeter done={completeness.done} total={completeness.total} />
            </div>
          </Card>
        </button>
      )}

      {/* 3b. Voice-commands nudge — for anyone still on the manual signal picker */}
      {!voiceOn && (
        <button
          type="button"
          onClick={() => setShowVoiceSheet(true)}
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
                  // Lime-tinted badge (docs/plan-update-visual.md §8) instead
                  // of a neutral surface — ties the icon's own accent color
                  // into its background rather than floating on plain grey.
                  background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-accent)",
                }}
              >
                <Icon name="mic" size={20} />
              </div>
              <div>
                <div style={{ fontSize: "var(--text-body-size)", lineHeight: "22px", fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--color-text-primary)" }}>
                  Turn on voice commands
                </div>
                <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>
                  Say "sync" to signal your group hands-free.
                </div>
              </div>
            </div>
          </Card>
        </button>
      )}

      {/* 4. Stats strip — stubbed demo constants until Flow 2's user_stats lands.
          Sentence case, no caps (docs/plan-update-visual.md §10) — "sample
          data" dropped from the visible label, still true in the code comment. */}
      <section>
        <SectionLabel>Your riding</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
          <StatCard value={String(stats.rides)} label="Rides" />
          <StatCard value={String(stats.distanceKm)} unit="km" label="Distance" />
          <StatCard value={String(stats.ridesLed)} label="Led" />
        </div>
      </section>

      {/* 5. Past rides — restored on Home (also available on the Ride tab).
          Hidden when there's no history. */}
      {pastRides.length > 0 && (
        <section>
          <SectionLabel>Past rides</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            {pastRides.map((r) => (
              <button
                key={r.rideId}
                type="button"
                onClick={() => navigate(`/ride/${r.rideId}/summary`)}
                style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
              >
                <Card padding="var(--space-md)">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                      </div>
                      <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>
                        {new Date(r.endedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div style={{ flex: "none", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {r.distanceKm} km
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 6. Privacy line — addresses location-sharing concern directly */}
      <p style={{ margin: 0, fontSize: "var(--text-label)", color: "var(--color-text-tertiary)" }}>
        Live location only shares while a ride is active.
      </p>
    </div>
  );
}

function StatCard({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <Card padding="var(--space-md)">
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: "var(--text-metric)", lineHeight: "var(--lh-metric)", fontWeight: "var(--weight-bold)" as unknown as number, color: "var(--color-text-primary)" }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>{unit}</span>}
      </div>
      <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>{label}</div>
    </Card>
  );
}

/** Four-segment progress meter for the setup nudge. Done segments use the
 *  accent (docs/plan-update-visual.md §7 — "feel actionable rather than
 *  disabled") instead of a flat grey that read as inert. */
function SetupMeter({ done, total }: { done: number; total: number }) {
  return (
    <div style={{ flex: "none", display: "flex", gap: 4 }} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 24,
            borderRadius: "var(--radius-sm)",
            background: i < done ? "var(--color-accent)" : "var(--color-surface-4)",
          }}
        />
      ))}
    </div>
  );
}

/** Sentence-case section label — no all-caps/letter-spacing treatment
 *  (docs/plan-update-visual.md §10). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-label)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-secondary)" }}>
      {children}
    </div>
  );
}
