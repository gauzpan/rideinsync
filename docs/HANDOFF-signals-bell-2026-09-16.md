# Handoff — Signals card + notification bell (2026-09-16)

Branch: `shubham/signals-bell` (from upstream/main `26468a0`; spec at
`docs/superpowers/specs/2026-09-16-signals-bell-design.md`). Do NOT push / open a
PR / touch main without the founder's go-ahead.

## Summary

Implemented the four-commit plan in spec §11: a module-level notification-bell
pub/sub store; the ride view's Signals row merged into one combined card (own
SOS + incoming SOS stack + signal log, with a loader and bell-driven
auto-expand); the AccountBar bell + popover; and removal of the fixed SOS strip.

## Commits (in order)

1. `04d49a7` feat(bell): notification bell pub/sub store with pure helpers + tests
   - `src/lib/notificationBell.ts` (new): `publishBellEvent`, `publishBellRide`,
     `markBellSeen`, `useBellState`, pure `bellColorFor`, pure `popoverReducer`;
     dedupe by id; never throws on publish; unseen cleared on seen and on ride
     end (rideId→null). Test seams `_getBellState`/`_resetBell`.
   - `src/lib/notificationBell.test.ts` (new): 8 tests (colour priority, accumulate,
     dedupe, markSeen + no-relight, ride-end clear, no-throw, reducer transitions).

2. `8223bde` feat(signals): merge own SOS + incoming SOS + log into one ride-view card
   - `src/lib/signals.ts`: added pure `signalsCount(sosAlerts, signalLog)`.
   - `src/lib/signals.test.ts` (new): 1 test for `signalsCount`.
   - `src/components/liveops/LiveOps.tsx`: combined Signals card (own SOS via
     `OwnSosBar`→/sos, incoming `SosAlertStack`, then the log); `LoadingState`
     ("Loading signals") while the initial `ride_events` fetch is pending
     (`signalHistoryLoading`); `[signals] history loaded/failed` logging with a
     live-only log on error; auto-expand + `scrollIntoView` on navigation state
     `{ openSignals: true }`, cleared via `navigate(pathname,{replace,state:null})`;
     card renders when ride active OR anything to show; removed the standalone
     `<SosAlertStack>` above the map. (`window.location.origin` for the QR effect
     since react-router's `useLocation()` now shadows `location`.)

3. `cce01a2` feat(bell): AccountBar bell + popover; AppLayout publishes bell events
   - `src/components/AccountBar.tsx`: bell left of the account icon; colour =
     highest-urgency unseen (SOS `--color-danger` / hazard `--color-role-sweep` /
     regroup+pitstop `--color-accent` / none `--color-text-secondary`) + a filled
     dot for colour-blind users; aria-label "Notifications"/": new SOS"/": new
     signal"; tap → markBellSeen + close popover + navigate to active ride with
     `{openSignals:true}` else `/rides`. Popover (role=status, aria-live=polite):
     signal word in event colour + X IconButton; opens per event, auto-closes 5 s,
     restarts on a new event, timer guarded on unmount.
   - `src/AppLayout.tsx`: `publishBellEvent` on each new incoming SOS alert id and
     in the `useRideSignalListener` callback; `publishBellRide(rideId)` effect.

4. `7c0c688` refactor(sos): remove the fixed SOS strip and its now-dead wiring
   - `src/AppLayout.tsx`: removed the fixed container (OwnSosBar + SosAlertStack
     above the tab bar) and the now-dead `handleRespond/Reached/Resolve`,
     `useSosResponses`/`useOwnSosAlert`/`useMyRideRole`/`canResolve`/`onRideView`/
     `showOwnSosBar` wiring and their imports. `useSosAlerts` kept (drives the
     critical earcon/haptic and the bell).

## Verification

- `npm test`: tests 115, pass 113, fail 0, skipped 2 (the 2 skips are
  pre-existing, not from this work). New: 8 bell tests + 1 signalsCount test.
- `npx tsc --noEmit`: 0 errors.
- `npm run build` (`tsc -b && vite build`): success, exit 0 (PWA precache
  generated).

## Deviations from the spec (adapted + reported)

- `src/components/SosStrip.tsx` / `SosStrip.test.ts` named in the spec (§7 and the
  file list) DO NOT EXIST in this tree. The "fixed SOS strip" is the inline fixed
  container in `AppLayout.tsx`; that container was removed. Nothing to delete.
- `buildOwnSosStatusShort` (spec §3.1) does not exist; `buildOwnSosStatus` does.
  Per §3.1's "reuse `OwnSosBar` styling", the own-SOS line reuses the existing
  `OwnSosBar` component (which uses `buildOwnSosStatus`). No new helper added.
- Loader scope: the spec says "expanded content shows LoadingState" while history
  loads. Implemented as: own SOS bar + incoming SOS stack (both live and
  safety-critical) always render; only the signal-log section shows the loader.
  Rationale: an active SOS must never be hidden behind a spinner. The log is the
  only part that waits on the `ride_events` history fetch.

## Open items

- Browser proof: see below (being run by the orchestrator).
- Two-rider realtime cannot be exercised in single-instance demo mode
  (`VITE_DEMO_SESSION=1` = in-memory backend, one rider); incoming-from-other-rider
  events may need `publishBellEvent(...)` from the console to simulate.
- Dev server left running on port 5174 (`.env.local` demo mode) for the proof.
- Not pushed; no PR opened (per instructions).

## Browser proof

filled by orchestrator
