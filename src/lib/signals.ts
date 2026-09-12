// Shared with the Signal modal (DemoControlsPage), the "sync" wake-word voice
// command hook (voiceCommands.ts), and the voice-onboarding sheet — one place
// that writes a signal event and defines its icon/color, so all three stay
// in sync.
import type { IconName } from "../components/ui/Icon";
import { supabase } from "./supabase";

export type SignalKind = "sos" | "hazard" | "regroup" | "pitstop";

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  sos: "SOS",
  hazard: "Hazard",
  regroup: "Regroup",
  pitstop: "Pit stop",
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
}
