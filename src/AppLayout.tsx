import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { SignInSheet } from "./components/SignInSheet";
import { AccountBar } from "./components/AccountBar";
import { TabBar } from "./components/ui/TabBar";
import { SosAlertCard } from "./components/SosAlertCard";
import { consumePendingJoinCode } from "./services/authService";
import { useActiveRide } from "./lib/activeRide";
import { markReached, respondToSos, sosCardState, useSosAlerts, useSosResponses } from "./lib/sos";

const JOIN_PATH_RE = /^\/join\/([^/]+)$/;

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

      {isAuthenticated && <TabBar />}
    </>
  );
}
