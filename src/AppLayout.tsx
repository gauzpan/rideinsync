import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { SignInSheet } from "./components/SignInSheet";
import { AccountBar } from "./components/AccountBar";
import { TabBar } from "./components/ui/TabBar";
import { SosAlertCard } from "./components/SosAlertCard";
import { consumePendingJoinCode } from "./services/authService";
import { useActiveRide } from "./lib/activeRide";
import { markReached, respondToSos, sosCardState, useSosAlerts, useSosResponses } from "./lib/sos";
import { VoicePermissionSheet } from "./components/VoicePermissionSheet";
import { usePersistedToggle } from "./lib/preference";
import { useVoiceCommand, VOICE_COMMANDS_KEY } from "./lib/voiceCommands";
import {
  publishVoiceHeard,
  publishVoiceActivate,
  publishVoiceListening,
  publishVoiceError,
  publishVoiceCommandFired,
  useSignalModalOpen,
} from "./lib/voiceActivity";
import { SIGNAL_LABEL, SIGNAL_TIER, sendRideSignal, useRideSignalListener, type SignalKind } from "./lib/signals";
import { playSignalTone } from "./lib/earcon";
import { vibrateForTier } from "./lib/haptics";

const JOIN_PATH_RE = /^\/join\/([^/]+)$/;
const FEEDBACK_MS = 3_000;
const VOICE_ONBOARDING_KEY = "voice.onboarding.seen";

