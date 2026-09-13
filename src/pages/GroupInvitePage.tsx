import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { LoadingState } from "../components/ui/Loader";
import type { RideGroup } from "../lib/models";
import { buildGroupInviteUrl, getGroupById } from "../services/groupsService";
import { generateQrDataUrl } from "../services/qrService";
import { copyToClipboard, shareContent } from "../services/shareService";

type CopyTarget = "code" | "link" | null;

/** Shown right after creating a group, and reachable again from group detail
 *  — shares the invite link/code/QR that lets anyone open it, install (or
 *  sign in) and land in the group as a member. Mirrors RideInvitePage. */
export function GroupInvitePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<RideGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setLoading(true);
    getGroupById(groupId)
      .then((g) => {
        if (cancelled) return;
        if (!g) setLoadError("Group not found.");
        setGroup(g);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Couldn't load group."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const inviteUrl = group ? buildGroupInviteUrl(group.invite_code) : "";

  useEffect(() => {
    if (!inviteUrl) return;
    let cancelled = false;
    generateQrDataUrl(inviteUrl).then((url) => !cancelled && setQrDataUrl(url));
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  async function handleCopy(target: Exclude<CopyTarget, null>) {
    if (!group) return;
    const text = target === "code" ? group.invite_code : inviteUrl;
    const ok = await copyToClipboard(text);
    setCopied(ok ? target : null);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleShare() {
    if (!group) return;
    const result = await shareContent({
      title: group.name,
      text: `Join "${group.name}" on RideInSync — code ${group.invite_code}`,
      url: inviteUrl,
    });
    if (result === "copied") setShareMessage("Link copied — share it your way.");
    else if (result === "unsupported") setShareMessage(null);
    else setShareMessage(null);
  }

  if (loading) {
    return <LoadingState label="Loading invite…" />;
  }

  if (loadError || !group) {
    return (
      <div>
        <BackLink to="/groups">Groups</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            {loadError ?? "Group not found."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackLink to={`/groups/${group.id}`}>{group.name}</BackLink>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-2xs)",
        }}
      >
        {group.name}
      </h1>
      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-xl)" }}>
        Group created. Share this invite so riders can join.
      </p>

      <Card padding="var(--space-lg)" style={{ textAlign: "center" }}>
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-text-secondary)",
            margin: "0 0 var(--space-md)",
          }}
        >
          Invite code
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: "var(--text-display)",
              lineHeight: "var(--lh-display)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "0.08em",
              color: "var(--color-text-primary)",
            }}
          >
            {group.invite_code}
          </span>
          <IconButton name={copied === "code" ? "check" : "copy"} onClick={() => void handleCopy("code")} />
        </div>

        {qrDataUrl && (
          // White-fill PNG (see qrService) so it scans regardless of theme.
          <div
            style={{
              display: "inline-block",
              padding: "var(--space-sm)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--space-lg)",
              lineHeight: 0,
            }}
          >
            <img
              src={qrDataUrl}
              alt={`QR code to join ${group.name}`}
              width={200}
              height={200}
              style={{ borderRadius: "var(--radius-sm)" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-sm)",
            background: "var(--color-surface-3)",
            borderRadius: "var(--radius-full)",
            padding: "var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md)",
            marginBottom: "var(--space-lg)",
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
            {inviteUrl}
          </span>
          <IconButton
            name={copied === "link" ? "check" : "copy"}
            variant="surface-4"
            size={40}
            onClick={() => void handleCopy("link")}
          />
        </div>

        <Button onClick={() => void handleShare()}>Share invite</Button>
        {shareMessage && (
          <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-sm)" }}>
            {shareMessage}
          </p>
        )}
      </Card>

      <Button
        variant="secondary"
        style={{ marginTop: "var(--space-lg)" }}
        onClick={() => navigate(`/groups/${group.id}`)}
      >
        Go to group
      </Button>
    </div>
  );
}
