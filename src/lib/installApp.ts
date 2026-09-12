// "Download"/install-to-home-screen support — two genuinely different
// mechanisms, same split as push notifications (PRD/signals_haptics_plan.md
// §7a/§10):
//
// - Android Chrome + desktop Chrome/Edge fire `beforeinstallprompt`, which we
//   capture and replay later from our own "Install app" button — the browser
//   only shows its native mini-infobar otherwise, easy to miss and not
//   brandable.
// - iOS Safari has no install API at all. There's no event, no `.prompt()`,
//   nothing to feature-detect — the only "install" path is the user manually
//   doing Share → Add to Home Screen, so the best this hook can do is detect
//   "iOS, not yet installed" and hand the UI enough to show instructions.
//   Detection is intentionally UA-based here (not a feature-detect) because
//   there is no non-UA signal for "is this iOS Safari" — same one exception
//   called out in §10's otherwise-avoid-UA-sniffing guidance.
//
// `navigator.standalone` (iOS) / `display-mode: standalone` (everywhere
// else) tells us the app is already installed, in which case there's
// nothing to prompt.
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "installable" | "ios-manual" | "installed" | "unsupported";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports as "MacIntel" with touch support — the standard
  // workaround since there's no dedicated iPadOS UA token.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function useInstallPrompt(): {
  platform: InstallPlatform;
  install: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const platform: InstallPlatform = installed
    ? "installed"
    : deferred
      ? "installable"
      : isIOS()
        ? "ios-manual"
        : "unsupported";

  async function install(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  return { platform, install };
}
