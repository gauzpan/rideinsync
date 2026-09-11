// Foreground GPS watch for the real rider (your phone). Follows the PRD:
// watchPosition, explicit tracking state, cleared on unmount. iOS PWAs lose
// background location — this is intentionally foreground-only.

import { useEffect, useRef, useState } from "react";

export type Fix = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
};

export function useGeolocation(active: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available on this device.");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (p) =>
        setFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
          speed: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
          accuracy: p.coords.accuracy ?? null,
        }),
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [active]);

  return { fix, error };
}
