# Handoff — SOS gating fix + visual design pass (work/ride-safety → main)

Date: 2026-09-13. Author: Shubham (founder, Flow 5 SOS owner) with Claude Code.
Base: upstream `main` at `7d6b366`. Branch: `sg61300:work/ride-safety`.
This document is written for the repo owner and for any agent asked to review, merge, or continue this work.

## 1. Summary

Two bugs and one design pass.

1. **SOS stayed disabled after a ride started.** The active-ride lookup ran once on mount and never refetched. Fixed with a realtime subscription plus refetch on navigation and tab focus.
2. **SOS hint never disappeared.** Superseded: per founder ruling the SOS button is now hidden entirely unless the rider is a member of a *started* ride, so there is no disabled state and no hint.
3. **Design pass (founder-approved):** "soft raised / key-cap" depth on buttons, cards and the back control; duotone footer icons. (A Home wallpaper and the Roadspur Display brand font were also added in this pass but **reverted 2026-09-13 by founder ruling** — see §3.4/§3.5.)

Also: demo mode made self-consistent, and audited so it can be removed without touching the real path.

## 2. Verification (run on 2026-09-13, Windows, Node 24)

| Command | Result |
|---|---|
| `npm test` | 36 tests, 36 pass, 0 fail (was 51 before the 2026-09-13 font/wallpaper revert removed 4 font + 11 wallpaper tests) |
| `npx tsc --noEmit` | clean |
| `npm run build` | `tsc -b && vite build` green, PWA precache 11 entries |
| `npx vite build --mode nodemo` (demo off) | green; demo seed strings and helpers absent from bundle |
| Non-demo production bundle, headless Chromium | `/`, `/create`, `/join`, `/discover`, `/sos`: 0 uncaught exceptions |
| Android 14 emulator (Pixel 7), Chrome | Home with ride, Home without ride, sign-in, Create, Discover, SOS screen — screenshots reviewed |

`npm test` is new in this PR: `scripts/test/run-unit-tests.mjs` bundles every `src/**/*.test.ts(x)` with esbuild (already a transitive dependency) and runs them under Node's built-in `node:test`. **No new dependencies were added.** `scripts/test/supabaseMock.ts` stands in for `./supabase`.

## 3. Changes by area

### 3.1 SOS gating (bug fix)

- `src/lib/activeRide.ts` — extracted `resolveActiveRideId(userId)` (unchanged two-query lookup) and `subscribeActiveRide(userId, onResolve)`: resolves once, subscribes to `postgres_changes` UPDATE on `rides` (table already in `supabase_realtime` publication via migration 0008; RLS scopes the stream), re-resolves on `visibilitychange`, returns a cleanup that removes the channel and listener. `useActiveRide(userId, refreshKey?)` re-subscribes when `refreshKey` changes; `AppLayout` passes `location.pathname` so joining/leaving a ride (a `ride_members` change, which is *not* in the publication) is picked up on navigation. Logs `[sos] active ride -> <id>` on each resolution. `DEMO_RIDE_ID` is now exported (used by demo helpers).
- `src/components/SosButton.tsx` (new) — floating corner SOS control, ported from `feature/gaurav-ending` and adapted. Exports `shouldShowSos(inApp, rideId, pathname)`: true only when signed in, `rideId` is set, and the route is not `/sos*`. No disabled state, no hint.
- `src/AppLayout.tsx` — renders `<SosButton>` behind `shouldShowSos`; `contentBottomPadding(showSos)` reserves 60 px + `--space-md` under page content when SOS is visible so nothing sits under the button (fixed an overlap with "Share this ride" on the summary page). Voice mic toggle on the floating button is off (`showVoiceToggle={false}`) because `main` drives voice through `VoicePermissionSheet` and the Profile toggle. **Owner decision:** wire a second voice entry point here, or leave it.
- `src/pages/SosPage.tsx` — the three `ghost` buttons (Stay / Back to home / Cancel) are now `secondary` so they read as buttons beside the raised danger button.

Tests: `src/lib/activeRide.test.ts` (8: resolve, realtime flip, ended→null, visibility, cleanup, late-resolve guard, refreshKey), `src/components/SosButton.test.ts` (6 predicate + 3 padding).

### 3.2 Depth ("soft raised", key-cap)

- `src/styles/global.css` — tokens `--shadow-raised`, `--shadow-raised-accent` (edge `#7FA800`), `--shadow-raised-danger` (edge `#9E1F17`), `--shadow-pressed`, `--grad-surface`, `--grad-accent`, `--grad-danger`, `--shadow-nav`; `.ui-raised` / `.ui-raised:active { transform: translateY(3px) }`. (A global `h1` brand-font rule was added here too but reverted 2026-09-13 — see §3.5.) Tokens live in the app stylesheet, **not** in `design/tokens/radius.css`, because that file belongs to the design team. Move them if you prefer.
- `src/components/ui/Button.tsx` — primary/secondary/danger raised; ghost unchanged; disabled flat. Text on primary: 12.5:1 at the darkest stop.
- `src/components/ui/Card.tsx` — gradient, 1 px border, brighter top edge, raised shadow; glow variant keeps its glow.
- `src/components/ui/BackLink.tsx` (new) — shared raised pill with chevron; replaced 9 inline `‹ Home`-style links across `CreateRidePage`, `JoinRidePage`, `LeadViewPage`, `RideInvitePage`, `RiderViewPage`.

