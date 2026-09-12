// In-app notification sound — the third delivery channel from
// PRD/signals_haptics_plan.md §7d/§7e, distinct from push and haptics. The OS
// push notification itself can't carry a custom sound (no standardized API
// on either platform, confirmed in §7d) — a genuinely distinct tone is only
// possible via in-app audio while foregrounded. So this fires from the same
// places the in-app toast/alert card already do (useRideSignalListener, SOS
// alerts in AppLayout), not from the service worker's push handler.
//
// Synthesized with OscillatorNode rather than shipped audio files, per §7e's
// recommendation: no licensing, no asset pipeline, and it keeps the same
// tier logic driving both a signal's beep count and (eventually) its haptic
// pulse count in sync, rather than two independently-designed cues.
//
// Tier reuse, not a unique tone per signal (§2's tier-reuse rationale
// applies identically to tone as it does to haptics): Critical = 3 short
// beeps, High = 2, Medium = 1 soft beep, Low = none.
import type { SignalTier } from "./signals";

const TONE_FREQUENCY_HZ = 2_200; // mid-band of §7e's recommended 1.5–3.5kHz range
const BEEP_MS = 120;
const GAP_MS = 90;
const BEEP_COUNT: Record<SignalTier, number> = { critical: 3, high: 2, medium: 1, low: 0 };

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  sharedContext ??= new AudioContext();
  return sharedContext;
}

/**
 * Best-effort, fire-and-forget — a blocked/failed tone (autoplay policy, no
 * AudioContext support) never breaks the toast/alert it's attached to,
 * matching the "notify, don't block" pattern used throughout sos.ts.
 */
export function playSignalTone(tier: SignalTier): void {
  const count = BEEP_COUNT[tier];
  if (count === 0) return;
  const ctx = getContext();
  if (!ctx) return;

  void (async () => {
    try {
      // Same suspended-context gotcha as voiceCommands.ts's AudioContext —
      // this can fire with no fresh user gesture (a realtime event landing
      // while the tab is just sitting open), so resume explicitly rather
      // than assume "running".
      if (ctx.state === "suspended") await ctx.resume();
      if (ctx.state !== "running") return; // blocked by autoplay policy — silent no-op, not an error

      const now = ctx.currentTime;
      for (let i = 0; i < count; i++) {
        const start = now + i * ((BEEP_MS + GAP_MS) / 1000);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = TONE_FREQUENCY_HZ;
        // Quick fade in/out avoids a click at each beep's start/end.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + BEEP_MS / 1000);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + BEEP_MS / 1000);
      }
    } catch (err) {
      console.warn("[earcon] tone failed", err);
    }
  })();
}
