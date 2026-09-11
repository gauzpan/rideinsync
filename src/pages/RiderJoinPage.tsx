// Phone rider: open via the join QR (/r?code=XXXXXX). Signs in as a guest, joins
// the demo ride (auto-approved), then streams real GPS into rider_positions so
// you appear on the leader's ops map alongside the simulated pack.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ensureGuestSession } from "../lib/session";
import { useGeolocation } from "../hooks/useGeolocation";
import { Card } from "../components/ui/Card";

export function RiderJoinPage() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const [rideId, setRideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushes, setPushes] = useState(0);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("No ride code in the link.");
      return;
    }
    (async () => {
      try {
        userId.current = await ensureGuestSession("My phone");
        const { error: rpcErr } = await supabase.rpc("request_join_ride", { join_code: code });
        if (rpcErr) throw rpcErr;
        const { data, error: memErr } = await supabase
          .from("ride_members")
          .select("ride_id")
          .eq("user_id", userId.current)
          .limit(1)
          .single();
        if (memErr) throw memErr;
        setRideId(data.ride_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [code]);

  const { fix, error: geoError } = useGeolocation(!!rideId);

  useEffect(() => {
    if (!rideId || !fix || !userId.current) return;
    void supabase.from("rider_positions").insert({
      ride_id: rideId,
      user_id: userId.current,
      lat: fix.lat,
      lng: fix.lng,
      heading: fix.heading,
      speed: fix.speed,
      accuracy: fix.accuracy,
    });
    setPushes((n) => n + 1);
  }, [fix, rideId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", paddingTop: "var(--space-xl)" }}>
      <h1 style={{ fontFamily: "var(--font-brand)", fontSize: 24, margin: 0 }}>Joining ride {code}</h1>

      {error && (
        <Card style={{ borderLeft: "3px solid #FF453A" }}>
          <strong>Couldn't join.</strong>
          <p style={{ color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{error}</p>
        </Card>
      )}

      {!error && !rideId && <Card>Connecting…</Card>}

      {rideId && (
        <Card glow>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: fix ? "#C4F82A" : "#FF9F0A" }} />
            <strong>{fix ? "Tracking active" : "Waiting for GPS…"}</strong>
          </div>
          {geoError && <p style={{ color: "#FF9F0A", fontSize: 13 }}>{geoError}</p>}
          {fix && (
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 0 }}>
              {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} · {pushes} updates sent
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
