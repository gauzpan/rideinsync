# **Group Ride App  Consolidated Document**

---

## **PART 1: PRODUCT DECISIONS (Locked In)**


| Decision Area                   | Choice                                                                                                                                                    | Reasoning Note                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform                        | PWA (Progressive Web App), not native iOS/AndroidSingle codebase served through the browser, installable on both platforms without separate native builds | PWA (Progressive Web App), not native iOS/AndroidSingle codebase served through the browser, installable on both platforms without separate native builds |
| Maps provider                   | Google Maps                                                                                                                                               |                                                                                                                                                           |
| Backend for real-time data      | Supabase                                                                                                                                                  | Chosen for real-time subscriptions, managed Postgres, and faster setup than a custom server                                                               |
| Offline maps P2                 | Vector-based                                                                                                                                              | Lower storage footprint than tile-based                                                                                                                   |
| Weather and traffic data P1     | Google Maps and Google Weather                                                                                                                            | Keeps the app on a single map/data vendor                                                                                                                 |
| Location/ride history retention | Retained until the ride ends; deadline for full data set at leader/admin discretion during ride creation                                                  | Leader sets the retention window when creating the ride                                                                                                   |
| Pace enforcement                | Soft warning only, triggered by both distance-from-group and time-lag thresholds                                                                          | No hard enforcement or auto-removal. MVP ships with fixed, app-wide default thresholds. Per-ride configurable thresholds are future scope, not MVP        |
| Leadership structure P1         | Multi-leader supported                                                                                                                                    | Co-leader role confirmed from day one, not deferred                                                                                                       |
| App type                        | Standalone app                                                                                                                                            | Not a feature bolted onto an existing app                                                                                                                 |
| Monetization                    | Freemium, in-app purchases for advanced features                                                                                                          | Which features are paywalled is still open                                                                                                                |
| Interaction model               | Voice-first                                                                                                                                               | Priority is minimal touch and minimal visual distraction while riding                                                                                     |


**Open item:** We still need to decide which specific managed real-time DB or server architecture to use, and which features to place behind the in-app purchase wall.

---

## **PART 2: CONSOLIDATED PROBLEM STATEMENTS AND USER STORIES**

Product must solve five linked jobs:

1. **Discover** a compatible trip or community to join.
2. **Organize** people, route, roles, documents, stops, and safety details before departure.
3. **Coordinate** dynamically during the trip, including locations, regrouping, hazards, delays, and unplanned stops.
4. **Protect** participants through consent-based location sharing, emergency workflows, and secure handling of sensitive information.
5. **Remember** the trip through a shared record of route, stops, photos, incidents, and participants.


| MVP Personas                  | Description                                                                                                               |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
|                               |                                                                                                                           |
| Trip Organizer / Ride Captain | Group-trip organizers who creates and manage a trip—members, route, stops, timing, roles, updates, and safety information |
| Lead Rider / Navigator        | The Lead Navigator role can initially be a permission assigned to the organizer or another participant.                   |
| Sweep/Tail Rider              | The sweep rider stays at the last and ensure nobody is silently left behind                                               |
|                               |                                                                                                                           |
| Regular Participant           | The individual who is participating as a fellow rider in the group                                                        |


## **Problem Summary**

When 5–10 motorcycles ride together, the lead and sweep have no simple real-time way to know whether the group is intact, a rider is falling behind, someone has stopped, or the ride has split at traffic. Existing navigation is individual-first: it guides a rider to a destination but does not show the operational state of the group.

### **A. Location &amp; Status Awareness During Rides**


