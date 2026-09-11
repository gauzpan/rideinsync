# Flow 1 — Onboarding Journey (Spec)

- **Owner:** Mithul · **Status:** ready-for-agent · **Date:** 2026-09-11
- **Related:** `PRD/PRD.md` (Flow 1 + Sections C, F), `docs/DATA_MODEL.md` (ownership matrix), `design/` (design system)
- **Platform:** React + Vite + TypeScript **PWA**, Supabase backend, Google Maps (not required by Flow 1). Auth: Google + guest.

## Problem Statement

A group of motorcyclists wants to ride together, but before the wheels move someone has to organise the group and everyone has to get *into* it. Today that happens over WhatsApp and phone calls: the organiser juggles who's coming, the route, the stops and roles in chat; riders swap numbers; and nobody has a shared, structured place that knows who is on the ride, what they ride, who to call in an emergency, and where the group is headed. New riders can't join quickly at a meetup, two-up (pillion) riders are invisible to any headcount, and safety details (emergency contact, vehicle, medical) live nowhere the group can use them. The result is slow, error-prone coordination and a group that starts a ride without actually knowing who is in it.

## Solution

A fast onboarding journey that gets a group from "let's ride" to "everyone is in the ride and accounted for" in minutes, from the rider's perspective:

- A **lead** signs in, creates one route-based **ride** (name, start, destination, optional stops/guidelines/permits/fee), and gets a **join code + shareable link + QR** to hand out.
- A **rider** taps the link (from anywhere — SMS/WhatsApp/email), scans the QR, or types the code, signs in (Google, or **guest** for a quick join), completes a **minimal profile** (name + one emergency contact + vehicle registration number), and lands inside the ride.
- A **pillion** (two-up passenger) joins as their own account, records their own name/emergency contact, and links to the rider whose bike they're on — so the group counts *people*, not just bikes, while the map still shows one dot per bike.
- The **lead** approves join requests, sees the roster, and assigns **Sweep** / **Co-lead**.
- Everyone lands on a read-only **Ride detail** (route, timings, guidelines, stops, fellow riders) and waits there until the lead starts the ride, at which point the live-tracking flow takes over.

Profiles are **progressive**: only the safety-critical minimum is required to join; medical, extra contacts, driving licence and vehicle characteristics are prompted but skippable and completable later.

## User Stories

**Account & entry**
1. As a new user, I want to sign in with Google, so that I have a persistent profile the group can rely on.
2. As a casual rider, I want to join as a guest without creating an account, so that I can hop into a ride handed to me at a meetup with no friction.
3. As a returning user, I want the app to remember my profile, so that I never re-enter my details to join another ride.
4. As a guest who decides to lead a ride, I want to be prompted to sign in with Google at that moment, so that I understand why a lead needs a real account without being blocked earlier.
5. As any user, I want one account regardless of whether I lead or ride, so that I can lead one trip and ride in another without a second sign-up.

**Lead — create & manage a ride**
6. As a lead, I want to create a ride with a name, start and destination, so that I have a single workspace for the trip instead of a WhatsApp thread.
7. As a lead, I want to add ordered route stops (fuel/food/rest/scenic), so that every rider sees the same plan.
8. As a lead, I want to optionally set expected group size, guidelines, permits and a fee note, so that riders know what to expect before joining.
9. As a lead, I want a join code, a shareable link and a QR for my ride, so that I can invite riders through whatever channel is handy.
10. As a lead, I want to review and approve or decline join requests, so that I control who is in my ride.
11. As a lead, I want to assign a Sweep and a Co-lead from the roster after riders join, so that responsibility is clear before we set off.
12. As a lead, I want to see the live roster with roles and pillion pairings, so that I know exactly who and how many people are on the ride.
13. As a lead, I want to be told when the ride is at capacity, so that I don't over-admit riders.
14. As a lead, I want a Google account required to create a ride, so that riders are never following a ride owned by an anonymous user who might vanish.

**Rider — join**
15. As a rider, I want to tap an invite link from anywhere and land straight in the join flow, so that I don't have to find or install anything first.
16. As a rider, I want to scan the ride's QR with my phone camera and be taken into the join flow, so that joining at a meetup is instant.
17. As a rider, I want to scan a QR from inside the app, so that I can join without leaving the app.
18. As a rider, I want to pick a saved QR image from my gallery to join, so that I can join from a screenshot someone sent me.
19. As a rider, I want to type the join code manually, so that I can still join when a link or scan fails.
20. As a rider, I want to preview the ride (name, lead, route, timings) before committing, so that I know I'm joining the right group.
21. As a first-time rider, I want to enter only the essentials to join — my name, one emergency contact and my vehicle registration number — so that I'm riding within minutes.
22. As a rider, I want to optionally add my bike's make/model/colour, a second emergency contact, medical info, driving licence and avatar, so that the group has richer info when I have time to add it.
23. As a rider, I want to give consent to data handling once, so that the app is compliant without nagging me.
24. As a rider, I want to know whether my join is pending the lead's approval or already accepted, so that I'm not left guessing.
25. As a rider who is already a member, I want a repeat join attempt to take me straight to the ride, so that I don't create duplicates.

