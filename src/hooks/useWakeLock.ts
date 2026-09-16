import { useEffect } from "react";

// Hold a Screen Wake Lock while `active` (e.g. nav mode), so the display stays
// lit during navigation. Combined with the Android activity's showWhenLocked
// flag (see MainActivity.java), this keeps the ride/nav view visible over the
// lock screen instead of the screen sleeping mid-ride. The lock is released on
// tab hide and re-acquired on return; no-op where the API is unsupported (e.g.
// iOS Safari), and never throws.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl) return;

    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await wl.request("screen");
      } catch {
        /* denied / not visible — ignore, retry on next visibility change */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
