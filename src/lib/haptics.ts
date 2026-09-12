// Foreground haptic feedback — the `navigator.vibrate()` half of
// PRD/signals_haptics_plan.md §7b, distinct from the `showNotification()`
// vibrate option in sw.ts (which fires on a backgrounded/locked push
// instead). Per §2d's worked example: while the app is open and
// foregrounded, a signal/SOS landing over Supabase Realtime should still
// give an "optional local navigator.vibrate() call" alongside the in-app
// toast and earcon — this is that call.
//
// Android Chrome only (§3/§7b) — iOS Safari has never implemented the
// Vibration API. Feature-detected via `'vibrate' in navigator`, not
// UA-sniffing, per §10's recommendation: a no-op everywhere else, not an
// error, and it re-enables itself for free if a platform ever ships support.
import type { SignalTier } from "./signals";

// Same four tier patterns as sw.ts's push-vibrate option, per §2's
// tier-reuse rationale — one pulse language across both delivery paths.
const TIER_PATTERN: Record<SignalTier, number[]> = {
  critical: [400, 150, 400, 150, 400],
  high: [300, 100, 300],
  medium: [200],
  low: [],
};

export function vibrateForTier(tier: SignalTier): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const pattern = TIER_PATTERN[tier];
  if (pattern.length === 0) return;
  navigator.vibrate(pattern);
}
