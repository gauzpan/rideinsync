# RideInSync — PostHog Dashboard Spec

Copy-paste build sheet for every product metric we instrumented. Each entry gives the
metric, its formula, and the exact PostHog insight to build (events, filters,
breakdowns). Ride-level metrics use the HogQL queries in the last section.

---

## Verification pass — DO THIS FIRST (before trusting any chart)
None of the ~29 events have been confirmed firing live. If the PostHog key or the
`track()` wrapper is misconfigured, every event is silently dead and all charts stay
empty. Run this once (~10 min) before reading any dashboard.

**1. Wire the key (once).** In `rideinsync/.env.local`:
```
VITE_PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com    # or https://eu.i.posthog.com
```

**2. Restart the dev server** (Vite reads env only at startup):
```
npm run dev
```

**3. Open PostHog → Activity → Live Events**, and keep it open while you walk the app.
Dev events arrive tagged `env: "development"` (the production dashboards filter these
out — that's expected; you're just confirming they FIRE).

**4. Walk the leader loop** (one pass), confirming each event appears:
- Land signed-out → `landing_viewed`; swipe the value cards → `landing_carousel_engaged`.
- Sign in → `sign_in_started` (before the redirect) then `sign_in_completed`.
- Create a ride → `create_form_started`, submit → `ride_created` (try an empty submit
  first → `ride_create_submit` with `blocked`).
- On the invite/lead screen, copy the code → `ride_shared`.
- Start the ride → `ride_started`; end it → `ride_ended`.

**5. Walk the rider loop** (second session / incognito):
- Open a `/join/CODE` link → `join_flow_arrived` (via deeplink) + `code_lookup` (found);
  Continue → `join_preview_continued`.
- Reach the profile form → `profile_step_arrived`; tick consent → `consent_ticked`;
  submit → `profile_submitted` (`mode`, `skipped_optional`).
- Join a demo ride → `ride_joined`.

**6. Spot-check SOS + tracking** (in a started ride):
- Allow location on first prompt → `location_permission` (native) / first fix →
  `rider_first_fix { got_fix: true }`.
- Open `/sos` → `sos_confirm_shown`; send → `sos_confirmed` then `sos_delivered`
  (`has_location`); mark reached → `sos_reached`.

**Pass criteria:** every event above shows up in Live Events with the right properties.
If NOTHING shows → key/host wrong or dev server not restarted. If SOME show → check that
specific file's `track()` call. Only after this passes should the batch be committed and
the production dashboards trusted.

---

## Global conventions
- **Every insight filters `properties.env = 'production'`** (drops dev/local traffic;
  events fire in dev too, tagged `env`).
- **All events carry `env` (super-property) + `session_id`/`distinct_id` (PostHog managed).**
- **Grain**: "funnel" = person-level (PostHog funnels), "ratio" = event-count ratio,
  "HogQL" = ride-level (distinct `ride_id`).
- `has_location` is a **property on `sos_delivered`**, not its own event.
- 29 events total. Deferred (DB) metrics are listed at the end — do not build these in PostHog.

## Event → property reference
| Event | Key properties |
|---|---|
| landing_viewed | — |
| landing_carousel_engaged | via ("swipe"/"wheel"/"dot") |
| sign_in_started | method ("google"/"guest"), surface |
| sign_in_completed | method |
| create_form_started | — |
| ride_created | stop_count, has_capacity, has_guidelines, has_end_time |
| ride_create_submit | blocked (field name / "expected_end" / null) |
| account_gate_shown | was_guest |
| ride_shared | ride_id, via, surface ("invite"/"lead") |
| ride_joined | ride_id, via ("instant"/"approved") |
| join_requested | ride_id |
| join_request_decided | ride_id, decision ("approved"/"declined") |
| join_request_withdrawn | ride_id |
| ride_started | ride_id |
| ride_ended | ride_id |
| join_flow_arrived | via ("deeplink"/"manual") |
| join_preview_continued | — |
| code_lookup | result ("found"/"not_found"/"error"), via ("manual"/"deeplink"/"qr") |
| profile_step_arrived | — |
| profile_submitted | mode ("own"/"pillion"), skipped_optional (bool) |
| consent_ticked | — |
| pillion_joined | ride_id |
| pillion_linked | ride_id |
| rider_first_fix | ride_id, got_fix (bool) |
| location_permission | result ("granted"/"denied"), platform ("native"/"web") |
| sos_confirm_shown | mode ("manual"/"auto") |
| sos_confirmed | ride_id, surface ("sos_page"/"liveops") |
| sos_delivered | ride_id, surface, has_location (bool) |
| sos_reached | ride_id |

---

## S0 — Landing

### Landing → sign-in rate — LAGGING
`= sessions that sign in ÷ landing sessions`
- **Funnel**: `landing_viewed` → `sign_in_completed`
- Conversion window: **30 minutes**
- Filter: env=production

### Value-carousel read-rate — LEADING (watch-and-validate)
`= landing_carousel_engaged ÷ landing_viewed`
- **Ratio / funnel**: `landing_viewed` → `landing_carousel_engaged`
- Breakdown: `via`
- Filter: env=production
- Note: active engagement only (auto-advance excluded); expect a low, meaningful number.

