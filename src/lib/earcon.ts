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
// tier logic driving both a signal's tone and (eventually) its haptic pulse
// pattern in sync, rather than two independently-designed cues.
//
// Each tier is a short melodic phrase (not just N identical beeps) so
// tiers are recognizable by ear, not just by "how many": Critical alternates
// two close, urgent pitches like a siren; High is a two-note descending
// "attention" chime; Medium a gentle two-note rising "ding"; Low a single
// soft, quiet tick — present (unlike a genuinely silent no-op) but
// deliberately unobtrusive, matching its own urgency tier rather than being
// dropped from the audio channel entirely.
import type { SignalTier } from "./signals";

type Note = { freq: number; start: number; dur: number; gain: number };

const DEFAULT_GAIN = 0.22;
const LOW_GAIN = 0.12; // quieter — Low tier should read as a confirmation, not an alert

// All within §7e's recommended ~1.5–3.5kHz band (cuts through engine/wind
// noise, where human hearing peaks in sensitivity).
const TIER_NOTES: Record<SignalTier, Note[]> = {
  critical: [
    { freq: 1800, start: 0, dur: 0.13, gain: DEFAULT_GAIN },
    { freq: 2200, start: 0.15, dur: 0.13, gain: DEFAULT_GAIN },
    { freq: 1800, start: 0.3, dur: 0.13, gain: DEFAULT_GAIN },
    { freq: 2200, start: 0.45, dur: 0.13, gain: DEFAULT_GAIN },
    { freq: 1800, start: 0.6, dur: 0.16, gain: DEFAULT_GAIN },
  ],
  high: [
    { freq: 1760, start: 0, dur: 0.12, gain: DEFAULT_GAIN },
    { freq: 1320, start: 0.13, dur: 0.18, gain: DEFAULT_GAIN },
    { freq: 1760, start: 0.34, dur: 0.12, gain: DEFAULT_GAIN },
    { freq: 1320, start: 0.47, dur: 0.18, gain: DEFAULT_GAIN },
  ],
  medium: [
    { freq: 1200, start: 0, dur: 0.11, gain: DEFAULT_GAIN },
    { freq: 1600, start: 0.12, dur: 0.18, gain: DEFAULT_GAIN },
  ],
  low: [{ freq: 1500, start: 0, dur: 0.1, gain: LOW_GAIN }],
};

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  sharedContext ??= new AudioContext();
  return sharedContext;
}

/**
 * Unlocks the shared AudioContext from within a guaranteed user gesture.
 * Call this synchronously inside a click handler that every rider actually
 * taps early in the session (VoicePermissionSheet's onboarding buttons) —
 * without it, the *first* tone ever played can lose the race against its
 * own async network round-trip (see playSignalTone's call sites) and the
 * context never leaves "suspended". Once genuinely running, it stays that
 * way for the rest of the session, so later tones — including ones fired
 * from non-gesture contexts like a voice command result — work fine.
 */
export function primeAudioContext(): void {
  const ctx = getContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/**
 * One note: a sine fundamental plus a quieter octave overtone (a plain
 * single sine reads as a flat "beep"; adding a soft overtone gives it a
 * touch of bell-like timbre), shaped with a fast attack and an exponential
 * decay tail instead of the linear ramp a flat beep uses — the exponential
 * decay is what makes a synthesized tone read as a "ding" rather than a
 * buzzer cutting off.
 */
function scheduleNote(ctx: AudioContext, note: Note): void {
  const { freq, start, dur, gain: peakGain } = note;
  const t0 = ctx.currentTime + start;
  const attack = 0.006;
  const stop = t0 + dur + 0.03; // let the decay tail finish before disconnecting

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  gain.connect(ctx.destination);

  const fundamental = ctx.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.value = freq;
  fundamental.connect(gain);
  fundamental.start(t0);
  fundamental.stop(stop);

  const overtoneGain = ctx.createGain();
  overtoneGain.gain.value = 0.28;
  overtoneGain.connect(gain);
  const overtone = ctx.createOscillator();
  overtone.type = "sine";
  overtone.frequency.value = freq * 2;
  overtone.connect(overtoneGain);
  overtone.start(t0);
  overtone.stop(stop);
}

/**
 * Best-effort, fire-and-forget — a blocked/failed tone (autoplay policy, no
 * AudioContext support) never breaks the toast/alert it's attached to,
 * matching the "notify, don't block" pattern used throughout sos.ts.
 */
export function playSignalTone(tier: SignalTier): void {
  const notes = TIER_NOTES[tier];
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

      for (const note of notes) scheduleNote(ctx, note);
    } catch (err) {
      console.warn("[earcon] tone failed", err);
    }
  })();
}
