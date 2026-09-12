// push-notify — Web Push send path for Flow 4's "notifications" first cut.
// See PRD/signals_haptics_plan.md §7a/§8.
//
// Invoked directly by the client (src/lib/pushNotifications.ts's
// triggerPushNotify) right after a ride_events/sos_alerts insert succeeds —
// not a pg_net database trigger, to avoid needing custom Postgres GUC
// secrets for a hackathon-scale first cut. A trigger-based path (see
// supabase/migrations/0010_push_notifications.sql's header) is the natural
// v2 if "never rely on the client actually calling this" becomes a hard
// requirement.
//
// ── One-time deploy steps (cannot be done from this repo alone — needs your
//    Supabase project's own CLI login) ──────────────────────────────────────
//   1. Generate a VAPID keypair once:  npx web-push generate-vapid-keys
//   2. Put the public key in your .env.local as VITE_VAPID_PUBLIC_KEY.
//   3. Set the private key + subject as Supabase secrets (never as a client
//      env var):
//        supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> \
//          VAPID_SUBJECT=mailto:you@example.com
//      (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//      injected into every Edge Function automatically — nothing to set.)
//   4. Deploy:  supabase functions deploy push-notify
//   5. Run supabase/migrations/0010_push_notifications.sql against your
//      project (supabase db push, or paste it into the SQL editor).
//
// Request body: { ride_id: string; sender_user_id: string; kind: "hazard" |
// "regroup" | "pitstop" | "sos" }. Verifies the caller's JWT actually is
// sender_user_id (so this can't be used to spam push at other riders'
// devices under a spoofed identity), then pushes every *other* subscriber in
// that ride.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@rideinsync.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type SignalKind = "hazard" | "regroup" | "pitstop" | "sos";
const KIND_TITLE: Record<SignalKind, string> = {
  hazard: "Hazard",
  regroup: "Regroup",
  pitstop: "Pit stop",
  sos: "SOS",
};

function bodyFor(kind: SignalKind, senderName: string): string {
  switch (kind) {
    case "hazard":
      return `${senderName} flagged a hazard.`;
    case "regroup":
      return `${senderName} called regroup.`;
    case "pitstop":
      return `${senderName} called a pit stop.`;
    case "sos":
      return `${senderName} needs help. Location shared.`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("[push-notify] VAPID keys not configured — see this file's header");
    return new Response("Push not configured", { status: 500 });
  }

  let body: { ride_id?: string; sender_user_id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { ride_id, sender_user_id, kind } = body;
  if (!ride_id || !sender_user_id || !kind || !(kind in KIND_TITLE)) {
    return new Response("Missing or invalid fields", { status: 400 });
  }

  // The caller must be the sender they claim to be — otherwise this endpoint
  // could be used to trigger push at other riders under a spoofed identity.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: caller, error: authErr } = await callerClient.auth.getUser();
  if (authErr || caller.user?.id !== sender_user_id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [{ data: subs, error: subErr }, { data: sender }] = await Promise.all([
    serviceClient
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("ride_id", ride_id)
      .neq("user_id", sender_user_id),
    serviceClient.from("profiles").select("display_name").eq("id", sender_user_id).single(),
  ]);
  if (subErr) {
    console.error("[push-notify] subscription lookup failed", subErr.message);
    return new Response("Lookup failed", { status: 500 });
  }
  if (!subs?.length) return new Response("No subscribers", { status: 200 });

  const senderName = sender?.display_name ?? "A rider";
  const isUrgent = kind === "sos";
  const payload = JSON.stringify({
    title: KIND_TITLE[kind as SignalKind],
    body: bodyFor(kind as SignalKind, senderName),
    // Per §10's push-dedup rules: sos gets a unique tag per event so
    // concurrent SOS cases stack instead of replacing each other; the
    // routine signals share one tag per (ride, kind) so a flurry of the same
    // signal collapses to one notification instead of spamming the tray.
    tag: isUrgent ? `sos-${sender_user_id}-${Date.now()}` : `${kind}-${ride_id}`,
    urgent: isUrgent,
  });

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Expired/revoked subscription — stop trying it in future sends.
          await serviceClient.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          throw err;
        }
      }
    }),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.warn(`[push-notify] ${failed}/${subs.length} sends failed`);

  return new Response(JSON.stringify({ sent: subs.length - failed, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
