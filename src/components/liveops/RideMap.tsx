// The live map: Google map (vector, for Advanced Markers) with the route line
// and one avatar pin per rider, coloured by group status. Purely presentational
// — it renders whatever riders the ops view passes in.

import { useEffect, useState } from "react";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { RiderOnMap } from "../../lib/models";
import type { GroupStatus } from "../../lib/models";
import type { LatLng } from "../../lib/geo";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID;

const STATUS_COLOR: Record<GroupStatus, string> = {
  intact: "#5AC8FA", // calm blue — in sync
  behind: "#FF9F0A", // amber — lagging
  stopped: "#FF453A", // red — halted
  stale: "#8A8A8E", // grey — no fresh fix
};

function RoutePolyline({ path }: { path: LatLng[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !mapsLib) return;
    const line = new mapsLib.Polyline({
      path,
      strokeColor: "#C4F82A", // the single lime accent = the shared route
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
    map.fitBounds(bounds, 64);
  }, [map, path]);
  return null;
}

function RiderPin({ rider }: { rider: RiderOnMap }) {
  const [hovered, setHovered] = useState(false);
  const isLeader = rider.member.role === "leader" || rider.member.role === "co_leader";
  const ring = isLeader ? "#C4F82A" : STATUS_COLOR[rider.status];
  const initial = (rider.profile.display_name || "R").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + var(--space-xs))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-card)",
            padding: "var(--space-2xs) var(--space-sm)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <div style={{ color: "var(--color-text-primary)", fontSize: "var(--text-label)", fontWeight: 600 }}>
            {rider.profile.display_name || "Rider"} — {rider.status}
          </div>
          {rider.latest && (
            <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-caption)" }}>
              {rider.latest.lat.toFixed(5)}, {rider.latest.lng.toFixed(5)}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "#1C1C1E",
          border: `3px solid ${ring}`,
          boxShadow: "0 2px 8px rgba(0,0,0,.5)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: 15,
          fontFamily: "var(--font-ui)",
          opacity: rider.status === "stale" ? 0.65 : 1,
        }}
      >
        {initial}
      </div>
    </div>
  );
}

type Props = { route: LatLng[]; riders: RiderOnMap[] };

export function RideMap({ route, riders }: Props) {
  if (!MAPS_KEY) {
    return <div style={{ padding: 24, color: "var(--color-text-secondary)" }}>Set VITE_GOOGLE_MAPS_API_KEY to load the map.</div>;
  }
  const center = route[Math.floor(route.length / 2)] ?? { lat: 12.92, lng: 77.53 };
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <Map
        mapId={MAP_ID}
        defaultCenter={center}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI
        style={{ width: "100%", height: "100%" }}
      >
        <RoutePolyline path={route} />
        <FitToRoute path={route} />
        {riders.map((r) =>
          r.latest ? (
            <AdvancedMarker key={r.member.user_id} position={{ lat: r.latest.lat, lng: r.latest.lng }}>
              <RiderPin rider={r} />
            </AdvancedMarker>
          ) : null,
        )}
      </Map>
    </APIProvider>
  );
}
