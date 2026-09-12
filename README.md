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

## Testing on web vs Android

The app ships as an Android APK (Capacitor), but it's the same web build underneath — use the browser for day-to-day iteration:

```bash
npm run dev   # http://localhost:5173
```

Open in Chrome and toggle the device toolbar (Cmd+Shift+M) for a phone-sized viewport. This covers most UI/logic work.

**Doesn't work in plain browser dev** (Capacitor-native only):
- `@capacitor/geolocation` — falls back to browser geolocation, different permission flow than Android.
- `@capacitor/app` (deep links, back-button handling) — no-op in browser.
- Other native Capacitor plugin APIs.

**To test closer to actual APK behavior** without building an APK, run the Capacitor web layer in the Android emulator:

```bash
npm run build
npx cap sync android
npx cap open android   # opens Android Studio, run on emulator
```

With the emulator running, use `chrome://inspect` on your machine for remote DevTools debugging of native-bridge issues.

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
| `/demo`              | Demo controls      |

Design system: `design/rideinsync-design-system.md`. Product scope: `PRD/PRD.md`.
