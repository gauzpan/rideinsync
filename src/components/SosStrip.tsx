import { useState } from "react";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { OwnSosBar } from "./OwnSosBar";
import { SosAlertStack } from "./SosAlertStack";
import { sosCardState, type IncomingAlert, type Responder } from "../lib/sos";

// Max characters for the rider name in the collapsed label before it's cut with
// an ellipsis — keeps "SOS · <name> needs help (N)" on one line at 360px.
const MAX_NAME = 18;

/** Truncate a rider name to ≤ MAX_NAME chars, ending in an ellipsis when cut. */
export function truncateName(name: string, max = MAX_NAME): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

/**
 * The collapsed strip's label text. Incoming alerts take priority:
 * "SOS · <first rider> needs help (N)". Otherwise the raiser's own open alert:
 * "Help is coming · <status>". Null when there is nothing to show (the strip
 * then unmounts). The chevron is drawn by the component, not baked in here.
 * Pure + unit-tested.
 */
export function buildSosStripLabel(
  incoming: { name: string }[],
  ownStatus: string | null,
): string | null {
  if (incoming.length > 0) {
    return `SOS · ${truncateName(incoming[0].name)} needs help (${incoming.length})`;
  }
  if (ownStatus) return `Help is coming · ${ownStatus}`;
  return null;
}

/**
 * Red-dot rule for the collapsed strip: lit while any current incoming alert is
 * one the viewer hasn't opened the strip on yet. Opening the strip marks the
 * ids seen (clearing the dot); a later new alert id relights it. Pure + tested.
 */
export function hasUnseenAlerts(alertIds: string[], seenIds: Set<string>): boolean {
  return alertIds.some((id) => !seenIds.has(id));
}

type Props = {
  alerts: IncomingAlert[];
  responsesByAlert: Record<string, Responder[]>;
  selfUserId: string | null;
  canResolve: boolean;
  onRespond: (alertId: string) => void;
  onReached: (responseId: string) => void;
  onResolve: (alert: IncomingAlert) => Promise<void>;
  /** Short own-alert status for the collapsed label; null when no own alert. */
  ownStatus: string | null;
  /** Responders on the viewer's own alert — feeds the expanded first line. */
  ownResponders: Responder[];
  /** Open the full /sos screen (own-alert tap, and the expanded bar's View). */
  onViewOwn: () => void;
};

/**
 * One compact SOS strip — the single fixed row above the tab bar that replaced
 * the old stack (own-SOS bar + counter row + full alert cards). Styled like the
 * ride view's "Signals (N)" row (Card surface, icon + label + count, chevron).
 *
 * - Incoming alerts → "SOS · <name> needs help (N)"; tapping expands the alert
 *   cards IN PLACE (with the raiser's own status as the first line when they
 *   also have an open alert). A red dot marks unseen alerts.
 * - Own alert only → "Help is coming · <status>"; tapping opens /sos.
 * - Nothing to show → renders null (unmounts). The parent's fixed container
 *   owns the max-height/scroll and the clearance above the floating SOS button.
 */
export function SosStrip({
  alerts,
  responsesByAlert,
  selfUserId,
  canResolve,
  onRespond,
  onReached,
  onResolve,
  ownStatus,
  ownResponders,
  onViewOwn,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  // Only alerts whose card is actually visible (unresolved, not stood-down)
  // count toward the strip — a cancelled/resolved alert drops out here, so the
  // count and the "unmount when empty" both follow sosCardState.
  const visibleIncoming = alerts.filter(
    (a) => sosCardState(a, responsesByAlert[a.id] ?? []).visible,
  );

  const label = buildSosStripLabel(visibleIncoming, ownStatus);
  if (!label) return null;

  const hasIncoming = visibleIncoming.length > 0;
  const unseen =
    hasIncoming && hasUnseenAlerts(visibleIncoming.map((a) => a.id), seenIds);
  const showExpanded = hasIncoming && expanded;

  function onTap() {
    if (!hasIncoming) {
      onViewOwn(); // own-alert-only strip → straight to the full /sos screen
      return;
    }
    setExpanded((open) => {
      const next = !open;
      // Opening the strip counts as seeing every current alert → clears the dot.
      if (next) setSeenIds(new Set(visibleIncoming.map((a) => a.id)));
      return next;
    });
  }

  return (
    <Card padding="var(--space-sm) var(--space-md)">
      <button
        type="button"
        aria-expanded={hasIncoming ? expanded : undefined}
        onClick={onTap}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
          width: "100%",
          minHeight: 44,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--color-text-primary)",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-xs)",
            minWidth: 0,
            fontSize: "var(--text-body-size)",
            fontWeight: "var(--weight-semibold)" as unknown as number,
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", flex: "none" }}>
            <Icon name="bell" size={18} color="var(--color-danger)" />
            {unseen && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--color-danger)",
                  border: "1px solid var(--color-surface-2)",
                }}
              />
            )}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
        </span>
        <span
          style={{
            display: "inline-flex",
            flex: "none",
            transform: showExpanded ? "rotate(90deg)" : "none",
            transition: "transform .15s",
            color: "var(--color-text-tertiary)",
          }}
        >
          <Icon name="chevron-right" size={16} />
        </span>
      </button>

      {showExpanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
            marginTop: "var(--space-sm)",
          }}
        >
          {/* Raiser's own status, as the first non-card line, when they also
              have an open alert alongside the incoming ones. */}
          {ownStatus && <OwnSosBar responders={ownResponders} onView={onViewOwn} />}
          <SosAlertStack
            alerts={alerts}
            responsesByAlert={responsesByAlert}
            selfUserId={selfUserId}
            canResolve={canResolve}
            onRespond={onRespond}
            onReached={onReached}
            onResolve={onResolve}
          />
        </div>
      )}
    </Card>
  );
}
