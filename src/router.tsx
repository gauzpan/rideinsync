import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { RidesPage } from "./pages/RidesPage";
import { CreateRidePage } from "./pages/CreateRidePage";
import { RideInvitePage } from "./pages/RideInvitePage";
import { JoinRidePage } from "./pages/JoinRidePage";
import { RiderViewPage } from "./pages/RiderViewPage";
import { LeadViewPage } from "./pages/LeadViewPage";
import { RideSummaryPage } from "./pages/RideSummaryPage";
import { DemoControlsPage } from "./pages/DemoControlsPage";
import { RichProfilePage } from "./pages/RichProfilePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { PickDetailPage } from "./pages/PickDetailPage";
import { SosPage } from "./pages/SosPage";
import { RiderJoinPage } from "./pages/RiderJoinPage";

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
      // Base page for the Ride tab: active + past rides, empty state when
      // there's no active ride. Distinct from "ride/:rideId" below.
      { path: "ride", element: <RidesPage /> },
      // Create lives under Ride now — it's a sub-flow reached from a primary
      // button on Home or on the Ride page, not a standalone base route.
      { path: "ride/create", element: <CreateRidePage /> },
      // Legacy alias — earlier links pointed at /create.
      { path: "create", element: <Navigate to="/ride/create" replace /> },
      { path: "ride/:rideId/edit", element: <CreateRidePage /> },
      { path: "ride/:rideId/invite", element: <RideInvitePage /> },
      { path: "join", element: <JoinRidePage /> },
      { path: "join/:code", element: <JoinRidePage /> },
      { path: "ride/:rideId", element: <RiderViewPage /> },
      { path: "profile", element: <RichProfilePage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "discover/pick/:pickId", element: <PickDetailPage /> },
      { path: "ride/:rideId/lead", element: <LeadViewPage /> },
      { path: "ride/:rideId/summary", element: <RideSummaryPage /> },
      { path: "ride/demo", element: <DemoControlsPage /> },
      // Legacy alias — earlier links pointed at /demo.
      { path: "demo", element: <Navigate to="/ride/demo" replace /> },
      { path: "sos", element: <SosPage /> },
      { path: "r", element: <RiderJoinPage /> },
    ],
  },
]);
