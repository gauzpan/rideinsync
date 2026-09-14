// Shared with the Signal modal (DemoControlsPage), the "sync" wake-word voice
// command hook (voiceCommands.ts), and the voice-onboarding sheet — one place
// that writes a signal event and defines its icon/color, so all three stay
// in sync.
import { useEffect, useRef } from "react";
import type { IconName } from "../components/ui/Icon";
import { supabase } from "./supabase";
import { acquireRideChannel, type PgChangePayload } from "./rideChannel";
import { triggerPushNotify } from "./pushNotifications";

export type SignalKind = "sos" | "hazard" | "regroup" | "pitstop";

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  sos: "SOS",
  hazard: "Hazard",
  regroup: "Regroup",
  pitstop: "Pit stop",
};

/** Urgency tier per PRD/signals_haptics_plan.md §2's taxonomy — drives both
 *  the in-app earcon (earcon.ts) and, eventually, haptic pulse count, per
 *  §7e's "same tier logic drives both channels" rationale. */
export type SignalTier = "critical" | "high" | "medium" | "low";
export const SIGNAL_TIER: Record<SignalKind, SignalTier> = {
  sos: "critical",
  hazard: "high",
  regroup: "medium",
  pitstop: "low",
};

/** Display order + icon/color for the four signal types (no emoji per the
 *  design system — iconography carries all glyph meaning). */
export const SIGNAL_TYPES: { kind: SignalKind; icon: IconName; color: string }[] = [
  { kind: "sos", icon: "signal", color: "var(--color-danger)" },
  { kind: "hazard", icon: "hazard", color: "var(--color-role-sweep)" },
  { kind: "regroup", icon: "users", color: "var(--color-accent)" },
  { kind: "pitstop", icon: "flag", color: "var(--color-role-member)" },
];

/**
 * Inserts a non-SOS ride signal event. SOS never goes through here — it routes
 * through the full /sos confirm + location-tracking flow (see SosPage), the
 * only place an SOS can be raised.
 */
export async function sendRideSignal(
  rideId: string,
  userId: string,
  kind: Exclude<SignalKind, "sos">,
  note: string,
): Promise<void> {
  await supabase.from("ride_events").insert({
    ride_id: rideId,
    user_id: userId,
    type: kind,
    payload: { note },
  });
  // Best-effort OS-level push to everyone else in the ride (see
  // pushNotifications.ts) — on top of the in-app realtime toast from
  // useRideSignalListener below, which only fires while the app is open.
  triggerPushNotify(rideId, userId, kind);
}

const NON_SOS_KINDS: Exclude<SignalKind, "sos">[] = ["hazard", "regroup", "pitstop"];

/**
 * Notifies every other member of a ride when someone sends a hazard/regroup/
 * pit-stop signal — the receiving half of sendRideSignal above. Mount once
 * globally (AppLayout) the same way SOS alerts are: gated on being in-app
 * with an active ride, so it fires from any screen, not just the Ride tab.
 * The sender's own insert is skipped (they already get local feedback at the
 * call site) to avoid a duplicate toast.
 *
 * M3 channel consolidation: this used to open its own `ride:<id>:signals:*`
 * channel. It now attaches to the same shared `ride-<id>` channel
 * useRideChannel owns (src/lib/rideChannel.ts) as another `ride_events`
 * listener alongside useRideChannel's own (which just accumulates the raw
 * event list — this one filters to non-SOS kinds and fires a callback).
 * External contract (params in, callback out) is unchanged.
 */
export function useRideSignalListener(
  rideId: string | null,
  selfUserId: string | null,
  onSignal: (kind: Exclude<SignalKind, "sos">) => void,
): void {
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    if (!rideId) return;

    const handle = acquireRideChannel(rideId);
    const onRideEventsInsert = (payload: PgChangePayload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as { user_id: string; type: string };
      if (row.user_id === selfUserId) return;
      if ((NON_SOS_KINDS as string[]).includes(row.type)) {
        onSignalRef.current(row.type as Exclude<SignalKind, "sos">);
      }
    };
    handle.listeners.rideEvents.add(onRideEventsInsert);

    return () => {
      handle.listeners.rideEvents.delete(onRideEventsInsert);
      handle.release();
    };
  }, [rideId, selfUserId]);
}
