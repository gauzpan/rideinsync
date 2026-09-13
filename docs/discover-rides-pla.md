# Plan — Discover: Editor's Picks Trips

Grilled and settled 2026-09-14. Status: **planned, not implemented**.

## Goal

Discover tab gets an **Editor's picks** section: curated rides out of the
rider's city, each doable by bike or car. First pass is hand-researched static
data for **Bengaluru + Hyderabad**, capped at **1000 km one-way road distance**.

## Settled decisions (grilling Q1–Q9)

| # | Decision | Answer |
|---|----------|--------|
| Q1 | Data location | Static TS data file shipped with the app (offline-safe, no migration) |
| Q2 | "Max 1000km" | One-way road distance to the destination |
| Q3 | City scope | Rider picks from pills: Bengaluru, Hyderabad |
| Q4 | Bike/car | Filter chips (All / Bike / Car), default All |
| Q5 | Tap behavior | Read-only detail + "Plan a ride" → `/create` |
| Q6 | Fields | Name, distance, days, best season, modes, blurb, 2–4 highlight stops, difficulty if available |
| Q7 | Count | 6–10 picks per city |
| Q8 | Detail view | Dedicated screen |
| Q9 | City control | Pills via existing `SegmentedControl` |

Out of scope for first pass: cycling picks (`cycle` excluded from modes),
difficulty rubric (free-text only when the source states one), external map
links (leave the PWA), bookmarking, group-scoped ride prefill, DB-backed
picks/admin editing, cities beyond Bengaluru/Hyderabad.

## Research pass (done at implementation time)

Use the files stored in "lib/editor-picks" folder

## Data shape

New file `src/data/editorPicks.ts`:

```ts
import type { TravelMode } from "../lib/models";

export type PickCity = "bengaluru" | "hyderabad";
export type PickMode = Exclude<TravelMode, "cycle">; // "motorcycle" | "car"
export type PickDifficulty = "easy" | "moderate" | "hard";

export type EditorPick = {
  id: string;            // e.g. "blr-coorg"
  city: PickCity;
  name: string;          // destination / route name
  distanceKm: number;    // one-way road distance, verified in research pass
  days: number;          // suggested duration
  bestSeason: string;    // e.g. "Oct – Feb"
  modes: PickMode[];     // ["motorcycle", "car"] when both
  blurb: string;         // 1–2 lines
  highlights: string[];  // 2–4 stops
  difficulty?: PickDifficulty;
};

export const EDITOR_PICKS: EditorPick[] = [ /* 6–10 per city */ ];
export const PICK_CITIES: { value: PickCity; label: string }[] = [
  { value: "bengaluru", label: "Bengaluru" },
  { value: "hyderabad", label: "Hyderabad" },
];
```

## UI changes

### DiscoverPage (`src/pages/DiscoverPage.tsx`)

New **"Editor's picks"** section placed above the existing stub sections:

- City pills: `SegmentedControl` with `PICK_CITIES` (needs string options with
  ReactNode labels — matches its existing `STOP_OPTIONS` usage pattern in
  CreateRidePage). Default: Bengaluru.
- Mode filter chips: All / Bike / Car. "Bike" maps to `motorcycle` (label shown
  to riders is "Bike"). Default: All.
- Pick cards: name, `{distanceKm} km · {days}d`, season line, mode tags.
  Tapping a card navigates to `/discover/pick/:pickId`.
- Design tokens only; one accent action per screen is preserved (no primary
  button in the list — cards are plain navigation).

Filtering is client-side over `EDITOR_PICKS` (tiny dataset, no memo needed
beyond plain `filter`).

### PickDetailPage (`src/pages/PickDetailPage.tsx`, new)

Route `/discover/pick/:pickId` — Discover tab stays active via the existing
`startsWith("/discover")` match:

- `BackLink` to `/discover`.
- Title, city, mode tags, stat row (distance / days / best season / difficulty
  if present), blurb, highlight stops list.
- Single accent action: **"Plan a ride"** → `navigate("/create")`
  (group-scoped prefill is a later decision — plain navigation for now).
- Unknown id → "Pick not found" + back link (same pattern as GroupDetailPage).

### Router (`src/router.tsx`)

```tsx
{ path: "discover/pick/:pickId", element: <PickDetailPage /> },
```

IMPORTANT: declare it **before** any conflicting `discover/...` route; there
is none today, but keep it adjacent to the `discover` entry.

### README (`README.md`)

Add rows: `/discover` already missing — add `/discover` (Discover feed) and
`/discover/pick/:pickId` (Editor's pick detail) to the routes table.

## Verification

1. `npx tsc -b --force` — zero errors in touched files (branch has pre-existing
   errors elsewhere; confirm none are new via `git stash` comparison if needed).
2. `npx vite build` passes.
3. `npm test` — same pass/fail counts as before the change (2 pre-existing
   font failures).
4. Manual: Discover → pills switch cities, chips filter, card → detail →
   "Plan a ride" lands on `/create`.

## Follow-ups (not this plan)

- Third city (data + pill; no code changes beyond the data file).
- Bookmark/save picks (needs `user_saved_picks` table + migration).
- "Plan a ride" prefill from a pick (destination/name into CreateRidePage).
- DB-backed picks with an editor role (replaces the static file).
