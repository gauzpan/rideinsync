import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not the default generateSW) — needed so sw.ts can add
      // its own push/notificationclick listeners on top of precaching. See
      // src/sw.ts and PRD/signals_haptics_plan.md §7a.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // vosk-browser's WASM engine (~6MB) is dynamically imported only when
        // voice commands are turned on (see lib/voiceCommands.ts) — precaching
        // it here would force every install to download it up front, which
        // defeats the point of lazy-loading it, on top of exceeding Workbox's
        // default 2 MiB precache-entry limit outright.
        globIgnores: ["**/vosk-*.js"],
      },
      // devOptions.enabled — push needs a real registered service worker to
      // test the subscribe flow; without this the SW (and therefore push)
      // only exists in a built+previewed app, not `npm run dev`.
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        // id/start_url/scope make the app identity explicit so a TWA (Android
        // APK) wrapper and the installed PWA resolve to the same app. See docs/ANDROID.md.
        id: "/",
        name: "RideInSync",
        short_name: "RideInSync",
        description: "Voice-first group-ride coordination for motorcyclists.",
        theme_color: "#0A0A0B",
        background_color: "#0A0A0B",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            // Maskable icon for Android adaptive icons (TWA/Play Store). Uses the
            // 512 for now — replace with a purpose-built maskable (safe-zone) art.
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
