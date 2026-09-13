import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { RoleBadge } from "../components/ui/RoleBadge";
import { RiderPicker } from "../components/RiderPicker";
import { useAuth } from "../hooks/useAuth";
import {
  addGroupMember,
  getGroupDetail,
  removeGroupMember,
  setGroupMemberRole,
  type GroupMemberWithProfile,
} from "../services/groupsService";
import type { RideGroup } from "../lib/models";

type Detail = { group: RideGroup; members: GroupMemberWithProfile[] };

/** Group detail — culture, tagline and rules up front, then the roster. Leads
 *  additionally get member management (add by search, remove, promote or
 *  demote to/from lead). "Plan a ride" heads into the regular ride wizard —
 *  group-scoped ride creation is a later decision. */
export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const reload = useCallback(() => {
    if (!groupId) return;
    getGroupDetail(groupId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the group."))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const me = detail?.members.find((m) => m.user_id === user?.id);
  const isLead = me?.role === "lead";

  async function mutate(action: () => Promise<unknown>) {
    setMutating(true);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setMutating(false);
    }
  }

  function leave() {
    if (!user) return;
    void mutate(() => removeGroupMember(groupId!, user.id));
    navigate("/groups");
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: "var(--text-label)", color: "var(--color-text-tertiary)" }}>Loading…</p>;
  }
  if (!detail) {
    return (
      <div>
        <BackLink to="/groups">Groups</BackLink>
        <p style={{ margin: 0, fontSize: "var(--text-body-size)", color: "var(--color-text-secondary)" }}>
          {error ?? "Group not found (or you're not a member)."}
        </p>
      </div>
    );
  }

  const { group, members } = detail;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", paddingBottom: "var(--space-lg)" }}>
      <div>
        <BackLink to="/groups">Groups</BackLink>
        <h1 style={{ margin: 0, fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
          {group.name}
        </h1>
        {group.tagline && (
          <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-body-size)", color: "var(--color-text-secondary)" }}>
            {group.tagline}
          </p>
        )}
        {group.city && (
          <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-label)", color: "var(--color-text-tertiary)" }}>
            {group.city}
          </p>
        )}
      </div>

      {/* The screen's one accent action — start a trip with this crew. */}
      <Button variant="primary" onClick={() => navigate("/create")}>
        Plan a ride
      </Button>

      {group.culture && (
        <Section title="Ride culture" body={group.culture} />
      )}
      {group.rules && (
        <Section title="Group rules" body={group.rules} />
      )}

      <section>
        <h2 style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
          Members
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          {members.map((m) => {
            const name = m.profile?.display_name ?? "Rider";
            const isSelf = m.user_id === user?.id;
            return (
              <Card key={m.id} padding="var(--space-sm) var(--space-md)">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                  <Avatar name={name} url={m.profile?.avatar_url ?? null} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-medium)" as unknown as number, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}{isSelf ? " (you)" : ""}
                    </div>
                  </div>
                  <RoleBadge role={m.role === "lead" ? "lead" : "member"} style={{ flex: "none" }} />
                  {isLead && !isSelf && (
                    <div style={{ flex: "none", display: "flex", gap: "var(--space-2xs)" }}>
                      <MiniAction
                        label={m.role === "lead" ? "Demote" : "Make lead"}
                        onClick={() => mutate(() => setGroupMemberRole(groupId!, m.user_id, m.role === "lead" ? "member" : "lead"))}
                      />
                      <MiniAction
                        label="Remove"
                        danger
                        onClick={() => mutate(() => removeGroupMember(groupId!, m.user_id))}
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {isLead && (
          <div style={{ marginTop: "var(--space-md)" }}>
            <RiderPicker
              selected={[]}
              onSelect={(r) => mutate(() => addGroupMember(groupId!, r.id))}
              onRemove={() => {}}
              excludeIds={members.map((m) => m.user_id)}
              placeholder="Search riders to add as members"
            />
          </div>
        )}
      </section>

      {error && (
        <p style={{ margin: 0, fontSize: "var(--text-label)", color: "var(--color-role-sweep)" }}>{error}</p>
      )}

      {me && (
        <Button variant="ghost" disabled={mutating} onClick={leave}>
          Leave group
        </Button>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
        {title}
      </h2>
      <Card>
        <p style={{ margin: 0, fontSize: "var(--text-body-size)", color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>
          {body}
        </p>
      </Card>
    </section>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name || "R").trim().charAt(0).toUpperCase();
  return (
    <span
      style={{
        flex: "none",
        width: 36,
        height: 36,
        borderRadius: "var(--radius-full)",
        background: url ? `center / cover no-repeat url(${url})` : "var(--color-surface-3)",
        color: "var(--color-text-primary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--text-label)",
        fontWeight: "var(--weight-semibold)" as unknown as number,
      }}
    >
      {!url && initial}
    </span>
  );
}

function MiniAction({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 32,
        padding: "0 var(--space-sm)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-full)",
        background: "transparent",
        color: danger ? "var(--color-role-sweep)" : "var(--color-text-secondary)",
        fontSize: "var(--text-label)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
