import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateRidePage } from "./pages/CreateRidePage";
import { RideInvitePage } from "./pages/RideInvitePage";
import { JoinRidePage } from "./pages/JoinRidePage";
import { RiderViewPage } from "./pages/RiderViewPage";
import { LeadViewPage } from "./pages/LeadViewPage";
import { RideSummaryPage } from "./pages/RideSummaryPage";
import { DemoControlsPage } from "./pages/DemoControlsPage";
import { RichProfilePage } from "./pages/RichProfilePage";

// Route shells only — no functionality yet. Pages map to the PRD's PWA structure.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "home", element: <HomePage /> },
      // Legacy alias — earlier links pointed at /menu.
      { path: "menu", element: <Navigate to="/home" replace /> },
      { path: "create", element: <CreateRidePage /> },
      { path: "ride/:rideId/invite", element: <RideInvitePage /> },
      { path: "join", element: <JoinRidePage /> },
      { path: "join/:code", element: <JoinRidePage /> },
      { path: "ride/:rideId", element: <RiderViewPage /> },
      { path: "profile", element: <RichProfilePage /> },
      { path: "ride/:rideId/lead", element: <LeadViewPage /> },
      { path: "ride/:rideId/summary", element: <RideSummaryPage /> },
      { path: "demo", element: <DemoControlsPage /> },
    ],
  },
]);
