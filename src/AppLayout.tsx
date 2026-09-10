import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Footer } from "./components/Footer";
import { SosAlertCard } from "./components/SosAlertCard";
import { HOME } from "./routes";
import { useSession } from "./lib/auth";
import { useActiveRide } from "./lib/activeRide";
import { markReached, respondToSos, sosCardState, useSosAlerts, useSosResponses } from "./lib/sos";
import { useVoiceTrigger } from "./lib/voiceTrigger";

const VOICE_KEY = "sos.voice";

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppLayout() {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const inApp = pathname !== "/";

  const { userId } = useSession();
  const { rideId } = useActiveRide(userId);

  // Subscribe only on in-app routes (null rideId means no channel is opened).
  const alerts = useSosAlerts(inApp ? rideId : null, userId);
  const responsesByAlert = useSosResponses(inApp ? rideId : null);

  // A card is shown until any responder reaches the rider; it returns only if the
  // rider taps Stay (stay_requested_at > that reach). No local hide state.
  const visibleAlerts = alerts
    .map((a) => ({ alert: a, ...sosCardState(a, responsesByAlert[a.id] ?? []) }))
    .filter((x) => x.visible);

  // Voice SOS preference (remembered), gated on an active ride + user toggle.
  const [voiceOn, setVoiceOn] = useState<boolean>(readVoicePref);
  function toggleVoice() {
    setVoiceOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(VOICE_KEY, next ? "1" : "0");
      } catch {
        /* private mode / disabled storage — preference is best-effort */
      }
      return next;
    });
  }

  const voice = useVoiceTrigger({
    enabled: inApp && Boolean(rideId) && voiceOn,
    onTrigger: () => {
      if (pathname !== "/sos") navigate("/sos", { state: { auto: true } });
    },
    onCancelWord: () => {
      // Only cancel an in-progress countdown; ignore once the SOS is sent.
      if (pathname === "/sos" && (location.state as { auto?: boolean } | null)?.auto === true) {
        navigate(HOME);
      }
    },
  });

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

  return (
    <>
      <div
        style={{
          maxWidth: 600,
          minHeight: "100%",
          margin: "0 auto",
          padding: "var(--space-lg) var(--gutter)",
          paddingBottom: inApp
            ? "calc(var(--space-2xl) + var(--footer-height, 96px) + env(safe-area-inset-bottom))"
            : "calc(var(--space-2xl) + env(safe-area-inset-bottom))",
        }}
      >
        <Outlet />
      </div>

      {inApp && (
        <>
          {visibleAlerts.length > 0 && (
            <div
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: "calc(var(--footer-height, 96px) + env(safe-area-inset-bottom) + var(--space-sm))",
                zIndex: 19,
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
          <Footer
            disabled={!rideId}
            showVoiceToggle={Boolean(rideId)}
            voiceOn={voiceOn}
            voiceSupported={voice.supported}
            voiceListening={voice.listening}
            voiceError={voice.error}
            onToggleVoice={toggleVoice}
          />
        </>
      )}
    </>
  );
}
