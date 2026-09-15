// Live ops map for a REAL ride (Flow 3 ↔ Flow 1 integration). Takes a ride
// created via the onboarding form — whose start/destination are text labels —
// geocodes them into a Google route, draws it, and overlays the real roster's
// live positions from Supabase Realtime. A "Simulate pack" action populates
// riders through the real request→approve→track flow so the map has movement
// without needing many phones.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRideChannel } from "../../hooks/useRideChannel";
import { RideSimulator } from "../../lib/simulator";
import { SIM_RIDER_NAMES } from "../../lib/demoRide";
import { approveJoinRequest } from "../../services/onboardingService";
import { closeRide, startRide } from "../../lib/ending";
import { track } from "../../lib/analytics";
import { canResolveSos, markReached, resolveSosAlert, respondToSos, sendSos, useSosAlerts, useSosResponses, type IncomingAlert } from "../../lib/sos";
import { useAuth } from "../../hooks/useAuth";
import { useGeolocation } from "../../hooks/useGeolocation";
import type { Fix } from "../../hooks/useGeolocation";
import { supabase } from "../../lib/supabase";
import type { Ride, RiderOnMap, GroupStatus } from "../../lib/models";
import type { LatLng } from "../../lib/geo";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { SosAlertStack } from "../SosAlertStack";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID;

// Backoff schedule for positions-ingest retries (M5 hardening) — starts at
// 1s, doubles per consecutive failure, capped at 30s; jitter is added on top
// of each computed delay (see scheduleRetry below) rather than baked in here.
const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

const STATUS_COLOR: Record<GroupStatus, string> = {
  intact: "#5AC8FA",
  behind: "#FF9F0A",
  stopped: "#FF453A",
  stale: "#8A8A8E",
};

function labelOf(pt: Ride["start_point"]): string | null {
  return pt && typeof pt === "object" && "label" in pt ? String((pt as { label?: unknown }).label ?? "") || null : null;
}

// Exact coordinates when the ride was created with a Places-picked address.
function pointOf(pt: Ride["start_point"]): LatLng | null {
  if (pt && typeof pt === "object") {
    const o = pt as { lat?: unknown; lng?: unknown };
    if (typeof o.lat === "number" && typeof o.lng === "number") return { lat: o.lat, lng: o.lng };
  }
  return null;
}

export function LiveOps({ ride }: { ride: Ride }) {
  if (!MAPS_KEY) {
    return (
      <div style={{ padding: "var(--space-md)", color: "var(--color-text-secondary)" }}>
        Set VITE_GOOGLE_MAPS_API_KEY to show the live map.
      </div>
    );
  }
  // Every pin here (self, lead, fellow riders) is an AdvancedMarker, which
  // needs a vector map — no Map ID means the map still loads (raster, route
  // line intact) but every marker silently fails to mount. Surface that
  // explicitly instead of leaving "GPS works, no pins" unexplained.
  if (!MAP_ID) {
    return (
      <div style={{ padding: "var(--space-md)", color: "var(--color-text-secondary)" }}>
        Set VITE_MAP_ID (a vector Map ID from Google Cloud Console → Maps Platform → Map Management) to
        show rider pins — the map loads without it, but markers won't render.
      </div>
    );
  }
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <LiveOpsInner ride={ride} />
    </APIProvider>
  );
}

