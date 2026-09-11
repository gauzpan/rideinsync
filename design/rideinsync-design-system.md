# Wayix — Design System

**Product:** Wayix — voice-first, accessibility-focused wheelchair navigation app
**Platform observed:** iOS (mobile, dark theme only)
**Source:** Reverse-engineered from 11 product screens
**Status:** Implementation-ready reference. Hex values are visually sampled from compressed screenshots — calibrate against source assets before shipping.

---

## 0. Design Language Summary

Wayix is a **dark-first, high-contrast, voice-forward** interface. The visual system pairs a near-black canvas with a single electric lime-green accent used for all primary actions, live navigation routes, and voice/energy states. Type is clean and geometric; shapes are soft (fully rounded pills, generously rounded cards). Ambient radial-glow gradients in the brand green add depth to otherwise flat black backgrounds and reinforce the "energy / motion" theme.

**Core principles**
- **One loud accent.** Lime green means "action" or "live path." Everything else is neutral.
- **Maximum legibility.** White-on-black body text, large tap targets, generous spacing — accessibility is the product.
- **Soft geometry.** Full-radius pills and 16–20px card corners throughout.
- **Ambient depth.** Dark surfaces lifted by subtle green radial glows rather than hard shadows.

---

## 1. Color Palette

### 1.1 Brand / Accent

| Token | Hex (est.) | Usage |
|---|---|---|
| `color-accent` | `#C4F82A` | Primary buttons, active states, brand |
| `color-accent-bright` | `#C9FF3D` | Live route line, voice waveform peak |
| `color-accent-deep` | `#A8E000` | Route line shadow/edge, pressed accent |
| `color-accent-glow` | `rgba(178, 232, 46, 0.35)` | Radial ambient glow, blob halo |

The accent is a warm chartreuse/lime — the app's single hero color. It carries brand identity (logo tagline highlights), all primary CTAs, the navigation route, and voice-energy visuals.

### 1.2 Neutrals / Surfaces (dark scale)

| Token | Hex (est.) | Usage |
|---|---|---|
| `color-bg-base` | `#0A0A0B` | App background |
| `color-bg-void` | `#000000` | Screen edges, map night sky, OLED true black |
| `color-surface-1` | `#141416` | Elevated panels, sheets |
| `color-surface-2` | `#1C1C1E` | Cards, input fields, dropdown |
| `color-surface-3` | `#2A2A2D` | Segmented-control track, control chrome |
| `color-surface-4` | `#3A3A3C` | Stepper (−/+) buttons, secondary chips |

### 1.3 Text

| Token | Hex (est.) | Usage |
|---|---|---|
| `color-text-primary` | `#FFFFFF` | Headings, values, primary body |
| `color-text-secondary` | `#9A9A9E` | Sub-labels, secondary rows, prompts |
| `color-text-tertiary` | `#6B6B70` | Placeholder, disabled, hints |
| `color-text-on-accent` | `#0A0A0B` | Text on lime buttons (near-black) |
| `color-text-on-inverse` | `#000000` | Text on selected white segment |

### 1.4 Utility / Feedback

| Token | Hex (est.) | Usage |
|---|---|---|
| `color-inverse-surface` | `#FFFFFF` | Selected segment, active toggle |
| `color-status-positive` | `#C4F82A` | "+5%" incline gain, loading text |
| `color-map-road` | `#8A8A8E` | Map road fills (light gray on black) |
| `color-map-building` | `#C9C9CE` | Extruded 3D buildings |
| `color-divider` | `rgba(255,255,255,0.08)` | Hairline separators |

### 1.5 Usage Patterns
- **Accent is scarce and intentional** — never used for large fills except the one primary CTA per screen and the route.
- **Selected state inverts** — chosen segmented options flip to white surface + black text (highest contrast = current choice).
- **Ambient green glow** appears bottom-anchored on voice screens and top-right on the splash — signals "listening / active energy."
- **True black (`#000000`)** is reserved for map night-sky and phone bezels; UI canvas uses the marginally-lifted `#0A0A0B`.

---

## 2. Typography

Two type roles: a **rounded geometric display face** for the brand mark, and a **neutral grotesque** for all UI.

### 2.1 Font Families

