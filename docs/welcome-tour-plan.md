Plan: First-time experience + complete app tour
Locked choices from your answers: teaser on landing + full tour after sign-in, hybrid (dedicated welcome route plus one-time contextual nudges), single tour (no lead/rider branch), localStorage persistence (same pattern as voice onboarding).
1. What exists today (reuse, do not reinvent)
- Landing (src/pages/LandingPage.tsx): hero with radial lime glow + mixed-weight tagline, YourRides, values Carousel (5 cards), Google/guest sign-in. Guests land here; signed-in users are bounced / to /home by AppLayout.tsx:239.
- Post-login home (src/pages/HomePage.tsx): greeting, ActiveRideHero, create/join quick actions, setup nudge, voice nudge, stats, privacy line.
- Shell: AppLayout.tsx gates PUBLIC_PATHS = [/, /ride/create, /create], shows one-time VoicePermissionSheet on /home via usePersistedToggle("voice.onboarding.seen"). Same key pattern is the model for tour memory.
- Tour legs already in the app: /home (create/join) → /ride/create → /ride/:id/invite (code/link/QR) → /join/:code → /ride/:id (rider detail) / /ride/:id/lead (roster, capacity editor, LiveOps map, SOS) → /ride/:id/summary → /discover, /groups, /profile, /sos.
- Primitives to reuse only: Card, Button (one accent action per screen), Carousel (dots, lime active), Icon, Mark, usePersistedToggle, tokens (--color-accent #C4F82A, --color-surface-*, --space-*, --radius-full/lg/md, --text-*). Sentence case, no emoji, no em dashes, tap targets >=56px, visible focus rings.
2. Proposed structure
A. Landing teaser (pre sign-in, no new route)
Keep the page as-is, add one compact strip under the hero (above YourRides):
- 3-step inline row: Create or join → Ride in sync → Help one tap away. Each step: lime-tinted 40px icon badge (map, users, signal), 2 to 3 word title, one short line. Static, not a carousel (the values carousel below already covers depth).
- One secondary link See how it works that smooth-scrolls to the existing Why RideInSync carousel. No auth required, no persistence.
B. Welcome route (post sign-in, the single tour)
New route /welcome, added to src/router.tsx as an authenticated child of AppLayout (same guard as /home, not in PUBLIC_PATHS).
New file src/pages/WelcomePage.tsx:
- Full-screen sheet look borrowed from VoicePermissionSheet.tsx: ambient glow top-right, centered column, bottom sheet footer with actions. Max width 600px, var(--gutter) padding, safe-area aware.
- Content: 6 slides in the existing Carousel (swipe + dots, no auto-advance for readability, autoAdvanceMs={0}):
1. Ride together, stay together (icon users): one live map for every rider. Deep link: View a demo ride (secondary, goes /ride/demo).
2. Lead a ride (icon plus): create in under a minute, share code or QR. Deep link: Create a ride → /ride/create.
3. Join in seconds (icon scan/link): enter code or scan QR, wait for approval. Deep link: Join a ride → /join.
4. Know the pack (icon map): lead, co-lead, sweep, rider pins plus intact/behind/stopped/stale status. Deep link: Open the live map → active ride or /ride.
5. Help one tap away (icon signal): SOS plus hands-free sync voice signals. Deep link: Try voice commands (opens the existing voice sheet state, or /profile toggle).
6. Finish strong (icon flag): summary, badges, reached-home, feedback. CTA: Start riding (primary, accent) → /home.
- Footer per design language: one primary accent action (Next / Start riding on last slide), one ghost Skip tour, plus a text-button deep link per slide (secondary treatment, never competing accent). Progress: Slide X of 6 caption for screen readers plus carousel dots.
- Copy rules: titles 2 to 4 words sentence case, bodies one line (max two short sentences), warm second-person, bold-white key phrase inside muted sentence where emphasis is needed (signature mixed-weight device). No em dashes.
C. Contextual nudges (the hybrid half, max 3)
One-time dismissible Card rows, each with its own localStorage key via usePersistedToggle, shown only after the welcome tour is seen (or skipped):
- Home: only when no active ride and tour just completed: New here? Replay the app tour with Replay (→ /welcome) and x dismiss. Key tour.nudge.home.seen.
- Ride tab (RidesPage.tsx): only in empty state: No active ride yet. Create one or join with a code. Keys off existing empty state, no new key (or reuse home key).
- Lead view: only when ride is full or first pending request arrives: Raise capacity to admit more riders. This duplicates existing inline copy, so implement as a single-line hint, not a new card, if space is tight.
No coach-mark spotlight library. No tooltips over the map (touch-hostile while riding).
3. Gating and persistence
- Keys (all usePersistedToggle, string 1/0, same helper as voice):
- tour.welcome.seen (primary completion/skip flag).
- tour.nudge.home.seen (secondary, optional).
- AppLayout.tsx ordering after existing voice gate: if authenticated and pathname === "/home" and !voiceOnboardingSeen, show VoicePermissionSheet first (it primes AudioContext inside a user gesture, must not be reordered). Else if !tourSeen and pathname === "/home", Navigate to="/welcome" replace. /welcome itself sets the flag on Start riding or Skip tour, then navigates /home.
- Replay entry: add App tour row to the account menu (AccountBar.tsx, verify menu structure during implementation) → /welcome. Tour never blocks a rider mid-ride: never redirect from /ride/:id*, /join/*, or /sos.
4. Files to touch (implementation phase)
1. src/pages/WelcomePage.tsx (new): slides data, carousel, footer, usePersistedToggle("tour.welcome.seen").
2. src/router.tsx: add { path: "welcome", element: <WelcomePage /> }.
3. src/pages/LandingPage.tsx: teaser strip + scroll link only (no logic changes).
4. src/AppLayout.tsx: welcome redirect branch after the voice branch.
5. src/pages/HomePage.tsx: post-tour replay nudge (conditional card).
6. src/components/AccountBar.tsx: verify menu, add replay row (read first, smallest possible edit).
7. Optional: src/pages/RidesPage.tsx empty-state hint line if it reads naturally.
Explicitly out of scope: lead/rider branching, profile-column persistence (migration), video/animation, PWA install prompt changes, copy in ALL CAPS or emoji, any hard-coded hex/px outside tokens.
5. Verification
- npm run build clean; npm test (existing 70 pass / 2 skipped baseline) stays green.
- Manual: fresh guest → landing teaser visible → sign in → voice sheet → /welcome → skip and complete paths → /home nudge shows once → dismiss persists on reload → replay from account menu → deep links (/ride/create, /join, /ride/demo) resolve → signed-out user hitting /welcome bounces to / → mid-ride routes never redirect.
- Readability check: each slide body under ~140 characters, titles sentence case, one accent button per viewport, dots + slide count announced, focus ring visible on Next/Skip, 56px targets.
6. Risks and open calls
- Voice-sheet vs tour order is load-bearing for mic priming; keep voice first.
- Carousel auto-advance defaults to 5000ms; must pass 0 on the tour so readers are not rushed.
- Guest sessions vanish on sign-out, so tour-seen is per-device by design (accepted per your localStorage choice).
- If AccountBar has no menu slot, fallback replay location is a Take the tour again ghost button at the bottom of /home behind the same key.