import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { acquireRideChannel, type PgChangePayload } from "../lib/rideChannel";

/**
 * Subscribes to Supabase Realtime UPDATE events on the `rides` table for `rideId`.
 * When a status update transitions to "ended", navigates to `/ride/:rideId/summary`.
 * Redundant navigation is prevented:
 * - Won't fire if already on the summary route.
 * - Only fires on transition to "ended".
 * - Listener is detached (and the shared channel released) on unmount.
 *
 * M3 channel consolidation: this used to open its own `ride-end:<id>`
 * channel. It now attaches to the same shared `ride-<id>` channel
 * useRideChannel owns (src/lib/rideChannel.ts) as another `rides` listener
 * alongside useRideChannel's own — both simply get called. External contract
 * (just `rideId` in, side-effecting navigate out) is unchanged.
 */
export function useNavigateOnRideEnd(rideId: string | undefined): void {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!rideId) return;

    hasNavigatedRef.current = false;

    const handle = acquireRideChannel(rideId);
    const onRidesChange = (payload: PgChangePayload) => {
      const newStatus = (payload.new as { status?: string } | undefined)?.status;
      const oldStatus = (payload.old as { status?: string } | undefined)?.status;

      // Only fire on transition to ended
      if (newStatus === "ended" && oldStatus !== "ended") {
        if (hasNavigatedRef.current) return;
        const currentPath = locationRef.current;
        const summaryPath = `/ride/${rideId}/summary`;
        if (currentPath === summaryPath || currentPath.endsWith("/summary")) {
          return;
        }

        hasNavigatedRef.current = true;
        navigate(summaryPath, { replace: true });
      }
    };
    handle.listeners.rides.add(onRidesChange);

    return () => {
      handle.listeners.rides.delete(onRidesChange);
      handle.release();
    };
  }, [rideId, navigate]);
}
