# Developer notes — RideInSync

Read this before running the app or building the Android APK.

## ⚠️ Backend / Supabase — the important bit

- **The active Supabase project is `qlxnpkxmucmtauelwotn`.** All dev + testing runs
  against it (one shared environment for now; a separate prod project is blocked
  by the free-tier project limit).
- **Any older Supabase URL / project ref you were given earlier is dead — delete it
  from your `.env.local`.** Only `qlxnpkxmucmtauelwotn`'s URL + anon key are valid.
- **Do NOT use `hqolmiehsmewaddwrxyy`.** It was briefly renamed "ridesync-prod" but
  it is the **live Dwaar eKYC app's database** (it has its own `public.profiles`,
  `service_requests`, `worker_profiles`). Running our schema there would collide and
  break that app.
- Get the actual `.env` values (Supabase URL + anon key, Google Maps key, Map ID)
  from the team. **Never commit `.env*.local`.**

## Run the web app (also the iPhone PWA)

```bash
npm install
cp .env.development.example .env.local   # then fill from the team
npm run dev                               # http://localhost:5173
```

## Build the Android APK (Capacitor — the real Android app)

Native app lives in `android/` (package `com.rideinsync.app`). iPhone users use the
PWA; Android gets this APK.

```bash
# 1. one-time per machine: android/local.properties (git-ignored)
echo "sdk.dir=/absolute/path/to/Android/Sdk" > android/local.properties   # forward slashes

# 2. build web WITHOUT the service worker, then sync into the native project
VITE_TARGET=capacitor npm run build
npx cap sync android

# 3. build the APK  (JAVA_HOME = Android Studio's bundled JDK, or any JDK 17)
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk  (debug-signed; sideloadable)
```

Install/run on a device: `adb install -r app-debug.apk`, or open `android/` in
Android Studio and Run.

## Gotchas that cost us time (don't relearn them)

- **Never ship the PWA service worker in the Capacitor build.** It precaches the
  app inside the WebView and then serves *stale JS* after every APK update, so your
  changes look broken on the phone. That's why the build uses `VITE_TARGET=capacitor`
  (disables the SW). If a device is stuck on old code, `adb shell pm clear
  com.rideinsync.app` to purge the WebView cache.
- **Google OAuth can't run in a WebView.** Native sign-in opens the system browser
  and returns via the deep link **`com.rideinsync.app://auth`** — which must stay in
  Supabase → Authentication → Redirect URLs, and in the `BROWSABLE` intent-filter in
  `android/app/src/main/AndroidManifest.xml`.
- **Creating a ride requires a Google account** (leaders); guests can join. There's
  a dev-only "Create as guest" fallback on the create form for testing without Google.
- **GPS uses `@capacitor/geolocation`** (native), not `navigator.geolocation` — the
  latter is unreliable in the WebView.
- **Google Maps key is currently unrestricted.** Restrict it to the app package +
  SHA-1 (and web domain) before any public release.

## Data model & migrations

- Source of truth: `supabase/migrations/`. A **fresh** project takes the full,
  correctly-ordered set — see `schema_full.sql` (build/ask the team) — because the
  history has three colliding `0002_*` files (foundation-fix, flow1, sos). Never
  reuse a migration number; take the next free one.
- Docs: `ARCHITECTURE.md` (system design), `docs/DATA_MODEL.md` (schema + ownership),
  `docs/ENVIRONMENTS.md` (dev/prod), `docs/ANDROID.md` (APK paths incl. TWA later).