| Token | Stack | Notes |
|---|---|---|
| `font-brand` | Rounded geometric (e.g. *Poppins / Quicksand / custom*) | Logo "Wayix" — note the distinctive open, low-terminal `y`. |
| `font-ui` | `Inter`, `SF Pro Text`, system-ui, sans-serif | All interface + body text. Clean, neutral, highly legible. |
| `font-numeric` | `font-ui`, tabular-nums | Distances, percentages, step counts (`30 ft`, `1.4 mi`, `+5%`). |

### 2.2 Type Scale

| Token | Size / Line-height | Weight | Example in app |
|---|---|---|---|
| `text-display` | 44 / 48 | 600 | "Wayix" logo |
| `text-h1` | 24 / 30 | 600 | "Welcome aboard." / "My preferences" |
| `text-h2` | 20 / 26 | 600 | "What matters most", "My device" |
| `text-nav-metric` | 28 / 32 | 600 | "30 ft", "0.2 mi" turn distances |
| `text-body` | 16 / 24 | 400 | Prompts, list items, trip summary |
| `text-body-strong` | 16 / 24 | 600 | Button labels, selected values |
| `text-label` | 14 / 20 | 500 | Preference row labels, section sub-labels |
| `text-caption` | 12 / 16 | 400 | Turn sub-text ("4th St"), device name |

### 2.3 Weights, Spacing, Styles
- **Weights used:** Regular (400), Medium (500), Semibold (600). No thin/black weights.
- **Letter spacing:** ~0 for body; brand display appears slightly tightened (`-0.01em`).
- **Line height:** ~1.4–1.5 for body, tighter (~1.1) for large navigation metrics.
- **Emphasis pattern:** the splash tagline mixes weights within one sentence — key phrases (*tell us*, *handles*) in bold white, connective words in muted gray. A signature Wayix tone device.
- **Case:** sentence case everywhere; no all-caps.
- **Punctuation:** no em dashes anywhere in in-app copy; use a period, comma, or parentheses instead.

---

## 3. Spacing System

### 3.1 Base Unit
**4px base grid**, with 8px as the working rhythm.

| Token | Value |
|---|---|
| `space-2xs` | 4px |
| `space-xs` | 8px |
| `space-sm` | 12px |
| `space-md` | 16px |
| `space-lg` | 24px |
| `space-xl` | 32px |
| `space-2xl` | 48px |

### 3.2 Layout Patterns
- **Screen horizontal padding:** ~20–24px consistent gutters.
- **Section spacing:** ~32px between titled groups ("My preferences" → "What matters most" → "My device").
- **Row rhythm:** preference rows ~16px vertical gap; label left-aligned, control right-aligned (space-between).
- **Bottom-anchored CTA:** primary button pinned near the bottom safe area with ~24px side margins and ~24–32px bottom inset.
- **Content is single-column**, full-width within gutters — no multi-column layout on mobile.

---

## 4. Component Library

### 4.1 Buttons

**Primary (accent pill)**
- Fill `color-accent` `#C4F82A`, text `color-text-on-accent` near-black, weight 600.
- Full-radius pill (`radius-full`), full-width, height ~56px.
- Examples: "Next", "Confirm".

**Secondary (dark outlined pill)**
- Fill `color-surface-2`, subtle 1px border `color-divider`, text white.
- Same pill shape/height as primary. Example: "Back", "Preview".

**Icon / control buttons**
- Circular, `color-surface-3/4` fill, centered glyph. Used for stepper −/+, media transport (⏮ ▶ ⏭), map overlay controls.

**States**
- *Default / Pressed:* pressed likely darkens accent toward `color-accent-deep`.
- *Disabled:* reduce to `color-surface-3` fill, `color-text-tertiary` label.
- *Selected (segmented):* inverts to white surface + black text.

### 4.2 Input Fields
- Dark rounded field, `color-surface-2` fill, ~16px radius (near-pill on single-line).
- Placeholder/value in `color-text-secondary`→`primary`, left-padded ~16px, height ~52–56px.
- **Autocomplete dropdown** (device picker): `color-surface-2` card, radius ~16px, stacked list rows with ~48px row height and hairline dividers.

### 4.3 Cards / Containers
- `color-surface-1/2`, radius ~16–20px.
- **Navigation info cards** (top of nav view): rounded rectangles floating over the 3D map with an internal progress bar and a large metric + descriptor ("30 ft / Slight incline", "90 ft / Turn right").
- **Connection card:** device-link module showing phone ⇄ Bluetooth ⇄ projector icons on a horizontal connector track.

