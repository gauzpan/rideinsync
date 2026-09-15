import posthog from "posthog-js";

const enabled = () => Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);

export function track(name: string, props: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  try {
    posthog.capture(name, props);
  } catch {
    /* analytics is best-effort */
  }
}

export function identifyUser(userId: string, props: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  try {
    posthog.identify(userId, props);
  } catch {
    /* best-effort */
  }
}

export function resetAnalytics(): void {
  if (!enabled()) return;
  try {
    posthog.reset();
  } catch {
    /* best-effort */
  }
}