function LiveOpsInner({ ride }: { ride: Ride }) {
  const geocodingLib = useMapsLibrary("geocoding");
  const routesLib = useMapsLibrary("routes");
  const [route, setRoute] = useState<LatLng[]>([]);
  const [stopPoints, setStopPoints] = useState<LatLng[]>([]);
  const [populating, setPopulating] = useState(false);
  const [populated, setPopulated] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const simRef = useRef<RideSimulator | null>(null);

  const { user } = useAuth();
  const { riders, rideStatus, joinToasts, dismissJoinToast } = useRideChannel(ride.id);
  const [ending, setEnding] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [navMode, setNavMode] = useState(false); // heading-up follow-me (rider nav)
  // Any member can tap a rider in the strip below the map to focus them: the
  // map pans to their fix, their pin is highlighted, and their live
  // coordinates are shown. Tapping again (or the focused rider going away)
  // clears it.
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  // Bumped on each navigate tap so the map pans+zooms to the rider even if
  // they're already selected (re-centering on demand).
  const [focusNonce, setFocusNonce] = useState(0);
  const isLeader = user?.id === ride.leader_id;

  function focusRider(id: string) {
    setSelectedRiderId(id);
    setFocusNonce((n) => n + 1);
  }
  
  // Prefer the live status from Realtime, falling back to the prop the page
  // loaded with (Realtime may not have delivered the first row yet).
  const status = rideStatus ?? ride.status;
  const ended = status === "ended";
  const notStarted = status === "draft";
  const [starting, setStarting] = useState(false);

  // SOS alerts render embedded in this page via the shared SosAlertStack
  // (collapse-to-strip + responder/resolve actions). AppLayout suppresses its
  // global fixed overlay on the ride view so there's no fixed duplicate here.
  const sosAlerts = useSosAlerts(ride.id, user?.id ?? null);
  const sosResponsesByAlert = useSosResponses(ride.id);
  const selfRole = riders.find((r) => r.member.user_id === user?.id)?.member.role ?? null;
  const canResolve = canResolveSos(selfRole);

  function handleSosRespond(alertId: string) {
    if (!user) return;
    void respondToSos(alertId, ride.id, user.id).catch(() => {
      /* logged in respondToSos; duplicate responses are expected */
    });
  }
  function handleSosReached(responseId: string) {
    void markReached(responseId)
      .then(() => track("sos_reached", { ride_id: ride.id }))
      .catch(() => {
        /* logged in markReached */
      });
  }
  function handleSosResolve(alert: IncomingAlert): Promise<void> {
    if (!user) return Promise.reject(new Error("Not signed in."));
    return resolveSosAlert({
      alertId: alert.id,
      rideId: ride.id,
      riderUserId: alert.userId,
      riderName: alert.name,
      riderTriggeredAt: alert.triggeredAt,
      resolverUserId: user.id,
    }).then(() => {});
  }

  // Geocode the form's start/destination labels → a driving route polyline.
  useEffect(() => {
    if (!geocodingLib || !routesLib) return;
    const startLabel = labelOf(ride.start_point);
    const destLabel = labelOf(ride.destination);
    if (!startLabel || !destLabel) return;
    let cancelled = false;

    const geocoder = new geocodingLib.Geocoder();
    const geocode = (address: string) =>
      new Promise<google.maps.LatLngLiteral | null>((resolve) => {
        const q = ride.city ? `${address}, ${ride.city}` : address;
        geocoder.geocode({ address: q, region: "in" }, (res, status) =>
          resolve(status === "OK" && res?.[0] ? res[0].geometry.location.toJSON() : null),
        );
      });

    (async () => {
      // Prefer exact Places coordinates stored on the ride; geocode the label
      // only as a fallback for rides created before address autocomplete.
      const [a, b] = await Promise.all([
        pointOf(ride.start_point) ?? geocode(startLabel),
        pointOf(ride.destination) ?? geocode(destLabel),
      ]);
      if (cancelled || !a || !b) return;

      // Route stops with coordinates become waypoints the route runs through.
      const { data: stopRows } = await supabase
        .from("route_stops")
        .select("location, seq")
        .eq("ride_id", ride.id)
        .order("seq", { ascending: true });
      if (cancelled) return;
      const waypointCoords = (stopRows ?? [])
        .map((r) => pointOf(r.location as Ride["start_point"]))
        .filter((p): p is LatLng => !!p);
      setStopPoints(waypointCoords);

      const ds = new routesLib.DirectionsService();
      ds.route(
        {
          origin: a,
          destination: b,
          waypoints: waypointCoords.map((location) => ({ location, stopover: true })),
          optimizeWaypoints: true, // let Google reorder stops for the best route
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (cancelled) return;
          if (status === "OK" && result?.routes?.[0]) {
            setRoute(result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
          } else {
            setRoute([a, ...waypointCoords, b]); // fall back to a straight polyline
          }
        },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [geocodingLib, routesLib, ride.id, ride.start_point, ride.destination, ride.city]);

  useEffect(() => () => void simRef.current?.stop(), []);

  // Push the current user's own GPS so their heading arrow (lead=red / you=green)
  // appears and moves on the map. Foreground only; stops once the ride ends.
  const { fix, error: geoError, retry: retryGps } = useGeolocation(!ended && !!user);

  const firstFixLoggedRef = useRef(false);
  useEffect(() => {
    if (firstFixLoggedRef.current) return;
    if (notStarted || ended || !user) return; // only started rides, tracked user
    const key = `rideinsync:first_fix:${ride.id}`;
    let already = false;
    try { already = sessionStorage.getItem(key) === "1"; } catch { /* ignore */ }
    if (already) { firstFixLoggedRef.current = true; return; }

    if (fix) {
      firstFixLoggedRef.current = true;
      try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      track("rider_first_fix", { ride_id: ride.id, got_fix: true });
    } else if (geoError) {
      firstFixLoggedRef.current = true;
      try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      track("rider_first_fix", { ride_id: ride.id, got_fix: false });
    }
  }, [fix, geoError, notStarted, ended, user, ride.id]);

  // M5 hardening (docs/scale-readiness-roadmap.md): the raw .then/.catch ->
  // console.warn here used to silently drop a fix on any ingest failure
  // (network error, or the 429 positions-ingest returns under its own 3s
  // rate limit). Two additions, both scoped to this effect only — they don't
  // touch useGeolocation's {fix,error} contract or its 5s/20m gating:
  //   1. Exponential backoff + jitter: a failed send schedules a retry after
  //      an increasing delay (capped) instead of firing again on the very
  //      next fix/render.
  //   2. A one-slot outbox: a fix that fails to send is held (overwriting
  //      any previously-pending fix — only the latest position matters for a
  //      live ride) and retried, instead of being dropped. Precedence rule
  //      (documented here since the task allows either choice): a *new* fix
  //      arriving always wins and is sent immediately, superseding whatever
  //      was pending — freshest position beats a queued stale one. The
  //      backoff timer exists only to retry when no new fix has arrived.
  const pendingFixRef = useRef<Fix | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    // Ride ended / user gone — drop any pending retry, nothing left to send.
    if (!user || ended) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      pendingFixRef.current = null;
      return;
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [user, ended]);

  useEffect(() => {
    if (!fix || !user) return;
    // A fresh fix always supersedes whatever was queued (see precedence note
    // above) and cancels any pending retry — this send attempt replaces it.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    void sendFix(fix, user.id);
  }, [fix, user, ride.id]);

  async function sendFix(toSend: Fix, userId: string): Promise<void> {
    if (inFlightRef.current) {
      // A send is already in progress (e.g. a retry firing right as a new
      // fix arrives) — queue this one; the in-flight call flushes it below
      // once it settles, so this never gets stranded.
      pendingFixRef.current = toSend;
      return;
    }
    inFlightRef.current = true;
    let failed = false;
    try {
      const { error } = await supabase.functions.invoke("positions-ingest", {
        body: {
          ride_id: ride.id,
          user_id: userId,
          lat: toSend.lat,
          lng: toSend.lng,
          heading: toSend.heading,
          speed: toSend.speed,
          accuracy: toSend.accuracy,
        },
      });
      if (error) {
        console.warn("[liveops] position ingest failed:", error.message);
        failed = true;
      } else {
        retryDelayRef.current = INITIAL_RETRY_MS; // success resets backoff
      }
    } catch (err) {
      console.warn("[liveops] position ingest failed:", err);
      failed = true;
    } finally {
      inFlightRef.current = false;
    }
    if (failed) {
      // If a newer fix already queued up while this one was in flight, that
      // one wins (freshest position beats the stale one that just failed) —
      // only fall back to re-queuing the failed fix itself if nothing newer
      // showed up.
      const newer = pendingFixRef.current;
      scheduleRetry(newer ?? toSend, userId);
      return;
    }
    // Flush whatever queued up while this send was in flight — inFlightRef is
    // already false here, so this recursive call actually sends instead of
    // just re-queuing itself.
    const queued = pendingFixRef.current;
    pendingFixRef.current = null;
    if (queued) void sendFix(queued, userId);
  }

  function scheduleRetry(toSend: Fix, userId: string): void {
    pendingFixRef.current = toSend;
    const base = retryDelayRef.current;
    const jitter = base * (0.25 + Math.random() * 0.5); // +/- jitter, avoids thundering herd
    const delay = Math.min(base + jitter, MAX_RETRY_MS);
    retryDelayRef.current = Math.min(base * 2, MAX_RETRY_MS);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      const toRetry = pendingFixRef.current;
      pendingFixRef.current = null;
      if (toRetry) void sendFix(toRetry, userId);
    }, delay);
  }

  async function simulatePack() {
    if (route.length < 2) {
      setNote("Waiting for the route to resolve…");
      return;
    }
    setPopulating(true);
    setNote(null);
    try {
      const sim = new RideSimulator(ride.id, ride.code, route);
      simRef.current = sim;
      // Real ride: the leader (current session) approves each sim's join request.
      await sim.start(SIM_RIDER_NAMES, { approve: (reqId) => approveJoinRequest(reqId) });
      setPopulated(true);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't add demo riders.");
    } finally {
      setPopulating(false);
    }
  }

  async function raiseSos() {
    if (!user) return;
    track("sos_confirmed", { ride_id: ride.id, surface: "liveops" });
    setSosSending(true);
    setNote(null);
    try {
      const res = await sendSos(ride.id, user.id);
      track("sos_delivered", { ride_id: ride.id, surface: "liveops", has_location: res.hasLocation });
      setNote("SOS sent to the group.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't send SOS.");
    } finally {
      setSosSending(false);
    }
  }

  async function beginRide() {
    setStarting(true);
    setNote(null);
    try {
      await startRide(ride.id); // leader-gated by RLS; draft → active
      track("ride_started", { ride_id: ride.id });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't start the ride.");
    } finally {
      setStarting(false);
    }
  }

  async function endRide() {
    setEnding(true);
    setNote(null);
    try {
      await closeRide(ride.id); // leader-gated + idempotent server-side
      track("ride_ended", { ride_id: ride.id });
      await simRef.current?.stop();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't end the ride.");
    } finally {
      setEnding(false);
    }
  }

  // Count the pack from the DB (excluding self) + yourself when you have a live fix.
  const inSync =
    riders.filter((r) => r.member.user_id !== user?.id && r.status === "intact").length +
    (fix ? 1 : 0);
  const total = riders.length;
  const center = route[Math.floor(route.length / 2)] ?? { lat: 12.9716, lng: 77.5946 };

  // Focused rider (from the tappable strip). Self's freshest coordinates come
  // from the live GPS fix; everyone else's from their last broadcast position.
  const selectedIsSelf = !!selectedRiderId && selectedRiderId === user?.id;
  const selectedRider = riders.find((r) => r.member.user_id === selectedRiderId) ?? null;
  const selectedPos: LatLng | null = selectedIsSelf
    ? fix
      ? { lat: fix.lat, lng: fix.lng }
      : selectedRider?.latest
        ? { lat: selectedRider.latest.lat, lng: selectedRider.latest.lng }
        : null
    : selectedRider?.latest
      ? { lat: selectedRider.latest.lat, lng: selectedRider.latest.lng }
      : null;

  // Maximizing the map = ride/nav mode (heading-up follow); minimizing = overview.
  function toggleFullscreen() {
    setFullscreen((f) => {
      const next = !f;
      setNavMode(next);
      return next;
    });
  }
  // In nav mode the map rotates to the rider's heading, so markers rotate relative
  // to that (self points "up"); in overview the map is north-up.
  const mapHeading = navMode ? fix?.heading ?? 0 : 0;
  const NAV_ZOOM = 17;
  // In fullscreen the overlay sits under the status bar/notch — clear it.
  const topInset = fullscreen ? "calc(env(safe-area-inset-top, 0px) + 52px)" : 12;

  const visibleJoinToasts = joinToasts.filter((t) => t.userId !== user?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      {/* New-rider toast — Realtime already keeps `riders` current with no
          reload needed; this just surfaces that as a transient, dismissible
          nudge for whoever's already on this screen when someone joins. */}
      {visibleJoinToasts.map((t) => {
        const name = riders.find((r) => r.member.user_id === t.userId)?.profile.display_name || "A rider";
        return (
          <Card key={t.id} padding="var(--space-sm) var(--space-md)" style={{ borderLeft: "3px solid var(--color-accent)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", minWidth: 0 }}>
                <Icon name="users" size={18} color="var(--color-accent)" />
                <span style={{ fontSize: "var(--text-body-size)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong>{name}</strong> joined the ride
                </span>
              </div>
              <IconButton
                name="x"
                size={32}
                iconSize={16}
                aria-label="Dismiss"
                onClick={() => dismissJoinToast(t.id)}
              />
            </div>
          </Card>
        );
      })}
      {ended && (
        <Card style={{ borderLeft: "3px solid #FF453A" }}>
          <strong style={{ color: "#FF453A" }}>Ride ended</strong>
          <span style={{ color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 13 }}>
            The lead has ended this ride.
          </span>
        </Card>
      )}
      <SosAlertStack
        alerts={sosAlerts}
        responsesByAlert={sosResponsesByAlert}
        selfUserId={user?.id ?? null}
        canResolve={canResolve}
        onRespond={handleSosRespond}
        onReached={handleSosReached}
        onResolve={handleSosResolve}
      />
      <div
        style={
          fullscreen
            ? { position: "fixed", inset: 0, zIndex: 1000, background: "var(--color-surface-2)" }
            : {
                position: "relative",
                height: "44vh",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                background: "var(--color-surface-2)",
              }
        }
      >
        <Map
          mapId={MAP_ID}
          defaultCenter={center}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI
          style={{ width: "100%", height: "100%" }}
        >
          {route.length > 1 && <RoutePolyline path={route} />}
          {route.length > 1 && !(navMode && fix) && !selectedPos && <FitToRoute path={route} />}
          {navMode && fix && (
            <FollowCamera target={{ lat: fix.lat, lng: fix.lng }} zoom={NAV_ZOOM} heading={fix.heading ?? 0} tilt={45} />
          )}
          {!navMode && selectedPos && <PanToRider target={selectedPos} nonce={focusNonce} zoom={17} />}
          {stopPoints.map((p, i) => (
            <AdvancedMarker key={`stop-${i}`} position={p}>
              <StopPin index={i + 1} />
            </AdvancedMarker>
          ))}
          {/* Other riders from the DB (self is drawn from the live fix below).
              Rotation is relative to the map heading so heading-up stays correct. */}
          {riders.map((r) => {
            if (!r.latest || r.member.user_id === user?.id) return null;
            const isLead = r.member.role === "leader" || r.member.role === "co_leader";
            const pos = { lat: r.latest.lat, lng: r.latest.lng };
            const selected = r.member.user_id === selectedRiderId;
            return (
              <AdvancedMarker key={r.member.user_id} position={pos} zIndex={selected ? 1000 : undefined}>
                {isLead ? (
                  <ArrowPin color="#FF453A" heading={(r.latest.heading ?? 0) - mapHeading} name={r.profile.display_name} kind="Lead" selected={selected} />
                ) : (
                  <RiderPin rider={r} selected={selected} />
                )}
              </AdvancedMarker>
            );
          })}
          {/* Your own arrow, straight from live GPS — no DB round-trip. */}
          {fix && (
            <AdvancedMarker position={{ lat: fix.lat, lng: fix.lng }} zIndex={selectedIsSelf ? 1000 : undefined}>
              <ArrowPin
                color={isLeader ? "#FF453A" : "#34C759"}
                heading={(fix.heading ?? 0) - mapHeading}
                name="You"
                kind={isLeader ? "Lead" : "You"}
                selected={selectedIsSelf}
              />
            </AdvancedMarker>
          )}
        </Map>

        {/* Map controls: maximize/minimize + orientation (nav heading-up / overview).
            Explicit z-index (above the map's own internal panes/marker layer,
            which can otherwise paint over a plain-stacked sibling during pan/
            zoom) keeps these pinned on top of the map instead of getting
            buried mid-gesture. */}
        <div style={{ position: "absolute", top: topInset, right: 12, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
          <MapControlButton title={fullscreen ? "Minimize map" : "Maximize map"} onClick={toggleFullscreen}>
            {fullscreen ? "⤡" : "⤢"}
          </MapControlButton>
          <MapControlButton
            title={navMode ? "Switch to overview (north-up)" : "Navigation (heading-up)"}
            active={navMode}
            onClick={() => setNavMode((n) => !n)}
          >
            ➤
          </MapControlButton>
        </div>

        {/* Keep SOS reachable while riding fullscreen. */}
        {fullscreen && !ended && (
          <button
            type="button"
            onClick={() => void raiseSos()}
            style={{
              position: "absolute", top: topInset, left: 12, zIndex: 999, height: 44, padding: "0 18px",
              borderRadius: 999, border: "none", background: "#FF453A", color: "#fff",
              fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.4)",
            }}
          >
            SOS
          </button>
        )}

        <span style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(20,20,22,.85)", color: "#fff", padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
          {inSync}/{total} in sync
        </span>
        {/* GPS status: when the watch fails it never recovers on its own, so
            the pill becomes a retry button that restarts the watch. */}
        {geoError ? (
          <button
            type="button"
            onClick={retryGps}
            title={geoError}
            aria-label={`GPS unavailable (${geoError}). Retry GPS.`}
            style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(20,20,22,.85)", color: "#FF453A", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid #FF453A", cursor: "pointer", minHeight: 44 }}
          >
            GPS unavailable — tap to retry
          </button>
        ) : (
          <span style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(20,20,22,.85)", color: fix ? "#34C759" : "#FF9F0A", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fix ? `GPS ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : "Locating…"}
          </span>
        )}
      </div>

      {/* Tappable rider strip — every member can focus any rider to pan the
          map to them, highlight their pin, and read their live coordinates. */}
      {riders.length > 0 && (
        <div>
          <div style={{ display: "flex", gap: "var(--space-xs)", overflowX: "auto", paddingBottom: 4 }}>
            {riders.map((r) => {
              const isSelf = r.member.user_id === user?.id;
              const selected = r.member.user_id === selectedRiderId;
              const name = isSelf ? "You" : r.profile.display_name || "Rider";
              return (
                <button
                  key={r.member.user_id}
                  type="button"
                  title={`Focus ${name} on the map`}
                  aria-label={`Focus ${name} on the map`}
                  onClick={() => focusRider(r.member.user_id)}
                  style={{
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2xs)",
                    height: 36,
                    padding: "0 var(--space-xs) 0 var(--space-sm)",
                    borderRadius: "var(--radius-full)",
                    border: selected ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,.14)",
                    background: selected ? "color-mix(in srgb, var(--color-accent) 18%, transparent)" : "var(--color-surface-3)",
                    color: "var(--color-text-primary)",
                    fontSize: "var(--text-label)",
                    fontWeight: "var(--weight-medium)" as unknown as number,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[r.status], flex: "none" }} />
                  {name}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: selected ? "var(--color-accent)" : "var(--color-surface-4)",
                      color: selected ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
                      flex: "none",
                    }}
                  >
                    <Icon name="navigation" size={13} />
                  </span>
                </button>
              );
            })}
          </div>
          {selectedRider && (
            <div style={{ marginTop: "var(--space-xs)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
              <span>
                <strong style={{ color: "var(--color-text-primary)" }}>{selectedIsSelf ? "You" : selectedRider.profile.display_name || "Rider"}</strong>
                {notStarted
                  ? " · start the ride to get rider location"
                  : (
                    <>
                      {" · "}{selectedRider.status}
                      {selectedPos
                        ? <> · <span style={{ fontVariantNumeric: "tabular-nums" }}>{selectedPos.lat.toFixed(5)}, {selectedPos.lng.toFixed(5)}</span></>
                        : " · locating…"}
                    </>
                  )}
              </span>
              <button
                type="button"
                onClick={() => setSelectedRiderId(null)}
                style={{ flex: "none", border: "none", background: "transparent", color: "var(--color-text-tertiary)", cursor: "pointer", fontSize: "var(--text-label)" }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}


      {/* Lead-only tools: a rider viewing the same map doesn't seed dummy
          riders or own the invite QR. */}
      {isLeader && (
        <Button
          variant="secondary"
          fullWidth={false}
          loading={populating}
          disabled={populated}
          onClick={() => void simulatePack()}
        >
          {populated ? "Pack riding" : populating ? "Riders joining…" : "Simulate pack (demo)"}
        </Button>
      )}
      {note && <p style={{ color: "var(--color-role-sweep)", fontSize: 13, margin: 0 }}>{note}</p>}

      {!ended && (
        <Button
          fullWidth={false}
          loading={sosSending}
          onClick={() => void raiseSos()}
          style={{ background: "#FF453A", color: "#fff", marginTop: "var(--space-xs)" }}
        >
          SOS
        </Button>
      )}

      {isLeader && notStarted && (
        <Button
          fullWidth={false}
          loading={starting}
          onClick={() => void beginRide()}
        >
          Start ride
        </Button>
      )}

      {isLeader && !ended && !notStarted && (
        <Button
          variant="secondary"
          fullWidth={false}
          loading={ending}
          onClick={() => void endRide()}
        >
          End ride
        </Button>
      )}
    </div>
  );
}

function RoutePolyline({ path }: { path: LatLng[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !mapsLib) return;
    const line = new mapsLib.Polyline({
      path,
      strokeColor: "#C4F82A",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map,
    });
    return () => line.setMap(null);
  }, [map, mapsLib, path]);
  return null;
}

function FitToRoute({ path }: { path: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }, [map, path]);
  return null;
}

// Navigation camera: recenters on the rider, zoomed for the next turn, rotated
// heading-up (with tilt) like a nav app. Runs while nav mode is on.
function FollowCamera({
  target,
  zoom,
  heading,
  tilt,
}: {
  target: LatLng;
  zoom: number;
  heading: number;
  tilt: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.moveCamera({ center: target, zoom, heading, tilt });
  }, [map, target.lat, target.lng, zoom, heading, tilt]);
  return null;
}

// Pan + zoom to a focused rider. Keyed on `nonce` (bumped each time the user
// taps a rider's navigate button), so it fires on the tap — not on every
// position update — leaving the user free to pan/zoom afterward without the
// camera yanking back as the rider moves.
function PanToRider({ target, nonce, zoom }: { target: LatLng; nonce: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || nonce === 0) return;
    map.panTo(target);
    map.setZoom(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, nonce]);
  return null;
}

function MapControlButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        border: "none",
        background: active ? "#C4F82A" : "rgba(20,20,22,.9)",
        color: active ? "#0A0A0B" : "#fff",
        fontSize: 20,
        lineHeight: 1,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}
    >
      {children}
    </button>
  );
}

