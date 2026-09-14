// Local (on-device) notifications for a few critical ride events — SOS, ride
// start, ride end. These fire on the RECEIVING device when the app observes the
// live event (via Realtime), so a rider whose app is open or backgrounded gets
// a heads-up even if they're on another screen.
//
// Scope/limits (by design for the demo): these are *local* notifications, not
// server push. They only fire while the app's JS is alive to see the event; if
// the app is fully killed, nothing fires. True closed-app delivery needs native
// FCM (a separate, larger piece of work). No-ops on the web build.

import { Capacitor } from "@capacitor/core";

let permissionGranted: boolean | null = null;

/** Ask for the OS notification permission once (Android 13+ needs it at
 *  runtime). Cached so repeated calls are cheap. Safe on web (returns false). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (permissionGranted !== null) return permissionGranted;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") {
      permissionGranted = true;
    } else if (current.display === "denied") {
      permissionGranted = false;
    } else {
      const requested = await LocalNotifications.requestPermissions();
      permissionGranted = requested.display === "granted";
    }
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

/** Fire an immediate on-device notification. Best-effort: any failure (no
 *  permission, web build, plugin error) is swallowed so it never breaks the
 *  event path that triggered it. */
export async function fireLocalNotification(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          // A 32-bit id unique enough for concurrent alerts.
          id: Math.floor(Math.random() * 2_000_000_000),
          title,
          body,
          smallIcon: "ic_stat_icon_config_sample",
        },
      ],
    });
  } catch {
    /* best-effort — never throw into the caller */
  }
}