**Pillion — join two-up**
26. As a pillion, I want to join the ride with my own account, so that my emergency contact and medical info are recorded under me, not buried in someone else's profile.
27. As a pillion, I want to indicate I'm riding two-up and pick which rider I'm with, so that the group knows who is on which bike.
28. As a pillion, I want to skip vehicle details, so that I'm not asked for a bike I don't have.
29. As a member of the group, I want a pillion to count in the headcount but not add a second dot on the map, so that the roster reflects people while the map reflects bikes.
30. As a pillion, I want a clear message if my rider hasn't joined yet, so that I know to wait for them before linking.

**Ride detail / handoff**
31. As a member, I want to land on a ride detail screen showing route, timings, guidelines, stops and fellow riders, so that I'm oriented before the ride starts.
32. As a member, I want to see everyone's role (lead/sweep/co-lead/rider) and pillion pairings on the roster, so that I know who is who.
33. As a member, I want the ride detail to wait until the lead starts the ride, then hand me to the live view, so that the transition into riding is obvious.

**Leaving / edge cases**
34. As a rider, I want to withdraw a pending request or leave a ride I joined before it starts, so that I can back out cleanly.
35. As a rider, I want a clear error when a join code is invalid or the ride has ended, so that I'm not stuck.

## Implementation Decisions

**Account & role model**
- One unified account; **role is per-ride** (`ride_members.role`), chosen by intent (create → leader; join → rider). No "lead account" vs "rider account". Confirmed decision D1/D17 (see project decision log).
- Auth: **Supabase Google OAuth + anonymous (guest)**. The existing `handle_new_user()` trigger provisions the `profiles` row for both. **Guests may join; leading requires Google** — a guest tapping "Start a ride" is prompted to upgrade to Google in place.

