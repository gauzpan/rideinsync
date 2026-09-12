# Signals, Haptics & Notifications — Planning Doc (Flow 4)

Owner: Pratyusha. Status: **planning only, nothing implemented.**
Reads alongside `PRD/PRD.md`, `PRD/ridepod_solution_space_v2.md` (Flow 4/5), `PRD/ridepod_gap_analysis.md`, and `design/`.

## 1. Scope & dependencies

Flow 4 (Signals & Haptics) is gated on Flow 3 (Rajat — GPS publishing). The codebase is currently a bare
scaffold: no location layer, no Supabase schema, placeholder pages only. Nothing here can be built until
Flow 3 lands — this phase is taxonomy, research, and design spec, not code.

Overlaps to manage explicitly, not duplicate:
- **Flow 5 (SOS, Shubham):** auto-SOS trigger reuses Flow 4's separation-detection logic. Needs one shared
  detection module with an explicit interface, not two implementations.
- **Flow 2 (Preferences, Mithul):** ships blanket haptics/voice/push on-off toggles. Needs a decision on
  whether safety-critical signals (SOS, separation) can be fully silenced by a rider.
- **Hazard / route-change alerts (Problem D, P0):** unowned in the gap analysis, likely falls to this flow
  since it shares the same delivery infrastructure as everything else here — needs explicit confirmation.

## 2. Signal taxonomy

The core missing artifact. Every downstream decision (thresholds, preference granularity) depends on this
list existing and being agreed with the team first. Delivery columns fold in the platform research from §3/§7
— two design decisions shape every row, stated once rather than repeated 21 times:

- **Haptic patterns are reused per urgency tier, not unique per signal.** The Vibration API only gives us
  on/off durations (§7b) — no intensity, no texture — and humans reliably distinguish only a handful of
  coarse patterns by feel (pulse count/length), not twenty distinct ones. Assigning a unique buzz per signal
  would be over-engineering against both the API and human perception. Four tier patterns, Android-only:
  **Critical** `[400,150,400,150,400]` (insistent triple pulse) · **High** `[300,100,300]` (double pulse) ·
  **Medium** `[200]` (single pulse) · **Low** — no vibrate.
- **Voice copy below is draft, not final.** Sentence case, warm second-person tone, no emoji, per `Agents.md`
  — needs an actual copy/voice pass, not a sign-off on these exact words. `{sender}` denotes the
  sender-attribution requirement from §2b. "Push" means "reaches a backgrounded/locked phone" (§7a) — see §2d
  for why that's not the same thing as "voice will also fire" in that state.

