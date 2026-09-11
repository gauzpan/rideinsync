import { Outlet } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { SignInSheet } from "./components/SignInSheet";
import { AccountBar } from "./components/AccountBar";

export function AppLayout() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    // Brief, unstyled beat while the initial session check resolves — avoids
    // flashing the sign-in sheet for an already-authenticated user.
    return null;
  }

  if (!isAuthenticated) {
    return <SignInSheet />;
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
      <AccountBar />
      <Outlet />
    </div>
  );
}
