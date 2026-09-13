// Editor's picks — curated multi-day rides out of Bengaluru and Hyderabad,
// hand-researched at implementation time (see src/lib/editor-picks/*).
//
// - distanceKm is one-way road km from the rider's city centre, sourced from
//   mainstream route-planning/travel guides and rounded to the nearest 5 km.
// - bestSeason is a human-readable hint, not a strict availability window.
// - A third city follows the same pattern: 6–10 picks, all within 1000 km
//   one-way, added to PICK_CITIES and EDITOR_PICKS — no other code changes.
import type { TravelMode } from "../lib/models";
import { EDITOR_PICKS as BENGALURU_PICKS } from "../lib/editor-picks/bengaluru-picks";
import { EDITOR_PICKS as HYDERABAD_PICKS } from "../lib/editor-picks/hyderabad-picks";

export type PickCity = "bengaluru" | "hyderabad";
export type PickMode = Exclude<TravelMode, "cycle">; // "motorcycle" | "car"
export type PickDifficulty = "easy" | "moderate" | "hard";

export type EditorPick = {
  id: string; // e.g. "blr-coorg"
  city: PickCity;
  name: string; // destination / route name
  distanceKm: number; // one-way road distance, verified in research pass
  days: number; // suggested duration
  bestSeason: string; // e.g. "Oct – Feb"
  modes: PickMode[]; // ["motorcycle", "car"] when both
  blurb: string; // 1–2 lines
  highlights: string[]; // 2–4 stops
  difficulty?: PickDifficulty;
};

export const EDITOR_PICKS: EditorPick[] = [...BENGALURU_PICKS, ...HYDERABAD_PICKS];

export const PICK_CITIES: { value: PickCity; label: string }[] = [
  { value: "bengaluru", label: "Bengaluru" },
  { value: "hyderabad", label: "Hyderabad" },
];