### 4.4 Navigation Elements
- **Back:** thin chevron `‹` top-left, no label, ~24px.
- **Media/route transport bar:** pill-shaped bottom bar with a progress track (dot marker), distance endpoints (`0 ft` … `1.4 mi`), and ⏮ ▶ ⏭ controls.
- **Turn list rows:** directional glyph + distance (`text-body-strong`) + street sub-caption (`text-caption`, muted).

### 4.5 Selection Controls (Segmented / Stepper)
- **Segmented control (Low / Medium / High):** track `color-surface-3`, three equal segments; selected segment = white fill + black text + soft inner radius, unselected = muted gray text.
- **Stepper:** `[−]  value  [+]` — circular `color-surface-4` buttons flanking a centered value; value in white (`10%`, `2000 Steps / Trip`, `2 mi`).

### 4.6 Icons & Iconography
- **Style:** thin-to-medium stroke, rounded joints, monochrome (white or accent).
- **Set observed:** chevron back, play (outlined circle on splash / filled on nav), rewind/forward, turn arrows (left/right/straight/flag-destination), phone, projector, Bluetooth, plus/minus.
- **Position marker:** filled lime chevron in a lime circle ("you are here") on the 3D map.

### 4.7 Voice / Ambient Component
- **Waveform blob:** bottom-anchored organic lime blob with layered glow that animates while listening; on the empty prompt it's a lower-energy dome, on active input it's brighter/taller.
- **Radial brand glow:** soft green radial gradient (splash top-right; voice-screen bottom) — decorative depth layer, ~35% opacity green fading to transparent.

---

## 5. Visual Patterns

### 5.1 Border Radius

| Token | Value | Applied to |
|---|---|---|
| `radius-full` | 999px | Buttons, inputs, transport bar, chips |
| `radius-lg` | 20px | Large cards, sheets |
| `radius-md` | 16px | Dropdown, info cards, connection card |
| `radius-sm` | 12px | Small inner controls |

### 5.2 Elevation / Shadow
- Minimal hard shadows. Depth is created by:
  - **Surface tinting** (each layer a step lighter than the one below).
  - **Ambient green glow** behind key moments.
  - Nav cards float over the map with a soft dark drop shadow (~`0 8px 24px rgba(0,0,0,0.5)`) and slight backdrop separation.

### 5.3 Borders / Dividers
- Hairline `rgba(255,255,255,0.08)`, 1px, for list rows and secondary-button outlines. Otherwise borderless.

### 5.4 Interactive States (recommended)
- **Hover/press:** accent → `color-accent-deep`; surfaces lighten one step.
- **Focus:** 2px `color-accent` ring for accessibility (critical for this audience).
- **Selected:** inverse (white/black).
- **Disabled:** desaturate to `color-surface-3` + `color-text-tertiary`.

---

## 6. Layout Principles

- **Single-column, gutter-bounded** (~20–24px sides).
- **Vertical hierarchy:** screen title → grouped sections with 32px gaps → bottom-pinned primary action.
- **Alignment:** labels flush-left, values/controls flush-right (space-between rows); headings flush-left.
- **Full-bleed contexts:** map/navigation views extend edge-to-edge with floating UI cards layered on top.
- **Safe-area aware:** CTAs and transport bars respect the home-indicator inset.
- **Breakpoints:** designed for mobile portrait (~375–430pt). No tablet/desktop layout observed — scale gutters and cap content width (~600px) if extending.
- **Content hierarchy cue:** the one accent element per screen is almost always the intended next action.

---

## 7. Design Tokens

Naming convention: `category-role-variant` (kebab-case). Grouped below as CSS custom properties + JSON.

### 7.1 CSS Variables

