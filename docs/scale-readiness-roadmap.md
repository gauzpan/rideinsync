# RideInSync — scale-readiness roadmap (principal architect review)

## Context

`src/data/architect-review.md` is a staff-level review proposing how to evolve RideInSync's current direct-Supabase architecture (PWA → supabase-js → Postgres+RLS+RPCs, Realtime via `postgres_changes`) to survive 1000 concurrent riders. As principal architect I verified every factual claim in that doc against the actual code (three parallel research passes covering the position/realtime pipeline, the join/approval/capacity flow, and SOS/close_ride/push fanout), then had it synthesized into a sequenced milestone plan, then confirmed the three tradeoffs the doc itself flagged as unresolved.

**Verification found the doc is mostly accurate but has one materially wrong claim**: it says `approve_join_request` has no row locking or capacity check. That's false for the *current* code — a later migration (`supabase/migrations/0013_flow2_join_capacity.sql:9-43`, duplicated verbatim at `0020_flow2_join_capacity.sql:9-43`) already added `SELECT ... FOR UPDATE` on the `rides` row plus a capacity check inside that lock. The doc was describing the original, since-superseded `0001_foundation.sql:453` version. This matters because it means part of the doc's proposed P0 item 4 ("serialize joins/approvals") is already shipped — don't redo it.

Three tradeoffs the doc flagged as needing a decision have now been answered, and they reshape the plan significantly from the doc's original framing:

| Tradeoff | Answer | Effect on scope |
|---|---|---|
| Scale shape | **Many small rides** (aggregate 1000 riders across many concurrent rides, not one 1000-member ride) | The doc's P0 item 4 remainder (capacity-model rework) and all of P1 item 5 (squad sharding) become **unnecessary** — no single ride ever needs to exceed the existing 50-member cap. The real bottleneck shifts to aggregate infra load: total Realtime channels/connections, total DB write rate, and total concurrent Edge Function invocations *summed across every active ride*, not any one ride's internal data model. |
| Server code | **Edge Functions allowed** | Collapses the ingest/broadcast work to one implementation path (Deno Edge Function), matching the existing `supabase/functions/push-notify/index.ts` pattern already in the repo. No dual-path hedging needed. |
| Freshness SLA | **~5s acceptable** | Locks in a 2s+ server-side aggregation interval for the broadcast milestone — real compute/bandwidth savings versus a tighter SLA. |

The outcome of this plan is a milestone sequence that (a) fixes verified real gaps immediately regardless of scale, (b) reduces per-rider write/compute chatter that matters at any scale, (c) replaces the highest-cost primitive (one `postgres_changes` broadcast per GPS fix, fanned out to every subscriber) with a server-aggregated broadcast, and (d) explicitly retires the two milestones (capacity rework, squad sharding) that the "many small rides" answer makes moot — so nobody re-derives or re-proposes them later.

## Repo/tooling notes for whoever executes this

- Migrations directory was recently renumbered to remove duplicate version prefixes from a messy multi-branch merge (contents unchanged, filenames shifted). It currently ends at `0020_flow2_join_capacity.sql` — **new migrations start at `0021_*`**.
- A local Supabase stack is already running (`supabase start`) and seeded (`supabase/seed.sql`) — use it directly for testing every migration/RPC below before touching the hosted project. `.env.local` currently points the app at this local stack.
- `0013_flow2_join_capacity.sql` and `0020_flow2_join_capacity.sql` are byte-identical leftovers of the merge (same for one other pair) — flag as tech debt, do not treat as two independent things to change in parallel.

---

## M0 — Correctness hardening (ships now, no dependency on anything)

**Goal:** close verified, real data-integrity gaps that exist today regardless of scale.

