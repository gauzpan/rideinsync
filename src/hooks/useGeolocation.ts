// GPS watch for the rider. Uses the Capacitor Geolocation plugin, which:
//  - on native Android: requests the runtime location permission (prompts) and
//    uses native GPS — navigator.geolocation is unreliable inside a WebView;
//  - on web: falls back to navigator.geolocation.
// Foreground only; the watch is cleared on unmount / when inactive.

import { useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { haversineMeters } from "../lib/geo";

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

const num = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function useGeolocation(active: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<string | null>(null);
  // Last *accepted* fix (not every raw fix) — compared against on each new
  // native fix to decide whether to accept it. Null until the first fix.
  const lastAccepted = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        // Prompts for the OS location permission on native; no-op/granted on web.
        const perm = await Geolocation.requestPermissions();
        if (perm.location === "denied" && perm.coarseLocation === "denied") {
          setError("Location permission denied. Enable it to share your position.");
          return;
        }
      } catch {
        // Some web contexts reject requestPermissions; watchPosition still prompts.
      }
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
          (pos, err) => {
            if (cancelled) return;
            if (err) {
              setError(err.message ?? "Couldn't get your location.");
              return;
            }
            if (pos) {
              setError(null);
              const next: Fix = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                heading: num(pos.coords.heading),
                speed: num(pos.coords.speed),
                accuracy: num(pos.coords.accuracy),
              };
              const now = Date.now();
              const last = lastAccepted.current;
              const accepted =
                !last ||
                now - last.t >= MIN_INTERVAL_MS ||
                haversineMeters({ lat: last.lat, lng: last.lng }, { lat: next.lat, lng: next.lng }) >=
                  MIN_DISTANCE_M;
              if (!accepted) return;
              lastAccepted.current = { lat: next.lat, lng: next.lng, t: now };
              setFix(next);
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
  }, [active]);

  return { fix, error };
}
