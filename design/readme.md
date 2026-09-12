# RideInSync — Design System

**Product:** RideInSync — a voice-first, accessibility-focused wheelchair navigation app (company: RideInSync). **Platform:** iOS mobile, dark-first (a light theme is also provided). **Namespace (consumers):** `window.WayixDesignSystem_d17f72` (compiler-generated internal id — brand text renamed to RideInSync, the namespace stays stable so existing imports keep working).

> **Naming:** the source doc calls the product *Wayix*; the app has since been renamed **RideInSync**. All brand-facing copy, wordmarks and cards read RideInSync. Internal identifiers (namespace, the `ui_kits/wayix-app/` folder, `uploads/wayix-design-system.md`) keep the original stem to avoid breaking references.

## Sources

- `uploads/wayix-design-system.md` — the reverse-engineered design reference (11 product screens). All tokens, type, and component behavior here derive from it.
- No codebase, Figma file, logo asset, or font files were provided.

## Design language

Dark-first, high-contrast, voice-forward. A near-black canvas with a **single electric lime-green accent** (`#C4F82A`) for every primary action, live route, and voice/energy state. Everything else is neutral. Soft geometry (full pills, 16–20px cards), ambient green radial glows for depth instead of hard shadows. Accessibility *is* the product: large tap targets (≥56px), white-on-black body text, visible accent focus rings.

---

## Content fundamentals

- **Voice & person:** Warm, second-person, reassuring. Speaks to "you"; the product "handles the rest." Never clinical or medical in tone despite the accessibility mission.
- **Casing:** Sentence case everywhere. No all-caps, no title-case headings.
- **Punctuation:** No em dashes anywhere in in-app copy. Use a period, comma, or parentheses instead.
- **Tone device (signature):** mixed weights within one sentence — key phrases bold white, connective words muted gray. Example: "Just **tell us** where you're headed, and RideInSync **handles** the route."
- **Copy length:** Short. Prompts are one line ("Where would you like to go?", "What should we call you?"). Section titles are 2–3 words ("My preferences", "What matters most", "My device").
- **Numbers:** Tabular, terse, unit-suffixed — `30 ft`, `1.4 mi`, `+5%`, `2000 Steps / Trip`.
- **Emoji:** None. Iconography carries all glyph meaning.
- **Vibe:** Calm confidence + kinetic energy (the lime glow). Empowering, not pitying.

---

## Visual foundations

- **Color:** One accent (lime chartreuse), used scarcely — one accent element per screen (almost always the next action) plus the route line. Neutrals are a 6-step dark surface scale (`bg-void #000` → `surface-4 #3A3A3C`), each step one shade lifted. Selected states **invert** to white fill + black text (highest contrast = current choice).
- **Themes:** Dark-first is the default (`:root`). A **light theme** opts in via `[data-theme="light"]` on any ancestor — surfaces flip to a bright scale (`bg-void #FFF` → `surface-4 #D6D6DC`), text darkens, dividers/shadows soften, and the lime accent + on-accent near-black are held constant across both. The UI kit has a live toggle.
- **Type:** `--font-brand` (Poppins, substituted) for the "RideInSync" wordmark only; `--font-ui` (Inter, substituted) for all UI. Weights 400/500/600 — no thin or black. Brand display slightly tightened (`-0.01em`). Numeric roles use tabular figures.
- **Spacing:** 4px base, 8px working rhythm. \~20–24px screen gutters, \~32px between titled sections, space-between rows (label left, control right). Single-column mobile.
- **Backgrounds:** Flat true/near black. Ambient green **radial glows** (\~35% opacity, fading to transparent) anchor voice screens (bottom) and the splash (top-right). Map/nav views are full-bleed with floating UI cards layered over them. No photography, no gradients-as-fill beyond the glow, no textures.
- **Corner radii:** `full 999px` (buttons, inputs, transport bar, chips), `lg 20px` (large cards/sheets), `md 16px` (dropdowns, info & connection cards), `sm 12px` (small inner controls).
- **Cards:** Dark surface fill (`surface-1/2`), 16–20px radius, no border. Depth from surface tinting + a soft dark drop shadow (`0 8px 24px rgba(0,0,0,.5)`); key moments use the accent glow instead.
- **Borders/dividers:** Hairline `rgba(255,255,255,.08)`, 1px, for list rows and secondary-button outlines. Otherwise borderless.
- **Elevation:** Minimal hard shadows — layered surface tint is the primary depth cue.
- **Interactive states:** Hover/press darken accent → `accent-deep`, surfaces lighten one step. Focus = 2px accent ring (critical for the audience). Selected = inverse white/black. Disabled = `surface-3` fill + `text-tertiary` label.
- **Animation:** Ambient blob grows/brightens idle → listening → speaking; gentle ease transitions (\~.15–.3s). No bounces, no flashy motion.
- **Transparency/blur:** Used sparingly — the radial glow and nav cards' slight separation over the map. No heavy glassmorphism.
- **Imagery vibe:** N/A (no photography). The only "imagery" is the lime route line and glow — warm, energetic, monochrome-green on black.

