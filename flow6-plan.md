# Flow 6 — Ending Journey: Functional Requirements & Plan

Owner: Gaurav. The ride's terminal phase from `PRD/ridepod_solution_space_v2.md`, built on the
data-model foundation (`supabase/migrations/0001_foundation.sql`). Settled via a full
decision-tree interview; below is the agreed scope, the schema deltas (new migration
`0002_ending.sql`), and the build/verification plan.

Stack: PWA (React/Vite) + Supabase Postgres.

## Decisions (settled)

- **Lifecycle = single-phase:** ride ends at the **destination**; "I reached home" is a lightweight
  post-close self-report with **no solo-leg tracking**.
- **Home-ack:** kept, **decoupled from feedback**; gives the Lead an "everyone home" roster; **no
  escalation** in v1.
- **Feedback:** 3-way sentiment **like / dislike / can-be-better** + two optional text fields
  (liked / could-improve). Optional, per-rider, once on the summary screen. Readable by **Lead +
  org analytics only** (not pod-wide). Wording deferred; shape locked.
- **Stats/badges:** trusted `close_ride()` RPC computes stats + awards badges. **Badges only in v1**
  (XP schema-ready, not built). Badges are **per travel-mode** on raw-metric thresholds (first-ride,
  distance milestone, safe-sweep; **speed excluded**). Awarded **at close**; announced on the
  summary + dashboard.
- **Travel mode:** ride-level enum `motorcycle | car | cycle`; stats/badges per-mode.
- **Close contract:** Lead + co-leader; **force-close allowed** (unarrived riders flagged); **idempotent**.
- **Nudge:** all members `arrived` + 60 min + still `active` → **in-app banner** to Lead/co-leaders.
  **Never auto-closes.** (Edge: an unarrived rider suppresses it; manual close always available.)
- **Close effects:** `status='ended'` (blocks new joins), location sharing hard-stops, summary =
  per-rider stats + pod totals + badges, retention per `retention_until` (**default 30 days**).
- **Social share:** `navigator.share()` of a generated image card (own stats + badge + generalized
  route + **app logo top-right**) + install/deep link. Pod-mates anonymized, no raw GPS, **no public
  ride page** in v1.

## Functional requirements

- **FR1 Close ride** — `close_ride(ride_id)`: `status='ended'`, write `ride_summaries`, update each
  member's per-mode `user_stats`, award `user_badges`, emit `badge_awarded` events. Idempotent; force-close.
- **FR2 Reached-home ack** — post-close per-rider tap → stamps membership; Lead sees "N/M home".
- **FR3 Feedback** — optional one-time per-rider sentiment + two texts; Lead/org-analytics visible.
- **FR4 Stats & badges** — computed server-side from `rider_positions`; per-mode; announced via
  `badge_awarded` Realtime + dashboard.
- **FR5 Summary screen** — per-rider stats + pod totals + badges; sharing shown stopped.
- **FR6 Close nudge** — all-arrived + 60 min → in-app banner to Lead/co-leaders; nudge only.
- **FR7 Social share** — summary → share sheet image card + deep link.

## Schema deltas — `supabase/migrations/0002_ending.sql`

- Enums: `travel_mode('motorcycle','car','cycle')`; `feedback_sentiment('like','dislike','can_be_better')`;
  `alter type event_type add value 'badge_awarded'`.
- `rides`: `+ travel_mode` (default motorcycle).
- `ride_members`: `+ reached_home_at timestamptz`.
- `ride_feedback`: drop `reached_home`; `+ sentiment`, `+ liked_text`, `+ improve_text`; tighten select
  policy to `user_id = auth.uid() OR is_ride_leader(ride_id)`.
- `user_stats` (⚠ Flow 2 / Mithul — coordinate): per-mode composite PK `(user_id, mode)`, `+ xp`.
- `badges` (⚠ Flow 2 / Mithul): `+ mode`, `+ threshold` metadata.
- `ride_summaries`: `+ riders_total`, `+ riders_home`, `+ arrival_unconfirmed`.
- `close_ride(uuid)` `SECURITY DEFINER` RPC (leader-only, idempotent) — the only writer of other
  riders' stats/badges (RLS blocks the client).
- Nudge: demo-grade client-derived banner; robust = Supabase scheduled function (later).

## Client

- `src/lib/ending.ts` — `closeRide`, `markReachedHome`, `submitFeedback`, `subscribeToBadges`.
- `src/pages/RideSummaryPage.tsx` + components: stats, feedback, home-ack, share. Share card reuses
  the brand mark (`public/favicon.svg`).

## Cross-flow

- Flow 2 (Mithul): `user_stats`/`badges` reshape needs his sign-off (seam tables).
- Flow 4 (Pratyusha): `arrived` detection feeds the nudge + location stop.
- Flow 3 (Rajat): `rider_positions` history is the stats source.

## Verification

- Apply `0002_ending.sql` on the foundation (`supabase db reset`); regen types; `npm run build`.
- `close_ride`: leader → writes summary/stats/badges/events; twice → no double count; non-leader → rejected.
- RLS: non-leader can't read others' feedback; Lead can.
- Home-ack stamps + roster; nudge fires on all-arrived+60min, suppressed otherwise; close blocks new joins.
- Share sheet yields the anonymized image card + deep link.

## Out of scope (v1)

XP economy (schema-ready only), mid-ride badges, home-ack escalation, public ride-recap page, exact
feedback wording, final per-mode thresholds.
