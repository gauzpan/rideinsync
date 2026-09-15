import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { RoleBadge, toBadgeRole } from "../ui/RoleBadge";
import { SIGNAL_LABEL, SIGNAL_TIER, SIGNAL_TYPES, sendRideSignal, type SignalKind } from "../../lib/signals";
import { playSignalTone } from "../../lib/earcon";
import type { GroupStatus, RiderOnMap } from "../../lib/models";

// Shared roster + signal dialogs for the live-map views (the /ride/demo
// simulation and a real active ride via LiveOps), so both surface the same
// actions with the same look.

const STATUS_LABEL: Record<GroupStatus, string> = {
  intact: "In sync",
  behind: "Behind",
  stopped: "Stopped",
  stale: "No signal",
};
const STATUS_COLOR: Record<GroupStatus, string> = {
  intact: "var(--color-role-lead)",
  behind: "var(--color-role-sweep)",
  stopped: "var(--color-danger)",
  stale: "var(--color-text-tertiary)",
};

// FLAGGED ADDITION: the design system ships no dialog primitive, only
// full-screen sheets (see QrScannerSheet/SignInSheet) — a real gap for a
// quick-glance action like this that shouldn't take over the whole screen.
// Centered card over a dim scrim; a tap on the scrim itself closes it.
export function CenterModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--gutter)",
      }}
    >
      <Card
        elevated
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-md) var(--space-md) 0",
          }}
        >
          <span style={{ fontSize: "var(--text-h2)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {title}
          </span>
          <IconButton name="x" size={40} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} />
        </div>
        <div style={{ overflowY: "auto", padding: "var(--space-md)" }}>{children}</div>
      </Card>
    </div>
  );
}

export function RideDetailsModal({
  riders,
  code,
  qr,
  onFocusRider,
  onClose,
}: {
  riders: RiderOnMap[];
  /** Join code + QR, shown so a real rider can hop in. Omit to hide that card. */
  code?: string | null;
  qr?: string | null;
  /** When provided, tapping a rider's row focuses them on the map (and closes
   *  the modal). Omitted where the map has no focus behaviour (the demo). */
  onFocusRider?: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <CenterModal title="Ride details" onClose={onClose}>
      <p style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-sm)" }}>
        Riders
      </p>
      {riders.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)" }}>No riders yet…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {riders.map((r) => {
            const focusable = !!onFocusRider;
            const rowStyle = {
              display: "flex",
              alignItems: "center",
              gap: "var(--space-sm)",
              width: "100%",
              minHeight: 44,
              padding: focusable ? "var(--space-2xs) var(--space-xs)" : 0,
              margin: focusable ? "0 calc(var(--space-xs) * -1)" : 0,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              color: "var(--color-text-primary)",
              textAlign: "left" as const,
              cursor: focusable ? "pointer" : "default",
            };
            const content = (
              <>
                <span
                  aria-hidden
                  style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[r.status], flex: "none" }}
                />
                <span style={{ flex: 1, fontSize: "var(--text-body-size)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.profile.display_name}
                </span>
                <span style={{ fontSize: "var(--text-caption)", color: STATUS_COLOR[r.status] }}>
                  {STATUS_LABEL[r.status]}
                </span>
                <RoleBadge role={toBadgeRole(r.member.role)} />
              </>
            );
            return focusable ? (
              <button
                key={r.member.user_id}
                type="button"
                aria-label={`Focus ${r.profile.display_name} on the map`}
                onClick={() => {
                  onFocusRider!(r.member.user_id);
                  onClose();
                }}
                style={rowStyle}
              >
                {content}
              </button>
            ) : (
              <div key={r.member.user_id} style={rowStyle}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      {code && (
        <Card glow style={{ textAlign: "center", marginTop: "var(--space-lg)" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Scan to join the ride</div>
          {qr && <img src={qr} alt="Join QR" style={{ width: 160, height: 160, marginTop: 8, borderRadius: 12 }} />}
          <div style={{ fontFamily: "var(--font-brand)", letterSpacing: 2, fontSize: 20, marginTop: 4 }}>{code}</div>
        </Card>
      )}
    </CenterModal>
  );
}

export function SignalModal({
  rideId,
  senderId,
  voiceOn,
  onClose,
}: {
  rideId: string;
  senderId: string;
  voiceOn: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [sending, setSending] = useState<SignalKind | null>(null);
  const [sentKind, setSentKind] = useState<SignalKind | null>(null);

  async function sendSignal(kind: SignalKind) {
    // SOS is the one signal that isn't a fire-and-forget event: it opens the
    // real confirm + location-tracking flow, so it's the only way to raise
    // one anywhere in the app.
    if (kind === "sos") {
      onClose();
      navigate("/sos");
      return;
    }
    setSending(kind);
    setSentKind(null);
    // Send-confirmation tone — fired synchronously inside the click handler,
    // before the `await` below, so it lands inside the user gesture's audio
    // activation window (once the network round-trip resolves it's too late).
    playSignalTone(SIGNAL_TIER[kind]);
    try {
      await sendRideSignal(rideId, senderId, kind, `Signalled ${kind}`);
      setSentKind(kind);
    } finally {
      setSending(null);
    }
  }

  return (
    <CenterModal title="Signal" onClose={onClose}>
      {voiceOn && (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)", margin: "0 0 var(--space-md)" }}>
          Say a name below to send it hands-free.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-md)" }}>
        {SIGNAL_TYPES.map(({ kind, icon, color }) => (
          <button
            key={kind}
            type="button"
            onClick={() => void sendSignal(kind)}
            disabled={sending !== null}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-xs)",
              background: "var(--color-surface-3)",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-md) var(--space-xs)",
              cursor: sending !== null ? "not-allowed" : "pointer",
              fontFamily: "var(--font-ui)",
              opacity: sending !== null && sending !== kind ? 0.5 : 1,
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-full)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: color,
                color: "var(--color-text-on-accent)",
              }}
            >
              <Icon name={icon} size={24} />
            </span>
            <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-primary)", fontWeight: 600 }}>
              {sending === kind ? "Sending…" : SIGNAL_LABEL[kind]}
            </span>
          </button>
        ))}
      </div>
      {sentKind && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)", textAlign: "center", margin: "var(--space-md) 0 0" }}>
          {SIGNAL_LABEL[sentKind]} sent
        </p>
      )}
    </CenterModal>
  );
}
