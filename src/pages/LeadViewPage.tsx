import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { IconButton } from "../components/ui/IconButton";
import { LoadingState } from "../components/ui/Loader";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Stepper } from "../components/ui/Stepper";
import { useAuth } from "../hooks/useAuth";
import { useNavigateOnRideEnd } from "../hooks/useNavigateOnRideEnd";
import { LiveOps } from "../components/liveops/LiveOps";
import type { MemberRole } from "../lib/models";
import { ROLE_COLOR, ROLE_LABEL } from "../lib/roles";
import {
  approveJoinRequest,
  assignRideRole,
  buildJoinUrl,
  declineJoinRequest,
  getPendingJoinRequests,
  getRideDetail,
  removeMember,
  updateRideCapacity,
  type AssignableRole,
  type PendingJoinRequest,
  type RideDetail,
} from "../services/onboardingService";
import { copyToClipboard, shareInvite } from "../services/shareService";
import { generateQrDataUrl } from "../services/qrService";
import { track } from "../lib/analytics";

// The roster's role control offers these three — reassigning the leader
// itself is out of scope (see docs/.../issues/05-lead-approval-roster-roles.md).
const ASSIGNABLE_OPTIONS: { label: string; role: AssignableRole }[] = [
  { label: "Rider", role: "rider" },
  { label: "Co-lead", role: "co_leader" },
  { label: "Sweep", role: "sweep" },
];
const ASSIGNABLE_LABELS = ASSIGNABLE_OPTIONS.map((o) => o.label);
const ROLE_TO_LABEL: Partial<Record<MemberRole, string>> = Object.fromEntries(
  ASSIGNABLE_OPTIONS.map((o) => [o.role, o.label])
);
const LABEL_TO_ROLE: Record<string, AssignableRole> = Object.fromEntries(
  ASSIGNABLE_OPTIONS.map((o) => [o.label, o.role])
) as Record<string, AssignableRole>;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--text-h2)",
        lineHeight: "var(--lh-h2)",
        fontWeight: "var(--weight-semibold)",
        margin: "var(--space-xl) 0 var(--space-md)",
      }}
    >
      {children}
    </h2>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const size = 40;
  return url ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: "var(--radius-full)", objectFit: "cover", flex: "none" }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-full)",
        background: "var(--color-surface-3)",
        color: "var(--color-text-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--text-label)",
        fontWeight: "var(--weight-semibold)" as unknown as number,
        flex: "none",
      }}
    >
      {initial}
    </div>
  );
}

