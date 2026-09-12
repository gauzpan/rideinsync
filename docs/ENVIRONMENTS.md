# Environments — dev & prod Supabase projects

RideInSync uses **two separate Supabase projects** in the team account, not two
schemas in one database (see ARCHITECTURE.md for why: real isolation, safe
migrations, independent blast radius).

| Environment | Supabase project | Where its keys live |
| --- | --- | --- |
| **dev** | `rideinsync-dev` | each developer's local `.env.local` (gitignored) |
| **prod** | `rideinsync-prod` | the hosting platform's env vars (never committed) |

Both projects run the **same schema** — apply `schema_full.sql` (all migrations
in order) to each fresh project. Keep `supabase/migrations/` as the source of
truth; new changes are new migration files applied to dev first, then prod.

## Standing up a fresh project (dev or prod)

1. Create the project in the team Supabase account.
2. SQL editor → paste **`schema_full.sql`** → Run.
3. Authentication → Providers → enable **Anonymous**.
4. Authentication → Providers → **Google**: paste the OAuth client id/secret,
   and set the redirect URL to `https://<project-ref>.supabase.co/auth/v1/callback`
   (create the OAuth client in Google Cloud Console for that project).
5. Authentication → URL Configuration → add the site URL(s):
   `http://localhost:5173` for dev, the deployed URL for prod.

## How the app picks a project

The client reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the Vite
env (see `src/lib/supabase.ts`). No code branching is needed:

- **Local dev** → put the **dev** project's URL + anon key in `.env.local`.
  `npm run dev` uses them.
- **Production build/deploy** → set the **prod** project's URL + anon key as env
  vars in the host (Vercel/Netlify/etc.). `npm run build` picks them up there.

Templates: `.env.development.example` and `.env.production.example`.

> The anon key is safe to ship in the browser bundle (RLS is the real guard).
> The Google Maps key ships too — restrict it to the deploy domain in Google
> Cloud Console before going public. Never commit real `.env*.local` files.