1. **Position payload validation.** `rider_positions` insert RLS (`0001_foundation.sql:531-532`) checks `user_id = auth.uid() AND is_ride_member(ride_id)` — identity and membership, but *zero* validation of the payload itself. A legitimate member can insert any lat/lng or an impossible speed jump. Add migration `0021_position_validation.sql`: a `BEFORE INSERT` trigger function `validate_rider_position()` on `rider_positions` rejecting out-of-range lat/lng and (by comparing against that user's most recent prior row) implausible speed (>250 km/h implied). Pure SQL, no Edge Function, ships independently of every other decision.
2. **Transactional SOS raise.** `sendSos` (`src/lib/sos.ts:86-130`) does 3 sequential unwrapped `.insert()` calls (`sos_alerts` required, `rider_positions`/`ride_events` best-effort) plus an unawaited push trigger. Add a SECURITY DEFINER RPC `raise_sos_alert(ride_id, user_id, payload)` (new migration) wrapping the three inserts in one transaction; update `sendSos` to a single `.rpc()` call. Leave the push trigger call as-is (unawaited, unchanged — no reason to couple it to the DB transaction).
3. **`request_join_ride` TOCTOU note (low priority, optional).** The early capacity gate in `request_join_ride` (`0013_flow2_join_capacity.sql:45-86`) is unlocked, but verified to be UX-noise only — real `ride_members` writes for non-demo rides only ever happen through the already-locked `approve_join_request`, so no actual overshoot is possible. Fix opportunistically (`pg_advisory_xact_lock(hashtext(r.id::text))` around the count) if touching this function for other reasons; not worth a dedicated migration on its own.
4. **Demo-ride capacity bypass (defer).** `is_demo` rides insert into `ride_members` directly with no capacity check. Demo rides aren't the production path — explicitly deferred, not part of this milestone's deliverable.

**Reuse:** existing SECURITY DEFINER RPC pattern (`request_join_ride`, `approve_join_request`, `close_ride`) for the new `raise_sos_alert` function — same file/shape conventions as `0013_flow2_join_capacity.sql`.

**Verification:** against the local stack — `psql` insert a `rider_positions` row with `lat=999` or two rows implying >250km/h and confirm rejection; call `raise_sos_alert` and confirm all 3 rows land atomically (and that a forced failure on one leaves none committed); run the existing SOS flow through `LiveOps.tsx`'s `raiseSos()` end-to-end in the app.

---

## M1 — Cut ingest chatter and client recompute cost (no server component, no tradeoff dependency)

**Goal:** reduce GPS write volume and React recompute cost today, at current per-ride scale (≤50 members) — these savings also directly reduce the *aggregate* load that matters once many rides are concurrently active.

1. **Distance/time-gate GPS fixes.** `src/hooks/useGeolocation.ts:42-60` calls `setFix` on every native fix with zero throttling (`maximumAge:2000` only affects OS-level fix reuse, not delivery). Add gating so a fix is only accepted if ≥5s elapsed or ≥20m moved since the last accepted one.
2. **Insert frequency drops for free.** `LiveOps.tsx:158-175`'s effect fires an unconditional insert per `fix` change — with M1.1's gating upstream, insert volume drops proportionally with zero changes to this effect itself.
3. **Batch realtime position deltas client-side.** `useRideChannel.ts`'s `riders` useMemo (`:120-157`) recomputes `nearestGapMeters` (`geo.ts:87-90`, O(N) per rider) on nearly every incoming `rider_positions` INSERT from *any* member, not just on render. Coalesce incoming position events into the `positions` state via a ref + short flush interval (500ms-1s) instead of one `setPositions` per event. This is a stopgap — M3 replaces the underlying mechanism — but it's cheap and ships now.

**Reuse:** the existing `RideSimulator` (driven by `LiveOps.tsx`'s `simulatePack()`) as the test harness — no new load-gen tooling needed for this milestone.

**Verification:** run `simulatePack()` with ~20-30 simulated riders; compare `rider_positions` insert count and React re-render/CPU profile (browser devtools) before/after.

---

## M2 — Position ingest Edge Function + hot/cold table split

**Goal:** replace the raw client insert with one validated, rate-limited write path, and stop treating `rider_positions` as both the live feed and the history table.

1. **New `latest_positions` table** — migration `0022_latest_positions.sql`: `latest_positions(ride_id, user_id, lat, lng, heading, speed, accuracy, recorded_at, updated_at)`, PK `(ride_id, user_id)`. RLS mirrors the existing `positions_select`/`positions_insert` shape (`0001_foundation.sql:531-532`) but as an upsert policy.
2. **`supabase/functions/positions-ingest/index.ts`** — new Edge Function modeled directly on the JWT-verification pattern already proven in `supabase/functions/push-notify/index.ts:89-96` (`callerClient.auth.getUser()` checked against the claimed `user_id`). Responsibilities: verify membership + ride is `active` (reject writes for `draft`/`ended` server-side — today the client just stops watching, which is a soft guard only), apply M0's plausibility validation, rate-limit per user (~1/3s), upsert `latest_positions`, and conditionally sample into `rider_positions` (e.g. every Nth accepted write) for history/`close_ride` purposes.
3. **Client call site swap.** `LiveOps.tsx:158-175`'s direct `.insert()` becomes a call to this function.
4. **Seed query simplification.** `useRideChannel.ts:45-50`'s `.limit(500)` + client-side dedupe-to-latest-per-user scan (`:54-58`) becomes a single `select * from latest_positions where ride_id = ...` — one row per member already, no ordering or dedup logic needed.

**Reuse:** `push-notify`'s auth pattern (point 2 above) — do not invent a new verification approach.

**Verification:** `supabase functions serve` locally; test valid JWT, invalid/mismatched JWT, out-of-range coordinates, and rapid-fire calls tripping the rate limit; confirm `select count(*) from latest_positions where ride_id=...` stays pinned at member count instead of growing unbounded like `rider_positions` does today.

---

## M3 — Broadcast-based live feed + channel consolidation

**Goal:** this is the highest-leverage milestone under the "many small rides" scale shape. The dominant cost at 1000 concurrent riders isn't any single ride's O(N²) gap computation (bounded at N≤50, trivially cheap) — it's the number of concurrently open Realtime channels/subscriptions *across the whole project*. Today a single live-ride screen opens 3-4 channels per client (`useRideChannel.ts:67` → `ride-${id}`; `sos.ts:349` → `ride:${id}:sos:*`; `useNavigateOnRideEnd.ts:27` → `ride-end:${id}`; possibly `signals.ts:84` → `ride:${id}:signals:*`). At 1000 concurrent riders that's 3000-4000 concurrent channel subscriptions system-wide, which is the real ceiling to push against — not any one ride's data model.

1. **Server aggregator.** New periodic job (interval driven by the confirmed ~5s SLA, so a 2s+ tick is fine) reads `latest_positions` per active ride, computes per-rider status (porting `geo.ts:100-113`'s `deriveStatus` thresholds — `STALE_MS`, `BEHIND_M` — server-side), and calls `channel().send({type:'broadcast', event:'pack', payload:{riders:[...]}})` on the *existing* `ride-${rideId}` channel name (`useRideChannel.ts:67`) — no new channel, just a new event type on the one that already exists.
2. **Client swap.** Replace the `rider_positions` `postgres_changes` listener (`useRideChannel.ts:69-77`) with a `.on('broadcast', {event:'pack'}, ...)` handler that sets rider state directly from the server-computed payload. This removes the `riders` useMemo's dependency on raw `positions` + `nearestGapMeters` (`:120-157`, `geo.ts:87-90`) entirely — M1.3's coalescing becomes unnecessary once this lands. Leave the `ride_members`/`ride_events`/`rides` `postgres_changes` listeners (`:78-110`) untouched; low-frequency tables correctly stay on `postgres_changes`.
3. **Channel consolidation (the actual scale win here).** Multiplex the SOS-alert listener (`sos.ts:349`), ride-end listener (`useNavigateOnRideEnd.ts:27`), and signals listener (`signals.ts:84`) onto the single `ride-${id}` channel object as additional event types/tables, instead of each opening its own `supabase.channel()` call. This is what actually reduces the per-client channel count from 3-4 down to 1, which is what multiplies favorably across 1000 concurrent riders. (`useSosResponses` at `sos.ts:429` is correctly left alone — it's SOS-page-only, gated on the user having personally raised an SOS, not part of the always-open set.)

**Explicitly not doing** (per the "many small rides" answer): squad sharding, per-squad sub-channels, or any capacity-model change — none of that is needed when no single ride exceeds ~50 members.

**Verification:** insert/upsert `latest_positions` rows for N simulated riders directly via SQL and measure aggregator→broadcast→client latency against the 5s SLA; re-run `simulatePack()` through the new broadcast path at ~20-30 riders and confirm the map/status UI is unchanged from a user's perspective; count open channels per client in-browser (`supabase.getChannels()`) before/after M3.3 to confirm the consolidation.

---

## M4 — Async `close_ride` + async push fanout

**Goal:** these matter *more*, not less, under "many small rides" — many rides can plausibly end around the same time, so keeping this synchronous multiplies badly in aggregate even though each individual ride is small.

1. **Incremental distance.** `close_ride` (`supabase/migrations/0011_ending.sql:71-149`) loops every member (`:96`) and for each rescans that member's *entire* `rider_positions` history with a windowed haversine (`:107-109`) — expensive per-ride even at 50 members, and repeated across every ride ending. Maintain a running `distance_m` on `latest_positions` (or a small per-member stats row), updated incrementally inside M2's ingest function at write time, so `close_ride` reads an already-computed total instead of rescanning history.
2. **Move `close_ride` off the request path.** Currently invoked synchronously via `supabase.rpc("close_ride", ...)` from `src/lib/ending.ts:98`, called directly from UI handlers in `LiveOps.tsx:227` and `RideSummaryPage.tsx:91`. Introduce a small `ride_close_jobs` queue table + worker (Edge Function on a schedule, or `pg_cron`); the current per-member loop becomes a backfill/reconciliation path rather than the hot path a user's tap blocks on.
3. **Push fanout via queue.** `supabase/functions/push-notify/index.ts:125-141`'s inline `Promise.allSettled` over every one of a ride's `push_subscriptions` becomes an enqueue (`push_jobs` table) + async worker. Keep the existing 404/410 subscription cleanup (`:132-139`) inside the worker unchanged — it already works correctly, don't rebuild it. The `sos_alerts` row write (M0.2's `raise_sos_alert`) stays synchronous; only delivery fan-out moves async.

**Reuse:** M0.2's `raise_sos_alert` transaction pattern for the new job-enqueue functions; `push-notify`'s existing cleanup logic verbatim inside the new worker.

**Verification:** `EXPLAIN ANALYZE` `close_ride`'s per-member query before/after the incremental-distance change on a ride with realistic position-row counts; trigger a signal locally and confirm delivery still happens (now async, via `push_jobs`) and that expired-subscription cleanup still fires.

---

## M5 — Hardening

**Goal:** land last since it optimizes structures M2/M3 introduce.

1. Convert `latest_positions`/`rider_positions` lat/lng to `GEOGRAPHY(Point)` + GiST; port M3's aggregator SQL from haversine to `ST_DWithin`/KNN.
2. Re-examine RLS on `latest_positions` for the broadcast era — once M3 makes the server aggregator (service role) the sole driver of client-visible rider state, the per-row `is_ride_member` check pattern (`0001_foundation.sql:531-532`) may be redundant for direct client reads of the hot table; simplify if so.
3. Client backoff/jitter + a small offline outbox around M2's ingest call site (`LiveOps.tsx` / `useGeolocation.ts`).
4. **Load test matching the confirmed scale shape**: k6 with ~1000 virtual riders distributed across ~20-50 *concurrent small rides* (not one mega-ride), ~0.2Hz ingest per rider against M2's Edge Function, asserting p95 broadcast lag against the confirmed ~5s SLA. This is the test shape that actually matches the answered tradeoff — do not write a single-1000-rider-ride load test, it doesn't match the agreed scale shape.

**Verification:** run the k6 script against the local stack first, then a scaled staging project; capture p50/p95/p99 broadcast lag and total concurrent Realtime channel count at peak.

---

## Explicitly retired (do not re-propose)

- **Capacity-model rework** (remainder of the doc's P0 item 4 beyond what's already shipped) — the `member_capacity between 1 and 50` CHECK (`0001_foundation.sql:95`) stays as-is. No single ride under the "many small rides" shape needs to exceed it.
- **Squad/shard sharding** (doc's P1 item 5) — entirely unnecessary once no ride exceeds ~50 members. If a future product decision reintroduces a mega-ride use case, revisit this and M4's capacity milestone together, not in isolation.

## Sequencing rationale

M0 and M1 have no dependency on anything and ship real value against every ride running today, regardless of size. M2 needed the "Edge Functions allowed" answer, which is now settled, so it proceeds as a single path (no more A/B hedging). M3 depends on M2's `latest_positions` table and the confirmed 5s SLA, and is the milestone that most directly addresses the actual bottleneck given the "many small rides" answer (aggregate channel/connection count, not any one ride's compute). M4 is decoupled from M2/M3's ingest/broadcast decisions and can proceed in parallel once M0's transactional pattern exists to model its job-enqueue functions on. M5 is deliberately last because it optimizes structures M2/M3 create, and its load-test shape only makes sense once the scale-shape answer is locked in (it now is).
