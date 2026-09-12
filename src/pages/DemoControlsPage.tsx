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
import { Icon } from "../components/ui/Icon";
import { RoleBadge, toBadgeRole } from "../components/ui/RoleBadge";
import { RideMap } from "../components/liveops/RideMap";
import { useRideChannel } from "../hooks/useRideChannel";
import { ensureGuestSession } from "../lib/session";
import { createDemoRide, DEMO_ROUTE, SIM_RIDER_NAMES } from "../lib/demoRide";
import { RideSimulator } from "../lib/simulator";
import { supabase } from "../lib/supabase";
import { SIGNAL_LABEL, SIGNAL_TYPES, sendRideSignal, type SignalKind } from "../lib/signals";
import {
  useVoiceHeardPulse,
  useVoiceActivateListener,
  useVoiceListening,
  useVoiceError,
  publishSignalModalOpen,
  useVoiceCommandFiredListener,
  useVoiceAudioLevel,
  useVoicePartial,
  useVoiceDetection,
} from "../lib/voiceActivity";
import { usePersistedToggle } from "../lib/preference";
import { VOICE_COMMANDS_KEY, isVoiceCommandSupported } from "../lib/voiceCommands";
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

/** Web Speech API error codes, translated for someone who just said "sync"
 *  and nothing happened. Null means "not worth showing" (expected/benign). */
