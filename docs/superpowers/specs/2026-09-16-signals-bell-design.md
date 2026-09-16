# Signals card + notification bell — design spec

Date: 2026-09-16. Roles: Senior Designer + CTO. Branch `shubham/signals-bell` from upstream/main `26468a0`.
Founder decisions (2026-09-16): the ride view's existing Signals row is the one combined card; the fixed SOS strip is removed everywhere and the bell is the global entry point; colours SOS red, Hazard yellow, Regroup + Pit stop green.

## 1. Problem

SOS alerts and hazard/regroup/pit-stop signals are shown in three separate places: a fixed SOS strip above the tab bar (`SosStrip` in `AppLayout.tsx`), an embedded `SosAlertStack` in the ride view (`LiveOps.tsx`), and a "Signals (N)" row in the ride view. A rider off the ride view has no persistent indicator that a signal arrived once the toast is gone.

## 2. Scope

In:
1. One combined **Signals card** in the ride view holding own SOS status, incoming SOS alert cards, and the signal log, with a loader while history loads.
2. A **bell** in the top bar (`AccountBar`) on every signed-in screen that shows unseen-signal colour and opens the Signals card.
3. A **popover** under the bell on incoming SOS/signal: signal word + X, auto-close 5 s.
4. Removal of the fixed `SosStrip` container in `AppLayout` and the embedded `SosAlertStack` in `LiveOps`.

Out (unchanged): SOS raise flow, `/sos` page, `OwnSosBar` on `/sos`, voice commands ("sync SOS" → `/sos` countdown), push notifications, earcons, database, edge functions, RLS.

## 3. Signals card (ride view, `LiveOps.tsx`)

- Location: where the "Signals (N)" `Card` renders today. Rendered whenever the ride is active **or** there is anything to show (SOS alerts, own alert, or signal events). Hidden when nothing to show and ride not active.
- Header row unchanged in style: signal icon, "Signals", count in secondary colour, chevron. `aria-expanded`. Count = open incoming SOS alerts + signal log length.
- Expanded content order:
  1. Own open SOS status line (only if the viewer has an unresolved alert): text from `buildOwnSosStatusShort`, tap → `/sos`. Reuse `OwnSosBar` styling or a one-line variant of it.
  2. Incoming SOS alert cards: the existing `SosAlertStack` with Respond / Reached / Resolve wiring exactly as `LiveOps` has today (`sosAlerts`, `sosResponsesByAlert`, `canResolve`).
  3. Signal log rows as today (icon disc, "Who · Kind", relative time).
- Loading: while the initial `ride_events` history fetch is pending, expanded content shows `LoadingState` from `ui/Loader.tsx` with label "Loading signals". Track with a `signalHistoryLoading` boolean set true before the fetch and false in `finally`. Collapsed header still renders during loading (count from live data only).
- Auto-expand: when the route location state has `{ openSignals: true }`, set `signalsExpanded = true` on mount and `scrollIntoView({ block: "start", behavior: "smooth" })` on the card. Clear the flag with `navigate(pathname, { replace: true, state: null })` so a reload does not re-trigger.
- Remove: the standalone `<SosAlertStack>` render in `LiveOps` (line ~691) and the "Signals" row's `signalLog.length > 0` gate (replaced by the rule above).

## 4. Bell (`AccountBar.tsx`)

- Placement: in the right-hand group, immediately left of the account icon, after the mic-listening dot. Same 28–32 px hit area as the account icon (min 44 px tap target via padding). Icon `bell` from `ui/Icon.tsx`.
- Colour = highest-urgency **unseen** event: SOS → `var(--color-danger)`; hazard → `var(--color-role-sweep)` (yellow); regroup / pitstop → `var(--color-accent)` (green); none → `var(--color-text-secondary)`. Small filled dot on the bell when any unseen, for colour-blind users.
- `aria-label`: "Notifications" / "Notifications: new SOS" / "Notifications: new signal".
- Tap: mark all unseen as seen (colour resets), close popover, then navigate:
  - active ride → `/ride/:rideId` with `state: { openSignals: true }`;
  - no active ride → `/rides`.
  Ride id comes from the bell store (published by `AppLayout`, which already resolves `rideId`).
- Hidden while `!isAuthenticated` (AccountBar already only renders then).

## 5. Popover

