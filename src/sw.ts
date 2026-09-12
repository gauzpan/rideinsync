/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa `injectManifest` strategy) — adds
// Web Push handling on top of the same asset precaching the previous
// `generateSW` strategy did automatically (see vite.config.ts). Excluded from
// the app's tsconfig (see tsconfig.json's `exclude`) since the WebWorker and
// DOM lib types can't coexist in one TypeScript project; vite-plugin-pwa
// bundles this file separately via esbuild regardless of that exclusion.
//
// Push payload shape is produced by supabase/functions/push-notify — keep
// the two in sync if either changes.

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

type PushPayload = { title: string; body: string; tag?: string; urgent?: boolean };

self.addEventListener("push", (event) => {
  let data: PushPayload = { title: "RideInSync", body: "New ride update." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Malformed/empty payload — fall back to the generic line above rather
    // than dropping the notification entirely.
  }

  // Vibrate pattern mirrors the tier-reuse rationale in §2/§7b of
  // PRD/signals_haptics_plan.md: a single pulse for routine signals, the
  // insistent triple pulse only for Critical (SOS). Android-only per the
  // Notification API spec — a no-op elsewhere, not an error.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: data.urgent ? [400, 150, 400, 150, 400] : [200],
      requireInteraction: Boolean(data.urgent),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c): c is WindowClient => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    }),
  );
});
