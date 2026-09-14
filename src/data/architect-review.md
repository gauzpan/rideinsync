Staff architecture review: direct-Supabase → API layer for 1000 riders
1. Current architecture (as built)
PWA (React) → supabase-js → Postgres + RLS + RPCs
                            ↳ Realtime postgres_changes → all clients
- No backend API. src/lib/supabase.ts:25 is a single anon-key client used everywhere: LiveOps.tsx:161-175 inserts rider_positions on every GPS fix, sos.ts:97-122 does 3 sequential inserts, ending.ts:84-88 does direct table updates, onboardingService.ts:666 calls RPCs.
- Security = RLS only. Correct for hackathon: is_ride_member() guard (0001_foundation.sql:132), user_id = auth.uid() on insert (:529-538). RPCs (request_join_ride, approve_join_request, close_ride) are SECURITY DEFINER narrow escape hatches — good pattern.
- Realtime = postgres_changes on raw tables. useRideChannel.ts:67-112 subscribes per-ride to rider_positions INSERT + ride_members * + ride_events INSERT + rides UPDATE. Published tables in 0001:617-621 + 0008_flow3_ride_realtime.sql:16.
- Derived state on client. Group status (intact/behind/stopped/stale) in geo.ts:100-112, computed per-rider per-client with nearestGapMeters() O(N²).
This is the right MVP: zero ops, fast iteration. It breaks at ~50-100 concurrent riders, hard-breaks at 1000.
2. What breaks at 1000 riders in one ride (quantified)
#	Bottleneck	Evidence
1	Write amplification on rider_positions	LiveOps.tsx:159-175 inserts on every fix change; useGeolocation.ts:42 watches with maximumAge: 2000. No throttle/batch/dedup. Append-only history table doubles as live feed.
2	Realtime fanout collapse	Every insert is broadcast via postgres_changes to every subscriber. useRideChannel + useSosAlerts + useSosResponses open 3+ channels per client (sos.ts:349,429).
3	Seed + client compute O(N²)	useRideChannel.ts:43-50 seeds with .limit(500) — already wrong at >500 positions (not even >500 riders). Then riders memo does nearestGapMeters per rider over all others.
4	RLS per-row subquery tax	positions_select / members select calls is_ride_member(ride_id) per row (0001:529). Roster + position polls repeat it. Lead screen also polls getPendingJoinRequests every 5s (LeadViewPage.tsx:120-124).
5	No concurrency control on joins/capacity	Capacity check is client-side only (JoinRidePage.tsx:165-169, LeadViewPage.tsx:146-150). approve_join_request (0001:453) has no FOR UPDATE, no capacity check, no idempotency key. Concurrent approves overshoot member_capacity (which caps at 50 anyway — 0001:95 — so 1000 needs schema change regardless).
6	close_ride will time out	0009_ending.sql:96-133 loops per member, each running a windowed haversine over that member's entire position history.
7	Spoofing + push fanout	Any member can insert any lat/lng (only user_id checked). push-notify/index.ts:125-142 does Promise.allSettled over all subs inline — 1000 webpush sends in one Edge Function invocation will hit CPU/wall-clock limits.
Also: member_capacity CHECK 1..50 hard-blocks a 1000-rider ride today. Single-ride assumption is baked into channel + query design.
3. Proposed target: thin API/BFF between PWA and Supabase
Keep Supabase (Postgres + Auth + Realtime) — add a stateless ingest + fanout layer, not a rewrite:
PWA → Edge API (/ingest, /join, /signal, /sos) → Postgres
  ↳ hot path: latest_positions + Broadcast deltas (not postgres_changes)
  ↳ cold path: rider_positions history (sampled/batched)
