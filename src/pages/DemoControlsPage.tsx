// Flow 3 live-ops demo. Bootstraps an is_demo ride, runs the RLS-safe simulator
// (each dummy rider its own guest session), and renders the Lead/Sweep ops view:
// a full-screen live map with two floating actions — "Details" (roster, each
// rider's title + relative position, and the join QR/code) and "Signal" (hazard,
// regroup, pit stop, or SOS — the only place SOS can be raised from).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Icon, type IconName } from "../components/ui/Icon";
import { RoleBadge, toBadgeRole } from "../components/ui/RoleBadge";
import { RideMap } from "../components/liveops/RideMap";
import { useRideChannel } from "../hooks/useRideChannel";
import { ensureGuestSession } from "../lib/session";
import { createDemoRide, DEMO_ROUTE, SIM_RIDER_NAMES } from "../lib/demoRide";
import { RideSimulator } from "../lib/simulator";
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
  intact: "var(--color-role-lead)",
  behind: "var(--color-role-sweep)",
  stopped: "var(--color-danger)",
  stale: "var(--color-text-tertiary)",
};

export function DemoControlsPage() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);

  useEffect(() => {
    getDemo()
      .then((d) => setDemo(d))
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  const { riders } = useRideChannel(demo?.rideId);

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

  if (error) {
    return (
      <Card style={{ borderLeft: "3px solid var(--color-danger)" }}>
        <strong>Couldn't start the demo.</strong>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: 0 }}>{error}</p>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>
          Most likely the schema isn't applied yet. Run <code>0001_foundation.sql</code> in the Supabase SQL editor and enable anonymous sign-ins.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10, background: "var(--color-bg-base)" }}>
      <div style={{ position: "absolute", inset: 0, bottom: "var(--tabbar-height)" }}>
        {demo ? <RideMap route={DEMO_ROUTE} riders={riders} /> : <Centered>Starting demo…</Centered>}
      </div>

      {/* Top overlay — in-sync count. An active SOS shows via the app-wide
          alert card (AppLayout), not a page-local banner. */}
      <div
        style={{
          position: "absolute",
          left: "var(--gutter)",
          top: "calc(env(safe-area-inset-top) + var(--space-md))",
        }}
      >
        <span
          style={{
            background: "rgba(20,20,22,.85)",
            color: "var(--color-text-primary)",
            padding: "8px 14px",
            borderRadius: "var(--radius-full)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {counts.inSync}/{counts.total} in sync
        </span>
      </div>

      {/* Bottom overlay — Details + Signal, clear of the TabBar */}
      <div
        style={{
          position: "absolute",
          left: "var(--gutter)",
          bottom: "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-md))",
          display: "flex",
          gap: "var(--space-sm)",
        }}
      >
        <Button fullWidth={false} variant="secondary" onClick={() => setDetailsOpen(true)}>
          <Icon name="users" size={20} />
          Details
        </Button>
        <Button fullWidth={false} variant="secondary" onClick={() => setSignalOpen(true)}>
          <Icon name="signal" size={20} />
          Signal
        </Button>
      </div>

      {/* Portalled to <body> — this page root is itself position:fixed, which
          would trap a nested modal's z-index below the TabBar/SOS controls
          (siblings at the AppLayout root) no matter how high it's set. */}
      {detailsOpen && demo &&
        createPortal(
          <RideDetailsModal riders={riders} code={demo.code} qr={qr} onClose={() => setDetailsOpen(false)} />,
          document.body,
        )}
      {signalOpen && demo &&
        createPortal(
          <SignalModal rideId={demo.rideId} leaderId={demo.leaderId} onClose={() => setSignalOpen(false)} />,
          document.body,
        )}
    </div>
  );
}

// FLAGGED ADDITION: the design system ships no dialog primitive, only
// full-screen sheets (see QrScannerSheet/SignInSheet) — a real gap for a
// quick-glance action like this that shouldn't take over the whole screen.
// Centered card over a dim scrim; a tap on the scrim itself closes it.
function CenterModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--gutter)",
      }}
    >
      <Card
        elevated
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-md) var(--space-md) 0",
          }}
        >
          <span style={{ fontSize: "var(--text-h2)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {title}
          </span>
          <IconButton name="x" size={40} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} />
        </div>
        <div style={{ overflowY: "auto", padding: "var(--space-md)" }}>{children}</div>
      </Card>
    </div>
  );
}