| Signal | Trigger | Audience | Urgency | Push (backgrounded/locked) | Voice / audio (draft) | Visual | Haptic (tier, Android-only) |
|---|---|---|---|---|---|---|---|
| Separation L1 (distance) | GPS threshold | Lead, Sweep | Medium | Yes | "{rider} is falling behind." | `RiderListRow` status flips (medium token) | Medium |
| Separation L2 (time-behind) | GPS threshold | Lead, Sweep | Medium-High | Yes | "{rider} has been behind for a while — check in." | `RiderListRow` status flips (medium-high token) | Medium |
| Stopped-rider detected | GPS/motion | Rider (prompt), then pod | Medium | Yes | To the rider: "Looks like you've stopped. Let the group know you're okay." | New stoppage-reason prompt/sheet (no existing component) → then `RiderListRow` update | Medium |
| Manual status (stopped/rejoining/leaving) | Rider action | Pod | Low-Medium | No — in-app only | "{rider} is {status}." | `RiderListRow` status line | Low |
| Reached destination | Auto | Pod | Low | No | — | `Checkpoint` (finish) | Low |
| Pitstop | Lead action | Pod | Low | No | "Pitstop called by {lead}." | `Checkpoint` (mid-route) | Low |
| Hazard-left / hazard-right | Lead or rider action | Trailing riders | **High** | Yes | "Hazard on your left/right, from {sender}." | New alert card (high token) + `GroupMap` pin at sender's position | High |
| Road hazard (general, no direction) | Lead or rider action | Trailing riders | High | Yes | "Hazard ahead, from {sender}." | Same as hazard-left/right | High |
| Slow down / speed up | Lead action | Trailing riders | Medium | Yes | "Slow down, signaled by {sender}." / "Speed up, signaled by {sender}." | Lightweight toast, no severity token | Medium |
| Pull-over | Lead action | Trailing riders | High (meaning is group-configurable, see §2b) | Yes | "Ease off and pull over — signaled by {sender}." | Alert card (high token) | High |
| Stop here | Lead action | Trailing riders | High | Yes | "Stop here — called by {lead}." | Alert card (high token) | High |
| Fuel stop / refueling | Lead action | Pod | Low | No | "Fuel stop ahead, called by {lead}." | `Checkpoint` (shares Pitstop) | Low |
| Regroup | Lead action | Pod | Medium | Yes | "Regroup called by {lead}." | Alert card (medium token) + `GroupMap` highlight of regroup point | Medium |
| Cops-ahead | Lead or rider action | Trailing riders | Medium | Yes | "Police ahead, from {sender}." *(flagging this phrasing for a legal/policy check, not just copy — broadcasting police locations is common practice, e.g. Waze, but worth confirming explicitly before shipping verbatim)* | Alert card (medium token) + `GroupMap` pin | Medium |
| Location pin | Any rider or Lead action | Pod | Low-Medium (context-dependent, see §2c) | No (unless auto-pinned from a separation timeout, see §2c) | "{sender} dropped a pin — {label}." | New pin marker type on `GroupMap` (not in `RiderMarker`'s current role set) | Low |
| SOS manual | Rider action | Lead, Sweep, pod | Critical | Yes | "SOS from {rider}. Location shared." | Full alert card (critical token), top-of-stack, persists until ack | Critical |
| SOS auto | Separation + no response | Lead, Sweep | Critical | Yes | "No response from {rider} — SOS triggered automatically." | Same as SOS manual | Critical |
| SOS peer-witnessed *(suggested, see §2c)* | Another rider reports a crash they saw | Lead, Sweep | Critical | Yes | "{witness} reports {rider} may be down." | Same as above, flagged as witness-reported (see §2c on trust/verification handling) | Critical |
| All-clear / I'm okay *(suggested, see §2c)* | Rider action | Pod or sender of the prompt it answers | Low | No | "{rider} says they're okay." | Brief toast / `RiderListRow` reverts | Low |
| Weather/traffic warning *(suggested, see §2c)* | System (Google Maps/Weather) | Pod | Medium | Yes | "{condition} ahead on the route." | Route-level banner + `GroupMap` route-line treatment (not rider-specific) | Medium |
| Alert ack (seen/unseen) | — | Lead/Sweep UI state | — | — | — | Badge on the alert card itself, reusing `ConnectionCard`'s delivered/connected pattern | — |

**New UI surfaces this table needs that don't exist yet, beyond the alert-card gap in §4:** a stoppage-reason
prompt/sheet, and a location-pin marker type distinct from `RiderMarker`'s lead/sweep/member roles. Both need
design work before Flow 4 can build against them.

Action: get this table (audience + urgency) reviewed with Shubham (SOS overlap) and whoever owns hazard
alerts before locking channel/pattern design.

## 2a. Persona research — reconciled against actual personas

External motorcycle-rider research came in (5 generic industry segments: daily commuter, weekend group
rider, long-distance tourer, new/learner rider, delivery/gig rider). Cross-referenced against the personas
actually defined in `PRD/PRD.md` (Trip Organizer/Ride Captain, Lead Rider/Navigator, Sweep/Tail Rider,
Regular Participant) and the locked MVP scope (single route-based group ride, one pod, 4-8 riders):

| External persona | Maps to | In MVP scope? |
|---|---|---|
| Weekend group rider (pack of 3-15) | Lead / Sweep / Regular Participant | **Yes — this is the MVP persona.** Most of the research below applies directly. |
| New/learner rider | A Regular Participant, not a separate flow | Partially — relevant as a *signal-density default*, not a new persona (see §6) |
| Long-distance tourer (multi-day, alone/loose pair) | Solo Rider Safety (Problem H) | **Not in MVP.** Gap analysis already flags solo safety as an unresolved scope question. Overdue/ride-timer and satellite-SOS ideas are worth parking on the v2 backlog, not designing now. |
| Daily commuter (solo, urban) | Solo Rider Safety (Problem H) | **Not in MVP**, same reason — this app's locked scope is explicitly group-ride only. |
| Delivery/gig rider | No match | **Out of scope entirely.** Nothing in the PRD addresses commercial/income-linked delivery riding. Flagging so it doesn't quietly creep into the taxonomy. |

Net: fold the pack-riding research into the taxonomy now (§2b); park solo/tourer material as v2 backlog
contingent on the Problem H scope decision; drop the delivery persona.

## 2b. Pack-riding signal vocabulary and what it changes

The pack-rider research gives a concrete answer to what was previously one generic "hazard / route change"
row: a defined vocabulary (translated MSF hand signals) rather than a single catch-all alert. Reflected in
§2's taxonomy above. It also surfaces two product decisions that weren't previously captured:

- **Sender attribution is required, not optional.** Whether the lead or the tail rider flagged a hazard
  changes how urgently the pack should react — every delivery of these signals (haptic/voice/visual) needs
  to carry *who* sent it, not just what it is. This has a UI cost (`RiderListRow`/`RoleBadge` already encode
  who's who — the alert component from §4 needs to reuse that, not invent a separate identity treatment).
- **Signal meaning must be group-configurable.** Whether "pull-over" means "hazard ahead, slow but keep
  moving" or "literally stop" varies by group convention. This is a ride-setup decision, not a UI nicety —
  belongs in Flow 1 (Mithul, ride creation), not buried in Flow 4. Needs to be raised with him.

## 2c. Requested signals — mapped, plus what I'd add

Requested set: police ahead, stop here, speed up, road hazard, location pinned, slow down, refueling, SOS.
Mapped against §2: police ahead → **cops-ahead** (already present), speed up/slow down/refueling/SOS →
already present under those names. Three didn't have a clean existing row and are now added above:

- **Stop here** — distinct from pull-over, deliberately. §2b already flagged that "pull-over" is ambiguous
  between "hazard ahead, ease off" and "literally stop." Rather than resolve that ambiguity with a
  configuration setting, giving the group **two separate, unambiguous signals** — pull-over (ease off,
  hazard-adjacent) and stop-here (a deliberate full stop, e.g. regroup point or a genuine required stop) —
  removes the ambiguity at the vocabulary level instead of pushing it into a setting nobody will remember to
  configure correctly mid-ride. Worth considering as the resolution to that open item rather than a
  configurability feature.
- **Road hazard (general)** — hazard-left/hazard-right assumes the rider triggering it can identify a side.
  Debris or a pothole dead ahead doesn't have a side. Kept as its own row rather than folded into
  hazard-left/right so the signal vocabulary doesn't force a false choice.
- **Location pin** — not quite the same job as Pitstop. Pitstop is lead-planned, route-level. A location pin
  is ad hoc: marking a hazard's exact spot, a meeting point, or — directly from the PRD's own problem
  statement (Problem A: "riders separated at junctions... need last known position and timestamp, distinct
  from live marker") — a rider's last-known location when they've gone quiet. That last use case is
  currently unaddressed anywhere in the taxonomy; worth treating location-pin as the general mechanism and
  "auto-pin on separation timeout" as one of its triggers, rather than building last-known-location as a
  separate one-off feature.

**Three more I'd suggest, not yet confirmed, all sourced from gaps already on record rather than invented
fresh:**

1. **SOS peer-witnessed.** The current model has two SOS triggers: rider-initiated (manual) and
   system-detected (auto, via separation + no response). Missing: another rider *sees* a crash happen and
   reports it. In real pack riding this is often the fastest path to help — faster than waiting on a
   separation timeout — and it's a materially different trust/verification case from either existing trigger
   (a witness claim, not a self-report or a sensor inference). Worth discussing with whoever owns Flow 5
   before folding it into "SOS manual," since routing and false-report handling likely differ.
2. **All-clear / I'm okay.** Closes the loop after a stopped-rider prompt or a hazard alert without
   necessarily meaning "rejoining" (existing manual-status option). Cheap to add, and directly reduces the
   false-alarm/cry-wolf exposure already flagged in §3 — a rider who can respond "I'm fine" in one tap to a
   stopped-rider prompt is less likely to trigger an escalation the group doesn't need.
3. **Weather/traffic warning.** This isn't new scope invention — it's Problem E (P1) from the gap analysis,
   already written down as unbuilt ("riders want weather and traffic warnings... pulls from Google Maps and
   Google Weather"), just never folded into this taxonomy because it's system-sourced rather than
   rider-triggered. Flagging it here so it doesn't get lost between "Flow 4 signals" and "Flow 3 maps/GPS"
   ownership, since it plausibly needs both.

**Considered and deliberately left out:** formation-change signals (single-file/double-file) from the
standard MSF vocabulary. Real, but lower-value for a 4-8 rider pod than for a 15-rider one, and adds
vocabulary size right after §2b already flagged signal-density-by-experience as a real cognitive-load
concern for newer riders. Worth a v2 candidate, not a v1 addition.

## 2d. Worked example, in full: Separation L1 (distance)

Chosen because it's the highest-frequency signal in the taxonomy — unlike SOS or hazard calls, this fires
routinely during a normal ride, which makes the debounce/foreground-state questions matter more here than
anywhere else in §2's table.

**Who receives it, and when:** Lead and Sweep only, per §2 — not the lagging rider themselves (flagged as a
gap below). Fires once per state transition (crossing the distance threshold), not on every subsequent GPS
tick while the rider stays over it — repeat-firing every 30s while someone's steadily 0.6mi back would make
this the first signal to trigger alert fatigue, directly feeding the cry-wolf risk already in §3.

**Foreground vs. backgrounded changes what actually fires, which §2's table doesn't capture on its own:**
- **Lead/Sweep app open and foregrounded:** the event should arrive over the existing Supabase Realtime
  subscription (already part of the architecture per `ARCHITECTURE.md`), not a round-trip through Web Push —
  push is for when the app isn't active. In-app update only: status line change, optional local
  `navigator.vibrate()` call, optional spoken line.
- **Lead/Sweep phone locked/backgrounded:** delivered via the `showNotification()` push path from §7a, which
  bundles the vibrate pattern (Android only, §7b) into the notification itself. **Voice does not fire in
  this state** — `SpeechSynthesis` needs an active foreground page/tab; a backgrounded PWA has no route to
  speak through the user's headset. §2's "Push: Yes" column says the alert *reaches* a locked phone — it
  doesn't mean the voice line goes with it. A Lead riding with their phone locked/mounted gets push +
  (Android) vibrate, and nothing spoken, until they next glance at or unlock the phone.

**Haptic (Android only):** Medium tier, single pulse, `[200]`ms — per §2's tier-reuse rationale, deliberately
not a unique pattern. 200ms is long enough to register, short enough not to read as urgent, since separation
is a routine, expected-to-happen event, not an emergency. Two platform caveats worth naming for this specific
signal: Android Do Not Disturb / battery-saver modes can silently suppress the vibrate, and it doesn't fire
at all on iOS (§7b) — an iOS Sweep has no haptic path for this signal, full stop, same as everywhere else.

**Visual:** `RiderListRow` is already designed for exactly this — its own `.prompt.md` spec gives
`<RiderListRow name="Jon Diaz" role="member" distance="0.3 mi" status="Fell behind" />` as a worked example,
so this is the one row in the whole taxonomy with a component built for it, not just reusable for it. Needs
the Medium-tier warning token from §4 (not the currently-hardcoded sweep-coral reuse) once that token exists.
The status text itself ("Fell behind") already satisfies the colorblind-safe requirement from §4 — it isn't
color-only, it's paired with text — worth noting as the one place the design already does this right by
default. Gap: `GroupMap`'s `RiderMarker` has no documented "lagging" visual state (per its `.prompt.md`, it
only varies by role + a `you` halo) — a lagging rider currently looks identical on the map to one riding
normally, which undercuts the whole point of a live map for exactly this signal.

**Audio/voice:** Draft line from §2: *"{rider} is falling behind."* Deliberately no distance in the spoken
line — a spoken number is harder to retain than a glanced-at number, so precision stays on the visual layer
(`RiderListRow`'s `distance` field) and voice stays short. Should queue behind an in-progress turn-by-turn
prompt rather than interrupt it, unlike Critical signals which should interrupt — this priority ordering
wasn't stated before and needs to be explicit once voice queuing gets built. Depends on the still-open Web
Speech API Safari capability check from §3 — don't assume this works on iOS without verifying.

**Gaps this worked example surfaces, not yet resolved elsewhere in this doc:**
- The lagging rider gets no feedback at all under the current audience definition (Lead/Sweep only). A
  private nudge to the rider themselves ("you're falling behind, ease up or signal the group") seems like an
  obvious addition — it lets the rider self-correct without needing Lead to intervene — but it's a scope
  change to §2's audience column, worth confirming rather than assuming.
- There's no defined "separation resolved" signal — when a lagging rider catches back up, does
  `RiderListRow` just silently revert to "On route," or does that transition get its own (presumably Low-tier,
  visual-only) acknowledgment? Currently undefined.

## 3. Platform capability research — do this first

The PRD assumes native-style haptics ("brainstorm patterns after mapping available device haptics"). This
is a PWA, and the gap is bigger than a brainstorm:

- **iOS Safari has never implemented `navigator.vibrate()`.** Zero haptic feedback on iPhone, full stop.
  Haptics are Android-only unless we find a workaround (there isn't a reliable one).
- Android Chrome supports the Vibration API, but only on/off duration patterns — no intensity/waveform
  control like native Taptic Engine or Android's newer haptic APIs.
- Web Push on iOS only fires if the PWA is installed to the home screen (iOS 16.4+). A browser-tab session
  gets nothing — consistent with the background-tracking risk already flagged for Flow 3.
- Backgrounded/lock-screen behavior (phone mounted, screen off mid-ride) is unreliable for PWAs, especially
  iOS — same underlying platform risk as GPS tracking in the gap analysis, applies identically here.
- Web Speech API (`SpeechSynthesis` for voice output, `SpeechRecognition` for input) has inconsistent Safari
  support — needs its own capability check, not an assumption.

**Deliverable:** a capability matrix (iOS Safari PWA / Android Chrome PWA × vibration / push / speech) built
from actual device testing, before any pattern design. This determines whether "haptics" ships as a real
cross-platform feature or an Android-only enhancement — same category of decision as the Bluetooth mesh
fallback already flagged as Android-only.

**Also in scope for this research pass:** false-positive ("cry wolf") threshold tuning for stopped-rider
detection. Pack riding in stop-start city traffic (lights, junctions) risks constant false triggers if the
detection model isn't tuned for that movement pattern specifically — this needs real-world threshold testing
against actual stop-start riding data, not just an API capability check. Getting this wrong erodes trust in
every other alert fastest, since riders learn to ignore a system that cries wolf.

## 4. Design language alignment

Checked against `design/tokens/colors.css` and the `feedback/` + `tracking/` component inventory.

**Reusable as-is:**
- `RiderListRow` — status line already flips color on off-nominal status (`status !== 'On route'`). Fits
  separation/manual-status signals directly, and its name/role/avatar layout is the natural home for the
  sender-attribution requirement in §2b.
- `RoleBadge` — role color-coding (lead=lime, sweep=coral, member=blue) already establishes who an alert is
  about.
- `Checkpoint` — reached/upcoming/finish states map cleanly onto pitstop, fuel-stop, and destination-reached
  signals.
- `ConnectionCard` — status-line + "connected" accent-flip pattern is the closest existing analog to an
  alert-delivery state (e.g. "delivered" / "seen"), though it's built for device pairing, not alerts.
- `VoiceBlob` (idle/listening/speaking) — natural fit for voice-delivered signals; may need a distinct visual
  state for "speaking an alert" vs. normal voice interaction, to be confirmed with design.

**Gaps — need design work, not ad hoc invention:**
1. **No alert/toast/banner primitive.** Nothing in `feedback/` is shaped for a hazard, separation, or SOS
   card. Building one is in scope for this flow, but it should go through the same design process as other
   primitives (`.jsx` + `.d.ts` + `.prompt.md`), not get improvised inside a page component.
2. **No severity color token, and color alone can't carry meaning.** Only `--color-status-positive`
   (`#C4F82A`, lime) exists. The "coral" used for off-route status is `--color-role-sweep` reused informally,
   not a real negative/warning token. A signal system with medium/high/critical tiers needs actual tokens
   (e.g. `--color-status-warning`, `--color-status-critical`) added to `design/tokens/colors.css` — a
   token-file change, treated as a source-of-truth update per `Agents.md`, not a per-component hack. Any new
   severity token must pair with icon shape/position, never stand alone — colorblind riders can't
   distinguish red/green at a glance at speed, and this is exactly the kind of cue where that matters most.
3. **Tension with "one accent action per screen, used scarcely."** Critical alerts (SOS, hazard) are
   inherently urgent and need to visually interrupt — that's in tension with the design system's scarcity
   rule for the lime accent. This needs an explicit exception agreed with whoever owns the design system
   (a severity color, not lime, should probably carry that weight), not a silent deviation.
4. Any alert/voice copy must follow existing constraints: sentence case, no emoji, warm second-person tone
   consistent with the rest of the product.
5. Manual-trigger controls (SOS button, pitstop mark, status change) must meet the ≥56px tap target and
   visible accent focus ring rules already enforced elsewhere — and per §5, these need to work reliably
   through riding gloves, which the existing ≥56px spec wasn't written with gloves in mind. Worth confirming
   whether that number still holds or needs revisiting for this use case specifically.
6. **Cancel/dismiss must be the single easiest gesture in the app.** Every emergency-trigger signal (SOS
   manual/auto, stopped-rider prompt) depends on this to keep rider trust — worth stating as an explicit
   interaction requirement before those flows get designed, not left implicit.

## 5. Channel / severity framework (hypothesis, not decided)

Given riding context — engine noise, gloves, helmet, phone mounted or pocketed — haptic alone is unlikely to
be perceptible mid-ride, and it's unavailable on iOS regardless. Working hypothesis to validate against the
capability matrix in §3:

- **Voice/audio** — primary channel while riding, consistent with the locked-in voice-first interaction
  model, and the safest option for any signal that must reach a moving rider without a screen glance.
- **Haptic** — confirmatory/secondary at best; Android-only, no intensity gradation.
- **Push/visual card** — primary for Lead/Sweep dashboard glance (stationary, more tolerant of screen time),
  secondary for riders mid-ride. If a visual indicator is ever shown to a moving rider, it needs peripheral/
  edge placement rather than center-screen, and colorblind-safe encoding per §4.

Each taxonomy row in §2 should get an explicit channel combo based on urgency once §3 confirms what's
actually available per platform.

## 6. Open decisions

- Per-signal vs. global preference toggles (Flow 2) — raise with Mithul; blanket off-switches risk silencing
  SOS/separation alerts. Also feeds the signal-density-by-experience question below.
- Hazard/route-change alert ownership — confirm explicitly, it's currently unassigned.
- Separation thresholds (distance/time) are bounded by Flow 3's GPS publish interval (30s default) — pick
  numbers jointly with Rajat, not in isolation.
- SOS auto-trigger interface with Shubham — shared detection logic, single source of truth.
- Severity color tokens and the "scarce accent" exception — needs sign-off from the design system owner
  before any alert component is built.
- Signal-convention configurability (§2b) — needs a home in Flow 1's ride-creation flow; raise with Mithul.
- **Signal density should scale with rider experience, not ship as one fixed default.** A newer/lower-
  confidence Regular Participant plausibly wants a reduced signal set (turn/stop/hazard only) with
  complexity opt-in rather than opt-out, to avoid signals becoming a distraction rather than a safety aid.
  This is a Flow 2 preferences question, not something to hardcode into Flow 4.

## 7. Delivery mechanics — how push and haptics actually get implemented

Verified against current sources (caniuse, MDN compat data, Supabase docs), not assumed. Confirms and
sharpens §3/§5.

### 7a. Push notifications

- **Mechanism:** Push API + Service Worker + VAPID key pair. Client calls
  `registration.pushManager.subscribe()` with the VAPID public key, the resulting subscription object gets
  stored server-side (a Supabase table), and the server pushes via the `web-push` npm library using the
  VAPID private key.
- **Concrete path for our stack:** Supabase ships an official example for exactly this —
  a database-webhook-triggered Edge Function (`supabase/functions/push/index.ts`) that calls `web-push` when
  a row changes. That's the natural trigger point for `ride_events`/`event_acknowledgements` inserts once
  Flow 3's schema is live — an event insert fires the webhook, the Edge Function pushes. No separate push
  service needed. ([Supabase docs](https://supabase.com/docs/guides/functions/examples/push-notifications))
- **Android Chrome:** full support, in a browser tab or installed PWA, delivers even when the app is fully
  backgrounded or the phone is locked.
- **iOS:** requires iOS 16.4+, **and the PWA must be installed to the home screen** — a plain Safari tab
  never gets push, even with permission granted, and there's no automatic install prompt (user has to do
  Share → Add to Home Screen manually). This makes "prompt the rider to install to home screen" a real
  onboarding step, not an optional nicety, if push is going to reach iOS riders at all.
  ([Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications))
- **Footnote, low relevance for this product:** iOS 17.4+ removed installed-home-screen-web-app support
  entirely in the EU (Apple's DMA compliance change). Given this app's India-focused context (DPDP Act
  references elsewhere in the PRD), this is unlikely to matter, but flagging in case that changes.
  ([9to5Mac](https://9to5mac.com/2024/02/15/ios-17-4-web-apps-european-union/))
- **Background Sync API is not supported on iOS at all** — separate from push, but relevant if event
  delivery ever needs offline queueing.

### 7b. Vibration — two genuinely different mechanisms, both currently Android-only

1. **`navigator.vibrate()`** — foreground-tab only, JS-triggered, requires a user gesture. Android Chrome:
   supported. **iOS Safari: officially still unsupported** — caniuse lists every iOS Safari version through
   the current one (26.6) as "Not supported." There's one unconfirmed anecdotal report (an open, unresolved
   GitHub compat-data issue, no maintainer confirmation, no Apple documentation) claiming it now works on
   some current iOS build — not something to plan around.
   ([caniuse](https://caniuse.com/mdn-api_navigator_vibrate),
   [GitHub issue](https://github.com/mdn/browser-compat-data/issues/29166))
   There's also a known unofficial hack (`ios-vibrator-pro-max` / vibrator.dev) that fakes vibration through
   interaction-event tricks. It's explicitly branded "unofficial," admits inconsistent feel ("if you don't
   feel anything, drag slower"), and has no production-safety guarantee — not viable for a safety feature.
2. **The `vibrate` option inside `ServiceWorkerRegistration.showNotification()`** — a *separate* capability
   from `navigator.vibrate()`. This is the pattern that fires as part of a push notification, which means it
   can vibrate the phone even when the app isn't open — the actual scenario that matters for a mounted phone
   mid-ride. Pattern syntax: an array of milliseconds, alternating vibrate/pause
   (`vibrate: [300, 100, 400]`). Per current docs, this is **also Android-Chrome-only**.
   ([Chrome samples](https://googlechrome.github.io/samples/notifications/vibrate.html))

**Net:** haptics are Android-only end to end, in both the foreground and background/lock-screen paths. The
background path (mechanism 2) is the one that actually matters for this product — a rider mid-ride has the
phone mounted or pocketed, not held with the tab in focus — and it's exactly as unavailable on iOS as the
foreground one. This confirms and sharpens §5: iOS riders get **no haptic channel at all**, foreground or
background, official or unofficial-and-reliable. Voice/audio is not just the preferred channel for iOS, it's
the only one that works.

### 7c. What a push notification can visually carry — and what it can't

A `showNotification()` payload can carry title, body, icon, badge, image, action buttons, and a `tag` (for
grouping/replacing). But **the OS-level notification chrome itself can't be recolored by severity** — no
app control over the system notification's background/accent color on either platform. This means the
severity-color-token work in §4 applies to the **in-app alert component**, not the push notification banner.
The push notification is the wake-up mechanism; the in-app card is where severity actually reads visually.
iOS notification payloads are generally more restrictive than Android's (action-button and rich-media support
is inconsistent) — needs device verification before relying on anything beyond title/body/icon for iOS.

### 7d. Notification sound — a third, distinct constraint from push and vibration

Short answer: **yes, but the OS push notification itself can't carry a custom sound — only in-app audio can,
and only once foregrounded and unlocked.**

- **The Web Notification API has no standardized custom-sound option**, confirmed current as of 2026 — the
  entire surface is `silent: true` / `silent: false` (the OS's system-default sound, or nothing). There's no
  way to make an SOS push sound different from a routine one via the standard API, on either platform.
  ([Pushpad](https://pushpad.xyz/blog/sound-on-web-push-notifications),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notification/silent))
- The only place a genuinely distinct sound (a siren for Critical vs. a gentle chime for Medium) is possible
  is **in-app audio while foregrounded** — an `<audio>` element or Web Audio API triggered off the same
  Supabase Realtime event, same foreground/backgrounded split already established in §2d for voice.
- **iOS gates this behind a user gesture, and — worth flagging specifically — it still does on an installed
  PWA.** Android Chrome has relaxed autoplay restrictions for installed PWAs; Apple has not extended the same
  exception to iOS home-screen apps. So even after a rider completes the §10 "Add to Home Screen" step,
  in-app sound still needs a prior tap to unlock `AudioContext` — most realistically the "Start Ride" tap
  already in the flow, which should double as the audio-unlock gesture rather than assuming sound just works
  once installed. ([MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay),
  [Apple developer forums](https://developer.apple.com/forums/thread/126342))

**Design recommendation — add sound as a two-stage cue for High/Critical, not a decoration:** a short,
distinct tone (an earcon) played immediately before the spoken line, not instead of it. Tones cut through
engine/wind noise more reliably than speech — it's why sirens and alarms are tonal, not spoken — so leading
with one gives a faster "something needs my attention" cue before the words register. Reuse the same tier
system as haptics rather than a unique tone per signal (§2's tier-reuse rationale applies identically here,
same over-engineering risk): Critical gets the most distinct/urgent tone, High a milder alert tone, Medium
optional/soft, Low none. This is a genuine addition to §2's Voice/Audio column that isn't reflected there yet
— worth a follow-up pass noting "tone + voice" for Critical/High rows rather than voice alone.

**Bluetooth/intercom headsets need no special handling.** Both TTS and any in-app earcon route through
whatever the OS's current default audio output device is — a rider with a paired Cardo/Sena-style intercom
headset gets the audio the same way they'd get a phone call or music. The app doesn't need to do anything
extra to reach it.

### 7e. Where the earcon audio actually comes from

**Primary recommendation: synthesize the tones in-browser with the Web Audio API's `OscillatorNode`, don't
ship audio files at all.** For simple tier tones (not music, not speech), this beats sourcing files on every
axis that matters here: zero licensing risk, no asset pipeline, trivially small code instead of binary
assets to cache, exact and consistent loudness/duration control, and — the real win — the same JS that drives
a tier's tone can drive its pulse count, keeping audio and haptic patterns literally in sync rather than
designed separately. Concretely: mirror each tier's haptic pulse count from §2 in the tone's beep count —
Critical = 3 short beeps (matching `[400,150,400,150,400]`), High = 2 (matching `[300,100,300]`), Medium = 1
soft beep (matching `[200]`), Low = none. That gives the rider one consistent "pulse language" across both
channels instead of two unrelated cues to learn. Target frequency **~1.5-3.5kHz** for the tone itself —
motorcycle engine/wind noise is predominantly low-frequency, and that band is both where human hearing peaks
in sensitivity and where sirens/alarms are conventionally pitched for the same reason.

**If the team wants pre-recorded/more textured sound instead of pure synthesized beeps** (reasonable for a
more polished post-hackathon pass, not needed to ship the functional requirement): royalty-free sources
worth starting from are [freesound.org](https://freesound.org) (filter to CC0 — no attribution required,
safest for a commercial product), [notificationsounds.com](https://notificationsounds.com) (free alert/chime
sounds built for exactly this use case), and [Mixkit](https://mixkit.co/free-sound-effects/notification/)
(free, simple license). Whichever source, the files need to be: **MP3 or AAC/M4A only — not OGG**, since
iOS Safari doesn't reliably support the OGG container and this is exactly the platform we can least afford
to lose audio on; short (well under a second per beep); and loudness-normalized to a consistent peak level
across all four tiers, so Critical doesn't end up quieter than Medium purely from inconsistent source
mastering. Either way, bundle them into the PWA's precached assets (`vite-plugin-pwa`'s existing precache),
not fetched on demand, so they play instantly and still work offline.

There's no existing audio/sound identity anywhere in `design/` — it's visual-only (colors, type, spacing).
This is genuinely greenfield; worth a real sound-design pass at some point to match the brand's "voice/
energy" language, but synthesized tier tones fully cover the functional requirement for now.

## 8. Use-case matrix

Cross-references §2's taxonomy, §7's delivery mechanics, and the design components from §4. Organized by
urgency tier rather than repeating all 21 signal rows individually, since delivery policy is the same within
a tier — this is the platform-comparison cut of the data; §2's table is the per-signal cut.

| Urgency | Example signals | Android (rider mid-ride, phone mounted/locked) | iOS (same) | Lead/Sweep dashboard (assume foreground, stationary) |
|---|---|---|---|---|
| Critical | SOS manual, SOS auto | Push (wakes locked phone) + `showNotification` vibrate pattern (distinct, e.g. long-long-long) + voice announcement if app foregrounded | Push (if installed to home screen) + voice announcement — **no vibrate channel** | Push + in-app alert card (severity-critical token, §4) at top of `RiderListRow`/`GroupMap`, sender-attributed per §2b, requires explicit ack |
| High | Hazard-left/right, pull-over | Push + vibrate (shorter/distinct pattern from critical) + voice | Push (if installed) + voice | In-app alert card, sender-attributed, auto-dismiss after ack |
| Medium | Separation L1/L2, stopped-rider, regroup, cops-ahead | Push + vibrate + voice (voice optional per §6 density setting) | Push (if installed) + voice | `RiderListRow` status-line flip (already exists) + optional toast |
| Low | Pitstop, fuel stop, reached destination, manual status | In-app only while foregrounded; push only if app backgrounded (no vibrate distinction needed) | Same, push only if installed | `Checkpoint` state change, no interrupt |

**Two worked examples, to make this concrete** (see §2d for a third, taken all the way through):
- *SOS auto (Critical, rider unresponsive):* Edge Function fires on `ride_events` insert → pushes to Lead +
  Sweep subscriptions. Android Lead/Sweep: phone buzzes with a distinct long-pattern vibrate even if locked,
  notification shows rider name + "no response," tapping opens `RiderListRow` for that rider highlighted in
  the critical-severity token. iOS Lead/Sweep: same push content, no vibrate — relies on sound + the visual
  the instant they glance at the phone. This is the scenario where the iOS haptic gap matters most, since a
  Lead who doesn't feel a buzz might not glance at the phone in time.
- *Hazard-left (High, mid-pack rider triggers):* Push to trailing riders' devices. Since this is meant to
  reach a moving rider without a screen glance, voice is the real payload here — push/vibrate is the
  wake-up, a spoken "hazard on your left, from [sender name]" is what actually needs to land per §2b's
  sender-attribution requirement.

## 9. Sequencing

1. **Now (unblocked):** Lock the signal taxonomy (§2) with the team; run the platform capability spike (§3),
   including false-positive threshold research — §7/§8 already answer most of the vibration/push capability
   questions, so this narrows to on-device verification of iOS push payload limits and the false-positive
   threshold testing specifically; raise the token/design gaps (§4) with the design owner; confirm
   hazard-alert ownership; raise signal-convention configurability with Mithul (§2b); resolve the delivery
   questions in §10.
2. **Parallelizable now:** Voice feedback/command design — phrasing, prompts, fallback behavior when speech
   synthesis/recognition isn't supported. Doesn't depend on GPS. Given §7b, this is now the *only* channel
   for any iOS rider mid-ride, so this work is higher-priority than previously scoped, not a nice-to-have.
3. **Blocked on Flow 3:** Actual GPS-driven detection logic (separation, stopped-rider), since there's no
   location layer yet. The push-delivery mechanism from §7a (Supabase Edge Function on `ride_events` insert)
   can be prototyped independently once the `ride_events` table exists, even before detection logic is real.
4. **Blocked on §4 sign-off:** Building the alert/toast component and any new color tokens.

## 10. Open questions from the delivery-mechanics research

These need actual product/team decisions before §8's matrix can be finalized:

- **Do we design for the iOS haptic gap as permanent, or keep watching the unconfirmed compat report?**
  Recommendation: treat iOS as voice/push-only now; revisit if Apple officially documents support. Don't
  build a UX that silently degrades for iOS riders without them knowing why — worth an explicit "haptic
  alerts unavailable on this device" state rather than a silent no-op.
  **Concrete requirement for Flow 2's preferences panel (Mithul):** the Haptics toggle shouldn't just be
  hidden on iOS (looks like a bug/inconsistency between platforms) or left interactive-but-inert (the silent
  no-op this recommendation is against). It should render disabled, with explanatory copy — e.g. "Haptic
  alerts aren't available on this device" — so the rider understands why, not just that it doesn't respond.
  Detect this by **feature-testing `'vibrate' in navigator`**, not by branching on iOS/Android — that's more
  robust than UA-sniffing, correctly reflects the unconfirmed compat report from §7b if it turns out to be
  real (or real-but-inconsistent) on some devices, and means the toggle re-enables itself automatically if
  Apple ever ships actual support, with no app update needed to catch up.
- **Do we make "Add to Home Screen" a mandatory onboarding step for iOS riders? — Decided: yes.** Without it,
  iOS riders get zero push notifications, not just degraded ones — the only channel that reaches a locked or
  backgrounded iOS phone at all. Given push carries every Medium+ signal in §2, including SOS, making this
  skippable would mean an iOS rider could unknowingly opt out of safety-critical alerts. Belongs in Flow 1
  (Mithul); details below so it doesn't just sit as a one-line decision.

  **Detection — iOS-conditional, not universal:** Android needs none of this (push works in a plain browser
  tab, §7a), so this is a branch in onboarding, not a step every rider sees. Detect "iOS, not yet installed"
  via `window.navigator.standalone === false` or `!window.matchMedia('(display-mode: standalone)').matches`
  on an iOS user agent. Re-check on every app open, not just once — a rider can remove the home-screen icon
  later and silently lose push without any in-app signal otherwise.

  **Placement:** early in Flow 1's onboarding, before ride join/creation — matches the solution-space doc's
  existing "Rider role first-time" sequence (name, contacts, medical profile, etc.), slotted in alongside it
  rather than after, since a rider could otherwise complete signup and join a ride still without push.

  **Because it requires OS-chrome gestures (tap Share → Add to Home Screen → Add) that can't be described
  by voice, this is a legitimate exception to the voice-first interaction model** — worth stating explicitly
  since it's the one onboarding step that has to be visual, step-by-step, screenshot-driven walkthrough
  (Share icon → "Add to Home Screen" → confirm), not a spoken instruction.

  **Skip behavior:** not a silent skip, per the same "no silent degradation" principle as the haptics toggle
  above — if a rider proceeds without installing, show an explicit acknowledgment ("You won't receive alerts
  when the app isn't open — install to your home screen for full safety coverage") rather than letting them
  skip without understanding the tradeoff.
- **Which signals need OS-level push (reaches a backgrounded/killed app) vs. in-app-only?** §8's tiering
  proposes push for everything Medium+ — worth confirming that's not overkill, since every push is also a
  notification-permission and battery consideration, and ties directly into the false-positive/cry-wolf risk
  already flagged in §3.

- **Push send timing: fire-per-event immediately, or batch/throttle? — Proposed logic below**, tiered by §2's
  urgency levels rather than one blanket rule, since "debounce everything" would delay an SOS and "debounce
  nothing" reintroduces the L1→L2 spam problem this question is about.

  **Critical — never throttled, batched, or delayed. No exception.** Every SOS event (manual/auto/
  peer-witnessed) fires immediately, full stop. Use a **unique push `tag`** per event (not shared across
  events) so multiple concurrent SOS cases — two different riders down — stack as separate notifications in
  the tray rather than one replacing the other. This rule overrides every mechanism below; whatever
  implements batching must special-case Critical out of it entirely, not rely on a threshold happening to
  never be hit.

  **Medium — supersession, not suppression, for the exact L1→L2 case in the question.** Separation L1 and L2
  for the same rider share one push `tag` (e.g. `separation-{riderId}`) — §7c already confirmed `tag` exists
  for grouping/replacing. An L2 event replaces the still-showing L1 notification instead of stacking a
  second one; the state *transition* (L1→L2, or resolution back to normal) always pushes immediately,
  uncapped. Between transitions, apply a **minimum re-notify interval of ~90s** (three GPS ticks at the 30s
  default from §6) per (rider, signal-type) so a steadily-lagging rider doesn't re-trigger a push on every
  tick while nothing has actually changed. Treat this number the same as the separation thresholds already
  flagged in §6 — a starting default to tune jointly with Rajat, not a final value.

  **Medium — stopped-rider detection needs a pre-push confirmation dwell, not a post-hoc debounce.** This is
  the signal most exposed to the cry-wolf/false-positive risk in §3 (stop-start pack traffic). Rather than
  firing then trying to suppress noise afterward, require the stopped state to persist across **at least two
  consecutive GPS ticks (~60s)** before the push fires at all — a single red-light stop shouldn't generate an
  alert. This gives the abstract "needs real-world threshold testing" note in §3 a concrete starting number
  to validate against actual stop-start riding data.

  **High — coalesce duplicate reports of the same real-world event, don't multiply them.** If a second rider
  flags the same hazard type within a short window of the first (v1: same signal-type + same ride within
  ~10s, no location-matching — true position-based coalescing is a v2 refinement, not needed to ship this),
  update the existing push via the same `tag` with escalated copy ("Hazard ahead — flagged by 2 riders")
  rather than sending a second, separate push for what's plausibly the same pothole.

  **Low — no change from §2/§8's existing "no push unless backgrounded" rule.** These are already
  one-time, discrete events (destination reached, pitstop called) — nothing to debounce.

  **Cross-cutting safety net: a per-recipient rate limit**, independent of the per-signal logic above, in
  case unrelated Medium+ signals from different riders happen to stack within the same window — e.g. cap at
  4 pushes per recipient per 2 minutes, collapsing anything past that into one "Multiple updates — open the
  app" summary push. This does **not** apply to Critical, per the rule above.

  **Implementation note:** this needs a small new piece of state the Edge Function can query before deciding
  to send/replace/suppress — e.g. a `push_dedup_state` table tracking last-sent timestamp and `tag` per
  (recipient, signal-type). That's a new table, not an alteration to the seam tables SETUP.md §6 flags for
  review-only changes, but worth flagging now since it's schema, not just Edge Function logic.

UX principles that apply across every flow, not just this one, live in `PRD/PRD.md` (Part 6) — including the
handful of decisions specific to signals/SOS/onboarding that fell out of applying them (SOS cancel window,
sender-visible delivery ack, Add to Home Screen step progress, preferences panel structure).

## 11. Voice input — a wake word to control signals hands-free

Requested: a wake word for voice-first signal control, the way Siri/Google Assistant work. Verified against
current sources before designing around it, same as §3/§7 — and the honest finding is that the Siri/Google
comparison doesn't hold on a PWA, for a specific, structural reason, not a gap that closes with more work.

### 11a. Why "Hey Siri"-style wake word isn't achievable here

- **Browsers deliberately don't let a page listen in the background.** `SpeechRecognition` only has
  microphone access while the tab is active and foregrounded, with an explicit permission grant — there is
  no web API for background or lock-screen listening, on any platform. This isn't a missing feature to wait
  for; it's the same privacy boundary that stops any website from silently recording you, and it's why
  Siri/Google Assistant only manage it as native OS features with dedicated low-power hardware listeners a
  web page has no access to.
  ([Home Assistant community thread on exactly this question](https://community.home-assistant.io/t/wake-word-via-web-browser/659439))
- **Even foregrounded, "continuous" mode is limited, not true always-on.** `SpeechRecognition`'s `continuous`
  property defaults to single-utterance and, even set true, sessions still time out on silence and need
  restart logic — an approximation of continuous listening, not the real thing.
- **Platform split, same pattern as §7:** Chrome/Android supports `SpeechRecognition` well but only
  online — it streams audio to a cloud service for processing, so it won't work in the low-connectivity
  stretches already flagged as a risk elsewhere in this doc (Part 7's checklist, §3's PWA background risk).
  Safari on iOS/macOS (14.5+/14.1+) can instead do **on-device** recognition once the user grants permission
  and a language pack is installed — offline-capable, which Chrome's path isn't, but still foreground-only.
  Chrome on iOS doesn't support the API at all (it runs on Apple's WebKit engine there, not Chrome's own).
  ([TestMu AI compat summary](https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/))
- **The mic-in-use indicator is always visible while listening**, on every platform — not a bug to hide, a
  real constraint to design the UI around (and arguably a trust signal worth surfacing deliberately, not
  apologizing for).

### 11b. What's actually achievable, as two tiers

1. **Push-to-talk (recommended primary mechanism).** A single tap-and-hold or a paired Bluetooth
   headset/intercom's physical button (Cardo/Sena-style units, already flagged in the persona research) opens
   one `SpeechRecognition` session for a single command, then closes it. This isn't a fallback to settle for —
   it's already named in the gap analysis as the intended pattern ("single hardware button press as
   fallback" for voice-first interaction); this makes it the primary path given §11a, not a backup to a wake
   word that can't exist. Reliable, low battery cost, works with a glove-friendly physical button instead of
   a screen tap.
2. **Foreground-only "best-effort" wake phrase, as an opt-in stretch mode, not the default.** While the app
   is actively open and the screen is on (a phone mounted for navigation, which is a realistic riding setup),
   loop-restart `SpeechRecognition` to approximate continuous listening for a short wake phrase. Must be
   presented honestly: doesn't work locked or backgrounded, costs battery and — on Chrome's cloud path —
   mobile data, and shows the mic-active indicator the whole time it's running. Offered as an option a rider
   turns on knowingly, not silently assumed to behave like Siri.

### 11c. Which signals fit voice *input*, and which need a confirmation step

Not every signal in §2 is a voice-command candidate — the system-detected ones (separation, auto-SOS,
weather) have nothing to say a command *to*. Among the ones that do, misrecognition risk (wind noise, engine
noise, a helmet muffling speech) means severity should drive whether a spoken command needs an echo-confirm
before it fires, the same tiering logic already used for haptics/push in §2.

| Fits voice input | Confirmation before firing? |
|---|---|
| Manual status, pitstop, fuel stop, location pin, all-clear/I'm okay, alert ack ("got it") | No — low harm if misheard, correctable |
| Hazard-left/right, road hazard, slow down/speed up, pull-over, stop-here, regroup, cops-ahead | **Yes — spoken echo-confirm** ("hazard left, got it"), not a blocking extra step, just TTS repeating back what it heard before treating it as sent |
| SOS manual, SOS peer-witnessed | **Open question, not decided** — see §11d |

SOS peer-witnessed is actually the best-fit *new* use case here: a rider spotting a crash can report it by
voice without stopping or reaching for the phone, which is exactly the hands-free scenario voice input is
for.

### 11d. Open questions

- **SOS by voice: confirm or not?** A blocking confirmation step risks delaying a real emergency; no
  confirmation risks a false SOS from a misheard phrase in a noisy environment, feeding the same cry-wolf
  trust problem already flagged in §3. Leaning toward: voice can *trigger* SOS, but the physical/manual
  button stays the primary path, with voice positioned as a redundant channel, not the sole one — needs a
  real decision, not an assumption.
- **The wake phrase itself needs naming and noise-testing**, not guessing — short, distinctive, low
  false-trigger rate against engine/wind/helmet noise and ordinary conversation. Not something to lock in
  without testing against actual riding audio.
- **Which platform's tradeoff wins as the default for the foreground wake-phrase mode**: Android/Chrome's
  better recognition quality but online-only and battery-hungry, versus Safari's offline on-device path but
  narrower support. Likely needs to be platform-adaptive rather than one fixed choice.
