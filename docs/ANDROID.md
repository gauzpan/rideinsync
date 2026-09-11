# Shipping RideInSync as an Android app

RideInSync is a **PWA** (per `PRD/PRD.md` Part 1). On Android it is already
installable from Chrome (**⋮ → Install app**) — home-screen icon, fullscreen,
app-like. This doc covers turning that into a distributable **`.apk` / `.aab`**.

**Groundwork already in place:** the web manifest (`vite.config.ts` → generated
`manifest.webmanifest`) declares `id` / `start_url` / `scope`, `display:
standalone`, portrait, theme colours, and 192/512 + maskable icons — the fields
a wrapper needs.

**What a build still requires (a deploy task, not done here):**
- The app **deployed to a public HTTPS URL** (TWA verifies the origin).
- **JDK 17** and the **Android SDK** on the build machine.
- A signing keystore (and, for the store, a Play Console account).

---

## Path A — TWA via Bubblewrap (recommended for Play Store)

A Trusted Web Activity wraps the deployed PWA in a thin native shell. No code
change; the APK loads the live site fullscreen.

```bash
# after deploying to https://<your-domain>
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://<your-domain>/manifest.webmanifest
bubblewrap build            # produces app-release-signed.apk + .aab
```

Then host the **Digital Asset Links** file Bubblewrap prints at
`https://<your-domain>/.well-known/assetlinks.json` so the URL bar is hidden.

Pros: tiny, always in sync with the web app, Play-Store-ready.
Cons: still bound by PWA limits — notably **background GPS** (foreground only).

## Path B — Capacitor (only if we need native APIs)

Choose this if ride tracking must continue with the screen locked / app
backgrounded (native background location), or for Bluetooth-mesh (PRD P2).

```bash
npm i @capacitor/core @capacitor/android
npx cap init RideInSync com.rideinsync.app --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android         # build/sign in Android Studio
```

Then move background location + BLE behind Capacitor plugins, falling back to the
web APIs on the browser build.

---

## Recommendation

Ship **Path A (TWA)** first — it's a wrap of what we already have and needs only
a deploy. Move to **Path B (Capacitor)** only when a feature genuinely needs
native background location or BLE, which the PRD flags as later scope.

**Before either:** replace the placeholder maskable icon with a purpose-built
one (safe-zone padding) so the Android adaptive icon isn't cropped.