function RideDetailsModal({
  riders,
  code,
  qr,
  onClose,
}: {
  riders: RiderOnMap[];
  code: string;
  qr: string | null;
  onClose: () => void;
}) {
  return (
    <CenterModal title="Ride details" onClose={onClose}>
      <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-sm)" }}>
        Riders
      </p>
      {riders.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)" }}>No riders yet…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {riders.map((r) => (
            <div
              key={r.member.user_id}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}
            >
              <span
                aria-hidden
                style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[r.status], flex: "none" }}
              />
              <span style={{ flex: 1, fontSize: "var(--text-body-size)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.profile.display_name}
              </span>
              <span style={{ fontSize: "var(--text-caption)", color: STATUS_COLOR[r.status] }}>
                {STATUS_LABEL[r.status]}
              </span>
              <RoleBadge role={toBadgeRole(r.member.role)} />
            </div>
          ))}
        </div>
      )}

      <Card glow style={{ textAlign: "center", marginTop: "var(--space-lg)" }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Scan to join as a real rider</div>
        {qr && <img src={qr} alt="Join QR" style={{ width: 160, height: 160, marginTop: 8, borderRadius: 12 }} />}
        <div style={{ fontFamily: "var(--font-brand)", letterSpacing: 2, fontSize: 20, marginTop: 4 }}>{code}</div>
      </Card>
    </CenterModal>
  );
}

type SignalKind = "sos" | "hazard" | "regroup" | "pitstop";
const SIGNAL_TYPES: { kind: SignalKind; label: string; icon: IconName; color: string }[] = [
  { kind: "sos", label: "SOS", icon: "signal", color: "var(--color-danger)" },
  { kind: "hazard", label: "Hazard", icon: "hazard", color: "var(--color-role-sweep)" },
  { kind: "regroup", label: "Regroup", icon: "users", color: "var(--color-accent)" },
  { kind: "pitstop", label: "Pit stop", icon: "flag", color: "var(--color-role-member)" },
];

function SignalModal({
  rideId,
  leaderId,
  onClose,
}: {
  rideId: string;
  leaderId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [sending, setSending] = useState<SignalKind | null>(null);
  const [sentKind, setSentKind] = useState<SignalKind | null>(null);

  async function sendSignal(kind: SignalKind) {
    // SOS is the one signal that isn't a fire-and-forget event: it opens the
    // real confirm + location-tracking flow, so it's the only way to raise
    // one anywhere in the app.
    if (kind === "sos") {
      onClose();
      navigate("/sos");
      return;
    }
    setSending(kind);
    setSentKind(null);
    try {
      await supabase.from("ride_events").insert({
        ride_id: rideId,
        user_id: leaderId,
        type: kind,
        payload: { note: `Lead signalled ${kind}` },
      });
      setSentKind(kind);
    } finally {
      setSending(null);
    }
  }

  return (
    <CenterModal title="Signal" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-md)" }}>
        {SIGNAL_TYPES.map(({ kind, label, icon, color }) => (
          <button
            key={kind}
            type="button"
            onClick={() => void sendSignal(kind)}
            disabled={sending !== null}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-xs)",
              background: "var(--color-surface-3)",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-md) var(--space-xs)",
              cursor: sending !== null ? "not-allowed" : "pointer",
              fontFamily: "var(--font-ui)",
              opacity: sending !== null && sending !== kind ? 0.5 : 1,
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-full)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: color,
                color: "var(--color-text-on-accent)",
              }}
            >
              <Icon name={icon} size={24} />
            </span>
            <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-primary)", fontWeight: 600 }}>
              {sending === kind ? "Sending…" : label}
            </span>
          </button>
        ))}
      </div>
      {sentKind && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)", textAlign: "center", margin: "var(--space-md) 0 0" }}>
          {SIGNAL_TYPES.find((s) => s.kind === sentKind)?.label} sent
        </p>
      )}
    </CenterModal>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>
      {children}
    </div>
  );
}
