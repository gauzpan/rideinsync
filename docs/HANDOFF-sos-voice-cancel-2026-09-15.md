# Handoff — Voice command fixes, SOS raiser feedback, rider cancel-SOS (shubham/sos-voice-cancel → main)

Date: 2026-09-15. Author: Shubham (founder, Flow 5 SOS owner) with Claude Code.
Base: upstream `main` at `6a5238a` (after the owner merged PR #31 on 2026-09-14 and PRs #33–#40).
Branch: `sg61300:shubham/sos-voice-cancel` — exactly three commits cherry-picked from `shubham/sos-emmergency-contact` and re-based on the new main.
PR: https://github.com/gauzpan/rideinsync/pull/43

This document is written for the repo owner and for any engineer or agent asked to review, merge, or continue this work.

Context: PR #31 (already merged) added the emergency-contact email on SOS (migration 0030, `send-sos-email` edge function over Gmail SMTP) and the diagnosis tests for members missing SOS alerts. This PR builds directly on it.

## 1. Summary

Three items, one per commit.

1. **Voice commands did not work at all on the production PWA.** Two defects, both proven with the app's own `[voice]` console logs on rideinsync.vercel.app on 2026-09-14:
   - (A) The ScriptProcessorNode was connected from the mic source but never to `audioContext.destination`. Chromium does not run such a node, so `onaudioprocess` fired 0 times in 5 s and the recogniser got no audio — "recognition started" was logged with no error.
   - (B) The result handler compared the whole Vosk utterance against the wake word *or* one command word, so a rider saying "sync hazard" as one phrase got `detected "sync hazard" -> not recognized`; it only worked with a 0.5–1.5 s pause between the words.
   - Fixed in commit "fix(voice): connect ScriptProcessor to destination; parse whole utterance; APK mic permission". After the fix, on a dev build: `heard: "sync hazard"` -> `detected "sync hazard" -> Hazard triggered`, twice, no watchdog warning.
2. **SOS raiser had no feedback** (commit "fix(sos): compact card wraps on phones; notify the SOS raiser when help responds"):
   - (a) The compact SOS bar on ~360 px phones squeezed the title to one word per line (founder screenshot). Style-only fix: `flexWrap` + text block `flex: "1 1 12rem"`.
   - (b) The rider who raised the SOS got nothing when a member tapped "I'm on my way" or "I've reached them": the floating card excludes their own alert, the SOS page only listed a text line while open, no tone, and the push system had no response kind. Now: High-tier tone + haptic on the SOS page on each new responder / reached transition; a "Help is coming" bar on every in-app screen (except /sos) linking to /sos; new push kind `sos_response` targeted at the raiser only (migration 0033 widens `push_jobs.kind`, adds `target_user_id` and `detail`; the push-notify worker fans out to `target_user_id` when set).
3. **Rider can now cancel their SOS** (commit "feat(sos): rider can cancel their SOS with confirmation; group and emergency contact informed"):
   - "Cancel SOS" on the sent screen -> inline confirm "Cancel your SOS request?" with "Yes, cancel" (danger) / "Keep SOS" -> "SOS cancelled. The group and your emergency contact have been told." + Back to ride.
   - Migration 0034 adds `sos_alerts.cancelled_at`, enum value `event_type = 'sos_cancelled'`, push kind `sos_cancelled`, and RPC `cancel_sos_alert(p_alert_id uuid)` — SECURITY DEFINER, allows only the raiser, only while unresolved, stamps `resolved_at/resolved_by/cancelled_at`, and writes a best-effort `ride_events` audit row.
   - Because cancel sets the existing resolved gate, every SOS card disappears on every member's phone through the existing realtime channel (the helper's "I'm on my way"/"I've reached them" card, other riders' "needs help" cards) and the raiser's own bar goes too.
   - Members in the app see a toast "<name> cancelled their SOS"; a non-urgent push "SOS cancelled" is queued for members; the emergency contact gets an email "<name> has cancelled their SOS" (send-sos-email `event: "cancelled"`, no map link).
   - Demo backend supports cancel. A failed cancel call keeps the sent screen so the rider can retry.
   - No new RLS policy was needed: `sos_alerts_resolve_own` (migration 0004) already lets the raiser update their own alert.

## 2. Files touched (by area)

**Voice**
- `src/lib/voiceCommands.ts` — connect node to destination, disconnect on cleanup, 3 s watchdog warning if no audio callback after start.
- `src/lib/voicePhrase.ts` (new) — pure `parseVoiceUtterance`, single source of `WAKE_WORD`/`COMMAND_WORDS`. Grammar, wake word "sync", model URL, and debounce unchanged.
- `src/lib/voicePhrase.test.ts` (new) — 15 cases including the production strings.
- `android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`. MainActivity untouched: Capacitor 8's `BridgeWebChromeClient.onPermissionRequest` raises the Android runtime mic prompt itself once the manifest declares the permission; the WebView origin `https://localhost` is a secure context.

**SOS raiser feedback**
- `src/components/SosAlertCard.tsx` (+ `SosAlertCard.test.ts` style guard)
- `src/pages/SosPage.tsx`, `src/AppLayout.tsx`
- `src/lib/sos.ts` — `diffResponders`, `buildOwnSosStatus`, `useOwnSosAlert` on the shared `ride-<id>` channel, `notifyRaiser` calls in `respondToSos`/`markReached`
- `src/lib/pushNotifications.ts` — `PushKind`, `buildPushNotifyBody`, optional `targetUserId`/`detail`
- `supabase/functions/push-notify/index.ts`
- `supabase/migrations/0033_sos_response_push.sql`
- `src/lib/sosResponseNotify.test.ts`

**Cancel**
- `src/pages/SosPage.tsx`, `src/AppLayout.tsx` (toast)
- `src/lib/sos.ts` — `cancelSosAlert`, `cancelled` on `IncomingAlert`
- `src/lib/sosDemo.ts`, `src/lib/sosEmail.ts` — `triggerSosEmail(alertId, {event})`
- `supabase/functions/_shared/sosEmailContent.ts`, `supabase/functions/send-sos-email/index.ts`, `supabase/functions/push-notify/index.ts`
- `src/lib/pushNotifications.ts`, `src/lib/database.types.ts`
- `supabase/migrations/0034_sos_cancel.sql`
- `src/lib/sosCancel.test.ts`, `src/lib/sosEmail.test.ts`

**Note for the owner:** upstream main moved AppLayout's alert rendering into `SosAlertStack` with `onRideView` gating after our branch was cut; the cherry-pick onto 6a5238a resolved that conflict (details in the PR description).
Conflict resolution: upstream's `SosAlertStack` with its `!onRideView` gate stays the surface for incoming alerts; the raiser's own bar was extracted to `src/components/OwnSosBar.tsx` (same styles) and shows on every in-app screen except `/sos`, including the ride view, because LiveOps renders its own incoming stack there but no own-SOS status. The cancel commit's `cancel_sos_alert` RPC type was merged alongside upstream's new `update_ride_capacity` entry in `database.types.ts`. Migrations were renumbered to `0033_sos_response_push.sql` and `0034_sos_cancel.sql` because upstream now also has `0031_ride_capacity_update.sql` and `0031_sos_single_active.sql`; 0034 must run after 0033 since both rewrite the `push_jobs.kind` check.

## 3. Verification (2026-09-14/15, Windows 11, Node 24)

Numbers confirmed on this branch after the cherry-pick onto 6a5238a.

| Command / check | Result |
|---|---|
| `npm test` | 107 tests, 105 pass, 0 fail, 2 skipped (the 2 skipped are REPRO tests from PR #31 that reproduce the still-open stale-active-ride defect; run `RUN_REPRO=1 npm test` to see them fail on purpose) |
| `npx tsc --noEmit` | clean |
| `npm run build` | green; Vosk stays a lazily loaded split chunk (~5.8 MB), PWA precache 12 entries (~878 KiB) |
| `npx cap sync android` | green |
| Voice, live | dev build in Chrome, real microphone: "sync hazard" -> Hazard triggered x2, no watchdog warning |
| Compact SOS bar | headless Edge at 360 px: title on one line, action wrapped below (screenshots reviewed) |
| Cancel flow | demo build, headless Edge: Send SOS -> Cancel SOS -> confirm -> "SOS cancelled"; other-member card removed; toast shown |

**NOT exercised** (stated plainly):
- APK not built — the Android SDK/JDK on this machine are on C: and the founder's storage rule forbids Gradle writing there. Build with `npm run build && npx cap sync android && cd android && .\gradlew assembleDebug`, install `android/app/build/outputs/apk/debug/app-debug.apk`, turn voice on, accept the OS mic prompt, say "sync hazard".
- Real push delivery.
- Real Gmail send.
- Migrations on a live database.
- Two-device realtime propagation of card removal.
- iOS.

## 4. Hosted actions the owner must run after merge

1. `supabase db push` — applies 0033 and 0034 (0030 came with PR #31). 0034 runs `ALTER TYPE event_type ADD VALUE`; if the runner wraps the file in one transaction and Postgres objects, run that statement on its own first, then the rest.
2. `supabase functions deploy push-notify send-sos-email`.
3. Secrets (if not already set from PR #31): `supabase secrets set GMAIL_USER=<address> GMAIL_APP_PASSWORD='<app password>'` — dedicated Gmail account, 2-Step Verification on, App Password (not the account password), ~500 mails/day limit. Missing secrets -> the function logs and skips; SOS never fails.
4. Push prerequisites that predate this PR and without which NO push of any kind is delivered (found while diagnosing in PR #31): rotate Vault secret `push_notify_service_role_key` to the hosted service_role key and set `app_settings.edge_functions_url` to `https://<project-ref>.supabase.co/functions/v1` (both SQL snippets are in the header of `supabase/migrations/0027_push_jobs_queue.sql`); enable `pg_cron` and `pg_net` in the dashboard; set VAPID secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and deploy push-notify. Members must also opt in per ride ("Turn on notifications" on the rider join page).
5. Vercel: nothing extra; the PWA deploys from main as before.

## 5. Known open issues (not fixed here; founder ruled "test only for now")

- **Stale active ride.** `useActiveRide` (`src/lib/activeRide.ts`) resolves once and never re-resolves when a ride flips draft->active or a member joins an already-active ride, so `rideId` stays null. Effects: other members do not receive SOS alerts until they reload, and voice does not start after "Start ride" until reload. The fix mechanism `subscribeActiveRide` already exists in that file but the hook does not use it; callers in `AppLayout.tsx` and `SosPage.tsx` pass no `refreshKey`. Reproduction tests: `src/lib/sosNotificationRepro.test.ts` (`RUN_REPRO=1`).
- SOS page does not react if ops resolve the alert while the raiser still has /sos open (pre-existing).
- Production logs `[liveops] position ingest failed: Failed to send a request to the Edge Function` every ~30 s — the `positions-ingest` edge function appears not deployed/reachable on the hosted project.
- Demo-mode only: SosPage uses `useSession` while AppLayout uses `useAuth`; their ids differ in demo, so the raiser's own alert also renders as an other-member card in demo builds. Not present with real sign-in.
- Grammar-constrained Vosk emitted a stray "emergency" partial from background noise during testing; nothing fired because the wake word was absent, but worth watching on the road.

## 6. How to test this PR (owner, short)

1. **Voice in browser (real Supabase):** sign in, Profile -> Voice commands On, allow mic, join/start a ride, reload once (see the stale-active-ride open issue), open console filtered on `[voice]`, say "sync hazard" -> expect "Hazard triggered"; say "sync emergency" -> SOS page countdown.
2. **SOS feedback:** two accounts in one ride; A raises SOS; B taps "I'm on my way" -> A hears a chime and sees "B is on the way" on /sos and a "Help is coming" bar on Home; B taps "I've reached them" -> A hears it again.
3. **Cancel:** A taps Cancel SOS -> Yes, cancel -> B's card disappears and B sees the toast; A's emergency contact receives the cancelled email (if Gmail secrets are set).