---

## Iconography

- **Style:** Thin-to-medium stroke, rounded joints, monochrome — white or accent.
- **Set observed:** chevron back, play (outlined on splash / filled on nav), rewind/forward, turn arrows (left/right/straight/flag-destination), phone, projector, Bluetooth, plus/minus, position marker (filled lime chevron in a lime circle).
- **SUBSTITUTION:** No icon assets were provided. The `Icon` component ships a **Lucide (MIT)** subset as the closest match to the described thin-rounded style. Replace with the real RideInSync glyph set when available. Names: chevron-left/right, play, skip-back/forward, plus, minus, turn-left/right, straight, incline, flag, phone, bluetooth, projector, navigation, mic, check.
- **Emoji / unicode as icons:** None. (The device status bar in the UI kit uses SF Symbols placeholder glyphs for chrome only.)

---

## ⚠️ Substitutions to confirm

- **Fonts:** Brand face substituted with **Poppins**, UI face with **Inter** (both Google Fonts). The original rounded-geometric brand face is unknown. → *Please supply the real font files.*
- **Icons:** **Lucide** stands in for the proprietary glyph set (see above). → *Please supply the real icon set.*
- **Logo:** **None provided.** The wordmark is rendered as plain Poppins type wherever a mark would go. → *Please supply a logo asset.*
- **Colors:** Hex values were visually sampled from compressed screenshots — calibrate against source assets before shipping.

---

## Components

Reusable primitives (`window.WayixDesignSystem_d17f72`):

**core/** — `Icon` **forms/** — `Button`, `IconButton`, `Input`, `SegmentedControl`, `Stepper` **surfaces/** — `Card`, `NavInfoCard` **navigation/** — `BackButton`, `TurnRow`, `TransportBar` **feedback/** — `ConnectionCard`, `VoiceBlob` **tracking/** — `RoleBadge`, `RiderMarker`, `Checkpoint`, `RiderListRow`, `GroupMap`

Each has a `.jsx`, `.d.ts` (props contract), `.prompt.md` (usage), and a directory `@dsCard` specimen. `Button` is also a Starting Point.

### Intentional additions

- `Icon` — a glyph wrapper is required to render the (substituted) icon set; the source describes icons but ships no component.
- `MiniMap` (UI-kit only, not a DS primitive) — a CSS/SVG placeholder for the map surface, since no real map tiles were provided.
- **`tracking/` family** (`RoleBadge`, `RiderMarker`, `Checkpoint`, `RiderListRow`, `GroupMap`) — a group-ride GPS tracker: lead / sweep / member riders tracked live on a route with numbered checkpoints, plus a roster. Not in the source doc; added on request. It introduces functional **role color tokens** — `--color-role-lead` (lime, = accent), `--color-role-sweep` (`#FF7A5A` coral), `--color-role-member` (`#5AC8FA` sky) — the one deliberate expansion beyond the single-accent rule, justified by the need to tell riders apart on a shared map. Checkpoints use `--color-checkpoint-reached/-upcoming`. Demonstrated full-screen in the UI kit's **Group ride** screen (reachable from live navigation).

## UI kits

- **`ui_kits/wayix-app/`** — interactive iOS click-through: Splash → Name onboarding → Device connect → Preferences → Voice → Route preview → 3D navigation.

## Index / manifest

- `styles.css` — consumer entry point (import list only).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radius.css`.
- `components/{core,forms,surfaces,navigation,feedback}/` — primitives + specimen cards.
- `guidelines/` — foundation specimen cards (Colors incl. dark/light themes, Type, Spacing, Brand).
- `ui_kits/wayix-app/` — the app recreation.
- `thumbnail.html` — homepage tile.
- `SKILL.md` — Agent-Skill wrapper.