P0 — survive 1000 (no client rewrite):
1. Split hot vs cold position storage.
- New latest_positions(ride_id, user_id, lat, lng, heading, speed, accuracy, recorded_at, PRIMARY KEY (ride_id, user_id)) — one row per rider, UPSERT only. Map reads this.
- Keep rider_positions as sampled history (server downsamples to e.g. 1 point/10s or significant-move only). Add PARTITION BY RANGE (recorded_at) + retention purge (fills the retention_until TODO in ARCHITECTURE.md §10).
- Why: turns 500 inserts/s bloat into 500 upserts/s on a 1000-row hot table; history scans in close_ride shrink 10–30×.
2. Position ingest Edge Function POST /rides/:id/positions.
- Auth: verify JWT, user_id = auth.uid(), is_ride_member, ride status='active' (reject draft/ended writes server-side — today client just stops watching).
- Validation: reject impossible jumps (speed > 250 km/h between points), clamp accuracy, rate-limit per user (token bucket, e.g. 1/3s; drop or 429, never buffer unbounded).
- Write: single UPSERT latest_positions + conditional history insert + supabase.channel().send({type:'broadcast'}) delta. Client batches GPS (send every 5s or 20m moved, whichever first) instead of every fix.
- Why "faster resolutions": one round-trip, server timestamp, no RLS subquery per insert, no 3-insert SOS waterfall (sos.ts:97-122 becomes one API call that does all three server-side).
3. Switch live feed from postgres_changes to broadcast.
- Server aggregates ticks (e.g. 2s) into one {type:'pack', riders:[...], statuses:[...]} broadcast per ride. Clients stop computing nearestGapMeters O(N²); server computes gaps once with PostGIS ST_DWithin / KNN and ships statuses.
- Keep postgres_changes only for low-frequency tables (ride_members, rides status, sos_alerts). This is the single biggest scale win: 500k deliveries/s → ~0.5 broadcasts/s × 1000 subs.
4. Serialize joins/approvals.
- request_join_ride / approve_join_request: add SELECT ... FOR UPDATE on rides row + SELECT count(*) FROM ride_members WHERE ride_id inside the same txn, enforce capacity server-side, return ride_full error. Add idempotency (ON CONFLICT (ride_id,user_id) DO NOTHING already there — keep it) + advisory lock pg_advisory_xact_lock(hashtext(ride_id::text)) for approve bursts.
- Raise member_capacity max or shard mega-rides into squads (see below).
P1 — correctness at scale:
5. Squad sharding for 1000. One 1000-pin map is unusable. Shard ride into squads of ~20–30 (squad_id on ride_members), each with own broadcast sub-channel; lead view subscribes to squad centroids + drill-down. Fixes both UX and fanout.
6. Move close_ride off-request. Edge Function enqueues job (pg_cron / queue table), worker computes per-member distance incrementally (maintain running distance_m on latest_positions, don't rescan history), writes ride_summaries + user_stats. Current loop becomes a backfill only.
7. Push fanout via queue, not inline. push-notify today fans out inline; move to per-ride queue + batched send with expiry cleanup (already deletes 404/410 — good, keep). SOS stays synchronous for the alert row, async for delivery.
P2 — harden: PostGIS (GEOGRAPHY(Point) + GiST instead of float lat/lng + haversine in SQL), RLS simplification (hot table read via signed broadcast, not per-row policy), client backoff/jitter + offline outbox, load test (k6: 1000 virtual riders × 0.2 Hz ingest, assert p95 broadcast lag <3s).
4. Suggested execution order (ties to your repo)
1. latest_positions migration + ingest function + client batching (LiveOps.tsx:159-175, useGeolocation.ts). Measurable without touching join/SOS.
2. Broadcast pack channel + server status (useRideChannel.ts, geo.ts:deriveStatus moves server-side, client keeps it as fallback).
3. Join serialization + capacity fix (0001:424-472, 0005_flow1_lead_approval.sql, JoinRidePage pending flow unchanged).
4. close_ride async + history sampling/partitioning.
5. Squads + push queue.
Open tradeoffs to confirm before I spec it
- Scale shape: one 1000-rider mega-ride, or 1000 riders across many small rides? The fix differs (squads vs connection pooling).
- Supabase-only constraint: Edge Functions + Postgres OK, or must stay pure direct-DB (no server code)? P0 needs at least one Edge Function to get batching + broadcast.
- Freshness SLA: is 5s position lag acceptable at 1000 (enables 2s server aggregation), or must stay ≤2s (forces bigger Realtime spend)?