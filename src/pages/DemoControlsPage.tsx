// Flow 3 live-ops demo. Bootstraps an is_demo ride, runs the RLS-safe simulator
// (each dummy rider its own guest session), and renders the Lead/Sweep ops view:
// live map, group-status roster, SOS, a join QR for your phone, and controls to
// trigger the behind/stopped states on cue.
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { RideMap } from "../components/liveops/RideMap";
import { useRideChannel } from "../hooks/useRideChannel";
import { ensureGuestSession } from "../lib/session";
import { createDemoRide, DEMO_ROUTE, SIM_RIDER_NAMES } from "../lib/demoRide";
import { RideSimulator } from "../lib/simulator";
import type { SimRiderView } from "../lib/simulator";
import { supabase } from "../lib/supabase";
import type { GroupStatus, RiderOnMap } from "../lib/models";
import QRCode from "qrcode";

// Session-level singleton so React StrictMode's double-mount (and navigation
// back to the page) doesn't spawn a second ride or a second simulator.
type DemoState = { rideId: string; code: string; leaderId: string; sim: RideSimulator };
let demoPromise: Promise<DemoState> | null = null;
function getDemo(): Promise<DemoState> {
  demoPromise ??= (async () => {
    const leaderId = await ensureGuestSession("Ride Captain");
    const { rideId, code } = await createDemoRide(supabase, leaderId);
    const sim = new RideSimulator(rideId, code, DEMO_ROUTE);
    await sim.start(SIM_RIDER_NAMES);
    return { rideId, code, leaderId, sim };
  })();
  return demoPromise;
}

const STATUS_LABEL: Record<GroupStatus, string> = {
  intact: "In sync",
  behind: "Behind",
  stopped: "Stopped",
  stale: "No signal",
};
const STATUS_COLOR: Record<GroupStatus, string> = {
  intact: "#5AC8FA",
  behind: "#FF9F0A",
  stopped: "#FF453A",
  stale: "#8A8A8E",
};

export function DemoControlsPage() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sims, setSims] = useState<SimRiderView[]>([]);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    getDemo()
      .then((d) => {
        setDemo(d);
        setSims(d.sim.list());
      })
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  const { riders, events } = useRideChannel(demo?.rideId);

  useEffect(() => {
    if (!demo) return;
    const url = `${location.origin}/r?code=${demo.code}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [demo]);

  const counts = useMemo(() => {
    const total = riders.length;
    const inSync = riders.filter((r) => r.status === "intact").length;
    return { total, inSync };
  }, [riders]);

  const activeSos = events.find((e) => e.type === "sos");

  async function triggerSos() {
    if (!demo) return;
    await supabase.from("ride_events").insert({
      ride_id: demo.rideId,
      user_id: demo.leaderId,
      type: "sos",
      payload: { note: "Manual SOS from ops view" },
    });
  }

  function toggleBehind(userId: string, value: boolean) {
    demo?.sim.setBehind(userId, value);
    setSims((prev) => prev.map((s) => (s.userId === userId ? { ...s, behind: value } : s)));
  }
  async function toggleStopped(userId: string, value: boolean) {
    await demo?.sim.setStopped(userId, value);
    setSims((prev) => prev.map((s) => (s.userId === userId ? { ...s, stopped: value } : s)));
  }

  if (error) {
    return (
      <Card style={{ borderLeft: "3px solid #FF453A" }}>
        <strong>Couldn't start the demo.</strong>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: 0 }}>{error}</p>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>
          Most likely the schema isn't applied yet — run <code>0001_foundation.sql</code> in the Supabase SQL editor and enable anonymous sign-ins.
        </p>
      </Card>
    );
  }

  return ( 
    
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-brand)", fontSize: 24, margin: 0 }}>Lead / sweep view</h1>
        <p style={{ color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
          RR Nagar → Jayanna Circle · live pack
        </p>
      </div>

      <div style={{ position: "relative", height: "56vh", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--color-surface-2)" }}>
        {demo ? <RideMap route={DEMO_ROUTE} riders={riders} /> : <Centered>Starting demo…</Centered>}

        {/* roster / count pill */}
        <div style={{ position: "absolute", left: 12, bottom: 12, right: 12, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ background: "rgba(20,20,22,.85)", color: "#fff", padding: "8px 14px", borderRadius: 999, fontWeight: 600, fontSize: 14 }}>
            {counts.inSync}/{counts.total} in sync
          </span>
          <Button fullWidth={false} onClick={triggerSos} style={{ background: activeSos ? "#FF453A" : "var(--color-surface-3)", color: "#fff", height: 40 }}>
            SOS
          </Button>
        </div>
      </div>

      {activeSos && (
        <Card style={{ borderLeft: "3px solid #FF453A" }}>
          <strong style={{ color: "#FF453A" }}>SOS raised</strong>
          <span style={{ color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 13 }}>
            {new Date(activeSos.created_at).toLocaleTimeString()}
          </span>
        </Card>
      )}

      {/* Roster */}
      <Card elevated>
        <RosterList riders={riders} />
      </Card>

      {/* Demo controls */}
      <Card>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Demo controls — trigger a state on cue</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sims.map((s) => (
            <div key={s.userId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 14 }}>{s.name}</span>
              <Chip active={s.behind} color="#FF9F0A" onClick={() => toggleBehind(s.userId, !s.behind)}>behind</Chip>
              <Chip active={s.stopped} color="#FF453A" onClick={() => void toggleStopped(s.userId, !s.stopped)}>stop</Chip>
            </div>
          ))}
        </div>
      </Card>

      {/* Join QR for the phone */}
      {demo && (
        <Card glow style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Scan to join as a real rider</div>
          {qr && <img src={qr} alt="Join QR" style={{ width: 180, height: 180, marginTop: 8, borderRadius: 12 }} />}
          <div style={{ fontFamily: "var(--font-brand)", letterSpacing: 2, fontSize: 20, marginTop: 4 }}>{demo.code}</div>
        </Card>
      )}
    </div>
  );
}

function RosterList({ riders }: { riders: RiderOnMap[] }) {
  if (riders.length === 0) return <div style={{ color: "var(--color-text-tertiary)" }}>No riders yet…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {riders.map((r) => (
        <div key={r.member.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[r.status] }} />
          <span style={{ flex: 1, fontSize: 15 }}>
            {r.profile.display_name}
            {(r.member.role === "leader" || r.member.role === "co_leader") && (
              <span style={{ color: "#C4F82A", fontSize: 12, marginLeft: 6 }}>lead</span>
            )}
          </span>
          <span style={{ fontSize: 13, color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
        </div>
      ))}
    </div>
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? color : "var(--color-divider)"}`,
        background: active ? color : "transparent",
        color: active ? "#0A0A0B" : "var(--color-text-secondary)",
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>
      {children}
    </div>
  );
}
