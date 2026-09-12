// Live ops map for a REAL ride (Flow 3 ↔ Flow 1 integration). Takes a ride
// created via the onboarding form — whose start/destination are text labels —
// geocodes them into a Google route, draws it, and overlays the real roster's
// live positions from Supabase Realtime. A "Simulate pack" action populates
// riders through the real request→approve→track flow so the map has movement
// without needing many phones.

import { useEffect, useRef, useState } from "react";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRideChannel } from "../../hooks/useRideChannel";
import { RideSimulator } from "../../lib/simulator";
import { SIM_RIDER_NAMES } from "../../lib/demoRide";
import { approveJoinRequest } from "../../services/onboardingService";
import { supabase } from "../../lib/supabase";
import type { Ride, RiderOnMap, GroupStatus } from "../../lib/models";
import type { LatLng } from "../../lib/geo";
import { Button } from "../ui/Button";

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
  const simRef = useRef<RideSimulator | null>(null);

  const { riders } = useRideChannel(ride.id);

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

  const inSync = riders.filter((r) => r.status === "intact").length;
  const center = route[Math.floor(route.length / 2)] ?? { lat: 12.9716, lng: 77.5946 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div
        style={{
          position: "relative",
          height: "44vh",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--color-surface-2)",
        }}
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
          {route.length > 1 && <FitToRoute path={route} />}
          {stopPoints.map((p, i) => (
            <AdvancedMarker key={`stop-${i}`} position={p}>
              <StopPin index={i + 1} />
            </AdvancedMarker>
          ))}
          {riders.map((r) =>
            r.latest ? (
              <AdvancedMarker key={r.member.user_id} position={{ lat: r.latest.lat, lng: r.latest.lng }}>
                <RiderPin rider={r} />
              </AdvancedMarker>
            ) : null,
          )}
        </Map>
        <span
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            background: "rgba(20,20,22,.85)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {inSync}/{riders.length} in sync
        </span>
      </div>

      <Button
        variant="secondary"
        fullWidth={false}
        loading={populating}
        disabled={populated}
        onClick={() => void simulatePack()}
      >
        {populated ? "Pack riding" : populating ? "Riders joining…" : "Simulate pack (demo)"}
      </Button>
      {note && <p style={{ color: "var(--color-role-sweep)", fontSize: 13, margin: 0 }}>{note}</p>}
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
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 1px 5px rgba(0,0,0,.5)",
      }}
    >
      {index}
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
        fontFamily: "system-ui, sans-serif",
        opacity: rider.status === "stale" ? 0.65 : 1,
      }}
    >
      {initial}
    </div>
  );
}