- Anchored to the bell: absolutely positioned below the bell, right edge aligned with the bell, `role="status"`, `aria-live="polite"`, z-index above content. Width fits content, max 200 px. Card surface, shadow, small arrow optional.
- Content: signal word (`SIGNAL_LABEL[kind]`: SOS, Hazard, Regroup, Pit stop) in the event colour, plus an X `IconButton` (`aria-label="Dismiss"`).
- Lifetime: opens on each incoming event; closes after 5 000 ms or on X. A new event replaces the text and restarts the timer. Timer cleared on unmount.
- Triggers only for events from **other** riders: incoming SOS alerts (AppLayout already filters self via `useSosAlerts`) and `useRideSignalListener` callbacks (already skips self).
- Vibration: none added here. `AppLayout` already calls `vibrateForTier` for both paths.

## 6. Bell store (`src/lib/notificationBell.ts`)

Module-level pub/sub, same pattern as `voiceActivity.ts`:

```ts
export type BellEvent = { id: string; kind: SignalKind; at: number };
export function publishBellEvent(e: BellEvent): void;      // AppLayout → store
export function publishBellRide(rideId: string | null): void;
export function markBellSeen(): void;
export function useBellState(): { unseen: BellEvent[]; latest: BellEvent | null; rideId: string | null };
// pure, unit-tested:
export function bellColorFor(unseen: { kind: SignalKind }[]): "danger" | "warn" | "ok" | "none";
export function popoverReducer(state, action: { type: "event"; e: BellEvent } | { type: "dismiss" } | { type: "timeout" }): PopoverState;
```

- `AppLayout` publishes: on each new incoming SOS alert id (where it plays the critical earcon today, ~line 151) `publishBellEvent({ id: alert.id, kind: "sos", ... })`; inside the `useRideSignalListener` callback (~line 259) `publishBellEvent({ id: crypto.randomUUID(), kind, ... })`; `publishBellRide(rideId)` in an effect on `rideId`.
- Dedupe by `id` so a re-fetch does not relight the bell.
- Unseen list is cleared on `markBellSeen()` and when `rideId` changes to null (ride ended).

## 7. Removals in `AppLayout.tsx`

- Remove the fixed container at ~line 358–404 and the `SosStrip` import. Delete `SosStrip.tsx` and `SosStrip.test.ts` only if nothing else imports them (grep first); otherwise leave and report.
- `alertContainerBottom` / `showOwnSosBar` remain only where still referenced (floating SOS button footprint logic stays). Remove dead code that results, nothing else.
- `handleRespond`, `handleReached`, `handleResolve` remain if still used by `/sos`; otherwise remove.

## 8. Error handling

- History fetch error: log `[signals] history fetch failed` with the error, set loading false, show the live-only log (no error UI).
- Bell store must never throw on publish before any subscriber mounts.
- Popover timer guarded against unmount.

## 9. Tests (node:test via `npm test`)

- `notificationBell.test.ts`: `bellColorFor` priority (sos > hazard > regroup/pitstop > none), dedupe by id, `markBellSeen` clears, `popoverReducer` event/dismiss/timeout transitions and timer restart on new event.
- `LiveOps` pure helper: `signalsCount(sosAlerts, signalLog)` and expanded-order helper if extracted.
- Existing tests: `SosStrip.test.ts` removed with the component; all others must still pass. `tsc --noEmit` 0 errors, `npm run build` ok.
- Browser proof (lane, two demo riders on 5174 + 5175): (a) rider B raises hazard → rider A on Home sees yellow bell + "Hazard" popover, auto-closes at 5 s; X closes early; tap bell → ride view opens with Signals card expanded, hazard row visible, bell grey. (b) rider B raises SOS → rider A on Groups sees red bell + "SOS" popover; card shows SOS alert card with Respond. (c) loader visible on slow network (DevTools throttling) when expanding. (d) no fixed strip anywhere; `/sos` still works; floating SOS button still tappable on ride view.

## 10. Logging

`[bell] event <kind> <id>`, `[bell] seen`, `[signals] history loaded <n>`, `[signals] history fetch failed`.

## 11. Delivery

Small commits in this order: (1) bell store + tests; (2) Signals card merge + loader + auto-expand, remove embedded stack; (3) bell + popover in AccountBar, AppLayout publishes; (4) remove SosStrip container and dead code. Handoff `docs/HANDOFF-signals-bell-2026-09-16.md`. PR to `gauzpan/rideinsync` base `main`, owner merges; ask the founder before pushing.
