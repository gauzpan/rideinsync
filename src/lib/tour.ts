// First-time welcome tour memory. Same per-device localStorage pattern as the
// voice onboarding flag (see lib/preference + voiceCommands), so a fresh guest
// or a new device sees the tour once and returning riders skip it. Keys are
// kept here so the tour page, AppLayout's redirect gate, and the home replay
// nudge all agree on the same strings.

/** Primary flag: set once the rider finishes or skips /welcome. */
export const TOUR_WELCOME_KEY = "tour.welcome.seen";

/** Secondary flag: the one-time "replay the tour" nudge on home. */
export const TOUR_HOME_NUDGE_KEY = "tour.nudge.home.seen";