| Problem                                                                                                                                                    | Persona                             | User Story                                                                                                           | Description                                                                                                     | Effort                                                                                                                                                     | Priority |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Riders in a group cannot see each other's live location or status, causing riders to fall behind or lose sync, leading to panic, delay, or unplanned stops | Rider                               | I want to see my position relative to other riders so I can adjust my speed without panicking or calling anyone      | Live map view with relative position, not just absolute GPS pins                                                | Moderate                                                                                                                                                   | P0       |
| Group leader has no consolidated view of all riders' location and status                                                                                   | Group Leader, Co-leader             | I need a consolidated summary of every rider's location and status, including anyone off track                       | Map plus list view, refresh frequency configurable by leader                                                    | Moderate                                                                                                                                                   | P0       |
| Riders lose contact with the group in low or no network regions                                                                                            | Group Leader, Co-leader, All Riders | I need location and status to keep working even when cellular network is weak or absent                              | Use device-to-device mesh network (Bluetooth) as a fallback for status and location sharing when cellular fails | High, this is a distinct technical build separate from the cellular-based tracking, requires its own evaluation of Bluetooth mesh range and battery impact | P2       |
| Riders separated at junctions or forks cannot quickly tell who is missing or where they were last seen                                                     | Sweep/Tail Rider, Group Leader      | I need to see each rider's last known position and timestamp so I can identify who is missing after a junction split | Last-known-location marker with timestamp, distinct from live marker                                            | Moderate                                                                                                                                                   | P0       |
| Riders want relative pace awareness without hard rules                                                                                                     | All Riders                          | If I fall too far behind in distance or time, I want a soft warning, not a forced stop or removal from the group     | Threshold-based warning using both distance and time lag, tunable                                               | Moderate                                                                                                                                                   | P1       |


---

### **B. Emergency Detection and Response**


| Problem                                                                                  | Persona           | User Story                                                                                                  | Description                                                                                                                                  | Effort   | Priority |
| ---------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| No standard way to alert the group during an accident                                    | All Riders        | I need one action to alert the group, my leader, and my emergency contact with my location and medical info | **SOS** trigger via voice or hardware button, sends to all relevant parties at once                                                          | Moderate | P0       |
| Riders cannot detect emergencies involving people nearby who are not part of their group | All Riders        | I want to be notified if any app user nearby has an emergency, even if they are not in my group             | GPS-proximity-based emergency broadcast to all app users in range; MVP scope is GPS only, no mesh dependency required for this specific case | Moderate | P2       |
| Emergency contact has no way to get notified automatically                               | Emergency Contact | I need to receive a notification with the rider's location and medical summary if an emergency is triggered | SMS and push notification with location link                                                                                                 | Small    | P1       |


---

### **C. Group and Trip Creation, Discovery, Onboarding**


| Problem                                                                                                                               | Persona        | User Story                                                                                                             | Description                                                                     | Effort   | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | -------- |
| Bikers currently coordinate trips over WhatsApp because there is no dedicated tool                                                    | Trip Organizer | I need a single workspace to create and manage a trip: members, route, stops, timing, and roles                        | Structured trip creation flow replacing ad hoc chat coordination                | Large    | P0       |
| Riders want to start a ride quickly with new or existing riders without spending time building a WhatsApp group or exchanging numbers | Rider          | I want to onboard fellow riders into the app quickly at the start of an excursion so we can begin riding without delay | Fast add-rider flow, likely QR code, shareable link, or nearby-device detection | Moderate | P0       |
| Discovering trips or groups to join is not centralized; riders search Google or ask friends                                           | Rider          | I need to discover trips by location, date, travel mode, difficulty, distance, group size, pace, and experience level  | Searchable/filterable trip discovery feed                                       | Moderate | P0       |
| New riders have no way to connect with established, popular riding groups                                                             | New Rider      | I want to find and request to join active or popular groups relevant to my interests                                   | Group directory with join requests                                              | Moderate | P1       |
| New users need a fast, jargon-free way to learn the app                                                                               | New Rider      | I need a short guided onboarding that gets me riding within minutes                                                    | Under 5 screens, skippable, plain language                                      | Small    | P1       |


---

### **D. In-Ride Communication and Signaling**


