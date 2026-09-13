# RideInSync

Voice-first group-ride coordination PWA for motorcyclists (hackathon prototype).
This is a **bare scaffold** — routing, design tokens, and service stubs only, no features yet.

## Stack

- **React + Vite + TypeScript** — PWA (`vite-plugin-pwa`)
- **Supabase** — real-time backend (client stub in `src/lib/supabase.ts`)
- **Google Maps** — maps / traffic / weather (not wired yet)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Google Maps keys
npm run dev                  # http://localhost:5173
```

`npm run build` type-checks and produces a production PWA build in `dist/`.

## Structure

```
src/
├─ main.tsx            App entry + router mount
├─ router.tsx          Routes (PRD PWA pages)
├─ AppLayout.tsx       Mobile-width shell
├─ pages/              HomePage + screen placeholders
├─ components/         Shared UI (PagePlaceholder)
├─ lib/supabase.ts     Supabase client stub
└─ styles/             Design tokens + global CSS
```

## Routes

| Path                 | Screen             |
| -------------------- | ------------------ |
| `/`                  | Home / nav         |
| `/create`            | Create ride        |
| `/join`              | Join ride          |
| `/ride/:rideId`      | Rider view         |
| `/ride/:rideId/lead` | Lead / sweep view  |
| `/groups`            | Groups (crews)     |
| `/groups/new`        | Create-group wizard |
| `/groups/:groupId`   | Group detail       |
| `/demo`              | Demo controls      |
| `/discover`          | Discover feed      |
| `/discover/pick/:pickId` | Editor's pick detail |

Design system: `design/rideinsync-design-system.md`. Product scope: `PRD/PRD.md`.
