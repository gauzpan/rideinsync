// Geo helpers for the live-tracking map: distance, movement along a route path,
// and the client-derived group-status logic (Flow 3). No external deps.

import type { GroupStatus } from "./models";

export type LatLng = { lat: number; lng: number };

// Demo-tuned thresholds (PRD: fixed app-wide defaults, soft warnings). Tunable
// live from the demo panel; see ARCHITECTURE.md §Flow-3 spec.
export const STALE_MS = 15_000; // no position update for >15s → "stale"
export const BEHIND_M = 220; // gap to the nearest packmate >220m → "behind"

const R = 6_371_000; // earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing a→b, degrees (0=N, 90=E). Used for marker heading. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Cumulative segment lengths of a path (metres), length = path.length. */
function cumulative(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    out.push(out[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  return out;
}

/**
 * Point at `fraction` (0..1) of the way along `path`, plus the heading there.
 * fraction is clamped; a fraction past 1 pins to the end.
 */
export function pointAlong(
  path: LatLng[],
  fraction: number,
): { pos: LatLng; heading: number } {
  if (path.length === 1) return { pos: path[0], heading: 0 };
  const cum = cumulative(path);
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  if (i >= path.length) {
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    return { pos: b, heading: bearingDeg(a, b) };
  }
  const segStart = cum[i - 1];
  const segLen = cum[i] - segStart || 1;
  const t = (target - segStart) / segLen;
  const a = path[i - 1];
  const b = path[i];
  return {
    pos: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    heading: bearingDeg(a, b),
  };
}

/** Average position of a set of points (simple centroid). */
export function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const s = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: s.lat / points.length, lng: s.lng / points.length };
}

/** Smallest distance (m) from `pos` to any point in `others`, or null if none. */
export function nearestGapMeters(pos: LatLng, others: LatLng[]): number | null {
  if (others.length === 0) return null;
  return Math.min(...others.map((o) => haversineMeters(pos, o)));
}

/**
 * Derive a rider's group status from their latest position + manual member
 * status, given the gap to their nearest packmate and the current time.
 *  - manual `stopped`/`leaving` wins
 *  - no position, or a position older than STALE_MS → `stale`
 *  - gap to the nearest other rider >BEHIND_M → `behind` (dropped from the pack)
 *  - otherwise `intact`
 */
export function deriveStatus(args: {
  memberStatus: string;
  pos: LatLng | null;
  recordedAt: string | null;
  nearestGap: number | null;
  now: number;
}): GroupStatus {
  const { memberStatus, pos, recordedAt, nearestGap, now } = args;
  if (memberStatus === "stopped" || memberStatus === "leaving") return "stopped";
  if (!pos || !recordedAt) return "stale";
  if (now - new Date(recordedAt).getTime() > STALE_MS) return "stale";
  if (nearestGap != null && nearestGap > BEHIND_M) return "behind";
  return "intact";
}
