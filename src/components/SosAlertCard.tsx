import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { SosResolveButton } from "./SosResolveButton";
import type { Responder } from "../lib/sos";

type Props = {
  name: string;
  triggeredAt: string;
  responders: Responder[];
  selfUserId: string | null;
  still: boolean;
  onRespond: () => void;
  onReached: (responseId: string) => void;
  /** Ops-only: shown when the viewer may resolve this SOS. */
  canResolve?: boolean;
  onResolve?: () => Promise<void>;
  /** Close (X): mark this alert seen for the viewer → collapse + demote it. */
  onDismiss?: () => void;
  /** When true, render the slim collapsed bar instead of the full card. */
  collapsed?: boolean;
  /** Re-expand a collapsed card (tapping the slim bar). */
  onExpand?: () => void;
};

// Small round X in the card corner — marks the alert seen for this viewer,
// collapsing it to the slim bar and sinking it below unseen alerts.
function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      onClick={onDismiss}
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: "var(--radius-full)",
        border: "none",
        background: "var(--color-surface-3)",
        color: "var(--color-text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <Icon name="x" size={16} />
    </button>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

const cardStyle = { display: "flex", flexDirection: "column", gap: "var(--space-sm)" } as const;
const h2Style = {
  margin: 0,
  fontSize: "var(--text-h2)",
  lineHeight: "var(--lh-h2)",
  fontWeight: "var(--weight-semibold)",
} as const;
const lineStyle = {
  margin: 0,
  color: "var(--color-text-secondary)",
  fontSize: "var(--text-label)",
  lineHeight: "var(--lh-label)",
} as const;

// Compact, non-blocking bar shown once help is on the way so members can keep
// using the app. One row: text block (status over detail) beside the action.
// Opaque so page text behind it never shows through, with a soft shadow to
// separate it from the page.
// `flexWrap: "wrap"` lets the action(s) drop below the text on a narrow phone
// (~360px) instead of squeezing the text column down to ~180px (which forced
// "Gaurav P. needs help" to one word per line). On a wide viewport the row
// never needs to wrap, so nothing changes there.
export const compactBarStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-sm)",
  padding: "var(--space-xs) var(--space-md)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface-2)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-card, 0 8px 24px rgba(0,0,0,.5))",
} as const;
// `flex: "1 1 12rem"` (keep minWidth: 0) gives the text column a 12rem
// preferred width: it stays on the action's row while there is room, and once
// the viewport can't fit text + action side by side the wrap above kicks in
// and the text takes the full width instead of collapsing.
export const compactTextStyle = {
  flex: "1 1 12rem",
  minWidth: 0,
} as const;
const compactLineAStyle = {
  margin: 0,
  color: "var(--color-text-primary)",
  fontSize: "var(--text-body-strong)",
  fontWeight: "var(--weight-semibold)",
  lineHeight: 1.3,
} as const;
const compactLineBStyle = {
  margin: 0,
  color: "var(--color-text-secondary)",
  fontSize: "var(--text-label)",
  lineHeight: 1.3,
  whiteSpace: "normal",
} as const;
const compactActionStyle = {
  flexShrink: 0,
  whiteSpace: "nowrap",
  width: "auto",
  height: "var(--control-height)",
} as const;
const compactReachedStyle = {
  ...lineStyle,
  ...compactActionStyle,
  color: "var(--color-text-secondary)",
  whiteSpace: "nowrap",
} as const;

// Alert shown to other members. Two states:
//   • no responders → full card: "<Rider> needs help" / "still needs help",
//     time, primary lime "I'm on my way".
//   • ≥1 responder (still visible) → compact bar with a small ghost action.
// Action sequence for the current member: "I'm on my way" → "I've reached them"
// → plain text "You reached them". The card is mounted only while the alert is
// visible (see sosCardState): a reach unmounts it everywhere; a rider Stay after
// a reach remounts it. No resolved or hide state.
export function SosAlertCard({
  name,
  triggeredAt,
  responders,
  selfUserId,
  still,
  onRespond,
  onReached,
  canResolve,
  onResolve,
  onDismiss,
  collapsed,
  onExpand,
}: Props) {
  const self = responders.find((r) => r.userId === selfUserId) ?? null;
  const others = responders.filter((r) => r.userId !== selfUserId);

  // Collapsed (seen) state: a slim, low-priority bar. Tapping it re-expands.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${name} needs help — expand`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          width: "100%",
          minHeight: 44,
          padding: "var(--space-xs) var(--space-md)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-divider)",
          boxShadow: "var(--shadow-card, 0 8px 24px rgba(0,0,0,.5))",
          color: "var(--color-text-primary)",
          textAlign: "left",
          cursor: "pointer",
          opacity: 0.85,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-danger)", flex: "none" }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {still ? `${name} still needs help` : `${name} needs help`}
        </span>
        <Icon name="chevron-right" size={16} />
      </button>
    );
  }

  // Compact state: at least one responder is engaged.
  if (responders.length > 0) {
    const onTheWay = responders.filter((r) => !r.reachedAt);
    const statusText = still ? `${name} still needs help` : `${name} needs help`;
    let detailText: string | null = null;
    if (onTheWay.length > 0) {
      const isSelf = onTheWay[0].userId === selfUserId;
      const lead = isSelf ? "You" : onTheWay[0].name;
      const extra = onTheWay.length - 1;
      detailText =
        extra > 0
          ? `${lead} and ${extra} other${extra > 1 ? "s" : ""} on the way.`
          : isSelf
            ? "You are on the way."
            : `${lead} is on the way.`;
    }
    return (
      <div role="alert" style={compactBarStyle}>
        <div style={compactTextStyle}>
          <p style={compactLineAStyle}>{statusText}</p>
          {detailText && <p style={compactLineBStyle}>{detailText}</p>}
        </div>
        {!self && (
          <Button variant="ghost" fullWidth={false} onClick={onRespond} style={compactActionStyle}>
            I'm on my way
          </Button>
        )}
        {self && !self.reachedAt && (
          <Button
            variant="ghost"
            fullWidth={false}
            onClick={() => onReached(self.id)}
            style={compactActionStyle}
          >
            I've reached them
          </Button>
        )}
        {self && self.reachedAt && <span style={compactReachedStyle}>You reached them</span>}
        {canResolve && onResolve && <SosResolveButton compact onResolve={onResolve} />}
        {onDismiss && <DismissButton onDismiss={onDismiss} />}
      </div>
    );
  }

  // Full state: brand-new alert, no responders yet.
  return (
    <Card elevated role="alert" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-sm)" }}>
        <div>
          <h2 style={h2Style}>{still ? `${name} still needs help` : `${name} needs help`}</h2>
          <p style={{ ...lineStyle, margin: "var(--space-2xs) 0 0" }}>{relativeTime(triggeredAt)}</p>
        </div>
        {onDismiss && <DismissButton onDismiss={onDismiss} />}
      </div>

      {others.length > 0 && (
        <div>
          {others.map((r) => (
            <p key={r.id} style={lineStyle}>
              {r.reachedAt ? `${r.name} has reached ${name}.` : `${r.name} is on the way.`}
            </p>
          ))}
        </div>
      )}

      {!self && (
        <Button variant="primary" onClick={onRespond}>
          I'm on my way
        </Button>
      )}
      {self && !self.reachedAt && (
        <Button variant="primary" onClick={() => onReached(self.id)}>
          I've reached them
        </Button>
      )}
      {self && self.reachedAt && (
        <Button variant="primary" disabled>
          You reached them
        </Button>
      )}
      {canResolve && onResolve && <SosResolveButton onResolve={onResolve} />}
    </Card>
  );
}