| Problem                                                                                               | Persona                | User Story                                                                                                                         | Description                                                                                                                                                                                                                                                                          | Effort                                                                                                                                               | Priority |
| ----------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Typing or interacting with a phone while riding is distracting and creates a safety risk              | All Riders             | I want to signal status (stopping, hazard, help) with minimal or no touch                                                          | Voice-first commands, single hardware button press as fallback                                                                                                                                                                                                                       | Moderate to Large depending on voice recognition scope                                                                                               | P0       |
| Riders lose track of the current route or stop plan mid-ride                                          | All Riders             | I always want to know the latest route and stop plan without needing someone to repeat it                                          | Persistent route/stop display, auto-updates if leader changes plan                                                                                                                                                                                                                   | Moderate                                                                                                                                             | P0       |
| Riders cannot easily signal hazards or a changed plan to others behind them                           | Lead Rider, All Riders | I want to signal a hazard or a route change, so trailing riders are warned in time                                                 | Push alert to all riders, minimal-interaction trigger                                                                                                                                                                                                                                | Moderate                                                                                                                                             | P0       |
| Riders want to stay entertained and connected during long rides, not just exchange status updates     | Rider                  | I want to constantly communicate with my ride mates during the ride to make the journey more enjoyable, not just send status pings | Voice chat channel, distinct from status signaling, needs to be low-distraction. In scope for MVP, but requires a feasibility spike first (group voice quality over cellular at riding speeds, battery drain, Bluetooth headset compatibility) before committing to a build timeline | Moderate to Large, voice chat over a moving group with variable connectivity is a nontrivial build; size cannot be finalized until the spike is done | P2       |
| Riders want a single app for navigation, tracking, and SOS instead of switching between multiple apps | Rider                  | I want navigation, buddy tracking, and SOS in one app so I do not need to switch apps mid-ride                                     | This is a scope confirmation across features A, B, and existing navigation, not a separate build                                                                                                                                                                                     | N/A, covered by combined scope of other items                                                                                                        | P0       |


---

### **E. Route Planning and Points of Interest**


| Problem                                                                                 | Persona                 | User Story                                                                                | Description                                          | Effort   | Priority |
| --------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- | -------- |
| Leaders plan routes without visibility into fuel, hospitals, mechanics, or scenic stops | Group Leader, Co-leader | I need to map a route and see relevant points of interest along it before the ride starts | Route builder with POI overlay from Google Maps data | Large    | P0       |
| Riders have no way to share in-route stops with the full group                          | Group Leader, Rider     | I need every group member to see the same in-route stops I've set as leader               | Shared stop list synced to all riders' devices       | Moderate | P0       |
| Riders want weather and traffic warnings during the ride                                | All Riders              | I want to be notified of weather changes or traffic issues along my route while riding    | Pulls from Google Maps (traffic) and Google Weather  | Moderate | P1       |


---

### **F. Rider Profile, Privacy, and Data Handling**


| Problem                                                                                   | Persona       | User Story                                                                                                                      | Description                                                                                                                                                                                             | Effort                                         | Priority |
| ----------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| Riders store identity, emergency contact, health, and legal documents in scattered places | All Riders    | I need one place to store identity details, emergency contacts, health info like blood group, state permits, and bike documents | Structured profile with secure document storage                                                                                                                                                         | Large                                          | P1       |
| Riders are concerned their personal information could be misused                          | All Riders    | I want full control and confidence that my personal data is not misused                                                         | Explicit privacy controls, visibility settings per data type                                                                                                                                            | Moderate, plus legal review                    | P0       |
| Riders do not want their location shared once the ride session has ended                  | All Riders    | I do not want my location visible to my group once the ride is over                                                             | Location sharing must hard-stop at ride end; this needs to be reconciled with the retention decision, see note below                                                                                    | Small to Moderate                              | P0       |
| The app collects location data and needs to comply with data protection law               | Product/Legal | We need terms and conditions, community guidelines, and DPDP Act compliance since we collect location data                      | Legal documentation, not a feature build, but a hard prerequisite before launch. Action item: draft terms and conditions and privacy policy documentation. Timeline and ownership still to be discussed | Moderate, mostly legal effort, not engineering | P0       |


