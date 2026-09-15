# RideInSync — North Star Metric

## The metric (plain language)
**Every month, count the riders who actually rode *with the group and stayed live-tracked the whole way* — divided by that month.**

> **A ÷ B** — **A** = the number of times a rider stayed live on the group map for most of a real group ride (a started, non-demo ride, ≥2 people, each tracked across ≥70% of the ride). **B** = one calendar month.

In one line: *how many people, this month, got the thing we promise — "ride together, nobody lost."*

## Why it matters
It's the one number that only climbs when RideInSync does its actual job: keeping a whole group of bikers visible to each other from start to finish. If it grows, the product is working; if it stalls, nothing else we ship matters.

## What it actually tells us
Not "how many signed up" or "how many opened the app" — but **how much real, delivered value happened**: people who set off as a group and made it through with everyone tracked, breaks and all. It's the sum of good group rides.

---

## Passes the three North-Star tests
(From the MPM "Analytics Systems" session — a North Star must encode both business and user value, be un-gameable, and predict future health.)

### Double-Value test — real user value *and* business value at once
Two things are baked into the one number:
- **User value** — the "stayed tracked the whole ride" gate. A rider only counts if they *actually got the promise* (visible to the pack, not lost).
- **Business value** — the "how many rides happened" volume. More tracked group rides = more usage, more word-of-mouth, more reason to return — the growth engine of a rides product.
It can't rise unless *both* are true — the same structure as the course's Zomato north star (orders **×** rated-4+). Remove either half and it collapses.

### Un-Gameability test — can't be spiked by cheap hacks
A discount, a marketing blast, or a pile of signups moves it **zero**. To inflate it you'd need real riders really tracked through real rides — which *is* the value. The **sustained ≥70% tracking** requirement is the un-gameable gate, doing the same job the "4+ rating" does in Zomato's north star. (A weaker "got one GPS fix" definition *would* be gameable and moat-blind — which is exactly why it was rejected.)

### Predictiveness test — forecasts tomorrow's health, not just today's
A rider who had a genuinely good tracked group ride is the rider who **comes back next weekend and brings friends** — the word-of-mouth loop the course calls the strongest evidence of real value. So this month's tracked-participations *predict* next month's rides and next season's growth. A gamed metric (signups, app-opens) predicts nothing — it can be high the month before a product dies. This one can't: it's only high when people are genuinely served, which is what makes them return.

---

## Exact definition (computable)
A **participation** qualifies when, for a **started, non-demo** ride in the month:
- the person **stayed live-tracked across ≥70% of the ride's active duration** (minute-bucket coverage — tolerant of short fuel/rest breaks, excludes riders who went dark and never returned), **or** is a **pillion linked to such a rider** (pillions send no position of their own, so they're credited via their rider); **and**
- the ride had **≥2 such participants** (a real *group* ride, not a solo).
Counted as **distinct (person, ride) pairs**, grouped by the **month the ride ended**.

## It's a DB metric — no new events
Every ingredient is already stored by the live product, so **no instrumentation is needed**:

| Ingredient | Source |
|---|---|
| Per-rider position timeline (for ≥70% coverage) | `rider_positions.recorded_at` |
| Ride end time | `rides.ended_at` |
| Started / real ride | `rides.status`, `rides.is_demo` |
| Who was in the ride (≥2, roles) | `ride_members` |
| Pillion attribution | `ride_pillion_links` |

The PostHog `rider_first_fix{got_fix=true}` event is only a **rough live proxy** (it counts "became trackable," not "stayed tracked ≥70%") and will run high. The real NSM is the SQL below.

## How to read it (SQL — `supabase/migrations/0033_north_star_metric.sql`)
Applied as views; read with:
```sql
-- headline number per month
select * from v_nsm_monthly;

-- drill into the underlying participations
select * from v_nsm_participations where ride_month = date '2026-09-01';
```
`v_nsm_monthly` gives `tracked_group_participations` (the North Star), plus `group_rides` and `distinct_riders` for context. Admin/service-role read only (`rider_positions` has RLS with no public SELECT).

## Caveats (know these before quoting a number)
- **Ride-start is approximated** from the first position (there's no `started_at` column). Precision upgrade: stamp a `started_at` on the draft→active transition in `startRide` — then the ≥70% denominator is exact.
- **70% is a judgment knob.** Set once; watch the **trend**, not the absolute level.
- **Unlinked pillions are excluded** (we can't place them on the map).
- **No mid-ride "leave" signal exists**, so "got lost" and "left early on purpose" are indistinguishable — the ≥70% coverage bar is the pragmatic proxy. A real leave-ride action would sharpen both this metric and the sweep/straggler UX.

## Guardrails — watch *beside* it, never inside it
- **Safety:** SOS delivery rate · SOS location-captured rate · SOS-reached rate. (A metric you want to climb can't contain a safety event you want rare.)
- **Tracking health / moat-failure:** R5 permission-granted rate · mid-ride drop-off (staleness) rate.

## Input metrics that ladder into it
Rides happening (L4 start rate, L5 completion) → riders becoming trackable (R5 permission, first-fix) → group forming (L2 payoff, R3 join completion) → engagement depth (rides per active rider).
