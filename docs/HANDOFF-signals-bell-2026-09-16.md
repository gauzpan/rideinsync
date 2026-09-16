# Handoff — Signals card + notification bell (2026-09-16)

Branch: `shubham/signals-bell-fox` (rebased onto the owner's integration branch
`upstream/fox-architecture` head `592492f`, which already contains PR #52 —
`SosStrip.tsx`, `buildOwnSosStatusShort`, the `useActiveRide` re-resolve, and the
fixed-container `AppLayout`). Spec at
`docs/superpowers/specs/2026-09-16-signals-bell-design.md`. Do NOT push / open a
PR / touch main without the founder's go-ahead.

The original `shubham/signals-bell` was built on `upstream/main 26468a0`, which
lacked all of the above; this branch is the fox-architecture-based re-do
(6 commits cherry-picked + 1 tsc fix).

## Summary

Implemented the four-commit plan in spec §11: a module-level notification-bell
pub/sub store; the ride view's Signals row merged into one combined card (own
SOS + incoming SOS stack + signal log, with a loader and bell-driven
auto-expand); the AccountBar bell + popover; and removal of the fixed SOS strip.
On the fox base the "fixed SOS strip" is the real `src/components/SosStrip.tsx`
component rendered by `AppLayout`, so this time it (and its test) were deleted.

## Commits (in order)

Base: `upstream/fox-architecture` `592492f`.

1. `1a2a1fc` docs: design spec for combined Signals card + notification bell
   - `docs/superpowers/specs/2026-09-16-signals-bell-design.md` (new).

2. `f644d60` feat(bell): notification bell pub/sub store with pure helpers + tests
   - `src/lib/notificationBell.ts` (new): `publishBellEvent`, `publishBellRide`,
     `markBellSeen`, `useBellState`, pure `bellColorFor`, pure `popoverReducer`;
     dedupe by id; never throws on publish; unseen cleared on seen and on ride
     end (rideId→null). Test seams `_getBellState`/`_resetBell`.
   - `src/lib/notificationBell.test.ts` (new): 8 tests.

3. `95a5556` feat(signals): merge own SOS + incoming SOS + log into one ride-view card
   - `src/lib/signals.ts`: added pure `signalsCount(sosAlerts, signalLog)`.
   - `src/lib/signals.test.ts` (new): 1 test for `signalsCount`.
   - `src/components/liveops/LiveOps.tsx`: combined Signals card (own SOS via
     `OwnSosBar`→/sos, incoming `SosAlertStack`, then the log); `LoadingState`
     while the initial `ride_events` fetch is pending; `[signals]` logging;
     auto-expand + `scrollIntoView` on navigation state `{ openSignals: true }`.
   - Conflict resolved here (import line): kept the incoming superset import from
     `../../lib/sos` — all symbols it names exist on the fox base — plus the
     `react-router-dom` `useLocation`/`useNavigate` import.

4. `7e6d5cc` feat(bell): AccountBar bell + popover; AppLayout publishes bell events
   - `src/components/AccountBar.tsx`: bell left of the account icon, colour by
     highest-urgency unseen + filled dot; tap → markBellSeen + navigate to the
     active ride with `{openSignals:true}` else `/rides`; 5 s auto-closing popover.
   - `src/AppLayout.tsx`: `publishBellEvent` on each new incoming SOS alert id and
     in `useRideSignalListener`; `publishBellRide(rideId)` effect. (Auto-merged.)

5. `fe1b8a8` refactor(sos): remove the fixed SOS strip and its now-dead wiring
   - `git rm src/components/SosStrip.tsx src/components/SosStrip.test.ts` — the
     real fixed strip on the fox base. Verified nothing else imports them or their
     helpers (`buildSosStripLabel`/`hasUnseenAlerts`/`truncateName` had no other
     consumer).
   - `src/AppLayout.tsx`: removed the fixed `<SosStrip>` container, its import, and
     the strip-only `sos` imports (`SosStrip`, `buildOwnSosStatusShort`,
     `canResolveSos`, `markReached`, `resolveSosAlert`, `respondToSos`,
     `useMyRideRole`, `useOwnSosAlert`, `useSosResponses`, `IncomingAlert`).
     Kept: `useSosAlerts` (drives the critical earcon/haptic and the bell),
     `SosButton`/`shouldShowSos`/`SOS_BUTTON_SIZE`/`SOS_BUTTON_FOOTPRINT`, and the
     floating-button footprint helper `contentBottomPadding(showSos)`.
   - `src/components/SosAlertStack.tsx`, `src/lib/sos.ts`: reworded stale
     doc-comments that named `SosStrip` (now the Signals card / AccountBar bell),
     so `grep -rn SosStrip src` is empty.

6. `8205fb3` docs: handoff (this file).

7. `1c5f870` fix(signals): drop unused `sendSos` import in `LiveOps.tsx` — the
   merged import carried it but the body never calls it; tripped tsc
   `noUnusedLocals`. Removed.

## Verification (this branch, fox base)

- `npm test`: tests 134, pass 134, fail 0, skipped 0.
- `npx tsc --noEmit`: 0 errors (exit 0).
- `npm run build` (`tsc -b && vite build`): success, exit 0 (PWA precache, 12
  entries / 905.01 KiB).
- `grep -rn SosStrip src`: empty.

## Deviations from the spec (adapted + reported)

- `alertContainerBottom(showSos)` in `AppLayout.tsx` — the pure helper that
  positioned the removed strip container — was KEPT (with its export), because
  `src/components/SosButton.test.ts` on the fox base still imports and tests it.
  Removing it would break a passing test; it is a harmless exported pure function.
  This is the one piece of "now-dead wiring" not deleted, and it is deliberate.
- Signals card own-SOS line (spec §3.1): `buildOwnSosStatusShort` exists on the
  fox base, but the card was left reusing the `OwnSosBar` component (→ /sos) as
  the signals commit built it. Switching to `buildOwnSosStatusShort` would rework
  a working, styled surface for no functional gain, so it was left as is.
- Loader scope: own SOS bar + incoming SOS stack always render; only the
  signal-log section shows the loader while the `ride_events` history fetch is
  pending, so an active SOS is never hidden behind a spinner.

## Open items

- Browser proof: see below (being run by the orchestrator).
- Two-rider realtime cannot be exercised in single-instance demo mode
  (`VITE_DEMO_SESSION=1` = in-memory backend, one rider); incoming-from-other-rider
  events may need `publishBellEvent(...)` from the console to simulate.
- Dev server left running on port 5174 (`.env.local` demo mode) for the proof.
- Not pushed; no PR opened (per instructions).

## Browser proof

filled by orchestrator
