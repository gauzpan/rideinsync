// Ride simulator (Flow 3 demo). Spins up N anonymous "riders", each its own
// Supabase session, joins them to the demo ride via request_join_ride (auto-
// approved because the ride is is_demo), then advances each along the route and
// pushes positions on a timer. Because each rider writes only its own rows, this
// exercises the real Realtime path under RLS — no service_role, no schema change.

import { makeGuestClient } from "./session";
import type { GuestClient } from "./session";
import { pointAlong } from "./geo";
import type { LatLng } from "./geo";

type SimRider = GuestClient & {
  name: string;
  progress: number; // 0..1 along the path
  baseSpeed: number; // progress units per tick
  behind: boolean;
  stopped: boolean;
};

export type SimRiderView = { userId: string; name: string; behind: boolean; stopped: boolean };

export class RideSimulator {
  private riders: SimRider[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private rideId: string,
    private code: string,
    private path: LatLng[],
    private tickMs = 1500,
  ) {}

  /**
   * Create `names.length` sim riders, join them, and start moving.
   * On an `is_demo` ride the RPC auto-approves. On a real ride it only files a
   * pending request, so pass `approve` (the leader approving via their session)
   * to materialize membership before the rider starts pushing positions.
   */
  async start(
    names: string[],
    opts?: { approve?: (requestId: string) => Promise<void> },
  ): Promise<void> {
    const riders = await Promise.all(
      names.map(async (name, i): Promise<SimRider> => {
        const guest = await makeGuestClient(name);
        const { data: requestId } = await guest.client.rpc("request_join_ride", {
          join_code: this.code,
        });
        if (opts?.approve && typeof requestId === "string") {
          await opts.approve(requestId);
        }
        return {
          ...guest,
          name,
          // spread the pack into a visible convoy line along the route, and keep
          // them slow + near-uniform so they hold formation for the demo run
          progress: 0.55 - i * 0.05,
          baseSpeed: 0.0025 + Math.random() * 0.0006,
          behind: false,
          stopped: false,
        };
      }),
    );
    this.riders = riders;
    await this.pushAll(); // paint an initial frame immediately
    this.timer = setInterval(() => void this.tick(), this.tickMs);
  }

  private async tick(): Promise<void> {
    for (const r of this.riders) {
      if (!r.stopped) {
        r.progress = Math.min(1, r.progress + r.baseSpeed * (r.behind ? 0.4 : 1));
      }
    }
    await this.pushAll();
  }

  private async pushAll(): Promise<void> {
    await Promise.all(
      this.riders.map(async (r) => {
        const { pos, heading } = pointAlong(this.path, r.progress);
        const row = {
          ride_id: this.rideId,
          user_id: r.userId,
          lat: pos.lat,
          lng: pos.lng,
          heading,
          speed: r.stopped ? 0 : 28,
        };
        // History (close_ride's distance calc) — unchanged from before M2/M3.
        await r.client.from("rider_positions").insert(row);
        // Hot table — the live map (LiveOps' broadcast aggregator, M3) only
        // reads latest_positions now. Sim riders don't go through the real
        // positions-ingest Edge Function (its 3s rate limit would drop half
        // this simulator's 1.5s ticks) — each rider's own RLS-scoped client
        // upserts its own row directly instead, same as a real ingest would
        // land it.
        await r.client.from("latest_positions").upsert(row, { onConflict: "ride_id,user_id" });
      }),
    );
  }

  /** Make one rider lag the pack (drops to 40% speed). */
  setBehind(userId: string, value: boolean): void {
    const r = this.riders.find((x) => x.userId === userId);
    if (r) r.behind = value;
  }

  /** Halt one rider in place + flip their member status so the map shows it. */
  async setStopped(userId: string, value: boolean): Promise<void> {
    const r = this.riders.find((x) => x.userId === userId);
    if (!r) return;
    r.stopped = value;
    await r.client
      .from("ride_members")
      .update({ status: value ? "stopped" : "riding" })
      .eq("ride_id", this.rideId)
      .eq("user_id", r.userId);
  }

  list(): SimRiderView[] {
    return this.riders.map((r) => ({
      userId: r.userId,
      name: r.name,
      behind: r.behind,
      stopped: r.stopped,
    }));
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.all(this.riders.map((r) => r.client.auth.signOut()));
    this.riders = [];
  }
}
