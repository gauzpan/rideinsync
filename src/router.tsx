import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateRidePage } from "./pages/CreateRidePage";
import { JoinRidePage } from "./pages/JoinRidePage";
import { RiderViewPage } from "./pages/RiderViewPage";
import { LeadViewPage } from "./pages/LeadViewPage";
import { RideSummaryPage } from "./pages/RideSummaryPage";
import { DemoControlsPage } from "./pages/DemoControlsPage";

// Route shells only — no functionality yet. Pages map to the PRD's PWA structure.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "menu", element: <HomePage /> },
      { path: "create", element: <CreateRidePage /> },
      { path: "join", element: <JoinRidePage /> },
      { path: "ride/:rideId", element: <RiderViewPage /> },
      { path: "ride/:rideId/lead", element: <LeadViewPage /> },
      { path: "ride/:rideId/summary", element: <RideSummaryPage /> },
      { path: "demo", element: <DemoControlsPage /> },
    ],
  },
]);