**Data model (respecting `docs/DATA_MODEL.md` ownership; Flow 1 = Mithul)**
- **Reads only** (seam tables, no ALTER): `profiles`, `rides`, `ride_members`.
- **Writes (own):** `rides` (creation columns, as leader), `route_stops`, `ride_join_requests`, `emergency_contacts`, `medical_profiles`, `vehicles`, `documents`, `consent_records`.
- Joining goes through the existing SECURITY DEFINER RPCs `request_join_ride(code)` and `approve_join_request(request_id)` — never a raw select+insert (non-members can't see a ride under RLS). Demo rides auto-approve.
- **New Flow-1-owned table** via an additive migration (`000N_flow1.sql`; never edit `0001_foundation.sql`) to model the pillion↔rider link without touching the `ride_members` seam:

  ```sql
  -- came from the design discussion, not a prototype
  create table ride_pillion_links (
    id             uuid primary key default gen_random_uuid(),
    ride_id        uuid not null references rides(id) on delete cascade,
    pillion_user_id uuid not null references profiles(id) on delete cascade,
    rider_user_id  uuid not null references profiles(id) on delete cascade,
    created_at     timestamptz not null default now(),
    unique (ride_id, pillion_user_id)      -- a person is one bike's pillion per ride
  );
  -- RLS: members of the ride can read; a pillion writes only their own link.
  ```

**Minimum-to-join (progressive profiling)**
- **Rider (own bike):** display name + 1 emergency contact + **vehicle registration number**. Make/model/colour are optional.
- **Pillion:** display name + 1 emergency contact + **link to their rider**. No vehicle.
- Optional-but-prompted for both: 2nd emergency contact, medical profile, driving-licence document, avatar. Completed later from the Flow 2 dashboard.
- For a live demo the single-emergency-contact requirement is a **soft** gate (warn + allow skip) so a walkthrough never dead-ends; conceptually a hard gate for production.

**Create-ride minimum**
- Required: ride name, start, destination. Optional: stops, expected capacity, guidelines, permits, fee.
- **Locations captured as text labels now** (stored in the `start_point`/`destination`/`route_stops.location` jsonb as `{ label }`); latitude/longitude backfilled when the Flow 3 Google Maps integration lands. Flow 1 does not depend on Maps.

**Invite & join entry**
- Invite screen exposes three redundant paths to the same code: **join code, shareable link, QR**.
- **Deep-link route** (e.g. `/join/:code`): tapping the link anywhere opens the PWA at this route, captures the code, and routes to sign-in (if needed) → ride preview → join. The join code must **survive the Google OAuth redirect round-trip** (stashed and restored on return); guest sign-in is in-page and needs no round-trip.
- **QR — all three mechanisms:** (a) the QR encodes the join URL so the phone's **native camera** opens it (zero app code); (b) an **in-app scanner** via `getUserMedia` + a QR-decode library; (c) **gallery image upload** decoded with the same library.
- Manual code entry is the always-works fallback.

**Roles & approval**
- Create-ride sets the creator as `leader`. **Sweep/Co-lead are assigned after riders join**, from the roster. Schema enforces one leader + one sweep per ride.
- Capacity ("full") is a **client-side guard** in MVP (the join RPCs live in the shared foundation and are not altered here); hard DB enforcement is a foundation change to coordinate with the team.

**Pillion behaviour**
- A pillion is a **first-class member with their own account**, so their emergency/medical data uses the standard owner-keyed tables — SOS (Flow 5) needs no special case.
- Only the **rider** publishes GPS; the pillion's position is suppressed so the map shows **one dot per bike**, while both appear in the roster. This requires Flow 3 to read `ride_pillion_links` (see Cross-flow seams below).

**Platform-capability isolation (per decision D18 — keep an Android/Capacitor migration cheap)**
- Wrap platform-touching capabilities behind **thin service modules** rather than calling browser APIs inline: **geolocation, camera/QR scanning, auth redirect, share/clipboard**. A future Capacitor wrap becomes a plugin-swap inside those modules, not a codebase-wide change.

**Consent**
- A single consent checkbox at profile creation writes one `consent_records` row (policy `dpdp`/`tnc`). Full T&Cs/privacy-policy copy is a launch prerequisite, out of scope for the build.

## Testing Decisions

- **What makes a good test here:** assert **external behaviour at the onboarding service seam**, not React component internals or Supabase call shapes. A test should read like a user outcome ("creating a ride yields a joinable code and a leader membership"; "a demo join produces an approved membership"; "a rider missing a registration number cannot complete join"; "linking a pillion records the pairing and marks them GPS-suppressed").
- **Single seam:** the framework-agnostic **onboarding service layer** (the functions wrapping Supabase queries + RPCs). All Flow 1 logic tests go through it; the UI is not the test surface.
- **Modules under test:** ride creation + code generation; join request/approve; profile/vehicle/emergency-contact/consent writes with minimum-field gating; pillion linking; ride-detail read assembly (ride + stops + roster + pillion pairings).
- **Prior art:** none yet — the repo is a scaffold with no tests. This seam and its tests establish the pattern other flows can follow (test the service layer, mock or use a Supabase test instance; keep RLS behaviour covered by the existing `docs/DATA_MODEL.md` RLS smoke tests).
- The **platform wrappers** (camera/QR, auth-redirect) are tested for their contract (decodes a known QR payload to a code; preserves and restores the code across a simulated redirect), not the underlying browser API.

## Out of Scope

- Live GPS tracking, the group-status map, turn-by-turn navigation, signals/haptics, SOS, ride-end summary/badges — Flows 3–6.
- The rich **home/dashboard hub**, profile *editing*, ride history and stats — Flow 2 (also Mithul), though Flow 1 reuses the landing page as a minimal launch point.
- **Open-ride discovery / browse / group directory** — future scope; MVP joining is invite-only.
- Payment processing (fee is a display-only field), full T&Cs/privacy-policy copy and DPDP legal text (a launch prerequisite, not a build item).
- Bluetooth mesh / off-grid, in-ride voice chat — P2/future.
- **Reliable *background* location** (tracking while the screen is off, the phone is pocketed, or another app is in focus) and **native push** — these need native and only arrive if/when the app is wrapped with Capacitor (decision D18). This is **not** "no location in the PWA": *foreground* location works fine in a PWA (Flow 3 tracks while the app is open on-screen, ideally holding the screen awake via the Screen Wake Lock API on a mounted phone), and web push works on Android / iOS 16.4+ installed PWAs. Only the screen-off / app-not-in-focus case is the native gap. (All of this is Flow 3's concern, not Flow 1 — noted here only so the platform scope isn't misread.)
- Hard DB-level capacity enforcement and mid-ride "leaving" status (`member_status = 'leaving'`) — the latter is Flow 3/4 territory.

## Further Notes

- **Cross-flow seams to coordinate:** Flow 2 owns the real hub/dashboard (Flow 1 uses the landing page as a stand-in); Flow 3 consumes the "start ride" handoff and must read `ride_pillion_links` to suppress the pillion's map dot and expect no GPS from pillions; Flow 5 (SOS) benefits automatically because a pillion is a real member.
- **Design system:** all UI uses `design/` tokens only (no raw hex/px/fonts), reuses `src/components/ui/` primitives (Button, Card) and ports the needed ones (Input, SegmentedControl, Stepper) preserving their prop contracts; dark-first, single lime accent per screen, ≥56px targets, sentence case, no emoji.
- **Demo reliability:** lean on manual code entry or native-camera QR with **guest** sign-in for the live walkthrough (no OAuth round-trip); show the link/QR as the real-world path.
- **Publishing:** this spec is written to `docs/` because no issue tracker/label vocabulary is configured in this environment. To publish it to the project tracker with the `ready-for-agent` label, run `/setup-matt-pocock-skills` first, then re-run `/to-spec`.