function describeVoiceError(code: string): string | null {
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "network":
      return "Voice recognition needs a working internet connection.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked for this site.";
    case "audio-capture":
      return "No microphone was found.";
    case "audio-suspended":
      return "Voice commands are paused — turn the mic off and on to restart it.";
    default:
      return `Voice recognition error: ${code}.`;
  }
}

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

  // The wake-word listener runs globally (AppLayout), not here — this just
  // reacts to it so the Ride screen shows its own "heard you" confirmation,
  // pulses the mic while actually listening, and opens Signal on a bare
  // "sync" with no signal name attached to it.
  const voiceHeard = useVoiceHeardPulse();
  const micListening = useVoiceListening();
  const voiceRecognitionError = useVoiceError();
  // Live diagnostics around the mic button: how loud the mic input currently
  // is (moves even when nothing is recognized, so "is it picking up audio at
  // all" is answerable at a glance), the in-progress transcript while
  // speaking, and the last finalized word plus what the app did about it.
  const audioLevel = useVoiceAudioLevel();
  const partial = useVoicePartial();
  const detection = useVoiceDetection();
  const [showDetection, setShowDetection] = useState(false);
  useEffect(() => {
    if (!detection) {
      setShowDetection(false);
      return;
    }
    setShowDetection(true);
    const timer = window.setTimeout(() => setShowDetection(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [detection]);
  useVoiceActivateListener(() => setSignalOpen(true));
  // Once the picker is open (voice or a manual tap), AppLayout's listener can
  // match a bare signal name with no wake word first — closing again here
  // once a spoken choice actually fires, matching what a tap+close would do.
  useEffect(() => publishSignalModalOpen(signalOpen), [signalOpen]);
  useEffect(() => () => publishSignalModalOpen(false), []);
  useVoiceCommandFiredListener(() => setSignalOpen(false));

  // Manual activation, right where it's used, instead of only via Profile.
  const [voiceOn, setVoiceOn] = usePersistedToggle(VOICE_COMMANDS_KEY, false);
  const [micError, setMicError] = useState<string | null>(null);

  // What to show under the mic button: a permission denial from the toggle
  // itself takes priority, then "this browser can't do this at all", then
  // whatever the live recognition session's last error was.
  const voiceMessage = !voiceOn
    ? null
    : micError ??
      (!isVoiceCommandSupported()
        ? "Voice commands aren't supported in this browser."
        : voiceRecognitionError && describeVoiceError(voiceRecognitionError));

  // Live caption near the mic: the in-progress transcript while something is
  // being said, otherwise the last finalized word and what the app did with
  // it (fades after a few seconds via showDetection). Only shown once voice
  // is actually on and the recognizer is running, and never alongside an
  // error message (voiceMessage takes priority in that slot).
  const micCaption =
    voiceOn && micListening && !voiceMessage
      ? partial
        ? `Hearing "${partial}"`
        : showDetection && detection
          ? `"${detection.text}" — ${detection.action}`
          : null
      : null;

  async function handleMicToggle() {
    if (voiceOn) {
      setVoiceOn(false);
      return;
    }
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceOn(true);
    } catch {
      setMicError("Microphone access was denied.");
    }
  }

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

      {/* Top overlay — in-sync count, and a "Sync heard" badge while the wake
          word was just heard (an active SOS shows via the app-wide alert card
          in AppLayout instead of a page-local banner). */}
      <div
        style={{
          position: "absolute",
          left: "var(--gutter)",
          right: "var(--gutter)",
          top: "calc(env(safe-area-inset-top) + var(--space-md))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          {voiceHeard && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                background: "var(--color-accent)",
                color: "var(--color-text-on-accent)",
                padding: "8px 14px",
                borderRadius: "var(--radius-full)",
                fontWeight: 600,
                fontSize: 14,
                boxShadow: "var(--glow-accent)",
              }}
            >
              <Icon name="signal" size={16} />
              Sync heard
            </span>
          )}
          {/* The ring's spread and opacity track live mic input level (via
              color-mix on the accent token, not a hardcoded rgba) — separate
              from the steady "mic-listening" pulse below, this is "is there
              audio around right now" rather than "is the mic on". */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "var(--radius-full)",
              boxShadow:
                voiceOn && micListening
                  ? `0 0 0 ${(4 + audioLevel * 10).toFixed(1)}px color-mix(in srgb, var(--color-accent) ${Math.round(8 + audioLevel * 30)}%, transparent)`
                  : "none",
              transition: "box-shadow 80ms linear",
            }}
          >
            <IconButton
              name="mic"
              size={44}
              variant={voiceOn ? "accent" : "surface"}
              onClick={() => void handleMicToggle()}
              aria-label={voiceOn ? "Turn off RideInSync voice commands" : "Turn on RideInSync voice commands"}
              aria-pressed={voiceOn}
              className={voiceOn && micListening ? "mic-listening" : undefined}
            />
          </div>
        </div>
      </div>

      {(voiceMessage || micCaption) && (
        <div
          style={{
            position: "absolute",
            right: "var(--gutter)",
            left: "var(--gutter)",
            top: "calc(env(safe-area-inset-top) + var(--space-md) + 56px)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-divider)",
              color: voiceMessage ? "var(--color-text-secondary)" : "var(--color-text-primary)",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-label)",
              textAlign: "right",
            }}
          >
            {voiceMessage ?? micCaption}
          </span>
        </div>
      )}

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
          <SignalModal
            rideId={demo.rideId}
            leaderId={demo.leaderId}
            voiceOn={voiceOn}
            onClose={() => setSignalOpen(false)}
          />,
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

function SignalModal({
  rideId,
  leaderId,
  voiceOn,
  onClose,
}: {
  rideId: string;
  leaderId: string;
  voiceOn: boolean;
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
      await sendRideSignal(rideId, leaderId, kind, `Lead signalled ${kind}`);
      setSentKind(kind);
    } finally {
      setSending(null);
    }
  }

  return (
    <CenterModal title="Signal" onClose={onClose}>
      {voiceOn && (
        <p
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--color-text-tertiary)",
            margin: "0 0 var(--space-md)",
          }}
        >
          Say a name below to send it hands-free.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-md)" }}>
        {SIGNAL_TYPES.map(({ kind, icon, color }) => (
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
              {sending === kind ? "Sending…" : SIGNAL_LABEL[kind]}
            </span>
          </button>
        ))}
      </div>
      {sentKind && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)", textAlign: "center", margin: "var(--space-md) 0 0" }}>
          {SIGNAL_LABEL[sentKind]} sent
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
