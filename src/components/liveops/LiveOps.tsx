// Live ops map for a REAL ride (Flow 3 ↔ Flow 1 integration). Takes a ride
// created via the onboarding form — whose start/destination are text labels —
// geocodes them into a Google route, draws it, and overlays the real roster's
// live positions from Supabase Realtime. A "Simulate pack" action populates
// riders through the real request→approve→track flow so the map has movement
// without needing many phones.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRideChannel } from "../../hooks/useRideChannel";
import { RideSimulator } from "../../lib/simulator";
import { SIM_RIDER_NAMES } from "../../lib/demoRide";
import { approveJoinRequest, buildJoinUrl } from "../../services/onboardingService";
import { closeRide, startRide } from "../../lib/ending";
import { useSosAlerts } from "../../lib/sos";
import { useAuth } from "../../hooks/useAuth";
import { useGeolocation } from "../../hooks/useGeolocation";
import { supabase } from "../../lib/supabase";
import type { Ride, RiderOnMap, GroupStatus } from "../../lib/models";
import type { LatLng } from "../../lib/geo";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import QRCode from "qrcode";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID;

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
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const simRef = useRef<RideSimulator | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { riders, rideStatus } = useRideChannel(ride.id);
  const [ending, setEnding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [navMode, setNavMode] = useState(false); // heading-up follow-me (rider nav)
  const isLeader = user?.id === ride.leader_id;
  
  // Prefer the live status from Realtime, falling back to the prop the page
  // loaded with (Realtime may not have delivered the first row yet).
  const status = rideStatus ?? ride.status;
  const ended = status === "ended";
  const notStarted = status === "draft";
  const [starting, setStarting] = useState(false);

  const activeSos = useSosAlerts(ride.id, user?.id ?? null).filter((a) => !a.resolved);

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
  const { fix, error: geoError } = useGeolocation(!ended && !!user);
  useEffect(() => {
    if (!fix || !user) return;
    void supabase
      .from("rider_positions")
      .insert({
        ride_id: ride.id,
        user_id: user.id,
        lat: fix.lat,
        lng: fix.lng,
        heading: fix.heading,
        speed: fix.speed,
        accuracy: fix.accuracy,
      })
      .then(({ error }) => {
        if (error) console.warn("[liveops] position insert failed:", error.message);
      });
  }, [fix, user, ride.id]);

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

  // Route the map's SOS to the shared /sos flow (confirm → 5s countdown →
  // live tracking + responders + close), carrying THIS ride's id so it works
  // even before the ride is marked active. This replaces the old bare inline
  // send that fired on a single tap with no confirmation or way to cancel.
  function openSos() {
    navigate("/sos", { state: { rideId: ride.id } });
  }

  async function beginRide() {
    setStarting(true);
    setNote(null);
    try {
      await startRide(ride.id); // leader-gated by RLS; draft → active
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
      await simRef.current?.stop();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't end the ride.");
    } finally {
      setEnding(false);
    }
  }

  async function toggleQr() {
    if (!showQr && !qr) {
      try {
        setQr(await QRCode.toDataURL(buildJoinUrl(ride.code), { width: 220, margin: 1 }));
      } catch {
        /* leave qr null; the code text is still shown */
      }
    }
    setShowQr((s) => !s);
  }

  // Count the pack from the DB (excluding self) + yourself when you have a live fix.
  const inSync =
    riders.filter((r) => r.member.user_id !== user?.id && r.status === "intact").length +
    (fix ? 1 : 0);
  const total = riders.length;
  const center = route[Math.floor(route.length / 2)] ?? { lat: 12.9716, lng: 77.5946 };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      {ended && (
        <Card style={{ borderLeft: "3px solid #FF453A" }}>
          <strong style={{ color: "#FF453A" }}>Ride ended</strong>
          <span style={{ color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 13 }}>
            The lead has ended this ride.
          </span>
        </Card>
      )}
      {activeSos.length > 0 && (
        <Card style={{ borderLeft: "3px solid #FF453A" }}>
          <strong style={{ color: "#FF453A" }}>SOS</strong>
          <span style={{ color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 13 }}>
            {activeSos.map((a) => a.name).join(", ")} need{activeSos.length === 1 ? "s" : ""} help
          </span>
        </Card>
      )}
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
          {route.length > 1 && !(navMode && fix) && <FitToRoute path={route} />}
          {navMode && fix && (
            <FollowCamera target={{ lat: fix.lat, lng: fix.lng }} zoom={NAV_ZOOM} heading={fix.heading ?? 0} tilt={45} />
          )}
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
            return (
              <AdvancedMarker key={r.member.user_id} position={pos}>
                {isLead ? (
                  <ArrowPin color="#FF453A" heading={(r.latest.heading ?? 0) - mapHeading} name={r.profile.display_name} kind="Lead" />
                ) : (
                  <RiderPin rider={r} />
                )}
              </AdvancedMarker>
            );
          })}
          {/* Your own arrow, straight from live GPS — no DB round-trip. */}
          {fix && (
            <AdvancedMarker position={{ lat: fix.lat, lng: fix.lng }}>
              <ArrowPin
                color={isLeader ? "#FF453A" : "#34C759"}
                heading={(fix.heading ?? 0) - mapHeading}
                name="You"
                kind={isLeader ? "Lead" : "You"}
              />
            </AdvancedMarker>
          )}
        </Map>

        {/* Map controls: maximize/minimize + orientation (nav heading-up / overview). */}
        <div style={{ position: "absolute", top: topInset, right: 12, display: "flex", flexDirection: "column", gap: 8 }}>
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
            onClick={openSos}
            style={{
              position: "absolute", top: topInset, left: 12, height: 44, padding: "0 18px",
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
        <span style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(20,20,22,.85)", color: fix ? "#34C759" : geoError ? "#FF453A" : "#FF9F0A", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fix ? `GPS ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : geoError ? `GPS: ${geoError}` : "Locating…"}
        </span>
      </div>


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

      {isLeader && (
        <Button variant="secondary" fullWidth={false} onClick={() => void toggleQr()}>
          {showQr ? "Hide QR" : "Invite riders (QR)"}
        </Button>
      )}
      {isLeader && showQr && (
        <Card glow style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Scan to join this ride</div>
          {qr && (
            <img
              src={qr}
              alt={`QR to join ${ride.name}`}
              style={{ width: 200, height: 200, marginTop: 8, borderRadius: 12 }}
            />
          )}
          <div style={{ fontFamily: "var(--font-brand)", letterSpacing: 2, fontSize: 20, marginTop: 4 }}>
            {ride.code}
          </div>
        </Card>
      )}

      {!ended && (
        <Button
          fullWidth={false}
          onClick={openSos}
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
}: {
  color: string;
  heading: number;
  name: string;
  kind: "Lead" | "You";
}) {
  return (
    <div title={`${name} — ${kind}`} style={{ transform: `rotate(${heading}deg)`, transformOrigin: "50% 50%" }}>
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
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

function RiderPin({ rider }: { rider: RiderOnMap }) {
  const isLeader = rider.member.role === "leader" || rider.member.role === "co_leader";
  const ring = isLeader ? "#C4F82A" : STATUS_COLOR[rider.status];
  const initial = (rider.profile.display_name || "R").trim().charAt(0).toUpperCase();
  return (
    <div
      title={`${rider.profile.display_name} — ${rider.status}`}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#1C1C1E",
        border: `3px solid ${ring}`,
        boxShadow: "0 2px 8px rgba(0,0,0,.5)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 14,
        fontFamily: "var(--font-ui)",
        opacity: rider.status === "stale" ? 0.65 : 1,
      }}
    >
      {initial}
    </div>
  );
}