Tests: `src/styles/tokens.test.ts`, `src/components/ui/BackLink.test.ts`.

### 3.3 Footer

- `src/components/ui/Icon.tsx` — optional `fill` prop and pure `iconLayers(name, {fill})` seam: emits a fill layer under the stroke layer (duotone). Default output unchanged for all other consumers.
- `src/components/BottomNav.tsx` / `.css` — active tab: lime fill 18 % + glow + existing pill; inactive: white fill 8 %; nav bar `--shadow-nav`. (A brand-font label style was added here too but reverted 2026-09-13 — see §3.5; labels are back to the caption token.)

Test: `src/components/BottomNav.test.ts`.

### 3.4 Wallpaper — REVERTED

**Reverted 2026-09-13 by founder ruling: the Home wallpaper was removed from all screens.** Deleted `src/components/HomeWallpaper.tsx`, `HomeWallpaper.test.ts`, and `public/wallpaper/`; removed the `<HomeWallpaper>` renders and the `position: relative; z-index: 1` content wrapper from `src/AppLayout.tsx`; removed the `.home-wallpaper__img` rule from `src/styles/global.css`; and restored `SignInSheet.tsx`'s root `background: var(--color-bg-base)`. See the revert commit on `work/ride-safety`.

### 3.5 Brand font — REVERTED

**Reverted 2026-09-13 by founder ruling: Roadspur was removed entirely and Poppins (brand, from Google Fonts) / Inter (UI) restored.** Deleted `public/fonts/` and `src/styles/fonts.test.ts`; restored `design/tokens/fonts.css` and `--font-brand:"Poppins","Quicksand",sans-serif;` (removing `--font-brand-tracking`); removed the global `h1` brand-font rule from `global.css`, the brand font/size overrides on the ride-name elements in `HomePage.tsx`/`LandingPage.tsx`, and the brand font styling on `.bottom-nav__label`. See the revert commit on `work/ride-safety`.

### 3.6 Demo mode (dev only) — made consistent and audited

Demo mode (`VITE_DEMO_SESSION=1`, no Supabase keys) previously faked an active ride for SOS but left Home on "Loading your rides…", which read as "SOS visible with no ride".

- `src/hooks/useHomeData.tsx` — `demoHomeData()` returns the seed ride (`00000000-0000-0000-0000-0000000000b1`, "Nandi Hills Sunrise Run", `DEMO01`, leader, 4 members — values from `supabase/seed.sql`).
- `src/services/onboardingService.ts` — `getMyRides()` returns `demoMyRides()` in demo mode, reusing the same seam.

**Audit (`src/lib/demoMode.test.ts`):** exactly 5 guards in `src`, all `import.meta.env.VITE_DEMO_SESSION === "1"` (`sosDemo.ts` additionally requires `!supabaseConfigured`). A `--mode nodemo` build tree-shakes every demo branch: `0000000000b1`, `Nandi Hills Sunrise Run`, `demoHomeData`, `demoMyRides` do not appear in the bundle. The one `DEMO01` hit is the Join page placeholder text.

**Removing demo mode:** unset `VITE_DEMO_SESSION` (or delete `.env.local`); set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. To delete the code: guards in `src/lib/auth.ts`, `src/lib/activeRide.ts`, `src/hooks/useHomeData.tsx`, `src/services/onboardingService.ts`, the `isDemoBackend` branches in `src/lib/sos.ts`, and the whole `src/lib/sosDemo.ts`; delete `useHomeData.test.ts`, `onboardingService.test.ts`, `demoMode.test.ts`. Keep `activeRide.test.ts` (real path).

**Operator note:** a plain `vite build` on a machine whose `.env.local` sets `VITE_DEMO_SESSION=1` ships a demo bundle. CI/owner builds have no `.env.local`. Consider `.env.production.local` with `VITE_DEMO_SESSION=0`.

## 4. Founder rulings recorded

- SOS visible **only** to a member of a started (`status = active`) ride. Not for draft rides, not for non-members, never on `/sos`.
- Depth style: soft raised → strengthened to key-cap after device review. Not glossy, not neumorphic.
- Footer icons: option A duotone outline.
- Wallpaper: **reverted 2026-09-13** — removed from all screens (see §3.4).
- Brand font: **reverted 2026-09-13** — Roadspur removed; Poppins (brand) / Inter (UI) restored (see §3.5).

## 5. Open items for the owner

1. Voice mic toggle on the floating SOS button (see 3.1).
2. Tokens location: app stylesheet vs `design/tokens/*` (see 3.2).
3. Pre-existing, not changed: `--color-text-tertiary` 3.76:1; white on danger red 3.55:1 (large text only); `/ride/<id>/lead` hangs in demo mode (Supabase absent); Send SOS shows no countdown in demo mode.
4. Live query paths of `useHomeData` and `getMyRides` have no direct unit test (only their demo seams). Recommend mock-backed tests before deleting demo mode.
5. Design system doc says depth comes from glows, not shadows. This PR departs from that on founder request; shadows are kept dark-on-dark.

## 6. Running locally

```
npm install
# real backend: set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local
# demo (no backend): VITE_DEMO_SESSION=1 in .env.local  (env on the command line is not picked up)
npm run dev
npm test
```

Dev-only sign-in bypass: `localStorage.setItem('rideinsync:devAuth','1')` in a dev build (compiled out of production).
