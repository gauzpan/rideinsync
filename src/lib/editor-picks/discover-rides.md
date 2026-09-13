## Distance and season policy

- **DistanceKm source**: Use one‑way road distance from a mainstream route‑planning or travel guide. Round to the nearest 5 km when multiple sources disagree by ±10–20 km. Document any major changes in commit messages with the source link (e.g., “updated BLR→Sakleshpur to 221 km per Savaari NH75 route”).savaari+2
- **BestSeason format**: Keep to short ranges like `"Oct – Feb"` or `"Sep – May"`, aligned to the most commonly recommended window from 2–3 independent guides. Prefer rider comfort over “max greenery” when there’s a tradeoff (e.g., post‑monsoon vs heavy monsoon).waytoindia+2

## Modes, difficulty and safety

- **Modes**: Default to `["motorcycle", "car"]` for all picks unless there is a strong safety reason to exclude one mode (e.g., very poor surface, explicit advisory). The rider still decides their actual vehicle; modes here are “recommended” rather than enforced.
- **Difficulty**: Use a simple rubric:
  - `easy`: &lt;250 km, mostly good highways, minimal ghat, lots of stops.
  - `moderate`: Ghats, longer days (&gt;250 km), or mixed surfaces.
  - `hard`: Reserve for any future very long/technical routes; omit for now to avoid over‑encoding.

## Data maintenance

- Put a short comment block above `EDITOR_PICKS` in `editorPicks.ts` explaining:
  - Distances are one‑way road km from the rider’s city centre.
  - `bestSeason` is a human‑readable hint, not a strict availability window.
  - New cities follow the same pattern: 6–10 picks, all within 1000 km one‑way, each verifiable via a quick web check at implementation time.