function StopPin({ index }: { index: number }) {
  return (
    <div
      title={`Stop ${index}`}
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#C4F82A",
        border: "2px solid #0A0A0B",
        color: "#0A0A0B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 12,
        fontFamily: "var(--font-ui)",
        boxShadow: "0 1px 5px rgba(0,0,0,.5)",
      }}
    >
      {index}
    </div>
  );
}

// Directional arrow for the lead (red) and the current rider (green). Rotates
// to the GPS heading (0 = north). Others use the circle pin below.
function ArrowPin({
  color,
  heading,
  name,
  kind,
  selected,
}: {
  color: string;
  heading: number;
  name: string;
  kind: "Lead" | "You";
  selected?: boolean;
}) {
  const size = selected ? 40 : 30;
  return (
    <div
      title={`${name} — ${kind}`}
      style={{
        transform: `rotate(${heading}deg)`,
        transformOrigin: "50% 50%",
        // Accent halo behind the arrow when focused from the rider strip.
        borderRadius: "50%",
        boxShadow: selected ? "0 0 0 4px rgba(196,248,42,.45)" : "none",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 2 L19 21 L12 16 L5 21 Z"
          fill={color}
          stroke="#0A0A0B"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function RiderPin({ rider, selected }: { rider: RiderOnMap; selected?: boolean }) {
  const isLeader = rider.member.role === "leader" || rider.member.role === "co_leader";
  const ring = selected ? "var(--color-accent)" : isLeader ? "#C4F82A" : STATUS_COLOR[rider.status];
  const initial = (rider.profile.display_name || "R").trim().charAt(0).toUpperCase();
  const dim = selected ? 46 : 36;
  return (
    <div
      title={`${rider.profile.display_name} — ${rider.status}`}
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: "#1C1C1E",
        border: `3px solid ${ring}`,
        boxShadow: selected ? "0 0 0 4px rgba(196,248,42,.35), 0 2px 8px rgba(0,0,0,.5)" : "0 2px 8px rgba(0,0,0,.5)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: selected ? 18 : 14,
        fontFamily: "var(--font-ui)",
        overflow: "hidden",
        opacity: rider.status === "stale" ? 0.65 : 1,
      }}
    >
      {rider.profile.avatar_url ? (
        <img
          src={rider.profile.avatar_url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