**Note on the conflict between "stop sharing location after ride ends" and "retain history until leader-set deadline":** these are not actually in conflict once separated. Live location visibility to the group should stop the moment the ride ends; that is a real-time sharing setting. Historical route data retention (used for stats, past ride records) is a separate stored dataset governed by the leader's retention deadline. The distinction needs to be reflected in the UI so riders understand that "stop live sharing" does not mean "delete my ride data."

---

### **G. Ride History, Stats, and Motivation**


| Problem                                                              | Persona    | User Story                                                                                 | Description                                                           | Effort   | Prirority |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------- | --------- |
| Riders have no historical record of past rides for recall or sharing | All Riders | I want a historical record of my rides so I can recall or share them later                 | Ride history log, subject to the retention deadline set by the leader | Moderate | P1        |
| Riders want stats like break time, average speed, and total distance | All Riders | I want to see stats from my ride including break time, average speed, and total kilometers | Post-ride summary screen                                              | Moderate | P1        |
| Riders want to compare progress and stay motivated to keep riding    | All Riders | I want to see my progress over time so I stay motivated to keep doing solo and group rides | Trend view across multiple rides, badges optional                     | Moderate | P2        |
| Riders want to suggest or share past routes with others              | All Riders | I want to share a route I've ridden so others can explore it                               | Route sharing from history into the discovery feed (see section C)    | Small    | P1        |


---

### **H. Solo Rider Safety**


| Problem                                                                            | Persona    | User Story                                                                               | Description                                         | Effort              | Priority |
| ---------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | -------- |
| Solo riders have no way to share live location or status with an emergency contact | Solo Rider | I want to share my live location and status with my emergency contact during a solo ride | Opt-in live share, distinct from group-ride sharing | Moderate            | P1       |
| Solo riders need the same SOS capability as group riders                           | Solo Rider | I need the same emergency alert capability when riding alone                             | Reuses the SOS build from section B                 | Small, mostly reuse | P0       |


---

## **PART 3: DEPENDENCY VIEW**

Rider Profile (F)  
    ↓  
Trip/Group Creation (C) ──→ Route Planning (E)  
    ↓  
Live Tracking (A) ──← Mesh Network Fallback (A, low-network case)  
    ↓  
Signaling &amp; Communication (D) ←→ Emergency Response (B)  
    ↓  
Ride History &amp; Stats (G) ←→ Solo Rider Safety (H)

Legal/Privacy/DPDP (F) → gates launch, cuts across all sections  
Voice-first interaction (D) → cuts across A, B, D

---

## **PART 4: EFFORT SUMMARY**


| Section                                | Rough Sizing      | Notes                                                                                                      |
| -------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| A. Location &amp; Status               | Moderate to High  | Mesh network fallback is the highest-risk item here                                                        |
| B. Emergency Response                  | Moderate          | Proximity-based stranger alert is GPS-only for MVP, keeps scope contained                                  |
| C. Group/Trip Creation &amp; Discovery | Large             | This is the WhatsApp-replacement core, likely the biggest single chunk of MVP work                         |
| D. Communication &amp; Signaling       | Moderate to Large | Voice chat between moving riders is the riskiest sub-item, worth prototyping early to validate feasibility |
| E. Route Planning                      | Large             | Google Maps integration plus POI overlay                                                                   |
| F. Profile &amp; Privacy               | Large             | Includes legal/DPDP work, not just engineering                                                             |
| G. History &amp; Stats                 | Moderate          |                                                                                                            |
| H. Solo Rider Safety                   | Small to Moderate | Mostly reuse of B                                                                                          |


**Honest flag:** these are relative sizing labels, not day or sprint counts. No hour or cost estimate should be treated as reliable until each section gets its own technical spike, particularly the mesh network fallback and the in-ride voice chat, both of which carry real feasibility risk that a rough label cannot capture.

---

## **PART 5: OPEN QUESTIONS STILL UNRESOLVED**

**Resolved since last version:**

- Real-time backend: Supabase  
- Weather/traffic provider: Google Maps and Google Weather

**Still open, to discuss:**

