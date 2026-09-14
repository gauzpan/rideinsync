import { useState } from "react";
import { Icon } from "./ui/Icon";
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
 * The shared SOS alert surface: incoming "needs help" cards with the responder
 * + resolve actions, collapsed so the page is never buried under a stack.
 *
 * - At most one card (the most recent) shows at a time; the rest hide behind a
 *   counter strip that expands them on demand.
 * - Each card's X marks it *seen for this viewer* → it collapses to a slim bar
 *   and sinks below unseen alerts; a later escalation (rider taps Stay, or a
 *   new/reached responder) re-expands it via the signature check.
 *
 * Rendered embedded in the ride page (LiveOps) and, off the ride page, inside
 * AppLayout's fixed container — the positioning is the parent's job; this owns
 * only the collapse/seen/strip behavior. Returns null when nothing is visible.
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
  const [notifOpen, setNotifOpen] = useState(false);
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

  const latest = visibleAlerts.reduce((m, x) =>
    Date.parse(x.alert.triggeredAt) >= Date.parse(m.alert.triggeredAt) ? x : m,
  );
  const shown = visibleAlerts.length <= 1 || notifOpen ? visibleAlerts : [latest];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      {visibleAlerts.length > 1 && (
        <button
          type="button"
          onClick={() => setNotifOpen((o) => !o)}
          aria-label={`${visibleAlerts.length} alerts`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            width: "100%",
            minHeight: 44,
            padding: "var(--space-xs) var(--space-md)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-divider)",
            background: "var(--color-surface-2)",
            color: "var(--color-text-primary)",
            boxShadow: "var(--shadow-card, 0 8px 24px rgba(0,0,0,.5))",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", flex: "none" }}>
            <Icon name="bell" size={18} />
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -8,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: "var(--radius-full)",
                background: "var(--color-danger)",
                color: "var(--color-text-on-danger)",
                fontSize: 11,
                fontWeight: "var(--weight-semibold)" as unknown as number,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {visibleAlerts.length}
            </span>
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {notifOpen ? "Hide alerts" : `${visibleAlerts.length} active alerts · show all`}
          </span>
          <Icon name={notifOpen ? "chevron-left" : "chevron-right"} size={16} />
        </button>
      )}
      {shown.map(({ alert: a, still }) => (
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
