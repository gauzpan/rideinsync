# RideInSync — Local Setup & Sync

How to get a working local environment and stay in sync with the team. Read
alongside `README.md`, `ARCHITECTURE.md` (stack + Supabase project setup), and
`docs/DATA_MODEL.md` (schema, ownership, branch workflow).

Stack: **React + Vite + TypeScript (PWA)** frontend, **Supabase Postgres** backend,
**Google Maps** for maps. Package manager: **npm** (`package-lock.json` is committed).

---

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | **20 LTS or newer** | Vite 5 needs ≥18; 20+ recommended. |
| npm | 10+ | Ships with Node. |
| Git | any recent | |
| Supabase CLI | latest | Only if you run a **local** database (Path B). `brew install supabase/tap/supabase`. |
| Docker Desktop | latest | Required by the Supabase CLI for a local DB (Path B). |
| GitHub CLI (`gh`) | optional | For opening PRs from the terminal. |

Check: `node -v && npm -v`.

---

## 2. First-time setup

```bash
git clone https://github.com/gauzpan/rideinsync.git
cd rideinsync
npm install
cp .env.example .env.local     # then fill in the keys (next section)
```

`.env.local` is git-ignored — never commit real keys.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=      # optional until maps land
```

---

## 3. Backend — pick one path

### Path A — Shared hosted Supabase project (recommended for the hackathon)

Everyone points at **one** Supabase project, so all pods see the same data and the
demo seed is shared. The schema is applied **once** by whoever owns the project.

1. Ask the project owner for the **Project URL** and **anon key** → put them in
   `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. Owner-only, one time: create the project and enable auth providers as in
   **`ARCHITECTURE.md §8`**, then in the Supabase **SQL editor** run, in order:
   - `supabase/migrations/0001_foundation.sql`
   - `supabase/seed.sql`
3. You're done — no local database needed. Skip to §4.

> When a new migration merges to `main` (a teammate's `000N_<flow>.sql`), the
> project owner runs that file in the SQL editor once; everyone else just pulls
> and regenerates types (§5).

### Path B — Local Supabase (for schema work / offline)

Isolated database on your machine. Best if you're writing migrations.

```bash
# once, if supabase/config.toml doesn't exist yet:
supabase init                  # keeps the existing supabase/migrations + seed.sql

supabase start                 # boots local Postgres + Auth (Docker)
supabase db reset              # applies migrations/0001_foundation.sql + seed.sql
```

`supabase start` prints a local **API URL** and **anon key** — put those in
`.env.local`. Stop with `supabase stop`.

---

## 4. Run the app

```bash
npm run dev        # http://localhost:5173
npm run build      # type-check (tsc) + production PWA build
npm run preview    # serve the built app
```

Add `http://localhost:5173` to Supabase → Authentication → URL Configuration
(Path A) so OAuth/redirect works.

---

## 5. Generate / refresh TypeScript types

Types live in `src/lib/database.types.ts`; import your types from
`src/lib/models.ts`. Regenerate whenever the schema changes:

```bash
# Path B (local DB running):
supabase gen types typescript --local > src/lib/database.types.ts

# Path A (hosted project):
supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```

The committed `database.types.ts` is a hand-authored mirror of `0001_foundation.sql`;
regenerating replaces it with the real generated output once a DB exists.

---

## 6. Working on your flow (branch workflow)

Full ownership matrix + rules: **`docs/DATA_MODEL.md`**. In short:

1. Branch from up-to-date `main`: `git switch main && git pull && git switch -c feature/<name>-<flow>`.
2. Own only your flow's tables. Add flow-specific columns/tables via a **new**
   migration `supabase/migrations/000N_<flow>.sql` — **do not edit**
   `0001_foundation.sql`.
3. **Seam tables** — `profiles`, `rides`, `ride_members`, `rider_positions`,
   `ride_events`, `event_acknowledgements` — change only by review (that's where
   merge conflicts and RLS breakage come from).
4. Apply your migration locally (`supabase db reset`), regenerate types (§5),
   `npm run build`, then open a PR into `main`.

---

## 7. Staying in sync (do this regularly)

```bash
git switch main && git pull                 # get the latest foundation + merged flows
npm install                                 # in case dependencies changed
# Path A: ask the owner to run any new 000N_*.sql in the SQL editor (once)
# Path B: supabase db reset                 # re-apply all migrations + seed locally
#         (WARNING: db reset wipes local data)
supabase gen types typescript ... > src/lib/database.types.ts   # if schema changed (§5)
git switch feature/<your-branch> && git rebase main             # bring your branch up to date
```

Rule of thumb: **pulled a schema change → re-apply migrations → regenerate types →
`npm run build`.**

---

## 8. Troubleshooting

- **`[supabase] VITE_SUPABASE_URL ... not set`** — `.env.local` missing/blank, or you
  didn't restart `npm run dev` after editing it.
- **Auth/redirect fails** — add your dev URL under Supabase → Auth → URL Configuration.
- **`supabase start` errors** — Docker Desktop isn't running.
- **Types out of date / TS errors after a pull** — regenerate `database.types.ts` (§5).
- **`supabase db reset` wipes local users too.** Stored sessions become ghosts
  (RLS 401 / FK 409 on `profiles`). The app now detects this at boot
  (`getValidSession`) and bounces to the landing — just sign in again.
- **RLS: a query returns 0 rows unexpectedly** — you're likely not a member of that
  ride; join via the `request_join_ride` RPC. See the RLS smoke tests in
  `docs/DATA_MODEL.md`.
