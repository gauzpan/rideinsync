# RideInSync — Strict Design Guidelines for AI Coding Assistants

Binding rules for any assistant generating UI for the RideInSync app. **MUST / MUST NOT are non-negotiable.** When a request conflicts with a rule, stop and flag it — do not silently override. Consume tokens/components from this design system (`window.WayixDesignSystem_d17f72`); never re-implement them.

---

## 0. Golden rules (read first)
1. **MUST** use design tokens for every color, space, radius, font, and shadow. **MUST NOT** hard-code a hex, px spacing, or font-family that a token already defines.
2. **MUST** compose existing components before writing new markup. **MUST NOT** re-build `Button`, `Input`, `RiderMarker`, `RideBadge`, etc. by hand.
3. **MUST** design dark-first; light theme is opt-in via `[data-theme="light"]` and **MUST** work by token inheritance, not by re-coloring.
4. **MUST** treat this as a voice-first, gloves-on, in-motion product: big targets, low touch, minimal reading.
5. **One accent per screen.** Lime is earned, not decorative.

---

## 1. Color
- **MUST** reference `--color-*` tokens only. Base palette: `colors.css`.
- **Accent (`--color-accent`, lime `#C4F82A`) MUST** mark exactly **one** primary thing per screen — the next action or the live route. **MUST NOT** be used for large fills, body text, or multiple competing elements.
- **MUST NOT** put text directly on lime except the near-black `--color-text-on-accent`. Never white-on-lime.
- Surfaces **MUST** come from the 6-step scale (`--color-bg-void` → `--color-surface-4`); depth is one step of lift, **not** a new gray.
- **MUST NOT** introduce new colors. The only sanctioned non-neutral extensions are the documented functional sets: rider roles (`--color-role-lead/-sweep/-member`) and checkpoints (`--color-checkpoint-*`). New semantic colors require a token added to `colors.css` first (with light-theme parity) — never an inline literal.
- Selected/active state **MUST** invert (`--color-inverse-surface` fill + `--color-text-on-inverse`), never a lime fill.
- **Never** gradients as fill except the sanctioned accent **radial glow**. No blue/purple gradients, ever.

## 2. Typography
- **MUST** use `--font-ui` (Inter) for all interface text; `--font-brand` (Poppins) **only** for the "RideInSync" wordmark.
- **MUST** use the role tokens (`--text-h1`, `--text-body-size`, `--text-metric`, etc.); **MUST NOT** invent font sizes.
- Weights limited to **400 / 500 / 600**. **MUST NOT** use 700+, thin, or italic.
- Sentence case everywhere. **MUST NOT** use ALL-CAPS or Title Case for headings (small uppercase eyebrow labels with letter-spacing are the one exception).
- Numbers/metrics **MUST** use `font-variant-numeric: tabular-nums` and a unit suffix (`42 km`, `1.4 mi`, `+5%`).
- In-motion legibility: **MUST NOT** render text below **14px**; primary in-ride info ≥ 20px.

## 3. Spacing & layout
- **MUST** use `--space-*` (4px base, 8px rhythm) and `--gutter` for screen padding. No arbitrary px margins.
- Mobile, single-column, PWA. **MUST** build fluid (`max-width`, flex/grid with `gap`, `minmax(0,1fr)`) — **MUST NOT** hard-code widths/heights on text containers.
- **MUST** lay out sibling groups with flex/grid `gap`, not per-element margins or inline whitespace.

## 4. Shape, elevation, motion
- Radii **MUST** be tokens: `--radius-full` (buttons, inputs, pills, transport), `--radius-lg` (sheets/large cards), `--radius-md` (info/connection cards), `--radius-sm` (inner controls). **MUST NOT** use a colored left-border accent card.
- Depth = surface tint + `--shadow-card`, or `--glow-accent` for a hero moment. **MUST NOT** stack heavy drop shadows or glassmorphism.
- Motion: gentle ease, ~.15–.3s, opacity/position/scale of the voice blob and transitions only. **MUST NOT** add bounces, spins, or attention-grabbing motion that distracts a rider.
- Focus ring **MUST** be visible: 2px `--focus-ring` (accessibility-critical). Never remove focus outlines without replacing them.

## 5. Interaction states (required for every control)
- Hover: accent → `--color-accent-deep`; surfaces lift one step.
- Press: color shift (no large scale jumps).
- Disabled: `--color-surface-3` fill + `--color-text-tertiary`.
- Touch targets **MUST** be ≥ **44px**; primary in-ride actions ≥ **56px** (`--control-height`).

## 6. Iconography
- **MUST** use the `Icon` component. **MUST NOT** hand-roll SVGs, use emoji, or use unicode glyphs as icons.
- Icons are monochrome — white or accent. If a needed glyph is missing, **add it to `Icon.jsx`'s path map**; do not inline an SVG in a screen.
- ⚠️ The icon set is **Lucide-substituted** (the motorcycle glyph is approximated). Do not present it as final brand iconography.

## 7. Voice-first & accessibility (product-defining — do not compromise)
- Every touch action **MUST** have a voice or single-button-press equivalent path in the flow.
- **MUST NOT** require typing while riding; keyboard input belongs to setup screens only.
- **MUST** maintain ≥ 4.5:1 text contrast (≥ 3:1 for headline-scale). Full-opacity ink on its ground — no alpha-muted or `color-mix` body text.
- SOS / hazard / status affordances **MUST** be reachable in one action and never buried.

## 8. Components — use, don't rebuild
Import from the bundle: `Button`, `IconButton`, `Input`, `SegmentedControl`, `Stepper`, `Card`, `NavInfoCard`, `BackButton`, `TurnRow`, `TransportBar`, `ConnectionCard`, `VoiceBlob`, `Icon`, and the group-ride (`RoleBadge`, `RiderMarker`, `Checkpoint`, `RiderListRow`, `GroupMap`) and achievements (`RideBadge`, `BadgeGrid`) families.
- Extend via props; if a real gap exists, **add a component to the right `components/<group>/` folder** with its `.jsx` + `.d.ts` + `.prompt.md` + a `@dsCard` — never a one-off inline widget.
- **MUST NOT** copy a component's internals into a screen. Screens compose primitives.

## 9. Content & tone
- Warm, second-person, reassuring; short. Prompts one line ("Where would you like to go?"). Section titles 2–3 words.
- Signature device: mix weights in a sentence — key phrases bold-white, connectives muted (`--color-text-secondary`).
- **No emoji.** Numbers terse and unit-suffixed.

## 10. Definition of done (self-check before returning code)
- [ ] Zero hard-coded colors/spacing/fonts/radii — all tokens.
- [ ] Exactly one accent element on the screen.
- [ ] Works in both dark and `[data-theme="light"]` with no per-theme overrides.
- [ ] All controls ≥ 44px (in-ride ≥ 56px); visible focus rings.
- [ ] Text ≥ 14px and ≥ 4.5:1 contrast; tabular numerics.
- [ ] Icons via `Icon`; no inline SVG/emoji.
- [ ] Reuses components; any new UI became a real component with a `.d.ts`.
- [ ] No blue/purple gradients, no left-border accent cards, no heavy shadows, no distracting motion.
- [ ] Flagged any rule I had to bend and why.