export function AppLayout() {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const resumedRef = useRef(false);

  const joinCodeFromPath = pathname.match(JOIN_PATH_RE)?.[1];

  // Resume a join interrupted by the Google OAuth redirect: the code was
  // stashed (see authService) before leaving the app, and is restored here
  // once auth resolves — the deep-link `/join/:code` route may not be where
  // the OAuth provider actually landed us.
  useEffect(() => {
    if (!isAuthenticated || resumedRef.current) return;
    resumedRef.current = true;
    const pendingCode = consumePendingJoinCode();
    if (pendingCode && pendingCode !== joinCodeFromPath) {
      navigate(`/join/${pendingCode}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // SOS wiring (Flow 5). The fork's placeholder useSession() is superseded by
  // this branch's real useAuth — we feed its user id to the SOS hooks directly.
  // `inApp` gates every subscription so nothing opens on the public landing.
  // Raising an SOS only happens via Signal on the Ride screen now; this stays
  // global so an alert already in progress is never missed on another tab.
  const userId = isAuthenticated ? user?.id ?? null : null;
  const inApp = isAuthenticated && pathname !== "/";
  const { rideId } = useActiveRide(inApp ? userId : null);
  const alerts = useSosAlerts(inApp ? rideId : null, userId);
  const responsesByAlert = useSosResponses(inApp ? rideId : null);

  // A card is shown until any responder reaches the rider; it returns only if the
  // rider taps Stay (stay_requested_at > that reach). No local hide state.
  const visibleAlerts = alerts
    .map((a) => ({ alert: a, ...sosCardState(a, responsesByAlert[a.id] ?? []) }))
    .filter((x) => x.visible);

  // In-app sound (§7d/§7e) for incoming SOS — Critical tier, 3 beeps. `alerts`
  // already excludes the current user's own (useSosAlerts filters self out),
  // so this only ever tones for someone *else's* SOS landing on this device.
  // Tracked by id, not just "alerts.length > 0", so it fires once per alert
  // rather than replaying every time this component re-renders.
  const tonedAlertIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of alerts) {
      if (!tonedAlertIds.current.has(a.id)) {
        tonedAlertIds.current.add(a.id);
        playSignalTone("critical");
        vibrateForTier("critical");
      }
    }
  }, [alerts]);

  function handleRespond(alertId: string) {
    if (!rideId || !userId) return;
    void respondToSos(alertId, rideId, userId).catch(() => {
      /* logged in respondToSos; unique-constraint clashes are expected */
    });
  }

  function handleReached(responseId: string) {
    void markReached(responseId).catch(() => {
      /* logged in markReached */
    });
  }

  // "Sync, ___" wake word + signal command (toggled on Profile). Runs
  // app-wide during an active ride so it works hands-free from any screen,
  // not just the Ride tab. The wake word alone (no signal name) "activates"
  // the app by bringing the live ride view to front.
  const [voiceOn] = usePersistedToggle(VOICE_COMMANDS_KEY, false);
  const [voiceOnboardingSeen, setVoiceOnboardingSeen] = usePersistedToggle(VOICE_ONBOARDING_KEY, false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const voiceFeedbackTimer = useRef<number | null>(null);

  // Two-stage feedback for commands: "Sync heard" fires the instant the wake
  // word is recognized, then gets replaced by the actual outcome once the
  // (async) signal send resolves — so there's never a silent gap between
  // saying "sync" and seeing *something* happen on screen.
  function showVoiceFeedback(message: string) {
    if (voiceFeedbackTimer.current != null) window.clearTimeout(voiceFeedbackTimer.current);
    setVoiceFeedback(message);
    voiceFeedbackTimer.current = window.setTimeout(() => setVoiceFeedback(null), FEEDBACK_MS);
  }

  function handleVoiceCommand(kind: SignalKind) {
    publishVoiceHeard();
    publishVoiceCommandFired();
    showVoiceFeedback("Sync heard");
    if (!rideId || !userId) return;
    if (kind === "sos") {
      navigate("/sos");
      return;
    }
    // Fired immediately rather than after the send resolves — a voice
    // command has no user gesture of its own to unlock the AudioContext, so
    // this only makes sound once VoicePermissionSheet's onboarding tap has
    // already primed it (see primeAudioContext), but firing it eagerly at
    // least avoids adding the network round-trip's delay on top of that.
    playSignalTone(SIGNAL_TIER[kind]);
    void sendRideSignal(rideId, userId, kind, `Voice-signalled ${kind}`).then(() => {
      showVoiceFeedback(`${SIGNAL_LABEL[kind]} signalled`);
    });
  }

  function handleVoiceActivate() {
    publishVoiceHeard();
    publishVoiceActivate();
    navigate("/ride/demo");
    showVoiceFeedback("Sync activated");
  }

  const signalModalOpen = useSignalModalOpen();

  // The receiving half of handleVoiceCommand/the Signal modal's sends: every
  // other member with the app open sees a toast when someone raises hazard/
  // regroup/pit-stop, the same way SOS alerts are global rather than scoped
  // to the Ride tab. The sender is excluded server-round-trip-side (see
  // useRideSignalListener) so they don't get a duplicate of their own toast.
  useRideSignalListener(inApp ? rideId : null, userId, (kind) => {
    playSignalTone(SIGNAL_TIER[kind]);
    vibrateForTier(SIGNAL_TIER[kind]);
    showVoiceFeedback(`${SIGNAL_LABEL[kind]} signalled`);
  });

  const voice = useVoiceCommand({
    enabled: inApp && Boolean(rideId) && voiceOn,
    onCommand: handleVoiceCommand,
    onActivate: handleVoiceActivate,
    bareCommandsEnabled: signalModalOpen,
  });

  useEffect(() => {
    publishVoiceListening(voice.listening);
  }, [voice.listening]);

  useEffect(
    () => () => {
      if (voiceFeedbackTimer.current != null) window.clearTimeout(voiceFeedbackTimer.current);
    },
    [],
  );

  useEffect(() => {
    publishVoiceError(voice.error);
  }, [voice.error]);

  if (loading) {
    // Brief, unstyled beat while the initial session check resolves — avoids
    // flashing the landing/login for an already-authenticated user.
    return null;
  }

  const onLanding = pathname === "/";

  // Landing ("/") is the public login entry. Signed-in users skip it and go
  // straight to the home screen.
  if (isAuthenticated && onLanding) {
    return <Navigate to="/home" replace />;
  }
  // A protected route without a session: keep the join deep-link's sign-in
  // sheet (it stashes the code across the Google redirect); everything else
  // bounces to the landing to log in.
  if (!isAuthenticated && !onLanding) {
    if (joinCodeFromPath) return <SignInSheet joinCode={joinCodeFromPath} />;
    return <Navigate to="/" replace />;
  }
  // One-time, right after sign-in: ask for mic access up front so it's already
  // granted by the time a rider wants hands-free voice commands mid-ride.
  // Gated to /home only — this used to intercept every route (including the
  // public/landing root), which showed the sheet before a rider had even
  // reached the app's home screen.
  if (isAuthenticated && pathname === "/home" && !voiceOnboardingSeen) {
    return <VoicePermissionSheet onDone={() => setVoiceOnboardingSeen(true)} />;
  }

  return (
    <>
      <div
        style={{
          maxWidth: 600,
          minHeight: "100%",
          margin: "0 auto",
          padding: "var(--space-lg) var(--gutter)",
          // Clear the fixed TabBar.
          paddingBottom: isAuthenticated
            ? "calc(var(--tabbar-height) + var(--space-2xl) + env(safe-area-inset-bottom))"
            : "calc(var(--space-2xl) + env(safe-area-inset-bottom))",
        }}
      >
        {isAuthenticated && <AccountBar />}
        <Outlet />
      </div>

      {inApp && visibleAlerts.length > 0 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            // Above the TabBar.
            bottom:
              "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-sm))",
            zIndex: 41,
            maxWidth: 600,
            margin: "0 auto",
            padding: "0 var(--gutter)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          {visibleAlerts.map(({ alert: a, still }) => (
            <SosAlertCard
              key={a.id}
              name={a.name}
              triggeredAt={a.triggeredAt}
              responders={responsesByAlert[a.id] ?? []}
              selfUserId={userId}
              still={still}
              onRespond={() => handleRespond(a.id)}
              onReached={handleReached}
            />
          ))}
        </div>
      )}

      {voiceFeedback && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-sm))",
            zIndex: 42,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              background: "var(--color-inverse-surface)",
              color: "var(--color-text-on-inverse)",
              padding: "8px 16px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-label)",
              fontWeight: "var(--weight-semibold)" as unknown as number,
            }}
          >
            {voiceFeedback}
          </span>
        </div>
      )}
      {isAuthenticated && <TabBar activeRideId={rideId} />}

      //bottom nav from rajat branch
    </>
  );
}