1. Which features sit behind the in-app purchase wall
2. Bluetooth mesh range and battery drain testing approach, and the minimum device compatibility floor
3. Ownership and timeline for drafting terms and conditions, privacy policy, and DPDP Act compliance documentation; this can block launch independent of engineering readiness

**New risks from the PWA platform decision, flagged for discussion, scope not yet changed:** 4 Bluetooth mesh fallback (Section A) may not be buildable on iOS as a PWA. iOS Safari does not support Web Bluetooth at all, and Android browser support is inconsistent. This needs a decision: drop the fallback for iOS, find an alternative mechanism, or accept the feature is Android-only 5 Background location tracking is weaker in PWAs than native apps, particularly on iOS, where location access can be lost once the app is not the active tab or the screen locks. This affects live tracking and status sharing (Section A) whenever a rider's phone is not actively in view during the ride, needs a technical spike to confirm actual behavior on target devices

**Confirmed as future scope, not MVP:**

- Per-ride configurable pace-warning thresholds (MVP uses fixed app-wide defaults instead)

**Added to MVP scope, pending a feasibility spike:**

- In-ride voice chat between riders. This is now in scope, but the spike (voice quality at riding speed over cellular, battery drain, Bluetooth headset compatibility) needs to happen before it gets a firm effort estimate or timeline placement

---

## **PART 6: UX & INTERACTION PRINCIPLES**

A standing checklist for every screen in every flow — not a one-time review, something each flow owner
checks their own screens against as they're built.

- Choices per screen
- Make targets large
- Follow familiar patterns
- Group related information
- Break content into chunks
- Interactions within 400 ms
- Highlight the primary action
- Place key actions nearby
- Put essentials first
- End flows memorably
- Show visible progress
- Simplify complex interfaces
- Use sensible defaults
- Prevent errors proactively
- Make errors recoverable
- Maintain pattern consistency
- Connect related elements visually
- Reduce task completion time
- Reveal complexity gradually
- Make completion feel closer

**Already reflected in flow-level decisions on record** (not repeated at length here): the ≥56px tap target
and glove-friendly-touch rule in the design system is *make targets large*; the MSF hand-signal vocabulary
adapted digitally for group-ride signals is *follow familiar patterns*; sender attribution on signals
(showing who flagged a hazard, not just what) is *connect related elements visually*; signal-density scaling
by rider experience is *reveal complexity gradually* and *use sensible defaults*; reusing one haptic/audio
pattern per urgency tier instead of a unique one per signal type is *maintain pattern consistency* and
*simplify complex interfaces*; stopped-rider confirmation delays and duplicate-hazard-report coalescing are
*prevent errors proactively*.

**Concrete decisions this checklist has already produced, by flow:**

| # | Principle | Decision | Flow |
|---|---|---|---|
| 1 | Interactions within 400ms | Applies to *local* UI response only — button-press feedback, a cancel/dismiss tap, an "I'm okay" acknowledgment — not push delivery, which is network-dependent and can't be bounded that tightly. | Flow 4/5 |
| 2 | Make errors recoverable | A brief cancel window (e.g. 3-5s) between an SOS trigger and it actually dispatching, to recover from an accidental press — distinct from being able to dismiss an alert that's already live. Once dispatched, delivery is never throttled or delayed. | Flow 5 |
| 3 | Show visible progress | The sender of a signal (not just Lead/Sweep) should see delivery progress — "Sent → Delivered → Seen by {lead}" — not just silence after tapping SOS or a hazard call. | Flow 4/5 |
| 4 | Show visible progress / Break content into chunks | The mandatory iOS "Add to Home Screen" onboarding step needs visible step progress ("Step 1 of 3"), not a static wall of instructions — it's also the one onboarding step that has to be screenshot-driven rather than voice-guided, since it walks through OS-level gestures. | Flow 1 |
| 5 | End flows memorably | Nothing currently marks "ride complete, everyone accounted for" as its own positive moment — everything in the signals taxonomy is routine or urgent. Built from status data Flow 4 already tracks (manual status, reached-destination), but belongs to Flow 6's territory to design and own. | Flow 4 → Flow 6 |
| 6 | Choices per screen / Reveal complexity gradually | The preferences panel shouldn't expose every individual signal as its own toggle — too many choices on one screen, and works against signal-density scaling. Default to tier-level controls (Critical/High/Medium/Low), with per-signal overrides behind an "advanced" layer. | Flow 2 |