---

## S1 — Sign in

### Sign-in completion — LAGGING (+ per-method, same funnel)
`= sign_in_completed ÷ sign_in_started`
- **Funnel**: `sign_in_started` → `sign_in_completed`
- Conversion window: 30 minutes (covers the OAuth redirect)
- **Breakdown: `method`** — READ PER-METHOD, never blended (guest ~100% masks Google).
- Filter: env=production

---

## L1 — Create a ride

### Ride creation — LAGGING
`= ride_created ÷ create_form_started`
- **Funnel**: `create_form_started` → `ride_created`
- Filter: env=production

### Required-field friction — LEADING
`= ride_create_submit[blocked set] ÷ all ride_create_submit`
- **Insight** on `ride_create_submit`: ratio of `blocked is set` ÷ total
- **Breakdown: `blocked`** (which field). The `null` bucket = clean submits.
- Filter: env=production

### Account-gate conversion — LEADING
`= guests who hit the gate and then create ÷ guests who hit the gate`
- **Funnel** (person-level): `account_gate_shown` → `ride_created`
  (optional middle step: `sign_in_started` where surface = "create_ride_upgrade")
- Filter: env=production

---

## L2 — Invite

### Invite payoff — LAGGING  → **HogQL (see below)**
`= rides shared AND got ≥1 joiner ÷ rides shared`
(Invite engagement was dropped — collapse trap.)

---

## L3 — Approval

### Approval responsiveness — LAGGING
`= join_request_decided ÷ (join_requested − join_request_withdrawn)`
- **Formula insight** (3 event counts): `join_request_decided` ÷ (`join_requested` − `join_request_withdrawn`)
- **Breakdown: `decision`** on join_request_decided (approve/decline split)
- Filter: env=production

---

## L4 — Start  → **HogQL (see below)**
### Ride start rate — LAGGING
`= rides that had ≥1 joiner AND started ÷ rides that had ≥1 joiner`

## L5 — End  → **HogQL (see below)**
### Ride completion — LAGGING
`= rides ended cleanly AND started ÷ rides started`

---

## R1 — Find ride

### Ride found → continued — LAGGING
`= join_preview_continued ÷ join_flow_arrived`
- **Funnel**: `join_flow_arrived` → `join_preview_continued`
- **Breakdown: `via`** on arrival (deeplink vs manual)
- Filter: env=production

### Invalid-code rate — LEADING
`= code_lookup[not_found] ÷ (found + not_found)`  (errors excluded)
- **Insight** on `code_lookup`: `result = not_found` ÷ (`found` + `not_found`)
- **Breakdown: `via`**; watch `result = error` separately (technical health)
- Filter: env=production

---

## R2 — Mode (folded into R3)
### Own vs pillion split
- **Breakdown of `profile_submitted` by `mode`.** No dedicated metric.

---

## R3 — Join

### Join completion — LAGGING
`= profile_submitted ÷ profile_step_arrived`
- **Funnel**: `profile_step_arrived` → `profile_submitted`
- Filter: env=production
- Note: scopes to riders who had to fill the form (complete profiles skip it).

### Consent-tick rate — LEADING
`= consent_ticked ÷ profile_step_arrived`
- **3-step funnel** (most useful): `profile_step_arrived` → `consent_ticked` → `profile_submitted`
  - Big drop at step 1→2 = consent copy is the barrier.
  - Drop at 2→3 = it's the fields, not consent.
- Filter: env=production

### "Join anyway" (skip) rate — LEADING (watch-and-validate)
`= profile_submitted[skipped_optional=true] ÷ all profile_submitted`
- **Breakdown of `profile_submitted` by `skipped_optional`** (also by `mode`)
- Filter: env=production. Never optimize in either direction alone.

---

## R4 — Approval (rider side) & pillion

### Rider admitted — LAGGING
`= join_request_decided[approved] ÷ join_requested`  (withdrawals kept in denominator)
- **Formula insight**: `join_request_decided` (filter decision=approved) ÷ `join_requested`
- Filter: env=production
- Pairs with L3: L3 low = unanswered; R4 low + L3 high = mostly declined.

### Pillion linked — LAGGING (instant-scope)
`= pillion_linked ÷ pillion_joined`
- **Formula insight**: `pillion_linked` ÷ `pillion_joined`
- Filter: env=production
- Note: instant-pillion path only; pending-approval pillions are a known gap.

---

## R5 — Live tracking

### Location-permission-granted rate — LEADING (load-bearing)
`= location_permission[granted] ÷ all location_permission`
- **Insight** on `location_permission`: `result = granted` ÷ total
- **Filter: env=production AND platform = native** (web is unreliable; read on native)

### Tracking established (live-visibility proxy) — LAGGING proxy
`= rider_first_fix[got_fix=true] ÷ all rider_first_fix`
- **Insight** on `rider_first_fix`: `got_fix = true` ÷ total
- Filter: env=production
- Label "tracking established," NOT "live visibility." The literal freshness mirror is DB-deferred.

