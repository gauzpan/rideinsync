// GPS watch for the rider.
//  - native (Android): @capacitor-community/background-geolocation — a foreground
//    service that keeps delivering fixes while the screen is locked or the rider
//    is in another app, so their position keeps sharing (and never goes stale)
//    for the whole ride.
//  - web / iOS PWA: @capacitor/geolocation (falls back to navigator.geolocation).
//    Foreground only — the browser suspends the watch when backgrounded.
// The watch is cleared on unmount / when inactive.

import { useCallback, useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { haversineMeters } from "../lib/geo";
import { track } from "../lib/analytics";

// Gate raw native fixes down to a demo-tuned rate before they ever reach
// setFix: at most one accepted fix per MIN_INTERVAL_MS, unless the rider has
// moved at least MIN_DISTANCE_M since the last accepted fix (OR, not AND) —
// this is what caps rider_positions insert volume upstream of LiveOps.tsx.
const MIN_INTERVAL_MS = 5000;
const MIN_DISTANCE_M = 20;

export type Fix = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
};

// Minimal typing for @capacitor-community/background-geolocation.
type BgLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  bearing: number | null;
  speed: number | null;
  time: number | null;
};
type BgError = { code?: string; message?: string };
type BackgroundGeolocationPlugin = {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (location?: BgLocation, error?: BgError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const num = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// Browser error codes (GeolocationPositionError) survive the Capacitor
// passthrough on web, so translate them into actionable messages instead of
// surfacing the raw (often cryptic) provider text.
function describeWatchError(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  if (code === 1) return "Location permission denied. Enable it to share your position.";
  if (code === 2)
    return "No GPS fix right now — weak signal, indoors, or this device has no location hardware. Move outdoors and retry.";
  if (code === 3) return "GPS timed out waiting for a fix. Tap retry.";
  return err instanceof Error && err.message ? err.message : "Couldn't get your location.";
}

export function useGeolocation(active: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by retry() to tear down the current watch and start a fresh one —
  // a denied/timed-out watch never recovers on its own.
  const [attempt, setAttempt] = useState(0);
  // Falls back to true after a high-accuracy timeout with no fix yet: some
  // devices (desktops, indoor phones) can never lock GPS but can serve a
  // coarse network fix. A coarse fix beats no fix for a live group map.
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const watchId = useRef<string | null>(null);
  const gotFix = useRef(false);
  // Last *accepted* fix (not every raw fix) — compared against on each new
  // native fix to decide whether to accept it. Null until the first fix.
  const lastAccepted = useRef<{ lat: number; lng: number; t: number } | null>(null);

  // Shared accept-gate: throttle to MIN_INTERVAL_MS unless moved MIN_DISTANCE_M.
  const accept = useCallback((next: Fix) => {
    const now = Date.now();
    const last = lastAccepted.current;
    const ok =
      !last ||
      now - last.t >= MIN_INTERVAL_MS ||
      haversineMeters({ lat: last.lat, lng: last.lng }, { lat: next.lat, lng: next.lng }) >= MIN_DISTANCE_M;
    if (!ok) return;
    lastAccepted.current = { lat: next.lat, lng: next.lng, t: now };
    setFix(next);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    // ---- Native: background foreground-service watcher (locked / other apps) ----
    if (Capacitor.isNativePlatform()) {
      let removed = false;
      BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "RideInSync — ride active",
          backgroundMessage: "Sharing your live location with your ride.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 5,
        },
        (location, err) => {
          if (cancelled) return;
          if (err) {
            if (err.code === "NOT_AUTHORIZED") {
              setError('Location permission denied. Enable it (choose "Allow all the time") to keep sharing while your screen is off.');
              track("location_permission", { result: "denied", platform: "native" });
            } else {
              setError(err.message || "Couldn't get your location.");
            }
            return;
          }
          if (!location) return;
          if (!gotFix.current) track("location_permission", { result: "granted", platform: "native" });
          gotFix.current = true;
          setError(null);
          accept({
            lat: location.latitude,
            lng: location.longitude,
            heading: num(location.bearing),
            speed: num(location.speed),
            accuracy: num(location.accuracy),
          });
        },
      )
        .then((id) => {
          if (cancelled || removed) void BackgroundGeolocation.removeWatcher({ id });
          else watchId.current = id;
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Location unavailable."));

      return () => {
        cancelled = true;
        removed = true;
        if (watchId.current) {
          void BackgroundGeolocation.removeWatcher({ id: watchId.current });
          watchId.current = null;
        }
      };
    }

    // ---- Web / iOS PWA: foreground-only @capacitor/geolocation ----
    (async () => {
      try {
        // Detect whether a prompt will actually show, so we log only genuine prompt
        // decisions (not returning granted/denied devices that resolve instantly).
        let willPrompt = false;
        try {
          const before = await Geolocation.checkPermissions();
          willPrompt =
            before.location === "prompt" || before.location === "prompt-with-rationale" ||
            before.coarseLocation === "prompt" || before.coarseLocation === "prompt-with-rationale";
        } catch {
          // checkPermissions unsupported in this context: leave willPrompt false.
        }

        const perm = await Geolocation.requestPermissions();

        if (willPrompt) {
          const granted = perm.location === "granted" || perm.coarseLocation === "granted";
          track("location_permission", { result: granted ? "granted" : "denied", platform: "web" });
        }

        if (perm.location === "denied" && perm.coarseLocation === "denied") {
          setError("Location permission denied. Enable it to share your position.");
          return;
        }
      } catch {
        // Some web contexts reject requestPermissions; watchPosition still prompts.
      }
      try {
        const id = await Geolocation.watchPosition(
          {
            enableHighAccuracy: !lowAccuracy,
            // High-accuracy GPS can take a while for first lock (cold start,
            // indoors); the old 10 s budget expired before the fix arrived.
            timeout: lowAccuracy ? 15000 : 30000,
            maximumAge: 2000,
          },
          (pos, err) => {
            if (cancelled) return;
            if (err) {
              console.warn("[gps] watch error", err);
              const code =
                typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
              if ((code === 3 || code === 2) && !gotFix.current && !lowAccuracy) {
                setLowAccuracy(true);
                return;
              }
              setError(describeWatchError(err));
              return;
            }
            if (pos) {
              gotFix.current = true;
              setError(null);
              accept({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                heading: num(pos.coords.heading),
                speed: num(pos.coords.speed),
                accuracy: num(pos.coords.accuracy),
              });
            }
          },
        );
        if (cancelled) void Geolocation.clearWatch({ id });
        else watchId.current = id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Location unavailable.");
      }
    })();

    return () => {
      cancelled = true;
      if (watchId.current) {
        void Geolocation.clearWatch({ id: watchId.current });
        watchId.current = null;
      }
    };
  }, [active, attempt, lowAccuracy, accept]);

  /** Clear the error and restart the position watch (re-prompts if needed). */
  const retry = useCallback(() => {
    setError(null);
    setLowAccuracy(false);
    gotFix.current = false;
    setAttempt((n) => n + 1);
  }, []);

  return { fix, error, retry };
}
