# Ridepod Solution Space (v2)

## Core Scope

- PWA web app first and then Android app
- One ride, one pod, 4-8 riders per pod
- Target launch: single pod, deterministic demo mode

---

## Flows by Owner &amp; Sequencing

### Flow 1: Onboarding (Mithul)

**Dependencies:** None (first-use blocker)

**Must-have:**

- Account creation: Lead and Rider role selection
- Mobile login: OTP primary, Google fallback
- Lead role first-time: create ride (name, city, start, destination, route stops, member count, role assignment, guidelines, permits); fees field UI-only (payment processing: future scope)
- Lead shares: invite link or QR
- Lead approves: join requests
- Rider role first-time: provide name, phone, 2x emergency contacts, avatar, basic medical profile, vehicle details, driving license
- Rider role repeat: fetch profile data, join via invite link
- After approval: display ride route, timings, guidelines, route stops, fellow rider details

**Nice-to-have:**

- Browse and request open rides (future)

**Decisions pending:**

- Fees (marked ***): future scope. App will host rides, enable joining, and collect fees via app later. Not v1.
- Basic medical profile: capture accident-relevant data (blood type, allergies, medications); add to T&amp;C/privacy policy for consent
- Driving license validation: self-upload v1; external verification (future scope)

---

### Flow 2: Ride Dashboard (Mithul)

**Dependencies:** Flow 1 complete, user logged in

**Must-have:**

- Profile view: name, phone, emergency contacts, vehicle details, avatar (CRUD)
- Ride stats: rides completed, distance covered, rides led, badges earned
- Preferences: haptics on/off, voice notifications on/off, push notifications on/off

**Nice-to-have:**

- Browse available open rides
- Expanded stats view

**Notes:**

- Can run parallel to Flow 3 once Flow 1 is stable
- Acceptance: CRUD on profile fields must persist; stats refresh on ride completion

---

### Flow 3: Trip View (Rajat)

**Dependencies:** Flow 1 complete, user in approved ride

**Must-have:**

- Display ride members (names, roles)
- Display route details and map
- One lead, one sweep per ride
- Mapbox turn-by-turn navigation (v1.1 only; v1.2+ blocked for now)
- Lead only: start trip button
- GPS publishing: all riders share location every 30 seconds (default, configurable by Lead/Sweep)
- GPS data access: toggle per rider to show all riders' locations or Lead/Sweep only
- Lead trail visible to all riders (bread-crumb map)

**Nice-to-have:**

- Accelerometer integration

**Decisions pending:**

- None (GPS interval and access clarified)

---

### Flow 4: Signals &amp; Haptics (Pratyusha)

**Dependencies:** Flow 3 running, riders publishing GPS

**Must-have:**

- Separation detection: two-level check. Level 1: distance threshold from lead/cohort (km). Level 2: time behind; system notifies Lead and Sweep when either triggers
- Stopped rider detection: system detects; prompt rider to select from fixed stoppage reasons; "other" option records via voice
- Rider status controls: stopped, rejoining, leaving (explicit user action)
- System auto-detect: rider reached destination, stop sharing location, notify pod
- Pitstop signal: Lead marks pre-planned or dynamic pitstop; system notifies pod
- Alert and acknowledgement states: seen/unseen, delivered to Lead/Sweep

**Nice-to-have:**

- Accelerometer-based signals

**Decisions pending:**

- Separation threshold: two-level check. Level 1: distance-based separation (km). Level 2: time behind lead (for confirmation)
- Stoppage reasons: fixed options list; "other" option allows voice instruction recording
- Haptic patterns: pending. Brainstorm after mapping available device haptics and finalizing signal types needed

---

### Flow 5: SOS (Shubham)

**Dependencies:** Flow 3 running, rider in active trip

**Must-have:**

- In-app emergency SOS button (manual, explicit user action)
- Automatic SOS trigger: when rider separated (distance/time threshold) + no signal received after stoppage prompt
- Alert routing: immediate notification to Lead, Sweep, fellow riders

**Nice-to-have:**

- External integration: Sampark QR, emergency contacts outside pod

**Decisions pending:**

- External audience (Sampark QR): post-MVP scope
- SOS trigger: immediate alert to Lead/Sweep when accident-prone rider detected (separation threshold met + no signal received after stoppage prompt)

---

### Flow 6: Ending Journey (Gaurav)

**Dependencies:** Flow 3 running, Lead marks trip complete

**Must-have:**

- Rider confirmation: "I reached home" acknowledgement
- Trip feedback: format TBD (questions to be formulated by Gaurav)
- Ride stats update: distances, times, badges
- Close ride: mark as complete, stop accepting new joins
- Badge award: immediate in-ride announcement + persistent on dashboard

**Nice-to-have:**

- Social share: "ride completed" post

**Decisions pending:**

- Feedback format: questions to be formulated later

---

### Flow 7: GTM &amp; Analytics (Mithul + all)

**Dependencies:** Flows 1-6 complete and tested

**Must-have:**

- Demo/simulation mode: deterministic data for investor/user demos
- User onboarding: sign-up to first ride setup (UX walkthrough or tutorial)

**Nice-to-have:**

- Analytics dashboard

**Decisions pending:**

- PM feedback (5): need 5 PM validations on idea and flow. Already have 2 complete
- Demo mode: real user data preferred. If unavailable, use synthetic GPS data for deterministic playback
- Analytics: metrics scope to be decided later
- Android Studio setup time: still in discussion with Rajat

---

## Sequencing &amp; Readiness

### Phase 1 (Blockers)

1. Android Studio setup (Rajat) - still in discussion; clarify if blocking other work
2. Flow 1: Onboarding (Mithul) - gates all downstream flows

### Phase 2 (Parallel)

3. Flow 3: Trip View (Rajat)
4. Flow 2: Dashboard (Mithul) - can start after Flow 1 core is stable

### Phase 3 (Dependent on active ride)

5. Flow 4: Signals (Pratyusha)
6. Flow 5: SOS (Shubham)
7. Flow 6: Ending (Gaurav)

### Phase 4 (Pre-launch)

8. Flow 7: GTM &amp; demo mode (Mithul + all)

---

## Open Questions for Team


| Item                  | Owner     | Blocker? | Notes                                                                                                           |
| --------------------- | --------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| Fees collection logic | —         | No       | Future scope: app will host rides, enable joins, collect payments later                                         |
| Haptic patterns       | Pratyusha | No       | How many distinct patterns? Linked to which signals?                                                            |
| Feedback format       | Gaurav    | No       | Questions to be formulated later                                                                                |
| Badge award criteria  | Gaurav    | No       | Distance, safety, first ride (speed excluded—not a competition). Visibility: immediate announcement + dashboard |
| Android setup time    | Rajat     | Possibly | Still in discussion; clarify if blocking other prep work                                                        |
| PM feedback (5)       | Mithul    | No       | Need 5 PM validations on idea and flow; 2 of 5 complete                                                         |
| Demo mode approach    | Mithul    | No       | Real user data if available; synthetic GPS data as fallback                                                     |
| Analytics scope       | Mithul    | No       | Metrics scope to be decided later                                                                               |


---

## Notes

- Flow numbering: SOS and Ending Journey were both labeled "Flow 5"; renumbered to 5 and 6 here
- All "Future" items moved to Nice-to-have
- Decisions marked with *** or ?? are flagged in the table above
- Acceptance criteria and sequencing dependencies shown explicitly to surface integration points

