import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Subscribes to Supabase Realtime UPDATE events on the `rides` table for `rideId`.
 * When a status update transitions to "ended", navigates to `/ride/:rideId/summary`.
 * Redundant navigation is prevented:
 * - Won't fire if already on the summary route.
 * - Only fires on transition to "ended".
 * - Channel is unsubscribed and removed on unmount.
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

    const channel = supabase
      .channel(`ride-end:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rides",
          filter: `id=eq.${rideId}`,
        },
        (payload) => {
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
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rideId, navigate]);
}
