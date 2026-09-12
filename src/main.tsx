import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { router } from "./router";
import { AuthProvider } from "./hooks/useAuth";
import { completeOAuthFromUrl } from "./services/authService";
import "./styles/global.css";

// Native: finish Google OAuth when the system browser deep-links back into the app.
if (Capacitor.isNativePlatform()) {
  void import("@capacitor/app").then(({ App }) => {
    App.addListener("appUrlOpen", ({ url }) => {
      if (url.includes("code=")) void completeOAuthFromUrl(url);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