export function LeadViewPage() {
  const { rideId } = useParams<{ rideId: string }>();
  useNavigateOnRideEnd(rideId);
  const { user } = useAuth();

  const [detail, setDetail] = useState<RideDetail | null>(null);
  const [pending, setPending] = useState<PendingJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingRemoveUserId, setConfirmingRemoveUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Capacity editor draft: 0 = no limit (mirrors the create form's Stepper).
  const [capacityDraft, setCapacityDraft] = useState(0);
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacityNote, setCapacityNote] = useState<string | null>(null);
  // Add-riders (capacity + invite) is folded under a strip at the bottom of the
  // page; the roster list collapses, and its per-rider actions stay hidden
  // until the lead flips into manage mode.
  const [addRidersOpen, setAddRidersOpen] = useState(false);
  const [rosterExpanded, setRosterExpanded] = useState(true);
  const [manageRoster, setManageRoster] = useState(false);
  const load = useCallback(async () => {
    if (!rideId) return;
    const [d, p] = await Promise.all([getRideDetail(rideId), getPendingJoinRequests(rideId)]);
    if (!d) throw new Error("Ride not found.");
    setDetail(d);
    setPending(p);
  }, [rideId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the ride."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  // ride_join_requests isn't in Realtime, so poll for new join requests (and
  // roster changes as they're approved) while the lead has this screen open.
  useEffect(() => {
    if (!rideId) return;
    const t = setInterval(() => {
      void getPendingJoinRequests(rideId).then(setPending).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [rideId]);

  const self = detail?.roster.find((r) => r.member.user_id === user?.id);
  const isLead = self?.member.role === "leader" || self?.member.role === "co_leader";
  const isLeader = detail?.ride.leader_id === user?.id || self?.member.role === "leader";
  const capacity = detail?.ride.member_capacity ?? null;
  const memberCount = detail?.roster.length ?? 0;
  const isFull = capacity != null && memberCount >= capacity;
  // Capacity can only change while riders can still join.
  const canChangeCapacity = detail?.ride.status === "draft" || detail?.ride.status === "active";

  const rosterExcludingLeader = useMemo(
    () => detail?.roster.filter((r) => r.member.role !== "leader") ?? [],
    [detail]
  );

  // QR for the invite panel. This effect must stay above the early returns
  // below (loading / error / not-lead) so the hook order is stable —
  // otherwise React throws "rendered more hooks than during the previous
  // render" once the ride finishes loading.
  const joinUrl = detail ? buildJoinUrl(detail.ride.code) : "";
  useEffect(() => {
    if (!inviteOpen || qrDataUrl || !joinUrl) return;
    let cancelled = false;
    generateQrDataUrl(joinUrl).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [inviteOpen, joinUrl, qrDataUrl]);

  // Keep the capacity Stepper in sync with the loaded ride (0 = no limit).
  // Must stay above the early returns with the other hooks.
  useEffect(() => {
    if (detail) setCapacityDraft(detail.ride.member_capacity ?? 0);
  }, [detail]);

  async function handleSaveCapacity() {
    if (!rideId || capacitySaving) return;
    const next = capacityDraft === 0 ? null : capacityDraft;
    if ((next ?? null) === (capacity ?? null)) return;
    if (next !== null && next < memberCount) {
      setActionError(`Capacity can't be below the ${memberCount} riders already joined.`);
      return;
    }
    setActionError(null);
    setCapacityNote(null);
    setCapacitySaving(true);
    try {
      await updateRideCapacity(rideId, next);
      await load();
      setCapacityNote(next === null ? "Capacity set to no limit." : `Capacity set to ${next} riders.`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update capacity.");
    } finally {
      setCapacitySaving(false);
    }
  }

  async function refresh() {
    try {
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't refresh the roster.");
    }
  }

  async function handleApprove(requestId: string) {
    if (isFull) {
      setActionError("This ride is full. Raise the capacity to admit more riders.");
      return;
    }
    setActionError(null);
    setBusyId(requestId);
    try {
      await approveJoinRequest(requestId);
      track("ride_joined", { ride_id: rideId, via: "approved" });
      track("join_request_decided", { ride_id: rideId, decision: "approved" });
      await refresh();
    } catch (e) {
      if (e instanceof Error && e.message.includes("This ride is full")) {
        setActionError("This ride is full. Raise the capacity to admit more riders.");
      } else {
        setActionError(e instanceof Error ? e.message : "Couldn't approve that request.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(requestId: string) {
    setActionError(null);
    setBusyId(requestId);
    try {
      await declineJoinRequest(requestId);
      track("join_request_decided", { ride_id: rideId, decision: "declined" });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't decline that request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssign(memberUserId: string, label: string) {
    if (!rideId) return;
    const role = LABEL_TO_ROLE[label];
    if (!role) return;
    setActionError(null);
    setBusyId(memberUserId);
    try {
      await assignRideRole(rideId, memberUserId, role);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update that role.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberUserId: string) {
    if (!rideId) return;
    setActionError(null);
    setBusyId(memberUserId);
    try {
      await removeMember(rideId, memberUserId);
      setConfirmingRemoveUserId(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't remove that member.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <LoadingState label="Loading roster…" />;
  }

  if (error || !detail) {
    return (
      <div>
        <BackLink to="/">Home</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{error ?? "Ride not found."}</p>
        </Card>
      </div>
    );
  }

  if (!isLead) {
    return (
      <div>
        <BackLink to={`/ride/${rideId}`}>Ride detail</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Only the lead or co-lead can manage the roster.
          </p>
        </Card>
      </div>
    );
  }

  const { ride } = detail;

  async function handleCopy(target: Exclude<typeof copied, null>) {
    const text = target === "code" ? ride.code : joinUrl;
    const ok = await copyToClipboard(text);
    if (ok) {
      track("ride_shared", {
        ride_id: ride.id,
        via: target === "code" ? "copy_code" : "copy_link",
        surface: "lead",
      });
    }
    setCopied(ok ? target : null);
    if (ok) setTimeout(() => setCopied(null), 2000);
  }

  async function handleShare() {
    // One sheet carrying both the link and the QR image (file-capable
    // platforms get the image; elsewhere this degrades to link/copy).
    const result = await shareInvite({
      title: ride.name,
      text: `Join "${ride.name}" on RideInSync — code ${ride.code}`,
      url: joinUrl,
      qrDataUrl,
    });
    if (result === "shared" || result === "copied") {
      track("ride_shared", { ride_id: ride.id, via: "share", surface: "lead" });
    }
    if (result === "shared") setShareMessage("Invite shared.");
    else if (result === "copied") setShareMessage("Link copied — share it your way.");
    else setShareMessage(null);
  }

  return (
    <div>
      <BackLink to={`/ride/${rideId}`}>Ride detail</BackLink>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-2xs)",
        }}
      >
        {ride.name}
      </h1>
      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-md)" }}>
        {capacity != null ? `${memberCount} / ${capacity} riders` : `${memberCount} riders`}
        {isFull && (
          <span style={{ color: "var(--color-role-sweep)" }}> · Ride full</span>
        )}
      </p>

      {/* Flow 3 live tracker for this real ride — route geocoded from the
          form's start/destination labels, real roster shown live. */}
      <LiveOps ride={ride} />

      {actionError && (
        <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0 var(--space-md)" }}>{actionError}</p>
      )}

      <SectionTitle>Join requests{pending.length > 0 ? ` (${pending.length})` : ""}</SectionTitle>
      {pending.length === 0 ? (
        <Card padding="var(--space-md)">
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>No pending requests.</p>
        </Card>
      ) : (
        pending.map((req) => (
          <Card
            key={req.id}
            padding="var(--space-md)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-md)",
              marginBottom: "var(--space-sm)",
            }}
          >
            <Avatar name={req.displayName} url={req.avatarUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "var(--text-body-size)" }}>{req.displayName}</p>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-caption)",
                  color: "var(--color-text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {req.vehiclePlate ?? req.vehicleMakeModel ?? "No vehicle on file"}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-xs)", flex: "none" }}>
              <IconButton
                name="x"
                variant="surface"
                onClick={() => void handleDecline(req.id)}
                disabled={busyId === req.id}
                aria-label={`Decline ${req.displayName}`}
              />
              <IconButton
                name="check"
                variant="accent"
                onClick={() => void handleApprove(req.id)}
                disabled={busyId === req.id || isFull}
                aria-label={`Approve ${req.displayName}`}
              />
            </div>
          </Card>
        ))
      )}

      {/* Roster — collapsible; the names read cleanly by default and the
          per-rider actions (role, remove) stay hidden until the lead taps
          Manage. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
          margin: "var(--space-xl) 0 var(--space-md)",
        }}
      >
        <button
          type="button"
          aria-expanded={rosterExpanded}
          onClick={() => setRosterExpanded((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-xs)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--color-text-primary)",
            fontSize: "var(--text-h2)",
            lineHeight: "var(--lh-h2)",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          Roster
          <span style={{ color: "var(--color-text-secondary)", fontWeight: "var(--weight-regular)" as unknown as number }}>
            ({memberCount})
          </span>
          <span style={{ display: "inline-flex", transform: rosterExpanded ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--color-text-tertiary)" }}>
            <Icon name="chevron-right" size={18} />
          </span>
        </button>
        {isLead && rosterExpanded && rosterExcludingLeader.length > 0 && (
          <button
            type="button"
            aria-pressed={manageRoster}
            onClick={() => {
              setManageRoster((v) => !v);
              setConfirmingRemoveUserId(null);
            }}
            style={{
              background: "none",
              border: "none",
              padding: "var(--space-2xs) var(--space-xs)",
              minHeight: 44,
              cursor: "pointer",
              color: manageRoster ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontSize: "var(--text-label)",
              fontWeight: "var(--weight-semibold)" as unknown as number,
            }}
          >
            {manageRoster ? "Done" : "Manage"}
          </button>
        )}
      </div>
      {rosterExpanded && detail.roster.map(({ member, profile }) => {
        const canReassign = rosterExcludingLeader.some((r) => r.member.id === member.id);

        // Draft or live rides: ended/cancelled are history (see 0029). The
        // server RPC enforces the same rule; this just hides the control.
        const canRemove =
          isLeader &&
          (detail.ride.status === "draft" || detail.ride.status === "active") &&
          member.user_id !== detail.ride.leader_id &&
          member.role !== "leader";

        const currentLabel = ROLE_TO_LABEL[member.role] ?? "Rider";
        const isConfirmingRemove = confirmingRemoveUserId === member.user_id;
        return (
          <Card
            key={member.id}
            padding="var(--space-md)"
            style={{ marginBottom: "var(--space-sm)" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                marginBottom: manageRoster && (canReassign || canRemove) ? "var(--space-sm)" : 0,
              }}
            >
              <Avatar name={profile?.display_name ?? "Rider"} url={profile?.avatar_url ?? null} />
              <span style={{ flex: 1 }}>
                {profile?.display_name ?? "Rider"}
                {member.user_id === user?.id && (
                  <span style={{ color: "var(--color-text-tertiary)" }}> (you)</span>
                )}
              </span>
              <span
                style={{
                  color: ROLE_COLOR[member.role],
                  fontSize: "var(--text-label)",
                  fontWeight: "var(--weight-semibold)" as unknown as number,
                }}
              >
                {ROLE_LABEL[member.role]}
              </span>
            </div>
            {manageRoster && canReassign && (
              <SegmentedControl
                options={ASSIGNABLE_LABELS}
                value={currentLabel}
                onChange={(label) => void handleAssign(member.user_id, label)}
                style={busyId === member.user_id ? { opacity: 0.6, pointerEvents: "none" } : undefined}
              />
            )}

                        {manageRoster && canRemove && isConfirmingRemove ? (
              <div
                style={{
                  marginTop: "var(--space-md)",
                  padding: "var(--space-md)",
                  background: "var(--color-surface-1)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-divider)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-sm)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-body-size)",
                    lineHeight: "var(--lh-body)",
                    color: "var(--color-text-primary)",
                    fontWeight: "var(--weight-medium)" as unknown as number,
                  }}
                >
                  Remove {profile?.display_name ?? "this member"}?
                </p>
                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingRemoveUserId(null)}
                    disabled={busyId === member.user_id}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void handleRemove(member.user_id)}
                    loading={busyId === member.user_id}
                    disabled={busyId === member.user_id}
                    style={{ flex: 1 }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            ) : manageRoster && canRemove ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setActionError(null);
                  setConfirmingRemoveUserId(member.user_id);
                }}
                disabled={busyId != null}
                style={{
                  marginTop: "var(--space-sm)",
                  color: "var(--color-danger)",
                }}
              >
                Remove member
              </Button>
            ) : null}
          </Card>
        );
      })}
      {/* Add riders — folded here at the bottom so the map and roster lead;
          the lead opens this strip to raise capacity or share the invite. */}
      {canChangeCapacity && (
        <>
          <Button
            variant="secondary"
            onClick={() => setAddRidersOpen((v) => !v)}
            aria-expanded={addRidersOpen}
            style={{ marginTop: "var(--space-xl)" }}
          >
            {addRidersOpen ? "Hide add riders" : "Add riders"}
          </Button>
          {addRidersOpen && (
            <div style={{ marginTop: "var(--space-md)" }}>
      {/* Capacity — the lead can open seats mid-lifecycle (draft or active)
          so more riders can join or be approved without leaving this screen. */}
      {canChangeCapacity && (
        <Card padding="var(--space-md)" style={{ marginBottom: "var(--space-lg)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-md)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-medium)" as unknown as number }}>
                Rider capacity
              </div>
              <div style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                {isFull
                  ? "Ride is full — raise capacity to approve more riders."
                  : "0 = no limit. New riders join by code while seats are open."}
              </div>
            </div>
            <Stepper
              value={capacityDraft}
              min={0}
              max={50}
              display={capacityDraft === 0 ? "No limit" : `${capacityDraft} riders`}
              onChange={setCapacityDraft}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            <Button
              variant="secondary"
              loading={capacitySaving}
              disabled={capacitySaving || capacityDraft === (capacity ?? 0)}
              onClick={() => void handleSaveCapacity()}
            >
              Save capacity
            </Button>
            {capacityNote && (
              <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>{capacityNote}</span>
            )}
          </div>
        </Card>
      )}

      {/* Invite — same join link + native share as the invite screen, inline
          so the lead can pull in late riders without leaving the roster. */}
      <Button
        variant="secondary"
        onClick={() => setInviteOpen((v) => !v)}
        aria-expanded={inviteOpen}
        style={{ marginBottom: inviteOpen ? "var(--space-md)" : "var(--space-lg)" }}
      >
        Invite riders
      </Button>

      {inviteOpen && (
        <Card padding="var(--space-md)" style={{ marginBottom: "var(--space-lg)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-sm)",
              marginBottom: "var(--space-sm)",
            }}
          >
            <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
              Join code
            </span>
            <span
              style={{
                fontFamily: "var(--font-numeric)",
                fontSize: "var(--text-h2)",
                lineHeight: "var(--lh-h2)",
                fontWeight: "var(--weight-semibold)",
                letterSpacing: "0.08em",
              }}
            >
              {ride.code}
            </span>
            <span style={{ flex: 1 }} />
            <IconButton
              name={copied === "code" ? "check" : "copy"}
              onClick={() => void handleCopy("code")}
              aria-label="Copy join code"
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-sm)",
              background: "var(--color-surface-3)",
              borderRadius: "var(--radius-full)",
              padding: "var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md)",
              marginBottom: "var(--space-md)",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-label)",
                color: "var(--color-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "left",
              }}
            >
              {joinUrl}
            </span>
            <IconButton
              name={copied === "link" ? "check" : "copy"}
              variant="surface-4"
              size={40}
              onClick={() => void handleCopy("link")}
              aria-label="Copy join link"
            />
          </div>

          {qrDataUrl && (
            // White-fill PNG (see qrService) so it scans in either theme.
            <div style={{ textAlign: "center", marginBottom: "var(--space-md)" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "var(--space-sm)",
                  borderRadius: "var(--radius-md)",
                  lineHeight: 0,
                }}
              >
                <img
                  src={qrDataUrl}
                  alt={`QR code to join ${ride.name}`}
                  width={200}
                  height={200}
                  style={{ borderRadius: "var(--radius-sm)" }}
                />
              </div>
            </div>
          )}

          <Button onClick={() => void handleShare()}>Share invite</Button>
          {shareMessage && (
            <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-sm)" }}>
              {shareMessage}
            </p>
          )}
        </Card>
      )}
            </div>
          )}
        </>
      )}

    </div>
  );
}
