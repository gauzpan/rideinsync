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
import { RideMap } from "../components/liveops/RideMap";
import { MAP_OVERLAY_BUTTON } from "../components/liveops/overlayStyles";
import { RideDetailsModal, SignalModal } from "../components/liveops/RideActionModals";
import { useRideChannel } from "../hooks/useRideChannel";
import { ensureGuestSession } from "../lib/session";
import { createDemoRide, DEMO_ROUTE, SIM_RIDER_NAMES } from "../lib/demoRide";
import { RideSimulator } from "../lib/simulator";
import { supabase } from "../lib/supabase";
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
import { usePushNotifications } from "../lib/pushNotifications";
import QRCode from "qrcode";

// Session-level singleton so React StrictMode's double-mount (and navigation
// back to the page) doesn't spawn a second ride or a second simulator.
// `sim` is null when a cached ride is reused — no simulator is started, so the
// pack shows its last-known positions rather than moving (see the guardrail).
type DemoState = { rideId: string; code: string; leaderId: string; sim: RideSimulator | null };
let demoPromise: Promise<DemoState> | null = null;

// Guardrail against burning Supabase's anonymous sign-in rate limit: seeding a
// fresh demo mints ~8 anonymous sessions (one per simulated rider), so a reload
// per test run adds up fast. We cache the created ride and, on the next load,
// reuse it (its riders are already in the DB) instead of re-seeding — but only
// briefly, and only when it's still an active demo owned by this same session.
const DEMO_CACHE_KEY = "demo.ride";
const DEMO_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h — long enough for a test session, short enough to stay fresh

type CachedDemo = { rideId: string; code: string; leaderId: string; ts: number };

function readCachedDemo(): CachedDemo | null {
  try {
    const raw = localStorage.getItem(DEMO_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedDemo;
    if (!c?.rideId || Date.now() - c.ts > DEMO_CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCachedDemo(d: Omit<CachedDemo, "ts">): void {
  try {
    localStorage.setItem(DEMO_CACHE_KEY, JSON.stringify({ ...d, ts: Date.now() }));
  } catch {
    /* private mode / storage disabled — just skip the reuse optimization */
  }
}

function getDemo(): Promise<DemoState> {
  demoPromise ??= (async () => {
    const leaderId = await ensureGuestSession("Ride Captain");

    // Reuse a recent demo ride we already seeded, rather than spawning a new
    // pack of anonymous sim riders. Gated on it still being an active demo
    // owned by this session (a different/expired user falls through to fresh).
    const cached = readCachedDemo();
    if (cached && cached.leaderId === leaderId) {
      const { data: ride } = await supabase
        .from("rides")
        .select("id, code, status, is_demo")
        .eq("id", cached.rideId)
        .eq("is_demo", true)
        .eq("status", "active")
        .maybeSingle();
      if (ride) return { rideId: ride.id, code: ride.code, leaderId, sim: null };
    }

    const { rideId, code } = await createDemoRide(supabase, leaderId);
    const sim = new RideSimulator(rideId, code, DEMO_ROUTE);
    await sim.start(SIM_RIDER_NAMES);
    writeCachedDemo({ rideId, code, leaderId });
    return { rideId, code, leaderId, sim };
  })();
  return demoPromise;
}

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
  const navigate = useNavigate();
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

  // Notifications (Flow 4 first cut, PRD/signals_haptics_plan.md §7a): lets
  // this device (the lead's) receive an OS-level push when someone else in
  // the ride raises a signal or SOS, reaching it even backgrounded/locked
  // (Android) — distinct from useRideSignalListener's in-app toast in
  // AppLayout, which only fires while the app is open.
  const push = usePushNotifications(demo?.rideId ?? null, demo?.leaderId ?? null);
  async function handlePushToggle() {
    if (push.subscribed) await push.disable();
    else await push.enable();
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          {/* Explicit exit from the demo (the tab bar is the other way out) —
              lands on home, which reopens the tour if it's still unseen. */}
          <IconButton
            name="chevron-left"
            size={44}
            variant="surface"
            onClick={() => navigate("/home")}
            aria-label="Close demo ride"
          />
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
          {/* Per §10's "no silent degradation" principle: disabled rather
              than hidden when unsupported (a plain Safari tab never gets
              push regardless of permission), with the reason in the label
              rather than the button just not responding. */}
          <IconButton
            name="bell"
            size={44}
            variant={push.subscribed ? "accent" : "surface"}
            onClick={() => void handlePushToggle()}
            disabled={!push.supported || push.loading}
            aria-label={
              !push.supported
                ? "Notifications aren't supported in this browser"
                : push.subscribed
                  ? "Turn off notifications for this ride"
                  : "Turn on notifications for this ride"
            }
            aria-pressed={push.subscribed}
          />
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

      {(voiceMessage || micCaption || push.error) && (
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
              color: voiceMessage || push.error ? "var(--color-text-secondary)" : "var(--color-text-primary)",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-label)",
              textAlign: "right",
            }}
          >
            {voiceMessage ?? micCaption ?? push.error}
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
        <Button fullWidth={false} variant="secondary" style={MAP_OVERLAY_BUTTON} onClick={() => setDetailsOpen(true)}>
          <Icon name="users" size={20} />
          Details
        </Button>
        <Button fullWidth={false} variant="secondary" style={MAP_OVERLAY_BUTTON} onClick={() => setSignalOpen(true)}>
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
            senderId={demo.leaderId}
            voiceOn={voiceOn}
            onClose={() => setSignalOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>
      {children}
    </div>
  );
}