---

## **PART 7: BETA LAUNCH READINESS CHECKLIST**

Standard pre-launch checklist, cross-checked against what's actually decided/built for this app rather than
applied blindly — a few items aren't real requirements here, and a few directly hit gaps already on record
elsewhere in this doc or the gap analysis.

| # | Item | Applies to this app's beta? | Owner / flow | Note |
|---|---|---|---|---|
| 1 | Onboarding | Yes | Flow 1 | Includes the mandatory iOS "Add to Home Screen" step (Part 6, row 4) — easy to forget it's part of onboarding, not a separate settings task. |
| 2 | Sign-up and login | Yes | Flow 1 | OTP primary, Google fallback, per the solution-space spec — no password path. |
| 3 | Email verification | **Likely N/A** | Flow 1 | Auth is phone OTP + Google OAuth, not email/password — confirm there's no email step hiding in the Google fallback before skipping this, but don't build one speculatively. |
| 4 | Password reset | **Likely N/A** | Flow 1 | Same reason as above — there's no password to reset in a passwordless (OTP) flow. Flag explicitly so nobody builds this for a flow that doesn't need it. |
| 5 | Account deletion | **Blocked, not just unbuilt** | Flow 1 / legal | Doesn't exist anywhere in the PRD or solution space yet, and it's not just a missing feature — it's very likely required by the same DPDP Act compliance work already flagged as a "hard prerequisite before launch" (gap analysis item 9). Can't be checked off independently of that. |
| 6 | User permissions | Yes | Flow 1 / Flow 3 | Two layers: role permissions (Lead/Sweep/Member — note the multi-leader ambiguity in gap analysis Conflict 1 is still unresolved), and device permissions (location, notifications, camera for QR scan). |
| 7 | Empty states | Yes | All flows | No ride yet, no ride history, nobody's joined the roster yet, no signals fired yet. |
| 8 | Loading states | Yes | All flows | GPS acquiring, push subscription pending, route/map loading. |
| 9 | Error states | Yes | All flows | Especially: GPS permission denied, push subscription failed (the iOS non-installed case from `signals_haptics_plan.md` §10 is a real, expected error state, not an edge case), ride-join failure. |
| 10 | Slow or no internet connection | **Partially blocked** | Flow 3 | Two already-flagged, unresolved platform risks sit under this: the Bluetooth mesh fallback (unbuilt, Android-only if it ships) and background-location reliability on iOS PWAs (gap analysis risk). This item can't be fully checked off until those are resolved, not just tested. |
| 11 | User data actually saves correctly | Yes | All flows | Every Supabase write path once built — profile, ride, positions, events. |
| 12 | Test your payment flow | **N/A for beta** | — | PRD Part 1: fees field is UI-only, payment processing is explicitly future scope, not v1. Flag so nobody spends beta-prep time testing something that isn't built. |
| 13 | Test notifications | Yes — the big one | Flow 4/5 | This is the entire subject of `signals_haptics_plan.md`. Given how much of that doc is real iOS-vs-Android platform gaps (haptics Android-only, push requiring iOS install-to-home-screen), this has to mean testing on **real iOS Safari and Android Chrome devices**, not just a simulator — a simulator won't surface most of what that doc found. |
| 14 | Add analytics | **Scope change, not just a task** | Flow 7 | Currently sits as "metrics scope to be decided later" in the solution-space doc's open questions — this checklist item makes it a beta-launch requirement, not a deferred nice-to-have. Worth raising that scope change with Mithul explicitly, not assuming it's already agreed. |
| 15 | Add crash reporting | **New requirement** | Unassigned | Not mentioned anywhere in the PRD or architecture docs today. Needs a tool decision (e.g. Sentry) and an owner before beta, not just a checkbox. |
| 16 | Check your privacy setup | **Blocked** | Legal / Flow 1 | Same blocking dependency as account deletion (row 5) — Problem F's privacy controls and DPDP compliance are both already flagged P0 / hard-prerequisite and still unresolved. This can't be "checked" until that work exists. |
| 17 | Check accessibility | Yes | Design | The design system already has the rules (≥56px targets, focus rings, colorblind-safe encoding — see `signals_haptics_plan.md` §4) — this checklist item is the actual verification pass against those rules, not a rule-writing task. |
| 18 | Test different devices and screen sizes | Yes | All flows | Given how platform-specific this app's real constraints are (see row 13), this must explicitly include iOS Safari vs. Android Chrome behavior, not just responsive-layout testing across screen sizes. |
| 19 | Test every critical user flow | Yes | All flows | End to end on real devices: create ride → join ride → active tracking → SOS → ride end. |
| 20 | Give it to real beta testers before launch | Yes — already in motion | Flow 7 | This is exactly what the LinkedIn/Instagram beta-waitlist landing page (published separately this session) is recruiting for. |

