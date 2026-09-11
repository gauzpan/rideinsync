import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { SignInSheet } from "./components/SignInSheet";
import { AccountBar } from "./components/AccountBar";
import { consumePendingJoinCode } from "./services/authService";

const JOIN_PATH_RE = /^\/join\/([^/]+)$/;

export function AppLayout() {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const resumedRef = useRef(false);

  const joinCodeFromPath = location.pathname.match(JOIN_PATH_RE)?.[1];

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

  if (loading) {
    // Brief, unstyled beat while the initial session check resolves — avoids
    // flashing the landing/login for an already-authenticated user.
    return null;
  }

  const onLanding = location.pathname === "/";

  // Landing ("/") is the public login entry. Signed-in users skip it and go
  // straight to the app menu.
  if (isAuthenticated && onLanding) {
    return <Navigate to="/menu" replace />;
  }
  // A protected route without a session: keep the join deep-link's sign-in
  // sheet (it stashes the code across the Google redirect); everything else
  // bounces to the landing to log in.
  if (!isAuthenticated && !onLanding) {
    if (joinCodeFromPath) return <SignInSheet joinCode={joinCodeFromPath} />;
    return <Navigate to="/" replace />;
  }

  return (
    <div
      style={{
        maxWidth: 600,
        minHeight: "100%",
        margin: "0 auto",
        padding: "var(--space-lg) var(--gutter)",
        paddingBottom: "calc(var(--space-2xl) + env(safe-area-inset-bottom))",
      }}
    >
      {isAuthenticated && <AccountBar />}
      <Outlet />
    </div>
  );
}