---

## SOS

### Delivery — LAGGING
`= sos_delivered ÷ sos_confirmed`  (should be ~100%)
- **Formula insight**: `sos_delivered` ÷ `sos_confirmed`
- Breakdown: `surface`
- Filter: env=production
- "Delivered" = alert raised into the system (proxy; not per-member receipt).

### Location-captured-at-send — LEADING
`= sos_delivered[has_location=true] ÷ all sos_delivered`
- **Insight** on `sos_delivered`: `has_location = true` ÷ total (by `surface`)
- Filter: env=production. Should be near 100%; the false slice = SOS with no location.

### Confirm → send completion — LEADING
`= sos_confirmed[surface=sos_page] ÷ sos_confirm_shown`
- **Funnel**: `sos_confirm_shown` → `sos_confirmed` (filter sos_confirmed to surface=sos_page)
- **Breakdown: `mode`** (manual vs auto)
- **Cancel-rate = 1 − this** (derived; no event). Watch-and-validate — a cancelled mis-tap is good.
- Filter: env=production

### Help reached (outcome) — LAGGING proxy  → **HogQL (see below)**
`= rides with an in-app reach marker ÷ rides with a raised SOS`
- Label "in-app reach marker," not "help confirmed arrived." Undercounts.

---

## HogQL queries (ride-level / entity metrics)
Paste each as a new **HogQL insight**. All filter env=production inside the query.

### L2 — Invite payoff
```sql
select
  count(distinct ride_id) filter (where shared and joined)      as shared_and_joined,
  count(distinct ride_id) filter (where shared)                 as shared,
  round(100.0 * count(distinct ride_id) filter (where shared and joined)
    / nullif(count(distinct ride_id) filter (where shared), 0), 1) as payoff_pct
from (
  select properties.ride_id as ride_id,
    max(if(event = 'ride_shared', 1, 0)) = 1 as shared,
    max(if(event = 'ride_joined', 1, 0)) = 1 as joined
  from events
  where event in ('ride_shared', 'ride_joined') and properties.env = 'production'
  group by properties.ride_id
)
```

### L4 — Ride start rate
```sql
select
  count(distinct ride_id) filter (where started and joined)     as started_startable,
  count(distinct ride_id) filter (where joined)                 as startable,
  round(100.0 * count(distinct ride_id) filter (where started and joined)
    / nullif(count(distinct ride_id) filter (where joined), 0), 1) as start_rate_pct
from (
  select properties.ride_id as ride_id,
    max(if(event = 'ride_started', 1, 0)) = 1 as started,
    max(if(event = 'ride_joined',  1, 0)) = 1 as joined
  from events
  where event in ('ride_started', 'ride_joined') and properties.env = 'production'
  group by properties.ride_id
)
```

### L5 — Ride completion
```sql
select
  count(distinct ride_id) filter (where ended and started)      as completed,
  count(distinct ride_id) filter (where started)                as started,
  round(100.0 * count(distinct ride_id) filter (where ended and started)
    / nullif(count(distinct ride_id) filter (where started), 0), 1) as completion_pct
from (
  select properties.ride_id as ride_id,
    max(if(event = 'ride_started', 1, 0)) = 1 as started,
    max(if(event = 'ride_ended',   1, 0)) = 1 as ended
  from events
  where event in ('ride_started', 'ride_ended') and properties.env = 'production'
  group by properties.ride_id
)
```

### SOS — Help reached (outcome proxy)
```sql
select
  count(distinct ride_id) filter (where reached and raised)     as reached,
  count(distinct ride_id) filter (where raised)                 as raised,
  round(100.0 * count(distinct ride_id) filter (where reached and raised)
    / nullif(count(distinct ride_id) filter (where raised), 0), 1) as reached_pct
from (
  select properties.ride_id as ride_id,
    max(if(event = 'sos_delivered', 1, 0)) = 1 as raised,
    max(if(event = 'sos_reached',   1, 0)) = 1 as reached
  from events
  where event in ('sos_delivered', 'sos_reached') and properties.env = 'production'
  group by properties.ride_id
)
```

---

## Deferred — DB metrics (do NOT build in PostHog)
These are elapsed-time / absence-of-activity metrics better computed as SQL on the DB
(team has access). Reasons and definitions:
- **L3 Fast decisions** — time-to-decision: `decided_at − created_at` on `ride_join_requests` (exclude withdrawn), % within X min.
- **L5 Mid-ride staleness** — members whose last `rider_positions` timestamp is > threshold before `ended_at` ÷ members tracked at start.
- **R5 Live visibility (literal freshness)** — riders with a fresh `rider_positions` row ÷ active `ride_members`, at time T. (PostHog proxy: `rider_first_fix`.)
- **SOS Time-to-first-responder** — first `sos_responses.created_at` − `sos_alerts.created_at`, % within X min.

## Dropped
- **Invite engagement** — collapse trap (QR auto-renders → ~100%; distinct signal only exists as the lead-view panel expand).