**Add analytics to debug, specifically** — the addition called out alongside this checklist deserves its own
line: analytics here isn't only product usage metrics (row 14), it needs to answer "did this push actually
deliver," "why didn't this signal fire," "did the stopped-rider dwell timer behave as designed." That's a
different capture surface (delivery/failure events per signal, not just screen views) — worth specifying to
whoever builds analytics (Flow 7) before they scope it as a generic usage-tracking task.

## **Solution**

A lightweight Android app that:

1. Lets a lead create one route-based group ride.
2. Lets riders join using a simple invite code or QR code.
3. Provides in-app turn-by-turn navigation on a single shared route.
4. Shares each rider’s live GPS position during the active ride.
5. Gives lead and sweep a live map and a simple, explainable group status:
  - **Intact**  
  - **Rider behind**  
  - **Rider stopped**  
  - **Location stale**
6. Lets a rider manually mark: *Stopped*, *Rejoining*, or *Leaving ride*.

## **Hackathon architecture**

## Implementation Plan

`Web app/ Android app — Kotlin / Jetpack Compose`  
`├─ Mapbox Navigation SDK`  
`│  ├─ Shared route display`  
`│  ├─ Turn-by-turn guidance`  
`│  ├─ Route progress`  
`│  └─ Simulated navigation for demo`  
`│`  
`├─ Android location layer`  
`│  ├─ Fused Location Provider`  
`│  ├─ User-started tracking session`  
`│  ├─ Location update every 5–10 seconds`  
`│  └─ Foreground notification, if feasible`  
`│`  
`├─ Supabase Realtime Database`  
`│  ├─ rides/{rideId}`  
`│  ├─ members/{memberId}`  
`│  ├─ locations/{memberId}`  
`│  ├─ events/{eventId}`  
`│  └─ live aggregate group state`  
`│`  
`└─ App UI`  
   `├─ Create/join ride`  
   `├─ Rider navigation screen`  
   `├─ Lead/sweep operations map`  
   `├─ Event/alert card`  
   `└─ Demo simulation controls`



&nbsp;

PWA (React + Vite or similar)

├─ Pages

│  ├─ Create Ride

│  ├─ Join Ride

│  ├─ Rider View (route + status)

│  ├─ Lead/Sweep View (live map + events)

│  └─ Demo/Simulation controls

│

├─ Location layer

│  ├─ navigator.geolocation.watchPosition()

│  ├─ Foreground-only updates every 5–10 seconds

│  ├─ Clear watch on ride end / tab close

│  └─ Explicit “Tracking active” UI state

│

├─ Supabase Realtime Database

│  ├─ rides/{rideId}

│  ├─ members/{memberId}

│  ├─ locations/{memberId}

│  ├─ events/{eventId}

│  └─ live aggregate group state

│

└─ Web Share / QR

   ├─ navigator.share() for invite link

   └─ QR code generation and optional camera-based scan  