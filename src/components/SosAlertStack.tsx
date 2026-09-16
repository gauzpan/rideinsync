import { useState } from "react";
import { SosAlertCard } from "./SosAlertCard";
import { sosCardState, type IncomingAlert, type Responder } from "../lib/sos";

type Props = {
  alerts: IncomingAlert[];
  responsesByAlert: Record<string, Responder[]>;
  selfUserId: string | null;
  canResolve: boolean;
  onRespond: (alertId: string) => void;
  onReached: (responseId: string) => void;
  onResolve: (alert: IncomingAlert) => Promise<void>;
};

/**
 * The expanded SOS alert-card body: incoming "needs help" cards with the
 * responder + resolve actions. The collapsed entry point now lives in the ride
 * view's combined Signals card (off the ride page, in the AccountBar bell) —
 * this just renders the visible cards.
 *
 * - Every visible alert gets a card; each card's X marks it *seen for this
 *   viewer* → it collapses to a slim bar and sinks below unseen alerts; a later
 *   escalation (rider taps Stay, or a new/reached responder) re-expands it via
 *   the signature check.
 *
 * Rendered embedded in the ride page (LiveOps' Signals card) and, off the ride
 * page, inside the AccountBar bell popover — the positioning is the parent's
 * job; this owns only the per-card collapse/seen behavior. Returns null when
 * nothing is visible.
 */
export function SosAlertStack({
  alerts,
  responsesByAlert,
  selfUserId,
  canResolve,
  onRespond,
  onReached,
  onResolve,
}: Props) {
  const [seenSignatures, setSeenSignatures] = useState<Record<string, string>>({});

  const signature = (alertId: string) => {
    const responders = responsesByAlert[alertId] ?? [];
    const stay = alerts.find((a) => a.id === alertId)?.stayRequestedAt ?? "";
    const reached = responders.filter((r) => r.reachedAt).length;
    return `${stay}|${responders.length}|${reached}`;
  };
  const isSeen = (alertId: string) => seenSignatures[alertId] === signature(alertId);
  const markSeen = (alertId: string) =>
    setSeenSignatures((prev) => ({ ...prev, [alertId]: signature(alertId) }));
  const clearSeen = (alertId: string) =>
    setSeenSignatures((prev) => {
      if (!(alertId in prev)) return prev;
      const next = { ...prev };
      delete next[alertId];
      return next;
    });

  const visibleAlerts = alerts
    .map((a) => ({ alert: a, ...sosCardState(a, responsesByAlert[a.id] ?? []) }))
    .filter((x) => x.visible)
    .sort((a, b) => Number(isSeen(a.alert.id)) - Number(isSeen(b.alert.id)));

  if (visibleAlerts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      {visibleAlerts.map(({ alert: a, still }) => (
        <SosAlertCard
          key={a.id}
          name={a.name}
          triggeredAt={a.triggeredAt}
          responders={responsesByAlert[a.id] ?? []}
          selfUserId={selfUserId}
          still={still}
          onRespond={() => onRespond(a.id)}
          onReached={onReached}
          canResolve={canResolve}
          onResolve={() => onResolve(a)}
          collapsed={isSeen(a.id)}
          onDismiss={() => markSeen(a.id)}
          onExpand={() => clearSeen(a.id)}
        />
      ))}
    </div>
  );
}