```css
:root {
  /* Accent */
  --color-accent:        #C4F82A;
  --color-accent-bright: #C9FF3D;
  --color-accent-deep:   #A8E000;
  --color-accent-glow:   rgba(178, 232, 46, 0.35);

  /* Surfaces */
  --color-bg-base:   #0A0A0B;
  --color-bg-void:   #000000;
  --color-surface-1: #141416;
  --color-surface-2: #1C1C1E;
  --color-surface-3: #2A2A2D;
  --color-surface-4: #3A3A3C;

  /* Text */
  --color-text-primary:    #FFFFFF;
  --color-text-secondary:  #9A9A9E;
  --color-text-tertiary:   #6B6B70;
  --color-text-on-accent:  #0A0A0B;
  --color-text-on-inverse: #000000;

  /* Utility */
  --color-inverse-surface: #FFFFFF;
  --color-status-positive: #C4F82A;
  --color-divider:         rgba(255, 255, 255, 0.08);

  /* Typography */
  --font-brand: "Poppins", "Quicksand", sans-serif;
  --font-ui:    "Inter", "SF Pro Text", system-ui, sans-serif;

  --text-display:  44px;
  --text-h1:       24px;
  --text-h2:       20px;
  --text-metric:   28px;
  --text-body:     16px;
  --text-label:    14px;
  --text-caption:  12px;

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;

  /* Spacing (4px base) */
  --space-2xs: 4px;
  --space-xs:  8px;
  --space-sm:  12px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  32px;
  --space-2xl: 48px;

  /* Radius */
  --radius-full: 999px;
  --radius-lg:   20px;
  --radius-md:   16px;
  --radius-sm:   12px;

  /* Elevation */
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.5);

  /* Sizing */
  --control-height: 56px;
  --input-height:   54px;
  --gutter:         20px;
}
```

### 7.2 JSON (design-token format)

```json
{
  "color": {
    "accent":        { "value": "#C4F82A" },
    "accent-bright": { "value": "#C9FF3D" },
    "accent-deep":   { "value": "#A8E000" },
    "bg-base":       { "value": "#0A0A0B" },
    "bg-void":       { "value": "#000000" },
    "surface-1":     { "value": "#141416" },
    "surface-2":     { "value": "#1C1C1E" },
    "surface-3":     { "value": "#2A2A2D" },
    "surface-4":     { "value": "#3A3A3C" },
    "text-primary":    { "value": "#FFFFFF" },
    "text-secondary":  { "value": "#9A9A9E" },
    "text-tertiary":   { "value": "#6B6B70" },
    "text-on-accent":  { "value": "#0A0A0B" },
    "divider":         { "value": "rgba(255,255,255,0.08)" }
  },
  "space": { "2xs":"4px","xs":"8px","sm":"12px","md":"16px","lg":"24px","xl":"32px","2xl":"48px" },
  "radius": { "full":"999px","lg":"20px","md":"16px","sm":"12px" },
  "font": {
    "brand": { "value": "Poppins, Quicksand, sans-serif" },
    "ui":    { "value": "Inter, SF Pro Text, system-ui, sans-serif" }
  }
}
```

---

## 8. UI Components (screen-by-screen inventory)

| Screen | Key components |
|---|---|
| **Splash** | Brand logo (`font-brand`), mixed-weight tagline, outlined play button, top-right radial glow |
| **Name onboarding** | H1 prompt, single text input (pill), bottom primary CTA "Next" |
| **Device selection** | H1 prompt, autocomplete text input, dropdown list card, secondary "Back" + primary "Next" |
| **Preferences** | Section headers, stepper rows (incline/steps/distance), 3× segmented controls, device row, back chevron |
| **Voice — empty** | Prompt text, ambient green blob (idle) |
| **Voice — active** | Prompt text, right-aligned user message bubble, brighter waveform blob |
| **Route preview** | Mini map with route, turn-by-turn list (icon + distance + street), trip-time summary, "Preview" secondary CTA |
| **Connection** | Phone ⇄ Bluetooth ⇄ projector connector card, loading status text, "Confirm" primary CTA |
| **3D navigation** | Full-bleed 3D map, lime route line, position marker, floating metric cards (incline / next turn), bottom transport controls |

### Component states checklist for build
- Buttons: default / pressed / disabled / loading
- Input: empty (placeholder) / focused / filled / with-dropdown
- Segmented: unselected / selected (inverse)
- Stepper: min-bound / mid / max-bound (disable −/+ at limits)
- Voice blob: idle / listening / speaking
- Nav cards: enter / update / dismissed

---

## Accessibility notes (this product's core concern)
- Contrast: white-on-`#0A0A0B` and black-on-`#C4F82A` both clear WCAG AA large. Verify `text-secondary` (`#9A9A9E`) on dark surfaces meets AA for small text — it's borderline; bump to ~`#A8A8AD` if it fails.
- Tap targets: keep the observed ~56px control height as a floor (exceeds the 44px minimum) given the mobility-impaired audience.
- Provide a visible `color-accent` focus ring for switch/voice/keyboard navigation.
- Don't rely on the single accent color alone to convey state — pair with the inverse fill (already done in segmented controls) and iconography.
